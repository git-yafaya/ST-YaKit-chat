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

// 替换组：按顺序依次替换，和酒馆的正则替换一致；替换文字里的 $1、$& 照正则规则展开。
export function replaceMessages(messages, replacements = []) {
    if (!Array.isArray(messages) || !Array.isArray(replacements)) throw new TypeError('messages 和 replacements 必须是数组');
    if (!replacements.length) return messages;
    const compiled = [];
    for (const rule of replacements) {
        if (rule === null || typeof rule !== 'object' || Array.isArray(rule)) throw new TypeError('replacements 中的规则必须是对象');
        const { pattern, flags = '', to } = rule;
        if (typeof pattern !== 'string' || typeof flags !== 'string' || typeof to !== 'string') {
            throw new TypeError('替换规则的 pattern、flags 和 to 必须是字符串');
        }
        try {
            compiled.push([new RegExp(pattern, flags.includes('g') ? flags : `${flags}g`), to]);
        } catch (error) {
            if (!(error instanceof SyntaxError)) throw error;
        }
    }
    return messages.map(message => {
        if (message === null || typeof message !== 'object' || Array.isArray(message)) throw new TypeError('messages 中的消息必须是对象');
        if (typeof message.mes !== 'string') throw new TypeError('每条消息的 mes 必须是字符串');
        let text = message.mes;
        for (const [regex, to] of compiled) text = text.replace(regex, to);
        return { ...message, mes: text };
    });
}

// 清洗后收尾：删掉的地方留下的空行并成一个，正文首尾的空行去掉，段落之间不粘连也不空一大片。
function tidyBlankLines(messages) {
    return messages.map(message => ({
        ...message,
        mes: message.mes
            .replace(/[^\S\n]*\n(?:[^\S\n]*\n)+[^\S\n]*/g, '\n\n')
            .replace(/^\s+|\s+$/g, ''),
    }));
}

const COMMENT_PATTERN = /<!--([\s\S]*?)-->/g;

// 数 HTML 注释（<!-- … -->）有几处，没闭合的开头不算。
export function countComments(messages) {
    if (!Array.isArray(messages)) throw new TypeError('messages 必须是数组');
    return messages.reduce((total, message) => total + (typeof message?.mes === 'string' ? [...message.mes.matchAll(COMMENT_PATTERN)].length : 0), 0);
}

// HTML 注释：strip 整个去掉，unwrap 只去掉 <!-- 和 -->、留下里面的文字，keep 原样保留。
// 没有消息真的变化时返回原数组。
export function handleComments(messages, mode = 'keep') {
    if (!['strip', 'unwrap', 'keep'].includes(mode)) throw new TypeError('注释处理方式不受支持');
    if (!Array.isArray(messages)) throw new TypeError('messages 必须是数组');
    if (mode === 'keep') return messages;
    let changed = false;
    const result = messages.map(message => {
        if (typeof message?.mes !== 'string' || !message.mes.includes('<!--')) return message;
        const mes = message.mes.replace(COMMENT_PATTERN, mode === 'strip' ? '' : (_, inner) => inner);
        if (mes === message.mes) return message;
        changed = true;
        return { ...message, mes };
    });
    return changed ? result : messages;
}

// 三组规则：先按保留组只留下匹配到的内容，再按替换组依次替换，最后删除删除组匹配到的内容。
// 规则都处理完后再按 comments 处理 HTML 注释，规则里仍能用注释定位正文。
export function cleanByGroups(messages, deleteRules = [], keepRules = [], replaceRules = [], { comments = 'keep' } = {}) {
    let result = keepRules.length ? cleanMessages(messages, keepRules, 'keep') : messages;
    if (replaceRules.length) result = replaceMessages(result, replaceRules);
    if (deleteRules.length) result = cleanMessages(result, deleteRules, 'remove');
    result = handleComments(result, comments);
    // 没有任何规则、注释也没动时是原文导出，不动格式。
    return result === messages ? result : tidyBlankLines(result);
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
