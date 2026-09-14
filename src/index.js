import { readChat } from './features/text-export/read-chat.js';
import { filterMessages } from './features/text-export/filter-messages.js';
import { cleanMessages } from './features/text-export/clean-messages.js';
import { saveTxt as saveTextFile } from './features/text-export/export-txt.js';
import { saveExport, getEpubPreferences, saveEpubPreferences } from './features/text-export/save-export.js';
import * as apiManagement from './features/api-management/index.js';
import * as promptManagement from './features/prompt-management/index.js';
import { exportUI } from './features/text-export/export-ui.js';
import { initPanelUI } from './ui/panel/index.js';

function getContext() {
    if (!globalThis.SillyTavern?.getContext) {
        throw new Error('请在 SillyTavern 中调用');
    }
    return globalThis.SillyTavern.getContext();
}

export function readCurrentChat(range = 'all') {
    return readChat(getContext(), range);
}

export { filterMessages, cleanMessages, saveExport, getEpubPreferences, saveEpubPreferences };
export * from './features/api-management/index.js';
export * from './features/prompt-management/index.js';

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

// 控制台和界面共用同一组已验收接口。
globalThis.YaKitChat = Object.freeze({
    version: '0.2.0',
    exportUI,
    readCurrentChat,
    filterMessages,
    cleanMessages,
    saveTxt,
    saveExport,
    getEpubPreferences,
    saveEpubPreferences,
    ...apiManagement,
    ...promptManagement,
});

if (typeof document !== 'undefined') {
    initPanelUI(globalThis.YaKitChat, getContext);
}
