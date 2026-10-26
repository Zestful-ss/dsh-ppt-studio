# 项目规则（PPT Studio）

## 发布与版本

- 版本号必须同时出现在：`package.json`、`lib/client.js` 的 `CLIENT_BUILD`、`lib/project-api.js` 启动响应中的 `version`、`CHANGELOG.md` 顶部条目。
- 发布顺序：先通过下方检查，再提交并推送 `origin/main`；随后在该发布提交上创建 annotated tag `vX.Y.Z`（与 `package.json` 一致），并 `git push origin vX.Y.Z`。
- 推送后的 tag 不移动、不删除。后续文档或测试提交可以继续推进 `main`，tag 仍指向发布提交。
- 只向本项目远端 `origin`（`Zestful-ss/dsh-ppt-studio`）发布；`upstream` 指向无关的 `thePlannerIvan/planners-form`，不要向其推送。

## 检查

- 提交前运行：`npm test`、`npm run check`、`node --check lib/discover.js`。
- 改动工作台或客户端行为时，额外用 `node test/ui-smoke.mjs` 启动烟测宿主，并跑完 `test/workspace-ui-regression.mjs` 的全部场景。
- 模型/存储测试前先把 `DSH_HOME` 指向 `mkdtemp` 创建的临时目录；不得读写用户真实的 `.dsh/profiles`。

## 隔离与数据

- 不在用户正在使用的 DSH profile 中安装或更新插件；安装与升级验证都在临时 home 完成。
- 导入、导出、删除项目只操作工作台私有目录或当前会话工作区；原始来源文件不得被修改。
