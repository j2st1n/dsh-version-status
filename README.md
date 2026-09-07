# dsh-version-status

> DeepSeek Harness (DSH) 核心版本监控与一键升级助手插件：在 Web GUI 侧边栏底部常驻恒定显示当前运行版本，支持 GitHub Releases 与 npm registry 双源探测识别最新预发布版本（如 `0.1.3-alpha.1`），支持「稳定版 (Latest)」与「尝鲜版 (Alpha)」双通道切换与严格版本对比，检测到新版本时以琥珀色呼吸灯与 UPGRADE 徽标提醒（胶囊文字不被所选 tab 绑架），点击展开版本详情卡片并支持一键复制对齐官方规范的升级与容灾 Tarball 命令。与 `dsh-cpa-status`、`dsh-opencode-status` 采用 1:1 像素级统一视觉规格。

---

## 🌟 核心特性

1. **侧栏常驻胶囊恒定显示当前运行版本（`sidebar.footer.action`）**：
   - **恒定显示当前运行版本**：胶囊主体文字始终呈现正在运行的实际版本（如 `● DSH · v0.1.2-rc.1` 或 `● DSH(α) · v0.1.2-rc.1`），无论弹层切到哪个通道，文字永不被绑架覆盖；
   - **展开模式（Wide）**：全宽自适应胶囊，平时低调克制呈现当前运行版本号、所选通道与健康指示灯；
   - **折叠模式（Rail）**：自适应收拢为 32×32 紧凑方形图标与状态小灯；
   - **新版本呼吸灯与徽标**：当检测到新版本时，自动呈现高亮琥珀橙色脉冲呼吸灯（`dsh-update-dot-pulse`），并展示 `UPGRADE` 醒目徽标；
   - **悬浮 Tooltip 完整透出**：无更新时提示 `[ALPHA] DSH v0.1.2-rc.1 (已是当前通道最新)`；有更新时提示 `[ALPHA] 当前运行 v0.1.2-rc.1 · 发现新版 v0.1.3-alpha.1 (点击查看升级与版本对比)`。

2. **GitHub Releases 与 npm dist-tags 多源探测**：
   - **解决的问题**：官方先行版本（如 `dsh-v0.1.3-alpha.1`）先行在 GitHub Releases 发布，但 npm dist-tags 的 alpha 标签滞留在 `0.1.2-alpha.5`；
   - **多源比对仲裁**：并行探测 GitHub Releases API 与 npm dist-tags，遵循 SemVer 2.0.0 规范，优先采纳最高版本（`0.1.3-alpha.1` > `0.1.2-rc.1`），精准判定为发现新 Alpha 版本；
   - **API 限流与平滑降级**：配置标准 User-Agent，实施 15 分钟内存缓存，遇到 GitHub 403 限流或网络异常平滑降级至 npm dist-tags，绝不阻塞 Web 渲染。

3. **双通道发布选项卡与严格版本对比视图（`shell.overlay`）**：
   - **双通道切换（Latest / Alpha）**：浮动卡片内置发布通道选择器，自由切换「🌟 稳定版 (Latest)」与「🧪 尝鲜版 (Alpha)」，配置自动持久化于 `localStorage`；
   - **严格版本比对与来源呈现**：
     - 当前运行版本与通道目标版本双向对比；
     - 清晰标注来源（`GitHub Releases (dsh-v0.1.3-alpha.1)` 或 `npm 稳定版本 (latest)`）；
     - 智能提示对比状态（`★ 发现新版 Alpha (v0.1.3-alpha.1)，可升级尝鲜体验` / `✓ 当前运行已是此通道最新版本` / `ℹ 当前运行版本高于此通道版本`）；
   - **对齐官方安装规范的一键升级指令**：
     - 稳定通道：`npm install -g @deepseek-ai/dsh@latest` / `pnpm add -g @deepseek-ai/dsh@latest`
     - 尝鲜通道：`npm install -g @deepseek-ai/dsh@alpha` / `pnpm add -g @deepseek-ai/dsh@alpha`
     - 容灾 Tarball 指令：`npm install -g https://codeload.github.com/deepseek-ai/deepseek-harness/tar.gz/refs/tags/dsh-v0.1.3-alpha.1`（针对无 git 机器绕过 `git ls-remote` 报 EPERM 缺陷）；
     - 支持 `npm` / `pnpm` / `yarn` / `tarball` 选项卡切换，伴随「已复制 ✓」即时反馈；
   - **双层剪贴板容错**：优先使用现代化 `navigator.clipboard` API，在非 HTTPS/受限沙箱下自动降级到 `document.execCommand('copy')`，全平台 100% 复制成功率；
   - **快捷入口**：提供直达 GitHub Releases 页面与「🔄 立即检查」手动穿透刷新按钮。

3. **双端协同架构（Host / Client 分工）**：
   - **Host 端（Node.js / Cordis）**：轻量请求官方 Registry `/-/package/@deepseek-ai/dsh/dist-tags` 端点，单次网络请求（<100 字节）即可一次性嗅探所有发布通道；支持淘宝镜像（npmmirror）与官方 npmjs 双源自动故障切换，暴露 `/api/dsh-version` 接口；
   - **Client 端（原生 React）**：零构建步骤（Zero-build），完全复用 DSH 原生 Design Tokens（`--dsw-alias-bg-layer-2` 等变量），完美适配深色/浅色与第三方主题。

