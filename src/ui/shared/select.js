import { createSegmentedSelect } from './segmented.js';

const instances = new WeakMap();
let current;
let sequence = 0;

function sources(root) {
    return [...(root.matches?.('select.yk-input') ? [root] : []), ...root.querySelectorAll('select.yk-input')];
}

function createSelect(select) {
    const id = `yk-select-${++sequence}`;
    const wrapper = document.createElement('div');
    wrapper.className = 'yk-select';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.id = `${id}-trigger`;
    trigger.className = 'yk-input yk-select-trigger';
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', `${id}-list`);
    const value = document.createElement('span');
    value.className = 'yk-select-value';
    const arrow = document.createElement('i');
    arrow.className = 'fa-solid fa-chevron-down yk-select-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    trigger.append(value, arrow);
    const list = document.createElement('div');
    list.id = `${id}-list`;
    list.className = 'yk-select-list';
    list.setAttribute('role', 'listbox');
    list.setAttribute('popover', 'manual');
    list.setAttribute('aria-labelledby', trigger.id);
    const labels = [...select.labels].map(label => ({ label, original: label.getAttribute('for') }));
    const originalHidden = select.hidden;
    select.before(wrapper);
    wrapper.append(select, trigger, list);
    select.hidden = true;
    for (const { label } of labels) label.htmlFor = trigger.id;

    const local = new AbortController();
    let global;
    let dialog;
    let options = [];
    let rows = [];
    let active = -1;
    let opened = false;
    let destroyed = false;
    let exitTimer;
    let search = '';
    let lastTyped = 0;

    const enabled = index => index >= 0 && index < options.length
        && !options[index].matches(':disabled') && !options[index].hidden
        && !options[index].closest('optgroup')?.hidden;
    const usable = () => options.map((_, index) => index).filter(enabled);

    function highlight(index, scroll = true) {
        active = enabled(index) ? index : -1;
        rows.forEach((row, position) => row.classList.toggle('is-active', opened && position === active));
        if (!opened || active < 0) {
            trigger.removeAttribute('aria-activedescendant');
            return;
        }
        const row = rows[active];
        trigger.setAttribute('aria-activedescendant', row.id);
        if (!scroll) return;
        // 只滚动选项列表，避免把所在弹窗一起卷动。
        const rowRect = row.getBoundingClientRect();
        const listRect = list.getBoundingClientRect();
        const top = listRect.top + list.clientTop;
        const bottom = top + list.clientHeight;
        if (rowRect.top < top) list.scrollTop += rowRect.top - top;
        else if (rowRect.bottom > bottom) list.scrollTop += rowRect.bottom - bottom;
    }

    function position() {
        if (!opened) return;
        // 用稳定布局框定位，按钮按下缩放不改变浮层宽度。
        const rect = wrapper.getBoundingClientRect();
        if (!trigger.isConnected || !rect.width || !rect.height) {
            close(true);
            return;
        }
        const viewport = window.visualViewport;
        const left = (viewport?.offsetLeft ?? 0) + 8;
        const top = (viewport?.offsetTop ?? 0) + 8;
        const width = (viewport?.width ?? window.innerWidth) - 16;
        const bottom = top + (viewport?.height ?? window.innerHeight) - 16;
        if (rect.bottom < top || rect.top > bottom) {
            close(true);
            return;
        }
        list.style.width = `${Math.min(rect.width, Math.max(0, width))}px`;
        list.style.left = `${Math.max(left, Math.min(rect.left, left + width - Math.min(rect.width, width)))}px`;
        const below = Math.max(0, bottom - rect.bottom - 4);
        const above = Math.max(0, rect.top - top - 4);
        const upward = select.dataset.control !== 'segments' && list.scrollHeight + 2 > below && above > below;
        const available = upward ? above : below;
        list.style.maxHeight = `${available}px`;
        const height = Math.min(list.scrollHeight + 2, available);
        list.style.top = `${upward ? rect.top - height - 4 : rect.bottom + 4}px`;
    }

    function sync() {
        if (destroyed) return;
        options = [...select.options];
        rows = options.map((option, index) => {
            const row = document.createElement('div');
            row.id = `${id}-option-${index}`;
            row.className = 'yk-select-option';
            row.dataset.index = index;
            row.setAttribute('role', 'option');
            row.setAttribute('aria-selected', String(index === select.selectedIndex));
            row.setAttribute('aria-disabled', String(!enabled(index)));
            row.hidden = option.hidden || Boolean(option.closest('optgroup')?.hidden);
            row.textContent = option.label;
            return row;
        });
        list.replaceChildren(...rows);
        value.textContent = options[select.selectedIndex]?.label ?? '';
        trigger.disabled = select.matches(':disabled') || options.length === 0;
        trigger.tabIndex = select.tabIndex;
        for (const attribute of ['aria-label', 'aria-labelledby', 'aria-describedby', 'aria-required', 'aria-invalid']) {
            const source = select.getAttribute(attribute);
            if (source === null) trigger.removeAttribute(attribute);
            else trigger.setAttribute(attribute, source);
        }
        if (select.required) trigger.setAttribute('aria-required', 'true');
        if (trigger.disabled) close(true);
        position();
        highlight(enabled(select.selectedIndex) ? select.selectedIndex : usable()[0] ?? -1);
    }

    function hide() {
        clearTimeout(exitTimer);
        if (list.matches(':popover-open')) list.hidePopover();
        list.classList.remove('is-leaving');
        if (current === instance) current = null;
    }

    function close(immediate = false) {
        opened = false;
        trigger.setAttribute('aria-expanded', 'false');
        highlight(-1);
        search = '';
        global?.abort();
        global = null;
        clearTimeout(exitTimer);
        if (immediate || !list.matches(':popover-open') || matchMedia('(prefers-reduced-motion: reduce)').matches) hide();
        else {
            list.classList.add('is-leaving');
            exitTimer = setTimeout(hide, 200);
        }
    }

    function open() {
        if (destroyed || select.matches(':disabled')) return;
        if (current && current !== instance) current.close(true);
        clearTimeout(exitTimer);
        list.classList.remove('is-leaving');
        sync();
        if (trigger.disabled) return;
        opened = true;
        current = instance;
        trigger.setAttribute('aria-expanded', 'true');
        if (!list.matches(':popover-open')) list.showPopover();
        position();
        highlight(enabled(select.selectedIndex) ? select.selectedIndex : usable()[0] ?? -1);
        global?.abort();
        global = new AbortController();
        const signal = global.signal;
        // 完全离开祖先可见区域时关闭，忽略旧浮层的异步观察结果。
        const visibility = new IntersectionObserver(entries => {
            if (!signal.aborted && entries.some(entry => !entry.isIntersecting)) close(true);
        });
        signal.addEventListener('abort', () => visibility.disconnect(), { once: true });
        visibility.observe(trigger);
        const outside = event => {
            if (!wrapper.contains(event.target)) close();
        };
        document.addEventListener('pointerdown', outside, { capture: true, signal });
        document.addEventListener('focusin', outside, { capture: true, signal });
        document.addEventListener('scroll', event => {
            if (!list.contains(event.target)) position();
        }, { capture: true, signal });
        window.addEventListener('resize', position, { signal });
        window.visualViewport?.addEventListener('resize', position, { signal });
        window.visualViewport?.addEventListener('scroll', position, { signal });
        const host = select.closest('dialog');
        if (host && dialog !== host) {
            dialog = host;
            dialog.addEventListener('close', () => close(true), { signal: local.signal });
        }
        host?.addEventListener('cancel', event => {
            event.preventDefault();
            event.stopImmediatePropagation();
            close();
        }, { capture: true, signal });
    }

    function confirm(focus = true) {
        const index = active;
        const previous = select.value;
        close();
        if (enabled(index)) {
            select.selectedIndex = index;
            if (select.value !== previous) {
                select.dispatchEvent(new Event('input', { bubbles: true }));
                select.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
        // 控制器可能同步拒绝并回滚选择，以回调结束后的值为准。
        sync();
        if (focus) trigger.focus();
    }

    function move(distance) {
        const indices = usable();
        const currentIndex = indices.indexOf(active);
        highlight(indices[Math.max(0, Math.min(indices.length - 1, currentIndex + distance))] ?? -1);
    }

    function typeAhead(character) {
        const now = Date.now();
        search = now - lastTyped < 700 ? search + character.toLocaleLowerCase() : character.toLocaleLowerCase();
        lastTyped = now;
        const repeated = [...search].every(letter => letter === search[0]);
        const prefix = repeated ? search[0] : search;
        const start = active + (repeated ? 1 : 0);
        for (let offset = 0; offset < options.length; offset++) {
            const index = (Math.max(0, start) + offset) % options.length;
            if (enabled(index) && options[index].label.trimStart().toLocaleLowerCase().startsWith(prefix)) {
                highlight(index);
                break;
            }
        }
    }

    trigger.addEventListener('keydown', event => {
        const key = event.key;
        if (key === 'Escape' && opened) {
            event.preventDefault();
            event.stopPropagation();
            close();
        } else if (key === 'Tab' && opened) {
            confirm(false);
        } else if (key === 'Enter' || key === ' ') {
            event.preventDefault();
            if (!event.repeat) opened ? confirm() : open();
        } else if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp'].includes(key)) {
            event.preventDefault();
            const wasOpen = opened;
            if (!opened) open();
            if (key === 'Home' || (!wasOpen && key === 'ArrowUp')) highlight(usable()[0] ?? -1);
            else if (key === 'End') highlight(usable().at(-1) ?? -1);
            else if (key === 'ArrowUp' && event.altKey && wasOpen) confirm();
            else if (wasOpen && !event.altKey) move(key === 'PageDown' ? 10 : key === 'PageUp' ? -10 : key === 'ArrowDown' ? 1 : -1);
        } else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();
            if (!opened) open();
            typeAhead(key);
        }
    }, { signal: local.signal });
    trigger.addEventListener('click', () => opened ? close() : open(), { signal: local.signal });
    list.addEventListener('pointerdown', event => {
        if (event.target.closest('.yk-select-option')) event.preventDefault();
    }, { signal: local.signal });
    list.addEventListener('pointermove', event => {
        const row = event.target.closest('.yk-select-option');
        if (row && enabled(Number(row.dataset.index))) highlight(Number(row.dataset.index), false);
    }, { signal: local.signal });
    list.addEventListener('click', event => {
        const row = event.target.closest('.yk-select-option');
        if (!opened || !row || !enabled(Number(row.dataset.index))) return;
        highlight(Number(row.dataset.index), false);
        confirm();
    }, { signal: local.signal });
    select.addEventListener('input', sync, { signal: local.signal });
    select.addEventListener('change', sync, { signal: local.signal });
    select.form?.addEventListener('reset', () => queueMicrotask(sync), { signal: local.signal });
    const observer = new MutationObserver(sync);
    observer.observe(select, {
        subtree: true, childList: true, characterData: true, attributes: true,
        attributeFilter: ['disabled', 'hidden', 'label', 'selected', 'value', 'tabindex', 'required', 'aria-label', 'aria-labelledby', 'aria-describedby', 'aria-required', 'aria-invalid'],
    });
    const instance = {
        sync, close,
        focus: () => trigger.focus(),
        destroy() {
            close(true);
            destroyed = true;
            local.abort();
            observer.disconnect();
            for (const { label, original } of labels) {
                if (original === null) label.removeAttribute('for');
                else label.setAttribute('for', original);
            }
            select.hidden = originalHidden;
            wrapper.before(select);
            wrapper.remove();
        },
    };
    sync();
    return instance;
}

