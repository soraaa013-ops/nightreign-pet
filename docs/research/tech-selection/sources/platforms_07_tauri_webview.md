# Tauri 两端 WebView

URL: https://v2.tauri.app/reference/webview-versions/

访问日期：2026-11-22

来源类型：官方技术文档

原文摘录：

> Tauri uses WebKit on macOS

可支持事实：Windows 使用 Edge WebView2，macOS 使用 WKWebView；WebView版本生命周期由系统/运行时控制。

局限与推断边界：不自带浏览器减少分发负担，但不能证明动态模型内存或功耗更低；Live2D/WebGL音频须两端测试。

评级：Credibility 高；Recency 当前抓取；Bias 低。
