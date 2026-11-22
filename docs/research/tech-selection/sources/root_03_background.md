# Electron background throttling

来源：https://www.electronjs.org/docs/latest/api/structures/browser-window-options

访问日期：2026-11-22

类型：官方API

原文短摘录：

> Whether to throttle animations and timers when the page becomes background.

事实与边界：backgroundThrottling默认开启；关闭会影响整个窗口的帧绘制和交换。不能为隐藏音频简单全局关闭节流再宣称省电。

可信度：高。时效：持续更新。偏差：接口说明，无负载基准。
