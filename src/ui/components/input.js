/**
 * <yakit-input> 输入框
 *
 * 用法：
 *   <yakit-input label="文件名" placeholder="不填就用角色名加日期" hint="说明小字"></yakit-input>
 *   <yakit-input label="搜索" icon="../icons/search.svg" clearable></yakit-input>
 *   <yakit-input label="备注" multiline rows="3" maxlength="200"></yakit-input>
 *
 * 可用属性：
 *   label        上方的名字
 *   placeholder  没填时显示的灰字
 *   value        内容
 *   type         text（默认）/ password / number / search / url / email
 *   hint         下方的说明小字
 *   error        出错时的提示文字（带图标，写上就显示，删掉就消失）
 *   warning      提醒文字（提醒色 + 图标，不算出错；有 error 时只显示 error）
 *   revealable   type="password" 时右边出现眼睛按钮，点一下显示或隐藏内容
 *   icon         左边的图标地址
 *   clearable    有内容时右边出现 × ，点一下清空
 *   maxlength    最多几个字，同时在右下角显示 “已输入/上限”
 *   multiline    多行输入，rows 设置默认行数（默认 3），内容多了会自动变高
 *   size         sm（28px）/ md（36px，默认）
 *   required     必填，名字后面加一个 *
 *   disabled / readonly
 *
 * 事件：
 *   input   每输入一个字触发
 *   change  输完离开输入框时触发
 *
 * 需要先引入 components/icon.js（用了图标时）。
 */
