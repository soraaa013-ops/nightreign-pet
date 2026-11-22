# Open LLM VTuber 当前模型实现

- URL：https://github.com/Open-LLM-VTuber/Open-LLM-VTuber-Web/blob/d176e7df2366952e3bacbf12cf9a8b18a4315932/src/renderer/WebSDK/src/lappmodel.ts
- 访问日期：2026-11-22
- 来源类型：固定提交的产品源码
- 可信度：高
- 时效：高，读取当前 main 后固定 commit
- 偏差：低

## 原文摘录

> import { CubismUserModel } from "@framework/model/cubismusermodel";

## 可支持的事实

当前固定commit直接导入CubismUserModel、CubismFramework、CubismMotion等官方Framework类，说明官方SDK迁移不仅是发布计划。

## 适用边界

项目自己的lappmodel有定制；不能无审查照搬，也不能由此推断其任何模型显示都正确。
