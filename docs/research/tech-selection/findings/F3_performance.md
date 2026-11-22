# 本次没有可支持框架资源占用排名的证据

结论性质：证据不足，未作性能优胜判断。

Electron自带运行时，Tauri借助系统WebView，Qt Native还有另一条原生链。这些组成事实不是相同模型的CPU、内存与功耗实验。Kagami的作者优化记录及Live2DViewerEX的SDK兼容更新进一步说明渲染负载和版本会影响结果，不能把其他模型上的数字搬到小蜗。

来源：[Electron组成](../sources/platforms_03_electron_runtime.md)、[TauriWebView](../sources/platforms_07_tauri_webview.md)、[Kagami](../sources/products_kagami_readme.md)、[ViewerEX更新](../sources/live2d_11_viewer_sdk.md)。

补证方式：统一模型、尺寸、DPR、帧率、效果与目标机器，测整个进程树，并区分安装包、安装后磁盘、内存和功耗。未得到这些数据前不发布倍数或MB优势结论。
