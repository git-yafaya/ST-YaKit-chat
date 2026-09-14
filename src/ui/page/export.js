/**
 * 「文本导出」页（只管界面，数据和导出都交给业务层）
 *
 * 布局（主次分明）：
 *   清洗预览（主要内容）→ 正则清洗（直接影响预览）→ 底部操作条（导出设置入口 + 导出按钮）
 *   楼层范围、消息类型、导出格式、文件名收在「导出设置」侧边抽屉里
 *
 * ───────── 界面需要的业务接口（由 Codex 在 YaKitChat 上提供，界面通过 parent.YaKitChat 调用）─────────
 *
 * settings 的形状（界面收集后原样传入）：
 *   {
 *     allFloors: boolean,            导出全部楼层
 *     start: string, end: string,    起止楼层（allFloors 为 false 时有效，可能为空字符串）
 *     types: { ai, user, system },   三种消息类型的开关
 *     format: 'txt' | 'md' | 'epub', 文件格式
 *     labels: 'with' | 'plain',      带类别标注 / 仅正文
 *     fileName: string,              文件名，空字符串表示用默认名
 *     mode: 'delete' | 'keep',       删除匹配 / 只保留匹配
 *     rules: string[],               正则规则，每条是用户原样输入的文字
 *   }
 *
 * 1. exportUI.getChatInfo() → { status: 'ok' | 'group' | 'none', floorCount: number }
 *      group = 群聊，none = 没打开聊天
 * 2. exportUI.previewMessages(settings, count) → [{ floor, type: 'ai'|'user'|'system', name, text }]
 *      按 settings 读取、过滤、清洗后，返回最后 count 条；可以是同步值或 Promise
 * 3. exportUI.isValidRule(source) → boolean
 *      这条规则能不能用；界面据此显示「这条规则无效，已忽略」
 * 4. exportUI.exportFile(settings) → { count: number }
 *      执行导出并触发下载；清洗后没有内容时 throw new Error('无内容')；可以是 Promise
 * 5. exportUI.onChatChanged(callback) → unsubscribe()
 *      酒馆里聊天切换或消息变化时调用 callback
 * 6. exportUI.loadSettings() → settings 或 null；exportUI.saveSettings(settings)
 *      记住用户的导出设置和规则
 *
 * 接口没提供时，界面显示「文本导出还没接入」，不报错。
 */
