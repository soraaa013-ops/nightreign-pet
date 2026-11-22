# live2d-py

- URL：https://github.com/EasyLive2D/live2d-py
- 访问日期：2026-11-22
- 来源类型：Python绑定源码
- 可信度：高，原始仓库
- 时效：高，当前README
- 偏差：中，平台支持自述

## 原文摘录

> 使用 Python 直接加载和操作 Live2D 模型，不通过 Web Engine 等间接手段进行渲染。

## 可支持的事实

通过C扩展封装Native SDK，可与PySide6/PyQt等OpenGL窗口结合。README平台表列macOS arm64、Windows x64；支持旧.moc与新.moc3路线，另有Qt Viewer示例。

## 适用边界

平台表不等于我们的双平台桌宠已验证；Python运行时、原生扩展、Qt打包与目标系统版本仍需工程处理。
