import { updateSettings } from '../../shared/settings.js';
import { normalizeSettings } from '../text-export/export-ui-settings.js';
import { normalizeContent, normalizeCollection } from './schema.js';
import { createRecordId } from '../../shared/validation.js';

// 取第一个捕获组的位置：酒馆里「替换成 $1」等于只保留这一组，转成保留组规则。
export function firstGroupRange(pattern) {
    for (let i = 0; i < pattern.length; i++) {
        const ch = pattern[i];
        if (ch === '\\') { i++; continue; }
        if (ch === '[') {
            while (i < pattern.length && pattern[i] !== ']') { if (pattern[i] === '\\') i++; i++; }
            continue;
        }
        if (ch !== '(') continue;
        // 跳过非捕获组和断言；命名捕获组算捕获组
        const rest = pattern.slice(i);
        if (/^\(\?[:=!]/.test(rest) || /^\(\?<[=!]/.test(rest)) continue;
        let level = 0;
        for (let j = i; j < pattern.length; j++) {
            const inner = pattern[j];
            if (inner === '\\') { j++; continue; }
            if (inner === '[') {
                while (j < pattern.length && pattern[j] !== ']') { if (pattern[j] === '\\') j++; j++; }
                continue;
            }
            if (inner === '(') level++;
            else if (inner === ')') {
                level--;
                if (level === 0) {
                    const body = pattern.slice(i + 1, j);
                    const named = /^\?<[^>]+>/.exec(body);
                    return { start: i + 1 + (named ? named[0].length : 0), end: j };
                }
            }
        }
        return null;
    }
    return null;
}

// 按酒馆里的替换内容分流：空替换 = 删除组；只写 $1 或 {{match}} = 保留组（取捕获组）；其他 = 替换组。
export function classify(script) {
    const find = typeof script?.findRegex === 'string' ? script.findRegex.trim() : '';
    if (!find) return null;
    const to = typeof script?.replaceString === 'string' ? script.replaceString : '';
    if (!to.trim()) return { group: 'delete', rule: find };
    if (!/^(\$\d+|\{\{match\}\})$/.test(to.trim())) return { group: 'replace', rule: { find, to } };
    const slash = find.startsWith('/') && find.lastIndexOf('/') > 0;
    const pattern = slash ? find.slice(1, find.lastIndexOf('/')) : find;
    const flags = slash ? find.slice(find.lastIndexOf('/') + 1) : '';
    if (to.trim() === '{{match}}') return { group: 'keep', rule: find };
    const range = firstGroupRange(pattern);
    if (!range) return { group: 'keep', rule: find };
    // 只保留捕获组：用前后文做断言，留下的就是原来替换成 $1 的那段
    const before = pattern.slice(0, range.start - 1).replace(/\($/, '');
    const after = pattern.slice(range.end + 1);
    const inner = pattern.slice(range.start, range.end);
    const guarded = `${before ? `(?<=${before})` : ''}${inner}${after ? `(?=${after})` : ''}`;
    const usable = (() => {
        try {
            new RegExp(guarded, flags.includes('g') ? flags : `${flags}g`);
            return guarded;
        } catch {
            return inner;
        }
    })();
    return { group: 'keep', rule: slash ? `/${usable}/${flags}` : usable };
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
        const found = { delete: [], keep: [], replace: [] };
        let scripts;
        try {
            scripts = engine.getScriptsByType(type, { allowedOnly: false });
        } catch {
            return found;
        }
        for (const script of Array.isArray(scripts) ? scripts : []) {
            const item = classify(script);
            if (item) found[item.group].push(item.rule);
        }
        return found;
    };
    const presetName = (() => { try { return engine.getCurrentPresetName?.() || ''; } catch { return ''; } })();
    const characterName = context?.characterId != null ? context.characters?.[context.characterId]?.name || '' : '';
    const empty = { delete: [], keep: [], replace: [] };
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
            const keepRules = [...new Set(group.found.keep)];
            const seen = new Set();
            const replaceRules = group.found.replace.filter(rule => {
                const key = JSON.stringify([rule.find, rule.to]);
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
            const counts = { delete: rules.length, keep: keepRules.length, replace: replaceRules.length };
            const count = rules.length + keepRules.length + replaceRules.length;
            if (!group.name || !count) continue;
            const existing = collection.items.find(item => item.name === group.name);
            // 覆盖时只换三组规则，保留这套预设原来的消息类型和格式；新建时沿用导出页当前设置。
            const base = existing?.content ?? current;
            const content = normalizeContent({ ...base, mode: 'delete', rules, keepRules, replaceRules });
            if (existing) existing.content = content;
            else collection.items.push({ id: createRecordId(), name: group.name, content });
            saved.push({ kind: group.kind, name: group.name, count, counts, updated: Boolean(existing) });
        }
        settings.presets = collection;
    });
    return { saved };
}
