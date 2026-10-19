# PPT Studio for DSH

在 DSH 侧边栏里制作和修改演示文稿：逐页预览、直接编辑、圈选一块区域交给 AI 修改，最后导出可编辑的 PPTX。

插件由 AI 与人在同一份项目文件上协作：编辑器改动、AI 改动和导出共用同一个版本号，后写入的一方必须基于最新版本，不会静默覆盖。

## 能做什么

- **侧边栏工作台**：作为 `dsh-better-sidebar` 的一个页签打开，缩略图逐页切换，画布上点选元素即可改文字、改颜色、移动与缩放。
- **结构化项目**：页面与元素都有稳定 ID，支持撤销、自动保存、版本冲突提示。
- **圈选修改**：在画布上框选区域，写下要求，生成一条待处理的修改请求，AI 读取后按区域和元素 ID 修改同一项目。
- **导出 PPTX**：文字、基础形状、表格和常用图表导出为 PowerPoint 原生对象；图片保持图片。无法原生表达的内容会被明确报告，不会整页转成截图。
- **AI 工具**：`ppt_project` 提供 list / read / create / update / export / requests，可直接让模型建稿、改页、导出。

## 安装

```sh
dsh plugin --profile <profile> add https://github.com/Zestful-ss/dsh-ppt-studio
```

或在 DSH 的「插件 → 添加插件」中粘贴仓库地址安装，然后硬刷新浏览器（Cmd/Ctrl+Shift+R）。

安装后，在右侧栏的「+」菜单里选择 **PPT 工作台**。

### 依赖

- DSH `0.2.1-rc.1` 及以上（`<0.3.0`）。
- 可选：`dsh-better-sidebar` 0.28.0 及以上。未安装时插件照常加载，但侧边栏页签不会出现；`ppt_project` 工具与导出仍然可用。

## 数据位置

| 内容 | 位置 |
|---|---|
| 项目文件 | `$DSH_HOME/dsh-ppt-studio/projects/<projectId>.json` |
| 导出的 PPTX | `$DSH_HOME/dsh-ppt-studio/exports/<projectId>/` |
| 技能安装记录 | `$DSH_HOME/dsh-ppt-studio/state.json` |

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

## 许可证与来源

本项目是 [Planners Form](https://github.com/thePlannerIvan/planners-form)（AGPL-3.0-only）的 Fork，沿用同一许可证，保留原作者版权与修改说明，见 [NOTICE](./NOTICE)。

编辑器交互与导出映射参考了 [PPTist](https://github.com/pipipi-pikachu/PPTist)（AGPL-3.0）的设计；技能发现逻辑参考了 [vercel-labs/skills](https://github.com/vercel-labs/skills)（MIT）；导出使用 [PptxGenJS](https://github.com/gitbrent/PptxGenJS)（MIT）。
