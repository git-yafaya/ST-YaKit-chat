// 插画小说：识别柏宝绘、智绘姬的生图标签，清洗和润色期间用占位符代替，导出 EPUB 时换成图片。
const TOKEN_OPEN = '';
const TOKEN_CLOSE = '';
export const TOKEN_PATTERN = /(\d+)/g;
const BBI_TAG = /<bbi_image>[\s\S]+?<\/bbi_image>/gi;
const CHATU8_KEY = 'st-chatu8';
const IMAGE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

export const makeToken = id => `${TOKEN_OPEN}${id}${TOKEN_CLOSE}`;
export const stripTokens = text => text.replace(TOKEN_PATTERN, '');

const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 智绘姬按设置里的起止标记识别，外层 <image> 一并视为标签。
function chatu8Pattern(context) {
    const settings = context?.extensionSettings?.[CHATU8_KEY] ?? {};
    const start = typeof settings.startTag === 'string' && settings.startTag ? settings.startTag : 'image###';
    const end = typeof settings.endTag === 'string' && settings.endTag ? settings.endTag : '###';
    return new RegExp(`(?:<image>\\s*)?${escapeRegExp(start)}([\\s\\S]*?)${escapeRegExp(end)}(?:\\s*<\\/image>)?`, 'g');
}

/**
 * 把一条消息里的生图标签换成占位符。
 * refs 记录每个占位符对应的图片来源，供导出时读取；同一次导出里编号全局递增。
 */
export function replaceImageTags(text, chatMessage, floor, context, refs) {
    if (typeof text !== 'string' || !text) return text;
    const swipeId = Number.isInteger(chatMessage?.swipe_id) ? chatMessage.swipe_id : 0;
    let bbiSeq = 0;
    let result = text.replace(BBI_TAG, tag => {
        const id = refs.length;
        refs.push({ kind: 'bbi', floor, swipeId, seq: bbiSeq++, tag });
        return makeToken(id);
    });
    result = result.replace(chatu8Pattern(context), (match, content) => {
        const link = content.trim().replaceAll('《', '<').replaceAll('》', '>').replaceAll('\n', '');
        if (!link) return match;
        const id = refs.length;
        refs.push({ kind: 'chatu8', floor, link });
        return makeToken(id);
    });
    return result;
}

/* ---------- 柏宝绘：图片记在消息 extra.bbiImage[swipeId][promptHash][] ---------- */

export function bbiPromptHash(text) {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < text.length; i++) {
        const ch = text.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

function bbiPath(ref, context) {
    const list = context?.chat?.[ref.floor]?.extra?.bbiImage?.[String(ref.swipeId)]?.[bbiPromptHash(ref.tag)];
    if (!Array.isArray(list)) return null;
    for (let i = list.length - 1; i >= 0; i--) {
        const entry = list[i];
        if ((entry?.slotSeq ?? 0) === ref.seq && entry?.status !== 'error' && typeof entry?.path === 'string' && entry.path) return entry.path;
    }
    return null;
}

/* ---------- 智绘姬：按标签内容的 MD5 记在扩展设置和浏览器数据库里 ---------- */

function md5(text) {
    const bytes = new TextEncoder().encode(text);
    const length = bytes.length;
    const words = new Uint32Array(((length + 8 >>> 6) + 1) * 16);
    for (let i = 0; i < length; i++) words[i >> 2] |= bytes[i] << (i % 4 * 8);
    words[length >> 2] |= 0x80 << (length % 4 * 8);
    words[words.length - 2] = length * 8;
    words[words.length - 1] = Math.floor(length / 0x20000000);
    const s = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
    const k = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0);
    let [a0, b0, c0, d0] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
    for (let offset = 0; offset < words.length; offset += 16) {
        let [a, b, c, d] = [a0, b0, c0, d0];
        for (let i = 0; i < 64; i++) {
            let f, g;
            if (i < 16) { f = (b & c) | (~b & d); g = i; }
            else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
            else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
            else { f = c ^ (b | ~d); g = (7 * i) % 16; }
            const shift = s[(i >> 4) * 4 + i % 4];
            const sum = (a + f + k[i] + words[offset + g]) >>> 0;
            [a, d, c] = [d, c, b];
            b = (b + ((sum << shift) | (sum >>> (32 - shift)))) >>> 0;
        }
        a0 = (a0 + a) >>> 0; b0 = (b0 + b) >>> 0; c0 = (c0 + c) >>> 0; d0 = (d0 + d) >>> 0;
    }
    return [a0, b0, c0, d0].map(value => Array.from({ length: 4 }, (_, i) => ((value >>> (i * 8)) & 255)
        .toString(16).padStart(2, '0')).join('')).join('');
}
export { md5 as chatu8Md5 };

