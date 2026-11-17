#!/usr/bin/env node
// 时间轴体检：节拍连续性、语速、字幕长度、章节均衡、口播逐句对账、资产帧区间。
// 用法：node scripts/lint-timeline.cjs
const fs = require('node:fs');
const path = require('node:path');

const _i = process.argv.indexOf('--root');
const ROOT = path.resolve(_i >= 0 ? process.argv[_i + 1] : path.join(__dirname, '..'));
const beatsPath = path.join(ROOT, 'content', 'beats.json');
const assetsPath = path.join(ROOT, 'assets', 'manifest.json');
const strip = s => s.replace(/[\s，。；：！？、（）()「」“”"']/g, '');
const units = s => [...strip(s)].length;

if (!fs.existsSync(beatsPath)) { console.error('FAIL 缺少 content/beats.json，先运行 node scripts/script-to-beats.cjs'); process.exit(1); }
const data = JSON.parse(fs.readFileSync(beatsPath, 'utf8'));
const fps = Number(data.fps || 30);
const beats = data.beats || [];
const errors = [], warnings = [];

if (!beats.length) errors.push('beats 为空');
let prev = 0;
beats.forEach(b => {
  if (b.startFrame !== prev) errors.push(`${b.id} 起点 ${b.startFrame} ≠ 上一拍终点 ${prev}`);
  if (b.endFrame <= b.startFrame) errors.push(`${b.id} 时长为 0`);
  const secs = (b.endFrame - b.startFrame) / fps;
  const rate = units(b.text) / secs;
  if (units(b.text) >= 6 && rate > 7.5) warnings.push(`${b.id} 语速 ${rate.toFixed(1)} 字/秒偏快：${b.text}`);
  if (units(b.text) >= 8 && rate < 3.2) warnings.push(`${b.id} 语速 ${rate.toFixed(1)} 字/秒偏慢：${b.text}`);
  if (units(b.text) > 22) warnings.push(`${b.id} 单条 ${units(b.text)} 字，可能超两行：${b.text}`);
  if (/[。；]$/.test(b.text) && units(b.text) > 18) warnings.push(`${b.id} 长句建议拆分为两拍：${b.text}`);
  prev = b.endFrame;
});
const total = prev;

const byChapter = new Map();
beats.forEach(b => { const k = b.chapter || '(未分组)'; byChapter.set(k, (byChapter.get(k) || 0) + (b.endFrame - b.startFrame)); });
const durs = [...byChapter.values()];
if (durs.length > 1 && Math.max(...durs) / Math.min(...durs) > 2.0) {
  warnings.push('章节时长不均：' + [...byChapter.entries()].map(([k, v]) => `${k}=${(v / fps).toFixed(1)}s`).join('，'));
}

// 口播稿 vs 章节时长：写稿时最容易漏的一笔账。
// 汉字数 ÷ 该章秒数 必须落在 4.3–5.0（约 258–300 字/分），否则配音要么赶要么空。
const scriptPath = path.join(ROOT, 'script', 'script.md');
if (fs.existsSync(scriptPath)) {
  const raw = fs.readFileSync(scriptPath, 'utf8');
  const chs = raw.split(/^#{1,2}\s+(?=\d)/m).slice(1).map(block => {
    const title = block.split('\n')[0].replace(/^\d+\s*/, '').trim();
    const body = block.split('\n').slice(1).join('\n').replace(/^---$/gm, '');
    return {title, chars: (body.match(/[\u4e00-\u9fa5]/g) || []).length};
  });
  chs.forEach(c => {
    const frames = byChapter.get(c.title);
    if (!frames) {
      errors.push(`口播稿章节「${c.title}」在 beats 里找不到对应章`);
      return;
    }
    const secs = frames / fps;
    const rate = c.chars / secs;
    const needBeats = Math.round(c.chars / 13.8);
    if (rate > 5.0) warnings.push(`第「${c.title}」章语速 ${rate.toFixed(2)} 字/秒偏快（需 ${needBeats} 拍，现有 ${Math.round(secs / 2.93)} 拍）`);
    else if (rate < 4.3) warnings.push(`第「${c.title}」章语速 ${rate.toFixed(2)} 字/秒偏慢（需 ${needBeats} 拍，现有 ${Math.round(secs / 2.93)} 拍）`);
  });
}

let assetCount = 0;
if (fs.existsSync(assetsPath)) {
  const assets = JSON.parse(fs.readFileSync(assetsPath, 'utf8')).items || [];
  assetCount = assets.length;
  assets.forEach(a => {
    if (a.from == null || a.to == null) { errors.push(`资产 ${a.id} 缺少 from/to`); return; }
    if (a.from < 0 || a.to > total) errors.push(`资产 ${a.id} 帧区间 ${a.from}-${a.to} 超出总长 ${total}`);
    if (a.to <= a.from) errors.push(`资产 ${a.id} 帧区间非法`);
    const p = path.join(ROOT, a.path || '');
    if (a.path && !fs.existsSync(p)) warnings.push(`资产 ${a.id} 路径不存在：${a.path}`);
  });
}

// ---------- 口播逐句对账 ----------
// 每句的窗口（endFrame - startFrame）必须等于「汉字数 ÷ 语速」。
// 多了会念完空着等下一句，少了会顶到下一句。语速默认 4.77 字/秒（286 字/分，实测）。
const RATE = (() => {
  const hit = process.argv.find(a => a.startsWith('--rate='));
  const v = hit ? Number(hit.split('=')[1]) : 4.77;
  return Number.isFinite(v) && v > 0 ? v : 4.77;
})();
const VOICE_TOL = 0.2;
const hanCount = s => (s.match(/[\u4e00-\u9fa5]/g) || []).length;
let windowGap = 0;
beats.forEach(b => {
  const n = hanCount(b.text);
  const win = (b.endFrame - b.startFrame) / fps;
  const gap = win - n / RATE;
  windowGap += gap;
  if (gap > VOICE_TOL) warnings.push(`${b.id} 窗口比应有多 ${gap.toFixed(2)}s，念完会空着等下一句：${b.text}`);
  if (gap < -VOICE_TOL) warnings.push(`${b.id} 窗口比应有多少 ${(-gap).toFixed(2)}s，会顶到下一句：${b.text}`);
});

// 已配音：用真实音频时长核对，并算全片累计漂移
let voiceDrift = null;
const segPath = path.join(ROOT, 'production', '配音工作台', 'subtitle-segments.json');
if (fs.existsSync(segPath)) {
  const segs = JSON.parse(fs.readFileSync(segPath, 'utf8')).segments || [];
  const voiced = segs.filter(s => s.audio && Number.isFinite(Number(s.audio.duration)) && Number(s.audio.duration) > 0);
  if (voiced.length) {
    let acc = 0;
    let worst = {id: '', d: 0};
    voiced.forEach(s => {
      const win = (s.endFrame - s.startFrame) / fps;
      const real = Number(s.audio.duration);
      const d = real - win;
      acc += d;
      if (Math.abs(d) > Math.abs(worst.d)) worst = {id: s.id, d};
      if (Math.abs(d) > 0.6) warnings.push(`${s.id} 配音 ${real.toFixed(2)}s，窗口 ${win.toFixed(2)}s，差 ${d.toFixed(2)}s：${s.text.slice(0, 18)}`);
    });
    voiceDrift = {
      voiced: `${voiced.length}/${segs.length}`,
      driftSec: +acc.toFixed(2),
      worst: worst.id ? `${worst.id} ${worst.d >= 0 ? '+' : ''}${worst.d.toFixed(2)}s` : null
    };
  }
}

const result = {
  beats: beats.length,
  chapters: byChapter.size,
  durationSec: +(total / fps).toFixed(1),
  assets: assetCount,
  voiceRate: RATE,
  windowGap: +windowGap.toFixed(2),
  ...(voiceDrift || {voiced: '0'}),
  errors,
  warnings
};
const verdict = errors.length
  ? `FAIL ${errors.length} 项`
  : (warnings.length ? `PASS（${warnings.length} 条提醒）` : 'PASS');
console.log(verdict);
console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exitCode = 1;
