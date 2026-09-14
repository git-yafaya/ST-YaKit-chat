# 纪实 · 仓库与公开接口说明

## 速查区

- **仓库是什么**：SillyTavern 扩展「纪实」（YaKit 系列）。「文本导出」页完整可用：导出预览、正则匹配（含识别最近两楼标签）、导出设置抽屉，导出 TXT / Markdown / EPUB；设置页可检查并在线更新本插件。
- **技术栈**：原生 JavaScript（ES Modules）+ 原生 CSS + Web Components（Shadow DOM），无构建步骤，无第三方依赖，酒馆直接加载。
- **入口文件**：`src/index.js`（`manifest.json` 的 `js`），组装并冻结 `globalThis.YaKitChat`，再调用界面总文件 `src/ui/panel/index.js` 的 `initPanelUI(api, getContext)`；样式入口 `src/ui/style.css`。
- **界面结构**：酒馆页面上是弹窗外壳（标题栏、页签、主题按钮）；面板内容渲染在独立 iframe `src/ui/page/index.html`，通过 `parent.YaKitChat.exportUI` 调用业务。
- **公开 API 一览**（均在 `globalThis.YaKitChat` 上，对象已冻结）：`version`；文本导出页接口 `exportUI.{getChatInfo, previewMessages, isValidRule, exportFile, onChatChanged, loadSettings, saveSettings, scanRecentTags}`；插件更新 `updater.{checkUpdate, update}`；既有函数 `updater` 的参数、返回与错误（两个函数都无参数，失败 reject 中文 `Error`）：

| 接口 | 返回 |
| --- | --- |
| `checkUpdate()` | `Promise<{isUpToDate, canUpdate}>` |
| `update()` | `Promise<{updated}>` |

| 情况 | 提示或返回 |
| --- | --- |
| 无法识别安装路径或目录名不能原样传给后端 | “无法识别本插件的安装目录”／“本插件安装目录名不支持在线更新” |
| 安装类型、权限模块或请求头未就绪 | “无法读取酒馆扩展安装信息”／“无法确定本插件是个人安装还是全局安装”／“无法读取当前用户的更新权限”／“无法读取酒馆请求头，请在酒馆中调用” |
| update 已知无权限 | “当前账号无权在线更新本插件” |
| HTTP 401，或 update 流程的 403 | “无法操作本插件，请检查登录状态和账号权限” |
| HTTP 404 | “找不到本插件目录，或酒馆未启用扩展功能” |
| HTTP 500 | 按失败阶段提示“检查插件更新失败（HTTP 500），请查看酒馆服务端日志”或“更新插件失败（HTTP 500），请查看酒馆服务端日志” |
| 其他非 200 状态 | 同上，替换 HTTP 状态数字 |
| 网络异常 | “无法连接酒馆，请检查网络后重试” |
| JSON 或必要字段错误 | “酒馆返回的插件更新信息格式不正确” |
| update 预检分支或提交为空 | “本插件缺少可更新的 Git 分支或提交，无法在线更新” |
| update 预检远端为空 | “本插件未配置远端仓库，无法在线更新” |

检查状态：

```js
(async () => {
    try {
        console.log(await globalThis.YaKitChat.updater.checkUpdate());
    } catch (error) {
        console.error(error.message);
    }
})();
```

以下代码会尝试实际更新本插件；业务返回结果后不刷新页面：

```js
(async () => {
    try {
        const { updated } = await globalThis.YaKitChat.updater.update();
        console.log(updated ? '纪实已更新' : '已经是最新版本');
    } catch (error) {
        console.error(error.message);
    }
})();
```

`readCurrentChat`、`filterMessages`、`cleanMessages`、`saveTxt`、`saveExport`、`getEpubPreferences`、`saveEpubPreferences`；副 API 配置与提示词管理函数（见第 6 节）。
- **当前还没做什么**：润色、API 管理两个页签只有占位卡片；预设页界面与 `presets` 业务已接入、尚未通过小主复测，文档暂不收录其契约；副 API 配置、提示词管理、EPUB 分章偏好没有界面；提示词注入组装未实现；不发起任何 AI 请求；不支持群聊。

## 仓库结构

