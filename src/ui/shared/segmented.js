let sequence = 0;

export function createSegmentedSelect(select) {
    const id = `yk-segments-${++sequence}`;
    const wrapper = document.createElement('div');
    wrapper.id = id;
    wrapper.className = 'yk-segments';
    wrapper.setAttribute('role', 'radiogroup');
    const labels = [...select.labels].map((label, index) => {
        const originalFor = label.getAttribute('for');
        const originalId = label.getAttribute('id');
        if (!label.id) label.id = `${id}-label-${index}`;
        return { label, originalFor, originalId };
    });
    const originalHidden = select.hidden;
    const local = new AbortController();
    const { signal } = local;
    let destroyed = false;
    select.before(wrapper);
    wrapper.append(select);
    select.hidden = true;

    const segments = [...select.options].map((option, index) => {
        const label = document.createElement('label');
        label.className = 'yk-segment';
        const radio = document.createElement('input');
        radio.className = 'yk-segment-input';
        radio.type = 'radio';
        radio.id = `${id}-option-${index}`;
        radio.name = id;
        // 单选按钮只负责交互，表单值仍由原 select 提供。
        radio.setAttribute('form', id);
        const text = document.createElement('span');
        text.className = 'yk-segment-label';
        label.append(radio, text);
        wrapper.append(label);
        radio.addEventListener('input', event => event.stopPropagation(), { signal });
        radio.addEventListener('change', event => {
            event.stopPropagation();
            if (!radio.checked || radio.disabled || select.matches(':disabled')) return;
            const previous = select.value;
            select.selectedIndex = index;
            if (select.value !== previous) {
                select.dispatchEvent(new Event('input', { bubbles: true }));
                select.dispatchEvent(new Event('change', { bubbles: true }));
            }
            // 保存回调可能回滚选择，以原控件最终值为准。
            sync();
        }, { signal });
        radio.addEventListener('keydown', event => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            if (!event.repeat) radio.click();
        }, { signal });
        return { option, label, radio, text };
    });

    function focusTarget() {
        return segments.find(({ radio }) => radio.checked && !radio.disabled)?.radio
            ?? segments.find(({ radio }) => !radio.disabled)?.radio;
    }

    function sync() {
        if (destroyed) return;
        const disabled = select.matches(':disabled');
        wrapper.setAttribute('aria-disabled', String(disabled));
        for (const attribute of ['aria-label', 'aria-labelledby', 'aria-describedby', 'aria-required', 'aria-invalid']) {
            const source = select.getAttribute(attribute);
            if (source === null) wrapper.removeAttribute(attribute);
            else wrapper.setAttribute(attribute, source);
        }
        if (!select.hasAttribute('aria-labelledby') && !select.hasAttribute('aria-label') && labels.length) {
            wrapper.setAttribute('aria-labelledby', labels.map(({ label }) => label.id).join(' '));
        }
        if (select.required) wrapper.setAttribute('aria-required', 'true');
        segments.forEach(({ option, label, radio, text }, index) => {
            label.hidden = option.hidden || Boolean(option.closest('optgroup')?.hidden);
            radio.disabled = disabled || option.matches(':disabled') || label.hidden;
            radio.checked = index === select.selectedIndex;
            radio.tabIndex = select.tabIndex;
            radio.value = option.value;
            radio.setAttribute('aria-label', option.label);
            text.textContent = option.label;
        });
        const target = focusTarget();
        for (const { label } of labels) label.htmlFor = target?.id ?? select.id;
    }

    select.addEventListener('input', sync, { signal });
    select.addEventListener('change', sync, { signal });
    select.form?.addEventListener('reset', () => queueMicrotask(sync), { signal });
    const observer = new MutationObserver(sync);
    observer.observe(select, {
        subtree: true, characterData: true, childList: true, attributes: true,
        attributeFilter: ['disabled', 'hidden', 'label', 'selected', 'value', 'tabindex', 'required', 'aria-label', 'aria-labelledby', 'aria-describedby', 'aria-required', 'aria-invalid'],
    });
    sync();
    return {
        sync,
        focus() {
            sync();
            focusTarget()?.focus();
        },
        destroy() {
            if (destroyed) return;
            destroyed = true;
            local.abort();
            observer.disconnect();
            for (const { label, originalFor, originalId } of labels) {
                if (originalFor === null) label.removeAttribute('for');
                else label.setAttribute('for', originalFor);
                if (originalId === null) label.removeAttribute('id');
                else label.setAttribute('id', originalId);
            }
            select.hidden = originalHidden;
            wrapper.before(select);
            wrapper.remove();
        },
    };
}
