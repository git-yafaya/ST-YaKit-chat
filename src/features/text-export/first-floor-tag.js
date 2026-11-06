// 首楼标签：把首楼（第 0 层）正文整段包进一个标签，直接写回聊天记录，保留规则就不会把开场白清掉。

const NAME = /^[\p{L}\p{N}_.:-]+$/u;
const escape = name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 正文首尾正好是一对同名标签、中间没有同名标签时，返回 { name, body }，否则 null
export function readWrapper(text) {
    if (typeof text !== 'string') return null;
    const match = /^\s*<([^\s/<>"'=]+)>\n?([\s\S]*?)\n?<\/\1\s*>\s*$/u.exec(text);
    if (!match || !NAME.test(match[1])) return null;
    const [, name, body] = match;
    // 中间还有同名标签，说明首尾不是同一对（如 <a>x</a> 正文 <a>y</a>），不算包裹
    if (new RegExp(`<\\/?${escape(name)}(?=[\\s/>])`, 'iu').test(body)) return null;
    return { name, body };
}

// 去掉原来的包裹再按新标签包上；name 为空就是去掉包裹
export function wrapText(text, name) {
    const body = readWrapper(text)?.body ?? text;
    if (!name) return body;
    if (typeof name !== 'string' || !NAME.test(name)) throw new Error('这个标签名不能用');
    return `<${name}>\n${body}\n</${name}>`;
}

function firstMessage() {
    const context = globalThis.SillyTavern?.getContext?.();
    const message = context?.chat?.[0];
    if (context?.characterId == null || !message || typeof message.mes !== 'string') return { context, message: null };
    return { context, message };
}

// 首楼现在包着的标签名，没包或没有首楼返回空字符串
export function getFirstFloorTag() {
    return readWrapper(firstMessage().message?.mes)?.name ?? '';
}

// 按酒馆自己编辑消息的流程写回：正文、当前开场白分支、界面、事件、保存
export async function setFirstFloorTag(name = '') {
    const { context, message } = firstMessage();
    if (!message) throw new Error('当前聊天没有首楼');
    const text = wrapText(message.mes, name);
    if (text === message.mes) return getFirstFloorTag();
    message.mes = text;
    if (Array.isArray(message.swipes) && Number.isInteger(message.swipe_id)) message.swipes[message.swipe_id] = text;
    context.updateMessageBlock(0, message);
    await context.eventSource.emit(context.eventTypes.MESSAGE_EDITED, 0);
    await context.eventSource.emit(context.eventTypes.MESSAGE_UPDATED, 0);
    await context.saveChat();
    return getFirstFloorTag();
}
