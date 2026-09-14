/**
 * 选择列表的一行（预设页、API 管理页共用）
 *
 * 用法：
 *   const row = YaKitChoice.row({
 *     name: '和泉纱雾',
 *     summary: '1 条规则 · TXT 带标注',     名字下面的小字，可省略
 *     active: true,                         正在使用：点睛色小圆点、浅底、名字加粗
 *     onPick: () => {},                     点这一行（正在使用的行点了不触发）
 *     actions: [                            行尾只有图标的按钮，可省略
 *       { action: 'edit', icon: '../icons/edit.svg', label: '编辑' },
 *     ],
 *     onAction: (action) => {},
 *   });
 *   row.tools   行尾文字按钮区（在图标按钮左边），页面自己往里放「使用中」「保存」这类内容
 *
 * 样式在 page/style.css 的「选择列表」一节；外层容器加 class="choice-list" role="list"。
 */
(() => {
  if (globalThis.YaKitChoice) return;

  function row({ name, summary = '', active = false, onPick, actions = [], onAction }) {
    const item = document.createElement('div');
    item.className = 'choice-item';
    item.setAttribute('role', 'listitem');
    item.classList.toggle('is-active', active);
    item.innerHTML = `
      <button type="button" class="choice-main">
        <span class="choice-dot" aria-hidden="true"></span>
        <span class="choice-text">
          <span class="choice-name"></span>
          <span class="choice-summary"></span>
        </span>
      </button>
      <div class="choice-tools"></div>
      <div class="choice-ops"></div>
    `;
    const main = item.querySelector('.choice-main');
    item.querySelector('.choice-name').textContent = name;
    const summaryEl = item.querySelector('.choice-summary');
    summaryEl.textContent = summary;
    summaryEl.hidden = !summary;
    main.setAttribute('aria-current', String(active));
    main.setAttribute('aria-label', `${name}${active ? '，正在使用' : '，点击切换'}`);
    main.addEventListener('click', () => {
      if (!active) onPick?.();
    });

    const ops = item.querySelector('.choice-ops');
    actions.forEach(({ action, icon, label }) => {
      const button = document.createElement('yakit-button');
      button.setAttribute('size', 'sm');
      button.setAttribute('variant', 'ghost');
      button.setAttribute('icon', icon);
      button.setAttribute('aria-label', `${label}「${name}」`);
      // 鼠标或手指点击时不抢焦点，避免出现焦点框；键盘操作不受影响
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', () => onAction?.(action));
      ops.append(button);
    });
    ops.hidden = actions.length === 0;

    item.tools = item.querySelector('.choice-tools');
    return item;
  }

  globalThis.YaKitChoice = { row };
})();
