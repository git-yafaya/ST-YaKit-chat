import { exportUI } from '../text-export/export-ui.js';
import { createRecordId } from '../../shared/validation.js';
import { loadSettings, saveSettings, planSegments, buildPlan } from './segments.js';
import { getContext, createGenerator } from './generate.js';
import { exportPolish } from './export.js';

let job = null;
let sourceChat = null;
let sourceFloors = [];
let completedFloors = [];
let activeRun = null;
let offChat = null;
const listeners = new Set();

function chatKey(context) {
    if (context?.characterId == null || !Array.isArray(context.chat)) return null;
    const character = context.characters?.[context.characterId];
    return JSON.stringify([context.groupId ?? null, character?.avatar ?? context.characterId,
        context.chatId ?? character?.chat ?? null]);
}

function getJob() {
    if (!job) return null;
    return structuredClone({ ...job, isCurrentChat: sourceChat === chatKey(globalThis.SillyTavern?.getContext?.()) });
}

function emit() {
    const snapshot = getJob();
    for (const listener of listeners) {
        // 界面回调独立执行，关掉面板不影响任务。
        Promise.resolve().then(() => {
            if (listeners.has(listener)) return listener(structuredClone(snapshot));
        }).catch(() => console.error('[YaKitChat] 润色任务回调失败'));
    }
}

function onJobChange(callback) {
    if (typeof callback !== 'function') throw new Error('润色任务回调必须是函数');
    listeners.add(callback);
    return () => listeners.delete(callback);
}

function requireIdle() {
    if (activeRun) throw new Error('正在润色，请先停止当前任务');
}

function requireJob() {
    if (!job) throw new Error('还没有润色任务，请先开始润色');
}

function previousTail(index) {
    const completed = completedFloors[index];
    if (completed.length) return Array.from(completed.at(-1).text).slice(-300).join('');
    if (!index) return '';
    const previous = sourceFloors[index - 1].at(-1);
    const polished = completedFloors[index - 1].find(item => item.floor === previous.floor);
    return Array.from((polished ?? previous).text).slice(-300).join('');
}

async function processSegments(run, indexes, generate, review) {
    let failures = 0;
    for (const index of indexes) {
        if (activeRun !== run) return;
        const segment = job.segments[index];
        const limitBudget = { waitedSeconds: 0 };
        Object.assign(segment, { status: 'running', error: null });
        emit();
        try {
            while (true) {
                // 每次续写至少完成一楼才继续，避免同一超长楼层反复请求。
                const remaining = sourceFloors[index].slice(completedFloors[index].length);
                const result = await generate(remaining, previousTail(index), run.signal, waitUntil => {
                    if (activeRun !== run) return;
                    job.waitUntil = waitUntil;
                    emit();
                }, limitBudget);
                if (activeRun !== run) return;
                const length = text => Array.from(text.replace(/\s/gu, '')).length;
                segment.shortFloors.push(...result.completed.filter((item, offset) =>
                    length(item.text) < length(remaining[offset].text) / 2).map(item => item.floor));
                completedFloors[index].push(...result.completed);
                segment.polished = completedFloors[index].map(item => item.text).join('\n\n') || null;
                segment.resumeFloor = result.resumeFloor;
                if (result.resumeFloor === null) break;
                emit();
                if (!result.completed.length) {
                    throw new Error(`第 ${result.resumeFloor} 楼未能完整生成，已保留此前结果，请检查模型输出额度后继续润色`);
                }
            }
            Object.assign(segment, { status: 'done', error: null });
            failures = 0;
        } catch (error) {
            if (activeRun !== run) return;
            Object.assign(segment, { status: 'failed', error: error?.message || '这段润色失败，请重试' });
            failures++;
        }
        job.waitUntil = null;
        emit();
        if (failures >= 2) {
            activeRun = null;
            job.status = 'stopped';
            job.stopReason = '连续 2 段润色失败，请检查 API 和提示词后继续';
            emit();
            return;
        }
    }
    if (activeRun !== run) return;
    activeRun = null;
    const pending = job.segments.some(segment => segment.status === 'pending');
    job.status = review ? (job.segments[0].status === 'done' ? 'review' : 'stopped')
        : pending ? 'stopped' : 'finished';
    job.stopReason = review && job.segments[0].status !== 'done' ? '第 1 段润色失败，请检查提示后继续'
        : !review && pending ? '还有等待中的段落，请继续润色' : null;
    emit();
}