```text
ST-YaKit-chat/
├── manifest.json           扩展声明：js 指向 src/index.js，css 指向 src/ui/style.css
├── src/
│   ├── index.js            入口：组装 YaKitChat，初始化界面
│   ├── features/
│   │   ├── text-export/        读取、类型过滤、正则清洗、三种格式生成与下载、文本导出页接口、标签扫描
│   │   ├── updater/            定位本插件安装目录、检查版本、在线更新本插件
│   │   ├── api-management/     副 API 配置的增删改查与校验（无界面）
│   │   └── prompt-management/  三类提示词的增删改查与校验（无界面）
│   ├── shared/             扩展设置读写、配置与提示词校验
│   └── ui/
│       ├── style.css       弹窗外壳样式
│       ├── panel/          界面总文件：魔法棒入口、弹窗外壳、页签、主题、跟随ST取色
│       ├── page/           iframe 面板页面：结构、公共逻辑、各页脚本与样式
│       ├── components/     组件库（按钮、输入框、下拉、开关、分段选择器、卡片、抽屉等）与主题色值
│       └── icons/          线条图标与主题插画
└── tests/                  本地自动化测试（不提交、不随扩展加载）
```

<details>
<summary>完整文件列表</summary>

```text
ST-YaKit-chat/
├── manifest.json
├── src/index.js
├── src/features/text-export/read-chat.js
├── src/features/text-export/filter-messages.js
├── src/features/text-export/clean-messages.js
├── src/features/text-export/export-common.js
├── src/features/text-export/export-txt.js
├── src/features/text-export/export-markdown.js
├── src/features/text-export/export-epub.js
├── src/features/text-export/epub-chapters.js
├── src/features/text-export/epub-preferences.js
├── src/features/text-export/save-export.js
├── src/features/text-export/export-ui.js
├── src/features/text-export/export-ui-settings.js
├── src/features/text-export/scan-recent-tags.js
├── src/features/updater/host.js
├── src/features/updater/index.js
├── src/features/api-management/index.js
├── src/features/prompt-management/index.js
├── src/shared/settings.js
├── src/shared/validation.js
├── src/ui/style.css
├── src/ui/panel/index.js
├── src/ui/panel/tavern-theme.js
├── src/ui/page/index.html
├── src/ui/page/style.css
├── src/ui/page/main.js
├── src/ui/page/export.js / export.css
├── src/ui/page/settings.js / settings.css
├── src/ui/page/preset.js / preset.css
├── src/ui/page/demo.js / demo.css
├── src/ui/components/embed-frame.js、icon.js、segmented.js、card.js、collapse.js、drawer.js、button.js、input.js、select.js、switch.js、toast.js、scrollbar.js、menu.js、modal.js、theme-list.js、themes.css
├── src/ui/icons/*.svg、src/ui/icons/theme/*.svg
├── README.md / Public.md
├── CLAUDE.md / AGENTS.md / CLAUDE.local.md
├── AGENT_LOG.md
└── .gitignore
```

`DESIGN.md`、`tests/`、`需求文档-*`、`技术交接-*`、`技术核对-*`、`技术评估-*`、`技术提案-*`、`审核-*`、`sillytavern_API.md` 属于本地资料，按 `.gitignore` 不提交。

</details>

## 加载与数据流

1. 酒馆按 `manifest.json` 加载 `src/index.js` 与 `src/ui/style.css`。
2. `src/index.js` 把公开函数和 `exportUI` 组装进冻结的 `globalThis.YaKitChat`，然后调用 `initPanelUI`。
3. `initPanelUI` 在魔法棒菜单（`#extensionsMenu`）加入「纪实」；菜单未就绪时等待宿主 `APP_READY`。
4. 点击后创建居中 `<dialog>`，内容区用 iframe 加载 `src/ui/page/index.html`。
5. 弹窗与 iframe 之间用消息通信：弹窗发 `dsh:tab`、`dsh:theme`、`dsh:nav`、`dsh:preload-font`（面板加载完后直接调用面板的 `window.dshReceive`，加载前用 `postMessage`）；面板用 `postMessage` 发 `dsh:set-theme`、`dsh:set-nav`。
6. 文本导出页（`src/ui/page/export.js`）：
   - 打开时 `loadSettings()` → `getChatInfo()` → `previewMessages(settings, 2)` → `scanRecentTags()`
   - 设置或规则变化：`saveSettings(settings)`，200ms 防抖后重新 `previewMessages`
   - 点击导出：`exportFile(settings)` → 成功提示「已导出 N 条消息」
   - `onChatChanged` 回调：刷新摘要、预览、标签
