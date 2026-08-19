const EXTENSION_ID = 'st-chat-exporter';
const WAND_BUTTON_ID = 'st_chat_exporter_wand_button';

const DEFAULT_SETTINGS = Object.freeze({
    version: 2,
    export: {
        includeUser: true,
        includeAssistant: true,
        includeSystem: false,
        keepSenderName: false,
    },
    rules: [],
});

let initialized = false;

function getContext() {
    return SillyTavern.getContext();
}

function deepClone(value) {
    if (typeof structuredClone === 'function') {
        return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
}

function getSettings() {
    const { extensionSettings } = getContext();

    if (!extensionSettings[EXTENSION_ID]) {
        extensionSettings[EXTENSION_ID] = deepClone(DEFAULT_SETTINGS);
    }

    const settings = extensionSettings[EXTENSION_ID];

    if (!settings.export || typeof settings.export !== 'object') {
        settings.export = deepClone(DEFAULT_SETTINGS.export);
    } else {
        for (const [key, value] of Object.entries(DEFAULT_SETTINGS.export)) {
            if (!Object.hasOwn(settings.export, key)) {
                settings.export[key] = value;
            }
        }
    }

    if (!Array.isArray(settings.rules)) {
        settings.rules = [];
    }

    settings.version = 2;

    return settings;
}

function saveSettings() {
    const { saveSettingsDebounced } = getContext();
    saveSettingsDebounced?.();
}

function createId(prefix = 'rule') {
    if (crypto?.randomUUID) {
        return `${prefix}_${crypto.randomUUID()}`;
    }

    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
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
    const chat = Array.isArray(context.chat) ? deepClone(context.chat) : [];
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

function scopeMatches(role, scope) {
    if (scope === 'all') return true;
    return role === scope;
}

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeRegexFlags(flags) {
    const allowed = new Set(['d', 'g', 'i', 'm', 's', 'u', 'v', 'y']);
    const seen = new Set();
    let result = '';

    for (const char of String(flags || '')) {
        if (!allowed.has(char) || seen.has(char)) continue;
        seen.add(char);
        result += char;
    }

    return result;
}

function buildTagRegex(rule) {
    const tagName = String(rule.pattern || '').trim();

    if (!tagName) {
        throw new Error('标签名不能为空');
    }

    const escaped = escapeRegex(tagName);
    const caseFlag = rule.caseSensitive ? '' : 'i';

    if (rule.tagMode === 'unwrap') {
        return {
            open: new RegExp(`<${escaped}\\b[^>]*>`, `g${caseFlag}`),
            close: new RegExp(`</${escaped}\\s*>`, `g${caseFlag}`),
        };
    }

    return {
        block: new RegExp(
            `<${escaped}\\b[^>]*>[\\s\\S]*?</${escaped}\\s*>|<${escaped}\\b[^>]*/\\s*>`,
            `g${caseFlag}`,
        ),
    };
}

function applyRuleToText(text, rule) {
    if (!rule?.enabled) return text;

    const source = String(text ?? '');

    try {
        if (rule.type === 'tag') {
            const regex = buildTagRegex(rule);

            if (rule.tagMode === 'unwrap') {
                return source
                    .replace(regex.open, '')
                    .replace(regex.close, '');
            }

            return source.replace(regex.block, '');
        }

        if (rule.type === 'text') {
            const needle = String(rule.pattern ?? '');
            const replacement = String(rule.replacement ?? '');

            if (!needle) return source;

            if (rule.caseSensitive) {
                return source.split(needle).join(replacement);
            }

            const regex = new RegExp(escapeRegex(needle), 'gi');
            return source.replace(regex, () => replacement);
        }

        if (rule.type === 'regex') {
            const pattern = String(rule.pattern ?? '');
            const replacement = String(rule.replacement ?? '');

            if (!pattern) return source;

            const flags = normalizeRegexFlags(rule.flags || 'g');
            const regex = new RegExp(pattern, flags);

            return source.replace(regex, replacement);
        }
    } catch (error) {
        console.warn('[ST Chat Exporter] Failed to apply rule:', rule?.name, error);
    }

    return source;
}

function applyMessageRules(messages, rules) {
    const messageRules = rules.filter(
        (rule) => rule.enabled && rule.stage === 'message',
    );

    return messages.map((message) => {
        let text = message.text;

        for (const rule of messageRules) {
            if (!scopeMatches(message.role, rule.scope)) continue;
            text = applyRuleToText(text, rule);
        }

        return {
            ...message,
            text,
        };
    });
}

function applyDocumentRules(text, rules) {
    let result = text;

    const documentRules = rules.filter(
        (rule) => rule.enabled && rule.stage === 'document',
    );

    for (const rule of documentRules) {
        result = applyRuleToText(result, rule);
    }

    return result;
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

function processChat(messages, options, rules) {
    const filtered = filterMessages(messages, options);
    const cleanedMessages = applyMessageRules(filtered, rules);
    const merged = buildDocument(cleanedMessages, options);
    const text = applyDocumentRules(merged, rules);

    return {
        text,
        filteredCount: filtered.length,
        keptCount: cleanedMessages.filter((message) => message.text.trim()).length,
    };
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

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function getRuleTypeLabel(type) {
    return {
        tag: '标签',
        text: '文本',
        regex: '正则',
    }[type] || type;
}

function getRuleStageLabel(stage) {
    return stage === 'document' ? '全文' : '单条消息';
}

function getRuleScopeLabel(scope) {
    return {
        all: '全部',
        user: '用户',
        assistant: 'AI',
        system: '系统',
    }[scope] || scope;
}

function getRuleSummary(rule) {
    if (rule.type === 'tag') {
        const mode = rule.tagMode === 'unwrap' ? '仅移除标签' : '删除标签块';
        return `${mode} · <${rule.pattern || 'tag'}>`;
    }

    if (rule.type === 'text') {
        const value = String(rule.pattern || '').replace(/\s+/g, ' ').trim();
        return `查找：${value || '（空）'}`;
    }

    const value = String(rule.pattern || '').replace(/\s+/g, ' ').trim();
    return `/${value || '（空）'}/${rule.flags || ''}`;
}

function createDefaultRule() {
    return {
        id: createId(),
        name: '新清洗规则',
        enabled: true,
        source: 'manual',
        stage: 'message',
        scope: 'assistant',
        type: 'tag',
        pattern: '',
        replacement: '',
        flags: 'g',
        caseSensitive: false,
        tagMode: 'removeBlock',
    };
}

function validateRule(rule) {
    const name = String(rule.name || '').trim();
    if (!name) {
        return '规则名称不能为空';
    }

    if (!['tag', 'text', 'regex'].includes(rule.type)) {
        return '未知规则类型';
    }

    if (!String(rule.pattern || '').trim()) {
        return rule.type === 'tag' ? '标签名不能为空' : '匹配内容不能为空';
    }

    if (rule.type === 'tag' && !/^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(rule.pattern.trim())) {
        return '标签名格式不正确，例如：think、StatusBlock、acg_think';
    }

    if (rule.type === 'regex') {
        try {
            new RegExp(rule.pattern, normalizeRegexFlags(rule.flags));
        } catch (error) {
            return `正则表达式无效：${error.message}`;
        }
    }

    return null;
}

function enhanceSelect(select) {
    if (!select || select.dataset.stceEnhanced === 'true') {
        return;
    }

    select.dataset.stceEnhanced = 'true';

    const wrapper = document.createElement('div');
    wrapper.className = 'stce-custom-select';

    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(select);

    select.classList.add('stce-native-select');

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'stce-select-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');

    trigger.innerHTML = `
        <span class="stce-select-value"></span>
        <i class="fa-solid fa-chevron-down"></i>
    `;

    const menu = document.createElement('div');
    menu.className = 'stce-select-menu';
    menu.setAttribute('role', 'listbox');

    wrapper.appendChild(trigger);
    wrapper.appendChild(menu);

    function getSelectedOption() {
        return [...select.options].find((option) => option.value === select.value)
            || select.options[0];
    }

    function close() {
        wrapper.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
    }

    function sync() {
        const selected = getSelectedOption();

        trigger.querySelector('.stce-select-value').textContent =
            selected?.textContent || '';

        trigger.disabled = Boolean(select.disabled);

        for (const optionButton of menu.querySelectorAll('.stce-select-option')) {
            const active = optionButton.dataset.value === select.value;
            optionButton.classList.toggle('is-selected', active);
            optionButton.setAttribute('aria-selected', active ? 'true' : 'false');
        }

        if (select.disabled) {
            close();
        }
    }

    function renderOptions() {
        menu.innerHTML = '';

        for (const option of select.options) {
            const optionButton = document.createElement('button');
            optionButton.type = 'button';
            optionButton.className = 'stce-select-option';
            optionButton.dataset.value = option.value;
            optionButton.setAttribute('role', 'option');
            optionButton.textContent = option.textContent;

            optionButton.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();

                if (select.disabled) return;

                select.value = option.value;
                select.dispatchEvent(new Event('change', { bubbles: true }));

                sync();
                close();
            });

            menu.appendChild(optionButton);
        }
    }

    trigger.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (select.disabled) return;

        const willOpen = !wrapper.classList.contains('is-open');

        for (const other of document.querySelectorAll('.stce-custom-select.is-open')) {
            if (other !== wrapper) {
                other.classList.remove('is-open');
                other.querySelector('.stce-select-trigger')
                    ?.setAttribute('aria-expanded', 'false');
            }
        }

        wrapper.classList.toggle('is-open', willOpen);
        trigger.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    });

    select.addEventListener('change', sync);

    select._stceSync = sync;
    select._stceClose = close;

    renderOptions();
    sync();
}

