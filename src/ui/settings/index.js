import { createApiSettingsCard } from './api.js';
import { createPromptSettingsCards } from './prompts.js';
import { createAppearanceCard } from './appearance.js';
import { createEpubSettingsCard } from './epub.js';

export function createSettingsPage(api, notify) {
    const page = document.createElement('div');
    page.className = 'yk-settings-page yk-page-scroll';
    const prompts = document.createElement('details');
    prompts.className = 'yk-card yk-settings-card yk-drawer';
    prompts.setAttribute('aria-labelledby', 'yk-prompts-title');
    prompts.innerHTML = `
        <summary class="yk-drawer-heading">
            <h2 id="yk-prompts-title" class="yk-card-title">提示词设置</h2>
            <i class="fa-solid fa-chevron-down yk-drawer-arrow" aria-hidden="true"></i>
        </summary>
        <div class="yk-drawer-body"></div>
    `;
    // 直接挂载三类抽屉，保留各自的表单与交互。
    prompts.querySelector('.yk-drawer-body').append(...createPromptSettingsCards(api, notify));
    page.append(createAppearanceCard(notify), createApiSettingsCard(api, notify), prompts,
        createEpubSettingsCard(api, notify));
    return page;
}
