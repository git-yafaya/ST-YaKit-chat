import { getChunkSize } from './segments.js';

export function syncSegment(segment) {
    const floors = segment.floors;
    const results = floors.filter(floor => floor.polished !== null);
    segment.polished = results.length ? results.map(floor => floor.polished).join('\n\n') : null;
    segment.shortFloors = floors.filter(floor => floor.short).map(floor => floor.floor);
    segment.resumeFloor = floors.some(floor => floor.status === 'done')
        ? floors.find(floor => floor.status !== 'done')?.floor ?? null : null;
    return segment;
}

export function applyFloorText(floor, text, { edited = false } = {}) {
    if (typeof text !== 'string' || !text.trim()) throw new TypeError('润色正文不能为空，请填写文字');
    const chars = value => Array.from(value.replace(/\s/gu, '')).length;
    Object.assign(floor, {
        polished: text, status: 'done', edited,
        short: chars(text) < chars(floor.original) * 0.5,
    });
    return floor;
}

export function planRedo(job, selected, settings) {
    if (!Array.isArray(selected) || !selected.length) throw new TypeError('请先选择要重新润色的楼层');
    const saved = job.segments.flatMap(segment => segment.floors).sort((a, b) => a.floor - b.floor);
    const positions = new Map(saved.map((floor, index) => [floor.floor, index]));
    if (selected.some(floor => !Number.isInteger(floor) || floor < 0 || !positions.has(floor))) {
        throw new TypeError('所选楼层编号不正确或不在当前润色结果中');
    }
    const floors = [...new Set(selected)].sort((a, b) => a - b).map(floor => saved[positions.get(floor)]);
    const chunkSize = getChunkSize(settings);
    const batches = [];
    let chars = 0;
    for (const floor of floors) {
        const size = Array.from(floor.original).length;
        if (!batches.length || chars + 2 + size > chunkSize) {
            batches.push({ floors: [], references: [] });
            chars = 0;
        }
        const batch = batches.at(-1);
        chars += size + (batch.floors.length ? 2 : 0);
        batch.floors.push(floor);
    }
    const text = floor => floor?.polished ?? floor?.original ?? '';
    for (const batch of batches) {
        // 拆批后重新划分连续组；参考楼层不加入输出列表。
        for (let start = 0; start < batch.floors.length;) {
            let end = start;
            while (end + 1 < batch.floors.length && batch.floors[end + 1].floor === batch.floors[end].floor + 1) end++;
            const startFloor = batch.floors[start].floor;
            const endFloor = batch.floors[end].floor;
            batch.references.push({
                startFloor, endFloor,
                previous: Array.from(text(saved[positions.get(startFloor) - 1])).slice(-300).join(''),
                next: Array.from(text(saved[positions.get(endFloor) + 1])).slice(0, 300).join(''),
            });
            start = end + 1;
        }
    }
    return batches;
}
