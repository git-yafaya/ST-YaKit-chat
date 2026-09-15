import { readSettings, updateSettings } from '../../shared/settings.js';
import { ASSISTANT_RULES } from '../../shared/assistant-prompts.js';
import { defaultContent } from '../../shared/builtin-prompts.js';

const names = { jailbreak: '通用破限词', regex: '正则提示词', polish: '润色提示词' };
const defaults = { jailbreak: defaultContent, ...ASSISTANT_RULES };

function assertId(id) {
    if (!Object.hasOwn(names, id)) throw new Error('请选择固定提示词');
}

export function listCorePrompts() {
    const settings = readSettings();
    return Object.entries(names).map(([id, name]) => {
        const text = id === 'jailbreak'
            ? settings.prompts.jailbreak.items.find(item => item.id === 'builtin-jailbreak-universal').content
            : settings.corePrompts?.[id] ?? defaults[id];
        return { id, name, target: id === 'jailbreak' ? 'system' : 'user', text, defaultText: defaults[id], modified: text !== defaults[id] };
    });
}

export function saveCorePrompt(id, text) {
    assertId(id);
    if (typeof text !== 'string' || (id !== 'jailbreak' && !text.trim())) throw new Error('请填写提示词正文');
    return updateSettings(settings => {
        if (id === 'jailbreak') {
            const record = settings.prompts.jailbreak.items.find(item => item.id === 'builtin-jailbreak-universal');
            record.content = text;
            record.contentEdited = true;
        } else {
            settings.corePrompts ??= {};
            settings.corePrompts[id] = text;
        }
        return { id, name: names[id], target: id === 'jailbreak' ? 'system' : 'user', text, defaultText: defaults[id], modified: text !== defaults[id] };
    });
}

export function resetCorePrompt(id) {
    assertId(id);
    return saveCorePrompt(id, defaults[id]);
}
