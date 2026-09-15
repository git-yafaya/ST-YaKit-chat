import { exportUI } from '../text-export/export-ui.js';
import { createRecordId } from '../../shared/validation.js';
import { loadSettings, saveSettings, planSegments, buildPlan, normalizeSettings, resolveSettings } from './segments.js';
import { getContext, createGenerator } from './generate.js';
import { exportPolish } from './export.js';
import { applyFloorText, syncSegment, planRedo } from './floors.js';
import { loadSaved, saveSaved, deleteSaved } from './storage.js';
import { chatKey, sourcePrefix, hasSourceChanges, newSegments, restoreRecord } from './records.js';
import { runBatches } from './runner.js';
import { emptyInputs, mergeInputs, restoreInputs } from './task-inputs.js';

const entries = new Map();
const listeners = new Set();
let activeRun = null;
let busy = false;
let watching = false;
const hostContext = () => globalThis.SillyTavern?.getContext?.();
const settingsFor = record => record.settings;

function entryFor(context = hostContext()) {
    const key = chatKey(context);
    if (!key) return null;
    if (!entries.has(key)) entries.set(key, { key, record: null, loaded: false, loading: null, error: null, dirty: false, inputs: null, inputsLoading: null });
    return entries.get(key);
}

function snapshot(entry) {
    if (!entry?.record) return null;
    const context = hostContext();
    const job = structuredClone(entry.record.job);
    job.isCurrentChat = entry.key === chatKey(context);
    job.newFloors = null;
    if (job.isCurrentChat) {
        try {
            const floors = newSegments(entry.record, context, settingsFor(entry.record)).flatMap(segment => segment.floors);
            if (floors.length) job.newFloors = { count: floors.length, from: floors[0].floor, to: floors.at(-1).floor };
        } catch { /* 追加时显示具体原因，旧结果始终可查看。 */ }
    }
    return job;
}

function emit() {
    const value = snapshot(activeRun?.entry ?? entryFor());
    for (const listener of listeners) {
        Promise.resolve().then(() => {
            if (listeners.has(listener)) return listener(structuredClone(value));
        }).catch(() => console.error('[YaKitChat] 润色任务回调失败'));
    }
}

function loadEntry(entry) {
    if (entry.loading) return entry.loading;
    if (entry.loaded) return Promise.resolve();
    entry.loading = (async () => {
        try {
            const saved = await loadSaved(entry.key);
            entry.record = saved === null ? null : restoreRecord(saved);
            entry.loaded = true;
            entry.error = null;
        } catch (error) {
            entry.error = error;
            throw error;
        } finally {
            entry.loading = null;
            emit();
        }
    })();
    return entry.loading;
}

// 本次任务输入单独读取；读取失败时报错，不当成空值。
function loadInputs(entry) {
    if (entry.inputs) return Promise.resolve(entry.inputs);
    entry.inputsLoading ??= (async () => {
        try {
            entry.inputs = restoreInputs(await loadSaved(entry.key, 'inputs'));
            return entry.inputs;
        } finally {
            entry.inputsLoading = null;
        }
    })();
    return entry.inputsLoading;
}

function watch() {
    if (watching) return;
    watching = true;
    exportUI.onChatChanged(() => {
        const entry = entryFor();
        if (entry && !entry.loaded && !entry.loading) void loadEntry(entry).catch(() => {});
        emit();
    });
}

function getJob() {
    watch();
    const entry = entryFor();
    if (entry && !entry.loaded && !entry.loading && !entry.error) void loadEntry(entry).catch(() => {});
    if (activeRun) return snapshot(activeRun.entry);
    if (entry?.error && !entry.record) throw entry.error;
    return snapshot(entry);
}

function onJobChange(callback) {
    if (typeof callback !== 'function') throw new Error('润色任务回调必须是函数');
    listeners.add(callback);
    watch();
    const entry = entryFor();
    if (entry && !entry.loaded && !entry.error) void loadEntry(entry).catch(() => {});
    return () => listeners.delete(callback);
}

function requireIdle() {
    if (activeRun || busy) throw new Error('正在润色或保存，请先停止当前任务并等待保存完成');
}

async function change(operation, { allowUnread = false } = {}) {
    requireIdle();
    busy = true;
    try {
        watch();
        const context = hostContext();
        const entry = entryFor(context);
        if (!entry) throw new Error('请先打开已有聊天，等待聊天标识就绪后重试');
        try { await loadEntry(entry); } catch (error) { if (!allowUnread) throw error; }
        if (chatKey(hostContext()) !== entry.key) throw new Error('当前聊天已切换，请在目标聊天重新操作');
        return await operation(entry, context);
    } finally {
        busy = false;
    }
}

function requireRecord(entry) {
    if (!entry?.record) throw new Error('还没有润色任务，请先开始润色');
    return entry.record;
}

