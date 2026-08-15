# CodeStats · 本地代码统计（VSCode / Trae 扩展）

记录你每天在哪个 IDE 写了多少行代码。数据 100% 保存在本地 `~/.codestats/daily.jsonl`，
配合 `../dashboard`（本地仪表盘）查看 GitHub 风格贡献热力图、趋势曲线、语言/IDE/时段统计。

## 功能

- 自动识别 IDE：Trae / VSCode / Cursor / Windsurf（VSCode 系共用本扩展）
- 统计口径：插入的换行数（回车、粘贴多行计入；单行修改/删除不计）
- 状态栏显示「今日 +N 行」，命令面板：
  - `CodeStats: 今日统计`
  - `CodeStats: 打开仪表盘`
- 配置：`codestats.dataDir`（默认 `~/.codestats`）、`codestats.flushIntervalSeconds`（默认 30）

## 开发调试

用 VSCode（或 Trae）打开本目录 → 按 F5 启动「扩展开发宿主」窗口，在该窗口写代码即可看到统计。

## 目录

- `extension.js` — 扩展入口（VSCode API 交互）
- `lib.js` — 纯逻辑（IDE 识别 / 行数统计 / 记录格式），可单测
