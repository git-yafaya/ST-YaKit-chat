import {
    getApiProfiles, getActiveApiConfig, shouldWarnEmptyKey, validateApiConfigFields,
    saveApiProfile, selectApiProfile, deleteApiProfile,
} from '../api-management/index.js';
import { createDuplicateName } from '../../shared/validation.js';

function toConfig(draft) {
    if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
        throw new Error('副 API 配置必须是对象');
    }
    return {
        id: draft.id,
        name: draft.name,
        baseUrl: draft.url,
        key: draft.key,
        model: draft.model,
        provider: draft.provider === 'auto' ? undefined : draft.provider,
    };
}

function toProfile(config) {
    return {
        id: config.id, name: config.name, url: config.baseUrl,
        key: config.key, model: config.model, provider: config.provider || 'auto',
    };
}

export function listProfiles() {
    return getApiProfiles().items.map(config => ({
        id: config.id, name: config.name, url: config.baseUrl, model: config.model,
        provider: config.provider || 'auto',
        resolvedProvider: shouldWarnEmptyKey(config) ? 'openai' : 'local',
    }));
}

export function getProfile(id) {
    if (typeof id !== 'string' || !id) throw new Error('副 API id 必须是非空字符串');
    const config = getApiProfiles().items.find(item => item.id === id);
    if (!config) throw new Error('副 API 配置不存在');
    return toProfile(config);
}

export function getActiveProfileId() {
    return getActiveApiConfig().config?.id ?? null;
}

export function activateProfile(id) {
    if (id === undefined) throw new Error('请选择副 API 配置，或传入 null 使用主 API');
    selectApiProfile(id);
    return id;
}

export function checkProfile(draft) {
    return validateApiConfigFields(toConfig(draft));
}

export function saveProfile(draft) {
    return toProfile(saveApiProfile(toConfig(draft)));
}

export function duplicateProfile(id) {
    const original = getProfile(id);
    const name = createDuplicateName(original.name, getApiProfiles().items);
    return saveProfile({ ...original, id: undefined, name });
}

export function removeProfile(id) {
    return deleteApiProfile(id);
}