async function openRuleEditor(rule, currentMessages, getOptions) {
    const context = getContext();
    const { Popup, POPUP_TYPE, POPUP_RESULT } = context;

    const draft = deepClone(rule || createDefaultRule());

    const editor = document.createElement('div');
    editor.className = 'stce-rule-editor';

    editor.innerHTML = `
        <div class="stce-editor-title">
            <strong>${rule ? '编辑清洗规则' : '添加清洗规则'}</strong>
            <span>规则会按列表顺序执行</span>
        </div>

        <div class="stce-editor-grid">
            <label class="stce-field stce-field-wide">
                <span>规则名称</span>
                <input id="stce_rule_name" type="text" value="${escapeHtml(draft.name)}">
            </label>

            <label class="stce-field">
                <span>规则类型</span>
                <select id="stce_rule_type">
                    <option value="tag">标签</option>
                    <option value="text">文本</option>
                    <option value="regex">正则表达式</option>
                </select>
            </label>

            <label class="stce-field">
                <span>执行阶段</span>
                <select id="stce_rule_stage">
                    <option value="message">单条消息</option>
                    <option value="document">合并后全文</option>
                </select>
            </label>

            <label class="stce-field" id="stce_scope_field">
                <span>作用对象</span>
                <select id="stce_rule_scope">
                    <option value="assistant">AI 消息</option>
                    <option value="user">用户消息</option>
                    <option value="system">系统消息</option>
                    <option value="all">全部消息</option>
                </select>
            </label>

            <label class="stce-field stce-field-wide stce-type-field" data-types="tag">
                <span>标签名</span>
                <input id="stce_rule_tag" type="text" placeholder="例如：think、StatusBlock">
            </label>

            <label class="stce-field stce-type-field" data-types="tag">
                <span>标签处理</span>
                <select id="stce_rule_tag_mode">
                    <option value="removeBlock">删除标签及内部内容</option>
                    <option value="unwrap">只删除标签，保留内部内容</option>
                </select>
            </label>

            <label class="stce-field stce-type-field" data-types="tag,text">
                <span class="stce-check-row">
                    <input id="stce_rule_case" type="checkbox">
                    区分大小写
                </span>
            </label>

            <label class="stce-field stce-field-wide stce-type-field" data-types="text">
                <span>查找文本</span>
                <textarea id="stce_rule_text_pattern" rows="3" placeholder="要删除或替换的固定文本"></textarea>
            </label>

            <label class="stce-field stce-field-wide stce-type-field" data-types="text">
                <span>替换为</span>
                <textarea id="stce_rule_text_replacement" rows="2" placeholder="留空表示删除"></textarea>
            </label>

            <label class="stce-field stce-field-wide stce-type-field" data-types="regex">
                <span>正则表达式</span>
                <textarea id="stce_rule_regex_pattern" rows="3" spellcheck="false" placeholder="例如：<think>[\\s\\S]*?</think>"></textarea>
            </label>

            <label class="stce-field stce-field-wide stce-type-field" data-types="regex">
                <span>替换为</span>
                <textarea id="stce_rule_regex_replacement" rows="2" spellcheck="false" placeholder="留空表示删除；支持 $1、$& 等替换语法"></textarea>
            </label>

            <label class="stce-field stce-type-field" data-types="regex">
                <span>Flags</span>
                <input id="stce_rule_flags" type="text" spellcheck="false" placeholder="gim" value="g">
            </label>
        </div>

        <div class="stce-rule-test">
            <div class="stce-rule-test-head">
                <div>
                    <strong>规则测试</strong>
                    <span>只测试当前正在编辑的这一条规则</span>
                </div>
                <button id="stce_rule_test_button" type="button" class="menu_button">
                    <i class="fa-solid fa-flask"></i>
                    测试
                </button>
            </div>

            <div class="stce-rule-test-grid">
                <label class="stce-field">
                    <span>原始样本</span>
                    <textarea id="stce_rule_test_before" rows="7" spellcheck="false"></textarea>
                </label>
                <label class="stce-field">
                    <span>处理结果</span>
                    <textarea id="stce_rule_test_after" rows="7" spellcheck="false" readonly></textarea>
                </label>
            </div>
        </div>
    `;

    const nameInput = editor.querySelector('#stce_rule_name');
    const typeInput = editor.querySelector('#stce_rule_type');
    const stageInput = editor.querySelector('#stce_rule_stage');
    const scopeInput = editor.querySelector('#stce_rule_scope');
    const scopeField = editor.querySelector('#stce_scope_field');
    const tagInput = editor.querySelector('#stce_rule_tag');
    const tagModeInput = editor.querySelector('#stce_rule_tag_mode');
    const caseInput = editor.querySelector('#stce_rule_case');
    const textPatternInput = editor.querySelector('#stce_rule_text_pattern');
    const textReplacementInput = editor.querySelector('#stce_rule_text_replacement');
    const regexPatternInput = editor.querySelector('#stce_rule_regex_pattern');
    const regexReplacementInput = editor.querySelector('#stce_rule_regex_replacement');
    const flagsInput = editor.querySelector('#stce_rule_flags');
    const beforeInput = editor.querySelector('#stce_rule_test_before');
    const afterInput = editor.querySelector('#stce_rule_test_after');

    typeInput.value = draft.type || 'tag';
    stageInput.value = draft.stage || 'message';
    scopeInput.value = draft.scope || 'assistant';
    tagInput.value = draft.type === 'tag' ? draft.pattern || '' : '';
    tagModeInput.value = draft.tagMode || 'removeBlock';
    caseInput.checked = Boolean(draft.caseSensitive);
    textPatternInput.value = draft.type === 'text' ? draft.pattern || '' : '';
    textReplacementInput.value = draft.type === 'text' ? draft.replacement || '' : '';
    regexPatternInput.value = draft.type === 'regex' ? draft.pattern || '' : '';
    regexReplacementInput.value = draft.type === 'regex' ? draft.replacement || '' : '';
    flagsInput.value = draft.flags || 'g';

    for (const select of editor.querySelectorAll('select')) {
        enhanceSelect(select);
    }

    editor.addEventListener('click', (event) => {
        if (event.target.closest('.stce-custom-select')) return;

        for (const select of editor.querySelectorAll('select')) {
            select._stceClose?.();
        }
    });

    function readDraftFromForm() {
        const type = typeInput.value;
        const stage = stageInput.value;

        let pattern = '';
        let replacement = '';

        if (type === 'tag') {
            pattern = tagInput.value.trim();
        } else if (type === 'text') {
            pattern = textPatternInput.value;
            replacement = textReplacementInput.value;
        } else {
            pattern = regexPatternInput.value;
            replacement = regexReplacementInput.value;
        }

        return {
            ...draft,
            name: nameInput.value.trim(),
            enabled: draft.enabled ?? true,
            source: draft.source || 'manual',
            type,
            stage,
            scope: stage === 'document' ? 'all' : scopeInput.value,
            pattern,
            replacement,
            flags: normalizeRegexFlags(flagsInput.value || 'g'),
            caseSensitive: Boolean(caseInput.checked),
            tagMode: tagModeInput.value,
        };
    }

    function updateTypeVisibility() {
        const type = typeInput.value;

        for (const field of editor.querySelectorAll('.stce-type-field')) {
            const types = String(field.dataset.types || '').split(',');
            field.hidden = !types.includes(type);
        }

        const isDocument = stageInput.value === 'document';
        scopeField.classList.toggle('is-disabled', isDocument);
        scopeInput.disabled = isDocument;

        if (isDocument) {
            scopeInput.value = 'all';
        } else if (scopeInput.value === 'all' && draft.stage !== 'document') {
            scopeInput.value = draft.scope || 'assistant';
        }

        scopeInput._stceSync?.();
        typeInput._stceSync?.();
        stageInput._stceSync?.();
        tagModeInput._stceSync?.();
    }

    function buildTestSample() {
        const candidate = readDraftFromForm();

        if (candidate.stage === 'document') {
            const options = getOptions();
            const filtered = filterMessages(currentMessages, options);
            return buildDocument(filtered, options).slice(0, 12000);
        }

        const matching = currentMessages.filter((message) =>
            scopeMatches(message.role, candidate.scope),
        );

        return matching
            .slice(0, 4)
            .map((message) => message.text)
            .filter(Boolean)
            .join('\n\n──────────\n\n')
            .slice(0, 12000);
    }

    function runRuleTest() {
        const candidate = readDraftFromForm();
        const error = validateRule(candidate);

        if (error) {
            toastr.warning(error, '规则测试');
            return;
        }

        if (!beforeInput.value.trim()) {
            beforeInput.value = buildTestSample();
        }

        afterInput.value = applyRuleToText(beforeInput.value, candidate);
    }

    typeInput.addEventListener('change', updateTypeVisibility);
    stageInput.addEventListener('change', updateTypeVisibility);
    editor.querySelector('#stce_rule_test_button').addEventListener('click', runRuleTest);

    updateTypeVisibility();
    beforeInput.value = buildTestSample();

    const popup = new Popup(
        editor,
        POPUP_TYPE.TEXT,
        '',
        {
            wider: true,
            okButton: '保存',
            cancelButton: '取消',
            allowVerticalScrolling: true,
            leftAlign: true,
        },
    );

    const result = await popup.show();

    if (result !== POPUP_RESULT.AFFIRMATIVE) {
        return null;
    }

    const finalRule = readDraftFromForm();
    const error = validateRule(finalRule);

    if (error) {
        toastr.error(`${error}。规则未保存。`, '正文导出器');
        return null;
    }

    return finalRule;
}

