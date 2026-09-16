import * as store from './store.js';
import * as files from './files.js';

// 全部公开操作返回 Promise，底层异常统一为可显示的中文错误。
export const presets = Object.freeze(Object.fromEntries(
    Object.entries({ ...store, ...files }).map(([name, operation]) => [name, async (...args) => {
        try {
            return await operation(...args);
        } catch (error) {
            const message = typeof error?.message === 'string' && /[\u3400-\u9fff]/u.test(error.message)
                ? error.message : '预设操作失败，请稍后重试';
            throw new Error(message);
        }
    }]),
));
