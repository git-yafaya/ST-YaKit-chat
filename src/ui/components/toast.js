/**
 * 提示消息（顶部居中弹出的小条，几秒后自动消失；不挡卡片右上角的按钮）
 *
 * 用法：
 *   YaKitToast.show('已导出', 'success');
 *   YaKitToast.show('没有可导出的内容', 'warning');
 *   YaKitToast.show('保存失败', 'danger', { duration: 4000 });
 *
 * 类型：success 成功 / warning 提醒 / danger 危险
 * 按规范，状态色只用在图标和图标旁的细条上，并且一定同时带图标和文字。
 */
(() => {
  if (globalThis.YaKitToast) return;

  const ICONS = {
    success: '<path d="m7.5 12.5 3 3 6-6.5"/><circle cx="12" cy="12" r="9"/>',
    warning: '<path d="M12 4 2.8 19.5h18.4Z"/><path d="M12 10v4M12 17h.01"/>',
    danger: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/>',
  };
  const EASE = 'cubic-bezier(0.3, 0.7, 0.2, 1)';

  const styles = `
    :host {
      position: fixed;
      top: 12px;
      left: 16px;
      right: 16px;
      z-index: 2147483000;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      pointer-events: none;
    }
    .toast {
      --tone: var(--success, #2F8558);
      position: relative;
      display: flex;
      align-items: center;
      gap: 8px;
      max-width: min(360px, calc(100vw - 32px));
      padding: 10px 14px 10px 16px;
      overflow: hidden;
      border-radius: 10px;
      border: 1px solid var(--divider, #DFE2E5);
      background: var(--card-bg, #FFFFFF);
      color: var(--text-title, #14171A);
      font-size: 13px;
      line-height: 1.5;
      box-shadow: 0 12px 32px -10px rgba(0, 0, 0, 0.28);
      pointer-events: auto;
      animation: in 0.28s ${EASE};
    }
    .toast[data-type="warning"] { --tone: var(--warning, #A8731A); }
    .toast[data-type="danger"] { --tone: var(--danger, #B5433A); }
    /* 左边一道状态色细条 */
    .toast::before {
      content: "";
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 3px;
      background: var(--tone);
    }
    .toast svg { flex: none; color: var(--tone); }
    .toast.leaving { animation: out 0.2s ease-in forwards; }
    @keyframes in { from { opacity: 0; transform: translateY(-8px) scale(0.98); } }
    @keyframes out { to { opacity: 0; transform: translateY(-6px); } }
    @media (prefers-reduced-motion: reduce) {
      .toast, .toast.leaving { animation-duration: 1ms; }
    }
  `;

  let host;
  function container() {
    if (host?.isConnected) return host;
    host = document.createElement('div');
    host.setAttribute('aria-live', 'polite');
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${styles}</style>`;
    document.body.append(host);
    return host;
  }

  globalThis.YaKitToast = {
    show(message, type = 'success', { duration = 2500 } = {}) {
      const root = container().shadowRoot;
      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.dataset.type = ICONS[type] ? type : 'success';
      toast.setAttribute('role', type === 'danger' ? 'alert' : 'status');
      toast.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[toast.dataset.type]}</svg><span></span>`;
      toast.querySelector('span').textContent = message;
      root.append(toast);
      // 最多同时显示 3 条
      const all = root.querySelectorAll('.toast:not(.leaving)');
      if (all.length > 3) all[0].remove();

      const leave = () => {
        toast.classList.add('leaving');
        toast.addEventListener('animationend', () => toast.remove(), { once: true });
        setTimeout(() => toast.remove(), 300);
      };
      setTimeout(leave, duration);
    },
  };
})();
