import { readSettings, updateSettings } from '../../shared/settings.js';
import { ASSISTANT_RULES } from '../../shared/assistant-prompts.js';
import { defaultContent, assistGroupKey, assistBuiltinId } from '../../shared/builtin-prompts.js';

const names = { jailbreak: '通用破限词', regex: '正则提示词', polish: '润色提示词' };
const defaults = { jailbreak: defaultContent, ...ASSISTANT_RULES };

function assertId(id) {
    if (!Object.hasOwn(names, id)) throw new Error('请选择固定提示词');
}

// 三类各是一个提示词库，这里取每一类正在用的那条
function groupOf(settings, id) {
    return id === 'jailbreak' ? settings.prompts.jailbreak : settings.prompts[assistGroupKey(id)];
}

function activeRecord(settings, id) {
    const group = groupOf(settings, id);
    const builtin = id === 'jailbreak' ? 'builtin-jailbreak-universal' : assistBuiltinId(id);
    return group.items.find(item => item.id === group.activeId)
        ?? group.items.find(item => item.id === builtin);
}

function publicPrompt(id, record) {
    const text = record?.content ?? defaults[id];
    return {
        id,
        name: record?.name ?? names[id],
        target: id === 'jailbreak' ? 'system' : 'user',
        text,
        defaultText: defaults[id],
        modified: text !== defaults[id],
    };
}

export function listCorePrompts() {
    const settings = readSettings();
    return Object.keys(names).map(id => publicPrompt(id, activeRecord(settings, id)));
}

export function saveCorePrompt(id, text) {
    assertId(id);
    if (typeof text !== 'string' || (id !== 'jailbreak' && !text.trim())) throw new Error('请填写提示词正文');
    return updateSettings(settings => {
        const record = activeRecord(settings, id);
        if (!record) throw new Error('找不到这条提示词，请刷新后重试');
        record.content = text;
        record.contentEdited = true;
        return publicPrompt(id, record);
    });
}

export function resetCorePrompt(id) {
    assertId(id);
    return saveCorePrompt(id, defaults[id]);
}