4. **网络弹性与离线容灾**：
   - 探测单次请求严格限制在 3.5 秒超时以内，离线或断网情况下平滑降级，绝不阻塞 DSH 宿主启动与 Web 客户端首次渲染；
   - 内置 15 分钟 TTL 内存缓存，避免频繁穿透请求 npm 触发限流；支持 `?force=1` 强制刷新。

---

## 🚀 安装与使用

### 1. 官方 npm 源安装（推荐）

在终端中执行：

```sh
dsh plugin --profile web add dsh-version-status
```

### 2. 重启生效

安装完成后，重启 `dsh web` 实例刷新浏览器页面即可生效：

```sh
dsh web
```

### 3. 卸载命令

如需卸载，执行：

```sh
dsh plugin --profile web remove dsh-version-status
```

---

## 📦 目录结构

```text
dsh-version-status/
├── cordis.patch.yml       # Cordis 服务插槽补丁
├── package.json           # 模块配置与 exports 映射 (v0.1.3)
├── README.md              # 插件说明文档
├── src/
│   ├── index.js           # Host 端服务、dist-tags 嗅探与版本比对逻辑
│   └── client.js          # Client 端侧边栏胶囊与双通道弹窗组件
└── test/
    ├── client.test.js     # Client 端虚拟沙箱与剪贴板降级测试
    └── run-in-process.js  # 全量自动化测试套件
```

---

## 🔌 Host 端 HTTP 接口规范

### `GET /api/dsh-version`（或别名 `/api/dsh-update/status`）

#### 请求参数（Query）
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `channel` | string | 否 | 指定查询通道，可选 `'latest'`（默认）或 `'alpha'` |
| `force` | boolean | 否 | 传 `1` 时穿透 15 分钟缓存，立即重走 npm registry 探测 |
| `mockLatest` | string | 否 | 用于测试模拟，例如 `?mockLatest=0.1.3` 强制指定最新稳定版本号 |
| `mockAlpha` | string | 否 | 用于测试模拟，例如 `?mockAlpha=0.1.3-alpha.1` 强制指定尝鲜版本号 |

#### 响应示例（双通道数据完全向下兼容）
```json
{
  "ok": true,
  "currentVersion": "0.1.2-rc.1",
  "channel": "latest",
  "latestVersion": "0.1.2-rc.1",
  "alphaVersion": "0.1.2-alpha.5",
  "targetVersion": "0.1.2-rc.1",
  "updateAvailable": false,
  "hasUpdate": false,
  "distTags": {
    "latest": "0.1.2-rc.1",
    "alpha": "0.1.2-alpha.5",
    "next": "0.1.2-rc.1"
  },
  "channels": {
    "latest": {
      "tag": "latest",
      "version": "0.1.2-rc.1",
      "updateAvailable": false,
      "comparison": 0,
      "upgradeCommand": "npm install -g @deepseek-ai/dsh@latest",
      "upgradeCommands": {
        "npm": "npm install -g @deepseek-ai/dsh@latest",
        "pnpm": "pnpm add -g @deepseek-ai/dsh@latest",
        "yarn": "yarn global add @deepseek-ai/dsh@latest"
      }
    },
    "alpha": {
      "tag": "alpha",
      "version": "0.1.2-alpha.5",
      "updateAvailable": false,
      "comparison": -1,
      "upgradeCommand": "npm install -g @deepseek-ai/dsh@alpha",
      "upgradeCommands": {
        "npm": "npm install -g @deepseek-ai/dsh@alpha",
        "pnpm": "pnpm add -g @deepseek-ai/dsh@alpha",
        "yarn": "yarn global add @deepseek-ai/dsh@alpha"
      }
    }
  },
  "hasError": false,
  "errorMessage": null,
  "checkedAt": 1757234400000,
  "checkedAtIso": "2026-09-07T08:50:00.000Z",
  "sources": {
    "local": "global-npm-win",
    "registry": "https://registry.npmmirror.com/-/package/@deepseek-ai/dsh/dist-tags"
  },
  "upgradeCommand": "npm install -g @deepseek-ai/dsh@latest",
  "upgradeCommands": {
    "npm": "npm install -g @deepseek-ai/dsh@latest",
    "pnpm": "pnpm add -g @deepseek-ai/dsh@latest",
    "yarn": "yarn global add @deepseek-ai/dsh@latest"
  },
  "releaseUrl": "https://github.com/deepseek-ai/deepseek-harness/releases",
  "changelogUrl": "https://github.com/deepseek-ai/deepseek-harness/releases"
}
```

---

## 🧪 运行单元测试与端到端验证

```sh
# 运行全量测试（包含 Host 端单元测试与 Client 虚拟沙箱验证）
npm test

# 运行独立 Host 端测试
npm run test:unit
```

---

## 📄 开源协议

[MIT License](LICENSE)
