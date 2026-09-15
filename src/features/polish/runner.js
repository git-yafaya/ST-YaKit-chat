import { applyFloorText, syncSegment } from './floors.js';

export async function runBatches({ job, batches, generate, signal, isActive, checkpoint, onWait, review = false, redo = false }) {
    const active = () => isActive() && !signal?.aborted;
    const allFloors = job.segments.flatMap(segment => segment.floors);
    const tail = text => Array.from(text || '').slice(-300).join('');
    const previousTail = floor => {
        const previous = allFloors[allFloors.findIndex(item => item.floor === floor) - 1];
        return tail(previous?.polished ?? previous?.original);
    };
    let failures = 0, failed = false;
    for (const batch of batches) {
        if (!active()) return;
        // 重做按本轮完成量推进，旧结果的 done 状态不能跳过请求。
        const floors = redo ? batch.floors : batch.floors.filter(floor => floor.status !== 'done');
        const limitBudget = { waitedSeconds: 0 };
        const references = structuredClone(batch.references ?? []);
        for (const floor of floors) floor.status = 'running';
        if (!redo) for (const segment of batch.segments) Object.assign(segment, { status: 'running', error: null });
        await checkpoint(batch.segments);
        let completed = 0, error = null;
        while (completed < floors.length) {
            if (!active()) return;
            const remaining = floors.slice(completed);
            const currentReferences = references.flatMap(reference => {
                const group = remaining.filter(floor => floor.floor >= reference.startFloor && floor.floor <= reference.endFloor);
                if (!group.length) return [];
                return [{ ...reference, startFloor: group[0].floor,
                    previous: group[0].floor === reference.startFloor ? reference.previous : previousTail(group[0].floor) }];
            });
            let result;
            try {
                result = await generate(remaining.map(floor => ({ floor: floor.floor, text: floor.original })),
                    redo ? '' : previousTail(remaining[0].floor), signal,
                    value => { if (active()) onWait?.(value); }, limitBudget, currentReferences);
            } catch (cause) {
                if (!active()) return;
                error = cause;
                break;
            }
            if (!active()) return;
            for (const [offset, item] of result.completed.entries()) applyFloorText(remaining[offset], item.text);
            completed += result.completed.length;
            for (const segment of batch.segments) syncSegment(segment);
            // 完整楼层先落盘，保存失败由调用方停止整轮，不能当作模型失败后继续。
            if (result.completed.length) await checkpoint(batch.segments);
            if (!result.completed.length) {
                error = new Error(`第 ${remaining[0].floor} 楼未能完整生成，已保留此前结果，请检查模型输出额度后继续润色`);
                break;
            }
        }
        if (!active()) return;
        for (const floor of floors.slice(completed)) floor.status = redo && floor.polished != null ? 'done' : 'pending';
        for (const segment of batch.segments) {
            syncSegment(segment);
            if (segment.floors.every(floor => floor.status === 'done')) Object.assign(segment, { status: 'done', error: null });
            else if (!redo) Object.assign(segment, { status: 'failed', error: error?.message || '这段润色失败，请重试' });
        }
        failures = error ? failures + 1 : 0;
        failed ||= Boolean(error);
        job.waitUntil = null;
        await checkpoint(batch.segments);
        if (!active()) return;
        if (failures >= 2) {
            job.status = 'stopped';
            job.stopReason = '连续 2 段润色失败，请检查 API 和提示词后继续';
            await checkpoint();
            return;
        }
    }
    if (!active()) return;
    const pending = job.segments.some(segment => segment.status === 'pending');
    const reviewFailed = review && job.segments[0].status !== 'done';
    job.status = review ? (reviewFailed ? 'stopped' : 'review') : pending || (redo && failed) ? 'stopped' : 'finished';
    job.stopReason = reviewFailed ? '第 1 段润色失败，请检查提示后继续'
        : redo && failed ? '部分选中楼层润色失败，已保留原结果，请重新选择这些楼层重做'
            : !review && pending ? '还有等待中的段落，请继续润色' : null;
    job.waitUntil = null;
    await checkpoint();
}
