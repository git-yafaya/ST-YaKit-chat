/**
 * 设置页「更新公告」（只管界面，读取公告文件交给业务层）
 *
 * 入口是设置页「更新」里「检查更新」上面的「更新公告」按钮，点开右侧抽屉，按版本从新到旧列出公告；
 * 有还没安装的新版本时，最上面先显示新版本的公告，标「还没更新」。
 * 更新后第一次打开纪实，自动打开抽屉显示这一版的公告，只弹一次（记在 localStorage 的 yakit-notice-seen）；
 * 第一次安装时不弹，直接记下当前版本。
 *
 * ───────── 界面需要的业务接口（由 Codex 在 YaKitChat.notice 上提供，界面通过 parent.YaKitChat 调用）─────────
 *
 * entry 的形状（仓库根目录 NOTICE.md 里一个「## v版本 · 日期」标题算一条）：
 *   { version: '0.6.0', date: '2026-09-20' | '', lines: [{ type: 'item' | 'text', text }] }
 *   item = 以「- 」开头的条目；text = 普通段落；text 里可以有 **加粗**，由界面显示成粗体
 *
 * 1. notice.listInstalled() → Promise<entry[]>   已安装的 NOTICE.md，按版本从新到旧；没有文件时返回 []
 * 2. notice.fetchNewer() → Promise<entry[]>      仓库里比已安装版本更新的公告，从新到旧；已是最新返回 []；
 *                                                读取失败 reject，message 是给用户看的中文原因
 * 当前版本号用 YaKitChat.version。没提供 notice 时不显示入口行，也不自动弹出。
 */
(() => {
  const $ = (id) => document.getElementById(id);
  const service = () => parent.YaKitChat?.notice;
  const available = () => typeof service()?.listInstalled === 'function';
  const current = parent.YaKitChat?.version || '';
  const SEEN_KEY = 'yakit-notice-seen';
  const ALERT_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/></svg>';

  const button = $('notice-open');
  button.hidden = !available();
  if (!available()) return;

  let installed = null;
  let newer = [];
  let newerError = '';
  let newerLoading = false;

  const readSeen = () => { try { return localStorage.getItem(SEEN_KEY); } catch { return null; } };
  const writeSeen = (value) => { try { localStorage.setItem(SEEN_KEY, value); } catch {} };

  // 只认 **加粗**，其余原样当文字显示
  function fillInline(el, text) {
    el.replaceChildren(...String(text).split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((part) => {
      if (!/^\*\*[^*]+\*\*$/.test(part)) return document.createTextNode(part);
      const strong = document.createElement('strong');
      strong.textContent = part.slice(2, -2);
      return strong;
    }));
  }

  function renderEntry(entry, tag) {
    const section = document.createElement('section');
    section.className = 'notice-entry';
    section.innerHTML = '<div class="notice-entry-head"><h3></h3><span class="notice-entry-date"></span></div>';
    section.querySelector('h3').textContent = `v${entry.version}`;
    section.querySelector('.notice-entry-date').textContent = entry.date || '';
    if (tag) {
      const pill = document.createElement('span');
      pill.className = 'notice-entry-tag';
      pill.textContent = tag;
      section.querySelector('.notice-entry-head').append(pill);
    }
    let list = null;
    (entry.lines || []).forEach((line) => {
      if (line.type === 'item') {
        if (!list) {
          list = document.createElement('ul');
          section.append(list);
        }
        const li = document.createElement('li');
        fillInline(li, line.text);
        list.append(li);
      } else {
        list = null;
        const p = document.createElement('p');
        fillInline(p, line.text);
        section.append(p);
      }
    });
    return section;
  }

  function render() {
    const box = $('notice-list');
    const nodes = [];
    if (newerLoading) {
      const note = document.createElement('p');
      note.className = 'field-note notice-loading';
      note.textContent = '正在读取新版本的公告…';
      nodes.push(note);
    }
    if (newerError) {
      const alert = document.createElement('div');
      alert.className = 'notice';
      alert.setAttribute('role', 'alert');
      alert.innerHTML = `${ALERT_ICON}<span></span>`;
      alert.querySelector('span').textContent = newerError;
      nodes.push(alert);
    }
    newer.forEach((entry) => nodes.push(renderEntry(entry, '还没更新')));
    (installed || []).forEach((entry) => nodes.push(renderEntry(entry, entry.version === current ? '当前版本' : '')));
    if (installed && !installed.length && !newer.length && !newerLoading) {
      const empty = document.createElement('p');
      empty.className = 'list-empty';
      empty.textContent = '还没有公告。';
      nodes.push(empty);
    }
    box.replaceChildren(...nodes);
  }

  async function loadInstalled() {
    try {
      installed = (await service().listInstalled()) || [];
    } catch (error) {
      installed = [];
      YaKitErrorLog.warn('读取更新公告失败', error);
    }
  }

  async function loadNewer() {
    if (typeof service().fetchNewer !== 'function') return;
    newerLoading = true;
    newerError = '';
    render();
    try {
      newer = (await service().fetchNewer()) || [];
    } catch (error) {
      newer = [];
      newerError = error?.message || '读取新版本的公告失败';
    } finally {
      newerLoading = false;
    }
    render();
  }

  async function open({ onlyInstalled = false } = {}) {
    if (!installed) await loadInstalled();
    render();
    $('notice-drawer').show();
    $('notice-list').scrollTop = 0;
    if (!onlyInstalled) loadNewer();
  }

  button.addEventListener('click', () => open());
  $('notice-drawer-done').addEventListener('click', () => $('notice-drawer').close());

  // 更新后第一次打开：这一版有公告就自动弹出一次；第一次安装不弹
  async function popAfterUpdate() {
    if (!current) return;
    const seen = readSeen();
    writeSeen(current);
    if (!seen || seen === current) return;
    await loadInstalled();
    if (!installed.some((entry) => entry.version === current)) return;
    open({ onlyInstalled: true });
  }
  // 弹窗打开后会发来页签消息，切页签时抽屉都会收起；等页签就位后再弹，没收到页签消息时 1.5 秒后弹
  let popped = false;
  const popOnce = () => {
    if (popped) return;
    popped = true;
    popAfterUpdate();
  };
  window.addEventListener('yakit-tab', () => setTimeout(popOnce, 0), { once: true });
  setTimeout(popOnce, 1500);
})();
