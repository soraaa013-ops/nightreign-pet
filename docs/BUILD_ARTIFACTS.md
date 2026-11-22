# 小蜗渡夜构建产物

0.3.0 自带小蜗的模型、灵体贴图和七组共 22 段动作。下载与设备相符的文件，首次启动时阅读随包 Cubism Core 的使用条款。[GitHub Release](https://github.com/soraaa013-ops/nightreign-pet/releases/tag/v0.3.0)

| 设备或用途 | 下载后如何使用 |
| --- | --- |
| Windows x64 便携 ZIP | 完整解压后双击「小蜗渡夜.exe」。保留同目录的 DLL、`resources` 和其他文件，无需自行安装 Node.js。 |
| macOS Apple 芯片 DMG | 打开磁盘映像，将「小蜗渡夜」拖入“应用程序”。发行包不含开发者签名与公证。 |
| Linux x64 tar.gz | 解压后运行目录中的 `nightreign-pet`。 |
| 小蜗独立模型 ZIP | 完整解压后在匹配版本的 Cubism 播放器中打开 `revenant.model3.json`。`editor/` 有可编辑的 `.cmo3` 模型和 `.can3` 动画。 |

每个发布文件的 SHA-256 列在 Release 附件 `SHA256SUMS.txt` 中。下载、解压、启动与数字签名分属不同验收项目，各平台的实际运行结果随版本记录。[GitHub 原生打包与测试](https://github.com/soraaa013-ops/nightreign-pet/actions/workflows/release-check.yml) · [角色专项验收](character/0.3.0.md)

在项目根目录运行 `npm ci` 和 `npm run prepare:cubism`。Linux 与 Windows 分别使用 `npm run dist:linux`、`npm run dist:win:zip`，Apple 芯片 Mac 使用 `npm run dist:mac`。运行 `python3 scripts/package_character.py` 可生成独立模型包。[绑定与编辑工程](../scripts/character-rig/)

## 0.1.0 构建记录

0.1.0 的角色使用概念立绘。其独立计时和 40 分钟测试记录可供版本对照。

| 产物 | 使用方式 | 已验证范围 |
| --- | --- | --- |
| `小蜗渡夜-0.1.0-win.zip` | 完整解压到一个目录，运行其中的「小蜗渡夜.exe」。保留旁边的 DLL、resources 等文件。 | Linux 交叉构建；压缩包和必备文件校验。未在 Windows 实机启动，未签名。 |
| `nightreign-pet-0.1.0.tar.gz` | 解压后运行目录中的 `nightreign-pet`。 | 实际解压、启动、离线资源与 11 段短局。当前容器运行测试需要关闭 Chromium 系统沙箱，详见测试报告。 |

`release/` 是本地产物目录，不跟随 Git 保存。

NSIS 安装器的配置和 `npm run dist:win` 保留。此次 Linux 构建缺少系统 Wine，尝试官方 Wine 11 工具包后遇到缺失 PE 内置文件的上游问题，未生成可交付的 NSIS 安装器。失败的中间文件已移出 release 目录。可在具备 Windows 构建环境时重新生成并验收安装、升级和卸载。[electron-builder 工具包说明](https://www.electron.build/docs/toolsets/)

macOS DMG 的构建入口为 `npm run dist:mac`，此次没有 macOS 环境，未生成 DMG，也未执行签名或公证。

完整功能、性能、长期计时与环境限制见 [测试报告](TEST_REPORT.md)。
