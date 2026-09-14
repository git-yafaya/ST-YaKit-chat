/**
 * 「API 管理」页：副 API 配置 + 三类提示词（只管界面，数据、校验和连接都交给业务层）
 *
 * ───────── 界面需要的业务接口（由 Codex 在 YaKitChat 上提供，界面通过 parent.YaKitChat 调用）─────────
 *
 * 函数都可以返回 Promise；失败时 reject Error，message 是给用户看的中文原因，界面直接显示。
 *
 * profile 的形状：{ id, name, url, key, model, provider: 'auto' | 'openai' | 'local' }（新建时没有 id）
 *
 *  1. apiUI.listProfiles() → [{ id, name, url, model, provider, resolvedProvider: 'openai' | 'local' }]（不含密钥）
 *  2. apiUI.getProfile(id) → profile
 *  3. apiUI.getActiveProfileId() → id | null           null 表示用主 API（跟随ST）
 *  4. apiUI.activateProfile(id | null)
 *  5. apiUI.checkProfile(draft) → { errors: { name?, url?, model? }, warnings: { url?, key? } }   值是中文提示
 *  6. apiUI.saveProfile(draft) → 保存后的 profile      没有 id 新建，有 id 更新；有错误时 reject
 *  7. apiUI.duplicateProfile(id) → 新 profile          名字为「原名 副本」
 *  8. apiUI.removeProfile(id)                          删掉正在用的配置时回到主 API
 *  9. apiUI.testConnection(draft) → { message }        用抽屉里填写的内容试连，失败 reject 中文原因
 * 10. apiUI.fetchModels(draft) → string[]
 *
 * prompt 的形状：{ id, name, target: 'system' | 'user', text }；kind 为 'jailbreak' | 'constraint' | 'style'
 *
 * 11. apiUI.listPrompts(kind) → [prompt]
 * 12. apiUI.getActivePromptId(kind) → id | null         null 表示这一类不使用
 * 13. apiUI.activatePrompt(kind, id | null)
 * 14. apiUI.checkPrompt(kind, draft) → { errors: { name?, text? } }
 * 15. apiUI.savePrompt(kind, draft) → 保存后的 prompt  破限词 target 固定 system
 * 16. apiUI.duplicatePrompt(kind, id) → 新 prompt
 * 17. apiUI.removePrompt(kind, id)                      删掉正在用的提示词时这一类变为不使用
 *
 * 没提供 apiUI 时，页面显示「API 管理还没接入」。
 */
