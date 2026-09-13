import { renderValidation } from './controls.js';

export function createApiSettingsCard(api, notify) {
    const card = document.createElement('details');
    card.className = 'yk-card yk-settings-card yk-drawer';
    card.setAttribute('aria-labelledby', 'yk-api-title');
    card.innerHTML = `
        <summary class="yk-drawer-heading">
            <h2 id="yk-api-title" class="yk-card-title">副 API 配置</h2>
            <i class="fa-solid fa-chevron-down yk-drawer-arrow" aria-hidden="true"></i>
        </summary>
        <div class="yk-drawer-body">
            <p class="yk-help" data-role="api-current" aria-live="polite"></p>
            <div class="yk-field">
                <label class="yk-label" for="yk-api-list">已保存配置</label>
                <select id="yk-api-list" class="yk-input yk-record-list" data-role="api-list"></select>
            </div>
            <div class="yk-actions">
                <button type="button" class="yk-button" data-action="new">新建</button>
                <button type="button" class="yk-button" data-action="edit">编辑</button>
                <button type="button" class="yk-button" data-action="delete">删除</button>
                <button type="button" class="yk-button" data-action="select">设为当前</button>
                <button type="button" class="yk-button" data-action="main">使用主 API</button>
            </div>
            <form class="yk-settings-editor" data-role="api-editor" novalidate hidden>
                <div class="yk-field">
                    <label class="yk-label" for="yk-api-name">名称</label>
                    <input id="yk-api-name" class="yk-input" name="name" type="text" maxlength="64" required>
                </div>
                <div class="yk-field">
                    <label class="yk-label" for="yk-api-base-url">服务地址</label>
                    <input id="yk-api-base-url" class="yk-input" name="baseUrl" type="url" required>
                </div>
                <div class="yk-field">
                    <label class="yk-label" for="yk-api-key">密钥</label>
                    <div class="yk-secret-field">
                        <input id="yk-api-key" class="yk-input" name="key" type="password" autocomplete="off" spellcheck="false">
                        <button type="button" class="yk-button" data-action="toggle-key" aria-controls="yk-api-key" aria-pressed="false">显示密钥</button>
                    </div>
                </div>
                <div class="yk-field">
                    <label class="yk-label" for="yk-api-model">模型名称</label>
                    <input id="yk-api-model" class="yk-input" name="model" type="text" required>
                </div>
                <div class="yk-validation" data-role="api-validation" aria-live="polite"></div>
                <div class="yk-actions">
                    <button type="submit" class="yk-button yk-button--primary" data-action="save">保存</button>
                    <button type="button" class="yk-button" data-action="cancel">取消</button>
                </div>
            </form>
        </div>
    `;
    const list = card.querySelector('[data-role="api-list"]');
    const current = card.querySelector('[data-role="api-current"]');
    const editor = card.querySelector('[data-role="api-editor"]');
    const validation = card.querySelector('[data-role="api-validation"]');
    const keyInput = editor.elements.namedItem('key');
    const keyToggle = card.querySelector('[data-action="toggle-key"]');
    let editing = null;

    function refresh(selectedId = list.value) {
        const { items, activeId } = api.getApiProfiles();
        list.replaceChildren();
        for (const item of items) {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = item.name + (item.id === activeId ? '（当前使用）' : '');
            list.append(option);
        }
        if (items.some(item => item.id === selectedId)) list.value = selectedId;
        list.disabled = items.length === 0;
        for (const action of ['edit', 'delete', 'select']) {
            card.querySelector(`[data-action="${action}"]`).disabled = items.length === 0;
        }
        const active = api.getActiveApiConfig();
        current.textContent = active.source === 'main'
            ? '当前使用：主 API（跟随酒馆）'
            : `当前使用：${active.config.name}`;
    }

    function concealKey() {
        keyInput.type = 'password';
        keyToggle.textContent = '显示密钥';
        keyToggle.setAttribute('aria-pressed', 'false');
    }

    function closeEditor() {
        editor.hidden = true;
        editor.reset();
        concealKey();
        validation.replaceChildren();
        editing = null;
    }

    function openEditor(record = null) {
        closeEditor();
        editing = record;
        for (const field of ['name', 'baseUrl', 'key', 'model']) {
            editor.elements.namedItem(field).value = record?.[field] ?? '';
        }
        editor.hidden = false;
        if (record) validateDraft();
        editor.elements.namedItem('name').focus();
    }

    function readDraft() {
        // 编辑只保留身份与原有 provider，其余字段由业务层规范化。
        const draft = editing ? { id: editing.id, provider: editing.provider } : {};
        for (const field of ['name', 'baseUrl', 'key', 'model']) {
            draft[field] = editor.elements.namedItem(field).value;
        }
        return draft;
    }

    function validateDraft() {
        const result = api.validateApiConfig(readDraft());
        renderValidation(validation, result);
        return result;
    }

    list.addEventListener('change', closeEditor);
    editor.addEventListener('input', () => {
        try {
            validateDraft();
        } catch (error) {
            notify(error.message, 'danger');
        }
    });

    editor.addEventListener('submit', event => {
        event.preventDefault();
        try {
            if (!validateDraft().valid) return;
            const saved = api.saveApiProfile(readDraft());
            closeEditor();
            refresh(saved.id);
            notify('已保存', 'success');
        } catch (error) {
            notify(error.message, 'danger');
        }
    });

    card.addEventListener('click', event => {
        const button = event.target.closest('button[data-action]');
        if (!button || button.disabled) return;
        try {
            switch (button.dataset.action) {
                case 'new':
                    openEditor();
                    break;
                case 'edit':
                    openEditor(api.getApiProfiles().items.find(item => item.id === list.value));
                    break;
                case 'delete': {
                    const deletedId = list.value;
                    api.deleteApiProfile(deletedId);
                    if (editing?.id === deletedId) closeEditor();
                    refresh();
                    notify('已删除', 'success');
                    break;
                }
                case 'select':
                    api.selectApiProfile(list.value);
                    refresh();
                    break;
                case 'main':
                    api.selectApiProfile(null);
                    refresh();
                    break;
                case 'toggle-key': {
                    const visible = keyInput.type === 'password';
                    keyInput.type = visible ? 'text' : 'password';
                    keyToggle.textContent = visible ? '隐藏密钥' : '显示密钥';
                    keyToggle.setAttribute('aria-pressed', String(visible));
                    break;
                }
                case 'cancel':
                    closeEditor();
                    break;
            }
        } catch (error) {
            notify(error.message, 'danger');
        }
    });

    refresh();
    return card;
}