function createExporterContent() {
    const settings = getSettings();
    const root = document.createElement('div');
    root.className = 'stce-root';

    root.innerHTML = `
        <div class="stce-header">
            <div>
                <div class="stce-title">📖 正文导出器</div>
                <div class="stce-subtitle">清洗聊天记录并导出为 TXT / Markdown</div>
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
                    <input id="stce_include_user" type="checkbox">
                    <span>用户消息</span>
                </label>

                <label class="stce-option">
                    <input id="stce_include_assistant" type="checkbox">
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
            <div class="stce-rules-toolbar">
                <div>
                    <strong>清洗规则</strong>
                    <span class="stce-meta" id="stce_rules_meta">0 条</span>
                </div>

                <button id="stce_add_rule" class="menu_button">
                    <i class="fa-solid fa-plus"></i>
                    添加规则
                </button>
            </div>

            <div class="stce-rules-list" id="stce_rules_list"></div>

            <div class="stce-rules-hint">
                <i class="fa-solid fa-circle-info"></i>
                规则从上到下执行。单条消息规则会在合并正文前执行；全文规则会在所有消息合并后执行。
            </div>
        </section>

        <section class="stce-panel" data-panel="ai">
            <div class="stce-placeholder">
                <i class="fa-solid fa-wand-magic-sparkles"></i>
                <strong>AI 正则助手</strong>
                <span>下一版接入：抽样聊天 → AI 判断正文结构 → 生成建议规则 → 用户确认后加入这里。</span>
            </div>
        </section>
    `;

    const tabButtons = [...root.querySelectorAll('.stce-tab')];
    const panels = [...root.querySelectorAll('.stce-panel')];

    const includeUser = root.querySelector('#stce_include_user');
    const includeAssistant = root.querySelector('#stce_include_assistant');
    const includeSystem = root.querySelector('#stce_include_system');
    const keepSender = root.querySelector('#stce_keep_sender');
    const preview = root.querySelector('#stce_preview');
    const previewMeta = root.querySelector('#stce_preview_meta');
    const messageCount = root.querySelector('#stce_message_count');
    const rulesList = root.querySelector('#stce_rules_list');
    const rulesMeta = root.querySelector('#stce_rules_meta');

    includeUser.checked = Boolean(settings.export.includeUser);
    includeAssistant.checked = Boolean(settings.export.includeAssistant);
    includeSystem.checked = Boolean(settings.export.includeSystem);
    keepSender.checked = Boolean(settings.export.keepSenderName);

    let currentMessages = [];
    let draggedRuleId = null;

    function getOptions() {
        return {
            includeUser: includeUser.checked,
            includeAssistant: includeAssistant.checked,
            includeSystem: includeSystem.checked,
            keepSenderName: keepSender.checked,
        };
    }

    function persistExportOptions() {
        Object.assign(settings.export, getOptions());
        saveSettings();
    }

    function renderPreview() {
        const options = getOptions();
        const result = processChat(currentMessages, options, settings.rules);
        const activeRules = settings.rules.filter((rule) => rule.enabled).length;

        preview.value = result.text;
        previewMeta.textContent =
            `${result.text.length.toLocaleString()} 字 · ${result.keptCount} 条 · ${activeRules} 条规则`;
    }

    function refreshChat() {
        currentMessages = readCurrentChat();
        messageCount.textContent = `${currentMessages.length} 条消息`;
        renderPreview();
    }

    function moveRule(id, direction) {
        const index = settings.rules.findIndex((rule) => rule.id === id);
        if (index < 0) return;

        const target = index + direction;
        if (target < 0 || target >= settings.rules.length) return;

        const [item] = settings.rules.splice(index, 1);
        settings.rules.splice(target, 0, item);

        saveSettings();
        renderRules();
        renderPreview();
    }

    function reorderRule(draggedId, targetId) {
        if (!draggedId || !targetId || draggedId === targetId) return;

        const from = settings.rules.findIndex((rule) => rule.id === draggedId);
        const to = settings.rules.findIndex((rule) => rule.id === targetId);

        if (from < 0 || to < 0) return;

        const [item] = settings.rules.splice(from, 1);
        settings.rules.splice(to, 0, item);

        saveSettings();
        renderRules();
        renderPreview();
    }

    async function editRule(ruleId = null) {
        const original = ruleId
            ? settings.rules.find((item) => item.id === ruleId)
            : null;

        const edited = await openRuleEditor(original, currentMessages, getOptions);
        if (!edited) return;

        if (original) {
            const index = settings.rules.findIndex((item) => item.id === ruleId);
            settings.rules[index] = edited;
            toastr.success('规则已更新', '正文导出器');
        } else {
            settings.rules.push(edited);
            toastr.success('规则已添加', '正文导出器');
        }

        saveSettings();
        renderRules();
        renderPreview();
    }

    async function deleteRule(ruleId) {
        const rule = settings.rules.find((item) => item.id === ruleId);
        if (!rule) return;

        const { Popup, POPUP_RESULT } = getContext();
        const result = await Popup.show.confirm(
            '删除清洗规则',
            `确定删除“${rule.name}”吗？`,
        );

        if (result !== POPUP_RESULT.AFFIRMATIVE) return;

        settings.rules = settings.rules.filter((item) => item.id !== ruleId);

        // extensionSettings 持有同一个对象，重新赋值后仍需回写当前设置引用。
        getContext().extensionSettings[EXTENSION_ID].rules = settings.rules;

        saveSettings();
        renderRules();
        renderPreview();
        toastr.success('规则已删除', '正文导出器');
    }

    function duplicateRule(ruleId) {
        const rule = settings.rules.find((item) => item.id === ruleId);
        if (!rule) return;

        const copy = deepClone(rule);
        copy.id = createId();
        copy.name = `${copy.name} 副本`;
        copy.source = 'manual';

        const index = settings.rules.findIndex((item) => item.id === ruleId);
        settings.rules.splice(index + 1, 0, copy);

        saveSettings();
        renderRules();
        renderPreview();
        toastr.success('已复制规则', '正文导出器');
    }

    function renderRules() {
        rulesMeta.textContent = `${settings.rules.length} 条`;

        if (!settings.rules.length) {
            rulesList.innerHTML = `
                <div class="stce-rules-empty">
                    <i class="fa-solid fa-filter-circle-xmark"></i>
                    <strong>还没有清洗规则</strong>
                    <span>点击“添加规则”，可以从标签、固定文本或正则表达式开始。</span>
                </div>
            `;
            return;
        }

        rulesList.innerHTML = settings.rules.map((rule, index) => `
            <div class="stce-rule-card ${rule.enabled ? '' : 'is-disabled'}"
                 data-rule-id="${escapeHtml(rule.id)}"
                 draggable="true">

                <div class="stce-rule-drag" title="拖动排序">
                    <i class="fa-solid fa-grip-vertical"></i>
                </div>

                <label class="stce-rule-toggle" title="${rule.enabled ? '停用规则' : '启用规则'}">
                    <input type="checkbox"
                           data-action="toggle"
                           ${rule.enabled ? 'checked' : ''}>
                </label>

                <div class="stce-rule-main">
                    <div class="stce-rule-title-row">
                        <strong>${escapeHtml(rule.name)}</strong>

                        <div class="stce-rule-badges">
                            <span>${escapeHtml(getRuleTypeLabel(rule.type))}</span>
                            <span>${escapeHtml(getRuleStageLabel(rule.stage))}</span>
                            <span>${escapeHtml(getRuleScopeLabel(rule.scope))}</span>
                            <span class="stce-rule-source">${rule.source === 'ai' ? 'AI' : '手动'}</span>
                        </div>
                    </div>

                    <div class="stce-rule-summary" title="${escapeHtml(getRuleSummary(rule))}">
                        ${escapeHtml(getRuleSummary(rule))}
                    </div>
                </div>

                <div class="stce-rule-actions">
                    <button type="button" data-action="up" class="stce-icon-button"
                            title="上移" ${index === 0 ? 'disabled' : ''}>
                        <i class="fa-solid fa-arrow-up"></i>
                    </button>

                    <button type="button" data-action="down" class="stce-icon-button"
                            title="下移" ${index === settings.rules.length - 1 ? 'disabled' : ''}>
                        <i class="fa-solid fa-arrow-down"></i>
                    </button>

                    <button type="button" data-action="duplicate" class="stce-icon-button" title="复制">
                        <i class="fa-regular fa-copy"></i>
                    </button>

                    <button type="button" data-action="edit" class="stce-icon-button" title="编辑">
                        <i class="fa-solid fa-pen"></i>
                    </button>

                    <button type="button" data-action="delete" class="stce-icon-button stce-danger" title="删除">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');

        for (const card of rulesList.querySelectorAll('.stce-rule-card')) {
            const id = card.dataset.ruleId;

            card.addEventListener('dragstart', (event) => {
                draggedRuleId = id;
                card.classList.add('is-dragging');
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', id);
            });

            card.addEventListener('dragend', () => {
                draggedRuleId = null;
                card.classList.remove('is-dragging');
            });

            card.addEventListener('dragover', (event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
            });

            card.addEventListener('drop', (event) => {
                event.preventDefault();
                reorderRule(
                    draggedRuleId || event.dataTransfer.getData('text/plain'),
                    id,
                );
            });

            card.addEventListener('click', async (event) => {
                const button = event.target.closest('[data-action]');
                if (!button) return;

                const action = button.dataset.action;

                if (action === 'toggle') {
                    const rule = settings.rules.find((item) => item.id === id);
                    if (!rule) return;

                    rule.enabled = Boolean(button.checked);
                    saveSettings();
                    renderRules();
                    renderPreview();
                    return;
                }

                if (action === 'up') {
                    moveRule(id, -1);
                } else if (action === 'down') {
                    moveRule(id, 1);
                } else if (action === 'duplicate') {
                    duplicateRule(id);
                } else if (action === 'edit') {
                    await editRule(id);
                } else if (action === 'delete') {
                    await deleteRule(id);
                }
            });
        }
    }

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

    for (const input of [
        includeUser,
        includeAssistant,
        includeSystem,
        keepSender,
    ]) {
        input.addEventListener('change', () => {
            persistExportOptions();
            renderPreview();
        });
    }

    root.querySelector('#stce_add_rule').addEventListener('click', () => editRule());

    root.querySelector('#stce_refresh').addEventListener('click', () => {
        refreshChat();
        toastr.success('已重新读取当前聊天', '正文导出器');
    });

    root.querySelector('#stce_export_txt').addEventListener('click', () => {
        const result = processChat(currentMessages, getOptions(), settings.rules);

        if (!result.text.trim()) {
            toastr.warning('没有可导出的正文', '正文导出器');
            return;
        }

        downloadText(getDefaultFilename('txt'), result.text);
        toastr.success('TXT 已导出', '正文导出器');
    });

    root.querySelector('#stce_export_md').addEventListener('click', () => {
        const result = processChat(currentMessages, getOptions(), settings.rules);

        if (!result.text.trim()) {
            toastr.warning('没有可导出的正文', '正文导出器');
            return;
        }

        downloadText(
            getDefaultFilename('md'),
            result.text,
            'text/markdown;charset=utf-8',
        );
        toastr.success('Markdown 已导出', '正文导出器');
    });

    renderRules();
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

    getSettings();
    createWandButton();

    console.info('[ST Chat Exporter] initialized v0.2.3');
}

jQuery(() => {
    init();
});
