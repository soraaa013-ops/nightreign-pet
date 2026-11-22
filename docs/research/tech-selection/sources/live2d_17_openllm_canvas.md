# Open LLM VTuber 桌宠画布

- URL：https://github.com/Open-LLM-VTuber/Open-LLM-VTuber-Web/blob/d176e7df2366952e3bacbf12cf9a8b18a4315932/src/renderer/src/components/canvas/live2d.tsx
- 访问日期：2026-11-22
- 来源类型：固定提交的产品源码
- 可信度：高
- 时效：高，读取当前 main 后固定 commit
- 偏差：低

## 原文摘录

> const isPet = mode === 'pet';

## 可支持的事实

React组件通过useLive2DModel和useLive2DResize hooks管理画布，显式处理pet模式和forceIgnoreMouse；可参考业务状态和模型适配解耦。

## 适用边界

确认源码有桌宠模式，不代表我们要求的双平台窗口边界全部被其实现或通过验收。
