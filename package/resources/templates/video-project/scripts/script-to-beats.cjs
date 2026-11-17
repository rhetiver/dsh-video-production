#!/usr/bin/env node
// 以口播稿为唯一时间源，生成字幕稿（content/beats.txt）与节拍表（content/beats.json）。
//
// 规则：
//   1. 一条字幕 = 一句话；超过 MAX 字时，在逗号 / 顿号 / 分号处断开（不改写、不合并语序）
//   2. 字幕文本逐字取自 script/script.md，保证配音与字幕是同一串字符
//   3. 每条时长 = 汉字数 / RATE 字每秒；RATE 默认 4.77（286 字/分，实测）
//
// 用法：
//   node scripts/script-to-beats.cjs              # 生成
//   node scripts/script-to-beats.cjs --rate=4.5   # 换音色后重测语速
//   node scripts/script-to-beats.cjs --dry        # 只统计，不落盘
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MAX = 20;

const arg = name => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : null;
};
const RATE = Number(arg('rate') || 4.77); // 286 字/分，实测
const DRY = process.argv.includes('--dry');
const TPL = process.argv.includes('--template'); // 生成为模板，保留 {{FPS}} / {{W}} 占位符
if (!Number.isFinite(RATE) || RATE <= 0) {
  console.error('--rate 必须是正数');
  process.exit(1);
}

const han = s => (s.match(/[\u4e00-\u9fa5]/g) || []).length;

const scriptPath = path.join(ROOT, 'script', 'script.md');
if (!fs.existsSync(scriptPath)) {
  console.error('缺少 script/script.md');
  process.exit(1);
}

// ---------- 1. 解析口播稿 ----------
const raw = fs.readFileSync(scriptPath, 'utf8').replace(/\r/g, '');
const chapters = [];
let cur = null;
let buf = [];
const flushPara = () => {
  const t = buf.join('').trim();
  if (t && cur) cur.paras.push(t);
  buf = [];
};
for (const line of raw.split('\n')) {
  const l = line.trim();
  const head = l.match(/^#{1,2}\s*(\d+)\s*(.+)$/);
  if (head) {
    flushPara();
    if (cur && cur.paras.length) chapters.push(cur);
    cur = {title: head[2].trim(), paras: []};
    continue;
  }
  if (l.startsWith('#')) {
    // 无编号的标题（文档名等）：只当分隔，不算一章
    flushPara();
    continue;
  }
  if (l.startsWith('>') || l === '---') {
    flushPara();
    continue;
  }
  if (!l) {
    flushPara(); // 空行也是段边界
    continue;
  }
  buf.push(l);
}
flushPara();
if (cur && cur.paras.length) chapters.push(cur);

// ---------- 2. 句子 → 字幕行 ----------
// 切句：在句末标点后断开；问号、感叹号保留（承载语气），句号去掉
function splitSentences(para) {
  return para
    .split(/(?<=[。！？])/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => s.replace(/。$/, ''))
    .filter(Boolean);
}

// 长句在分句标点处断开，贪心累积到接近 MAX
function splitLong(sentence) {
  if (han(sentence) <= MAX) return [sentence];
  const parts = sentence.split(/(?<=[，、；：])/).filter(Boolean);
  const out = [];
  let cur = '';
  for (const p of parts) {
    if (cur && han(cur + p) > MAX) {
      out.push(cur);
      cur = p;
    } else {
      cur += p;
    }
  }
  if (cur) out.push(cur);
  // 单段仍超长：按字数硬切（只在没有标点可用时发生）
  const fixed = [];
  for (const seg of out) {
    if (han(seg) <= MAX) {
      fixed.push(seg);
      continue;
    }
    const chars = [...seg];
    while (chars.length > MAX) fixed.push(chars.splice(0, MAX).join(''));
    if (chars.length) fixed.push(chars.join(''));
  }
  return fixed.map(s => s.replace(/[，、；：]$/, '')).filter(Boolean);
}

const beats = [];
for (const ch of chapters) {
  for (const para of ch.paras) {
    for (const s of splitSentences(para)) {
      for (const line of splitLong(s)) {
        beats.push({chapter: ch.title, text: line, chars: han(line)});
      }
    }
  }
}

// ---------- 3. 计时 ----------
let frame = 0;
const jsonPath = path.join(ROOT, 'content', 'beats.json');
let old = {};
try { old = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); } catch { /* 模板尚未替换占位符 */ }
const fps = TPL ? 30 : Number(old.fps);
if (!Number.isFinite(fps) || fps <= 0) {
  console.error('content/beats.json 缺少有效帧率，不能重新生成节拍');
  process.exit(1);
}
const out = beats.map((b, i) => {
  const secs = b.chars / RATE;
  const frames = Math.max(1, Math.round(secs * fps));
  const rec = {
    id: 'b' + String(i + 1).padStart(3, '0'),
    chapter: b.chapter,
    text: b.text,
    estSec: Number(secs.toFixed(2)),
    startFrame: frame,
    endFrame: frame + frames
  };
  frame += frames;
  return rec;
});

// ---------- 4. 统计 ----------
let totalChars = 0;
const perCh = new Map();
for (const b of out) {
  totalChars += han(b.text);
  const c = perCh.get(b.chapter) || {n: 0, chars: 0, frames: 0};
  c.n += 1;
  c.chars += han(b.text);
  c.frames += b.endFrame - b.startFrame;
  perCh.set(b.chapter, c);
}

const summary = {
  rate: RATE,
  beats: out.length,
  chars: totalChars,
  durationSec: +(frame / fps).toFixed(1),
  chapters: [...perCh.entries()].map(([k, v]) => ({
    title: k,
    beats: v.n,
    chars: v.chars,
    sec: +(v.frames / fps).toFixed(1),
    cps: +(v.chars / (v.frames / fps)).toFixed(2)
  }))
};

if (DRY) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

// ---------- 5. 落盘 ----------
const txt = [];
txt.push('> 由 script/script.md 自动生成，勿手改；改稿请改 script.md 后重跑：node scripts/script-to-beats.cjs');
txt.push(`> 规则：一句一条字幕；每条时长 = 汉字数 ÷ ${RATE} 字每秒`);
for (const ch of chapters) {
  txt.push('');
  txt.push('# ' + ch.title);
  txt.push('');
  for (const b of out.filter(x => x.chapter === ch.title)) txt.push(b.text);
}
fs.writeFileSync(path.join(ROOT, 'content', 'beats.txt'), txt.join('\n') + '\n');

const header = TPL
  ? `{
  "version": 1,
  "title": "{{TITLE}}",
  "fps": {{FPS}},
  "canvas": {"width": {{W}}, "height": {{H}}},
  "generatedBy": "scripts/script-to-beats.cjs",
  "voiceRate": ${RATE},
  "beats": `
  : (() => {
      const meta = JSON.stringify(
        {
          version: 1,
          title: old.title || '未命名项目',
          fps,
          canvas: old.canvas || {width: 1920, height: 1080},
          generatedBy: 'scripts/script-to-beats.cjs',
          voiceRate: RATE
        },
        null,
        2
      );
      // 去掉末尾的 "}"，换成 ", \"beats\": "，再把数组接上
      return meta.slice(0, meta.lastIndexOf('}')).trimEnd() + ',\n  "beats": ';
    })();
const body = JSON.stringify(out, null, 2).split('\n').map((l, i) => (i ? '  ' + l : l)).join('\n');
fs.writeFileSync(jsonPath, header + body + '\n}\n');

console.log(JSON.stringify(summary));
