# pi-statusline

一个自己写的 [Pi](https://pi.dev) statusline / footer 扩展。用 `ctx.ui.setFooter()` 整条替换内置 footer，左侧显示目录与 git 分支，右侧显示模型、上下文、token、费用、时间和工作状态。

仅 TUI 模式生效（`print` / `rpc` / `json` 下组件工厂会被忽略）。

## 项目结构

```
pi-statusline/
├── package.json              # Pi package 清单：pi.extensions -> extensions/index.ts
├── tsconfig.json             # 指向本机 Pi 1.5.2 类型做类型检查
├── extensions/
│   ├── index.ts              # 扩展入口：事件、/statusline 命令、安装 footer
│   ├── config.ts             # settings.json / JSON 文件 / 环境变量配置
│   ├── segments.ts           # 各信息段的纯函数，方便增删
│   ├── render.ts             # footer Component，宽度/主题/刷新处理
│   └── types.ts              # 共享类型
├── scripts/check.mjs         # 无依赖的结构自检
├── example.statusline.json   # 配置示例
└── LICENSE
```

## 运行

临时试用（不写入 Pi 配置）：

```bash
pi -e /home/chr/pi-statusline
```

作为本地包安装（写入 `~/.pi/agent/settings.json` 的 `packages`）：

```bash
pi install ./pi-statusline
```

也可以不安装，直接把 `extensions/index.ts` 所在目录链接到 `~/.pi/agent/extensions/pi-statusline/`；改代码后用 `/reload` 热加载。

## 命令

```
/statusline                     查看当前状态
/statusline on | off | toggle   启用 / 恢复内置 footer / 切换
/statusline reload              重新读取配置
/statusline preset minimal|compact|full
```

## 配置

优先级从低到高：内置默认值 → `settings.json` → 专用 JSON 文件 → 环境变量。

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

1. `$PI_STATUSLINE_CONFIG`（绝对路径，或相对当前工作目录）
2. `~/.pi/agent/extensions/pi-statusline.json`
3. `~/.pi/agent/pi-statusline.json`

完整字段见 `example.statusline.json`：

```json
{
  "enabled": true,
  "preset": "full",
  "separator": " │ ",
  "left": true,
  "right": true,
  "statuses": true,
  "nerd": false,
  "refreshMs": 1000
}
```

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | session_start 时是否安装自定义 footer |
| `preset` | `compact` | `minimal` / `compact` / `full` |
| `separator` | `" │ "` | 段间分隔符 |
| `left` / `right` | `true` | 是否显示左右两组 |
| `statuses` | `false` | 第二行显示其他扩展用 `ctx.ui.setStatus()` 设置的状态 |
| `nerd` | `false` | true 时使用 Nerd Font 字形 |
| `refreshMs` | `1000` | 时钟/工作状态刷新间隔；`0` 关闭定时器 |

环境变量：

```bash
PI_STATUSLINE_CONFIG=/path/to/config.json
PI_STATUSLINE_ENABLED=0|1
PI_STATUSLINE_PRESET=minimal|compact|full
```

`PI_CODING_AGENT_DIR` / `HOME` 决定 agent 目录；找不到配置文件就用默认值，不会报错。

## 自定义

在 `extensions/segments.ts` 的 `SEGMENTS` 数组里加一项即可：

```ts
{
  id: "hostname",
  label: "machine name",
  render: () => process.env.HOSTNAME ?? undefined,
}
```

再把 id 加进 `groupsFor()` 的 `left` 或 `right`。`render()` 返回 `undefined` 时该段自动隐藏。段函数只返回纯文本，颜色统一在 `render.ts` 里用 `theme.fg()` 加，主题切换时不会残留旧 ANSI 色。

## 类型检查

先安装 devDependency，然后：

```bash
cd /home/chr/pi-statusline
npm install
npm run typecheck
npm run check
```

`tsconfig.json` 目前用绝对路径指向本机 Pi 1.5.2 安装目录的类型声明；换机器或升级 Pi 后，把 `paths` 改成对应的 `dist/index.d.ts` 位置，或改用 npm 上发布的包类型。

## 实现要点

- `ctx.ui.setFooter(factory)` 整条替换内置 footer；`setFooter(undefined)` 恢复。
- `footerData.getGitBranch()` / `getExtensionStatuses()` / `onBranchChange()` 提供 git 与扩展状态。
- 每段 `render(width)` 都用 `visibleWidth()` + `truncateToWidth()` 保证不超宽。
- `invalidate()` 清渲染缓存；`dispose()` 清定时器并退订分支监听。
- 状态变化调用 `tui.requestRender()`。
- 参考：`docs/extensions.md`「Widgets, Status, and Footer」、`docs/tui.md`、`examples/extensions/custom-footer.ts`、`examples/extensions/status-line.ts`。
