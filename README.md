# 实验二：WSL + Linux + Git / 俄罗斯方块

这是在 WSL Ubuntu 中运行的浏览器小游戏。原有俄罗斯方块项目保存在 `~/tetris/index.html`，本次使用 Codex 辅助整理到课程仓库，并继续完善、运行和测试。

## 运行

在 Ubuntu 终端进入仓库后运行：

```bash
python3 -m http.server 8010 --bind 127.0.0.1 --directory tetris
```

在 Windows 浏览器打开 http://localhost:8010 。按 Ctrl+C 可停止服务。

游戏无需下载第三方依赖，也可直接用浏览器打开 `tetris/index.html`。

## 基本功能

- 7 种方块，左右移动、旋转、加速下落、直接落下。
- 消除整行并计分；每累计消除 10 行提高等级和下落速度。
- 显示下一个方块和落点提示。
- 暂停、继续、游戏结束后重新开始。

## 操作

| 按键 | 功能 |
| --- | --- |
| 左右方向键 | 移动 |
| 上方向键 / X | 旋转 |
| 下方向键 | 加速下落 |
| 空格 | 直接落下 |
| P | 暂停 / 继续 |

## Git 实验

本仓库保留创建分支、合并分支和解决冲突的实验记录，`conflict.txt` 是冲突解决练习文件。

仓库：https://github.com/cy555556/git-test
