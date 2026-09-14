/**
 * 「组件示例」抽屉里的交互演示
 */
(() => {
  const $ = (id) => document.getElementById(id);

  // 分段选择器：切换时更新下面的提示文字
  const format = $('format');
  format.addEventListener('change', (event) => {
    const label = format.querySelector(`option[value="${event.detail.value}"]`).textContent;
    $('format-note').textContent = `当前选择：${label}`;
  });

  // 按钮：点保存后显示 1.5 秒加载中
  const saveDemo = $('save-demo');
  saveDemo.addEventListener('click', () => {
    saveDemo.setAttribute('loading', '');
    setTimeout(() => saveDemo.removeAttribute('loading'), 1500);
  });

  // 输入框：接口地址不是 https:// 开头时显示出错提示
  const urlDemo = $('url-demo');
  const checkUrl = () => {
    const ok = !urlDemo.value || urlDemo.value.startsWith('https://');
    if (ok) urlDemo.removeAttribute('error');
    else urlDemo.setAttribute('error', '地址要以 https:// 开头');
  };
  urlDemo.addEventListener('input', checkUrl);
  checkUrl();

  // 开关
  $('switch-right').addEventListener('change', (event) => {
    $('switch-note').textContent = `设置列表常用这种排法，当前：${event.detail.checked ? '开' : '关'}`;
  });

  // 下拉选择：选完更新说明；必选项选了之后出错提示消失
  const selectDemo = $('select-demo');
  selectDemo.addEventListener('change', (event) => {
    const label = selectDemo.querySelector(`option[value="${event.detail.value}"]`).textContent;
    selectDemo.setAttribute('hint', `当前选择：${label}`);
  });
  $('select-required').addEventListener('change', (event) => {
    event.currentTarget.removeAttribute('error');
  });

  // 抽屉示例：打开 / 关闭
  document.querySelectorAll('[data-open]').forEach((button) => {
    button.addEventListener('click', () => $(button.dataset.open).show());
  });
  $('rules-card').addEventListener('click', () => $('drawer-right').show());
  document.querySelectorAll('[data-close]').forEach((button) => {
    button.addEventListener('click', () => button.closest('yakit-drawer').close());
  });
})();
