/**
 * 面板页面的公共逻辑：细滚动条、接收弹窗消息（换主题、切页签、导航栏位置）
 *
 * 收到消息后在 window 上派发事件，给各页脚本使用：
 *   dsh-theme  event.detail = { theme, selected, tavern }
 *   dsh-nav    event.detail = { mode, resolved }
 *   dsh-tab    event.detail = { tab }
 */
(() => {
  DshScrollbar.install(document);

  // 换主题；「跟随ST」时弹窗会带上从酒馆美化里取到的颜色和字体
  let tavernVars = [];
  function applyTheme({ theme, tavern }) {
    const root = document.documentElement;
    root.dataset.theme = theme;
    tavernVars.forEach((name) => root.style.removeProperty(name));
    root.style.removeProperty('--dsh-font');
    root.style.removeProperty('color-scheme');
    tavernVars = [];
    if (!tavern) return;

    Object.entries(tavern.vars).forEach(([name, value]) => root.style.setProperty(name, value));
    tavernVars = Object.keys(tavern.vars);
    root.style.setProperty('--dsh-font', tavern.font);
    root.style.colorScheme = tavern.scheme;
    loadFontImports(tavern.fontImports);
  }

  // 美化 CSS 里引入的字体，面板这边也加载一份
  function loadFontImports(hrefs = []) {
    hrefs.forEach((href) => {
      if (document.querySelector(`link[data-tavern-font="${CSS.escape(href)}"]`)) return;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.dataset.tavernFont = href;
      document.head.append(link);
    });
  }

  // 提前准备「跟随ST」的字体：加载字体样式表，并用一段看不见的文字让浏览器先把字体载入，
  // 真正切换主题时就不用临时处理，避免卡一下
  function preloadTavernFont({ font, fontImports }) {
    loadFontImports(fontImports);
    if (!font) return;
    const probe = document.createElement('span');
    probe.setAttribute('aria-hidden', 'true');
    probe.textContent = '纪实导出预览正则匹配设置 AaBb 0123';
    probe.style.cssText = `position:absolute;left:-9999px;top:0;visibility:hidden;font-family:${font};font-weight:600`;
    document.body.append(probe);
    document.fonts.ready.then(() => setTimeout(() => probe.remove(), 1000));
  }

  function showTab(tab) {
    // 切换页签时，收起开着的抽屉
    document.querySelectorAll('dsh-drawer').forEach((drawer) => drawer.close());
    document.querySelectorAll('[data-page]').forEach((page) => {
      page.hidden = page.dataset.page !== tab;
    });
  }

  function receive(data = {}) {
    if (data.type === 'dsh:theme') {
      applyTheme(data);
      window.dispatchEvent(new CustomEvent('dsh-theme', { detail: data }));
    }
    if (data.type === 'dsh:preload-font') preloadTavernFont(data);
    if (data.type === 'dsh:nav') {
      window.dispatchEvent(new CustomEvent('dsh-nav', { detail: data }));
    }
    if (data.type === 'dsh:tab') {
      showTab(data.tab);
      window.dispatchEvent(new CustomEvent('dsh-tab', { detail: data }));
    }
  }

  // 弹窗优先直接调用 dshReceive（同一帧更新）；也兼容 postMessage
  window.dshReceive = receive;
  window.addEventListener('message', (event) => {
    if (event.source !== parent) return;
    receive(event.data || {});
  });
})();
