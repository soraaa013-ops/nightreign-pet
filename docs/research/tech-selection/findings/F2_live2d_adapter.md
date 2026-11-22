# 使用官方 Cubism Web SDK 并保持模型适配边界

结论性质：本项目依赖选择。置信度：中高；具体模型兼容版本待核对。

官方Framework描述现代Cubism兼容范围；Open-LLM已迁移并有当前实现代码；Kagami与TonyNa披露第三方封装修补或新模型限制。直接官方接入减少一层版本耦合，但需要自行实现加载、交互和资源清理，不保证工程量最少。

来源：[官方Framework](../sources/live2d_01_official_web.md)、[Open-LLM迁移](../sources/live2d_04_openllm_migration.md)、[当前代码](../sources/live2d_16_openllm_adapter.md)、[Kagami](../sources/products_kagami_readme.md)、[TonyNa](../sources/products_tonyna_live2d.md)。

反证：[现代Pixi分支](../sources/live2d_06_pixi_modern.md)同样支持新模型；本项目不选它的理由是单角色不需要额外场景图，而非全部Pixi方案过时。
