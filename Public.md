# 纪实 · 仓库与公开接口说明

## 速查区

- **仓库是什么**：SillyTavern 扩展"纪实"（YaKit 系列）。"文本导出"功能已完整实现（含界面）：按楼层范围/消息类型/正则规则筛选当前聊天并导出 TXT。另有"副 API 配置管理"和"提示词管理"两个业务模块已实现，为后续 AI 功能做准备，但**尚未接入界面或全局入口**。
- **技术栈**：原生 JavaScript（ES Modules）+ 原生 CSS，无构建步骤，酒馆直接加载。
- **入口文件**：`src/index.js`（`manifest.json` 的 `js` 字段指向），注册全局对象 `globalThis.YaKitChat` 并初始化文本导出界面。
- **公开 API 一览**（均挂在 `globalThis.YaKitChat` 上）：`version`、`readCurrentChat(range)`、`filterMessages(messages, types)`、`cleanMessages(messages, rules, mode)`、`saveTxt(messages, format)`。
- **当前还没做什么**：设置页（副 API 配置、破限词/正则/文风提示词三类管理）尚未接入界面或全局入口——对应业务模块已经写好，只是还没有 UI 和 Tab 导航把它们露出来；提示词注入组装（`buildFinalMessages`/`applyInjection` 等）尚未实现；不含任何实际发起 AI 请求的能力；不含 AI 辅助过滤、标签提取、TXT 以外的导出格式、TauriTavern/移动端专用保存、群聊支持（长期不支持）、与绘界等同系列扩展之间的公共界面文件。

## 仓库结构

```text
ST-YaKit-chat/
├── manifest.json                 扩展声明，js 指向 src/index.js，css 指向 src/ui/text-export/style.css
├── src/
│   ├── index.js                  宿主接入注册，组装 YaKitChat 公开入口，初始化文本导出界面
│   ├── features/
│   │   ├── text-export/          按楼层读取、类型过滤、正则清洗、生成并保存 TXT 四个模块
│   │   ├── api-management/       副 API 配置的增删改查与校验（未接入界面）
│   │   └── prompt-management/    三类提示词的增删改查与校验（未接入界面）
│   ├── shared/                   settings.js（扩展设置读写）、validation.js（配置/提示词校验）
│   └── ui/
│       └── text-export/          扩展菜单入口、面板视图、主题映射、Toast、样式
└── tests/                        本地自动化测试，按功能分子目录，不随扩展加载
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
├── src/features/text-export/export-txt.js
├── src/features/api-management/index.js
├── src/features/prompt-management/index.js
├── src/shared/settings.js
├── src/shared/validation.js
├── src/ui/text-export/index.js
├── src/ui/text-export/view.js
├── src/ui/text-export/theme.js
├── src/ui/text-export/feedback.js
├── src/ui/text-export/style.css
├── tests/text-export/text-export.test.mjs
├── tests/text-export/filter-messages.test.mjs
├── tests/text-export/clean-messages.test.mjs
├── tests/text-export/export-txt.test.mjs
├── tests/text-export/ui.test.mjs
├── tests/shared/settings.test.mjs
├── DESIGN.md                     UI 与动效规范
├── AGENT_LOG.md                  Claude / Codex 协作节点记录
├── AGENTS.md / CLAUDE.md         协作协议（符号链接）
└── .gitignore
```

`需求文档-*.md`、`技术交接-*.md`、`技术评估-*.md`、`sillytavern_API.md`、`CLAUDE.local.md` 属于本地协作文档，按 `.gitignore` 规则不提交仓库。

</details>

## 加载与数据流

酒馆按 `manifest.json` 加载 `src/index.js` 和界面样式；`src/index.js` 把 `readCurrentChat`、`filterMessages`、`cleanMessages`、`saveTxt` 四个函数和只读的 `version` 挂到 `globalThis.YaKitChat` 上，同时初始化文本导出界面。

界面主链路：在输入框旁扩展菜单挂载图标"纪实"（`#yk-text-export-menu`，菜单未就绪时等待宿主 `APP_READY` 事件）→ 点击打开单页面板（原生 `dialog`，最大宽度 900px）→ 面板内楼层范围/消息类型/正则清洗三张卡片依次调用 `readCurrentChat` → `filterMessages` →（规则非空时）`cleanMessages` → 点击"导出"前先判断结果是否为空，非空才调用 `saveTxt`。

<details>
<summary>边界情况</summary>

**读取（`readCurrentChat`）**

