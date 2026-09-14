import { getAssistantSelection } from '../assistant-management/index.js';
import { getMainClient } from '../text-export/ai-client.js';

export { getAssistant, setAssistant } from '../assistant-management/index.js';

export async function resolveAssistant(kind) {
    const { api, jailbreak, prompt } = getAssistantSelection(kind);
    // 正则助手只展示破限词，不为这份摘要读取主 API 客户端。
    if (kind === 'regex') return { jailbreak: jailbreak ? { id: jailbreak.id, name: jailbreak.name } : null };
    const usingMainApi = api.source === 'main';
    let model = api.config?.model;
    if (usingMainApi) {
        const context = globalThis.SillyTavern?.getContext?.();
        if (!context) throw new Error('请在酒馆中查看助手配置');
        model = (await getMainClient(context)).model;
    }
    // 界面只需名称与模型，不返回密钥或提示词正文。
    return {
        profile: {
            id: usingMainApi ? null : api.config.id,
            name: usingMainApi ? '主 API（跟随ST）' : api.config.name,
            model,
            usingMainApi,
        },
        jailbreak: jailbreak ? { id: jailbreak.id, name: jailbreak.name } : null,
        ...(kind === 'polish' ? { prompt: prompt ? { id: prompt.id, name: prompt.name } : null } : {}),
    };
}
