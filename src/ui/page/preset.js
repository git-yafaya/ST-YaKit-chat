/**
 * 「预设」页的导出预设 + 导出页底部的预设下拉框（只管界面，数据、文件读写都交给业务层；文风预设见 style-preset.js）
 *
 * 一套预设保存导出页的：消息类型、导出格式、带类别标注 / 仅正文、匹配方式、正则规则；
 * 楼层范围和文件名不进预设。
 *
 * ───────── 界面需要的业务接口（由 Codex 在 YaKitChat 上提供，界面通过 parent.YaKitChat 调用）─────────
 *
 * content 的形状：{ types: { ai, user, system }, format, labels, illustrated, mode, rules }（含义同导出设置 settings；旧预设没有 illustrated 时按 false）
 * 函数都可以返回 Promise；失败时 reject Error，message 是给用户看的中文原因，界面直接显示。
 *
 *  1. presets.list() → [{ id, name, content }]，按创建顺序
 *  2. presets.getActiveId() → id | null
 *  3. presets.activate(id | null) → 写入后的完整导出 settings
 *       设置当前预设，并把该预设的 content 写进已保存的导出设置（楼层范围、文件名不变）；null 只清空当前预设
 *  4. presets.create(name, content) → { id, name, content }，重名自动加序号，不改变当前预设
 *  5. presets.update(id, content)            用 content 覆盖该预设
 *  6. presets.rename(id, name)               重名时 reject「已有同名预设」
 *  7. presets.duplicate(id) → 新预设，名字为「原名 副本」
 *  8. presets.remove(id)                     删掉正在用的预设时，当前预设变为空
 *  9. presets.exportPreset(id)               把这套预设下载成文件
 * 10. presets.importPreset(text) → 新预设    text 是用户选的文件内容；重名自动加序号
 * 11. presets.exportBackup(uiPrefs)          下载备份文件：全部预设、当前预设、导出设置和界面传入的 uiPrefs
 * 12. presets.restoreBackup(text) → { presetCount, uiPrefs }   覆盖全部预设、当前预设和导出设置
 * 13. presets.suggestName() → string         当前聊天角色卡的名字；没有聊天时返回空字符串
 *
 * 界面负责：「已修改」比对、确认框、选文件、uiPrefs（主题、导航栏位置、主题切换方式）的读取和应用。
 * 没提供 presets 时，预设页显示「预设还没接入」，导出页不显示预设下拉框。
 */