async function persist(entry) {
    entry.dirty = true;
    await saveSaved(entry.key, entry.record);
    entry.dirty = false;
}

async function replace(entry, next) {
    // 先确认服务器保存，再替换内存；编辑和重做准备失败时保留旧结果。
    await saveSaved(entry.key, next);
    entry.record = next;
    entry.loaded = true;
    entry.error = null;
    entry.dirty = false;
}

function settleRunning(job) {
    for (const segment of job.segments) {
        for (const floor of segment.floors) {
            if (floor.status === 'running') floor.status = floor.polished === null ? 'pending' : 'done';
        }
        syncSegment(segment);
        if (segment.status === 'running') {
            segment.status = segment.floors.every(floor => floor.status === 'done') ? 'done' : 'pending';
            segment.error = null;
        }
    }
    job.status = 'stopped';
    job.waitUntil = null;
}

function markSaveFailure(run, error) {
    // 结果已生成但尚未落盘时，“继续”只补保存，不必整段重新请求。
    for (const segment of run.savingSegments ?? []) Object.assign(segment, { status: 'failed', error: error.message });
    run.entry.record.job.stopReason = error.message;
}

function launch(entry, batches, generate, options = {}) {
    const run = { entry, controller: new AbortController() };
    activeRun = run;
    const job = entry.record.job;
    Object.assign(job, { status: 'running', waitUntil: null, stopReason: null });
    emit();
    void runBatches({
        job, batches, generate, signal: run.controller.signal, isActive: () => activeRun === run,
        checkpoint: async segments => {
            if (segments) run.savingSegments = segments;
            await persist(entry);
            if (activeRun === run && job.status === 'running') emit();
        },
        onWait: waitUntil => {
            if (activeRun !== run) return;
            job.waitUntil = waitUntil;
            emit();
        },
        ...options,
    }).catch(async error => {
        if (activeRun !== run) return;
        run.controller.abort();
        settleRunning(job);
        job.stopReason = error?.message || '润色任务中断，请继续润色';
        if (error?.code === 'POLISH_SAVE') markSaveFailure(run, error);
        // 保存失败时保留内存并停止发请求，下一次继续先重新保存。
        if (error?.code !== 'POLISH_SAVE') {
            try { await persist(entry); } catch (saveError) { job.stopReason = saveError.message; }
        }
    }).finally(() => {
        if (activeRun !== run) return;
        activeRun = null;
        const current = entryFor();
        if (current && !current.loaded) void loadEntry(current).catch(() => {});
        emit();
    });
    return snapshot(entry);
}

const batchesFor = segments => segments.map(segment => ({ floors: segment.floors, segments: [segment] }));

// 每轮开始前读回当前聊天已保存的本次任务输入，交给生成器固定。
async function generatorFor(entry, context) {
    const inputs = await loadInputs(entry);
    if (chatKey(hostContext()) !== entry.key) throw new Error('当前聊天已切换，请在目标聊天重新操作');
    // 世界书开关不锁定，按操作开始时保存的润色设置决定。
    return createGenerator(context, inputs, { worldInfo: loadSettings()?.worldInfo === true });
}

async function getTaskInputs() {
    watch();
    const entry = entryFor();
    if (!entry) throw new Error('请先打开已有聊天，等待聊天标识就绪后重试');
    const inputs = await loadInputs(entry);
    if (chatKey(hostContext()) !== entry.key) throw new Error('当前聊天已切换，请重新打开润色设置');
    return structuredClone(inputs);
}

async function saveTaskInputs(patch) {
    return change(async entry => {
        const current = await loadInputs(entry);
        const next = mergeInputs(current, patch);
        if (!Object.keys(patch).length) return structuredClone(current);
        await saveSaved(entry.key, next, 'inputs');
        entry.inputs = next;
        return structuredClone(next);
    }, { allowUnread: true });
}

async function start(settings) {
    const normalized = normalizeSettings(settings);
    return change(async (entry, context) => {
        const { segments } = buildPlan(normalized, context);
        if (!segments.length) throw new Error('没有可润色的内容，请检查楼层、消息类型和清洗规则');
        const generate = await generatorFor(entry, context);
        const name = context.characters[context.characterId]?.name;
        const next = { settings: normalized, sourcePrefix: sourcePrefix(context), job: {
            id: createRecordId(), status: 'stopped', chatName: name?.trim() ? name : '润色结果',
            isCurrentChat: true, stopReason: null, waitUntil: null, newFloors: null, segments,
        } };
        await replace(entry, next);
        return launch(entry, batchesFor([next.job.segments[0]]), generate, { review: true });
    });
}

async function resume() {
    return change(async (entry, context) => {
        const record = requireRecord(entry);
        const segments = record.job.segments.filter(segment => segment.floors.some(floor => floor.status !== 'done'));
        if (!segments.length) {
            const next = structuredClone(record);
            next.job.status = 'finished';
            next.job.stopReason = null;
            for (const segment of next.job.segments) Object.assign(segment, { status: 'done', error: null });
            await replace(entry, next);
            emit();
            return snapshot(entry);
        }
        const generate = await generatorFor(entry, context);
        await persist(entry);
        return launch(entry, batchesFor(segments), generate);
    });
}

