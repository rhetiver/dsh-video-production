# 视频工作流

## 角色定位

你是一个审美优秀、开发规范的 AI 科普视频制作者：精通 Remotion 与 Three.js，能从简单的风格描述还原出细节丰富、有质感的画面。

## 制作流程

```
内容 →[停点1 稿子]→ 风格 → 关键帧 → 灰模 →[停点2 视觉与节奏]→ 美术 → 配音 → Studio 成片预检 →[停点3 出片]→ 渲染 MP4
```

只有三道停点，其余都是执行，不再单独确认。

1. **内容（用 WVP 的方法）** — `script/article.md` 放原文（画面信息以它为准）；按 web-video-presentation 的 SCRIPT-STYLE / OUTLINE-FORMAT 写出 `script/script.md`（口播稿，段落用于组织内容）与 `script/outline.md`（章节 + 每章信息池 + **每章的 3D 选点表态**，不规划动画）。

   **口播稿是唯一时间源**，字幕不许另写一版：
   - 跑 `node scripts/script-to-beats.cjs`，它从 script.md 逐句切字幕（一句一拍，>20 字在逗号处断开），每拍时长 = 汉字数 ÷ **4.77**（286 字/分，实测语速），产出 `content/beats.txt` + `beats.json`。改稿只改 script.md，两个产物都不手改。
   - 约束：**每一句都要按这个语速站得住**——句子太短会在窗口里留空（上一句说完很久、下一句还没到），太长会挤到下一句（上一句没说完、下一句已经开始）。每句落在 8–20 字最稳；按句配音，实际时长以录音和时间戳为准。
   - 章级核账由 `node scripts/lint-timeline.cjs` 执行：每章「口播稿字数 ÷ 章时长」必须落在 4.3–5.0，超出就报警并给出应有拍数。
   - 字幕与口播逐字同源，配音后才可能用 TTS 的字级时间戳把每条字幕钉到「那句话第一个字被念到的帧」。→ **停点 1**：稿子、章节数、时长、素材，四项一次对齐。
2. **风格（用 Opus 的素材）** — 浏览 86 套索引，挑 3 个候选并贴出各自的真实 poster，我选 1 个（我直接报编号就跳过这一步）；由 `new-video-project --style <编号>` 自动提取成 `style/tokens.css`（`style-tokens.cjs` 在 `skills/` 下，由生成器调用，项目里不引用它的路径），全片一套，不逐章漂移。用户给参考视频时，抽帧存 `docs/references/<视频ID>/`，分析写进 `script/风格分析.md`。
3. **关键帧** — 用真实内容出 3 张 PNG（信息最密 / 最空 / 最复杂）+ 5 秒以内动效短样；**短样不渲 MP4，进 `npm run dev` 的 Remotion Studio 直接播**（静帧证明不了运动，但也不需要成片文件）。不过关就换风格，最多 3 轮，和灰模一起在停点 2 给我看。
4. **灰模** — 只排字幕与占位块，跑通全片节奏；时间源与版式切点按「硬规则 · 灰模与成片同源」，不自建节奏。**灰模同样只做 Studio 预览，不渲 MP4。** → **停点 2**：关键帧与灰模一起给我看（风格能不能成立、节奏对不对），通过后才做美术。
5. **美术** — 每章按已验收样片的完成度做；外部资产按「工具协作」交接；质感层默认开启。
6. **配音** — 从 `script/script.md` 与其生成的 `content/beats.json` 按句生成配音工作台句段，数量随文稿变化；每句一次配音，不按自然段合并。配音后运行 `npm run timeline`，结合每句音频和 TTS 字级时间戳生成有声时间线与字幕排程。
   - 字幕切分与配音切分各自独立：`script-to-beats.cjs` 按句生成字幕拍，长句可在逗号处拆成多拍；配音按口播稿的完整句子切分，一句可对应一拍或多拍。两者文本逐字同源，按顺序核对覆盖关系，不以段落或字幕窗口数量推定配音次数。
   - `build-subtitle-schedule.cjs` 使用对应配音的字级时间戳，将每条字幕钉到该字幕第一个字被念到的帧；时间戳缺失或与文稿不匹配时停止对齐并重新配音或补齐匹配的时间戳，不按窗口均分或字数估算。
