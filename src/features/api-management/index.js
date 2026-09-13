import { readSettings, updateSettings } from '../../shared/settings.js';
import { createRecordId, validateRecordName } from '../../shared/validation.js';

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
    if (typeof id !== 'string' || !id) throw new TypeError('副 API id 必须是非空字符串');
    const index = items.findIndex(item => item.id === id);
    if (index < 0) throw new Error('副 API 配置不存在');
    return index;
}

function validateConfig(config, items) {
    const errors = [];
    const warnings = [];
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
        return { valid: false, errors: ['副 API 配置必须是对象'], warnings };
    }
    errors.push(...validateRecordName(config.name, items, config.id));
    if (config.id !== undefined) {
        if (typeof config.id !== 'string' || !config.id) errors.push('副 API id 必须是非空字符串');
        else if (!items.some(item => item.id === config.id)) errors.push('副 API 配置不存在');
    }
    const validProvider = config.provider === undefined || config.provider === ''
        || config.provider === 'openai' || config.provider === 'local';
    if (!validProvider) errors.push('provider 仅支持 openai、local 或未填写');
    let url;
    try {
        if (typeof config.baseUrl !== 'string') throw new TypeError();
        url = new URL(config.baseUrl);
        if (!['http:', 'https:'].includes(url.protocol)) errors.push('服务地址只支持 HTTP 或 HTTPS');
        if (url.search || url.hash) errors.push('服务地址不能包含查询参数或片段');
        if (url.protocol === 'http:') warnings.push('服务地址未使用 HTTPS');
    } catch {
        errors.push('服务地址必须是有效 URL');
    }
    if (typeof config.model !== 'string' || !config.model.trim() || config.model.includes('\n')) {
        errors.push('模型必须是非空字符串且不能包含换行');
    }
    if (typeof config.key !== 'string') errors.push('密钥必须是字符串，可以留空');
    else if (!config.key.trim() && url && validProvider && shouldWarnEmptyKey(config)) {
        warnings.push('当前服务未填写密钥');
    }
    return { valid: errors.length === 0, errors, warnings };
}

function activeConfig(group) {
    const config = group.items.find(item => item.id === group.activeId);
    return config ? { source: 'secondary', config } : { source: 'main' };
}

export function getApiProfiles() {
    return readSettings().apiProfiles;
}

export function validateApiConfig(config) {
    return validateConfig(config, getApiProfiles().items);
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