async function retrySegment(index) {
    return change(async (entry, context) => {
        const next = structuredClone(requireRecord(entry));
        if (!Number.isInteger(index) || index < 0 || index >= next.job.segments.length) {
            throw new Error('找不到这段润色内容，请重新打开润色页');
        }
        const generate = await generatorFor(entry, context);
        const segment = next.job.segments[index];
        for (const floor of segment.floors) Object.assign(floor, { polished: null, edited: false, short: false, status: 'pending' });
        syncSegment(segment);
        segment.status = 'pending';
        segment.error = null;
        await replace(entry, next);
        return launch(entry, batchesFor([segment]), generate);
    });
}

async function editFloor(number, text) {
    return change(async entry => {
        const next = structuredClone(requireRecord(entry));
        const selected = planRedo(next.job, [number], settingsFor(next))[0].floors[0];
        applyFloorText(selected, text, { edited: true });
        const segment = next.job.segments.find(item => item.floors.includes(selected));
        syncSegment(segment);
        if (segment.floors.every(floor => floor.status === 'done')) { segment.status = 'done'; segment.error = null; }
        if (next.job.status !== 'review' && next.job.segments.every(item => item.status === 'done')) next.job.status = 'finished';
        next.job.stopReason = null;
        await replace(entry, next);
        emit();
        return snapshot(entry);
    });
}

function estimateRedo(floors) {
    requireIdle();
    getJob();
    const record = requireRecord(entryFor());
    return planRedo(record.job, floors, settingsFor(record)).length;
}

async function redoFloors(floors) {
    const selected = Array.isArray(floors) ? [...floors] : floors;
    return change(async (entry, context) => {
        const next = structuredClone(requireRecord(entry));
        const batches = planRedo(next.job, selected, settingsFor(next)).map(batch => ({ ...batch,
            segments: next.job.segments.filter(segment => segment.floors.some(floor => batch.floors.includes(floor))),
        }));
        const generate = await generatorFor(entry, context);
        await replace(entry, next);
        return launch(entry, batches, generate, { redo: true });
    });
}

async function appendNew() {
    return change(async (entry, context) => {
        const next = structuredClone(requireRecord(entry));
        if (hasSourceChanges(next, context)) throw new Error('原聊天已有楼层被修改或删除，旧结果已保留，请清空结果后重新分段');
        const settings = normalizeSettings(settingsFor(next));
        const segments = newSegments(next, context, settings);
        if (!segments.length) throw new Error('没有符合当前润色设置的新增楼层');
        const generate = await generatorFor(entry, context);
        const offset = next.job.segments.length;
        segments.forEach((segment, index) => { segment.index = offset + index; });
        next.job.segments.push(...segments);
        next.sourcePrefix = sourcePrefix(context);
        next.settings = settings;
        await replace(entry, next);
        return launch(entry, batchesFor(segments), generate);
    });
}

async function stop() {
    if (!activeRun) return;
    if (busy) throw new Error('正在保存润色结果，请稍后再停止');
    busy = true;
    const run = activeRun;
    activeRun = null;
    run.controller.abort();
    settleRunning(run.entry.record.job);
    run.entry.record.job.stopReason = null;
    emit();
    try {
        await persist(run.entry);
    } catch (error) {
        markSaveFailure(run, error);
        emit();
        throw error;
    } finally { busy = false; }
}

async function clearJob() {
    return change(async entry => {
        await deleteSaved(entry.key);
        // 清空结果时一起清空本次任务输入，文风库和全局设置不受影响。
        await deleteSaved(entry.key, 'inputs');
        entry.inputs = emptyInputs();
        entry.record = null;
        entry.dirty = false;
        entry.error = null;
        entry.loaded = true;
        emit();
    }, { allowUnread: true });
}

export const polishUI = Object.freeze({
    getChatInfo: exportUI.getChatInfo, onChatChanged: exportUI.onChatChanged,
    loadSettings, saveSettings, getContext, planSegments: async settings => planSegments(settings),
    start, resume, retrySegment, stop, clearJob, getJob, onJobChange,
    editFloor, estimateRedo, redoFloors, appendNew, getTaskInputs, saveTaskInputs,
    exportFile: async (options = {}) => {
        let value = getJob();
        const entry = activeRun?.entry ?? entryFor();
        if (!value && entry) { await loadEntry(entry); value = getJob(); }
        if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('导出选项必须是对象');
        const { settings, source } = resolveSettings(entry?.record?.settings);
        return exportPolish(value, { fileName: options.fileName ?? settings.fileName, format: source.format, illustrated: source.illustrated === true });
    },
});
