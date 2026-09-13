import { THEME_OPTIONS, getTheme, setTheme } from '../shared/theme.js';

export function createAppearanceCard(notify) {
    const card = document.createElement('details');
    card.className = 'yk-card yk-settings-card yk-drawer';
    card.setAttribute('aria-labelledby', 'yk-appearance-title');
    card.innerHTML = `
        <summary class="yk-drawer-heading">
            <h2 id="yk-appearance-title" class="yk-card-title">界面</h2>
            <i class="fa-solid fa-chevron-down yk-drawer-arrow" aria-hidden="true"></i>
        </summary>
        <div class="yk-drawer-body">
            <div class="yk-field">
                <label class="yk-label" for="yk-theme">主题</label>
                <select id="yk-theme" class="yk-input" name="theme" data-control="segments"></select>
            </div>
        </div>
    `;
    const select = card.querySelector('select');
    for (const { value, label } of THEME_OPTIONS) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        select.append(option);
    }
    select.value = getTheme();
    select.addEventListener('change', () => {
        try {
            setTheme(select.value);
            notify('已保存', 'success');
        } catch (error) {
            select.value = getTheme();
            notify(error.message, 'danger');
        }
    });
    return card;
}
