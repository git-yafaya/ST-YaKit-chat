import { parseNotices, compareVersions, isValidVersion } from './parse.js';
import { readInstalledNotice, readRepositoryNotice } from './source.js';

async function listInstalled() {
    const text = await readInstalledNotice();
    return text === null ? [] : parseNotices(text);
}

async function fetchNewer() {
    // 固定调用时的版本，等待期间更新界面不会改变本次筛选结果。
    const version = globalThis.YaKitChat?.version;
    if (!isValidVersion(version)) throw new Error('当前插件版本号格式不正确，无法比较更新公告');
    return parseNotices(await readRepositoryNotice()).filter(entry => compareVersions(entry.version, version) > 0);
}

export const notice = Object.freeze({ listInstalled, fetchNewer });
