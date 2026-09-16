/**
 * <yakit-collapse> 折叠项
 * 一行标题，点一下在原地往下展开内容，再点收起。设置页的一级项目都用它。
 *
 * 用法：
 *   <yakit-collapse title="主题" summary="冷杉与海盐" icon="../icons/settings.svg">
 *     展开后的内容
 *   </yakit-collapse>
 *
 *   <yakit-collapse title="组件示例" link></yakit-collapse>   点了不展开，只触发 activate 事件（比如打开抽屉）
 *
 * 可用属性：
 *   title     标题
 *   summary   行尾的灰色小字，一般写当前选了什么
 *   icon      左边的图标地址
 *   open      展开
 *   link      这一行是入口，不展开；箭头朝右
 *
 * 事件：
 *   toggle    展开或收起时触发，event.detail.open 是新状态
 *   activate  带 link 的行被点击时触发
 *
 * 多个折叠项排在一起时，外面写 yakit-collapse + yakit-collapse { border-top: 1px solid var(--divider); }
 * 需要先引入 components/icon.js（用了图标时）。
 */
(() => {
  if (customElements.get('yakit-collapse')) return;

  const CHEVRON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  const EASE = 'cubic-bezier(0.3, 0.7, 0.2, 1)';

  const styles = `
    :host { display: block; }
    :host([hidden]) { display: none; }

    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      box-sizing: border-box;
      width: 100%;
      min-height: 52px;
      padding: 10px 16px;
      border: 0;
      background: transparent;
      color: var(--text-title, #14171A);
      font: inherit;
      font-size: 14px;
      text-align: left;
      cursor: pointer;
      transition: background-color 0.15s ease;
      /* 标题行是按钮，点一下不选中文字、不闪蓝框 */
      user-select: none;
      -webkit-user-select: none;
      -webkit-tap-highlight-color: transparent;
    }
    .header:hover { background: color-mix(in srgb, var(--text-title, #14171A) 4%, transparent); }
    .header:focus { outline: none; }
    .header:focus-visible { outline: 2px solid var(--primary, #46618A); outline-offset: -2px; }

    yakit-icon { color: var(--text-muted, #6E737A); --icon-size: 20px; }
    yakit-icon[hidden] { display: none; }

    .title { flex: 1; min-width: 0; font-weight: 500; }
    .summary {
      max-width: 50%;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-size: 13px;
      color: var(--text-muted, #6E737A);
    }
    .summary:empty { display: none; }

    .chevron {
      display: grid;
      flex: none;
      color: var(--text-muted, #6E737A);
      transition: transform 0.25s ${EASE};
    }
    :host([open]) .chevron { transform: rotate(180deg); }
    :host([link]) .chevron { transform: rotate(-90deg); }

    /* 展开动画：高度从 0 过渡到内容高度 */
    .panel {
      display: grid;
      grid-template-rows: 0fr;
      transition: grid-template-rows 0.28s ${EASE};
    }
    :host([open]) .panel { grid-template-rows: 1fr; }
    .inner { min-height: 0; overflow: hidden; }
    :host(:not([open])) .inner { visibility: hidden; transition: visibility 0s 0.28s; }
    .content { padding: 4px 16px 16px; }
    :host([link]) .panel { display: none; }

    @media (prefers-reduced-motion: reduce) {
      .panel, .chevron, .header { transition: none; }
    }
  `;

  let uid = 0;

  class YaKitCollapse extends HTMLElement {
    static observedAttributes = ['title', 'summary', 'icon', 'open', 'link'];

    constructor() {
      super();
      const id = `collapse-${++uid}`;
      const root = this.attachShadow({ mode: 'open', delegatesFocus: true });
      root.innerHTML = `
        <style>${styles}</style>
        <button class="header" type="button" part="header" aria-controls="${id}">
          <yakit-icon hidden aria-hidden="true"></yakit-icon>
          <span class="title"></span>
          <span class="summary"></span>
          <span class="chevron">${CHEVRON}</span>
        </button>
        <div class="panel" id="${id}" role="region">
          <div class="inner"><div class="content" part="content"><slot></slot></div></div>
        </div>
      `;
      this.$ = (sel) => root.querySelector(sel);
      this.$('.header').addEventListener('click', () => {
        if (this.hasAttribute('link')) {
          this.dispatchEvent(new Event('activate', { bubbles: true }));
          return;
        }
        this.open = !this.open;
        this.dispatchEvent(new CustomEvent('toggle', { detail: { open: this.open }, bubbles: true }));
      });
    }

    connectedCallback() {
      this.render();
    }

    attributeChangedCallback() {
      this.render();
    }

    get open() {
      return this.hasAttribute('open');
    }

    set open(value) {
      this.toggleAttribute('open', Boolean(value));
    }

    render() {
      // title 挪到 data-title，避免鼠标悬停时整块冒出浏览器提示
      if (this.hasAttribute('title')) {
        this.dataset.title = this.getAttribute('title');
        this.removeAttribute('title');
        return;
      }
      const title = this.dataset.title || '';
      this.$('.title').textContent = title;
      this.$('.summary').textContent = this.getAttribute('summary') || '';
      this.$('.panel').setAttribute('aria-label', title);

      const icon = this.getAttribute('icon');
      const iconEl = this.$('yakit-icon');
      iconEl.hidden = !icon;
      if (icon) iconEl.setAttribute('src', new URL(icon, document.baseURI).href);

      const header = this.$('.header');
      if (this.hasAttribute('link')) header.removeAttribute('aria-expanded');
      else header.setAttribute('aria-expanded', String(this.open));
    }
  }

  customElements.define('yakit-collapse', YaKitCollapse);
})();
