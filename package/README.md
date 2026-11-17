# 视频制作插件

DeepSeek Harness 0.2.2-rc.3 适配包。包含视频模板、制作规则、风格库和配音工作台的快照；不包含 node_modules、浏览器缓存、用户项目或录音。配音设置弹窗依赖 Windows PowerShell 和 WPF 图形桌面。

在插件目录运行 `npm pack` 生成安装包，然后使用 `dsh plugin --profile desktop add <包文件的绝对路径>` 安装。插件加载后，先调用 `video_production_guide`，再按提示准备内容和创建项目。新项目不含 Node 依赖，进入项目的 `production/remotion` 运行 `npm install` 后再启动 Studio。Node、npm、ffmpeg 和实际配音服务需单独准备。

DSH 桌面版的配置由桌面应用管理，请通过其插件管理界面安装。进入一个对话后，输入框工具栏的“🎬 视频制作”按钮会在当前对话发送启动指令，让 AI 加载工作流并询问视频内容。按钮只在已有对话中显示，不会自行创建对话。

插件自身不提供渲染工具，使用现有 Remotion 工程。工作流的三个停点由 Agent 遵循提供的指导并等待用户确认；插件没有实现阻止其他 Shell 工具渲染的强制策略。不要把插件资源目录当作视频项目或将生成文件写入其中。

## 对话配音

进入配音环节时，AI 调用 `video_voice_generate`，在 Windows 桌面弹出设置窗口。首次在窗口中输入火山引擎 API Key，并选择音色和语速；以后窗口会保留音色和语速，Key 留空即可继续使用已保存的密钥，填写新 Key 可以替换。选择“保存并开始配音”才会发送文本；取消则不会调用语音服务。不要把 Key 粘贴到聊天中。Key 通过 Windows DPAPI 加密，保存在当前用户的 `%APPDATA%\dsh-video-production\volcengine-key.dpapi`，不能直接迁移到其他账户或电脑。删除该文件可移除密钥。

音色和语速保存在 `%APPDATA%\dsh-video-production\voice.json` 中，不含 Key。确认设置后，工具逐完整句调用服务，复用文本、音色和语速均未变化的片段，并生成有声时间线及字幕排程。缺少或不匹配字级时间戳时停止对齐，不会估算。新音色须先试音并重新测量语速；不要默认认为 286 字/分仍适用。

配音依赖 Node.js、ffprobe、网络以及火山引擎有效账号；不会自动渲染 MP4。窗口是独立的本机 Windows 窗口，可能显示在 DSH 窗口后面；远程无图形桌面的环境不可用。工作台本身的图形界面仍沿用原来的会话内 Key，不自动读取这份设置。弹窗由 Agent 到达配音环节时调用工具触发；它不是 DSH 自身的内嵌对话框，也无法强制拦截其他 Shell 工具。

视频项目生成器沿用原工作流，风格文件的许可见 `resources/skills/claude-opus-5-5-new/THIRD_PARTY_NOTICES.md`。分发前应核查各素材许可。