function launch(indexes, generate, review = false) {
    const run = new AbortController();
    activeRun = run;
    job.status = 'running';
    job.stopReason = null;
    job.waitUntil = null;
    emit();
    // 立即返回任务，后续状态由订阅推送；旧请求迟到时不再写入结果。
    void processSegments(run, indexes, generate, review).catch(() => {
        if (activeRun !== run) return;
        run.abort();
        activeRun = null;
        for (const segment of job.segments) {
            if (segment.status === 'running') Object.assign(segment, { status: 'pending', error: null });
        }
        job.status = 'stopped';
        job.waitUntil = null;
        job.stopReason = '润色任务中断，请继续润色';
        emit();
    });
    return getJob();
}

async function start(settings) {
    requireIdle();
    const context = globalThis.SillyTavern?.getContext?.();
    if (exportUI.getChatInfo().status !== 'ok') throw new Error('请先在酒馆里打开一个聊天');
    const { segments, floors } = buildPlan(settings, context);
    if (!segments.length) throw new Error('没有可润色的内容，请检查楼层、消息类型和清洗规则');
    const generate = createGenerator(context);
    const key = chatKey(context);
    const name = context.characters?.[context.characterId]?.name;
    const next = {
        id: createRecordId(), status: 'running',
        chatName: typeof name === 'string' && name.trim() ? name : '润色结果',
        isCurrentChat: true, stopReason: null, waitUntil: null, segments,
    };
    // 全部准备成功后才替换旧任务，设置错误不会丢掉已有结果。
    offChat ??= exportUI.onChatChanged(() => emit());
    job = next;
    sourceChat = key;
    sourceFloors = floors;
    completedFloors = segments.map(() => []);
    return launch([0], generate, true);
}

async function resume() {
    requireIdle();
    requireJob();
    const indexes = job.segments.filter(segment => segment.status !== 'done').map(segment => segment.index);
    if (!indexes.length) {
        job.status = 'finished';
        job.stopReason = null;
        emit();
        return getJob();
    }
    return launch(indexes, createGenerator(globalThis.SillyTavern?.getContext?.()));
}

async function retrySegment(index) {
    requireIdle();
    requireJob();
    if (!Number.isInteger(index) || index < 0 || index >= job.segments.length) {
        throw new Error('找不到这段润色内容，请重新打开润色页');
    }
    const generate = createGenerator(globalThis.SillyTavern?.getContext?.());
    completedFloors[index] = [];
    Object.assign(job.segments[index], { polished: null, resumeFloor: null, error: null, shortFloors: [] });
    return launch([index], generate);
}

async function stop() {
    if (!activeRun) return;
    const run = activeRun;
    activeRun = null;
    run.abort();
    for (const segment of job.segments) {
        if (segment.status === 'running') Object.assign(segment, { status: 'pending', error: null });
    }
    job.status = 'stopped';
    job.stopReason = null;
    job.waitUntil = null;
    emit();
}

async function clearJob() {
    requireIdle();
    job = null;
    sourceChat = null;
    sourceFloors = [];
    completedFloors = [];
    offChat?.();
    offChat = null;
    emit();
}

export const polishUI = Object.freeze({
    getChatInfo: exportUI.getChatInfo,
    onChatChanged: exportUI.onChatChanged,
    loadSettings, saveSettings, getContext,
    planSegments: async settings => planSegments(settings),
    start, resume, retrySegment, stop, clearJob, getJob, onJobChange,
    exportFile: async options => exportPolish(getJob(), options),
});
