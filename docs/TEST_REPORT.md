# 小蜗桌宠第一版实测报告

2026-11-22 · 0.2.0 随包提供自制小蜗 Live2D。[产品规格](../SPEC.md) · [测试方案](TEST_PLAN.md) · [角色动作、点透与故障专项报告](character/model-verification.md)

## 0.2.0 功能回归

- TypeScript 类型检查和格式检查通过。角色接入时 101 项单元和集成测试通过，发行前加入首次 Core 条款确认的故障用例后，103 项通过。干净源码副本可从公共 npm 镜像安装依赖、从 Live2D 官网恢复指定哈希的 Core 并完成构建。
- Playwright 的 14 项常规 Electron 桌面测试全部通过。覆盖五个真实角色动作、每战一次绝招、状态条与画布、设置、短局结算、实际暂停 61 秒、存档恢复和窗口故障。首轮发现一个竞态，缩圈断言在计时开始后读取了基准大小。改为在出击前取值后，重新跑通全套。
- Linux x64 发行包在 Xvfb 下通过 SwiftShader 显示模型。独立冒烟从「出击」完成 11 段短局和一次 `NIGHTLORD SLAIN`，未检测到远程 HTTP(S) 请求。[桌面截图](character/revenant-desktop.png) · [五动作实录](character/revenant-live2d.webp)

### 0.2.0 真实角色的资源占用

Linux Xvfb 使用 Vulkan SwiftShader 软件绘制。采样前从正在受测的桌宠窗口确认官方 Core 和 320 × 308 WebGL 画布已就绪。每个状态预热 30 秒，再以 1 秒间隔采集 60 次。CPU 是 Electron 各进程的报告值之和，RSS 是这些进程的工作集总和，包含共享内存的重复计数。

| 状态 | 平均 CPU | 峰值 CPU | 平均 RSS | 峰值 RSS |
| --- | ---: | ---: | ---: | ---: |
| 待机 | 49.96% | 53.82% | 563.42 MiB | 567.32 MiB |
| 探索 | 51.14% | 54.06% | 646.04 MiB | 647.84 MiB |
| 强演出 | 50.26% | 53.18% | 651.32 MiB | 652.28 MiB |
| 隐藏 | 1.49% | 2.51% | 643.20 MiB | 646.98 MiB |

软件绘制时，可见角色的 CPU 成本较高。隐藏窗口会停帧，进程仍保留模型资源。物理显卡的功耗和帧率需要在对应设备测量。[采样用例](../tests/desktop/performance.spec.ts)

## 0.1.0 结果与环境

| 验证 | 结果与证据 |
| --- | --- |
| Vitest | 9 个文件、101 项通过。独立预期值检查所有 11 阶段边界、2400 秒成功、31–180 分钟逐秒分配、非法输入、旧请求、绝招去重、暂停恢复和写入故障 |
| Playwright Electron | 13 项实际窗口测试通过，耗时 2.7 分钟。覆盖出击准备、四页设置、键盘和确认框、立绘拖动、局部缩圈、绝招、自然结算、结束、重启和渲染故障 |
| 设置与存档 | 损坏和旧版本数据可从备份恢复。正常存储下强杀重启会话保持暂停、保留绝招，回退不超过 5 秒。实际写入故障下置顶回退且旧数据完整，修复后可重试 |
| 屏幕和窗口 | 实测桌宠位于主屏可用区、非焦点、配置置顶。桌宠和中央横幅 HTML 根节点和 body 的计算背景均透明。控制窗 20 次打开关闭后每次回到一个 `BrowserWindow` 和一个 `WebContents` |
| 渲染器故障 | 实际强制停止控制渲染器后渡夜继续，重开获取当前状态。实际强制停止桌宠渲染器后重建桌宠、暂停并等待继续 |
| IPC | 核对请求封包、窗口角色、发送框架和来源，拒绝陈旧会话和非法参数，重复编号只执行一次。实际渲染器仅有受限桥接，Node 和通用 IPC 不可见，弹窗被禁止 |
| 声音及演出 | 自动化确认主增益实时更新、静音及安静模式中无新音符，退出安静模式恢复偏好。实际 Electron 观察预览雨画布及暂停表现，未测音频设备的可听输出 |
| Linux 打包应用 | 压缩完整性通过，从最终 tar.gz 提取 ELF x86-64 程序，确认 `isPackaged=true` 并使用独立数据目录。阻断渲染器 HTTP(S) 请求后，从生产界面出击并自然完成 11 段、结算一次，独立时钟观察 10856.1 毫秒。本地角色清单、PNG 与 SDK Core 均返回 200。`test-results/packaged-smoke.json` |

