import { getMessageLabel, validateMessages } from './export-common.js';

export function buildMarkdown(messages, labelMode = 'speaker') {
    validateMessages(messages, labelMode);
    // 正文原样拼接，只给类别标签加粗；AI 没有标注就不加粗。
    return messages.map((message) => {
        const label = labelMode === 'speaker' ? getMessageLabel(message) : '';
        return label ? `**${label}**${message.mes}` : message.mes;
    }).join('\n\n');
}
