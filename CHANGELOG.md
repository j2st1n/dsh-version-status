# Changelog

> 本文件于 2026-11-22 依据 git 提交历史回溯建立，早期条目只能依据提交信息还原，故较简略。

## [0.1.12] - 2026-11-23

### Changed
- 文档同步：README 的「核心特性」补充 220ms 悬停预览卡说明（延时、门禁、卡片内容、折叠态视口定位）。0.1.11 引入该功能时未写入用户文档，本次补齐。无代码改动。

## [0.1.11] - 2026-11-23

### Added
- **侧栏触发器新增 220ms 延迟悬停预览卡片**：与 `dsh-link-pulse` / `dsh-cpa-status` 的悬停卡片同一节奏，鼠标停留 220ms 后弹出只读卡片，移出立即收起；主面板打开时两种触发器都不渲染卡片，避免与面板重叠。内容全部取自 store 已有字段，不额外发请求：顶部是「DSH 版本状态」+ 当前通道徽章 + 检查状态（已是最新 / 可升级 / 高于该通道 / 检查中… / 未检查 / 检查失败），其下为当前运行版本、该通道最新版本与上次检查时间，底部为 Latest / Next / Alpha 三通道版本一览并高亮当前通道；首屏占位符 `...` 显示为「未获取」，检查失败时附带错误原因。
- 卡片高度上限 `min(360px, 60vh)` 并允许内部滚动，错误行等动态内容不会把卡片顶出视口。
- **rail 折叠态的悬停卡片改用 `position: fixed`**：侧栏折叠后触发器只有 32px 宽，且侧栏列带 `overflow: hidden`，绝对定位卡片会被裁切；现在先量触发器的 `getBoundingClientRect()`，把 236px 宽卡片放到图标上方并夹在视口内（左右不越界）。展开态仍沿用触发器上方的 `absolute` 定位，视觉与参考插件一致。
- 测试新增悬停预览的 e2e 断言：220ms 延时、进入/离开成对挂载、面板打开时两种触发器均不渲染卡片、rail 量测与 fixed 定位、卡片内容字段。

### Fixed
- **主面板在短视口下从顶部被裁且无法滚动**：面板加 `maxHeight: calc(100vh - 80px)`，内容区改为 `minHeight: 0` + `overflowY: auto`，卡片贴底生长时不再溢出视口。

## [0.1.10] - 2026-11-22

### Fixed
- **补上两条状态接口的来源围栏**：`/api/dsh-version` 与别名路由 `/api/dsh-update/status` 原先以 `kind: 'exact'` 直接注册在 webServer 上，会绕过 DSH 对 `/api` 前缀通道的准入校验（Host / Origin / `Sec-Fetch-Site`），导致伪造 Host（DNS rebinding）、跨站请求与不匹配 Origin 都能读到版本状态。现在两条路由均按 `{ fencedRead: true }` 接入宿主等价的只读围栏：Host 必须是环回、监听器 bind 地址或 `connection.trustedHosts` 之一，拒绝 `Sec-Fetch-Site: cross-site`，带 Origin 时必须同 authority；宿主提供 `connection.isTrusted` 时以其判定为准，缺失时回退本地等价实现。不可信来源一律返回 403，不再返回 200。
- 修复围栏在宿主 `ctx.get('connection')` 返回 `null` 时抛 `TypeError` 并被包成 500 的问题：空值判定由 `!== undefined` 改为 `!= null`，缺失 connection 服务时正确回退本地围栏并返回 403，不再泄漏内部错误文本。
- 围栏拒绝沿用本插件既有的 `{ ok: false, error: { code, message } }` 响应信封，与客户端 `data.ok` 判定路径一致，避免 403 被前端当作成功响应解析。

### Added
- 测试补齐来源围栏用例：伪造 Host、缺失 Host、跨站 `Sec-Fetch-Site`、不匹配 Origin 均应得 403，环回与同源放行 200；另覆盖 `connection.isTrusted` 优先与抛错降级。

---

> 以下为历史版本，重建自 git 提交记录。

## [0.1.9] - 2026-09-25

### Added
- 新增 Next 频道支持，采用多来源解析（`8293af2`）。
- 跟随其后的两次未单独发版的调整并入本版后主线：频道标签改用简洁英文（Latest / Next / Alpha）（`f583216`）；后端待重启时，客户端按 `distTags.next` 动态适配 Next 频道版本（`efc3795`）。

## [0.1.8] - 2026-09-25

### Fixed
- 请求层增加防御性 gzip 解压，并显式声明 identity 编码（`0b82d2f`）。

> 该版本在 git 中有 tag，但未发布到 npm。

## [0.1.7] - 2026-09-08

历史版本，细节未记录。（提交信息仅含版本号 `7529a71`）

## [0.1.6] - 2026-09-08

历史版本，细节未记录。（提交信息仅含版本号 `a5c839c`；该版本在 git 中有 tag，但未发布到 npm）

## [0.1.4] - 2026-09-07

### Added
- 从 npm 既有包初始导入至仓库（`4034e6c`）。

### Changed
- 同批次完成仓库基建：补齐自动化单测与 e2e 测试套件及构建脚本（`ba14869`）；对齐 `package.json` 元数据、补充 LICENSE 并完善 README（`1475f43`、`759224a`）。
