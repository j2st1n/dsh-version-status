# dsh-version-status

[![npm](https://img.shields.io/npm/v/dsh-version-status?color=blue)](https://www.npmjs.com/package/dsh-version-status)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

DeepSeek Harness (DSH) 版本监控与一键升级助手插件：侧边栏恒定显示当前运行版本，双源探测最新发布并提供一键升级指令。

## 核心特性

- **侧栏常驻胶囊**：侧边栏底部恒定显示实际运行版本，自适应展开与折叠模式，新版本发布时琥珀呼吸灯与 UPGRADE 徽标提醒。
- **双通道与多源探测**：支持「稳定版 (Latest)」与「尝鲜版 (Alpha)」双通道切换，并行探测 GitHub Releases 与 npm registry。
- **一键升级指令卡片**：点击展开版本对比详情，一键复制对应平台的 npm / pnpm / yarn 升级或容灾 Tarball 指令。
- **轻量零构建与离线韧性**：纯原生 JS 零构建架构，15 分钟 TTL 缓存防限流，网络超时与异常平滑降级。

## 安装与使用

### 一键安装

```bash
dsh plugin --profile web add dsh-version-status
```

> 或通过 GitHub 仓库安装：`dsh plugin --profile web add github:j2st1n/dsh-version-status`

### 快速使用

1. 安装完成后启动或重启 DSH Web 实例 (`dsh web`)。
2. 左边栏底部常驻版本胶囊，点击可展开版本对比与一键升级卡片。

### 卸载

```bash
dsh plugin --profile web remove dsh-version-status
```

## License

[MIT](./LICENSE)
