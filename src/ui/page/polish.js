/**
 * 「润色」页（只管界面，分段、请求 AI、导出都交给业务层）
 *
 * 布局（主次分明）：
 *   润色结果（主要内容：按段显示原文 / 润色后）→ 底部操作条（进度 + 开始 / 停止 + 导出）
 *   楼层范围、消息类型、清洗、每段字数、导出格式、文件名收在「润色设置」侧边抽屉里
 *
 * ───────── 界面需要的业务接口（由 Codex 在 YaKitChat.polishUI 上提供，界面通过 parent.YaKitChat 调用）─────────
 *
 * settings 的形状（界面收集后原样传入）：
 *   {
 *     allFloors: boolean,            润色全部楼层
 *     start: string, end: string,    起止楼层（allFloors 为 false 时有效，可能为空字符串）
 *     types: { ai, user, system },   三种消息类型的开关（隐藏的楼层按它原来的类型算）
 *     includeHidden: boolean,        包含在酒馆里隐藏过的楼层
 *     clean: boolean,                先按正则规则清洗
 *     cleanSource: 'export' | 预设 id，'export' = 导出页当前的规则和匹配方式；预设只取其中的规则和匹配方式
 *     chunkSize: number,             每段字数
 *     format: 'txt' | 'md' | 'epub', 导出文件格式
 *     fileName: string,              文件名，空字符串表示用默认名
 *   }
 *
 * segment 的形状：
 *   { index, startFloor, endFloor, chars, original, polished: string | null,
 *     status: 'pending' | 'running' | 'done' | 'failed', error: string | null,
 *     resumeFloor: number | null }
 *   回复按楼层标记读取：被截断或中途停止时，已完整的楼层留在 polished 里，
 *   resumeFloor 是下次从哪一楼接着润色（这一段还没开始或已完成时为 null）
 *
 * job 的形状（一次润色任务，存在业务层内存里，关掉抽屉或弹窗、切页签都不影响）：
 *   { id, status: 'running' | 'review' | 'stopped' | 'finished', chatName, isCurrentChat: boolean,
 *     stopReason: string | null, waitUntil: number | null, segments: segment[] }
 *   review    = 开始润色后只润色第 1 段，等用户看过效果点「继续润色」
 *   waitUntil = 接口限速时，等到这个时间（毫秒时间戳）再发下一次请求；不在等待时为 null
 *   stopReason = 自动停止的原因（如连续 2 段失败），用户点停止时为 null
 *
 *  1. polishUI.getChatInfo() → { status: 'ok' | 'none', floorCount }       同 exportUI.getChatInfo
 *  2. polishUI.onChatChanged(callback) → unsubscribe()
 *  3. polishUI.loadSettings() → settings 或 null；polishUI.saveSettings(settings)
 *  4. polishUI.getContext() → { apiName, model, usingMainApi, jailbreakName, styleName }（Promise）
 *       按润色助手解析出的实际接口和提示词；名字为 null 表示不使用
 *  5. polishUI.planSegments(settings) → segment[]（Promise，status 均为 pending、polished 为 null）
 *       按当前设置读取、过滤、清洗并分段，还没开始润色时给界面预览；没有内容返回 []
 *       设置不合法时 reject 中文原因，每段字数不合法时 error.field = 'chunkSize'
 *  6. polishUI.start(settings) → job      按设置分段，先只润色第 1 段，完成后 status 为 review；已有未在进行的任务时替换它
 *  7. polishUI.resume() → job             按顺序继续润色等待中和失败的段，有 resumeFloor 的从那一楼接着润色
 *  8. polishUI.retrySegment(index) → job  这一段整段重新润色（清掉原结果，任务不在进行时）
 *  9. polishUI.stop()                     停止；正在请求的那次作废，这一段已完整的楼层保留，回到等待中
 * 10. polishUI.clearJob()                 清空当前任务（任务在进行时 reject）
 * 11. polishUI.getJob() → job | null；polishUI.onJobChange(callback) → unsubscribe()
 *       任务或任一段状态变化时调用 callback(job)
 * 12. polishUI.exportFile({ format, fileName }) → { count }   按段落顺序导出润色后的文字；还有没完成的段时 reject
 *
 * 函数失败时 reject Error，message 是给用户看的中文原因，界面直接显示。
 * 清洗规则下拉框的预设列表用 presets.list()；导出页当前规则用 window.YaKitExportPage.getState()。
 * 接口没提供时，界面显示「润色还没接入」，不报错。
 */
