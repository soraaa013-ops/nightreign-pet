# 产品证据 kagami_manifest

- 来源：https://raw.githubusercontent.com/Cor72/Kagami-desktop-vpet/321bd7dbd00d201fd505d598cdf549d7bfd22e9d/app/src-tauri/Cargo.toml
- 浏览入口：https://github.com/Cor72/Kagami-desktop-vpet/blob/321bd7dbd00d201fd505d598cdf549d7bfd22e9d/app/src-tauri/Cargo.toml
- 已核查 main 对应提交：`321bd7dbd00d201fd505d598cdf549d7bfd22e9d`，提交日期 2026-09-20T13:35:59Z
- 访问日期：2026-11-22
- 类型：作者维护的源码或项目文档，一手资料
- Credibility：高（实际实现选择）；运行体验只按作者声明
- Recency：当前 main 分支读取，随提交变化
- Bias：中（项目作者自述；无独立性能测量）

## 原文摘录

> tauri = { version = "=2.11.3", features = ["protocol-asset", "tray-icon"] }

## 可支持的事实

实际Rust宿主依赖Tauri2、windows crate与windows-native凭据模块。

## 对选型的限制

这是Windows定向实现，不足以证明移到macOS无需适配。
