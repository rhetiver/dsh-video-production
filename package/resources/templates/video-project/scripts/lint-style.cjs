#!/usr/bin/env node
// 风格体检：颜色只能来自 style/tokens.css；渲染代码禁止随机数与当前时间。
// 用法：node scripts/lint-style.cjs
const fs = require('node:fs');
const path = require('node:path');

const _i = process.argv.indexOf('--root');
const ROOT = path.resolve(_i >= 0 ? process.argv[_i + 1] : path.join(__dirname, '..'));
const tokensPath = path.join(ROOT, 'style', 'tokens.css');
const srcDir = path.join(ROOT, 'production', 'remotion', 'src');

if (!fs.existsSync(tokensPath)) { console.error('缺少 style/tokens.css'); process.exit(1); }
const tokensSrc = fs.readFileSync(tokensPath, 'utf8');
const allowed = new Set((tokensSrc.match(/#[0-9a-fA-F]{3,8}\b/g) || []).map(c => c.toLowerCase()));

const files = [];
const walk = dir => {
  if (!fs.existsSync(dir)) return;
  for (const n of fs.readdirSync(dir)) {
    const f = path.join(dir, n);
    const st = fs.statSync(f);
    if (st.isDirectory()) walk(f);
    else if (/\.(tsx?|css)$/i.test(n)) files.push(f);
  }
};
walk(srcDir);

const errors = [], warnings = [];
// 注释里出现 Math.random 只是说明文字，不算违规；先剥注释再判断
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
for (const f of files) {
  const src = stripComments(fs.readFileSync(f, 'utf8'));
  const rel = path.relative(ROOT, f);
  for (const m of src.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
    const hex = m[0].toLowerCase();
    if (!allowed.has(hex)) {
      const line = src.slice(0, m.index).split('\n').length;
      warnings.push(`${rel}:${line} 硬编码颜色 ${hex}，应改用 var(--*)`);
    }
  }
  if (/Math\.random\s*\(/.test(src)) errors.push(`${rel} 使用了 Math.random（渲染不确定）`);
  if (/Date\.now\s*\(/.test(src)) errors.push(`${rel} 使用了 Date.now（渲染不确定）`);
  if (/(transition|animation)\s*:/.test(src)) warnings.push(`${rel} 使用 CSS transition/animation，Remotion 中请改用 interpolate`);
}

const result = { files: files.length, tokenColors: allowed.size, errors, warnings };
const verdict = errors.length
  ? `FAIL ${errors.length} 项`
  : (warnings.length ? `PASS（${warnings.length} 条提醒）` : 'PASS');
console.log(verdict);
console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exitCode = 1;
