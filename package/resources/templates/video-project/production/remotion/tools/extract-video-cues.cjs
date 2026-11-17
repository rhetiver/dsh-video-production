#!/usr/bin/env node
// 从口播稿按完整句子生成录音段，并按顺序匹配生成的字幕拍。
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const scriptPath = path.join(root, 'script/script.md');
const beatsPath = path.join(root, 'content/beats.json');
function fail(message) { console.error(message); process.exit(1); }
if (!fs.existsSync(scriptPath) || !fs.existsSync(beatsPath)) {
  fail('缺少口播稿或节拍表，请检查 script/script.md 并运行 node scripts/script-to-beats.cjs');
}
const data = JSON.parse(fs.readFileSync(beatsPath, 'utf8'));
const beats = data.beats || [];
if (!beats.length) fail('节拍表为空，请先生成字幕拍');

// 与 script-to-beats 的章节和段落解析规则保持一致。
const chapters = [];
let chapter = null;
let buffer = [];
function flush() {
  const text = buffer.join('').trim();
  if (text && chapter) chapter.paragraphs.push(text);
  buffer = [];
}
for (const line of fs.readFileSync(scriptPath, 'utf8').replace(/\r/g, '').split('\n')) {
  const text = line.trim();
  const heading = text.match(/^#{1,2}\s*(\d+)\s*(.+)$/);
  if (heading) {
    flush();
    if (chapter && chapter.paragraphs.length) chapters.push(chapter);
    chapter = {title: heading[2].trim(), paragraphs: []};
  } else if (text.startsWith('#') || text.startsWith('>') || text === '---' || !text) {
    flush();
  } else {
    buffer.push(text);
  }
}
flush();
if (chapter && chapter.paragraphs.length) chapters.push(chapter);

// 字幕生成器会去掉句末句号及长句切口的标点；匹配时忽略标点，保留其余字符。
const comparable = text => text.replace(/[\s\p{P}]/gu, '');
const segments = [];
let bi = 0;
for (const ch of chapters) {
  for (const paragraph of ch.paragraphs) {
    for (const sentence of paragraph.split(/(?<=[。！？])/).map(s => s.trim()).filter(Boolean)) {
      const expected = comparable(sentence);
      if (!expected) fail(`章节「${ch.title}」存在没有可匹配文字的句子`);
      const start = bi;
      let actual = '';
      while (actual.length < expected.length && bi < beats.length && beats[bi].chapter === ch.title) {
        actual += comparable(beats[bi].text);
        if (!expected.startsWith(actual)) break;
        bi++;
      }
      if (actual !== expected || bi === start) {
        fail(`口播句子与字幕拍不匹配：${ch.title} / ${sentence}；请重新生成 beats`);
      }
      segments.push({
        id: 'voice-' + String(segments.length + 1).padStart(3, '0'),
        section: ch.title, text: sentence, sourceText: sentence,
        startFrame: beats[start].startFrame, endFrame: beats[bi - 1].endFrame,
        beats: bi - start, audio: null
      });
    }
  }
}
if (!segments.length || bi !== beats.length) fail('口播稿与字幕拍未完整匹配，请重新生成 beats');
const total = beats[beats.length - 1].endFrame;
if (segments[0].startFrame !== 0 || segments[segments.length - 1].endFrame !== total) fail('配音分段未覆盖完整时间轴');
for (let i = 1; i < segments.length; i++) {
  if (segments[i - 1].endFrame !== segments[i].startFrame) fail('配音分段不连续：' + segments[i].id);
}
const payload = {version: 1, mode: 'video-cues', fps: data.fps, source: 'script', segments};
const outFile = process.argv[2];
if (outFile) {
  const target = path.resolve(outFile);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.writeFileSync(target, JSON.stringify(payload, null, 2) + '\n');
  process.stdout.write(JSON.stringify({written: target, segments: segments.length, durationInFrames: total}));
} else {
  process.stdout.write(JSON.stringify(payload));
}
