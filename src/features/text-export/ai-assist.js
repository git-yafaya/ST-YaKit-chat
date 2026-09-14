import { getAssistantSelection } from '../assistant-management/index.js';
import { resolveAssistant } from '../api-ui/assistants.js';
import { getMainClient, generateSecondary } from './ai-client.js';
import { buildRuleMessages, parseRuleSuggestions } from './ai-rules.js';

function getContext() {
    const context = globalThis.SillyTavern?.getContext?.();
    if (!context) throw new Error('请在酒馆中使用 AI 辅助');
    return context;
}

export async function getAiContext() {
    try {
        const { profile, jailbreak, prompt } = await resolveAssistant('regex');
        return {
            apiName: profile.name,
            model: profile.model,
            usingMainApi: profile.usingMainApi,
            jailbreakName: jailbreak?.name ?? null,
            constraintName: prompt?.name ?? null,
        };
    } catch {
        throw new Error('无法读取当前 API 和提示词，请检查 API 管理设置后重试');
    }
}

export async function suggestRules(options) {
    if (!options || typeof options !== 'object' || Array.isArray(options)
        || typeof options.request !== 'string' || !options.request.trim()) {
        throw new Error('请先说明想删除或保留什么内容');
    }
    if (!['delete', 'keep'].includes(options.mode)) throw new Error('请选择删除匹配或只保留匹配');
    if (!Array.isArray(options.rules) || Array.from(options.rules).some(rule => typeof rule !== 'string')) {
        throw new Error('已有规则内容不对，请重新打开 AI 辅助');
    }
    const context = getContext();
    if (context.groupId != null) throw new Error('仅支持单人聊天');
    if (context.characterId == null || !Array.isArray(context.chat)) throw new Error('请先在酒馆里打开一个聊天');
    if (!context.chat.length) throw new Error('当前聊天没有可参考的内容');
    // 在等待模型之前固定选择、原文和规则，后续界面改动不影响本次请求。
    const { api, jailbreak, prompt: constraint } = getAssistantSelection('regex');
    const rules = [...options.rules];
    const first = Math.max(0, context.chat.length - 2);
    const samples = context.chat.slice(first).map((message, index) => ({
        floor: first + index, text: typeof message?.mes === 'string' ? message.mes : '',
    }));
    const messages = buildRuleMessages({ request: options.request.trim(), mode: options.mode, rules, samples, jailbreak, constraint });
    const controller = new AbortController();
    const timeoutMessage = '等了 60 秒还没生成规则，请检查当前 API 后重试';
    let timer;
    const expired = new Promise((_, reject) => {
        timer = setTimeout(() => {
            controller.abort();
            reject(new Error(timeoutMessage));
        }, 60000);
    });
    let text;
    try {
        const generate = async () => {
            if (api.source === 'secondary') return generateSecondary(api.config, messages, controller.signal);
            const client = await getMainClient(context);
            controller.signal.throwIfAborted();
            return client.generate(messages, controller.signal);
        };
        text = await Promise.race([generate(), expired]);
    } catch {
        if (controller.signal.aborted) throw new Error(timeoutMessage);
        throw new Error('AI 请求失败，请检查当前 API 的连接和额度后重试');
    } finally {
        clearTimeout(timer);
    }
    return parseRuleSuggestions(text, rules);
}
