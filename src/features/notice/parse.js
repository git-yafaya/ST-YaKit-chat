const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function isValidVersion(value) {
    return typeof value === 'string' && VERSION.exec(value)?.[0] === value;
}

// 逐段比较整数，避免位数较大时丢失精度。
export function compareVersions(a, b) {
    if (!isValidVersion(a) || !isValidVersion(b)) {
        throw new Error('当前插件版本号格式不正确，无法比较更新公告');
    }
    const left = a.split('.').map(BigInt);
    const right = b.split('.').map(BigInt);
    for (let i = 0; i < left.length; i++) {
        if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
    }
    return 0;
}

function isValidDate(value) {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseNotices(text) {
    if (typeof text !== 'string') throw new Error('公告内容格式不正确，无法读取');
    const entries = new Map();
    let current = null;
    const finish = () => {
        if (current?.lines.length && !entries.has(current.version)) entries.set(current.version, current);
    };

    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (/^##(?:\s|$)/.test(line)) {
            finish();
            current = null;
            // 坏标题也结束上一块，防止把坏块正文混进有效公告。
            const match = /^## v(\S+)(?: · (\d{4}-\d{2}-\d{2}))?$/.exec(line);
            if (match && isValidVersion(match[1]) && (!match[2] || isValidDate(match[2]))) {
                current = { version: match[1], date: match[2] || '', lines: [] };
            }
        } else if (current && line && !/^#(?:\s|$)/.test(line)) {
            const item = line.startsWith('- ');
            current.lines.push({ type: item ? 'item' : 'text', text: item ? line.slice(2).trim() : line });
        }
    }
    finish();
    return [...entries.values()].sort((a, b) => compareVersions(b.version, a.version));
}
