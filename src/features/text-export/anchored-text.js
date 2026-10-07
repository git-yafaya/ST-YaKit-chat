import { TOKEN_PATTERN, stripTokens } from './illustrations.js';

export const matchingText = stripTokens;

// 锚点始终是两个文字片段之间的边界；编辑只能写文字片段，不能删除或复制边界。
export function editAnchoredText(text, edits) {
    if (!edits.length) return text;
    const pieces = text.split(/(\uE000\d+\uE001)/g);
    const slots = pieces.filter((_, index) => index % 2 === 0);
    const offsets = [];
    let length = 0;
    for (const slot of slots) {
        offsets.push(length);
        length += slot.length;
    }
    const plain = slots.join('');
    const output = slots.map(() => '');
    // 同一文字坐标上的空串匹配只执行一次，写在该处所有锚点之后。
    const slotAt = position => offsets.findLastIndex(offset => offset <= position);
    const appendRange = (start, end, minimum = 0, maximum = slots.length - 1) => {
        let lastSlot = minimum;
        for (let index = 0; index < slots.length; index++) {
            const from = Math.max(start, offsets[index]);
            const to = Math.min(end, offsets[index] + slots[index].length);
            if (from >= to) continue;
            lastSlot = Math.max(lastSlot, Math.min(index, maximum));
            output[lastSlot] += plain.slice(from, to);
        }
        return lastSlot;
    };
    let cursor = 0;
    for (const { start, end, parts = [] } of edits) {
        appendRange(cursor, start);
        let slot = slotAt(start);
        // 非空匹配的末端不占用后面紧邻的锚点边界。
        const lastSlot = start === end ? slot : slotAt(end - 1);
        for (const part of parts) {
            if (typeof part === 'string') output[slot] += part;
            else slot = appendRange(part.start, part.end, slot, lastSlot);
        }
        cursor = end;
    }
    appendRange(cursor, length);
    return pieces.map((piece, index) => index % 2 === 0 ? output[index / 2] : piece).join('');
}

// 替换文字按原生 $ 语法展开；原文引用保留来源区间，才能让 {{match}} 中的图留在文字之间。
function replacementParts(to, match, text) {
    const parts = [];
    const start = match.index;
    const end = start + match[0].length;
    const reference = range => {
        if (!range) return '';
        const [from, until] = range;
        return from >= start && until <= end ? { start: from, end: until } : text.slice(from, until);
    };
    let cursor = 0;
    for (const substitution of to.matchAll(/\$(\$|&|`|'|<[^>]*>|\d{1,2})/g)) {
        parts.push(to.slice(cursor, substitution.index));
        const key = substitution[1];
        let part = substitution[0];
        let suffix = '';
        if (key === '$') part = '$';
        else if (key === '&') part = reference([start, end]);
        else if (key === '`') part = text.slice(0, start);
        else if (key === "'") part = text.slice(end);
        else if (key.startsWith('<')) {
            if (match.groups !== undefined) part = reference(match.indices.groups[key.slice(1, -1)]);
        } else {
            let group = Number(key);
            if (group >= match.length && key.length === 2) {
                group = Number(key[0]);
                suffix = key[1];
            }
            if (group > 0 && group < match.length) part = reference(match.indices[group]);
            else suffix = '';
        }
        parts.push(part, suffix);
        cursor = substitution.index + substitution[0].length;
    }
    parts.push(to.slice(cursor));
    return parts;
}

export function replaceAnchoredText(text, regex, to) {
    if (!text.match(TOKEN_PATTERN)) return text.replace(regex, to);
    const plain = matchingText(text);
    // d 提供捕获组原区间；matchAll 负责推进零长度匹配。
    const indexed = new RegExp(regex.source, regex.flags.includes('d') ? regex.flags : `${regex.flags}d`);
    const edits = [...plain.matchAll(indexed)].map(match => ({
        start: match.index,
        end: match.index + match[0].length,
        parts: replacementParts(to, match, plain),
    }));
    return editAnchoredText(text, edits);
}
