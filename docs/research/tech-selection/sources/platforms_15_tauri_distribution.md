# Tauri Windows 离线安装的运行时取舍

URL: https://v2.tauri.app/distribute/windows-installer/

访问日期：2026-11-22

来源类型：官方分发文档

原文摘录：

> The installers by default download the WebView2 bootstrapper

可支持事实：默认安装策略在缺少运行时时下载WebView2；也能嵌入离线安装器或固定版本。官方表中离线安装器约增加127 MB、固定版本约180 MB，属于该文档估计值而非本产品测量。现代Windows常已有运行时，需依据发行目标选择。

局限与推断边界：安装完成后离线运行与从空机器离线安装是不同要求。不能只比Tauri空壳二进制和Electron完整安装器；必须连同模型与所需运行时比较。内存功耗不能从安装体积推导。

评级：Credibility 高；Recency 当前文档但体积随运行时变化；Bias 低。
