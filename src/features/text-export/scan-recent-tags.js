const ATTRIBUTE = String.raw`(?:[^<>"']|"[^"]*"|'[^']*')`;
const TOKEN = String.raw`<\/?[^\s/<>"'=]+(?:\s+${ATTRIBUTE}*)?\/?>`;
const NAME = /^[\p{L}\p{N}_.:-]+$/u;

function pieces(name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const start = String.raw`<${escaped}(?=[\s/>])(?:\s+${ATTRIBUTE}*)?`;
    return { start, open: `${start}(?<!/)>`, close: String.raw`<\/${escaped}\s*>`, selfClose: `${start}/>` };
}

// 整块（含标签本身），删除组用
function tagRule(name) {
    const { open, close, selfClose } = pieces(name);
    // ponytail: 同名嵌套只取最内层完整块；需整棵删除时应改用解析器。
    const body = String.raw`(?:(?!(?:${open}|${close}))${TOKEN}|(?!${TOKEN})[\s\S])*`;
    return new RegExp(`${selfClose}|${open}${body}${close}`, 'gi').toString();
}

// 只要标签里面的内容（不含标签本身），保留组用：点一下就是「只保留这个标签里的正文」
function innerTagRule(name) {
    const { open, close } = pieces(name);
    const body = String.raw`(?:(?!(?:${open}|${close}))${TOKEN}|(?!${TOKEN})[\s\S])*`;
    return new RegExp(`(?<=${open})${body}(?=${close})`, 'gi').toString();
}

// 只去掉标签本身、里面的正文留着：开、闭、自闭合各一条，替换成空即可
function shellRules(name) {
    const { open, close, selfClose } = pieces(name);
    return [open, close, selfClose].map(pattern => new RegExp(pattern, 'gi').toString());
}

function tokenInfo(raw) {
    const [, closing, sourceName] = /^<(\/?)([^\s/<>"'=]+)/.exec(raw);
    if (!NAME.test(sourceName)) return null;
    // 仅合并 /i 能识别的大小写，避免特殊字母转小写后匹配不到原文。
    const name = sourceName.replace(/\p{L}/gu, letter => {
        const lower = letter.toLowerCase();
        return new RegExp(lower, 'i').test(letter) ? lower : letter;
    });
    return {
        name,
        closing: Boolean(closing),
        selfClose: raw.endsWith('/>'),
        tail: raw.slice(sourceName.length + 2).trim(),
    };
}

// 手动输入标签名时用：给出和识别结果一样的三套规则，名字不合法返回 null。
export function tagRules(name) {
    if (typeof name !== 'string') return null;
    const clean = name.trim().replace(/^<\/?/, '').replace(/\/?>$/, '').trim();
    if (!NAME.test(clean)) return null;
    return {
        name: clean,
        label: `<${clean}>`,
        count: 0,
        floors: 0,
        rule: tagRule(clean),
        innerRule: innerTagRule(clean),
        shellRules: shellRules(clean),
        children: [],
    };
}

/* ---------- 嵌套结构 ---------- */

function makeNode(name) {
    return { name, count: 0, paired: false, first: Infinity, floors: new Set(), children: new Map() };
}

function childOf(parent, name) {
    if (!parent.children.has(name)) parent.children.set(name, makeNode(name));
    return parent.children.get(name);
}

function record(node, floor, position, paired) {
    node.count++;
    node.paired = node.paired || paired;
    node.first = Math.min(node.first, position);
    node.floors.add(floor);
}

// 用栈跟住当前所在的标签，闭合时才算数：未闭合的开始标签不计数，里面成对的子标签照样保留。
function scanInto(root, text, floor, offset) {
    const stack = [{ name: null, node: root }];
    for (const token of text.matchAll(new RegExp(TOKEN, 'g'))) {
        const info = tokenInfo(token[0]);
        if (!info) continue;
        const parent = stack[stack.length - 1].node;
        if (info.closing) {
            if (info.tail !== '>') continue;
            let index = -1;
            for (let level = stack.length - 1; level > 0; level--) {
                if (stack[level].name === info.name) { index = level; break; }
            }
            if (index < 0) continue;
            record(stack[index].node, floor, stack[index].at, true);
            stack.length = index;
        } else if (info.selfClose) {
            record(childOf(parent, info.name), floor, offset + token.index, false);
        } else {
            stack.push({ name: info.name, node: childOf(parent, info.name), at: offset + token.index });
        }
    }
}

function merge(map, node) {
    const existing = map.get(node.name);
    if (!existing) { map.set(node.name, node); return; }
    existing.count += node.count;
    existing.paired = existing.paired || node.paired;
    existing.first = Math.min(existing.first, node.first);
    for (const floor of node.floors) existing.floors.add(floor);
    for (const child of node.children.values()) merge(existing.children, child);
}

// 没配上对的一层不显示，它下面成对的子标签上提一层，同名合并。
function collapse(children) {
    const result = new Map();
    for (const node of children.values()) {
        const kids = collapse(node.children);
        if (node.count === 0) {
            for (const kid of kids.values()) merge(result, kid);
            continue;
        }
        node.children = kids;
        merge(result, node);
    }
    return result;
}

function finalize(children) {
    return [...children.values()].sort((a, b) => a.first - b.first).map(node => ({
        name: node.name,
        label: `<${node.name}${node.paired ? '' : '/'}>`,
        count: node.count,
        floors: node.floors.size,
        rule: tagRule(node.name),
        innerRule: innerTagRule(node.name),
        shellRules: shellRules(node.name),
        children: finalize(node.children),
    }));
}

// 扫描多层原文，返回标签的嵌套结构：同名兄弟合并成一项，count 是出现次数，floors 是出现在多少层。
export async function scanTagTree(texts = []) {
    if (!Array.isArray(texts)) throw new TypeError('标签扫描原文必须是数组');
    const root = { children: new Map() };
    let offset = 0;
    for (const [index, text] of texts.entries()) {
        if (typeof text === 'string') {
            scanInto(root, text, index, offset);
            offset += text.length + 1;
        }
        // 楼层很多时分批让出主线程，界面不卡住。
        if (index % 200 === 199) await new Promise(resolve => setTimeout(resolve, 0));
    }
    return finalize(collapse(root.children));
}