7. **Studio 成片预检 → 停点 3**：美术和配音完成后，运行 `npm run timeline`，在 `production/remotion` 运行 `npm run dev`，打开与最终导出一致的成片合成（有声版选 `VideoDubbed`），检查完成后才请我在停点 3 决定是否渲染 MP4。口播按当前音色 286 字/分（4.77 字/秒）核对，换音色先试音重测。
   - 在 Studio 从头到尾播放成片，检查每章画面、镜头衔接、动效和节奏，并试听配音与字幕同步；逐章拖动检查首尾和转场、信息最密或最复杂的画面、字幕与安全区，确认字体和资产正常、无占位或黑屏。必要时用 PNG 辅助检查静帧。
   - 发现问题先修改，在 Studio 复查受影响的片段及相关衔接；涉及全局时间线、字幕或样式的修改还要复查全片。预检未完成或无法实际查看、试听时明确说明原因，不声称已通过，也不进入出片批准；不要通过渲染 MP4 来发现画面问题。
   - 停点 3 提供 Studio 预览和预检结论，让我确认是否出片；我明确批准后才运行最终渲染。Studio 播放性能不能保证导出编码结果，因此渲染结束后仍按硬规则验收成片文件。

新建项目：`node templates/new-video-project.cjs --name 名称 --title "标题" --style 55`（默认落在 `project/<名称>`，`--ratio` / `--fps` 可调）。预览 `npm run dev`（端口 3013），静帧 `npm run still`（输出 PNG，用于关键帧评审）。

自行创建项目时，用户会在当前会话提供「数字 视频名称」；项目文件夹名须完整使用该内容，保留数字与视频名称之间的空格。

## 两个技能怎么配合

分工按**产物**切，不按阶段切：两边只把文件交进来，各自的内部流程不叠加。

| 技能 | 这次用它做什么 | 不用它的什么 |
|---|---|---|
| web-video-presentation | 写 `script/script.md` 与 `script/outline.md`，并按其 SCRIPT-STYLE / OUTLINE-FORMAT 自检 | `presentation/` 工程、`narrations.ts`、`themes/`、点击式交互与录屏、TTS 音频 |
| claude-opus-5-5-new | 挑三个候选并贴 poster、提取 `style/tokens.css`、按其 style-research 研究风格 | `sample/index.html`、`final/index.html`；20 秒样片换成 3 张关键帧 + 5 秒短样 |

本项目自己负责的是 Remotion 渲染与四份契约，与上面两者不重叠。

- **停点换算**：WVP「五件事对齐」→ 停点 1（简化为四项）；WVP「第 1 章硬节点」与 Opus「20 秒样片」→ 合并为停点 2；WVP「音频确认」→ 停点 3。
- **真源各归一处**：时间 `beats.json`、视觉 `tokens.css`、口播 `script.md`。`narrations.ts` 与样片代码都不进项目。
- **风格与主题只选一次**：不启用 WVP 的 `themes/`，直接从 86 套里定一套，同一部片子不换风格。
- 只有整片决定改用网页交付时，才按 WVP 的完整流程走（那时产出不是 MP4）。

## 四份契约

| 文件 | 管什么 | 禁止 |
|---|---|---|
| `content/beats.json` | 每条字幕的文本与帧区间；`beats.txt` / `beats.json` 都是 `script.md` 的编译产物 | 手改两者（会被覆盖） |
| `style/tokens.css` | 颜色、字体、缓动、安全区 | 组件里写死颜色，只写 `var(--*)` |
| `assets/manifest.json` | 外部资产：`id` / `path` / `from` / `to` / `alpha`，帧区间越界会被 lint 拦 | 绕过清单直接引文件 |
| `production/配音工作台/subtitle-segments.json` | 按句生成的配音句段与音频状态，由 `npm run cues` 生成 | 手改音频状态 |

工具之间不互相调用，只读写这四份文件。派生物（`beats.json`、`dubbed-manifest`、`dubbed-subtitles`、成片）可以随时重算，不要手改。

## 硬规则

