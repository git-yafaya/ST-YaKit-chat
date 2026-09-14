/**
 * 「设置」页：主题（切换方式 + 主题选择）、导航栏位置、组件示例入口
 */
(() => {
  const $ = (id) => document.getElementById(id);

  /* ---------- 二级设置项：同一时间只展开一项 ---------- */
  const settingItems = [...document.querySelectorAll('.settings-list dsh-collapse:not([link])')];
  settingItems.forEach((item) => item.addEventListener('toggle', (event) => {
    if (event.detail.open) settingItems.forEach((other) => { if (other !== item) other.open = false; });
  }));
  $('set-demo').addEventListener('activate', () => $('demo-drawer').show());

  /* ---------- 主题：插画格子 / 下拉框，点选后通知弹窗换主题 ---------- */
  const themeList = $('themes');
  const themeSelect = $('theme-select');
  const setTheme = (theme) => parent.postMessage({ type: 'dsh:set-theme', theme }, '*');

  themeList.innerHTML = DSH_THEMES.map((theme) => `
    <button type="button" class="theme-option" role="radio" aria-checked="false" data-theme-id="${theme.id}">
      <dsh-icon src="../icons/theme/${theme.icon}.svg" size="72" line="1.6"></dsh-icon>
      <span>${theme.label}</span>
    </button>
  `).join('');
  themeList.addEventListener('click', (event) => {
    const option = event.target.closest('.theme-option');
    if (option) setTheme(option.dataset.themeId);
  });

  themeSelect.innerHTML = DSH_THEMES.map((theme) =>
    `<option value="${theme.id}" icon="../icons/theme/${theme.icon}.svg">${theme.label}</option>`).join('');
  themeSelect.addEventListener('change', (event) => setTheme(event.detail.value));

  window.addEventListener('dsh-theme', (event) => {
    const { selected } = event.detail;
    themeList.querySelectorAll('.theme-option').forEach((option) => {
      option.setAttribute('aria-checked', String(option.dataset.themeId === selected));
    });
    themeSelect.value = selected;
    const info = DSH_THEMES.find((theme) => theme.id === selected);
    $('set-theme').setAttribute('summary', info ? info.label : '');
    if (info) $('set-theme').setAttribute('icon', `../icons/theme/${info.icon}.svg`);
  });

  /* ---------- 主题切换方式：自动 / 图标 / 下拉框；自动时电脑用图标，其他设备用下拉框 ---------- */
  const SWITCH_KEY = 'dsh-theme-switch';
  const switchMode = $('theme-switch-mode');
  const pcQuery = parent.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 768px)');

  function applySwitchMode() {
    let mode = 'auto';
    try { mode = localStorage.getItem(SWITCH_KEY) || 'auto'; } catch {}
    if (!['auto', 'icon', 'select'].includes(mode)) mode = 'auto';
    const resolved = mode === 'auto' ? (pcQuery.matches ? 'icon' : 'select') : mode;
    switchMode.value = mode;
    themeList.hidden = resolved !== 'icon';
    themeSelect.hidden = resolved !== 'select';
  }
  switchMode.addEventListener('change', (event) => {
    try { localStorage.setItem(SWITCH_KEY, event.detail.value); } catch {}
    applySwitchMode();
  });
  pcQuery.addEventListener('change', applySwitchMode);
  window.addEventListener('pagehide', () => pcQuery.removeEventListener('change', applySwitchMode));
  applySwitchMode();

  /* ---------- 导航栏位置 ---------- */
  const NAV_LABELS = { auto: '自动', top: '上方', bottom: '下方' };
  const navMode = $('nav-mode');
  navMode.addEventListener('change', (event) => {
    parent.postMessage({ type: 'dsh:set-nav', mode: event.detail.value }, '*');
  });
  window.addEventListener('dsh-nav', (event) => {
    const { mode, resolved } = event.detail;
    navMode.value = mode;
    $('set-nav').setAttribute('summary', mode === 'auto' ? `自动 · 当前${NAV_LABELS[resolved]}` : NAV_LABELS[mode]);
  });
})();
