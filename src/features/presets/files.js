import { readSettings, updateSettings } from '../../shared/settings.js';
import { createExportFilename } from '../text-export/export-common.js';
import { normalizeSettings } from '../text-export/export-ui-settings.js';
import { normalizeName, normalizeContent, normalizeCollection, cloneUiPrefs } from './schema.js';
import { list, create } from './store.js';

function parseFile(text, type) {
    if (typeof text !== 'string') throw new Error();
    const value = JSON.parse(text.replace(/^\uFEFF/, ''));
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || value.type !== `ST-YaKit-chat/${type}` || value.schemaVersion !== 1) {
        throw new Error();
    }
    return value;
}

async function downloadFile(value, filename) {
    const text = JSON.stringify(value, null, 2);
    const { download } = await import('/scripts/utils.js');
    download(text, filename, 'application/json;charset=utf-8');
    return { filename };
}

export async function exportPreset(id) {
    const preset = (await list()).find(item => item.id === id);
    if (!preset) throw new Error('预设不存在');
    return downloadFile({
        type: 'ST-YaKit-chat/preset',
        schemaVersion: 1,
        name: preset.name,
        content: preset.content,
    }, createExportFilename(preset.name, 'yakit-preset.json'));
}

export async function importPreset(text) {
    let name;
    let content;
    try {
        const value = parseFile(text, 'preset');
        if (!Object.hasOwn(value, 'name') || !Object.hasOwn(value, 'content')) throw new Error();
        name = normalizeName(value.name);
        content = normalizeContent(value.content);
    } catch {
        throw new Error('这不是纪实的预设文件');
    }
    // 校验结束后再追加，由存储模块生成新 id 和处理重名。
    return create(name, content);
}

export async function exportBackup(uiPrefs) {
    const settings = readSettings();
    return downloadFile({
        type: 'ST-YaKit-chat/backup',
        schemaVersion: 1,
        presets: normalizeCollection(settings.presets),
        exportSettings: normalizeSettings(settings.exportUI),
        uiPrefs: cloneUiPrefs(uiPrefs),
    }, createExportFilename('纪实备份', 'yakit-backup.json'));
}

export function restoreBackup(text) {
    let presets;
    let exportSettings;
    let uiPrefs;
    try {
        const value = parseFile(text, 'backup');
        if (!['presets', 'exportSettings', 'uiPrefs'].every(key => Object.hasOwn(value, key))) throw new Error();
        const saved = value.exportSettings;
        // 文件里的导出设置必须完整，不能把缺失字段静默补成默认值。
        if (!saved || !['allFloors', 'start', 'end', 'types', 'format', 'labels', 'fileName', 'mode', 'rules']
            .every(key => Object.hasOwn(saved, key))
            || !saved.types || !['ai', 'user', 'system'].every(key => Object.hasOwn(saved.types, key))) {
            throw new Error();
        }
        presets = normalizeCollection(value.presets);
        exportSettings = normalizeSettings(saved);
        uiPrefs = cloneUiPrefs(value.uiPrefs);
    } catch {
        throw new Error('这不是纪实的备份文件');
    }
    // 只替换备份约定的两组业务设置；共享保存失败时会回滚。
    return updateSettings(settings => {
        settings.presets = presets;
        settings.exportUI = exportSettings;
        return { presetCount: presets.items.length, uiPrefs };
    });
}
