#!/usr/bin/env node
// 把 content/beats.json（唯一时间源）同步进 Remotion 的 src，供打包读取。
const fs = require('node:fs');
const path = require('node:path');

const src = path.resolve(__dirname, '../../../content/beats.json');
const dest = path.resolve(__dirname, '../src/beats.json');
if (!fs.existsSync(src)) {
  console.error('缺少 content/beats.json，先运行：node scripts/script-to-beats.cjs');
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(src, 'utf8'));
if (!data.beats || !data.beats.length) {
  console.error('content/beats.json 里没有节拍，先运行：node scripts/script-to-beats.cjs');
  process.exit(1);
}
fs.writeFileSync(dest, JSON.stringify(data, null, 2) + '\n');
console.log(`synced ${data.beats.length} beats → src/beats.json`);
