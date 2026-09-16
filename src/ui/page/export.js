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
 *     types: { ai, user, system },   三种消息类型的开关（隐藏的楼层按它原来的类型算）
 *     includeHidden: boolean,        包含在酒馆里隐藏过的楼层
 *     format: 'txt' | 'md' | 'epub' | 'jsonl', 文件格式；jsonl = 酒馆聊天文件，只保留当前显示的回复，其他字段原样保留，「带类别标注 / 仅正文」不生效
 *     labels: 'with' | 'plain',      带类别标注 / 仅正文
 *     illustrated: boolean,          插画小说：导出 EPUB 时带上柏宝绘、智绘姬生成的图片（只对 EPUB 生效，存进导出预设）
 *                                    loadSettings 返回的设置里没有这一项（且不是 null）时，界面认为还没接入：开关不能点，说明写「还没接入」
 *     fileName: string,              文件名，空字符串表示用默认名
 *     mode: 'delete' | 'keep' | 'replace',  界面正在看哪一组规则（删除组 / 保留组 / 替换组），三组始终同时生效
 *     replaceRules: [{ find, to }],  替换组：find 写法同其他规则，to 是替换成的文字（可为空，{{match}} 表示整段匹配）
 *                                    清洗顺序：保留组 → 替换组 → 删除组
 *     keepRules: string[],           保留组规则：有保留组规则时先只留下它们匹配到的内容，再在其中执行删除组（rules）
 *     rules: string[],               正则规则，每条是用户原样输入的文字
 *   }
 *
 * 1. exportUI.getChatInfo() → { status: 'ok' | 'none', floorCount: number }
 *      none = 没打开聊天
 * 2. exportUI.previewMessages(settings, count) → [{ floor, type: 'ai'|'user'|'system', name, text }]
 *      按 settings 读取、过滤、正则匹配后，返回最后 count 条；可以是同步值或 Promise
 * 3. exportUI.isValidRule(source) → boolean
 *      这条规则能不能用；界面据此显示「这条规则无效，已忽略」
 * 4. exportUI.exportFile(settings) → { count: number }
 *      执行导出并触发下载；匹配后没有内容时 throw new Error('无内容')；可以是 Promise
 * 5. exportUI.onChatChanged(callback) → unsubscribe()
 *      酒馆里聊天切换或消息变化时调用 callback
 * 6. exportUI.loadSettings() → settings 或 null；exportUI.saveSettings(settings)
 *      记住用户的导出设置和规则
 * 7. exportUI.scanTagTree({ start, end }) → { from, to, tags }（Promise）
 *      按指定楼层识别标签（含隐藏楼层），start / end 是界面楼层号（从 0 起算），不填就是全部楼层；
 *      填颠倒了自动交换，超出范围夹到首尾楼层，from / to 是实际识别的楼层
 *      tags 是嵌套结构：[{ name, label, count, floors, rule, innerRule, shellRules, children }]
 *      同名兄弟合并成一项，count 是出现次数，floors 是出现在多少层；
 *      shellRules 是「只删标签本身、正文留着」用的三条查找式（开、闭、自闭合），替换成空即可
 *      没提供这个函数时，不显示「标签」这一行
 *    exportUI.tagRules(name) → 同上单个节点，名字不合法时返回 null
 *      手动输入标签名时用，拿到和识别结果一样的三套规则
 *
 * 接口没提供时，界面显示「文本导出还没接入」，不报错。
 *
 * ───────── 给面板里其他页面脚本用（预设页 preset.js）─────────
 *   window.YaKitExportPage.getState()        当前导出设置（副本）
 *   window.YaKitExportPage.replaceState(s)   换成另一份导出设置并刷新界面（切换预设、从备份恢复后调用）
 *   window.YaKitExportPage.addRules(rules, group)  把规则追加到某一组（'delete' / 'keep'，默认当前在看的一组）并保存（已有的不重复加），返回实际加了几条
 *   window.YaKitExportPage.setStacked(count) 正在叠加几套预设；两套以上时规则列表只读（预设页切换时调用）
 *   window.YaKitExportPage.getChatStatus()   'ok' | 'none' | 'unavailable'
 *   window 事件 yakit-export-change          导出设置有任何改动时触发，event.detail 是改动后的设置副本
 */
