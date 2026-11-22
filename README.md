# 小蜗渡夜

以《黑夜君临》的渡夜节奏陪伴一节课的 Electron 桌宠。默认 40 分钟，两个白天各经历两次缩圈，再进入第一夜、第二夜与夜王战。点「出击」后自动推进，战斗中可以轻点释放一次绝招，时间不受互动影响。

桌宠下方常驻两条计时进度。第一条显示当前阶段和倒计时，第二条显示整局进度和剩余时间。缩圈时光环持续收紧，暂停时两条计时同时停住。第一夜、第二夜、夜王战各有一套动作，轻点绝招会唤出灵体。可以在「设置 → 桌宠」切换计时栏的详略或将它隐藏。[角色资源与动作](docs/CHARACTER_ASSETS.md) · [可编辑模型和动作工程](scripts/character-rig/editor/)

从 GitHub Releases 下载对应系统的桌宠，或下载附带编辑工程的独立模型包。Windows 用户完整解压 ZIP 后双击「小蜗渡夜.exe」。首次运行会询问随包 Cubism Core 的使用条款。[下载桌宠和模型](https://github.com/soraaa013-ops/nightreign-pet/releases/latest) · [使用与验证范围](docs/BUILD_ARTIFACTS.md)

<img src="docs/character/revenant-live2d.webp" width="275" alt="小蜗待机、三场战斗、召唤与胜利动作的运行时预览">

[默认尺寸战斗截图](docs/character/revenant-desktop.png) · [0.3.0 验收结果](docs/character/0.3.0.md)

## 运行

开发环境使用 Node.js 22.12 或以上兼容版本。首次克隆后在项目目录执行以下命令。`prepare:cubism` 从 Live2D 官网下载固定版本的 SDK，并校验压缩包和 Core 的 SHA-256。运行该步骤适用官方开发许可。[Cubism Core 许可](https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html)

```bash
npm ci
npm run prepare:cubism
npm run dev
```

已经下载官方 `CubismSdkForWeb-5-r.5.zip` 时，可用 `npm run prepare:cubism -- /path/to/CubismSdkForWeb-5-r.5.zip` 离线恢复。已校验的 Core 会在后续启动和构建时复用。

首次打开会显示出击准备和桌宠。点击桌宠打开控制面板，右键或系统托盘可暂停、静音、设置、显示小蜗与退出。启用鼠标穿透后，从托盘关闭穿透或重置位置。默认40分钟预设不可删除，修改时另存为用户预设。

## 构建和测试

```bash
npm run typecheck
npm test
npm run build
npm run test:desktop
npm run pack
```

Linux无图形环境运行桌面测试：

```bash
xvfb-run -a env NIGHTREIGN_CHROMIUM_NO_SANDBOX=1 npm run test:desktop
xvfb-run -a env NIGHTREIGN_CHROMIUM_NO_SANDBOX=1 NIGHTREIGN_LONG_TEST=1 npx playwright test tests/desktop/long-run.spec.ts
xvfb-run -a env NIGHTREIGN_CHROMIUM_NO_SANDBOX=1 NIGHTREIGN_TEST_SOFTWARE_WEBGL=1 node tests/packaged-smoke.mjs
```

当前无头测试容器通过第一个开关启动 Chromium，通过第二个开关在发行包冒烟中启用 SwiftShader。普通桌面运行使用 Electron 默认的沙箱和 GPU 设置。

实际40分钟测试不加速时钟；普通桌面测试使用合法自定义短局。两者的覆盖范围分别记录。测试的桌面启动参数、操作系统与模型状态以 [测试报告](docs/TEST_REPORT.md) 为准。

目标平台打包：

```bash
npm run dist:linux
npm run dist:win
npm run dist:win:zip
npm run dist:mac
```

Windows安装包与macOS DMG需要相应构建工具；macOS签名公证须在具备凭据的macOS环境执行。生成安装文件不等于目标系统实机验收通过。输出在 `release/`，不纳入Git。

## 结构

- `src/core/`：纯逻辑时间线与输入校验。
- `src/main/`：会话、系统窗口、托盘、持久化和权限校验。
- `src/preload/`、`src/contracts/`：受限桌面接口和共享类型。
- `src/renderer/`：准备界面、四页设置、局部演出与角色适配器。
- `resources/`：离线 SDK、复仇者模型、贴图、七组动作和品牌图形。
- `art/revenant/`、`scripts/character-rig/`：角色分层原稿、绑定、动作曲线和编辑工程。
- `tests/`：核心、集成、桌面流程和真实时间测试。

用户设置和进度保存于Electron的 `userData`，正常退出与异常重启均从保存点暂停恢复；离线期间不计时。开发／测试可设置绝对路径 `NIGHTREIGN_USER_DATA` 隔离数据，此覆盖在打包应用中禁用。

## 设计与验收

- [产品规格](SPEC.md)
- [技术架构与选型](docs/TECHNICAL_DESIGN.md)
- [技术规格与协作契约](docs/IMPLEMENTATION_SPEC.md)
- [测试方案](docs/TEST_PLAN.md)
- [测试结果](docs/TEST_REPORT.md)
- [角色资源及接入方式](docs/CHARACTER_ASSETS.md)

桌宠是免费的个人同人项目，离线运行，无需游戏进程、账号或服务器。角色与相关标识归原权利人所有。SDK 的独立许可、角色画稿与绑定的来源随项目保存。[第三方组件与角色声明](resources/THIRD_PARTY_NOTICES.md) · [角色资源记录](docs/CHARACTER_ASSETS.md)
