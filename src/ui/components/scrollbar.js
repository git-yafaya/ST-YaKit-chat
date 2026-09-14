/**
 * 细滚动条（4px），平时隐藏，滚动时或鼠标移到这块区域上时出现
 *
 * 用法：
 *   页面：  DshScrollbar.install(document)        给整个页面加上细滚动条（只在插件自己的页面里用，不要装到酒馆页面上）
 *   组件：  样式里拼上 DshScrollbar.css，并在构造时调用 DshScrollbar.watch(shadowRoot)
 *
 * 滚动时给正在滚的元素加上 dsh-scrolling，停下约 1 秒后去掉。
 */
(() => {
  if (globalThis.DshScrollbar) return;

  const THUMB = 'color-mix(in srgb, var(--text-title, #14171A) 28%, transparent)';
  const THUMB_ACTIVE = 'color-mix(in srgb, var(--text-title, #14171A) 45%, transparent)';
  const HIDE_AFTER = 1000;

  const css = `
    *::-webkit-scrollbar { width: 4px; height: 4px; }
    *::-webkit-scrollbar-track,
    *::-webkit-scrollbar-corner { background: transparent; }
    *::-webkit-scrollbar-button { display: none; }
    *::-webkit-scrollbar-thumb { border-radius: 2px; background: transparent; }
    *:hover::-webkit-scrollbar-thumb,
    .dsh-scrolling::-webkit-scrollbar-thumb { background: ${THUMB}; }
    *::-webkit-scrollbar-thumb:hover,
    *::-webkit-scrollbar-thumb:active { background: ${THUMB_ACTIVE}; }

    /* 不支持上面写法的浏览器（如 Firefox）：用细款滚动条，同样平时透明 */
    @supports not selector(::-webkit-scrollbar) {
      * { scrollbar-width: thin; scrollbar-color: transparent transparent; }
      *:hover, .dsh-scrolling { scrollbar-color: ${THUMB} transparent; }
    }
  `;

  const timers = new WeakMap();

  function onScroll(event) {
    const el = event.target === document || event.target.nodeType === 9
      ? event.target.documentElement
      : event.target;
    if (!el?.classList) return;
    el.classList.add('dsh-scrolling');
    clearTimeout(timers.get(el));
    timers.set(el, setTimeout(() => el.classList.remove('dsh-scrolling'), HIDE_AFTER));
  }

  globalThis.DshScrollbar = {
    css,
    // 监听这棵树里所有滚动（滚动事件不冒泡，所以用捕获）
    watch(root) {
      root.addEventListener('scroll', onScroll, { capture: true, passive: true });
    },
    install(doc) {
      const style = doc.createElement('style');
      style.textContent = css;
      doc.head.append(style);
      this.watch(doc);
    },
  };
})();