function createResponsiveSelect(select) {
    const narrow = matchMedia('(max-width: 768px)');
    const create = () => narrow.matches ? createSelect(select) : createSegmentedSelect(select);
    let control = create();

    function changePresentation() {
        // 跨断点只替换外观，原控件、取值和业务监听保持不变。
        const focused = select.parentElement.contains(document.activeElement);
        control.destroy();
        control = create();
        if (focused) control.focus();
    }

    narrow.addEventListener('change', changePresentation);
    return {
        sync: () => control.sync(),
        focus: () => control.focus(),
        close: immediate => control.close?.(immediate),
        destroy() {
            narrow.removeEventListener('change', changePresentation);
            control.destroy();
        },
    };
}

export function enhanceSelects(root) {
    for (const select of sources(root)) {
        if (!instances.has(select)) {
            // 固定选项按视口展示，动态记录继续使用下拉选择器。
            instances.set(select, select.dataset.control === 'segments'
                ? createResponsiveSelect(select) : createSelect(select));
        }
    }
}

export function syncSelect(select) {
    instances.get(select)?.sync();
}

export function focusSelect(select) {
    const instance = instances.get(select);
    if (instance) instance.focus();
    else select.focus();
}

export function closeSelects(root) {
    for (const select of sources(root)) instances.get(select)?.close?.(true);
}

export function destroySelects(root) {
    for (const select of sources(root)) {
        instances.get(select)?.destroy();
        instances.delete(select);
    }
}
