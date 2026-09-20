import { normalizeEpubPreferences } from './epub-preferences.js';
import { validateMessages } from './export-common.js';

function chineseNumber(value) {
    for (const [unit, name] of [[100000000, '亿'], [10000, '万'], [1000, '千'], [100, '百'], [10, '十']]) {
        if (value < unit) continue;
        const rest = value % unit;
        return chineseNumber(Math.floor(value / unit)) + name
            + (rest ? (rest < unit / 10 ? '零' : '') + chineseNumber(rest) : '');
    }
    return '零一二三四五六七八九'[value];
}

export function createEpubChapters(messages, preferences = {}) {
    validateMessages(messages, 'plain');
    const { floorsPerChapter, chapterNames } = normalizeEpubPreferences(preferences);
    const chapters = [];
    // 按最终消息顺序计数，过滤造成的原楼层空缺不占位置。
    for (let offset = 0; offset < messages.length; offset += floorsPerChapter) {
        const index = chapters.length;
        const customName = chapterNames[index];
        // 默认标题与界面占位一致：999 章以内用中文，1000 章起用数字。
        const number = index + 1;
        chapters.push({
            name: customName?.trim() ? customName : `第${number < 1000 ? chineseNumber(number).replace(/^一十/, '十') : number}章`,
            messages: messages.slice(offset, offset + floorsPerChapter),
        });
    }
    return chapters;
}
