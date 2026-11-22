# 产品证据 mascot_runtime

- 来源：https://raw.githubusercontent.com/dazhupeiqi/DesktopMascot/c23b5653a8939c0924bda93579cb7879d88c9844/src/live2d/runtime.js
- 浏览入口：https://github.com/dazhupeiqi/DesktopMascot/blob/c23b5653a8939c0924bda93579cb7879d88c9844/src/live2d/runtime.js
- 已核查 main 对应提交：`c23b5653a8939c0924bda93579cb7879d88c9844`，提交日期 2026-07-27T09:10:48Z
- 访问日期：2026-11-22
- 类型：作者维护的源码或项目文档，一手资料
- Credibility：高（实际实现选择）；运行体验只按作者声明
- Recency：当前 main 分支读取，随提交变化
- Bias：中（项目作者自述；无独立性能测量）

## 原文摘录

> const { Live2DModel } = await import("pixi-live2d-display/cubism4");

## 可支持的事实

实际创建透明Pixi应用，限制devicePixelRatio到2，注册Ticker并加载model3.json；关闭自动交互避免挡住设置面板。

## 对选型的限制

源码证明存在真实Live2D路径，并非仅README列功能；不证明实际性能与所有模型兼容。
