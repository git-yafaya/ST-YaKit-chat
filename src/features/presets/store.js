import { readSettings, updateSettings } from '../../shared/settings.js';
import { createRecordId } from '../../shared/validation.js';
import { normalizeSettings } from '../text-export/export-ui-settings.js';
import { normalizeContent, normalizeName, normalizeCollection } from './schema.js';

function changeCollection(change) {
    return updateSettings(settings => {
        const collection = normalizeCollection(settings.presets);
        const result = change(collection, settings);
        settings.presets = collection;
        return result;
    });
}

function findRecord(collection, id) {
    const record = collection.items.find(item => item.id === id);
    if (!record) throw new Error('找不到指定预设');
    return record;
}

function addRecord(collection, name, content) {
    const base = normalizeName(name);
    const normalized = normalizeContent(content);
    const names = new Set(collection.items.map(item => item.name));
    let candidate = base;
    for (let suffix = 2; names.has(candidate); suffix++) candidate = `${base}(${suffix})`;
    const id = createRecordId();
    if (collection.items.some(item => item.id === id)) {
        throw new Error('生成的预设标识重复，请重试');
    }
    const record = { id, name: candidate, content: normalized };
    collection.items.push(record);
    return record;
}

export function list() {
    return normalizeCollection(readSettings().presets).items;
}

export function getActiveId() {
    return normalizeCollection(readSettings().presets).activeId;
}

export function activate(id) {
    return changeCollection((collection, settings) => {
        const current = normalizeSettings(settings.exportUI);
        if (id === null) {
            collection.activeId = null;
            return current;
        }
        const record = findRecord(collection, id);
        // 只覆盖预设的五项内容，楼层范围和文件名沿用当前设置。
        settings.exportUI = normalizeSettings({ ...current, ...record.content });
        collection.activeId = record.id;
        return settings.exportUI;
    });
}

export function create(name, content) {
    return changeCollection(collection => addRecord(collection, name, content));
}

export function update(id, content) {
    return changeCollection(collection => {
        const record = findRecord(collection, id);
        record.content = normalizeContent(content);
        return record;
    });
}

export function rename(id, name) {
    return changeCollection(collection => {
        const record = findRecord(collection, id);
        const normalized = normalizeName(name);
        if (collection.items.some(item => item.id !== id && item.name === normalized)) {
            throw new Error('已有同名预设');
        }
        record.name = normalized;
        return record;
    });
}

export function duplicate(id) {
    return changeCollection(collection => {
        const record = findRecord(collection, id);
        return addRecord(collection, `${record.name} 副本`, record.content);
    });
}

export function remove(id) {
    return changeCollection(collection => {
        const record = findRecord(collection, id);
        collection.items.splice(collection.items.indexOf(record), 1);
        if (collection.activeId === id) collection.activeId = null;
        return true;
    });
}

export function suggestName() {
    const context = globalThis.SillyTavern?.getContext?.();
    if (context?.characterId == null || !Array.isArray(context?.chat)) return '';
    const name = context.characters?.[context.characterId]?.name;
    return typeof name === 'string' ? name.trim() : '';
}
