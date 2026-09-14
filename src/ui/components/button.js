/**
 * <yakit-button> 按钮
 *
 * 用法：
 *   <yakit-button variant="primary">开始导出</yakit-button>
 *   <yakit-button icon="../icons/plus.svg">新建规则</yakit-button>
 *   <yakit-button variant="ghost" icon="../icons/trash.svg" aria-label="删除"></yakit-button>
 *
 * 可用属性：
 *   variant    primary   主操作，点睛色（一块区域里最多放一个）
 *              secondary 普通按钮，带边框（默认）
 *              ghost     只有文字，不带边框，用在不太重要的操作
 *   size       sm（28px）/ md（32px，默认）/ lg（40px）
 *   icon       左边的图标地址，用 icons 文件夹里的 SVG
 *   loading    显示加载中，这时点不了
 *   disabled   禁用
 *   block      撑满整行
 *   只放图标、不写文字时，要写 aria-label 说明按钮是做什么的
 *
 * 状态色（红、黄、绿）按规则只用在提示框和徽章上，所以按钮没有“危险”样式。
 * 删除这类操作，先弹出提示框让用户确认。
 */
(() => {
  if (customElements.get('yakit-button')) return;

  const styles = `
    :host {
      display: inline-flex;
      vertical-align: middle;
      --btn-height: 32px;
      --btn-pad: 14px;
      --btn-font: 13px;
      --btn-icon: 16px;
    }
    :host([size="sm"]) { --btn-height: 28px; --btn-pad: 10px; --btn-font: 12px; --btn-icon: 14px; }
    :host([size="lg"]) { --btn-height: 40px; --btn-pad: 18px; --btn-font: 14px; --btn-icon: 18px; }
    :host([block]) { display: flex; }
    :host([hidden]) { display: none; }

    button {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      flex: 1;
      box-sizing: border-box;
      height: var(--btn-height);
      min-width: var(--btn-height);
      padding: 0 var(--btn-pad);
      border: 1px solid var(--divider, #DFE2E5);
      border-radius: 8px;
      background: var(--card-bg, #FFFFFF);
      color: var(--text-body, #24262A);
      font: inherit;
      font-size: var(--btn-font);
      font-weight: 500;
      line-height: 1;
      white-space: nowrap;
      cursor: pointer;
      user-select: none;
      transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 0.1s ease, filter 0.15s ease;
    }
    button:hover { border-color: color-mix(in srgb, var(--text-title, #14171A) 28%, var(--divider, #DFE2E5)); color: var(--text-title, #14171A); }
    button:active { transform: scale(0.97); }
    button:focus { outline: none; }
    button:focus-visible { outline: 2px solid var(--primary, #46618A); outline-offset: 2px; }

    /* 主操作：点睛色 */
    :host([variant="primary"]) button {
      border-color: transparent;
      background: var(--accent, #5B7FB0);
      color: var(--on-accent, #FFFFFF);
      box-shadow: 0 2px 8px -3px color-mix(in srgb, var(--accent, #5B7FB0) 70%, transparent);
    }
    :host([variant="primary"]) button:hover { filter: brightness(0.95); color: var(--on-accent, #FFFFFF); }

    /* 次要：只有文字 */
    :host([variant="ghost"]) button {
      border-color: transparent;
      background: transparent;
    }
    :host([variant="ghost"]) button:hover {
      background: color-mix(in srgb, var(--text-title, #14171A) 6%, transparent);
    }

    /* 只有图标时变成正方形 */
    :host([data-icon-only]) button { padding: 0; width: var(--btn-height); }

    /* 禁用、加载中 */
    button:disabled { cursor: not-allowed; opacity: 0.45; transform: none; filter: none; }
    :host([loading]) button:disabled { opacity: 1; cursor: progress; }
    :host([loading]) .label,
    :host([loading]) yakit-icon,
    :host([loading]) .icon-slot { visibility: hidden; }

    yakit-icon, .icon-slot { width: var(--btn-icon); height: var(--btn-icon); --icon-size: var(--btn-icon); }
    yakit-icon[hidden] { display: none; }

    /* 加载转圈：跟随按钮文字颜色，保证在点睛色按钮上也看得清 */
    .spinner {
      position: absolute;
      inset: 0;
      margin: auto;
      width: var(--btn-icon);
      height: var(--btn-icon);
      box-sizing: border-box;
      border: 2px solid color-mix(in srgb, currentColor 25%, transparent);
      border-top-color: currentColor;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }
    .spinner[hidden] { display: none; }
    @keyframes spin { to { transform: rotate(360deg); } }

    @media (prefers-reduced-motion: reduce) {
      button { transition: none; }
      button:active { transform: none; }
    }
  `;

  class YaKitButton extends HTMLElement {
    static observedAttributes = ['icon', 'loading', 'disabled', 'aria-label'];

    constructor() {
      super();
      const root = this.attachShadow({ mode: 'open', delegatesFocus: true });
      root.innerHTML = `
        <style>${styles}</style>
        <button type="button" part="button">
          <yakit-icon hidden></yakit-icon>
          <span class="label"><slot></slot></span>
          <span class="spinner" hidden aria-hidden="true"></span>
        </button>
      `;
      this.button = root.querySelector('button');
      this.$ = (sel) => root.querySelector(sel);
      root.querySelector('slot').addEventListener('slotchange', () => this.render());

      // 禁用或加载中时，外面绑定的点击事件不触发
      this.addEventListener('click', (event) => {
        if (this.hasAttribute('disabled') || this.hasAttribute('loading')) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      }, true);
    }

    connectedCallback() {
      this.render();
    }

    attributeChangedCallback() {
      this.render();
    }

    render() {
      const icon = this.getAttribute('icon');
      const iconEl = this.$('yakit-icon');
      iconEl.hidden = !icon;
      if (icon) {
        iconEl.setAttribute('src', new URL(icon, document.baseURI).href);
        iconEl.setAttribute('line', '1.75');
      }

      const hasText = this.textContent.trim().length > 0;
      this.toggleAttribute('data-icon-only', Boolean(icon) && !hasText);

      const loading = this.hasAttribute('loading');
      this.button.disabled = this.hasAttribute('disabled') || loading;
      this.$('.spinner').hidden = !loading;
      this.button.setAttribute('aria-busy', String(loading));

      const label = this.getAttribute('aria-label');
      if (label) this.button.setAttribute('aria-label', label);
      else this.button.removeAttribute('aria-label');
    }
  }

  customElements.define('yakit-button', YaKitButton);
})();
