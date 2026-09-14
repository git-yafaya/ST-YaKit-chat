const builtinNames = {
    'builtin-jailbreak-gemini': 'Gemini',
    'builtin-jailbreak-deepseek': 'DeepSeek',
};

export function isBuiltinJailbreak(category, id) {
    return category === 'jailbreak' && typeof id === 'string' && Object.hasOwn(builtinNames, id);
}

// 只补缺失记录，用户改过的名字、正文和当前选择都保留。
export function ensureBuiltinJailbreaks(settings) {
    settings.prompts ??= {};
    const group = settings.prompts.jailbreak ??= { items: [], activeId: null };
    const names = new Set(group.items.map(item => item.name.trim().toLowerCase()));
    for (const [id, baseName] of Object.entries(builtinNames)) {
        if (group.items.some(item => item.id === id)) continue;
        let name = baseName;
        for (let number = 2; names.has(name.toLowerCase()); number++) name = `${baseName}(${number})`;
        group.items.push({ id, name, content: '', target: 'system', anchor: 'start', priority: 100 });
        names.add(name.toLowerCase());
    }
}
