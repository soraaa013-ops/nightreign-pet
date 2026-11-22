# 小蜗的 Live2D 绑定与动作

小蜗用 13 个 ArtMesh、17 个参数和 22 段动作表现巡望、拨琴、召灵和不死行军。画布为 1000 × 1120 像素，各部件共用一张透明图集。[分层原画与坐标](../../art/revenant/README.md)

## 动作

每组内按下表顺序轮换。动作时长以秒计，同组变体的首尾姿态相接，三场战斗采用手腕抬起的准备姿势。每只手、目光和身体各有自己的节拍。

| 桌宠动作 | Cubism 组 | 变体与时长 |
| --- | --- | --- |
| 待机 | `Idle` | 侧耳听音 5.70、低弦试音 4.87、移步巡望 5.23 |
| 轻触 | `Touch` | 回眸 1.83、举琴致意 2.27 |
| 第一夜 | `Battle` | 单拨 2.87、试弦 2.60、护琴再拨 3.23、低音重拍 2.93 |
| 第二夜 | `NightTwo` | 定步三连 3.00、护琴双拨 3.17、扫弦往返 3.20、切分扫弦 2.90 |
| 夜王 | `Nightlord` | 蓄势召灵 3.53、踏步扫弦 3.33、召灵后撤 3.63、闪身回奏 3.37、渐强终句 4.00 |
| 绝招 | `Ultimate` | 不死行军 4.13、延后爆发变体 4.40 |
| 胜利 | `Victory` | 举琴鞠躬 3.77、终止式 4.23 |

夜王战的召灵轨道控制家人的显隐。两条绝招使用独立的俯身、仰身姿势，以及脚下的扩散波和青白色灵光。

## 修改角色

`Artwork.kt` 从 `art/revenant/layout.json` 读取部件的透明 PNG、层序和舞台位置，在眼周加密网格。可在 `landmarks` 中调整颈、髋、脚、两肩、腕、琴枕、琴弦与双眼。眼项格式为 `[中心 x, 中心 y, 完整宽度, 完整高度, 顺时针角度, 闭合睫线偏移]`。最后一项从眼心沿倾斜眼轴的垂线向下量到闭合睫毛中点，以像素计。旧画稿省略这项时使用眼高的四分之一。可选图层使用 `role` 复用绑定，也可独立指定 `LeftFoot`、`RightFoot`、`Cape`、`FrontHair` 或 `Spirit`。移除召唤图层会同时省略它的参数和曲线。

`Rig.kt` 负责各部位的关键形与附加变形。`Motions.kt` 定义关键姿态、节拍与过渡，参数范围见表。

| 参数 | 范围 | 对应演出 |
| --- | --- | --- |
| `ParamBreath` | 0 至 1 | 胸部轻微扩张，头、琴和手随呼吸起伏 |
| `ParamHeadTilt` | −1 至 1 | 头绕颈侧倾，后发根部与双眼睑跟随 |
| `ParamHairSway` | −1 至 1 | 发根随头，长发末梢延迟摆动 |
| `ParamEyeOpen` | 0 至 1 | 虹膜随网格向闭合睫线收拢，最后十分之一行程显出闭眼笔触 |
| `ParamHarp` | −1 至 1 | 调整持琴手肘、乐器与演奏手的位置 |
| `ParamPluck` | −1 至 1 | 手腕越过弦线，指节收拢 |
| `ParamBodyLean` | −1 至 1 | 身躯以髋部为轴移重心，脚底保持支撑 |
| `ParamStride` | −1 至 1 | 以脚尖为支点，两侧交替换重心 |
| `ParamBodyLevel` | −1 至 1 | 屈膝或伸直时，脚底留在地面 |
| `ParamArmLift` | −1 至 1 | 前臂与持琴手依各自肩关节抬起 |
| `ParamHeadPitch` | −1 至 1 | 俯首看弦或抬脸听音，眼睑、面部和花冠随同变化 |
| `ParamGaze` | −1 至 1 | 向画面左侧听声或向右下方看琴，闭眼时目光位移归零 |
| `ParamHemSway` | −1 至 1 | 根据重心变化带动下摆，脚底保持稳定 |
| `ParamStringResonance` | −1 至 1 | 触弦后琴弦在固定琴框内来回衰减 |
| `ParamSpirit` | 0 至 1 | 身后的召唤灵浮现、升起与退场 |
| `ParamImmortalMarch` | 0 至 1 | 在常态、俯身与仰身姿势之间过渡 |
| `ParamMarchWave` | 0 至 1 | 爆发时灵光显现，波纹从脚底向外扩散 |

可编辑模型是 `editor/revenant.cmo3`，同目录的 `revenant.can3` 包含全部 22 个动画场景。

## 重建与校验

已验证的生成环境为 Linux x64、Python 3.12、JDK 17、Kotlin 2.4.10 和 PSD2Live 3.8.4。解压两个工具发行包后，在项目根目录执行。[PSD2Live 3.8.4](https://github.com/tsunehimatoi/psd2live/releases/tag/v3.8.4) · [Kotlin 2.4.10](https://github.com/JetBrains/kotlin/releases/tag/v2.4.10)

```bash
python3 scripts/character-rig/build.py \
  --psd2live /path/to/PSD2Live \
  --kotlinc /path/to/kotlinc/bin/kotlinc
```

运行文件写入 `resources/character/revenant/`，编辑工程写入本目录的 `editor/`。可用 `--runtime-out` 和 `--editor-out` 指定独立输出目录。手工精修的编辑工程需要另存，以免重建时覆盖。

构建会回读编辑工程的网格、各部位的参数键、嵌入图集像素、动作场景和模型引用。实际桌宠通过官方 Cubism Core 和 WebGL 2 渲染模型，桌面测试覆盖变体及局部动作。官方 Cubism Editor 图形界面仍待实机复核。[角色测试](../../tests/desktop/character.spec.ts) · [动作测试](../../tests/desktop/motions.spec.ts)
