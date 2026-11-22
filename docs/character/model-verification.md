# 小蜗 Live2D 桌面验收 · 0.2.0

2026 年 11 月 22 日，在 Linux x64、Electron 45.4.1 上验证了 0.2.0 的默认角色。小蜗会呼吸眨眼，轻点会歪头回应，夜战持续拨弦，战斗中释放绝招会切换到更大幅度的演奏，击败夜王后会闭眼行礼。[五段动作实录](https://github.com/soraaa013-ops/nightreign-pet/blob/bf1e2ff/docs/character/revenant-live2d.webp) · [默认尺寸与状态条截图](https://github.com/soraaa013-ops/nightreign-pet/blob/bf1e2ff/docs/character/revenant-desktop.png)

预览长 12.10 秒、384 × 448 像素。按桌面计时器实际切换阶段，采集 Cubism 在 Electron 窗口绘制的 172 帧，保留帧间时间，后加背景和动作名。五段中均记录到 `ParamEyeOpen` 从 1 睁开到 0 闭合。

## 模型与动作

从桌宠窗口的 `app://assets/` 读取发行资源。官方 Cubism Core 6.0.1 对 792,064 字节的 `revenant.moc3` 返回一致性校验值 `1`，成功创建模型。模型有 8 个 ArtMesh、6 个参数、11,030 个三角形，使用一张 2048 × 1024 的 RGBA 图集。MOC3 的 SHA-256 为 `712214b7a478bc02db2b6a6e98e2f30a5c635cb59ce677757d749f05e5f6860a`。[随包模型配置](../../resources/character/revenant/revenant.model3.json)

| 桌面操作 | 检查方式与结果 |
| --- | --- |
| 等待出击 | 观察真实 Core 帧，头和长发随呼吸轻动。待机实录包含眼睛完全闭合和重新睁开的帧。 |
| 探索时轻点上身 | 鼠标命中人物并触发 `Touch`。眼睛闭合、头侧倾，拨弦手也随之变化。 |
| 进入首夜战斗 | 计时器切入 `Battle`。记录到头、头发、琴身和拨弦手的参数随帧变化。 |
| 点击「释放绝招」 | 战斗中成功接受 `Ultimate`，琴与右手改变幅度，实录中也可见闭眼。 |
| 自然完成全部阶段 | 桌面收到 `Victory`，结算显示 `NIGHTLORD SLAIN`，小蜗闭眼行礼后抬头。 |

另用独立的 Core 模型逐项改变参数，比较各网格的顶点和透明度。拨弦只改变琴和拨弦手，摆发只改变后发和裙身，眨眼改变头部的眼周网格及左右眼睑。在桌面测试中同时观察实际角色接受的动作和逐帧参数，阶段提示、夜雨及光环均从人物截图中移除。[模型检查](../../tests/desktop/character-rig.ts) · [桌面动作测试](../../tests/desktop/character.spec.ts)

## 桌面交互

- 默认窗口为 320 × 350。一次待机截图中，人物不透明区域占 32.0%（Alpha ≥ 225），透明区域占 66.0%（Alpha < 8）。点击窗口角落或琴旁空隙 `(214, 102)` 不打开面板，点击身体 `(160, 175)` 打开准备页。
- 在 Xvfb + Openbox 下单独启动 Linux 发行包，在桌宠后面放置一个记录点击的原生窗口。通过 XTest 点击 `(15, 10)` 和琴旁 `(214, 102)` 时，底窗依次收到这两个坐标；移动回身体 `(160, 175)` 后，底窗计数仍为 2，桌宠打开了准备页。[原生 X11 穿透测试](../../tests/x11-character.mjs)
- 默认状态条从第 308 像素开始，等于角色画布底边，裙摆和鞋可完整看见。设置缩放到 125% 后画布同步放大，重新采样人物坐标后仍可轻触。[实际桌宠窗口](https://github.com/soraaa013-ops/nightreign-pet/blob/bf1e2ff/docs/character/revenant-desktop.png)
- 隐藏桌宠和暂停出击后，在窗口稳定的 300 毫秒及 350 毫秒采样期内分别观察到零次 Core 更新。重新显示及继续后，模型恢复播放。
- 模拟资源不可用后显示回退立绘和具体故障。回退状态的点击、透明区域、拖动和位置锁定通过。恢复资源后，点击「重新加载小蜗模型」能回到动态模型。角色专项通过 1 条桌面流程、2 条故障流程，未捕获角色窗口运行异常。[故障恢复测试](../../tests/desktop/desktop.spec.ts)

## 发行包

直接启动 `release/linux-unpacked/nightreign-pet`，使用独立用户目录。测试环境为 Xvfb。在默认启动且没有可用硬件 WebGL 的情况下，Chromium 报告 `webgl: disabled_off`，桌宠进入回退立绘并显示「无法初始化 WebGL 2」。在测试进程显式启用 SwiftShader 后，发行包读取实际 MOC3、图集和动作，创建 WebGL 2 上下文。ANGLE 报告渲染设备为 Vulkan SwiftShader。11 个阶段完成，观测耗时 10.996 秒，结算触发一次，测试期间捕获的 HTTP(S) 请求为零。此项覆盖 Linux 软件渲染，Windows 原生桌面与实体 GPU 未在该环境测试。[发行冒烟脚本](../../tests/packaged-smoke.mjs)

## 复跑

在项目目录执行以下命令。两个环境变量仅用于此 Xvfb 测试环境。角色专项输出逐动作 PNG 和包含参数、命中坐标的 `character.json`，打包冒烟输出 `test-results/packaged-smoke.json`。

```bash
npm run build
xvfb-run -a env NIGHTREIGN_CHROMIUM_NO_SANDBOX=1 \
  npx playwright test character.spec.ts --output=test-results/revenant-final
xvfb-run -a env NIGHTREIGN_CHROMIUM_NO_SANDBOX=1 \
  npx playwright test desktop.spec.ts -g '角色读取失败|回退立绘' --output=test-results/revenant-fallback
xvfb-run -a env NIGHTREIGN_CHROMIUM_NO_SANDBOX=1 NIGHTREIGN_TEST_SOFTWARE_WEBGL=1 \
  node tests/packaged-smoke.mjs release/linux-unpacked/nightreign-pet
```

原生穿透测试使用前一步 `character.json` 里从人物画面采出的坐标。Linux 测试机需要 Xvfb、Openbox、Python 3、`libX11` 和 `libXtst`。在当前的 X11 桌面也可直接运行测试脚本。

```bash
xvfb-run -a bash <<'X11'
openbox >/dev/null 2>&1 &
wm=$!
trap 'kill "$wm"' EXIT
NIGHTREIGN_CHROMIUM_NO_SANDBOX=1 NIGHTREIGN_TEST_SOFTWARE_WEBGL=1 \
  node tests/x11-character.mjs
X11
```
