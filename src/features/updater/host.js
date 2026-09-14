// 调用时才读取安装路径与宿主模块，入口加载不触发更新相关操作。
export async function getUpdateTarget() {
    let extensionName;
    try {
        const root = new URL('../../../', import.meta.url);
        const folder = /^\/scripts\/extensions\/third-party\/([^/]+)\/$/.exec(root.pathname)?.[1];
        if (!folder) throw new Error();
        extensionName = decodeURIComponent(folder);
    } catch {
        throw new Error('无法识别本插件的安装目录');
    }

    // 拒绝后端 sanitize-filename 会改名的目录，避免更新到其他扩展。
    if (!extensionName || /[/?<>\\:*|"\x00-\x1f\x80-\x9f]/.test(extensionName)
        || /^\.+$/.test(extensionName) || /[. ]$/.test(extensionName)
        || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i.test(extensionName)
        || new TextEncoder().encode(extensionName).length > 255) {
        throw new Error('本插件安装目录名不支持在线更新');
    }

    let extensionTypes;
    try {
        ({ extensionTypes } = await import('/scripts/extensions.js'));
    } catch {
        throw new Error('无法读取酒馆扩展安装信息');
    }
    const type = extensionTypes?.[`third-party/${extensionName}`];
    if (type !== 'local' && type !== 'global') {
        throw new Error('无法确定本插件是个人安装还是全局安装');
    }
    const global = type === 'global';
    let canUpdate = true;
    if (global) {
        try {
            const { isAdmin } = await import('/scripts/user.js');
            if (typeof isAdmin !== 'function') throw new Error();
            canUpdate = Boolean(isAdmin());
        } catch {
            throw new Error('无法读取当前用户的更新权限');
        }
    }

    let headers;
    try {
        if (typeof globalThis.SillyTavern?.getContext !== 'function') throw new Error();
        const context = globalThis.SillyTavern.getContext();
        if (typeof context?.getRequestHeaders !== 'function') throw new Error();
        headers = context.getRequestHeaders();
        if (!headers || typeof headers !== 'object' || Array.isArray(headers)) throw new Error();
    } catch {
        throw new Error('无法读取酒馆请求头，请在酒馆中调用');
    }
    return { extensionName, global, canUpdate, headers };
}
