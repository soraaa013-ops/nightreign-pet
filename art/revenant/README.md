# 小蜗的分层画稿

这版复仇者是约四头身的银发人偶少女。蓝白花冠下露出细碎刘海，蓝紫色眼睛带有星形高光。绣金披肩盖住拨弦手的袖口，钟形长裙露出脚踝与赤足。[造型与工具来源](../../docs/character/character-references.md)

| 文件 | 用途 |
| --- | --- |
| `painted-parts.png` | ImageGen 绘制的身体图集。组装时使用上排的裙身、赤足和后发，以及下排的拨弦手、里拉琴和持琴手。 |
| `painted-head.png`、`painted-blink.png` | 单独保存的 1254 × 1254 睁眼与闭眼画稿。两稿共用脸部朝向与裁框，眨眼时只取睫线周围的小块区域。 |
| [拨琴手势稿](lyre-acting-study.webp) | 依据本版人设用 ImageGen 绘制的三拍表演参考，依次为预备、触弦、松腕听音。供补画手型与侧脸时对照。 |
| `painted-march-gather.png`、`painted-march-cry.png` | 按同一人设单独绘制的绝招关键姿势。俯身时双手向脸侧收紧，仰身时张开双臂。绑定时按赤足落点对齐。 |
| [张掌手型](painted-march-hands.png) | 以现有角色为参照，用 ImageGen 生成左右两只摊开的手。制作要求是掌心朝向镜头、腕口向内、五指自然舒展，采用原画的线条与肤色，预留透明边缘。 |
| `painted-spirit.png` | 独立绘制的兜帽灵体，放在角色身后，由召唤参数控制显隐。 |
| `composition.json` | 1000 × 1120 画布上的部件裁切、位置与缩放。眼睑裁切和网格绑定共用一份眼睛坐标，睫线偏移以画布像素计。 |
| `layout.json`、`parts/` | 绑定工具读取的透明图层和位置。左右眼睑跟随头部网格。 |
| `neutral.png`、`blink.png` | 用于对照组装、睁眼与闭眼的全身图。 |

调整分层位置后，在已安装 Python 3 和 Pillow 的开发环境中执行以下命令。合成脚本同时生成施放时使用的袖口、手型与脸部部件。它同时生成准备界面的 `revenant-portrait.webp`。

```bash
npx electron scripts/character-art/assemble.cjs
```

无图形会话的 Linux 开发机可使用 `xvfb-run -a`。角色的网格、变形、七组动作和可编辑工程保存在 [character-rig](../../scripts/character-rig/)。运行时只加载 [导出的模型](../../resources/character/revenant/)。
