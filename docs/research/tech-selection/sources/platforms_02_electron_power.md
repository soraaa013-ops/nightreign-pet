# Electron 电源与锁屏事件

URL: https://www.electronjs.org/docs/latest/api/power-monitor

访问日期：2026-11-22

来源类型：官方API

原文摘录：

> Event: 'lock-screen' macOS Windows

可支持事实：powerMonitor 提供 suspend/resume 与 macOS、Windows 的 lock-screen/unlock-screen。

局限与推断边界：有接口不保证系统事件在异常中断时不丢失；恢复与单调时钟仍需验证。

评级：Credibility 高；Recency 当前抓取；Bias 低。