| 情况 | 实际行为 |
| --- | --- |
| 楼层编号 | 接口从 1 开始，闭区间；接口第 1 楼对应宿主内部 `#0`，过滤后保留原楼层号。 |
| 不传范围或传 `'all'` | 读取全部楼层；对象范围省略 `start` 取 1，省略 `end` 取最后一楼。 |
| 起止颠倒、超界 | 先交换颠倒端点，再各自收缩到 `[1, 消息数]`。 |
| 空聊天、未选角色 | 返回 `[]`，不校验范围，也不导出宿主的欢迎消息。 |
| 范围参数格式错误 | 非对象/非 `'all'` 或端点非整数，抛出 `TypeError`。 |
| 群聊 | 读取和非空保存均抛出"仅支持单人聊天"；界面遇群聊直接显示提示，隐藏三张卡片和导出区。 |
| 读取结果字段 | 每条为独立快照：`{ floor, name, mes, is_user, is_system, extra: { type } }`。 |

**过滤（`filterMessages`）**

| 情况 | 实际行为 |
| --- | --- |
| 未传类型参数 | `ai`/`user`/`system` 全部启用。 |
| 已传类型参数但全部关闭 | 抛出"请至少选择一种消息类型"；界面上直接禁用"导出"按钮并提示，不等点击才报错。 |
| 消息分类 | `is_system` 为真值或 `extra.type === 'narrator'` 优先归系统；其次 `is_user` 归用户；其余归 AI。 |
| 筛选结果 | 返回新数组，不修改输入。 |

**清洗（`cleanMessages`）**

| 情况 | 实际行为 |
| --- | --- |
| 规则格式 | 对象数组 `{ pattern, flags? }`；内部补充 `g` 匹配全部位置。 |
| 删除/保留模式 | `remove` 删除全部规则命中区间的并集；`keep` 保留全部规则命中区间的并集，按原文顺序拼接。 |
| 无效正则语法 | 跳过该条规则，其余规则照常生效；规则全部为空/无效时两种模式都保留原正文。 |
| 空表达式 `{ pattern: '' }` | 合法的零长度正则；`remove` 保留正文，`keep` 得到空字符串。 |
| 清洗后正文为空 | 消息仍保留在数组里，`mes` 为 `''`，不整条删除，不 trim 残留空白。 |
| 界面上的无效规则提示 | 该行下方出现危险色行内提示框（图标+"这条规则无效，已忽略"），输入框本身不变色；不阻断其他规则或导出。 |

**保存（`saveTxt`）**

| 情况 | 实际行为 |
| --- | --- |
| 文本格式 | `speaker`：固定前缀"AI："/"用户："/"系统："（不用真实姓名）+ 正文；`plain`：仅正文；消息间以两个换行分隔。 |
| 文件名 | `<调用保存时的角色卡名称><本地时间戳 YYYYMMDDHHmmssSSS>.txt`，非法字符替换为 `_`。 |
| 空数组保存 | 不触发下载，Promise 兑现为"无内容"；**`saveTxt` 本身只判断数组是否为空**，不判断"数组非空但全部消息正文为空字符串"的情况。 |
| 界面层的空结果判断 | 面板在调用 `saveTxt` 前额外检查：数组为空，或 `messages.every(m => m.mes === '')`，两种都视为"无内容"、显示 Toast、不调用 `saveTxt`；直接调用 API 不享有这层检查。 |
| 保存成功/失败 | 成功后 Promise 返回 `{ filename, text }`，界面显示"已导出"；失败通过 Promise 拒绝，界面用危险色 Toast 显示错误信息。返回成功只表示已触发下载，不代表磁盘落盘状态。 |

</details>

## 设置与主题

面板默认主题跟随酒馆：面板底色、卡片底色、边框、正文/标题字色、说明小字分别取宿主的 `--SmartThemeBlurTintColor`、`--SmartThemeChatTintColor`、`--SmartThemeBorderColor`、`--SmartThemeBodyColor`、`--SmartThemeEmColor`。明暗按面板底色亮度判断（`0.2126R + 0.7152G + 0.0722B` 不小于 128 取中性浅色，否则取中性深色），不依赖宿主 `color-scheme`；取不到或取到透明的槽位回落对应中性色。面板会观察宿主根元素和 `body` 的 class/style 变化，直接换色，不做过场动画。

尚无独立的"设置"页或主题切换控件；副 API 配置、提示词管理的业务逻辑已实现但未接入任何界面，见下节。

## 公开 API

以下示例代码可直接复制到已安装本扩展、并打开单人聊天的酒馆页面的浏览器控制台运行；`readCurrentChat`/`filterMessages`/`cleanMessages` 同步返回结果，`saveTxt` 为异步函数需要 `await`。

```js
// 查看版本，读取第 1–10 楼，按类型过滤。
console.log(YaKitChat.version);
const messages = YaKitChat.readCurrentChat({ start: 1, end: 10 });
console.table(YaKitChat.filterMessages(messages, { ai: true, user: true, system: false }));
```

