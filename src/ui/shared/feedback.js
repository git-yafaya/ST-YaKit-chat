import { observeTheme } from './theme.js';

let currentToast;
let toastTimer;
let stopTheme;

export function showToast(message, type = 'warning', host = document.body) {
    clearTimeout(toastTimer);
    stopTheme?.();
    currentToast?.remove();
    const icons = { success: 'fa-circle-check', warning: 'fa-triangle-exclamation', danger: 'fa-circle-exclamation' };
    if (!Object.hasOwn(icons, type)) type = 'warning';
    const toast = document.createElement('div');
    toast.className = `yk-chat yk-notice yk-toast yk-notice--${type}`;
    toast.setAttribute('role', type === 'danger' ? 'alert' : 'status');
    toast.setAttribute('aria-live', type === 'danger' ? 'assertive' : 'polite');
    toast.setAttribute('aria-atomic', 'true');
    const icon = document.createElement('i');
    icon.className = `fa-solid ${icons[type]}`;
    icon.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.textContent = message;
    toast.append(icon, text);
    stopTheme = observeTheme(toast);
    host.append(toast);
    currentToast = toast;
    // 新提示会取消旧定时器，避免旧回调移除新提示。
    toastTimer = setTimeout(() => {
        const remove = () => {
            toast.remove();
            if (currentToast === toast) {
                currentToast = null;
                stopTheme();
                stopTheme = null;
            }
        };
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
            remove();
        } else {
            toast.classList.add('is-leaving');
            toastTimer = setTimeout(remove, 200);
        }
    }, 3000);
    return toast;
}
