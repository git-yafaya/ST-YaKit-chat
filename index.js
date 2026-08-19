const EXTENSION_ID = 'st-chat-exporter';
const WAND_BUTTON_ID = 'st_chat_exporter_wand_button';

let initialized = false;

function getContext() {
    return SillyTavern.getContext();
}

function cloneChat(chat) {
    if (typeof structuredClone === 'function') {
        return structuredClone(chat);
    }
    return JSON.parse(JSON.stringify(chat));
}

function normalizeMessage(message, index) {
    const text = typeof message?.mes === 'string' ? message.mes : '';

    let role = 'assistant';
    if (message?.is_user) {
        role = 'user';
    } else if (message?.is_system) {
        role = 'system';
    }

    return {
        index,
        role,
        name: typeof message?.name === 'string' ? message.name : '',
        text,
        raw: message,
    };
}

function readCurrentChat() {
    const context = getContext();
    const chat = Array.isArray(context.chat) ? cloneChat(context.chat) : [];
    return chat.map(normalizeMessage);
}

function filterMessages(messages, options) {
    return messages.filter((message) => {
        if (message.role === 'user' && !options.includeUser) return false;
        if (message.role === 'assistant' && !options.includeAssistant) return false;
        if (message.role === 'system' && !options.includeSystem) return false;
        return true;
    });
}

function buildDocument(messages, options) {
    return messages
        .map((message) => {
            const body = message.text.trim();

            if (!body) return '';

            if (options.keepSenderName && message.name) {
                return `${message.name}：\n${body}`;
            }

            return body;
        })
        .filter(Boolean)
        .join('\n\n');
}

