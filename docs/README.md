# docs：新手上手网页

这个目录是「纪实」的新手上手指南，做成一个可以直接用 GitHub Pages 发布的网页。

| 文件 | 作用 |
| --- | --- |
| `index.html` | 指南正文，样式和脚本都写在文件里，没有外部依赖 |
| `images/` | 界面截图（WebP，按出现顺序编号） |
| `.nojekyll` | 告诉 GitHub Pages 原样发布，不走 Jekyll |

## 怎么发布

在仓库的 Settings → Pages 里，Source 选 **Deploy from a branch**，分支选 `main`、目录选 `/docs`，保存后等一两分钟，网页地址是：

```text
https://git-yafaya.github.io/ST-YaKit-chat/
```

## 关于截图

- 截图取自 SillyTavern 里的实际界面，主题为默认的「冷杉与海盐」。
- 画面里的聊天正文、角色名和润色结果都换成了示例文字，不包含真实聊天内容。
- 界面改版后需要重截：开着酒馆，用无头 Chrome 打开面板、按元素裁剪保存，再转成宽度 1800（手机图 900）的 WebP。

## 改内容时

- 功能说明要和仓库根目录的 `README.md` 对齐，术语保持一致。
- 这份指南面向零基础用户，按「任务」分节，一步一句话配一张图；不写实现细节。
