#!/usr/bin/env node
// 把某个 Opus 5.5 风格提取成可复用的主题令牌（theme tokens）。
// 用法：node scripts/style-tokens.cjs --id 11 [--out <目录>]
// 输出：<out>/style-<id>-tokens.md（默认写到仓库 exports/ 下）
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const id = Number(arg('--id', 0));
if (!id) { console.error('用法: node scripts/style-tokens.cjs --id <编号> [--out <目录>]'); process.exit(1); }

const root = path.resolve(__dirname, '..');
const stylesDir = path.join(root, 'assets', 'atlas', 'styles');
const dir = fs.readdirSync(stylesDir).find(n => n.startsWith(String(id).padStart(3, '0') + '-'));
if (!dir) { console.error('找不到风格编号', id); process.exit(1); }
const styleDir = path.join(stylesDir, dir);
const meta = JSON.parse(fs.readFileSync(path.join(styleDir, 'style.json'), 'utf8'));
const prompt = fs.readFileSync(path.join(styleDir, 'prompt.txt'), 'utf8');

// 递归收集参考源码
const files = [];
const walk = p => { for (const n of fs.readdirSync(p)) { const f = path.join(p, n); const st = fs.statSync(f); if (st.isDirectory()) walk(f); else if (/\.(html?|css|js|mjs)$/i.test(n)) files.push(f); } };
walk(path.join(styleDir, 'reference'));

// 颜色：统计 hex 频次，保留出现语境（css 变量名 / 属性名）
const colorCount = new Map(), colorCtx = new Map();
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})\b/g)) {
    const hex = m[1].toLowerCase();
    colorCount.set(hex, (colorCount.get(hex) || 0) + 1);
    if (!colorCtx.has(hex)) {
      const start = Math.max(0, m.index - 48), ctx = src.slice(start, m.index + 8).replace(/\s+/g, ' ');
      const varName = /--([\w-]+)\s*:\s*$/.exec(ctx);
      const prop = /([\w-]+)\s*:\s*$/.exec(ctx);
      if (varName) colorCtx.set(hex, '--' + varName[1]);
      else if (prop) colorCtx.set(hex, prop[1]);
    }
  }
}
const palette = [...colorCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
  .map(([hex, n]) => ({ hex, n, ctx: colorCtx.get(hex) || '' }));

// 字体：优先取 prompt 里的 Google Fonts 声明
const fontLine = /Load these Google Fonts[^)]*?:\s*([^<\n]+)/.exec(prompt);
const fontQuery = /fonts\.googleapis\.com\/css2\?([^"\s<]+)/.exec(prompt);
const families = [];
if (fontQuery) for (const seg of fontQuery[1].split('&')) if (seg.startsWith('family=')) families.push(decodeURIComponent(seg.slice(7).split(':')[0]).replace(/\+/g,' '));
const fonts = families.length ? families : (fontLine ? fontLine[1].split(/[,、]/).map(s => s.trim()).filter(Boolean) : []);

// 画布/时长提示
const dims = /(\d{3,4})\s*[x×]\s*(\d{3,4})/.exec(prompt);
const duration = /(\d+)\s*[-–]\s*(\d+)\s*秒|(\d+)\s*[-–]\s*(\d+)\s*seconds/i.exec(prompt);

const hexToRgb = h => { const s = h.length === 4 ? '#' + [...h.slice(1)].map(c => c + c).join('') : h; return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]; };
const lum = h => { const [r, g, b] = hexToRgb(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
const bg = palette[0];
const contrast = c => Math.abs(lum(c) - lum(bg.hex));
const text = [...palette].sort((a, b) => contrast(b.hex) - contrast(a.hex))[0];
const sat = h => { const [r, g, b] = hexToRgb(h).map(v => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === mn ? 0 : (mx - mn) / (1 - Math.abs(mx + mn - 1)); };
const accents = [...palette].filter(p => p !== bg && p !== text).sort((a, b) => sat(b.hex) - sat(a.hex)).slice(0, 4);

const outDir = path.resolve(arg('--out', path.join(root, 'exports')));
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `style-${String(id).padStart(2, '0')}-tokens.md`);
const cssVars = [
  `--bg: ${bg.hex};`, `--text: ${text.hex};`,
  ...accents.map((c, i) => `--accent-${i + 1}: ${c.hex};`)
].join('\n  ');

const md = `# 风格令牌 · ${meta.name}（#${meta.id}）

> 由 \`scripts/style-tokens.cjs\` 从 \`${dir}\` 提取。用途：把该风格的视觉骨架移植到其他视频管线（web-video-presentation 主题 / Remotion 样式 / 网页）。
> 注意：这里只提取可复用的“令牌”，不搬动画代码；动效请参考 \`explainer.mp4\` 与 \`reference/\` 源码。

## 定位

- **风格家族**：${meta.family}
- **画面描述**：${meta.description}
- **讲解手法**：${meta.explainerNotes || '—'}
- **动效要点**：${meta.motionNotes || '—'}
- **画布**：${dims ? dims[1] + '×' + dims[2] : '以 reference 为准'}
- **参考片长**：${duration ? (duration[1] || duration[3]) + '–' + (duration[2] || duration[4]) + ' 秒' : '见 DURATION 常量'}

## 色板（按使用频次）

| 角色 | 色值 | 出现次数 | 源码语境 |
|---|---|---|---|
${palette.map((p, i) => `| ${i === 0 ? '主色/背景候选' : 'p' + (i + 1)} | \`${p.hex}\` | ${p.n} | ${p.ctx || '—'} |`).join('\n')}

**建议语义映射**

- 背景 \`${bg.hex}\`（出现最多） / 文本 \`${text.hex}\`（与背景对比最强）
- 强调色：${accents.map(a => '`' + a.hex + '`').join('、') || '—'}

## 字体

${fonts.length ? fonts.map(f => '- `' + f + '`').join('\n') : '- （提示词未声明 Web 字体，见 prompt.txt）'}

${fontQuery ? `Google Fonts 引入：\n\n\`\`\`html\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${fontQuery[1].replace(/&display=block/,"")}&display=block">\n\`\`\`` : ''}

## CSS 变量（可直接粘进主题）

\`\`\`css
:root {
  ${cssVars}
  --font-display: ${fonts[0] ? `'${fonts[0]}'` : 'inherit'};
  --font-body: ${fonts[1] ? `'${fonts[1]}'` : fonts[0] ? `'${fonts[0]}'` : 'inherit'};
}
\`\`\`

## 移植提示

1. **web-video-presentation**：把上面的 CSS 变量放进 \`presentation/src/styles/tokens.css\`，章节组件只用变量、不写死颜色；动效气质参考“动效要点”。
2. **Remotion**：把色板放进 \`src/style.css\` 的 \`:root\`，字体用 \`@remotion/google-fonts\` 引入同名族；转场/节奏参考 \`explainer.mp4\`。
3. 只用令牌、不搬 Canvas 代码——两者的绘制模型不同。

---

*源目录：\`assets/atlas/styles/${dir}\`*
`;
fs.writeFileSync(out, md, 'utf8');
console.log(JSON.stringify({ out, style: meta.name, colors: palette.length, fonts }));
