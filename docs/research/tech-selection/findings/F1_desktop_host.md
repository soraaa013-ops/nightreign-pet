# 第一版选 Electron 的依据是需求组合

结论性质：工程判断，非性能基准。置信度：中高；真实模型与平台验证仍未进行。

Electron锁屏和睡眠API覆盖需求；Open-LLM已有官方SDK桌宠源码；AIRI有双端发行入口。三家主体的API、代码与发行记录共同支持首版集成风险较可控。Tauri实际项目是有效反证，意味着选择不能表述为其他框架不具备能力。

来源：[Electron系统接口](../sources/platforms_02_electron_power.md)、[Open-LLM桌宠](../sources/live2d_17_openllm_canvas.md)、[AIRI发行](../sources/products_airi_readme.md)、[Tauri反证](../sources/products_mascot_runtime.md)。

推翻条件：同负载实测Electron无法达到明确资源预算，而替代方案同时满足系统行为验收。
