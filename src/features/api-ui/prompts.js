import {
    getPromptTemplates, savePromptTemplate, selectPromptTemplate, deletePromptTemplate,
} from '../prompt-management/index.js';
import { createDuplicateName, validateRecordName } from '../../shared/validation.js';

function categoryFor(kind) {
    if (!['jailbreak', 'constraint', 'style'].includes(kind)) {
        throw new Error('提示词类别仅支持 jailbreak、constraint 或 style');
    }
    return kind === 'constraint' ? 'regex' : kind;
}

function findRecord(group, id) {
    if (typeof id !== 'string' || !id) throw new Error('提示词标识必须是非空字符串');
    const record = group.items.find(item => item.id === id);
    if (!record) throw new Error('提示词不存在');
    return record;
}

function publicRecord(record) {
    return { id: record.id, name: record.name, target: record.target, text: record.content };
}

function inspectDraft(kind, draft) {
    const category = categoryFor(kind);
    if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
        throw new Error('提示词必须是对象');
    }
    const group = getPromptTemplates(category);
    if (draft.id !== undefined) findRecord(group, draft.id);
    if (category !== 'jailbreak' && draft.target !== undefined && !['system', 'user'].includes(draft.target)) {
        throw new Error('提示词注入位置仅支持 system 或 user');
    }
    const errors = {};
    const names = validateRecordName(draft.name, group.items, draft.id);
    if (names.length) errors.name = names.join('；');
    if (typeof draft.text !== 'string' || !draft.text.trim()) errors.text = '提示词正文不能为空';
    return { category, errors };
}

export function listPrompts(kind) {
    return getPromptTemplates(categoryFor(kind)).items.map(publicRecord);
}

export function getActivePromptId(kind) {
    return getPromptTemplates(categoryFor(kind)).activeId;
}

export function activatePrompt(kind, id) {
    const category = categoryFor(kind);
    if (id !== null) findRecord(getPromptTemplates(category), id);
    selectPromptTemplate(category, id);
    return id;
}

export function checkPrompt(kind, draft) {
    return { errors: inspectDraft(kind, draft).errors };
}

export function savePrompt(kind, draft) {
    const { category, errors } = inspectDraft(kind, draft);
    if (Object.keys(errors).length) throw new Error(Object.values(errors).join('；'));
    // 只传界面字段，其余元数据由原管理模块保留。
    return publicRecord(savePromptTemplate({
        category, id: draft.id, name: draft.name, content: draft.text,
        target: category === 'jailbreak' ? 'system' : draft.target,
    }));
}

export function duplicatePrompt(kind, id) {
    const category = categoryFor(kind);
    const group = getPromptTemplates(category);
    const record = findRecord(group, id);
    const name = createDuplicateName(record.name, group.items);
    return publicRecord(savePromptTemplate({
        ...record, category, id: undefined, name,
        target: category === 'jailbreak' ? 'system' : record.target,
    }));
}

export function removePrompt(kind, id) {
    return deletePromptTemplate(categoryFor(kind), id);
}
