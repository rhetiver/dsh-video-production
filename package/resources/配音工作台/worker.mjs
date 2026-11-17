import {readFile, writeFile, mkdir, rename} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import path from 'node:path';

const jobPath = process.argv[2];
const resultPath = process.argv[3];
const job = JSON.parse(await readFile(jobPath, 'utf8'));
const key = process.env.VOLCENGINE_TTS_API_KEY;
const result = async (obj) => { await writeFile(resultPath + '.tmp', JSON.stringify(obj), 'utf8'); await rename(resultPath + '.tmp', resultPath); };
try {
  if (!key) throw new Error('请先填写 API Key。');
  const response = await fetch('https://openspeech.bytedance.com/api/v3/tts/unidirectional', {
    method:'POST', headers:{'Content-Type':'application/json','X-Api-Key':key,'X-Api-Resource-Id':'seed-tts-2.0','X-Api-Request-Id':randomUUID()},
    body: JSON.stringify({req_params:{text:job.text,speaker:job.speaker,audio_params:{format:'mp3',sample_rate:24000,speech_rate:job.rate,enable_subtitle:true}}}),
    signal: AbortSignal.timeout(120000),
  });
  const logId=response.headers.get('x-tt-logid') || '';
  if (!response.ok) throw new Error(`HTTP ${response.status}；日志 ID：${logId}；${(await response.text()).slice(0,500)}`);
  if (!response.body) throw new Error('接口未返回数据流。');
  const chunks=[], sentences=[]; let buffer='', complete=false;
  const consume=(line)=>{if(!line.trim())return;const ev=JSON.parse(line);if(ev.code===20000000){complete=true;return}if(ev.code!==0)throw new Error(`服务错误 ${ev.code}：${ev.message||''}；日志 ID：${logId}`);if(ev.data)chunks.push(Buffer.from(ev.data,'base64'));if(ev.sentence)sentences.push(ev.sentence)};
  const decoder=new TextDecoder();
  for await (const chunk of response.body){buffer+=decoder.decode(chunk,{stream:true});const lines=buffer.split('\n');buffer=lines.pop()||'';for(const line of lines)consume(line)}
  buffer+=decoder.decode();if(buffer.trim())consume(buffer);
  if(!complete||!chunks.length)throw new Error('未收到完整成功消息或音频，原有音频未被覆盖。');
  const audioDir=path.resolve(job.audioDir);await mkdir(audioDir,{recursive:true});
  const dest=path.join(audioDir,`${job.id}.mp3`), tmp=path.join(audioDir,`${job.id}.${randomUUID()}.tmp.mp3`);
  await writeFile(tmp,Buffer.concat(chunks));
  const probe=spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',tmp],{encoding:'utf8',windowsHide:true});
  const duration=Number((probe.stdout||'').trim());
  if(probe.status!==0||!Number.isFinite(duration)||duration<=0)throw new Error('音频已收到，但无法用 ffprobe 获取时长；原有音频未被覆盖。');
  await rename(tmp,dest);
  await writeFile(path.join(audioDir,`${job.id}.timestamps.json`),JSON.stringify(sentences,null,2),'utf8');
  await result({ok:true,id:job.id,duration,sentences:sentences.length,text:job.text,speaker:job.speaker,rate:job.rate});
} catch(error) {await result({ok:false,id:job.id,error:String(error?.message||error)}); process.exitCode=1;}
