import { ensureBuiltinJailbreaks } from './builtin-prompts.js';

const SETTINGS_KEY = 'ST-YaKit-chat';

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getContext() {
    if (typeof globalThis.SillyTavern?.getContext !== 'function') {
        throw new Error('请在 SillyTavern 中调用');
    }
    const context = globalThis.SillyTavern.getContext();
    if (!isObject(context.extensionSettings)) {
        throw new Error('宿主扩展设置尚未就绪');
    }
    return context;
}

function readGroup(value) {
    if (value == null) return { items: [], activeId: null };
    if (!isObject(value) || !Array.isArray(value.items)
        || !(value.activeId === null || typeof value.activeId === 'string')) {
        throw new Error('纪实设置格式不正确');
    }
    return value;
}

function snapshot(context) {
    const saved = context.extensionSettings[SETTINGS_KEY] ?? {};
    if (!isObject(saved)) throw new Error('纪实设置格式不正确');
    const settings = structuredClone(saved);
    settings.apiProfiles = readGroup(settings.apiProfiles);
    settings.prompts ??= {};
    if (!isObject(settings.prompts)) throw new Error('纪实提示词设置格式不正确');
    for (const category of ['jailbreak', 'style']) {
        settings.prompts[category] = readGroup(settings.prompts[category]);
    }
    ensureBuiltinJailbreaks(settings);
    // 原文风库直接复用；助手的独立选择只迁移一次，避免取消使用后又被旧字段恢复。
    if (settings.styleSelectionMigrated !== true) {
        const group = settings.prompts.style;
        const selected = settings.assistants?.polish?.prompt;
        if (selected === 'none') group.activeId = null;
        else if (typeof selected === 'string' && selected !== 'follow') {
            group.activeId = group.items.some(item => item.id === selected) ? selected : group.activeId;
        }
        settings.styleSelectionMigrated = true;
    }
    return settings;
}

// 查询只返回快照，不创建配置，也不触发保存。
export function readSettings() {
    return snapshot(getContext());
}

// 校验和修改先在副本上完成，失败时保留宿主原设置。
export function updateSettings(change) {
    const context = getContext();
    if (typeof context.saveSettingsDebounced !== 'function') {
        throw new Error('宿主设置保存接口尚未就绪');
    }
    const settings = snapshot(context);
    const result = change(settings);
    ensureBuiltinJailbreaks(settings);
    const resultSnapshot = structuredClone(result);
    const previous = context.extensionSettings[SETTINGS_KEY];
    const existed = Object.hasOwn(context.extensionSettings, SETTINGS_KEY);
    context.extensionSettings[SETTINGS_KEY] = settings;
    try {
        // 宿主只确认排队，不提供磁盘写入完成的回执。
        context.saveSettingsDebounced();
    } catch (error) {
        if (existed) context.extensionSettings[SETTINGS_KEY] = previous;
        else delete context.extensionSettings[SETTINGS_KEY];
        throw error;
    }
    return resultSnapshot;
}
