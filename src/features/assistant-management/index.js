import { readSettings, updateSettings } from '../../shared/settings.js';

const kinds = ['regex', 'polish'];
const fields = { regex: ['profile', 'jailbreak'], polish: ['profile', 'jailbreak', 'prompt'] };
const promptDefaults = {
    jailbreak: { target: 'system', anchor: 'start', priority: 100 },
    style: { target: 'user', anchor: 'end', priority: 50 },
};

function assertKind(kind) {
    if (!kinds.includes(kind)) throw new Error('请选择正则助手或润色助手');
}

function isObject(value) {
    return value !== null && Object.prototype.toString.call(value) === '[object Object]';
}

function getGroup(settings, field) {
    if (field === 'profile') return settings.apiProfiles;
    return settings.prompts[field === 'jailbreak' ? 'jailbreak' : 'style'];
}

function validChoice(settings, field, value) {
    return typeof value === 'string' && (value === 'follow'
        || value === (field === 'profile' ? 'main' : 'none')
        || getGroup(settings, field).items.some(item => item.id === value));
}

function readAssistant(settings, kind) {
    if (settings.assistants !== undefined && !isObject(settings.assistants)) {
        throw new Error('助手配置内容不对，请重新设置');
    }
    const saved = settings.assistants?.[kind];
    if (saved !== undefined && !isObject(saved)) throw new Error('助手配置内容不对，请重新设置');
    // 删除后的旧引用只在返回值中回到跟随，读取不保存。
    return Object.fromEntries(fields[kind].map(field => [field,
        validChoice(settings, field, saved?.[field]) ? saved[field] : 'follow',
    ]));
}

export function getAssistant(kind) {
    assertKind(kind);
    return readAssistant(readSettings(), kind);
}

export function setAssistant(kind, patch) {
    assertKind(kind);
    if (!isObject(patch)) throw new Error('助手配置内容不对，请重新选择');
    const keys = Reflect.ownKeys(patch);
    if (keys.some(field => !fields[kind].includes(field))) throw new Error('这项助手设置不能修改');
    if (!keys.length) return getAssistant(kind);
    return updateSettings(settings => {
        const next = readAssistant(settings, kind);
        for (const field of keys) {
            const value = patch[field];
            if (!validChoice(settings, field, value)) {
                throw new Error(field === 'profile' ? '所选接口已不存在或不能使用，请重新选择' : '所选提示词已不存在或不能使用，请重新选择');
            }
            next[field] = value;
        }
        settings.assistants ??= {};
        // 保留停用的旧字段，公开配置只更新当前支持的项目。
        settings.assistants[kind] = { ...settings.assistants[kind], ...next };
        return next;
    });
}

function resolveRecord(group, selection) {
    if (selection === 'main' || selection === 'none') return null;
    const id = selection === 'follow' ? group.activeId : selection;
    return group.items.find(item => item.id === id) ?? null;
}

function resolvePrompt(settings, field, selection) {
    const record = resolveRecord(getGroup(settings, field), selection);
    if (!record) return null;
    // 空破限词只在本次解析中视为不使用，保留原选择以便填写后自动生效。
    if (field === 'jailbreak' && (typeof record.content !== 'string' || !record.content.trim())) return null;
    const category = field === 'jailbreak' ? 'jailbreak' : 'style';
    // 文风是用户需求，旧记录也固定放入 user。
    const result = { ...record };
    for (const [key, value] of Object.entries(promptDefaults[category])) {
        if (result[key] === undefined) result[key] = value;
    }
    if (category === 'style') result.target = 'user';
    return result;
}

export function getAssistantSelection(kind) {
    assertKind(kind);
    const settings = readSettings();
    const selection = readAssistant(settings, kind);
    const config = resolveRecord(settings.apiProfiles, selection.profile);
    return {
        api: config ? { source: 'secondary', config } : { source: 'main' },
        jailbreak: resolvePrompt(settings, 'jailbreak', selection.jailbreak),
        ...(kind === 'polish' ? { prompt: resolvePrompt(settings, 'prompt', selection.prompt) } : {}),
    };
}

// 删除事务只清理现有助手的匹配项，不补建助手配置。
export function resetAssistantReferences(settings, field, id, kind) {
    if (!fields.polish.includes(field) || (field === 'prompt' && kind !== 'polish')) {
        throw new Error('这项助手设置不能修改');
    }
    for (const target of field === 'prompt' ? [kind] : kinds) {
        const assistant = settings.assistants?.[target];
        if (assistant?.[field] === id) assistant[field] = 'follow';
    }
}
