# 纪实 · 仓库与公开接口说明

## 速查区

- **仓库是什么**：SillyTavern 扩展「纪实」（YaKit 系列），当前版本 v0.8.2。「文本导出」页：导出预览（看第几楼、全部楼层分批查看）、正则匹配（保留 / 替换 / 删除三组同时生效、整理标签抽屉、AI 辅助生成规则）、导出设置抽屉，导出 TXT / Markdown / EPUB / 酒馆聊天 JSONL（EPUB 可开「插画小说」插入柏宝绘、智绘姬图片）；「润色」页：按楼层分段让 AI 润色、首段试润色、截断续写、限速等待、结果按聊天保存到酒馆服务器、逐楼手改与选楼重做、润色新增楼层、本次任务（补充要求与参考材料）、携带世界书、导出成品；「预设」页：导出预设（可多套叠加）、文风预设、整体备份恢复；「API 管理」页（折叠列表）：副 API 配置、正则 / 润色助手接口与采样参数（含一键重置）、请求参数、自定义提示词（破限词 / 正则助手 / 润色助手三类各一个库，可多条、选一条在用）；「设置」页：在线更新本插件、更新公告、主题、导航栏、报错记录，页签右上角有提醒小圆点。
- **技术栈**：原生 JavaScript（ES Modules）+ 原生 CSS + Web Components（Shadow DOM），无构建步骤，无第三方依赖，酒馆直接加载。
- **入口文件**：`src/index.js`（`manifest.json` 的 `js`），组装并冻结 `globalThis.YaKitChat`，再调用界面总文件 `src/ui/panel/index.js` 的 `initPanelUI(api, getContext)`；样式入口 `src/ui/style.css`。入口目前直接引用多个业务模块，尚未收敛为「UI 总文件 + 业务总文件」两个引用。
- **界面结构**：酒馆页面上是弹窗外壳（标题栏、页签、主题按钮）；面板内容渲染在独立 iframe `src/ui/page/index.html`，通过 `parent.YaKitChat` 调用业务。
- **公开 API 一览**（均在 `globalThis.YaKitChat` 上，对象已冻结）：`version`；`exportUI`（文本导出、标签识别与正则 AI 辅助，11 个）；`polishUI`（润色，20 个）；`presets`（导出预设与备份，13 个）；`styles`（文风预设，9 个）；`apiUI`（API 配置、自定义提示词三类各一个库、助手、请求参数）；`updater.{checkUpdate, update}`；`notice.{listInstalled, fetchNewer}`；既有函数 `readCurrentChat`、`filterMessages`、`cleanMessages`、`saveTxt`、`saveExport`、`getEpubPreferences`、`saveEpubPreferences` 及底层副 API 配置与提示词管理函数。
- **当前还没做什么**：v0.7.0 的整理标签、三组规则、酒馆聊天导出与预设叠加只有离线测试和真实页面的只读核对，写入规则、叠加切换与导出文件都没在真实环境跑过（这些不需要 AI 请求，小主复测即可）；润色功能仍在测试中，已知可能出现回复格式不对、被模型拒绝、字数变少或效果不理想，世界书开关与重写后的提示词未经真实 API 对照测试；插画小说带图导出（含润色导出）、本次任务写入与请求组装、正则 AI 清洗后样本均只有离线测试和只读接入检查，未经真实 API 与整体复测；助手请求没有控制模型思考强度，带思考的模型在正则任务上可能消耗大量输出额度；真实模型润色全流程、服务器结果读写、文风与提示词写操作、采样参数实际送达、润色导出下载均未经真实 API 与整体复测（只有离线测试和只读接入核对）；远端更新公告读取未测通（本机 SSH 远端返回 HTTP 500）；assistant 预填充未实现；润色不支持群聊；「备份全部」不含 API 配置与密钥、助手接口与采样、请求参数、润色设置与结果；EPUB 分章偏好没有界面；入口文件结构未收敛。

## 仓库结构