7. 设置页「插件更新」（`src/ui/page/settings.js`）：
   - 切到设置页时 `updater.checkUpdate()`，一分钟内不重复自动检查；已是最新或检查失败时按钮为「检查更新」，点击立即重新检查
   - 有新版本时点「更新」：`updater.update()` → `updated: true` 时提示并在约 1.2 秒后由界面 `parent.location.reload()`；`updated: false` 提示「已经是最新版本」
   - 失败：按钮下方提示框显示 `error.message`，可重试；未提供 `updater` 时不显示这一行

<details>
<summary>边界情况（以业务交接单为准）</summary>

**楼层与范围**

| 情况 | 实际行为 |
| --- | --- |
| 楼层编号 | `exportUI` 从 0 起算，区间包含两端；既有 `readCurrentChat` 仍从 1 起算 |
| `allFloors: true` | 忽略残留的 `start`/`end`，仍执行消息类型和正则过滤 |
| 指定范围 | 先 `Number` 转换，小数向零截断；空白、非数字、非有限值分别回退为首楼层、末楼层；颠倒时交换，再各自夹到有效范围；全部越界落到最近端点 |

**消息类型**

| 情况 | 实际行为 |
| --- | --- |
| 系统提示 | `is_system=true` 的消息（含隐藏的 AI、用户楼层）及 `extra.type='narrator'` 的旁白（含未隐藏旁白） |
| 用户台词 / AI 回复 | 其余消息按 `is_user` 区分 |
| 一致性 | 预览类别、类型筛选和三种文件的类别标注使用同一判定 |

**正则规则**

| 情况 | 实际行为 |
| --- | --- |
| 写法 | 支持裸 pattern 和 `/pattern/flags`；以 `/` 开头且后面还有 `/` 时，最后一个 `/` 分隔 pattern 与 flags |
| 空格与 flags | 不裁剪 pattern 首尾空格；匹配时补 `g`；无效语法、非法或重复 flags 的规则被忽略 |
| 无有效规则 | 删除与保留模式都透传原文 |
| 多规则 | 每条规则匹配原文，重叠及相邻范围合并，按原文顺序去重；零长度匹配不贡献正文 |
| 模式 | 删除模式去掉匹配部分；保留模式仅保留匹配部分 |

**预览与导出**

| 情况 | 实际行为 |
| --- | --- |
| 预览 | 保留清洗后的空条和原楼层号，缺失名称回退空字符串；不修改宿主原消息 |
| 导出 | 跳过清洗后 `trim()` 为空的消息，其余正文空白保持原样 |
| 无内容 | 全空或类型全关时 `exportFile` reject `Error('无内容')` |
| 群聊 / 无聊天 | reject `Error('仅支持单人聊天')` / `Error('请先在酒馆里打开一个聊天')` |
| 文件名 | 自定义名去首尾空白、去掉末尾已有的 TXT/MD/EPUB 后缀（不分大小写），路径及控制字符替换为下划线，去掉末尾点和空格，再补目标后缀；结果为空时用角色名加本地毫秒时间戳 |
| EPUB | 按最终非空消息顺序分章，复用已存 EPUB 偏好，默认每章 2 条、章节名为中文数字；书名与作者使用角色名；XML 不支持的正文字符会导致生成报错 |

**标签扫描（`scanRecentTags`）**

| 情况 | 实际行为 |
| --- | --- |
| 范围 | 聊天最后两条原文，含隐藏楼层；不受保存的范围、类型和规则影响；只读 |
| 识别 | 完整成对标签、显式自闭合标签、带属性的 HTML 块，支持属性引号中的 `>`；标签名支持 Unicode 字母、数字及 `_ : - .` |
| 大小写 | 英文名称统一小写，开闭标签大小写混用可配对 |
| 去重排序 | 同名去重，按第一次有效开始标签出现的位置排序 |
| 按钮文字 | 有完整成对写法时为 `<name>`，只有自闭合写法时为 `<name/>`；不显示属性 |
| 配对 | 每条消息独立配对，不跨楼层；孤立结束标签、未闭合开始标签不产生结果 |
| 规则 | `/pattern/gi` 字符串，同一名称的规则同时支持成对块和自闭合；成对规则匹配标签连同内容；同名成对嵌套只匹配最内层完整块 |
| 空结果 | 群聊、无聊天、空聊天或未识别到时返回 `[]`；非字符串正文跳过 |