(() => {
  const PREVIEW_COUNT = 2;
  const $ = (id) => document.getElementById(id);

  const TYPE_LABELS = { ai: 'AI', user: '用户', system: '系统' };
  const FORMAT_LABELS = { txt: 'TXT', md: 'Markdown', epub: 'EPUB' };

  const service = () => parent.YaKitChat?.exportUI;
  const ready = () => Boolean(service());

  const defaults = {
    allFloors: true,
    start: '',
    end: '',
    types: { ai: true, user: true, system: true },
    format: 'txt',
    labels: 'with',
    fileName: '',
    mode: 'delete',
    rules: [],
  };

  function loadState() {
    try {
      const saved = service()?.loadSettings?.() || {};
      return { ...structuredClone(defaults), ...saved, types: { ...defaults.types, ...saved.types } };
    } catch {
      return structuredClone(defaults);
    }
  }

  const state = loadState();
  const save = () => {
    try {
      service()?.saveSettings?.(structuredClone(state));
    } catch (error) {
      console.warn('[纪实] 保存导出设置失败', error);
    }
  };

  const anyType = () => Object.values(state.types).some(Boolean);

  function chatInfo() {
    if (!ready()) return { status: 'unavailable', floorCount: 0 };
    try {
      return service().getChatInfo();
    } catch (error) {
      console.warn('[纪实] 读取聊天信息失败', error);
      return { status: 'none', floorCount: 0 };
    }
  }

  /* ---------- 预览 ---------- */

  const EMPTY_TEXT = {
    unavailable: '文本导出还没接入',
    group: '仅支持单人聊天',
    none: '先在酒馆里打开一个聊天',
  };

  function showEmpty(text) {
    const body = $('preview-body');
    body.innerHTML = '<div class="preview-empty"></div>';
    body.firstChild.textContent = text;
  }

  let previewToken = 0;
  async function renderPreview() {
    const info = chatInfo();
    $('export-go').toggleAttribute('disabled', info.status !== 'ok' || !anyType());
    $('preview-count').textContent = '';

    if (info.status !== 'ok') {
      showEmpty(EMPTY_TEXT[info.status] || EMPTY_TEXT.none);
      return;
    }

    const token = ++previewToken;
    let messages;
    try {
      messages = await service().previewMessages(structuredClone(state), PREVIEW_COUNT);
    } catch (error) {
      if (token === previewToken) showEmpty('预览加载失败');
      console.warn('[纪实] 预览失败', error);
      return;
    }
    if (token !== previewToken) return; // 期间设置又变了，丢掉旧结果

    if (!messages?.length) {
      showEmpty('（无可预览内容）');
      return;
    }
    const body = $('preview-body');
    body.replaceChildren(...messages.map((message) => {
      const item = document.createElement('article');
      item.className = 'preview-item';
      item.innerHTML = '<div class="preview-meta"></div><div class="preview-text"></div>';
      item.querySelector('.preview-meta').textContent = `第 ${message.floor} 楼 · ${TYPE_LABELS[message.type] || ''}${message.name ? ` · ${message.name}` : ''}`;
      const text = item.querySelector('.preview-text');
      text.textContent = message.text || '（清洗后为空）';
      text.classList.toggle('is-empty', !message.text);
      return item;
    }));
    body.scrollTop = body.scrollHeight;
  }

  let previewTimer = null;
  const schedulePreview = () => {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(renderPreview, 200);
  };

  /* ---------- 正则规则列表 ---------- */

  const ruleIsValid = (source) => {
    if (!source || !ready()) return true;
    try {
      return service().isValidRule(source) !== false;
    } catch {
      return true;
    }
  };

  function renderRules() {
    const list = $('rule-list');
    list.replaceChildren(...state.rules.map((rule, index) => {
      const row = document.createElement('div');
      row.className = 'rule-row';
      row.innerHTML = `
        <dsh-input size="sm" placeholder="例如 /<thinking>[\\s\\S]*?<\\/thinking>/g"></dsh-input>
        <dsh-button variant="ghost" size="sm" icon="../icons/trash.svg"></dsh-button>
      `;
      const input = row.querySelector('dsh-input');
      input.setAttribute('aria-label', `第 ${index + 1} 条规则`);
      input.value = rule;
      const check = () => {
        if (ruleIsValid(input.value)) input.removeAttribute('error');
        else input.setAttribute('error', '这条规则无效，已忽略');
      };
      check();
      input.addEventListener('input', () => {
        state.rules[index] = input.value;
        check();
        save();
        schedulePreview();
      });
      const remove = row.querySelector('dsh-button');
      remove.setAttribute('aria-label', `删除第 ${index + 1} 条规则`);
      remove.addEventListener('click', () => {
        state.rules.splice(index, 1);
        save();
        renderRules();
        renderPreview();
      });
      return row;
    }));
    $('rule-empty').hidden = state.rules.length > 0;
    $('rule-count').textContent = state.rules.length ? `${state.rules.length} 条规则` : '';
  }

  $('rule-add').addEventListener('click', () => {
    state.rules.push('');
    save();
    renderRules();
    const inputs = $('rule-list').querySelectorAll('dsh-input');
    inputs[inputs.length - 1]?.focus();
    $('rule-list').scrollTop = $('rule-list').scrollHeight;
  });

  $('rule-mode').value = state.mode;
  $('rule-mode').addEventListener('change', (event) => {
    state.mode = event.detail.value;
    save();
    renderPreview();
  });

  /* ---------- 导出设置抽屉 ---------- */

  function renderSummary() {
    const { floorCount } = chatInfo();
    const last = Math.max((floorCount || 0) - 1, 0);
    const range = state.allFloors ? '全部楼层' : `第 ${state.start || 0}–${state.end || last} 楼`;
    const types = anyType()
      ? Object.keys(TYPE_LABELS).filter((key) => state.types[key]).map((key) => TYPE_LABELS[key]).join('/')
      : '未选择消息类型';
    const format = `${FORMAT_LABELS[state.format]}${state.labels === 'with' ? ' 带标注' : ' 仅正文'}`;
    $('export-summary').textContent = `${range} · ${types} · ${format}`;
    $('floor-hint').textContent = floorCount ? `当前聊天共 ${floorCount} 条，楼层 0–${last}` : '当前聊天没有消息';
  }

  function changed() {
    $('type-warning').hidden = anyType();
    save();
    renderSummary();
    schedulePreview();
  }

  function bindSettings() {
    const all = $('opt-all-floors');
    all.checked = state.allFloors;
    $('floor-range').hidden = state.allFloors;
    all.addEventListener('change', (event) => {
      state.allFloors = event.detail.checked;
      $('floor-range').hidden = state.allFloors;
      changed();
    });

    [['opt-start', 'start'], ['opt-end', 'end']].forEach(([id, key]) => {
      const input = $(id);
      input.value = state[key];
      input.addEventListener('input', () => {
        state[key] = input.value;
        changed();
      });
    });

    Object.keys(TYPE_LABELS).forEach((key) => {
      const toggle = $(`opt-type-${key}`);
      toggle.checked = state.types[key];
      toggle.addEventListener('change', (event) => {
        state.types[key] = event.detail.checked;
        changed();
      });
    });

    $('opt-format').value = state.format;
    $('opt-format').addEventListener('change', (event) => {
      state.format = event.detail.value;
      changed();
    });
    $('opt-labels').value = state.labels;
    $('opt-labels').addEventListener('change', (event) => {
      state.labels = event.detail.value;
      changed();
    });

    $('opt-file-name').value = state.fileName;
    $('opt-file-name').addEventListener('input', (event) => {
      state.fileName = event.currentTarget.value;
      save();
    });

    $('export-settings').addEventListener('click', () => $('export-drawer').show());
    $('export-drawer-done').addEventListener('click', () => $('export-drawer').close());
  }

  /* ---------- 导出 ---------- */

  $('export-go').addEventListener('click', async () => {
    const button = $('export-go');
    if (!ready() || chatInfo().status !== 'ok' || !anyType()) return;
    button.setAttribute('loading', '');
    try {
      const result = await service().exportFile(structuredClone(state));
      DshToast.show(Number.isFinite(result?.count) ? `已导出 ${result.count} 条消息` : '已导出', 'success');
    } catch (error) {
      if (error?.message === '无内容') DshToast.show('没有可导出的内容', 'warning');
      else DshToast.show(error?.message || '导出失败', 'danger');
    } finally {
      button.removeAttribute('loading');
    }
  });

  /* ---------- 酒馆里聊天有变化时刷新 ---------- */

  function watchChat() {
    if (!ready() || typeof service().onChatChanged !== 'function') return;
    const unsubscribe = service().onChatChanged(() => {
      renderSummary();
      schedulePreview();
    });
    if (typeof unsubscribe === 'function') window.addEventListener('pagehide', unsubscribe);
  }

  bindSettings();
  renderRules();
  renderSummary();
  $('type-warning').hidden = anyType();
  renderPreview();
  watchChat();
})();