(() => {
  const $ = (id) => document.getElementById(id);
  const service = () => parent.YaKitChat?.polishUI;
  const ready = () => ['loadSettings', 'planSegments', 'start', 'getJob', 'onJobChange'].every((name) => typeof service()?.[name] === 'function');
  const exportPage = () => window.YaKitExportPage;

  const TYPE_LABELS = { ai: 'AI', user: '用户', system: '系统' };
  const FORMAT_LABELS = { txt: 'TXT', md: 'Markdown', epub: 'EPUB' };
  const MODE_LABELS = { delete: '删除匹配', keep: '只保留匹配' };
  const ALERT_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/></svg>';
  const CHECK_ICON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7"/></svg>';

  const defaults = {
    allFloors: true,
    start: '',
    end: '',
    types: { ai: true, user: true, system: true },
    includeHidden: true,
    clean: true,
    cleanSource: 'export',
    chunkSize: 3000,
    format: 'txt',
    fileName: '',
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
  let job = null;
  let plan = [];
  let planError = '';
  let planLoading = false;
  let view = 'polished';
  let presetList = [];

  const anyType = () => Object.values(state.types).some(Boolean);
  const hasJob = () => Boolean(job);
  const running = () => job?.status === 'running';
  const formatNumber = (value) => Number(value || 0).toLocaleString('zh-CN');

  const save = () => {
    try {
      service()?.saveSettings?.(structuredClone(state));
    } catch (error) {
      YaKitErrorLog.warn('保存润色设置失败', error);
    }
  };

  function chatInfo() {
    if (!ready()) return { status: 'unavailable', floorCount: 0 };
    try {
      return service().getChatInfo?.() || { status: 'none', floorCount: 0 };
    } catch (error) {
      YaKitErrorLog.warn('读取聊天信息失败', error);
      return { status: 'none', floorCount: 0 };
    }
  }

  // 润色结束时提示一声：弹窗关着用酒馆自己的提示，弹窗开着但不在润色页时用面板提示
  function notify(text, type) {
    const windowOpen = frameElement?.getRootNode()?.host?.closest('dialog')?.open !== false;
    const host = parent.toastr;
    if (!windowOpen && host) {
      host[type === 'success' ? 'success' : 'warning'](text, '纪实');
    } else if (!windowOpen || document.querySelector('[data-page="polish"]').hidden) {
      YaKitToast.show(text, type);
    }
  }

  /* ---------- 列表上方：润色助手正在用的接口和文风提示词 ---------- */

  async function renderContext() {
    const el = $('polish-context');
    if (!ready() || typeof service().getContext !== 'function') {
      el.textContent = '';
      return;
    }
    try {
      const info = await service().getContext();
      const api = info?.usingMainApi ? '主 API（跟随ST）' : (info?.apiName || '未命名配置');
      el.textContent = [
        `润色助手：${api}${info?.model ? ` · ${info.model}` : ''}`,
        `文风：${info?.styleName || '不使用'}`,
      ].join(' ｜ ');
    } catch (error) {
      el.textContent = '读取润色助手失败';
      YaKitErrorLog.warn('读取润色助手信息失败', error);
    }
  }

  /* ---------- 段落列表 ---------- */

  // 长文字切成多段，配合 CSS content-visibility 只排版看得到的部分（同导出预览）
  const CHUNK_LINES = 30;
  const CHUNK_CHARS = 1500;
  function fillText(target, text) {
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
      if (line && (lines.length >= CHUNK_LINES || size >= CHUNK_CHARS)) flush();
    });
    flush();
    target.replaceChildren(...chunks);
  }

  function showEmpty(text) {
    const list = $('polish-list');
    list.innerHTML = '<div class="preview-empty"></div>';
    list.firstChild.textContent = text;
    rows.clear();
    listKey = '';
  }

  const STATE_TEXT = { pending: '等待中', running: '润色中', done: '已完成', failed: '失败' };
  const rows = new Map();
  let listKey = '';

  function createRow(segment) {
    const row = document.createElement('article');
    row.className = 'polish-seg';
    row.innerHTML = `
      <div class="polish-seg-head">
        <span class="polish-seg-meta"></span>
        <span class="polish-state"></span>
        <yakit-button size="sm" variant="ghost" hidden>重新润色</yakit-button>
      </div>
      <div class="notice" role="alert" hidden>${ALERT_ICON}<span></span></div>
      <div class="preview-text"></div>
    `;
    const retry = row.querySelector('yakit-button');
    retry.setAttribute('aria-label', `重新润色第 ${segment.index + 1} 段`);
    retry.addEventListener('click', () => retrySegment(segment.index, retry));
    return { row, cache: {} };
  }

  function updateRow(entry, segment) {
    const { row, cache } = entry;
    const meta = `第 ${segment.index + 1} 段 · 第 ${segment.startFloor}–${segment.endFloor} 楼 · ${formatNumber(segment.chars)} 字`;
    if (cache.meta !== meta) row.querySelector('.polish-seg-meta').textContent = cache.meta = meta;

    const status = hasJob() ? segment.status : '';
    const resumeKey = hasJob() && segment.status !== 'done' && Number.isFinite(segment.resumeFloor)
      ? `从第 ${segment.resumeFloor} 楼接着润色` : '';
    if (cache.status !== `${status}|${resumeKey}`) {
      const el = row.querySelector('.polish-state');
      el.className = `polish-state${status ? ` is-${status}` : ''}`;
      el.innerHTML = status === 'running' ? '<span class="polish-spinner" aria-hidden="true"></span><span></span>'
        : status === 'done' ? `${CHECK_ICON}<span></span>`
          : status === 'failed' ? `${ALERT_ICON}<span></span>` : '<span></span>';
      el.lastChild.textContent = [STATE_TEXT[status], resumeKey].filter(Boolean).join(' · ');
      cache.status = `${status}|${resumeKey}`;
    }

    row.querySelector('yakit-button').hidden = !hasJob() || running() || !['done', 'failed'].includes(segment.status);

    const error = segment.status === 'failed' ? (segment.error || '润色失败') : '';
    if (cache.error !== error) {
      const notice = row.querySelector('.notice');
      notice.hidden = !error;
      notice.querySelector('span').textContent = cache.error = error;
    }

    // 还没润色的段在「润色后」里显示灰字占位
    const showPolished = hasJob() && view === 'polished';
    const text = showPolished ? segment.polished : segment.original;
    const placeholder = showPolished && !segment.polished
      ? (segment.status === 'running' ? '（正在润色…）' : '（还没润色）')
      : (!text ? '（清洗后为空）' : '');
    const key = `${placeholder} ${text || ''}`;
    if (cache.text !== key) {
      const box = row.querySelector('.preview-text');
      box.classList.toggle('is-empty', Boolean(placeholder));
      if (placeholder) box.textContent = placeholder;
      else fillText(box, text);
      cache.text = key;
    }
  }

  function renderList() {
    const info = chatInfo();
    const toolbar = $('polish-toolbar');
    const notice = $('polish-chat-notice');

    if (!ready()) {
      toolbar.hidden = true;
      notice.hidden = true;
      showEmpty('润色还没接入');
      return;
    }

    const segments = job?.segments || plan;
    notice.hidden = !job || job.isCurrentChat !== false;
    if (job && job.isCurrentChat === false) {
      notice.querySelector('span').textContent = `这些结果来自聊天「${job.chatName || '未命名'}」，和当前打开的聊天不同。`;
    }

    if (!job) {
      let empty = '';
      if (info.status !== 'ok') empty = '先在酒馆里打开一个聊天';
      else if (!anyType()) empty = '请至少选择一种消息类型';
      else if (planError) empty = planError;
      else if (planLoading && !plan.length) empty = '正在分段…';
      else if (!plan.length) empty = '（没有可润色的内容）';
      if (empty) {
        toolbar.hidden = true;
        showEmpty(empty);
        return;
      }
    }

    toolbar.hidden = false;
    $('polish-view').hidden = !job;

    // 换了任务或重新分段时整体重建，否则只更新变化的部分，滚动位置不跳
    const key = job ? `job:${job.id}:${segments.length}` : `plan:${segments.map((s) => `${s.startFloor}-${s.endFloor}-${s.chars}`).join(',')}`;
    const list = $('polish-list');
    if (key !== listKey) {
      rows.clear();
      list.replaceChildren(...segments.map((segment) => {
        const entry = createRow(segment);
        rows.set(segment.index, entry);
        return entry.row;
      }));
      list.scrollTop = 0;
      listKey = key;
    }
    segments.forEach((segment) => {
      const entry = rows.get(segment.index);
      if (entry) updateRow(entry, segment);
    });
  }

  /* ---------- 底部操作条 ---------- */

  function renderBar() {
    const run = $('polish-run');
    const exportButton = $('polish-export');
    const text = $('polish-progress-text');
    const track = $('polish-progress-track');
    const segments = job?.segments || [];
    const done = segments.filter((segment) => segment.status === 'done').length;
    const failed = segments.filter((segment) => segment.status === 'failed').length;
    const allDone = hasJob() && segments.length > 0 && done === segments.length;

    run.setAttribute('icon', '../icons/sparkle.svg');
    const primary = (button, on) => (on ? button.setAttribute('variant', 'primary') : button.removeAttribute('variant'));

    if (!job) {
      const canStart = ready() && chatInfo().status === 'ok' && anyType() && plan.length > 0 && !planError;
      run.textContent = '开始润色';
      run.toggleAttribute('disabled', !canStart);
      primary(run, true);
      primary(exportButton, false);
      exportButton.setAttribute('disabled', '');
      track.hidden = true;
      const total = plan.reduce((sum, segment) => sum + (Number(segment.chars) || 0), 0);
      text.textContent = canStart ? `共 ${plan.length} 段 · ${formatNumber(total)} 字 · 约 ${plan.length} 次请求，先润色第 1 段看效果` : '';
      return;
    }

    track.hidden = false;
    const percent = segments.length ? Math.round((done / segments.length) * 100) : 0;
    $('polish-progress-fill').style.width = `${percent}%`;
    track.setAttribute('aria-valuenow', String(percent));

    const failedText = failed ? ` · 失败 ${failed} 段` : '';
    if (running()) {
      const current = segments.find((segment) => segment.status === 'running');
      const wait = waitSeconds();
      const doing = wait ? `接口限速，${wait} 秒后继续 · ` : (current ? `正在润色第 ${current.index + 1} 段 · ` : '');
      text.textContent = `${doing}已完成 ${done} / ${segments.length} 段${failedText}`;
      run.textContent = '停止';
      run.setAttribute('icon', '../icons/close.svg');
      run.removeAttribute('disabled');
      primary(run, false);
    } else if (allDone) {
      text.textContent = `已完成 ${done} / ${segments.length} 段`;
      run.textContent = '全部重新润色';
      run.removeAttribute('disabled');
      primary(run, false);
    } else if (job.status === 'review') {
      text.textContent = `第 1 段已润色好，看过效果再继续 · 还剩 ${segments.length - done} 段`;
      run.textContent = '继续润色';
      run.removeAttribute('disabled');
      primary(run, true);
    } else {
      text.textContent = `${job.status === 'stopped' ? '已停止 · ' : ''}已完成 ${done} / ${segments.length} 段${failedText}`;
      run.textContent = '继续润色';
      run.removeAttribute('disabled');
      primary(run, true);
    }
    primary(exportButton, allDone && !running());
    exportButton.toggleAttribute('disabled', !allDone || running());
  }

  // 限速等待倒计时：每秒刷新一次进度小字
  let waitTimer = null;
  function waitSeconds() {
    const left = job?.waitUntil ? Math.ceil((job.waitUntil - Date.now()) / 1000) : 0;
    clearTimeout(waitTimer);
    if (left > 0) waitTimer = setTimeout(renderBar, 1000);
    return Math.max(left, 0);
  }

  /* ---------- 润色设置抽屉 ---------- */

  function renderSummary() {
    const { floorCount } = chatInfo();
    const last = Math.max((floorCount || 0) - 1, 0);
    const range = state.allFloors ? '全部楼层' : `第 ${state.start || 0}–${state.end || last} 楼`;
    const types = anyType()
      ? Object.keys(TYPE_LABELS).filter((key) => state.types[key]).map((key) => TYPE_LABELS[key]).join('/')
      : '未选择消息类型';
    const clean = state.clean ? `清洗：${cleanSourceName()}` : '不清洗';
    $('polish-summary').textContent = `${range} · ${types}${state.includeHidden === false ? '（不含隐藏）' : ''} · ${clean} · 每段 ${state.chunkSize || '—'} 字 · ${FORMAT_LABELS[state.format]}`;
    $('polish-floor-hint').textContent = floorCount ? `当前聊天共 ${floorCount} 条，楼层 0–${last}` : '当前聊天没有消息';
  }

  const ruleSummary = (content) => {
    const count = (content?.rules || []).filter(Boolean).length;
    return count ? `${count} 条规则 · ${MODE_LABELS[content.mode] || MODE_LABELS.delete}` : '没有规则';
  };

  function cleanSourceName() {
    if (state.cleanSource === 'export') return '导出页当前规则';
    return presetList.find((preset) => preset.id === state.cleanSource)?.name || '导出页当前规则';
  }

  async function loadPresets() {
    try {
      presetList = (await parent.YaKitChat?.presets?.list?.()) || [];
    } catch (error) {
      presetList = [];
      YaKitErrorLog.warn('读取预设列表失败', error);
    }
    renderCleanSource();
    renderSummary();
  }

  function renderCleanSource() {
    const select = $('polish-clean-source');
    const options = [new Option('导出页当前规则', 'export')];
    options[0].setAttribute('description', ruleSummary(exportPage()?.getState()));
    presetList.forEach((preset) => {
      const option = new Option(preset.name, preset.id);
      option.setAttribute('description', ruleSummary(preset.content));
      options.push(option);
    });
    select.replaceChildren(...options);
    // 选过的预设被删掉时显示为导出页当前规则
    select.value = presetList.some((preset) => preset.id === state.cleanSource) ? state.cleanSource : 'export';
    $('polish-clean-row').hidden = !state.clean;
    $('polish-clean-note').hidden = !state.clean;
  }

  // 有结果时锁住会改变分段的几项；格式和文件名随时能改
  function renderLock() {
    const locked = hasJob();
    document.querySelectorAll('#polish-drawer [data-lock]').forEach((control) => control.toggleAttribute('disabled', locked));
    $('polish-lock').hidden = !locked;
    $('polish-lock-note').innerHTML = running()
      ? '正在润色，楼层、清洗和分段已锁住。<br>停止后才能清空结果。'
      : '已有润色结果，楼层、清洗和分段已锁住。<br>要按新设置润色，先清空结果。';
    $('polish-clear').toggleAttribute('disabled', running());
  }

  function syncControls() {
    $('polish-all-floors').checked = state.allFloors;
    $('polish-floor-range').hidden = state.allFloors;
    $('polish-start').value = state.start;
    $('polish-end').value = state.end;
    Object.keys(TYPE_LABELS).forEach((key) => { $(`polish-type-${key}`).checked = state.types[key]; });
    $('polish-include-hidden').checked = state.includeHidden !== false;
    $('polish-clean').checked = state.clean;
    $('polish-chunk').value = String(state.chunkSize ?? '');
    $('polish-format').value = state.format;
    $('polish-file-name').value = state.fileName;
    $('polish-type-warning').hidden = anyType();
    renderCleanSource();
  }

  function changed() {
    $('polish-type-warning').hidden = anyType();
    save();
    renderSummary();
    schedulePlan();
  }

  function bindSettings() {
    $('polish-all-floors').addEventListener('change', (event) => {
      state.allFloors = event.detail.checked;
      $('polish-floor-range').hidden = state.allFloors;
      changed();
    });

    // 输完离开输入框时整理数字：超出范围收回到有效楼层，起止填反就对调（同导出设置）
    const tidyRange = () => {
      const { floorCount } = chatInfo();
      const last = Math.max((floorCount || 0) - 1, 0);
      const clamp = (value) => (value === '' || !Number.isFinite(Number(value))
        ? value
        : String(Math.min(Math.max(Math.trunc(Number(value)), 0), last)));
      let start = clamp(state.start.trim());
      let end = clamp(state.end.trim());
      if (start !== '' && end !== '' && Number(start) > Number(end)) [start, end] = [end, start];
      if (start === state.start && end === state.end) return;
      state.start = start;
      state.end = end;
      $('polish-start').value = start;
      $('polish-end').value = end;
      changed();
    };
    [['polish-start', 'start'], ['polish-end', 'end']].forEach(([id, key]) => {
      $(id).addEventListener('input', (event) => {
        state[key] = event.currentTarget.value;
        changed();
      });
      $(id).addEventListener('change', tidyRange);
    });

    Object.keys(TYPE_LABELS).forEach((key) => {
      $(`polish-type-${key}`).addEventListener('change', (event) => {
        state.types[key] = event.detail.checked;
        changed();
      });
    });
    $('polish-include-hidden').addEventListener('change', (event) => {
      state.includeHidden = event.detail.checked;
      changed();
    });

    $('polish-clean').addEventListener('change', (event) => {
      state.clean = event.detail.checked;
      $('polish-clean-row').hidden = !state.clean;
      $('polish-clean-note').hidden = !state.clean;
      changed();
    });
    $('polish-clean-source').addEventListener('change', (event) => {
      state.cleanSource = event.detail.value;
      changed();
    });

    // 每段字数：输完离开输入框保存；是否合法由业务判断，出错提示显示在输入框下方
    $('polish-chunk').addEventListener('change', (event) => {
      const value = event.currentTarget.value.trim();
      state.chunkSize = value === '' ? defaults.chunkSize : Number(value);
      event.currentTarget.value = String(state.chunkSize);
      changed();
    });

    $('polish-format').addEventListener('change', (event) => {
      state.format = event.detail.value;
      save();
      renderSummary();
    });
    $('polish-file-name').addEventListener('input', (event) => {
      state.fileName = event.currentTarget.value;
      save();
    });

    $('polish-settings').addEventListener('click', () => {
      renderCleanSource();
      renderLock();
      $('polish-drawer').show();
    });
    $('polish-drawer-done').addEventListener('click', () => $('polish-drawer').close());

    $('polish-clear').addEventListener('click', async () => {
      const done = (job?.segments || []).filter((segment) => segment.status === 'done').length;
      const ok = await YaKitModal.confirm({
        title: '清空润色结果？',
        message: done ? `已经润色好的 ${done} 段会一起清空，不能找回。` : '清空后按新设置重新分段。',
        confirmText: '清空',
      });
      if (!ok) return;
      try {
        await service().clearJob();
        job = null;
        renderAll();
        schedulePlan(0);
        YaKitToast.show('已清空润色结果', 'success');
      } catch (error) {
        YaKitToast.show(error?.message || '清空失败', 'danger');
      }
    });
  }

  /* ---------- 分段预览（还没开始润色时） ---------- */

  let planTimer = null;
  let planToken = 0;
  function schedulePlan(delay = 200) {
    clearTimeout(planTimer);
    planTimer = setTimeout(loadPlan, delay);
  }

  async function loadPlan() {
    if (hasJob() || !ready()) return;
    const token = ++planToken;
    $('polish-chunk-error').hidden = true;
    if (chatInfo().status !== 'ok' || !anyType()) {
      plan = [];
      planError = '';
      renderAll();
      return;
    }
    planLoading = true;
    renderAll();
    try {
      const result = await service().planSegments(structuredClone(state));
      if (token !== planToken) return;
      plan = Array.isArray(result) ? result : [];
      planError = '';
    } catch (error) {
      if (token !== planToken) return;
      plan = [];
      planError = error?.message || '分段失败';
      if (error?.field === 'chunkSize') {
        // 输入框很窄，出错提示放在说明小字下面
        $('polish-chunk-error').querySelector('span').textContent = planError;
        $('polish-chunk-error').hidden = false;
      }
      else YaKitErrorLog.warn('润色分段失败', error);
    } finally {
      if (token === planToken) planLoading = false;
    }
    renderAll();
  }

  /* ---------- 开始 / 停止 / 继续 / 重新润色 ---------- */

  async function call(button, action, fallback) {
    button?.setAttribute('loading', '');
    try {
      const result = await action();
      if (result && typeof result === 'object' && 'segments' in result) job = result;
      renderAll();
    } catch (error) {
      YaKitToast.show(error?.message || fallback, 'danger');
    } finally {
      button?.removeAttribute('loading');
    }
  }

  $('polish-run').addEventListener('click', async () => {
    const button = $('polish-run');
    if (!ready() || button.hasAttribute('loading')) return;
    if (running()) {
      await call(button, () => service().stop(), '停止失败');
      YaKitToast.show('已停止润色', 'success');
      return;
    }
    if (!job) {
      await call(button, () => service().start(structuredClone(state)), '开始润色失败');
      view = 'polished';
      $('polish-view').value = view;
      renderAll();
      return;
    }
    const segments = job.segments || [];
    if (segments.length && segments.every((segment) => segment.status === 'done')) {
      const ok = await YaKitModal.confirm({
        title: '全部重新润色？',
        message: `${segments.length} 段都会重新发给润色助手，已有结果会被替换，会再消耗额度。`,
        confirmText: '重新润色',
      });
      if (!ok) return;
      await call(button, () => service().start(structuredClone(state)), '开始润色失败');
      return;
    }
    await call(button, () => service().resume(), '继续润色失败');
  });

  async function retrySegment(index, button) {
    await call(button, () => service().retrySegment(index), '重新润色失败');
  }

  $('polish-view').addEventListener('change', (event) => {
    view = event.detail.value;
    renderList();
  });

  $('polish-export').addEventListener('click', async () => {
    const button = $('polish-export');
    if (!ready() || button.hasAttribute('disabled')) return;
    button.setAttribute('loading', '');
    try {
      const result = await service().exportFile({ format: state.format, fileName: state.fileName });
      YaKitToast.show(Number.isFinite(result?.count) ? `已导出 ${result.count} 段润色结果` : '已导出', 'success');
    } catch (error) {
      YaKitToast.show(error?.message || '导出失败', 'danger');
    } finally {
      button.removeAttribute('loading');
    }
  });

  /* ---------- 任务变化、聊天变化 ---------- */

  function renderAll() {
    renderList();
    renderBar();
    if ($('polish-drawer').open) renderLock();
  }

  function onJob(next) {
    const wasRunning = running();
    job = next || null;
    renderAll();
    if (!wasRunning || running() || !job) return;
    const failed = job.segments.filter((segment) => segment.status === 'failed').length;
    if (job.stopReason) notify(`润色已停止：${job.stopReason}`, 'warning');
    else if (job.status === 'review') notify('第 1 段已润色好，打开润色页看看效果', 'success');
    else if (job.status === 'finished' && !failed) notify('润色完成，打开润色页导出', 'success');
    else if (job.status === 'finished') notify(`润色结束，有 ${failed} 段失败`, 'warning');
  }

  function watch() {
    if (!ready()) return;
    const offJob = service().onJobChange(onJob);
    if (typeof offJob === 'function') window.addEventListener('pagehide', offJob);
    if (typeof service().onChatChanged === 'function') {
      const offChat = service().onChatChanged(() => {
        renderSummary();
        if (job) {
          // 当前聊天变了，结果是否来自当前聊天由业务重新判断
          try { job = service().getJob() || null; } catch { /* 保留原结果 */ }
          renderAll();
        } else {
          schedulePlan();
        }
      });
      if (typeof offChat === 'function') window.addEventListener('pagehide', offChat);
    }
  }

  // 切到润色页时刷新助手信息和规则来源（API 管理页、导出页、预设页可能改过）
  window.addEventListener('yakit-tab', (event) => {
    if (event.detail?.tab !== 'polish') return;
    renderContext();
    loadPresets();
    if (!job && state.clean && state.cleanSource === 'export') schedulePlan(0);
  });
  window.addEventListener('yakit-export-change', () => {
    if (!job && state.clean && state.cleanSource === 'export') schedulePlan(400);
  });

  try {
    job = ready() ? service().getJob() || null : null;
  } catch (error) {
    YaKitErrorLog.warn('读取润色任务失败', error);
  }
  bindSettings();
  syncControls();
  renderSummary();
  renderAll();
  renderContext();
  loadPresets();
  loadPlan();
  watch();
})();
