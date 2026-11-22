# 产品证据 airi_desktop

- 来源：https://raw.githubusercontent.com/moeru-ai/airi/bd4f303916b51d66084f2df8a576f2e96d769137/apps/stage-tamagotchi/package.json
- 浏览入口：https://github.com/moeru-ai/airi/blob/bd4f303916b51d66084f2df8a576f2e96d769137/apps/stage-tamagotchi/package.json
- 已核查 main 对应提交：`bd4f303916b51d66084f2df8a576f2e96d769137`，提交日期 2026-11-21T08:53:10Z
- 访问日期：2026-11-22
- 类型：作者维护的源码或项目文档，一手资料
- Credibility：高（实际实现选择）；运行体验只按作者声明
- Recency：当前 main 分支读取，随提交变化
- Bias：中（项目作者自述；无独立性能测量）

## 原文摘录

> "build:mac": "pnpm run build && electron-builder --mac"

## 可支持的事实

桌面包使用 Electron、electron-vite、electron-builder，带 Windows、macOS、Linux 构建脚本；主UI依赖 Vue 与专用 Live2D 模块。

## 对选型的限制

构建脚本不是所有平台图形体验的实测结果。AIRI有大量AI、媒体与原生扩展，不能将其资源占用迁移为本项目预算。
