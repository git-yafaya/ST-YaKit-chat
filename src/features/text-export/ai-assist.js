import { getAssistantSelection } from '../assistant-management/index.js';
import { getMainClient, generateSecondary } from './ai-client.js';
import { buildRuleMessages, parseRuleSuggestions } from './ai-rules.js';
import { getMessageType } from './filter-messages.js';
import { getRequestSettings, withRequestTimeout } from '../../shared/ai-request.js';

let activeRun = null;

function getContext() {
    const context = globalThis.SillyTavern?.getContext?.();
    if (!context) throw new Error('请在酒馆中使用 AI 辅助');
    return context;
}

export async function getAiContext() {
    try {
        const { api, jailbreak } = getAssistantSelection('regex');
        const usingMainApi = api.source === 'main';
        const model = usingMainApi ? (await getMainClient(getContext())).model : api.config.model;
        return {
            apiName: usingMainApi ? '主 API（跟随ST）' : api.config.name,
            model,
            usingMainApi,
            jailbreakName: jailbreak?.name ?? null,
        };
    } catch {
        throw new Error('无法读取当前 API 和提示词，请检查 API 管理设置后重试');
    }
}

export function cancelSuggestRules() {
    if (!activeRun) return;
    const run = activeRun;
    activeRun = null;
    const error = new Error('已停止生成');
    error.code = 'AI_CANCELLED';
    run.abort(error);
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
    if (context.characterId == null || !Array.isArray(context.chat)) throw new Error('请先在酒馆里打开一个聊天');
    const floor = context.chat.findLastIndex(message => message && !message.is_system && getMessageType(message) === 'ai');
    if (floor < 0) throw new Error('当前聊天没有可参考的 AI 回复');
    if (typeof context.chat[floor].mes !== 'string') throw new Error('这条 AI 回复没有可读取的正文');
    // 在等待模型之前固定选择、原文和规则，后续界面改动不影响本次请求。
    const { api, jailbreak } = getAssistantSelection('regex');
    const rules = [...options.rules];
    const sample = { floor, text: context.chat[floor].mes };
    const messages = buildRuleMessages({ request: options.request.trim(), mode: options.mode, rules, sample, jailbreak });
    const { timeoutSeconds, retries } = getRequestSettings();
    const timeoutMessage = `等了 ${timeoutSeconds} 秒还没生成规则，请检查当前 API 后重试`;
    // 新请求校验成功后才替换旧请求，一个父信号覆盖准备和全部格式重试。
    cancelSuggestRules();
    const run = new AbortController();
    activeRun = run;
    let client;
    try {
        for (let attempt = 0; attempt <= retries; attempt++) {
            run.signal.throwIfAborted();
            let text;
            try {
                text = await withRequestTimeout(async signal => {
                    if (api.source === 'secondary') return generateSecondary(api.config, messages, signal);
                    client ??= await getMainClient(context);
                    signal.throwIfAborted();
                    return client.generate(messages, signal);
                }, timeoutSeconds, timeoutMessage, run.signal);
            } catch (error) {
                if (error?.code === 'AI_TIMEOUT' || error?.code === 'AI_CANCELLED') throw error;
                if (error?.code === 'AI_RULE_FORMAT') text = '';
                else throw new Error('AI 请求失败，请检查当前 API 的连接和额度后重试');
            }
            run.signal.throwIfAborted();
            try {
                return parseRuleSuggestions(text, rules);
            } catch (error) {
                // 只重试回复格式问题，沿用同一份消息和接口快照。
                if (error?.code !== 'AI_RULE_FORMAT' || attempt === retries) throw error;
            }
        }
    } finally {
        if (activeRun === run) activeRun = null;
    }
}
