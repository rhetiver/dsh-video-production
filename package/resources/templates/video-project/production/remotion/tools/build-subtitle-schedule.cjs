#!/usr/bin/env node
// 生成有声版字幕排程：src/dubbed-subtitles.json
// 按配音的字级时间戳计算字幕出现时刻；缺失或文本不匹配时拒绝生成。
// 由 build-dubbed-timeline.cjs 自动调用，也可单独运行。
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../..');
const beats = JSON.parse(fs.readFileSync(path.join(root, 'content', 'beats.json'), 'utf8')).beats || [];
const manifestPath = process.argv[2] || path.join(__dirname, '../src/dubbed-manifest.json');
if (!fs.existsSync(manifestPath)) { console.error('缺少 dubbed-manifest.json，先生成配音时间线'); process.exit(1); }
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (!manifest.segments.length) { console.log('无配音段，跳过字幕排程'); process.exit(0); }

const strip = s => s.replace(/[\s，。；：！？、（）()「」“”"']/g, '');
const cues = beats.map(b => ({start: b.startFrame, end: b.endFrame, text: b.text}));
const out = [];

for (const seg of manifest.segments) {
  const segCues = cues.filter(c => c.start >= seg.sourceStart && c.start < seg.sourceEnd);
  if (!segCues.length) { console.error(`${seg.id} 未匹配到字幕`); process.exit(1); }

  const tsPath = path.join(__dirname, `../public/audio/voice-workbench/${seg.id}.timestamps.json`);
  const chars = [];
  if (fs.existsSync(tsPath)) {
    for (const sent of JSON.parse(fs.readFileSync(tsPath, 'utf8'))) {
      for (const w of sent.words || []) {
        const t = strip(w.word || '');
        if (!t) continue;
        const letters = [...t];
        const single = letters.length === 1;
        const latinWord = /^[A-Za-z]+$/.test(t);
        if ((!single && !latinWord) || w.startTime == null || w.endTime == null) {
          console.error(`${seg.id} 时间戳不是逐字数据，请补齐字级时间戳`); process.exit(1);
        }
        const s = Number(w.startTime), e = Number(w.endTime);
        if (!Number.isFinite(s) || !Number.isFinite(e) || s < 0 || e < s) {
          console.error(`${seg.id} 字级时间戳无效，请重新配音`); process.exit(1);
        }
        if (single) {
          chars.push({ch: letters[0], t: s});
        } else {
          // 英文词（App / BI / ECharts）接口只给整词一个时间戳：仅在本词内部按字母序展开，
          // 句子的起点仍取该句第一个字的真实时间，不按整句字数均摊。
          letters.forEach((c, i) => chars.push({ch: c, t: s + ((e - s) * i) / letters.length}));
        }
      }
    }
  }

  let times = null;
  if (chars.length) {
    const norm = segCues.map(c => strip(c.text));
    let p = 0;
    const t = [];
    let ok = true;
    for (const cn of norm) {
      const letters = [...cn];
      for (const letter of letters) {
        if (p >= chars.length || chars[p].ch !== letter) { ok = false; break; }
        p++;
      }
      if (!ok) break;
      t.push(chars[p - letters.length].t);
    }
    if (ok && p === chars.length) times = t;
  }

  if (!times || times.some(t => !Number.isFinite(t) || t < 0)) {
    console.error(`${seg.id} 字级时间戳缺失或与字幕不匹配，请重新配音`); process.exit(1);
  }
  const starts = times.map(t => seg.startFrame + Math.round(t * manifest.fps));
  segCues.forEach((c, j) => {
    const last = j === segCues.length - 1;
    const from = starts[j];
    const to = last ? seg.startFrame + seg.durationFrames : starts[j + 1];
    if (from < seg.startFrame || from >= to || to > seg.startFrame + seg.durationFrames) {
      console.error(`${seg.id} 字幕时间戳越界或顺序错误`); process.exit(1);
    }
    out.push({seg: seg.id, from, to, text: c.text});
  });
}

if (out[out.length - 1].to !== manifest.durationInFrames) { console.error('字幕排程未到达时间轴末尾'); process.exit(1); }
for (let i = 1; i < out.length; i++) if (out[i - 1].to > out[i].from) { console.error('字幕排程重叠：' + out[i].seg); process.exit(1); }

const target = process.argv[3] || path.join(__dirname, '../src/dubbed-subtitles.json');
fs.writeFileSync(target, JSON.stringify({version: 1, fps: manifest.fps, durationInFrames: manifest.durationInFrames, cues: out}, null, 1));
process.stdout.write(JSON.stringify({cues: out.length}));
