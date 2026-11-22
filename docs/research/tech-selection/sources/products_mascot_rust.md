# 产品证据 mascot_rust

- 来源：https://raw.githubusercontent.com/dazhupeiqi/DesktopMascot/c23b5653a8939c0924bda93579cb7879d88c9844/src-tauri/src/lib.rs
- 浏览入口：https://github.com/dazhupeiqi/DesktopMascot/blob/c23b5653a8939c0924bda93579cb7879d88c9844/src-tauri/src/lib.rs
- 已核查 main 对应提交：`c23b5653a8939c0924bda93579cb7879d88c9844`，提交日期 2026-07-27T09:10:48Z
- 访问日期：2026-11-22
- 类型：作者维护的源码或项目文档，一手资料
- Credibility：高（实际实现选择）；运行体验只按作者声明
- Recency：当前 main 分支读取，随提交变化
- Bias：中（项目作者自述；无独立性能测量）

## 原文摘录

> let _ = window.set_ignore_cursor_events(false);

## 可支持的事实

Rust主入口注册托盘、开机启动、全局快捷键、位置大小与点击穿透命令，有macOS去阴影分支。

## 对选型的限制

部分操作错误被忽略；现成原型不能直接满足本规格的操作失败反馈。
