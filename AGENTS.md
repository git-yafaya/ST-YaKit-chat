# YaKit-纪实 开发约定

> 适用范围：本文件所在的 `ST-Yakit-chat` 插件目录及其子目录。
>
> 本文件根据 `YaKit-纪实-开发交接-v0.8.1.md` 整理。交接文档记录的是 v0.8.1 基线；当前源码的实际版本以 `manifest.json` 和 `index.js` 为准（当前 `manifest.json` 为 v0.10.0）。如果历史文档与当前实现的技术细节冲突，先检查源码，再保留下面明确的产品与交互约定。

## 项目定位

YaKit-纪实是 SillyTavern 的聊天记录清洗与导出扩展，核心职责是：

- 从当前聊天读取消息。
- 按设置保留用户、AI、系统消息，并可保留发送者名称。
- 按用户确认的手动规则清洗正文。
- 用 AI 分析聊天格式并提出正则清洗建议。
- 导出 TXT 或 Markdown。

插件不是小说生成器，也不能自动改写或修改聊天正文。AI 只能提出建议；任何规则都必须由用户明确确认后才能加入当前预设。

## 家族项目关系

本项目与以下项目属于 YaKit 家族项目：

```text
/home/yafaya/SillyTavern/docker/extensions/ST-YaKit-Timeline
```

当前项目负责聊天纪实、清洗与导出；兄弟项目有自己的产品边界、设计文档和 `AGENT.md`。两者是协作关系，不是同一个扩展，不要未经要求合并产品职责、设置结构、入口、扩展 ID 或发布流程。

- 需要处理品牌、SillyTavern 宿主 API、安全存储或其他潜在共享约定时，先同时核对两个项目的约定和当前实现。
- 跨项目契约必须明确记录并实际验证；不要仅凭另一个项目的实现推断本项目可以直接复用。
- 未获得用户明确授权时，只修改当前项目，不直接改动 `ST-YaKit-Timeline`。
- 如果任务明确涉及两个项目，分别遵守各自的 `AGENT.md`、设计文档、测试和构建流程，并在交付中分别说明改动范围与验证结果。

## 不可回退的产品与 UI 约定

- 品牌名为 `YaKit-纪实`，魔法棒入口也显示为 `YaKit-纪实`。
- 用户可见产品文案统一使用 `YaKit-纪实`；日志、Secret 标签、新增 ASCII 文件名和其他不能使用中文的内部位置使用 `YaKit-chat`。
- 内部扩展 ID 必须保持为 `st-YaKit-chat`。
- 旧的 `st_chat_exporter_wand_button` 与 `YaKit ·` profile 前缀只作为迁移/兼容识别保留，不要作为新代码命名。
- 主弹窗使用 `导出`、`清洗规则`、`AI 分析`、`设置` 四个 Tab。
- AI 页只保留正则助手抽屉；`AI 接口` 下拉仍可选择主 API 或具体副 API。
- 副 API 是 YaKit 的共享多连接配置层，配置入口位于设置页的独立“副 API”分组。
- 副 API 详情使用独立编辑弹窗；名称直接在编辑器中修改，不要重新加入独立重命名弹窗。
- 副 API 的复制功能已删除，除非用户明确要求，不要恢复。
- 不要恢复“主 API 失败后自动切副 API”的 UI 或行为。旧设置中的 `apiMode: 'fallback'` 只迁移为 `secondary`。
- 新建副 API 必须先创建临时草稿，只有点击“确认添加”后才写入连接列表。
- 新建弹窗关闭、点击 X、点击遮罩或按 Escape 都必须丢弃草稿，不得产生连接。
- 新建名称输入框初始保持空白；只有确认时为空，才使用自动名称（例如 `副 API 6`）。
- 未保存草稿显示“未保存”，不显示删除按钮；代码层也必须拒绝删除草稿。
- 已保存连接的底部按钮顺序为：左侧“关闭”，右侧“删除”紧挨“保存配置”。删除必须是完整按钮。

## 视觉与交互风格

- 控件不要做得过小；整体保持大圆角、充分留白和宽松布局。
- Ubuntu / Chromium 下要保持稳定，不依赖难看的原生控件样式。
- 下拉框优先使用已有的 `enhanceSelect()`，不要随意改回原生 select。
- 保留自然的过渡动画，不要为了修 bug 删除动画。
- AI 抽屉动画当前约定：展开 260ms，收起 220ms，使用自然的 cubic-bezier 缓动；箭头过渡约 240ms。
- Web Animations 不要使用会持续接管布局的 `fill: 'both'`。动画结束或取消后清理临时的 `height`、`opacity`、`overflow` 内联样式。
- 新增可隐藏元素时注意 `.stce-field { display: flex; }` 等规则可能覆盖 `[hidden]`；必要时增加 `xxx[hidden] { display: none !important; }`。
- 页面纵向滚动由当前激活的 panel 负责；设置页的副 API 长列表单独滚动，不要让多层父子容器同时争抢同一方向的滚动。

