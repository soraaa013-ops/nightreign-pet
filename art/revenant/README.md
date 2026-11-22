# 小蜗的分层画稿

这版复仇者采用圆脸、蓝花冠、成束的银发、象牙白裙和金色里拉琴。深蓝描边分开手指与琴弦，披肩、裙边与靴子使用大块平涂。姿势让一只手托住琴，另一只手搭在琴弦上。[造型与工具来源](../../docs/character/character-references.md)

| 文件 | 用途 |
| --- | --- |
| `painted-parts.png` | 用 ImageGen 按两行三列绘制的透明底画稿。头、裙身和后发在上排，拨弦手、琴和持琴手在下排。各部件保留了相互遮挡处的颜色。 |
| `painted-blink.png` | 以睁眼头部为输入编辑的闭眼稿，两眼各用一条弧线表现闭合。 |
| `painted-spirit.png` | 独立绘制的兜帽灵体，放在角色身后，由召唤参数控制显隐。 |
| `composition.json` | 原稿的裁切、缩放、前后层次，以及闭眼稿相对睁眼稿的配准与羽化区域。画布为 1000 × 1120。 |
| `layout.json`、`parts/` | 绑定工具读取的九个透明图层和位置。左右眼睑跟随头部网格。 |
| `neutral.png`、`blink.png` | 用于对照组装、睁眼与闭眼的全身图。 |

调整分层位置后，在项目根目录运行以下命令。它同时生成准备界面的 `revenant-portrait.webp`。

```bash
npx electron scripts/character-art/assemble.cjs
```

无图形会话的 Linux 开发机可使用 `xvfb-run -a`。角色的网格、变形、七组动作和可编辑工程保存在 [character-rig](../../scripts/character-rig/)。运行时只加载 [导出的模型](../../resources/character/revenant/)。