(() => {
  const $ = (id) => document.getElementById(id);
  const service = () => parent.YaKitChat?.apiUI;

  const ROW_ACTIONS = [
    { action: 'edit', label: '编辑', icon: '../icons/edit.svg' },
    { action: 'duplicate', label: '复制', icon: '../icons/copy.svg' },
    { action: 'delete', label: '删除', icon: '../icons/trash.svg' },
  ];
  const KINDS = {
    jailbreak: { label: '破限词', note: '放在 system 最前面，固定不可改。' },
    constraint: { label: '正则提示词', note: '约束输出格式，默认放在 user 的任务正文前。' },
    style: { label: '文风提示词', note: '决定文字风格，默认放在 user 末尾。' },
  };

  let profiles = [];
  let activeProfileId = null;
  let promptKind = 'jailbreak';
  let prompts = [];
  let activePromptId = null;
  let busy = false;

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

  /* ---------- API 配置列表 ---------- */

  const providerText = (profile) => (profile.provider === 'auto'
    ? `自动判断为 ${profile.resolvedProvider || 'openai'}`
    : profile.provider);

  async function loadProfiles() {
    const api = service();
    if (!api) return renderProfiles();
    try {
      const [list, id] = await Promise.all([api.listProfiles(), api.getActiveProfileId()]);
      profiles = Array.isArray(list) ? list : [];
      activeProfileId = profiles.some((profile) => profile.id === id) ? id : null;
    } catch (error) {
      YaKitErrorLog.warn('读取 API 配置失败', error);
      profiles = [];
      activeProfileId = null;
    }
    renderProfiles();
  }

  function renderProfiles() {
    const available = Boolean(service());
    $('api-actions').hidden = !available;
    $('api-unavailable').hidden = available;
    $('prompt-card').hidden = !available;
    if (!available) {
      $('api-list').replaceChildren();
      return;
    }

    const mainRow = YaKitChoice.row({
      name: '主 API（跟随ST）',
      summary: '使用酒馆当前选好的连接',
      active: activeProfileId === null,
      onPick: () => activateProfile(null),
    });
    const rows = profiles.map((profile) => YaKitChoice.row({
      name: profile.name,
      summary: [profile.model, providerText(profile)].filter(Boolean).join(' · '),
      active: profile.id === activeProfileId,
      onPick: () => activateProfile(profile.id),
      actions: ROW_ACTIONS,
      onAction: (action) => onProfileAction(profile, action),
    }));
    [mainRow, ...rows].forEach((row) => {
      if (row.classList.contains('is-active')) row.tools.innerHTML = '<span class="choice-state">使用中</span>';
    });
    $('api-list').replaceChildren(mainRow, ...rows);
  }

  async function activateProfile(id) {
    await run(null, async () => {
      try {
        await service().activateProfile(id);
        const profile = profiles.find((item) => item.id === id);
        YaKitToast.show(`已切换到「${profile ? profile.name : '主 API'}」`, 'success');
      } catch (error) {
        showError(error, '切换 API 配置失败');
      }
    });
    await loadProfiles();
  }

  async function onProfileAction(profile, action) {
    if (busy) return;
    if (action === 'edit') {
      try {
        openProfileDrawer(await service().getProfile(profile.id));
      } catch (error) {
        showError(error, '读取 API 配置失败');
      }
      return;
    }
    if (action === 'duplicate') {
      await run(null, async () => {
        try {
          const copy = await service().duplicateProfile(profile.id);
          YaKitToast.show(`已复制为「${copy?.name || `${profile.name} 副本`}」`, 'success');
        } catch (error) {
          showError(error, '复制 API 配置失败');
        }
      });
    }
    if (action === 'delete') {
      const ok = await YaKitModal.confirm({
        title: '删除 API 配置？',
        message: profile.id === activeProfileId
          ? `「${profile.name}」正在使用，删除后回到主 API。删除后不能找回。`
          : `删除「${profile.name}」后不能找回。`,
        confirmText: '删除',
      });
      if (!ok) return;
      await run(null, async () => {
        try {
          await service().removeProfile(profile.id);
          YaKitToast.show(`已删除「${profile.name}」`, 'success');
        } catch (error) {
          showError(error, '删除 API 配置失败');
        }
      });
    }
    await loadProfiles();
  }

  /* ---------- API 配置抽屉 ---------- */

  const PROFILE_FIELDS = { name: 'api-name', url: 'api-url', key: 'api-key', model: 'api-model' };
  let editingId = null;
  let touched = new Set();
  let submitted = false;

  function profileDraft() {
    const draft = {
      name: $('api-name').value,
      url: $('api-url').value,
      key: $('api-key').value,
      model: $('api-model').value,
      provider: $('api-provider').value,
    };
    if (editingId) draft.id = editingId;
    return draft;
  }

  function hideTestResult() {
    $('api-test-error').hidden = true;
    $('api-test-ok').hidden = true;
  }

  function openProfileDrawer(profile = null) {
    editingId = profile?.id ?? null;
    touched = new Set();
    submitted = false;
    $('api-drawer').setAttribute('title', profile ? '编辑配置' : '新建配置');
    Object.entries(PROFILE_FIELDS).forEach(([key, id]) => {
      $(id).value = profile?.[key] ?? '';
      $(id).removeAttribute('error');
      $(id).removeAttribute('warning');
    });
    $('api-provider').value = profile?.provider || 'auto';
    $('api-model-select').hidden = true;
    $('api-model-select').replaceChildren();
    hideTestResult();
    $('api-drawer').show();
  }

  // 校验：出错阻止保存、提醒不阻止；只给动过的输入框（或点过保存后全部）显示
  let checkToken = 0;
  async function checkProfileDraft() {
    const token = ++checkToken;
    let result;
    try {
      result = await service().checkProfile(profileDraft());
    } catch (error) {
      YaKitErrorLog.warn('校验 API 配置失败', error);
      return { errors: {}, warnings: {} };
    }
    if (token !== checkToken) return null;
    const errors = result?.errors || {};
    const warnings = result?.warnings || {};
    Object.entries(PROFILE_FIELDS).forEach(([key, id]) => {
      const show = submitted || touched.has(key);
      const input = $(id);
      if (show && errors[key]) input.setAttribute('error', errors[key]);
      else input.removeAttribute('error');
      if (show && warnings[key]) input.setAttribute('warning', warnings[key]);
      else input.removeAttribute('warning');
    });
    return { errors, warnings };
  }

  let checkTimer = null;
  const scheduleCheck = () => {
    clearTimeout(checkTimer);
    checkTimer = setTimeout(checkProfileDraft, 200);
  };

  Object.entries(PROFILE_FIELDS).forEach(([key, id]) => {
    $(id).addEventListener('input', () => {
      touched.add(key);
      hideTestResult();
      scheduleCheck();
    });
  });
  $('api-provider').addEventListener('change', () => {
    touched.add('key');
    hideTestResult();
    scheduleCheck();
  });

  $('api-fetch-models').addEventListener('click', (event) => {
    const button = event.currentTarget;
    run(button, async () => {
      try {
        const models = await service().fetchModels(profileDraft());
        const list = Array.isArray(models) ? models : [];
        const select = $('api-model-select');
        select.replaceChildren(...list.map((model) => new Option(model, model)));
        select.value = list.includes($('api-model').value) ? $('api-model').value : '';
        select.hidden = list.length === 0;
        if (list.length) YaKitToast.show(`获取到 ${list.length} 个模型`, 'success');
        else YaKitToast.show('没有获取到模型', 'warning');
      } catch (error) {
        showError(error, '获取模型失败');
      }
    });
  });

  $('api-model-select').addEventListener('change', (event) => {
    $('api-model').value = event.detail.value;
    touched.add('model');
    hideTestResult();
    scheduleCheck();
  });

  $('api-test').addEventListener('click', (event) => {
    const button = event.currentTarget;
    hideTestResult();
    run(button, async () => {
      try {
        const result = await service().testConnection(profileDraft());
        $('api-test-ok').querySelector('span').textContent = result?.message || '连接成功';
        $('api-test-ok').hidden = false;
      } catch (error) {
        $('api-test-error').querySelector('span').textContent = error?.message || '连接失败';
        YaKitErrorLog.add({ message: error?.message || '连接失败', detail: error });
        $('api-test-error').hidden = false;
      }
    });
  });

  $('api-drawer-cancel').addEventListener('click', () => $('api-drawer').close());
  $('api-drawer-save').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    submitted = true;
    const result = await checkProfileDraft();
    const firstError = Object.keys(PROFILE_FIELDS).find((key) => result?.errors?.[key]);
    if (firstError) {
      $(PROFILE_FIELDS[firstError]).focus();
      return;
    }
    await run(button, async () => {
      try {
        const saved = await service().saveProfile(profileDraft());
        $('api-drawer').close();
        YaKitToast.show(`已保存「${saved?.name || $('api-name').value.trim()}」`, 'success');
      } catch (error) {
        showError(error, '保存 API 配置失败');
      }
    });
    await loadProfiles();
  });

  $('api-create').addEventListener('click', () => openProfileDrawer());

  /* ---------- 提示词 ---------- */

  const promptSummary = (prompt) => {
    const text = String(prompt.text || '').replace(/\s+/g, ' ').trim();
    return `注入 ${prompt.target} · ${text}`;
  };

  async function loadPrompts() {
    const api = service();
    if (!api) return;
    const kind = promptKind;
    try {
      const [list, id] = await Promise.all([api.listPrompts(kind), api.getActivePromptId(kind)]);
      if (kind !== promptKind) return;
      prompts = Array.isArray(list) ? list : [];
      activePromptId = prompts.some((prompt) => prompt.id === id) ? id : null;
    } catch (error) {
      YaKitErrorLog.warn('读取提示词失败', error);
      prompts = [];
      activePromptId = null;
    }
    renderPrompts();
  }

  function renderPrompts() {
    $('prompt-kind-note').textContent = KINDS[promptKind].note;
    const noneRow = YaKitChoice.row({
      name: '不使用',
      summary: `不加入${KINDS[promptKind].label}`,
      active: activePromptId === null,
      onPick: () => activatePrompt(null),
    });
    const rows = prompts.map((prompt) => YaKitChoice.row({
      name: prompt.name,
      summary: promptSummary(prompt),
      active: prompt.id === activePromptId,
      onPick: () => activatePrompt(prompt.id),
      actions: ROW_ACTIONS,
      onAction: (action) => onPromptAction(prompt, action),
    }));
    [noneRow, ...rows].forEach((row) => {
      if (row.classList.contains('is-active')) row.tools.innerHTML = '<span class="choice-state">使用中</span>';
    });
    $('prompt-list').replaceChildren(noneRow, ...rows);
  }

  async function activatePrompt(id) {
    const kind = promptKind;
    await run(null, async () => {
      try {
        await service().activatePrompt(kind, id);
        const prompt = prompts.find((item) => item.id === id);
        YaKitToast.show(prompt ? `已切换到「${prompt.name}」` : `${KINDS[kind].label}已设为不使用`, 'success');
      } catch (error) {
        showError(error, '切换提示词失败');
      }
    });
    await loadPrompts();
  }

  async function onPromptAction(prompt, action) {
    if (busy) return;
    const kind = promptKind;
    if (action === 'edit') {
      openPromptDrawer(prompt);
      return;
    }
    if (action === 'duplicate') {
      await run(null, async () => {
        try {
          const copy = await service().duplicatePrompt(kind, prompt.id);
          YaKitToast.show(`已复制为「${copy?.name || `${prompt.name} 副本`}」`, 'success');
        } catch (error) {
          showError(error, '复制提示词失败');
        }
      });
    }
    if (action === 'delete') {
      const ok = await YaKitModal.confirm({
        title: '删除提示词？',
        message: prompt.id === activePromptId
          ? `「${prompt.name}」正在使用，删除后${KINDS[kind].label}变为不使用。删除后不能找回。`
          : `删除「${prompt.name}」后不能找回。`,
        confirmText: '删除',
      });
      if (!ok) return;
      await run(null, async () => {
        try {
          await service().removePrompt(kind, prompt.id);
          YaKitToast.show(`已删除「${prompt.name}」`, 'success');
        } catch (error) {
          showError(error, '删除提示词失败');
        }
      });
    }
    await loadPrompts();
  }

  $('prompt-kind').addEventListener('change', (event) => {
    promptKind = event.detail.value;
    prompts = [];
    activePromptId = null;
    renderPrompts();
    loadPrompts();
  });

  /* ---------- 提示词抽屉 ---------- */

  const PROMPT_FIELDS = { name: 'prompt-name', text: 'prompt-text' };
  let editingPromptId = null;
  let promptTouched = new Set();
  let promptSubmitted = false;

  function promptDraft() {
    const draft = {
      name: $('prompt-name').value,
      text: $('prompt-text').value,
      target: promptKind === 'jailbreak' ? 'system' : $('prompt-target').value,
    };
    if (editingPromptId) draft.id = editingPromptId;
    return draft;
  }

  function openPromptDrawer(prompt = null) {
    editingPromptId = prompt?.id ?? null;
    promptTouched = new Set();
    promptSubmitted = false;
    const { label } = KINDS[promptKind];
    $('prompt-drawer').setAttribute('title', `${prompt ? '编辑' : '新建'}${label}`);
    $('prompt-name').value = prompt?.name ?? '';
    $('prompt-text').value = prompt?.text ?? '';
    Object.values(PROMPT_FIELDS).forEach((id) => $(id).removeAttribute('error'));
    const locked = promptKind === 'jailbreak';
    $('prompt-target').value = locked ? 'system' : (prompt?.target || 'user');
    $('prompt-target').closest('.setting-field').hidden = locked;
    $('prompt-target-note').innerHTML = locked
      ? '破限词固定放在 system 最前面。'
      : '提示词放进 system 还是 user 消息。<br>建议保持 user，模型不遵守时再试 system。';
    $('prompt-drawer').show();
  }

  let promptCheckToken = 0;
  async function checkPromptDraft() {
    const token = ++promptCheckToken;
    let result;
    try {
      result = await service().checkPrompt(promptKind, promptDraft());
    } catch (error) {
      YaKitErrorLog.warn('校验提示词失败', error);
      return { errors: {} };
    }
    if (token !== promptCheckToken) return null;
    const errors = result?.errors || {};
    Object.entries(PROMPT_FIELDS).forEach(([key, id]) => {
      if ((promptSubmitted || promptTouched.has(key)) && errors[key]) $(id).setAttribute('error', errors[key]);
      else $(id).removeAttribute('error');
    });
    return { errors };
  }

  let promptCheckTimer = null;
  Object.entries(PROMPT_FIELDS).forEach(([key, id]) => {
    $(id).addEventListener('input', () => {
      promptTouched.add(key);
      clearTimeout(promptCheckTimer);
      promptCheckTimer = setTimeout(checkPromptDraft, 200);
    });
  });

  $('prompt-drawer-cancel').addEventListener('click', () => $('prompt-drawer').close());
  $('prompt-drawer-save').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    promptSubmitted = true;
    const result = await checkPromptDraft();
    const firstError = Object.keys(PROMPT_FIELDS).find((key) => result?.errors?.[key]);
    if (firstError) {
      $(PROMPT_FIELDS[firstError]).focus();
      return;
    }
    const kind = promptKind;
    await run(button, async () => {
      try {
        const saved = await service().savePrompt(kind, promptDraft());
        $('prompt-drawer').close();
        YaKitToast.show(`已保存「${saved?.name || $('prompt-name').value.trim()}」`, 'success');
      } catch (error) {
        showError(error, '保存提示词失败');
      }
    });
    await loadPrompts();
  });

  $('prompt-create').addEventListener('click', () => openPromptDrawer());

  /* ---------- 切到本页时刷新 ---------- */

  window.addEventListener('yakit-tab', (event) => {
    if (event.detail.tab !== 'api') return;
    loadProfiles();
    loadPrompts();
  });

  renderProfiles();
  renderPrompts();
  loadProfiles();
  loadPrompts();
})();
