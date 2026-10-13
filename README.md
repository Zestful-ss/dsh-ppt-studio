# Planners Form

DSH 设置中的 Planners 套件管理。安装所需 Skill、准备公共依赖、检查并更新版本，然后回到原来的对话中调用 Skill。Skill 自行打开审阅页。

名称旁显示实际调用名，例如 **PPT 制作 · `planners-ppt-hell`**。

## 从 GitHub 安装

DSH 的“添加插件”窗口支持直接填写 GitHub 仓库地址：

```text
https://github.com/thePlannerIvan/planners-form
```

不要填写 Release 展示页（`/releases/tag/...`）；如果使用 Release，必须填写 `.tgz` 安装包的直链。源码仓库和 Release 安装包都包含完整插件依赖，无需额外构建或批准安装脚本。


**兼容版本：DSH `0.2.0-rc.2`。** 两个 `0.2.1-alpha` 尚未完成运行验证。

### 桌面版

1. 打开 [最新发行版](https://github.com/thePlannerIvan/planners-form/releases/latest)，下载 **`planners-form-0.1.2.tgz`**（不要下载 GitHub 自动生成的 Source code 压缩包）。
2. 在 DSH 的插件管理器中添加这个 `.tgz` 文件的绝对路径。
3. 安装后打开 **设置 → Planners Form**，选择需要的 Skill。回到对话中按页面显示的 Skill 名称调用。

### Web profile

已安装 DSH `0.2.0-rc.2` 的用户可以直接安装 GitHub Release 包：

```sh
dsh plugin --profile web add https://github.com/thePlannerIvan/planners-form/releases/download/v0.1.2/planners-form-0.1.2.tgz
```

也可以下载后使用本地绝对路径安装：

```sh
dsh plugin --profile web add /absolute/path/planners-form-0.1.2.tgz
```

桌面版由应用托管 profile，请使用应用的插件管理器。安装包包含 Review Dock 与 Node 包解析依赖。首次启动自动准备审阅核心；安装配套 Skill 时再下载其公共依赖。GitHub 与 PyPI 下载需要可用网络。Node 使用 DSH 自己的运行环境。

发行版同时提供 `SHA256SUMS`。macOS 可用 `shasum -a 256 planners-form-0.1.2.tgz`，Linux 可用 `sha256sum planners-form-0.1.2.tgz`，与校验文件核对。

## 已提供

- 基础审阅环境检查与修复。
- PPT 制作、策略提案、逐页内容、定性分析、定量分析、视频创意与视频制作的单选及批量安装。
- 用途名称与实际 Skill 调用名同时显示。
- 公共依赖自动补齐、按提交版本记录安装状态。
- 打开设置时检查上游更新，1 小时缓存；按钮可强制检查。
- 显式更新单个 Skill 或全部受管理 Skill；不后台自动替换。
- 失败回滚、进程间安装锁、中断恢复及外部安装保护。
- PPT 依赖使用套件专用 Python 环境，优先利用 DSH 自带 Python。

`sparkling`、`storytelling`、`slide-copy` 随策略提案自动安装；逐页内容自动安装后两者。它们不在设置页面单列，仍可独立调用，并参与检查更新、对应 Skill 的更新及“更新全部已安装”。已有外部安装仍由原安装方式管理。

视频制作的 FFmpeg、Python 包与可选渲染引擎按 `video-craft/install.md` 配置；目前插件自动准备的是 Skill 文件与公共审阅依赖。

## 安装位置与更新

以 `$DSH_HOME` 为准，默认 `~/.dsh`：

```text
planners-form/
  skills/          管理的 Skill 与依赖
  python/          PPT 的独立 Python 环境
  state.json       安装版本
  install.lock     安装互斥
  journal.json     未完成事务恢复记录（完成后移除）
skills/
  <skill-name>     指向受管理 Skill 的链接，供 DSH 发现
```

现有同名目录或链接视为外部安装，不覆盖、不接管。公共外部模块会建立只读使用的链接，供受管理 Skill 找到兄弟依赖。

初次安装使用 `catalog.json` 固定提交。检查更新查询上游主分支，用户点击更新后采用查询到的具体提交；**这表示上游更新，不表示整套兼容认证**。建议在任务空闲时更新，已有 Agent 上下文不会被重写。

更新不访问项目目录。安装失败会恢复先前 Skill 文件与状态；Python 环境安装是独立准备步骤，失败可重试，不回滚 pip 缓存。

## 开发与验证

```sh
git clone https://github.com/thePlannerIvan/planners-form.git
cd planners-form
npm test
npm run check
npm pack
```

`test/` 使用隔离目录和合成仓库包，覆盖真实 tar 解包、下载失败、依赖安装、更新、外部目录保护、事务恢复和请求来源校验。

## 当前验证边界

正式兼容目标为 **DSH 0.2.0-rc.2**。已使用桌面应用内置的该版本运行时及 Node 24.21.0，在全新隔离 Web profile 中通过官方命令安装发行包，并验证设置栏目、Skill 调用名、环境修复接口及 Review Bridge。此前也做过 0.1.7-rc.1 开发验证，但发行包仅声明 rc.2。

已核对官方存在 0.2.1-alpha.1 / 0.2.1-alpha.2，设置扩展契约相同；尚未进行完整运行测试，因此没有在版本范围里宣称支持 alpha。

已完成公开仓库的匿名访问和真实 Skill 下载、依赖安装及 DSH 链接检查。PPT 的 Python / Chromium 配置、视频渲染工具配置，以及桌面版和 Windows 完整安装仍需分别实测。

## 品牌与许可

图标采用 Logics 的非衬线几何版本。页面与插件名称为 Planners Form。

Copyright 2026 thePlannerIvan / 阿祖不看 TVC。AGPL-3.0-only，见 LICENSE 与 NOTICE。

## 插件自身更新

设置中的“检查更新”管理配套 Skill。Planners Form 插件自身的新版本通过 [GitHub Releases](https://github.com/thePlannerIvan/planners-form/releases) 发布，下载新安装包后在 DSH 插件管理器中更新；Web profile 使用相应新版本的 Release URL 重新执行安装命令。

## 反馈与支持

使用问题和缺陷请提交 [GitHub Issue](https://github.com/thePlannerIvan/planners-form/issues)，注明 DSH 版本、操作系统和复现步骤。请移除凭据和私人项目内容；安全问题按 [SECURITY.md](SECURITY.md) 私下联系。

作者：阿祖不看 TVC · [demyth.info](https://demyth.info) · Lawyif@163.com

开发说明：仓库有意保留 `node_modules` 中经过锁定的生产依赖及许可证，以支持 DSH 从 GitHub 直接安装。更新依赖后，将其变化与 `package-lock.json` 一起提交，并运行源码归档导入测试。测试读取 Git 暂存区的待发布文件；修改后先 `git add` 再运行测试。
