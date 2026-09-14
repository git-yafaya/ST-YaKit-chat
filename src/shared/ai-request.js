import { readSettings, updateSettings } from './settings.js';

const defaults = { timeoutSeconds: 360, retries: 1 };

function isObject(value) {
    return value !== null && Object.prototype.toString.call(value) === '[object Object]';
}

function normalizeSettings(value = {}) {
    if (!isObject(value)) throw new Error('请求参数不对，请重新设置');
    const settings = Object.fromEntries(Object.entries(defaults).map(([field, fallback]) => [
        field, Object.hasOwn(value, field) ? value[field] : fallback,
    ]));
    if (!Number.isInteger(settings.timeoutSeconds) || settings.timeoutSeconds < 30 || settings.timeoutSeconds > 1800) {
        throw new Error('超时时间要在 30 到 1800 秒之间，请填写整数秒数');
    }
    if (!Number.isInteger(settings.retries) || settings.retries < 0 || settings.retries > 3) {
        throw new Error('自动重试次数只能选 0、1、2 或 3');
    }
    return settings;
}

export function getRequestSettings() {
    return normalizeSettings(readSettings().requestSettings);
}

export function setRequestSettings(patch) {
    if (!isObject(patch)) throw new Error('请求参数不对，请重新设置');
    const keys = Reflect.ownKeys(patch);
    if (keys.some(field => !Object.hasOwn(defaults, field))) throw new Error('这项请求参数不能修改');
    if (!keys.length) return getRequestSettings();
    return updateSettings(settings => {
        const next = normalizeSettings(settings.requestSettings);
        for (const field of keys) next[field] = patch[field];
        settings.requestSettings = normalizeSettings(next);
        return settings.requestSettings;
    });
}

// 每次调用单独计时；上游忽略中止信号时也结束本次等待。
export async function withRequestTimeout(operation, timeoutSeconds, timeoutMessage, externalSignal) {
    const controller = new AbortController();
    let timer;
    let cancel;
    const expired = new Promise((resolve, reject) => {
        cancel = () => {
            const error = new Error('已停止生成');
            error.code = 'AI_CANCELLED';
            // 先确定取消结果，避免底层中止错误抢先结束等待。
            reject(error);
            controller.abort(error);
        };
        if (externalSignal?.aborted) {
            cancel();
            return;
        }
        externalSignal?.addEventListener('abort', cancel, { once: true });
        timer = setTimeout(() => {
            const error = new Error(timeoutMessage);
            error.code = 'AI_TIMEOUT';
            // 先确定超时结果，避免中止监听器抢先抛出其他错误。
            reject(error);
            controller.abort(error);
        }, timeoutSeconds * 1000);
    });
    try {
        return await Promise.race([Promise.resolve().then(() => {
            controller.signal.throwIfAborted();
            return operation(controller.signal);
        }), expired]);
    } finally {
        clearTimeout(timer);
        externalSignal?.removeEventListener('abort', cancel);
    }
}