当前 v0.10.0 UI 重构以 Timeline 的实现为参考：

- 使用 `.stce-root` 内的 `--stce-*` 语义 Token；组件样式不要继续新增散落的 `rgb(127 127 127 / …)` 视觉常量。
- 视觉层使用较高不透明度的前景背景，保留轻量 `backdrop-filter`、柔和边框和阴影；不要让聊天背景明显穿透内容区域。
- Tab 使用紧凑的分段控制样式；卡片、预览区、按钮和弹窗沿用统一的 `--stce-radius-*`、边框和阴影。
- 新增样式注释使用通俗易懂的中文；不要为了改样式修改 `body`、`html` 或其他全局选择器。
- Shell 顶部按“左侧品牌—中间导航—右侧状态”的位置摆放；设置作为主导航页，不要把副 API 配置继续塞回 AI 分析页。
- 设置页使用分组手风琴；主题放在外观分组，副 API 放在独立分组，主题偏好保存到 `settings.ui.theme`。
- Tab 保持固定几何，使用 `aria-selected`、键盘方向键和轻量 `opacity + translateY` 切换；不要恢复旧的玻璃滑块弹性动画。
- 自定义下拉框必须保留键盘导航、ARIA 状态、绝对定位弹层和稳定滚动条空间，不要依赖原生 `<select>` 弹层。
- 主视图只保留清晰的内容区滚动 owner；长列表内部滚动时必须同步 thumb 与布局高度。
- 弹窗沿用遮罩、圆角面板、明确的标题/操作区和 `role="dialog"`；交互状态通过 `aria-*` 与 `:focus-visible` 表达。
- 跟随 SillyTavern 主题时读取 `getContext().powerUserSettings.custom_css`，配色直接继承已应用的 `SmartTheme` 变量；不要使用系统主题、`body` 背景或其他明暗推断。
- 插件自己创建的弹窗需要支持点击空白遮罩关闭；只有事件目标等于遮罩本身时才关闭，不能误关内部表单。

## 清洗规则与预设

手动规则和 AI 规则使用同一套最终规则系统。规则支持：

- 类型：标签、固定文本、正则。
- 执行阶段：单条消息、合并后全文。
- 目标角色：用户、AI、系统等。
- 启用/禁用、排序、编辑、删除、复制、测试。

当执行阶段为“合并后全文”时，角色选择应自动禁用，因为此时已经没有逐消息角色意义。

预设结构保持以下语义：

```js
{
    activePresetId,
    presets: [
        { id, name, rules: [...] }
    ]
}
```

旧版全局规则需要迁移到默认预设。每个预设拥有独立规则集；切换预设时清空 AI 抽样、摘要和建议等临时分析结果，不能把一个故事的建议误加到另一个故事。

## 设置与数据边界

普通插件设置通过：

```js
SillyTavern.getContext().extensionSettings
saveSettingsDebounced()
```

保存。不要在代码中硬编码 SillyTavern 用户设置文件路径。

允许持久化：

- UI / 插件配置。
- 清洗规则与规则预设。
- API 配置引用（例如 `secretId`、连接 ID）。
- 当前选择状态。

禁止持久化：

- 聊天正文。
- AI 抽样内容。
- AI 分析历史。
- AI 返回的临时建议内容。

## AI 正则助手

- 抽样应从聊天开头、中间、结尾均匀选取代表性消息；常用数量为 6、8、10、12。
- AI 只分析格式并提出清洗规则建议，不自动修改聊天、不自动加入规则、不替用户决定。
- 建议结果应尽量包含：建议原因、正则内容、执行阶段、作用范围、命中数量、删除比例和风险提示。
- 将已有规则提供给 AI，尽量避免重复建议。
- `AI 接口` 下拉直接显示“主 API（当前聊天）”和具体副 API 名称及模型，例如 `名称 · 模型`；不要恢复旧的“主 API / 副 API 二级选择”。
- 用户改变接口选择时立即更新 `settings.ai.apiMode` 与 `settings.ai.secondaryConnectionId` 并保存。
- 下游请求可能仍使用参数名 `secondaryProfileId`；不要仅因名称带 profile 就误判为旧 UI 逻辑，先确认请求路由实现。
- 选择具体副 API 后，关闭并重新打开 YaKit 仍应保持选择，并在开始分析时实际使用该连接。