```text
ST-YaKit-chat/
├── manifest.json           扩展声明：js 指向 src/index.js，css 指向 src/ui/style.css
├── NOTICE.md               更新公告，按版本从新到旧
├── src/
│   ├── index.js            入口：组装 YaKitChat，初始化界面
│   ├── features/
│   │   ├── text-export/        读取、类型过滤、正则清洗、三种格式生成与下载、文本导出页接口、标签扫描
│   │   ├── presets/            纪实预设的增删改查、单套文件导入导出、整体备份与恢复
│   │   ├── updater/            定位本插件安装目录、检查版本、在线更新本插件
│   │   ├── polish/             润色：设置与分段、生成与续写、串行执行、逐楼操作、服务器保存、导出
│   │   ├── styles/             文风预设的增删改查、单套文件导入导出与备份校验
│   │   ├── notice/             更新公告：本地与仓库 NOTICE.md 读取、解析与版本比较
│   │   ├── api-ui/             API 管理页接口：配置、固定提示词、助手、获取模型与测试连接
│   │   ├── api-management/     副 API 配置底层存储、校验与引用清理
│   │   ├── prompt-management/  提示词底层存储、校验与引用清理
│   │   └── assistant-management/ 正则 / 润色助手的接口选择、采样参数与请求组装所需解析
│   ├── shared/             扩展设置读写、校验、请求参数与超时、助手规则与标签说明、通用破限词、采样参数适配、服务地址检查
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
├── src/features/text-export/export-jsonl.js        酒馆聊天文件：只保留每层当前显示的回复，其他字段原样
├── src/features/text-export/epub-chapters.js
├── src/features/text-export/epub-preferences.js
├── src/features/text-export/save-export.js
├── src/features/text-export/export-ui.js
├── src/features/text-export/export-ui-settings.js
├── src/features/text-export/scan-recent-tags.js    标签识别：嵌套结构、同名合并、三套规则模板
├── src/features/text-export/ai-assist.js
├── src/features/text-export/ai-rules.js
├── src/features/text-export/ai-client.js
├── src/features/text-export/ai-legacy-client.js
├── src/features/text-export/illustrations.js      插画小说：识别柏宝绘 / 智绘姬标签、占位符、读取图片、润色时取出与补回
├── src/features/presets/index.js
├── src/features/presets/store.js
├── src/features/presets/schema.js
├── src/features/presets/files.js
├── src/features/updater/host.js
├── src/features/updater/index.js
├── src/features/polish/index.js、segments.js、generate.js、runner.js、floors.js、records.js、storage.js、task-inputs.js、export.js
├── src/features/styles/index.js
├── src/features/notice/index.js、parse.js、source.js
├── src/features/api-ui/index.js、profiles.js、prompts.js、core-prompts.js、assistants.js、connection.js
├── src/features/api-management/index.js
├── src/features/prompt-management/index.js
├── src/features/assistant-management/index.js
├── src/shared/settings.js
├── src/shared/validation.js
├── src/shared/ai-request.js
├── src/shared/assistant-prompts.js
├── src/shared/assistant-sampling.js
├── src/shared/builtin-prompts.js
├── src/shared/service-url.js
├── src/ui/style.css
├── src/ui/panel/index.js
├── src/ui/panel/tavern-theme.js
├── src/ui/page/index.html
├── src/ui/page/style.css
├── src/ui/page/main.js
├── src/ui/page/choice.js
├── src/ui/page/export.js / export.css
├── src/ui/page/ai-rules.js
├── src/ui/page/polish.js / polish.css
├── src/ui/page/style-preset.js
├── src/ui/page/notice.js / notice.css
├── src/ui/page/settings.js / settings.css
├── src/ui/page/preset.js / preset.css
├── src/ui/page/api.js / api.css
├── src/ui/page/demo.js / demo.css
├── src/ui/components/embed-frame.js、icon.js、segmented.js、card.js、collapse.js、drawer.js、button.js、input.js、select.js、switch.js、toast.js、scrollbar.js、modal.js、error-log.js、theme-list.js、themes.css
├── src/ui/icons/*.svg、src/ui/icons/theme/*.svg
├── README.md / Public.md / NOTICE.md
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
5. 弹窗与 iframe 之间用消息通信：弹窗发 `yakit:tab`、`yakit:theme`、`yakit:nav`、`yakit:preload-font`、`yakit:closed`（弹窗关闭时，面板收起全部抽屉；面板加载完后直接调用面板的 `window.yakitReceive`，加载前用 `postMessage`）；面板用 `postMessage` 发 `yakit:set-theme`、`yakit:set-nav`。
6. 文本导出页（`src/ui/page/export.js`）：
   - 打开时 `loadSettings()` → `getChatInfo()` → `previewMessages(settings, 2)`；标签入口行只按 `tagPlan` 写「已处理 N 个」，不做扫描
   - 设置或规则变化：`saveSettings(settings)`，200ms 防抖后重新 `previewMessages`
   - 起止楼层输入框 change：按 `floorCount` 收回越界值、颠倒时对调，写回输入框再保存
   - 放大查看：`previewMessages(settings, floorCount)`，界面每批渲染 20 条，滑到底部附近加载下一批；设置变化时重新获取；标题行「看第几楼」填了楼号时只显示该楼与前一条，放大预览自动滚到该楼
   - 整理标签抽屉：打开时按 `tagScan` 调 `scanTagTree({start,end})`（首次打开才识别，之后留着上次结果），每行一个下拉选处理方式，选择先存进草稿；「应用到规则」按上一次 `tagPlan` 撤掉旧规则、写入新规则并 `saveSettings`；手动输入的标签名走 `tagRules(name)`，识别结果里已有的不重复加
   - AI 辅助（`src/ui/page/ai-rules.js`）：打开抽屉 `getAiContext()`；生成 `suggestRules({request, mode, rules})`，期间锁住需求输入框；候选用 `isValidRule` 标无效，`previewMessages({...settings, rules: [...rules, ...有效候选]}, 2)` 预览；「添加到规则」由界面去重后写入并保存。关闭抽屉或弹窗不调用 `cancelSuggestRules`，生成继续，结果留在抽屉；抽屉关着时结束会提示，弹窗开着用面板提示消息，弹窗关着用宿主 `toastr`
   - 点击导出：`exportFile(settings)` → 成功提示「已导出 N 条消息」
   - `onChatChanged` 回调：刷新摘要、预览、标签入口行
   - 叠加多套预设时（预设页调用 `window.YaKitExportPage.setStacked(n)`）：规则输入框只读、删不掉，「添加规则」「AI 辅助」「应用到规则」禁用，卡片上写明原因
7. 润色页（`src/ui/page/polish.js`）：
   - 打开时 `loadSettings()`、`getContext()`、`presets.list()`、`styles.list()` + `getActiveId()`、`getJob()`；没有任务时 `planSegments(settings)` 显示按楼层的原文预览与「约 N 次请求」（段数），设置或导出页设置变化时重新分段
   - 首次 `getJob()` 可能同步返回 null 而服务器结果仍在读取，读回后由 `onJobChange` 推送；界面据此切换到结果视图
   - 「开始润色」`start(settings)` 只润色第 1 段后进入 `review`；「继续润色」`resume()`；「停止」`stop()`；整段「重新润色」`retrySegment(index)`；选中楼层后「重新润色选中的楼层」`estimateRedo(floors)` 显示次数，`redoFloors(floors)` 执行；逐楼修改 `editFloor(floor, text)`；「润色新增部分」`appendNew()`；「清空结果」`clearJob()`；全部段 done 后「导出」`exportFile({fileName})`
   - 润色设置抽屉：导出预设（`presetId`，含 `export`）、文风（直接调用 `styles.activate`，不锁定）、楼层范围、每次发送（`chunkMode` / `chunkFloors`）、文件名；已有任务时锁住导出预设、楼层范围、每次发送
   - 进度、限速倒计时（`waitUntil`）、首段完成 / 结束 / 自动停止的提示由界面根据任务快照完成；弹窗关着时用宿主 `toastr`
8. 预设（`src/ui/page/preset.js` 导出预设、`src/ui/page/style-preset.js` 文风预设）：
   - 卡片右上角分段切换「导出预设 / 文风预设」；「备份全部」「从备份恢复」在卡片上方
   - 导出预设：界面存进预设的内容是 `types / format / labels / illustrated / mode / rules / keepRules / replaceRules / tagPlan`，「已修改」按这几项比对；打开面板和切到预设页时 `list()` + `getActiveIds()`；点一行把这一套加进来或拿掉 → `activate(ids)` → 用返回的 settings 刷新导出页（`window.YaKitExportPage.replaceState`）；只用一套且有未保存改动时换预设先确认；「已修改」「保存」「还原」只在单套时显示，多套时行尾写「叠加中」；「更新预设」→ `update(activeId, content)`；叠加时底部按钮变成「存为新预设」；存为新预设：`suggestName()` 预填 → `create(name, content)` → `activate(新 id)`
   - 导出页底部下拉是多选（`<yakit-select multiple>`），按钮上写「N 套叠加」，`change` 事件取 `detail.values`
   - 文风预设：`styles.list()` + `getActiveId()`；点一行 `activate(id|null)`；新建 / 编辑抽屉输入时 `check(draft)`，保存 `save(draft)`；复制 `duplicate`、导出 `exportStyle`、删除 `remove`、导入 `importStyle(text)`；变化后派发 `yakit-style-change`，润色页刷新文风下拉
   - 导入 / 从备份恢复：界面选文件读文字 → `importPreset(text)` / 确认后 `restoreBackup(text)`；恢复后 `exportUI.loadSettings()` 刷新导出页，并应用返回的 `uiPrefs`
   - 备份全部：界面读取 `yakit-theme`、`yakit-nav`、`yakit-theme-switch` 作为 `uiPrefs` → `exportBackup(uiPrefs)`
9. 设置页（`src/ui/page/settings.js`、`src/ui/page/notice.js`）：
   - 「更新」：切到设置页时 `updater.checkUpdate()`，一分钟内不重复自动检查；已是最新或检查失败时按钮为「检查更新」；有新版本时「更新」→ `updater.update()` → `updated: true` 时约 1.2 秒后 `parent.location.reload()`；失败在按钮下方显示 `error.message`；未提供 `updater` 时不显示这一行
   - 「更新公告」按钮：打开抽屉先 `notice.listInstalled()`，再 `notice.fetchNewer()`，新版本条目标「还没更新」排在最上；读取失败显示危险提示框。面板加载后收到页签消息时，比较 `localStorage` 的 `yakit-notice-seen` 与 `YaKitChat.version`：记录存在且不同、已安装公告里有当前版本时自动弹出一次；没有记录（首次安装）只写入不弹
   - 「报错记录」：`YaKitErrorLog` 记录危险提示、页面脚本捕获的失败、面板与弹窗中未处理的报错（弹窗只记插件文件的错，浏览器 ResizeObserver 布局提示不记），存 `localStorage` 最多 50 条
   - 「设置」页签的提醒小圆点由弹窗外壳（`src/ui/panel/index.js`）管理：报错点比较 `yakit-error-log` 最新一条的时间与 `yakit-error-seen`；更新点在打开面板后空闲调 `updater.checkUpdate()`（一分钟内不重复，失败当作没有新版本且不记进报错记录），有新版本时再调 `notice.fetchNewer()` 取最高版本号，与 `yakit-update-seen` 比较（取不到版本号时退回本插件版本号）；设置页展开「报错记录」或「更新」那一行时只发 `postMessage({type:'yakit:alerts', seen:'error'|'update'})`，由弹窗写入对应的 seen；弹窗还监听 `yakit-error-log-change` 与 `storage` 事件
10. API 管理页（`src/ui/page/api.js`）：
   - 打开时 `listProfiles()` + `getActiveProfileId()`、`listCorePrompts()`、`getAssistant('regex'|'polish')`、`getRequestSettings()`
   - 配置抽屉：输入时 `checkProfile(draft)`，保存 `saveProfile(draft)`；「获取模型」`fetchModels(draft)`、「测试连接」`testConnection(draft)`
   - 助手卡片：三个下拉分别写 `setAssistant(kind, {profile})`、`{jailbreak}`、`{rules}`，选项来自 `listProfiles()` 与 `listPrompts('jailbreak'|kind)`，「跟随使用中」后面显示各自 `getActivePromptId` 指向那条的名字；采样参数输入框离开时 `setAssistant(kind, {sampling: {某项: 数字|null}})`，空着为 null
   - 自定义提示词卡片：分段切换 `jailbreak` / `regex` / `polish`，切换后 `listPrompts(kind)` + `getActivePromptId(kind)`；点某一行 `activatePrompt(kind, id)`；行尾按钮编辑、复制 `duplicatePrompt`、删除 `removePrompt`（内置那条不显示删除）；「新建提示词」和「编辑」共用一个抽屉（名称 + 正文），保存前 `checkPrompt(kind, draft)`，保存 `savePrompt(kind, draft)`，新建成功后自动 `activatePrompt`；只有内置那条显示「恢复默认」，点了把 `listCorePrompts()` 给的 `defaultText` 填进输入框（不直接写盘，保存才生效）；折叠行尾按 `listCorePrompts()` 的 `modified` 写「自定义 N 类 / 默认」
   - 参数卡片：超时离开输入框、重试点选即 `setRequestSettings(patch)`

<details>
<summary>边界情况</summary>

**楼层与范围**

| 情况 | 实际行为 |
| --- | --- |
| 楼层编号 | `exportUI` 从 0 起算，区间包含两端；既有 `readCurrentChat` 仍从 1 起算 |
| `allFloors: true` | 忽略残留的 `start`/`end`，仍执行消息类型和正则过滤 |
| 指定范围 | 先 `Number` 转换，小数向零截断；空白、非数字、非有限值分别回退为首楼层、末楼层；颠倒时交换，再各自夹到有效范围；全部越界落到最近端点 |

**消息类型**

| 情况 | 实际行为 |
| --- | --- |
| 系统提示 | 旁白 `extra.type='narrator'`；以及除下面 AI 例外外的已知宿主系统类型 |
| 用户台词 | 其余 `is_user` 真值 |
| AI 回复 | 助手问候 `assistant_message`、`comment` + `is_name` 真值的具名回复；缺少或未知类型 |
| 隐藏楼层 | 隐藏状态（`is_system`）不改变类别；历史无类型标记的系统消息无法与隐藏 AI 区分，不按名字或正文猜测 |
| `includeHidden` | 默认 true；false 时先排除当前 `is_system` 真值的楼层，再执行类型与规则筛选，不重编号 |
| 执行顺序 | 楼层范围 → includeHidden → 消息类型 → 正则清洗 |
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
| 无聊天 | 未选角色或缺聊天数组时 reject `Error('请先在酒馆里打开一个聊天')` |
| 文件名 | 自定义名去首尾空白、去掉末尾已有的 TXT/MD/EPUB 后缀（不分大小写），路径及控制字符替换为下划线，去掉末尾点和空格，再补目标后缀；结果为空时用角色名加本地毫秒时间戳 |
| EPUB | 按最终非空消息顺序分章，复用已存 EPUB 偏好，默认每章 2 条、章节名为中文数字；书名与作者使用角色名；正文按空行拆成多个 `<p>`，段内单换行由 `white-space: pre-wrap` 保留，回车（CR）统一成换行；带类别标注时标注只出现在该条消息的第一段；XML 不支持的正文字符会导致生成报错 |

**标签识别（`scanTagTree` / `tagRules`）**

| 情况 | 实际行为 |
| --- | --- |
| 范围 | `scanTagTree({start,end})` 按界面楼层号（从 0 起算）识别，含隐藏楼层；不填或非数字为全部楼层；填颠倒自动交换，超出范围夹到首尾楼层；空聊天返回 `{from:0,to:0,tags:[]}`；每 200 层让出主线程；只读 |
| 识别 | 完整成对标签、显式自闭合标签、带属性的 HTML 块，支持属性引号中的 `>`；标签名支持 Unicode 字母、数字及 `_ : - .`；注释与代码围栏里的标签同样算数（用户要靠规则把这些代码残留清出导出正文） |
| 大小写 | 英文名称统一小写，开闭标签大小写混用可配对 |
| 结构 | 每条消息独立用栈配对，不跨楼层；闭合时才计数，未闭合的开始标签不显示，它里面成对的子标签上提一层 |
| 同名 | 一个标签名在整棵树里只出现一次：放在它出现次数最多的那个上级下面，`count`（出现次数）与 `floors`（出现在多少层）合并；自己套自己不计入上级选择，互相套在对方里面时按次数多的一边定位置 |
| 排序 | 同一层按第一次有效开始标签出现的位置排序 |
| 显示文字 | 有完整成对写法时为 `<name>`，只有自闭合写法时为 `<name/>`；不显示属性 |
| 规则 | 每个节点给三套：`rule` 匹配整块（含标签），`innerRule` 只匹配标签里面的正文，`shellRules` 是开、闭、自闭合三条查找式（替换成空即去壳）；均为 `/pattern/gi` 字符串；同名成对嵌套只匹配最内层完整块 |
| 手动加 | `tagRules(name)` 现算同样结构的一项（`count`、`floors` 为 0，`children` 为空）；名字自动去掉首尾的尖括号和空白；非字符串或不合法名称返回 `null` |
| 空结果 | 无聊天、空聊天或未识别到时 `tags` 为 `[]`；非字符串正文跳过 |

**标签处理方式写成规则（界面行为）**

| 选择 | 写进哪一组 |
| --- | --- |
| 只要这段 | 保留组：`innerRule` |
| 删掉整块 | 替换组：`{find: rule, to: 换行 + 换行}`，删掉的位置留一个空行 |
| 只删标签 | 替换组：`shellRules` 每条替换成空 |

界面把选择存进 `tagPlan`，「应用到规则」时先按上一次的 `tagPlan` 撤掉标签生成的规则，再写入这次的；手写和 AI 加的规则不受影响。

**预设（`presets`）**

| 情况 | 实际行为 |
| --- | --- |
| 内容 | `content` 必须完整包含 `types`（三个开关都要有）、`format`、`labels`、`mode`、`rules`；可选 `illustrated`、`keepRules`、`replaceRules`、`tagPlan`（旧预设缺省补默认）；额外字段（含 `includeHidden`、`tagScan`）不进入预设，切换预设保留当前 `includeHidden`；允许三类全关、空规则、语法无效的正则文字 |
| 切换 | `activate(id)` 或 `activate([id,…])` 保存正在用的几套并把内容写入导出设置，保留 `allFloors/start/end/fileName`；尚无导出设置时先补默认值；其中任一 id 不存在时整体 reject `找不到指定预设`，已保存的选择不变 |
| 叠加 | 多套时按预设在 `list()` 里的先后合并（与传入顺序无关）：`rules`、`keepRules` 拼接去重，`replaceRules` 按 `find`+`to` 去重，`tagPlan` 按标签名后者覆盖，`types`/`format`/`labels`/`illustrated`/`mode` 由靠后的一套决定 |
| 取消预设 | `activate(null)` 或 `activate([])` 只清空选择，返回当前导出设置副本，不创建或改写已保存的 `exportUI` |
| 存储 | 预设库存 `{items, activeIds}`；旧数据里的单个 `activeId` 自动当成一套，备份文件同样兼容；`remove(id)` 只把这一套从 `activeIds` 里去掉，其余继续生效 |
| 新建 / 导入 / 复制 | 都不自动激活（界面在新建后自己调用 `activate`）；`update` 覆盖当前预设时不再改写导出设置 |
| 删除 | 删掉当前预设只清空当前 ID，导出设置不变；允许删光，没有默认预设 |
| 名称 | 去首尾空白后不能为空；业务无长度上限，界面输入框限 30 字；重名按去空白后完全相同判断，区分英文大小写 |
| 重名 | 新建、单套导入依次试 `名字(2)`、`名字(3)`；复制以 `原名 副本` 为基名，重名同样加序号；重命名与其他记录撞名失败，改成自己原名允许 |
| ID | `crypto.getRandomValues` 生成 4 个 Uint32 用连字符连接；改名不变；新建、复制、单套导入各生成新 ID，碰撞时拒绝写入并提示重试 |
| `suggestName` | 返回当前角色卡名称（去首尾空白）；未选角色、缺聊天数组、无有效名称返回空字符串；已选角色但聊天为空仍返回角色名；不创建、不查重 |
| 单套文件名 | 预设名中 `<>:"/\|?*`、U+0000–001F、U+007F–009F 逐个替换为 `_`，直接追加 `.yakit-preset.json`（`原始名称.md` → `原始名称.md.yakit-preset.json`）；文件内 `name` 保留原名 |
| 单套导入 | 可含开头 BOM；`type`、数字 `schemaVersion:1`、名称、完整内容必须合法；未知字段忽略；追加到末尾 |
| 备份文件名 | `纪实备份` + 本地毫秒时间戳 + `.yakit-backup.json` |
| 备份内容 | 全部导出预设及顺序、当前 ID、完整已保存导出设置（尚无时为默认值，含 `includeHidden`；旧备份缺项按 true 恢复）、界面传入的 `uiPrefs`、`styles:{items,activeId}`、`corePrompts:{jailbreak,regex,polish}`；不含 API 配置 / 密钥、助手接口与 sampling、请求参数、旧自建破限词、润色任务设置与服务器润色结果；`uiPrefs` 必须可完整表达为 JSON，拒绝 undefined、函数、非有限数字、BigInt、Date、循环引用、稀疏数组 |
| 恢复 | 写入前校验整个文件（版本、记录完整、名称与 ID 唯一、当前 ID 引用存在或为 null、完整导出设置、界面偏好、文风与固定提示词）；通过后一次覆盖 `presets`、`exportUI` 以及备份里有的文风与固定提示词，旧备份缺哪组就保留本机哪组，恢复空通用破限词会记编辑标记保持为空，其他模块设置保留；保留原 ID 与顺序，不重新应用当前预设（保留备份里的导出草稿）；校验失败不写入 |
| 保存 | 在副本上校验修改，宿主保存排队失败回滚；成功仅表示已交给宿主保存队列；所有返回值是独立副本，支持 iframe 传入对象 |

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

