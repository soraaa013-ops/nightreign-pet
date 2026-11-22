# Electron 鼠标穿透与移动事件转发

URL: https://www.electronjs.org/docs/latest/api/browser-window

访问日期：2026-11-22

来源类型：官方 API 文档

原文摘录：

> Makes the window ignore all mouse events.

可支持事实：setIgnoreMouseEvents(ignore, {forward:true}) 在 macOS/Windows 可忽略点击而转发鼠标移动事件给 Chromium，供命中状态恢复。Windows 前台高权限应用会令 forward 暂时失效，原因是 UIPI。

局限与推断边界：不因此要求桌宠管理员运行；产品应通过托盘菜单/快捷键保留恢复，必要时验证屏幕光标坐标检测降级。正常应用窗口覆盖不能代表管理员窗口也通过。

评级：Credibility 高；Recency 当前文档；Bias 低。
