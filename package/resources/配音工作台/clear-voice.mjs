import fs from 'node:fs';
import path from 'node:path';
const project=path.resolve(process.argv[2]||'');
const data=path.join(project,'production','配音工作台');
const remotion=path.join(project,'production','remotion');
const audio=path.join(remotion,'public','audio');
const voice=path.join(audio,'voice-workbench');
if(!fs.existsSync(path.join(project,'script','script.md'))||!fs.existsSync(remotion))throw Error('不是可识别的视频项目');
let files=0, drafts=0;
function remove(p){if(fs.existsSync(p)){const st=fs.lstatSync(p);if(!st.isFile()||st.isSymbolicLink())throw Error('拒绝处理非普通文件：'+p);fs.unlinkSync(p);files++;}}
if(fs.existsSync(voice)){
 if(fs.lstatSync(voice).isSymbolicLink())throw Error('配音目录不能是链接');
 for(const name of fs.readdirSync(voice)) if(/^(?:cue|segment)-\d+\.(?:mp3|timestamps\.json)$/.test(name)||/^(?:cue|segment)-\d+\.[0-9a-f-]+\.tmp\.mp3$/i.test(name)||name==='manifest.json')remove(path.join(voice,name));
}
for(const n of ['tts-test.mp3','tts-test-timestamps.json'])remove(path.join(audio,n));
if(fs.existsSync(data))for(const name of fs.readdirSync(data)){
 if(!/^(?:segments|subtitle-segments)(?:[.\-].*)?\.json$/i.test(name))continue;
 const p=path.join(data,name);if(!fs.lstatSync(p).isFile()||fs.lstatSync(p).isSymbolicLink())throw Error('拒绝处理非普通草稿：'+p);
 const d=JSON.parse(fs.readFileSync(p,'utf8'));if(!Array.isArray(d.segments))throw Error('无效草稿：'+p);
 for(const item of d.segments)if(Object.hasOwn(item,'audio'))item.audio=null;
 const tmp=p+'.clearing.tmp';fs.writeFileSync(tmp,JSON.stringify(d,null,2),'utf8');fs.renameSync(tmp,p);drafts++;
}
const manifest=path.join(remotion,'src','dubbed-manifest.json');
if(fs.existsSync(manifest)){const tmp=manifest+'.clearing.tmp';fs.writeFileSync(tmp,JSON.stringify({version:1,fps:30,durationInFrames:7200,segments:[]},null,2),'utf8');fs.renameSync(tmp,manifest)}
console.log(JSON.stringify({files,drafts}));
