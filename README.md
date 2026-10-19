# PPT Studio for DSH

在 DSH 侧边栏里导入已有 PPTX 或新建演示文稿：逐页预览、直接编辑、圈选一块区域交给 AI 修改，最后导出可编辑的 PPTX。

插件由 AI 与人在同一份项目文件上协作：编辑器改动、AI 改动和导出共用同一个版本号，后写入的一方必须基于最新版本，不会静默覆盖。

## 能做什么

- **侧边栏工作台**：作为 `dsh-better-sidebar` 的一个页签打开，缩略图逐页切换，画布上点选元素即可改文字、改颜色、移动与缩放。
- **结构化项目**：页面与元素都有稳定 ID，支持撤销、自动保存、版本冲突提示。
- **导入已有 PPTX**：上传本地文件，或让 AI 导入外部 Skill/脚本生成的 PPTX；导入后与新建文稿共用编辑、圈选、保存和导出。保留原文件与原始 OOXML 包，未修改内容沿用原格式。
- **圈选修改**：在画布上框选区域，写下要求，生成一条待处理的修改请求，AI 读取后按区域和元素 ID 修改同一项目。
- **导出 PPTX**：文字、基础形状、表格和常用图表导出为 PowerPoint 原生对象；图片保持图片。无法原生表达的内容会被明确报告，不会整页转成截图。
- **按 preset 隔离**：PPT 身份说明、`ppt_project` / `ppt_skills` 工具和本插件的技能目录只在「PPT Studio」preset 中生效。原生 `skill` 工具按需读取技能正文；Standard 及其他 preset 不会收到这些专属注册，项目 API 也会校验当前会话的 preset。

## 安装

在 DSH 的「插件 → 添加插件」中粘贴仓库地址：

```text
https://github.com/Zestful-ss/dsh-ppt-studio
```

安装后硬刷新浏览器（Cmd/Ctrl+Shift+R）。也可以从本地目录安装（`plugin_manager` 或 `dsh plugin add <本地路径>`），适合开发调试。

打开「设置 → PPT Studio」管理技能与侧边栏入口；新建会话时，在 Agent 预设选择器中选 **PPT Studio**。**Standard 仍是默认模式**，已有会话不会被切换。Settings 页的开关只控制侧边栏入口显示；非 PPT 会话看不到入口，直接请求工作台 API 也会被拒绝。升级并重启 DSH 后，已有 PPT 会话会加载新的身份与技能配置，无需搬迁历史。

Agent preset 隔离的是工具与 Skill 注册范围，不是操作系统安全沙箱。Skills 安装到 preset 专属目录，正文按调用加载；请只启用可信来源，并由 DSH 现有授权/沙箱策略约束可能执行的命令。Profile 仍加载一个轻量桥接与 Settings 面板：桥接只注册受会话 preset 校验的 API；项目/导出引擎要通过校验后才动态载入。



### 依赖

- DSH `0.2.1-rc.1` 及以上（`<0.3.0`）。
- 可选：`dsh-better-sidebar` 0.28.0 及以上。未安装时侧边栏工作台不可见；在 PPT Studio preset 中，`ppt_project` / `ppt_skills` 工具仍可用。

## 数据位置

| 内容 | 位置 |
|---|---|
| 项目文件 | `$DSH_HOME/dsh-ppt-studio/projects/<projectId>.json` |
| 导入原包与对象绑定 | `$DSH_HOME/dsh-ppt-studio/imports/<projectId>/` |
| 导出的 PPTX | `$DSH_HOME/dsh-ppt-studio/exports/<projectId>/` |
| PPT preset 专属技能 | `$DSH_HOME/dsh-ppt-studio/skills/<skillId>/` |
| 技能安装记录 | `$DSH_HOME/dsh-ppt-studio/state.json` |

PPT 技能目录只由 PPT preset 中的 `customSkillDirs` 扫描；安装器不会再把技能链接进全局 `$DSH_HOME/skills`。

PPT Studio 通过原生技能目录向模型提供已安装技能的名称与说明。任务匹配或用户点名时，模型再调用 `skill` 读取完整正文；安装不等于执行，也不代表该 Skill 的外部运行依赖已准备好。当前模式由会话所选的 preset 决定，底部模型名称只表示推理模型。

`DSH_HOME` 未设置时使用 `~/.dsh`。项目文件是可读的 JSON，可以纳入你自己的版本管理。

## 项目格式

```jsonc
{
  "schemaVersion": 1,
  "id": "p_…",
  "title": "季度汇报",
  "revision": 3,
  "viewport": { "width": 1000, "height": 562.5 },
  "theme": { "backgroundColor": "#ffffff", "fontColor": "#1f2430", "fontName": "Inter", "themeColors": [] },
  "slides": [
    {
      "id": "s_…",
      "note": "讲者备注",
      "elements": [
        { "id": "e_…", "type": "text", "x": 90, "y": 180, "w": 820, "h": 120,
          "text": "结论先行", "fontSize": 54, "color": "#1f2430", "bold": true, "align": "left" }
      ]
    }
  ],
  "pending": []
}
```

坐标以 1000 单位宽的逻辑画布表示，导出时换算为英寸；字号按 px→pt 换算。

元素类型：`text`、`shape`、`image`、`chart`、`table`。

## AI 修改流程

1. 在画布上点「圈选修改」，拖出要改的区域，写下要求。
2. 插件把 `slideId`、命中的 `elementIds`、归一化区域和说明写入项目的 `pending`。
3. 在对话里让 AI 处理这条请求（例如「处理 PPT 的修改请求」）。模型用 `ppt_project` 读取 `requests`，需要完整元素属性时用 `read` 的 `slideId` / `elementIds` 读取选区，再携带最新 `baseRevision`、唯一 `operationId` 和 `operations` 提交 `update`；修改与 `resolvePending` 在同一次提交中完成。
4. 若期间你手动改过页面，写入会因版本不一致被拒绝，AI 需要重新读取后再改。

