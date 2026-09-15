const cancelled = () => new Error('生成已取消或超时，请重试');

export function rateLimitError(response, data) {
    if (data?.quota_error === true) return null;
    const limited = response?.status === 429 || Number(data?.status) === 429 || Number(data?.error?.code) === 429
        || data?.error?.type === 'rate_limit_error' || /^too many requests$/iu.test(data?.error?.message ?? '');
    if (!limited) return null;
    const header = response?.headers?.get?.('Retry-After');
    const seconds = header?.trim() && /^\d+(?:\.\d+)?$/u.test(header.trim())
        ? Number(header) : header ? (Date.parse(header) - Date.now()) / 1000 : NaN;
    return Object.assign(new Error('接口请求过快，请稍后继续润色'), {
        code: 'AI_RATE_LIMIT', retryAfterSeconds: Number.isFinite(seconds) ? Math.max(1, Math.ceil(seconds)) : 30,
    });
}

export function detailedReply(text, data) {
    const reason = data?.choices?.[0]?.finish_reason ?? data?.finish_reason ?? data?.stop_reason
        ?? data?.candidates?.[0]?.finishReason ?? (data?.stopped_limit ? 'length' : null);
    return { text, finishReason: ['length', 'max_tokens', 'MAX_TOKENS'].includes(reason) ? 'length'
        : typeof reason === 'string' ? reason : null };
}

async function post(context, path, body, signal, detailed = false) {
    if (signal?.aborted) throw cancelled();
    let headers;
    try {
        headers = context.getRequestHeaders();
        if (!headers || typeof headers !== 'object' || Array.isArray(headers)) throw new Error();
    } catch {
        throw new Error('无法读取酒馆请求头，请刷新酒馆后重试');
    }
    try {
        const response = await fetch(path, { method: 'POST', headers, body: JSON.stringify(body), signal });
        if (detailed && response.status === 429) {
            let data;
            try { data = await response.json(); } catch { /* 限速页可能没有 JSON 正文。 */ }
            const limited = rateLimitError(response, data);
            if (limited) throw limited;
        }
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (detailed) {
            const limited = rateLimitError(response, data);
            if (limited) throw limited;
        }
        if (!data || data.error) throw new Error();
        return data;
    } catch (error) {
        if (signal?.aborted) throw cancelled();
        if (detailed && error?.code === 'AI_RATE_LIMIT') throw error;
        throw new Error('主 API 请求失败，请检查连接、额度和模型设置后重试');
    }
}

function reply(value, signal, detailed = false, data) {
    if (signal?.aborted) throw cancelled();
    if (detailed) return detailedReply(typeof value === 'string' ? value : '', data);
    if (typeof value !== 'string' || !value.trim()) {
        throw Object.assign(new Error('模型没有返回文字，请检查模型设置后重试'), { code: 'AI_RULE_FORMAT' });
    }
    return value;
}

function promptText(messages) {
    return messages.map(message => `${message.role}:\n${message.content}`).join('\n\n');
}

// 只从快照映射宿主采样字段，不读取聊天停止词、宏或全局语法状态。
function koboldParams(settings, flags, maxContext, horde, maxTokens) {
    const params = {
        gui_settings: false, sampler_order: settings.sampler_order,
        max_context_length: Number(maxContext), max_length: maxTokens,
        rep_pen: Number(settings.rep_pen), rep_pen_range: Number(settings.rep_pen_range),
        rep_pen_slope: settings.rep_pen_slope, temperature: Number(settings.temp),
        tfs: settings.tfs, top_a: settings.top_a, top_k: settings.top_k, top_p: settings.top_p,
        typical: settings.typical, use_world_info: false, singleline: false,
        sampler_seed: settings.seed >= 0 ? settings.seed : undefined,
    };
    if (horde || flags.can_use_min_p) params.min_p = settings.min_p;
    if (horde || flags.can_use_mirostat) {
        for (const key of ['mirostat', 'mirostat_tau', 'mirostat_eta']) params[key] = settings[key];
    }
    if (horde || flags.can_use_default_badwordsids) params.use_default_badwordsids = settings.use_default_badwordsids;
    return params;
}

function waitForPoll(signal) {
    if (signal?.aborted) return Promise.reject(cancelled());
    return new Promise((resolve, reject) => {
        const abort = () => {
            clearTimeout(timer);
            signal?.removeEventListener('abort', abort);
            reject(cancelled());
        };
        const timer = setTimeout(() => {
            signal?.removeEventListener('abort', abort);
            resolve();
        }, 2500);
        signal?.addEventListener('abort', abort, { once: true });
    });
}