**API 配置与服务地址（`apiUI`）**

| 情况 | 实际行为 |
| --- | --- |
| 配置形状 | `{id?, name, url, key, model, provider}`，`provider` 为 `auto/openai/local`；列表不返回密钥，`getProfile` 与保存结果含该记录密钥 |
| 当前选择 | 只改变纪实的选择，未选副 API 时跟随主 API；不修改酒馆主 API 配置 |
| 名称 | 去首尾空白后 1–64 字，不含控制字符；去空白、转小写后查重；复制为「原名 副本」，重名加序号，必要时缩短前缀 |
| 地址 | HTTP / HTTPS，不含查询参数、锚点、内嵌账号密码或控制字符，保存去末尾斜杠；URL 解析前拒绝 U+FF01–FF5E、U+FFE0–FFE6 全角字符与非 ASCII 空白、U+FEFF，提示「服务地址里有全角符号或特殊空格，请改成半角」；中文路径与国际化域名保留，不自动改写 |
| 共用检查 | `checkProfile`、保存、`fetchModels`、`testConnection` 与副 API 辅助请求一致 |
| 模型 / 密钥 | 模型名不能为空、不能换行；密钥可空；HTTP 地址或疑似需要密钥的空密钥只给提醒，不阻止保存 |
| `fetchModels` | 用草稿地址与密钥经宿主 `/api/backends/chat-completions/status` 查询模型，不要求模型名，等待上限 10 秒 |
| `testConnection` | 必须有模型名（否则「请先填写模型名称」）；经宿主生成接口非流式发送 `Reply with OK.`，输出上限 64 tokens，收到非空文字返回 `{message:'连接成功，模型已回复'}`；等待使用 `timeoutSeconds`，不做格式重试 |
| 草稿请求 | 显式传 `reverse_proxy` 与 `proxy_password`，空密钥不回退主密钥，不保存草稿；错误不回显上游正文或密钥 |

**固定提示词、助手与采样参数**

| 情况 | 实际行为 |
| --- | --- |
| 固定三条 | `jailbreak` 通用破限词（system，完整正文，允许空 / 纯空白，空白时不发送 system）；`regex` 正则提示词、`polish` 润色提示词（user，只可编辑规则与要求，非空白）；每条返回 `{id,name,target,text,defaultText,modified}`，顺序固定 |
| 默认与修改 | `defaultText` 为源码默认原文；`modified` 用严格字符串不等、不 trim；恢复默认后 `text===defaultText`、`modified=false` |
| 消息组装 | system（仅通用正文非空白）+ 一条 user：助手规则 → 本次任务与材料标题 → 程序固定的标签说明 → 本次具体材料 → 程序固定的输出格式；标签说明与输出格式不因编辑规则而移除，模型是否遵循需真实测试；没有 assistant 预填充 |
| 正则材料 | 需求、delete/keep、已有规则（普通文字标题）及 `<sample floor="原楼号">原文</sample>`；样本为当前聊天最后一条可见 AI 楼层，不取隐藏楼层或旁白，不截断 |
| 润色材料 | 可选 `<style>` 文风、`<previous>` / `<next>` 前后参考（各最多 300 码点，优先已润色文）、`<original><floor n="原楼号">原文</floor></original>`；只输出对应 `<floor>` |
| 旧破限词 | 两个助手固定使用通用内置 id；旧 Gemini / DeepSeek 未编辑默认条目迁移为通用，改过的保留为普通记录，不进入助手请求；旧中文默认仅在无编辑标记且逐字匹配时更新为英文 |
| 助手接口 | `getAssistant(kind)` 返回 `{profile,sampling}`；profile 为 follow / main / 有效副 API id；旧悬空 profile 只读回退 follow，保存无效 id 拒绝；旧 jailbreak / prompt 字段保留但不参与，新 setter 传入拒绝 |
| `setAssistant` | 局部合并，两个助手独立；profile 改变不清 sampling；任一参数不合法或保存排队失败整个 patch 回滚；apiUI 返回中文 Error，不承诺保留内部 code / field |
| 采样范围 | temperature 0–2、topP 0–1、topK 0–9007199254740991 安全整数、frequencyPenalty / presencePenalty -2–2，均含端点；null 清该项，默认全 null；字符串、undefined、NaN/Infinity、未知字段拒绝 |
| 采样发送 | null 不发送，主 API 不继承酒馆预设对应值；主聊天补全经宿主参数构建后删除 null，Claude / Gemini / Vertex AI / AI21 / MiniMax 跳过两种惩罚；主文本补全 generic 跳过 topK；Kobold / Horde 跳过两种惩罚；副 API local 发送全部非 null，openai / auto 普通模型跳过 topK、o1/o3/o4 前缀跳过五项，gpt-5-chat-latest 保留温度、Top P 和两种惩罚，名称匹配 gpt-5.1/5.2/5.3/5.4 且非 chat-latest 保留温度与 Top P，其他含 gpt-5 的模型跳过五项；未知服务拒绝时按生成失败处理，不自动探测重发 |
| 生效时机 | 正则每次生成固定消息、接口、sampling、超时与重试；润色每轮开始固定接口、sampling、超时 / 重试，每次实际请求前重新读取当前文风与固定提示词 |

**AI 辅助（`getAiContext` / `suggestRules` / `cancelSuggestRules`）**

| 情况 | 实际行为 |
| --- | --- |
| 上下文 | `getAiContext()` 返回正则助手实际解析的 `{apiName, model, usingMainApi, jailbreakName}`，不含密钥或正文；通用破限词正文为空时 `jailbreakName` 为 null |
| 需求 | 去首尾空白后不能为空，`mode` 为 `delete/keep`，`rules` 为已有规则字符串数组；无聊天 reject「请先在酒馆里打开一个聊天」 |
| 样本 | 最近一条未隐藏的 AI 回复原文及楼层号，不应用导出范围、类型或规则；找不到时「当前聊天没有可参考的 AI 回复」；正文非字符串直接报错 |
| 快照 | 请求前固定接口、通用破限词、规则、样本、sampling 与参数，重试沿用；生成中改选择只影响下一次 |
| 提示顺序 | 见上方「固定提示词、助手与采样参数」：可选 system 通用破限词 + 一条完整 user；不展开宏，原文不裁剪，不发送完整聊天 |
| 输出协议 | 最多 3 组相邻的 `<rule>…</rule><explanation>…</explanation>`，组外文字忽略，不做实体解码；`/pattern/flags` 去外围空白，裸 pattern 规范为 `/g`；排除已有、批内去重 |
| 返回 | `{rules:[{rule, explanation}]}`；语法无效的候选仍返回，由界面标出并阻止添加；业务不保存设置 |
| 重试 | 每次尝试单独计时；只重试空文字、缺完整组、字段格式错误，原消息重发；网络、HTTP、额度、JSON 解析、超时、全部重复不重试 |
| 输出上限 | 正则主、副 API 通常 2048 tokens，不改全局设置；NovelAI 沿用宿主更低上限（可能 150 / 250），截断可能导致格式失败 |
| 支持的主 API | 聊天补全、文本补全、Kobold、NovelAI、Horde；副 API 走 OpenAI 兼容路径 |
| 关闭界面 | 生成继续，受超时约束；结果、输入锁定与通知由界面负责 |
| 显式停止 | `cancelSuggestRules()` 同步返回 undefined，无活动调用时静默；有活动调用时结束等待与后续重试，reject `Error('已停止生成')`、`code='AI_CANCELLED'`；新的有效 `suggestRules` 会替换旧调用，参数错误的新调用不打断原调用 |
| 上游中止 | 支持中止的请求会收到信号；KoboldCpp 文本接口只结束等待，原生 Kobold 不发全局停止，Horde 仅在取得任务 ID 后定向取消；不保证供应商计算或计费即时结束 |

**润色设置与分段（`polishUI`）**

