/**
 * <embed-frame> 嵌入框组件
 * 把一个页面放进独立的 iframe 里显示，里外样式互不影响。
 *
 * 用法（先在页面里引入 components/themes.css 才有主题颜色）：
 *   <embed-frame src="panel/index.html" title="面板" fill no-toolbar></embed-frame>
 *
 * 可用属性：
 *   src          要显示的页面地址
 *   srcdoc       直接写一段 HTML 作为内容（和 src 二选一）
 *   title        顶部栏显示的名字
 *   height       固定高度，单位像素，默认 400
 *   fill         铺满外面的容器（放进弹窗时用，此时 height 不生效）
 *   auto-height  让高度跟着里面内容自动变化，里面的页面需要发消息报告自己的高度：
 *                  new ResizeObserver(() => parent.postMessage(
 *                    { type: 'embed-frame:height', height: document.body.getBoundingClientRect().height }, '*'
 *                  )).observe(document.body);
 *   no-toolbar   隐藏顶部栏
 *   sandbox      安全限制，默认只允许脚本、表单和弹窗
 *   timeout      超过多少毫秒还没加载完就显示失败，默认 15000
 *
 * 可调用的方法：
 *   reload()          重新加载
 *   showError(文字)   手动显示失败状态
 */

const DEFAULT_SANDBOX = 'allow-scripts allow-forms allow-popups';
const HEIGHT_MESSAGE = 'embed-frame:height';

