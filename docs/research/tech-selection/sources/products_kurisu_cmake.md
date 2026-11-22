# 产品证据 kurisu_cmake

- 来源：https://raw.githubusercontent.com/handsome90415/kurisu-live2d-runtime/d3b6db9b9a465bb4223197283b6e0bd3d33228ce/CMakeLists.txt
- 浏览入口：https://github.com/handsome90415/kurisu-live2d-runtime/blob/d3b6db9b9a465bb4223197283b6e0bd3d33228ce/CMakeLists.txt
- 已核查 main 对应提交：`d3b6db9b9a465bb4223197283b6e0bd3d33228ce`，提交日期 2026-06-15T22:31:54Z
- 访问日期：2026-11-22
- 类型：作者维护的源码或项目文档，一手资料
- Credibility：高（实际实现选择）；运行体验只按作者声明
- Recency：当前 main 分支读取，随提交变化
- Bias：中（项目作者自述；无独立性能测量）

## 原文摘录

> find_package(Qt6 COMPONENTS Widgets OpenGLWidgets OpenGL Network QUIET)

## 可支持的事实

实际CMake链接Qt6/Qt5与Cubism Native；选取macOS静态Core库并编译OpenGL框架；使用Objective-C++窗口适配。

## 对选型的限制

原生方案可行，但当前仓库构建定向macOS，Windows须另做构建与系统层。
