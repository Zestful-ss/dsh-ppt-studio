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
