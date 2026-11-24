# CodeStats 鸿蒙桌面卡片

HarmonyOS NEXT 2×4 服务卡片：左边本月代码热力网格（一行七格，对应周一到周日，1 日落在它自己的星期位），中间今日 / 本月 / 本年行数，最右边本月各语言行数。三栏顶部对齐。

数据链路：`~/.codestats/daily.jsonl` → `tools/sync-gist.js` → 私有 GitHub Gist → App 拉取 → 卡片。

## 为什么要有 App

ArkTS 卡片跑在沙箱里，不能发网络请求、不能读文件。数据必须由 App（或 FormExtensionAbility）拉取后通过 `formProvider.updateForm` 推进去。卡片本身只负责渲染。

## 安装步骤

### 1. PC 端：配置 Gist 同步

```bash
node tools/sync-gist.js --init     # 看指引
```

把 token 写进 `C:\Users\yuhang\.codestats\sync.json`：

```json
{ "token": "ghp_xxx", "gistId": "" }
```

然后首次运行，会自动创建私有 gist 并回填 gistId：

```bash
node tools/sync-gist.js
```

只本地预览、不联网：`node tools/sync-gist.js --dry`（输出写入 `~/.codestats/widget.json`）。

### 2. 定时同步（Windows 任务计划）

**不要**直接用 node.exe 当任务动作——它会在桌面上闪一个黑色控制台窗口。用 `tools/codestats-sync.exe`
（源码 `tools/launcher.cpp`，GUI 子系统 + `CREATE_NO_WINDOW`，实测零窗口）：

```bat
schtasks /Create /SC MINUTE /MO 15 /TN "CodeStatsSync" /F ^
  /TR "C:\Users\yuhang\Desktop\codestats\tools\codestats-sync.exe"
```

改过路径就重新编译：

```bash
cd tools && g++ -O2 -mwindows -o codestats-sync.exe launcher.cpp
```

删除：`schtasks /Delete /TN "CodeStatsSync" /F`

> 试过但走不通的两种做法：
> - `wscript.exe + .vbs`（`Run ..., 0`）——被本机安全策略当作 LOLBin 拦截
> - 任务改成 S4U 非交互运行——注册需要管理员权限

### 3. 装到手机

1. DevEco Studio 打开 `harmony/` 目录
2. `File → Project Structure → Signing Configs` → 勾选 `Automatically generate signature`（需登录华为账号，首次要实名）
3. 手机开 USB 调试，连上后点运行

当前仓库里的 hap 是**未签名**的：

```
entry/build/default/outputs/default/entry-default-unsigned.hap
```

签名必须在本机 DevEco 里做，命令行签不了（要绑定设备 UDID）。

### 4. 首次配置

打开 App → 填 token 和 gistId → 保存 → 立即同步。
再去桌面长按 → 服务卡片 → 找到 CodeStats → 选 2×4 添加。

## 刷新规则

| 触发 | 延迟 |
| --- | --- |
| 打开 App（onForeground） | 立即 |
| 卡片定时刷新（updateDuration: 1） | 30 分钟一档 |
| 每天 00:05 定时 | 系统调度，可能顺延 |

App 被系统冻结时卡片会停止刷新，解锁或打开 App 后恢复。

## 改配色

`entry/src/main/ets/common/Grid.ets` 里的 `LEVELS` 数组，五档从「无」到「最多」。

现在按**深色卡片 + 越亮越多**（和 GitHub 深色模式一致）。想改成「越深越多」，把数组反转，同时把 `WidgetCard.ets` 的 `backgroundColor('#161c17')` 换成浅色。

## 改阈值

`Grid.ets` 的 `cellColor()`：按当月峰值百分比分档（0~20% / 20~45% / 45~75% / 75%+）。想用固定阈值（比如 50 / 150 / 300 行）直接改这里。

## 卡片数据格式

`tools/sync-gist.js` 推到 Gist 的 JSON（App 拉下来后按这个解析）：

| 字段 | 说明 |
| --- | --- |
| `cells` | 42 个数字，逗号分隔，**按日历顺序**（周一到周日逐行），`-1` = 不在本月 |
| `today` / `monthTotal` / `yearTotal` | 今日 / 本月 / 本年行数 |
| `peak` | 当月单日最高值，卡片按它分颜色档 |
| `langs` | `"TypeScript:486\|C++:312"`，本月各语言行数，最多 6 项，尾部合并成「其他」 |
| `langTop` | `langs` 第一项的行数，卡片用它算条形长度比例（避免在卡片里再遍历求最大值） |
| `yearCells` | 年度热力图，`yearWeeks * 7` 个数字，按周切列，`-1` = 未来/不在今年；**只铺到今天所在周** |
| `yearWeeks` / `yearOffset` | 总列数 / 1 月 1 日的星期偏移（周一为 0） |
| `yearPeak` | 全年单日最高值，年度图分档用 |
| `months` | 12 个月的行数，逗号分隔 |
| `yearLangs` / `yearLangsTop` | 全年语言分布，格式同 `langs` |
| `ides` / `idesTop` | 全年 IDE 分布，格式同上（名称已转成 VS Code / IntelliJ IDEA / Trae） |
| `yearActive` / `yearAvg` / `streak` | 活跃天数 / 日均 / 最长连续天数 |

`langs` 的语言名复用 `extension/stats.js` 的 `langOf()`，和仪表盘完全一致。

## 页面

| 页面 | 内容 |
| --- | --- |
| `pages/Index` | 年度主页：总览 / 年度热力图（左右滑动，默认滑到最近）/ 每月柱状 / 语言分布 / IDE 分布 |
| `pages/Settings` | token、gistId、手动同步、当前数据 |

## 结构

```
harmony/
├─ AppScope/app.json5                        包名 com.yuhang.codestats
├─ entry/src/main/
│  ├─ module.json5                           声明 FormExtensionAbility + INTERNET 权限
│  ├─ ets/entryability/EntryAbility.ets      打开 App 时刷新
│  ├─ ets/entryformability/…                 卡片生命周期，30 分钟拉一次
│  ├─ ets/common/Sync.ets                    Gist 拉取 / 缓存 / 推送卡片
│  ├─ ets/common/Grid.ets                    网格切分 + 深浅两套配色 + 千分位
│  ├─ ets/widget/pages/WidgetCard.ets        2×4 卡片 UI
│  ├─ ets/pages/Index.ets                    年度主页
│  ├─ ets/pages/Settings.ets                 设置页
│  └─ resources/base/profile/form_config.json 卡片尺寸与刷新策略
```

## 命令行编译

```bash
cd harmony
DEVECO_SDK_HOME="/d/DevEco Studio/sdk" \
  "/d/DevEco Studio/tools/node/node.exe" \
  "/d/DevEco Studio/tools/hvigor/bin/hvigorw.js" \
  assembleHap --mode module -p product=default --no-daemon
```
