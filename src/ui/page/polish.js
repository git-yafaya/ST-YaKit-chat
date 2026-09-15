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
 *     presetId: 'export' | 预设 id,  用哪套设置：'export' = 文本导出页当前设置；预设 id = 这套预设
 *                                    消息类型、匹配方式、正则规则、导出格式都取自它；「带类别标注 / 仅正文」不生效，润色导出只含正文
 *                                    包含隐藏的楼层始终跟随文本导出页当前设置（预设里不存这一项）
 *     chunkMode: 'fewer' | 'balanced' | 'quality' | 'custom',  每次发送：省次数 20 层 / 均衡 10 层 / 重质量 5 层 / 自定义，按楼层分，一层楼不拆开
 *     chunkFloors: number,           自定义时每次发送几层楼（用户自己填的正整数）
 *     fileName: string,              文件名，空字符串表示用默认名
 *     worldInfo: boolean,            携带世界书：按每次要润色的楼层扫描酒馆世界书，把激活的条目一起发送；不锁定，下次开始、继续或重做时生效
 *   }
 *
 * segment 的形状：
 *   { index, startFloor, endFloor, chars, original, polished: string | null,
 *     status: 'pending' | 'running' | 'done' | 'failed', error: string | null,
 *     resumeFloor: number | null, floors: floor[] }
 *   回复按楼层标记读取：被截断或中途停止时，已完整的楼层留在 polished 里，
 *   resumeFloor 是下次从哪一楼接着润色（这一段还没开始或已完成时为 null）
 *
 * floor 的形状（界面按楼层显示、选择、手动修改）：
 *   { floor, original, polished: string | null, status: 'pending' | 'running' | 'done',
 *     edited: boolean, short: boolean }
 *   edited = 用户手动改过；short = 润色后字数明显比原文少（只提醒，不自动重发）
 *   planSegments 返回的段也带 floors（polished 为 null）；没有 floors 时界面按整段显示
 *
 * job 的形状（一个聊天一份，业务层保存到酒馆服务器，刷新网页、关掉酒馆都不丢；关掉抽屉或弹窗、切页签都不影响）：
 *   { id, status: 'running' | 'review' | 'stopped' | 'finished', chatName, isCurrentChat: boolean,
 *     stopReason: string | null, waitUntil: number | null,
 *     newFloors: { count, from, to } | null, segments: segment[] }
 *   newFloors = 聊天里在这份结果之后新增、且符合润色设置的楼层；没有时为 null
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
 *       设置不合法时 reject 中文原因，自定义楼层数不合法时 error.field = 'chunkFloors'
 *       段数就是预计的请求次数；省次数一次写不完会自动接着写，实际可能多几次
 *  6. polishUI.start(settings) → job      按设置分段，先只润色第 1 段，完成后 status 为 review；已有未在进行的任务时替换它
 *  7. polishUI.resume() → job             按顺序继续润色等待中和失败的段，有 resumeFloor 的从那一楼接着润色
 *  8. polishUI.retrySegment(index) → job  这一段整段重新润色（清掉原结果，任务不在进行时）
 *  9. polishUI.stop()                     停止；正在请求的那次作废，这一段已完整的楼层保留，回到等待中
 * 10. polishUI.clearJob()                 清空当前聊天的润色结果，连同已保存的一起删除（任务在进行时 reject）
 * 11. polishUI.getJob() → job | null；polishUI.onJobChange(callback) → unsubscribe()
 *       getJob 返回当前聊天已保存的结果（正在润色的是别的聊天时返回那份，isCurrentChat 为 false）；
 *       任务或任一段、任一楼状态变化，以及读到已保存的结果、切换聊天后，调用 callback(job)
 * 13. polishUI.editFloor(floor, text) → job        手动修改这一楼的润色结果并保存，不发请求；空内容 reject
 * 14. polishUI.estimateRedo(floors) → number       重新润色这些楼层预计要请求几次（同步）
 * 15. polishUI.redoFloors(floors) → job            只重新润色选中的楼层：连着的楼层一组，每组带前后楼衔接，
 *       尽量合成一次请求，超过每次发送字数才拆开；覆盖手动修改；任务不在进行时
 * 16. polishUI.appendNew() → job                   润色聊天里新增的楼层，接在已有结果后面（不先试第 1 段）
 * 12. polishUI.exportFile({ fileName }) → { count }  导出格式取自所选预设（导出时的最新值）；   按段落顺序导出润色后的文字（含手动修改）；还有没完成的段时 reject
 *
 * 函数失败时 reject Error，message 是给用户看的中文原因，界面直接显示。
 * 导出预设下拉框用 presets.list()，导出页当前设置用 window.YaKitExportPage.getState()；
 * 文风下拉框用 styles.list() / getActiveId() / activate()（和预设页的文风预设是同一个选择，不锁定，只影响之后的请求）。
 * 接口没提供时，界面显示「润色还没接入」，不报错。
 */
