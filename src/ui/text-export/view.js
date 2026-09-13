// 这里只构建界面，交互与导出由控制器处理。
export function createPageView() {
    const page = document.createElement('div');
    page.id = 'yk-text-export-page';
    page.className = 'yk-export-page';
    page.innerHTML = `
        <div class="yk-notice yk-notice--warning" data-role="group-notice" hidden>
            <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
            <span>仅支持单人聊天</span>
        </div>
        <form class="yk-form" data-role="form">
            <div class="yk-page-scroll">
                <details class="yk-card yk-drawer" aria-labelledby="yk-range-title">
                    <summary class="yk-drawer-heading">
                        <h2 id="yk-range-title" class="yk-card-title">楼层范围</h2>
                        <i class="fa-solid fa-chevron-down yk-drawer-arrow" aria-hidden="true"></i>
                    </summary>
                    <div class="yk-drawer-body">
                        <div class="yk-field">
                            <label class="yk-label" for="yk-all">导出全部楼层</label>
                            <label class="yk-switch" for="yk-all">
                                <input id="yk-all" class="yk-input" name="all" type="checkbox" role="switch" checked aria-label="导出全部楼层">
                                <span class="yk-switch-track" aria-hidden="true"><span class="yk-switch-thumb"></span></span>
                            </label>
                        </div>
                        <div class="yk-fields yk-range-fields" data-role="range-fields" hidden>
                            <div class="yk-field">
                                <label class="yk-label" for="yk-start">起始楼层</label>
                                <input id="yk-start" class="yk-input" name="start" type="number" step="1" required>
                            </div>
                            <div class="yk-field">
                                <label class="yk-label" for="yk-end">结束楼层</label>
                                <input id="yk-end" class="yk-input" name="end" type="number" step="1" required>
                            </div>
                        </div>
                        <p class="yk-help" data-role="range-summary" aria-live="polite"></p>
                    </div>
                </details>
                <details class="yk-card yk-drawer" aria-labelledby="yk-types-title">
                    <summary class="yk-drawer-heading">
                        <h2 id="yk-types-title" class="yk-card-title">消息类型</h2>
                        <i class="fa-solid fa-chevron-down yk-drawer-arrow" aria-hidden="true"></i>
                    </summary>
                    <div class="yk-drawer-body">
                        <div class="yk-fields">
                            <div class="yk-field">
                                <label class="yk-label" for="yk-ai">AI回复</label>
                                <label class="yk-switch" for="yk-ai">
                                    <input id="yk-ai" class="yk-input" name="ai" type="checkbox" role="switch" checked aria-label="AI回复">
                                    <span class="yk-switch-track" aria-hidden="true"><span class="yk-switch-thumb"></span></span>
                                </label>
                            </div>
                            <div class="yk-field">
                                <label class="yk-label" for="yk-user">用户台词</label>
                                <label class="yk-switch" for="yk-user">
                                    <input id="yk-user" class="yk-input" name="user" type="checkbox" role="switch" checked aria-label="用户台词">
                                    <span class="yk-switch-track" aria-hidden="true"><span class="yk-switch-thumb"></span></span>
                                </label>
                            </div>
                            <div class="yk-field">
                                <label class="yk-label" for="yk-system">系统提示</label>
                                <label class="yk-switch" for="yk-system">
                                    <input id="yk-system" class="yk-input" name="system" type="checkbox" role="switch" checked aria-label="系统提示">
                                    <span class="yk-switch-track" aria-hidden="true"><span class="yk-switch-thumb"></span></span>
                                </label>
                            </div>
                        </div>
                        <p class="yk-help" data-role="types-notice" aria-live="polite" hidden>请至少选择一种消息类型</p>
                    </div>
                </details>
                <details class="yk-card yk-drawer" aria-labelledby="yk-rules-title">
                    <summary class="yk-drawer-heading">
                        <h2 id="yk-rules-title" class="yk-card-title">正则清洗</h2>
                        <i class="fa-solid fa-chevron-down yk-drawer-arrow" aria-hidden="true"></i>
                    </summary>
                    <div class="yk-drawer-body">
                        <div class="yk-field">
                            <label class="yk-label" for="yk-mode">模式</label>
                            <select id="yk-mode" class="yk-input" name="mode" data-control="segments">
                                <option value="remove">删除匹配到的内容</option>
                                <option value="keep">只保留匹配到的内容</option>
                            </select>
                        </div>
                        <div class="yk-rules" data-role="rules"></div>
                        <button type="button" class="yk-button" data-action="add-rule">添加规则</button>
                    </div>
                </details>
            </div>
            <div class="yk-export yk-page-actions">
                <div class="yk-field">
                    <label class="yk-label" for="yk-file-type">文件格式</label>
                    <select id="yk-file-type" class="yk-input" name="fileType" data-control="segments">
                        <option value="txt">TXT</option>
                        <option value="md">Markdown</option>
                        <option value="epub">EPUB</option>
                    </select>
                </div>
                <div class="yk-field">
                    <label class="yk-label" for="yk-format">标注方式</label>
                    <select id="yk-format" class="yk-input" name="format" data-control="segments">
                        <option value="speaker">带类别标注（AI：/用户：/系统：）</option>
                        <option value="plain">仅正文</option>
                    </select>
                </div>
                <button type="submit" class="yk-button yk-button--primary" data-action="export">导出</button>
            </div>
        </form>
    `;
    return page;
}

export function createRuleRow(id) {
    const row = document.createElement('div');
    row.className = 'yk-rule';
    row.dataset.role = 'rule';
    row.innerHTML = `
        <div class="yk-rule-controls">
            <input class="yk-input" type="text" data-role="pattern" aria-label="正则表达式" spellcheck="false" autocomplete="off">
            <button type="button" class="yk-button yk-icon-button" data-action="remove-rule" aria-label="删除规则">
                <i class="fa-solid fa-trash" aria-hidden="true"></i>
            </button>
        </div>
        <div class="yk-notice yk-notice--danger" data-role="rule-error" aria-live="polite" hidden>
            <i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>
            <span>这条规则无效，已忽略</span>
        </div>
    `;
    // 标识用属性赋值，不把参数拼进 HTML。
    const error = row.querySelector('[data-role="rule-error"]');
    error.id = `yk-rule-error-${id}`;
    row.querySelector('[data-role="pattern"]').setAttribute('aria-describedby', error.id);
    return row;
}
