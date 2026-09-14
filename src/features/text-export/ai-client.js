import { getLegacyClient } from './ai-legacy-client.js';
import { getServiceUrlCharacterError } from '../../shared/service-url.js';

function textContent(value) {
    if (typeof value === 'string') return value;
    if (!Array.isArray(value)) return '';
    return value.filter(part => part && !part.thought && [undefined, 'text'].includes(part.type)
        && typeof part.text === 'string').map(part => part.text).join('\n');
}

function replyText(data, textCompletion) {
    const choice = Array.isArray(data?.choices) ? data.choices[0] : undefined;
    const candidates = Array.isArray(data?.candidates) ? data.candidates[0] : undefined;
    const values = [choice?.message?.content, choice?.text, data?.content, data?.text,
        data?.message?.content, candidates?.content?.parts];
    if (textCompletion) values.push(data?.response, Array.isArray(data) ? data[0]?.content : undefined);
    const text = values.map(textContent).find(value => value.trim());
    if (!text) throw Object.assign(new Error('模型没有返回文字，请检查模型设置后重试'), { code: 'AI_RULE_FORMAT' });
    return text;
}

async function request(context, path, body, signal, textCompletion = false) {
    if (signal?.aborted) throw new Error('生成已取消或超时，请重试');
    let headers;
    try {
        headers = context?.getRequestHeaders();
        if (!headers || typeof headers !== 'object' || Array.isArray(headers)) throw new Error();
    } catch {
        throw new Error('无法读取酒馆请求头，请刷新酒馆后重试');
    }
    let response;
    let data;
    try {
        // KoboldCpp 断开会触发宿主全局停止接口，仅限制界面等待，不主动断开请求。
        const requestSignal = textCompletion && body.api_type === 'koboldcpp' ? undefined : signal;
        response = await fetch(path, { method: 'POST', headers, body: JSON.stringify(body), signal: requestSignal });
        if (response.ok) data = await response.json();
    } catch {
        if (signal?.aborted) throw new Error('生成已取消或超时，请重试');
        if (response?.ok) throw new Error('没能读懂模型的回复，请检查模型设置后重试');
        throw new Error('无法连接酒馆，请检查网络后重试');
    }
    if (response.status === 401 || response.status === 403) {
        throw new Error('酒馆拒绝请求，请检查登录状态或刷新页面后重试');
    }
    if (response.status === 404) throw new Error('酒馆未提供生成接口，请检查宿主版本');
    if (data?.quota_error === true) throw new Error('模型服务的额度不足，请补充额度后重试');
    if (!response.ok || data?.error) throw new Error('模型请求失败，请检查地址、密钥和模型设置后重试');
    return replyText(data, textCompletion);
}

function requireModel(model) {
    if (typeof model !== 'string' || !model.trim()) throw new Error('请先在当前 API 中选择或填写模型');
    if (/[\r\n\u2028\u2029]/u.test(model)) throw new Error('模型名称不能换行');
    return model.trim();
}

