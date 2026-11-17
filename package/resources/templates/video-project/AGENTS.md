# {{TITLE}} · 项目约定

只写这一片才有的事；流程、规则、契约在 `../../AGENTS.md`。

**本文件是本项目流程与约束的唯一入口。** 新增规矩改这里，不新建文档、不建第二个副本；只有用户明确要求才加文件（`../../AGENTS.md` 的「文件纪律」对模板同样生效）。

| 项 | 值 |
|---|---|
| 标题 | {{TITLE}} |
| 画幅 / 帧率 | {{W}}×{{H}} / {{FPS}}fps |
| 主风格 | {{STYLE}} |
| 建立日期 | {{DATE}} |
| 模板来源 | {{TEMPLATE_REVISION}}（+dirty 表示模板含未提交修改，版本号不能完整标识其内容） |

- 画幅与帧率以 `content/beats.json` 的 `canvas` / `fps` 为准，由生成器写入，不手改。
- **时间源 = `script/script.md`**：跑 `node scripts/script-to-beats.cjs` 逐句切字幕（一句一拍，>20 字在逗号处断），每拍 = 汉字数 ÷ 4.77。`content/beats.txt` 与 `beats.json` 都是产物，不手改。
- **字幕逐字取自口播稿**，禁止另写凝练版——两套文案会让配音与字幕无法逐字对位。
- 有声字幕必须有与文本匹配的字级时间戳；缺失或不匹配时重新配音，不按字数推算切点。
- **每句要按 4.77 站得住**：太短会留空（上句说完很久、下句还没到），太长会挤压下句；每句 8–20 字、一段 20–45 字最稳。
- 质感层 `Grain` 默认开启（opacity 0.07），不要就删 `scene.tsx` 里那一行。
- 其余只属于这一片的限制写在这里（客户禁区、素材来源、审批状态），通用规则不要抄。

## 3D 点缀

- 选点写进 script/outline.md，先运行 node scripts/plan-accents.cjs。
- Three.js 场景使用 @remotion/three 的 ThreeCanvas，动画由 useCurrentFrame() 驱动；文字和字幕由 Remotion 排版。
- 在 assets/manifest.json 登记 {id, tool: "three", path, from, to, alpha}，path 指向项目内场景组件。还须在 Remotion 时间线上引用组件；清单不会自动加载组件。运行 node scripts/lint-accents.cjs 检查区间和密度。
- 三套 Three.js 预设随项目放在 `production/remotion/src/components/ThreePreset.tsx`；调用和参数见 `scripts/three-kit/README.md`。新镜头先出关键帧和短样。
