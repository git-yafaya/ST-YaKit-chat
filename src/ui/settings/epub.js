export function createEpubSettingsCard(api, notify) {
    const card = document.createElement('details');
    card.className = 'yk-card yk-settings-card yk-drawer';
    card.setAttribute('aria-labelledby', 'yk-epub-title');
    card.innerHTML = `
        <summary class="yk-drawer-heading">
            <h2 id="yk-epub-title" class="yk-card-title">EPUB配置</h2>
            <i class="fa-solid fa-chevron-down yk-drawer-arrow" aria-hidden="true"></i>
        </summary>
        <div class="yk-drawer-body">
            <form class="yk-settings-editor" data-role="epub-form">
                <div class="yk-field">
                    <label class="yk-label" for="yk-epub-floors">每章楼层数</label>
                    <input id="yk-epub-floors" class="yk-input" name="floorsPerChapter" type="number" min="1" step="1" required>
                </div>
                <div class="yk-actions">
                    <button type="submit" class="yk-button yk-button--primary">保存</button>
                </div>
            </form>
        </div>
    `;
    const form = card.querySelector('[data-role="epub-form"]');
    const input = form.elements.namedItem('floorsPerChapter');
    input.value = api.getEpubPreferences().floorsPerChapter;
    form.addEventListener('submit', event => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        try {
            // 只保存本控件负责的偏好，其他字段由 API 保留。
            const saved = api.saveEpubPreferences({ floorsPerChapter: input.valueAsNumber });
            input.value = saved.floorsPerChapter;
            notify('已保存', 'success');
        } catch (error) {
            notify(error.message, 'danger');
        }
    });
    return card;
}