(() => {
  const PREVIEW_COUNT = 2;
  const $ = (id) => document.getElementById(id);

  const TYPE_LABELS = { ai: 'AI', user: '用户', system: '系统' };
  const FORMAT_LABELS = { txt: 'TXT', md: 'Markdown', epub: 'EPUB', jsonl: '酒馆聊天' };

  const service = () => parent.YaKitChat?.exportUI;
  const ready = () => Boolean(service());

  const defaults = {
    allFloors: true,
    start: '',
    end: '',
    types: { ai: true, user: true, system: true },
    includeHidden: true,
    format: 'txt',
    labels: 'with',
    illustrated: false,
    fileName: '',
    mode: 'delete',
    rules: [],
    keepRules: [],
    replaceRules: [],
    tagPlan: [],
    tagScan: { start: '', end: '' },
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
  const notifyChange = () => {
    window.dispatchEvent(new CustomEvent('yakit-export-change', { detail: structuredClone(state) }));
  };
  const save = () => {
    try {
      service()?.saveSettings?.(structuredClone(state));
    } catch (error) {
      YaKitErrorLog.warn('保存导出设置失败', error);
    }
    notifyChange();
  };

  const anyType = () => Object.values(state.types).some(Boolean);

  // 叠加多套预设时规则是拼出来的，改哪一套都说不清，所以只看不改
  let stackedCount = 0;
  const isStacked = () => stackedCount > 1;

  function chatInfo() {
    if (!ready()) return { status: 'unavailable', floorCount: 0 };
    try {
      return service().getChatInfo();
    } catch (error) {
      YaKitErrorLog.warn('读取聊天信息失败', error);
      return { status: 'none', floorCount: 0 };
    }
  }

  /* ---------- 预览 ---------- */

  const EMPTY_TEXT = {
    unavailable: '文本导出还没接入',
    none: '先在酒馆里打开一个聊天',
  };

  function showEmpty(text) {
    const body = $('preview-body');
    body.innerHTML = '<div class="preview-empty"></div>';
    body.firstChild.textContent = text;
  }

  // 看第几楼：空着显示最近 2 条；填了楼号显示这一楼和它前一条（楼号从 0 开始，按当前设置筛选后的楼层）
  let previewFloor = null;
  const PREVIEW_SUBTITLE = '最近 2 条消息导出后的样子';

  let previewToken = 0;
  async function renderPreview() {
    const info = chatInfo();
    $('export-go').toggleAttribute('disabled', info.status !== 'ok' || !anyType());

    if (info.status !== 'ok') {
      showEmpty(EMPTY_TEXT[info.status] || EMPTY_TEXT.none);
      return;
    }

    // 放大查看开着时一起刷新全部楼层
    if ($('preview-drawer').open) renderFullPreview();
    const token = ++previewToken;
    let messages;
    try {
      if (previewFloor === null) {
        messages = await service().previewMessages(structuredClone(state), PREVIEW_COUNT);
      } else {
        const all = await service().previewMessages(structuredClone(state), Math.max(info.floorCount || 0, 0));
        messages = (all || []).filter((message) => message.floor <= previewFloor).slice(-PREVIEW_COUNT);
      }
    } catch (error) {
      if (token === previewToken) showEmpty('预览加载失败');
      YaKitErrorLog.warn('预览失败', error);
      return;
    }
    if (token !== previewToken) return; // 期间设置又变了，丢掉旧结果

    if (!messages?.length) {
      showEmpty(previewFloor === null ? '（无可预览内容）' : `第 ${previewFloor} 楼之前没有可预览的内容`);
      return;
    }
    const body = $('preview-body');
    body.replaceChildren(...messages.map(renderMessage));
    body.scrollTop = body.scrollHeight;
    // 分段的高度在排版后才准确，下一帧再滚一次到底
    requestAnimationFrame(() => { body.scrollTop = body.scrollHeight; });
  }

  function renderMessage(message) {
    const item = document.createElement('article');
    item.className = 'preview-item';
    item.innerHTML = '<div class="preview-meta"></div><div class="preview-text"></div>';
    item.querySelector('.preview-meta').textContent = `第 ${message.floor} 楼 · ${TYPE_LABELS[message.type] || ''}${message.name ? ` · ${message.name}` : ''}`;
    const text = item.querySelector('.preview-text');
    text.classList.toggle('is-empty', !message.text);
    if (message.text) text.replaceChildren(...splitIntoChunks(message.text));
    else text.textContent = '（匹配后为空）';
    return item;
  }

  // 放大查看：按当前设置显示全部楼层导出后的样子（楼层范围、消息类型、规则都生效）
  let fullToken = 0;
  async function renderFullPreview() {
    const box = $('preview-drawer-body');
    const note = $('preview-drawer-note');
    const info = chatInfo();
    if (info.status !== 'ok') {
      note.textContent = '';
      box.innerHTML = '<div class="preview-empty"></div>';
      box.firstChild.textContent = EMPTY_TEXT[info.status] || EMPTY_TEXT.none;
      return;
    }
    const token = ++fullToken;
    note.textContent = '正在生成全部楼层的预览…';
    let messages;
    try {
      messages = await service().previewMessages(structuredClone(state), Math.max(info.floorCount || 0, 0));
    } catch (error) {
      if (token !== fullToken) return;
      note.textContent = '';
      box.innerHTML = '<div class="preview-empty">预览加载失败</div>';
      YaKitErrorLog.warn('全部楼层预览失败', error);
      return;
    }
    if (token !== fullToken) return;
    if (!messages?.length) {
      note.textContent = '';
      box.innerHTML = '<div class="preview-empty">（无可预览内容）</div>';
      return;
    }
    // 分批显示：先放一批，滑到底部附近再接着放下一批，楼层很多时打开不卡
    box.replaceChildren();
    fullShown = 0;
    const total = messages.length;
    const appendBatch = () => {
      if (token !== fullToken || fullShown >= total) return;
      const next = messages.slice(fullShown, fullShown + FULL_BATCH);
      fullShown += next.length;
      box.append(...next.map(renderMessage));
      note.textContent = fullShown < total
        ? `按当前设置导出的全部内容，共 ${total} 条，已显示 ${fullShown} 条，往下滑继续加载`
        : `按当前设置导出的全部内容，共 ${total} 条`;
      box.append(sentinel);
      if (fullShown >= total) sentinel.remove();
    };
    fullObserver?.disconnect();
    fullObserver = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) appendBatch();
    }, { rootMargin: '600px 0px' });
    appendBatch();
    // 填了楼号：一直加载到这一楼，再滚到它
    if (previewFloor !== null) {
      const index = messages.findIndex((message) => message.floor >= previewFloor);
      if (index >= 0) {
        while (fullShown <= index) appendBatch();
        box.children[index]?.scrollIntoView({ block: 'start' });
      }
    }
    fullObserver.observe(sentinel);
  }
  const FULL_BATCH = 20;
  const sentinel = document.createElement('div');
  sentinel.className = 'preview-sentinel';
  sentinel.setAttribute('aria-hidden', 'true');
  let fullShown = 0;
  let fullObserver = null;

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

  // 当前正在看的那一组规则；mode 只决定看哪一组，三组都会生效
  const GROUP_KEYS = { delete: 'rules', keep: 'keepRules', replace: 'replaceRules' };
  const groupKey = (group = state.mode) => GROUP_KEYS[group] || GROUP_KEYS.delete;
  const groupRules = (group = state.mode) => {
    const key = groupKey(group);
    if (!Array.isArray(state[key])) state[key] = [];
    return state[key];
  };

  // 替换组：一行两个输入框，左边查找、右边替换成的文字
  function renderReplaceRules() {
    $('rule-list').replaceChildren(...groupRules('replace').map((rule, index) => {
      const row = document.createElement('div');
      row.className = 'rule-row is-replace';
      row.innerHTML = `
        <yakit-input size="sm" placeholder="查找，例如 /<status>[\\s\\S]*?<\\/status>/g"></yakit-input>
        <yakit-input size="sm" placeholder="替换成的文字，可留空"></yakit-input>
        <yakit-button variant="ghost" size="sm" icon="../icons/trash.svg"></yakit-button>
      `;
      const [find, to] = row.querySelectorAll('yakit-input');
      find.setAttribute('aria-label', `第 ${index + 1} 条替换规则的查找内容`);
      to.setAttribute('aria-label', `第 ${index + 1} 条替换规则替换成的文字`);
      find.value = rule.find ?? '';
      to.value = rule.to ?? '';
      const check = () => {
        if (!find.value.trim() || ruleIsValid(find.value)) find.removeAttribute('error');
        else find.setAttribute('error', '这条规则无效，已忽略');
      };
      check();
      find.addEventListener('input', () => {
        groupRules('replace')[index].find = find.value;
        check();
        save();
        renderModeCounts();
        renderPreview();
      });
      to.addEventListener('input', () => {
        groupRules('replace')[index].to = to.value;
        save();
        renderPreview();
      });
      const remove = row.querySelector('yakit-button');
      remove.setAttribute('aria-label', `删除第 ${index + 1} 条替换规则`);
      remove.addEventListener('click', () => {
        groupRules('replace').splice(index, 1);
        save();
        renderRules();
        renderPreview();
      });
      return row;
    }));
  }

  function renderRules() {
    const list = $('rule-list');
    const rules = groupRules();
    if (state.mode === 'replace') renderReplaceRules();
    else list.replaceChildren(...rules.map((rule, index) => {
      const row = document.createElement('div');
      row.className = 'rule-row';
      row.innerHTML = `
        <yakit-input size="sm" placeholder="例如 /<thinking>[\\s\\S]*?<\\/thinking>/g"></yakit-input>
        <yakit-button variant="ghost" size="sm" icon="../icons/trash.svg"></yakit-button>
      `;
      const input = row.querySelector('yakit-input');
      input.setAttribute('aria-label', `第 ${index + 1} 条规则`);
      input.value = rule;
      const check = () => {
        if (ruleIsValid(input.value)) input.removeAttribute('error');
        else input.setAttribute('error', '这条规则无效，已忽略');
      };
      check();
      input.addEventListener('input', () => {
        groupRules()[index] = input.value;
        check();
        save();
        schedulePreview();
      });
      const remove = row.querySelector('yakit-button');
      remove.setAttribute('aria-label', `删除第 ${index + 1} 条规则`);
      remove.addEventListener('click', () => {
        groupRules().splice(index, 1);
        save();
        renderRules();
        renderPreview();
      });
      return row;
    }));
    $('rule-empty').hidden = rules.length > 0;
    $('rule-empty').textContent = { keep: '还没有保留规则，保留全文。', replace: '还没有替换规则，正文照原样。' }[state.mode]
      || '还没有删除规则，导出原文。';
    applyStackedLock();
    $('rule-count').textContent = rules.length ? `${rules.length} 条规则` : '';
    renderModeCounts();
    renderTagEntry();
  }

  // 叠加时：输入框只读、删不掉、也不能加新规则，卡片上写清楚为什么
  function applyStackedLock() {
    const locked = isStacked();
    $('rule-card').classList.toggle('is-stacked', locked);
    $('stack-note').hidden = !locked;
    $('stack-note').textContent = locked ? `正在叠加 ${stackedCount} 套预设，规则只能看。要改就先只用一套。` : '';
    for (const input of $('rule-list').querySelectorAll('yakit-input')) {
      input.toggleAttribute('readonly', locked);
    }
    for (const button of $('rule-list').querySelectorAll('yakit-button')) {
      button.toggleAttribute('disabled', locked);
    }
    for (const id of ['rule-add', 'ai-open', 'tag-apply']) {
      $(id).toggleAttribute('disabled', locked);
    }
  }

  /* ---------- 卡片上的标签入口：写当前处理了几个标签，点开抽屉整理 ---------- */

  const canOpenTags = () => typeof service()?.scanTagTree === 'function';

  function renderTagEntry() {
    const row = $('tag-scan');
    row.hidden = !(ready() && canOpenTags() && chatInfo().status === 'ok');
    if (row.hidden) return;
    const count = state.tagPlan.length;
    $('tag-scan-state').textContent = count ? `已处理 ${count} 个` : '还没处理';
  }

  /* ---------- 标签抽屉：识别楼层 + 嵌套结构 + 每个标签怎么处理 ---------- */

  // 三种处理方式：只要这段（保留组）、删掉整块（替换成空行）、只删标签（壳替换成空）
  const TAG_ACTIONS = [
    { value: '', label: '不处理' },
    { value: 'keep', label: '只要这段' },
    { value: 'delete', label: '删掉整块' },
    { value: 'strip', label: '只删标签' },
  ];
  const ACTION_GROUP = { keep: '保留', delete: '替换', strip: '替换' };

  let tagTree = [];                  // 识别到的嵌套结构
  let manualTags = [];               // 手动输入加进来的标签，排在最前面
  let tagDraft = new Map();          // 抽屉里的草稿：标签名 → 处理方式
  const folded = new Set();          // 收起来的标签名
  let treeToken = 0;

  const flattenTree = (nodes, list = []) => {
    for (const node of nodes) {
      list.push(node);
      flattenTree(node.children || [], list);
    }
    return list;
  };

  // 找这个标签名对应的规则：先找识别结果，没有就现算一份
  function nodeFor(name) {
    const found = [...manualTags, ...flattenTree(tagTree)].find((node) => node.name === name);
    if (found) return found;
    try {
      return service()?.tagRules?.(name) || null;
    } catch (error) {
      YaKitErrorLog.warn('生成标签规则失败', error);
      return null;
    }
  }

  // 一个标签按选择的处理方式，会写进哪些规则
  function rulesFor(node, action) {
    if (!node) return {};
    if (action === 'keep') return { keep: [node.innerRule] };
    // 删掉整块换成空行，正文不会首尾粘在一起
    if (action === 'delete') return { replace: [{ find: node.rule, to: '\n\n' }] };
    if (action === 'strip') return { replace: (node.shellRules || []).map((find) => ({ find, to: '' })) };
    return {};
  }

  function renderTagTree() {
    const list = $('tag-tree');
    const rows = [];
    const walk = (nodes, depth) => {
      for (const node of nodes) {
        rows.push(tagRow(node, depth));
        if (!folded.has(node.name)) walk(node.children || [], depth + 1);
      }
    };
    walk(manualTags, 0);
    walk(tagTree, 0);
    list.replaceChildren(...rows);
    $('tag-tree-empty').hidden = rows.length > 0;
    renderTagPlanCount();
  }

  function tagRow(node, depth) {
    const row = document.createElement('div');
    row.className = 'tag-row';
    row.setAttribute('role', 'listitem');
    row.style.setProperty('--depth', String(depth));
    const hasChildren = (node.children || []).length > 0;

    if (hasChildren) {
      const fold = document.createElement('button');
      fold.type = 'button';
      fold.className = 'tag-row-fold';
      fold.setAttribute('aria-expanded', String(!folded.has(node.name)));
      fold.setAttribute('aria-label', `${folded.has(node.name) ? '展开' : '收起'} ${node.label} 里面的标签`);
      fold.addEventListener('mousedown', (event) => event.preventDefault());
      fold.addEventListener('click', () => {
        if (folded.has(node.name)) folded.delete(node.name);
        else folded.add(node.name);
        renderTagTree();
      });
      row.append(fold);
    } else {
      const space = document.createElement('span');
      space.className = 'tag-row-fold is-empty';
      row.append(space);
    }

    const name = document.createElement('span');
    name.className = 'tag-row-name';
    name.textContent = node.label;
    row.append(name);

    const meta = document.createElement('span');
    meta.className = 'tag-row-meta';
    meta.textContent = node.count
      ? `×${node.count}${node.floors > 1 ? ` · ${node.floors} 层` : ''}`
      : '自己加的';
    row.append(meta);

    const select = document.createElement('yakit-select');
    select.className = 'tag-row-action';
    select.setAttribute('size', 'sm');
    select.setAttribute('aria-label', `${node.label} 怎么处理`);
    select.innerHTML = TAG_ACTIONS.map((item) => `<option value="${item.value}">${item.label}</option>`).join('');
    select.setAttribute('value', tagDraft.get(node.name) || '');
    select.addEventListener('change', (event) => {
      const value = event.detail.value;
      if (value) tagDraft.set(node.name, value);
      else tagDraft.delete(node.name);
      // 同名标签在别处也显示同一个选择
      renderTagTree();
    });
    row.append(select);
    return row;
  }

  function renderTagPlanCount() {
    const counts = { 保留: 0, 替换: 0 };
    for (const action of tagDraft.values()) {
      const group = ACTION_GROUP[action];
      if (group) counts[group] += 1;
    }
    const parts = Object.entries(counts).filter(([, count]) => count).map(([group, count]) => `${group} ${count}`);
    $('tag-plan-count').textContent = parts.length ? `将写入：${parts.join(' · ')}` : '还没选怎么处理';
    $('tag-apply').toggleAttribute('disabled', false);
  }

  async function loadTagTree() {
    if (!canOpenTags()) return;
    const token = ++treeToken;
    const button = $('tag-rescan');
    button.setAttribute('loading', '');
    try {
      const result = await service().scanTagTree({ start: state.tagScan.start, end: state.tagScan.end });
      if (token !== treeToken) return;
      tagTree = Array.isArray(result?.tags) ? result.tags : [];
      // 识别结果里已有的标签，从「自己加的」里去掉，避免重复两行
      const known = new Set(flattenTree(tagTree).map((node) => node.name));
      manualTags = manualTags.filter((node) => !known.has(node.name));
    } catch (error) {
      if (token !== treeToken) return;
      YaKitErrorLog.warn('识别标签失败', error);
      tagTree = [];
      YaKitToast.show('识别标签失败', 'danger');
    } finally {
      if (token === treeToken) button.removeAttribute('loading');
    }
    renderTagTree();
  }

  function openTagDrawer() {
    tagDraft = new Map(state.tagPlan.map((item) => [item.name, item.action]));
    // 方案里选过、这次没识别到的标签，也要能看到和改
    const known = new Set([...manualTags, ...flattenTree(tagTree)].map((node) => node.name));
    for (const name of tagDraft.keys()) {
      if (known.has(name)) continue;
      const node = nodeFor(name);
      if (node) manualTags.push(node);
    }
    $('tag-from').value = state.tagScan.start;
    $('tag-to').value = state.tagScan.end;
    $('tag-drawer').show();
    renderTagTree();
    if (!tagTree.length) loadTagTree();
  }

  function applyTagPlan() {
    if (isStacked()) return;
    // 先撤掉上次由标签写进去的规则，手写的和 AI 加的不动
    for (const item of state.tagPlan) {
      const made = rulesFor(nodeFor(item.name), item.action);
      if (made.keep) state.keepRules = state.keepRules.filter((rule) => !made.keep.includes(rule));
      if (made.replace) {
        state.replaceRules = state.replaceRules
          .filter((rule) => !made.replace.some((item2) => item2.find === rule.find && item2.to === rule.to));
      }
    }
    // 再按这次选的写进去
    const plan = [...tagDraft].map(([name, action]) => ({ name, action }));
    for (const { name, action } of plan) {
      const made = rulesFor(nodeFor(name), action);
      for (const rule of made.keep || []) {
        if (!state.keepRules.includes(rule)) state.keepRules.push(rule);
      }
      for (const rule of made.replace || []) {
        if (!state.replaceRules.some((item) => item.find === rule.find && item.to === rule.to)) {
          state.replaceRules.push(rule);
        }
      }
    }
    state.tagPlan = plan;
    save();
    renderRules();
    renderPreview();
    renderTagEntry();
    $('tag-drawer').close();
    YaKitToast.show(plan.length ? `已按 ${plan.length} 个标签更新规则` : '已清掉标签生成的规则', 'success');
  }

  $('tag-open').addEventListener('click', () => openTagDrawer());
  $('tag-rescan').addEventListener('click', () => {
    state.tagScan = { start: $('tag-from').value.trim(), end: $('tag-to').value.trim() };
    save();
    loadTagTree();
  });
  $('tag-manual-add').addEventListener('click', () => {
    const input = $('tag-manual');
    const node = nodeFor(input.value.trim());
    if (!node) {
      input.setAttribute('error', '这个标签名不能用');
      return;
    }
    input.removeAttribute('error');
    input.value = '';
    const known = [...manualTags, ...flattenTree(tagTree)].some((item) => item.name === node.name);
    if (known) {
      YaKitToast.show(`${node.label} 已经在列表里`, 'warning');
      return;
    }
    manualTags.unshift(node);
    renderTagTree();
  });
  $('tag-manual').addEventListener('input', () => $('tag-manual').removeAttribute('error'));
  $('tag-apply').addEventListener('click', () => applyTagPlan());

  $('rule-add').addEventListener('click', () => {
    if (state.mode === 'replace') groupRules('replace').push({ find: '', to: '' });
    else groupRules().push('');
    save();
    renderRules();
    const inputs = $('rule-list').querySelectorAll('yakit-input');
    inputs[inputs.length - 1]?.focus();
    $('rule-list').scrollTop = $('rule-list').scrollHeight;
  });

  // 切换只换正在编辑的那一组，两组规则都保留、都生效
  $('rule-mode').addEventListener('change', (event) => {
    state.mode = event.detail.value;
    save();
    renderRules();
    renderSummary();
  });

  // 分段选择器上写各组条数
  function renderModeCounts() {
    const counts = {
      delete: groupRules('delete').filter(Boolean).length,
      keep: groupRules('keep').filter(Boolean).length,
      replace: groupRules('replace').filter((rule) => rule?.find).length,
    };
    $('rule-mode').querySelectorAll('option').forEach((option) => {
      const label = { keep: '只保留匹配', replace: '替换' }[option.value] || '删除匹配';
      option.textContent = counts[option.value] ? `${label} ${counts[option.value]}` : label;
    });
  }

  /* ---------- 导出设置抽屉 ---------- */

  function renderSummary() {
    const { floorCount } = chatInfo();
    const last = Math.max((floorCount || 0) - 1, 0);
    const range = state.allFloors ? '全部楼层' : `第 ${state.start || 0}–${state.end || last} 楼`;
    const types = anyType()
      ? Object.keys(TYPE_LABELS).filter((key) => state.types[key]).map((key) => TYPE_LABELS[key]).join('/')
      : '未选择消息类型';
    const format = state.format === 'jsonl' ? FORMAT_LABELS.jsonl : `${FORMAT_LABELS[state.format]}${state.labels === 'with' ? ' 带标注' : ' 仅正文'}`;
    $('export-summary').textContent = `${range} · ${types}${state.includeHidden === false ? '（不含隐藏）' : ''} · ${format}`;
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

  // 插画小说：只在 EPUB 时显示；业务还没接上这一项时不能点
  const illustratedReady = (() => {
    try {
      if (typeof service()?.loadSettings !== 'function') return false;
      const saved = service().loadSettings();
      return saved === null || Object.hasOwn(saved, 'illustrated');
    } catch {
      return false;
    }
  })();
  // 酒馆聊天文件不分「带类别标注 / 仅正文」，换成说明小字
  function syncFormatOptions() {
    const jsonl = state.format === 'jsonl';
    $('opt-labels').hidden = jsonl;
    $('format-example').hidden = jsonl;
    $('opt-jsonl-note').hidden = !jsonl;
  }

  function syncIllustrated() {
    const toggle = $('opt-illustrated');
    toggle.hidden = state.format !== 'epub';
    syncFormatOptions();
    toggle.checked = Boolean(state.illustrated);
    toggle.toggleAttribute('disabled', !illustratedReady);
    if (illustratedReady) toggle.removeAttribute('description');
    else toggle.setAttribute('description', '还没接入');
  }

  // 把 state 写回各个控件（初始化、换成另一份设置时用）
  function syncControls() {
    $('rule-mode').value = state.mode;
    $('opt-all-floors').checked = state.allFloors;
    $('floor-range').hidden = state.allFloors;
    $('opt-start').value = state.start;
    $('opt-end').value = state.end;
    Object.keys(TYPE_LABELS).forEach((key) => { $(`opt-type-${key}`).checked = state.types[key]; });
    $('opt-include-hidden').checked = state.includeHidden !== false;
    $('opt-format').value = state.format;
    $('opt-labels').value = state.labels;
    syncIllustrated();
    $('opt-file-name').value = state.fileName;
    $('type-warning').hidden = anyType();
    renderFormatExample();
  }

  function bindSettings() {
    const all = $('opt-all-floors');
    all.addEventListener('change', (event) => {
      state.allFloors = event.detail.checked;
      $('floor-range').hidden = state.allFloors;
      changed();
    });

    // 输完离开输入框时整理数字：超出范围收回到有效楼层，起止填反就对调，看到的就是实际导出的范围
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
      $('opt-start').value = start;
      $('opt-end').value = end;
      changed();
    };
    ['opt-start', 'opt-end'].forEach((id) => $(id).addEventListener('change', tidyRange));

    [['opt-start', 'start'], ['opt-end', 'end']].forEach(([id, key]) => {
      const input = $(id);
      input.addEventListener('input', () => {
        state[key] = input.value;
        changed();
      });
    });

    Object.keys(TYPE_LABELS).forEach((key) => {
      const toggle = $(`opt-type-${key}`);
      toggle.addEventListener('change', (event) => {
        state.types[key] = event.detail.checked;
        changed();
      });
    });

    $('opt-include-hidden').addEventListener('change', (event) => {
      state.includeHidden = event.detail.checked;
      changed();
    });

    $('opt-format').addEventListener('change', (event) => {
      state.format = event.detail.value;
      syncIllustrated();
      changed();
    });
    $('opt-labels').addEventListener('change', (event) => {
      state.labels = event.detail.value;
      renderFormatExample();
      changed();
    });

    $('opt-illustrated').addEventListener('change', (event) => {
      state.illustrated = event.detail.checked;
      changed();
    });

    $('opt-file-name').addEventListener('input', (event) => {
      state.fileName = event.currentTarget.value;
      save();
    });

    $('export-settings').addEventListener('click', () => $('export-drawer').show());
    $('preview-floor').addEventListener('change', (event) => {
      const input = event.currentTarget;
      const text = input.value.trim();
      const value = text === '' ? null : Math.trunc(Number(text));
      previewFloor = value === null || !Number.isFinite(value) ? null : Math.max(0, value);
      input.value = previewFloor === null ? '' : String(previewFloor);
      $('preview-card').setAttribute('subtitle', previewFloor === null ? PREVIEW_SUBTITLE : `第 ${previewFloor} 楼导出后的样子`);
      renderPreview();
    });
    $('preview-expand').addEventListener('click', () => {
      renderFullPreview();
      $('preview-drawer').show();
    });
    $('export-drawer-done').addEventListener('click', () => $('export-drawer').close());
  }

  /* ---------- 导出 ---------- */

  $('export-go').addEventListener('click', async () => {
    const button = $('export-go');
    if (!ready() || chatInfo().status !== 'ok' || !anyType()) return;
    button.setAttribute('loading', '');
    try {
      const result = await service().exportFile(structuredClone(state));
      YaKitToast.show(Number.isFinite(result?.count) ? `已导出 ${result.count} 条消息` : '已导出', 'success');
    } catch (error) {
      if (error?.message === '无内容') YaKitToast.show('没有可导出的内容', 'warning');
      else YaKitToast.show(error?.message || '导出失败', 'danger');
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
      renderTagEntry();
    });
    if (typeof unsubscribe === 'function') window.addEventListener('pagehide', unsubscribe);
  }

  window.YaKitExportPage = {
    getState: () => structuredClone(state),
    replaceState(next = {}) {
      Object.assign(state, structuredClone(defaults), next, { types: { ...defaults.types, ...next.types } });
      for (const key of ['rules', 'keepRules', 'replaceRules']) if (!Array.isArray(state[key])) state[key] = [];
      syncControls();
      renderRules();
      renderSummary();
      renderPreview();
      notifyChange();
    },
    addRules(rules = [], group = state.mode) {
      const key = groupKey(group === 'keep' ? 'keep' : 'delete');
      if (!Array.isArray(state[key])) state[key] = [];
      const fresh = [...new Set(rules)].filter((rule) => rule && !state[key].includes(rule));
      if (!fresh.length) return 0;
      state[key].push(...fresh);
      save();
      renderRules();
      renderPreview();
      return fresh.length;
    },
    setStacked(count = 0) {
      stackedCount = Number(count) || 0;
      applyStackedLock();
    },
    getChatStatus: () => chatInfo().status,
  };

  bindSettings();
  syncControls();
  renderRules();
  renderSummary();
  renderPreview();
  renderTagEntry();
  watchChat();
})();