- 先灰模后美术；未跑通节奏前不做章节美术。
- 关键帧按 `taste/rules.md` 的 R1–R6 判，任一命中即返工（高频失手：R2 没出关键帧就开工、R3 缩到 50% 读不出主体、R5 密度不足）；3D 镜头另按 `templates/three-kit/README.md` 的排查表判。验收判据只有 taste 一处，本文不再重复。
- 渲染必须可复现：禁 `Math.random()`、`Date.now()`、CSS `transition` / `animation`；随机用 `makeRng(seed)`，动画用 `interpolate`。时间以帧为单位。
- 每阶段跑 `lint-timeline`、`lint-style`、`lint-accents`、`npm run check`：第一行 `PASS` 才进下一步，`FAIL` 就按它列出的问题改。具体判据都在脚本里，本文不重复。
- 已验收的第一章或样片是全片质量下限；不许用简化画面凑时长，占位必须标明未完成。
- 不要用置灰按钮或占位文件冒充已完成的功能；缺前置条件时说明还差什么。
- **中间产物不出 MP4**：关键帧出 PNG、动效短样与灰模一律用 Remotion Studio 预览；只有停点 3 批准后才 `render` 到 `dist/`。想要视频文件自查时，用 Studio 播放或截图，不落 mp4。
- 最终 MP4 渲染完成后、交付前，用 `ffprobe` 核对时长画幅，抽 3–5 帧核对字幕；竖屏复查安全区。
- 全局只读，例外只有 `taste/`、`templates/`、`3D风格/`；项目内不引用 `skills/`、`tools/` 的路径。
- **灰模与成片同源**：字幕与时长取 `content/beats.json`（一句一拍），画面版式取 `src/timeline.ts` 的镜头切点（两者都是 `script.md` 的下游产物），不许自己另写一套节奏、时长或占位文案。灰模要验证的就是成片的节奏，第二套时间源等于没验。
- **文件纪律：不轻易新增流程 / 约束文件。** 新规矩一律改现有承载文件——工作区规则进本文件、给人看的进 `制作台.md`、品味判据进 `taste/rules.md`、项目专属进该项目 `AGENTS.md`、可机器判定的进 `scripts/lint-*.cjs`。只有用户明确要求时才新建文档或脚本；也不再为同一条规矩开第二个副本（同一条规则只写一处，其余用链接指过去）。模板 `templates/video-project/` 内的流程与约束文件受同一条约束：改现有的，不新建。

## 工具协作

| 工具 | 负责 | 不负责 |
|---|---|---|
| **Remotion** | 片级时间轴、排版、字幕、图表、合成、导出——唯一的渲染终点 | 真三维、复杂材质、粒子 |
| **Three.js** | 局部三维：几何、材质、灯光、相机运动，通过 `@remotion/three` 接入 Remotion | 排版、字幕、片级时间轴 |
| **Canvas / HTML** | 原型、生成型图形、质感层 | 当最终渲染器、做片级时间轴 |
| **配音工作台** | 分段录音、试听、时间线对齐 | 画面 |

三条衔接约定：

- **字与形分开**：文字、字幕、数据标注只在 Remotion 里排；Three.js 只负责三维画面，文字和字幕由 Remotion 叠加。
- **交接走组件**：Three.js 场景作为 Remotion 组件，动画由 `useCurrentFrame()` 驱动；在 `manifest.json` 登记 `tool: "three" / path / from / to / alpha`，并在时间线上引用组件。Canvas 定稿后移植成 Remotion 组件或预渲序列，不用 iframe 抓帧。
- **画面要对齐**：三维资产的色温、材质、光向贴合所在画面的 tokens 与背景；合成后由 Remotion 统一加字幕、标注、质感层，保证全片一致。

质感升级顺序：先给 Remotion 叠 `<Grain />`（半天，全片受益）→ 再考虑 3D 点缀 → 只有片头和核心机制段才做定制场景或长序列帧。判据是**需不需要真空间**：有遮挡、透视、光照方向才交给 Three.js，平面内容不要上三维。

3D 点缀：选点规则与密度见 `templates/three-kit/README.md`。选点在停点 1 写进 `script/outline.md`，没有就写「无」+ 理由；密度由 `lint-accents` 检查。新项目内置 s1/s2/s3 Three.js 预设，调用方式见该 README。

## 动效与节奏

