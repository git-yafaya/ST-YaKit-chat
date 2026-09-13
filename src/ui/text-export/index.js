import { createPageView, createRuleRow } from './view.js';

export function createTextExportPage(api, getContext, notify) {
    const page = createPageView();
    const form = page.querySelector('[data-role="form"]');
    const field = name => form.elements.namedItem(name);
    const rules = form.querySelector('[data-role="rules"]');
    const rangeSummary = form.querySelector('[data-role="range-summary"]');
    const exportButton = form.querySelector('[data-action="export"]');
    const typesNotice = form.querySelector('[data-role="types-notice"]');
    let exporting = false;
    let ruleId = 0;

    const selectedTypes = () => Object.fromEntries(
        ['ai', 'user', 'system'].map(name => [name, field(name).checked]),
    );
    const selectedRange = () => field('all').checked ? 'all' : {
        start: field('start').valueAsNumber,
        end: field('end').valueAsNumber,
    };

    function showChatState() {
        const group = getContext().groupId != null;
        page.querySelector('[data-role="group-notice"]').hidden = !group;
        form.hidden = group;
        return !group;
    }

    function showRange(messages) {
        const start = messages[0]?.floor;
        const end = messages.at(-1)?.floor;
        rangeSummary.textContent = messages.length ? `${start}–${end}` : '无内容';
        field('start').value = start ?? 1;
        field('end').value = end ?? 1;
    }

    function updateTypes() {
        const enabled = Object.values(selectedTypes()).some(Boolean);
        typesNotice.hidden = enabled;
        exportButton.disabled = exporting || !enabled;
    }

    function updateRange() {
        const all = field('all').checked;
        form.querySelector('[data-role="range-fields"]').hidden = all;
        field('start').disabled = field('end').disabled = all;
        if (!showChatState()) return;
        if (!all && ![field('start'), field('end')].every(input => input.validity.valid)) {
            rangeSummary.textContent = '';
            return;
        }
        // 生效范围取读取结果，避免在界面里另写纠正规则。
        showRange(api.readCurrentChat(selectedRange()));
    }

    function validateRule(input) {
        let invalid = false;
        try {
            new RegExp(input.value, 'g');
        } catch (error) {
            if (!(error instanceof SyntaxError)) throw error;
            invalid = true;
        }
        const notice = input.closest('[data-role="rule"]').querySelector('[data-role="rule-error"]');
        if (invalid) {
            notice.classList.remove('is-leaving');
            notice.hidden = false;
        } else if (!notice.hidden) {
            if (matchMedia('(prefers-reduced-motion: reduce)').matches) notice.hidden = true;
            else notice.classList.add('is-leaving');
        }
    }

    page.addEventListener('animationend', event => {
        if (event.animationName === 'yk-notice-leave') {
            event.target.hidden = true;
            event.target.classList.remove('is-leaving');
        }
    });
    page.addEventListener('click', event => {
        const action = event.target.closest('[data-action]')?.dataset.action;
        if (action === 'add-rule') {
            const row = createRuleRow(++ruleId);
            rules.append(row);
            row.querySelector('[data-role="pattern"]').focus();
        }
        if (action === 'remove-rule') {
            const row = event.target.closest('[data-role="rule"]');
            const nextFocus = row.nextElementSibling || row.previousElementSibling;
            row.remove();
            (nextFocus?.querySelector('[data-role="pattern"]')
                || form.querySelector('[data-action="add-rule"]')).focus();
        }
    });
    form.addEventListener('change', event => {
        if (['all', 'start', 'end'].includes(event.target.name)) updateRange();
        if (['ai', 'user', 'system'].includes(event.target.name)) updateTypes();
    });
    form.addEventListener('input', event => {
        if (event.target.dataset.role === 'pattern') validateRule(event.target);
    });
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (exporting || !showChatState()) return;
        updateTypes();
        if (exportButton.disabled || !form.reportValidity()) return;
        exporting = true;
        updateTypes();
        form.setAttribute('aria-busy', 'true');
        try {
            let messages = api.readCurrentChat(selectedRange());
            showRange(messages);
            messages = api.filterMessages(messages, selectedTypes());
            // 保留每一行的原始输入，包括有效的空正则。
            const selectedRules = [...rules.querySelectorAll('[data-role="pattern"]')]
                .map(input => ({ pattern: input.value }));
            if (selectedRules.length) messages = api.cleanMessages(messages, selectedRules, field('mode').value);
            if (messages.length === 0 || messages.every(message => message.mes === '')) {
                notify('无内容', 'warning');
                return;
            }
            const result = await api.saveExport(messages, {
                fileType: field('fileType').value,
                labelMode: field('format').value,
            });
            notify(result === '无内容' ? '无内容' : '已导出', result === '无内容' ? 'warning' : 'success');
        } catch (error) {
            notify(error.message, 'danger');
        } finally {
            exporting = false;
            form.removeAttribute('aria-busy');
            updateTypes();
        }
    });

    if (showChatState()) {
        updateRange();
        updateTypes();
    }
    return page;
}
