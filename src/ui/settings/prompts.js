import { renderValidation } from './controls.js';
import { syncSelect, focusSelect } from '../shared/select.js';

export function createPromptSettingsCards(api, notify) {
    function createCard(category, title) {
        const card = document.createElement('details');
        const prefix = `yk-prompts-${category}`;
        card.className = 'yk-card yk-settings-card yk-drawer';
        card.dataset.category = category;
        card.setAttribute('aria-labelledby', `${prefix}-title`);
        card.innerHTML = `
            <summary class="yk-drawer-heading">
                <h2 id="${prefix}-title" class="yk-card-title">${title}</h2>
                <i class="fa-solid fa-chevron-down yk-drawer-arrow" aria-hidden="true"></i>
            </summary>
            <div class="yk-drawer-body">
                <p class="yk-label" data-role="active" aria-live="polite"></p>
                <div class="yk-field">
                    <label class="yk-label" for="${prefix}-records">已保存提示词</label>
                    <select id="${prefix}-records" class="yk-input yk-record-list" data-role="records"></select>
                </div>
                <div class="yk-actions">
                    <button type="button" class="yk-button" data-action="new">新建</button>
                    <button type="button" class="yk-button" data-action="edit">编辑</button>
                    <button type="button" class="yk-button" data-action="delete">删除</button>
                    <button type="button" class="yk-button" data-action="activate">设为当前</button>
                    <button type="button" class="yk-button" data-action="deactivate">取消使用</button>
                </div>
                <form class="yk-settings-editor" name="prompt-${category}" data-role="editor" novalidate hidden>
                    <div class="yk-field">
                        <label class="yk-label" for="${prefix}-name">名称</label>
                        <input id="${prefix}-name" class="yk-input" name="name" type="text" autocomplete="off">
                    </div>
                    <div class="yk-field">
                        <label class="yk-label" for="${prefix}-content">正文</label>
                        <textarea id="${prefix}-content" class="yk-input" name="content" rows="6"></textarea>
                    </div>
                    ${category === 'jailbreak' ? '' : `
                    <div class="yk-field">
                        <label class="yk-label" for="${prefix}-target">注入到</label>
                        <select id="${prefix}-target" class="yk-input" name="target" data-control="segments">
                            <option value="user">user</option>
                            <option value="system">system</option>
                        </select>
                    </div>`}
                    <div class="yk-actions">
                        <button type="submit" class="yk-button yk-button--primary">保存</button>
                        <button type="button" class="yk-button" data-action="cancel">取消</button>
                    </div>
                </form>
                <div class="yk-validation" data-role="validation" aria-live="polite"></div>
            </div>
        `;
        const list = card.querySelector('[data-role="records"]');
        const form = card.querySelector('[data-role="editor"]');
        const validation = card.querySelector('[data-role="validation"]');
        const field = name => form.elements.namedItem(name);
        const button = action => card.querySelector(`[data-action="${action}"]`);
        let items = [];
        let editingId;

        function updateSelection() {
            const selected = items.some(item => item.id === list.value);
            for (const action of ['edit', 'delete', 'activate']) button(action).disabled = !selected;
        }

        function refresh(selectedId = list.value) {
            const group = api.getPromptTemplates(category);
            items = group.items;
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = '请选择';
            list.replaceChildren(placeholder);
            for (const item of items) {
                const option = document.createElement('option');
                option.value = item.id;
                option.textContent = `${item.name}${item.id === group.activeId ? '（当前使用）' : ''}`;
                list.append(option);
            }
            list.value = items.some(item => item.id === selectedId) ? selectedId : '';
            const active = items.find(item => item.id === group.activeId);
            card.querySelector('[data-role="active"]').textContent = `当前使用：${active?.name ?? '未选择'}`;
            button('deactivate').disabled = !active;
            updateSelection();
        }

        function closeEditor() {
            form.hidden = true;
            editingId = undefined;
        }

        function edit(record) {
            editingId = record?.id;
            field('name').value = record?.name ?? '';
            field('content').value = record?.content ?? '';
            if (category !== 'jailbreak') {
                field('target').value = record?.target ?? 'user';
                syncSelect(field('target'));
            }
            form.hidden = false;
            field('name').focus();
        }

        list.addEventListener('change', () => {
            closeEditor();
            validation.replaceChildren();
            updateSelection();
        });
        card.addEventListener('click', event => {
            const action = event.target.closest('[data-action]')?.dataset.action;
            if (!action) return;
            validation.replaceChildren();
            try {
                const record = items.find(item => item.id === list.value);
                if (action === 'new') edit();
                if (action === 'edit' && record) edit(record);
                if (action === 'cancel') {
                    closeEditor();
                    button('new').focus();
                }
                if (action === 'delete' && record) {
                    api.deletePromptTemplate(category, record.id);
                    closeEditor();
                    refresh('');
                    notify('已删除', 'success');
                }
                if (action === 'activate' && record) {
                    api.selectPromptTemplate(category, record.id);
                    refresh();
                    notify('已设为当前', 'success');
                }
                if (action === 'deactivate') {
                    api.selectPromptTemplate(category, null);
                    refresh();
                    notify('已取消使用', 'success');
                }
            } catch (error) {
                notify(error.message, 'danger');
            }
        });
        form.addEventListener('submit', event => {
            event.preventDefault();
            // 原样传正文和选择值，业务校验与内部默认值由 API 处理。
            const input = {
                category,
                ...(editingId === undefined ? {} : { id: editingId }),
                name: field('name').value,
                content: field('content').value,
                target: category === 'jailbreak' ? 'system' : field('target').value,
            };
            try {
                const result = api.validatePromptTemplate(input);
                renderValidation(validation, result);
                if (!result.valid) return;
                const saved = api.savePromptTemplate(input);
                closeEditor();
                refresh(saved.id);
                focusSelect(list);
                notify('已保存', 'success');
            } catch (error) {
                renderValidation(validation, { valid: false, errors: [error.message], warnings: [] });
            }
        });
        refresh();
        return card;
    }

    return [
        createCard('jailbreak', '破限词'),
        createCard('regex', '正则提示词'),
        createCard('style', '文风提示词'),
    ];
}