**插件更新（`updater`）**

| 情况 | 实际行为 |
| --- | --- |
| 定位 | 从模块 URL 取得本插件实际目录，支持合法重命名目录；`extensionName` 传裸目录名，不含 `third-party/` |
| 个人 / 全局 | 按宿主导出的 `extensionTypes['third-party/<目录>']` 精确判定，个人传 `global:false`，全局传 `global:true`；全局须宿主 `isAdmin()` 为真 |
| 请求头 | 原样使用 `SillyTavern.getContext().getRequestHeaders()`，保留 JSON 类型与 CSRF |
| 检查 | 只 POST `/api/extensions/version`；无全局权限时不发请求，返回 `{isUpToDate:false, canUpdate:false}`，检查收到 403 时同样返回；分支、提交、远端地址均非空才 `canUpdate:true` |
| 非 Git 安装 | 宿主返回空字段与 `isUpToDate:true`，业务返回 `canUpdate:false`，界面优先显示「无法在线更新」 |
| 比较依据 | 当前 Git 分支与 origin 对应分支，不按 manifest 版本或发布标签 |
| 更新 | 每次重新定位、检查权限并请求版本；已是最新返回 `{updated:false}`，否则 POST `/api/extensions/update`；返回 `updated: !isUpToDate`（宿主值为拉取前状态） |
| 本地改动 | 宿主 git pull，不清理、暂存或丢弃本地改动；`canUpdate:true` 不保证拉取成功 |
| 通用 500 | 无 origin、远端鉴权、网络、Git 权限、本地改动阻止拉取等都可能是同一个 500，按未知失败处理，不推断原因；失败响应不保证磁盘没有变化 |
| 刷新 | 业务不刷新页面、不保存用户设置；刷新与自动检查节流由界面负责 |

**事件订阅（`onChatChanged`）**

使用宿主 `eventTypes`：`CHAT_CHANGED`、`CHAT_LOADED`、`CHAT_CREATED`、`CHAT_DELETED`、`MESSAGE_SENT`、`MESSAGE_RECEIVED`、`MESSAGE_EDITED`、`MESSAGE_UPDATED`、`MESSAGE_DELETED`、`MESSAGE_SWIPED`、`MESSAGE_SWIPE_DELETED`、`USER_MESSAGE_RENDERED`、`CHARACTER_MESSAGE_RENDERED`。回调无参数，在微任务中执行；卸载后移除监听并取消尚未开始的回调。

</details>

## 设置与主题

**导出设置**（`exportUI.saveSettings` 整组写入 `extensionSettings['ST-YaKit-chat'].exportUI`，并调用 `saveSettingsDebounced()`）

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| `allFloors` | `true` | 导出全部楼层 |
| `start` / `end` | `''` | 起止楼层（原字符串保存） |
| `types` | `{ ai: true, user: true, system: true }` | 三种消息类型开关 |
| `format` | `'txt'` | `txt` / `md` / `epub` |
| `labels` | `'with'` | `with` 带类别标注 / `plain` 仅正文 |
| `fileName` | `''` | 自定义文件名，空为默认名 |
| `mode` | `'delete'` | `delete` 删除匹配 / `keep` 只保留匹配 |
| `rules` | `[]` | 规则字符串数组（原样保存） |

EPUB 偏好默认 `{ floorsPerChapter: 2, chapterNames: [] }`，目前无界面。

**界面设置**（浏览器 `localStorage`）

| 键 | 默认 | 含义 |
| --- | --- | --- |
| `dsh-theme` | `fir` | 主题 id：`tavern`（跟随ST）、`light`、`dark`、`fir`、`fig`、`olive`、`orange` |
| `dsh-nav` | `auto` | 导航栏位置 `auto` / `top` / `bottom` |
| `dsh-theme-switch` | `auto` | 设置页主题选择区 `auto` / `icon` / `select` |
| `dsh-tavern-theme` | 首次使用时生成 | 「跟随ST」取色结果与美化指纹 |

**主题机制**

