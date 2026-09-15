// 本次任务输入：按聊天保存的补充要求与参考材料，和长期文风分开。
export const INPUT_LIMITS = Object.freeze({ instructions: 4000, references: 6, referenceText: 6000, referenceTotal: 18000 });
const KINDS = ['style', 'context'];

export const emptyInputs = () => ({ instructions: '', references: [] });

const codePoints = text => Array.from(text).length;
const toLf = text => text.replace(/\r\n?/g, '\n');
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function fieldError(field, message) {
    return Object.assign(new Error(message), { field });
}

function checkInstructions(value) {
    if (typeof value !== 'string') throw fieldError('instructions', '本次补充要求必须是文字');
    const text = toLf(value);
    if (codePoints(text) > INPUT_LIMITS.instructions) throw fieldError('instructions', `本次补充要求最多 ${INPUT_LIMITS.instructions} 字`);
    return text.trim() ? text : '';
}

function checkReferences(value) {
    if (!Array.isArray(value)) throw fieldError('references', '参考材料必须是列表');
    if (value.length > INPUT_LIMITS.references) throw fieldError('references', `参考材料最多 ${INPUT_LIMITS.references} 条`);
    const kept = [];
    let total = 0;
    value.forEach((item, index) => {
        if (!isObject(item) || Object.keys(item).some(key => key !== 'kind' && key !== 'text')) {
            throw fieldError(`references.${index}.text`, '参考材料内容不对，请重新填写');
        }
        if (!KINDS.includes(item.kind)) throw fieldError(`references.${index}.kind`, '请选择参考材料用途');
        if (typeof item.text !== 'string') throw fieldError(`references.${index}.text`, '参考材料必须是文字');
        const text = toLf(item.text);
        if (!text.trim()) return;
        const length = codePoints(text);
        if (length > INPUT_LIMITS.referenceText) throw fieldError(`references.${index}.text`, `每条参考材料最多 ${INPUT_LIMITS.referenceText} 字`);
        total += length;
        kept.push({ kind: item.kind, text });
    });
    if (total > INPUT_LIMITS.referenceTotal) throw fieldError('references', `参考材料合计最多 ${INPUT_LIMITS.referenceTotal} 字`);
    return kept;
}

// 局部更新先合并再整体校验；空 patch 只返回当前值。
export function mergeInputs(current, patch) {
    if (!isObject(patch)) throw new Error('本次任务内容必须是对象');
    const unknown = Object.keys(patch).find(key => key !== 'instructions' && key !== 'references');
    if (unknown) throw new Error('本次任务包含无法识别的内容，请重新打开润色设置');
    const next = structuredClone(current ?? emptyInputs());
    if (Object.hasOwn(patch, 'instructions')) next.instructions = checkInstructions(patch.instructions);
    if (Object.hasOwn(patch, 'references')) next.references = checkReferences(patch.references);
    return next;
}

// 读回的旧文件或缺项补默认值；内容不合法时报错，不当成空值覆盖。
export function restoreInputs(value) {
    if (value === null || value === undefined) return emptyInputs();
    try {
        return mergeInputs(emptyInputs(), {
            instructions: value.instructions ?? '',
            references: value.references ?? [],
        });
    } catch {
        throw new Error('已保存的本次任务格式不正确，请清空结果后重新填写');
    }
}

// 按固定顺序生成 user 里的本次要求与参考材料；没有内容的块整体省略。
export function buildInputsText(inputs) {
    const parts = [];
    if (inputs?.instructions) parts.push(`本次补充要求：\n<task_requirements>${inputs.instructions}</task_requirements>`);
    const references = inputs?.references ?? [];
    if (references.length) {
        const items = references.map(({ kind, text }, index) => {
            const tag = kind === 'context' ? 'context_reference' : 'style_reference';
            return `<${tag} n="${index + 1}">${text}</${tag}>`;
        });
        parts.push(`参考材料（仅供参考，不输出）：\n${items.join('\n')}`);
    }
    return parts.map(part => `${part}\n\n`).join('');
}