| 情况 | 实际行为 |
| --- | --- |
| 范围 | 只支持单人聊天；无可用聊天或全部类型未勾选时 `planSegments` 可返回 `[]`；`start` 没有有效内容 reject「没有可润色的内容，请检查楼层、消息类型和清洗规则」 |
| 设置 | `{allFloors,start,end,presetId,chunkMode,chunkFloors,fileName}`；`loadSettings()` 未保存过返回 null |
| 处理顺序 | 楼层范围 → 隐藏标记 → 消息类型 → 正则清洗 → 去掉空白正文 → 按楼层数分段；楼号为 0 起算真实楼号，不重编号 |
| 楼层范围 | 起止为空或不能转有限数字分别取首 / 末楼；截去小数；颠倒交换；越界夹紧；范围内消息不是对象或正文不是字符串时给含楼号的中文错误 |
| 导出预设 | `presetId='export'` 用文本导出页当前已保存设置；其他值取该导出预设的 `types/mode/rules/format`；`includeHidden` 始终取导出页当前值；忽略 `labels`；预设被删或引用不存在时回退 `export`，不清空已有结果、查询不另行保存 |
| 清洗 | 规则为空或全部无效时不清洗；多条有效规则对原文匹配并合并区间，delete 删除并集、keep 保留并集；清洗后为空的楼层不计入 |
| 分段 | `quality=5`、`balanced=10`、`fewer=20` 层，`custom=chunkFloors`；一层不拆，不按字数提前切，末段可不足；`segment.chars` 仅展示（Unicode 码点，计入楼间双换行） |
| 自定义楼层 | `Number.isInteger(value) && value > 0`，无业务上限；否则 reject「自定义楼层数必须是正整数」，`error.field='chunkFloors'`；非法 chunkMode 给 `error.field='chunkMode'` |
| 旧设置 | 未给 chunkMode 而给 chunkFloors 按 custom；缺 chunkFloors 补 10；固定档位收到非法 chunkFloors 规范为 10；旧 `chunkSize` 不换算、不再保存，只有 chunkSize 时用 balanced/10；旧 clean 不为 false 且 cleanSource 为字符串时作为缺省 presetId，否则 export；旧 types/includeHidden/format/clean 不再控制润色 |
| 已保存任务 | 使用自己的 settings；旧服务器结果恢复时只规范设置，不重新分段；继续 / 整段重试沿用旧段，选楼重做 / 追加按任务规范后的档位 |

**润色执行（首段、续写、重试、停止）**

| 情况 | 实际行为 |
| --- | --- |
| 首段 | `start` 先建立全部分段并保存服务器任务，再只运行第 1 段；成功为 `review`（只有一段也 review），失败为 stopped 并给原因 |
| 返回时机 | `start/resume/retrySegment/redoFloors/appendNew` 返回准备完成后的快照，不等整轮生成结束；进度看 `getJob/onJobChange` |
| `resume` | 处理尚未 done 的楼层；每楼都已有结果时只补保存并归为 done，不请求模型 |
| 输出额度 | 每次润色请求 65535 token（含续写、格式重试、限速后重试）；不保证服务接受或实际生成这么长；NovelAI 受宿主上限 |
| 格式 | `<floor n="实际楼号">正文</floor>` 按输入顺序，每楼非空闭合，不能缺号、错号、重号、嵌套，结果外不能有额外文字 |
| 截断 | 只接纳此前完整楼层；缺失后续楼层需有 length 依据，半个起始标签或未闭合最后一楼按截断；未闭合局部文字不保存，下次从该楼原文重来；每轮续写至少要得到一个完整楼层，否则这一批失败 |
| 重试 | 格式失败按共享 retries 重试；网络 / HTTP 失败与超时不自动重发 |
| 限速 | 识别 429 与已知 rate-limit（`quota_error=true` 不算）；Retry-After 支持秒数和日期，缺失等 30 秒，至少 1 秒；单次超过 300 秒或同批累计超过 900 秒拒绝；等待期间 `waitUntil` 为毫秒时间戳，可 stop，不消耗格式重试 |
| 失败与结束 | 单批失败保留结果并继续后续批，连续两批失败停止整轮；`finished` 仍可能有 failed 段，导出前须全部 done |
| 并发与停止 | 同时只允许一个生成轮次或保存修改操作，忙时其他操作拒绝；`stop()` 无运行任务时直接完成，保存准备期拒绝停止；停止保留完整结果并保存；不能保证所有服务立刻停止计算 |

**润色结果保存与切聊天**

| 情况 | 实际行为 |
| --- | --- |
| 身份 | 每个聊天一份：`JSON.stringify([groupId或null,角色avatar,chatId])`；角色文件或聊天文件改名后按新身份查找，不迁移旧文件 |
| 文件 | `user/files/ST-YaKit-chat-polish-<sha256(chatKey)>.json`（宿主 `/lib.js` 的 sha256）；封套 `{version:1,chatKey,record:{settings,sourcePrefix,job}}`；不写原聊天、不保存 API 密钥、不放浏览器持久存储 |
| 接口 | 上传 `POST /api/files/upload`（`{name,data}`，data 为 UTF-8 JSON 的 Base64）；读取 `/user/files/<文件名>` 禁缓存；删除 `POST /api/files/delete`（`{path:'user/files/<文件名>'}`）；同聊天读写删排队，每次 30 秒期限；读取 / 删除 404 视为不存在 / 已删除 |
| 保存点 | 新任务、整段重试、手动编辑、重做准备、追加先保存成功再替换内存；各批开始、完整楼层接收后、批结束、整轮结束、停止时保存；完整楼层落盘后才发下一次请求 |
| 保存失败 | 生成中保存失败停止继续请求，保留本页内存结果，`resume()` 先补保存；未落盘内容刷新后不能恢复；编辑失败不覆盖旧文，删除失败不清空内存 |
| 读取 | 首次 `getJob()` 同步返回 null 时可能仍在读取，读回后 `onJobChange` 通知；读取错误在后续 getJob / 操作时抛出；损坏记录不当作空任务覆盖，`clearJob()` 可删除损坏文件 |
| 刷新恢复 | 读回的 running 任务改为 stopped、清 waitUntil，不自动请求；旧 running 楼层有完整旧文恢复 done，否则 pending |
| 切聊天 | 触发刷新与读取；其他聊天正在生成时 getJob 返回那份并 `isCurrentChat=false`，结束后回到当前聊天结果；等待加载期间聊天切换时操作拒绝 |
| 错误码 | 文件层 `POLISH_LOAD/POLISH_SAVE/POLISH_DELETE`，另有具体中文原因 |

**逐楼修改、选楼重做、新增楼层、短文提醒与导出**

| 情况 | 实际行为 |
| --- | --- |
| `editFloor` | 当前聊天任务空闲时；floor 必须在任务中，text 必须非空白字符串，原样保存；可填尚未生成的楼层；保存后 done、edited=true，重算段汇总与短文标记 |
| 选楼分批 | `estimateRedo` 与 `redoFloors` 共用：非空楼号数组、非负整数且在任务内，去重升序，按任务档位楼层数合批；估算不含截断续写、格式重试、限速重试 |
| 衔接参考 | 每批连续楼号为一组，组前 / 后取相邻已保存楼层末 / 头 300 码点，优先润色文；参考不计入楼层数 |
| 选楼重做结果 | 保留旧文，收到该楼完整结果才覆盖并 edited=false；失败 / 停止时有旧文恢复 done、无旧文恢复 pending；未选楼不重生成 |
| 整段重试 | `retrySegment` 清空整段重新生成，会替换该段手改结果 |
| 短文提醒 | 润色正文去全部空白后的码点数严格少于清洗后原文同口径 50% 时 `floor.short=true`，汇总到 `segment.shortFloors`；只提醒 |
| 新增楼层 | `job.newFloors={count,from,to}|null` 只统计开始 / 上次追加之后新出现且符合任务范围、当前预设筛选与清洗的楼层；`appendNew()` 按任务档位追加并直接生成，不重跑首段试润色 |
| 阻止追加 | 旧楼原始正文、用户 / 隐藏 / 具名标记、extra.type 改变，或删除 / 换回复 / 中间插入时阻止追加，保留旧结果，提示清空后重新分段；手改、重做、导出仍针对保存的旧原文 |
| 导出 | `exportFile({fileName})` 格式取任务 presetId 指向预设导出时的最新 format（找不到回退导出页），旧 `format` 字段忽略；须无运行中生成且所有段 done、正文非空，不提供部分导出；返回 `{count}` 为段数；TXT / Markdown 只含正文，EPUB 每段一章「第 N 段」；省略 fileName 用任务保存值，空值用聊天名加时间戳；不回写原聊天 |

**文风预设（`styles`）**

| 情况 | 实际行为 |
| --- | --- |
| 形状 | `{id,name,text}`；初始空列表，activeId=null 为不使用；创建 / 复制 / 导入不自动启用；删除当前使用项立即变为不使用 |
| 名称与正文 | 名称 trim 后 1–64 个 UTF-16 代码单元，禁止控制字符，忽略大小写查重（界面输入框限 30 字）；正文非空白，原样保存；复制名「原名 副本」，冲突加序号；导入冲突为「原名(2)」等并生成新 id |
| 单套文件 | `{type:'ST-YaKit-chat/style',schemaVersion:1,name,text}`，扩展名 `.yakit-style.json`；坏文件拒绝 |
| 迁移 | 旧 `prompts.style` 直接作为文风库（id / 名称 / 正文不变）；首次快照优先迁移旧润色助手有效指定的 prompt，none 清当前文风，follow / 缺失 / 悬空保留原 activeId；`styleSelectionMigrated=true` 随下次成功保存落盘；旧文风提示词接口仍操作同一库 |
| 通知 | 列表或选择成功变更时在宿主窗口派发 `yakit-style-change` |

**更新公告（`notice`）**

| 情况 | 实际行为 |
| --- | --- |
| 本地 | `listInstalled()` 按实际安装路径读取根目录 NOTICE.md，支持目录改名；404 返回 `[]`，其他错误拒绝；20 秒期限 |
| 远端 | `fetchNewer()` 沿用 updater 安装定位，POST `/api/extensions/version` 取仓库地址与当前分支（宿主会执行 git fetch origin）；支持公开 GitHub HTTPS / git@ / ssh://git@ 地址，读取 Contents API 当前分支的 NOTICE.md；只返回版本高于 `YaKitChat.version` 的条目；定位与读取各 20 秒，不自动重试；私有仓库、网络 / CORS、GitHub 限额、缺分支或文件均报中文原因；请求不带酒馆 Cookie、CSRF 或模型密钥 |
| 解析 | 只识别 `## vX.Y.Z` 或 `## vX.Y.Z · YYYY-MM-DD`（日期须有效）；三段无前导零整数逐段比较，不支持预发布后缀；一级标题及之前内容忽略，坏块与空块跳过，同版本取第一份；`- ` 行为 item，其他非空行为 text，Markdown / HTML 原样交给界面；按版本降序 |

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
| `format` | `'txt'` | `txt` / `md` / `epub` / `jsonl`（酒馆聊天文件） |
| `labels` | `'with'` | `with` 带类别标注 / `plain` 仅正文 |
| `fileName` | `''` | 自定义文件名，空为默认名 |
| `mode` | `'delete'` | 界面在看哪一组：`delete` 删除 / `keep` 只保留 / `replace` 替换；三组始终同时生效 |
| `rules` | `[]` | 删除组，规则字符串数组（原样保存） |
| `keepRules` | `[]` | 保留组；旧设置里 `mode` 为 `keep` 时整组迁入 |
| `replaceRules` | `[]` | 替换组 `[{find,to}]`，`to` 里的 `{{match}}` 展开为整段匹配 |
| `tagPlan` | `[]` | 标签处理方式 `[{name, action}]`，`action` 为 `keep` / `delete` / `strip`；进导出预设 |
| `tagScan` | `{start:'', end:''}` | 「整理标签」上次填的识别楼层，只存界面状态，不进导出预设 |
| `includeHidden` | `true` | 是否导出隐藏楼层；非布尔值报「导出设置 includeHidden 类型不正确」；旧设置缺项补 true |

