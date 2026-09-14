/**
 * 界面总文件：入口 src/index.js 调用 initPanelUI(api, getContext)
 * 1. 在魔法棒菜单里加一项「纪实」
 * 2. 点这一项，屏幕中间弹出面板窗口，面板内容渲染在独立 iframe 里（src/ui/page/index.html）
 *    面板页面通过 parent.YaKitChat 调用业务接口（接口说明写在各页脚本开头，如 src/ui/page/export.js、preset.js、api.js）
 * 3. 弹窗顶部：左边标题，中间页签，右边主题插画按钮和关闭
 *    导航栏可以放上方（文字页签）或下方（图标页签）；「自动」时电脑放上方，其他设备放下方
 *    主题按钮每点一次换到下一个主题，图标跳成对应的插画
 *    「跟随ST」从用户的酒馆美化里取色（见 src/ui/panel/tavern-theme.js）
 *    切页签、换主题时，通过消息告诉 iframe 里的页面；设置页里选主题也会发消息回来
 */

import '../components/embed-frame.js';
import '../components/segmented.js';
import '../components/icon.js';
import '../components/theme-list.js';
import '../components/error-log.js';
import { getTavernTheme, watchTavernTheme } from './tavern-theme.js';

const MENU_ID = 'yakit-wand-item';
const DIALOG_ID = 'yakit-dialog';
const PANEL_TITLE = '纪实';
const THEME_KEY = 'yakit-theme';
const DEFAULT_THEME = 'fir';
const NAV_KEY = 'yakit-nav';
const NAV_MODES = ['auto', 'top', 'bottom'];
// 面板是插件自己的页面，允许它读取插件文件（酒馆服务器不给隔离页面读文件）
// 样式依然和酒馆互不影响；以后面板也能直接读酒馆数据、下载导出文件
const PANEL_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-downloads';

const TABS = [
    { id: 'export', label: '文本导出', icon: 'ouput' },
    { id: 'polish', label: '润色', icon: 'edit' },
    { id: 'preset', label: '预设', icon: 'bookmark' },
    { id: 'api', label: 'API 管理', icon: 'link' },
    { id: 'settings', label: '设置', icon: 'settings' },
];

const THEMES = globalThis.YAKIT_THEMES;

// 插件文件夹的地址（酒馆页面的 <base> 是根目录，所以要用完整地址）
const THEMES_URL = new URL('../components/themes.css', import.meta.url).href;
const PANEL_URL = new URL('../page/index.html', import.meta.url).href;
const iconUrl = (name) => new URL(`../icons/${name}.svg`, import.meta.url).href;
// 普通单色图标用 icons 文件夹里的 SVG，颜色跟随文字颜色
const icon = (name) => `<span class="yakit-icon" style="--yakit-icon: url('${iconUrl(name)}')" aria-hidden="true"></span>`;

