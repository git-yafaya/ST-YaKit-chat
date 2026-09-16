import { normalizeSettings } from '../text-export/export-ui-settings.js';

const CONTENT_KEYS = ['types', 'format', 'labels', 'mode', 'rules'];
// 插画小说开关后加入，旧预设缺省按关闭。
const OPTIONAL_KEYS = ['illustrated', 'keepRules', 'replaceRules', 'tagPlan'];
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function normalizeName(value) {
    if (typeof value !== 'string') throw new Error('预设名称必须是字符串');
    const name = value.trim();
    if (!name) throw new Error('预设名称不能为空');
    return name;
}

// 内容必须完整，楼层范围、文件名和其他额外字段不进入预设。
export function normalizeContent(value) {
    if (!isObject(value) || CONTENT_KEYS.some(key => !Object.hasOwn(value, key))
        || !isObject(value.types) || ['ai', 'user', 'system'].some(key => !Object.hasOwn(value.types, key))) {
        throw new Error('预设内容不完整');
    }
    const keys = [...CONTENT_KEYS, ...OPTIONAL_KEYS.filter(key => Object.hasOwn(value, key))];
    const settings = normalizeSettings(Object.fromEntries(keys.map(key => [key, value[key]])));
    return Object.fromEntries([...CONTENT_KEYS, ...OPTIONAL_KEYS].map(key => [key, settings[key]]));
}

export function normalizeCollection(value) {
    if (value === undefined) return { items: [], activeIds: [] };
    if (!isObject(value) || !Array.isArray(value.items)) throw new Error('预设库格式不正确');
    const ids = new Set();
    const names = new Set();
    const items = Array.from(value.items, item => {
        if (!isObject(item) || typeof item.id !== 'string' || !item.id.trim()) {
            throw new Error('预设标识格式不正确');
        }
        const name = normalizeName(item.name);
        if (ids.has(item.id)) throw new Error('预设标识重复');
        if (names.has(name)) throw new Error('已有同名预设');
        ids.add(item.id);
        names.add(name);
        return { id: item.id, name, content: normalizeContent(item.content) };
    });
    // 可以同时用多套预设；旧数据里的单个 activeId 自动变成一套。
    const active = Array.isArray(value.activeIds) ? value.activeIds
        : (value.activeId === null || value.activeId === undefined ? [] : [value.activeId]);
    if (active.some(id => typeof id !== 'string' || !ids.has(id))) throw new Error('当前预设不存在');
    const chosen = new Set(active);
    return { items, activeIds: items.filter(item => chosen.has(item.id)).map(item => item.id) };
}

// 多套叠加：规则按预设在列表里的先后拼起来，单选项和同名标签由靠后的一套说了算。
export function mergeContents(contents) {
    if (!contents.length) return null;
    const merged = { ...contents[0], types: { ...contents[0].types } };
    for (const content of contents.slice(1)) {
        Object.assign(merged, content, { types: { ...merged.types, ...content.types } });
    }
    for (const key of ['rules', 'keepRules']) {
        merged[key] = [...new Set(contents.flatMap(content => content[key] || []))];
    }
    const replaces = new Map();
    for (const content of contents) {
        for (const rule of content.replaceRules || []) replaces.set(`${rule.find}\u0000${rule.to}`, rule);
    }
    merged.replaceRules = [...replaces.values()];
    const plan = new Map();
    for (const content of contents) {
        for (const item of content.tagPlan || []) plan.set(item.name, item);
    }
    merged.tagPlan = [...plan.values()];
    return merged;
}

// 只接受 JSON 能完整表达的界面偏好，避免导出时悄悄丢字段。
export function cloneUiPrefs(value) {
    const invalid = () => { throw new Error('界面偏好必须是可保存为 JSON 的对象'); };
    const ancestors = new Set();
    function copy(item) {
        if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
        if (typeof item === 'number' && Number.isFinite(item)) return item;
        const array = Array.isArray(item);
        if (!item || typeof item !== 'object' || ancestors.has(item)
            || (!array && Object.prototype.toString.call(item) !== '[object Object]')) return invalid();
        const keys = Object.keys(item);
        if (Reflect.ownKeys(item).length !== keys.length + (array ? 1 : 0)
            || (array && (keys.length !== item.length || keys.some((key, index) => key !== String(index))))) return invalid();
        ancestors.add(item);
        const entries = keys.map(key => [key, copy(item[key])]);
        ancestors.delete(item);
        return array ? entries.map(([, entry]) => entry) : Object.fromEntries(entries);
    }
    if (!isObject(value)) return invalid();
    return copy(value);
}
