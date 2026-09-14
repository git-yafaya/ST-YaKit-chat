import {
    getPromptTemplates, savePromptTemplate, selectPromptTemplate, deletePromptTemplate,
} from '../prompt-management/index.js';
import { createDuplicateName, validateRecordName } from '../../shared/validation.js';
import { isBuiltinJailbreak } from '../../shared/builtin-prompts.js';

function categoryFor(kind) {
    if (!['jailbreak', 'constraint', 'style'].includes(kind)) {
        throw new Error('请选择提示词类型');
    }
    return kind === 'constraint' ? 'regex' : kind;
}

function findRecord(group, id) {
    if (typeof id !== 'string' || !id) throw new Error('请重新选择提示词');
    const record = group.items.find(item => item.id === id);
    if (!record) throw new Error('找不到这条提示词，请刷新后重试');
    return record;
}

function publicRecord(category, record) {
    return {
        id: record.id, name: record.name, target: record.target, text: record.content,
        builtin: isBuiltinJailbreak(category, record.id),
    };
}

function inspectDraft(kind, draft) {
    const category = categoryFor(kind);
    if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
        throw new Error('请重新打开提示词编辑后重试');
    }
    const group = getPromptTemplates(category);
    if (draft.id !== undefined) findRecord(group, draft.id);
    if (category !== 'jailbreak' && draft.target !== undefined && !['system', 'user'].includes(draft.target)) {
        throw new Error('请重新选择注入位置');
    }
    const errors = {};
    const names = validateRecordName(draft.name, group.items, draft.id, '已有同名提示词');
    if (names.length) errors.name = names.join('；');
    if (typeof draft.text !== 'string'
        || (!draft.text.trim() && !isBuiltinJailbreak(category, draft.id))) errors.text = '请填写正文';
    return { category, errors };
}

export function listPrompts(kind) {
    const category = categoryFor(kind);
    return getPromptTemplates(category).items.map(record => publicRecord(category, record));
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
    return publicRecord(category, savePromptTemplate({
        category, id: draft.id, name: draft.name, content: draft.text,
        target: category === 'jailbreak' ? 'system' : draft.target,
    }));
}

export function duplicatePrompt(kind, id) {
    const category = categoryFor(kind);
    const group = getPromptTemplates(category);
    const record = findRecord(group, id);
    if (isBuiltinJailbreak(category, id) && !record.content.trim()) throw new Error('请先填写正文再复制');
    const name = createDuplicateName(record.name, group.items);
    return publicRecord(category, savePromptTemplate({
        ...record, category, id: undefined, name,
        target: category === 'jailbreak' ? 'system' : record.target,
    }));
}

export function removePrompt(kind, id) {
    return deletePromptTemplate(categoryFor(kind), id);
}
