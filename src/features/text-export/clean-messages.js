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
    return parts.join('');
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