```js
// 删除当前聊天正文中的数字，导出为带类别标注的 TXT；与面板一致的空结果判断。
let result = YaKitChat.filterMessages(YaKitChat.readCurrentChat('all'));
result = YaKitChat.cleanMessages(result, [{ pattern: '\\d+' }], 'remove');
if (result.length === 0 || result.every(m => m.mes === '')) {
    console.log('无内容');
} else {
    console.log(await YaKitChat.saveTxt(result, 'speaker'));
}
```

```js
// 正则清洗语义：多规则命中区间取并集，无效规则被跳过。
const sample = [{ floor: 1, mes: '甲123乙456丙' }];
const rules = [{ pattern: '123乙' }, { pattern: '乙456' }, { pattern: '(' }]; // 最后一条无效
console.log(YaKitChat.cleanMessages(sample, rules, 'remove')[0].mes); // 甲丙
console.log(YaKitChat.cleanMessages(sample, rules, 'keep')[0].mes);   // 123乙456
```

## 当前接入状态

**已实现（含界面）**：文本导出全流程——按楼层范围读取、按消息类型过滤、正则清洗（删除/保留两种模式）、生成并保存 TXT（两种格式）；扩展菜单入口、单页面板、三张卡片和导出区均已接入并通过人工验收。

**已实现但未接入界面/全局入口**：
- 副 API 配置管理（`src/features/api-management/`）：`getApiProfiles`、`validateApiConfig`、`shouldWarnEmptyKey`、`saveApiProfile`、`deleteApiProfile`、`selectApiProfile`、`getActiveApiConfig`；配置字段 `{ id?, name, baseUrl, key, model, provider? }`，`getActiveApiConfig` 返回 `{ source: 'main' }` 或 `{ source: 'secondary', config }`
- 提示词管理（`src/features/prompt-management/`）：`getPromptTemplates`、`validatePromptTemplate`、`savePromptTemplate`、`deletePromptTemplate`、`selectPromptTemplate`、`getActivePrompt`；记录字段 `{ category, id?, name, content }`，类别为 `jailbreak`/`regex`/`style`（对应破限词/正则提示词/文风提示词）
- 这两个模块目前**不在** `globalThis.YaKitChat` 上，只能通过模块内部引用调用，尚未暴露为公开 API

**未实现**：
- "设置"Tab 及对应 UI（副 API 配置卡片、三类提示词管理卡片）
- 提示词注入组装（`buildFinalMessages`/`injectionPlan`/`applyInjection`/`CHAT_COMPLETION_PROMPT_READY` 监听/`previewMessages`）
- 任何实际发起 AI 请求的能力
- AI 辅助过滤、标签内容提取、TXT 以外的导出格式、TauriTavern/移动端专用保存
- 群聊支持（项目长期方向，不计划支持）
- 与绘界等同系列扩展之间的公共界面文件/版本兼容

**依赖宿主接口**：`SillyTavern.getContext()` 读取当前聊天状态；`/scripts/utils.js` 的 `download()` 触发文件保存。未新增第三方依赖，未调用任何后端 HTTP 接口。副 API 配置和提示词记录计划通过宿主 `extensionSettings` + `saveSettingsDebounced()` 持久化（含密钥，已知会明文写入服务端 `settings.json` 并对同源前端可读，小主已接受此风险）。

**版本门槛**：已验证版本为 SillyTavern 1.18.0（本次开发与人工验收所用版本）。所用的 `SillyTavern.getContext()` 与 `download()` 至少从 1.9.1 起已存在，但官方未承诺跨版本的稳定兼容下限，因此最低兼容版本暂未确认；`manifest.json` 未填写 `minimum_client_version`。

## 开发与验证

- **分工**：Claude 负责需求/业务逻辑文档、README.md/Public.md/DESIGN.md 撰写与设计一致性核对；Codex（主窗口）负责核实技术事实、评估可行性、整理交接、协调验收，代码实现由"UI"和"API"两个专门会话分别推进；人工验收由小主在浏览器完成。
- **测试脚本**：
  ```sh
  node tests/text-export/text-export.test.mjs
  node tests/text-export/filter-messages.test.mjs
  node tests/text-export/clean-messages.test.mjs
  node --experimental-vm-modules tests/text-export/export-txt.test.mjs
  node --experimental-vm-modules tests/text-export/ui.test.mjs
  node tests/shared/settings.test.mjs
  ```
- **验收记录**：见 `AGENT_LOG.md` 中的人工验收条目——楼层范围与两种下载格式、speaker 固定类别标签、正则清洗独立示例及实际链路、文本导出界面（菜单入口/面板/三张卡片/导出区）均已在浏览器中确认。副 API 配置、提示词管理和注入组装尚未做浏览器人工验收。
