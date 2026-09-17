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
        illustrated: false,
        stripComments: true,
        commentText: false,
        fileName: '',
        mode: 'delete',
        rules: [],
        keepRules: [],
        replaceRules: [],
        tagPlan: [],
        tagScan: { start: '', end: '' },
    };
    for (const key of ['allFloors', 'includeHidden', 'illustrated', 'stripComments', 'commentText', 'start', 'end', 'fileName']) {
        if (!Object.hasOwn(value, key)) continue;
        if (typeof value[key] !== typeof settings[key]) {
            throw new TypeError(`导出设置 ${key} 类型不正确`);
        }
        settings[key] = value[key];
    }
    for (const [key, allowed] of Object.entries({
        format: ['txt', 'md', 'epub', 'jsonl'],
        labels: ['with', 'plain'],
        mode: ['delete', 'keep', 'replace'],
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
    // rules 是删除组，keepRules 是保留组；mode 只表示界面正在看哪一组，两组同时生效。
    for (const key of ['rules', 'keepRules']) {
        if (!Object.hasOwn(value, key)) continue;
        if (!Array.isArray(value[key]) || Array.from(value[key]).some(rule => typeof rule !== 'string')) {
            throw new TypeError(`导出设置 ${key} 必须是字符串数组`);
        }
        settings[key] = [...value[key]];
    }
    // 替换组：每条是 { find, to }，find 写法同其他规则，to 是替换成的文字（可为空）。
    if (Object.hasOwn(value, 'replaceRules')) {
        const list = Array.isArray(value.replaceRules) ? Array.from(value.replaceRules) : null;
        if (!list || list.some(rule => !isObject(rule) || typeof rule.find !== 'string' || typeof rule.to !== 'string')) {
            throw new TypeError('导出设置 replaceRules 必须是 { find, to } 组成的数组');
        }
        settings.replaceRules = list.map(({ find, to }) => ({ find, to }));
    }
    // 标签抽屉：tagPlan 记每个标签选了怎么处理，tagScan 记上次识别的楼层范围。
    if (Object.hasOwn(value, 'tagPlan')) {
        const list = Array.isArray(value.tagPlan) ? Array.from(value.tagPlan) : null;
        if (!list || list.some(item => !isObject(item) || typeof item.name !== 'string'
            || !['keep', 'delete', 'strip'].includes(item.action))) {
            throw new TypeError('导出设置 tagPlan 必须是 { name, action } 组成的数组');
        }
        settings.tagPlan = list.map(({ name, action }) => ({ name, action }));
    }
    if (Object.hasOwn(value, 'tagScan')) {
        const scan = value.tagScan;
        if (!isObject(scan) || typeof scan.start !== 'string' || typeof scan.end !== 'string') {
            throw new TypeError('导出设置 tagScan 必须是 { start, end } 字符串');
        }
        settings.tagScan = { start: scan.start, end: scan.end };
    }
    // 旧设置没有保留组：原来选「只保留匹配」的规则整组迁到保留组。
    if (!Object.hasOwn(value, 'keepRules') && settings.mode === 'keep') {
        settings.keepRules = settings.rules;
        settings.rules = [];
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

// 替换组：查找写法同其他规则，{{match}} 换成整段匹配内容（正则替换里的 $&）。
// 导出设置里的 HTML 注释处理方式：strip 去掉、unwrap 只去掉注释符号、keep 原样保留。
export function commentMode(settings) {
    if (settings?.stripComments !== false) return 'strip';
    return settings.commentText === true ? 'unwrap' : 'keep';
}

export function parseReplaceRule(rule) {
    const parsed = parseRule(rule?.find);
    if (parsed === null || typeof rule?.to !== 'string') return null;
    // 用函数返回替换文字，避免 $& 在 replaceAll 里又被当成匹配内容
    return { ...parsed, to: rule.to.replaceAll('{{match}}', () => '$&') };
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
