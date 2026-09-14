/**
 * 界面总文件：入口 src/index.js 调用 initPanelUI(api, getContext)
 * 1. 在魔法棒菜单里加一项「纪实」
 * 2. 点这一项，屏幕中间弹出面板窗口，面板内容渲染在独立 iframe 里（src/ui/page/index.html）
 *    面板页面通过 parent.YaKitChat 调用业务接口（接口说明见 src/ui/page/export.js 开头）
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
import { getTavernTheme, watchTavernTheme } from './tavern-theme.js';

const MENU_ID = 'dsh-wand-item';
const DIALOG_ID = 'dsh-dialog';
const PANEL_TITLE = '纪实';
const THEME_KEY = 'dsh-theme';
const DEFAULT_THEME = 'fir';
const NAV_KEY = 'dsh-nav';
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

const THEMES = globalThis.DSH_THEMES;

// 插件文件夹的地址（酒馆页面的 <base> 是根目录，所以要用完整地址）
const THEMES_URL = new URL('../components/themes.css', import.meta.url).href;
const PANEL_URL = new URL('../page/index.html', import.meta.url).href;
const iconUrl = (name) => new URL(`../icons/${name}.svg`, import.meta.url).href;
// 普通单色图标用 icons 文件夹里的 SVG，颜色跟随文字颜色
const icon = (name) => `<span class="dsh-icon" style="--dsh-icon: url('${iconUrl(name)}')" aria-hidden="true"></span>`;

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

// 关闭时先播放收起动画，结束后再真正关闭；万一动画没触发，160ms 后也会关
function closePanel(dialog) {
    if (!dialog.open || dialog.classList.contains('is-closing')) return;
    dialog.classList.add('is-closing');
    const finish = () => {
        clearTimeout(fallback);
        if (!dialog.classList.contains('is-closing')) return;
        dialog.classList.remove('is-closing');
        dialog.close();
    };
    const fallback = setTimeout(finish, 160);
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
    dialog.className = 'dsh-scope dsh-dialog';
    dialog.setAttribute('aria-labelledby', 'dsh-dialog-title');
    dialog.innerHTML = `
        <header class="dsh-dialog-header">
            <div class="dsh-dialog-heading" tabindex="-1" autofocus>
                <h2 id="dsh-dialog-title" class="dsh-dialog-title">${PANEL_TITLE}</h2>
                <span class="dsh-dialog-subtitle">-YaKit</span>
            </div>
            <dsh-segmented class="dsh-tabs" tabs frosted aria-label="${PANEL_TITLE}功能" value="${TABS[0].id}">
                ${TABS.map((tab) => `<option value="${tab.id}">${tab.label}</option>`).join('')}
            </dsh-segmented>
            <div class="dsh-dialog-actions">
                <div class="dsh-theme-switch">
                    <button type="button" class="dsh-icon-button dsh-theme-button" data-action="theme">
                        <dsh-icon size="28" line="1.4"></dsh-icon>
                    </button>
                    <span class="dsh-theme-bubble" role="status" aria-live="polite"></span>
                </div>
                <button type="button" class="dsh-icon-button" data-action="close" aria-label="关闭" title="关闭">
                    ${icon('close')}
                </button>
            </div>
        </header>
        <div class="dsh-dialog-body">
            <embed-frame fill no-toolbar title="${PANEL_TITLE}" sandbox="${PANEL_SANDBOX}"></embed-frame>
        </div>
        <nav class="dsh-bottom-nav" role="tablist" aria-label="${PANEL_TITLE}功能">
            ${TABS.map((tab, i) => `
                <button type="button" class="dsh-bottom-tab" role="tab" data-tab="${tab.id}"
                    aria-label="${tab.label}" title="${tab.label}"
                    aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">
                    <dsh-icon src="${iconUrl(tab.icon)}" size="24" aria-hidden="true"></dsh-icon>
                </button>
            `).join('')}
        </nav>
    `;

    const frame = dialog.querySelector('embed-frame');
    const tabs = dialog.querySelector('.dsh-tabs');
    const themeButton = dialog.querySelector('[data-action="theme"]');
    const themeIcon = themeButton.querySelector('dsh-icon');
    const bubble = dialog.querySelector('.dsh-theme-bubble');
    let currentTab = TABS[0].id;
    let currentTheme = readTheme();
    let bubbleTimer = null;

    // 给 iframe 里的页面发消息
    const tellPanel = (message) => frame.iframe.contentWindow?.postMessage(message, '*');
    let tavern = null;
    const themeMessage = () => ({
        type: 'dsh:theme',
        theme: currentTheme,
        selected: currentTheme,
        tavern: currentTheme === 'tavern' ? tavern : null,
    });

    /* ---------- 页签：上方文字页签和下方图标页签是同一组，切换时两边同步 ---------- */
    const bottomTabs = [...dialog.querySelectorAll('.dsh-bottom-tab')];

    function selectTab(id, { focus = false } = {}) {
        currentTab = id;
        tabs.value = id;
        bottomTabs.forEach((tab) => {
            const selected = tab.dataset.tab === id;
            tab.setAttribute('aria-selected', String(selected));
            tab.tabIndex = selected ? 0 : -1;
            if (selected && focus) tab.focus();
        });
        tellPanel({ type: 'dsh:tab', tab: id });
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
    const navMessage = () => ({ type: 'dsh:nav', mode: navMode, resolved: resolveNav() });

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
        const info = THEMES.find((t) => t.id === theme);
        const next = THEMES[(THEMES.indexOf(info) + 1) % THEMES.length];

        dialog.dataset.theme = theme;
        // 「跟随ST」：把从酒馆美化里取到的颜色直接写到弹窗上；换成别的主题时清掉
        const oldVars = tavern ? Object.keys(tavern.vars) : [];
        oldVars.forEach((name) => dialog.style.removeProperty(name));
        dialog.style.removeProperty('--dsh-font');
        tavern = null;
        if (theme === 'tavern') {
            tavern = getTavernTheme();
            Object.entries(tavern.vars).forEach(([name, value]) => dialog.style.setProperty(name, value));
            dialog.style.setProperty('--dsh-font', tavern.font);
            dialog.style.colorScheme = tavern.scheme;
        } else {
            dialog.style.removeProperty('color-scheme');
        }

        const label = tavern?.name ? `${info.label} · ${tavern.name}` : info.label;
        themeIcon.setAttribute('src', iconUrl(`theme/${info.icon}`));
        themeButton.setAttribute('aria-label', `主题：${label}，点击换成${next.label}`);
        themeButton.title = `主题：${label}`;
        tellPanel(themeMessage());

        if (animate) {
            // 图标跳一下，旁边冒出主题名
            themeIcon.classList.remove('is-jumping');
            void themeIcon.offsetWidth;
            themeIcon.classList.add('is-jumping');
            bubble.textContent = label;
            bubble.classList.add('is-visible');
            clearTimeout(bubbleTimer);
            bubbleTimer = setTimeout(() => bubble.classList.remove('is-visible'), 1400);
        }
    }

    // 等面板里的颜色和字体换好（面板回 dsh:theme-applied），最多等 120ms
    let themeAppliedResolve = null;
    const waitPanelTheme = () => new Promise((resolve) => {
        themeAppliedResolve = resolve;
        setTimeout(resolve, 120);
    });

    // 换主题时整个弹窗做一次短淡入淡出，遮住字体变化带来的重新排版和两边前后一帧的差异
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
    function setTheme(theme) {
        saveTheme(theme);
        const run = () => {
            applyTheme(theme, { animate: true });
            return waitPanelTheme();
        };
        if (!document.startViewTransition || reduceMotion.matches) {
            run();
            return;
        }
        dialog.style.viewTransitionName = 'dsh-dialog';
        document.startViewTransition(run).finished.finally(() => {
            dialog.style.viewTransitionName = '';
        });
    }

    themeButton.addEventListener('click', () => {
        const index = THEMES.findIndex((t) => t.id === currentTheme);
        setTheme(THEMES[(index + 1) % THEMES.length].id);
    });

    // 设置页里点了某个主题
    const onMessage = (event) => {
        if (event.source !== frame.iframe.contentWindow) return;
        const data = event.data || {};
        if (data.type === 'dsh:set-theme' && THEMES.some((t) => t.id === data.theme)) setTheme(data.theme);
        if (data.type === 'dsh:theme-applied') themeAppliedResolve?.();
        if (data.type === 'dsh:set-nav' && NAV_MODES.includes(data.mode)) {
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
    // 点弹窗外面的暗色区域也能关闭
    dialog.addEventListener('click', (event) => {
        if (event.target === dialog) closePanel(dialog);
    });
    // 按 Esc 也走带动画的关闭
    dialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        closePanel(dialog);
    });

    applyTheme(currentTheme);
    applyNav();
    frame.addEventListener('statechange', (event) => {
        if (event.detail.state !== 'loaded') return;
        tellPanel(themeMessage());
        tellPanel(navMessage());
        tellPanel({ type: 'dsh:tab', tab: currentTab });
        // 空闲时让面板提前准备「跟随ST」的字体
        const idle = globalThis.requestIdleCallback || ((fn) => setTimeout(fn, 200));
        idle(() => {
            const { font, fontImports } = getTavernTheme();
            tellPanel({ type: 'dsh:preload-font', font, fontImports });
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
    item.innerHTML = `<span class="extensionsMenuExtensionButton" aria-hidden="true"><span class="dsh-icon dsh-menu-entry-icon" style="--dsh-icon: url('${iconUrl('menu')}')"></span></span><span>${PANEL_TITLE}</span>`;
    item.addEventListener('click', openPanel);
    item.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openPanel();
        }
    });
    menu.append(item);
}

export function initPanelUI(api, getContext) {
    loadThemes();
    // 魔法棒菜单可能比插件晚创建，没找到就等酒馆准备好再加
    if (document.getElementById('extensionsMenu')) {
        addMenuItem();
    } else {
        const { eventSource, eventTypes } = getContext();
        eventSource.once(eventTypes.APP_READY, addMenuItem);
    }
}
