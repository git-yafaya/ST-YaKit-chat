/**
 * <dsh-card> 卡片
 *
 * 用法：
 *   <dsh-card title="当前聊天" subtitle="128 条消息">
 *     <span slot="extra">右上角放的东西</span>
 *     卡片正文
 *     <div slot="footer">底部按钮</div>
 *   </dsh-card>
 *
 * 可用属性：
 *   title         标题
 *   subtitle      标题下面的小字
 *   interactive   整张卡片可以点击（鼠标放上去会轻轻浮起）
 *
 * 位置（slot）：
 *   extra         标题右边
 *   默认          正文
 *   footer        底部，上面有分隔线；没放东西就不显示
 *
 * 细滚动条：先引入 components/scrollbar.js
 */
(() => {
  if (customElements.get('dsh-card')) return;

  const styles = `
    :host {
      display: block;
      box-sizing: border-box;
      border: var(--card-border, 1px solid #DFE2E5);
      border-radius: 12px;
      background: var(--card-bg, #FFFFFF);
      box-shadow: var(--card-shadow, none);
      color: var(--text-body, #24262A);
      font-size: 14px;
      line-height: 1.6;
      transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
    }

    :host([interactive]) { cursor: pointer; }
    :host([interactive]:hover) {
      transform: translateY(-2px);
      border-color: color-mix(in srgb, var(--primary, #46618A) 30%, var(--divider, #DFE2E5));
      box-shadow: 0 14px 32px -12px color-mix(in srgb, var(--text-title, #14171A) 22%, transparent);
    }
    :host([interactive]:active) { transform: translateY(0); }
    :host(:focus) { outline: none; }
    :host(:focus-visible) { outline: 2px solid var(--primary, #46618A); outline-offset: 2px; }

    .header {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 16px 18px 0;
    }
    .header[hidden] { display: none; }
    .heading { flex: 1; min-width: 0; }
    .title {
      margin: 0;
      font-size: 15px;
      font-weight: 600;
      line-height: 22px;
      color: var(--text-title, #14171A);
    }
    .subtitle {
      margin-top: 2px;
      font-size: 12px;
      line-height: 18px;
      color: var(--text-muted, #6E737A);
    }
    .subtitle:empty { display: none; }

    .body { padding: 12px 18px 18px; }
    .header[hidden] + .body { padding-top: 18px; }

    .footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      padding: 12px 18px;
      border-top: 1px solid var(--divider, #DFE2E5);
    }
    .footer[hidden] { display: none; }

    @media (prefers-reduced-motion: reduce) {
      :host { transition: none; }
      :host([interactive]:hover) { transform: none; }
    }
    ${globalThis.DshScrollbar?.css ?? ''}
  `;

  class DshCard extends HTMLElement {
    static observedAttributes = ['title', 'subtitle', 'interactive'];

    constructor() {
      super();
      const root = this.attachShadow({ mode: 'open' });
      globalThis.DshScrollbar?.watch(root);
      root.innerHTML = `
        <style>${styles}</style>
        <div class="header" part="header">
          <div class="heading">
            <h3 class="title"></h3>
            <div class="subtitle"></div>
          </div>
          <slot name="extra"></slot>
        </div>
        <div class="body" part="body"><slot></slot></div>
        <div class="footer" part="footer"><slot name="footer"></slot></div>
      `;
      this.$ = (sel) => root.querySelector(sel);
      root.querySelectorAll('slot').forEach((slot) => slot.addEventListener('slotchange', () => this.render()));
      this.addEventListener('keydown', (event) => {
        if (this.hasAttribute('interactive') && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          this.click();
        }
      });
    }

    connectedCallback() {
      this.render();
    }

    attributeChangedCallback() {
      this.render();
    }

    render() {
      // 把 title 挪到 data-title，避免鼠标悬停时整张卡片冒出浏览器自带的提示；挪完会自动再渲染一次
      if (this.hasAttribute('title')) {
        this.dataset.title = this.getAttribute('title');
        this.removeAttribute('title');
        return;
      }

      const title = this.dataset.title || '';
      this.$('.title').textContent = title;
      this.$('.subtitle').textContent = this.getAttribute('subtitle') || '';

      const hasExtra = this.$('slot[name="extra"]').assignedNodes().length > 0;
      this.$('.header').hidden = !title && !hasExtra;
      this.$('.footer').hidden = this.$('slot[name="footer"]').assignedNodes().length === 0;

      if (this.hasAttribute('interactive')) {
        this.tabIndex = 0;
        this.setAttribute('role', 'button');
      }
    }
  }

  customElements.define('dsh-card', DshCard);
})();
