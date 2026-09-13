import { readSettings, updateSettings } from '../../shared/settings.js';

const DARK = {
    panel: '#17181A', card: '#202226', border: '#2F3237',
    title: '#F2F3F5', text: '#E7E8EA', muted: '#9B9EA4',
    primary: '#6B84A8', 'on-primary': '#FFFFFF',
    accent: '#8FA9CC', 'on-accent': '#17181A',
    success: '#4CA97A', warning: '#E0A63C', danger: '#D4574B',
    shadow: 'transparent',
};

const LIGHT = {
    panel: '#F4F5F6', card: '#FFFFFF', border: '#DFE2E5',
    title: '#14171A', text: '#24262A', muted: '#6E737A',
    primary: '#46618A', 'on-primary': '#FFFFFF',
    accent: '#5B7FB0', 'on-accent': '#FFFFFF',
    success: '#2F8558', warning: '#A8731A', danger: '#B5433A',
    shadow: 'transparent',
};

const PALETTES = {
    fir: {
        ...LIGHT, panel: '#F8F9FA', card: '#FFFFFF', border: '#E4E9EC',
        title: '#1A252C', text: '#495861', muted: '#9AABB3', primary: '#233D4D',
        accent: '#7F9EA1', 'on-accent': '#1A252C', shadow: 'rgba(35, 61, 77, 0.06)',
    },
    fig: {
        ...LIGHT, panel: '#FAF9F6', card: '#FFFFFF', border: '#E8E1D6',
        title: '#2E1E17', text: '#6B5B52', muted: '#A3958C', primary: '#5E3023',
        accent: '#C08552', 'on-accent': '#FAF8F5', shadow: 'rgba(94, 48, 35, 0.05)',
    },
    olive: {
        ...LIGHT, panel: '#F4F5F0', card: '#FFFFFF', border: '#E2E5DC',
        title: '#141D18', text: '#4D5850', muted: '#8C978E', primary: '#1E2D24',
        accent: '#D8E874', 'on-accent': '#141D18',
    },
    dark: DARK,
    light: LIGHT,
};

export const THEME_OPTIONS = [
    { value: 'host', label: '跟随酒馆' },
    { value: 'fir', label: '冷杉与海盐' },
    { value: 'fig', label: '暮色无花果' },
    { value: 'olive', label: '橄榄岩与日光柠檬' },
    { value: 'dark', label: '中性深色' },
    { value: 'light', label: '中性浅色' },
];

export function getTheme() {
    try {
        const value = readSettings().theme;
        return Object.hasOwn(PALETTES, value) ? value : 'host';
    } catch {
        // 设置异常由设置页显示，文本导出仍可使用宿主主题。
        return 'host';
    }
}

export function setTheme(value) {
    if (!THEME_OPTIONS.some(option => option.value === value)) throw new TypeError('主题不存在');
    updateSettings(settings => {
        settings.theme = value;
        return value;
    });
    document.dispatchEvent(new Event('yk-theme-changed'));
}

const HOST_COLORS = {
    panel: '--SmartThemeBlurTintColor', card: '--SmartThemeChatTintColor',
    border: '--SmartThemeBorderColor', title: '--SmartThemeBodyColor',
    text: '--SmartThemeBodyColor', muted: '--SmartThemeEmColor',
};

function hostColors() {
    const style = getComputedStyle(document.documentElement);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });

    // 让浏览器解析颜色；两次底值可区分无效值与合法黑白色。
    const readColor = (value) => {
        if (!value || !context) return null;
        context.fillStyle = '#000000';
        context.fillStyle = value;
        const parsed = context.fillStyle;
        context.fillStyle = '#ffffff';
        context.fillStyle = value;
        if (context.fillStyle !== parsed) return null;
        context.clearRect(0, 0, 1, 1);
        context.fillRect(0, 0, 1, 1);
        const rgba = context.getImageData(0, 0, 1, 1).data;
        return rgba[3] ? rgba : null;
    };

    const panel = readColor(style.getPropertyValue(HOST_COLORS.panel).trim());
    const light = panel && (0.2126 * panel[0] + 0.7152 * panel[1] + 0.0722 * panel[2] >= 128);
    const colors = { ...(light ? LIGHT : DARK) };
    for (const [slot, variable] of Object.entries(HOST_COLORS)) {
        const rgba = readColor(style.getPropertyValue(variable).trim());
        if (!rgba) continue;
        // 半透明宿主颜色合成到该槽的中性色，避免面板透空。
        const alpha = rgba[3] / 255;
        const rgb = [0, 1, 2].map((index) => Math.round(
            rgba[index] * alpha + parseInt(colors[slot].slice(1 + index * 2, 3 + index * 2), 16) * (1 - alpha),
        ));
        const nearWhite = 0.2126 * rgba[0] + 0.7152 * rgba[1] + 0.0722 * rgba[2] >= 250;
        colors[slot] = ['panel', 'card'].includes(slot) && nearWhite
            ? '#FCFCFA' : `rgb(${rgb.join(', ')})`;
    }
    const shadow = readColor(style.getPropertyValue('--SmartThemeShadowColor').trim());
    if (shadow) colors.shadow = `rgba(${shadow[0]}, ${shadow[1]}, ${shadow[2]}, ${shadow[3] / 255})`;
    colors.border = `color-mix(in srgb, ${colors.border} 35%, ${colors.panel} 65%)`;
    return colors;
}

export function applyTheme(element) {
    const theme = getTheme();
    element.dataset.theme = theme;
    const colors = theme === 'host' ? hostColors() : PALETTES[theme];
    for (const [slot, value] of Object.entries(colors)) element.style.setProperty(`--yk-${slot}`, value);
}

export function observeTheme(element) {
    const apply = () => applyTheme(element);
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
    if (document.body) observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    document.addEventListener('yk-theme-changed', apply);
    return () => {
        observer.disconnect();
        document.removeEventListener('yk-theme-changed', apply);
    };
}
