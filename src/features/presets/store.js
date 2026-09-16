import { readSettings, updateSettings } from '../../shared/settings.js';
import { createRecordId } from '../../shared/validation.js';
import { normalizeSettings } from '../text-export/export-ui-settings.js';
import { normalizeContent, normalizeName, normalizeCollection, mergeContents } from './schema.js';

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

export function getActiveIds() {
    return normalizeCollection(readSettings().presets).activeIds;
}

// 传一个 id、一组 id 或 null；多套时按预设在列表里的先后叠加。
export function activate(ids) {
    const wanted = ids === null ? [] : (Array.isArray(ids) ? [...ids] : [ids]);
    return changeCollection((collection, settings) => {
        const current = normalizeSettings(settings.exportUI);
        if (!wanted.length) {
            collection.activeIds = [];
            return current;
        }
        for (const id of wanted) findRecord(collection, id);
        const chosen = new Set(wanted);
        const records = collection.items.filter(item => chosen.has(item.id));
        // 只覆盖预设内容，楼层范围和文件名沿用当前设置。
        settings.exportUI = normalizeSettings({ ...current, ...mergeContents(records.map(record => record.content)) });
        collection.activeIds = records.map(record => record.id);
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
        collection.activeIds = collection.activeIds.filter(active => active !== id);
        return true;
    });
}

export function suggestName() {
    const context = globalThis.SillyTavern?.getContext?.();
    if (context?.characterId == null || !Array.isArray(context?.chat)) return '';
    const name = context.characters?.[context.characterId]?.name;
    return typeof name === 'string' ? name.trim() : '';
}
