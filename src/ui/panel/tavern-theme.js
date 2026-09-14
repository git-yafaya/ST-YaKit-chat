/**
 * 「跟随ST」主题：从用户当前的酒馆美化里取色，拼成插件用的一套颜色
 *
 * 取色来源：
 *   美化 JSON  —— 酒馆把它写成页面上的 --SmartTheme* 颜色，这里直接读页面上的最终值，
 *                 所以美化 CSS 里改过的颜色也算在内
 *   美化 CSS   —— 读字体（按酒馆里实际显示的字体为准），以及 CSS 开头 @import 的字体文件
 *
 * 对应关系：
 *   面板底 ← UI 背景色（Blur Tint）      卡片底 ← 聊天背景色（Chat Tint）
 *   分隔线 ← 边框色（Border）            标题/正文 ← 主要文本（Body）
 *   说明小字 ← 斜体文本（Em）            主色 ← 引用文本（Quote）
 *   点睛色 ← 下划线文本（Underline）
 * 半透明的颜色会先铺到底色上变成实色；颜色太接近、字看不清时会自动拉开。
 */

const FALLBACK_LIGHT = '#FFFFFF';
const FALLBACK_DARK = '#17181A';

/* ---------- 颜色小工具 ---------- */

let ctx;
// 任意 CSS 颜色 → [r, g, b, a]（a 为 0~1）
function parse(color) {
    ctx ??= Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillStyle = color || 'transparent';
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255];
}

// 半透明颜色铺在底色上，得到实色
function flatten(color, base) {
    const [r, g, b, a] = parse(color);
    const [br, bg, bb] = parse(base);
    return [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a)].map(Math.round);
}

