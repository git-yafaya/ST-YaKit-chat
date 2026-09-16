import { updateSettings } from '../../shared/settings.js';
import { normalizeSettings } from '../text-export/export-ui-settings.js';
import { normalizeContent, normalizeCollection } from './schema.js';
import { createRecordId } from '../../shared/validation.js';

// 替换成 HTML、CSS 或多行内容的是美化规则：导出只要正文，这类整块删掉，不进替换组。
function isMarkup(to) {
    return /[<>{}]|```|\n/.test(to) || Array.from(to).length > 100;
}

// 按酒馆里的替换内容分流：
// 空替换或美化类（HTML/CSS/多行）= 删除组；纯文字替换 = 替换组；
// 只写 $1 / {{match}} 的「只保留某段」规则多是清空历史用的，套到导出会把正文删光，跳过不导入；
// 只影响发给模型的内容（promptOnly）和不作用于消息正文的（斜杠命令、世界书、思考）也跳过。
export function classify(script) {
    const find = typeof script?.findRegex === 'string' ? script.findRegex.trim() : '';
    if (!find) return null;
    const placement = Array.isArray(script?.placement) ? script.placement : [];
    if (placement.length && !placement.some(item => item === 1 || item === 2)) return { group: 'skip', reason: 'scope' };
    if (script?.promptOnly) return { group: 'skip', reason: 'prompt' };
    const to = typeof script?.replaceString === 'string' ? script.replaceString : '';
    if (!to.trim()) return { group: 'delete', rule: find };
    if (/^(\$\d+|\{\{match\}\})$/.test(to.trim())) return { group: 'skip', reason: 'keep' };
    return isMarkup(to) ? { group: 'delete', rule: find } : { group: 'replace', rule: { find, to } };
}

// 从酒馆正则扩展读取全部规则（含已关闭的），按类别存成导出预设，同名覆盖。
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
        const found = { delete: [], replace: [], skipped: 0 };
        let scripts;
        try {
            scripts = engine.getScriptsByType(type, { allowedOnly: false });
        } catch {
            return found;
        }
        for (const script of Array.isArray(scripts) ? scripts : []) {
            const item = classify(script);
            if (!item) continue;
            if (item.group === 'skip') found.skipped++;
            else found[item.group].push(item.rule);
        }
        return found;
    };
    const presetName = (() => { try { return engine.getCurrentPresetName?.() || ''; } catch { return ''; } })();
    const characterName = context?.characterId != null ? context.characters?.[context.characterId]?.name || '' : '';
    const empty = { delete: [], replace: [], skipped: 0 };
    const groups = [
        { kind: 'global', name: '全局正则', found: read(types.GLOBAL) },
        { kind: 'preset', name: presetName ? `预设正则 · ${presetName}` : '预设正则', found: read(types.PRESET) },
        { kind: 'scoped', name: characterName ? `局部正则 · ${characterName}` : '', found: characterName ? read(types.SCOPED) : empty },
    ];
    const saved = [];
    updateSettings(settings => {
        const collection = normalizeCollection(settings.presets);
        const current = normalizeSettings(settings.exportUI ?? {});
        for (const group of groups) {
            const rules = [...new Set(group.found.delete)];
            const seen = new Set();
            const replaceRules = group.found.replace.filter(rule => {
                const key = JSON.stringify([rule.find, rule.to]);
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
            const counts = { delete: rules.length, replace: replaceRules.length };
            const count = rules.length + replaceRules.length;
            if (!group.name || !count) continue;
            const existing = collection.items.find(item => item.name === group.name);
            // 覆盖时只换删除组和替换组，保留这套预设原来的保留组、消息类型和格式；新建时沿用导出页当前设置。
            const base = existing?.content ?? current;
            const content = normalizeContent({ ...base, mode: 'delete', rules, replaceRules, keepRules: existing?.content.keepRules ?? [] });
            if (existing) existing.content = content;
            else collection.items.push({ id: createRecordId(), name: group.name, content });
            saved.push({ kind: group.kind, name: group.name, count, counts, skipped: group.found.skipped, updated: Boolean(existing) });
        }
        settings.presets = collection;
    });
    return { saved };
}
