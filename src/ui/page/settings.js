/**
 * 「设置」页：主题（切换方式 + 主题选择）、导航栏位置、组件示例入口
 */
(() => {
  const $ = (id) => document.getElementById(id);

  /* ---------- 设置页签上的提醒小圆点：展开哪一行就算看过哪一项 ---------- */
  const ERROR_SEEN_KEY = 'yakit-error-seen';
  const UPDATE_SEEN_KEY = 'yakit-update-seen';
  const tellAlerts = (extra = {}) => parent.postMessage({ type: 'yakit:alerts', ...extra }, '*');

  function markSeen(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      // 存不了就这次不记，下次还会提醒
    }
    tellAlerts();
  }

  /* ---------- 二级设置项：同一时间只展开一项 ---------- */
  const settingItems = [...document.querySelectorAll('.settings-list yakit-collapse:not([link])')];
  settingItems.forEach((item) => item.addEventListener('toggle', (event) => {
    if (event.detail.open) settingItems.forEach((other) => { if (other !== item) other.open = false; });
  }));
  $('set-errors').addEventListener('toggle', (event) => {
    if (event.detail.open) markSeen(ERROR_SEEN_KEY, YaKitErrorLog.list()[0]?.time ?? 0);
  });
  $('set-update').addEventListener('toggle', (event) => {
    if (event.detail.open) markSeen(UPDATE_SEEN_KEY, parent.YaKitChat?.version ?? '');
  });
  $('set-demo').addEventListener('activate', () => $('demo-drawer').show());
  // 组件示例平时隐藏，开发时在控制台运行 localStorage.setItem('yakit-demo', 'on') 后刷新即可看到
  try { $('set-demo').hidden = localStorage.getItem('yakit-demo') !== 'on'; } catch {}

  /* ---------- 插件更新：打开设置页时检查，有新版本时可点更新，更新完自动刷新网页 ----------
   * 需要业务层在 YaKitChat 上提供 updater（由 Codex 实现）：
   *   updater.checkUpdate() → Promise<{ isUpToDate: boolean, canUpdate: boolean }>
   *     isUpToDate：本插件是否已是仓库最新；canUpdate：能否在线更新（如不是 git 安装则为 false）
   *     检查失败时 reject，message 为给用户看的中文原因
   *   updater.update() → Promise<{ updated: boolean }>
   *     只更新本插件；updated=false 表示本来就是最新；失败时 reject，message 为中文原因
   * 没有 updater 时不显示这一行。
   */
  const updater = () => parent.YaKitChat?.updater;
  const updateRow = $('set-update');
  const updateButton = $('update-go');
  const version = parent.YaKitChat?.version ? `v${parent.YaKitChat.version}` : '';
  const CHECK_INTERVAL = 60 * 1000;
  let lastCheck = 0;
  let checking = false;
  let updating = false;
  // 按钮当前的作用：check = 重新检查，update = 执行更新
  let buttonAction = 'check';

  // 检查或更新失败时，在按钮下方的提示框里显示业务给出的中文原因；传空则隐藏
  function showUpdateError(message = '') {
    const box = $('update-error');
    box.hidden = !message;
    box.querySelector('span').textContent = message;
  }

  // action：check = 按钮显示「检查更新」，update = 显示「更新」
  function setUpdateState(text, { canClick = false, primary = false, action = 'update' } = {}) {
    updateRow.setAttribute('summary', [version, text].filter(Boolean).join(' · '));
    buttonAction = action;
    updateButton.textContent = action === 'check' ? '检查更新' : '更新';
    updateButton.toggleAttribute('disabled', !canClick);
    if (primary) updateButton.setAttribute('variant', 'primary');
    else updateButton.removeAttribute('variant');
  }

  async function checkUpdate({ force = false, manual = false } = {}) {
    const service = updater();
    updateRow.hidden = !service;
    if (!service || checking || updating) return;
    if (!force && Date.now() - lastCheck < CHECK_INTERVAL) return;
    checking = true;
    lastCheck = Date.now();
    setUpdateState('检查中…', { action: 'check' });
    showUpdateError();
    updateButton.setAttribute('loading', '');
    try {
      const { isUpToDate, canUpdate } = await service.checkUpdate();
      tellAlerts({ updateAvailable: Boolean(canUpdate) && !isUpToDate });
      if (!canUpdate) setUpdateState('无法在线更新');
      else if (isUpToDate) {
        setUpdateState('已是最新', { canClick: true, action: 'check' });
        if (manual) YaKitToast.show('已经是最新版本', 'success');
      }
      else setUpdateState('有新版本', { canClick: true, primary: true });
    } catch (error) {
      YaKitErrorLog.warn('检查更新失败', error);
      setUpdateState('检查失败', { canClick: true, action: 'check' });
      showUpdateError(error?.message || '检查更新失败');
      lastCheck = 0;
    } finally {
      checking = false;
      updateButton.removeAttribute('loading');
    }
  }

  updateButton.addEventListener('click', async () => {
    const service = updater();
    if (!service || updating || checking) return;
    if (buttonAction === 'check') {
      checkUpdate({ force: true, manual: true });
      return;
    }
    updating = true;
    updateButton.setAttribute('loading', '');
    setUpdateState('更新中…');
    showUpdateError();
    try {
      const { updated } = await service.update();
      if (updated) {
        setUpdateState('已更新，正在刷新');
        YaKitToast.show('纪实已更新，正在刷新网页', 'success');
        setTimeout(() => parent.location.reload(), 1200);
        return;
      }
      setUpdateState('已是最新', { canClick: true, action: 'check' });
      YaKitToast.show('已经是最新版本', 'success');
    } catch (error) {
      setUpdateState('更新失败', { canClick: true });
      showUpdateError(error?.message || '更新失败');
      YaKitToast.show(error?.message || '更新失败', 'danger');
    } finally {
      updating = false;
      updateButton.removeAttribute('loading');
    }
  });

  // 切到设置页时检查（一分钟内不重复检查）
  window.addEventListener('yakit-tab', (event) => {
    if (event.detail.tab === 'settings') checkUpdate();
  });
  updateRow.hidden = !updater();
  if (updater()) setUpdateState('', { canClick: true, action: 'check' });

  /* ---------- 主题：插画格子 / 下拉框，点选后通知弹窗换主题 ---------- */
  const themeList = $('themes');
  const themeSelect = $('theme-select');
  const setTheme = (theme) => parent.postMessage({ type: 'yakit:set-theme', theme }, '*');

  themeList.innerHTML = YAKIT_THEMES.map((theme) => `
    <button type="button" class="theme-option" role="radio" aria-checked="false" data-theme-id="${theme.id}">
      <yakit-icon src="../icons/theme/${theme.icon}.svg" size="72" line="1.6"></yakit-icon>
      <span>${theme.label}</span>
    </button>
  `).join('');
  themeList.addEventListener('click', (event) => {
    const option = event.target.closest('.theme-option');
    if (option) setTheme(option.dataset.themeId);
  });

  themeSelect.innerHTML = YAKIT_THEMES.map((theme) =>
    `<option value="${theme.id}" icon="../icons/theme/${theme.icon}.svg">${theme.label}</option>`).join('');
  themeSelect.addEventListener('change', (event) => setTheme(event.detail.value));

  window.addEventListener('yakit-theme', (event) => {
    const { selected } = event.detail;
    themeList.querySelectorAll('.theme-option').forEach((option) => {
      option.setAttribute('aria-checked', String(option.dataset.themeId === selected));
    });
    themeSelect.value = selected;
    const info = YAKIT_THEMES.find((theme) => theme.id === selected);
    $('set-theme').setAttribute('summary', info ? info.label : '');
    if (info) $('set-theme').setAttribute('icon', `../icons/theme/${info.icon}.svg`);
  });

  /* ---------- 主题切换方式：自动 / 图标 / 下拉框；自动时电脑用图标，其他设备用下拉框 ---------- */
  const SWITCH_KEY = 'yakit-theme-switch';
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
  // 从备份恢复了主题切换方式（preset.js 触发）
  window.addEventListener('yakit-theme-switch-change', applySwitchMode);
  window.addEventListener('pagehide', () => pcQuery.removeEventListener('change', applySwitchMode));
  applySwitchMode();

  /* ---------- 报错记录：最新的在前，可复制全部、清空 ---------- */
  function renderErrorLog() {
    const list = YaKitErrorLog.list();
    $('set-errors').setAttribute('summary', list.length ? `最近 ${list.length} 条` : '没有报错');
    $('error-log-empty').hidden = list.length > 0;
    $('error-log-actions').hidden = list.length === 0;
    $('error-log').replaceChildren(...list.map((item) => {
      const row = document.createElement('div');
      row.className = 'error-item';
      row.innerHTML = '<div class="error-meta"></div><div class="error-message"></div><pre class="error-detail"></pre>';
      row.querySelector('.error-meta').textContent = `${YaKitErrorLog.formatTime(item.time)} · ${item.source}${item.count > 1 ? ` · ${item.count} 次` : ''}`;
      row.querySelector('.error-message').textContent = item.message;
      const detail = row.querySelector('.error-detail');
      detail.textContent = item.detail || '';
      detail.hidden = !item.detail;
      return row;
    }));
  }

  // 复制：用酒馆页面的剪贴板接口（面板 iframe 自己没有写剪贴板的权限），不行或 1 秒没反应时退回旧的复制方式
  async function copyText(text) {
    try {
      await Promise.race([
        (parent.navigator.clipboard || navigator.clipboard).writeText(text),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1000)),
      ]);
      return true;
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.append(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    }
  }

  $('error-log-copy').addEventListener('click', async () => {
    const ok = await copyText(YaKitErrorLog.format());
    if (ok) YaKitToast.show('已复制报错记录', 'success');
    else YaKitToast.show('复制没成功，请长按记录手动复制', 'warning');
  });
  $('error-log-clear').addEventListener('click', async () => {
    const ok = await YaKitModal.confirm({ title: '清空报错记录？', message: '清空后不能找回。', confirmText: '清空' });
    if (ok) YaKitErrorLog.clear();
  });
  window.addEventListener('yakit-error-log-change', renderErrorLog);
  window.addEventListener('storage', (event) => {
    if (event.key === 'yakit-error-log') renderErrorLog();
  });
  renderErrorLog();

  /* ---------- 导航栏位置 ---------- */
  const NAV_LABELS = { auto: '自动', top: '上方', bottom: '下方' };
  const navMode = $('nav-mode');
  navMode.addEventListener('change', (event) => {
    parent.postMessage({ type: 'yakit:set-nav', mode: event.detail.value }, '*');
  });
  window.addEventListener('yakit-nav', (event) => {
    const { mode, resolved } = event.detail;
    navMode.value = mode;
    $('set-nav').setAttribute('summary', mode === 'auto' ? `自动 · 当前${NAV_LABELS[resolved]}` : NAV_LABELS[mode]);
  });
})();