function openChatu8Db() {
    return new Promise(resolve => {
        if (typeof indexedDB === 'undefined') return resolve(null);
        // 不带版本号打开，数据库不存在时不创建也不升级。
        const request = indexedDB.open('chatu8_gallery');
        request.onupgradeneeded = () => { request.transaction?.abort(); };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
    });
}

function readDb(db, id) {
    return new Promise(resolve => {
        try {
            if (!db.objectStoreNames.contains('tupianhuancun')) return resolve(null);
            const request = db.transaction('tupianhuancun', 'readonly').objectStore('tupianhuancun').get(id);
            request.onsuccess = () => resolve(request.result ?? null);
            request.onerror = () => resolve(null);
        } catch { resolve(null); }
    });
}

async function chatu8Image(ref, context, state) {
    const key = md5(ref.link);
    const settings = context?.extensionSettings?.[CHATU8_KEY] ?? {};
    const serverEntry = settings.jiuguanStorage?.[key];
    state.db ??= openChatu8Db();
    const db = await state.db;
    if (db && state.metadata === undefined) {
        const record = await readDb(db, 'tupianshuju');
        try { state.metadata = record?.shuju ? JSON.parse(record.shuju) : {}; } catch { state.metadata = {}; }
    }
    const dbEntry = state.metadata?.[key];
    const images = [
        ...(Array.isArray(serverEntry?.images) ? serverEntry.images.map(item => ({ ...item, source: 'server' })) : []),
        ...(Array.isArray(dbEntry?.images) ? dbEntry.images.map(item => ({ ...item, source: 'db' })) : []),
    ].sort((x, y) => (x.date || 0) - (y.date || 0));
    if (!images.length) return null;
    // 和智绘姬显示同一张：优先使用它记住的序号。
    const stored = settings.jiuguanchucun === 'true' ? serverEntry?.index : (dbEntry?.index ?? serverEntry?.index);
    const index = Math.min(images.length - 1, Math.max(0, Number.isInteger(stored) ? stored : 0));
    const image = images[index];
    if (image.isVideo) return null;
    if (image.source === 'server' && typeof image.path === 'string' && image.path) return { path: image.path };
    if (image.source === 'db' && db && image.uuid) {
        const record = await readDb(db, image.uuid);
        if (record?.data) return { data: new Uint8Array(record.data) };
    }
    return null;
}

/* ---------- 读取图片数据 ---------- */

function detectType(bytes, fallback) {
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
    if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif';
    if (bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
    return IMAGE_TYPES[fallback] ? fallback : null;
}

async function fetchImage(path) {
    // 路径是酒馆网页地址，docker 与非 docker 部署一致；统一成站点根路径读取。
    const url = /^(https?:|data:|blob:)/i.test(path) ? path : `/${path.replace(/^\/+/, '')}`;
    const response = await fetch(url, { cache: 'force-cache' });
    if (!response.ok) return null;
    const blob = await response.blob();
    return { bytes: new Uint8Array(await blob.arrayBuffer()), type: blob.type };
}

/**
 * 读取占位符对应的图片。返回 Map<编号, { data, mediaType, extension }>；读不到的图片不放进结果，导出时直接略过。
 */
export async function loadIllustrations(refs, context = globalThis.SillyTavern?.getContext?.(), { ids } = {}) {
    const result = new Map();
    const state = {};
    const wanted = ids ? [...new Set(ids)] : refs.map((_, id) => id);
    for (const id of wanted) {
        const ref = refs[id];
        if (!ref) continue;
        try {
            let loaded = null;
            if (ref.kind === 'bbi') {
                const path = bbiPath(ref, context);
                if (path) loaded = await fetchImage(path);
            } else if (ref.kind === 'chatu8') {
                const found = await chatu8Image(ref, context, state);
                if (found?.path) loaded = await fetchImage(found.path);
                else if (found?.data) loaded = { bytes: found.data, type: '' };
            }
            if (!loaded?.bytes?.length) continue;
            const mediaType = detectType(loaded.bytes, loaded.type);
            if (!mediaType) continue;
            result.set(id, { data: loaded.bytes, mediaType, extension: IMAGE_TYPES[mediaType] });
        } catch { /* 单张图片读取失败时略过，不影响导出文字。 */ }
    }
    try { (await state.db)?.close(); } catch { /* 忽略 */ }
    return result;
}
