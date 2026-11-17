#!/usr/bin/env node
// 3D 点缀体检：密度、时长、间隔、占比、帧数、海报。
//   node scripts/lint-accents.cjs
//   node scripts/lint-accents.cjs --root ../某项目
// error 只给「必然出问题」的（帧数对不上、区间非法）；密度这类是 warn，别挡流程。
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(val('--root', path.join(__dirname, '..')));

const beatsPath = path.join(ROOT, 'content', 'beats.json');
const manifestPath = path.join(ROOT, 'assets', 'manifest.json');
if (!fs.existsSync(beatsPath)) { console.error('缺少 content/beats.json'); process.exit(1); }

const data = JSON.parse(fs.readFileSync(beatsPath, 'utf8'));
const fps = Number(data.fps || 30);
const beats = data.beats || [];
const total = beats.length ? beats[beats.length - 1].endFrame : 0;
const totalSec = total / fps;

const items = fs.existsSync(manifestPath)
  ? (JSON.parse(fs.readFileSync(manifestPath, 'utf8')).items || []).filter(it => it.tool === 'three')
  : [];

const errors = [];
const warnings = [];
const list = [];

for (const it of items) {
  if (it.from == null || it.to == null) { errors.push(`资产 ${it.id} 缺少 from/to`); continue; }
  if (it.from < 0 || it.to > total) errors.push(`资产 ${it.id} 帧区间 ${it.from}-${it.to} 超出总长 ${total}`);
  if (it.to <= it.from) { errors.push(`资产 ${it.id} 帧区间非法`); continue; }

  const secs = (it.to - it.from) / fps;
  if (!it.path) errors.push(`资产 ${it.id} 缺少场景组件 path`);
  else if (!fs.existsSync(path.resolve(ROOT, it.path))) errors.push(`资产 ${it.id} 的场景组件不存在：${it.path}`);

  if (secs < 1.5) warnings.push(`资产 ${it.id} 只有 ${secs.toFixed(1)}s，太短，观众来不及看清`);
  if (secs > 6) warnings.push(`资产 ${it.id} ${secs.toFixed(1)}s，已经超过点缀长度，应该走主镜头流程`);
  if (secs > 12) errors.push(`资产 ${it.id} ${secs.toFixed(1)}s，单条 3D 超过 12 秒，请拆开或改路线`);

  list.push({id: it.id, start: it.from / fps, end: it.to / fps, style: (it.params || {}).style || '?'});
}

list.sort((a, b) => a.start - b.start);
for (let i = 1; i < list.length; i++) {
  const gap = list[i].start - list[i - 1].end;
  if (gap < 20) warnings.push(`${list[i - 1].id} 与 ${list[i].id} 只隔 ${gap.toFixed(1)}s，建议 ≥20s，否则扎堆`);
}

const STEP = 1;
const windows = [];
for (let s = 0; s + 60 <= totalSec + STEP; s += STEP) {
  const n = list.filter(a => a.start < s + 60 && a.end > s).length;
  windows.push(n);
}
const zeroWindows = [];
if (windows.length) {
  let runStart = null;
  windows.forEach((n, i) => {
    if (n === 0 && runStart === null) runStart = i * STEP;
    if (n !== 0 && runStart !== null) { zeroWindows.push([runStart, i * STEP]); runStart = null; }
  });
  if (runStart !== null) zeroWindows.push([runStart, Math.round(totalSec)]);
}
for (const [a, b] of zeroWindows) {
  if (b - a >= 20) warnings.push(`${a}–${b}s 这一段没有任何 3D 点缀（${b - a}s），考虑补一个或确认这一章就该是纯二维`);
}
const maxInWindow = windows.length ? Math.max(...windows) : list.length;
if (maxInWindow >= 3) warnings.push(`有 60 秒窗口里挤了 ${maxInWindow} 个 3D 镜头，观众会开始等画面`);

const share = totalSec > 0
  ? list.reduce((s, a) => s + (a.end - a.start), 0) / totalSec
  : 0;
if (share > 0.12) warnings.push(`3D 总时长占比 ${(share * 100).toFixed(1)}%，超过 12%，它已经不是点缀了`);

const expected = totalSec > 0 ? Math.max(1, Math.floor(totalSec / 60)) : 0;
if (items.length && list.length < expected) {
  warnings.push(`每 60 秒 1–2 个的话，${totalSec.toFixed(0)}s 的片子至少要 ${expected} 个，现在 ${list.length} 个`);
}

const verdict = errors.length
  ? `FAIL ${errors.length} 项`
  : (warnings.length ? `PASS（${warnings.length} 条提醒）` : 'PASS');
console.log(verdict);
console.log(JSON.stringify({
  durationSec: +totalSec.toFixed(1),
  accents: list.length,
  styles: list.reduce((m, a) => (m[a.style] = (m[a.style] || 0) + 1, m), {}),
  share: +(share * 100).toFixed(1) + '%',
  maxPer60s: maxInWindow,
  errors,
  warnings
}, null, 2));

if (errors.length) process.exitCode = 1;