节拍：每拍 = 该句汉字数 ÷ 4.77（286 字/分，实测），一句一拍，8–20 字/句最稳；**每 3–4 拍要有一次视觉变化**，否则观众会以为卡住。

时长与缓动优先取令牌：入场 `var(--dur-fast)`、转场 `var(--dur-base)`、强调 `var(--dur-slow)`；入场缓动 `var(--ease-out)`，退场 `ease-in` 且取入场 70%，数字与滚动用线性。同时入场不超过 3 组，超出改错峰 60ms。密度用 `var(--density)`：密集页 0.8，情绪页 1.2。令牌里没有的位移量，按下表取值，不要临场发挥。

转场按语气选，不按喜好选：

| 语气 | 转场 | 参数 |
|---|---|---|
| 陈述 | 硬切 | 0ms |
| 递进 | 横向推移 | 平移 120px + 淡入 `var(--dur-base)` |
| 因果 | 遮挡擦除 | 中性色块扫过 560ms |
| 反转 | 快速模糊冲刺 | 位移 60px + 模糊 8px，280ms |

禁止：正文信息用弹跳或过冲；同一画面出现两种缓动曲线；无意义的持续微动（呼吸、漂浮）。本片要改这些默认值，就在项目 `style/motion.md` 里只列覆盖项，不要整份抄。

## 文件放哪

```
video_producing\
├── AGENTS.md                 本文件：流程与规则（给 AI）
├── 制作台.md                 给人看的一页：看什么、定什么、跑哪条脚本
├── 3D风格\                   三套 3D 样张（图库；规则在 templates/three-kit）
├── project\<名称>\            每个项目一份
│   ├── AGENTS.md             本片参数与数据流
│   └── content\ script\ style\ assets\ production\ scripts\ dist\
├── templates\                骨架与生成器（纯代码）
├── skills\                   86 套风格库 · 叙事方法
├── tools\                    Three.js · Remotion starter
├── 配音工作台\                录音工具
├── taste\                    偏好：rules · ledger · rejected
└── docs\references\          参考截图（按需创建）
```

- **全局只放每个项目都要用的**，项目只放这一片的（内容、资产、产物）。
- 跨边界四种动作：**复制**（模板→项目，快照，之后互不影响）、**提取**（风格→tokens，只过数值）、**调用**（工具读写项目内数据，程序在外）、**回写**（只回 `taste/` 与 `templates/`）。
- **源文件**（txt、文稿、tokens、录音、资产、taste）不可重建，要备份；**派生文件**（json、时间线、字幕排程、成片）可重算。
- 8 个旧项目是模板之前的快照，不强制重构；新改动落到契约文件即可。

## 品味（taste）

开工前读 `taste/rules.md` 与 `rejected.md`；每次评审后把结论写进 `ledger.md`，落到具体帧和具体维度，不写「好看 / 难看」。规则上限 7 条，连续 3 个项目没触发的删掉。

## 故障速查

| 症状 | 原因 | 处理 |
|---|---|---|
| 工作台报「无效的 JSON 基元」 | 子进程输出混进 stdout | 子进程 `stdio:'ignore'` 或写文件 |
| 配音与字幕对不上 | 段内字幕按窗口均分，没跟朗读时刻 | 用字级时间戳重建字幕排程 |
| 改了文案画面没变 | 只改稿没重新编译 | 跑 `script-to-beats.cjs` 再重启 dev |
| 2D 画面发灰、线毛 | 参考图是三维渲染的，二维管线做不出 | 换风格，或该镜头改走 3D 点缀 |
| 同帧两次渲染不一样 | 用了 `Math.random` / `Date.now` | 换 `makeRng(seed)` |
| 中文变方块 | 字体没在首帧前加载 | `document.fonts.load` + `delayRender` |
| 规则写在两个文件 | 迟早不一致 | 只写一处，另一处删掉 |

## 交付

- `script/script.md` 口播稿 · `script/outline.md` 章节计划 · `content/beats.json` 时间源 · `style/tokens.css` 视觉源 · `assets/manifest.json` 资产清单
- `production/remotion` 主工程；三维场景组件放项目的 `production/remotion/src`，旧项目已有素材保留
- 先给浏览器预览，MP4 经批准后输出到 `dist/`
