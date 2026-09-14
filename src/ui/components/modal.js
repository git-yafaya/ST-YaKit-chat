/**
 * 确认框 / 输入框（屏幕中间弹出的小窗，后面变暗）
 *
 * 用法：
 *   const ok = await YaKitModal.confirm({
 *     title: '删除预设？',
 *     message: '删除后不能找回。',
 *     confirmText: '删除',              默认「确定」
 *     cancelText: '取消',               默认「取消」
 *   });                                 点确定返回 true，取消、点暗处、按 Esc 返回 false
 *
 *   const name = await YaKitModal.prompt({
 *     title: '存为新预设',
 *     label: '预设名字',
 *     value: '和泉纱雾',                 预先填好的内容，会全选方便直接改
 *     placeholder: '给预设起个名字',
 *     maxlength: 30,
 *     confirmText: '保存',
 *   });                                 返回去掉首尾空格的文字；取消返回 null；内容为空时确定按钮不能点
 *
 * 删除这类操作按规范先用 confirm 让用户确认（按钮没有红色危险样式）。
 * 需要先引入 components/button.js、components/input.js。
 */
(() => {
  if (globalThis.YaKitModal) return;

  const EASE = 'cubic-bezier(0.3, 0.7, 0.2, 1)';

  const styles = `
    dialog {
      box-sizing: border-box;
      width: min(360px, calc(100vw - 32px));
      margin: auto;
      padding: 20px;
      border: var(--card-border, 1px solid #DFE2E5);
      border-radius: 12px;
      background: var(--card-bg, #FFFFFF);
      color: var(--text-body, #24262A);
      box-shadow: 0 24px 64px -12px rgba(0, 0, 0, 0.35);
      font: inherit;
      font-size: 14px;
      line-height: 1.6;
    }
    dialog::backdrop { background: rgba(0, 0, 0, 0.4); }
    dialog[open] { animation: modal-in 0.18s ${EASE}; }
    dialog[open]::backdrop { animation: fade-in 0.18s ease; }
    dialog.closing { animation: modal-out 0.12s ease-in forwards; }
    dialog.closing::backdrop { animation: fade-out 0.12s ease-in forwards; }
    @keyframes modal-in { from { opacity: 0; transform: translateY(8px); } }
    @keyframes modal-out { to { opacity: 0; transform: translateY(6px); } }
    @keyframes fade-in { from { opacity: 0; } }
    @keyframes fade-out { to { opacity: 0; } }
    @media (prefers-reduced-motion: reduce) {
      dialog[open], dialog.closing, dialog[open]::backdrop, dialog.closing::backdrop { animation-duration: 1ms; }
    }

    .title {
      margin: 0 0 6px;
      font-size: 16px;
      font-weight: 600;
      color: var(--text-title, #14171A);
      outline: none;
    }
    .message { margin: 0; color: var(--text-body, #24262A); overflow-wrap: anywhere; }
    .message:empty { display: none; }
    yakit-input { margin-top: 12px; }
    yakit-input[hidden] { display: none; }
    .footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }
  `;

  function open({ title = '', message = '', confirmText = '确定', cancelText = '取消', input = null }) {
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>${styles}</style>
      <dialog aria-labelledby="title">
        <h2 class="title" id="title" tabindex="-1"></h2>
        <p class="message"></p>
        <yakit-input hidden></yakit-input>
        <div class="footer">
          <yakit-button class="cancel"></yakit-button>
          <yakit-button class="confirm" variant="primary"></yakit-button>
        </div>
      </dialog>
    `;
    const $ = (sel) => root.querySelector(sel);
    const dialog = $('dialog');
    const field = $('yakit-input');
    const confirmButton = $('.confirm');
    $('.title').textContent = title;
    $('.message').textContent = message;
    $('.cancel').textContent = cancelText;
    confirmButton.textContent = confirmText;

    if (input) {
      field.hidden = false;
      if (input.label) field.setAttribute('label', input.label);
      if (input.placeholder) field.setAttribute('placeholder', input.placeholder);
      if (input.maxlength) field.setAttribute('maxlength', String(input.maxlength));
      field.value = input.value || '';
      const sync = () => confirmButton.toggleAttribute('disabled', !field.value.trim());
      sync();
      field.addEventListener('input', sync);
    }

    document.body.append(host);
    dialog.showModal();
    if (input) {
      requestAnimationFrame(() => {
        field.focus();
        field.shadowRoot?.querySelector('input')?.select();
      });
    } else {
      $('.title').focus();
    }

    // 最后一次操作是不是键盘：鼠标或手指关掉时，焦点回到原按钮但不显示焦点框
    let byKeyboard = false;
    dialog.addEventListener('keydown', () => { byKeyboard = true; }, true);
    dialog.addEventListener('pointerdown', () => { byKeyboard = false; }, true);

    return new Promise((resolve) => {
      let done = false;
      const finish = (result) => {
        if (done) return;
        done = true;
        dialog.classList.add('closing');
        const remove = () => {
          clearTimeout(fallback);
          dialog.close();
          host.remove();
          if (!byKeyboard) document.activeElement?.blur();
        };
        // 动画结束再移除；万一动画没触发，200ms 后也会移除
        const fallback = setTimeout(remove, 200);
        dialog.addEventListener('animationend', remove, { once: true });
        resolve(result);
      };
      const submit = () => {
        if (!input) return finish(true);
        const value = field.value.trim();
        if (value) finish(value);
      };
      const cancel = () => finish(input ? null : false);

      confirmButton.addEventListener('click', submit);
      $('.cancel').addEventListener('click', cancel);
      dialog.addEventListener('click', (event) => {
        if (event.target === dialog) cancel();
      });
      dialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        cancel();
      });
      if (input) {
        field.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' && !event.isComposing) {
            event.preventDefault();
            submit();
          }
        });
      }
    });
  }

  globalThis.YaKitModal = {
    confirm: (options = {}) => open(options),
    prompt: ({ label, value, placeholder, maxlength, ...options } = {}) =>
      open({ ...options, input: { label, value, placeholder, maxlength } }),
  };
})();
