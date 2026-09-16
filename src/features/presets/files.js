import { styles, normalizeStyles } from '../styles/index.js';
import { listCorePrompts } from '../api-ui/core-prompts.js';
import { readSettings, updateSettings } from '../../shared/settings.js';
import { createExportFilename } from '../text-export/export-common.js';
import { normalizeSettings } from '../text-export/export-ui-settings.js';
import { normalizeName, normalizeContent, normalizeCollection, cloneUiPrefs } from './schema.js';
import { list, create } from './store.js';
import { assistGroupKey, assistBuiltinId } from '../../shared/builtin-prompts.js';

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
    // 单套文件保留预设原名，只替换文件名非法字符。
    const filename = `${preset.name.replace(/[<>:"/\\|?*\u0000-\u001f\u007f-\u009f]/g, '_')}.yakit-preset.json`;
    return downloadFile({
        type: 'ST-YaKit-chat/preset',
        schemaVersion: 1,
        name: preset.name,
        content: preset.content,
    }, filename);
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

// 破限词、正则助手、润色助手各是一个提示词库
const PROMPT_KINDS = ['jailbreak', 'regex', 'polish'];
const libraryKey = (kind) => (kind === 'jailbreak' ? 'jailbreak' : assistGroupKey(kind));

function libraryOf(settings, kind) {
    const group = settings.prompts[libraryKey(kind)];
    return {
        activeId: group.activeId,
        items: group.items.map(item => ({ id: item.id, name: item.name, text: item.content })),
    };
}

function readLibraries(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return Object.fromEntries(PROMPT_KINDS.map(kind => {
        const group = value[kind];
        if (!group || typeof group !== 'object' || !Array.isArray(group.items)
            || !(group.activeId === null || typeof group.activeId === 'string')) throw new Error();
        const items = group.items.map(item => {
            if (!item || typeof item.id !== 'string' || !item.id.trim()
                || typeof item.name !== 'string' || !item.name.trim() || typeof item.text !== 'string') throw new Error();
            return { id: item.id, name: item.name.trim(), content: item.text };
        });
        if (new Set(items.map(item => item.id)).size !== items.length) throw new Error();
        if (!items.some(item => item.id === assistBuiltinId(kind) || item.id === 'builtin-jailbreak-universal')) throw new Error();
        return [kind, { items, activeId: group.activeId }];
    }));
}

export async function exportBackup(uiPrefs) {
    const settings = readSettings();
    return downloadFile({
        type: 'ST-YaKit-chat/backup',
        schemaVersion: 1,
        presets: normalizeCollection(settings.presets),
        exportSettings: normalizeSettings(settings.exportUI),
        uiPrefs: cloneUiPrefs(uiPrefs),
        styles: { items: styles.list(), activeId: styles.getActiveId() },
        corePrompts: Object.fromEntries(listCorePrompts().map(item => [item.id, item.text])),
        // 三类提示词各自的整个库（自己建的那些也一起备份）
        promptLibraries: Object.fromEntries(PROMPT_KINDS.map(kind => [kind, libraryOf(settings, kind)])),
    }, createExportFilename('纪实备份', 'yakit-backup.json'));
}

export function restoreBackup(text) {
    let presets;
    let exportSettings;
    let uiPrefs;
    let stylePresets;
    let corePrompts;
    let libraries;
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
        if (Object.hasOwn(value, 'styles')) stylePresets = normalizeStyles(value.styles);
        if (Object.hasOwn(value, 'corePrompts')) {
            const prompts = value.corePrompts;
            if (!prompts || !['jailbreak', 'regex', 'polish'].every(id => typeof prompts[id] === 'string'
                && (id === 'jailbreak' || prompts[id].trim()))) throw new Error();
            corePrompts = Object.fromEntries(['jailbreak', 'regex', 'polish'].map(id => [id, prompts[id]]));
        }
        if (Object.hasOwn(value, 'promptLibraries')) libraries = readLibraries(value.promptLibraries);
    } catch {
        throw new Error('这不是纪实的备份文件');
    }
    // 旧备份缺少新字段时保留本机数据；全部校验后在同一事务恢复。
    return updateSettings(settings => {
        settings.presets = presets;
        settings.exportUI = exportSettings;
        if (stylePresets) {
            settings.prompts.style = { activeId: stylePresets.activeId,
                items: stylePresets.items.map(({ id, name, text }) => ({ id, name, content: text, target: 'user' })) };
            settings.styleSelectionMigrated = true;
        }
        // 新备份带整个提示词库就整库恢复；旧备份只有三条正文，写进各自正在用的那条
        if (libraries) {
            for (const kind of PROMPT_KINDS) {
                const group = libraries[kind];
                settings.prompts[libraryKey(kind)] = {
                    activeId: group.activeId,
                    items: group.items.map(item => ({
                        ...item,
                        contentEdited: true,
                        ...(kind === 'jailbreak'
                            ? { target: 'system', anchor: 'start', priority: 100 }
                            : { target: 'user', anchor: 'end', priority: 50 }),
                    })),
                };
            }
        } else if (corePrompts) {
            for (const kind of PROMPT_KINDS) {
                const group = settings.prompts[libraryKey(kind)];
                const builtin = kind === 'jailbreak' ? 'builtin-jailbreak-universal' : assistBuiltinId(kind);
                const record = group.items.find(item => item.id === group.activeId)
                    ?? group.items.find(item => item.id === builtin);
                record.content = corePrompts[kind];
                record.contentEdited = true;
            }
        }
        return { presetCount: presets.items.length, uiPrefs };
    });
}
