import { createTextExportPage } from '../text-export/index.js';
import { createSettingsPage } from '../settings/index.js';
import { observeTheme } from '../shared/theme.js';
import { showToast } from '../shared/feedback.js';
import { enhanceSelects, closeSelects, destroySelects } from '../shared/select.js';

function openPanel(api, getContext) {
    if (document.getElementById('yk-chat-dialog')) return;
    const dialog = document.createElement('dialog');
    dialog.id = 'yk-chat-dialog';
    dialog.className = 'yk-chat yk-dialog';
    dialog.setAttribute('aria-labelledby', 'yk-panel-title');
    dialog.innerHTML = `
        <header class="yk-header">
            <h1 id="yk-panel-title" class="yk-title">纪实</h1>
            <button type="button" class="yk-button yk-icon-button" data-action="close" aria-label="关闭">
                <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
        </header>
        <div class="yk-tabs" role="tablist" aria-label="纪实功能">
            <button type="button" id="yk-tab-export" class="yk-button yk-tab" role="tab" aria-selected="true" aria-controls="yk-page-export" tabindex="0">文本导出</button>
            <button type="button" id="yk-tab-settings" class="yk-button yk-tab" role="tab" aria-selected="false" aria-controls="yk-page-settings" tabindex="-1">设置</button>
            <span class="yk-tab-indicator" aria-hidden="true"></span>
        </div>
        <section id="yk-page-export" class="yk-tab-panel" role="tabpanel" aria-labelledby="yk-tab-export" tabindex="0"></section>
        <section id="yk-page-settings" class="yk-tab-panel" role="tabpanel" aria-labelledby="yk-tab-settings" tabindex="0" hidden></section>
    `;
    const tablist = dialog.querySelector('[role="tablist"]');
    const tabs = [...tablist.querySelectorAll('[role="tab"]')];
    const pages = [...dialog.querySelectorAll('[role="tabpanel"]')];
    const indicator = tablist.querySelector('.yk-tab-indicator');
    const notify = (message, type) => showToast(message, type,
        document.getElementById('yk-chat-dialog') || document.body);
    let selectedIndex = 0;

    function updateIndicator() {
        const rect = tabs[selectedIndex].getBoundingClientRect();
        indicator.style.width = `${rect.width}px`;
        indicator.style.transform = `translateX(${rect.left - tablist.getBoundingClientRect().left}px)`;
    }

    function mountPage(index) {
        if (pages[index].hasChildNodes()) return;
        try {
            pages[index].append(index === 0
                ? createTextExportPage(api, getContext, notify)
                : createSettingsPage(api, notify));
            enhanceSelects(pages[index]);
        } catch (error) {
            // 单页加载失败仍保留导航和关闭按钮。
            const notice = document.createElement('div');
            notice.className = 'yk-notice yk-notice--danger';
            notice.setAttribute('role', 'alert');
            notice.innerHTML = '<i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i><span></span>';
            const message = error.message || '页面加载失败';
            notice.querySelector('span').textContent = message;
            pages[index].append(notice);
            notify(message, 'danger');
        }
    }

    function selectTab(index, focus = false) {
        if (selectedIndex !== index) closeSelects(dialog);
        selectedIndex = index;
        tabs.forEach((tab, position) => {
            const selected = position === index;
            tab.setAttribute('aria-selected', String(selected));
            tab.tabIndex = selected ? 0 : -1;
            pages[position].hidden = !selected;
        });
        // 每次打开只创建一份内容，切页保留尚未提交的表单。
        mountPage(index);
        updateIndicator();
        if (focus) tabs[index].focus();
    }

    function closePanel() {
        if (!dialog.open || dialog.classList.contains('is-leaving')) return;
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) dialog.close();
        else {
            dialog.classList.remove('is-entering');
            dialog.classList.add('is-leaving');
        }
    }

    tablist.addEventListener('click', event => {
        const index = tabs.indexOf(event.target.closest('[role="tab"]'));
        if (index !== -1) selectTab(index);
    });
    tablist.addEventListener('keydown', event => {
        const index = tabs.indexOf(event.target);
        if (index === -1) return;
        const destinations = {
            ArrowRight: (index + 1) % tabs.length,
            ArrowLeft: (index - 1 + tabs.length) % tabs.length,
            Home: 0,
            End: tabs.length - 1,
        };
        if (!Object.hasOwn(destinations, event.key)) return;
        event.preventDefault();
        selectTab(destinations[event.key], true);
    });
    dialog.querySelector('[data-action="close"]').addEventListener('click', closePanel);
    dialog.addEventListener('cancel', event => {
        event.preventDefault();
        closePanel();
    });
    dialog.addEventListener('toggle', event => {
        if (event.target.tagName === 'DETAILS' && !event.target.open) closeSelects(event.target);
    }, true);
    dialog.addEventListener('animationend', event => {
        if (event.target !== dialog) return;
        if (event.animationName === 'yk-dialog-leave') dialog.close();
        if (event.animationName === 'yk-dialog-enter') dialog.classList.remove('is-entering');
    });

    document.body.append(dialog);
    const stopTheme = observeTheme(dialog);
    const resizeObserver = new ResizeObserver(updateIndicator);
    resizeObserver.observe(tablist);
    tabs.forEach(tab => resizeObserver.observe(tab));
    dialog.addEventListener('close', () => {
        destroySelects(dialog);
        stopTheme();
        resizeObserver.disconnect();
        // 提示在关闭面板后继续显示至正常结束。
        for (const toast of dialog.querySelectorAll('.yk-toast')) document.body.append(toast);
        dialog.remove();
    }, { once: true });
    mountPage(0);
    dialog.showModal();
    updateIndicator();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) dialog.classList.add('is-entering');
}

export function initPanelUI(api, getContext) {
    const mount = () => {
        const menu = document.getElementById('extensionsMenu');
        if (!menu || document.getElementById('yk-text-export-menu')) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.id = 'yk-text-export-menu';
        button.className = 'list-group-item yk-menu-button';
        button.innerHTML = '<i class="fa-solid fa-file-lines extensionsMenuExtensionButton" aria-hidden="true"></i><span>纪实</span>';
        button.addEventListener('click', () => openPanel(api, getContext));
        menu.append(button);
    };
    // 沿用宿主就绪事件，兼容菜单晚于插件创建。
    if (document.getElementById('extensionsMenu')) mount();
    else {
        const { eventSource, eventTypes } = getContext();
        eventSource.once(eventTypes.APP_READY, mount);
    }
}