EPUB 偏好默认 `{ floorsPerChapter: 2, chapterNames: [] }`，目前无界面。

**预设库**（`extensionSettings['ST-YaKit-chat'].presets`，与 `exportUI` 同一命名空间）

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| `items` | `[]` | `[{ id, name, content }]`，按创建顺序 |
| `activeIds` | `[]` | 正在用的预设 ID，按列表顺序；多于一个即叠加。旧数据里的 `activeId` 自动当成一套 |

**API 管理**（同一命名空间，读取返回副本不保存；写入先校验，经 `saveSettingsDebounced()` 排队，失败回滚）

| 位置 | 默认 | 含义 |
| --- | --- | --- |
| `apiProfiles` | `{items:[], activeId:null}` | 副 API 配置与当前选择，未选时用主 API |
| `assistants[kind]` | `{ profile:'follow', jailbreak:'follow', rules:'follow', sampling }` | 每个助手各自选接口、破限词、本助手的提示词；`follow` 跟随对应库正在用的那条，`profile` 可为 `main`，`jailbreak` 可为 `none`，`rules` 必须有一条（选中的被删掉时回到内置那条） |
| `corePrompts` | 源码默认（jailbreak 英文纯文本，regex / polish 中文规则） | 固定三条提示词正文与编辑标记 |
| `prompts.jailbreak` | 通用内置条目 | 破限词库；助手请求用 `activeId` 指向的那条（没选过或选的被删了回到内置那条），正文为空时这次不发 |
| `prompts.regexAssist` / `prompts.polishAssist` | 各一条内置条目 | 正则助手、润色助手的提示词库；首次读取时把原来的 `corePrompts.regex` / `.polish` 迁进内置条目，内置条目不能删，删掉正在用的那条会回到内置那条 |
| `prompts.style` | `[]`，activeId null | 文风预设库（`styles` 接口操作） |
| `assistants.regex` / `assistants.polish` | `{profile:'follow', sampling:{五项 null}}` | 两个助手独立 |
| `requestSettings` | `{timeoutSeconds:360, retries:1}` | 超时 30–1800 整数秒，重试 0–3 |
| `polishUI` | `{allFloors:true,start:'',end:'',presetId:'export',chunkMode:'balanced',chunkFloors:10,fileName:''}` | 润色设置；`loadSettings()` 未保存过返回 null |

**润色其他默认与限制**

| 项目 | 默认值 / 规则 |
| --- | --- |
| 每次发送 | 重质量 5 层、均衡 10 层、省次数 20 层；自定义正整数，缺省 10，无业务上限 |
| 输出额度 | 润色每次 65535 token；正则 2048 token |
| 衔接参考 | 前末 / 后头各最多 300 个 Unicode 码点 |
| 短文提醒 | 去空白码点数严格小于原文 50% |
| 限速等待 | 默认 30 秒；单次最多 300 秒、同批累计最多 900 秒 |
| 服务器文件请求 | 30 秒期限，含读取正文 |
| 公告读取 | 本地 20 秒；远端定位与内容各 20 秒 |
| 文件格式版本 | 润色服务器封套 version=1；文风单套 / 完整备份 schemaVersion=1 |

普通设置成功仅确认进入宿主防抖保存队列；润色结果文件保存有独立服务器响应确认。

**界面设置**（浏览器 `localStorage`）

| 键 | 默认 | 含义 |
| --- | --- | --- |
| `yakit-theme` | `fir` | 主题 id：`tavern`（跟随ST）、`light`、`dark`、`fir`、`fig`、`olive`、`orange`、`miemie`（咩咩）、`neon`（霓虹夜城） |
| `yakit-nav` | `auto` | 导航栏位置 `auto` / `top` / `bottom` |
| `yakit-theme-switch` | `auto` | 设置页主题选择区 `auto` / `icon` / `select` |
| `yakit-tavern-theme` | 首次使用时生成 | 「跟随ST」取色结果与美化指纹 |
| `yakit-error-log` | 空 | 报错记录，最多 50 条，弹窗与面板共用 |
| `yakit-notice-seen` | 首次打开时写入当前版本 | 看过更新公告的版本号，判断更新后是否自动弹出 |
| `yakit-error-seen` | 无 | 看过报错记录时最新一条的时间戳，判断设置页签要不要点提醒小圆点 |
| `yakit-update-seen` | 无 | 看过「更新」那一行时仓库的新版本号（读不到公告时存本插件版本号），判断有新版本时要不要点提醒小圆点 |
| `yakit-demo` | 无 | 值为 `on` 时设置页显示组件示例 |

旧版本存在 `dsh-theme`、`dsh-nav`、`dsh-theme-switch`、`dsh-tavern-theme` 里的值，弹窗初始化时自动搬到对应的 `yakit-` 键（新键已有值时不覆盖），并删除旧键。

**主题机制**

- 主题变量只在 `.yakit-scope` 内生效（`src/ui/components/themes.css`），不改动酒馆本身。
- 「跟随ST」由 `src/ui/panel/tavern-theme.js` 读取宿主 `--SmartTheme*` 最终值和实际字体，拼成主题变量写到弹窗上，并随 `yakit:theme` 发给 iframe；用美化名、各项颜色和美化 CSS 计算指纹，指纹不变时直接使用缓存。
- 「自动」判断电脑：`(hover: hover) and (pointer: fine) and (min-width: 768px)`。
- 界面规格以本地 `DESIGN.md` 为准。

## 公开 API

以下代码在已启用插件的酒馆顶层控制台运行。`exportUI` 的参数、返回与错误：

| 接口 | 参数、返回与错误 |
| --- | --- |
| `getChatInfo()` | 同步返回 `{status, floorCount}`，`status` 只有 `ok` / `none`。有角色 ID 且聊天为数组时为 `ok/实际条数`，空聊天为 `ok/0`；无宿主、未选角色或缺少聊天数组为 `none/0`。宿主读取异常向调用方抛出。 |
| `previewMessages(settings={}, count=2)` | 同步返回最后 `count` 条 `{floor,type,name,text}`，保持原顺序。`count` 必须为非负整数，0 返回空数组，否则非法值抛中文 `TypeError`。无聊天、空聊天及三类全关返回 `[]`；参数或消息结构错误抛出。 |
| `isValidRule(source)` | 同步返回 boolean。非字符串、空白或无效正则返回 false。 |
| `exportFile(settings={})` | 返回 `Promise<{count}>`，触发宿主下载后返回实际导出消息数。全空或全关类型 reject `Error('无内容')`；无聊天 reject `Error('请先在酒馆里打开一个聊天')`；其余校验、生成和下载错误原样传播。 |
| `onChatChanged(callback)` | 同步返回幂等 `unsubscribe()`；非函数抛中文 `TypeError`。宿主未提供事件系统时返回空操作卸载函数。回调无参数，在微任务中执行；同步异常和 Promise 拒绝记入控制台，不阻塞宿主。 |
| `loadSettings()` | 同步返回独立设置副本，尚未保存时返回 null。宿主设置未就绪、结构损坏或已存字段非法时抛错。 |
| `saveSettings(settings)` | 同步返回保存后的独立副本。缺项补默认，已提供字段校验类型和枚举，忽略未知字段；错误抛出。整组写入 `extensionSettings['ST-YaKit-chat'].exportUI`，保留其他模块设置，调用 `saveSettingsDebounced()`；排队失败回滚原设置。成功表示已提交给宿主保存队列。 |
| `scanTagTree({start,end}={})` | 返回 `Promise<{from,to,tags}>`。`tags` 是嵌套结构 `[{name,label,count,floors,rule,innerRule,shellRules,children}]`，见上方标签识别边界。参数不是对象时 reject 中文 `TypeError`。只读，不保存设置或修改聊天。 |
| `tagRules(name)` | 同步返回与 `tags` 节点同形状的一项，或 `null`（名字不合法）。只读。 |
| `getAiContext()` | 返回 `Promise<{apiName, model, usingMainApi, jailbreakName}>`，见上方 AI 辅助边界。 |
| `suggestRules({request, mode, rules})` | 返回 `Promise<{rules:[{rule, explanation}]}>`；失败 reject 中文 `Error`，识别码见下表。 |
| `cancelSuggestRules()` | 同步返回 undefined；停止正在进行的生成，被停止的调用 reject `已停止生成`（`AI_CANCELLED`）。 |

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

识别整个聊天的标签结构，并用第一个标签的三套规则各看一次预览，不保存设置或触发下载：

```js
(async () => {
    const api = globalThis.YaKitChat.exportUI;
    const { from, to, tags } = await api.scanTagTree({});
    console.log(`识别了第 ${from} 到 ${to} 楼`);
    const flatten = (nodes) => nodes.flatMap((node) => [node, ...flatten(node.children)]);
    console.table(flatten(tags).map(({ label, count, floors }) => ({ label, count, floors })));
    if (tags.length === 0) return;
    const tag = tags[0];
    const base = { allFloors: true, types: { ai: true, user: true, system: true } };
    // 只要这段：保留组用 innerRule
    console.table(api.previewMessages({ ...base, keepRules: [tag.innerRule] }, 2));
    // 删掉整块：替换成一个空行，正文不会粘连
    console.table(api.previewMessages({ ...base, replaceRules: [{ find: tag.rule, to: '\n\n' }] }, 2));
    // 只删标签：三条壳规则替换成空
    console.table(api.previewMessages({ ...base, replaceRules: tag.shellRules.map((find) => ({ find, to: '' })) }, 2));
    // 没识别到的标签可以现算一份同样的规则
    console.log(api.tagRules('thinking')?.rule);
})();
```

例如原文 `<game><think>甲</think><text>一</text><think>乙</think></game>` 识别出 `<game>`，它的 `children` 是 `<think>`（count 2）和 `<text>`（count 1）。

`presets` 的参数与返回（全部返回 Promise，包括 `suggestName`；顶层用 `globalThis.YaKitChat.presets`，iframe 用 `parent.YaKitChat.presets`；失败 reject 中文 `Error`）：

| 调用 | Promise 成功值 |
| --- | --- |
| `list()` | `Array<{id,name,content}>`，按创建顺序 |
| `getActiveIds()` | `string[]`，按预设列表顺序，未使用预设时为 `[]` |
| `activate(id\|id[]\|null)` | 完整导出 settings；多套时按列表先后叠加 |
| `create(name, content)` | 新预设 `{id,name,content}` |
| `update(id, content)` | 覆盖后的预设 |
| `rename(id, name)` | 改名后的预设 |
| `duplicate(id)` | 新复制的预设 |
| `remove(id)` | `true` |
| `exportPreset(id)` | `{filename}`，并触发下载 |
| `importPreset(text)` | 新导入的预设 |
| `exportBackup(uiPrefs)` | `{filename}`，并触发下载 |
| `restoreBackup(text)` | `{presetCount, uiPrefs}` |
| `suggestName()` | 建议名称或空字符串 |

