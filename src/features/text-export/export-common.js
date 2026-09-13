import { getMessageType } from './filter-messages.js';

export function getMessageLabel(message) {
    return { ai: 'AI：', user: '用户：', system: '系统：' }[getMessageType(message)];
}

export function validateMessages(messages, labelMode) {
    if (!Array.isArray(messages)) {
        throw new TypeError('messages 必须是数组');
    }
    if (labelMode !== 'speaker' && labelMode !== 'plain') {
        throw new TypeError('labelMode 仅支持 speaker 或 plain');
    }
    for (const message of messages) {
        if (message === null || typeof message !== 'object' || Array.isArray(message)) {
            throw new TypeError('messages 中的消息必须是对象');
        }
        if (typeof message.mes !== 'string') {
            throw new TypeError('每条消息的 mes 必须是字符串');
        }
    }
}

export function createExportFilename(characterName, extension, now = new Date()) {
    if (typeof characterName !== 'string' || !characterName.trim()) {
        throw new TypeError('characterName 必须是非空字符串');
    }
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
        throw new TypeError('now 必须是有效的 Date');
    }
    // 沿用 TXT 的本地时间和文件名替换规则。
    const timestamp = String(now.getFullYear()).padStart(4, '0')
        + [now.getMonth() + 1, now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds()]
            .map(value => String(value).padStart(2, '0')).join('')
        + String(now.getMilliseconds()).padStart(3, '0');
    return `${characterName.replace(/[<>:"/\\|?*\u0000-\u001f\u007f-\u009f]/g, '_')}${timestamp}.${extension}`;
}
