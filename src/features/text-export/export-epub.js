import { getMessageLabel, validateMessages } from './export-common.js';

// XML 不能容纳的字符直接报错；回车统一成换行，交给下面按空行分段。
function escapeXml(value, location) {
    const invalid = /[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/u.exec(value);
    if (invalid) {
        const code = invalid[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
        throw new TypeError(`${location}位置 ${invalid.index + 1} 包含 XML 1.0 不支持的字符 U+${code}`);
    }
    return value.replace(/\r\n?/g, '\n').replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
    })[character]);
}

function xhtml(title, content) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="zh" lang="zh">
<head><title>${title}</title><style>p { white-space: pre-wrap; } img.illustration { display: block; max-width: 100%; height: auto; margin: 1em auto; }</style></head>
<body>${content}</body>
</html>`;
}

export async function buildEpub(chapters, {
    labelMode = 'speaker', characterName, now = new Date(), identifier, JSZip, illustrations = null,
} = {}) {
    if (!Array.isArray(chapters) || chapters.length === 0) {
        throw new TypeError('chapters 必须是非空章节数组');
    }
    if (typeof characterName !== 'string' || !characterName.trim()) {
        throw new TypeError('characterName 必须是非空字符串');
    }
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
        throw new TypeError('now 必须是有效的 Date');
    }
    if (typeof identifier !== 'string'
        || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(identifier)) {
        throw new TypeError('identifier 必须是 UUID 字符串');
    }
    if (typeof JSZip !== 'function') {
        throw new TypeError('JSZip 必须是构造函数');
    }

    const title = escapeXml(characterName, '角色卡名称');
    const modified = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
    // 插画占位符换成图片；没有读到的图片直接略过。
    const usedImages = new Map();
    const placeImages = body => body.replace(/\uE000(\d+)\uE001/g, (_, id) => {
        const image = illustrations?.get(Number(id));
        if (!image) return '';
        const href = `images/${id}.${image.extension}`;
        usedImages.set(Number(id), { ...image, href, itemId: `image-${id}` });
        return `<img class="illustration" src="../${href}" alt="插图"/>`;
    });
    const pages = chapters.map((chapter, index) => {
        if (!chapter || typeof chapter.name !== 'string' || !chapter.name.trim()) {
            throw new TypeError(`第 ${index + 1} 章名称必须是非空字符串`);
        }
        validateMessages(chapter.messages, labelMode);
        if (chapter.messages.length === 0) {
            throw new TypeError(`第 ${index + 1} 章必须包含消息`);
        }
        const name = escapeXml(chapter.name, `第 ${index + 1} 章名称`);
        const content = chapter.messages.map((message, messageIndex) => {
            const body = placeImages(escapeXml(message.mes, `第 ${index + 1} 章第 ${messageIndex + 1} 条消息正文`));
            const label = labelMode === 'speaker' ? `<strong>${escapeXml(getMessageLabel(message), '类别标注')}</strong>` : '';
            // 空行分段：一段一个 <p>，阅读器才能正常排版；段落里的单换行由 pre-wrap 保留
            const parts = body.split(/\n{2,}/).filter(part => part.trim());
            if (!parts.length) return `<p>${label}</p>`;
            return parts.map((part, partIndex) => `<p>${partIndex === 0 ? label : ''}${part}</p>`).join('\n');
        }).join('\n');
        return { name, href: `chapters/${index + 1}.xhtml`, id: `chapter-${index + 1}`, content: xhtml(name, `<h1>${name}</h1>\n${content}`) };
    });

    const zip = new JSZip();
    // mimetype 必须首先写入且不压缩，不创建额外目录项。
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE', createFolders: false });
    const add = (path, content) => zip.file(path, content, { compression: 'DEFLATE', createFolders: false });
    add('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`);
    add('EPUB/package.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="book-id">urn:uuid:${identifier}</dc:identifier>
<dc:title>${title}</dc:title><dc:creator>${title}</dc:creator><dc:language>zh</dc:language>
<meta property="dcterms:modified">${modified}</meta>
</metadata>
<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
${pages.map(page => `<item id="${page.id}" href="${page.href}" media-type="application/xhtml+xml"/>`).join('\n')}
${[...usedImages.values()].map(image => `<item id="${image.itemId}" href="${image.href}" media-type="${image.mediaType}"/>`).join('\n')}
</manifest>
<spine>${pages.map(page => `<itemref idref="${page.id}"/>`).join('')}</spine>
</package>`);
    add('EPUB/nav.xhtml', xhtml(title, `<nav epub:type="toc" id="toc"><ol>${pages.map(page => `<li><a href="${page.href}">${page.name}</a></li>`).join('')}</ol></nav>`));
    for (const page of pages) add(`EPUB/${page.href}`, page.content);
    for (const image of usedImages.values()) {
        // 转成 base64 写入，图片数据来自其他窗口时 JSZip 也能识别。
        let binary = '';
        for (let i = 0; i < image.data.length; i += 32768) binary += String.fromCharCode(...image.data.subarray(i, i + 32768));
        zip.file(`EPUB/${image.href}`, btoa(binary), { base64: true, compression: 'STORE', createFolders: false });
    }
    return zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip', streamFiles: false });
}