| 情况 | Error.message |
| --- | --- |
| 名称类型不对或去空白后为空 | `预设名称必须是字符串`／`预设名称不能为空` |
| 重命名撞名 | `已有同名预设` |
| 普通操作找不到 ID | `找不到指定预设` |
| 单套导出找不到 ID | `预设不存在` |
| 内容缺项 | `预设内容不完整` |
| 内容字段类型或枚举不对 | 沿用 `导出设置 … 类型不正确`／`不受支持` 等中文校验信息 |
| 库结构、ID 或当前引用不合法 | `预设库格式不正确`／`预设标识格式不正确`／`预设标识重复`／`当前预设不存在` |
| 新 ID 碰撞 | `生成的预设标识重复，请重试` |
| 单套导入格式不合法 | `这不是纪实的预设文件` |
| 备份恢复格式不合法 | `这不是纪实的备份文件` |
| 导出备份的界面偏好不合法 | `界面偏好必须是可保存为 JSON 的对象` |
| 存储或宿主异常 | 已有中文原因保留；其他底层异常统一为 `预设操作失败，请稍后重试` |

单套预设文件（UTF-8 JSON，MIME `application/json;charset=utf-8`，扩展名 `.yakit-preset.json`，不保存 ID 或当前选择）：

```json
{
  "type": "ST-YaKit-chat/preset",
  "schemaVersion": 1,
  "name": "示例预设",
  "content": {
    "types": { "ai": true, "user": true, "system": true },
    "format": "txt",
    "labels": "with",
    "mode": "delete",
    "rules": []
  }
}
```

备份文件（UTF-8 JSON，MIME 相同，扩展名 `.yakit-backup.json`）：

```json
{
  "type": "ST-YaKit-chat/backup",
  "schemaVersion": 1,
  "presets": { "items": [], "activeId": null },
  "exportSettings": {
    "allFloors": true,
    "start": "",
    "end": "",
    "types": { "ai": true, "user": true, "system": true },
    "format": "txt",
    "labels": "with",
    "fileName": "",
    "mode": "delete",
    "rules": []
  },
  "uiPrefs": {}
}
```

只读查看预设列表、当前预设和建议名称：

```js
(async () => {
    const api = globalThis.YaKitChat.presets;
    console.table(await api.list());
    console.log('当前预设', await api.getActiveId());
    console.log('建议名称', (await api.suggestName()) || '新预设');
})();
```

把当前导出设置存为新预设并启用，楼层范围和文件名保持当前值：

```js
(async () => {
    const { presets, exportUI } = globalThis.YaKitChat;
    const settings = exportUI.loadSettings() ?? {
        types: { ai: true, user: true, system: true },
        format: 'txt', labels: 'with', mode: 'delete', rules: [],
    };
    const content = Object.fromEntries(
        ['types', 'format', 'labels', 'mode', 'rules'].map(key => [key, settings[key]]),
    );
    const preset = await presets.create((await presets.suggestName()) || '新预设', content);
    const appliedSettings = await presets.activate(preset.id);
    console.log(preset, appliedSettings);
})();
```

把当前设置保存回正在使用的预设：

```js
(async () => {
    const { presets, exportUI } = globalThis.YaKitChat;
    const id = await presets.getActiveId();
    if (id === null) return;
    const settings = exportUI.loadSettings();
    if (!settings) return;
    const content = Object.fromEntries(
        ['types', 'format', 'labels', 'mode', 'rules'].map(key => [key, settings[key]]),
    );
    console.log(await presets.update(id, content));
})();
```

文件操作调用（`file` 是文件选择器返回的 File，`uiPrefs` 由 UI 读取真实界面偏好后传入；恢复的确认与返回偏好的应用由 UI 负责）：

```js
const yakitPresetFileApi = (globalThis.YaKitChat ?? globalThis.parent.YaKitChat).presets;

async function exportOnePreset(id) {
    return yakitPresetFileApi.exportPreset(id);
}

async function importOnePreset(file) {
    return yakitPresetFileApi.importPreset(await file.text());
}

async function backupPresets(uiPrefs) {
    return yakitPresetFileApi.exportBackup(uiPrefs);
}

async function restorePresets(file) {
    return yakitPresetFileApi.restoreBackup(await file.text());
}
```

`updater` 的参数、返回与错误（两个函数都无参数，失败 reject 中文 `Error`）：

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

`apiUI` 的公开操作全部返回 Promise（下表省略 Promise 包装；顶层用 `globalThis.YaKitChat.apiUI`，iframe 用 `parent.YaKitChat.apiUI`）。API 配置 `profile` 为 `{id,name,url,key,model,provider}`：

| 调用 | 成功值 |
| --- | --- |
| `listProfiles()` | 配置数组，含 resolvedProvider，不含 key |
| `getProfile(id)` | 完整配置，含该记录的 key |
| `getActiveProfileId()` | 副 API ID 或 null |
| `activateProfile(id\|null)` | 设置后的 ID 或 null |
| `checkProfile(draft)` | `{errors:{name?,url?,model?},warnings:{url?,key?}}` |
| `saveProfile(draft)` | 保存后的配置；无 ID 新建，有 ID 更新 |
| `duplicateProfile(id)` | 新配置 |
| `removeProfile(id)` | true |
| `fetchModels(draft)` | 去重后的模型名称数组 |
| `testConnection(draft)` | `{message}` |
| `listCorePrompts()` | `[{id,name,target,text,defaultText,modified}]`，顺序 jailbreak / regex / polish |
| `saveCorePrompt(id,text)` | 保存后的 corePrompt；regex / polish 正文空白时 reject |
| `resetCorePrompt(id)` | 恢复默认后的 corePrompt |
| `getAssistant(kind)` | `{profile,sampling}` |
| `setAssistant(kind,{profile?,sampling?})` | 保存后的该助手配置 |
| `resolveAssistant(kind)` | 无密钥的 `{profile:{id,name,model,usingMainApi},jailbreak:{id,name}\|null}`；polish 另有 `prompt:{id,name}\|null` 表示当前文风 |
| `getRequestSettings()` | `{timeoutSeconds,retries}` |
| `setRequestSettings(patch)` | 保存后的完整参数；空 patch 不保存 |

旧提示词接口（`listPrompts`、`getActivePromptId`、`activatePrompt`、`checkPrompt`、`savePrompt`、`duplicatePrompt`、`removePrompt`）仍保留，操作旧破限词库与文风库，界面不再使用。

| 情况 | 提示或错误码 |
| --- | --- |
| 地址含全角或特殊空白 | 服务地址里有全角符号或特殊空格，请改成半角 |
| 测试连接未填模型 | 请先填写模型名称 |
| AI 需求为空 | 请先说明想删除或保留什么内容 |
| 没有可参考 AI 回复 | 当前聊天没有可参考的 AI 回复 |
| 生成请求失败 | AI 请求失败，请检查当前 API 的连接和额度后重试 |
| 无完整规则组 | 没有拿到规则，可能被模型拒绝了，换个破限词或说法再试；`AI_RULE_FORMAT` |
| 自定义楼层数不合法 | 自定义楼层数必须是正整数；`error.field='chunkFloors'` |
| 候选字段格式错误 | AI 返回的规则格式不对，请重新生成；`AI_RULE_FORMAT` |
| 全部重复 | AI 没有给出新的规则，请换个说法再试 |
| 超时 | 等了 N 秒还没生成规则，请检查当前 API 后重试；`AI_TIMEOUT` |
| 显式停止 | 已停止生成；`AI_CANCELLED` |
| 不支持的助手字段 | 这项助手设置不能修改 |
| 非法超时／重试数 | 超时时间要在 30 到 1800 秒之间，请填写整数秒数／自动重试次数只能选 0、1、2 或 3 |

以下示例可直接在酒馆顶层控制台运行，只读取摘要：

```js
(async () => {
    const { apiUI, exportUI } = globalThis.YaKitChat;
    console.table(await apiUI.listProfiles());
    console.log(await apiUI.getActiveProfileId());
    console.log(await apiUI.getAssistant('regex'));
    console.log(await apiUI.resolveAssistant('regex'));
    console.log(await apiUI.getRequestSettings());
    console.log(await exportUI.getAiContext());
})();
```

下面实际请求模型，显示候选及预览；不会保存或加入规则：

```js
(async () => {
    const api = globalThis.YaKitChat.exportUI;
    const settings = api.loadSettings() ?? {};
    const rules = [...(settings.rules ?? [])];
    try {
        const result = await api.suggestRules({
            request: '删除思考标签及里面的内容',
            mode: settings.mode ?? 'delete',
            rules,
        });
        console.table(result.rules);
        const additions = result.rules.map(item => item.rule).filter(rule => api.isValidRule(rule));
        console.table(api.previewMessages({ ...settings, rules: [...new Set([...rules, ...additions])] }, 2));
    } catch (error) {
        console.error(error.message);
    }
})();
```

显式停止当前生成可直接调用；此操作不绑定到关闭抽屉或弹窗：

```js
globalThis.YaKitChat.exportUI.cancelSuggestRules();
```

界面如需复用草稿请求代码，可直接使用以下函数；draft 来自编辑表单，界面负责输入与结果展示：

```js
async function checkDraftModels(draft) {
    const app = globalThis.YaKitChat ?? globalThis.parent.YaKitChat;
    return app.apiUI.fetchModels(draft);
}

async function testDraftModel(draft) {
    const app = globalThis.YaKitChat ?? globalThis.parent.YaKitChat;
    return app.apiUI.testConnection(draft);
}
```

### 润色、文风、固定提示词、助手、备份与公告

以下示例可单独复制到已加载插件的酒馆控制台；兼容面板 iframe，通过当前窗口或 parent 取 YaKitChat。带生成 / 保存 / 下载说明的块会产生对应操作。

#### 当前接口与只读状态

本块不发模型生成；getJob 可能启动服务器结果文件读取，两个上下文查询会准备当前 API 信息。

```js
(async () => {
    const y = globalThis.YaKitChat ?? globalThis.parent?.YaKitChat;
    console.log('版本', y.version);
    console.log('聊天', y.polishUI.getChatInfo());
    console.log('润色设置', y.polishUI.loadSettings());
    console.log('润色上下文', await y.polishUI.getContext());
    console.log('正则上下文', await y.exportUI.getAiContext());
    console.log('当前任务', y.polishUI.getJob());
    console.table(await y.styles.list());
    console.log('使用中的文风', await y.styles.getActiveId());
    console.table(await y.apiUI.listCorePrompts());
    console.log('正则助手', await y.apiUI.getAssistant('regex'));
    console.log('润色助手', await y.apiUI.getAssistant('polish'));
    console.log('请求参数', await y.apiUI.getRequestSettings());
})();
```

#### 文风创建、检查、使用、修改、复制及导入导出

创建两项后导出示例文风文件；末尾删除本块创建的两项并恢复原使用项。下载文件不自动删除。

```js
(async () => {
    const y = globalThis.YaKitChat ?? globalThis.parent?.YaKitChat;
    const oldActive = await y.styles.getActiveId();
    const name = `示例文风-${Date.now()}`;
    const draft = { name, text: '句式自然，保留动作、对话和事实。' };
    console.log(await y.styles.check(draft));
    const style = await y.styles.save(draft);
    let duplicate;
    try {
        await y.styles.activate(style.id);
        console.log(await y.styles.save({ ...style, text: '语言简洁，保留细节，不改变事实。' }));
        duplicate = await y.styles.duplicate(style.id);
        console.log(await y.styles.exportStyle(style.id));
    } finally {
        if (duplicate) await y.styles.remove(duplicate.id);
        await y.styles.remove(style.id);
        await y.styles.activate(oldActive);
    }
})();
```

单套导入接受文件文本。此块保留新导入项，不自动选中：

```js
(async () => {
    const y = globalThis.YaKitChat ?? globalThis.parent?.YaKitChat;
    const text = JSON.stringify({
        type: 'ST-YaKit-chat/style', schemaVersion: 1,
        name: '导入示例文风', text: '语句通顺，保留原文的具体细节。'
    });
    console.log(await y.styles.importStyle(text));
})();
```