(() => {
  const $ = (id) => document.getElementById(id);
  const service = () => parent.YaKitChat?.polishUI;
  const ready = () => ['loadSettings', 'planSegments', 'start', 'getJob', 'onJobChange'].every((name) => typeof service()?.[name] === 'function');
  const exportPage = () => window.YaKitExportPage;

  const TYPE_LABELS = { ai: 'AI', user: '用户', system: '系统' };
  const FORMAT_LABELS = { txt: 'TXT', md: 'Markdown', epub: 'EPUB', jsonl: '酒馆聊天' };
  const MODE_LABELS = { delete: '删除匹配', keep: '只保留匹配' };
  const ALERT_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/></svg>';
  const WARNING_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4 2.8 19.5h18.4Z"/><path d="M12 10v4M12 17h.01"/></svg>';
  const CHUNK_LABELS = { fewer: '省次数', balanced: '均衡', quality: '重质量' };
  const CHECK_ICON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7"/></svg>';

  const defaults = {
    allFloors: true,
    start: '',
    end: '',
    presetId: 'export',
    chunkMode: 'balanced',
    chunkFloors: 10,
    fileName: '',
    worldInfo: false,
  };

  function loadState() {
    try {
      const saved = service()?.loadSettings?.() || {};
      return { ...structuredClone(defaults), ...saved };
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

  const TYPE_KEYS = ['ai', 'user', 'system'];
  // 所选预设的内容；'export' 时取文本导出页当前设置
  const presetContent = () => (state.presetId === 'export'
    ? exportPage()?.getState()
    : presetList.find((preset) => preset.id === state.presetId)?.content) || null;
  const presetName = () => (state.presetId === 'export'
    ? '导出页当前设置'
    : presetList.find((preset) => preset.id === state.presetId)?.name || '导出页当前设置');
  const anyType = () => {
    const types = presetContent()?.types;
    return !types || TYPE_KEYS.some((key) => types[key]);
  };
  const hasJob = () => Boolean(job);
  const running = () => job?.status === 'running';
  const formatNumber = (value) => Number(value || 0).toLocaleString('zh-CN');
  // 总字数随档位分段略有出入（段内楼层之间的换行也算字数），过万时按万字取一位小数，切换档位时不跳
  const formatTotal = (value) => (value >= 10000 ? `${(value / 10000).toFixed(1)} 万字` : `${formatNumber(value)} 字`);

  const save = () => {
    try {
      service()?.saveSettings?.(structuredClone(state));
    } catch (error) {
      // 字数填错由分段预览在输入框下方提示，不算报错
      if (error?.field !== 'chunkFloors') YaKitErrorLog.warn('保存润色设置失败', error);
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
  // 选中要重新润色的楼层；正在手动修改的楼层（刷新列表时不覆盖输入框）
  const selected = new Set();
  const editing = new Set();
  const canTouch = () => hasJob() && !running() && job.isCurrentChat !== false;

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
      <div class="polish-floors"></div>
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

    // 失败原因用危险提示框
    const error = segment.status === 'failed' ? (segment.error || '润色失败') : '';
    if (cache.error !== error) {
      const notice = row.querySelector('.notice');
      notice.hidden = !error;
      notice.querySelector('span').textContent = error;
      cache.error = error;
    }

    const box = row.querySelector('.polish-floors');
    const floors = Array.isArray(segment.floors) && segment.floors.length
      ? segment.floors
      : [{ floor: null, original: segment.original, polished: segment.polished, status: segment.status === 'done' ? 'done' : 'pending' }];
    const floorKey = floors.map((item) => item.floor).join(',');
    if (cache.floorKey !== floorKey) {
      cache.floors = new Map();
      box.replaceChildren(...floors.map((item) => {
        const entry = createFloor(item);
        cache.floors.set(item.floor, entry);
        return entry.el;
      }));
      cache.floorKey = floorKey;
    }
    floors.forEach((item) => updateFloor(cache.floors.get(item.floor), item, segment));
  }

  /* ---------- 楼层：选择、手动修改、字数变少提醒 ---------- */

  function createFloor(item) {
    const el = document.createElement('div');
    el.className = 'polish-floor';
    el.innerHTML = `
      <div class="polish-floor-head">
        <button type="button" class="tag-chip polish-floor-chip" aria-pressed="false"></button>
        <span class="polish-floor-note"></span>
        <yakit-button class="polish-floor-edit" size="sm" variant="ghost" icon="../icons/edit.svg" hidden></yakit-button>
      </div>
      <div class="preview-text"></div>
      <div class="polish-floor-editor" hidden>
        <yakit-input multiline rows="6"></yakit-input>
        <div class="btn-row">
          <yakit-button size="sm" variant="ghost" data-act="cancel">取消</yakit-button>
          <yakit-button size="sm" variant="primary" data-act="save">保存</yakit-button>
        </div>
      </div>
    `;
    const head = el.querySelector('.polish-floor-head');
    head.hidden = item.floor === null;
    if (item.floor === null) return { el, cache: {} };

    const chip = el.querySelector('.polish-floor-chip');
    chip.textContent = `第 ${item.floor} 楼`;
    chip.setAttribute('aria-label', `选中第 ${item.floor} 楼`);
    // 鼠标或手指点击时不抢焦点，避免出现焦点框
    chip.addEventListener('mousedown', (event) => event.preventDefault());
    chip.addEventListener('click', () => {
      if (!canTouch()) return;
      if (selected.has(item.floor)) selected.delete(item.floor);
      else selected.add(item.floor);
      renderAll();
    });

    const editButton = el.querySelector('.polish-floor-edit');
    editButton.setAttribute('aria-label', `修改第 ${item.floor} 楼`);
    editButton.addEventListener('click', () => openEditor(el, item.floor));
    el.querySelector('[data-act="cancel"]').addEventListener('click', () => closeEditor(el, item.floor));
    el.querySelector('[data-act="save"]').addEventListener('click', (event) => saveEditor(el, item.floor, event.currentTarget));
    return { el, cache: {} };
  }

  function updateFloor(entry, item, segment) {
    if (!entry) return;
    const { el, cache } = entry;
    const showPolished = hasJob() && view === 'polished';
    const touch = canTouch() && item.floor !== null;

    if (item.floor !== null) {
      const chip = el.querySelector('.polish-floor-chip');
      const pressed = touch && selected.has(item.floor);
      chip.setAttribute('aria-pressed', String(pressed));
      chip.classList.toggle('is-static', !touch);
      chip.tabIndex = touch ? 0 : -1;

      // 行尾说明：重新润色中（主色转圈）/ 字数明显变少（提醒色图标 + 文字）/ 已手动修改（灰字）
      const redoing = hasJob() && item.status === 'running' && segment.status !== 'running';
      const note = redoing ? 'running' : (hasJob() && item.short ? 'short' : (hasJob() && item.edited ? 'edited' : ''));
      if (cache.note !== note) {
        const box = el.querySelector('.polish-floor-note');
        box.className = `polish-floor-note${note ? ` is-${note}` : ''}`;
        box.innerHTML = note === 'running' ? '<span class="polish-spinner" aria-hidden="true"></span><span>重新润色中</span>'
          : note === 'short' ? `${WARNING_ICON}<span>字数明显变少</span>`
            : note === 'edited' ? '<span>已手动修改</span>' : '';
        cache.note = note;
      }
      el.querySelector('.polish-floor-edit').hidden = !(touch && showPolished && item.polished) || editing.has(item.floor);
    }

    if (editing.has(item.floor)) return;
    const text = showPolished ? item.polished : item.original;
    const placeholder = showPolished && !item.polished
      ? (item.status === 'running' ? '（正在润色…）' : '（还没润色）')
      : (!text ? '（清洗后为空）' : '');
    const key = `${placeholder}|${text || ''}`;
    if (cache.text !== key) {
      const box = el.querySelector('.preview-text');
      box.classList.toggle('is-empty', Boolean(placeholder));
      if (placeholder) box.textContent = placeholder;
      else fillText(box, text);
      cache.text = key;
    }
  }

  function openEditor(el, floor) {
    const item = findFloor(floor);
    if (!item || !canTouch()) return;
    editing.add(floor);
    const input = el.querySelector('.polish-floor-editor yakit-input');
    input.setAttribute('aria-label', `第 ${floor} 楼润色后的文字`);
    input.value = item.polished || '';
    el.querySelector('.preview-text').hidden = true;
    el.querySelector('.polish-floor-editor').hidden = false;
    el.querySelector('.polish-floor-edit').hidden = true;
    input.focus();
  }

  function closeEditor(el, floor) {
    editing.delete(floor);
    el.querySelector('.polish-floor-editor').hidden = true;
    el.querySelector('.preview-text').hidden = false;
    renderAll();
  }

  async function saveEditor(el, floor, button) {
    const text = el.querySelector('.polish-floor-editor yakit-input').value;
    button.setAttribute('loading', '');
    try {
      job = await service().editFloor(floor, text);
      editing.delete(floor);
      el.querySelector('.polish-floor-editor').hidden = true;
      el.querySelector('.preview-text').hidden = false;
      renderAll();
      YaKitToast.show(`已保存第 ${floor} 楼`, 'success');
    } catch (error) {
      YaKitToast.show(error?.message || '保存失败', 'danger');
    } finally {
      button.removeAttribute('loading');
    }
  }

  const allFloors = () => (job?.segments || []).flatMap((segment) => segment.floors || []);
  const findFloor = (floor) => allFloors().find((item) => item.floor === floor);

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
      else if (!anyType()) empty = '所选预设没有勾选消息类型';
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

    // 聊天里有新楼层：提示并提供「润色新增部分」
    const fresh = job && !running() && job.isCurrentChat !== false ? job.newFloors : null;
    $('polish-new').hidden = !fresh?.count;
    if (fresh?.count) $('polish-new-text').textContent = `聊天里新增了 ${fresh.count} 层楼（第 ${fresh.from}–${fresh.to} 楼），可以接着润色。`;

    // 选中的楼层只在能操作时有效；不存在的楼层去掉
    if (!canTouch()) selected.clear();
    else {
      const exists = new Set(allFloors().map((item) => item.floor));
      [...selected].forEach((floor) => { if (!exists.has(floor)) selected.delete(floor); });
    }

    // 换了任务或重新分段时整体重建，否则只更新变化的部分，滚动位置不跳
    const key = job ? `job:${job.id}:${segments.length}` : `plan:${segments.map((s) => `${s.startFloor}-${s.endFloor}-${s.chars}`).join(',')}`;
    const list = $('polish-list');
    if (key !== listKey) {
      rows.clear();
      if (listKey.split(':')[1] !== key.split(':')[1]) editing.clear();
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

    // 选中了楼层：操作条换成「取消选择」+「重新润色选中的楼层」
    const selecting = selected.size > 0 && canTouch();
    $('polish-select-clear').hidden = !selecting;
    exportButton.hidden = selecting;
    if (selecting) {
      let requests = null;
      try { requests = service().estimateRedo?.([...selected].sort((a, b) => a - b)); } catch { requests = null; }
      text.textContent = `已选 ${selected.size} 层楼${Number.isFinite(requests) ? ` · 约 ${requests} 次请求` : ''}`;
      track.hidden = true;
      run.textContent = '重新润色选中的楼层';
      run.removeAttribute('disabled');
      primary(run, true);
      return;
    }

    if (!job) {
      const canStart = ready() && chatInfo().status === 'ok' && anyType() && plan.length > 0 && !planError;
      run.textContent = '开始润色';
      run.toggleAttribute('disabled', !canStart);
      primary(run, true);
      primary(exportButton, false);
      exportButton.setAttribute('disabled', '');
      track.hidden = true;
      const total = plan.reduce((sum, segment) => sum + (Number(segment.chars) || 0), 0);
      text.textContent = canStart ? `${formatTotal(total)} · 约 ${plan.length} 次请求${state.chunkMode === 'fewer' ? '起' : ''}，先润色第 1 段看效果` : '';
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
      const redoing = current ? 0 : allFloors().filter((item) => item.status === 'running').length;
      const doing = wait ? `接口限速，${wait} 秒后继续 · ` : (current ? `正在润色第 ${current.index + 1} 段 · ` : '');
      text.textContent = redoing && !wait
        ? `正在重新润色 ${redoing} 层楼`
        : `${doing}已完成 ${done} / ${segments.length} 段${failedText}`;
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
    const chunk = state.chunkMode === 'custom' ? `每次 ${state.chunkFloors || '—'} 层` : (CHUNK_LABELS[state.chunkMode] || CHUNK_LABELS.balanced);
    const format = FORMAT_LABELS[presetContent()?.format] || '';
    $('polish-summary').textContent = [presetName(), range, chunk, format].filter(Boolean).join(' · ');
    $('polish-floor-hint').textContent = floorCount ? `当前聊天共 ${floorCount} 条，楼层 0–${last}` : '当前聊天没有消息';
  }

  // 预设内容摘要：消息类型 · 规则 · 格式（· 不含隐藏）
  function contentSummary(content) {
    if (!content) return '';
    const types = TYPE_KEYS.filter((key) => content.types?.[key]).map((key) => TYPE_LABELS[key]).join('/') || '没有勾选消息类型';
    const count = (content.rules || []).filter(Boolean).length;
    const rules = count ? `${count} 条规则 · ${MODE_LABELS[content.mode] || MODE_LABELS.delete}` : '没有规则';
    const hidden = exportPage()?.getState()?.includeHidden === false ? ' · 不含隐藏' : '';
    return `${types} · ${rules} · ${FORMAT_LABELS[content.format] || 'TXT'}${hidden}`;
  }

  async function loadPresets() {
    try {
      presetList = (await parent.YaKitChat?.presets?.list?.()) || [];
    } catch (error) {
      presetList = [];
      YaKitErrorLog.warn('读取预设列表失败', error);
    }
    renderPresetSelect();
    renderSummary();
  }

  /* ---------- 文风：和预设页的文风预设共用「正在用的文风」 ---------- */

  const styleService = () => parent.YaKitChat?.styles;
  let styleList = [];
  let activeStyleId = null;

  async function loadStyles() {
    const api = styleService();
    const select = $('polish-style');
    // 业务没接上时照样显示这一行，下拉框不能选
    select.toggleAttribute('disabled', !api);
    if (!api) {
      select.replaceChildren(new Option('还没接入', ''));
      select.value = '';
      return;
    }
    try {
      const [list, id] = await Promise.all([api.list(), api.getActiveId()]);
      styleList = Array.isArray(list) ? list : [];
      activeStyleId = styleList.some((style) => style.id === id) ? id : null;
    } catch (error) {
      YaKitErrorLog.warn('读取文风预设失败', error);
      styleList = [];
      activeStyleId = null;
    }
    select.replaceChildren(new Option('不使用文风', ''), ...styleList.map((style) => new Option(style.name, style.id)));
    select.value = activeStyleId ?? '';
  }

  $('polish-style').addEventListener('change', async (event) => {
    const id = event.detail.value || null;
    try {
      await styleService().activate(id);
      const style = styleList.find((item) => item.id === id);
      YaKitToast.show(style ? `润色文风已切换到「${style.name}」` : '润色已设为不使用文风', 'success');
    } catch (error) {
      YaKitToast.show(error?.message || '切换文风失败', 'danger');
    }
    await loadStyles();
    renderContext();
    window.dispatchEvent(new CustomEvent('yakit-style-change'));
  });
  window.addEventListener('yakit-style-change', () => {
    loadStyles();
    renderContext();
  });

  function renderPresetSelect() {
    const select = $('polish-preset');
    const options = [new Option('导出页当前设置', 'export')];
    options[0].setAttribute('description', contentSummary(exportPage()?.getState()));
    presetList.forEach((preset) => {
      const option = new Option(preset.name, preset.id);
      option.setAttribute('description', contentSummary(preset.content));
      options.push(option);
    });
    select.replaceChildren(...options);
    // 选过的预设被删掉时显示为导出页当前设置
    select.value = presetList.some((preset) => preset.id === state.presetId) ? state.presetId : 'export';
    $('polish-preset-summary').textContent = contentSummary(presetContent());
  }

  // 有结果时锁住会改变分段的几项；格式和文件名随时能改
  function renderLock() {
    const locked = hasJob();
    document.querySelectorAll('#polish-drawer [data-lock]').forEach((control) => control.toggleAttribute('disabled', locked));
    document.querySelectorAll('#polish-drawer [data-lock-inert]').forEach((control) => control.toggleAttribute('inert', locked));
    $('polish-lock').hidden = !locked;
    $('polish-lock-note').innerHTML = running()
      ? '正在润色，只能改文件名。<br>停止后才能重置。'
      : '已有润色结果，只能改文件名、文风和本次任务。<br>要按新设置润色，先点「重置」。';
    $('polish-clear').toggleAttribute('disabled', running());
  }

  function syncControls() {
    $('polish-all-floors').checked = state.allFloors;
    $('polish-floor-range').hidden = state.allFloors;
    $('polish-start').value = state.start;
    $('polish-end').value = state.end;
    $('polish-chunk-mode').value = state.chunkMode;
    $('polish-chunk-row').hidden = state.chunkMode !== 'custom';
    $('polish-chunk').value = String(state.chunkFloors ?? '');
    $('polish-file-name').value = state.fileName;
    $('polish-world-info').checked = state.worldInfo === true;
    renderPresetSelect();
  }

  function changed() {
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

    $('polish-preset').addEventListener('change', (event) => {
      state.presetId = event.detail.value;
      $('polish-preset-summary').textContent = contentSummary(presetContent());
      changed();
    });

    $('polish-chunk-mode').addEventListener('change', (event) => {
      state.chunkMode = event.detail.value;
      $('polish-chunk-row').hidden = state.chunkMode !== 'custom';
      changed();
    });

    // 自定义字数：输完离开输入框保存；是否合法由业务判断，出错提示显示在输入框下方
    $('polish-chunk').addEventListener('change', (event) => {
      const value = event.currentTarget.value.trim();
      state.chunkFloors = value === '' ? defaults.chunkFloors : Number(value);
      event.currentTarget.value = String(state.chunkFloors);
      changed();
    });

    $('polish-file-name').addEventListener('input', (event) => {
      state.fileName = event.currentTarget.value;
      save();
    });

    $('polish-world-info').addEventListener('change', (event) => {
      state.worldInfo = event.detail.checked;
      save();
    });

    $('polish-settings').addEventListener('click', () => {
      renderPresetSelect();
      loadStyles();
      renderLock();
      $('polish-drawer').show();
    });
    $('polish-drawer-done').addEventListener('click', () => $('polish-drawer').close());

    $('polish-clear').addEventListener('click', async () => {
      const done = (job?.segments || []).filter((segment) => segment.status === 'done').length;
      const ok = await YaKitModal.confirm({
        title: '重置润色？',
        message: done
          ? `已经润色好的 ${done} 段会连同保存的结果一起删除，不能找回。本次任务的补充要求和参考材料也会清空。`
          : '清空后按新设置重新分段。本次任务的补充要求和参考材料也会清空。',
        confirmText: '重置',
      });
      if (!ok) return;
      try {
        await service().clearJob();
        job = null;
        renderAll();
        notifyTask(true);
        schedulePlan(0);
        YaKitToast.show('已重置润色', 'success');
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
      if (error?.field === 'chunkFloors') {
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
    if (selected.size && canTouch()) {
      const floors = [...selected].sort((a, b) => a - b);
      const edited = floors.filter((floor) => findFloor(floor)?.edited).length;
      if (edited) {
        const ok = await YaKitModal.confirm({
          title: '重新润色选中的楼层？',
          message: `其中 ${edited} 层手动改过，重新润色会覆盖这些修改。`,
          confirmText: '重新润色',
        });
        if (!ok) return;
      }
      selected.clear();
      await call(button, () => service().redoFloors(floors), '重新润色失败');
      return;
    }
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
    const edited = (job?.segments?.[index]?.floors || []).filter((item) => item.edited).length;
    if (edited) {
      const ok = await YaKitModal.confirm({
        title: `重新润色第 ${index + 1} 段？`,
        message: `这一段有 ${edited} 层手动改过，整段重新润色会覆盖这些修改。`,
        confirmText: '重新润色',
      });
      if (!ok) return;
    }
    await call(button, () => service().retrySegment(index), '重新润色失败');
  }

  $('polish-select-clear').addEventListener('click', () => {
    selected.clear();
    renderAll();
  });

  $('polish-new-go').addEventListener('click', (event) => {
    call(event.currentTarget, () => service().appendNew(), '润色新增部分失败');
  });

  $('polish-view').addEventListener('change', (event) => {
    view = event.detail.value;
    renderList();
  });

  $('polish-export').addEventListener('click', async () => {
    const button = $('polish-export');
    if (!ready() || button.hasAttribute('disabled')) return;
    button.setAttribute('loading', '');
    try {
      const result = await service().exportFile({ fileName: state.fileName });
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

  // 通知「本次任务」一节：进行中不能编辑；reload = 结果被清空或换了聊天，要重新读取
  const notifyTask = (reload = false) => window.dispatchEvent(new CustomEvent('yakit-polish-job', { detail: { running: running(), reload } }));

  function onJob(next) {
    const wasRunning = running();
    job = next || null;
    renderAll();
    notifyTask();
    if (!job) schedulePlan(0);
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
        // 换了聊天就换成那个聊天保存的结果；没有结果时显示分段预览
        try { job = service().getJob() || null; } catch { /* 保留原结果 */ }
        renderAll();
        notifyTask(true);
        if (!job) schedulePlan();
      });
      if (typeof offChat === 'function') window.addEventListener('pagehide', offChat);
    }
  }

  // 切到润色页时刷新助手信息和规则来源（API 管理页、导出页、预设页可能改过）
  window.addEventListener('yakit-tab', (event) => {
    if (event.detail?.tab !== 'polish') return;
    renderContext();
    loadPresets();
    loadStyles();
    if (!job) schedulePlan(0);
  });
  window.addEventListener('yakit-export-change', () => {
    renderSummary();
    if (!job && state.presetId === 'export') schedulePlan(400);
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
  loadStyles();
  loadPlan();
  watch();
})();
