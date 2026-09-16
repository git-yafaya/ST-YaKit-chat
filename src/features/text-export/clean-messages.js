// 校验规则结构，仅跳过正则自身的语法错误。
function compileRules(rules) {
    const regexes = [];
    for (const rule of rules) {
        if (rule === null || typeof rule !== 'object' || Array.isArray(rule)) {
            throw new TypeError('rules 中的规则必须是对象');
        }
        const { pattern, flags = '' } = rule;
        if (typeof pattern !== 'string' || typeof flags !== 'string') {
            throw new TypeError('规则的 pattern 和 flags 必须是字符串');
        }
        try {
            regexes.push(new RegExp(pattern, flags.includes('g') ? flags : `${flags}g`));
        } catch (error) {
            if (!(error instanceof SyntaxError)) throw error;
        }
    }
    return regexes;
}

function cleanText(text, regexes, mode) {
    if (regexes.length === 0) return text;

    // 每条规则都匹配原文；matchAll 会自动推进零长度匹配。
    const ranges = [];
    for (const regex of regexes) {
        for (const match of text.matchAll(regex)) {
            if (match[0].length > 0) {
                ranges.push([match.index, match.index + match[0].length]);
            }
        }
    }
    ranges.sort((a, b) => a[0] - b[0]);

    // 合并重叠和相邻区间，保留原文顺序并去重。
    const merged = [];
    for (const range of ranges) {
        const previous = merged[merged.length - 1];
        if (previous && range[0] <= previous[1]) {
            previous[1] = Math.max(previous[1], range[1]);
        } else {
            merged.push(range);
        }
    }

    const parts = [];
    let cursor = 0;
    for (const [start, end] of merged) {
        parts.push(mode === 'keep' ? text.slice(start, end) : text.slice(cursor, start));
        cursor = end;
    }
    if (mode === 'remove') parts.push(text.slice(cursor));
    if (!text.includes('\uE000')) return parts.join('');

    // 插画占位符不受清洗影响：被删掉或没被保留的占位符按原位置补回。
    const pieces = [];
    cursor = 0;
    for (const [start, end] of merged) {
        if (mode === 'keep') pieces.push({ at: start, text: text.slice(start, end) });
        else pieces.push({ at: cursor, text: text.slice(cursor, start) });
        cursor = end;
    }
    if (mode === 'remove') pieces.push({ at: cursor, text: text.slice(cursor) });
    const kept = mode === 'keep' ? merged : (() => {
        const outside = [];
        let from = 0;
        for (const [start, end] of merged) { outside.push([from, start]); from = end; }
        outside.push([from, text.length]);
        return outside;
    })();
    for (const match of text.matchAll(/\uE000\d+\uE001/g)) {
        const at = match.index;
        const inside = kept.some(([start, end]) => at >= start && at + match[0].length <= end);
        if (!inside) pieces.push({ at, text: match[0] });
    }
    pieces.sort((x, y) => x.at - y.at);
    return pieces.map(piece => piece.text).join('')
        // 区间切分时可能把占位符截断，残留的半个符号去掉。
        .replace(/\uE000(?!\d+\uE001)\d*|(?<!\uE000\d+)\uE001/g, '');
}

// 两组规则：有保留规则时先只留下保留组匹配到的内容，再在其中删除删除组匹配到的内容。
export function cleanByGroups(messages, deleteRules = [], keepRules = []) {
    let result = keepRules.length ? cleanMessages(messages, keepRules, 'keep') : messages;
    if (deleteRules.length) result = cleanMessages(result, deleteRules, 'remove');
    return result;
}

// 返回消息浅拷贝，仅清洗正文，保留其他字段及嵌套引用。
export function cleanMessages(messages, rules = [], mode = 'remove') {
    if (!Array.isArray(messages) || !Array.isArray(rules)) {
        throw new TypeError('messages 和 rules 必须是数组');
    }
    if (mode !== 'remove' && mode !== 'keep') {
        throw new TypeError('mode 仅支持 remove 或 keep');
    }
    const regexes = compileRules(rules);
    const result = [];
    for (const message of messages) {
        if (message === null || typeof message !== 'object' || Array.isArray(message)) {
            throw new TypeError('messages 中的消息必须是对象');
        }
        const { mes } = message;
        if (typeof mes !== 'string') {
            throw new TypeError('每条消息的 mes 必须是字符串');
        }
        result.push({ ...message, mes: cleanText(mes, regexes, mode) });
    }
    return result;
}
