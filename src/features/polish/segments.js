import { readSettings, updateSettings } from '../../shared/settings.js';
import { readChat } from '../text-export/read-chat.js';
import { filterMessages } from '../text-export/filter-messages.js';
import { cleanByGroups } from '../text-export/clean-messages.js';
import { loadSettings as loadExportSettings, normalizeSettings as normalizeExportSettings, parseRule, parseReplaceRule } from '../text-export/export-ui-settings.js';
import { list as listPresets } from '../presets/store.js';
import { replaceImageTags, takeImages } from '../text-export/illustrations.js';

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const CHUNK_FLOORS = { fewer: 20, balanced: 10, quality: 5 };

// 只接收约定字段，跨窗口对象也可传入。
export function normalizeSettings(value = {}) {
    if (!isObject(value)) throw new TypeError('润色设置必须是对象');
    const settings = {
        allFloors: true, start: '', end: '',
        presetId: 'export',
        chunkMode: 'balanced', chunkFloors: 10, fileName: '', worldInfo: false,
    };
    const labels = {
        allFloors: '全部楼层', start: '起始楼层', end: '结束楼层',
        presetId: '导出预设', fileName: '文件名', worldInfo: '携带世界书',
    };
    for (const [key, label] of Object.entries(labels)) {
        if (!Object.hasOwn(value, key)) continue;
        if (typeof value[key] !== typeof settings[key]) throw new TypeError(`润色设置中的${label}格式不正确`);
        settings[key] = value[key];
    }
    // 旧字数不换算成楼层；保留已有档位，缺少档位时使用均衡。
    settings.chunkMode = Object.hasOwn(value, 'chunkMode') ? value.chunkMode
        : Object.hasOwn(value, 'chunkFloors') ? 'custom' : 'balanced';
    if (!['fewer', 'balanced', 'quality', 'custom'].includes(settings.chunkMode)) {
        const error = new TypeError('每次发送档位只能选省次数、均衡、重质量或自定义');
        error.field = 'chunkMode';
        throw error;
    }
    if (Object.hasOwn(value, 'chunkFloors')) {
        const valid = Number.isInteger(value.chunkFloors) && value.chunkFloors > 0;
        if (!valid && settings.chunkMode === 'custom') {
            const error = new TypeError('自定义楼层数必须是正整数');
            error.field = 'chunkFloors';
            throw error;
        }
        if (valid) settings.chunkFloors = value.chunkFloors;
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

export function getChunkFloors(value = {}) {
    const settings = normalizeSettings(value);
    return settings.chunkMode === 'custom' ? settings.chunkFloors : CHUNK_FLOORS[settings.chunkMode];
}

// 界面和任务共用段内楼层，保留旧的请求快照返回值。
export function buildPlan(value = {}, context = globalThis.SillyTavern?.getContext?.()) {
    const { settings, source } = resolveSettings(value);
    const chunkFloors = getChunkFloors(settings);
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
    // 插画小说：生图标签不发给模型，记下位置，导出 EPUB 时补回。
    const refs = source.illustrated === true && source.format === 'epub' ? [] : null;
    if (refs) messages = messages.map(message => ({ ...message, mes: replaceImageTags(message.mes, context.chat[message.floor - 1], message.floor - 1, context, refs) }));
    const parse = list => (Array.isArray(list) ? list : []).map(parseRule).filter(rule => rule !== null);
    const replacements = (Array.isArray(source.replaceRules) ? source.replaceRules : []).map(parseReplaceRule).filter(rule => rule !== null);
    messages = cleanByGroups(messages, parse(source.rules), parse(source.keepRules), replacements);

    const segments = [];
    const floors = [];
    for (const taken of messages) {
        const { text, images } = refs ? takeImages(taken.mes, refs) : { text: taken.mes, images: [] };
        const message = { ...taken, mes: text };
        if (!message.mes.trim()) continue;
        const chars = Array.from(message.mes).length;
        const previous = segments.at(-1);
        // 只按有效楼层数分段；字数仅用于展示，长楼不提前拆段。
        if (previous && previous.floors.length < chunkFloors) {
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
            status: 'pending', edited: false, short: false, ...(images.length ? { images } : {}),
        });
        floors.at(-1).push({ floor: message.floor - 1, text: message.mes });
    }
    return { segments, floors };
}

export function planSegments(value = {}, context = globalThis.SillyTavern?.getContext?.()) {
    return buildPlan(value, context).segments;
}
