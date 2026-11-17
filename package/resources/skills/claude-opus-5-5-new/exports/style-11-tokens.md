# 风格令牌 · Editorial Essay Collage（#11）

> 由 `scripts/style-tokens.cjs` 从 `011-editorial-essay-collage` 提取。用途：把该风格的视觉骨架移植到其他视频管线（web-video-presentation 主题 / Remotion 样式 / 网页）。
> 注意：这里只提取可复用的“令牌”，不搬动画代码；动效请参考 `explainer.mp4` 与 `reference/` 源码。

## 定位

- **风格家族**：Popular Explainer Looks
- **画面描述**：The editorial "animated essay" collage: warm grainy paper, archival halftone prints with torn white borders and soft shadows, newspaper clippings in serif type with a translucent yellow highlighter sweep, masking tape, flat colour blocks and big cut-out condensed headlines.
- **讲解手法**：Explainer: Scenes are joined by fast blurred camera whips that hide the cut, plus a new paper sheet slid up on steps; arrows are thin ink route lines and red marker, numbers are re-cut condensed numerals on paper strips, and the emphasis is the yellow highlighter sweep (plus a red marker ring and cross on the wrong guess).
- **动效要点**：Motion: Cutouts drop and slide in on 12 fps hand-animated steps while the camera pushes smoothly through parallax layers; the highlighter sweeps left to right and a red marker rings the key detail.
- **画布**：1280×720
- **参考片长**：12–30 秒

## 色板（按使用频次）

| 角色 | 色值 | 出现次数 | 源码语境 |
|---|---|---|---|
| 主色/背景候选 | `#f3efe5` | 3 | — |
| p2 | `#2a2622` | 2 | — |
| p3 | `#f3ecdc` | 1 | — |
| p4 | `#c9a878` | 1 | — |
| p5 | `#f0e9d9` | 1 | — |
| p6 | `#1a1816` | 1 | — |
| p7 | `#b8483a` | 1 | — |
| p8 | `#f5f1e7` | 1 | — |
| p9 | `#e9e1cb` | 1 | — |
| p10 | `#fff` | 1 | — |
| p11 | `#f8f5ee` | 1 | — |
| p12 | `#dfe0d6` | 1 | — |

**建议语义映射**

- 背景 `#f3efe5`（出现最多） / 文本 `#1a1816`（与背景对比最强）
- 强调色：`#b8483a`、`#f3ecdc`、`#f0e9d9`、`#c9a878`

## 字体

- `Anton`
- `Libre Baskerville`
- `Oswald`

Google Fonts 引入：

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Oswald:wght@400;700&display=block">
```

## CSS 变量（可直接粘进主题）

```css
:root {
  --bg: #f3efe5;
  --text: #1a1816;
  --accent-1: #b8483a;
  --accent-2: #f3ecdc;
  --accent-3: #f0e9d9;
  --accent-4: #c9a878;
  --font-display: 'Anton';
  --font-body: 'Libre Baskerville';
}
```

## 移植提示

1. **web-video-presentation**：把上面的 CSS 变量放进 `presentation/src/styles/tokens.css`，章节组件只用变量、不写死颜色；动效气质参考“动效要点”。
2. **Remotion**：把色板放进 `src/style.css` 的 `:root`，字体用 `@remotion/google-fonts` 引入同名族；转场/节奏参考 `explainer.mp4`。
3. 只用令牌、不搬 Canvas 代码——两者的绘制模型不同。

---

*源目录：`assets/atlas/styles/011-editorial-essay-collage`*
