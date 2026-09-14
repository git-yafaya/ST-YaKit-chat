function connectionDraft(draft) {
    if (!draft || typeof draft !== 'object' || Array.isArray(draft)) throw new Error('配置内容不对，请重新填写');
    if (![undefined, '', 'auto', 'openai', 'local'].includes(draft.provider)) {
        throw new Error('请选择自动判断、openai 或 local');
    }
    if (typeof draft.url !== 'string') throw new Error('服务地址格式不对，要以 http:// 或 https:// 开头');
    if (/[\u0000-\u001f\u007f-\u009f]/u.test(draft.url)) throw new Error('服务地址里有不能用的字符');
    let url;
    try { url = new URL(draft.url); } catch { throw new Error('服务地址格式不对，要以 http:// 或 https:// 开头'); }
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('服务地址格式不对，要以 http:// 或 https:// 开头');
    if (/[?#]/u.test(draft.url)) throw new Error('服务地址不能带 ? 或 #');
    if (url.username || url.password) throw new Error('服务地址里不要写账号密码');
    if (typeof draft.key !== 'string') throw new Error('密钥内容不对，请重新填写或留空');
    if (/[\u0000-\u001f\u007f-\u009f]/u.test(draft.key.trim())) throw new Error('密钥里有不能用的字符');
    return { url: url.href.replace(/\/+$/u, ''), key: draft.key.trim() };
}

function requestHeaders() {
    try {
        const context = globalThis.SillyTavern?.getContext();
        const headers = context?.getRequestHeaders();
        if (!headers || typeof headers !== 'object' || Array.isArray(headers)) throw new Error();
        return headers;
    } catch {
        throw new Error('无法读取酒馆请求头，请在酒馆中调用');
    }
}

export async function fetchModels(draft) {
    const config = connectionDraft(draft);
    const headers = requestHeaders();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let response;
    let data;
    try {
        // 始终传入草稿地址与密钥，空密钥也不借用主 API 的已存密钥。
        response = await fetch('/api/backends/chat-completions/status', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                chat_completion_source: 'openai',
                reverse_proxy: config.url,
                proxy_password: config.key,
            }),
            signal: controller.signal,
        });
        if (response.ok) {
            try { data = await response.json(); } catch {
                if (controller.signal.aborted) throw new Error();
                throw new Error('酒馆返回的模型列表不是有效 JSON');
            }
        }
    } catch (error) {
        if (controller.signal.aborted) throw new Error('等了 10 秒还没收到结果，请检查地址和网络后重试');
        if (error?.message === '酒馆返回的模型列表不是有效 JSON') throw error;
        throw new Error('无法连接酒馆，请检查网络后重试');
    } finally {
        clearTimeout(timeout);
    }
    if (response.status === 401 || response.status === 403) {
        throw new Error('酒馆拒绝请求，请检查登录状态、账号权限或刷新页面后重试');
    }
    if (response.status === 404) throw new Error('酒馆未提供模型查询接口，请检查宿主版本');
    if (!response.ok) throw new Error(`酒馆模型查询失败（HTTP ${response.status}），请查看酒馆服务端日志`);
    // 宿主把上游鉴权、地址及网络错误统一包装为 HTTP 200，不能据此细分原因。
    if (data?.error) {
        throw new Error('模型查询失败，请检查服务地址、密钥与网络，并确认服务支持 /models 接口；详情请查看酒馆服务端日志');
    }
    if (!data || !Array.isArray(data.data) || data.data.some(model => !model
        || typeof model.id !== 'string' || !model.id.trim() || /[\r\n\u2028\u2029]/u.test(model.id))) {
        throw new Error('服务未返回有效的模型列表，请确认地址支持 OpenAI 兼容的 /models 接口');
    }
    return [...new Set(data.data.map(model => model.id.trim()))];
}

export async function testConnection(draft) {
    await fetchModels(draft);
    return { message: '连接成功（模型列表接口可用）' };
}