当前 AI 设置语义为：

```js
ai: {
    apiMode: 'primary', // 或 'secondary'
    secondaryConnectionId: '',
}
```

## 共享副 API 与密钥安全

共享设置 key：

```js
const SHARED_SECONDARY_API_KEY = 'yakit-shared-secondary-api';
```

旧 key `yafaya-shared-secondary-api` 必须保留迁移逻辑。共享层对外通过 `window.YaKitSharedSecondaryApi` 提供连接读取、活动连接切换和 profile/配置读取能力；其他 YaKit 插件应能够复用这套配置。

共享连接至少保持以下语义：

```js
{
    id,
    name,
    apiUrl,
    model,
    secretId,
}
```

共享存储版本以当前源码为准。当前源码已使用 v3，并从旧的单连接/v2 profile 结构迁移；不要把旧交接文档中的 `profileId` 结构直接写回新逻辑。

API Key 不得写入普通插件设置或明文连接配置。使用 SillyTavern Secrets：

```js
SECRET_KEYS.CUSTOM
writeSecret(...)
rotateSecret(...)
secret_state
```

每个副 API 只保存 `secretId`。`writeSecret()` 可能会把新 Secret 激活为当前 Custom Secret；写入或临时 rotate 后必须尽力恢复操作前激活的 Custom Secret，不能悄悄改变用户主 API。

当前副 API 请求直接使用 SillyTavern 的 Custom/OpenAI-compatible 后端；获取模型使用：

```text
/api/backends/chat-completions/status
```

请求中使用对应的 URL、Custom Secret 和模型配置。模型列表只做运行期缓存，不需要长期持久化。

## 副 API 列表与滚动条

副 API 长列表使用内部自定义滚动条，隐藏浏览器原生滚动条。应支持：

- 鼠标滚轮。
- 拖动 thumb。
- 点击轨道跳转。

典型结构为：

```html
<div class="stce-secondary-list-wrap">
    <div class="stce-secondary-list"></div>
    <div class="stce-secondary-scrollbar">
        <div class="stce-secondary-scrollbar-thumb"></div>
    </div>
</div>
```

修改滚动或抽屉逻辑时优先现场验证以下行为：

1. 连接达到 6～10 条时滚轮、拖动和轨道点击都正常。
2. 删除中间或末尾连接后，thumb 长度和位置实时更新。
3. 列表变短后抽屉正常回缩，不残留旧高度。
4. 不出现浏览器原生滚动条，滚动条在不同 SillyTavern 主题下不过粗、不过亮、不贴边。

不要用动画结束后仍占据布局控制权的方式固定高度；列表应跟随真实内容高度。

## 子代理协作约定

有实际开发、排查或重构任务时，按下面的方式组织子代理：

- 优先启用多个 `gpt-5.6-luna` 子代理并行执行，思考强度统一设为 `max`。
- Luna 的任务必须拆成边界清楚、可以独立完成的部分；涉及代码修改时尽量按不同文件或模块划分，避免多个代理同时改同一处代码。
- 使用 `gpt-5.6-sol` 子代理负责独立审查，思考强度设为 `high`。审查重点包括功能正确性、兼容性、回归风险、数据安全和是否遵守本文件约定。
- Luna 出现报错、明确受阻、连续验证失败，或表示无法可靠解决问题时，立即让 Sol 介入并接管对应问题，不要让 Luna 在同一错误路径上反复尝试。
- 主代理负责拆分任务、整合结果和最终验证；Sol 提出的阻断问题解决前，不得把任务标记为完成。
- 只在存在具体任务时创建子代理，任务完成后及时关闭，避免保留没有工作的空闲代理。

## 修改、验证与打包

修改插件代码后至少执行：

```bash
node --check index.js
```

如果修改版本，必须同步更新：

- `manifest.json` 的版本号。
- `index.js` 中对外输出或日志里的版本号（如有）。

发布 ZIP 必须直接包含以下三个文件，不能额外嵌套一层目录：

```text
index.js
style.css
manifest.json
```

接手已有工作时先检查工作树，保留用户已有改动；不要依赖临时 `/mnt/data` 工作目录作为长期基线。优先在现有源码上做小范围修复，不要无必要地重构数据结构。

## Git 交付

本轮真正修改插件文件后，最终回复必须附带一条可直接执行的提交命令，提交信息要准确描述改动：

```bash
git add index.js style.css manifest.json AGENTS.md && git commit -m "按 SillyTavern 自定义 CSS 优化主题与弹窗"
```

如果本轮没有修改文件，明确说明“不需要 commit”。
