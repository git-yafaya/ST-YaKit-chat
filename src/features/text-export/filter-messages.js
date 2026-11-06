const SYSTEM_MESSAGE_TYPES = new Set([
    'help', 'welcome', 'empty', 'generic', 'narrator', 'comment', 'slash_commands',
    'formatting', 'hotkeys', 'macros', 'welcome_prompt', 'assistant_note', 'assistant_message',
]);

// 隐藏标记不改变说话方；旁白优先，宿主具名回复和助手问候仍归 AI。
export function getMessageType(message) {
    const type = message.extra?.type;
    if (type === 'narrator') return 'system';
    if (message.is_user) return 'user';
    if (type === 'assistant_message' || (type === 'comment' && message.is_name)) return 'ai';
    return SYSTEM_MESSAGE_TYPES.has(type) ? 'system' : 'ai';
}

// 按宿主标记筛选消息，保留原顺序和消息对象；系统消息和旁白一律不导出。
export function filterMessages(messages, types = { ai: true, user: true }) {
    if (!Array.isArray(messages)) {
        throw new TypeError('messages 必须是数组');
    }
    if (types === null || typeof types !== 'object' || Array.isArray(types)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(types))) {
        throw new TypeError('types 必须是消息类型开关对象');
    }
    // 旧版调用可能还带 system 开关，接受但不再生效。
    for (const key of Reflect.ownKeys(types)) {
        if (!['ai', 'user', 'system'].includes(key) || typeof types[key] !== 'boolean') {
            throw new TypeError('types 仅支持 ai、user 布尔开关');
        }
    }
    const enabled = key => key !== 'system' && Object.hasOwn(types, key) && types[key] === true;
    if (!['ai', 'user'].some(enabled)) {
        throw new Error('请至少选择一种消息类型');
    }

    return messages.filter(message => {
        if (message === null || typeof message !== 'object' || Array.isArray(message)) {
            throw new TypeError('messages 中的消息必须是对象');
        }
        return enabled(getMessageType(message));
    });
}