- 主题变量只在 `.dsh-scope` 内生效（`src/ui/components/themes.css`），不改动酒馆本身。
- 「跟随ST」由 `src/ui/panel/tavern-theme.js` 读取宿主 `--SmartTheme*` 最终值和实际字体，拼成主题变量写到弹窗上，并随 `dsh:theme` 发给 iframe；用美化名、各项颜色和美化 CSS 计算指纹，指纹不变时直接使用缓存。
- 「自动」判断电脑：`(hover: hover) and (pointer: fine) and (min-width: 768px)`。
- 界面规格以本地 `DESIGN.md` 为准。

## 公开 API

以下代码来自业务交接单原文，在已启用插件的酒馆顶层控制台运行。`exportUI` 的参数、返回与错误：

| 接口 | 参数、返回与错误 |
| --- | --- |
| `getChatInfo()` | 同步返回 `{status, floorCount}`。群聊为 `group/0`；无宿主、未选角色或缺少聊天数组为 `none/0`；单人聊天为 `ok/实际条数`，已选角色的空聊天为 `ok/0`。宿主读取异常向调用方抛出。 |
| `previewMessages(settings={}, count=2)` | 同步返回最后 `count` 条 `{floor,type,name,text}`，保持原顺序。`count` 必须为非负整数，0 返回空数组，否则非法值抛中文 `TypeError`。群聊、无聊天、空聊天及三类全关返回 `[]`；参数或消息结构错误抛出。 |
| `isValidRule(source)` | 同步返回 boolean。非字符串、空白或无效正则返回 false。 |
| `exportFile(settings={})` | 返回 `Promise<{count}>`，触发宿主下载后返回实际导出消息数。全空或全关类型 reject `Error('无内容')`；群聊 reject `Error('仅支持单人聊天')`；无聊天 reject `Error('请先在酒馆里打开一个聊天')`；其余校验、生成和下载错误原样传播。 |
| `onChatChanged(callback)` | 同步返回幂等 `unsubscribe()`；非函数抛中文 `TypeError`。宿主未提供事件系统时返回空操作卸载函数。回调无参数，在微任务中执行；同步异常和 Promise 拒绝记入控制台，不阻塞宿主。 |
| `loadSettings()` | 同步返回独立设置副本，尚未保存时返回 null。宿主设置未就绪、结构损坏或已存字段非法时抛错。 |
| `saveSettings(settings)` | 同步返回保存后的独立副本。缺项补默认，已提供字段校验类型和枚举，忽略未知字段；错误抛出。整组写入 `extensionSettings['ST-YaKit-chat'].exportUI`，保留其他模块设置，调用 `saveSettingsDebounced()`；排队失败回滚原设置。成功表示已提交给宿主保存队列。 |
| `scanRecentTags()` | 无参数，同步返回 `Array<{label:string,rule:string}>`。扫描最后两条原文，含隐藏楼层，不受保存的范围、类型与规则影响。群聊、无聊天、空聊天或未识别到时返回 `[]`，非字符串正文跳过；宿主读取异常抛出。只读，不保存设置或修改聊天。 |

读取保存设置并预览，不触发下载：

```js
(() => {
    const api = globalThis.YaKitChat.exportUI;
    const settings = api.loadSettings() ?? {};
    console.log(api.getChatInfo());
    console.log(api.isValidRule('/<think>[\\s\\S]*?<\\/think>/g'));
    console.table(api.previewMessages(settings, 2));
})();
```

保存「全部楼层、三类全开、无规则」的 TXT 设置，并执行一次下载：

```js
(async () => {
    const api = globalThis.YaKitChat.exportUI;
    const settings = {
        allFloors: true,
        start: '',
        end: '',
        types: { ai: true, user: true, system: true },
        format: 'txt',
        labels: 'with',
        fileName: '',
        mode: 'delete',
        rules: [],
    };
    try {
        api.saveSettings(settings);
        const result = await api.exportFile(settings);
        console.log(`已导出 ${result.count} 条消息`);
    } catch (error) {
        console.error(error.message === '无内容' ? '没有可导出的内容' : error.message);
    }
})();
```

订阅聊天变化，并在页面卸载时清理：

```js
(() => {
    const api = globalThis.YaKitChat.exportUI;
    const unsubscribe = api.onChatChanged(() => {
        console.log(api.getChatInfo());
        console.table(api.previewMessages(api.loadSettings() ?? {}, 2));
    });
    window.addEventListener('pagehide', unsubscribe, { once: true });
    return unsubscribe;
})();
```

