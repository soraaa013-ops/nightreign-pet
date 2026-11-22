# 小蜗的 Live2D 绑定与动画

画布为 1000 × 1120 像素。8 个 ArtMesh 共用一张 2048 × 1024 透明图集，共有 5,970 个顶点、11,030 个三角形。图集保留分层原画的分辨率。[画稿、坐标与制作说明](../../art/revenant/README.md)

## 修改角色

- 修改银发、花冠、礼服或竖琴时，编辑 `art/revenant/parts/` 中对应的透明 PNG。画布位置从 `art/revenant/layout.json` 读取，原点在左上。
- 调整姿态时，修改 `Rig.kt` 的颈部、肩、腕、竖琴支点和权重。`Artwork.kt` 生成图集及网格，在眼周增加采样，保留眼睑弧线。
- 调整节奏时，修改 `Motions.kt` 的贝塞尔曲线。动作时间以秒计。待机循环为 6.40 秒，触碰为 1.45 秒，战斗为 2.80 秒，绝招为 2.05 秒，胜利为 3.15 秒。
- 在模型编辑器里调整网格可使用 `editor/revenant.cmo3`。在动画编辑器里调整动作可使用同目录的 `revenant.can3`，其中的五个场景共同引用该模型。

| 参数 | 范围 | 对应部位 |
| --- | --- | --- |
| `ParamBreath` | 0 至 1 | 胸廓轻微扩张，头、手臂和琴一起起伏，鞋底固定 |
| `ParamHeadTilt` | −1 至 1 | 头部绕颈侧倾，后发根部和眼睑跟随 |
| `ParamHairSway` | −1 至 1 | 后发、披肩与裙摆沿不同幅度摆动 |
| `ParamEyeOpen` | 0 至 1 | 两眼同步眨动，0 时眼周网格收拢，覆盖闭眼原画 |
| `ParamHarp` | −1 至 1 | 持琴手、琴身和演奏手同步转动 |
| `ParamPluck` | −1 至 1 | 拨弦手指、前臂和弦分开响应 |

## 重建

在项目根目录执行。已验证的环境为 Linux x64、Python 3.12、JDK 17、Kotlin 2.4.10 和 PSD2Live 3.8.4。将两个工具发行包分别解压后，把下面命令中的路径改为实际位置。桌宠运行时直接读取导出的模型和动作。[PSD2Live 3.8.4 发布包及 SHA-256](https://github.com/tsunehimatoi/psd2live/releases/tag/v3.8.4) · [Kotlin 2.4.10 编译器](https://github.com/JetBrains/kotlin/releases/tag/v2.4.10)

```bash
python3 scripts/character-rig/build.py \
  --psd2live /path/to/PSD2Live \
  --kotlinc /path/to/kotlinc/bin/kotlinc
```

`build.py` 使用 PSD2Live 提供的编译接口，生成 `resources/character/revenant/` 内的运行文件和本目录 `editor/` 内的可编辑工程。可用 `--runtime-out` 和 `--editor-out` 指定独立目录进行比对。重新导出会覆盖目标目录内的同名文件，在编辑器里手工精修后请先另存。

## 验证

每次重建都会回读 `.cmo3` 的参数、网格、关键形及嵌入图集，并从 `.can3` 回读五个场景和相对模型路径。分发版本另用项目内官方 Cubism Core 检查了 MOC3 一致性，再用实际 WebGL 渲染器检查整身、闭眼和五种动作。独立重建的 10 个运行文件已逐一比对 SHA-256，均与分发文件一致。可编辑工程会生成新的 GUID，重建后按网格、参数和场景比对。已用 PSD2Live 回读两版可编辑工程，官方 Cubism Editor 图形界面仍待实机复核。[桌面角色测试](../../tests/desktop/character.spec.ts)
