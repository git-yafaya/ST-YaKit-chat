/**
 * <yakit-switch> 开关
 *
 * 用法：
 *   <yakit-switch checked label="导出时去掉思维链" description="删掉 <thinking> 标签里的内容"></yakit-switch>
 *   <yakit-switch size="sm" aria-label="启用规则"></yakit-switch>
 *
 * 可用属性：
 *   checked      打开
 *   label        右边的名字（不写时，要写 aria-label 说明开关管什么）
 *   description  名字下面的说明小字
 *   size         sm（小号）/ md（默认）
 *   disabled     禁用
 *
 * 事件：
 *   change  切换时触发，event.detail.checked 是新状态
 *
 * 打开时轨道用点睛色（规范：当前选中态），关闭时是浅浅的灰色轨道。
 */
(() => {
  if (customElements.get('yakit-switch')) return;

  const EASE = 'cubic-bezier(0.3, 0.7, 0.2, 1)';

  const styles = `
    :host {
      display: inline-flex;
      vertical-align: middle;
      --track-w: 38px;
      --track-h: 22px;
      --knob: 16px;
    }
    :host([size="sm"]) { --track-w: 30px; --track-h: 18px; --knob: 12px; }
    :host([hidden]) { display: none; }

    button {
      display: inline-flex;
      align-items: flex-start;
      gap: 10px;
      margin: 0;
      padding: 0;
      border: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    button:focus { outline: none; }
    button:disabled { cursor: not-allowed; }

    .track {
      position: relative;
      flex: none;
      box-sizing: border-box;
      width: var(--track-w);
      height: var(--track-h);
      border-radius: 999px;
      background: color-mix(in srgb, var(--text-title, #14171A) 16%, var(--card-bg, #FFFFFF));
      transition: background-color 0.2s ease;
    }
    :host([label]) .track { margin-top: 1px; }
    button:hover .track { background: color-mix(in srgb, var(--text-title, #14171A) 24%, var(--card-bg, #FFFFFF)); }
    button:focus-visible .track { outline: 2px solid var(--primary, #46618A); outline-offset: 2px; }

    .knob {
      position: absolute;
      top: calc((var(--track-h) - var(--knob)) / 2);
      left: calc((var(--track-h) - var(--knob)) / 2);
      width: var(--knob);
      height: var(--knob);
      border-radius: 50%;
      background: #FFFFFF;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
      transition: transform 0.25s ${EASE}, width 0.15s ease;
    }
    /* 按住时圆点稍微拉长，手感更像真的开关 */
    button:active:not(:disabled) .knob { width: calc(var(--knob) + 4px); }

    /* 打开：点睛色轨道，圆点用点睛色上的文字色 */
    :host([checked]) .track { background: var(--accent, #5B7FB0); }
    :host([checked]) button:hover .track { background: var(--accent, #5B7FB0); filter: brightness(0.95); }
    :host([checked]) .knob {
      background: var(--on-accent, #FFFFFF);
      transform: translateX(calc(var(--track-w) - var(--track-h)));
    }
    :host([checked]) button:active:not(:disabled) .knob {
      transform: translateX(calc(var(--track-w) - var(--track-h) - 4px));
    }

    .text { display: flex; flex-direction: column; min-width: 0; }
    .text[hidden] { display: none; }
    .label {
      font-size: 14px;
      line-height: 24px;
      color: var(--text-title, #14171A);
    }
    :host([size="sm"]) .label { font-size: 13px; line-height: 20px; }
    .description {
      font-size: 12px;
      line-height: 1.5;
      color: var(--text-muted, #6E737A);
    }
    .description:empty { display: none; }

    :host([disabled]) button { opacity: 0.45; }

    @media (prefers-reduced-motion: reduce) {
      .track, .knob { transition: none; }
    }
  `;

  class YaKitSwitch extends HTMLElement {
    static observedAttributes = ['checked', 'label', 'description', 'disabled', 'aria-label'];

    constructor() {
      super();
      const root = this.attachShadow({ mode: 'open', delegatesFocus: true });
      root.innerHTML = `
        <style>${styles}</style>
        <button type="button" role="switch" part="switch">
          <span class="track" part="track"><span class="knob"></span></span>
          <span class="text">
            <span class="label"></span>
            <span class="description"></span>
          </span>
        </button>
      `;
      this.button = root.querySelector('button');
      this.$ = (sel) => root.querySelector(sel);
      this.button.addEventListener('click', () => this.toggle());
    }

    connectedCallback() {
      this.render();
    }

    attributeChangedCallback() {
      this.render();
    }

    get checked() {
      return this.hasAttribute('checked');
    }

    set checked(value) {
      this.toggleAttribute('checked', Boolean(value));
    }

    toggle() {
      if (this.hasAttribute('disabled')) return;
      this.checked = !this.checked;
      this.dispatchEvent(new CustomEvent('change', { detail: { checked: this.checked }, bubbles: true }));
    }

    render() {
      const label = this.getAttribute('label') || '';
      const description = this.getAttribute('description') || '';
      this.$('.label').textContent = label;
      this.$('.description').textContent = description;
      this.$('.text').hidden = !label && !description;

      this.button.setAttribute('aria-checked', String(this.checked));
      this.button.disabled = this.hasAttribute('disabled');
      const ariaLabel = this.getAttribute('aria-label');
      if (!label && ariaLabel) this.button.setAttribute('aria-label', ariaLabel);
      else this.button.removeAttribute('aria-label');
    }
  }

  customElements.define('yakit-switch', YaKitSwitch);
})();
