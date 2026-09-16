/**
 * <yakit-select> 下拉选择
 *
 * 用法：
 *   <yakit-select label="导出格式" value="md" hint="EPUB 适合在阅读器里看">
 *     <option value="txt">TXT</option>
 *     <option value="md" description="保留标题和粗体">Markdown</option>
 *     <optgroup label="电子书">
 *       <option value="epub">EPUB</option>
 *     </optgroup>
 *   </yakit-select>
 *
 * 可用属性：
 *   label        上方的名字
 *   placeholder  没选时显示的灰字（默认“请选择”）
 *   value        当前选中的值；multiple 时是用逗号隔开的多个值
 *   multiple     可以同时选多项：点选项只切换勾选，菜单不收起
 *   multi-label  multiple 时按钮上的文字，{n} 换成选了几项（默认「已选 {n} 项」）
 *   hint         下方的说明小字
 *   error        出错提示（带图标，写上就显示）
 *   searchable   菜单顶部加搜索框，选项多时用
 *   size         sm（28px）/ md（36px，默认）
 *   required     必填，名字后面加 *
 *   disabled     禁用
 *
 * 选项写法：
 *   <option value="值" description="选项下面的说明" icon="图标地址" disabled>显示的文字</option>
 *   写了 icon 的选项前面显示图标，选中后按钮上也显示（需要先引入 components/icon.js）
 *   <optgroup label="分组名"> 可以把选项分组
 *
 * 事件：
 *   change  选中变化时触发，event.detail.value 是新值；multiple 时 event.detail.values 是选中的值数组
 *
 * 外框和输入框（yakit-input）长得一样；当前选中项右边是点睛色的小圆勾。
 *
 * 细滚动条：先引入 components/scrollbar.js
 */