const hex = (rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const mix = (a, b, amount) => a.map((v, i) => Math.round(v * (1 - amount) + b[i] * amount));

function luminance([r, g, b]) {
    const c = [r, g, b].map((v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function contrast(a, b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

// 往 toward 方向一点点靠，直到和 background 的对比度够 target
function ensureContrast(color, background, target, toward) {
    let result = color;
    for (let step = 0; step < 20 && contrast(result, background) < target; step++) {
        result = mix(result, toward, 0.1);
    }
    return result;
}

/* ---------- 读酒馆 ---------- */

function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// 酒馆里实际显示的字体（美化 CSS 改过字体的话，这里读到的就是改后的）
function readFontFamily() {
    const sample = document.getElementById('send_textarea') || document.getElementById('chat') || document.body;
    return getComputedStyle(sample).fontFamily;
}

// 美化 CSS 开头 @import 的字体文件，面板页面也要加载一份
function readFontImports(customCss) {
    const urls = [];
    const pattern = /@import\s+(?:url\(\s*)?["']?([^"')\s;]+)["']?\s*\)?/g;
    for (const match of (customCss || '').matchAll(pattern)) urls.push(match[1]);
    return urls;
}

/**
 * 读取当前酒馆美化，返回：
 *   name     美化名字
 *   scheme   'light' 或 'dark'
 *   vars     插件主题变量，比如 { '--panel-bg': '#FFFFFF', ... }
 *   font     字体
 *   fontImports  需要额外加载的字体 CSS 地址
 */
export function readTavernTheme() {
    const settings = globalThis.SillyTavern?.getContext?.().powerUserSettings || {};

    const text = parse(cssVar('--SmartThemeBodyColor') || settings.main_text_color || '#222');
    const isDark = luminance(text) > 0.5;
    const ground = parse(isDark ? FALLBACK_DARK : FALLBACK_LIGHT);
    const textRgb = text.slice(0, 3);

    // 底色
    let panel = flatten(cssVar('--SmartThemeBlurTintColor') || settings.blur_tint_color, hex(ground));
    const card = flatten(cssVar('--SmartThemeChatTintColor') || settings.chat_tint_color, hex(panel));
    // 面板底和卡片底几乎一样时，面板底稍微带一点文字色，让卡片浮出来
    if (contrast(panel, card) < 1.04) panel = mix(card, textRgb, isDark ? 0.06 : 0.035);

    // 分隔线
    let divider = flatten(cssVar('--SmartThemeBorderColor') || settings.border_color, hex(card));
    if (contrast(divider, card) < 1.15) divider = mix(card, textRgb, isDark ? 0.16 : 0.1);

    // 文字
    const body = ensureContrast(textRgb, card, 4.5, isDark ? [255, 255, 255] : [0, 0, 0]);
    const title = ensureContrast(body, card, 7, isDark ? [255, 255, 255] : [0, 0, 0]);
    let muted = flatten(cssVar('--SmartThemeEmColor') || settings.italics_text_color, hex(card));
    if (contrast(muted, card) > contrast(body, card) * 0.9) muted = mix(body, card, 0.35);
    muted = ensureContrast(muted, card, 3.5, body);

    // 主色、点睛色
    const primary = ensureContrast(
        flatten(cssVar('--SmartThemeQuoteColor') || settings.quote_text_color, hex(card)),
        card, 3, isDark ? [255, 255, 255] : [0, 0, 0],
    );
    const accent = flatten(cssVar('--SmartThemeUnderlineColor') || settings.underline_text_color, hex(card));
    const onColor = (bg) => (contrast([255, 255, 255], bg) >= contrast(title, bg) ? [255, 255, 255] : (isDark ? parse(FALLBACK_DARK).slice(0, 3) : title));

    // 投影
    const shadowWidth = Number(settings.shadow_width) || 0;
    const shadow = parse(cssVar('--SmartThemeShadowColor') || settings.shadow_color);
    const cardShadow = shadowWidth > 0
        ? `0 12px 32px -4px rgba(${shadow[0]}, ${shadow[1]}, ${shadow[2]}, ${isDark ? 0.3 : 0.08})`
        : 'none';

    const vars = {
        '--panel-bg': hex(panel),
        '--card-bg': hex(card),
        '--divider': hex(divider),
        '--text-title': hex(title),
        '--text-body': hex(body),
        '--text-muted': hex(muted),
        '--primary': hex(primary),
        '--on-primary': hex(onColor(primary)),
        '--accent': hex(accent),
        '--on-accent': hex(onColor(accent)),
        '--success': isDark ? '#4CA97A' : '#2F8558',
        '--warning': isDark ? '#E0A63C' : '#A8731A',
        '--danger': isDark ? '#D4574B' : '#B5433A',
        '--card-shadow': cardShadow,
        '--card-border': `1px solid ${hex(divider)}`,
    };

    return {
        name: settings.theme || '',
        scheme: isDark ? 'dark' : 'light',
        vars,
        font: readFontFamily(),
        fontImports: readFontImports(settings.custom_css),
    };
}

/* ---------- 缓存：美化没变就不重读 ---------- */

const CACHE_KEY = 'yakit-tavern-theme';

// 美化的「指纹」：直接从酒馆设置里取美化名、各项颜色和美化 CSS，算一个短字符串
// 这一步不需要浏览器重算页面样式，很快；指纹不变就说明美化没变
const SIGNATURE_FIELDS = [
    'theme', 'main_text_color', 'italics_text_color', 'underline_text_color', 'quote_text_color',
    'blur_tint_color', 'chat_tint_color', 'user_mes_blur_tint_color', 'bot_mes_blur_tint_color',
    'shadow_color', 'shadow_width', 'border_color', 'font_scale', 'custom_css',
];

export function tavernThemeSignature() {
    const settings = globalThis.SillyTavern?.getContext?.().powerUserSettings || {};
    const text = JSON.stringify(SIGNATURE_FIELDS.map((key) => settings[key] ?? null));
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return `${text.length}-${(hash >>> 0).toString(36)}`;
}

let memory = null; // { signature, theme }

/**
 * 取「跟随ST」的颜色：
 *   美化没变 → 直接用上次存下的结果（本次打开网页内存里的，或浏览器里存着的）
 *   第一次使用或美化变了 → 重新读取并存下来
 */
export function getTavernTheme() {
    const signature = tavernThemeSignature();
    if (memory?.signature === signature) return memory.theme;

    try {
        const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
        if (saved?.signature === signature && saved.theme?.vars) {
            memory = saved;
            return saved.theme;
        }
    } catch {
        // 读不到就重新算
    }

    memory = { signature, theme: readTavernTheme() };
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(memory));
    } catch {
        // 存不了只影响下次打开网页时要重读
    }
    return memory.theme;
}

// 酒馆里美化真的变了（指纹变了）才调用 callback
export function watchTavernTheme(callback) {
    let timer = null;
    let last = tavernThemeSignature();
    const check = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            const signature = tavernThemeSignature();
            if (signature === last) return;
            last = signature;
            callback();
        }, 150);
    };
    new MutationObserver(check).observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
    new MutationObserver((records) => {
        if (records.some((r) => (r.target.id || r.target.parentNode?.id) === 'custom-style'
            || [...r.addedNodes].some((n) => n.id === 'custom-style'))) check();
    }).observe(document.head, { childList: true, subtree: true, characterData: true });
}