(() => {
  const $ = (id) => document.getElementById(id);
  const service = () => parent.YaKitChat?.presets;

  const TYPE_LABELS = { ai: 'AI', user: '用户', system: '系统' };
  const FORMAT_LABELS = { txt: 'TXT', md: 'Markdown', epub: 'EPUB' };
  const NAME_MAX = 30;
  const ACTION_LABELS = { rename: '重命名', duplicate: '复制', export: '导出', delete: '删除' };
  const ACTION_ICONS = { rename: '../icons/edit.svg', duplicate: '../icons/copy.svg', export: '../icons/ouput.svg', delete: '../icons/trash.svg' };

  let presets = [];
  let activeId = null;
  let busy = false;

  const exportPage = () => window.YaKitExportPage;
  const active = () => presets.find((preset) => preset.id === activeId) || null;

  // 预设只关心这六项
  function pickContent(settings = {}) {
    return {
      types: { ai: Boolean(settings.types?.ai), user: Boolean(settings.types?.user), system: Boolean(settings.types?.system) },
      format: settings.format,
      labels: settings.labels,
      illustrated: Boolean(settings.illustrated),
      mode: settings.mode,
      rules: Array.isArray(settings.rules) ? [...settings.rules] : [],
    };
  }

  const sameContent = (a, b) => JSON.stringify(pickContent(a)) === JSON.stringify(pickContent(b));

  // 当前导出设置和正在用的预设对不上
  function isModified() {
    const current = active();
    const state = exportPage()?.getState();
    return Boolean(current && state && !sameContent(state, current.content));
  }

  function summarize(content = {}) {
    const rules = content.rules?.filter((rule) => rule) || [];
    const parts = [rules.length ? `${rules.length} 条规则 · ${content.mode === 'keep' ? '只保留匹配' : '删除匹配'}` : '无规则'];
    const types = Object.keys(TYPE_LABELS).filter((key) => content.types?.[key]).map((key) => TYPE_LABELS[key]);
    parts.push(types.length ? types.join('/') : '未选择消息类型');
    parts.push(`${FORMAT_LABELS[content.format] || 'TXT'}${content.labels === 'plain' ? ' 仅正文' : ' 带标注'}`);
    return parts.join(' · ');
  }

  const showError = (error, fallback) => YaKitToast.show(error?.message || fallback, 'danger');

  // 同一时间只做一件事；按钮显示加载中
  async function run(button, task) {
    if (busy) return;
    busy = true;
    button?.setAttribute('loading', '');
    try {
      await task();
    } finally {
      busy = false;
      button?.removeAttribute('loading');
    }
  }

  /* ---------- 读取、显示 ---------- */

  async function load() {
    const api = service();
    if (!api) return render();
    try {
      const [list, id] = await Promise.all([api.list(), api.getActiveId()]);
      presets = Array.isArray(list) ? list : [];
      activeId = presets.some((preset) => preset.id === id) ? id : null;
    } catch (error) {
      YaKitErrorLog.warn('读取预设失败', error);
      presets = [];
      activeId = null;
    }
    render();
  }

  function render() {
    renderList();
    renderExportSelect();
  }

  function renderList() {
    const available = Boolean(service());
    const list = $('preset-list');
    const empty = $('preset-empty');
    $('preset-actions').hidden = !available;
    document.querySelector('.backup-actions').hidden = !available;

    if (!available || !presets.length) {
      list.replaceChildren();
      empty.hidden = false;
      empty.innerHTML = available
        ? '还没有导出预设。<br>点「存为新预设」，把导出页现在的设置存下来。'
        : '导出预设还没接入';
      return;
    }
    empty.hidden = true;
    const modified = isModified();

    list.replaceChildren(...presets.map((preset) => {
      const isActive = preset.id === activeId;
      const item = YaKitChoice.row({
        name: preset.name,
        summary: summarize(preset.content),
        active: isActive,
        onPick: () => switchTo(preset.id),
        actions: Object.entries(ACTION_LABELS).map(([action, label]) => ({ action, label, icon: ACTION_ICONS[action] })),
        onAction: (action) => onAction(preset, action),
      });

      const showModified = isActive && modified;
      item.classList.toggle('is-modified', showModified);
      item.tools.innerHTML = `
        <span class="choice-state"></span>
        <yakit-button class="preset-save" size="sm" hidden>保存</yakit-button>
        <yakit-button class="preset-revert" size="sm" variant="ghost" hidden>还原</yakit-button>
      `;
      item.querySelector('.choice-state').textContent = isActive ? (modified ? '已修改' : '使用中') : '';
      item.querySelector('.preset-save').hidden = !showModified;
      item.querySelector('.preset-revert').hidden = !showModified;
      item.querySelector('.preset-save').addEventListener('click', (event) => saveActive(event.currentTarget));
      item.querySelector('.preset-revert').addEventListener('click', (event) => revert(event.currentTarget));
      return item;
    }));
  }

  function renderExportSelect() {
    const wrap = $('export-preset');
    const select = $('export-preset-select');
    wrap.hidden = !service();
    if (wrap.hidden) return;
    const options = [new Option('不使用预设', '')];
    presets.forEach((preset) => options.push(new Option(preset.name, preset.id)));
    select.replaceChildren(...options);
    select.value = activeId ?? '';
    $('export-preset-save').toggleAttribute('disabled', !isModified());
  }

  // 导出页改了设置：只刷新「已修改」相关的显示
  function refreshModified() {
    if (!service()) return;
    // 预设页没打开时不用重画列表，切过去时会重新读取
    if (!document.querySelector('[data-page="preset"]').hidden) renderList();
    $('export-preset-save').toggleAttribute('disabled', !isModified());
  }

  /* ---------- 操作 ---------- */

  async function switchTo(id, button) {
    if (busy || id === activeId) return;
    const current = active();
    if (id !== null && isModified()) {
      const ok = await YaKitModal.confirm({
        title: '切换预设？',
        message: `当前改动还没保存到「${current.name}」，切换后会丢失。`,
        confirmText: '切换',
      });
      if (!ok) return renderExportSelect();
    }
    await run(button, async () => {
      try {
        const settings = await service().activate(id);
        activeId = id;
        if (settings) exportPage()?.replaceState(settings);
        const next = active();
        if (next) YaKitToast.show(`已切换到「${next.name}」`, 'success');
      } catch (error) {
        showError(error, '切换预设失败');
      }
    });
    await load();
  }

  async function saveActive(button) {
    const current = active();
    const state = exportPage()?.getState();
    if (!current || !state) return;
    await run(button, async () => {
      try {
        await service().update(current.id, pickContent(state));
        YaKitToast.show(`已更新「${current.name}」`, 'success');
      } catch (error) {
        showError(error, '保存预设失败');
      }
    });
    await load();
  }

  async function revert(button) {
    const current = active();
    if (!current) return;
    const ok = await YaKitModal.confirm({
      title: '还原预设？',
      message: `导出页会恢复成「${current.name}」保存时的样子，当前改动会丢失。`,
      confirmText: '还原',
    });
    if (!ok) return;
    await run(button, async () => {
      try {
        const settings = await service().activate(current.id);
        if (settings) exportPage()?.replaceState(settings);
        YaKitToast.show(`已还原「${current.name}」`, 'success');
      } catch (error) {
        showError(error, '还原预设失败');
      }
    });
    await load();
  }

  async function createPreset(button) {
    const state = exportPage()?.getState();
    if (busy || !state) return;
    let suggested = '';
    try {
      suggested = (await service().suggestName?.()) || '';
    } catch {}
    const name = await YaKitModal.prompt({
      title: '存为新预设',
      label: '预设名字',
      value: String(suggested).slice(0, NAME_MAX) || '新预设',
      placeholder: '给预设起个名字',
      maxlength: NAME_MAX,
      confirmText: '保存',
    });
    if (!name) return;
    await run(button, async () => {
      try {
        const preset = await service().create(name, pickContent(state));
        // 存下来的就是现在的设置，直接当作正在用的预设
        const settings = await service().activate(preset.id);
        if (settings) exportPage()?.replaceState(settings);
        YaKitToast.show(`已存为「${preset.name}」`, 'success');
      } catch (error) {
        showError(error, '保存预设失败');
      }
    });
    await load();
  }

  async function onAction(preset, action) {
    if (busy) return;
    if (action === 'rename') {
      const name = await YaKitModal.prompt({
        title: '重命名预设',
        label: '预设名字',
        value: preset.name,
        maxlength: NAME_MAX,
        confirmText: '保存',
      });
      if (!name || name === preset.name) return;
      await run(null, async () => {
        try {
          await service().rename(preset.id, name);
        } catch (error) {
          showError(error, '重命名失败');
        }
      });
    }
    if (action === 'duplicate') {
      await run(null, async () => {
        try {
          const copy = await service().duplicate(preset.id);
          YaKitToast.show(`已复制为「${copy?.name || `${preset.name} 副本`}」`, 'success');
        } catch (error) {
          showError(error, '复制预设失败');
        }
      });
    }
    if (action === 'export') {
      await run(null, async () => {
        try {
          await service().exportPreset(preset.id);
        } catch (error) {
          showError(error, '导出预设失败');
        }
      });
    }
    if (action === 'delete') {
      const ok = await YaKitModal.confirm({
        title: '删除预设？',
        message: preset.id === activeId
          ? `「${preset.name}」正在使用，删除后导出页的设置保持不变。删除后不能找回。`
          : `删除「${preset.name}」后不能找回。`,
        confirmText: '删除',
      });
      if (!ok) return;
      await run(null, async () => {
        try {
          await service().remove(preset.id);
          YaKitToast.show(`已删除「${preset.name}」`, 'success');
        } catch (error) {
          showError(error, '删除预设失败');
        }
      });
    }
    await load();
  }

  /* ---------- 导入、备份 ---------- */

  const PREF_KEYS = { theme: 'yakit-theme', nav: 'yakit-nav', themeSwitch: 'yakit-theme-switch' };

  function readUiPrefs() {
    const prefs = {};
    Object.entries(PREF_KEYS).forEach(([name, key]) => {
      try {
        const value = localStorage.getItem(key);
        if (value) prefs[name] = value;
      } catch {}
    });
    return prefs;
  }

  function applyUiPrefs(prefs = {}) {
    if (YAKIT_THEMES.some((theme) => theme.id === prefs.theme)) {
      parent.postMessage({ type: 'yakit:set-theme', theme: prefs.theme }, '*');
    }
    if (['auto', 'top', 'bottom'].includes(prefs.nav)) {
      parent.postMessage({ type: 'yakit:set-nav', mode: prefs.nav }, '*');
    }
    if (['auto', 'icon', 'select'].includes(prefs.themeSwitch)) {
      try { localStorage.setItem(PREF_KEYS.themeSwitch, prefs.themeSwitch); } catch {}
      window.dispatchEvent(new Event('yakit-theme-switch-change'));
    }
  }

  // 选文件：import = 导入预设，restore = 从备份恢复
  let fileAction = null;
  let fileButton = null;
  function pickFile(action, button) {
    if (busy) return;
    fileAction = action;
    fileButton = button;
    $('preset-file').value = '';
    $('preset-file').click();
  }

  $('preset-file').addEventListener('change', async (event) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    let text;
    try {
      text = await file.text();
    } catch {
      YaKitToast.show('读取文件失败', 'danger');
      return;
    }

    if (fileAction === 'import') {
      await run(fileButton, async () => {
        try {
          const preset = await service().importPreset(text);
          YaKitToast.show(`已导入「${preset?.name || file.name}」`, 'success');
        } catch (error) {
          showError(error, '导入预设失败');
        }
      });
    }

    if (fileAction === 'restore') {
      const ok = await YaKitModal.confirm({
        title: '从备份恢复？',
        message: '会覆盖现有的全部预设和导出设置，不能撤销。',
        confirmText: '恢复',
      });
      if (!ok) return;
      await run(fileButton, async () => {
        try {
          const result = await service().restoreBackup(text);
          const settings = parent.YaKitChat?.exportUI?.loadSettings?.();
          if (settings) exportPage()?.replaceState(settings);
          applyUiPrefs(result?.uiPrefs);
          const count = Number(result?.presetCount);
          YaKitToast.show(Number.isFinite(count) ? `已恢复 ${count} 套预设` : '已从备份恢复', 'success');
        } catch (error) {
          showError(error, '恢复备份失败');
        }
      });
    }
    await load();
  });

  $('preset-create').addEventListener('click', (event) => createPreset(event.currentTarget));
  $('preset-import').addEventListener('click', (event) => pickFile('import', event.currentTarget));
  $('backup-restore').addEventListener('click', (event) => pickFile('restore', event.currentTarget));
  $('backup-export').addEventListener('click', (event) => {
    const button = event.currentTarget;
    run(button, async () => {
      try {
        await service().exportBackup(readUiPrefs());
      } catch (error) {
        showError(error, '备份失败');
      }
    });
  });

  /* ---------- 导出页的预设下拉框 ---------- */

  $('export-preset-select').addEventListener('change', (event) => {
    switchTo(event.detail.value || null);
  });
  $('export-preset-save').addEventListener('click', (event) => saveActive(event.currentTarget));

  window.addEventListener('yakit-export-change', refreshModified);
  window.addEventListener('yakit-tab', (event) => {
    if (event.detail.tab === 'preset') load();
  });

  render();
  load();
})();