(() => {
  if (customElements.get('yakit-select')) return;

  const CHEVRON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  const CHECK = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 12 5 5L20 6"/></svg>';
  const ALERT_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/></svg>';
  const SEARCH = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
  const EASE = 'cubic-bezier(0.3, 0.7, 0.2, 1)';

  let uid = 0;

  const styles = `
    :host {
      display: block;
      --select-height: 36px;
      --select-font: 14px;
      color: var(--text-body, #24262A);
    }
    :host([size="sm"]) { --select-height: 28px; --select-font: 13px; }
    :host([hidden]) { display: none; }

    .label {
      display: block;
      margin-bottom: 6px;
      font-size: 13px;
      font-weight: 500;
      color: var(--text-title, #14171A);
    }
    .label:empty { display: none; }
    .required { margin-left: 2px; color: var(--text-muted, #6E737A); }

    .trigger {
      display: flex;
      align-items: center;
      gap: 8px;
      box-sizing: border-box;
      width: 100%;
      height: var(--select-height);
      padding: 0 8px 0 10px;
      border: 1px solid var(--divider, #DFE2E5);
      border-radius: 8px;
      background: var(--card-bg, #FFFFFF);
      color: var(--text-title, #14171A);
      font: inherit;
      font-size: var(--select-font);
      text-align: left;
      cursor: pointer;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .trigger:hover { border-color: color-mix(in srgb, var(--text-title, #14171A) 28%, var(--divider, #DFE2E5)); }
    .trigger:focus { outline: none; }
    /* 聚焦、菜单打开：主色边框 + 淡淡的主色光晕（和输入框一致） */
    .trigger:focus-visible,
    .trigger[aria-expanded="true"] {
      border-color: var(--primary, #46618A);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary, #46618A) 18%, transparent);
    }
    .trigger:disabled { cursor: not-allowed; opacity: 0.5; }

    .value-icon { --icon-size: 20px; }
    .value-icon[hidden] { display: none; }
    .option yakit-icon { --icon-size: 22px; }
    .value {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .value.is-placeholder { color: var(--text-muted, #6E737A); }
    .chevron {
      display: grid;
      flex: none;
      color: var(--text-muted, #6E737A);
      transition: transform 0.2s ${EASE};
    }
    .trigger[aria-expanded="true"] .chevron { transform: rotate(180deg); }

    /* ---------- 菜单 ---------- */
    .menu {
      position: fixed;
      inset: auto;
      z-index: 1000;
      box-sizing: border-box;
      margin: 0;
      padding: 4px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid var(--divider, #DFE2E5);
      border-radius: 10px;
      background: var(--card-bg, #FFFFFF);
      color: var(--text-body, #24262A);
      box-shadow: 0 16px 40px -12px rgba(0, 0, 0, 0.28);
      font: inherit;
      font-size: var(--select-font);
    }
    .menu:not(.is-open) { display: none; }
    .menu.is-open { animation: menu-in 0.16s ${EASE}; }
    .menu.is-up.is-open { animation-name: menu-in-up; }
    @keyframes menu-in { from { opacity: 0; transform: translateY(-4px); } }
    @keyframes menu-in-up { from { opacity: 0; transform: translateY(4px); } }

    .search {
      display: flex;
      align-items: center;
      gap: 6px;
      flex: none;
      margin: 2px 2px 4px;
      padding: 0 8px;
      height: 32px;
      border-radius: 6px;
      background: color-mix(in srgb, var(--text-title, #14171A) 5%, transparent);
      color: var(--text-muted, #6E737A);
    }
    .search[hidden] { display: none; }
    .search input {
      flex: 1;
      min-width: 0;
      border: 0;
      outline: none;
      background: transparent;
      color: var(--text-title, #14171A);
      font: inherit;
      font-size: 13px;
    }
    .search input::placeholder { color: var(--text-muted, #6E737A); }

    .list {
      overflow-y: auto;
      overscroll-behavior: contain;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .group {
      padding: 8px 10px 4px;
      font-size: 12px;
      font-weight: 500;
      color: var(--text-muted, #6E737A);
    }

    .option {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 34px;
      padding: 6px 10px;
      border-radius: 6px;
      color: var(--text-body, #24262A);
      cursor: pointer;
      user-select: none;
    }
    .option-text { flex: 1; min-width: 0; }
    .option-label { display: block; line-height: 1.4; }
    .option-description {
      display: block;
      margin-top: 1px;
      font-size: 12px;
      line-height: 1.4;
      color: var(--text-muted, #6E737A);
    }
    .option.is-active { background: color-mix(in srgb, var(--text-title, #14171A) 6%, transparent); }
    .option[aria-selected="true"] { color: var(--text-title, #14171A); font-weight: 500; }
    .option[aria-disabled="true"] { cursor: not-allowed; opacity: 0.45; }
    .option[hidden], .group[hidden] { display: none; }

    /* 选中标记：点睛色小圆块 + 勾（点睛色只当色块底色） */
    .mark {
      display: grid;
      place-items: center;
      flex: none;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--accent, #5B7FB0);
      color: var(--on-accent, #FFFFFF);
      visibility: hidden;
    }
    .option[aria-selected="true"] .mark { visibility: visible; }

    .empty {
      padding: 14px 10px;
      font-size: 13px;
      text-align: center;
      color: var(--text-muted, #6E737A);
    }
    .empty[hidden] { display: none; }

    /* ---------- 说明、出错 ---------- */
    .footer {
      margin-top: 6px;
      font-size: 12px;
      line-height: 1.5;
    }
    .footer[hidden] { display: none; }
    .hint { color: var(--text-muted, #6E737A); }
    .error {
      display: flex;
      align-items: flex-start;
      gap: 4px;
      color: var(--danger, #B5433A);
      font-weight: 500;
    }
    .error svg { flex: none; margin-top: 2px; }
    .hint[hidden], .error[hidden] { display: none; }

    @media (prefers-reduced-motion: reduce) {
      .trigger, .chevron { transition: none; }
      .menu.is-open { animation: none; }
    }
    ${globalThis.YaKitScrollbar?.css ?? ''}
  `;

  class YaKitSelect extends HTMLElement {
    static observedAttributes = ['label', 'placeholder', 'value', 'hint', 'error', 'searchable', 'required', 'disabled', 'aria-label', 'multiple', 'multi-label'];

    constructor() {
      super();
      const id = ++uid;
      const root = this.attachShadow({ mode: 'open', delegatesFocus: true });
      globalThis.YaKitScrollbar?.watch(root);
      root.innerHTML = `
        <style>${styles}</style>
        <span class="label" id="label"></span>
        <button class="trigger" type="button" part="trigger" aria-haspopup="listbox" aria-expanded="false"
          aria-controls="list-${id}">
          <yakit-icon class="value-icon" hidden aria-hidden="true"></yakit-icon>
          <span class="value"></span>
          <span class="chevron">${CHEVRON}</span>
        </button>
        <div class="menu" part="menu">
          <label class="search" hidden>${SEARCH}<input type="text" placeholder="搜索" aria-label="搜索选项"></label>
          <ul class="list" id="list-${id}" role="listbox"></ul>
          <div class="empty" hidden>没有匹配的选项</div>
        </div>
        <div class="footer">
          <div class="error" role="alert" hidden>${ALERT_ICON}<span></span></div>
          <div class="hint" hidden></div>
        </div>
      `;
      this.$ = (sel) => root.querySelector(sel);
      this.trigger = this.$('.trigger');
      this.menu = this.$('.menu');
      this.list = this.$('.list');
      this.searchInput = this.$('.search input');
      this.items = [];
      this.activeIndex = -1;

      this.trigger.addEventListener('click', () => (this.isOpen ? this.close() : this.open()));
      this.trigger.addEventListener('keydown', (event) => this.onTriggerKey(event));
      this.searchInput.addEventListener('input', () => this.filter());
      this.searchInput.addEventListener('keydown', (event) => this.onMenuKey(event));
      this.list.addEventListener('pointermove', (event) => {
        const el = event.target.closest('.option');
        if (el) this.setActive(this.visibleItems().indexOf(this.items.find((i) => i.el === el)), false);
      });
      this.list.addEventListener('click', (event) => {
        const el = event.target.closest('.option');
        const item = el && this.items.find((i) => i.el === el);
        if (item && !item.disabled) this.choose(item.value);
      });
      // 点菜单外面收起
      this.onOutside = (event) => {
        if (!event.composedPath().includes(this)) this.close();
      };
      // 页面滚动、窗口变大小时菜单跟着挪
      this.onReposition = () => this.position();
      this.childObserver = new MutationObserver(() => this.buildOptions());
    }

    connectedCallback() {
      this.buildOptions();
      this.render();
      this.childObserver.observe(this, { childList: true, subtree: true, attributes: true, characterData: true });
    }

    disconnectedCallback() {
      this.childObserver.disconnect();
      this.close();
    }

    attributeChangedCallback(name) {
      if (name === 'value' || name === 'multiple') this.syncSelected();
      if (name === 'multiple') this.list.setAttribute('aria-multiselectable', String(this.isMultiple));
      this.render();
    }

    get value() {
      return this.getAttribute('value') ?? '';
    }

    // multiple 时用得上：选中的值按选项顺序排好
    get values() {
      const chosen = new Set(this.value.split(',').filter(Boolean));
      return this.items.filter((item) => chosen.has(item.value)).map((item) => item.value);
    }

    set values(list) {
      this.value = (Array.isArray(list) ? list : []).filter(Boolean).join(',');
    }

    get isMultiple() {
      return this.hasAttribute('multiple');
    }

    set value(v) {
      this.setAttribute('value', v ?? '');
    }

    get isOpen() {
      return this.menu.classList.contains('is-open');
    }

    buildOptions() {
      const items = [];
      const nodes = [];
      const addOption = (option, groupDisabled) => {
        const li = document.createElement('li');
        li.className = 'option';
        li.setAttribute('role', 'option');
        li.id = `opt-${uid}-${items.length}`;
        li.innerHTML = `<span class="option-text"><span class="option-label"></span><span class="option-description"></span></span><span class="mark">${CHECK}</span>`;
        const label = option.textContent.trim();
        const icon = option.getAttribute('icon');
        if (icon) {
          const iconEl = document.createElement('yakit-icon');
          iconEl.setAttribute('src', new URL(icon, document.baseURI).href);
          iconEl.setAttribute('aria-hidden', 'true');
          li.prepend(iconEl);
        }
        const description = option.getAttribute('description') || '';
        li.querySelector('.option-label').textContent = label;
        li.querySelector('.option-description').textContent = description;
        if (!description) li.querySelector('.option-description').remove();
        const disabled = option.disabled || groupDisabled;
        if (disabled) li.setAttribute('aria-disabled', 'true');
        items.push({ value: option.value, label, description, disabled, icon, el: li });
        nodes.push(li);
      };
      [...this.children].forEach((child) => {
        if (child.tagName === 'OPTION') addOption(child, false);
        if (child.tagName === 'OPTGROUP') {
          const group = document.createElement('li');
          group.className = 'group';
          group.setAttribute('role', 'presentation');
          group.textContent = child.label;
          nodes.push(group);
          const start = items.length;
          [...child.querySelectorAll('option')].forEach((option) => addOption(option, child.disabled));
          group.dataset.start = start;
          group.dataset.end = items.length;
        }
      });
      this.list.replaceChildren(...nodes);
      this.items = items;
      this.syncSelected();
      this.render();
    }

    syncSelected() {
      const chosen = new Set(this.isMultiple ? this.values : [this.value]);
      this.items.forEach((item) => item.el.setAttribute('aria-selected', String(chosen.has(item.value))));
    }

    render() {
      const attr = (name) => this.getAttribute(name);
      const label = attr('label') || '';
      const labelEl = this.$('.label');
      labelEl.textContent = label;
      if (label && this.hasAttribute('required')) {
        labelEl.insertAdjacentHTML('beforeend', '<span class="required" aria-hidden="true">*</span>');
      }
      if (label) this.trigger.setAttribute('aria-labelledby', 'label');
      else {
        this.trigger.removeAttribute('aria-labelledby');
        const ariaLabel = attr('aria-label');
        if (ariaLabel) this.trigger.setAttribute('aria-label', ariaLabel);
      }

      const chosen = this.isMultiple ? this.values : [this.value].filter(Boolean);
      const selected = chosen.length === 1 ? this.items.find((item) => item.value === chosen[0]) : null;
      const valueEl = this.$('.value');
      // 多选选了两项以上时，按钮上写一共选了几项
      valueEl.textContent = chosen.length > 1
        ? (attr('multi-label') || '已选 {n} 项').replaceAll('{n}', String(chosen.length))
        : (selected ? selected.label : (attr('placeholder') || '请选择'));
      valueEl.classList.toggle('is-placeholder', !chosen.length);
      const valueIcon = this.$('.value-icon');
      valueIcon.hidden = !selected?.icon;
      if (selected?.icon) valueIcon.setAttribute('src', new URL(selected.icon, document.baseURI).href);

      this.trigger.disabled = this.hasAttribute('disabled');
      if (this.trigger.disabled) this.close();
      this.$('.search').hidden = !this.hasAttribute('searchable');

      const error = attr('error');
      const hint = attr('hint');
      this.$('.error').hidden = !error;
      this.$('.error span').textContent = error || '';
      this.$('.hint').hidden = Boolean(error) || !hint;
      this.$('.hint').textContent = hint || '';
      this.$('.footer').hidden = !error && !hint;
      this.trigger.setAttribute('aria-invalid', String(Boolean(error)));
    }

    /* ---------- 打开、关闭 ---------- */
    open() {
      if (this.isOpen || this.trigger.disabled || !this.items.length) return;
      this.searchInput.value = '';
      this.filter();
      this.menu.classList.add('is-open');
      this.trigger.setAttribute('aria-expanded', 'true');
      this.position();
      const visible = this.visibleItems();
      const current = visible.findIndex((item) => item.value === this.value);
      this.setActive(current >= 0 ? current : visible.findIndex((item) => !item.disabled));
      if (this.hasAttribute('searchable')) this.searchInput.focus();
      document.addEventListener('pointerdown', this.onOutside, true);
      window.addEventListener('scroll', this.onReposition, true);
      window.addEventListener('resize', this.onReposition);
    }

    close({ focus = false } = {}) {
      if (!this.isOpen) return;
      this.menu.classList.remove('is-open', 'is-up');
      this.trigger.setAttribute('aria-expanded', 'false');
      this.trigger.removeAttribute('aria-activedescendant');
      document.removeEventListener('pointerdown', this.onOutside, true);
      window.removeEventListener('scroll', this.onReposition, true);
      window.removeEventListener('resize', this.onReposition);
      if (focus) this.trigger.focus();
    }

    // 菜单贴着按钮出现；下面放不下就往上开
    position() {
      if (!this.isOpen) return;
      const rect = this.trigger.getBoundingClientRect();
      const gap = 6;
      const margin = 8;
      const below = window.innerHeight - rect.bottom - gap - margin;
      const above = rect.top - gap - margin;
      const natural = Math.min(this.list.scrollHeight + (this.hasAttribute('searchable') ? 42 : 0) + 10, 320);
      const up = below < Math.min(natural, 180) && above > below;
      const maxHeight = Math.max(120, Math.min(320, up ? above : below));

      this.menu.classList.toggle('is-up', up);
      this.menu.style.left = `${Math.max(margin, Math.min(rect.left, window.innerWidth - rect.width - margin))}px`;
      this.menu.style.width = `${rect.width}px`;
      this.menu.style.maxHeight = `${maxHeight}px`;
      this.menu.style.top = up ? 'auto' : `${rect.bottom + gap}px`;
      this.menu.style.bottom = up ? `${window.innerHeight - rect.top + gap}px` : 'auto';
    }

    /* ---------- 选择 ---------- */
    choose(value) {
      if (this.isMultiple) {
        // 点一下切换这一项，菜单留着继续选
        const chosen = new Set(this.values);
        if (chosen.has(value)) chosen.delete(value);
        else chosen.add(value);
        this.values = [...chosen];
        this.dispatchEvent(new CustomEvent('change', { detail: { value, values: this.values }, bubbles: true }));
        return;
      }
      const changed = value !== this.value;
      this.value = value;
      this.close({ focus: true });
      if (changed) this.dispatchEvent(new CustomEvent('change', { detail: { value }, bubbles: true }));
    }

    visibleItems() {
      return this.items.filter((item) => !item.el.hidden);
    }

    filter() {
      const keyword = this.searchInput.value.trim().toLowerCase();
      this.items.forEach((item) => {
        item.el.hidden = Boolean(keyword) && !`${item.label} ${item.description}`.toLowerCase().includes(keyword);
      });
      this.list.querySelectorAll('.group').forEach((group) => {
        const inGroup = this.items.slice(Number(group.dataset.start), Number(group.dataset.end));
        group.hidden = inGroup.every((item) => item.el.hidden);
      });
      const visible = this.visibleItems();
      this.$('.empty').hidden = visible.length > 0;
      this.setActive(visible.findIndex((item) => !item.disabled));
      this.position();
    }

    setActive(index, scroll = true) {
      const visible = this.visibleItems();
      this.items.forEach((item) => item.el.classList.remove('is-active'));
      this.activeIndex = index;
      const item = visible[index];
      if (!item) {
        this.trigger.removeAttribute('aria-activedescendant');
        return;
      }
      item.el.classList.add('is-active');
      this.trigger.setAttribute('aria-activedescendant', item.el.id);
      if (scroll) item.el.scrollIntoView({ block: 'nearest' });
    }

    moveActive(step) {
      const visible = this.visibleItems();
      if (!visible.length) return;
      let index = this.activeIndex;
      for (let i = 0; i < visible.length; i++) {
        index = (index + step + visible.length) % visible.length;
        if (!visible[index].disabled) break;
      }
      this.setActive(index);
    }

    /* ---------- 键盘 ---------- */
    onTriggerKey(event) {
      if (!this.isOpen) {
        if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
          event.preventDefault();
          this.open();
        }
        return;
      }
      this.onMenuKey(event);
    }

    onMenuKey(event) {
      const visible = this.visibleItems();
      switch (event.key) {
        case 'ArrowDown': event.preventDefault(); this.moveActive(1); break;
        case 'ArrowUp': event.preventDefault(); this.moveActive(-1); break;
        case 'Home': event.preventDefault(); this.activeIndex = -1; this.moveActive(1); break;
        case 'End': event.preventDefault(); this.activeIndex = visible.length; this.moveActive(-1); break;
        case 'Enter': {
          event.preventDefault();
          const item = visible[this.activeIndex];
          if (item && !item.disabled) this.choose(item.value);
          break;
        }
        case ' ':
          if (event.target === this.searchInput) break;
          event.preventDefault();
          if (visible[this.activeIndex] && !visible[this.activeIndex].disabled) this.choose(visible[this.activeIndex].value);
          break;
        case 'Escape':
          // 只收起菜单，不让外面的弹窗、抽屉跟着关
          event.preventDefault();
          event.stopPropagation();
          this.close({ focus: true });
          break;
        case 'Tab':
          this.close();
          break;
        default:
          // 没有搜索框时，按字母跳到对应选项
          if (event.target !== this.searchInput && event.key.length === 1) {
            const key = event.key.toLowerCase();
            const index = visible.findIndex((item, i) => i > this.activeIndex && !item.disabled && item.label.toLowerCase().startsWith(key));
            const wrap = visible.findIndex((item) => !item.disabled && item.label.toLowerCase().startsWith(key));
            if (index >= 0 || wrap >= 0) this.setActive(index >= 0 ? index : wrap);
          }
      }
    }
  }

  customElements.define('yakit-select', YaKitSelect);
})();
