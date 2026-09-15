import { saveTxt } from './export-txt.js';
import { buildMarkdown } from './export-markdown.js';
import { buildEpub } from './export-epub.js';
import { buildChatJsonl } from './export-jsonl.js';
import { createExportFilename, validateMessages } from './export-common.js';
import { createEpubChapters } from './epub-chapters.js';
import { getEpubPreferences } from './epub-preferences.js';

export { getEpubPreferences, saveEpubPreferences } from './epub-preferences.js';

export async function saveExport(messages, options = {}) {
    if (!Array.isArray(messages)) throw new TypeError('messages 必须是数组');
    if (messages.length === 0) return '无内容';
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
        throw new TypeError('导出选项必须是对象');
    }
    const { fileType = 'txt', labelMode = 'speaker', epub, fileName = '', illustrations = null } = options;
    if (!['txt', 'md', 'epub', 'jsonl'].includes(fileType)) {
        throw new TypeError('fileType 仅支持 txt、md、epub 或 jsonl');
    }
    validateMessages(messages, labelMode);
    if (typeof globalThis.SillyTavern?.getContext !== 'function') {
        throw new Error('请在 SillyTavern 中调用');
    }
    const context = globalThis.SillyTavern.getContext();
    // 在异步加载前固定角色名和时间，书名、作者与文件名使用同一份快照。
    const characterName = context.characters[context.characterId]?.name;
    const now = new Date();
    const filename = createExportFilename(characterName, fileType, now, fileName);
    const chapters = fileType === 'epub'
        ? createEpubChapters(messages, epub === undefined ? getEpubPreferences() : epub)
        : null;
    const markdown = fileType === 'md' ? buildMarkdown(messages, labelMode) : null;
    const { download, uuidv4 } = await import('/scripts/utils.js');
    if (fileType === 'txt') {
        return saveTxt(messages, { format: labelMode, characterName, now, download, fileName });
    }
    if (fileType === 'md') {
        download(markdown, filename, 'text/markdown;charset=utf-8');
        return { filename, text: markdown };
    }
    if (fileType === 'jsonl') {
        const text = buildChatJsonl(context, messages);
        download(text, filename, 'application/jsonl;charset=utf-8');
        return { filename, text };
    }
    // 宿主现成的 ZIP 文件通过副作用提供 JSZip。
    if (typeof globalThis.JSZip !== 'function') await import('/lib/jszip.min.js');
    if (typeof globalThis.JSZip !== 'function') throw new Error('宿主 JSZip 加载失败');
    const blob = await buildEpub(chapters, { labelMode, characterName, now, identifier: uuidv4(), JSZip: globalThis.JSZip, illustrations });
    download(blob, filename, 'application/epub+zip');
    return { filename, blob };
}
