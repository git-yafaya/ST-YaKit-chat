const queues = new Map();
const labels = { LOAD: '读取', SAVE: '保存', DELETE: '删除' };
// 润色结果和本次任务输入分文件保存，同一聊天共用一个读写队列。
const files = {
    job: { prefix: 'ST-YaKit-chat-polish', subject: '已保存的润色结果' },
    inputs: { prefix: 'ST-YaKit-chat-polish-inputs', subject: '本次任务' },
};

function failure(kind, detail = '失败，请重试', file = files.job) {
    return Object.assign(new Error(`${labels[kind]}${file.subject}${detail}`), { code: `POLISH_${kind}` });
}

function validRecord(record) {
    return record !== null && typeof record === 'object' && !Array.isArray(record);
}

// 文件名用聊天标识的 SHA-256。酒馆 1.18 起 lib.js 才导出 sha256，旧版退回浏览器自带的
// crypto.subtle（只在 https 或 localhost 下可用）；两者结果相同，已保存的文件名不变。
async function sha256Hex(text, kind, file) {
    const lib = await import('/lib.js').catch(() => null);
    if (typeof lib?.sha256 === 'function') return lib.sha256(text);
    if (globalThis.crypto?.subtle) {
        const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    }
    throw failure(kind, '失败：酒馆版本低于 1.18 时需要用 https 或 localhost 打开酒馆，或者升级酒馆', file);
}

// 同一聊天的读写删除依次执行，失败后仍允许下一次操作。
function enqueue(chatKey, kind, operation, file = files.job) {
    if (typeof chatKey !== 'string' || !chatKey) return Promise.reject(failure(kind, '失败：无法识别聊天', file));
    const task = (queues.get(chatKey) || Promise.resolve()).then(async () => {
        try {
            const name = `${file.prefix}-${await sha256Hex(chatKey, kind, file)}.json`;
            return await operation(name, `user/files/${name}`);
        } catch (error) {
            throw error?.code === `POLISH_${kind}` ? error : failure(kind, undefined, file);
        }
    });
    const settled = task.catch(() => {});
    queues.set(chatKey, settled);
    settled.then(() => { if (queues.get(chatKey) === settled) queues.delete(chatKey); });
    return task;
}

// 超时同时取消请求，读取响应正文也计入这 30 秒。
async function request(kind, url, body, consume, file = files.job) {
    const controller = new AbortController();
    let timer;
    try {
        const headers = globalThis.SillyTavern?.getContext?.()?.getRequestHeaders?.();
        if (!headers || typeof headers !== 'object' || Array.isArray(headers)) throw failure(kind, undefined, file);
        return await Promise.race([
            (async () => {
                let response;
                try {
                    response = await fetch(url, {
                        method: body === undefined ? 'GET' : 'POST', headers,
                        ...(body === undefined ? { cache: 'no-store' } : { body: JSON.stringify(body) }),
                        signal: controller.signal,
                    });
                } catch (error) {
                    if (controller.signal.aborted) throw error;
                    throw failure(kind, '失败：连不上酒馆，请检查网络后重试', file);
                }
                if (response.status === 404 && kind !== 'SAVE') return null;
                if (!response.ok) throw failure(kind, `失败（酒馆返回 HTTP ${response.status}），请重试`, file);
                return consume ? await consume(response) : undefined;
            })(),
            new Promise((_, reject) => {
                timer = setTimeout(() => {
                    reject(failure(kind, '超时，请重试', file));
                    controller.abort();
                }, 30000);
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}

export async function loadSaved(chatKey, type = 'job') {
    const file = files[type];
    return enqueue(chatKey, 'LOAD', (_, path) => request('LOAD', `/${path}`, undefined, async response => {
        let data;
        try { data = await response.json(); } catch { throw failure('LOAD', '失败：保存文件无法解析', file); }
        if (data?.version !== 1 || data.chatKey !== chatKey || !validRecord(data.record)) {
            throw failure('LOAD', '失败：保存文件内容无效', file);
        }
        return data.record;
    }, file), file);
}

export async function saveSaved(chatKey, record, type = 'job') {
    const file = files[type];
    let data;
    try {
        if (!validRecord(record)) throw failure('SAVE', '失败：结果内容无效', file);
        // 排队前固定快照，后续编辑不会改掉这次要写入的内容。
        const json = JSON.stringify({ version: 1, chatKey, record: structuredClone(record) });
        const bytes = new TextEncoder().encode(json);
        let binary = '';
        for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
        data = btoa(binary);
    } catch { throw failure('SAVE', '失败：结果内容无效', file); }
    return enqueue(chatKey, 'SAVE', (name, path) => request('SAVE', '/api/files/upload', { name, data }, async response => {
        const result = await response.json();
        if (typeof result?.path !== 'string' || result.path.replace(/^\//, '') !== path) throw failure('SAVE', undefined, file);
    }, file), file);
}

export async function deleteSaved(chatKey, type = 'job') {
    const file = files[type];
    await enqueue(chatKey, 'DELETE', (_, path) => request('DELETE', '/api/files/delete', { path }, undefined, file), file);
}
