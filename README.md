# 笔记宽度 / Note Width

> An Obsidian plugin that lets you control the reading/editing width **per note, per folder, or globally**, with an instant-preview slider and persistent frontmatter storage. UI in Simplified Chinese.

为每一篇 Obsidian 笔记单独控制阅读/编辑区宽度，也可以按文件夹批量控制，或者设置一个全局默认值。
不需要写 CSS、不需要改主题，开关 + 滑块就完事，结果跟随笔记一起走（写入 frontmatter）。

- 三级优先级：**单笔记 frontmatter > 文件夹规则（最长前缀匹配）> 全局默认**
- 宽度形态：**「全宽」开关**，或自定义 **`px` / `%`**（滑块 + 文本框双向同步、所见即所得）
- 单笔记设置写入笔记自己的 frontmatter（字段：`note-width`），跟着笔记走，重命名 / 移动也不丢
- 文件夹规则与全局默认值保存在插件 `data.json`，跟随 vault 同步
- 阅读模式与编辑模式宽度严格一致（解决了百分比在编辑模式下逐层嵌套相乘的问题）
- 不污染未启用宽度的笔记（所有 CSS 选择器都被 `[data-note-width=...]` 属性门控）

## 截图

> _截图待补_

## 安装

> 本仓库**不提交构建产物 `main.js`**（由 `.gitignore` 排除）。直接 `git clone` 主分支拿到的是纯源码，需要先构建一次或从 Release 下载产物，才能被 Obsidian 加载。

### 方式 A：从 Release 下载（推荐普通用户）

1. 在仓库 [Releases](../../releases) 页面下载最新版的 `manifest.json`、`main.js`、`styles.css`
2. 在 vault 的 `.obsidian/plugins/note-width/` 下放好这三个文件（如目录不存在请自行创建）
3. Obsidian → 设置 → 第三方插件 → 关闭「安全模式」
4. 已安装插件列表里找到 **笔记宽度** → 打开开关

### 方式 B：从源码构建

要求：Node.js ≥ 18。

```bash
git clone <this-repo> note-width
cd note-width
npm install
npm run build
```

构建后当前目录会生成 `main.js`。把 `manifest.json` / `main.js` / `styles.css` 一起拷到目标 vault 的 `.obsidian/plugins/note-width/`，然后按上面方式 A 第 3、4 步启用。

> 也可以直接把整个克隆目录就放在 `<vault>/.obsidian/plugins/note-width/` 下，构建产物会原地生成；这种方式适合开发时改完源码立即在 Obsidian 里重载。

## 使用

### 单篇笔记

- 笔记标题栏右侧会出现一个 ↔ 图标 → 点击打开宽度面板
- 面板里：**全宽**开关 / 单位（px / %）/ 滑块 / 数值文本框 / 沿用上一级 / 取消 / 保存
- 拖滑块或输入数值时**实时预览**；点击「保存」才会写入 frontmatter
- 取消（按 Esc 或点取消）会回滚预览到打开面板前的状态
- 命令面板提供等价命令：`设置当前笔记宽度…`、`切换当前笔记全宽`

frontmatter 字段示例：

```yaml
---
note-width: full        # 全宽
# note-width: 900px     # 自定义像素
# note-width: 70%       # 自定义百分比
# note-width: default   # 显式沿用上一级（等价于不写该字段）
---
```

合法值正则：`^(full|default|\d+(\.\d+)?(px|%))$`，非法值会被忽略并在 DevTools 控制台输出告警。

### 文件夹规则 + 全局默认

进入：设置 → 第三方插件 → 笔记宽度

- **全局默认宽度**：`default` / `full` / `<n>px` / `<n>%`，留空等同 `default`
- **文件夹规则**：每行 = 文件夹路径（vault 相对路径，留空表示仓库根） + 宽度值
  - 路径用 `/` 分隔；段匹配（`foo` 不会匹配 `foobar/x.md`）
  - **最长匹配前缀的规则胜出**
  - 任何笔记自身的 frontmatter 都会覆盖文件夹规则
- 输入合法即即时保存；非法值输入框会变红，不会入库

### 优先级一图流

```
某篇笔记的最终宽度
  ├─ 笔记 frontmatter `note-width` 字段（合法且非 default）─────► 用它
  ├─ 否则：找最长匹配前缀的文件夹规则（合法且非 default）─────► 用它
  ├─ 否则：插件全局默认值（合法且非 default）──────────────────► 用它
  └─ 否则：完全不干预，保持 Obsidian 原生表现
```

## 兼容性

- Obsidian 版本：≥ 1.4.0
- 平台：桌面端 + 移动端（`isDesktopOnly: false`）
- 模式：阅读模式 / 源码模式（CodeMirror 6 / Live Preview）均支持
- 与主题的关系：使用属性选择器 + `!important` 覆盖宽度，绝大多数主题可以正常工作。如果某个主题在 `.cm-content` / `.markdown-preview-sizer` 上自己写了更高优先级的 `max-width` 规则导致冲突，请提 Issue 附上主题名。

## 开发

```bash
npm run dev    # esbuild watch，改源码自动重打包；改完在 Obsidian 里重载插件
npm run build  # 生产构建：tsc 类型检查 + esbuild 压缩，输出 main.js
npm test       # 纯逻辑自测：覆盖 parseWidthValue / resolveWidth 全部边界用例
npm run dump   # 离线扫描 vault 内所有笔记，按当前 data.json 输出每篇预期生效宽度
```

### 项目结构

```
src/
  types.ts          # 类型定义、frontmatter 字段名常量
  widthEngine.ts    # 纯逻辑：值校验 + 三级优先级解析 + DOM 应用
  main.ts           # 插件主类：加载设置 / 注册命令、按钮、事件 / 应用宽度
  widthModal.ts     # 单笔记宽度设置 Modal（滑块+文本框双向同步、实时预览）
  settings.ts       # 设置面板：全局默认 + 文件夹规则
styles.css          # 仅命中 [data-note-width] 的样式，绝不污染未启用的笔记
scripts/
  selftest.mjs      # Node 端自测：esbuild 程序化打包 widthEngine 后跑断言
  dump-vault.mjs    # Node 端工具：扫 vault 模拟 resolveWidth，便于排查
manifest.json       # 插件元数据
```

### 自测如何工作

由于 Obsidian 插件运行在 Electron renderer 中，外部 Node 脚本无法直接调用 `Plugin` 实例，但 `widthEngine.ts` 是**完全纯函数、无 Obsidian 依赖**——`scripts/selftest.mjs` 用 esbuild 程序化把它打包成内存 CJS 字符串，再用 `vm.runInContext` 加载执行，对 38 条边界用例跑断言。这样改逻辑不需要进 Obsidian 也能验证回归。

`npm run dump` 同样的加载方式，加上递归扫 vault 中所有 `.md`，输出每篇笔记的 frontmatter 与最终解析结果，方便排查「为什么这一篇没按预期变宽」。

## 卸载

在 Obsidian 设置里关闭或卸载本插件即可。`onunload` 会清理所有视图上由本插件写入的 `data-note-width` 属性和 `--note-custom-width` 内联变量；**笔记 frontmatter 里的 `note-width` 字段属于用户数据，不会被自动清理**，如需清除请手动删除。

## 贡献

欢迎提 Issue 或 PR。提 Bug 时如果可能，附上 `npm run dump` 的输出和有问题的笔记 frontmatter，能极大节省排查时间。

## License

[MIT](LICENSE)

## 作者

[ApakohZzz](https://github.com/ApakohZzz)
