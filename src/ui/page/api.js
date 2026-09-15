/**
 * 「API 管理」页：副 API 配置 + 助手接口 + 请求参数 + 固定提示词（只管界面，数据、校验和连接都交给业务层）
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
 * 固定提示词（三条，顺序固定，不能新建、删除）
 *   corePrompt 的形状：{ id: 'jailbreak' | 'regex' | 'polish', name, target: 'system' | 'user', text, defaultText, modified: boolean }
 *   jailbreak = 通用破限词（单独一条 system，正文为空时不发送）；
 *   regex / polish = 正则提示词 / 润色提示词（user 消息开头的规则和要求，后面由程序接上本次任务材料和输出格式）
 *   defaultText = 默认正文；编辑抽屉里边输入边和它比较，决定「恢复默认」能不能点（没提供时按 modified 判断）
 *   modified = 已保存的正文和默认内容不同
 *
 * 11. apiUI.listCorePrompts() → [corePrompt]，按 通用破限词 / 正则提示词 / 润色提示词 排列
 * 12. apiUI.saveCorePrompt(id, text) → 保存后的 corePrompt   正则、润色提示词正文为空时 reject
 * 13. apiUI.resetCorePrompt(id) → 恢复默认后的 corePrompt
 *      三个函数没全提供时，卡片照样显示三行，摘要写「还没接入」，不能点开编辑
 *
 * 助手（kind 为 'regex' 正则助手 | 'polish' 润色助手）：只选接口，profile 取值 'follow' 跟随使用中 / 'main' 主 API / 具体配置 id
 *
 *   sampling 的形状：{ temperature, topP, topK, frequencyPenalty, presencePenalty }，每项是数字或 null（null = 不设置，请求里不带）
 *
 * 18. apiUI.getAssistant(kind) → { profile, sampling }
 * 19. apiUI.setAssistant(kind, patch) → 保存后的完整对象   patch 为 { profile } 或 { sampling: { 某一项: 数字 | null } }
 *     apiUI.resetAssistant(kind) → 保存后的完整对象     回到默认：跟随使用中，正则助手温度 0.8、润色助手 0.95，其他不设置
 *      数值不合法时 reject，message 是中文原因，界面显示在对应输入框下方
 *      两个函数都提供时才显示助手卡片；「跟随使用中（…）」的名字由界面用 listProfiles / getActiveProfileId 自己算
 *
 * 参数（所有 AI 请求共用）
 *
 * 21. apiUI.getRequestSettings() → { timeoutSeconds, retries }     retries 为 0–3
 * 22. apiUI.setRequestSettings(patch) → 保存后的完整对象；值不合法时 reject 中文原因
 *      两个函数都提供时才显示参数卡片
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
  // 固定提示词在编辑抽屉里的说明：只有通用破限词显示
  const PROMPT_NOTES = {
    jailbreak: '固定单独作为 system 消息发送；正文空着时不发送。',
  };
  // 正则、润色提示词编辑时显示的标签和含义（程序发送时使用的标签）
  const PROMPT_TAGS = {
    polish: [
      ['<style>…</style>', '文风要求；未选择文风时省略'],
      ['<original>…</original>', '本次需要润色的原文容器'],
      ['<floor n="楼号">…</floor>', '输入是该楼原文，输出是对应润色结果；楼号从 0 开始，保持原聊天编号'],
      ['<previous>…</previous>', '前一楼结尾，仅供衔接参考'],
      ['<next>…</next>', '后一楼开头，仅供衔接参考，选楼重做时提供'],
    ],
    regex: [
      ['<sample floor="楼号">…</sample>', '当前聊天最后一条非隐藏 AI 消息按已有规则清洗后的文字样本，楼号从 0 开始；只供分析'],
      ['<rule>/pattern/flags</rule>', '输出一条新增 JavaScript 正则；pattern 是匹配模式，flags 是正则标志'],
      ['<explanation>…</explanation>', '用一句中文解释紧前一条正则实际匹配什么'],
    ],
  };

  let profiles = [];
  let activeProfileId = null;
  let prompts = [];
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
    loadAssistants();
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

  // 获取模型、测试连接要等酒馆去查，可能要几秒到半分钟：
  // 等待期间不锁住抽屉里其他操作；改了地址、密钥、类型或关掉抽屉后，旧结果作废，按钮立刻恢复
  let connectionToken = 0;
  function resetConnection() {
    connectionToken += 1;
    $('api-fetch-models').removeAttribute('loading');
    $('api-test').removeAttribute('loading');
    hideTestResult();
  }
  $('api-drawer').addEventListener('close', resetConnection);

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
    resetConnection();
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

  const CONNECTION_FIELDS = ['url', 'key'];
  Object.entries(PROFILE_FIELDS).forEach(([key, id]) => {
    $(id).addEventListener('input', () => {
      touched.add(key);
      if (CONNECTION_FIELDS.includes(key)) resetConnection();
      scheduleCheck();
    });
  });
  $('api-provider').addEventListener('change', () => {
    touched.add('key');
    resetConnection();
    scheduleCheck();
  });

  $('api-fetch-models').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    if (button.hasAttribute('loading')) return;
    const token = connectionToken;
    button.setAttribute('loading', '');
    try {
      const models = await service().fetchModels(profileDraft());
      if (token !== connectionToken) return;
      const list = Array.isArray(models) ? models : [];
      const select = $('api-model-select');
      select.replaceChildren(...list.map((model) => new Option(model, model)));
      select.value = list.includes($('api-model').value) ? $('api-model').value : '';
      select.hidden = list.length === 0;
      if (list.length) YaKitToast.show(`获取到 ${list.length} 个模型`, 'success');
      else YaKitToast.show('没有获取到模型', 'warning');
    } catch (error) {
      if (token === connectionToken) showError(error, '获取模型失败');
    } finally {
      if (token === connectionToken) button.removeAttribute('loading');
    }
  });

  $('api-model-select').addEventListener('change', (event) => {
    $('api-model').value = event.detail.value;
    touched.add('model');
    scheduleCheck();
  });

  $('api-test').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    if (button.hasAttribute('loading')) return;
    hideTestResult();
    const token = connectionToken;
    button.setAttribute('loading', '');
    try {
      const result = await service().testConnection(profileDraft());
      if (token !== connectionToken) return;
      $('api-test-ok').querySelector('span').textContent = result?.message || '连接成功';
      $('api-test-ok').hidden = false;
    } catch (error) {
      if (token !== connectionToken) return;
      $('api-test-error').querySelector('span').textContent = error?.message || '连接失败';
      YaKitErrorLog.add({ message: error?.message || '连接失败', detail: error });
      $('api-test-error').hidden = false;
    } finally {
      if (token === connectionToken) button.removeAttribute('loading');
    }
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

  /* ---------- 固定提示词：通用破限词 / 正则提示词 / 润色提示词 ---------- */

  const hasCorePrompts = () => ['listCorePrompts', 'saveCorePrompt', 'resetCorePrompt'].every((name) => typeof service()?.[name] === 'function');
  const promptSummary = (prompt) => {
    const text = String(prompt.text || '').replace(/\s+/g, ' ').trim();
    return `${prompt.target} · ${text || '空着，不发送'}`;
  };

  // 业务没接上时照样显示三行，方便先看界面
  const PLACEHOLDER_PROMPTS = [
    { id: 'jailbreak', name: '通用破限词', target: 'system' },
    { id: 'regex', name: '正则提示词', target: 'user' },
    { id: 'polish', name: '润色提示词', target: 'user' },
  ];

  async function loadPrompts() {
    if (!hasCorePrompts()) {
      prompts = [];
      renderPrompts();
      return;
    }
    try {
      const list = await service().listCorePrompts();
      prompts = Array.isArray(list) ? list : [];
    } catch (error) {
      YaKitErrorLog.warn('读取提示词失败', error);
      prompts = [];
    }
    renderPrompts();
  }

  function renderPrompts() {
    if (!hasCorePrompts()) {
      $('prompt-list').replaceChildren(...PLACEHOLDER_PROMPTS.map((prompt) => {
        const row = YaKitChoice.row({ name: prompt.name, summary: `${prompt.target} · 还没接入` });
        row.querySelector('.choice-main').disabled = true;
        return row;
      }));
      return;
    }
    $('prompt-list').replaceChildren(...prompts.map((prompt) => {
      const row = YaKitChoice.row({
        name: prompt.name,
        summary: promptSummary(prompt),
        onPick: () => openPromptDrawer(prompt),
        actions: [{ action: 'edit', label: '编辑', icon: '../icons/edit.svg' }],
        onAction: () => openPromptDrawer(prompt),
      });
      if (prompt.modified) row.tools.innerHTML = '<span class="choice-state">已修改</span>';
      return row;
    }));
  }

  /* ---------- 提示词抽屉 ---------- */

  let editingPrompt = null;

  function openPromptDrawer(prompt) {
    if (busy) return;
    editingPrompt = prompt;
    $('prompt-drawer').setAttribute('title', `编辑${prompt.name}`);
    $('prompt-target-note').innerHTML = PROMPT_NOTES[prompt.id] || '';
    $('prompt-target-note').hidden = !PROMPT_NOTES[prompt.id];
    renderPromptTags(prompt.id);
    $('prompt-text').value = prompt.text ?? '';
    $('prompt-text').removeAttribute('error');
    syncResetButton();
    $('prompt-drawer').show();
  }

  function renderPromptTags(id) {
    const tags = PROMPT_TAGS[id] || [];
    $('prompt-tags').hidden = !tags.length;
    $('prompt-tags').querySelector('.prompt-tags-table').replaceChildren(...tags.map(([tag, meaning]) => {
      const row = document.createElement('div');
      row.className = 'prompt-tag-row';
      row.setAttribute('role', 'row');
      row.innerHTML = '<code role="cell"></code><span role="cell"></span>';
      row.querySelector('code').textContent = tag;
      row.querySelector('span').textContent = meaning;
      return row;
    }));
  }

  // 「恢复默认」：输入框里的内容和默认正文一样时不能点，边输入边判断
  function syncResetButton() {
    const prompt = editingPrompt;
    if (!prompt) return;
    const same = typeof prompt.defaultText === 'string'
      ? $('prompt-text').value === prompt.defaultText
      : !prompt.modified;
    $('prompt-drawer-reset').toggleAttribute('disabled', same);
  }

  $('prompt-text').addEventListener('input', () => {
    $('prompt-text').removeAttribute('error');
    syncResetButton();
  });
  $('prompt-drawer-cancel').addEventListener('click', () => $('prompt-drawer').close());

  $('prompt-drawer-save').addEventListener('click', async (event) => {
    const prompt = editingPrompt;
    if (!prompt) return;
    await run(event.currentTarget, async () => {
      try {
        await service().saveCorePrompt(prompt.id, $('prompt-text').value);
        $('prompt-drawer').close();
        YaKitToast.show(`已保存${prompt.name}`, 'success');
      } catch (error) {
        // 正文不合格时提示在输入框下面
        $('prompt-text').setAttribute('error', error?.message || '保存提示词失败');
      }
    });
    await loadPrompts();
  });

  $('prompt-drawer-reset').addEventListener('click', async (event) => {
    const prompt = editingPrompt;
    if (!prompt) return;
    const ok = await YaKitModal.confirm({
      title: `恢复默认${prompt.name}？`,
      message: '改过的正文会换回默认内容，不能找回。',
      confirmText: '恢复默认',
    });
    if (!ok) return;
    await run(event.currentTarget, async () => {
      try {
        const saved = await service().resetCorePrompt(prompt.id);
        editingPrompt = saved || prompt;
        $('prompt-text').value = saved?.text ?? '';
        $('prompt-text').removeAttribute('error');
        syncResetButton();
        YaKitToast.show(`已恢复默认${prompt.name}`, 'success');
      } catch (error) {
        showError(error, '恢复默认失败');
      }
    });
    await loadPrompts();
  });

  /* ---------- 助手：各个 AI 功能用哪个接口 ---------- */

  const ASSISTANT_NAMES = { regex: '正则助手', polish: '润色助手' };
  const hasAssistants = () => ['getAssistant', 'setAssistant'].every((name) => typeof service()?.[name] === 'function');
  let assistantToken = 0;

  async function loadAssistants() {
    const card = $('assistant-card');
    card.hidden = !hasAssistants();
    if (card.hidden) return;
    const api = service();
    const token = ++assistantToken;
    let data;
    try {
      const [profileList, activeProfile, regex, polish] = await Promise.all([
        api.listProfiles(),
        api.getActiveProfileId(),
        api.getAssistant('regex'),
        api.getAssistant('polish'),
      ]);
      data = { profileList: Array.isArray(profileList) ? profileList : [], activeProfile, current: { regex, polish } };
    } catch (error) {
      YaKitErrorLog.warn('读取助手配置失败', error);
      return;
    }
    if (token !== assistantToken) return;
    const follow = data.profileList.find((item) => item.id === data.activeProfile)?.name || '主 API';
    const options = [
      ['follow', `跟随使用中（${follow}）`],
      ['main', '主 API（跟随ST）'],
      ...data.profileList.map((item) => [item.id, item.name]),
    ];
    // 采样参数：空着就是不设置；正在输入的框不覆盖
    document.querySelectorAll('#assistant-card .sampling-grid').forEach((gridEl) => {
      const sampling = data.current[gridEl.dataset.kind]?.sampling || {};
      gridEl.querySelectorAll('yakit-input').forEach((input) => {
        if (input.matches(':focus-within')) return;
        const value = sampling[input.dataset.param];
        input.value = value === null || value === undefined ? '' : String(value);
      });
    });
    document.querySelectorAll('#assistant-card yakit-select').forEach((select) => {
      const value = data.current[select.dataset.kind]?.profile;
      select.replaceChildren(...options.map(([optionValue, label]) => new Option(label, optionValue)));
      // 找不到的 id（比如刚被删掉）按跟随使用中显示
      select.value = options.some(([optionValue]) => optionValue === value) ? value : 'follow';
    });
  }

  // 采样参数：输完离开输入框保存，清空就是不设置
  document.querySelectorAll('#assistant-card .sampling-grid yakit-input').forEach((input) => {
    input.addEventListener('input', () => input.removeAttribute('error'));
    input.addEventListener('change', async () => {
      const kind = input.closest('.sampling-grid').dataset.kind;
      const text = input.value.trim();
      const value = text === '' ? null : Number(text);
      if (value !== null && !Number.isFinite(value)) {
        input.setAttribute('error', '请填写数字');
        return;
      }
      try {
        await service().setAssistant(kind, { sampling: { [input.dataset.param]: value } });
        input.removeAttribute('error');
        YaKitToast.show(`已保存${ASSISTANT_NAMES[kind]}`, 'success');
      } catch (error) {
        input.setAttribute('error', error?.message || '保存失败');
      }
    });
  });

  document.querySelectorAll('#assistant-card yakit-select').forEach((select) => {
    select.addEventListener('change', async (event) => {
      const kind = select.dataset.kind;
      try {
        await service().setAssistant(kind, { profile: event.detail.value });
        YaKitToast.show(`已保存${ASSISTANT_NAMES[kind]}`, 'success');
      } catch (error) {
        showError(error, '保存助手失败');
      }
      loadAssistants();
    });
  });

  // 重置：两个助手一起回到默认设置
  $('assistant-reset').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    if (typeof service()?.resetAssistant !== 'function') return;
    button.setAttribute('loading', '');
    try {
      await Promise.all(Object.keys(ASSISTANT_NAMES).map((kind) => service().resetAssistant(kind)));
      document.querySelectorAll('#assistant-card .sampling-grid yakit-input').forEach((input) => input.removeAttribute('error'));
      YaKitToast.show('助手已恢复默认设置', 'success');
    } catch (error) {
      showError(error, '重置助手失败');
    } finally {
      button.removeAttribute('loading');
    }
    loadAssistants();
  });

  /* ---------- 参数：超时时间、自动重试次数 ---------- */

  const hasRequestSettings = () => ['getRequestSettings', 'setRequestSettings'].every((name) => typeof service()?.[name] === 'function');
  let savedTimeout = '';

  async function loadRequestSettings() {
    $('request-card').hidden = !hasRequestSettings();
    if ($('request-card').hidden) return;
    try {
      const settings = await service().getRequestSettings();
      savedTimeout = String(settings?.timeoutSeconds ?? '');
      $('request-timeout').value = savedTimeout;
      $('request-timeout').removeAttribute('error');
      $('request-retries').value = String(settings?.retries ?? 1);
    } catch (error) {
      YaKitErrorLog.warn('读取参数失败', error);
    }
  }

  async function saveRequestSettings(patch, { input } = {}) {
    try {
      const saved = await service().setRequestSettings(patch);
      savedTimeout = String(saved?.timeoutSeconds ?? savedTimeout);
      input?.removeAttribute('error');
      YaKitToast.show('已保存参数', 'success');
    } catch (error) {
      // 超时时间填错时在输入框下面提示，不弹提示消息
      if (input) input.setAttribute('error', error?.message || '保存参数失败');
      else showError(error, '保存参数失败');
    }
  }

  // 超时时间：输完离开输入框（或按回车）时保存；没改动不保存
  $('request-timeout').addEventListener('change', () => {
    const input = $('request-timeout');
    const value = input.value.trim();
    if (value === savedTimeout) return input.removeAttribute('error');
    if (!/^\d+$/.test(value)) {
      input.setAttribute('error', '请填写整数秒数');
      return;
    }
    saveRequestSettings({ timeoutSeconds: Number(value) }, { input });
  });
  $('request-retries').addEventListener('change', (event) => {
    saveRequestSettings({ retries: Number(event.detail.value) });
  });

  /* ---------- 切到本页时刷新 ---------- */

  window.addEventListener('yakit-tab', (event) => {
    if (event.detail.tab !== 'api') return;
    loadProfiles();
    loadPrompts();
    loadRequestSettings();
  });

  renderProfiles();
  renderPrompts();
  loadProfiles();
  loadPrompts();
  loadRequestSettings();
})();
