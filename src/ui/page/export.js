/**
 * 「文本导出」页（只管界面，数据和导出都交给业务层）
 *
 * 布局（主次分明）：
 *   导出预览（主要内容）→ 正则匹配（直接影响预览）→ 底部操作条（导出设置入口 + 导出按钮）
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
 * 7. exportUI.scanRecentTags() → [{ label: string, rule: string }]，可以是 Promise
 *      扫描最近两层楼原文里的标签；label 是按钮上显示的文字，rule 是点击后加入规则列表的正则
 *      没提供这个函数时，界面不显示「识别到的标签」这一行
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
      text.classList.toggle('is-empty', !message.text);
      if (message.text) text.replaceChildren(...splitIntoChunks(message.text));
      else text.textContent = '（匹配后为空）';
      return item;
    }));
    body.scrollTop = body.scrollHeight;
    // 分段的高度在排版后才准确，下一帧再滚一次到底
    requestAnimationFrame(() => { body.scrollTop = body.scrollHeight; });
  }

  // 长消息切成多段（满 30 行或满 1500 字另起一段）；配合 CSS content-visibility，
  // 浏览器只排版滚动框里看得到的段落，换字体（如切到「跟随ST」）或刷新预览时不用把几万字全部重排
  const CHUNK_LINES = 30;
  const CHUNK_CHARS = 1500;
  function splitIntoChunks(text) {
    const chunks = [];
    let lines = [];
    let size = 0;
    const flush = () => {
      if (!lines.length) return;
      const chunk = document.createElement('div');
      chunk.className = 'preview-chunk';
      chunk.textContent = lines.join('\n');
      chunks.push(chunk);
      lines = [];
      size = 0;
    };
    text.split('\n').forEach((line) => {
      lines.push(line);
      size += line.length + 1;
      // 不在空行后面断开：段落末尾的空行显示不出来，会让两段之间的空行消失
      if (line && (lines.length >= CHUNK_LINES || size >= CHUNK_CHARS)) flush();
    });
    flush();
    return chunks;
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
        renderTagChips();
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
    renderTagChips();
  }

  /* ---------- 识别到的标签：点一下加对应规则，再点取消 ---------- */

  let scannedTags = [];

  function renderTagChips() {
    const row = $('tag-scan');
    const chips = $('tag-chips');
    const canScan = ready() && typeof service().scanRecentTags === 'function' && chatInfo().status === 'ok';
    row.hidden = !canScan;
    if (!canScan) return;

    if (!scannedTags.length) {
      chips.innerHTML = '<span class="tag-chips-empty">最近两层没有识别到标签</span>';
      updateTagToggle();
      return;
    }
    chips.replaceChildren(...scannedTags.map((tag) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'tag-chip';
      chip.textContent = tag.label;
      chip.title = tag.rule;
      chip.setAttribute('aria-pressed', String(state.rules.includes(tag.rule)));
      chip.addEventListener('click', () => toggleTagRule(tag.rule));
      return chip;
    }));
    updateTagToggle();
  }

  // 收起时只显示一行，放不下的数量写在「展开 +N」上；一行放得下时不显示按钮
  let tagsExpanded = false;
  function updateTagToggle() {
    const row = $('tag-scan');
    const toggle = $('tag-toggle');
    const items = [...$('tag-chips').querySelectorAll('.tag-chip')];
    const firstTop = items[0]?.offsetTop ?? 0;
    const hiddenCount = items.filter((item) => item.offsetTop > firstTop).length;
    row.classList.toggle('is-expanded', tagsExpanded);
    toggle.hidden = hiddenCount === 0;
    toggle.textContent = tagsExpanded ? '收起' : `展开 +${hiddenCount}`;
    toggle.setAttribute('aria-expanded', String(tagsExpanded));
    if (hiddenCount === 0 && tagsExpanded) {
      tagsExpanded = false;
      row.classList.remove('is-expanded');
    }
  }

  function setTagsExpanded(expanded) {
    tagsExpanded = expanded;
    updateTagToggle();
  }

  // 鼠标或手指点击时不抢焦点，避免出现焦点框；键盘操作不受影响
  $('tag-toggle').addEventListener('mousedown', (event) => event.preventDefault());
  $('tag-toggle').addEventListener('click', () => setTagsExpanded(!tagsExpanded));
  // 展开时点标签区外面、按 Esc 收起（点标签本身不收起，方便连续选）
  document.addEventListener('pointerdown', (event) => {
    if (tagsExpanded && !event.target.closest('.tag-scan')) setTagsExpanded(false);
  });
  document.addEventListener('keydown', (event) => {
    if (tagsExpanded && event.key === 'Escape') {
      event.stopPropagation();
      setTagsExpanded(false);
      $('tag-toggle').focus();
    }
  });
  // 宽度变了（窗口缩放、切页签回来）时重新计算藏了几个
  new ResizeObserver(() => updateTagToggle()).observe($('tag-chips'));

  function toggleTagRule(rule) {
    if (state.rules.includes(rule)) state.rules = state.rules.filter((item) => item !== rule);
    else state.rules.push(rule);
    save();
    renderRules();
    renderPreview();
  }

  let scanToken = 0;
  async function scanTags() {
    if (!ready() || typeof service().scanRecentTags !== 'function' || chatInfo().status !== 'ok') {
      scannedTags = [];
      renderTagChips();
      return;
    }
    const token = ++scanToken;
    try {
      const result = await service().scanRecentTags();
      if (token !== scanToken) return;
      scannedTags = Array.isArray(result) ? result.filter((tag) => tag?.label && tag?.rule) : [];
    } catch (error) {
      if (token !== scanToken) return;
      console.warn('[纪实] 扫描标签失败', error);
      scannedTags = [];
    }
    renderTagChips();
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

  // 导出设置抽屉里的小示例：让用户看懂「带类别标注 / 仅正文」的区别（只是示意，实际格式以导出结果为准）
  const FORMAT_EXAMPLES = {
    with: '用户：我们今天去海边吧。\n\nAI：好呀，我去准备泳衣！',
    plain: '我们今天去海边吧。\n\n好呀，我去准备泳衣！',
  };
  function renderFormatExample() {
    $('format-example-text').textContent = FORMAT_EXAMPLES[state.labels] || FORMAT_EXAMPLES.with;
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
    renderFormatExample();
    $('opt-labels').addEventListener('change', (event) => {
      state.labels = event.detail.value;
      renderFormatExample();
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
      scanTags();
    });
    if (typeof unsubscribe === 'function') window.addEventListener('pagehide', unsubscribe);
  }

  bindSettings();
  renderRules();
  renderSummary();
  $('type-warning').hidden = anyType();
  renderPreview();
  scanTags();
  watchChat();
})();
