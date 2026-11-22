# Electron 透明窗口限制

URL: https://www.electronjs.org/docs/latest/tutorial/custom-window-styles

访问日期：2026-11-22

来源类型：官方文档

原文摘录：

> You cannot click through the transparent area.

可支持事实：官方现行文档说明透明区域不会自动点击穿透，且透明窗口不支持普通可调整大小，resizable:true 可能破坏透明。

局限与推断边界：局部命中需自行实现；设置中缩放应程序改变边界并实测，不能宣称原生像素穿透。

评级：Credibility 高；Recency 当前抓取；Bias 低：API限制说明。
