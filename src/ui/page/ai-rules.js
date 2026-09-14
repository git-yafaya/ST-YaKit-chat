/**
 * 文本导出页「AI 辅助」抽屉：用大白话描述要删掉或保留的内容，让 AI 生成正则规则，看过效果再加入规则列表
 * （只管界面，生成规则交给业务层）
 *
 * ───────── 界面需要的业务接口（由 Codex 在 YaKitChat.exportUI 上提供）─────────
 *
 * 1. exportUI.getAiContext() → { apiName, model, usingMainApi, jailbreakName }
 *      抽屉顶部显示正则助手正在用的接口和破限词；jailbreakName 为 null 表示不使用
 * 2. exportUI.suggestRules({ request, mode, rules }) → { rules: [{ rule, explanation }] }
 *      request 是用户的描述，mode 是当前匹配方式，rules 是现有规则；失败 reject 中文原因
 *
 * 候选规则是否有效用 exportUI.isValidRule 判断，效果预览用 exportUI.previewMessages（候选并入当前规则）。
 * 两个接口都提供时才显示「AI 辅助」按钮。
 */
(() => {
  const $ = (id) => document.getElementById(id);
  const service = () => parent.YaKitChat?.exportUI;
  const available = () => typeof service()?.suggestRules === 'function' && typeof service()?.getAiContext === 'function';
  const page = () => window.YaKitExportPage;

  const MODE_NOTES = {
    delete: '当前匹配方式：删除匹配。<br>生成的规则会删掉匹配到的内容。',
    keep: '当前匹配方式：只保留匹配。<br>生成的规则会只留下匹配到的内容。',
  };
  const CHAT_NOTES = { group: '仅支持单人聊天', none: '先在酒馆里打开一个聊天', unavailable: '文本导出还没接入' };
  const TYPE_LABELS = { ai: 'AI', user: '用户', system: '系统' };
  const ALERT_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/></svg>';

  let candidates = [];
  let token = 0;

  $('ai-open').hidden = !available();

  const isValid = (rule) => {
    try {
      return service().isValidRule(rule) !== false;
    } catch {
      return false;
    }
  };

  function showError(message) {
    $('ai-error').querySelector('span').textContent = message;
    $('ai-error').hidden = !message;
  }

  // 生成按钮：需求没填、不是单人聊天时不能点
  function syncGenerate() {
    const status = page()?.getChatStatus() || 'unavailable';
    const note = status === 'ok' ? '' : (CHAT_NOTES[status] || CHAT_NOTES.none);
    $('ai-chat-note').textContent = note;
    const busy = $('ai-generate').hasAttribute('loading');
    $('ai-generate').toggleAttribute('disabled', !busy && (Boolean(note) || !$('ai-request').value.trim()));
  }

  function clearResult() {
    candidates = [];
    $('ai-result').hidden = true;
    $('ai-generate').closest('.btn-row').hidden = false;
    $('ai-regenerate').hidden = true;
    $('ai-apply').hidden = true;
    $('ai-rules').replaceChildren();
    $('ai-preview').replaceChildren();
  }

  // 改了需求或关掉抽屉：正在等的结果作废
  function invalidate() {
    token += 1;
    $('ai-generate').removeAttribute('loading');
    $('ai-regenerate').removeAttribute('loading');
  }

  async function renderContext() {
    const el = $('ai-context');
    try {
      const info = await service().getAiContext();
      const api = info?.usingMainApi ? '主 API（跟随ST）' : (info?.apiName || '未命名配置');
      el.textContent = [
        `${api}${info?.model ? ` · ${info.model}` : ''}`,
        `破限词：${info?.jailbreakName || '不使用'}`,
      ].join(' ｜ ');
    } catch (error) {
      el.textContent = '读取当前接口失败';
      YaKitErrorLog.warn('读取 AI 接口信息失败', error);
    }
  }

  function open() {
    const state = page()?.getState();
    $('ai-mode-note').innerHTML = MODE_NOTES[state?.mode] || MODE_NOTES.delete;
    showError('');
    syncGenerate();
    renderContext();
    $('ai-drawer').show();
  }

  function renderCandidates() {
    const existing = page()?.getState().rules || [];
    $('ai-rules').replaceChildren(...candidates.map((item) => {
      const row = document.createElement('div');
      row.className = 'ai-rule';
      row.innerHTML = '<code></code><div class="ai-rule-note"></div>';
      row.querySelector('code').textContent = item.rule;
      row.querySelector('.ai-rule-note').textContent = item.explanation || '';
      if (!item.valid) {
        row.insertAdjacentHTML('beforeend', `<div class="ai-rule-invalid">${ALERT_ICON}<span>这条规则无效，已忽略</span></div>`);
      } else if (existing.includes(item.rule)) {
        row.insertAdjacentHTML('beforeend', '<div class="ai-rule-state">已经在规则列表里了</div>');
      }
      return row;
    }));
  }

  async function renderPreview(runToken) {
    const box = $('ai-preview');
    const state = page()?.getState();
    const valid = candidates.filter((item) => item.valid).map((item) => item.rule);
    if (!state || !valid.length) {
      box.innerHTML = '<div class="preview-empty">没有可用的规则</div>';
      return;
    }
    let messages;
    try {
      messages = await service().previewMessages({ ...state, rules: [...state.rules, ...valid] }, 2);
    } catch (error) {
      if (runToken !== token) return;
      box.innerHTML = '<div class="preview-empty">预览加载失败</div>';
      YaKitErrorLog.warn('AI 辅助预览失败', error);
      return;
    }
    if (runToken !== token) return;
    if (!messages?.length) {
      box.innerHTML = '<div class="preview-empty">（无可预览内容）</div>';
      return;
    }
    box.replaceChildren(...messages.map((message) => {
      const item = document.createElement('article');
      item.className = 'preview-item';
      item.innerHTML = '<div class="preview-meta"></div><div class="preview-text"></div>';
      item.querySelector('.preview-meta').textContent = `第 ${message.floor} 楼 · ${TYPE_LABELS[message.type] || ''}${message.name ? ` · ${message.name}` : ''}`;
      const text = item.querySelector('.preview-text');
      text.classList.toggle('is-empty', !message.text);
      text.textContent = message.text || '（匹配后为空）';
      return item;
    }));
  }

  async function generate(button) {
    const state = page()?.getState();
    const request = $('ai-request').value.trim();
    if (!state || !request || button.hasAttribute('loading')) return;
    const runToken = ++token;
    button.setAttribute('loading', '');
    showError('');
    try {
      const result = await service().suggestRules({ request, mode: state.mode, rules: [...state.rules] });
      if (runToken !== token) return;
      candidates = (Array.isArray(result?.rules) ? result.rules : [])
        .filter((item) => typeof item?.rule === 'string' && item.rule)
        .map((item) => ({ rule: item.rule, explanation: item.explanation || '', valid: isValid(item.rule) }));
      if (!candidates.length) {
        clearResult();
        showError('AI 没有给出规则，换个说法再试试');
        return;
      }
      $('ai-result').hidden = false;
      // 有结果后主操作换成底部的「添加到规则」，生成按钮收起，改用「重新生成」
      $('ai-generate').closest('.btn-row').hidden = true;
      $('ai-regenerate').hidden = false;
      $('ai-apply').hidden = false;
      $('ai-apply').toggleAttribute('disabled', !candidates.some((item) => item.valid));
      renderCandidates();
      await renderPreview(runToken);
    } catch (error) {
      if (runToken !== token) return;
      showError(error?.message || '生成规则失败');
      YaKitErrorLog.add({ message: error?.message || '生成规则失败', detail: error });
    } finally {
      if (runToken === token) button.removeAttribute('loading');
      syncGenerate();
    }
  }

  $('ai-open').addEventListener('click', open);
  $('ai-request').addEventListener('input', () => {
    invalidate();
    clearResult();
    showError('');
    syncGenerate();
  });
  $('ai-generate').addEventListener('click', (event) => generate(event.currentTarget));
  $('ai-regenerate').addEventListener('click', (event) => generate(event.currentTarget));
  $('ai-close').addEventListener('click', () => $('ai-drawer').close());
  $('ai-drawer').addEventListener('close', invalidate);

  $('ai-apply').addEventListener('click', () => {
    const valid = candidates.filter((item) => item.valid).map((item) => item.rule);
    const added = page()?.addRules(valid) || 0;
    if (added) {
      YaKitToast.show(`已添加 ${added} 条规则`, 'success');
      $('ai-drawer').close();
    } else {
      YaKitToast.show('这些规则已经在列表里了', 'warning');
    }
  });

  // 酒馆里切换聊天后，生成按钮是否可点跟着变
  if (typeof service()?.onChatChanged === 'function') {
    const unsubscribe = service().onChatChanged(() => {
      if ($('ai-drawer').open) syncGenerate();
    });
    if (typeof unsubscribe === 'function') window.addEventListener('pagehide', unsubscribe);
  }
})();