async function generateHorde(context, settings, params, prompt, signal, detailed) {
    let taskId;
    try {
        const started = await post(context, '/api/horde/generate-text', {
            prompt, params: { ...params, n: 1, frmtadsnsp: false, frmtrmblln: false, frmtrmspch: false, frmttriminc: false },
            models: settings.models, trusted_workers: settings.trusted_workers_only,
        }, signal, detailed);
        if (typeof started.id !== 'string' || !started.id.trim()) throw new Error('Horde 没有返回任务编号，请重试');
        taskId = started.id;
        while (true) {
            await waitForPoll(signal);
            const status = await post(context, '/api/horde/task-status', { taskId }, signal, detailed);
            if (status.faulted === true) throw new Error('Horde 生成失败，请重试');
            if (status.is_possible === false) throw new Error('没有可用的 Horde 节点，请换个模型或稍后重试');
            if (status.done) return reply(status.generations?.[0]?.text, signal, detailed, status.generations?.[0]);
        }
    } catch (error) {
        // 只取消自己已拿到编号的任务；提交未返回编号时无法定向取消。
        if (taskId) void post(context, '/api/horde/cancel-task', { taskId }).catch(() => {});
        throw error;
    }
}

export async function getLegacyClient(context, { maxTokens = 2048, detailed = false } = {}) {
    const api = context?.mainApi;
    if (!['kobold', 'novel', 'koboldhorde'].includes(api)) throw new Error('当前主 API 暂不支持生成规则，请选择可用的 API');
    try {
        if (api === 'novel') {
            const { nai_settings, getNovelMaxResponseTokens } = await import('/scripts/nai-settings.js');
            const settings = structuredClone(nai_settings);
            // 冒险模式会让宿主遇到 > 就停止，润色标签需要完整输出。
            if (detailed && settings.prefix === 'theme_textadventure') settings.prefix = 'special_instruct';
            const model = settings.model_novel || '';
            const maxLength = getNovelMaxResponseTokens();
            return {
                model,
                async generate(messages, signal, requestedMaxTokens = maxTokens) {
                    if (!model) throw new Error('请先在主 API 中选择模型');
                    const prompt = promptText(messages);
                    const body = {};
                    for (const key of ['temperature', 'tail_free_sampling', 'repetition_penalty', 'repetition_penalty_range',
                        'repetition_penalty_slope', 'repetition_penalty_frequency', 'repetition_penalty_presence',
                        'top_a', 'top_p', 'top_k', 'min_p', 'math1_temp', 'math1_quad', 'math1_quad_entropy_scale',
                        'typical_p', 'mirostat_lr', 'mirostat_tau']) {
                        if (settings[key] !== undefined) body[key] = Number(settings[key]);
                    }
                    Object.assign(body, {
                        input: model.includes('erato') ? `<|startoftext|><|reserved_special_token81|>${prompt}` : prompt,
                        model, max_length: Math.min(requestedMaxTokens, maxLength), min_length: 0, use_string: true,
                        streaming: false, generate_until_sentence: false, return_full_text: false, use_cache: false,
                        prefix: /clio|kayra|erato/.test(model)
                            ? (prompt.slice(-1500).includes('}') ? 'special_instruct' : settings.prefix) : 'vanilla',
                        order: settings.order, phrase_rep_pen: settings.phrase_rep_pen,
                    });
                    const data = await post(context, '/api/novelai/generate', body, signal, detailed);
                    return reply(data.output, signal, detailed, data);
                },
            };
        }
        const { kai_settings, kai_flags } = await import('/scripts/kai-settings.js');
        const settings = structuredClone(kai_settings);
        const flags = structuredClone(kai_flags);
        const maxContext = context.maxContext;
        const horde = api === 'koboldhorde'
            ? structuredClone((await import('/scripts/horde.js')).horde_settings) : null;
        const model = horde ? horde.models.join(', ') : (context.onlineStatus === 'no_connection' ? '' : context.onlineStatus || '');
        return {
            model,
            async generate(messages, signal, requestedMaxTokens = maxTokens) {
                if (!model) throw new Error('请先在主 API 中选择模型并连接');
                const prompt = promptText(messages);
                const params = koboldParams(settings, flags, maxContext, Boolean(horde), requestedMaxTokens);
                if (horde) return generateHorde(context, horde, params, prompt, signal, detailed);
                const data = await post(context, '/api/backends/kobold/generate', {
                    ...params, prompt, api_server: settings.api_server, streaming: false,
                    // 不调用 Kobold 全局停止接口，避免中止主聊天的生成。
                    can_abort: false,
                }, signal, detailed);
                return reply(data.results?.[0]?.text, signal, detailed, data);
            },
        };
    } catch {
        throw new Error('无法读取主 API 配置，请检查酒馆设置后重试');
    }
}
