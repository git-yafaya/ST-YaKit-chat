/**
 * <dsh-drawer> 抽屉
 * 从屏幕边上滑出来的面板，后面变暗。点暗色区域、按 Esc、点右上角 × 都能关。
 *
 * 用法：
 *   <dsh-drawer id="rules" title="正则规则" side="right">
 *     抽屉正文
 *     <div slot="footer">底部按钮</div>
 *   </dsh-drawer>
 *
 *   document.getElementById('rules').show();   打开
 *   document.getElementById('rules').close();  关闭
 *
 * 可用属性：
 *   title    标题
 *   side     从哪边出来：right（默认）/ left / bottom
 *   width    左右抽屉的宽度，单位像素，默认 400
 *
 * 事件：
 *   open / close
 *
 * 细滚动条：先引入 components/scrollbar.js
 */
(() => {
  if (customElements.get('dsh-drawer')) return;

  // 和 icons/close.svg 同一个图形，直接写在这里，组件单独拿去用也不缺文件
  const CLOSE_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  const EASE = 'cubic-bezier(0.3, 0.7, 0.2, 1)';

  const styles = `
    :host { display: contents; }

    dialog {
      position: fixed;
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      border: 0;
      max-width: 100vw;
      max-height: 100dvh;
      display: flex;
      flex-direction: column;
      background: var(--card-bg, #FFFFFF);
      color: var(--text-body, #24262A);
      font-size: 14px;
      line-height: 1.6;
      box-shadow: 0 0 48px -12px rgba(0, 0, 0, 0.3);
    }
    dialog:not([open]) { display: none; }
    dialog::backdrop { background: rgba(0, 0, 0, 0.4); }

    /* 右侧 */
    dialog {
      inset: 0 0 0 auto;
      width: min(var(--drawer-width, 400px), 100vw - 32px);
      height: 100dvh;
      border-radius: 16px 0 0 16px;
    }
    /* 左侧 */
    :host([side="left"]) dialog {
      inset: 0 auto 0 0;
      border-radius: 0 16px 16px 0;
    }
    /* 底部 */
    :host([side="bottom"]) dialog {
      inset: auto 0 0 0;
      width: 100vw;
      height: auto;
      max-height: 85dvh;
      border-radius: 16px 16px 0 0;
    }

    /* 打开、关闭动画 */
    dialog[open] { animation: in-right 0.32s ${EASE}; }
    dialog[open]::backdrop { animation: fade-in 0.32s ease; }
    :host([side="left"]) dialog[open] { animation-name: in-left; }
    :host([side="bottom"]) dialog[open] { animation-name: in-bottom; }
    dialog.closing { animation: out-right 0.22s ease-in forwards; }
    dialog.closing::backdrop { animation: fade-out 0.22s ease-in forwards; }
    :host([side="left"]) dialog.closing { animation-name: out-left; }
    :host([side="bottom"]) dialog.closing { animation-name: out-bottom; }

    @keyframes in-right { from { transform: translateX(100%); } }
    @keyframes in-left { from { transform: translateX(-100%); } }
    @keyframes in-bottom { from { transform: translateY(100%); } }
    @keyframes out-right { to { transform: translateX(100%); } }
    @keyframes out-left { to { transform: translateX(-100%); } }
    @keyframes out-bottom { to { transform: translateY(100%); } }
    @keyframes fade-in { from { opacity: 0; } }
    @keyframes fade-out { to { opacity: 0; } }

    @media (prefers-reduced-motion: reduce) {
      dialog[open], dialog.closing, dialog[open]::backdrop, dialog.closing::backdrop { animation-duration: 1ms; }
    }

    /* 底部抽屉顶上的小横条 */
    .handle { display: none; }
    :host([side="bottom"]) .handle {
      display: block;
      width: 36px;
      height: 4px;
      margin: 8px auto 0;
      border-radius: 2px;
      background: var(--divider, #DFE2E5);
    }

    .header {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: none;
      min-height: 56px;
      padding: 0 10px 0 20px;
      border-bottom: 1px solid var(--divider, #DFE2E5);
    }
    .title {
      flex: 1;
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: var(--text-title, #14171A);
      outline: none;
    }
    .close {
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      padding: 0;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: var(--text-muted, #6E737A);
      cursor: pointer;
    }
    .close:hover { background: var(--divider, #DFE2E5); color: var(--text-title, #14171A); }
    .close:focus { outline: none; }
    .close:focus-visible { outline: 2px solid var(--primary, #46618A); outline-offset: 1px; }

    .body {
      flex: 1;
      min-height: 0;
      overflow: auto;
      padding: 16px 20px;
    }

    .footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      flex: none;
      padding: 12px 20px;
      border-top: 1px solid var(--divider, #DFE2E5);
    }
    .footer[hidden] { display: none; }
    ${globalThis.DshScrollbar?.css ?? ''}
  `;

  class DshDrawer extends HTMLElement {
    static observedAttributes = ['title', 'width'];

    constructor() {
      super();
      const root = this.attachShadow({ mode: 'open' });
      globalThis.DshScrollbar?.watch(root);
      root.innerHTML = `
        <style>${styles}</style>
        <dialog part="panel" aria-labelledby="title">
          <div class="handle" aria-hidden="true"></div>
          <header class="header">
            <h2 class="title" id="title" tabindex="-1" autofocus></h2>
            <button class="close" type="button" aria-label="关闭">${CLOSE_ICON}</button>
          </header>
          <div class="body" part="body"><slot></slot></div>
          <footer class="footer" part="footer"><slot name="footer"></slot></footer>
        </dialog>
      `;
      this.dialog = root.querySelector('dialog');
      this.$ = (sel) => root.querySelector(sel);

      this.$('.close').addEventListener('click', () => this.close());
      // 点暗色区域关闭
      this.dialog.addEventListener('click', (event) => {
        if (event.target === this.dialog) this.close();
      });
      // 按 Esc 时也走带动画的关闭
      this.dialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        this.close();
      });
      this.$('slot[name="footer"]').addEventListener('slotchange', () => this.render());
    }

    connectedCallback() {
      this.render();
    }

    attributeChangedCallback() {
      this.render();
    }

    render() {
      if (this.hasAttribute('title')) {
        this.dataset.title = this.getAttribute('title');
        this.removeAttribute('title');
        return;
      }
      this.$('.title').textContent = this.dataset.title || '';
      const width = Number(this.getAttribute('width'));
      if (width) this.style.setProperty('--drawer-width', `${width}px`);
      this.$('.footer').hidden = this.$('slot[name="footer"]').assignedNodes().length === 0;
    }

    get open() {
      return this.dialog.open;
    }

    show() {
      if (this.dialog.open) return;
      this.dialog.classList.remove('closing');
      this.dialog.showModal();
      // 抽屉开着时，后面的页面不滚动；滚动条藏起来后补上同样宽的空白，页面宽度不变、不跳动
      const root = document.documentElement;
      if (root.style.overflow !== 'hidden') {
        const gap = window.innerWidth - root.clientWidth;
        root.style.overflow = 'hidden';
        root.style.paddingRight = gap > 0 ? `${gap}px` : '';
      }
      this.dispatchEvent(new Event('open'));
    }

    close() {
      if (!this.dialog.open || this.dialog.classList.contains('closing')) return;
      this.dialog.classList.add('closing');
      const finish = () => {
        clearTimeout(fallback);
        if (!this.dialog.classList.contains('closing')) return;
        this.dialog.classList.remove('closing');
        this.dialog.close();
        // 还有别的抽屉开着时，后面的页面继续不滚动
        const othersOpen = [...document.querySelectorAll('dsh-drawer')].some((drawer) => drawer !== this && drawer.open);
        if (!othersOpen) {
          document.documentElement.style.overflow = '';
          document.documentElement.style.paddingRight = '';
        }
        this.dispatchEvent(new Event('close'));
      };
      // 动画结束再真正关闭；万一动画没触发，300ms 后也会关
      const fallback = setTimeout(finish, 300);
      this.dialog.addEventListener('animationend', finish, { once: true });
    }
  }

  customElements.define('dsh-drawer', DshDrawer);
})();
