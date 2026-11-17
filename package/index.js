import {defineTool} from '@deepseek-ai/dsh-tools';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {registerVoiceTools} from './voice.js';

export const name = 'video-production';
export const inject = ['tools'];
const run = promisify(execFile);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'resources');
const output = {schema: {type: 'string'}, render: (_args, value) => [{type: 'text', text: value}]};

export function apply(ctx) {
  registerVoiceTools(ctx, root, output);
  ctx.tools.register(defineTool({
    name: 'video_production_guide',
    description: '读取视频制作流程、三道用户确认停点及资源位置；开始视频工作时先调用。',
    parameters: {}, output,
    async execute() {
      return `资源根目录：${root}\n请先阅读以下文件并遵循其中适用的规则：\n${path.join(root, 'AGENTS.md')}\n${path.join(root, 'taste', 'rules.md')}\n${path.join(root, 'taste', 'rejected.md')}\n口播稿与大纲还须参考 ${path.join(root, 'skills', 'web-video-presentation')}。\n所有项目素材和生成文件应放在用户指定的可写工作区；不要修改插件内资源。三个停点须向用户等待明确回复；渲染 MP4 前必须取得批准。进入配音环节时调用 video_voice_generate：工具先弹出窗口供用户设置 API Key、音色和语速，用户选择开始配音后才调用语音服务；若取消则停止配音。不要在聊天中索取 API Key。`;
    },
  }));
  ctx.tools.register(defineTool({
    name: 'video_project_create',
    description: '用内置模板创建视频项目。工作区必须为绝对路径，项目名保留用户给定的数字和空格。',
    parameters: {
      workspace: {type: 'string', required: true, description: '项目父目录的绝对路径'},
      name: {type: 'string', required: true, description: '项目目录名称'},
      title: {type: 'string', description: '视频标题'},
      style: {type: 'number', description: '已由用户选定的风格编号；未选定时省略'},
      ratio: {type: 'string', description: '画幅：16:9、9:16 或 1:1'},
      fps: {type: 'number', description: '帧率'},
    }, output,
    async execute(args, exec) {
      if (!path.isAbsolute(args.workspace)) throw new Error('workspace 必须是绝对路径');
      if (!args.name || args.name === '.' || args.name === '..' || /[\\/:*?"<>|]/.test(args.name)) throw new Error('项目名必须是合法的单级目录名');
      if (args.style !== undefined && (!Number.isInteger(args.style) || args.style < 1)) throw new Error('风格编号必须为正整数');
      const workspace = path.resolve(args.workspace);
      if (!(await fs.stat(workspace)).isDirectory()) throw new Error('workspace 必须是已存在的目录');
      const argv = [path.join(root, 'templates', 'new-video-project.cjs'), '--name', args.name, '--out', workspace];
      for (const key of ['title', 'style', 'ratio', 'fps']) if (args[key] !== undefined) argv.push(`--${key}`, String(args[key]));
      const result = await run(process.execPath, argv, {signal: exec.signal, maxBuffer: 1024 * 1024});
      return result.stdout;
    },
  }));
}
