// 两类具名记录使用同一套名称规则。
export function validateRecordName(name, items, id) {
    if (typeof name !== 'string') return ['名称必须是字符串'];
    const value = name.trim();
    const errors = [];
    if (value.length < 1 || value.length > 64) errors.push('名称长度必须为 1–64');
    if (/[\u0000-\u001f\u007f-\u009f]/u.test(name)) errors.push('名称不能包含控制字符');
    if (items.some(item => item.id !== id && item.name.trim().toLowerCase() === value.toLowerCase())) {
        errors.push('名称已存在，请使用其他名称');
    }
    return errors;
}

// 随机标识不随名称变化，也可用于通过 HTTP 打开的酒馆。
export function createRecordId() {
    return crypto.getRandomValues(new Uint32Array(4)).join('-');
}

// 副本统一避开同名，给后缀留长度且不截断代理对。
export function createDuplicateName(name, items) {
    const names = new Set(items.map(item => item.name.trim().toLowerCase()));
    for (let number = 1; ; number++) {
        const suffix = number === 1 ? ' 副本' : ` 副本(${number})`;
        const prefix = name.slice(0, 64 - suffix.length).replace(/[\uD800-\uDBFF]$/u, '').trimEnd();
        const candidate = `${prefix}${suffix}`;
        if (!names.has(candidate.toLowerCase())) return candidate;
    }
}
