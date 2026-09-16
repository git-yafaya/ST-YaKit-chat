const ATTRIBUTE = String.raw`(?:[^<>"']|"[^"]*"|'[^']*')`;
const TOKEN = String.raw`<\/?[^\s/<>"'=]+(?:\s+${ATTRIBUTE}*)?\/?>`;
const NAME = /^[\p{L}\p{N}_.:-]+$/u;

// 整块（含标签本身），删除组用
function tagRule(name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const start = String.raw`<${escaped}(?=[\s/>])(?:\s+${ATTRIBUTE}*)?`;
    const open = `${start}(?<!/)>`;
    const close = String.raw`<\/${escaped}\s*>`;
    const selfClose = `${start}/>`;
    // ponytail: 同名嵌套只取最内层完整块；需整棵删除时应改用解析器。
    const body = String.raw`(?:(?!(?:${open}|${close}))${TOKEN}|(?!${TOKEN})[\s\S])*`;
    return new RegExp(`${selfClose}|${open}${body}${close}`, 'gi').toString();
}

// 只要标签里面的内容（不含标签本身），保留组用：点一下就是「只保留这个标签里的正文」
function innerTagRule(name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const start = String.raw`<${escaped}(?=[\s/>])(?:\s+${ATTRIBUTE}*)?`;
    const open = `${start}(?<!/)>`;
    const close = String.raw`<\/${escaped}\s*>`;
    const body = String.raw`(?:(?!(?:${open}|${close}))${TOKEN}|(?!${TOKEN})[\s\S])*`;
    return new RegExp(`(?<=${open})${body}(?=${close})`, 'gi').toString();
}

// 每层分别配对，按第一次有效开始标签的位置去重排序。
export function scanTags(texts = []) {
    if (!Array.isArray(texts)) throw new TypeError('标签扫描原文必须是数组');
    const found = new Map();
    let offset = 0;
    function record(name, position, paired) {
        const previous = found.get(name);
        found.set(name, {
            position: Math.min(previous?.position ?? position, position),
            paired: Boolean(previous?.paired || paired),
        });
    }
    for (const text of texts) {
        if (typeof text !== 'string') continue;
        const openings = new Map();
        for (const token of text.matchAll(new RegExp(TOKEN, 'g'))) {
            const [, closing, sourceName] = /^<(\/?)([^\s/<>"'=]+)/.exec(token[0]);
            if (!NAME.test(sourceName)) continue;
            // 仅合并 /i 能识别的大小写，避免特殊字母转小写后匹配不到原文。
            const name = sourceName.replace(/\p{L}/gu, letter => {
                const lower = letter.toLowerCase();
                return new RegExp(lower, 'i').test(letter) ? lower : letter;
            });
            if (closing) {
                if (token[0].slice(sourceName.length + 2).trim() !== '>') continue;
                const position = openings.get(name)?.pop();
                if (position !== undefined) record(name, position, true);
            } else if (token[0].endsWith('/>')) {
                record(name, offset + token.index, false);
            } else {
                if (!openings.has(name)) openings.set(name, []);
                openings.get(name).push(offset + token.index);
            }
        }
        offset += text.length + 1;
    }
    return [...found.entries()].sort((a, b) => a[1].position - b[1].position)
        .map(([name, { paired }]) => ({ label: `<${name}${paired ? '' : '/'}>`, rule: tagRule(name), innerRule: innerTagRule(name) }));
}
