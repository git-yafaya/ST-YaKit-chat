import { saveTxt } from '../text-export/export-txt.js';
import { buildMarkdown } from '../text-export/export-markdown.js';
import { buildEpub } from '../text-export/export-epub.js';
import { createExportFilename } from '../text-export/export-common.js';
import { placeImages, loadIllustrations, TOKEN_PATTERN } from '../text-export/illustrations.js';

export async function exportPolish(job, options = {}) {
    if (!job) throw new Error('暂无润色任务，请先开始润色');
    if (!Array.isArray(job.segments) || !job.segments.length) throw new Error('没有可导出的润色结果');
    if (job.status === 'running' || job.segments.some(segment => segment?.status !== 'done')) {
        throw new Error('还有未完成的段落，请全部润色完成后再导出');
    }
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('导出选项必须是对象');
    const { format = 'txt', fileName = '', illustrated = false } = options;
    if (format === 'jsonl') throw new Error('润色结果暂不能导出成酒馆聊天文件，请在导出预设里换成 TXT、Markdown 或 EPUB');
    if (!['txt', 'md', 'epub'].includes(format)) throw new Error('导出格式仅支持 TXT、Markdown 或 EPUB');
    if (typeof fileName !== 'string') throw new Error('文件名必须是文字');
    if (typeof job.chatName !== 'string' || !job.chatName.trim()) throw new Error('润色任务缺少聊天名称，请重新开始润色');
    if (job.segments.some(segment => typeof segment.polished !== 'string' || !segment.polished.trim())) {
        throw new Error('润色结果为空，请重新润色对应段落');
    }

    // 下载前固定结果与名称，切换聊天或重做任务不影响本次文件。
    const characterName = job.chatName;
    // 插画小说：EPUB 里把记下的插图按位置放回每楼润色结果。
    const refs = format === 'epub' && illustrated ? [] : null;
    const messages = [...job.segments].sort((a, b) => a.index - b.index).map(segment => ({
        mes: refs && Array.isArray(segment.floors) && segment.floors.some(floor => floor.images?.length)
            ? segment.floors.filter(floor => floor.polished !== null)
                .map(floor => placeImages(floor.polished, floor.images, refs)).join('\n\n')
            : segment.polished,
    }));
    const now = new Date();
    const filename = createExportFilename(characterName, format, now, fileName);
    let utilities;
    try {
        utilities = await import('/scripts/utils.js');
    } catch {
        throw new Error('加载导出工具失败，请刷新页面后重试');
    }
    const download = (...args) => {
        try {
            utilities.download(...args);
        } catch {
            throw new Error('下载润色文件失败，请重试');
        }
    };
    if (format === 'txt') {
        saveTxt(messages, { format: 'plain', characterName, now, download, fileName });
    } else if (format === 'md') {
        download(buildMarkdown(messages, 'plain'), filename, 'text/markdown;charset=utf-8');
    } else {
        try {
            if (typeof globalThis.JSZip !== 'function') await import('/lib/jszip.min.js');
            if (typeof globalThis.JSZip !== 'function') throw new Error();
        } catch {
            throw new Error('加载 EPUB 导出工具失败，请刷新页面后重试');
        }
        const chapters = messages.map((message, index) => ({ name: `第 ${index + 1} 段`, messages: [message] }));
        const illustrations = refs?.length ? await loadIllustrations(refs, globalThis.SillyTavern?.getContext?.(),
            { ids: messages.flatMap(message => [...message.mes.matchAll(TOKEN_PATTERN)].map(match => Number(match[1]))) }) : null;
        const blob = await buildEpub(chapters, { labelMode: 'plain', characterName, now, identifier: utilities.uuidv4(), JSZip: globalThis.JSZip, illustrations });
        download(blob, filename, 'application/epub+zip');
    }
    return { count: messages.length };
}
