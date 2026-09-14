/**
 * <yakit-icon> 图标
 * 把 SVG 文件读进来直接画在页面上。不管图标原本画多大，线条粗细都保持一致。
 *
 * 用法：
 *   <yakit-icon src="../icons/theme/冷杉与海盐.svg" size="28"></yakit-icon>
 *
 * 可用属性：
 *   src    SVG 文件地址
 *   size   显示大小，单位像素，默认 24
 *   line   线条粗细，单位像素，默认 1.5
 *   fit    按图形实际占的范围重新居中、放满方框，一排图标看起来一样大（原图留白不同时用）
 */
(() => {
  if (customElements.get('yakit-icon')) return;

  // 每个图标只下载、解析一次，之后直接复制解析好的图形
  const cache = new Map();
  const load = (url) => {
    if (!cache.has(url)) {
      cache.set(url, fetch(url).then((res) => {
        if (!res.ok) throw new Error(`图标加载失败：${url}`);
        return res.text();
      }).then((text) => {
        const svg = new DOMParser().parseFromString(text, 'image/svg+xml').querySelector('svg');
        if (!svg) throw new Error(`图标不是 SVG：${url}`);
        svg.removeAttribute('width');
        svg.removeAttribute('height');
        svg.setAttribute('aria-hidden', 'true');
        svg.querySelector('title')?.remove();
        return svg;
      }));
    }
    return cache.get(url);
  };

  const styles = `
    :host {
      display: inline-block;
      width: var(--icon-size, 24px);
      height: var(--icon-size, 24px);
      line-height: 0;
      flex: none;
    }
    .holder { display: block; width: 100%; height: 100%; }
    svg { width: 100%; height: 100%; display: block; overflow: visible; }
    svg * { vector-effect: non-scaling-stroke; stroke-width: var(--icon-line, 1.5px); }
  `;

  class YaKitIcon extends HTMLElement {
    static observedAttributes = ['src', 'size', 'line', 'fit'];

    constructor() {
      super();
      this.root = this.attachShadow({ mode: 'open' });
      this.root.innerHTML = `<style>${styles}</style><span class="holder"></span>`;
    }

    attributeChangedCallback(name) {
      if (name === 'size') this.style.setProperty('--icon-size', `${Number(this.getAttribute('size')) || 24}px`);
      if (name === 'line') this.style.setProperty('--icon-line', `${Number(this.getAttribute('line')) || 1.5}px`);
      if (name === 'src' || name === 'fit') this.render();
    }

    async render() {
      const src = this.getAttribute('src');
      if (!src) return;
      const url = new URL(src, document.baseURI).href;
      try {
        const svg = await load(url);
        if (this.getAttribute('src') !== src) return; // 加载期间又换了图标
        const copy = document.importNode(svg, true);
        this.root.querySelector('.holder').replaceChildren(copy);
        if (this.hasAttribute('fit')) this.fitToShape(copy);
      } catch (error) {
        console.warn(error);
      }
    }
  }

  // 用图形的实际范围做成正方形画布，图形居中并放满；四周各留 2 个单位给线条
  YaKitIcon.prototype.fitToShape = function fitToShape(svg) {
    const apply = () => {
      let box;
      try {
        box = svg.getBBox();
      } catch {
        return;
      }
      if (!box.width || !box.height) {
        if (this.isConnected) requestAnimationFrame(apply);
        return;
      }
      const side = Math.max(box.width, box.height) + 4;
      const x = box.x + box.width / 2 - side / 2;
      const y = box.y + box.height / 2 - side / 2;
      svg.setAttribute('viewBox', `${x} ${y} ${side} ${side}`);
    };
    apply();
  };

  customElements.define('yakit-icon', YaKitIcon);
})();
