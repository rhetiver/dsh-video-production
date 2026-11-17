#!/usr/bin/env node
// 从模板生成新视频项目。
// 用法：
//   node templates/new-video-project.cjs --name 哈希碰撞 --title "哈希碰撞为什么难" [--fps 30] [--ratio 16:9] [--style 11] [--out <目录>]
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };

const name = arg('--name');
if (!name) { console.error('用法: node templates/new-video-project.cjs --name <项目名> [--title 标题] [--fps 30] [--ratio 16:9] [--style 11] [--out 目录]'); process.exit(1); }
const title = arg('--title', name);
const fps = Number(arg('--fps', 30));
const ratio = arg('--ratio', '16:9');
const styleId = arg('--style');
const outRoot = path.resolve(arg('--out', path.resolve(__dirname, '../project')));
if (name === '.' || name === '..' || /[\\/:*?"<>|]/.test(name)) {
  console.error('项目名必须是有效的单级目录名'); process.exit(1);
}
if (!Number.isInteger(fps) || fps < 1 || fps > 240) {
  console.error('--fps 必须是 1–240 的整数'); process.exit(1);
}
if (!['16:9', '9:16', '1:1'].includes(ratio)) {
  console.error('--ratio 仅支持 16:9、9:16、1:1'); process.exit(1);
}
if (styleId && !/^\d+$/.test(styleId)) {
  console.error('--style 必须是数字编号'); process.exit(1);
}
if (styleId) {
  const styles = path.resolve(__dirname, '../skills/claude-opus-5-5-new/assets/atlas/styles');
  const prefix = String(Number(styleId)).padStart(3, '0') + '-';
  if (!fs.existsSync(styles) || !fs.readdirSync(styles).some(n => n.startsWith(prefix))) {
    console.error('找不到风格编号：' + styleId); process.exit(1);
  }
}
const target = path.join(outRoot, name);

const dims = ratio === '9:16' ? {w: 1080, h: 1920} : ratio === '1:1' ? {w: 1080, h: 1080} : {w: 1920, h: 1080};
const tpl = path.join(__dirname, 'video-project');

if (fs.existsSync(target)) { console.error('目标已存在：' + target); process.exit(1); }

const copy = (from, to) => {
  fs.mkdirSync(to, {recursive: true});
  for (const n of fs.readdirSync(from)) {
    const s = path.join(from, n), d = path.join(to, n);
    const st = fs.statSync(s);
    if (st.isDirectory()) { if (n === 'node_modules' || n === 'out' || n === '__pycache__' || n === '.cache') continue; copy(s, d); }
    else fs.copyFileSync(s, d);
  }
};
copy(tpl, target);

// 3D 点缀工具链：连同三套预设一起复制进项目（快照，之后各项目独立演进）
// 3D 场景直接在 Remotion 中用 Three.js 制作。

copy(path.join(__dirname, 'three-kit'), path.join(target, 'scripts', 'three-kit'));

const vars = {
  '{{TITLE}}': title,
  '{{NAME}}': name,
  '{{FPS}}': String(fps),
  '{{W}}': String(dims.w),
  '{{H}}': String(dims.h),
  '{{ROOT}}': target.replace(/\\/g, '\\\\'),
  '{{DATE}}': new Date().toISOString().slice(0, 10),
  '{{TEMPLATE_REVISION}}': (() => {
    try {
      const opts = {cwd: __dirname, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']};
      const revision = execFileSync('git', ['rev-parse', '--short', 'HEAD'], opts).trim();
      const dirty = execFileSync('git', ['status', '--porcelain', '--', 'templates'], opts).trim();
      return revision + (dirty ? '+dirty' : '');
    }
    catch { return '未知'; }
  })()
};
const replaceIn = dir => {
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    const st = fs.statSync(p);
    if (st.isDirectory()) { replaceIn(p); continue; }
    if (!/\.(md|json|txt|tsx?|css|cjs)$/i.test(n)) continue;
    let src = fs.readFileSync(p, 'utf8');
    const before = src;
    for (const [k, v] of Object.entries(vars)) src = src.split(k).join(v);
    if (src !== before) fs.writeFileSync(p, src);
  }
};
replaceIn(target);
// 占位稿的帧区间也必须与所选 fps 一致，避免首次打开即出现错误时长。
execFileSync(process.execPath, [path.join(target, 'scripts', 'script-to-beats.cjs')], {stdio: 'pipe'});

let appliedStyle = null;
if (styleId) {
  const tool = path.resolve(__dirname, '../skills/claude-opus-5-5-new/scripts/style-tokens.cjs');
  if (!fs.existsSync(tool)) { console.error('找不到风格令牌工具：' + tool); process.exit(1); }
  const tmp = path.join(target, '.tokens-tmp');
  execFileSync(process.execPath, [tool, '--id', String(styleId), '--out', tmp], {stdio: 'pipe'});
  const md = fs.readFileSync(path.join(tmp, `style-${String(styleId).padStart(2, '0')}-tokens.md`), 'utf8');
  const css = /```css\n([\s\S]*?)```/.exec(md);
  if (css) {
    const tokensPath = path.join(target, 'style', 'tokens.css');
    const cur = fs.readFileSync(tokensPath, 'utf8');
    const body = css[1].replace(/:root\s*\{|\}/g, '').trim();
    const names = new Set([...body.matchAll(/--([\w-]+)\s*:/g)].map(m => m[1]));
    const old = (/:root \{([\s\S]*?)\}/.exec(cur) || [null, ''])[1];
    const kept = old.split('\n').filter(line => {
      const m = /--([\w-]+)\s*:/.exec(line);
      return !m || !names.has(m[1]);
    }).join('\n').replace(/\s+$/, '');
    const merged = `:root {${kept}\n  ${body.replace(/\n/g, '\n  ')}\n}`;
    const withCjk = t => t.replace(/(--font-(?:display|body):\s*)([^;]+);/g, (m, head, val) => /Noto|Songti|SimSun|PingFang|YaHei|Hei|Kai/.test(val) ? m : `${head}${val.trim()}, 'Noto Serif SC', 'Songti SC', serif;`);
    fs.writeFileSync(tokensPath, withCjk(cur.replace(/:root \{[\s\S]*?\}/, merged)) + '\n');
    appliedStyle = {id: Number(styleId), name: (/^# 风格令牌 · (.+?)（/.exec(md) || [])[1] || ''};
  }
  fs.rmSync(tmp, {recursive: true, force: true});
}

const agentsPath = path.join(target, 'AGENTS.md');
if (fs.existsSync(agentsPath)) {
  const styleText = appliedStyle
    ? `Opus #${appliedStyle.id}${appliedStyle.name ? ' ' + appliedStyle.name : ''}`
    : '未指定（选定后写在这里）';
  const ag = fs.readFileSync(agentsPath, 'utf8').replace('{{STYLE}}', styleText);
  fs.writeFileSync(agentsPath, ag);
}

// 依赖复用：全库共享一份 Remotion 依赖，新项目挂 Junction，不再各自 npm install（约 280 MB/项目）。
// 必须放在 replaceIn() 之后 —— 它会递归 stat 整个项目目录，提前挂链接会扫进 1.8 GB 的共享目录。
const sharedModules = path.resolve(__dirname, '../tools/remotion/node_modules');
const localModules = path.join(target, 'production', 'remotion', 'node_modules');
let linked = false;
let linkNote = '';
if (!fs.existsSync(sharedModules)) {
  linkNote = '未找到共享依赖 tools/remotion/node_modules，请自行 npm install';
} else if (fs.existsSync(localModules)) {
  linkNote = '目标 node_modules 已存在，保持原样';
} else {
  try {
    fs.symlinkSync(sharedModules, localModules, process.platform === 'win32' ? 'junction' : 'dir');
    linked = true;
  } catch (e) {
    linkNote = `挂接失败：${e.message}，请自行 npm install`;
  }
}

console.log(JSON.stringify({
  project: target,
  title, fps, canvas: dims,
  style: appliedStyle,
  deps: linked ? {type: 'junction', target: sharedModules} : {type: 'manual', note: linkNote},
  next: [
    `cd "${target}"`,
    '编辑 script/script.md 后：node scripts/script-to-beats.cjs  # 字幕与节拍都从这里生成',
    'node scripts/lint-timeline.cjs',
    '3D 点缀：在 assets/manifest.json 登记 tool=three 的场景，再运行 node scripts/lint-accents.cjs',
    linked
      ? 'cd production/remotion && npm run dev  # 依赖已挂共享 Junction，无需 npm install'
      : 'cd production/remotion && npm install && npm run dev'
  ]
}, null, 2));
