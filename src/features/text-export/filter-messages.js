// 系统标记和旁白优先于用户标记，兼容宿主的真假值。
export function getMessageType(message) {
    return message.is_system || message.extra?.type === 'narrator'
        ? 'system'
        : message.is_user ? 'user' : 'ai';
}

// 按宿主标记筛选消息，保留原顺序和消息对象。
export function filterMessages(messages, types = { ai: true, user: true, system: true }) {
    if (!Array.isArray(messages)) {
        throw new TypeError('messages 必须是数组');
    }
    if (types === null || typeof types !== 'object' || Array.isArray(types)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(types))) {
        throw new TypeError('types 必须是消息类型开关对象');
    }
    for (const key of Reflect.ownKeys(types)) {
        if (!['ai', 'user', 'system'].includes(key) || typeof types[key] !== 'boolean') {
            throw new TypeError('types 仅支持 ai、user、system 布尔开关');
        }
    }
    const enabled = key => Object.hasOwn(types, key) && types[key] === true;
    if (!['ai', 'user', 'system'].some(enabled)) {
        throw new Error('请至少选择一种消息类型');
    }

    return messages.filter(message => {
        if (message === null || typeof message !== 'object' || Array.isArray(message)) {
            throw new TypeError('messages 中的消息必须是对象');
        }
        return enabled(getMessageType(message));
    });
}
