# 纪实 · 仓库与公开接口说明

## 速查区

- **仓库是什么**：SillyTavern 扩展"纪实"（YaKit 系列）。v0.1.0 只实现"文本导出"核心逻辑：按楼层范围和消息类型筛选当前聊天，导出为 TXT 文件。
- **技术栈**：原生 JavaScript（ES Modules），无构建步骤，酒馆直接加载。
- **入口文件**：`src/index.js`（`manifest.json` 的 `js` 字段指向），注册全局对象 `globalThis.YaKitChat`。
- **公开 API 一览**：`YaKitChat.readCurrentChat(range)`、`YaKitChat.filterMessages(messages, types)`、`YaKitChat.saveTxt(messages, format)`，以及只读版本号 `YaKitChat.version`。
- **当前还没做什么**：没有任何 UI（面板/按钮/设置页），只能通过浏览器控制台调用；不含 AI 处理、标签提取、关键词/正则过滤；只有 TXT 一种导出格式；不支持预设、多 API 配置；不支持群聊（项目长期方向，不计划支持）；不接入 TauriTavern/移动端专用保存；不提供给绘界等同系列扩展复用的公共界面文件。

## 仓库结构

```text
ST-YaKit-chat/
├── manifest.json                 扩展声明，"js" 字段指向 src/index.js
├── src/
│   ├── index.js                  宿主接入注册，组装并导出 YaKitChat 公开入口
│   └── features/
│       └── text-export/
│           ├── read-chat.js          按楼层范围读取当前聊天
│           ├── filter-messages.js    按消息类型过滤，提供消息分类辅助函数
│           └── export-txt.js         生成 TXT 内容（含固定类别标签）、文件名并触发保存
└── tests/
    └── text-export/               本地自动化测试，不随扩展加载，路径未随迁移变化
```

<details>
<summary>完整文件列表</summary>

```text
ST-YaKit-chat/
├── manifest.json
├── src/index.js
├── src/features/text-export/read-chat.js
├── src/features/text-export/filter-messages.js
├── src/features/text-export/export-txt.js
├── tests/text-export/text-export.test.mjs
├── tests/text-export/filter-messages.test.mjs
├── tests/text-export/export-txt.test.mjs
├── DESIGN.md                     UI 与动效规范（本轮尚无 UI，暂未使用）
├── AGENT_LOG.md                  Claude / Codex 协作节点记录
├── AGENTS.md / CLAUDE.md         协作协议（符号链接）
└── .gitignore
```

`需求文档-文本导出MVP.md`、`技术交接-文本导出MVP.md`、`sillytavern_API.md`、`CLAUDE.local.md` 属于本地协作文档，按 `.gitignore` 规则不提交仓库。

</details>

## 加载与数据流

酒馆按 `manifest.json` 的 `js` 字段加载 `src/index.js`；`src/index.js` 把 `readCurrentChat`、`filterMessages`、`saveTxt` 三个函数和只读的 `version` 挂到 `globalThis.YaKitChat` 上。三个函数需要在浏览器控制台按顺序手动调用：

1. `readCurrentChat(range)`：用 `SillyTavern.getContext()` 取当前聊天，按闭区间楼层范围（从 1 开始）截取，返回消息快照数组。
2. `filterMessages(messages, types)`：按类型开关（`ai`/`user`/`system`）筛选上一步的结果。
3. `saveTxt(messages, format)`：把筛选结果拼成 TXT 文本，用当前角色卡名称和本地时间生成文件名，复用宿主 `/scripts/utils.js` 的 `download` 函数触发保存。

<details>
<summary>边界情况</summary>

| 情况 | 实际行为 |
| --- | --- |
| 楼层编号 | 接口从 1 开始，闭区间；接口第 1 楼对应宿主内部 `#0`，过滤后保留原楼层号。 |
| 不传范围或传 `'all'` | 读取全部楼层；对象范围省略 `start` 取 1，省略 `end` 取最后一楼。 |
| 起止颠倒、超界 | 先交换颠倒端点，再各自收缩到 `[1, 消息数]`（例如只有 4 楼时，`99–100` 得到第 4 楼；`-9–-1` 得到第 1 楼）。 |
| 空聊天、未选角色 | 返回 `[]`，不再校验范围，也不导出宿主的欢迎消息。 |
| 范围参数格式错误 | 非对象/非 `'all'` 或端点非整数，抛出 `TypeError`；颠倒和超界本身不报错。 |
| 群聊 | 读取和非空保存均抛出"仅支持单人聊天"。 |
| 读取结果字段 | 每条为独立快照：`{ floor, name, mes, is_user, is_system, extra: { type } }`，正文原样保留，不携带完整宿主消息对象。 |
| 未传类型参数 | `ai`/`user`/`system` 全部启用；显式传 `undefined` 同样按默认处理。 |
| 已传类型参数但全部关闭 | 抛出"请至少选择一种消息类型"，即使消息列表为空也会检查。 |
| 类型参数错误 | 非普通对象、未知字段或非布尔开关，抛出 `TypeError`。 |
| 消息分类 | `is_system` 为真值或 `extra.type === 'narrator'` 优先归系统；其次 `is_user` 为真值归用户；其余归 AI。 |
| 筛选结果 | 返回新数组，保留顺序及输入消息对象引用，不修改输入。 |
| 文本格式 | `speaker`：按消息分类添加固定前缀"AI："/"用户："/"系统："（不使用消息里的真实姓名）+ 正文；`plain`：仅正文；两种格式消息间均以两个换行分隔，不剥离 Markdown/标签/空白。 |
| 文件名 | `<调用保存时的角色卡名称><本地时间戳 YYYYMMDDHHmmssSSS>.txt`，非法字符和控制字符替换为 `_`。 |
| 读取后切换角色再保存 | 文件名使用保存时的角色卡名称，消息快照不绑定原角色身份。 |
| 空数组保存 | 不加载下载模块、不触发下载，Promise 兑现为提示"无内容"。 |
| 非空保存参数错误 | 无效格式、空角色卡名或非字符串正文均报错且不调用下载；`speaker` 按消息标记分类出固定标签，对消息的 `name` 字段没有字符串要求。 |
| 保存成功/失败 | 成功后 Promise 返回 `{ filename, text }`；参数或宿主加载/下载错误通过 Promise 拒绝传递。返回成功只表示已触发下载，不代表磁盘落盘状态。 |

