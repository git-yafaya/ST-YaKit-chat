// 校验结果由业务模块提供，界面只展示对应提示。
export function renderValidation(container, { errors = [], warnings = [] }) {
    const notices = [];
    for (const [type, messages, iconName] of [
        ['danger', errors, 'fa-circle-exclamation'],
        ['warning', warnings, 'fa-triangle-exclamation'],
    ]) {
        for (const message of messages) {
            const notice = document.createElement('div');
            notice.className = `yk-notice yk-notice--${type}`;
            const icon = document.createElement('i');
            icon.className = `fa-solid ${iconName}`;
            icon.setAttribute('aria-hidden', 'true');
            const text = document.createElement('span');
            text.textContent = message;
            notice.append(icon, text);
            notices.push(notice);
        }
    }
    container.replaceChildren(...notices);
}
