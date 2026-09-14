/**
 * <dsh-menu> 更多操作菜单（「⋯」按钮，点开一列操作）
 *
 * 用法：
 *   <dsh-menu label="更多操作">
 *     <option value="rename" icon="../icons/edit.svg">重命名</option>
 *     <option value="delete" icon="../icons/trash.svg">删除</option>
 *   </dsh-menu>
 *
 * 可用属性：
 *   label   按钮的无障碍名字（只有图标，必须写）
 *   size    sm（28px）/ md（32px，默认）
 *
 * 选项写法：
 *   <option value="值" icon="图标地址" disabled>显示的文字</option>
 *
 * 事件：
 *   select  点了某个操作时触发，event.detail.value 是它的值
 *
 * 菜单外观和下拉选择（dsh-select）的菜单一致；贴着按钮右边对齐，下方放不下往上开。
 * 需要先引入 components/icon.js（用了图标时）。
 */
(() => {
  if (customElements.get('dsh-menu')) return;

  const DOTS = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>';
  const EASE = 'cubic-bezier(0.3, 0.7, 0.2, 1)';

  let uid = 0;

  const styles = `
    :host { display: inline-flex; vertical-align: middle; --menu-trigger: 32px; }
    :host([size="sm"]) { --menu-trigger: 28px; }
    :host([hidden]) { display: none; }

    .trigger {
      display: grid;
      place-items: center;
      width: var(--menu-trigger);
      height: var(--menu-trigger);
      padding: 0;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: var(--text-muted, #6E737A);
      cursor: pointer;
      transition: background-color 0.15s ease, color 0.15s ease, transform 0.1s ease;
    }
    .trigger:hover,
    .trigger[aria-expanded="true"] {
      background: color-mix(in srgb, var(--text-title, #14171A) 6%, transparent);
      color: var(--text-title, #14171A);
    }
    .trigger:active { transform: scale(0.97); }
    .trigger:focus { outline: none; }
    .trigger:focus-visible { outline: 2px solid var(--primary, #46618A); outline-offset: 1px; }

    .menu {
      position: fixed;
      z-index: 1000;
      box-sizing: border-box;
      min-width: 148px;
      margin: 0;
      padding: 4px;
      list-style: none;
      border: 1px solid var(--divider, #DFE2E5);
      border-radius: 10px;
      background: var(--card-bg, #FFFFFF);
      color: var(--text-body, #24262A);
      box-shadow: 0 16px 40px -12px rgba(0, 0, 0, 0.28);
      font: inherit;
      font-size: 13px;
    }
    .menu:not(.is-open) { display: none; }
    .menu.is-open { animation: menu-in 0.16s ${EASE}; }
    .menu.is-up.is-open { animation-name: menu-in-up; }
    @keyframes menu-in { from { opacity: 0; transform: translateY(-4px); } }
    @keyframes menu-in-up { from { opacity: 0; transform: translateY(4px); } }

    .item {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 34px;
      padding: 0 10px;
      border-radius: 6px;
      white-space: nowrap;
      cursor: pointer;
      user-select: none;
    }
    .item dsh-icon { --icon-size: 16px; color: var(--text-muted, #6E737A); }
    .item.is-active { background: color-mix(in srgb, var(--text-title, #14171A) 6%, transparent); color: var(--text-title, #14171A); }
    .item[aria-disabled="true"] { cursor: not-allowed; opacity: 0.45; }

    @media (prefers-reduced-motion: reduce) {
      .trigger { transition: none; }
      .menu.is-open { animation: none; }
    }
  `;

  class DshMenu extends HTMLElement {
    static observedAttributes = ['label'];

    constructor() {
      super();
      const id = ++uid;
      const root = this.attachShadow({ mode: 'open', delegatesFocus: true });
      root.innerHTML = `
        <style>${styles}</style>
        <button class="trigger" type="button" part="trigger" aria-haspopup="menu" aria-expanded="false" aria-controls="menu-${id}">${DOTS}</button>
        <ul class="menu" id="menu-${id}" role="menu" part="menu"></ul>
      `;
      this.trigger = root.querySelector('.trigger');
      this.menu = root.querySelector('.menu');
      this.items = [];
      this.activeIndex = -1;

      // 鼠标点击时不抢焦点，避免出现焦点框；键盘操作不受影响
      this.trigger.addEventListener('mousedown', (event) => event.preventDefault());
      this.trigger.addEventListener('click', (event) => {
        event.stopPropagation();
        this.isOpen ? this.close() : this.open();
      });
      this.trigger.addEventListener('keydown', (event) => this.onKey(event));
      this.menu.addEventListener('pointermove', (event) => {
        const index = this.items.findIndex((item) => item.el === event.target.closest('.item'));
        if (index >= 0) this.setActive(index);
      });
      this.menu.addEventListener('click', (event) => {
        event.stopPropagation();
        const item = this.items.find((entry) => entry.el === event.target.closest('.item'));
        if (item && !item.disabled) this.choose(item.value);
      });
      this.onOutside = (event) => {
        if (!event.composedPath().includes(this)) this.close();
      };
      this.onReposition = () => this.close();
      this.childObserver = new MutationObserver(() => this.build());
    }

    connectedCallback() {
      this.build();
      this.render();
      this.childObserver.observe(this, { childList: true, subtree: true, attributes: true, characterData: true });
    }

    disconnectedCallback() {
      this.childObserver.disconnect();
      this.close();
    }

    attributeChangedCallback() {
      this.render();
    }

    render() {
      this.trigger.setAttribute('aria-label', this.getAttribute('label') || '更多操作');
    }

    get isOpen() {
      return this.menu.classList.contains('is-open');
    }

    build() {
      this.items = [...this.querySelectorAll('option')].map((option, index) => {
        const li = document.createElement('li');
        li.className = 'item';
        li.setAttribute('role', 'menuitem');
        const icon = option.getAttribute('icon');
        if (icon) {
          const iconEl = document.createElement('dsh-icon');
          iconEl.setAttribute('src', new URL(icon, document.baseURI).href);
          iconEl.setAttribute('aria-hidden', 'true');
          li.append(iconEl);
        }
        li.append(option.textContent.trim());
        if (option.disabled) li.setAttribute('aria-disabled', 'true');
        return { value: option.value, disabled: option.disabled, el: li, index };
      });
      this.menu.replaceChildren(...this.items.map((item) => item.el));
    }

    open() {
      if (this.isOpen || !this.items.length) return;
      this.menu.classList.add('is-open');
      this.trigger.setAttribute('aria-expanded', 'true');
      this.position();
      this.setActive(-1);
      document.addEventListener('pointerdown', this.onOutside, true);
      window.addEventListener('scroll', this.onReposition, true);
      window.addEventListener('resize', this.onReposition);
    }

    close({ focus = false } = {}) {
      if (!this.isOpen) return;
      this.menu.classList.remove('is-open', 'is-up');
      this.trigger.setAttribute('aria-expanded', 'false');
      document.removeEventListener('pointerdown', this.onOutside, true);
      window.removeEventListener('scroll', this.onReposition, true);
      window.removeEventListener('resize', this.onReposition);
      if (focus) this.trigger.focus();
    }

    // 菜单右边和按钮右边对齐；下面放不下就往上开
    position() {
      const rect = this.trigger.getBoundingClientRect();
      const gap = 4;
      const margin = 8;
      const height = this.menu.offsetHeight;
      const width = this.menu.offsetWidth;
      const up = window.innerHeight - rect.bottom - gap - margin < height && rect.top > height + gap + margin;
      this.menu.classList.toggle('is-up', up);
      this.menu.style.left = `${Math.max(margin, Math.min(rect.right - width, window.innerWidth - width - margin))}px`;
      this.menu.style.top = up ? `${rect.top - gap - height}px` : `${rect.bottom + gap}px`;
    }

    setActive(index) {
      this.activeIndex = index;
      this.items.forEach((item, i) => item.el.classList.toggle('is-active', i === index));
    }

    moveActive(step) {
      const count = this.items.length;
      let index = this.activeIndex;
      for (let i = 0; i < count; i++) {
        index = (index + step + count) % count;
        if (!this.items[index].disabled) break;
      }
      this.setActive(index);
    }

    choose(value) {
      this.close({ focus: true });
      this.dispatchEvent(new CustomEvent('select', { detail: { value }, bubbles: true }));
    }

    onKey(event) {
      if (!this.isOpen) {
        if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
          event.preventDefault();
          this.open();
          this.moveActive(event.key === 'ArrowDown' ? 1 : -1);
        }
        return;
      }
      switch (event.key) {
        case 'ArrowDown': event.preventDefault(); this.moveActive(1); break;
        case 'ArrowUp': event.preventDefault(); this.moveActive(-1); break;
        case 'Enter':
        case ' ': {
          const item = this.items[this.activeIndex];
          if (!item) break;
          event.preventDefault();
          if (!item.disabled) this.choose(item.value);
          break;
        }
        case 'Escape':
          // 只收起菜单，不让外面的弹窗、抽屉跟着关
          event.preventDefault();
          event.stopPropagation();
          this.close({ focus: true });
          break;
        case 'Tab':
          this.close();
          break;
      }
    }
  }

  customElements.define('dsh-menu', DshMenu);
})();
