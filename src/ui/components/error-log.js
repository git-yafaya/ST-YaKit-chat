/**
 * 报错记录：把纪实出过的错存下来，设置页「报错记录」里查看、复制、清空
 *
 * 用法：
 *   YaKitErrorLog.warn('预览失败', error);                 在控制台输出，并记一条（来源按当前页签自动填）
 *   YaKitErrorLog.add({ message: '更新失败', detail: error, source: '设置' });
 *   YaKitErrorLog.list()     → [{ time, source, message, detail, count }]，最新的在前；和上一条完全一样时合并，count 记次数
 *   YaKitErrorLog.clear()
 *   YaKitErrorLog.format()   → 复制用的纯文字
 *   YaKitErrorLog.install(window, { source, filter })   记录这个窗口里没被处理的报错；filter(错误信息) 返回 true 才记
 *
 * 危险类型的提示消息（YaKitToast.show(文字, 'danger')）会自动记一条。
 * 记录存在 localStorage 的 yakit-error-log 里（弹窗和面板共用），最多 50 条，刷新网页后还在。
 * 变化时在当前窗口派发 yakit-error-log-change 事件；另一个窗口会收到浏览器的 storage 事件。
 */
(() => {
  if (globalThis.YaKitErrorLog) return;

  const KEY = 'yakit-error-log';
  const MAX = 50;
  const DETAIL_MAX = 800;
  const PAGE_LABELS = { export: '文本导出', polish: '润色', preset: '预设', api: 'API 管理', settings: '设置' };

  function read() {
    try {
      const list = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function write(list) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch {}
    globalThis.dispatchEvent?.(new Event('yakit-error-log-change'));
  }

  // 面板里按当前打开的页签填来源；弹窗里填「弹窗」
  function currentSource() {
    const page = globalThis.document?.querySelector?.('[data-page]:not([hidden])');
    return page ? (PAGE_LABELS[page.dataset.page] || '面板') : '弹窗';
  }

  function describe(detail) {
    if (detail == null || detail === '') return '';
    // 酒馆页面传过来的错误不是面板里的 Error，按「有 message」判断
    if (typeof detail === 'object' && typeof detail.message === 'string') {
      const text = [detail.message, detail.stack?.split('\n').slice(1, 6).join('\n')].filter(Boolean).join('\n');
      return text.slice(0, DETAIL_MAX);
    }
    if (typeof detail === 'string') return detail.slice(0, DETAIL_MAX);
    try {
      return JSON.stringify(detail).slice(0, DETAIL_MAX);
    } catch {
      return String(detail).slice(0, DETAIL_MAX);
    }
  }

  function add({ message, detail, source } = {}) {
    const text = String(message || '未知错误');
    let extra = describe(detail);
    // 详情第一行和原因一样时不重复写
    if (extra.split('\n')[0] === text) extra = extra.split('\n').slice(1).join('\n');
    const list = read();
    const entry = { time: Date.now(), source: source || currentSource(), message: text, detail: extra, count: 1 };
    const last = list[0];
    // 同一个错连续出现（比如每次打开设置页都检查更新失败）时合并成一条，只更新时间和次数
    if (last && last.source === entry.source && last.message === entry.message && last.detail === entry.detail) {
      last.time = entry.time;
      last.count = (last.count || 1) + 1;
    } else {
      list.unshift(entry);
    }
    write(list.slice(0, MAX));
  }

  function warn(message, error) {
    console.warn(`[纪实] ${message}`, error);
    add({ message, detail: error });
  }

  const pad = (n) => String(n).padStart(2, '0');
  function formatTime(time) {
    const date = new Date(time);
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  function format() {
    const version = globalThis.parent?.YaKitChat?.version || globalThis.YaKitChat?.version || '';
    const head = `纪实${version ? ` v${version}` : ''} 报错记录（${read().length} 条）\n${navigator.userAgent}`;
    const items = read().map((item) => [
      `[${formatTime(item.time)}] ${item.source} · ${item.message}${item.count > 1 ? `（${item.count} 次）` : ''}`,
      item.detail,
    ].filter(Boolean).join('\n'));
    return [head, ...items].join('\n\n');
  }

  function install(win, { source, filter = () => true } = {}) {
    win.addEventListener('error', (event) => {
      // 浏览器的布局提示（尺寸变化回调没在同一帧处理完），不影响使用，不记
      if (/^ResizeObserver loop/.test(event.message || '')) return;
      const info = `${event.filename || ''}\n${event.error?.stack || ''}`;
      if (!filter(info)) return;
      add({ message: event.message || '脚本出错', detail: event.error || info, source });
    });
    win.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      if (!filter(`${reason?.stack || ''}`)) return;
      add({ message: reason?.message || String(reason || '操作失败'), detail: reason, source });
    });
  }

  globalThis.YaKitErrorLog = { add, warn, list: read, clear: () => write([]), format, formatTime };
  globalThis.YaKitErrorLog.install = install;
})();
