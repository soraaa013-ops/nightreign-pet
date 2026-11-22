# UniWindowController

- URL：https://github.com/kirurobo/UniWindowController/blob/main/README.md
- 访问日期：2026-11-22
- 来源类型：Unity桌面窗口原生插件源码
- 可信度：高，实际实现及限制
- 时效：高，当前README
- 偏差：低，主动列出限制

## 原文摘录

> Multiple windows are not supported.

## 可支持的事实

为Windows/macOS Unity应用实现透明、无边框、置顶、拖动与点击穿透。命中测试分透明度与raycast，维护者建议raycast以降低负载。文档说明D3D12透明不可用，D3D11需关闭特定flip-model选项。

## 适用边界

该库不支持多窗口；不能把库限制说成Unity绝不支持多窗口。透明需打包后验证，编辑器里不等于成品。
