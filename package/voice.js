import {defineTool} from '@deepseek-ai/dsh-tools';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
const exec = promisify(execFile);
const configDir = () => path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'dsh-video-production');
const settingsPath = () => path.join(configDir(), 'voice.json');
const keyPath = () => path.join(configDir(), 'volcengine-key.dpapi');
async function readSettings() {
  try { return JSON.parse(await fs.readFile(settingsPath(), 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return {}; throw e; }
}
async function timestampsMatch(file, text) {
  try {
    const data=JSON.parse(await fs.readFile(file,'utf8'));
    const strip=x=>String(x).replace(/[\s，。；：！？、（）()「」“”"']/g,'');
    const words=data.flatMap(sentence=>sentence.words || []);
    if (!words.length) return false;
    for (const w of words) {
      const chars=[...strip(w.word || '')];
      if (!chars.length) continue;
      if ((chars.length !== 1 && !/^[A-Za-z]+$/.test(chars.join(''))) || w.startTime == null || w.endTime == null || !Number.isFinite(Number(w.startTime)) || !Number.isFinite(Number(w.endTime)) || Number(w.startTime)<0 || Number(w.endTime)<Number(w.startTime)) return false;
    }
    return words.map(w=>strip(w.word || '')).join('')===strip(text);
  } catch { return false; }
}
async function atomicJson(file, value) {
  await fs.mkdir(path.dirname(file), {recursive: true});
  const tmp = file + '.' + randomUUID() + '.tmp';
  try { await fs.writeFile(tmp, JSON.stringify(value, null, 2) + '\n', {encoding:'utf8', mode:0o600}); await fs.rename(tmp, file); }
  finally { await fs.rm(tmp, {force:true}); }
}
async function getKey(signal) {
  if (process.platform !== 'win32') throw new Error('本机加密密钥目前只支持 Windows；其他系统可通过 VOLCENGINE_TTS_API_KEY 环境变量提供密钥。');
  const command = '$s=Get-Content -Raw -LiteralPath $env:DSH_VIDEO_KEY_FILE | ConvertTo-SecureString; $b=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try {[Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($b))} finally {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b)}';
  try {
    const env = {...process.env, DSH_VIDEO_KEY_FILE:keyPath()};
    delete env.PSModulePath;
    const {stdout} = await exec('powershell.exe', ['-NoProfile','-NonInteractive','-Command',command], {signal, windowsHide:true, env, maxBuffer:65536});
    if (!stdout) throw new Error('empty');
    return stdout;
  } catch (e) { if (signal?.aborted) throw e; throw new Error('无法读取已保存的 API Key，请在当前 Windows 用户下重新运行 voice-setup.ps1。错误代码：'+String(e.code || 'UNKNOWN')); }
}
export function registerVoiceTools(ctx, resources, output) {
  ctx.tools.register(defineTool({
    name:'video_voice_settings',
    description:'查看或保存本机默认火山引擎音色 ID 和语速；不接收或显示 API Key。',
    parameters:{speaker:{type:'string',description:'音色 ID，例如 zh_female_vv_uranus_bigtts'}, rate:{type:'number',description:'语速，整数 -50 到 100'}}, output,
    async execute(args) {
      const s = await readSettings();
      if (args.speaker !== undefined) { if (!args.speaker.trim()) throw new Error('音色 ID 不能为空'); s.speaker=args.speaker.trim(); }
      if (args.rate !== undefined) { if (!Number.isInteger(args.rate) || args.rate < -50 || args.rate > 100) throw new Error('语速必须是 -50 到 100 的整数'); s.rate=args.rate; }
      if (args.speaker !== undefined || args.rate !== undefined) await atomicJson(settingsPath(),s);
      let keySaved = false; try { await fs.access(keyPath()); keySaved=true; } catch {}
      return JSON.stringify({speaker:s.speaker || null, rate:s.rate ?? 0, keySaved, environmentKeyAvailable:!!process.env.VOLCENGINE_TTS_API_KEY, setupScript:path.join(path.dirname(resources),'voice-setup.ps1'), voiceCatalog:path.join(resources,'配音工作台','voices-2.0.json')});
    }
  }));
  ctx.tools.register(defineTool({
    name:'video_voice_generate',
    description:'进入配音环节时调用。先弹出窗口让用户输入 API Key、选择音色和语速，用户点击开始后才逐句配音。会调用付费服务；不渲染 MP4。',
    parameters:{project:{type:'string',required:true,description:'视频项目根目录的绝对路径'}}, output,
    async execute(args, call) {
      if (!path.isAbsolute(args.project)) throw new Error('project 必须是绝对路径');
      const root=path.resolve(args.project), remotion=path.join(root,'production','remotion');
      await fs.access(path.join(root,'script','script.md'));
      await fs.access(path.join(remotion,'tools','extract-video-cues.cjs'));
      if (process.platform !== 'win32') throw new Error('配音设置弹窗目前需要 Windows 桌面环境。');
      const env={...process.env, DSH_VIDEO_CATALOG:path.join(resources,'配音工作台','voices-2.0.json')};
      delete env.PSModulePath;
      let answer;
      try {
        answer=await exec('powershell.exe',['-NoProfile','-STA','-ExecutionPolicy','Bypass','-File',path.join(path.dirname(resources),'voice-dialog.ps1')],{signal:call.signal,windowsHide:true,env,maxBuffer:65536});
      } catch(e) { if(call.signal?.aborted) throw e; throw new Error('无法打开配音设置窗口，请确认 DSH 运行在 Windows 图形桌面。'); }
      let decision; try { decision=JSON.parse(answer.stdout.trim()); } catch { throw new Error('配音设置窗口未返回有效结果。'); }
      if (decision.status !== 'confirmed') return JSON.stringify({status:'cancelled',message:'已取消配音，没有调用语音服务。'});
      const s=await readSettings(); if (!s.speaker) throw new Error('配音设置缺少音色 ID。');
      let storedKey = false; try { await fs.access(keyPath()); storedKey = true; } catch {}
      const key=storedKey ? await getKey(call.signal) : process.env.VOLCENGINE_TTS_API_KEY;
      if (!key) throw new Error('未配置 API Key。');
      const dataDir=path.join(root,'production','配音工作台'), cueFile=path.join(dataDir,'subtitle-segments.json');
      const audioDir=path.join(remotion,'public','audio','voice-workbench');
      await fs.mkdir(dataDir,{recursive:true});
      const lockPath=path.join(dataDir,'.dsh-voice.lock');
      let lock; try { lock=await fs.open(lockPath,'wx'); } catch(e) { if(e.code==='EEXIST') throw new Error('该项目正在配音，或存在未清理的配音锁文件。'); throw e; }
      try {
        const extractor=path.join(remotion,'tools','extract-video-cues.cjs');
        const fresh=JSON.parse((await exec(process.execPath,[extractor],{cwd:remotion,signal:call.signal,maxBuffer:8*1024*1024})).stdout);
        let old; try { old=JSON.parse(await fs.readFile(cueFile,'utf8')); } catch(e) { if(e.code!=='ENOENT') throw e; }
        if (old && (old.mode!=='video-cues' || !Array.isArray(old.segments))) throw new Error('现有配音工作台数据格式无效，未覆盖。');
        if (old && (old.segments.length!==fresh.segments.length || old.segments.some((x,i)=>x.id!==fresh.segments[i].id || x.sourceText!==fresh.segments[i].sourceText || x.text!==fresh.segments[i].text))) throw new Error('现有配音句段与口播稿不同，为避免覆盖数据已停止；请先在工作台检查。');
        if (old) fresh.segments.forEach((x,i)=>{x.audio=old.segments[i].audio;});
        await atomicJson(cueFile,fresh);
        let generated=0, reused=0;
        for (const seg of fresh.segments) {
          const file=path.join(audioDir,`${seg.id}.mp3`), ts=path.join(audioDir,`${seg.id}.timestamps.json`);
          let ready=false; try { await fs.access(file); await fs.access(ts); ready=true; } catch {}
          if (ready && seg.audio?.text===seg.text && seg.audio?.speaker===s.speaker && seg.audio?.rate===(s.rate??0) && Number(seg.audio?.duration)>0 && await timestampsMatch(ts,seg.text)) { reused++; continue; }
          const tmp=await fs.mkdtemp(path.join(dataDir,'.dsh-voice-work-'));
          try {
            const job=path.join(tmp,'job.json'), result=path.join(tmp,'result.json');
            await fs.writeFile(job,JSON.stringify({id:seg.id,text:seg.text,speaker:s.speaker,rate:s.rate??0,audioDir}),'utf8');
            let failure; try { await exec(process.execPath,[path.join(resources,'配音工作台','worker.mjs'),job,result],{signal:call.signal,env:{...process.env,VOLCENGINE_TTS_API_KEY:key},windowsHide:true,maxBuffer:1024*1024}); } catch(e) { failure=e; }
            if (call.signal?.aborted) throw failure;
            let value; try { value=JSON.parse(await fs.readFile(result,'utf8')); } catch { throw new Error('配音工作程序未返回结果：'+String(failure?.stderr || failure?.message || '请检查网络、Node 和 ffprobe。').split(key).join('[已隐藏]')); }
            if (!value.ok) throw new Error(('配音失败：'+(value.error||'未知错误')).split(key).join('[已隐藏]'));
            seg.audio={duration:value.duration,text:value.text,speaker:value.speaker,rate:value.rate,timestamps:value.sentences};
            await atomicJson(cueFile,fresh); generated++;
          } finally { await fs.rm(tmp,{recursive:true,force:true}); }
        }
        try { await exec(process.execPath,[path.join(remotion,'tools','build-dubbed-timeline.cjs'),cueFile],{cwd:remotion,signal:call.signal,maxBuffer:1024*1024}); }
        catch(e) { if(call.signal?.aborted) throw e; throw new Error('配音已保存，但时间线或字级字幕对齐失败：'+String(e.stderr||e.message).split(key).join('[已隐藏]')); }
        return JSON.stringify({project:root, generated, reused, segments:fresh.segments.length, status:'配音与字幕时间线已生成；请在 Studio 试听核查。'});
      } finally { await lock.close(); await fs.rm(lockPath,{force:true}); }
    }
  }));
}
