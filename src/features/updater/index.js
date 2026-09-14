import { getUpdateTarget } from './host.js';

async function request(action, target, allowForbidden = false) {
    let response;
    try {
        response = await fetch(`/api/extensions/${action}`, {
            method: 'POST',
            headers: target.headers,
            body: JSON.stringify({ extensionName: target.extensionName, global: target.global }),
        });
    } catch {
        throw new Error('无法连接酒馆，请检查网络后重试');
    }
    if (response.status === 403 && allowForbidden) return null;
    if (response.status === 401 || response.status === 403) {
        throw new Error('无法操作本插件，请检查登录状态和账号权限');
    }
    if (response.status === 404) {
        throw new Error('找不到本插件目录，或酒馆未启用扩展功能');
    }
    if (response.status !== 200) {
        const operation = action === 'version' ? '检查插件更新' : '更新插件';
        throw new Error(`${operation}失败（HTTP ${response.status}），请查看酒馆服务端日志`);
    }
    let data;
    try {
        data = await response.json();
    } catch {
        throw new Error('酒馆返回的插件更新信息格式不正确');
    }
    if (!data || typeof data.isUpToDate !== 'boolean'
        || (action === 'version' && ['currentBranchName', 'currentCommitHash', 'remoteUrl']
            .some(key => typeof data[key] !== 'string'))) {
        throw new Error('酒馆返回的插件更新信息格式不正确');
    }
    return data;
}

function unavailableReason(version) {
    if (!version.currentBranchName.trim() || !version.currentCommitHash.trim()) {
        return '本插件缺少可更新的 Git 分支或提交，无法在线更新';
    }
    if (!version.remoteUrl.trim()) return '本插件未配置远端仓库，无法在线更新';
    return '';
}

async function checkUpdate() {
    const target = await getUpdateTarget();
    if (!target.canUpdate) return { isUpToDate: false, canUpdate: false };
    const version = await request('version', target, true);
    if (!version) return { isUpToDate: false, canUpdate: false };
    return { isUpToDate: version.isUpToDate, canUpdate: !unavailableReason(version) };
}

async function update() {
    // 每次重新确认安装位置、权限和版本，避免沿用界面上次检查的结果。
    const target = await getUpdateTarget();
    if (!target.canUpdate) throw new Error('当前账号无权在线更新本插件');
    const version = await request('version', target);
    const reason = unavailableReason(version);
    if (reason) throw new Error(reason);
    if (version.isUpToDate) return { updated: false };
    const result = await request('update', target);
    // 宿主返回的是拉取前是否最新，不能当成拉取后的状态。
    return { updated: !result.isUpToDate };
}

export const updater = Object.freeze({ checkUpdate, update });