function safeFilenamePart(value) {
    return String(value || '')
        .trim()
        .replace(/[\\/:*?"<>|]+/g, '_')
        .replace(/\s+/g, ' ')
        .slice(0, 80);
}

function getDefaultFilename(extension) {
    const context = getContext();

    const characterName =
        context?.name2 ||
        context?.characters?.[context.characterId]?.name ||
        'SillyTavern';

    const date = new Date();
    const stamp = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
    ].join('-');

    return `${safeFilenamePart(characterName)}-${stamp}.${extension}`;
}

function downloadText(filename, text, mimeType = 'text/plain;charset=utf-8') {
    const blob = new Blob(['\uFEFF', text], { type: mimeType });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function createExporterContent() {
    const root = document.createElement('div');
    root.className = 'stce-root';

    root.innerHTML = `
        <div class="stce-header">
            <div>
                <div class="stce-title">📖 正文导出器</div>
                <div class="stce-subtitle">当前阶段：读取聊天、预览与基础 TXT / Markdown 导出</div>
            </div>
            <div class="stce-count" id="stce_message_count">0 条消息</div>
        </div>

        <div class="stce-tabs" role="tablist">
            <button class="stce-tab is-active" data-tab="export">导出</button>
            <button class="stce-tab" data-tab="rules">清洗规则</button>
            <button class="stce-tab" data-tab="ai">AI 分析</button>
        </div>

        <section class="stce-panel is-active" data-panel="export">
            <div class="stce-grid">
                <label class="stce-option">
                    <input id="stce_include_user" type="checkbox" checked>
                    <span>用户消息</span>
                </label>

                <label class="stce-option">
                    <input id="stce_include_assistant" type="checkbox" checked>
                    <span>AI 消息</span>
                </label>

                <label class="stce-option">
                    <input id="stce_include_system" type="checkbox">
                    <span>系统消息</span>
                </label>

                <label class="stce-option">
                    <input id="stce_keep_sender" type="checkbox">
                    <span>保留发送者名称</span>
                </label>
            </div>

            <div class="stce-section-title">
                <span>预览</span>
                <span class="stce-meta" id="stce_preview_meta">0 字</span>
            </div>

            <textarea
                id="stce_preview"
                class="stce-preview"
                spellcheck="false"
                readonly
                placeholder="当前聊天内容会显示在这里。"
            ></textarea>

            <div class="stce-actions">
                <button id="stce_refresh" class="menu_button">
                    <i class="fa-solid fa-rotate"></i>
                    刷新聊天
                </button>

                <div class="stce-action-spacer"></div>

                <button id="stce_export_txt" class="menu_button">
                    <i class="fa-solid fa-file-lines"></i>
                    导出 TXT
                </button>

                <button id="stce_export_md" class="menu_button">
                    <i class="fa-brands fa-markdown"></i>
                    导出 Markdown
                </button>
            </div>
        </section>

        <section class="stce-panel" data-panel="rules">
            <div class="stce-placeholder">
                <i class="fa-solid fa-filter"></i>
                <strong>清洗规则引擎</strong>
                <span>下一步实现：手动规则、AI 规则共存、排序、开关、测试与预设。</span>
            </div>
        </section>

        <section class="stce-panel" data-panel="ai">
            <div class="stce-placeholder">
                <i class="fa-solid fa-wand-magic-sparkles"></i>
                <strong>AI 正则助手</strong>
                <span>下一步实现：抽样聊天 → AI 判断正文结构 → 生成建议规则 → 用户确认。</span>
            </div>
        </section>
    `;

    const tabButtons = [...root.querySelectorAll('.stce-tab')];
    const panels = [...root.querySelectorAll('.stce-panel')];

    for (const button of tabButtons) {
        button.addEventListener('click', () => {
            const tab = button.dataset.tab;

            for (const item of tabButtons) {
                item.classList.toggle('is-active', item === button);
            }

            for (const panel of panels) {
                panel.classList.toggle('is-active', panel.dataset.panel === tab);
            }
        });
    }

    const includeUser = root.querySelector('#stce_include_user');
    const includeAssistant = root.querySelector('#stce_include_assistant');
    const includeSystem = root.querySelector('#stce_include_system');
    const keepSender = root.querySelector('#stce_keep_sender');
    const preview = root.querySelector('#stce_preview');
    const previewMeta = root.querySelector('#stce_preview_meta');
    const messageCount = root.querySelector('#stce_message_count');

    let currentMessages = [];

    function getOptions() {
        return {
            includeUser: includeUser.checked,
            includeAssistant: includeAssistant.checked,
            includeSystem: includeSystem.checked,
            keepSenderName: keepSender.checked,
        };
    }

    function renderPreview() {
        const options = getOptions();
        const filtered = filterMessages(currentMessages, options);
        const text = buildDocument(filtered, options);

        preview.value = text;
        previewMeta.textContent = `${text.length.toLocaleString()} 字 · ${filtered.length} 条`;
    }

    function refreshChat() {
        currentMessages = readCurrentChat();
        messageCount.textContent = `${currentMessages.length} 条消息`;
        renderPreview();
    }

    for (const input of [includeUser, includeAssistant, includeSystem, keepSender]) {
        input.addEventListener('change', renderPreview);
    }

    root.querySelector('#stce_refresh').addEventListener('click', () => {
        refreshChat();
        toastr.success('已重新读取当前聊天', '正文导出器');
    });

    root.querySelector('#stce_export_txt').addEventListener('click', () => {
        const options = getOptions();
        const text = buildDocument(filterMessages(currentMessages, options), options);

        if (!text.trim()) {
            toastr.warning('没有可导出的正文', '正文导出器');
            return;
        }

        downloadText(getDefaultFilename('txt'), text);
        toastr.success('TXT 已导出', '正文导出器');
    });

    root.querySelector('#stce_export_md').addEventListener('click', () => {
        const options = getOptions();
        const text = buildDocument(filterMessages(currentMessages, options), options);

        if (!text.trim()) {
            toastr.warning('没有可导出的正文', '正文导出器');
            return;
        }

        downloadText(getDefaultFilename('md'), text, 'text/markdown;charset=utf-8');
        toastr.success('Markdown 已导出', '正文导出器');
    });

    refreshChat();

    return root;
}

async function openExporter() {
    const context = getContext();
    const { Popup, POPUP_TYPE } = context;

    if (!Array.isArray(context.chat) || context.chat.length === 0) {
        toastr.warning('当前没有可读取的聊天记录', '正文导出器');
    }

    const content = createExporterContent();

    const popup = new Popup(
        content,
        POPUP_TYPE.DISPLAY,
        '',
        {
            large: true,
            allowVerticalScrolling: false,
            allowHorizontalScrolling: false,
            leftAlign: true,
        },
    );

    await popup.show();
}

function createWandButton() {
    if (document.getElementById(WAND_BUTTON_ID)) {
        return;
    }

    const menu = document.querySelector('#extensionsMenu');

    if (!menu) {
        console.warn('[ST Chat Exporter] #extensionsMenu not found.');
        return;
    }

    const item = document.createElement('div');
    item.id = WAND_BUTTON_ID;
    item.className = 'list-group-item flex-container flexGap5';
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    item.title = '将当前聊天清洗后导出为 TXT / Markdown';

    item.innerHTML = `
        <div class="fa-solid fa-book-open extensionsMenuExtensionButton"></div>
        <span>正文导出</span>
    `;

    item.addEventListener('click', openExporter);
    item.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openExporter();
        }
    });

    menu.appendChild(item);
}

function init() {
    if (initialized) return;
    initialized = true;

    createWandButton();

    console.info('[ST Chat Exporter] initialized');
}

// Third-party extensions are loaded in the browser.
// jQuery is available in SillyTavern and this waits until the UI DOM is ready.
jQuery(() => {
    init();
});
