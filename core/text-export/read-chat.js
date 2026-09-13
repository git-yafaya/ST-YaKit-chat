// 读取当前单人聊天，返回独立的消息快照。
export function readChat(context, range = 'all') {
    if (context.groupId != null) {
        throw new Error('仅支持单人聊天');
    }

    const { chat, characterId } = context;
    // 未选角色时，宿主仍可能放入欢迎消息；索引 0 是有效角色。
    if (characterId == null || chat.length === 0) {
        return [];
    }

    let start = 1;
    let end = chat.length;
    if (range !== 'all') {
        if (range === null || typeof range !== 'object' || Array.isArray(range)) {
            throw new TypeError('range 必须为 all 或 {start, end}');
        }
        ({ start = 1, end = chat.length } = range);
        if (!Number.isInteger(start) || !Number.isInteger(end)) {
            throw new TypeError('起止楼层必须为整数');
        }
        if (start > end) {
            [start, end] = [end, start];
        }
        // 先交换，再把两个端点分别夹到有效楼层内。
        start = Math.min(chat.length, Math.max(1, start));
        end = Math.min(chat.length, Math.max(1, end));
    }

    return chat.slice(start - 1, end).map((message, index) => ({
        floor: start + index,
        name: message.name,
        mes: message.mes,
        is_user: Boolean(message.is_user),
        is_system: Boolean(message.is_system),
        // 保留旁白类型，供后续消息筛选识别系统提示。
        extra: { type: message.extra?.type },
    }));
}
