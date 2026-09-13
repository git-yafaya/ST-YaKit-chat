import { readSettings, updateSettings } from '../../shared/settings.js';

// 缺项补默认值，返回独立副本供生成器使用。
export function normalizeEpubPreferences(value = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError('EPUB 偏好必须是对象');
    }
    if (Reflect.ownKeys(value).some(key => !['floorsPerChapter', 'chapterNames'].includes(key))) {
        throw new TypeError('EPUB 偏好仅支持 floorsPerChapter 和 chapterNames');
    }
    const floorsPerChapter = Object.hasOwn(value, 'floorsPerChapter') ? value.floorsPerChapter : 2;
    const chapterNames = Object.hasOwn(value, 'chapterNames') ? value.chapterNames : [];
    if (!Number.isSafeInteger(floorsPerChapter) || floorsPerChapter <= 0) {
        throw new TypeError('每章楼层数必须是正整数');
    }
    if (!Array.isArray(chapterNames) || Array.from(chapterNames).some(name => typeof name !== 'string')) {
        throw new TypeError('章节名必须是字符串数组，空字符串使用默认名称');
    }
    return { floorsPerChapter, chapterNames: [...chapterNames] };
}

export function getEpubPreferences() {
    return normalizeEpubPreferences(readSettings().epub);
}

// 局部更新只保存 EPUB 偏好，其他设置由共享模块保留。
export function saveEpubPreferences(patch) {
    normalizeEpubPreferences(patch);
    return updateSettings(settings => {
        const preferences = normalizeEpubPreferences({ ...normalizeEpubPreferences(settings.epub), ...patch });
        settings.epub = preferences;
        return preferences;
    });
}
