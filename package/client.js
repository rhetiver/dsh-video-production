window.__ModuleLoader__.load({
  id: 'dsh-video-production',
  factory: (require) => {
    const React = require('react');
    const prompt = '进入视频制作模式。先调用 video_production_guide 并遵循完整视频工作流程和三个停点。请询问我要制作的视频编号、名称和内容；不要假设项目已经存在。';
    function VideoButton({start}) {
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState('');
      return React.createElement('button', {
        type: 'button',
        title: error || '进入视频制作模式',
        'aria-label': '进入视频制作模式',
        disabled: busy,
        onClick: async () => {
          if (busy) return;
          setBusy(true); setError('');
          try { await start(); }
          catch (e) { setError('启动失败，请重试：' + String(e?.message || e)); }
          finally { setBusy(false); }
        },
        style: {border:'1px solid var(--dsw-alias-border-l2, #d2dad5)',borderRadius:'8px',background:'transparent',color:'var(--dsw-alias-label-primary, #33463a)',padding:'5px 9px',font:'inherit',fontSize:'12px',cursor:busy?'wait':'pointer',whiteSpace:'nowrap'}
      }, busy ? '启动中…' : error ? '启动失败，点击重试' : '🎬 视频制作');
    }
    const inject = ['slots', 'sessions', 'conversation'];
    function apply(ctx) {
      ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
        name: 'conversation.input.left', id: 'video-production-start', order: 40,
        inject: (sessionId) => {
          const scope = ctx.sessions.scope(sessionId);
          const conversation = scope?.get('conversation');
          if (!conversation) throw new Error('当前对话尚未准备好');
          return {start: () => conversation.send(prompt)};
        },
      }, VideoButton));
    }
    return {inject, apply};
  },
});
