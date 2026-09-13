import { readChat } from './features/text-export/read-chat.js';
import { filterMessages } from './features/text-export/filter-messages.js';
import { saveTxt as saveTextFile } from './features/text-export/export-txt.js';

function getContext() {
    if (!globalThis.SillyTavern?.getContext) {
        throw new Error('请在 SillyTavern 中调用');
    }
    return globalThis.SillyTavern.getContext();
}

export function readCurrentChat(range = 'all') {
    return readChat(getContext(), range);
}

export { filterMessages };

export async function saveTxt(messages, format = 'speaker') {
    if (Array.isArray(messages) && messages.length === 0) {
        return '无内容';
    }
    const context = getContext();
    if (context.groupId != null) {
        throw new Error('仅支持单人聊天');
    }
    const characterName = context.characters[context.characterId]?.name;
    // 按调用时的角色命名，复用宿主现有下载能力。
    const { download } = await import('/scripts/utils.js');
    return saveTextFile(messages, { format, characterName, download });
}

// 控制台入口，不注册界面或修改宿主聊天。
globalThis.YaKitChat = Object.freeze({
    version: '0.1.0',
    readCurrentChat,
    filterMessages,
    saveTxt,
});
