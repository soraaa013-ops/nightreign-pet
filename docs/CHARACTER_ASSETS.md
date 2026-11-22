# 小蜗角色资源

小蜗是《艾尔登法环：黑夜君临》的复仇者（Revenant／復讐者）。0.3.0 随包提供项目自制同人 Live2D，独立模型包附可编辑的 `.cmo3` 与 `.can3`。蓝白花冠、银蓝长发、球形手关节和浅色里拉琴用于保持她在桌宠尺寸下的辨识度。[造型参考](character/character-references.md) · [制作原稿](../art/revenant/) · [桌宠与独立模型包](BUILD_ARTIFACTS.md)

## 当前日漫模型

日漫版按人偶的身形重绘。肩部窄小，双脚从裙摆下露出，花冠和银色长发围住面部。人物与甲胄灵体的分层画稿由 ImageGen 生成，分别绑定至头部、眼周、衣裙、手腕和琴弦。灵体独立于头部、双眼睑、后发、裙身、手臂和琴，平时隐去。闭眼稿与睁眼稿各自保留完整分辨率。每只眼用自己的眼角和睫线位置绑定，眨眼时先收拢虹膜，闭合后才露出画好的睫线。首夜拨弦时脚下站稳，第二夜以手腕切换连音。不死行军从肩、肘到手腕独立带动两臂，张掌时切换手型，面具与嘴型跟随同一个头部网格。[分层画稿](../art/revenant/) · [动作关键帧](../scripts/character-rig/Motions.kt)

| 场景 | 动作数 | 表现 |
| --- | ---: | --- |
| 探索、待机 | 3 | 呼吸、转头和重心变化 |
| 轻触 | 2 | 点按响应 |
| 第一夜 | 4 | 单次拨击、回撤与防守 |
| 第二夜 | 4 | 带停顿的双拨和三连音 |
| 夜王战 | 5 | 后撤护琴、踏步扫弦与召唤 |
| 绝招 | 2 | 不死行军，俯身蓄势、仰身哀叹、波纹退去 |
| 胜利 | 2 | 结算时收琴行礼 |

同一场战斗按顺序换招，轻触和绝招结束后回到当前阶段。[桌宠动作预览](character/v0.3.4-motions.webp) · [运行时眼部对照](character/v0.3.3-face.png)

## 不死行军

