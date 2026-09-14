import * as profiles from './profiles.js';
import * as prompts from './prompts.js';
import { getAssistant, setAssistant, resolveAssistant } from './assistants.js';
import { testConnection, fetchModels } from './connection.js';

// 界面统一等待 Promise，底层错误转成可直接显示的中文。
export const apiUI = Object.freeze(Object.fromEntries(
    Object.entries({ ...profiles, ...prompts, testConnection, fetchModels, getAssistant, setAssistant, resolveAssistant }).map(([name, operation]) => [name, async (...args) => {
        try {
            return await operation(...args);
        } catch (error) {
            const message = typeof error?.message === 'string' && /[\u3400-\u9fff]/u.test(error.message)
                ? error.message : 'API 管理操作失败，请稍后重试';
            throw new Error(message);
        }
    }]),
));
