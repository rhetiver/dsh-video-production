#!/usr/bin/env node
// 3D 点缀的选点助手：不是替你做决定，是把「该想的地方」标出来。
//
//   node scripts/plan-accents.cjs           # 人读的报告
//   node scripts/plan-accents.cjs --json    # 机器读
//   node scripts/plan-accents.cjs --root ../某项目
//
// 打分只看字幕文本里的线索（空间词、量级词、转折词、章节首拍），
// 命中越多越可能值得上一个 3D 镜头。规则见 3D风格/选点规则.md。
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const has = k => args.includes(k);
const val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(val('--root', path.join(__dirname, '..')));

const beatsPath = path.join(ROOT, 'content', 'beats.json');
const manifestPath = path.join(ROOT, 'assets', 'manifest.json');
if (!fs.existsSync(beatsPath)) {
  console.error('缺少 content/beats.json，先运行 node scripts/beats.cjs build');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(beatsPath, 'utf8'));
const fps = Number(data.fps || 30);
const beats = data.beats || [];
if (!beats.length) { console.error('beats.json 里没有节拍，先写 content/beats.txt 再跑 node scripts/beats.cjs build'); process.exit(1); }
const total = beats[beats.length - 1].endFrame;
const totalSec = total / fps;

const items = fs.existsSync(manifestPath)
  ? (JSON.parse(fs.readFileSync(manifestPath, 'utf8')).items || [])
  : [];
const accents = items
  .filter(it => it.tool === 'three' && it.from != null && it.to != null)
  .map(it => ({id: it.id, start: it.from / fps, end: it.to / fps, style: (it.params || {}).style || '?'}));

const strip = s => s.replace(/[\s，。；：！？、（）()「」“”"'.]/g, '');
const units = s => [...strip(s)].length;

const SIGNALS = [
  {tag: '空间关系', score: 2, re: /里|外|上|下|内|穿过|之间|中间|面前|背后|周围|一端|另一头|里面|当中|铺开|围/},
  {tag: '量级', score: 2, re: /万|千|亿|全部|所有|整个|成千|无数|一片|满|遍|每一|都/},
  {tag: '对比', score: 1, re: /相比|而|却|反而|甚至|只|仅|一边|另一/},
  {tag: '转折', score: 1, re: /但|可是|然而|其实|问题是|反过来|如果|万一/},
];

const seenChapters = new Set();
const scored = beats.map((b, i) => {
  const text = b.text || '';
  const startSec = b.startFrame / fps;
  const tags = [];
  let score = 0;

  const chapterKey = b.chapter || '(未分组)';
  if (!seenChapters.has(chapterKey)) {
    seenChapters.add(chapterKey);
    score += 2;
    tags.push('章节入口');
  }
  for (const s of SIGNALS) {
    if (s.re.test(text)) { score += s.score; tags.push(s.tag); }
  }
  const prev = beats[i - 1], next = beats[i + 1];
  if (units(text) <= 8 && prev && next && units(prev.text) >= 12 && units(next.text) >= 12) {
    score += 1;
    tags.push('停顿位');
    if (!tags.includes('章节入口')) tags.push('意象位');
  }
  if (units(text) > 18) { score -= 1; tags.push('字幕过密'); }
  if (text.includes('？') || text.includes('?')) { score += 1; tags.push('设问'); }
  if (accents.some(a => startSec >= a.start - 1 && startSec <= a.end + 1)) score -= 3;

  return {id: b.id, chapter: chapterKey, startSec: +startSec.toFixed(1), score, tags, text};
});

const need = {min: Math.ceil(totalSec / 60), max: Math.ceil(totalSec / 60) * 2};
const windows = [];
for (let s = 0; s + 60 <= totalSec + 1; s += 5) {
  const n = accents.filter(a => a.start < s + 60 && a.end > s).length;
  windows.push({from: s, to: Math.min(s + 60, Math.round(totalSec)), count: n});
}
const zeroRanges = [];
{
  let run = null;
  for (const w of windows) {
    if (w.count === 0 && !run) run = [w.from, w.to];
    else if (w.count === 0 && run) run[1] = w.to;
    else if (w.count !== 0 && run) { zeroRanges.push(run); run = null; }
  }
  if (run) zeroRanges.push(run);
}
const emptyWindows = zeroRanges.filter(r => r[1] - r[0] >= 20);
if (!windows.length && totalSec >= 20 && !accents.length) emptyWindows.push([0, Math.round(totalSec)]);
const crowded = windows.filter(w => w.count >= 3);

const perChapter = new Map();
for (const b of scored) {
  if (!perChapter.has(b.chapter)) perChapter.set(b.chapter, []);
  perChapter.get(b.chapter).push(b);
}
const picks = [];
for (const [chapter, list] of perChapter) {
  const sorted = [...list].sort((a, b) => b.score - a.score);
  const chosen = [];
  for (const c of sorted) {
    if (c.score < 3) break;
    if (chosen.some(x => Math.abs(x.startSec - c.startSec) < 20)) continue;
    chosen.push(c);
    if (chosen.length >= 2) break;
  }
  picks.push({chapter, candidates: chosen});
}

const report = {
  durationSec: +totalSec.toFixed(1),
  chapters: perChapter.size,
  existing: accents.length,
  suggestedRange: need,
  gap: Math.max(0, need.min - accents.length),
  emptyWindows: emptyWindows.map(w => `${w[0]}–${w[1]}s`),
  crowdedWindows: crowded.map(w => `${w.from}–${w.to}s (${w.count} 个)`),
  picks
};

if (has('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const bar = '─'.repeat(46);
console.log(`全片 ${report.durationSec}s · ${report.chapters} 章 · 现有 3D 点缀 ${accents.length} 个`);
console.log(`按每 60 秒 1–2 个，建议 ${need.min}–${need.max} 个${report.gap ? `，还缺 ${report.gap} 个` : '（数量已够）'}`);
console.log(bar);
if (emptyWindows.length) {
  console.log(`空窗（这些段落里一个都没有）：${report.emptyWindows.join('，')}`);
} else {
  console.log('空窗：无');
}
if (crowded.length) console.log(`过密：${report.crowdedWindows.join('，')}`);
console.log(bar);
console.log('候选拍（分高 = 更可能有空间/量级/对比信息，不是必须做）');
for (const p of report.picks) {
  if (!p.candidates.length) {
    console.log(`\n${p.chapter}\n  没有明显候选——这一章可能本来就该是纯二维`);
    continue;
  }
  console.log(`\n${p.chapter}`);
  for (const c of p.candidates) {
    console.log(`  ${c.id}  ${String(c.startSec).padStart(6)}s  [${c.score}] ${c.tags.join(' / ')}`);
    console.log(`      ${c.text}`);
  }
}
console.log('\n下一步：把这些填进 script/outline.md 的「3D 选点」，再把条目写进 assets/manifest.json。');
