# PPT Studio for DSH

在 DSH 侧边栏里制作和修改演示文稿：逐页预览、直接编辑、圈选一块区域交给 AI 修改，最后导出可编辑的 PPTX。

插件由 AI 与人在同一份项目文件上协作：编辑器改动、AI 改动和导出共用同一个版本号，后写入的一方必须基于最新版本，不会静默覆盖。

## 能做什么

- **侧边栏工作台**：作为 `dsh-better-sidebar` 的一个页签打开，缩略图逐页切换，画布上点选元素即可改文字、改颜色、移动与缩放。
- **结构化项目**：页面与元素都有稳定 ID，支持撤销、自动保存、版本冲突提示。
- **圈选修改**：在画布上框选区域，写下要求，生成一条待处理的修改请求，AI 读取后按区域和元素 ID 修改同一项目。
- **导出 PPTX**：文字、基础形状、表格和常用图表导出为 PowerPoint 原生对象；图片保持图片。无法原生表达的内容会被明确报告，不会整页转成截图。
- **按 preset 隔离**：`ppt_project` / `ppt_skills` 工具和 PPT 专属技能只注册在「PPT 专用模式」preset。标准模式及其他 preset 看不到这些工具或技能；项目 API 也会校验当前会话的 preset。

## 安装

在 DSH 的「插件 → 添加插件」中粘贴仓库地址：

```text
https://github.com/Zestful-ss/dsh-ppt-studio
```

安装后硬刷新浏览器（Cmd/Ctrl+Shift+R）。也可以从本地目录安装（`plugin_manager` 或 `dsh plugin add <本地路径>`），适合开发调试。

打开「设置 → PPT 专用模式」，点「新建 PPT 专用会话」；也可在新建会话的 Agent 预设选择器中选 **PPT 专用模式**。**Standard 仍是默认模式**，已有会话不会被切换。Settings 页的开关只控制侧边栏入口显示；侧栏入口会再按会话 preset 验证，非 PPT 会话看不到入口，直接请求 API 也会被拒绝。

Agent preset 隔离的是工具与 Skill 注册范围，不是操作系统安全沙箱。Skills 安装到 preset 专属目录，正文按调用加载；请只启用可信来源，并由 DSH 现有授权/沙箱策略约束可能执行的命令。Profile 仍加载一个轻量桥接与 Settings 面板：桥接只注册受会话 preset 校验的 API；项目/导出引擎要通过校验后才动态载入。



### 依赖

- DSH `0.2.1-rc.1` 及以上（`<0.3.0`）。
- 可选：`dsh-better-sidebar` 0.28.0 及以上。未安装时侧边栏工作台不可见；在 PPT 专用 preset 中，`ppt_project` / `ppt_skills` 工具仍可用。

## 数据位置

| 内容 | 位置 |
|---|---|
| 项目文件 | `$DSH_HOME/dsh-ppt-studio/projects/<projectId>.json` |
| 导出的 PPTX | `$DSH_HOME/dsh-ppt-studio/exports/<projectId>/` |
| PPT preset 专属技能 | `$DSH_HOME/dsh-ppt-studio/skills/<skillId>/` |
| 技能安装记录 | `$DSH_HOME/dsh-ppt-studio/state.json` |

PPT 技能目录只由 PPT preset 中的 `customSkillDirs` 扫描；安装器不会再把技能链接进全局 `$DSH_HOME/skills`。

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
3. 在对话里让 AI 处理这条请求（例如「处理 PPT 的修改请求」），模型用 `ppt_project` 读取 `requests`，再用 `update` 提交操作。
4. 若期间你手动改过页面，写入会因版本不一致被拒绝，AI 需要重新读取后再改。

## 边界

- 导入既有 PPTX 尚未实现。当前以插件生成的结构化项目为主，编辑外部 PPT 请先用其他工具转成受支持的格式。
- 导出保真度取决于 PptxGenJS：渐变填充、图案、公式与超出现在支持范围的特效会降级或被报告为警告。
- 模板适配、讲者备注增强、渲染质检等技能能力仍在规划中。

## 开发

```sh
pnpm install
npm run check   # 语法检查
npm test        # 单元测试 + 路由端到端测试
```

## 技能库（按需安装）

插件内置一个多来源技能目录（`catalog.json`），每条记录一个 GitHub 仓库里的具体 Skill：**锁定 commit、记录许可证、按需安装**，装完即可被 Agent 使用，不装就不占任何上下文。

用 `ppt_skills` 工具操作：

```text
ppt_skills { "action": "list" }                     # 看目录与安装状态
ppt_skills { "action": "install", "id": "ppt-master" }
ppt_skills { "action": "update",  "id": "ppt-master" }
ppt_skills { "action": "repair" }                   # 修复全部已安装项
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
