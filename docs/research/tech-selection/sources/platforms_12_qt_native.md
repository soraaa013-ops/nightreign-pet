# Qt 原生事件接入

URL: https://doc.qt.io/qt-6/qabstractnativeeventfilter.html

访问日期：2026-11-22

来源类型：官方API

原文摘录：

> provides an interface for receiving native events

可支持事实：Qt可通过原生事件过滤器接入Windows MSG与macOS NSEvent。

局限与推断边界：该接口不是统一的休眠锁屏抽象；还须Windows会话/电源通知和macOS通知集成。

评级：Credibility 高；Recency Qt 6.12；Bias 低。