Linux 为 Ubuntu 24.04.4 LTS x64，内核 `6.8.0-138-generic`，AMD EPYC 7K62（2 个可用逻辑 CPU，3.64 GiB RAM），Electron 45.4.1，Chromium `156.0.8078.100`，Xvfb 1280 × 900，DPR 1。当前容器的 Linux SUID 沙箱辅助程序权限不足，用户命名空间映射被系统拒绝。Xvfb 测试对 Chromium 使用 `--no-sandbox`，验证了 Electron 窗口的 `sandbox: true`、`contextIsolation: true`、`nodeIntegration: false` 配置和桥接权限，生产构建默认配置仍启用沙箱。目标系统的 OS 沙箱待实机验收。

检查实际准备页、战斗、桌宠和中央结算截图。五段摘要、首领血条、同人立绘状态与 `NIGHTLORD SLAIN` 文字可见。桌宠、战斗和中央结算的 PNG 截图角点 alpha 为零，中央横幅在 680 × 200 像素窗口内的可见范围为纵向 55–145 像素。测试生成的画面与 20 次窗口回收记录保存在 `test-results/desktop/`。

## 计时

可控时钟逐项验证 11 阶段和完成边界，包含结束前后一毫秒、递进及阻塞、长暂停、系统时间模拟变动、两种锁屏设置、睡眠与漏收休眠事件。实际 Electron 测试另用 11 个一秒阶段的合法预设完成自然结算，通过生产窗口入口触发全流程。

实际战斗暂停 61.004 秒，主进程的有效用时始终为 5361.414 毫秒，界面血条始终为 95.462%。继续后运行正常。测量记录为 `test-results/desktop/` 下的 `pause-observation.json`。

真实默认 40 分钟首轮在约第 8 分钟收到宿主 SIGTERM，已看到 4:30 和 7:30 阶段，中止轮次不计为通过。第二轮改为独立后台进程，使用 Xvfb 和冻结的开发构建，2026-11-22 01:06:46 UTC 左右自然结束，Playwright **1 项通过（40.1 分钟），退出码 0**。没有加速时钟，也没有操作渡夜进度。

测试进程以自己的单调时钟记录演出事件，以收到 DAY 1 为零点。全部 11 段按序出现，胜利事件恰好一次，终点为 2400005.34 毫秒，观测偏差 **+5.34 毫秒**；最大阶段绝对偏差 **230.69 毫秒**，均满足不超过 1 秒的验收目标。最终会话状态为 completed，有效用时恰好 2400000 毫秒。无渲染页面或采样异常，结算摘要截图已检查。这里记录的是事件到达测试进程的观测差，包含 IPC 与调度延迟，不是对任意电脑承诺毫秒级精度。

| 阶段节点 | 预期累计时间 | 观测偏差 |
| --- | --- | ---: |
| DAY 1 | 00:00 | +0.00 ms |
| 第一天第一次缩圈 | 04:30 | +5.25 ms |
| 第一天圈内探索 | 07:30 | +230.69 ms |
| 第一天第二次缩圈 | 11:00 | +104.58 ms |
| 第一夜 | 14:00 | -124.57 ms |
| DAY 2 | 17:00 | -87.67 ms |
| 第二天第一次缩圈 | 21:30 | -128.40 ms |
| 第二天圈内探索 | 24:30 | +9.41 ms |
| 第二天第二次缩圈 | 28:00 | -136.27 ms |
| 第二夜 | 31:00 | -119.99 ms |
| 夜王战 | 35:00 | -135.77 ms |
| NIGHTLORD SLAIN | 40:00 | +5.34 ms |

冻结副本的时间线、输入校验、会话及存储编译模块与最终构建逐字节一致，后续界面修正另以最终构建回归。`test-results/qa-long-run.log` · `test-results/long-run-summary.json` · `test-results/long-run-build-comparison.json`

长测另记录 81 份进程采样（初始一次，之后每 30 秒一次）。运行中各样本均为 5 个 Electron 进程；各进程 RSS 合计范围为 150.75–528.38 MiB，首个运行样本 524.36 MiB，末个 159.91 MiB。该数值受共享页面和系统内存回收影响，不能把后半程下降解读为应用优化，也不能替代长期堆内存分析。四种状态的固定采样对比见下表。

## 性能

