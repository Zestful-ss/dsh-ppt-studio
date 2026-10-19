# 0.5.0

轻量化与技能设置：

- 设置页新增完整技能管理界面：展示 16 个内置来源与自定义来源，支持搜索、多选安装、更新、修复、卸载以及删除来源。
- 首次打开设置页时自动安装默认的 `ppt-master`；用户主动卸载后不会反复自动装回。
- 支持通过 GitHub 链接添加自定义 Skill 来源，自动解析 40 位 Commit SHA、校验 Frontmatter `name` 与许可证策略；支持仅添加来源或添加并安装。
- 支持可回滚的事务级卸载（`uninstall`）与自定义来源移除（`removeSource`），卸载只删除技能目录与托管标记，保护 PPT 项目与导出文件。
- 彻底移除运行时对 Python/Playwright 环境的隐式探测与子进程调用；所有导出引擎与技能管理按需加载。

协作可靠性与修复：

- 引入项目级原子提交协议 `commit(id, { baseRevision, operationId, kind, payload }, apply)`，彻底解决并发写覆盖与 AI 旧意图覆盖新修改的问题。
- 增加 `operationId` 幂等重放保护，网络重试不重复生成版本或追加重复请求。
- 增加容量硬性边界校验（300 页/单页 300 元素/待办 200 上限），超限时显式报错拒绝，不再静默截断。
- 统一项目存储路径至 `$DSH_HOME/dsh-ppt-studio/projects`，并在首次访问时执行旧目录 `p_*.json` 的平滑迁移。
- 修复画布双重坐标计算缺陷，内层 ElementView 铺满父容器；直线形状改为实际 SVG line 渲染。
- 客户端引入原生 IndexedDB 持久化草稿与 2 秒级远端版本同步；冲突时提供“另存草稿副本”与“重新载入”。
- 圈选工具栏增加“交给 AI 修改”（直接发送当前会话）与“替换输入草稿”操作，完整展示请求 ID、目标页、元素及框选区域。
- 表格导出支持区分表头填充与数据行背景，保留留白行；图片导出支持原生旋转与 `contain/cover` 比例适配；散点图导出支持数值 X-Axis 序列映射。

# 0.4.1

隔离与模式：

- 新增 Agent preset「PPT 专用模式」，显示在新会话的 Agent 预设列表中；不修改 `agent-preset-registry` 的默认项，Standard 仍保持默认。
- 把 `ppt_project` / `ppt_skills` 工具和 PPT filesystem skill provider 移入 preset scope；Standard 和其他 preset 不会收到这些 Agent-facing 注册。
- preset 技能 provider 只扫描 `$DSH_HOME/dsh-ppt-studio/skills`，安装器不再把技能链接到全局 `$DSH_HOME/skills`；迁移时仅清理目标明确指向插件私有目录的旧 PPT 符号链接。
- 侧栏入口先通过轻量 Session-header 检查，只有 `agentPreset === 'ppt-studio'` 的会话才显示；工作台 API 对其他会话返回 `PRESET_REQUIRED`。
- Host 全局桥接不静态加载项目/导出实现；通过 preset 检查后才动态加载，`pptxgenjs` 只在导出操作调用时加载。

界面：

- Settings 中新增「PPT 专用模式」面板，可一键新建 PPT preset 会话，并控制侧边栏入口显示。

# 0.3.0

新增：

- 多来源技能库：`catalog.json` 升级到 schema 2，任何公开 GitHub 仓库都可作为来源（`repository` + `path`），每条锁定到具体 commit，并记录许可证、星数、分类。
- 安装层支持仓库内子目录：一个仓库里多个 Skill 各自成为独立条目，只复制目标目录。
- 许可证策略：未声明许可证的来源仅展示、不可安装；`restricted` 条目在安装事务开始前就被拒绝。
- 新工具 `ppt_skills`：`list | install | update | repair`，按需安装，装完即可被 Agent 使用。
- 目录共 16 个来源，14 个可安装、2 个无许可证项仅展示：原生 PPTX（ppt-master、Kami、office-academic-skill、gorden-ppt-skill、image-to-editable-ppt、cyber-ppt、slide-maker、luobo-ppt，以及受限的 gorden-super-ppt）、图片路线（codex-ppt、ppt-image-first，以及受限的 nano-banana-ppt）、网页演示（frontend-slides、guizang-ppt-skill、dashi-ppt、html-ppt）。

变更：

- 移除原作者白名单，改为“任意 `owner/name` + 路径校验”。

# 0.2.2

修复：

- `read` / `create` / `update` 的工具输出只渲染标题，模型拿不到 `slideId` 与元素 ID，无法据此构造后续操作。现在渲染页与元素的 ID、坐标、尺寸和文本摘要，超过 60 个元素时显式标注截断（JSON 返回值仍完整）。

新增：

- 渲染层回归测试：读输出必须包含 slide 与 element ID、截断标记、导出与删除行。

# 0.2.1

修复：

- `ppt_project` 的 `read` / `update` 返回值包含 `undefined` 字段，被 DSH 的 lossless JSON 校验拒绝（写入本身已生效，但调用报错）。现在规范化输出：可选字段缺省即省略，数组中的空洞与非有限数转为 `null`。
- `getTheme`/元素可选字段不再以 `undefined` 落库。

新增：

- `ppt_project` 增加 `delete` 动作，便于清理测试项目。

# 0.2.0

首个 PPT Studio 版本，从 Planners Form 0.1.4 fork 而来。

新增：

- 侧边栏「PPT 工作台」页签（注册到 `dsh-better-sidebar`）：缩略图、画布点选与拖动、属性面板、撤销、自动保存、版本冲突提示。
- 项目存储与版本守护保存：`$DSH_HOME/dsh-ppt-studio/projects/<id>.json`，每次写入递增 `revision`，过期写入返回 409。
- 圈选修改：画布框选区域并填写要求，写入项目 `pending`，由 AI 读取后处理。
- `ppt_project` 工具：list / read / create / update / export / requests，操作在 Host 侧统一校验与应用。
- 原生 PPTX 导出：文字、基础形状、表格与常用图表保持可编辑；不支持的内容以警告返回，不整页截图。
- 路由 `/api/dsh-ppt-studio`：token + 同源校验，限制体积与请求类型。

变更：

- 移除对 `dsh-review-dock` 的依赖与内置 `node_modules`，改为 pnpm 依赖。
- 安装计划不再强制附带 `planners-review-core`。
- 存储根目录从 `planners-form` 改为 `dsh-ppt-studio`，与上游隔离。
- 测试重写：项目模型、导出、HTTP 路由端到端、客户端页签注册契约。
