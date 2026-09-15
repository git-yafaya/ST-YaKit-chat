import { readSettings, updateSettings } from '../../shared/settings.js';
import { readChat } from '../text-export/read-chat.js';
import { filterMessages } from '../text-export/filter-messages.js';
import { cleanMessages } from '../text-export/clean-messages.js';
import { loadSettings as loadExportSettings, normalizeSettings as normalizeExportSettings, parseRule } from '../text-export/export-ui-settings.js';
import { list as listPresets } from '../presets/store.js';

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const CHUNK_SIZES = { fewer: 20000, balanced: 8000, quality: 3000 };

// 只接收约定字段，跨窗口对象也可传入。
export function normalizeSettings(value = {}) {
    if (!isObject(value)) throw new TypeError('润色设置必须是对象');
    const settings = {
        allFloors: true, start: '', end: '',
        presetId: 'export',
        chunkMode: 'balanced', chunkSize: 8000, fileName: '',
    };
    const labels = {
        allFloors: '全部楼层', start: '起始楼层', end: '结束楼层',
        presetId: '导出预设', fileName: '文件名',
    };
    for (const [key, label] of Object.entries(labels)) {
        if (!Object.hasOwn(value, key)) continue;
        if (typeof value[key] !== typeof settings[key]) throw new TypeError(`润色设置中的${label}格式不正确`);
        settings[key] = value[key];
    }
    // 旧设置和旧调用只有字数时，继续使用原来的自定义分段。
    settings.chunkMode = Object.hasOwn(value, 'chunkMode') ? value.chunkMode
        : Object.hasOwn(value, 'chunkSize') ? 'custom' : 'balanced';
    if (!['fewer', 'balanced', 'quality', 'custom'].includes(settings.chunkMode)) {
        const error = new TypeError('每次发送档位只能选省次数、均衡、重质量或自定义');
        error.field = 'chunkMode';
        throw error;
    }
    if (Object.hasOwn(value, 'chunkSize')) {
        const valid = Number.isInteger(value.chunkSize) && value.chunkSize >= 500 && value.chunkSize <= 30000;
        if (!valid && settings.chunkMode === 'custom') {
            const error = new TypeError('自定义字数要在 500 到 30000 字之间，请填写整数');
            error.field = 'chunkSize';
            throw error;
        }
        if (valid) settings.chunkSize = value.chunkSize;
    }
    // 旧清洗来源沿用为导出预设；其余旧筛选字段由预设统一接管。
    if (!Object.hasOwn(value, 'presetId') && typeof value.cleanSource === 'string' && value.clean !== false) {
        settings.presetId = value.cleanSource;
    }
    return settings;
}

export function loadSettings() {
    const settings = readSettings();
    return Object.hasOwn(settings, 'polishUI') ? resolveSettings(settings.polishUI).settings : null;
}

export function saveSettings(value) {
    const saved = normalizeSettings(value);
    try {
        return updateSettings(settings => {
            settings.polishUI = saved;
            return saved;
        });
    } catch (error) {
        if (/[\u3400-\u9fff]/u.test(error?.message ?? '')) throw error;
        throw new Error('润色设置保存失败，请重试', { cause: error });
    }
}

// 删除的引用回到导出页；隐藏开关始终取导出页当前保存值。
export function resolveSettings(value = {}) {
    const settings = normalizeSettings(value);
    const current = loadExportSettings() ?? normalizeExportSettings();
    const preset = settings.presetId === 'export' ? null : listPresets().find(item => item.id === settings.presetId);
    if (!preset) settings.presetId = 'export';
    return { settings, source: { ...(preset?.content ?? current), includeHidden: current.includeHidden } };
}

export function getChunkSize(value = {}) {
    const settings = normalizeSettings(value);
    return settings.chunkMode === 'custom' ? settings.chunkSize : CHUNK_SIZES[settings.chunkMode];
}

// 界面和任务共用段内楼层，保留旧的请求快照返回值。
export function buildPlan(value = {}, context = globalThis.SillyTavern?.getContext?.()) {
    const { settings, source } = resolveSettings(value);
    const chunkSize = getChunkSize(settings);
    if (context?.characterId == null || !Array.isArray(context.chat) || !context.chat.length
        || !Object.values(source.types).some(Boolean)) return { segments: [], floors: [] };

    const last = context.chat.length - 1;
    let start = 0;
    let end = last;
    if (!settings.allFloors) {
        const floor = (value, fallback) => value.trim() && Number.isFinite(Number(value))
            ? Math.trunc(Number(value)) : fallback;
        start = floor(settings.start, 0);
        end = floor(settings.end, last);
        if (start > end) [start, end] = [end, start];
        start = Math.min(last, Math.max(0, start));
        end = Math.min(last, Math.max(0, end));
    }
    // 先检查消息外形，避免宿主坏数据漏出英文异常。
    for (let floor = start; floor <= end; floor++) {
        if (!isObject(context.chat[floor])) throw new TypeError(`第 ${floor} 楼消息格式不正确，无法润色`);
    }
    const included = readChat(context, { start: start + 1, end: end + 1 })
        .filter(message => source.includeHidden || !message.is_system);
    let messages = filterMessages(included, source.types);
    for (const message of messages) {
        if (typeof message.mes !== 'string') throw new TypeError(`第 ${message.floor - 1} 楼正文不是文字，无法润色`);
    }
    const rules = source.rules.map(parseRule).filter(rule => rule !== null);
    if (rules.length) messages = cleanMessages(messages, rules, source.mode === 'keep' ? 'keep' : 'remove');

    const segments = [];
    const floors = [];
    for (const message of messages) {
        if (!message.mes.trim()) continue;
        const chars = Array.from(message.mes).length;
        const previous = segments.at(-1);
        // 双换行也计入字数；整楼保留，超长楼独占一段。
        if (previous && previous.chars + 2 + chars <= chunkSize) {
            previous.original += `\n\n${message.mes}`;
            previous.chars += 2 + chars;
            previous.endFloor = message.floor - 1;
        } else {
            segments.push({
                index: segments.length, startFloor: message.floor - 1, endFloor: message.floor - 1,
                chars, original: message.mes, polished: null, status: 'pending', error: null,
                resumeFloor: null, shortFloors: [], floors: [],
            });
            floors.push([]);
        }
        segments.at(-1).floors.push({
            floor: message.floor - 1, original: message.mes, polished: null,
            status: 'pending', edited: false, short: false,
        });
        floors.at(-1).push({ floor: message.floor - 1, text: message.mes });
    }
    return { segments, floors };
}

export function planSegments(value = {}, context = globalThis.SillyTavern?.getContext?.()) {
    return buildPlan(value, context).segments;
}
