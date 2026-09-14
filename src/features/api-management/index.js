import { readSettings, updateSettings } from '../../shared/settings.js';
import { createRecordId, validateRecordName } from '../../shared/validation.js';
import { getServiceUrlCharacterError } from '../../shared/service-url.js';
import { resetAssistantReferences } from '../assistant-management/index.js';

// 仅判断空密钥是否需要提醒，不探测服务是否可用。
export function shouldWarnEmptyKey(config) {
    if (config.provider === 'local') return false;
    if (config.provider === 'openai') return true;
    const hostname = new URL(config.baseUrl).hostname.toLowerCase();
    if (['localhost', '127.0.0.1', '0.0.0.0', '[::1]', 'host.docker.internal'].includes(hostname)
        || hostname.endsWith('.local')) return false;
    if (/^\d+\.\d+\.\d+\.\d+$/u.test(hostname)) {
        const parts = hostname.split('.').map(Number);
        if (parts.every(part => part >= 0 && part <= 255)
            && (parts[0] === 10 || (parts[0] === 192 && parts[1] === 168)
                || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31))) return false;
    }
    return true;
}

function findRecordIndex(items, id) {
    if (typeof id !== 'string' || !id) throw new TypeError('请选择要操作的配置');
    const index = items.findIndex(item => item.id === id);
    if (index < 0) throw new Error('这份配置已不存在，请重新选择');
    return index;
}

function validateConfig(config, items) {
    const errors = [];
    const warnings = [];
    const fields = { errors: {}, warnings: {} };
    const generalErrors = [];
    function addError(field, message) {
        errors.push(message);
        if (field) fields.errors[field] = [fields.errors[field], message].filter(Boolean).join('；');
        else generalErrors.push(message);
    }
    function addWarning(field, message) {
        warnings.push(message);
        fields.warnings[field] = message;
    }
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
        return { valid: false, errors: ['配置内容不对，请重新填写'], warnings, fields, generalErrors: ['配置内容不对，请重新填写'] };
    }
    for (const message of validateRecordName(config.name, items, config.id)) addError('name', message);
    if (config.id !== undefined) {
        if (typeof config.id !== 'string' || !config.id) addError(null, '请选择要操作的配置');
        else if (!items.some(item => item.id === config.id)) addError(null, '这份配置已不存在，请重新选择');
    }
    const validProvider = [undefined, '', 'openai', 'local'].includes(config.provider);
    if (!validProvider) addError(null, '请选择自动判断、openai 或 local');
    let url;
    const urlCharacterError = getServiceUrlCharacterError(config.baseUrl);
    if (urlCharacterError) {
        addError('url', urlCharacterError);
    } else try {
        if (typeof config.baseUrl !== 'string') throw new TypeError();
        url = new URL(config.baseUrl);
        if (/[\u0000-\u001f\u007f-\u009f]/u.test(config.baseUrl)) addError('url', '服务地址里有不能用的字符');
        if (url.username || url.password) addError('url', '服务地址里不要写账号密码');
        if (!['http:', 'https:'].includes(url.protocol)) addError('url', '服务地址格式不对，要以 http:// 或 https:// 开头');
        if (/[?#]/u.test(config.baseUrl)) addError('url', '服务地址不能带 ? 或 #');
        if (url.protocol === 'http:') addWarning('url', '地址不是 https，内容可能被他人看到');
    } catch {
        addError('url', '服务地址格式不对，要以 http:// 或 https:// 开头');
    }
    if (typeof config.model !== 'string' || !config.model.trim()) {
        addError('model', '请填写模型名称');
    } else if (/[\r\n\u2028\u2029]/u.test(config.model)) {
        addError('model', '模型名称不能换行');
    }
    if (typeof config.key !== 'string') addError(null, '密钥内容不对，请重新填写或留空');
    else if (/[\u0000-\u001f\u007f-\u009f]/u.test(config.key.trim())) addError(null, '密钥里有不能用的字符');
    else if (!config.key.trim() && url && validProvider && shouldWarnEmptyKey(config)) {
        addWarning('key', '可能需要填写密钥');
    }
    return { valid: errors.length === 0, errors, warnings, fields, generalErrors };
}

function activeConfig(group) {
    const config = group.items.find(item => item.id === group.activeId);
    return config ? { source: 'secondary', config } : { source: 'main' };
}

export function getApiProfiles() {
    return readSettings().apiProfiles;
}

export function validateApiConfig(config) {
    const { valid, errors, warnings } = validateConfig(config, getApiProfiles().items);
    return { valid, errors, warnings };
}

// 界面字段检查和旧接口共用同一次校验。
export function validateApiConfigFields(config) {
    const { fields, generalErrors } = validateConfig(config, getApiProfiles().items);
    if (generalErrors.length) throw new Error(generalErrors.join('；'));
    return fields;
}

export function saveApiProfile(config) {
    return updateSettings(settings => {
        const group = settings.apiProfiles;
        // 使用最新快照查重，任何错误都在保存前结束。
        const result = validateConfig(config, group.items);
        if (!result.valid) throw new Error(result.errors.join('；'));
        const record = {
            id: config.id ?? createRecordId(),
            name: config.name.trim(),
            baseUrl: new URL(config.baseUrl).href.replace(/\/+$/u, ''),
            key: config.key.trim(),
            model: config.model.trim(),
        };
        if (config.provider) record.provider = config.provider;
        if (config.id === undefined) group.items.push(record);
        else group.items[findRecordIndex(group.items, config.id)] = record;
        return record;
    });
}

export function deleteApiProfile(id) {
    return updateSettings(settings => {
        const group = settings.apiProfiles;
        group.items.splice(findRecordIndex(group.items, id), 1);
        if (group.activeId === id) group.activeId = null;
        resetAssistantReferences(settings, 'profile', id);
        return true;
    });
}

export function selectApiProfile(id = null) {
    return updateSettings(settings => {
        const group = settings.apiProfiles;
        if (id !== null) findRecordIndex(group.items, id);
        group.activeId = id;
        return activeConfig(group);
    });
}

export function getActiveApiConfig() {
    return activeConfig(getApiProfiles());
}
