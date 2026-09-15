const rules = {
    temperature: ['温度', 0, 2],
    topP: ['Top P', 0, 1],
    topK: ['Top K', 0, Number.MAX_SAFE_INTEGER],
    frequencyPenalty: ['频率惩罚', -2, 2],
    presencePenalty: ['存在惩罚', -2, 2],
};
export const SAMPLING_FIELDS = {
    temperature: 'temperature', topP: 'top_p', topK: 'top_k',
    frequencyPenalty: 'frequency_penalty', presencePenalty: 'presence_penalty',
};

// 局部更新只校验传入项；读取旧设置时给缺项补 null。
export function normalizeSampling(value = {}) {
    if (!value || Object.prototype.toString.call(value) !== '[object Object]'
        || Reflect.ownKeys(value).some(key => !Object.hasOwn(rules, key))) throw new Error('采样参数内容不正确');
    return Object.fromEntries(Object.entries(rules).map(([key, [name, min, max]]) => {
        const number = Object.hasOwn(value, key) ? value[key] : null;
        if (number !== null && (!Number.isFinite(number) || number < min || number > max
            || (key === 'topK' && !Number.isSafeInteger(number)))) {
            throw new Error(key === 'topK' ? 'Top K 必须是非负安全整数' : `${name}必须是 ${min} 到 ${max} 之间的数字`);
        }
        return [key, number];
    }));
}

// 未传 sampling 的旧客户端调用保持原行为；助手明确传完整五项。
export function applySampling(body, sampling, fields = SAMPLING_FIELDS, unsupported = []) {
    if (sampling === undefined) return;
    for (const [key, field] of Object.entries(fields)) {
        if (sampling[key] == null || unsupported.includes(key)) delete body[field];
        else body[field] = sampling[key];
    }
}

// 宿主已处理数值映射和模型限制，只移除空值，不补回被宿主删掉的项。
export function omitUnsetSampling(body, sampling, unsupported = []) {
    if (sampling === undefined) return;
    for (const [key, field] of Object.entries(SAMPLING_FIELDS)) {
        if (sampling[key] == null || unsupported.includes(key)) delete body[field];
    }
}

// 与宿主当前 OpenAI 模型分支一致；兼容服务无法仅凭地址识别全部模型能力。
export function openaiUnsupported(model) {
    if (/^(o1|o3|o4)/.test(model)) return Object.keys(SAMPLING_FIELDS);
    if (/gpt-5/.test(model) && !/gpt-5-chat-latest/.test(model)) {
        return /gpt-5\.(1|2|3|4)/.test(model) && !/chat-latest/.test(model)
            ? ['topK', 'frequencyPenalty', 'presencePenalty'] : Object.keys(SAMPLING_FIELDS);
    }
    return ['topK'];
}
