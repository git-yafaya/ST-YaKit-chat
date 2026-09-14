const cancelled = () => new Error('生成已取消或超时，请重试');

async function post(context, path, body, signal) {
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
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!data || data.error) throw new Error();
        return data;
    } catch {
        if (signal?.aborted) throw cancelled();
        throw new Error('主 API 请求失败，请检查连接、额度和模型设置后重试');
    }
}

function reply(value, signal) {
    if (signal?.aborted) throw cancelled();
    if (typeof value !== 'string' || !value.trim()) throw new Error('模型没有返回文字，请检查模型设置后重试');
    return value;
}

function promptText(messages) {
    return messages.map(message => `${message.role}:\n${message.content}`).join('\n\n');
}

// 只从快照映射宿主采样字段，不读取聊天停止词、宏或全局语法状态。
function koboldParams(settings, flags, maxContext, horde) {
    const params = {
        gui_settings: false, sampler_order: settings.sampler_order,
        max_context_length: Number(maxContext), max_length: 2048,
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

async function generateHorde(context, settings, params, prompt, signal) {
    let taskId;
    try {
        const started = await post(context, '/api/horde/generate-text', {
            prompt, params: { ...params, n: 1, frmtadsnsp: false, frmtrmblln: false, frmtrmspch: false, frmttriminc: false },
            models: settings.models, trusted_workers: settings.trusted_workers_only,
        }, signal);
        if (typeof started.id !== 'string' || !started.id.trim()) throw new Error('Horde 没有返回任务编号，请重试');
        taskId = started.id;
        while (true) {
            await waitForPoll(signal);
            const status = await post(context, '/api/horde/task-status', { taskId }, signal);
            if (status.faulted === true) throw new Error('Horde 生成失败，请重试');
            if (status.is_possible === false) throw new Error('没有可用的 Horde 节点，请换个模型或稍后重试');
            if (status.done) return reply(status.generations?.[0]?.text, signal);
        }
    } catch (error) {
        // 只取消自己已拿到编号的任务；提交未返回编号时无法定向取消。
        if (taskId) void post(context, '/api/horde/cancel-task', { taskId }).catch(() => {});
        throw error;
    }
}

export async function getLegacyClient(context) {
    const api = context?.mainApi;
    if (!['kobold', 'novel', 'koboldhorde'].includes(api)) throw new Error('当前主 API 暂不支持生成规则，请选择可用的 API');
    try {
        if (api === 'novel') {
            const { nai_settings, getNovelMaxResponseTokens } = await import('/scripts/nai-settings.js');
            const settings = structuredClone(nai_settings);
            const model = settings.model_novel || '';
            const maxLength = Math.min(2048, getNovelMaxResponseTokens());
            return {
                model,
                async generate(messages, signal) {
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
                        model, max_length: maxLength, min_length: 0, use_string: true,
                        streaming: false, generate_until_sentence: false, return_full_text: false, use_cache: false,
                        prefix: /clio|kayra|erato/.test(model)
                            ? (prompt.slice(-1500).includes('}') ? 'special_instruct' : settings.prefix) : 'vanilla',
                        order: settings.order, phrase_rep_pen: settings.phrase_rep_pen,
                    });
                    const data = await post(context, '/api/novelai/generate', body, signal);
                    return reply(data.output, signal);
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
            async generate(messages, signal) {
                if (!model) throw new Error('请先在主 API 中选择模型并连接');
                const prompt = promptText(messages);
                const params = koboldParams(settings, flags, maxContext, Boolean(horde));
                if (horde) return generateHorde(context, horde, params, prompt, signal);
                const data = await post(context, '/api/backends/kobold/generate', {
                    ...params, prompt, api_server: settings.api_server, streaming: false,
                    // 不调用 Kobold 全局停止接口，避免中止主聊天的生成。
                    can_abort: false,
                }, signal);
                return reply(data.results?.[0]?.text, signal);
            },
        };
    } catch {
        throw new Error('无法读取主 API 配置，请检查酒馆设置后重试');
    }
}
