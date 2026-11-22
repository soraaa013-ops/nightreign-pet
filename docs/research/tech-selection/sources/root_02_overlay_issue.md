# Electron overlay occlusion issue 51718

来源：https://github.com/electron/electron/issues/51718

访问日期：2026-11-22

类型：维护者问题跟踪

原文短摘录：

> The underlying window's document.visibilityState becomes 'hidden' as soon as the transparent overlay covers it.

事实与边界：问题报告明确列出macOS 15下透明覆盖窗口影响下层BrowserWindow的可见性与节流；当前页面为Closed并关联PR52365。它证明曾出现回归，不证明所有当前版本仍失败。

可信度：高，含复现但版本受限。时效：2026年问题，访问时已关闭。偏差：故障样本不代表总体失败率。
