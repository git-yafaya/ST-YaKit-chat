import { normalizeSettings, buildPlan } from './segments.js';
import { syncSegment } from './floors.js';
import { isImageRef } from '../text-export/illustrations.js';

export function chatKey(context) {
    if (context?.characterId == null || !Array.isArray(context.chat)) return null;
    const character = context.characters?.[context.characterId];
    const id = context.chatId ?? character?.chat;
    if (typeof character?.avatar !== 'string' || !character.avatar || typeof id !== 'string' || !id) return null;
    return JSON.stringify([context.groupId ?? null, character.avatar, id]);
}

// 保留楼号对应的原始内容和筛选标记，用来识别中途编辑、删除或换回复。
export function sourcePrefix(context) {
    return context.chat.map(message => JSON.stringify([message?.mes ?? null, Boolean(message?.is_user),
        Boolean(message?.is_system), Boolean(message?.is_name), message?.extra?.type ?? null]));
}

export function hasSourceChanges(record, context) {
    const current = sourcePrefix(context);
    return current.length < record.sourcePrefix.length
        || record.sourcePrefix.some((value, index) => value !== current[index]);
}

export function newSegments(record, context, settings) {
    if (hasSourceChanges(record, context)) {
        throw new Error('原聊天已有楼层被修改或删除，旧结果已保留，请清空结果后重新分段');
    }
    const offset = record.sourcePrefix.length;
    if (context.chat.length <= offset) return [];
    const normalized = normalizeSettings(settings);
    // 在原楼号上筛选新增楼层，不让范围夹紧把已有末楼当成新增。
    const plan = buildPlan(normalized, context).segments;
    const selected = new Set(plan.flatMap(segment => segment.floors).filter(item => item.floor >= offset).map(item => item.floor));
    if (!selected.size) return [];
    const chat = context.chat.map((message, floor) => selected.has(floor) ? message : { ...message, mes: '' });
    return buildPlan({ ...normalized, allFloors: true }, { ...context, chat }).segments;
}

export function restoreRecord(value) {
    const invalid = () => new Error('已保存的润色结果格式不正确，请保留文件并检查后重试');
    if (!value || typeof value !== 'object' || !value.job || !Array.isArray(value.sourcePrefix)
        || value.sourcePrefix.some(item => typeof item !== 'string')) throw invalid();
    const record = structuredClone(value);
    try { record.settings = normalizeSettings(record.settings); } catch { throw invalid(); }
    const job = record.job;
    if (typeof job.id !== 'string' || !job.id || typeof job.chatName !== 'string' || !job.chatName.trim()
        || !['running', 'review', 'stopped', 'finished'].includes(job.status)
        || !Array.isArray(job.segments) || !job.segments.length) throw invalid();
    let lastFloor = -1;
    for (const [index, segment] of job.segments.entries()) {
        if (!segment || typeof segment !== 'object' || Array.isArray(segment)
            || segment.index !== index || !Array.isArray(segment.floors) || !segment.floors.length
            || !['pending', 'running', 'done', 'failed'].includes(segment.status)) throw invalid();
        for (const floor of segment.floors) {
            if (!floor || typeof floor !== 'object' || Array.isArray(floor)
                || !Number.isInteger(floor.floor) || floor.floor <= lastFloor || floor.floor >= record.sourcePrefix.length
                || typeof floor.original !== 'string' || !floor.original.trim()
                || !(floor.polished === null || (typeof floor.polished === 'string' && floor.polished.trim()))
                || !['pending', 'running', 'done'].includes(floor.status)
                || typeof floor.edited !== 'boolean' || typeof floor.short !== 'boolean'
                || (floor.status === 'done' && floor.polished === null)) throw invalid();
            lastFloor = floor.floor;
            // 插图位置只在格式正确时保留，旧结果没有这一项。
            if (Object.hasOwn(floor, 'images')) {
                const images = Array.isArray(floor.images) ? floor.images.filter(image => isImageRef(image?.ref)
                    && Number.isFinite(image.at) && image.at >= 0 && image.at <= 1).map(({ ref, at }) => ({ ref, at })) : [];
                if (images.length) floor.images = images;
                else delete floor.images;
            }
            if (floor.status === 'running') floor.status = floor.polished === null ? 'pending' : 'done';
        }
        segment.original = segment.floors.map(floor => floor.original).join('\n\n');
        segment.chars = Array.from(segment.original).length;
        segment.startFloor = segment.floors[0].floor;
        segment.endFloor = segment.floors.at(-1).floor;
        syncSegment(segment);
        if (segment.floors.every(floor => floor.status === 'done')) segment.status = 'done';
        else if (segment.status === 'running' || segment.status === 'done') segment.status = 'pending';
        segment.error = typeof segment.error === 'string' ? segment.error : null;
    }
    if (job.status === 'running') {
        job.status = 'stopped';
        job.stopReason = '上次润色已中断，已恢复保存的结果，请继续润色';
    } else job.stopReason = typeof job.stopReason === 'string' ? job.stopReason : null;
    job.waitUntil = null;
    job.newFloors = null;
    return record;
}
