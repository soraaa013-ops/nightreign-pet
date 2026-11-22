# Tauri 窗口接口与后台节流

URL: https://v2.tauri.app/reference/javascript/api/namespacewindow/

访问日期：2026-11-22

来源类型：官方API

原文摘录：

> setIgnoreCursorEvents(ignore): Promise<void>;

可支持事实：提供 setIgnoreCursorEvents、setFocusable、setAlwaysOnTop。backgroundThrottling 在 Windows/Linux/Android 不受支持；macOS 从14起支持。

局限与推断边界：窗口忽略鼠标后需要额外命中恢复机制；前端计时与音频不可假定隐藏WebView持续运行。

评级：Credibility 高；Recency 当前抓取；Bias 低。