每态预热 30 秒，在接下来 60 秒内以 1 秒间隔读取 `app.getAppMetrics()`。表中 CPU 为 Electron 应用各进程 `percentCPUUsage` 之和，RSS 为工作集之和，共享页面可能重复计入。在同一 VM 中并行进行构建与其他测试。样本使用同人立绘和局部 Canvas 效果，当前环境为软件渲染。未测帧率、独显利用率或功耗，也未得到真实小蜗 Live2D 的资源数据。`test-results/qa-performance.log`

| 状态 | 样本 | CPU 均值 | CPU 峰值 | RSS 均值 | RSS 峰值 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 待命 | 60 | 0.275% | 1.004% | 450.33 MiB | 451.30 MiB |
| 探索 | 60 | 1.050% | 2.496% | 531.26 MiB | 532.60 MiB |
| 强演出 | 60 | 3.016% | 4.009% | 519.15 MiB | 523.22 MiB |
| 隐藏 | 60 | 1.214% | 2.500% | 444.79 MiB | 455.32 MiB |

## 修复及交付阻塞

- 会话校验原本把数组 `['running']` 转成合法状态。已改成严格字符串判断，回归通过。
- 草稿离开时可保存或放弃，确认框键盘焦点保持在对话框内，结算可收起并重看。桌宠与横幅背景透明、立绘透明区域命中、拖动与点击、缩圈连续性、音量即时调节、演出预览和启动告警关闭均已回归。[独立复核](INDEPENDENT_REVIEW.md)
- **0.1.0 角色基线使用概念立绘。** 当时随包清单为 `missing`。官方 Hiyori 样例单独验证了模型加载、动作、上下文丢失恢复、停止绘制和释放。0.2.0 使用自制小蜗。[角色资源及官方样例实测](CHARACTER_ASSETS.md)
- **Windows 与 macOS 待实机验收。** 安装后运行、透明合成、桌面层级与焦点、托盘或菜单栏、穿透、快捷键和登录项、锁屏和睡眠、屏幕拔插、可听音频，以及双方各自真实 40 分钟课堂体验，都需在目标系统验证。

## 打包

| 平台制品 | 校验与运行结果 | SHA-256 |
| --- | --- | --- |
| Linux x64 `nightreign-pet-0.1.0.tar.gz`（123862413 字节） | gzip 完整性通过，解包后二进制为 ELF x86-64，实际冒烟通过 | `a2dd3983cc9d62de1ecc62b3686a2a04a2debdbcc6a28a723dc4893f8451e41d` |
| Windows x64 `小蜗渡夜-0.1.0-win.zip`（157180317 字节） | ZIP CRC 通过，内含 PE32+ x86-64 可执行文件。未配置签名证书，Windows 启动和桌面行为待验证 | `e8d9cda872a7df9df4e7b50c488839ee6b5cb96a5b1ccea14cad5b76fba278ee` |

两份归档都包含应用 `app.asar`、预览图、角色状态清单、Core、着色器和适用的 SDK 许可。Windows NSIS 安装包生成失败。Linux 宿主缺少系统 Wine，Electron Builder 下载的 Wine 11 在运行 NSIS 文件时无法载入 `ntdll.dll`，报 `c0000135`。macOS DMG、签名和公证待 macOS 构建环境。

## 复验命令

```bash
npm test
npm run build
xvfb-run -a --server-args='-screen 0 1280x900x24' \
  env NIGHTREIGN_CHROMIUM_NO_SANDBOX=1 npm run test:desktop -- desktop.spec.ts
xvfb-run -a --server-args='-screen 0 1280x900x24' \
  env NIGHTREIGN_CHROMIUM_NO_SANDBOX=1 NIGHTREIGN_PERF_TEST=1 npm run test:desktop -- performance.spec.ts
xvfb-run -a --server-args='-screen 0 1280x900x24' \
  env NIGHTREIGN_CHROMIUM_NO_SANDBOX=1 NIGHTREIGN_LONG_TEST=1 npm run test:desktop -- long-run.spec.ts
xvfb-run -a env NIGHTREIGN_CHROMIUM_NO_SANDBOX=1 NIGHTREIGN_TEST_SOFTWARE_WEBGL=1 node tests/packaged-smoke.mjs
```

长跑和性能测试为显式启用，桌面测试各用临时用户数据目录。有可用 Chromium 系统沙箱的环境可省略 `NIGHTREIGN_CHROMIUM_NO_SANDBOX=1`。本机试跑时用 `NIGHTREIGN_TEST_APP_DIR` 选择开发构建副本，避免并行打包覆盖运行中的文件。Linux 打包冒烟默认使用 `release/linux-unpacked/nightreign-pet`，可传可执行文件路径或设置 `NIGHTREIGN_PACKAGED_EXECUTABLE`。