复仇者拨里拉琴召唤家人，是她的角色技能。她的绝招「不死行军」（Immortal March）释放复仇的哀叹，在一段时间内保护自己和附近的同伴，也能救起濒死同伴，并强化已经在场的家人。[万代南梦宫角色介绍](https://en.bandainamcoent.eu/elden-ring/elden-ring-nightreign/characters/revenant)

实机片段里，她先屈膝俯身，双手收向脸前。约一秒半时，她突然挺起上身，周身亮起青白色灵光，脚下的暖色波纹向外扩开。桌宠按这三个拍点编排。仰身时，一侧瓷面揭开，露出怨灵眼窝；另一侧保留人偶的眼睛和肤色。随后手肘回落，小蜗收势接回战斗。动画播放时，课堂倒计时照常推进。[游戏实录](https://kamigame.jp/vls-kamigame-wiki.appspot.com/upload/transcoded/372687137163755662.mp4) · [游戏中揭开瓷面的观察记录](https://www.pcgamer.com/games/rpg/i-played-elden-ring-nightreign-for-goofy-co-op-shenanigans-but-wound-up-punched-in-my-feelings-by-the-revenants-remembrance-questline/) · [本版动作实录](character/v0.3.6-march.webp) · [渡夜时钟短局](character/v0.3.6-dial.webp)

## 动作编排参考

Live2D 的 Hiyori 示例里，头、上身和手臂各有自己的节奏。对照 `Hiyori_m02` 开头的关键帧，头的横向转动从约 0.63 秒开始，躯干随后启动，手臂到约 0.87 秒才离开原位。小蜗的找弦与拨弦也分开编排，视线先落到琴上，手肘给指尖留出接触琴弦的时间。[官方 Hiyori 动作数据](https://github.com/Live2D/CubismWebSamples/blob/5-r.5/Samples/Resources/Hiyori/motions/Hiyori_m02.motion3.json) · [Live2D 时间轴与曲线教程](https://docs.live2d.com/en/cubism-editor-tutorials/animator/)

动画师 Nathaniel Seymour 用头部与尾羽示范了动作传递和收势。小蜗用同一原则处理两种不同的材质：发梢随头部转向，衣摆随重心变化，放弦后的余振则留在琴弦上。绘制新动作时可以对照手势稿，检查发布效果时可以逐格看实机姿态页。[动画师示范](https://www.animationmentor.com/blog/tutorial-animate-overlap-and-follow-through/) · [拨琴手势稿](../art/revenant/lyre-acting-study.webp) · [实机动作姿态页](character/v0.3.4-poses.png)

## 查到的线索

| 来源 | 查到的内容 |
| --- | --- |
| 哔哩哔哩 | `复仇者`、`小蜗`、`达芙妮`、`人偶妹`搭配 `Live2D`、`模型`、`桌宠`。相关结果有实况、绘画过程和游戏内姿态 MOD。找到的模型制作相关关键词出现在播放者的个人简介里。绘画视频标明未经作者授权禁止转载。[绘画过程](https://www.bilibili.com/list/8530456?bvid=BV1e6sYzhE6n) · [姿态 MOD](https://www.bilibili.com/video/BV1fHeEzSEKy/) · [带有 Live2D 简介的实况](https://www.bilibili.com/video/BV1dU7DzYEKC/) |
| BOOTH、BowlRoll、nizima | 按 `ナイトレイン 復讐者`、`復讐者 Live2D モデル 配布` 检索。BOOTH 原站有相关同人商品，未找到对应 Cubism 模型。BowlRoll 和 nizima 的原站搜索部分入口无法访问，索引也未提供可验文件。[BOOTH 检索](https://booth.pm/ja/search/%E3%83%8A%E3%82%A4%E3%83%88%E3%83%AC%E3%82%A4%E3%83%B3%20%E5%BE%A9%E8%AE%90%E8%80%85) |
| Steam | Live2DViewerEX 工坊搜索 `Revenant`、`黑夜君临` 未找到该角色的模型。另一工坊相关合集说明壁纸使用 Hyperframe 基础视频。[Live2DViewerEX 工坊](https://steamcommunity.com/workshop/browse/?appid=616720&searchtext=Revenant) · [壁纸合集](https://steamcommunity.com/sharedfiles/filedetails/?id=3684688786&l=brazilian) |
| GitHub | `nightreign revenant` 对应计时脚本、静态角色介绍以及联机召唤修正。逐个检查名称和仓库内容，没有可核验的 `.moc3`。[计时脚本](https://github.com/NightsHigh/Elden_Ring_Nightreign_RevenantTimer) · [角色介绍页](https://github.com/KyuuHere/Revenant-ER) · [联机修正](https://github.com/RogoShum/RevenantFix) |
| Gumroad | Matai Reanui（Matairea Mare）的《Nightreign Revenant》是真实的复仇者二维骨骼，刊载为 Toon Boom Harmony 25 的 `NR_REVENANT_V01.tpl`。作者列出眼睛、瞳孔和嘴型替换、四肢 IK／FK、形变和头部控制器，公开条款仅标注非商业用途。未明确个人改造、另行导出或应用分发条款。商品可按 €0 获取，Gumroad 需要邮箱投递领取链接，因此未获取和检查文件内部。它适合后续评估导出或重绑，当前 Cubism SDK 无法直接加载。[作者发布](https://reanuimatai.gumroad.com/l/cwazw) · [Gumroad 获取流程](https://gumroad.com/help/article/282-how-do-purchases-work-for-my-customers) |
| Ko-fi 与 Shimeji 补查 | EverlastingEirwen 的 `Nightreign Revenant Asset` 标为免费 VTube Studio 素材，但作者清单实际是头纱前／后两张 PNG，不是角色 Cubism 模型。[作者商品页](https://ko-fi.com/s/686d6bf601)。TheKittleKat 的免费 `Revenant Shimeji` 明确属于 Apex Legends，同名但不是本项目的小蜗。[作者商品页](https://thekittlekat.gumroad.com/l/nGLQe) |
| 英文动画与模型 | 找到 Blender 低多边形动画、以复仇者为主角的独立粉丝游戏、静态图像生成权重。未发现对应 Cubism 导出或桌宠搭载条款。[Blender 作者发布](https://www.reddit.com/r/low_poly/comments/1lsil69) · [同人游戏作者主页](https://itch.io/profile/spagato) · [LoRA 项目](https://www.seaart.ai/th/models/detail/231defa484823fe2d54fe828c3611144) |

FromSoftware 官方 FAQ 允许一定范围内个人非营利展示同人创作，另外限制复用官方页面的图片、音频与视频。桌宠若要随安装包携带同人模型，需要核对模型作者授权和角色 IP 的对应使用范围。[FromSoftware 著作物 FAQ](https://www.fromsoftware.jp/ww/faq-other.html) · [官方站点条款](https://www.fromsoftware.jp/ww/policy_site.html)

## 运行时资源

| 项目 | 版本和来源 | 条款与路径 |
| --- | --- | --- |
| Cubism Web Framework | 官方 5-r.5，`198a3769c26ca3d7b600e932590433badd392edd`。用 esbuild 0.25.12 将适配器用到的模块打包为 ESM。[官方 Framework 发布](https://github.com/Live2D/CubismWebFramework/releases/tag/5-r.5) | `src/renderer/live2d/vendor/cubism-framework.js`。上游许可与手写接口类型同目录。[Live2D Open Software License](https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html) |
| Cubism Core | 同版官方 `CubismSdkForWeb-5-r.5.zip`，SHA-256 `67064a7fb1812cf502f5c4a03bfe12cc638c75a621bb4acf06bb28763df06ba0`。[官方 SDK 下载](https://www.live2d.com/en/sdk/download/web/) | `resources/character/cubism-core/live2dcubismcore.min.js`，SHA-256 `8741f739779b5d5210872bd3d7d99f0f1e56e6c87409e7d26d6bb4b80aa1ef47`。官方包将该文件列为有条件可再分发，随附原许可与清单。[Live2D Proprietary Software License](https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html) |
| WebGL 着色器 | 同版官方 SDK 的 `Framework/Shaders/WebGL`。[Framework 源码](https://github.com/Live2D/CubismWebFramework/tree/5-r.5/Shaders/WebGL) | `resources/character/cubism-shaders/`，随附 Framework 原许可 |
| 复仇者模型 | 项目自制并从 PSD2Live 导出。`resources/character/revenant/manifest.json` 状态为 `available`。 | [模型文件与署名](../resources/character/revenant/) · [制作工具来源](character/character-references.md) |
| 准备界面与回退图 | 准备界面显示与模型同源的 WebP。模型读取失败时，桌宠提供同源立绘和重试按钮。 | [图片及生成记录](../resources/character/preview/README.md) |

渲染器从受限的 `app://assets/character/` 本地路径加载 Core、着色器和模型。正式发行前需按实际发行主体和范围核对 Cubism 发布许可要求。[Cubism SDK 发布许可](https://www.live2d.com/en/sdk/license/)

## 替换角色模型

把已授权的 `.model3.json`、`.moc3`、贴图和实际用到的动作、表情、物理及姿势数据保留相对目录结构，放在 `resources/character/revenant/`。记录作者、原帖、版本、允许的用途及署名要求。确认画面与角色身份一致后，将清单设置为 `available`：

```json
{
  "version": 1,
  "status": "available",
  "model": "revenant.model3.json",
  "actions": {
    "idle": { "motion": { "group": "Idle", "index": 0 } },
    "touch": { "expression": "Surprised" }
  },
  "hitAreas": ["Head", "Body"]
}
```

上述动作组、表情和命中区是格式示例，实际名称取自模型文件。`actions` 支持 `idle`、`touch`、`battle`、`battle2`、`nightlord`、`ultimate`、`victory`，每一项可指定动作、表情或两者。设置 `motion.variants: true` 会从给定索引开始轮换该组内的动作。模型若提供眨眼参数组或标准的 `ParamBreath`，可在未提供待机动作时维持轻微待机。可选的 `hitAreas` 先限定命中区，`decorativeDrawables` 列出的灵光和扩散波只参与绘制。点按随后根据当前变形网格和贴图透明度判定，琴框、发丝与裙摆之间的透明空隙可以点透。`scale`、`offsetX`、`offsetY` 可调整模型大小和位置。

## SDK 初次接入的验证记录

在 Linux headless Chromium 用官方 SDK 随附的 Hiyori 示例验证了 WebGL 2 透明渲染、1.5 倍 DPR 画布、待机和轻触动画、指定命中区域与空白判定、隐藏时停用判定、WebGL 上下文主动丢失后自动重建及销毁。测试检查了未映射的绝招返回 `false`。补充用例覆盖隐藏时停止绘制、并发加载合并、清单 404 后重试、销毁时中止请求并抑制过期状态，以及拦截携带编码分隔符的相对路径。两张画面仅用于验证 SDK，示例资源未进入产品资源。[官方示例仓库](https://github.com/Live2D/CubismWebSamples/tree/5-r.5)

使用项目实际的 `app://assets` 读取协议、启用沙箱的 Electron 本地渲染窗口，在 Linux／Xvfb 下验证了 Hiyori 的透明绘制和触摸动画。Chromium 对比图和 Electron 页面截图保存在本地 `test-results/character-cubism-*.png`，未随应用打包。

0.2.0 的成品复仇者已用官方 Core 验证二进制一致性，并在实际 Electron 窗口完成五组动作、透明空隙命中、隐藏与暂停、资源故障后的重试测试。[成品专项报告](character/model-verification.md) · [桌面验收用例](../tests/desktop/character.spec.ts)
