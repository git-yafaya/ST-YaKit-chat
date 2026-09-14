import { getMessageType } from './filter-messages.js';
import { createExportFilename } from './export-common.js';

export function saveTxt(messages, { format = 'speaker', characterName, download, now = new Date(), fileName = '' } = {}) {
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
        // 正文保持原样，按消息类别添加固定标签。
        lines.push(format === 'speaker'
            ? `${{ ai: 'AI', user: '用户', system: '系统' }[getMessageType(message)]}：${message.mes}`
            : message.mes);
    }

    const filename = createExportFilename(characterName, 'txt', now, fileName);
    const text = lines.join('\n\n');
    download(text, filename, 'text/plain;charset=utf-8');
    return { filename, text };
}
