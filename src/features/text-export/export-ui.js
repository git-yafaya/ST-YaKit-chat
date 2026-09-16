import { readChat } from './read-chat.js';
import { filterMessages, getMessageType } from './filter-messages.js';
import { cleanByGroups } from './clean-messages.js';
import { saveExport } from './save-export.js';
import { scanTags } from './scan-recent-tags.js';
import { getAiContext, suggestRules, cancelSuggestRules } from './ai-assist.js';
import { normalizeSettings, parseRule, isValidRule, loadSettings, saveSettings } from './export-ui-settings.js';
import { replaceImageTags, loadIllustrations, TOKEN_PATTERN } from './illustrations.js';

function chatInfo(context) {
    if (context?.characterId == null || !Array.isArray(context.chat)) {
        return { status: 'none', floorCount: 0 };
    }
    return { status: 'ok', floorCount: context.chat.length };
}

function getChatInfo() {
    return chatInfo(globalThis.SillyTavern?.getContext?.());
}

function scanRecentTags() {
    const context = globalThis.SillyTavern?.getContext?.();
    if (chatInfo(context).status !== 'ok') return [];
    // 直接扫描最后两楼原文，包含隐藏消息，不应用导出筛选。
    return scanTags(context.chat.slice(-2).map(message => message?.mes));
}

// 扫描全部楼层（含隐藏）：按标签第一次出现的楼层排序，并统计出现在多少层。
async function scanAllTags() {
    const context = globalThis.SillyTavern?.getContext?.();
    if (chatInfo(context).status !== 'ok') return [];
    const found = new Map();
    for (const [index, message] of context.chat.entries()) {
        for (const tag of scanTags([message?.mes])) {
            const item = found.get(tag.rule);
            if (item) item.floors++;
            else found.set(tag.rule, { ...tag, floors: 1, first: index });
            // 同一标签在某层有成对写法时，按钮文字用成对写法。
            if (item && !tag.label.endsWith('/>')) item.label = tag.label;
        }
        // 楼层很多时分批让出主线程，界面不卡住。
        if (index % 200 === 199) await new Promise(resolve => setTimeout(resolve, 0));
    }
    return [...found.values()].sort((a, b) => a.first - b.first).map(({ label, rule, floors }) => ({ label, rule, floors }));
}

// 插画小说只对 EPUB 生效：清洗前把生图标签换成占位符，refs 记录每张图的来源。
function readMessages(context, settings, refs = null) {
    if (!context.chat.length || !Object.values(settings.types).some(Boolean)) return [];

    let range = 'all';
    if (!settings.allFloors) {
        const last = context.chat.length - 1;
        const floor = (value, fallback) => value.trim() && Number.isFinite(Number(value))
            ? Math.trunc(Number(value)) : fallback;
        let start = floor(settings.start, 0);
        let end = floor(settings.end, last);
        if (start > end) [start, end] = [end, start];
        // 界面从 0 起算；交换并夹紧后转换成核心读取接口的楼层。
        range = {
            start: Math.min(last, Math.max(0, start)) + 1,
            end: Math.min(last, Math.max(0, end)) + 1,
        };
    }
    // 隐藏状态独立筛选，保留原楼层号后再按消息类别过滤。
    const included = readChat(context, range).filter(message => settings.includeHidden || !message.is_system);
    let messages = filterMessages(included, settings.types);
    if (refs) messages = messages.map(message => ({ ...message, mes: replaceImageTags(message.mes, context.chat[message.floor - 1], message.floor - 1, context, refs) }));
    const parse = list => list.map(parseRule).filter(rule => rule !== null);
    return cleanByGroups(messages, parse(settings.rules), parse(settings.keepRules));
}

function previewMessages(settings = {}, count = 2) {
    if (!Number.isInteger(count) || count < 0) {
        throw new TypeError('预览条数必须是非负整数');
    }
    const normalized = normalizeSettings(settings);
    const context = globalThis.SillyTavern?.getContext?.();
    if (chatInfo(context).status !== 'ok' || count === 0) return [];
    const illustrated = normalized.illustrated && normalized.format === 'epub';
    return readMessages(context, normalized, illustrated ? [] : null).slice(-count).map(message => ({
        floor: message.floor - 1,
        type: getMessageType(message),
        name: typeof message.name === 'string' ? message.name : '',
        text: illustrated ? message.mes.replace(TOKEN_PATTERN, '〔插图〕') : message.mes,
    }));
}

async function exportFile(settings = {}) {
    const normalized = normalizeSettings(settings);
    const context = globalThis.SillyTavern?.getContext?.();
    const { status } = chatInfo(context);
    if (status === 'none') throw new Error('请先在酒馆里打开一个聊天');
    const refs = normalized.illustrated && normalized.format === 'epub' ? [] : null;
    const messages = readMessages(context, normalized, refs).filter(message => message.mes.trim());
    if (!messages.length) throw new Error('无内容');
    const ids = refs ? messages.flatMap(message => [...message.mes.matchAll(TOKEN_PATTERN)].map(match => Number(match[1]))) : [];
    const illustrations = refs ? await loadIllustrations(refs, context, { ids }) : null;
    await saveExport(messages, {
        fileType: normalized.format,
        labelMode: normalized.labels === 'with' ? 'speaker' : 'plain',
        fileName: normalized.fileName,
        illustrations,
    });
    return refs ? { count: messages.length, images: illustrations.size, missingImages: new Set(ids).size - illustrations.size } : { count: messages.length };
}

function onChatChanged(callback) {
    if (typeof callback !== 'function') throw new TypeError('聊天变化回调必须是函数');
    const context = globalThis.SillyTavern?.getContext?.();
    const source = context?.eventSource;
    const types = context?.eventTypes;
    if (!source || !types) return () => {};
    const events = [...new Set([
        'CHAT_CHANGED', 'CHAT_LOADED', 'CHAT_CREATED', 'CHAT_DELETED',
        'MESSAGE_SENT', 'MESSAGE_RECEIVED', 'MESSAGE_EDITED', 'MESSAGE_UPDATED',
        'MESSAGE_DELETED', 'MESSAGE_SWIPED', 'MESSAGE_SWIPE_DELETED',
        'USER_MESSAGE_RENDERED', 'CHARACTER_MESSAGE_RENDERED',
    ].map(key => types[key]).filter(event => typeof event === 'string'))];
    let active = true;
    const listener = () => {
        // 宿主会等待监听器返回值；界面异步刷新不参与宿主事件等待。
        Promise.resolve().then(() => {
            if (active) return callback();
        }).catch(error => console.error('[YaKitChat] 聊天变化回调失败', error));
    };
    for (const event of events) source.on(event, listener);
    return () => {
        if (!active) return;
        active = false;
        for (const event of events) source.removeListener(event, listener);
    };
}

export const exportUI = Object.freeze({
    getChatInfo, previewMessages, isValidRule, exportFile, onChatChanged, loadSettings, saveSettings, scanRecentTags, scanAllTags,
    getAiContext, suggestRules, cancelSuggestRules,
});
