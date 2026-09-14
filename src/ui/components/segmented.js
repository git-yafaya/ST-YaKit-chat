/**
 * <dsh-segmented> 分段选择器（顶部页签也用它）
 * 样子：一条浅色轻底托，选中项下面有一块点睛色的滑块，切换时滑过去。
 *
 * 用法：
 *   <dsh-segmented value="md" aria-label="导出格式">
 *     <option value="txt">TXT</option>
 *     <option value="md">Markdown</option>
 *   </dsh-segmented>
 *
 * 可用属性：
 *   value       当前选中哪一项（不写就选第一项）
 *   tabs        当作页签使用（读屏软件会读成“页签”）
 *   frosted     磨砂玻璃质感
 *   block       撑满整行，每项一样宽
 *   size="sm"   小号
 *
 * 事件：
 *   change      切换时触发，event.detail.value 是新选中的值
 */
(() => {
  if (customElements.get('dsh-segmented')) return;

  const EASE = 'cubic-bezier(0.3, 0.7, 0.2, 1)';

  const styles = `
    :host {
      display: inline-flex;
      --seg-height: 30px;
      --seg-pad: 3px;
      font-size: 13px;
      vertical-align: middle;
    }
    :host([block]) { display: flex; }
    :host([size="sm"]) { --seg-height: 24px; font-size: 12px; }

    /* 轻底托：用标题色调一点点透明度，深浅主题都自然 */
    .track {
      position: relative;
      display: flex;
      flex: 1;
      gap: 2px;
      padding: var(--seg-pad);
      border-radius: 10px;
      background: color-mix(in srgb, var(--text-title, #14171A) 5%, transparent);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--text-title, #14171A) 6%, transparent);
    }
    :host([size="sm"]) .track { border-radius: 8px; }

    /* 磨砂：半透明 + 模糊背后的内容 + 顶部一道细高光 */
    :host([frosted]) .track {
      background: color-mix(in srgb, var(--text-title, #14171A) 5%, color-mix(in srgb, var(--card-bg, #FFFFFF) 55%, transparent));
      -webkit-backdrop-filter: blur(16px) saturate(160%);
      backdrop-filter: blur(16px) saturate(160%);
      box-shadow:
        inset 0 1px 0 color-mix(in srgb, #FFFFFF 45%, transparent),
        inset 0 0 0 1px color-mix(in srgb, var(--text-title, #14171A) 7%, transparent),
        0 1px 2px rgba(0, 0, 0, 0.04);
    }

    /* 滑块：选中态用点睛色 */
    .indicator {
      position: absolute;
      top: var(--seg-pad);
      bottom: var(--seg-pad);
      left: 0;
      width: 0;
      border-radius: 7px;
      background: var(--accent, #5B7FB0);
      box-shadow:
        0 1px 2px rgba(0, 0, 0, 0.08),
        0 3px 10px -3px color-mix(in srgb, var(--accent, #5B7FB0) 70%, transparent);
      opacity: 0;
      transition: transform 0.28s ${EASE}, width 0.28s ${EASE};
    }
    :host([size="sm"]) .indicator { border-radius: 5px; }
    :host(:not([data-ready])) .indicator { transition: none; }

    button {
      position: relative;
      z-index: 1;
      flex: none;
      height: var(--seg-height);
      padding: 0 14px;
      border: 0;
      border-radius: 7px;
      background: transparent;
      color: var(--text-body, #24262A);
      font: inherit;
      white-space: nowrap;
      cursor: pointer;
      transition: color 0.2s ease;
    }
    :host([block]) button { flex: 1; }
    :host([size="sm"]) button { padding: 0 10px; }
    button:hover { color: var(--text-title, #14171A); }
    button:disabled { cursor: not-allowed; opacity: 0.45; }
    button:focus { outline: none; }
    button:focus-visible { outline: 2px solid var(--primary, #46618A); outline-offset: 1px; }
    button[aria-checked="true"],
    button[aria-selected="true"] {
      color: var(--on-accent, #FFFFFF);
      font-weight: 500;
    }

    @media (prefers-reduced-motion: reduce) {
      .indicator, button { transition: none; }
    }
  `;

  class DshSegmented extends HTMLElement {
    static observedAttributes = ['value', 'tabs', 'aria-label'];

    constructor() {
      super();
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>${styles}</style><div class="track" part="track"><span class="indicator" part="indicator"></span></div>`;
      this.track = root.querySelector('.track');
      this.indicator = root.querySelector('.indicator');
      this.buttons = [];
      // 宽度变了（换字体、窗口变大小）时直接摆好滑块，不播放滑动动画
      this.resizeObserver = new ResizeObserver(() => this.place({ animate: false }));
      this.childObserver = new MutationObserver(() => this.build());
      this.onFontsLoaded = () => this.place({ animate: false });
    }

    connectedCallback() {
      this.build();
      this.resizeObserver.observe(this);
      this.childObserver.observe(this, { childList: true, subtree: true, characterData: true });
      // 先摆好滑块位置，再打开动画，避免一出现就从左边滑过来
      requestAnimationFrame(() => {
        this.place({ animate: false });
        requestAnimationFrame(() => this.setAttribute('data-ready', ''));
      });
      document.fonts?.addEventListener('loadingdone', this.onFontsLoaded);
    }

    disconnectedCallback() {
      this.resizeObserver.disconnect();
      this.childObserver.disconnect();
      document.fonts?.removeEventListener('loadingdone', this.onFontsLoaded);
    }

    attributeChangedCallback() {
      this.sync();
    }

    get value() {
      return this.getAttribute('value') ?? this.buttons[0]?.dataset.value ?? '';
    }

    set value(v) {
      this.setAttribute('value', v);
    }

    build() {
      this.buttons.forEach((b) => b.remove());
      this.buttons = [...this.querySelectorAll('option')].map((option) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = option.textContent;
        button.dataset.value = option.value;
        button.disabled = option.disabled;
        button.addEventListener('click', () => this.select(option.value));
        button.addEventListener('keydown', (event) => this.onKey(event));
        this.track.append(button);
        this.resizeObserver.observe(button);
        return button;
      });
      this.sync();
    }

    select(value, focus = false) {
      if (value !== this.value) {
        this.value = value;
        this.dispatchEvent(new CustomEvent('change', { detail: { value }, bubbles: true }));
      }
      if (focus) this.buttons.find((b) => b.dataset.value === value)?.focus();
    }

    onKey(event) {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      const enabled = this.buttons.filter((b) => !b.disabled);
      const index = enabled.findIndex((b) => b.dataset.value === this.value);
      const next = enabled[(index + step + enabled.length) % enabled.length];
      if (next) this.select(next.dataset.value, true);
    }

    sync() {
      if (!this.buttons.length) return;
      const tabs = this.hasAttribute('tabs');
      const value = this.value;
      this.track.setAttribute('role', tabs ? 'tablist' : 'radiogroup');
      const label = this.getAttribute('aria-label');
      if (label) this.track.setAttribute('aria-label', label);

      this.buttons.forEach((button) => {
        const selected = button.dataset.value === value;
        button.setAttribute('role', tabs ? 'tab' : 'radio');
        button.setAttribute(tabs ? 'aria-selected' : 'aria-checked', String(selected));
        button.removeAttribute(tabs ? 'aria-checked' : 'aria-selected');
        button.tabIndex = selected ? 0 : -1;
      });
      this.place();
    }

    place({ animate = true } = {}) {
      const selected = this.buttons.find((b) => b.dataset.value === this.value);
      if (!selected || !selected.offsetWidth) {
        this.indicator.style.opacity = '0';
        return;
      }
      const width = `${selected.offsetWidth}px`;
      const transform = `translateX(${selected.offsetLeft}px)`;
      if (this.indicator.style.opacity === '1' && this.indicator.style.width === width
        && this.indicator.style.transform === transform) return;

      if (!animate) this.indicator.style.transition = 'none';
      this.indicator.style.opacity = '1';
      this.indicator.style.width = width;
      this.indicator.style.transform = transform;
      if (!animate) {
        void this.indicator.offsetWidth;
        this.indicator.style.transition = '';
      }
    }
  }

  customElements.define('dsh-segmented', DshSegmented);
})();
