# pi-statusline

一个仿 **Codex CLI** 底部状态栏风格的 [Pi](https://pi.dev) 扩展。用 `ctx.ui.setFooter()` 整条替换内置 footer，单行显示，`" · "` 分隔，按类别着色，窄屏自动省略。

**必须显示的六项（任何配置、任何终端宽度下都不会被关闭）：**

| 项目 | 来源 | 示例 |
| --- | --- | --- |
| 当前会话名称 | `/name` 优先；未命名时取首条用户消息（与 Pi 会话选择器一致）；再回退短 session id | `搜索关于pi的插件，比如如何自定义状态栏` |
| 当前项目路径 | `ctx.cwd`（HOME 缩写为 `~`） | `~/pi-statusline` |
| 模型名 | `ctx.model` + `model_select` | `remote-magpie/zenmux/tencent/hy4` |
| 模型推理强度 | `ctx.thinkingLevel` + `thinking_level_select` | `reasoning:max` |
| agent 运行状态 | `agent_start` / `agent_settled` / `ui_prompt_*` | `⠋ Working` / `Ready` / `Waiting for input` |
| Pi 版本号 | 从 `@earendil-works/pi-coding-agent` 导入 `VERSION` | `pi v1.5.2` |

**没有时钟、默认不显示费用**：状态栏只展示会话持久状态。未用 `/name` 命名会话时，自动用第一条用户消息作标题（和 `/resume` 会话选择器一致）；极端情况下（还没有任何用户消息）显示 `session <id前8位>`。可选附加项：git 分支、context 百分比、token、其他扩展的 `setStatus()` 文本。费用需显式开启 `showCost: true`。

宽屏效果（纯文本示意）：

```text
搜索关于pi的插件，比如如何自定义状态栏 · ~/pi-statusline · remote-magpie/zenmux/tencent/hy4 · reasoning:max · ⠋ Working · pi v1.5.2 · main · context:5% · ↑1.2k ↓300
```

窄屏时先隐藏可选项、再把最长的必显值加省略号，另外在极窄终端把分隔符从 `" · "` 收紧为 `"·"`：

```text
搜索关… · ~/pi-s… · remote… · reasoni… · ⠋ Worki… · pi v1.5…
```

## 设计参照

Codex CLI 的 `codex-rs/tui/src/bottom_pane/status_line*.rs`：

- 单行、底部状态栏、muted `" · "` 分隔符
- 按类别着色：模型/状态/元数据 cyan，路径/用量 green，分支/线程 magenta
- 逐项省略与截断；默认信息含 model+reasoning、cwd、thread name、run state、version

Pi 主题没有 Codex 的 `status-model` 等语义色，本扩展用 Pi 的 `accent` / `success` / `warning` / `dim` 语义 token 代替，会随用户主题明暗自适应。可用 `"colors": false` 或 `PI_STATUSLINE_COLORS=0` 退回全部 dim 单色。

## 项目结构

```
pi-statusline/
├── package.json              # Pi package：pi.extensions -> extensions/index.ts
├── tsconfig.json             # 指向本机 Pi 类型声明
├── extensions/
│   ├── index.ts              # 入口：事件订阅、/statusline 命令
│   ├── config.ts             # settings.json / JSON / 环境变量配置
│   ├── segments.ts           # 必显 6 项 + 可选项，纯文本生成
│   ├── render.ts             # footer Component：着色、自适应宽度、生命周期
│   └── types.ts              # 共享类型
├── scripts/check.mjs         # 无依赖自检 + 四种宽度必显项验证
├── example.statusline.json   # 完整配置示例
└── LICENSE
```

## 安装

```bash
pi install git:github.com/Hara602/pi-statusline
# 或开发时用本地目录
pi install ./pi-statusline
# 或临时试用
pi -e /home/chr/pi-statusline
```

装完在 TUI 里 `/reload`；**仅 TUI 模式生效**（`--print` / `--mode rpc` / `--mode json` 下组件工厂不渲染）。

## 命令

```
/statusline                      查看当前状态
/statusline on | off | toggle    启用 / 恢复内置 footer / 切换
/statusline reload               重新读取配置
/statusline preset minimal|compact|full
```

预设只控制**可选项**，六项必显信息始终存在：

| preset | extras | statuses |
| --- | --- | --- |
| `minimal` | 关 | 关 |
| `compact` | 开 | 关 |
| `full` | 开 | 开 |

## 配置

优先级：默认值 → `settings.json` → 专用 JSON 文件 → 环境变量。

### `~/.pi/agent/settings.json`

```json
{
  "statusline": {
    "enabled": true,
    "preset": "compact"
  }
}
```

### 专用配置文件

按顺序查找，找到第一个就停止：

1. `$PI_STATUSLINE_CONFIG`
2. `~/.pi/agent/extensions/pi-statusline.json`
3. `~/.pi/agent/pi-statusline.json`

完整字段见 `example.statusline.json`：

```json
{
  "enabled": true,
  "preset": "full",
  "separator": " · ",
  "extras": true,
  "statuses": true,
  "showCost": false,
  "nerd": false,
  "colors": true,
  "refreshMs": 250
}
```

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | session_start 时是否安装自定义 footer |
| `preset` | `compact` | `minimal` / `compact` / `full` |
| `separator` | `" · "` | 项间分隔符 |
| `extras` | `true` | 显示 git/context/tokens（无时钟、无费用） |
| `showCost` | `false` | 单独开启估算费用 `$0.012`；不受 preset / `extras` 影响 |
| `statuses` | `false` | 第二行显示其他扩展的 `setStatus()` |
| `nerd` | `false` | Nerd Font git 图标 |
| `colors` | `true` | Codex 风格分类着色；false 为单色 dim |
| `refreshMs` | `250` | spinner 动画刷新间隔；`0` 关闭定时器 |

环境变量：

```bash
PI_STATUSLINE_CONFIG=/path/to/config.json
PI_STATUSLINE_ENABLED=0|1
PI_STATUSLINE_PRESET=minimal|compact|full
PI_STATUSLINE_COLORS=0|1
PI_STATUSLINE_COST=0|1
```

配置文件缺失或格式错误时静默回退默认值，不影响 Pi 启动。

## 自定义

在 `extensions/segments.ts` 的 `buildItems()` 里加可选项：

```ts
push("hostname", "metadata", process.env.HOSTNAME);
```

`REQUIRED_ITEMS` 里的六项不要删除——`assertRequired()` 会在渲染时检查，缺任意一项会抛错。段函数只返回纯文本，所有着色在 `render.ts` 用 `theme.fg()` 完成，主题切换时不会残留旧 ANSI 色。

## 开发验证

```bash
cd /home/chr/pi-statusline
npm install
npm run typecheck
npm run check
```

`npm run check` 会用 Pi 自带的 jiti 实际加载扩展，在 200 / 100 / 60 / 30 列宽度下验证六项必显字段都在、且行不超宽。

`tsconfig.json` 目前用绝对路径指向本机 Pi 1.5.2 安装目录的类型声明；换机器或升级 Pi 后，把 `paths` 改成对应 `dist/index.d.ts` 位置，或改用已发布的类型包。

## 实现要点

- `ctx.ui.setFooter(factory)` 整条替换；`setFooter(undefined)` 恢复内置 footer。
- `footerData.getGitBranch()` / `getExtensionStatuses()` / `onBranchChange()`。
- `visibleWidth()` / `truncateToWidth()` / `stripTerminalSequences()` 处理宽度与 ANSI。
- `invalidate()` 清缓存，`dispose()` 清定时器并退订分支监听。
- 事件变化调用 `tui.requestRender()`；`agent_settled` 是「真正空闲」的最终信号。
- 参考：`docs/extensions.md`、`docs/tui.md`、`examples/extensions/custom-footer.ts`。
