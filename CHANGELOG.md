# Changelog

> 本文件于 2026-11-22 依据 git 提交历史回溯建立，早期条目只能依据提交信息还原，故较简略。

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
