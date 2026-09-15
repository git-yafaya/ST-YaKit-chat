/**
 * 预设页「文风预设」+ 预设类别切换（导出预设 / 文风预设）（只管界面，数据、文件读写都交给业务层）
 *
 * 一套文风预设只存名字和文风要求正文；正在用的那套就是润色时用的文风（润色设置里的「文风」下拉框和这里是同一个选择）。
 *
 * ───────── 界面需要的业务接口（由 Codex 在 YaKitChat.styles 上提供，界面通过 parent.YaKitChat 调用）─────────
 *
 * style 的形状：{ id, name, text }（新建时没有 id）
 * 函数都可以返回 Promise；失败时 reject Error，message 是给用户看的中文原因，界面直接显示。
 *
 *  1. styles.list() → [style]，按创建顺序
 *  2. styles.getActiveId() → id | null            null 表示润色不使用文风
 *  3. styles.activate(id | null)
 *  4. styles.check(draft) → { errors: { name?, text? } }   值是中文提示
 *  5. styles.save(draft) → 保存后的 style           没有 id 新建，有 id 更新；有错误时 reject
 *  6. styles.duplicate(id) → 新 style               名字为「原名 副本」
 *  7. styles.remove(id)                             删掉正在用的文风时变为不使用
 *  8. styles.exportStyle(id)                        把这套文风下载成文件
 *  9. styles.importStyle(text) → 新 style           text 是用户选的文件内容；重名自动加序号
 *
 * 给润色页用：window 事件 yakit-style-change（文风列表或正在用的文风变化时触发）
 * 没提供 styles 时，文风预设显示「文风预设还没接入」，导入和新建按钮照样显示但不能点。
 */