#### 固定提示词编辑与恢复

本块将正则规则保存为默认原文；操作后正则提示词是默认状态。演示 defaultText/modified 以及实时比较依据：

```js
(async () => {
    const y = globalThis.YaKitChat ?? globalThis.parent?.YaKitChat;
    const current = (await y.apiUI.listCorePrompts()).find(item => item.id === 'regex');
    const editedText = current.defaultText + '\n按实际匹配范围解释规则。';
    console.log('恢复按钮是否可用', editedText !== current.defaultText);
    console.log(await y.apiUI.saveCorePrompt('regex', editedText));
    const reset = await y.apiUI.resetCorePrompt('regex');
    console.log(reset.text === reset.defaultText, reset.modified);
})();
```

明确停用通用破限词及恢复默认，二选一执行：

```js
(async () => {
    const y = globalThis.YaKitChat ?? globalThis.parent?.YaKitChat;
    console.log(await y.apiUI.saveCorePrompt('jailbreak', ''));
})();
```

```js
(async () => {
    const y = globalThis.YaKitChat ?? globalThis.parent?.YaKitChat;
    console.log(await y.apiUI.resetCorePrompt('jailbreak'));
})();
```

#### 助手接口、采样与超时

本块保存配置。只改 profile 不影响 sampling；第二次采样保存只清温度，其余项保留。

```js
(async () => {
    const y = globalThis.YaKitChat ?? globalThis.parent?.YaKitChat;
    await y.apiUI.setAssistant('regex', { profile: 'follow' });
    await y.apiUI.setAssistant('polish', {
        profile: 'main', sampling: { temperature: 0.7, topP: 0.9, topK: null }
    });
    await y.apiUI.setAssistant('polish', { sampling: { temperature: null } });
    console.log(await y.apiUI.getAssistant('polish'));
    console.log(await y.apiUI.resolveAssistant('polish'));
    console.log(await y.apiUI.setRequestSettings({ timeoutSeconds: 360, retries: 1 }));
})();
```

指定已存在的副 API，不在代码中嵌入地址和密钥：

```js
(async () => {
    const y = globalThis.YaKitChat ?? globalThis.parent?.YaKitChat;
    const profiles = await y.apiUI.listProfiles();
    if (!profiles.length) throw new Error('请先在 API 管理中建立一个副 API 配置');
    console.log(await y.apiUI.setAssistant('polish', { profile: profiles[0].id }));
})();
```

#### 复用导出预设与分段预览

仅预览，不保存任务或请求模型；没有导出预设时使用导出页当前设置。

```js
(async () => {
    const y = globalThis.YaKitChat ?? globalThis.parent?.YaKitChat;
    const presets = await y.presets.list();
    const settings = {
        allFloors: true, start: '', end: '',
        presetId: presets[0]?.id ?? 'export',
        chunkMode: 'custom', chunkFloors: 7, fileName: '润色结果'
    };
    const segments = await y.polishUI.planSegments(settings);
    console.table(segments.map(s => ({
        index: s.index, startFloor: s.startFloor, endFloor: s.endFloor,
        floors: s.floors.length, chars: s.chars
    })));
})();
```

#### 状态订阅与首段试润色

先订阅，后开始。订阅代码保存取消函数；不依赖首次 getJob 非空：

```js
(() => {
    const y = globalThis.YaKitChat ?? globalThis.parent?.YaKitChat;
    globalThis.yakitStopPolishLog?.();
    globalThis.yakitStopPolishLog = y.polishUI.onJobChange(job => {
        console.log('润色任务变化', job);
    });
    console.log('当前快照', y.polishUI.getJob());
})();
```

本块保存润色设置，替换当前聊天已有任务并调用模型试润色第一段；请在要开始新任务的聊天运行：

```js
(async () => {
    const y = globalThis.YaKitChat ?? globalThis.parent?.YaKitChat;
    if (y.polishUI.getChatInfo().status !== 'ok') throw new Error('请先打开单人聊天');
    const settings = y.polishUI.saveSettings({
        allFloors: true, start: '', end: '', presetId: 'export',
        chunkMode: 'balanced', chunkFloors: 10, fileName: '润色结果'
    });
    console.log(await y.polishUI.start(settings));
})();
```

看到 review/stopped 后再继续；本块可能调用模型，也可能只补保存：

```js
(async () => {
    const y = globalThis.YaKitChat ?? globalThis.parent?.YaKitChat;
    console.log(await y.polishUI.resume());
})();
```

停止与取消日志订阅可独立执行：

```js
(async () => {
    const y = globalThis.YaKitChat ?? globalThis.parent?.YaKitChat;
    await y.polishUI.stop();
    globalThis.yakitStopPolishLog?.();
    delete globalThis.yakitStopPolishLog;
})();
```

#### 手动编辑与按楼层重做

须等待当前聊天结果已加载且任务空闲。本块保存第一楼示例修改，之后按第一、二楼重做并请求模型；选择来源为实际任务楼号：

```js
(async () => {
    const y = globalThis.YaKitChat ?? globalThis.parent?.YaKitChat;
    const p = y.polishUI;
    const job = p.getJob();
    if (!job || !job.isCurrentChat || job.status === 'running') {
        throw new Error('请等当前聊天结果加载完成并停止生成');
    }
    const floors = job.segments.flatMap(segment => segment.floors);
    const first = floors[0];
    await p.editFloor(first.floor, (first.polished ?? first.original) + '\n手动补充的示例句。');
    const selected = floors.slice(0, 2).map(floor => floor.floor);
    console.log('预计请求次数', p.estimateRedo(selected));
    console.log(await p.redoFloors(selected));
})();
```

整段重试会清空该段手改结果；此块重做当前任务第 1 段：

```js
(async () => {
    const y = globalThis.YaKitChat ?? globalThis.parent?.YaKitChat;
    console.log(await y.polishUI.retrySegment(0));
})();
```

#### 润色新增楼层、导出与清空

新增楼层示例：原聊天旧前缀须未改变，且有符合任务筛选条件的新楼。

```js
(async () => {
    const y = globalThis.YaKitChat ?? globalThis.parent?.YaKitChat;
    console.log('新增信息', y.polishUI.getJob()?.newFloors ?? null);
    console.log(await y.polishUI.appendNew());
})();
```

全部段完成后下载；TXT/MD/EPUB 由任务所选导出预设当前格式决定：

```js
(async () => {
    const y = globalThis.YaKitChat ?? globalThis.parent?.YaKitChat;
    console.log(await y.polishUI.exportFile({ fileName: '润色成品' }));
})();
```

此块删除当前聊天的服务器润色结果，不删除原聊天：

```js
(async () => {
    const y = globalThis.YaKitChat ?? globalThis.parent?.YaKitChat;
    await y.polishUI.clearJob();
})();
```

#### 正则助手与完整备份

正则生成会发送当前聊天最近可见 AI 楼层给当前正则助手接口：

```js
(async () => {
    const y = globalThis.YaKitChat ?? globalThis.parent?.YaKitChat;
    console.log(await y.exportUI.suggestRules({
        request: '删除 thinking 标签及其中的内容', mode: 'delete', rules: []
    }));
})();
```

下载备份。`uiPrefs` 应由调用方传实际界面偏好；此示例明确使用空偏好：

```js
(async () => {
    const y = globalThis.YaKitChat ?? globalThis.parent?.YaKitChat;
    console.log(await y.presets.exportBackup({}));
})();
```

恢复 API 示例使用当前状态构造一份完整合法备份文本，再恢复；会调用设置保存，不会发模型请求。真实导入时把 text 换成读取到的文件全文；返回的 uiPrefs 由 UI 自行应用：

```js
(async () => {
    const y = globalThis.YaKitChat ?? globalThis.parent?.YaKitChat;
    const text = JSON.stringify({
        type: 'ST-YaKit-chat/backup', schemaVersion: 1,
        presets: { items: await y.presets.list(), activeId: await y.presets.getActiveId() },
        exportSettings: y.exportUI.loadSettings() ?? {
            allFloors: true, includeHidden: true, start: '', end: '',
            types: { ai: true, user: true, system: true },
            format: 'txt', labels: 'with', fileName: '', mode: 'delete', rules: []
        },
        uiPrefs: {},
        styles: { items: await y.styles.list(), activeId: await y.styles.getActiveId() },
        corePrompts: Object.fromEntries((await y.apiUI.listCorePrompts()).map(item => [item.id, item.text]))
    });
    console.log(await y.presets.restoreBackup(text));
})();
```

#### 更新公告

第一项读已安装静态文件；第二项会请求宿主仓库信息并读取 GitHub，可能触发宿主 git fetch，按第 2.9 节处理错误：

```js
(async () => {
    const y = globalThis.YaKitChat ?? globalThis.parent?.YaKitChat;
    console.table(await y.notice.listInstalled());
    try {
        console.table(await y.notice.fetchNewer());
    } catch (error) {
        console.error(error.message);
    }
})();
```

**返回值和同步性速查**

- `polishUI` 共 18 项：同步的 getChatInfo/onChatChanged/loadSettings/saveSettings/getJob/onJobChange/estimateRedo；Promise 的 getContext/planSegments/start/resume/retrySegment/stop/clearJob/editFloor/redoFloors/appendNew/exportFile。两个订阅函数返回取消订阅函数。getContext 返回 `{apiName,model,usingMainApi,jailbreakName,styleName}`，不返回密钥或正文。
- job 为 `{id,status,chatName,isCurrentChat,stopReason,waitUntil,newFloors,segments}`。段为 `{index,startFloor,endFloor,chars,original,polished,status,error,resumeFloor,shortFloors,floors}`；楼为 `{floor,original,polished,status,edited,short}`。楼状态 pending/running/done；段另有 failed；任务状态 running/review/stopped/finished。空正文结果不是合格 done。返回快照独立，不应通过修改返回对象保存。
- `styles` 共 9 项：list/getActiveId/activate/check/save/duplicate/remove/importStyle 同步，exportStyle 返回 Promise；均可用 await。check 返回 `{errors:{name?,text?}}`；save/duplicate/importStyle 返回 style，activate 返回 id|null，remove 返回 true。
- `apiUI` 的公开操作统一 Promise，包括 listCorePrompts/saveCorePrompt/resetCorePrompt、getAssistant/setAssistant/resolveAssistant、getRequestSettings/setRequestSettings。resolveAssistant 返回无密钥的 `{profile:{id,name,model,usingMainApi},jailbreak:{id,name}|null}`，polish 另有 `prompt:{id,name}|null` 表示当前文风。
- `presets` 公开操作统一 Promise，原导出预设 API 未改签名；`notice` 两个读取接口也均为 Promise。

`readCurrentChat`、`filterMessages`、`cleanMessages`、`saveTxt`、`saveExport`、`getEpubPreferences`、`saveEpubPreferences` 及底层管理函数的契约以源码为准。

### 本次任务与插画小说（v0.6.1）

**本次任务**（`polishUI.getTaskInputs` / `polishUI.saveTaskInputs`，按聊天保存在 `user/files/ST-YaKit-chat-polish-inputs-<sha256(聊天标识)>.json`）

