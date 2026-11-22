# Qt 输入与焦点

URL: https://doc.qt.io/qt-6.12/qt.html

访问日期：2026-11-22

来源类型：官方API

原文摘录：

> WindowTransparentForInput

可支持事实：Qt 有 WindowTransparentForInput 和 WindowDoesNotAcceptFocus；背景透明属性应窗口创建时设定。

局限与推断边界：不能将子控件的 WA_TransparentForMouseEvents 等同系统跨应用穿透；要测试组合窗口标志。

评级：Credibility 高；Recency Qt 6.12；Bias 低。
