import { updateSettings } from '../../shared/settings.js';
import { normalizeSettings } from '../text-export/export-ui-settings.js';
import { normalizeContent, normalizeCollection } from './schema.js';
import { createRecordId } from '../../shared/validation.js';

// 从酒馆正则扩展读取规则（含已关闭和美化替换类，只取查找正则），按类别存成导出预设，同名覆盖。
export async function fetchHostRegex() {
    let engine;
    try {
        engine = await import('/scripts/extensions/regex/engine.js');
    } catch {
        throw new Error('读取酒馆正则失败，请确认酒馆的正则扩展已启用');
    }
    const context = globalThis.SillyTavern?.getContext?.();
    const types = engine.SCRIPT_TYPES ?? { GLOBAL: 0, SCOPED: 1, PRESET: 2 };
    const read = type => {
        try {
            const scripts = engine.getScriptsByType(type, { allowedOnly: false });
            return (Array.isArray(scripts) ? scripts : [])
                .map(script => (typeof script?.findRegex === 'string' ? script.findRegex.trim() : ''))
                .filter(Boolean);
        } catch {
            return [];
        }
    };
    const presetName = (() => { try { return engine.getCurrentPresetName?.() || ''; } catch { return ''; } })();
    const characterName = context?.characterId != null ? context.characters?.[context.characterId]?.name || '' : '';
    const groups = [
        { kind: 'global', name: '全局正则', rules: read(types.GLOBAL) },
        { kind: 'preset', name: presetName ? `预设正则 · ${presetName}` : '预设正则', rules: read(types.PRESET) },
        { kind: 'scoped', name: characterName ? `局部正则 · ${characterName}` : '', rules: characterName ? read(types.SCOPED) : [] },
    ];
    const saved = [];
    updateSettings(settings => {
        const collection = normalizeCollection(settings.presets);
        const current = normalizeSettings(settings.exportUI ?? {});
        for (const group of groups) {
            if (!group.name || !group.rules.length) continue;
            const rules = [...new Set(group.rules)];
            const existing = collection.items.find(item => item.name === group.name);
            // 覆盖时只换规则和匹配方式，保留这套预设原来的消息类型和格式；新建时沿用导出页当前设置。
            const base = existing?.content ?? current;
            const content = normalizeContent({ ...base, types: base.types, format: base.format, labels: base.labels, mode: 'delete', rules });
            if (existing) existing.content = content;
            else collection.items.push({ id: createRecordId(), name: group.name, content });
            saved.push({ kind: group.kind, name: group.name, count: rules.length, updated: Boolean(existing) });
        }
        settings.presets = collection;
    });
    return { saved };
}
