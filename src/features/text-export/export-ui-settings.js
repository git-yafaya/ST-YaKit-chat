import { readSettings, updateSettings } from '../../shared/settings.js';

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// 只复制约定字段，缺项补默认值，并兼容 iframe 传入的对象。
export function normalizeSettings(value = {}) {
    if (!isObject(value)) throw new TypeError('导出设置必须是对象');
    const settings = {
        allFloors: true,
        includeHidden: true,
        start: '',
        end: '',
        types: { ai: true, user: true, system: true },
        format: 'txt',
        labels: 'with',
        fileName: '',
        mode: 'delete',
        rules: [],
    };
    for (const key of ['allFloors', 'includeHidden', 'start', 'end', 'fileName']) {
        if (!Object.hasOwn(value, key)) continue;
        if (typeof value[key] !== typeof settings[key]) {
            throw new TypeError(`导出设置 ${key} 类型不正确`);
        }
        settings[key] = value[key];
    }
    for (const [key, allowed] of Object.entries({
        format: ['txt', 'md', 'epub'],
        labels: ['with', 'plain'],
        mode: ['delete', 'keep'],
    })) {
        if (!Object.hasOwn(value, key)) continue;
        if (!allowed.includes(value[key])) throw new TypeError(`导出设置 ${key} 不受支持`);
        settings[key] = value[key];
    }
    if (Object.hasOwn(value, 'types')) {
        if (!isObject(value.types)) throw new TypeError('导出设置 types 必须是对象');
        for (const type of Object.keys(settings.types)) {
            if (!Object.hasOwn(value.types, type)) continue;
            if (typeof value.types[type] !== 'boolean') {
                throw new TypeError(`导出设置 types.${type} 必须是布尔值`);
            }
            settings.types[type] = value.types[type];
        }
    }
    if (Object.hasOwn(value, 'rules')) {
        if (!Array.isArray(value.rules) || Array.from(value.rules).some(rule => typeof rule !== 'string')) {
            throw new TypeError('导出设置 rules 必须是字符串数组');
        }
        settings.rules = [...value.rules];
    }
    return settings;
}

export function parseRule(source) {
    if (typeof source !== 'string' || !source.trim()) return null;
    let pattern = source;
    let flags = '';
    // 以 / 开头且还有 / 时，以最后一个 / 分隔标志；否则整串作为裸正则。
    const closingSlash = source.lastIndexOf('/');
    if (source.startsWith('/') && closingSlash > 0) {
        pattern = source.slice(1, closingSlash);
        flags = source.slice(closingSlash + 1);
    }
    try {
        // 与 cleanMessages 一样补 g 后校验，保留原始正文和标志。
        new RegExp(pattern, flags.includes('g') ? flags : `${flags}g`);
        return { pattern, flags };
    } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        return null;
    }
}

export function isValidRule(source) {
    return parseRule(source) !== null;
}

export function loadSettings() {
    const settings = readSettings();
    return Object.hasOwn(settings, 'exportUI') ? normalizeSettings(settings.exportUI) : null;
}

export function saveSettings(value) {
    const saved = normalizeSettings(value);
    return updateSettings(settings => {
        settings.exportUI = saved;
        return saved;
    });
}