const ALERT_ICON = (size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 7v6"/><path d="M12 17h.01"/></svg>`;

const styles = `
  /* 颜色全部来自 components/themes.css，这里只写没加载主题时的兜底值 */
  :host {
    display: block;
    color: var(--text-body, #24262A);
    font: 14px/1.5 system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  }

  .frame {
    border: var(--card-border, 1px solid #DFE2E5);
    border-radius: 10px;
    box-shadow: var(--card-shadow, none);
    overflow: hidden;
    background: var(--card-bg, #FFFFFF);
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 40px;
    padding: 0 8px 0 14px;
    border-bottom: 1px solid var(--divider, #DFE2E5);
  }
  :host([no-toolbar]) .toolbar { display: none; }

  .title {
    flex: 1;
    min-width: 0;
    color: var(--text-title, #14171A);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* 状态区：加载好了=点睛色指示灯；加载中=主色小转圈+说明文字；失败=危险色徽章（图标+文字） */
  .status { display: flex; align-items: center; gap: 6px; flex: none; font-size: 12px; }
  .status > * { display: none; }
  .status[data-state="loaded"] .light,
  .status[data-state="loading"] .busy,
  .status[data-state="error"] .badge { display: inline-flex; }

  .light {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--accent, #5B7FB0);
  }
  .busy { align-items: center; gap: 6px; color: var(--text-muted, #6E737A); }
  .busy .spinner { width: 10px; height: 10px; border-width: 2px; }
  .badge {
    align-items: center;
    gap: 4px;
    height: 20px;
    padding: 0 8px;
    border-radius: 4px;
    color: var(--danger, #B5433A);
    background: color-mix(in srgb, var(--danger, #B5433A) 12%, transparent);
    font-weight: 500;
  }

  button {
    font: inherit;
    font-size: 13px;
    color: var(--text-body, #24262A);
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    height: 28px;
    padding: 0 10px;
    cursor: pointer;
  }
  button:hover { background: var(--divider, #DFE2E5); }
  button:focus-visible { outline: 2px solid var(--primary, #46618A); outline-offset: 1px; }
  button[hidden] { display: none; }

  /* 主操作按钮用点睛色 */
  .btn-main {
    height: 32px;
    padding: 0 16px;
    font-weight: 500;
    color: var(--on-accent, #FFFFFF);
    background: var(--accent, #5B7FB0);
  }
  .btn-main:hover { background: var(--accent, #5B7FB0); filter: brightness(0.94); }

  :host([fill]) { height: 100%; }
  :host([fill]) .frame { height: 100%; display: flex; flex-direction: column; box-sizing: border-box; }
  :host([fill]) .body { flex: 1; min-height: 0; }

  .body {
    position: relative;
    transition: height 0.2s ease;
  }

  iframe {
    display: block;
    width: 100%;
    height: 100%;
    border: 0;
    background: var(--card-bg, #FFFFFF);
  }

  .overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    background: var(--card-bg, #FFFFFF);
    color: var(--text-muted, #6E737A);
    text-align: center;
    padding: 24px;
  }
  .overlay[hidden] { display: none; }

  /* 加载转圈属于"其余场合"，用主色 */
  .spinner {
    width: 24px; height: 24px;
    border: 3px solid var(--divider, #DFE2E5);
    border-top-color: var(--primary, #46618A);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    box-sizing: border-box;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* 失败提示框：危险色 + 图标 + 文字 */
  .alert {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    max-width: 360px;
    padding: 12px 14px;
    border-radius: 8px;
    text-align: left;
    color: var(--text-body, #24262A);
    background: color-mix(in srgb, var(--danger, #B5433A) 10%, var(--card-bg, #FFFFFF));
    border: 1px solid color-mix(in srgb, var(--danger, #B5433A) 35%, transparent);
  }
  .alert svg { flex: none; color: var(--danger, #B5433A); margin-top: 1px; }
  .alert-title { color: var(--danger, #B5433A); font-weight: 600; }
  .alert-text { color: var(--text-body, #24262A); font-size: 13px; }
`;

class EmbedFrame extends HTMLElement {
  static observedAttributes = ['src', 'srcdoc', 'title', 'height', 'sandbox'];

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>${styles}</style>
      <div class="frame" part="frame">
        <div class="toolbar" part="toolbar">
          <span class="title"></span>
          <span class="status" data-state="loading">
            <span class="light" title="已加载"></span>
            <span class="busy"><span class="spinner"></span>加载中</span>
            <span class="badge">${ALERT_ICON(12)}加载失败</span>
          </span>
          <button class="btn-reload" type="button" title="重新加载">刷新</button>
          <button class="btn-open" type="button" title="在新窗口打开">新窗口打开</button>
        </div>
        <div class="body">
          <iframe></iframe>
          <div class="overlay loading">
            <div class="spinner"></div>
            <div>加载中…</div>
          </div>
          <div class="overlay error" hidden>
            <div class="alert" role="alert">
              ${ALERT_ICON(18)}
              <div>
                <div class="alert-title">页面加载失败</div>
                <div class="alert-text"></div>
              </div>
            </div>
            <button class="btn-main retry" type="button">重试</button>
          </div>
        </div>
      </div>
    `;

    this.$ = (sel) => root.querySelector(sel);
    this.iframe = this.$('iframe');
    this.timer = null;

    this.iframe.addEventListener('load', () => this.setState('loaded'));
    this.$('.btn-reload').addEventListener('click', () => this.reload());
    this.$('.retry').addEventListener('click', () => this.reload());
    this.$('.btn-open').addEventListener('click', () => {
      const src = this.getAttribute('src');
      if (src) window.open(src, '_blank', 'noopener');
    });

    this.onMessage = (event) => {
      if (event.source !== this.iframe.contentWindow) return;
      if (!this.hasAttribute('auto-height')) return;
      const data = event.data;
      if (data && data.type === HEIGHT_MESSAGE && Number.isFinite(data.height)) {
        this.setHeight(Math.ceil(data.height));
      }
    };
  }

  connectedCallback() {
    window.addEventListener('message', this.onMessage);
    this.render();
  }

  disconnectedCallback() {
    window.removeEventListener('message', this.onMessage);
    clearTimeout(this.timer);
  }

  attributeChangedCallback() {
    if (this.isConnected) this.render();
  }

  render() {
    const src = this.getAttribute('src');
    const srcdoc = this.getAttribute('srcdoc');

    this.$('.title').textContent = this.getAttribute('title') || src || '嵌入内容';
    this.$('.btn-open').hidden = !src;
    this.iframe.title = this.getAttribute('title') || '嵌入内容';
    this.iframe.setAttribute('sandbox', this.getAttribute('sandbox') ?? DEFAULT_SANDBOX);
    this.setHeight(Number(this.getAttribute('height')) || 400);

    this.setState('loading');
    if (srcdoc != null) {
      this.iframe.removeAttribute('src');
      this.iframe.srcdoc = srcdoc;
    } else if (src) {
      this.iframe.removeAttribute('srcdoc');
      this.iframe.src = src;
    } else {
      this.showError('没有设置 src 或 srcdoc');
    }
  }

  reload() {
    this.render();
  }

  setHeight(px) {
    if (this.hasAttribute('fill')) return;
    this.$('.body').style.height = `${px}px`;
  }

  setState(state) {
    clearTimeout(this.timer);
    this.$('.status').dataset.state = state;
    this.$('.overlay.loading').hidden = state !== 'loading';
    this.$('.overlay.error').hidden = state !== 'error';

    if (state === 'loading') {
      const timeout = Number(this.getAttribute('timeout')) || 15000;
      this.timer = setTimeout(() => this.showError('等待太久，请检查网络或地址'), timeout);
    }
    this.dispatchEvent(new CustomEvent('statechange', { detail: { state } }));
  }

  showError(message = '') {
    this.$('.alert-text').textContent = message || '请稍后重试';
    this.setState('error');
  }
}

if (!customElements.get('embed-frame')) customElements.define('embed-frame', EmbedFrame);
