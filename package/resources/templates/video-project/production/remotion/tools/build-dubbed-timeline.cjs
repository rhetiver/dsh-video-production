#!/usr/bin/env node
// 由配音分段工程生成有声时间线：src/dubbed-manifest.json
// 规则：每段从原帧位置开始；配音超出原窗口时延长该段，后续画面依次后移；音频不裁切不改速。
// 用法：node tools/build-dubbed-timeline.cjs ../配音工作台/subtitle-segments.json
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

const input = process.argv[2];
if (!input) { console.error('缺少字幕工程路径：node tools/build-dubbed-timeline.cjs ../配音工作台/subtitle-segments.json'); process.exit(1); }
const project = JSON.parse(fs.readFileSync(path.resolve(input), 'utf8'));
if (project.mode !== 'video-cues') { console.error('请选择画面字幕对齐工程（mode: video-cues）'); process.exit(1); }

const current = JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'extract-video-cues.cjs')], {encoding: 'utf8'}));
if (project.segments.length !== current.segments.length) { console.error('字幕数量已变化，请刷新字幕工程'); process.exit(1); }

let next = 0;
const entries = project.segments.map((x, i) => {
  const s = current.segments[i];
  if (x.id !== s.id || x.sourceText !== s.sourceText || x.startFrame !== s.startFrame || x.endFrame !== s.endFrame) {
    console.error(`第 ${i + 1} 段字幕已变更，请刷新字幕工程`); process.exit(1);
  }
  if (!x.audio || !Number.isFinite(Number(x.audio.duration)) || Number(x.audio.duration) <= 0) {
    console.error(`第 ${i + 1} 段尚无配音`); process.exit(1);
  }
  if (x.audio.text !== x.text) { console.error(`第 ${i + 1} 段配音与当前文本不匹配，请重新生成`); process.exit(1); }
  const audio = path.join(__dirname, '../public/audio/voice-workbench', `${x.id}.mp3`);
  if (!fs.existsSync(audio)) { console.error(`缺少 ${x.id} 配音文件`); process.exit(1); }
  const audioDurationFrames = Math.ceil(Number(x.audio.duration) * current.fps);
  const original = x.endFrame - x.startFrame;
  const length = Math.max(original, audioDurationFrames + 6);
  const entry = {
    id: x.id,
    text: x.text,
    sourceStart: x.startFrame,
    sourceEnd: x.endFrame,
    startFrame: next,
    durationFrames: length,
    audioDurationFrames,
    src: `audio/voice-workbench/${x.id}.mp3`
  };
  next += length;
  return entry;
});

const target = path.join(__dirname, '../src/dubbed-manifest.json');
const tmp = target + '.tmp';
fs.writeFileSync(tmp, JSON.stringify({version: 1, fps: current.fps, durationInFrames: next, segments: entries}, null, 2));
const subtitleTarget = path.join(__dirname, '../src/dubbed-subtitles.json');
const subtitleTmp = subtitleTarget + '.tmp';
try {
  execFileSync(process.execPath, [path.join(__dirname, 'build-subtitle-schedule.cjs'), tmp, subtitleTmp], {stdio: ['ignore', 'ignore', 'inherit']});
  fs.renameSync(subtitleTmp, subtitleTarget);
  fs.renameSync(tmp, target);
} catch (e) {
  fs.rmSync(tmp, {force: true});
  fs.rmSync(subtitleTmp, {force: true});
  console.error('字幕排程生成失败，未完成配音时间线更新');
  process.exit(1);
}

process.stdout.write(JSON.stringify({durationInFrames: next, segments: entries.length}));
