export function saveTxt(messages, { format = 'speaker', characterName, download, now = new Date() } = {}) {
    if (!Array.isArray(messages)) {
        throw new TypeError('messages 必须是数组');
    }
    // 空结果无需提供保存参数。
    if (messages.length === 0) return '无内容';

    if (format !== 'speaker' && format !== 'plain') {
        throw new TypeError('format 仅支持 speaker 或 plain');
    }
    if (typeof characterName !== 'string' || !characterName.trim()) {
        throw new TypeError('characterName 必须是非空字符串');
    }
    if (typeof download !== 'function') {
        throw new TypeError('download 必须是函数');
    }
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
        throw new TypeError('now 必须是有效的 Date');
    }

    const lines = [];
    for (const message of messages) {
        if (!message || typeof message.mes !== 'string') {
            throw new TypeError('每条消息的 mes 必须是字符串');
        }
        if (format === 'speaker' && typeof message.name !== 'string') {
            throw new TypeError('带说话人格式要求消息的 name 为字符串');
        }
        // 正文保持原样，只按格式添加实际说话人。
        lines.push(format === 'speaker' ? `${message.name}：${message.mes}` : message.mes);
    }

    // 使用本地时间，毫秒补足三位。
    const timestamp = String(now.getFullYear()).padStart(4, '0')
        + [now.getMonth() + 1, now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds()]
            .map(value => String(value).padStart(2, '0')).join('')
        + String(now.getMilliseconds()).padStart(3, '0');
    const filename = `${characterName.replace(/[<>:"/\\|?*\u0000-\u001f\u007f-\u009f]/g, '_')}${timestamp}.txt`;
    const text = lines.join('\n\n');
    download(text, filename, 'text/plain;charset=utf-8');
    return { filename, text };
}
