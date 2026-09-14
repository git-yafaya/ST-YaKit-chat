// 在 URL 解析前检查原字符，保留正常中文路径和国际化域名。
export function getServiceUrlCharacterError(value) {
    return typeof value === 'string' && /[\uff01-\uff5e\uffe0-\uffe6\ufeff]|(?=[^\x00-\x7f])\p{White_Space}/u.test(value)
        ? '服务地址里有全角符号或特殊空格，请改成半角' : '';
}