(() => {
  const $ = (id) => document.getElementById(id);
  const service = () => parent.YaKitChat?.styles;

  const SUBTITLES = { export: '保存导出页的规则、消息类型和格式', style: '润色时要求的文字风格' };
  const ACTIONS = [
    { action: 'edit', label: '编辑', icon: '../icons/edit.svg' },
    { action: 'duplicate', label: '复制', icon: '../icons/copy.svg' },
    { action: 'export', label: '导出', icon: '../icons/ouput.svg' },
    { action: 'delete', label: '删除', icon: '../icons/trash.svg' },
  ];

  let styles = [];
  let activeId = null;
  let busy = false;

  const showError = (error, fallback) => YaKitToast.show(error?.message || fallback, 'danger');
  const notifyChange = () => window.dispatchEvent(new CustomEvent('yakit-style-change'));
  const summary = (style) => String(style.text || '').replace(/\s+/g, ' ').trim();

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

  /* ---------- 预设类别切换 ---------- */

  function showKind(kind) {
    $('preset-export-section').hidden = kind !== 'export';
    $('preset-style-section').hidden = kind !== 'style';
    $('preset-card').setAttribute('subtitle', SUBTITLES[kind]);
    if (kind === 'style') load();
  }
  $('preset-kind').addEventListener('change', (event) => showKind(event.detail.value));

  /* ---------- 读取、显示 ---------- */

  async function load() {
    const api = service();
    if (api) {
      try {
        const [list, id] = await Promise.all([api.list(), api.getActiveId()]);
        styles = Array.isArray(list) ? list : [];
        activeId = styles.some((style) => style.id === id) ? id : null;
      } catch (error) {
        YaKitErrorLog.warn('读取文风预设失败', error);
        styles = [];
        activeId = null;
      }
    }
    render();
  }

  function render() {
    const available = Boolean(service());
    const empty = $('style-empty');
    $('style-import').toggleAttribute('disabled', !available);
    $('style-create').toggleAttribute('disabled', !available);
    if (!available || !styles.length) {
      $('style-list').replaceChildren();
      empty.hidden = false;
      empty.innerHTML = available
        ? '还没有文风预设。<br>点「新建文风」，写下想要的文字风格。'
        : '文风预设还没接入';
      return;
    }
    empty.hidden = true;
    const none = YaKitChoice.row({
      name: '不使用文风',
      summary: '润色时不加文风要求',
      active: activeId === null,
      onPick: () => activate(null),
    });
    const rows = styles.map((style) => YaKitChoice.row({
      name: style.name,
      summary: summary(style),
      active: style.id === activeId,
      onPick: () => activate(style.id),
      actions: ACTIONS,
      onAction: (action) => onAction(style, action),
    }));
    [none, ...rows].forEach((row) => {
      if (row.classList.contains('is-active')) row.tools.innerHTML = '<span class="choice-state">使用中</span>';
    });
    $('style-list').replaceChildren(none, ...rows);
  }

  /* ---------- 操作 ---------- */

  async function activate(id) {
    await run(null, async () => {
      try {
        await service().activate(id);
        const style = styles.find((item) => item.id === id);
        YaKitToast.show(style ? `润色文风已切换到「${style.name}」` : '润色已设为不使用文风', 'success');
      } catch (error) {
        showError(error, '切换文风失败');
      }
    });
    await load();
    notifyChange();
  }

  async function onAction(style, action) {
    if (busy) return;
    if (action === 'edit') {
      openDrawer(style);
      return;
    }
    if (action === 'duplicate') {
      await run(null, async () => {
        try {
          const copy = await service().duplicate(style.id);
          YaKitToast.show(`已复制为「${copy?.name || `${style.name} 副本`}」`, 'success');
        } catch (error) {
          showError(error, '复制文风失败');
        }
      });
    }
    if (action === 'export') {
      await run(null, async () => {
        try {
          await service().exportStyle(style.id);
        } catch (error) {
          showError(error, '导出文风失败');
        }
      });
    }
    if (action === 'delete') {
      const ok = await YaKitModal.confirm({
        title: '删除文风？',
        message: style.id === activeId
          ? `「${style.name}」正在使用，删除后润色不使用文风。删除后不能找回。`
          : `删除「${style.name}」后不能找回。`,
        confirmText: '删除',
      });
      if (!ok) return;
      await run(null, async () => {
        try {
          await service().remove(style.id);
          YaKitToast.show(`已删除「${style.name}」`, 'success');
        } catch (error) {
          showError(error, '删除文风失败');
        }
      });
    }
    await load();
    notifyChange();
  }

  /* ---------- 新建 / 编辑抽屉 ---------- */

  const FIELDS = { name: 'style-name', text: 'style-text' };
  let editingId = null;
  let touched = new Set();
  let submitted = false;

  const draft = () => ({ ...(editingId ? { id: editingId } : {}), name: $('style-name').value, text: $('style-text').value });

  function openDrawer(style = null) {
    editingId = style?.id ?? null;
    touched = new Set();
    submitted = false;
    $('style-drawer').setAttribute('title', style ? '编辑文风' : '新建文风');
    $('style-name').value = style?.name ?? '';
    $('style-text').value = style?.text ?? '';
    Object.values(FIELDS).forEach((id) => $(id).removeAttribute('error'));
    $('style-drawer').show();
  }

  let checkToken = 0;
  async function checkDraft() {
    const token = ++checkToken;
    let result;
    try {
      result = await service().check(draft());
    } catch (error) {
      YaKitErrorLog.warn('校验文风失败', error);
      return { errors: {} };
    }
    if (token !== checkToken) return null;
    const errors = result?.errors || {};
    Object.entries(FIELDS).forEach(([key, id]) => {
      if ((submitted || touched.has(key)) && errors[key]) $(id).setAttribute('error', errors[key]);
      else $(id).removeAttribute('error');
    });
    return { errors };
  }

  let checkTimer = null;
  Object.entries(FIELDS).forEach(([key, id]) => {
    $(id).addEventListener('input', () => {
      touched.add(key);
      clearTimeout(checkTimer);
      checkTimer = setTimeout(checkDraft, 200);
    });
  });

  // 文风正文的结构模板：只放栏目标题，接在已有正文末尾，不覆盖用户写过的内容
  const TEMPLATE = ['文风目标', '适用范围', '视角与叙述距离', '句式与段落节奏', '对白与心理描写', '表达取舍', '对照范例']
    .map((title) => `# ${title}`)
    .join('\n\n');

  $('style-template').addEventListener('click', () => {
    const input = $('style-text');
    const current = input.value.replace(/\s+$/, '');
    input.value = current ? `${current}\n\n${TEMPLATE}` : TEMPLATE;
    touched.add('text');
    checkDraft();
    input.focus();
  });

  $('style-drawer-cancel').addEventListener('click', () => $('style-drawer').close());
  $('style-drawer-save').addEventListener('click', async (event) => {
    submitted = true;
    const result = await checkDraft();
    const firstError = Object.keys(FIELDS).find((key) => result?.errors?.[key]);
    if (firstError) {
      $(FIELDS[firstError]).focus();
      return;
    }
    await run(event.currentTarget, async () => {
      try {
        const saved = await service().save(draft());
        $('style-drawer').close();
        YaKitToast.show(`已保存「${saved?.name || $('style-name').value.trim()}」`, 'success');
      } catch (error) {
        showError(error, '保存文风失败');
      }
    });
    await load();
    notifyChange();
  });

  $('style-create').addEventListener('click', () => openDrawer());

  /* ---------- 导入 ---------- */

  $('style-import').addEventListener('click', () => {
    if (busy) return;
    $('style-file').value = '';
    $('style-file').click();
  });
  $('style-file').addEventListener('change', async (event) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    let text;
    try {
      text = await file.text();
    } catch {
      YaKitToast.show('读取文件失败', 'danger');
      return;
    }
    await run($('style-import'), async () => {
      try {
        const style = await service().importStyle(text);
        YaKitToast.show(`已导入「${style?.name || file.name}」`, 'success');
      } catch (error) {
        showError(error, '导入文风失败');
      }
    });
    await load();
    notifyChange();
  });

  window.addEventListener('yakit-tab', (event) => {
    if (event.detail.tab === 'preset' && $('preset-kind').value === 'style') load();
  });

  render();
})();