| 字段 | 含义与边界 |
|---|---|
| `instructions` | 本次补充要求；CRLF 统一为 LF；按码点最多 4000；全空白保存为 `''`；非字符串报错 `field='instructions'` |
| `references` | `[{ kind: 'style' \| 'context', text }]`，整份替换；最多 6 条（含空行）；空正文条目保存时移除；单条最多 6000、合计最多 18000 码点；用途错误 `field='references.N.kind'`，单条超限 `references.N.text`，条数或合计超限 `references` |

- `saveTaskInputs(patch)` 只接受 `instructions`、`references` 两个键，未知键报错；空对象只返回当前值；润色进行中或保存中报错，不写入。
- 读取失败时报错，不当作空值；旧文件缺项补默认值。
- `start`、`resume`、`retrySegment`、`redoFloors`、`appendNew` 在操作开始时读回已保存输入，与接口、采样、破限词、文风、润色提示词一起固定为本轮快照；本轮的续写、格式重试、限速重试沿用。
- user 组装顺序：文风 `<style>` → `<task_requirements>` → `<style_reference n>` / `<context_reference n>`（按列表顺序，n 从 1 起）→ 前一楼结尾 / 衔接参考 → `<original>`；没有内容的块整块省略。
- `clearJob()` 同时删除输入文件；不进预设备份。

```js
const polish = globalThis.YaKitChat.polishUI;
await polish.saveTaskInputs({ instructions: '保留最后一句台词的含义。' });
await polish.saveTaskInputs({ references: [{ kind: 'context', text: '宋青书是黄蓉的对手。' }] });
console.log(await polish.getTaskInputs());
```

**插画小说**（导出设置与导出预设字段 `illustrated: boolean`，默认 `false`，旧预设缺省按 `false`）

- 只在 `format === 'epub'` 时生效。清洗前把生图标签换成私用区占位符（`\uE000编号\uE001`），正则清洗不会删掉占位符（删除或未保留区间里的占位符按原位置补回）；EPUB 中换成 `<img class="illustration">`，图片存 `EPUB/images/编号.扩展名` 并登记 manifest；读不到的图片直接略过。
- 柏宝绘：标签 `/<bbi_image>[\s\S]+?<\/bbi_image>/gi`；按消息 `extra.bbiImage[swipe_id ?? 0][promptHash(整段标签)]` 中 `slotSeq`（缺省 0）等于该楼第几个标签的最后一条非 `error` 记录取 `path`。
- 智绘姬：按 `extensionSettings['st-chatu8']` 的 `startTag` / `endTag`（缺省 `image###` / `###`）识别，外层 `<image>` 一并替换；key 为 `MD5(内容.trim() 后把《》换回 <>、去掉换行)`；合并 `jiuguanStorage[key].images`（服务器路径）与浏览器数据库 `chatu8_gallery` / `tupianhuancun` 中 `tupianshuju` 的记录（只读，不创建数据库），按日期排序后取其记住的序号；视频略过。
- 图片一律按站点根路径 `fetch` 读取，不依赖 docker / 非 docker 的文件系统前缀；只接受 PNG、JPEG、WebP、GIF。
- `exportUI.exportFile` 在插画模式下返回 `{ count, images, missingImages }`；`previewMessages` 中占位符显示为「〔插图〕」。
- 润色：所选导出预设 `illustrated` 且为 EPUB 时，分段前取出占位符，楼层记 `images: [{ ref, at }]`（`at` 为去掉标签后文字里的相对位置 0–1），发给模型的原文不含标签；导出 EPUB 时放回最近的段落开头或首尾。只有图片没有文字的楼层不进入润色；结果不属于当前聊天时柏宝绘图片读不到。

### 世界书、助手重置与默认温度（v0.6.2）

| 项 | 契约与边界 |
|---|---|
| `polishUI` settings `worldInfo: boolean` | 默认 `false`，不锁定；每轮开始按已保存的润色设置读取。开启时每次请求用 `SillyTavern.getContext().getWorldInfoPrompt(本次楼层原文倒序数组, maxContext（缺省 8192）, true)` 扫描（dry run，不触发宿主事件），`worldInfoString` 去首尾空白非空时以「世界书（仅供理解设定，不输出）：」`<world_info>` 放在参考材料之后、衔接片段之前；宿主没有该函数或扫描出错时省略 |
| `apiUI.resetAssistant(kind)` | `kind` 为 `regex` / `polish`；保存 `profile: 'follow'` 与默认采样（正则 `temperature: 0.8`、润色 `0.95`，其余 `null`），返回 `{ profile, sampling }`；其他 kind 报错 |
| 默认温度 | 读取助手设置时，已保存的 sampling 缺 `temperature` 键才补默认值；用户清空后保存的 `null` 保持不设置 |
| 默认提示词 | `ASSISTANT_PROMPTS` 的可编辑规则部分重写；材料标签说明与输出格式不变；`corePrompts` 里没有保存过正文的直接使用新默认 |

```js
const api = globalThis.YaKitChat.apiUI;
console.log(await api.resetAssistant('polish'));
const polish = globalThis.YaKitChat.polishUI;
polish.saveSettings({ ...(polish.loadSettings() ?? {}), worldInfo: true });
```

## 当前接入状态

**已实现（含界面，已通过整体复测）**
- 文本导出页：导出预览、正则匹配、导出设置抽屉（楼层范围、消息类型、格式、文件名）、TXT / Markdown / EPUB 导出
- 弹窗外壳：魔法棒入口、上方文字页签 / 下方图标导航、九套主题、设置页（更新、主题、导航栏位置；组件示例默认隐藏）
- 插件更新：`updater` 两个接口
- 导出预设：列表、切换、重命名、复制、导出、删除、导入、备份全部、从备份恢复，导出页底部下拉框与「更新预设」（单套切换部分已复测，叠加为 v0.7.0 新增）

**已实现并接入界面，未经整体复测（v0.7.0 新增，不需要 AI 请求）**
- 整理标签抽屉：指定楼层识别、嵌套结构、四种处理方式、手动加标签、应用到规则。真实页面只读核对通过（210 层聊天识别出 20 项、无重复、嵌套正确，下拉与折叠正常）；「应用到规则」会写用户设置，未在真实环境执行，导出结果未验证
- 三组规则（保留 → 替换 → 删除）与删块留空行、多余空行合并：只有离线测试与预览核对，真实导出文件未验证
- 酒馆聊天（JSONL）导出：只有离线测试，导出文件能否被酒馆导入未验证；润色导出不支持这个格式，会给中文错误提示
- 导出预览「看第几楼」：真实页面核对过渲染，放大预览跳转未逐项验证
- 预设叠加：多套合并、叠加时规则只读、「存为新预设」只有离线测试；小主账户当前没有导出预设，且切换预设会写用户设置，未在真实环境点过
- AI 辅助只判断删除组与保留组，替换组要用户自己写

**已实现并接入界面，未经真实 API 与整体复测**
- 润色页：`polishUI` 18 个接口已装配；已接真实业务核对无结果状态、按楼层分段预览（104 层在 5 / 10 / 20 / 自定义 7 层下为 21 / 11 / 6 / 15 段）与自定义 0 层错误；首段 review→继续、65535 额度是否被服务接受、超长单楼、截断续写、429 倒计时、停止、格式重试、短文提醒与真实内容质量均未验证
- 润色结果服务器链路：上传、刷新读回、跨聊天、坏文件恢复、写入失败恢复、逐楼手改、选楼重做、新增楼层及旧楼改变后阻止追加，只有离线测试
- 润色导出：TXT / Markdown / EPUB 真实下载与文件内容未验证
- 复用导出预设、文风预设、固定三条提示词（含 defaultText 实时恢复按钮）：真实只读核对通过；新建、切换、导入导出、删除回退、恢复默认、旧数据迁移、新旧备份恢复、生成中切换文风或规则的实际效果未验证
- 助手接口与采样参数：只读核对两个助手五项为 null；保存、参数实际送达各服务与生成效果未验证
- 正则 / 润色标签说明：已加入实际请求组装；界面在提示词编辑页展示标签表
- 更新公告：本地三版公告读取与失败提示已核对；远端读取在本机因 SSH 远端 HTTP 500 未测通，待 push 后用 HTTPS 安装验证；更新后自动弹出一次需真实版本变化验证
- API 管理（API 配置、参数）、正则 AI 辅助、包含隐藏楼层、全部楼层分批预览、报错记录：沿用 v0.5.0 状态
- 验收情况：业务离线回归 49 项通过（网络、存储、宿主为替身）；公开 API 示例完成静态语法核对，未在用户账户上执行生成、保存或下载

**已实现但无界面**
- 底层副 API 配置管理与提示词管理函数（`src/features/api-management/`、`src/features/prompt-management/`，已在 `YaKitChat` 上）；旧提示词接口
- EPUB 分章偏好（`getEpubPreferences` / `saveEpubPreferences`）：文本导出时读取已存偏好，无设置界面；润色 EPUB 固定每段一章，不用这项偏好

**未实现**
- 注释符号 `<!--` `-->` 本身不在标签列表里（注释内的标签算数、能点），要清掉注释符号需要自己写规则
- assistant 预填充消息与预填充开关
- 群聊润色
- 「备份全部」覆盖 API 配置与密钥、助手接口与采样、请求参数、润色设置与服务器润色结果
- 入口文件收敛为「UI 总文件 + 业务总文件」两个引用

**依赖宿主接口**：`SillyTavern.getContext()`（聊天、角色、`powerUserSettings`、`extensionSettings`、`saveSettingsDebounced`、`eventSource` / `eventTypes`）；`/scripts/utils.js` 的下载与 UUID；EPUB 懒加载 `/lib/jszip.min.js`；宿主 `--SmartTheme*` CSS 变量（跟随ST）；预设使用 `crypto.getRandomValues` 生成 ID、`structuredClone` 复制对象，并通过 `/scripts/utils.js` 的 `download` 下载文件；插件更新使用 `/scripts/extensions.js` 导出的 `extensionTypes`、`/scripts/user.js` 的 `isAdmin()`、`getRequestHeaders()`，并调用后端 `POST /api/extensions/version`、`POST /api/extensions/update`；API 管理、AI 辅助与润色使用 `getRequestHeaders()`、宿主生成参数构建器及对应生成后端接口，获取模型调用 `/api/backends/chat-completions/status`；润色结果使用 `POST /api/files/upload`、`/user/files/*`、`POST /api/files/delete` 与宿主 `/lib.js` 的 sha256；更新公告远端读取使用 `POST /api/extensions/version` 与 GitHub Contents API；关闭弹窗后的完成提示使用宿主 `toastr`。无第三方依赖。

**版本门槛**：按本地 SillyTavern 1.18.0 源码核对宿主契约，其他版本未单独验证；v0.6.0–v0.8.2 新增业务尚未完成真实 API 验收。标签扫描使用 Unicode 属性正则，生成规则使用 RegExp 后行断言，AI 请求使用 `AbortController` 与 `structuredClone`，需要支持这些能力的现代浏览器。

## 开发与验证

- **分工**：Claude 负责界面代码（`src/ui/`）、README.md / Public.md / DESIGN.md 与设计一致性核对；Codex 负责业务逻辑（`src/features/`、`src/shared/`）与业务测试；入口文件改动由小主协调；界面与业务通过接口说明对接，不共同修改同一文件。
- **验收方式**：业务由 Codex 自测（不使用浏览器）；界面在业务接好后由 Claude 在酒馆里接真实业务自测（避开发模型请求和写入用户数据的操作），再由小主整体复测。
- **构建**：不涉及，浏览器直接加载 ES 模块；插件须在酒馆扩展设置中启用。
- **协作记录**：关键节点见 `AGENT_LOG.md`。
