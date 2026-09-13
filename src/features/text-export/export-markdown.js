import { getMessageLabel, validateMessages } from './export-common.js';

export function buildMarkdown(messages, labelMode = 'speaker') {
    validateMessages(messages, labelMode);
    // 正文原样拼接，只给类别标签加粗。
    return messages.map(message => labelMode === 'speaker'
        ? `**${getMessageLabel(message)}**${message.mes}`
        : message.mes).join('\n\n');
}
