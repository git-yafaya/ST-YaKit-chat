import { listCorePrompts } from '../api-ui/core-prompts.js';
import { getAssistantSelection } from '../assistant-management/index.js';
import { getMainClient, generateSecondary } from '../text-export/ai-client.js';
import { buildAssistantTask } from '../../shared/assistant-prompts.js';
import { getRequestSettings, withRequestTimeout } from '../../shared/ai-request.js';

export async function getContext() {
    try {
        const { api, jailbreak, prompt } = getAssistantSelection('polish');
        const usingMainApi = api.source === 'main';
        const model = usingMainApi
            ? (await getMainClient(globalThis.SillyTavern?.getContext?.())).model : api.config.model;
        return {
            apiName: usingMainApi ? '主 API（跟随ST）' : api.config.name,
            model, usingMainApi, jailbreakName: jailbreak?.name ?? null,
            styleName: prompt?.content?.trim() ? prompt.name : null,
        };
    } catch {
        throw new Error('无法读取当前 API 和提示词，请检查 API 管理设置后重试');
    }
}

function parseFloors(response, floors) {
    const completed = [];
    let rest = typeof response?.text === 'string' ? response.text.trimStart() : '';
    const length = response?.finishReason === 'length';
    const invalid = () => Object.assign(new Error('AI 返回的楼层标记、编号或正文不正确，请重新润色这一段'), { code: 'AI_POLISH_FORMAT' });
    for (const { floor } of floors) {
        const open = `<floor n="${floor}">`;
        // 标签只写了一半也保留前缀；完全缺楼仍需 length 作为依据。
        if ((!rest && length) || (rest && open.startsWith(rest))) return { completed, resumeFloor: floor };
        if (!rest.startsWith(open)) throw invalid();
        const body = rest.slice(open.length);
        const end = body.indexOf('</floor>');
        if (end < 0) {
            // 最后一楼未闭合也视为截断，但不能跳楼或嵌套楼层。
            if (/<\/?floor\b/u.test(body)) throw invalid();
            return { completed, resumeFloor: floor };
        }
        const text = body.slice(0, end);
        if (!text.trim() || /<\/?floor\b/u.test(text)) throw invalid();
        completed.push({ floor, text });
        rest = body.slice(end + '</floor>'.length).trimStart();
    }
    if (rest) throw invalid();
    return { completed, resumeFloor: null };
}

function checkCancelled(signal) {
    if (signal?.aborted) throw Object.assign(new Error('已停止生成'), { code: 'AI_CANCELLED' });
}

async function waitForLimit(seconds, signal, onWait) {
    checkCancelled(signal);
    onWait?.(Date.now() + seconds * 1000);
    try {
        await new Promise((resolve, reject) => {
            const finish = () => { signal?.removeEventListener('abort', abort); resolve(); };
            const abort = () => {
                clearTimeout(timer);
                signal?.removeEventListener('abort', abort);
                reject(Object.assign(new Error('已停止生成'), { code: 'AI_CANCELLED' }));
            };
            const timer = setTimeout(finish, seconds * 1000);
            signal?.addEventListener('abort', abort, { once: true });
            if (signal?.aborted) abort();
        });
    } finally {
        onWait?.(null);
    }
}

export function createGenerator(context) {
    // 接口和请求参数固定；文风与固定提示词在每次请求前读取。
    const { api, sampling } = structuredClone(getAssistantSelection('polish'));
    const { timeoutSeconds, retries } = getRequestSettings();
    const host = { ...context };
    let clientPromise;
    return async function generate(floors, previousTail, signal, onWait, limitBudget = { waitedSeconds: 0 }, references = []) {
        checkCancelled(signal);
        if (!Array.isArray(floors) || !floors.length || floors.some((item, index) => !Number.isInteger(item?.floor)
            || item.floor < 0 || typeof item.text !== 'string' || !item.text.trim()
            || (index > 0 && item.floor <= floors[index - 1].floor))) {
            throw new Error('这一段没有可润色的正文');
        }
        floors = floors.map(({ floor, text }) => ({ floor, text }));
        const buildMessages = () => {
            const { jailbreak, prompt } = getAssistantSelection('polish');
            const messages = [];
            if (jailbreak?.content?.trim()) messages.push({ role: 'system', content: jailbreak.content });
            const tail = typeof previousTail === 'string' ? Array.from(previousTail).slice(-300).join('') : '';
            const referenceText = references.map(({ startFloor, endFloor, previous, next }) => {
                const before = Array.from(previous || '').slice(-300).join('');
                const after = Array.from(next || '').slice(0, 300).join('');
                return `第 ${startFloor} 至 ${endFloor} 楼衔接参考（仅供参考，不输出）：\n`
                    + `<previous>${before}</previous>\n<next>${after}</next>`;
            }).join('\n\n');
            const original = floors.map(({ floor, text }) => `<floor n="${floor}">${text}</floor>`).join('\n');
            const task = (prompt?.content?.trim() ? `文风要求：\n<style>${prompt.content}</style>\n\n` : '')
                + (tail ? `前一楼结尾（仅供衔接，不输出）：\n<previous>${tail}</previous>\n\n` : '')
                + (referenceText ? `${referenceText}\n\n` : '')
                + `请按编号逐楼润色以下原文：\n<original>${original}</original>`;
            // 文风和原文只插入一次，不展开其中的宏或替换标记。
            messages.push({ role: 'user', content: buildAssistantTask('polish', listCorePrompts().find(item => item.id === 'polish').text, task) });
            return messages;
        };
        // 每次请求使用固定输出上限，不随原文字数调整。
        const maxTokens = 65535;
        for (let attempt = 0; attempt <= retries;) {
            checkCancelled(signal);
            const messages = buildMessages();
            let response;
            try {
                response = await withRequestTimeout(async requestSignal => {
                    if (api.source === 'secondary') return generateSecondary(api.config, messages, requestSignal, { maxTokens, detailed: true, sampling });
                    // 首次准备也计入超时，迟到的准备不能再发请求。
                    clientPromise ??= getMainClient(host, { detailed: true, sampling });
                    const client = await clientPromise;
                    requestSignal.throwIfAborted();
                    return client.generate(messages, requestSignal, maxTokens);
                }, timeoutSeconds, `等了 ${timeoutSeconds} 秒还没完成润色，请检查当前 API 后重试`, signal);
            } catch (error) {
                if (error?.code === 'AI_TIMEOUT' || error?.code === 'AI_CANCELLED') throw error;
                if (error?.code === 'AI_RATE_LIMIT') {
                    const seconds = Number.isFinite(error.retryAfterSeconds) ? Math.max(1, Math.ceil(error.retryAfterSeconds)) : 30;
                    if (seconds > 300) throw new Error('接口要求等待超过 5 分钟，请稍后继续润色');
                    if (limitBudget.waitedSeconds + seconds > 900) throw new Error('这一段因限速等待将超过 15 分钟，请稍后继续润色');
                    // 同一段自动续写共用预算，避免每次续写重新计算等待上限。
                    limitBudget.waitedSeconds += seconds;
                    await waitForLimit(seconds, signal, onWait);
                    continue;
                }
                if (error?.code === 'AI_RULE_FORMAT') response = { text: '', finishReason: null };
                else throw new Error('AI 润色请求失败，请检查当前 API 的连接和额度后重试');
            }
            checkCancelled(signal);
            try {
                return parseFloors(response, floors);
            } catch (error) {
                if (error?.code !== 'AI_POLISH_FORMAT' || attempt === retries) throw error;
                attempt++;
            }
        }
    };
}
