import { getUpdateTarget } from '../updater/host.js';

// 准备请求和读取正文共用期限；即使网络忽略取消信号，也按时结束等待。
async function withinDeadline(label, operation) {
    const controller = new AbortController();
    let timer;
    try {
        return await Promise.race([
            Promise.resolve().then(() => operation(controller.signal)),
            new Promise((_, reject) => {
                timer = setTimeout(() => {
                    reject(new Error(`${label}超时，请检查网络后重试`));
                    controller.abort();
                }, 20000);
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}

async function connect(url, options, message) {
    try {
        options.signal.throwIfAborted();
        return await fetch(url, options);
    } catch {
        throw new Error(message);
    }
}

export async function readInstalledNotice() {
    return withinDeadline('读取已安装公告', async signal => {
        const response = await connect(new URL('../../../NOTICE.md', import.meta.url), {
            credentials: 'same-origin', cache: 'no-store', signal,
        }, '读取已安装公告失败，请检查酒馆连接后重试');
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`读取已安装公告失败（HTTP ${response.status}），请检查酒馆登录状态后重试`);
        try { return await response.text(); }
        catch { throw new Error('读取已安装公告正文失败，请重试'); }
    });
}

// 只把公开 GitHub 仓库地址转换成无凭据的 Contents API 地址。
function repositoryNoticeUrl(remoteUrl, branch) {
    let path;
    const scp = /^git@github\.com:([^?#\s]+)$/.exec(remoteUrl);
    if (scp) {
        path = `/${scp[1]}`;
    } else {
        let remote;
        try { remote = new URL(remoteUrl); } catch {}
        if (remote?.hostname === 'github.com' && !remote.port && !/[?#\s]/.test(remoteUrl)
            && !remote.password && ((remote.protocol === 'https:' && !remote.username)
                || (remote.protocol === 'ssh:' && remote.username === 'git'))) {
            path = remote.pathname;
        }
    }
    const parts = /^\/([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+)\/?$/.exec(path || '');
    const repo = parts?.[2].replace(/\.git$/, '');
    if (!parts || !repo || /^\.+$/.test(repo)) {
        throw new Error('无法读取这个仓库的公告：目前只支持不带登录凭据的 GitHub 公开仓库');
    }
    const url = new URL(`https://api.github.com/repos/${parts[1]}/${repo}/contents/NOTICE.md`);
    url.searchParams.set('ref', branch);
    return url;
}

async function readRepositoryLocation() {
    return withinDeadline('读取公告仓库信息', async signal => {
        let target;
        try { target = await getUpdateTarget(); }
        catch (error) { throw new Error(`读取公告仓库信息失败：${error.message}`); }
        // version 不要求全局扩展的更新权限；宿主会 fetch origin，返回首个 remote 的 fetch 地址。
        const response = await connect('/api/extensions/version', {
            method: 'POST', headers: target.headers, credentials: 'same-origin', cache: 'no-store', signal,
            body: JSON.stringify({ extensionName: target.extensionName, global: target.global }),
        }, '读取公告仓库信息失败，无法连接酒馆，请检查网络后重试');
        if (response.status === 401 || response.status === 403) {
            throw new Error('读取公告仓库信息失败，请检查酒馆登录状态和账号权限');
        }
        if (response.status === 404) throw new Error('找不到本插件目录，或酒馆未启用扩展功能，无法读取新公告');
        if (!response.ok) throw new Error(`读取公告仓库信息失败（HTTP ${response.status}），请查看酒馆服务端日志`);
        let data;
        try { data = await response.json(); }
        catch { throw new Error('酒馆返回的公告仓库信息无法解析，请重试'); }
        if (typeof data?.remoteUrl !== 'string' || typeof data.currentBranchName !== 'string') {
            throw new Error('酒馆返回的公告仓库信息格式不正确，请重试');
        }
        if (!data.remoteUrl.trim() || !data.currentBranchName.trim()) {
            throw new Error('本插件缺少远端仓库或当前 Git 分支，无法读取新公告');
        }
        return repositoryNoticeUrl(data.remoteUrl, data.currentBranchName);
    });
}

export async function readRepositoryNotice() {
    const url = await readRepositoryLocation();
    return withinDeadline('读取新版本公告', async signal => {
        // GitHub 公开内容免登录；酒馆的请求头和凭据只留在同源请求中。
        const response = await connect(url, {
            headers: { Accept: 'application/vnd.github.raw+json' },
            credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', signal,
        }, '无法连接 GitHub 读取新公告，请检查网络；浏览器跨站限制也可能导致读取失败');
        if (response.status === 403 || response.status === 429) {
            throw new Error('GitHub 拒绝读取新公告或请求次数已达上限，请稍后重试');
        }
        if (response.status === 404) {
            throw new Error('找不到仓库当前分支的 NOTICE.md，仓库也可能是私有的，无法读取新公告');
        }
        if (!response.ok) throw new Error(`读取新版本公告失败（HTTP ${response.status}），请稍后重试`);
        try { return await response.text(); }
        catch { throw new Error('读取新版本公告正文失败，请重试'); }
    });
}