## 导入已有 PPTX

在 PPT Studio 会话中，打开工作台并点击「导入 PPTX」，选择不超过 50 MiB 的 `.pptx` 文件。空工作台和已有项目都可以导入；已有未保存编辑会先保存，失败时保留当前草稿。导入完成后立即打开该项目，转换提示会显示在面板内。

AI 也可以直接把已有文件或外部 Skill 产物接入工作台：

```text
ppt_project { "action": "import", "path": "E:/reports/research.pptx" }
```

导入后的 `project.id`、页面和元素 ID 用于后续 `read` / `update` / `requests` / `export`，与新建文稿相同。文字、基本形状、图片、表格及受支持图表转换为原生对象；原文件中已经是图片的内容仍然是图片。

画布同时按面板宽度和高度适配页面，缩略图显示真实内容并按可见性渲染。宽面板将属性放在右侧，窄侧栏改为上下布局，4:3 与竖版页面也能完整查看。

导出导入项目时，以保留的原 PPTX 包为基础更新修改过的对象，保留未修改的母版、媒体与其他内容。「另存草稿副本」也保留原包。工作台不是完整 Office 排版引擎：无法完整编辑或预览的内容会给出提示，修改复杂对象可能采用工作台支持的样式，不承诺 Office 像素级一致。导入创建独立项目，之后外部脚本修改原文件不会自动覆盖工作台内容。

母版与版式中的装饰作为只读背景显示，按内容去重保存；它们不会混入正文元素 ID。页标题、正文、图片等当前页对象仍按正常流程编辑。需要修改母版装饰时，先处理独立的 PPTX 副本，再重新导入。

## 边界

- 仅直接导入 OpenXML `.pptx`；旧 `.ppt` 或加密文件需要先另存为可读取的 `.pptx`。
- 新建项目通过 PptxGenJS 导出；导入项目保留原包并写回修改。渐变、公式、动画及其他复杂效果在工作台中的编辑与预览能力以导入提示为准。
- 模板适配、讲者备注增强、渲染质检等技能能力仍在规划中。

## 开发

```sh
pnpm install
npm run check   # 语法检查
npm test        # 单元测试 + 路由端到端测试
```

## 技能库与设置页（按需安装与自定义来源）

插件提供轻量化的技能管理支持：**默认按需安装，不预装无用文件，不执行环境探测**。

- **设置页管理**：在 DSH 设置中打开「PPT Studio」，可浏览预置的 16 个来源与已安装状态，支持搜索、多选批量安装、更新、修复与卸载；每个来源可点击跳转到 GitHub 对应版本查看。
- **首次默认安装**：新环境首次打开设置页时，会自动准备默认的 `ppt-master`；若用户主动卸载，则记录为取消，不会反复自动装回。
- **添加 GitHub 来源**：可直接粘贴公开 GitHub 仓库或指定子目录链接，自动解析锁定 40 位 Commit SHA 并识别许可证，支持“仅添加来源”或“添加并安装”。
- **卸载与删除**：卸载仅删除技能托管目录与标记，不影响已制作的 PPT 项目和导出文件；自定义来源支持一并删除记录。

在 PPT 专用会话中，也可以直接用 `ppt_skills` 工具操作：

```text
ppt_skills { "action": "list" }                     # 查看目录与安装状态
ppt_skills { "action": "install", "id": "ppt-master" }
ppt_skills { "action": "uninstall", "id": "ppt-master" } # 卸载指定 Skill
ppt_skills { "action": "update",  "id": "ppt-master" }
ppt_skills { "action": "repair" }                   # 修复已登记项
```

目录按产出一共分三类：

| 分类 | 代表来源 | 说明 |
|---|---|---|
| `pptx-native` | ppt-master、Kami、office-academic-skill、gorden-ppt-skill、image-to-editable-ppt、cyber-ppt、slide-maker、luobo-ppt | 产出可编辑 PPTX，是主路线 |
| `image` | codex-ppt、ppt-image-first | 整页图片型，视觉强但不逐字可编辑 |
| `html` | frontend-slides、guizang-ppt-skill、dashi-ppt、html-ppt | 网页演示，风格参考用 |

规则：

- 一个仓库可以有多个 Skill，各自是独立条目（`repository` + `path`），安装时只复制目标目录。
- 安装前校验 `SKILL.md` 的 `name` 与目录条目一致，避免装错。
- 未声明许可证的来源只展示、**不可安装**；带自动更新脚本的来源（如 gorden-ppt-skill）需在安装后剥离该步骤。
- 远端 Skill 里的安装指令不会随安装自动执行。

## 许可证与来源

本项目是 [Planners Form](https://github.com/thePlannerIvan/planners-form)（AGPL-3.0-only）的 Fork，沿用同一许可证，保留原作者版权与修改说明，见 [NOTICE](./NOTICE)。

编辑器交互与导出映射参考了 [PPTist](https://github.com/pipipi-pikachu/PPTist)（AGPL-3.0）的设计；技能发现逻辑参考了 [vercel-labs/skills](https://github.com/vercel-labs/skills)（MIT）；导出使用 [PptxGenJS](https://github.com/gitbrent/PptxGenJS)（MIT）。

目录中各来源的许可证随条目记录（MIT / Apache-2.0 / AGPL-3.0），安装只是把内容放到本地技能目录，版权仍归各作者所有。
