# 风格令牌 · ISOTYPE Pictograms（#55）

> 由 `scripts/style-tokens.cjs` 从 `055-isotype-pictograms` 提取。用途：把该风格的视觉骨架移植到其他视频管线（web-video-presentation 主题 / Remotion 样式 / 网页）。
> 注意：这里只提取可复用的“令牌”，不搬动画代码；动效请参考 `explainer.mp4` 与 `reference/` 源码。

## 定位

- **风格家族**：Data & Information
- **画面描述**：Vienna Method pictorial statistics: rows of identical flat pictograms where each symbol is a fixed quantity, partial symbols for remainders, three muted litho inks on a strict grid with geometric sans lettering.
- **讲解手法**：Explainer: A Vienna-Method picture-statistic told across one long chart sheet the camera pans along: symbols are stamped in stepped 12 fps timing, flat Isotype arrows show flow, numerals are stamped and re-stamped, and accuracy is counted in rows of tick symbols with partial symbols for fractions.
- **动效要点**：Motion: Title and key set first, the year column drops in, then symbols are stamped out row by row from the centre in stepped, rubber-stamp timing, the 2025 row of machines racing ahead; the litho paper breathes in the hold.
- **画布**：1280×720
- **参考片长**：12–30 秒

## 色板（按使用频次）

| 角色 | 色值 | 出现次数 | 源码语境 |
|---|---|---|---|
| 主色/背景候选 | `#f3ecdc` | 1 | — |
| p2 | `#efe7d4` | 1 | — |
| p3 | `#26231f` | 1 | — |
| p4 | `#294c63` | 1 | — |
| p5 | `#c2432c` | 1 | — |
| p6 | `#d49a33` | 1 | — |
| p7 | `#000` | 1 | — |

**建议语义映射**

- 背景 `#f3ecdc`（出现最多） / 文本 `#000`（与背景对比最强）
- 强调色：`#d49a33`、`#c2432c`、`#efe7d4`、`#294c63`

## 字体

- `Space Grotesk`

Google Fonts 引入：

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;700&display=block">
```

## CSS 变量（可直接粘进主题）

```css
:root {
  --bg: #f3ecdc;
  --text: #000;
  --accent-1: #d49a33;
  --accent-2: #c2432c;
  --accent-3: #efe7d4;
  --accent-4: #294c63;
  --font-display: 'Space Grotesk';
  --font-body: 'Space Grotesk';
}
```

## 移植提示

1. **web-video-presentation**：把上面的 CSS 变量放进 `presentation/src/styles/tokens.css`，章节组件只用变量、不写死颜色；动效气质参考“动效要点”。
2. **Remotion**：把色板放进 `src/style.css` 的 `:root`，字体用 `@remotion/google-fonts` 引入同名族；转场/节奏参考 `explainer.mp4`。
3. 只用令牌、不搬 Canvas 代码——两者的绘制模型不同。

---

*源目录：`assets/atlas/styles/055-isotype-pictograms`*
