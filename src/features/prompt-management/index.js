import { readSettings, updateSettings } from '../../shared/settings.js';
import { createRecordId, validateRecordName } from '../../shared/validation.js';

const metadataDefaults = {
    jailbreak: { target: 'system', anchor: 'start', priority: 100 },
    regex: { target: 'user', anchor: 'before_task', priority: 80 },
    style: { target: 'user', anchor: 'end', priority: 50 },
};
const categories = Object.keys(metadataDefaults);

function getMetadata(category, record, previous = {}) {
    const metadata = { ...metadataDefaults[category] };
    // 只补缺失字段，完整编辑时保留界面未传入的内部配置。
    for (const key of Object.keys(metadata)) {
        if (previous[key] !== undefined) metadata[key] = previous[key];
        if (record[key] !== undefined) metadata[key] = record[key];
    }
    return metadata;
}

function assertCategory(category) {
    if (!categories.includes(category)) {
        throw new TypeError('提示词类别仅支持 jailbreak、regex 或 style');
    }
}

function findRecordIndex(items, id) {
    if (typeof id !== 'string' || !id) {
        throw new TypeError('提示词 id 必须是非空字符串');
    }
    const index = items.findIndex(item => item.id === id);
    if (index < 0) throw new Error('提示词不存在');
    return index;
}

function validateTemplate(template, settings) {
    const errors = [];
    if (!template || typeof template !== 'object' || Array.isArray(template)) {
        errors.push('提示词必须是对象');
    } else if (!categories.includes(template.category)) {
        errors.push('提示词类别仅支持 jailbreak、regex 或 style');
    } else {
        const items = settings.prompts[template.category].items;
        errors.push(...validateRecordName(template.name, items, template.id));
        if (typeof template.content !== 'string' || !template.content.trim()) {
            errors.push('提示词正文必须是非空字符串');
        }
        if (template.id !== undefined) {
            if (typeof template.id !== 'string' || !template.id) {
                errors.push('提示词 id 必须是非空字符串');
            } else if (!items.some(item => item.id === template.id)) {
                errors.push('提示词不存在');
            }
        }
        const metadata = getMetadata(template.category, template, items.find(item => item.id === template.id));
        if (!['system', 'user'].includes(metadata.target)) {
            errors.push('提示词 target 仅支持 system 或 user');
        } else if (template.category === 'jailbreak' && metadata.target !== 'system') {
            errors.push('破限词 target 必须为 system');
        }
        if (typeof metadata.anchor !== 'string'
            || !/^(?:start|end|before_task|last|depth_[0-9]+)(?![\s\S])/u.test(metadata.anchor)) {
            errors.push('提示词 anchor 仅支持 start、end、before_task、last 或 depth_数字');
        }
        if (!Number.isFinite(metadata.priority)) {
            errors.push('提示词 priority 必须是有限数值');
        }
    }
    return { valid: errors.length === 0, errors, warnings: [] };
}

export function getPromptTemplates(category) {
    assertCategory(category);
    const group = readSettings().prompts[category];
    // 旧记录在返回快照中补齐；查询不触发保存。
    group.items = group.items.map(record => ({ ...record, ...getMetadata(category, record) }));
    return group;
}

export function validatePromptTemplate(template) {
    return validateTemplate(template, readSettings());
}

export function savePromptTemplate(template) {
    return updateSettings(settings => {
        // 在最新快照上校验，失败时由共享设置层取消写入。
        const result = validateTemplate(template, settings);
        if (!result.valid) throw new Error(result.errors.join('；'));
        const group = settings.prompts[template.category];
        const record = {
            id: template.id ?? createRecordId(),
            name: template.name.trim(),
            // 正文按原文保存，包括空格、换行和标记。
            content: template.content,
            ...getMetadata(template.category, template, group.items.find(item => item.id === template.id)),
        };
        if (template.id === undefined) group.items.push(record);
        else group.items[findRecordIndex(group.items, template.id)] = record;
        return record;
    });
}

export function deletePromptTemplate(category, id) {
    assertCategory(category);
    return updateSettings(settings => {
        const group = settings.prompts[category];
        group.items.splice(findRecordIndex(group.items, id), 1);
        if (group.activeId === id) group.activeId = null;
        return true;
    });
}

export function selectPromptTemplate(category, id = null) {
    assertCategory(category);
    return updateSettings(settings => {
        const group = settings.prompts[category];
        const record = id === null ? null : group.items[findRecordIndex(group.items, id)];
        group.activeId = id;
        return record?.content ?? null;
    });
}

export function getActivePrompt(category) {
    const group = getPromptTemplates(category);
    return group.items.find(item => item.id === group.activeId)?.content ?? null;
}
