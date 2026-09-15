import * as prompts from '../api-ui/prompts.js';
import { validateRecordName } from '../../shared/validation.js';

const publicStyle = ({ id, name, text }) => ({ id, name, text });
const list = () => prompts.listPrompts('style').map(publicStyle);
const getActiveId = () => {
    const id = prompts.getActivePromptId('style');
    return list().some(item => item.id === id) ? id : null;
};
const changed = value => {
    globalThis.dispatchEvent?.(new CustomEvent('yakit-style-change'));
    return value;
};

// 备份与单套导入共用正文及名称校验，旧元数据不写入新文件。
export function normalizeStyles(value) {
    if (!value || !Array.isArray(value.items) || !(value.activeId === null || typeof value.activeId === 'string')) {
        throw new Error('文风预设格式不正确');
    }
    const items = [];
    for (const item of value.items) {
        if (!item || typeof item.id !== 'string' || !item.id.trim() || items.some(other => other.id === item.id)
            || validateRecordName(item.name, items, undefined, '已有同名文风').length
            || typeof item.text !== 'string' || !item.text.trim()) throw new Error('文风预设内容不正确');
        items.push(publicStyle(item));
    }
    if (value.activeId !== null && !items.some(item => item.id === value.activeId)) throw new Error('使用中的文风不存在');
    return { items, activeId: value.activeId };
}

const operations = {
    list, getActiveId,
    activate: id => changed(prompts.activatePrompt('style', id)),
    check: draft => prompts.checkPrompt('style', draft),
    save: draft => changed(publicStyle(prompts.savePrompt('style', draft))),
    duplicate: id => changed(publicStyle(prompts.duplicatePrompt('style', id))),
    remove: id => changed(prompts.removePrompt('style', id)),
    async exportStyle(id) {
        const style = list().find(item => item.id === id);
        if (!style) throw new Error('文风预设不存在');
        const { download } = await import('/scripts/utils.js');
        const filename = `${style.name.replace(/[<>:"/\\|?*\u0000-\u001f\u007f-\u009f]/g, '_')}.yakit-style.json`;
        download(JSON.stringify({ type: 'ST-YaKit-chat/style', schemaVersion: 1, name: style.name, text: style.text }, null, 2), filename, 'application/json;charset=utf-8');
        return { filename };
    },
    importStyle(text) {
        let value;
        try {
            value = JSON.parse(text.replace(/^\uFEFF/, ''));
            if (value?.type !== 'ST-YaKit-chat/style' || value.schemaVersion !== 1) throw new Error();
            normalizeStyles({ items: [{ id: 'import', name: value.name, text: value.text }], activeId: null });
        } catch { throw new Error('这不是纪实的文风预设文件'); }
        const names = new Set(list().map(item => item.name.toLowerCase()));
        const base = value.name.trim();
        let name = base;
        for (let number = 2; names.has(name.toLowerCase()); number++) {
            const suffix = `(${number})`;
            name = base.slice(0, 64 - suffix.length).replace(/[\uD800-\uDBFF]$/u, '') + suffix;
        }
        return changed(publicStyle(prompts.savePrompt('style', { name, text: value.text })));
    },
};

// 同步查询保持同步，下载和保存异常统一给出中文原因。
function report(error) {
    if (/[\u3400-\u9fff]/u.test(error?.message ?? '')) throw error;
    throw new Error('文风预设操作失败，请稍后重试', { cause: error });
}
export const styles = Object.freeze(Object.fromEntries(Object.entries(operations).map(([name, operation]) =>
    [name, (...args) => {
        try {
            const result = operation(...args);
            return result instanceof Promise ? result.catch(report) : result;
        } catch (error) { return report(error); }
    }])));