扫描标签并使用第一条生成规则检查删除和保留预览，不保存设置或触发下载：

```js
(() => {
    const api = globalThis.YaKitChat.exportUI;
    const tags = api.scanRecentTags();
    console.table(tags);
    if (tags.length === 0) return;
    const { label, rule } = tags[0];
    console.log(label, api.isValidRule(rule));
    const settings = {
        allFloors: true,
        types: { ai: true, user: true, system: true },
        rules: [rule],
    };
    console.table(api.previewMessages({ ...settings, mode: 'delete' }, 2));
    console.table(api.previewMessages({ ...settings, mode: 'keep' }, 2));
})();
```

例如原文 `<thinking>内容</thinking><br/>` 返回两个条目，`label` 依次为 `<thinking>`、`<br/>`。

`readCurrentChat`、`filterMessages`、`cleanMessages`、`saveTxt`、`saveExport`、`getEpubPreferences`、`saveEpubPreferences` 及第 6 节列出的管理函数本次交接未更新契约，调用前以源码为准。

## 当前接入状态

**已实现（含界面，已通过小主复测）**
- 文本导出页：导出预览、正则匹配、识别到的标签、导出设置抽屉（楼层范围、消息类型、格式、文件名）、TXT / Markdown / EPUB 导出；`exportUI` 八个接口全部接入
- 弹窗外壳：魔法棒入口、上方文字页签 / 下方图标导航、七套主题、设置页（插件更新、主题、导航栏位置、组件示例）
- 插件更新：`updater` 两个接口全部接入，无未接入业务项

**已接入、待小主复测**
- 预设页与导出页预设下拉框：界面调用 `presets` 接口（说明见 `src/ui/page/preset.js` 开头），复测通过后补充契约

**已实现但无界面**
- 副 API 配置管理（`src/features/api-management/`，已在 `YaKitChat` 上）：`getApiProfiles`、`validateApiConfig`、`shouldWarnEmptyKey`、`saveApiProfile`、`deleteApiProfile`、`selectApiProfile`、`getActiveApiConfig`
- 提示词管理（`src/features/prompt-management/`，已在 `YaKitChat` 上）：`getPromptTemplates`、`validatePromptTemplate`、`savePromptTemplate`、`deletePromptTemplate`、`selectPromptTemplate`、`getActivePrompt`
- EPUB 分章偏好（`getEpubPreferences` / `saveEpubPreferences`）：导出时读取已存偏好，无设置界面

**未实现**
- 润色、API 管理两个页签的内容（目前为占位卡片）
- 提示词注入组装、任何实际发起 AI 请求的能力
- 群聊支持

**依赖宿主接口**：`SillyTavern.getContext()`（聊天、角色、群组、`powerUserSettings`、`extensionSettings`、`saveSettingsDebounced`、`eventSource` / `eventTypes`）；`/scripts/utils.js` 的下载与 UUID；EPUB 懒加载 `/lib/jszip.min.js`；宿主 `--SmartTheme*` CSS 变量（跟随ST）；插件更新使用 `/scripts/extensions.js` 导出的 `extensionTypes`、`/scripts/user.js` 的 `isAdmin()`、`getRequestHeaders()`，并调用后端 `POST /api/extensions/version`、`POST /api/extensions/update`。无第三方依赖。

**版本门槛**：按本地 SillyTavern 1.18.0 源码核对宿主契约并完成人工验收，其他版本未单独验证。标签扫描使用 Unicode 属性正则，生成规则使用 RegExp 后行断言，需要支持这两项的浏览器。

## 开发与验证

- **分工**：Claude 负责界面代码（`src/ui/`）、README.md / Public.md / DESIGN.md 与设计一致性核对；Codex 负责业务逻辑（`src/features/`、`src/shared/`）与业务测试；入口文件改动由小主协调；界面与业务通过接口说明对接，不共同修改同一文件。
- **验收方式**：业务由 Codex 自测（不使用浏览器），界面由 Claude 在浏览器中自测，再由小主整体复测。
- **构建**：不涉及，浏览器直接加载 ES 模块；插件须在酒馆扩展设置中启用。
- **协作记录**：关键节点见 `AGENT_LOG.md`。
