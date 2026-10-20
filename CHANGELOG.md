# 0.7.0

- 画布直接编辑：新增文字立即输入；双击文字或形状原位改字，支持中文输入、换行、Ctrl/Cmd+Enter 提交与 Escape 取消。点击输入框内不再误关闭编辑。
- 常用操作：八个缩放柄与旋转柄（旋转缩放固定对角、图片默认等比）、延迟指针捕获、复制/粘贴/副本、删除、上下移与置顶/置底、方向键微调；一次手势或连续微调只占一个撤销步骤。
- 撤销/重做：补齐重做与可用状态；属性输入按一次编辑合并历史，不再逐字生成快照；取消或失败的手势不留下空历史。
- 保存与草稿：保存单飞并按原 `operationId` 重试；保存结果未知时不再被轮询误报为冲突；项目/世代校验阻止旧响应覆盖新项目；草稿可恢复尚未提交的画布输入，Escape 取消后不会让旧文字复活。
- 表格与图表：双击单元格原位编辑，Enter/Tab 导航，增删行列；图表数据先校验再应用，未完成输入不会被静默丢弃。
- 图片：选中后可替换原图，保留位置与框尺寸；完整显示/填满裁剪可选择。
- 格式导出：圆角真实写入两种导出链路（含零圆角）；零描边不再被默认值恢复；表格对齐纳入模型并在源格式导出中定点修改；图片 contain/cover 使用原始宽高计算裁剪；移动/旋转源图片保留原裁剪；新建原生表格支持旋转。
- 导入：读取 roundRect 实际圆角（含 PowerPoint 默认值）、表格对齐与图片裁剪，未编辑对象继续沿用源 XML。0.7.0 之前导入的项目仍保留原 XML，但圆角/表格对齐要重新导入后才会在画布显示源文件的真实值。

# 0.6.5

- 修复一直显示「请选择「PPT Studio」预设」的真正原因：请求处理器建立在插件根上下文上，访问未声明的 `sessionQuery` 会被宿主直接抛错（`cannot get property "sessionQuery" without inject`），被当成授权失败。现在处理器建立在声明了 `connection` / `sessionQuery` / `sessions` 的子上下文中。
- 新增回归：模拟宿主拒绝未注入服务的上下文，确认桥接仍能正常授权。

# 0.6.4

- 修复新会话被判为“非 PPT Studio”：空白会话的预设只存在于 `agentPreset` 投影中，授权改为读取该投影，而不是当天尚无记录的事件流。
- 修复无休止重连：预设拒绝不再触发页签重建；面板启动改为单飞，失败后显示错误并等待用户「重试连接」。
- 授权拒绝会记录一次 `auth-denied`（含取值来源路径），便于确认走的是投影、观察还是事件分支。

# 0.6.3

- 连接界面显示当前前端构建号，一眼可确认是否加载了新代码。
- 新增客户端阶段诊断：`client-loaded`、`boot-start`、`boot-ok`、`boot-failed`，写入 `$DSH_HOME/dsh-ppt-studio/diagnostics.ndjson`；只接受同源、4 KB 以内、字段白名单的负载，不能访问项目数据。
- 服务端预设校验超时也会记录 `auth-timeout` 与对应动作。

# 0.6.2

- 预设校验增加 4 秒上限：宿主会话查询卡住时返回 `AUTH_TIMEOUT`，面板显示原因和「重试连接」，不再无限等待。
- 前端请求超时收紧到 8 秒，与服务端上限配套。

# 0.6.1

修复工作台一直停在「正在连接 PPT Studio…」：

- 预设校验优先读取当前会话已有的 `agentPreset` 投影，不再为每次面板请求物化整份会话投影；持久化会话仍按选择事件兜底，离开 PPT 立即失效。
- 请求增加 12 秒硬超时，即使宿主通道本身不返回也会结束等待；超时后显示原因与「重试连接」，不再无限转圈。
- 本地草稿库打开增加 3 秒兜底与 `onblocked` 处理，IndexedDB 被占用时继续加载远端项目，不阻塞工作台。