(() => {
  if (customElements.get('yakit-input')) return;

  // 和 icons/close.svg 同一个图形
  const CLEAR_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  const WARNING_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4 2.8 19.5h18.4Z"/><path d="M12 10v4M12 17h.01"/></svg>';
  const EYE_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_OFF_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.6A9.7 9.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-3 3.8M6.2 6.9C3.9 8.5 2.5 12 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.3-1.1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
  const ALERT_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/></svg>';

  const styles = `
    :host {
      display: block;
      --input-height: 36px;
      --input-font: 14px;
      color: var(--text-body, #24262A);
    }
    :host([size="sm"]) { --input-height: 28px; --input-font: 13px; }
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

    .box {
      position: relative;
      display: flex;
      align-items: center;
      gap: 8px;
      box-sizing: border-box;
      min-height: var(--input-height);
      padding: 0 10px;
      border: 1px solid var(--divider, #DFE2E5);
      border-radius: 8px;
      background: var(--card-bg, #FFFFFF);
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .box:hover { border-color: color-mix(in srgb, var(--text-title, #14171A) 28%, var(--divider, #DFE2E5)); }
    /* 正在输入：主色边框 + 一圈淡淡的主色光晕 */
    .box:focus-within {
      border-color: var(--primary, #46618A);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary, #46618A) 18%, transparent);
    }
    :host([multiline]) .box { align-items: flex-start; padding: 8px 10px; }

    input, textarea {
      flex: 1;
      min-width: 0;
      margin: 0;
      padding: 0;
      border: 0;
      outline: none;
      background: transparent;
      color: var(--text-title, #14171A);
      font: inherit;
      font-size: var(--input-font);
      line-height: 1.5;
    }
    input { height: calc(var(--input-height) - 2px); }
    textarea { resize: none; overflow: hidden; }
    input::placeholder, textarea::placeholder { color: var(--text-muted, #6E737A); opacity: 1; }
    /* 数字输入框去掉右边的上下小箭头 */
    input[type="number"]::-webkit-inner-spin-button,
    input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
    input[type="number"] { -moz-appearance: textfield; }
    input[type="search"]::-webkit-search-cancel-button { -webkit-appearance: none; }

    yakit-icon { color: var(--text-muted, #6E737A); --icon-size: 16px; }
    :host([multiline]) yakit-icon { margin-top: 3px; }
    yakit-icon[hidden] { display: none; }

    .clear {
      display: grid;
      place-items: center;
      flex: none;
      width: 20px;
      height: 20px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: color-mix(in srgb, var(--text-title, #14171A) 8%, transparent);
      color: var(--text-muted, #6E737A);
      cursor: pointer;
    }
    .clear:hover { color: var(--text-title, #14171A); background: color-mix(in srgb, var(--text-title, #14171A) 14%, transparent); }
    .clear:focus { outline: none; }
    .clear:focus-visible { outline: 2px solid var(--primary, #46618A); outline-offset: 1px; }
    .clear[hidden] { display: none; }

    /* 显示 / 隐藏密码 */
    .reveal {
      display: grid;
      place-items: center;
      flex: none;
      width: 26px;
      height: 26px;
      margin-right: -4px;
      padding: 0;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: var(--text-muted, #6E737A);
      cursor: pointer;
    }
    .reveal:hover { color: var(--text-title, #14171A); background: color-mix(in srgb, var(--text-title, #14171A) 8%, transparent); }
    .reveal:focus { outline: none; }
    .reveal:focus-visible { outline: 2px solid var(--primary, #46618A); outline-offset: 1px; }
    .reveal[hidden] { display: none; }

    /* 禁用、只读 */
    :host([disabled]) .box { opacity: 0.5; cursor: not-allowed; }
    :host([disabled]) input, :host([disabled]) textarea { cursor: not-allowed; }
    :host([readonly]) .box {
      background: color-mix(in srgb, var(--text-title, #14171A) 3%, var(--card-bg, #FFFFFF));
    }

    .footer {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-top: 6px;
      font-size: 12px;
      line-height: 1.5;
    }
    .footer[hidden] { display: none; }
    .hint { flex: 1; color: var(--text-muted, #6E737A); }
    .count { margin-left: auto; color: var(--text-muted, #6E737A); font-variant-numeric: tabular-nums; }
    .count[hidden] { display: none; }

    /* 出错提示：危险色 + 图标 + 文字 */
    .error {
      flex: 1;
      display: flex;
      align-items: flex-start;
      gap: 4px;
      color: var(--danger, #B5433A);
      font-weight: 500;
    }
    .error svg { flex: none; margin-top: 2px; }
    /* 提醒：提醒色 + 图标 + 文字，不算出错 */
    .warning {
      flex: 1;
      display: flex;
      align-items: flex-start;
      gap: 4px;
      color: var(--warning, #A8731A);
      font-weight: 500;
    }
    .warning svg { flex: none; margin-top: 2px; }
    .error[hidden], .warning[hidden], .hint[hidden] { display: none; }

    @media (prefers-reduced-motion: reduce) {
      .box { transition: none; }
    }
  `;

  class YaKitInput extends HTMLElement {
    static observedAttributes = [
      'label', 'placeholder', 'value', 'type', 'hint', 'error', 'warning', 'icon', 'clearable', 'revealable',
      'maxlength', 'multiline', 'rows', 'required', 'disabled', 'readonly', 'name', 'autocomplete',
    ];

    constructor() {
      super();
      this.root = this.attachShadow({ mode: 'open', delegatesFocus: true });
      this.root.innerHTML = `<style>${styles}</style>`;
      this.built = null;
    }

    connectedCallback() {
      this.render();
    }

    attributeChangedCallback(name, oldValue, newValue) {
      if (!this.field) return;
      // value 属性只在一开始或外部改动时同步，避免打字时光标乱跳
      if (name === 'value') {
        if (this.field.value !== (newValue ?? '')) this.field.value = newValue ?? '';
        this.update();
        return;
      }
      this.render();
    }

    get value() {
      return this.field ? this.field.value : (this.getAttribute('value') ?? '');
    }

    set value(v) {
      if (this.field) this.field.value = v ?? '';
      else this.setAttribute('value', v ?? '');
      this.update();
    }

    focus() {
      this.field?.focus();
    }

    // 结构只在“单行 / 多行”切换时重建，其他属性变化只更新内容
    build(multiline) {
      const keep = this.field?.value ?? this.getAttribute('value') ?? '';
      const tag = multiline ? 'textarea' : 'input';
      const wrap = document.createElement('div');
      wrap.className = 'wrap';
      wrap.innerHTML = `
        <label class="label" for="field"></label>
        <div class="box" part="box">
          <yakit-icon hidden aria-hidden="true"></yakit-icon>
          <${tag} id="field" part="field"></${tag}>
          <button class="clear" type="button" aria-label="清空" hidden>${CLEAR_ICON}</button>
          <button class="reveal" type="button" aria-label="显示内容" aria-pressed="false" hidden>${EYE_ICON}</button>
        </div>
        <div class="footer">
          <div class="error" id="error" role="alert" hidden>${ALERT_ICON}<span></span></div>
          <div class="warning" id="warning" hidden>${WARNING_ICON}<span></span></div>
          <div class="hint" id="hint" hidden></div>
          <div class="count" aria-live="polite" hidden></div>
        </div>
      `;
      this.root.querySelector('.wrap')?.remove();
      this.root.append(wrap);
      this.built = multiline;

      this.$ = (sel) => wrap.querySelector(sel);
      this.field = this.$('#field');
      this.field.value = keep;

      this.field.addEventListener('input', () => this.update());
      // change 事件不会自己穿出组件，这里转发一次
      this.field.addEventListener('change', () => this.dispatchEvent(new Event('change', { bubbles: true })));
      this.$('.clear').addEventListener('click', () => {
        this.field.value = '';
        this.update();
        this.field.focus();
        this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        this.dispatchEvent(new Event('change', { bubbles: true }));
      });
      this.revealed = false;
      this.$('.reveal').addEventListener('mousedown', (event) => event.preventDefault());
      this.$('.reveal').addEventListener('click', () => {
        this.revealed = !this.revealed;
        this.render();
      });
    }

    render() {
      const multiline = this.hasAttribute('multiline');
      if (this.built !== multiline) this.build(multiline);

      const attr = (name) => this.getAttribute(name);
      const label = attr('label') || '';
      const labelEl = this.$('.label');
      labelEl.textContent = label;
      if (label && this.hasAttribute('required')) {
        labelEl.insertAdjacentHTML('beforeend', '<span class="required" aria-hidden="true">*</span>');
      }

      const field = this.field;
      const type = attr('type') || 'text';
      const canReveal = !multiline && type === 'password' && this.hasAttribute('revealable');
      if (!multiline) field.type = canReveal && this.revealed ? 'text' : type;
      const reveal = this.$('.reveal');
      reveal.hidden = !canReveal;
      reveal.innerHTML = this.revealed ? EYE_OFF_ICON : EYE_ICON;
      reveal.setAttribute('aria-label', this.revealed ? '隐藏内容' : '显示内容');
      reveal.setAttribute('aria-pressed', String(Boolean(this.revealed)));
      if (multiline) field.rows = Number(attr('rows')) || 3;
      field.placeholder = attr('placeholder') || '';
      field.disabled = this.hasAttribute('disabled');
      field.readOnly = this.hasAttribute('readonly');
      field.required = this.hasAttribute('required');
      if (!label) field.setAttribute('aria-label', attr('aria-label') || attr('placeholder') || '');
      else field.removeAttribute('aria-label');
      ['name', 'autocomplete', 'maxlength'].forEach((name) => {
        if (this.hasAttribute(name)) field.setAttribute(name, attr(name));
        else field.removeAttribute(name);
      });

      const icon = attr('icon');
      const iconEl = this.$('yakit-icon');
      iconEl.hidden = !icon;
      if (icon) iconEl.setAttribute('src', new URL(icon, document.baseURI).href);

      const error = attr('error');
      const warning = error ? '' : attr('warning');
      const hint = attr('hint');
      this.$('.error').hidden = !error;
      this.$('.error span').textContent = error || '';
      this.$('.warning').hidden = !warning;
      this.$('.warning span').textContent = warning || '';
      this.$('.hint').hidden = Boolean(error || warning) || !hint;
      this.$('.hint').textContent = hint || '';
      field.setAttribute('aria-invalid', String(Boolean(error)));
      const describedBy = error ? 'error' : (warning ? 'warning' : (hint ? 'hint' : ''));
      if (describedBy) field.setAttribute('aria-describedby', describedBy);
      else field.removeAttribute('aria-describedby');

      this.update();
    }

    // 内容变化时：清空按钮、字数、多行自动变高
    update() {
      if (!this.field) return;
      const field = this.field;
      const length = field.value.length;
      const editable = !this.hasAttribute('disabled') && !this.hasAttribute('readonly');
      this.$('.clear').hidden = !(this.hasAttribute('clearable') && length > 0 && editable);

      const max = Number(this.getAttribute('maxlength'));
      const count = this.$('.count');
      count.hidden = !max;
      if (max) count.textContent = `${length}/${max}`;

      const footer = this.$('.footer');
      footer.hidden = this.$('.error').hidden && this.$('.warning').hidden && this.$('.hint').hidden && count.hidden;

      if (this.hasAttribute('multiline')) {
        field.style.height = 'auto';
        field.style.height = `${field.scrollHeight}px`;
      }
    }
  }

  customElements.define('yakit-input', YaKitInput);
})();
