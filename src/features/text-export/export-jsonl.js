// 酒馆聊天文件（JSONL）：第一行是聊天头信息，之后每行一条消息；只替换正文，其他字段原样保留。

/**
 * @param {object} context 宿主上下文（读取原始聊天和 chat_metadata）
 * @param {{ floor: number, mes: string }[]} messages 已筛选、清洗的消息，floor 从 1 开始
 */
export function buildChatJsonl(context, messages) {
    const lines = [JSON.stringify({
        chat_metadata: structuredClone(context.chatMetadata ?? {}),
        user_name: 'unused',
        character_name: 'unused',
    })];
    for (const { floor, mes } of messages) {
        const source = context.chat[floor - 1];
        if (!source || typeof source !== 'object') continue;
        const message = structuredClone(source);
        const swipeId = Number.isInteger(message.swipe_id) ? message.swipe_id : 0;
        message.mes = mes;
        // 只保留当前显示的回复：候选只剩这一条，编号归零，按候选编号存的记录跟着改到 0。
        if (Array.isArray(message.swipes)) {
            message.swipes = [mes];
            if (Array.isArray(message.swipe_info)) message.swipe_info = message.swipe_info[swipeId] === undefined ? [] : [message.swipe_info[swipeId]];
            message.swipe_id = 0;
            const bbi = message.extra?.bbiImage;
            if (bbi && typeof bbi === 'object' && !Array.isArray(bbi)) {
                message.extra.bbiImage = bbi[String(swipeId)] === undefined ? {} : { 0: bbi[String(swipeId)] };
            }
        }
        lines.push(JSON.stringify(message));
    }
    return `${lines.join('\n')}\n`;
}