# 0.6.0

统一已有 PPTX 与新建文稿：

- 工作台新增「导入 PPTX」，空工作台和已打开项目均可使用；AI 的 `ppt_project` 增加 `import`，将本地 PPTX 和外部 Skill 产物接入同一项目编辑流程。
- 按真实幻灯片顺序、尺寸、关系及主题导入文字、基本形状、图片、表格和受支持图表。原文件保留，导入限制为 50 MiB；不支持的编辑或预览内容给出明确提示。
- 导入项目保留原始 OOXML 包与对象绑定，导出写回修改并保留未修改内容；草稿另存也保留源包，项目删除清理对应私有副本。
- 修复预设识别只看会话创建 header 的问题：使用当前 `agentPreset` 投影，离开 PPT 后即时撤销访问；没有项目不再被误认为预设不匹配。
- 可见工作台通过轻量目录版本发现 AI 新建或导入的项目，隐藏时停止检查；补齐精确选区读取的归属校验和画布信息。
- 修复无自身坐标的标题/正文占位符遗漏：按幻灯片、版式、母版继承几何与文本样式，目录页和页标题可进入编辑模型。
- 画布按可用宽高共同适配，支持窄侧栏与 4:3/A4 页面完整预览；缩略图复用真实元素并仅渲染可见页，替换灰色占位块。
- 母版和版式装饰生成去重的只读矢量背景，保留蓝页眉、logo 和页脚的预览；正文仍为可编辑对象，新页继承对应版式。

# 0.5.2

修复 PPT 模式：

- 在 `ppt-studio` preset 中挂载原生 `dsh-persona`，明确 PPT Studio 身份、制作流程与工作台边界，保留运行时上下文；Standard 的身份与默认预设保持不变。
- 在同一 preset 中挂载原生 `dsh-tool-skill`，已安装技能的摘要可进入模型目录，正文通过 `skill` 按需加载；专属技能不进入其他模式。
- 统一当前模式名称为「PPT Studio」，修正设置页与安装说明中已移除的会话创建入口。
- 补齐 `ppt_project` 的公开参数：`baseRevision`、`operationId`、`slideId`、`elementIds`；声明 `resolvePending` 等操作所需字段，选区读取向模型返回完整元素属性。
- 新增原生宿主 SDK 回归验证，覆盖身份隔离、技能目录与加载，以及按公开参数完成创建、修改、幂等重放、选区读取、旧版本拒绝与 PPTX 导出。

# 0.5.1

修复：

- 修复安装含仓库根符号链接的 Skill（如 Kami）时报「安装包包含不支持的文件或路径」的问题：现在只校验所选 Skill 子目录，根目录链接不再整包拒绝，链接本身也不会被解压。
- 选中 Skill 目录内部若仍含符号链接，继续拒绝并给出具体路径。
- 修复后台安装失败导致宿主进程崩溃：HTTP 202 返回后无人等待的任务 Promise 现在不会再产生未处理拒绝（Node 24 视为致命错误）。失败会保留在任务状态中供界面展示。
- 归档校验错误现在包含具体的文件类型与路径，便于定位。

# 0.5.0

轻量化与技能设置：

- 设置页新增完整技能管理界面：展示 16 个内置来源与自定义来源，支持搜索、多选安装、更新、修复、卸载以及删除来源。
- 设置页更名为「PPT Studio」，移除新建会话按钮，改为卡片式技能列表：来源可点击跳转 GitHub 对应版本，恢复样式表以修正标签挤在一起的问题。
- 技能安装与卸载严格限定在 `$DSH_HOME/dsh-ppt-studio/skills`，由「PPT 专用」预设单独加载，不写入全局 `$DSH_HOME/skills`，不影响 Standard 等其他模式（新增回归测试）。

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
