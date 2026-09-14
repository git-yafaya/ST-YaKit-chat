import { normalizeSettings } from '../text-export/export-ui-settings.js';

const CONTENT_KEYS = ['types', 'format', 'labels', 'mode', 'rules'];
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
    const settings = normalizeSettings(Object.fromEntries(CONTENT_KEYS.map(key => [key, value[key]])));
    return Object.fromEntries(CONTENT_KEYS.map(key => [key, settings[key]]));
}

export function normalizeCollection(value) {
    if (value === undefined) return { items: [], activeId: null };
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
    if (value.activeId !== null && (typeof value.activeId !== 'string' || !ids.has(value.activeId))) {
        throw new Error('当前预设不存在');
    }
    return { items, activeId: value.activeId };
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