</details>

## 设置与主题

本版本没有设置项，也没有界面或主题，不适用。

## 公开 API

以下示例代码来自 Codex 技术交接单原文，可直接复制到已安装本扩展、并打开单人聊天的酒馆页面的浏览器控制台运行；`readCurrentChat` 和 `filterMessages` 同步返回数组，`saveTxt` 为异步函数需要 `await`。全局对象还公开只读版本值 `YaKitChat.version`。

```js
// 查看版本及第 1–10 楼，结果过界时自动收缩。
console.log(YaKitChat.version);
console.table(YaKitChat.readCurrentChat({ start: 1, end: 10 }));

// 读取全部楼层，默认保留三种消息类型。
console.table(YaKitChat.filterMessages(YaKitChat.readCurrentChat('all')));

// 只保留 AI 回复；省略的开关为关闭。
console.table(YaKitChat.filterMessages(YaKitChat.readCurrentChat(), { ai: true }));
```

```js
// 导出第 1–10 楼，按类别标注 AI：、用户：或系统：。
await YaKitChat.saveTxt(
    YaKitChat.filterMessages(YaKitChat.readCurrentChat({ start: 1, end: 10 })),
    'speaker',
);
```

```js
// 导出全部楼层的 AI 和用户消息，仅保留正文。
await YaKitChat.saveTxt(
    YaKitChat.filterMessages(YaKitChat.readCurrentChat(), {
        ai: true,
        user: true,
        system: false,
    }),
    'plain',
);
```

```js
// 空结果只返回提示；全关类型抛错，由调用方展示。
console.log(await YaKitChat.saveTxt([]));
try {
    YaKitChat.filterMessages(YaKitChat.readCurrentChat(), {
        ai: false,
        user: false,
        system: false,
    });
} catch (error) {
    console.log(error.message);
}
```

## 当前接入状态

**已实现**：任务01/02/03——按楼层范围读取当前聊天、按消息类型过滤、生成并保存 TXT（speaker 固定类别标签/plain 两种格式），均可在浏览器控制台串联调用。入口与源码位于 `src/`，本地三组测试通过：

```sh
node tests/text-export/text-export.test.mjs
node tests/text-export/filter-messages.test.mjs
node --experimental-vm-modules tests/text-export/export-txt.test.mjs
```

**未接入**：
- UI（面板、按钮、设置页）
- AI 小说化润色、AI 辅助过滤
- 标签内容提取、关键词/正则过滤
- TXT 以外的导出格式（Markdown、JSON、EPUB）
- 预设保存、多 API 配置
- 群聊支持（项目长期方向，不计划支持）
- TauriTavern、移动端专用保存
- 与绘界等同系列扩展之间的公共界面文件/版本兼容

**依赖宿主接口**：`SillyTavern.getContext()` 读取当前聊天状态；`/scripts/utils.js` 的 `download()` 触发文件保存。未新增第三方依赖，未调用任何后端 HTTP 接口。

**版本门槛**：已验证版本为 SillyTavern 1.18.0（本次开发与人工验收所用版本）。所用的 `SillyTavern.getContext()` 与 `download()` 至少从 1.9.1 起已存在（[getContext 源码](https://github.com/SillyTavern/SillyTavern/blob/1.9.1/public/script.js#L6290)、[download 源码](https://github.com/SillyTavern/SillyTavern/blob/1.9.1/public/scripts/utils.js#L22)），但官方未承诺跨版本的稳定兼容下限，因此最低兼容版本暂未确认；`manifest.json` 未填写 `minimum_client_version`。

## 开发与验证

- **分工**：Claude 负责需求/业务逻辑文档、README.md/Public.md/DESIGN.md 撰写与设计一致性核对；Codex 负责代码实现与自动化测试；人工验收由小主在浏览器控制台完成，Codex 不做浏览器自动化验收。
- **测试脚本**：见上节"已实现"下的三条命令，对应范围/类型组合/正文格式与旁白识别、消息筛选、下载入口三组检查。
- **验收记录**：见 `AGENT_LOG.md` 中两条人工验收条目——2026-09-13T13:21:30+09:00 确认 1–10 楼范围、speaker/plain 两种真实下载格式、楼层编号映射；2026-09-13T13:48:13+09:00 确认 speaker 固定类别标签（"AI：/用户：/系统："）的修正结果。其余边界行为依据自动化测试，未扩大人工验收范围。