function loadThemes() {
    if (document.querySelector(`link[href="${THEMES_URL}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = THEMES_URL;
    document.head.append(link);
}

function readSetting(key, isValid, fallback) {
    try {
        const saved = localStorage.getItem(key);
        return isValid(saved) ? saved : fallback;
    } catch {
        return fallback;
    }
}

function saveSetting(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch {
        // 存不了就只在本次生效
    }
}

// 用户选过的主题优先，没选过用「冷杉与海盐」
const readTheme = () => readSetting(THEME_KEY, (v) => THEMES.some((t) => t.id === v), DEFAULT_THEME);
const saveTheme = (theme) => saveSetting(THEME_KEY, theme);
const readNav = () => readSetting(NAV_KEY, (v) => NAV_MODES.includes(v), 'auto');

// 电脑：用鼠标（能悬停、指得准）并且窗口够宽
const pcQuery = matchMedia('(hover: hover) and (pointer: fine) and (min-width: 768px)');

// 关闭时先播放收起动画（电脑淡出、手机抽屉滑下），结束后再真正关闭；万一动画没触发，300ms 后也会关
function closePanel(dialog) {
    if (!dialog.open || dialog.classList.contains('is-closing')) return;
    dialog.classList.add('is-closing');
    const finish = () => {
        clearTimeout(fallback);
        if (!dialog.classList.contains('is-closing')) return;
        dialog.classList.remove('is-closing');
        dialog.close();
    };
    const fallback = setTimeout(finish, 300);
    dialog.addEventListener('animationend', finish, { once: true });
}

// 「跟随ST」的颜色：读取要让浏览器重算整个酒馆页面的样式，比较慢
// 只在第一次使用和美化变了时读取（见 tavern-theme.js），这里趁空闲提前准备好
const scheduleTavernRead = () => {
    const idle = globalThis.requestIdleCallback || ((fn) => setTimeout(fn, 200));
    idle(() => getTavernTheme());
};

function openPanel() {
    const existing = document.getElementById(DIALOG_ID);
    if (existing) {
        existing.classList.remove('is-closing');
        existing.showModal();
        return;
    }

    const dialog = document.createElement('dialog');
    dialog.id = DIALOG_ID;
    dialog.className = 'yakit-scope yakit-dialog';
    dialog.setAttribute('aria-labelledby', 'yakit-dialog-title');
    dialog.innerHTML = `
        <header class="yakit-dialog-header">
            <div class="yakit-dialog-heading" tabindex="-1" autofocus>
                <h2 id="yakit-dialog-title" class="yakit-dialog-title">${PANEL_TITLE}</h2>
                <span class="yakit-dialog-subtitle">-YaKit</span>
            </div>
            <yakit-segmented class="yakit-tabs" tabs frosted aria-label="${PANEL_TITLE}功能" value="${TABS[0].id}">
                ${TABS.map((tab) => `<option value="${tab.id}">${tab.label}</option>`).join('')}
            </yakit-segmented>
            <div class="yakit-dialog-actions">
                <div class="yakit-theme-switch">
                    <button type="button" class="yakit-icon-button yakit-theme-button" data-action="theme">
                        <yakit-icon size="28" line="1.4"></yakit-icon>
                    </button>
                    <span class="yakit-theme-bubble" role="status" aria-live="polite"></span>
                </div>
                <button type="button" class="yakit-icon-button" data-action="close" aria-label="关闭" title="关闭">
                    ${icon('close')}
                </button>
            </div>
        </header>
        <div class="yakit-dialog-body">
            <embed-frame fill no-toolbar title="${PANEL_TITLE}" sandbox="${PANEL_SANDBOX}"></embed-frame>
        </div>
        <nav class="yakit-bottom-nav" role="tablist" aria-label="${PANEL_TITLE}功能">
            ${TABS.map((tab, i) => `
                <button type="button" class="yakit-bottom-tab" role="tab" data-tab="${tab.id}"
                    aria-label="${tab.label}" title="${tab.label}"
                    aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">
                    <yakit-icon src="${iconUrl(tab.icon)}" size="20" fit aria-hidden="true"></yakit-icon>
                </button>
            `).join('')}
        </nav>
    `;

    const frame = dialog.querySelector('embed-frame');
    const tabs = dialog.querySelector('.yakit-tabs');
    const themeButton = dialog.querySelector('[data-action="theme"]');
    const themeIcon = themeButton.querySelector('yakit-icon');
    const bubble = dialog.querySelector('.yakit-theme-bubble');
    let currentTab = TABS[0].id;
    let currentTheme = readTheme();
    let bubbleTimer = null;

    // 给 iframe 里的页面发消息
    // 面板和酒馆同源：面板准备好后直接调用它的 yakitReceive，让顶部栏和面板内容在同一帧里更新；
    // 面板还没加载完时退回 postMessage
    const tellPanel = (message) => {
        const panel = frame.iframe.contentWindow;
        if (typeof panel?.yakitReceive === 'function') panel.yakitReceive(message);
        else panel?.postMessage(message, '*');
    };
    let tavern = null;
    const themeMessage = () => ({
        type: 'yakit:theme',
        theme: currentTheme,
        selected: currentTheme,
        tavern: currentTheme === 'tavern' ? tavern : null,
    });

    /* ---------- 页签：上方文字页签和下方图标页签是同一组，切换时两边同步 ---------- */
    const bottomTabs = [...dialog.querySelectorAll('.yakit-bottom-tab')];

    function selectTab(id, { focus = false } = {}) {
        currentTab = id;
        tabs.value = id;
        bottomTabs.forEach((tab) => {
            const selected = tab.dataset.tab === id;
            tab.setAttribute('aria-selected', String(selected));
            tab.tabIndex = selected ? 0 : -1;
            if (selected && focus) tab.focus();
        });
        tellPanel({ type: 'yakit:tab', tab: id });
    }

    tabs.addEventListener('change', (event) => selectTab(event.detail.value));
    bottomTabs.forEach((tab, i) => {
        tab.addEventListener('click', () => selectTab(tab.dataset.tab));
        tab.addEventListener('keydown', (event) => {
            const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
            if (!step) return;
            event.preventDefault();
            selectTab(bottomTabs[(i + step + bottomTabs.length) % bottomTabs.length].dataset.tab, { focus: true });
        });
    });

    /* ---------- 导航栏位置 ---------- */
    let navMode = readNav();
    const resolveNav = () => (navMode === 'auto' ? (pcQuery.matches ? 'top' : 'bottom') : navMode);
    const navMessage = () => ({ type: 'yakit:nav', mode: navMode, resolved: resolveNav() });

    function applyNav() {
        dialog.dataset.nav = resolveNav();
        tellPanel(navMessage());
    }

    // 「自动」时，窗口大小或设备变化后重新判断
    pcQuery.addEventListener('change', () => {
        if (navMode === 'auto') applyNav();
    });

    /* ---------- 主题 ---------- */
    function applyTheme(theme, { animate = false } = {}) {
        currentTheme = theme;
        dialog.dataset.theme = theme;
        // 「跟随ST」：把从酒馆美化里取到的颜色直接写到弹窗上；换成别的主题时清掉
        const oldVars = tavern ? Object.keys(tavern.vars) : [];
        oldVars.forEach((name) => dialog.style.removeProperty(name));
        dialog.style.removeProperty('--yakit-font');
        tavern = null;
        if (theme === 'tavern') {
            tavern = getTavernTheme();
            Object.entries(tavern.vars).forEach(([name, value]) => dialog.style.setProperty(name, value));
            dialog.style.setProperty('--yakit-font', tavern.font);
            dialog.style.colorScheme = tavern.scheme;
        } else {
            dialog.style.removeProperty('color-scheme');
        }

        tellPanel(themeMessage());
        showThemeFeedback(theme, { animate });
    }

    // 按钮上的插画、提示文字和主题名气泡（很轻，点击时立刻更新）
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
    let jumpAnimation = null;
    function showThemeFeedback(theme, { animate = false } = {}) {
        const info = THEMES.find((t) => t.id === theme);
        const next = THEMES[(THEMES.indexOf(info) + 1) % THEMES.length];
        const tavernName = theme === 'tavern' ? getTavernTheme().name : '';
        const label = tavernName ? `${info.label} · ${tavernName}` : info.label;
        const src = iconUrl(`theme/${info.icon}`);
        if (themeIcon.getAttribute('src') !== src) themeIcon.setAttribute('src', src);
        themeButton.setAttribute('aria-label', `主题：${label}，点击换成${next.label}`);
        themeButton.title = `主题：${label}`;
        if (!animate) return;

        // 图标跳一下：用浏览器动画接口重新播放，不强制重新排版整个页面
        if (!reduceMotion.matches) {
            jumpAnimation?.cancel();
            jumpAnimation = themeIcon.animate([
                { transform: 'translateY(0) scale(0.7) rotate(-12deg)', opacity: 0.3 },
                { transform: 'translateY(-6px) scale(1.12) rotate(4deg)', opacity: 1, offset: 0.45 },
                { transform: 'none', opacity: 1 },
            ], { duration: 420, easing: 'cubic-bezier(0.3, 0.7, 0.2, 1)' });
        }
        bubble.textContent = label;
        bubble.classList.add('is-visible');
        clearTimeout(bubbleTimer);
        bubbleTimer = setTimeout(() => bubble.classList.remove('is-visible'), 1400);
    }

    // 换主题直接切换，不做过渡动画：过渡会让屏幕闪一下，过渡期间浏览器还会吞掉点击
    // 插画和气泡马上变；真正换色合并到下一帧只做一次，连续快点时颜色只按最后一个换
    let pendingTheme = null;
    let applyFrame = 0;
    function setTheme(theme) {
        pendingTheme = theme;
        saveTheme(theme);
        showThemeFeedback(theme, { animate: true });
        if (applyFrame) return;
        applyFrame = requestAnimationFrame(() => {
            applyFrame = 0;
            const target = pendingTheme;
            pendingTheme = null;
            applyTheme(target);
        });
    }

    // 鼠标或手指连点时：不让按钮抢焦点（避免出现焦点框），也不触发双击选中旁边的文字；键盘操作不受影响
    themeButton.addEventListener('mousedown', (event) => event.preventDefault());
    themeButton.addEventListener('click', () => {
        const index = THEMES.findIndex((t) => t.id === (pendingTheme ?? currentTheme));
        setTheme(THEMES[(index + 1) % THEMES.length].id);
    });

    // 设置页里点了某个主题
    const onMessage = (event) => {
        if (event.source !== frame.iframe.contentWindow) return;
        const data = event.data || {};
        if (data.type === 'yakit:set-theme' && THEMES.some((t) => t.id === data.theme)) setTheme(data.theme);
        if (data.type === 'yakit:set-nav' && NAV_MODES.includes(data.mode)) {
            navMode = data.mode;
            saveSetting(NAV_KEY, navMode);
            applyNav();
        }
    };
    window.addEventListener('message', onMessage);

    // 酒馆换了美化时，「跟随ST」跟着变
    watchTavernTheme(() => {
        if (currentTheme === 'tavern') applyTheme('tavern');
        else scheduleTavernRead();
    });
    scheduleTavernRead();

    /* ---------- 关闭 ---------- */
    dialog.querySelector('[data-action="close"]').addEventListener('click', () => closePanel(dialog));
    // 点弹窗外面的暗色区域也能关闭：按下和松开都在弹窗外面才算（拖选文字拖到外面松开不会关）
    const outside = (event) => {
        const rect = dialog.getBoundingClientRect();
        return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    };
    let pressedOutside = false;
    dialog.addEventListener('pointerdown', (event) => { pressedOutside = event.target === dialog && outside(event); });
    dialog.addEventListener('click', (event) => {
        if (pressedOutside && event.target === dialog && outside(event)) closePanel(dialog);
        pressedOutside = false;
    });
    // 按 Esc 也走带动画的关闭
    dialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        closePanel(dialog);
    });
    // 弹窗关掉后告诉面板：收起抽屉、停止正在进行的 AI 请求
    dialog.addEventListener('close', () => tellPanel({ type: 'yakit:closed' }));

    applyTheme(currentTheme);
    applyNav();
    frame.addEventListener('statechange', (event) => {
        if (event.detail.state !== 'loaded') return;
        tellPanel(themeMessage());
        tellPanel(navMessage());
        tellPanel({ type: 'yakit:tab', tab: currentTab });
        // 空闲时让面板提前准备「跟随ST」的字体
        const idle = globalThis.requestIdleCallback || ((fn) => setTimeout(fn, 200));
        idle(() => {
            const { font, fontImports } = getTavernTheme();
            tellPanel({ type: 'yakit:preload-font', font, fontImports });
        });
    });

    document.body.append(dialog);
    frame.setAttribute('src', PANEL_URL);
    dialog.showModal();
}

function addMenuItem() {
    const menu = document.getElementById('extensionsMenu');
    if (!menu || document.getElementById(MENU_ID)) return;

    const item = document.createElement('div');
    item.id = MENU_ID;
    item.className = 'list-group-item flex-container flexGap5 interactable';
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    // 图标用 icons/menu.svg，大小与菜单里其他扩展的图标一致
    item.innerHTML = `<span class="extensionsMenuExtensionButton" aria-hidden="true"><span class="yakit-icon yakit-menu-entry-icon" style="--yakit-icon: url('${iconUrl('menu')}')"></span></span><span>${PANEL_TITLE}</span>`;
    item.addEventListener('click', openPanel);
    item.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openPanel();
        }
    });
    menu.append(item);
}

// 旧版本界面设置存在 dsh- 开头的键里，搬到 yakit- 开头的新键，用户选过的主题、导航栏位置等保持不变
const LEGACY_KEYS = ['theme', 'nav', 'theme-switch', 'tavern-theme'];
function migrateLegacySettings() {
    try {
        LEGACY_KEYS.forEach((name) => {
            const legacy = localStorage.getItem(`dsh-${name}`);
            if (legacy === null) return;
            if (localStorage.getItem(`yakit-${name}`) === null) localStorage.setItem(`yakit-${name}`, legacy);
            localStorage.removeItem(`dsh-${name}`);
        });
    } catch {}
}

// 酒馆页面里只记纪实自己文件出的错（报错位置在插件文件夹里）
const EXTENSION_BASE = new URL('../../../', import.meta.url).href;

export function initPanelUI(api, getContext) {
    migrateLegacySettings();
    YaKitErrorLog.install(window, { source: '弹窗', filter: (info) => info.includes(EXTENSION_BASE) });
    loadThemes();
    // 魔法棒菜单可能比插件晚创建，没找到就等酒馆准备好再加
    if (document.getElementById('extensionsMenu')) {
        addMenuItem();
    } else {
        const { eventSource, eventTypes } = getContext();
        eventSource.once(eventTypes.APP_READY, addMenuItem);
    }
}
