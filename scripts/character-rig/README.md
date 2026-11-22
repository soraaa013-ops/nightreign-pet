# 小蜗的 Live2D 绑定与动作

小蜗用 9 个 ArtMesh、11 个参数和 22 段动作表现巡望、拨琴和召唤。画布为 1000 × 1120 像素，各部件共用一张透明图集。[分层原画与坐标](../../art/revenant/README.md)

## 动作

每组内按下表顺序轮换。动作时长以秒计，第一拍与末拍都回到可接续的姿态。头部和发尾的关键帧略晚于肩和重心。

| 桌宠动作 | Cubism 组 | 变体与时长 |
| --- | --- | --- |
| 待机 | `Idle` | 侧耳听音 5.80、低弦试音 4.85、移步巡望 6.15 |
| 轻触 | `Touch` | 回眸 1.65、举琴致意 2.12 |
| 第一夜 | `Battle` | 单拨 2.85、试弦 2.55、护琴再拨 2.95、低音重拍 2.69 |
| 第二夜 | `NightTwo` | 定步三连 2.82、护琴双拨 2.99、扫弦往返 3.09、切分扫弦 2.84 |
| 夜王 | `Nightlord` | 蓄势召灵 3.60、踏步扫弦 3.23、召灵后撤 3.55、闪身回奏 3.12、渐强终句 3.84 |
| 绝招 | `Ultimate` | 唤灵强奏 3.85、安魂曲 4.07 |
| 胜利 | `Victory` | 举琴鞠躬 3.60、终止式 4.04 |

夜王战的三段重奏和两条绝招有独立的召唤灵轨道。灵体由下向上显现，停留后回落。普通待机、轻触和前两夜将它的透明度保持为零。

## 修改角色

`Artwork.kt` 从 `art/revenant/layout.json` 读取部件的透明 PNG、层序和舞台位置，在眼周加密网格。可在 `landmarks` 中调整颈、髋、脚、两肩、腕、琴枕、琴弦与双眼。眼项格式为 `[中心 x, 中心 y, 完整宽度, 完整高度, 顺时针角度, 闭合睫线偏移]`。最后一项从眼心沿倾斜眼轴的垂线向下量到闭合睫毛中点，以像素计。旧画稿省略这项时使用眼高的四分之一。可选图层使用 `role` 复用绑定，也可独立指定 `LeftFoot`、`RightFoot`、`Cape`、`FrontHair` 或 `Spirit`。移除召唤图层会同时省略它的参数和曲线。

`Rig.kt` 负责各部位的关键形与附加变形。`Motions.kt` 定义关键姿态、节拍与过渡，参数范围见表。

| 参数 | 范围 | 对应演出 |
| --- | --- | --- |
| `ParamBreath` | 0 至 1 | 胸部轻微扩张，头、琴和手随呼吸起伏 |
| `ParamHeadTilt` | −1 至 1 | 头绕颈侧倾，后发根部与双眼睑跟随 |
| `ParamHairSway` | −1 至 1 | 后发、披肩和裙摆分幅摆动 |
| `ParamEyeOpen` | 0 至 1 | 虹膜随网格向闭合睫线收拢，最后十分之一行程显出闭眼笔触 |
| `ParamHarp` | −1 至 1 | 调整持琴手肘、乐器与演奏手的位置 |
| `ParamPluck` | −1 至 1 | 肩、腕和指尖分段转动，琴弦局部振动 |
| `ParamBodyLean` | −1 至 1 | 身躯以髋部为轴移重心，脚底保持支撑 |
| `ParamStride` | −1 至 1 | 左右脚交替外踏、抬起，前脚与支撑脚使用不同权重 |
| `ParamBodyLevel` | −1 至 1 | 屈膝时上身下沉，跃起时收脚 |
| `ParamArmLift` | −1 至 1 | 前臂与持琴手依各自肩关节抬起 |
| `ParamSpirit` | 0 至 1 | 身后的召唤灵浮现、升起与退场 |

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