export async function generateSecondary(config, messages, signal) {
    const model = requireModel(config?.model);
    const urlCharacterError = getServiceUrlCharacterError(config.baseUrl);
    if (urlCharacterError) throw new Error(urlCharacterError);
    let url;
    try {
        url = new URL(config.baseUrl);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
            || /[?#\u0000-\u001f\u007f-\u009f]/u.test(config.baseUrl)) throw new Error();
    } catch {
        throw new Error('副 API 服务地址不正确，请在 API 管理中重新填写');
    }
    if (![undefined, '', 'auto', 'openai', 'local'].includes(config.provider)
        || typeof config.key !== 'string' || /[\u0000-\u001f\u007f-\u009f]/u.test(config.key.trim())) {
        throw new Error('副 API 配置不正确，请检查供应商类型和密钥');
    }
    // 副 API 始终显式传入自己的密钥，空串也不回退主 API。
    const body = {
        chat_completion_source: 'openai', reverse_proxy: url.href.replace(/\/+$/u, ''),
        proxy_password: config.key.trim(), model, messages, stream: false,
        [/^(o1|o3|o4)/.test(model) || /gpt-5/.test(model) ? 'max_completion_tokens' : 'max_tokens']: 2048,
    };
    return request(globalThis.SillyTavern?.getContext?.(), '/api/backends/chat-completions/generate', body, signal);
}

export async function getMainClient(context) {
    if (!['openai', 'textgenerationwebui'].includes(context?.mainApi)) return getLegacyClient(context);
    try {
        if (context.mainApi === 'openai') {
            const { oai_settings, getChatCompletionModel, createGenerationParameters } = await import('/scripts/openai.js');
            const settings = structuredClone(oai_settings);
            const model = getChatCompletionModel(settings) || '';
            const proxy = { reverse_proxy: settings.reverse_proxy, proxy_password: settings.proxy_password };
            // 只改变本次副本，避开代理确认、工具调用和全局偏置缓存。
            Object.assign(settings, {
                openai_max_tokens: 2048, stream_openai: false, function_calling: false,
                enable_web_search: false, request_images: false, show_thoughts: false,
                bias_preset_selected: '', reverse_proxy: '', custom_prompt_post_processing: '',
                custom_include_body: '', custom_exclude_body: '',
            });
            return {
                model,
                async generate(messages, signal) {
                    requireModel(model);
                    let body;
                    try {
                        ({ generate_data: body } = await createGenerationParameters(
                            structuredClone(settings), model, 'quiet', structuredClone(messages)));
                    } catch {
                        throw new Error('无法准备主 API 请求，请检查酒馆中的模型设置');
                    }
                    if (proxy.reverse_proxy) Object.assign(body, proxy);
                    // 不带角色姓名、聊天停止词或工具数据，只发送本次辅助消息。
                    for (const key of ['user_name', 'char_name', 'group_names', 'stop', 'tools', 'tool_choice',
                        'logit_bias', 'logprobs', 'top_logprobs']) delete body[key];
                    body.stream = false;
                    return request(context, '/api/backends/chat-completions/generate', body, signal);
                },
            };
        }
        const { textgenerationwebui_settings, getTextGenModel, getTextGenServer, createTextGenGenerationData }
            = await import('/scripts/textgen-settings.js');
        const settings = structuredClone(textgenerationwebui_settings);
        const requestModel = settings.type === 'ollama' && !settings.ollama_model ? '' : getTextGenModel(settings) || '';
        const model = requestModel || (typeof context.onlineStatus === 'string' && context.onlineStatus !== 'no_connection'
            ? context.onlineStatus : '');
        const server = getTextGenServer(settings.type);
        // 禁词会消费宿主临时宏状态，语法和负面提示也不用于本次辅助任务。
        Object.assign(settings, {
            send_banned_tokens: false, logit_bias: [], grammar_string: '', json_schema: {},
            json_schema_allow_empty: false, negative_prompt: '', dry_sequence_breakers: '',
        });
        return {
            model,
            async generate(messages, signal) {
                try {
                    if (!['http:', 'https:'].includes(new URL(server).protocol)) throw new Error();
                } catch {
                    throw new Error('请先在酒馆中配置有效的文本补全服务地址');
                }
                if (requestModel) requireModel(requestModel);
                let body;
                try {
                    const prompt = messages.map(message => `${message.role}:\n${message.content}`).join('\n\n');
                    body = createTextGenGenerationData(structuredClone(settings), requestModel, prompt, 2048, false, false, null, 'quiet');
                    body.api_type = settings.type;
                    body.api_server = server;
                    body.stream = false;
                    for (const key of ['stop', 'stopping_strings', 'dry_sequence_breakers', 'parseSequenceBreakers']) delete body[key];
                } catch {
                    throw new Error('无法准备主 API 请求，请检查酒馆中的模型设置');
                }
                return request(context, '/api/backends/text-completions/generate', body, signal, true);
            },
        };
    } catch {
        throw new Error('无法读取主 API 配置，请检查酒馆设置后重试');
    }
}
