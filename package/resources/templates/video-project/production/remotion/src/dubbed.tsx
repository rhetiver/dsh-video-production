import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {Scene} from './scene';
import manifest from './dubbed-manifest.json';
import subtitles from './dubbed-subtitles.json';

type Entry = {id: string; sourceStart: number; sourceEnd: number; startFrame: number; durationFrames: number; audioDurationFrames: number; src: string};
const entries = manifest.segments as Entry[];
const cues = subtitles.cues as {from: number; to: number; text: string}[];

// 配音时间轴 → 原画面时间轴：超窗段把原画面动作按比例铺开，后续画面依次后移
const mapToSource = (f: number) => {
  for (const e of entries) {
    if (f < e.startFrame + e.durationFrames) {
      if (f < e.startFrame) return f;
      const local = f - e.startFrame;
      const win = e.sourceEnd - e.sourceStart;
      return Math.min(e.sourceStart + Math.floor((local * win) / e.durationFrames), e.sourceEnd - 1);
    }
  }
  return manifest.durationInFrames - 1;
};

export const Dubbed: React.FC = () => {
  const frame = useCurrentFrame();
  if (!entries.length) return <AbsoluteFill><Scene frame={frame} /></AbsoluteFill>;

  const sourceFrame = mapToSource(frame);
  const text = cues.find(c => frame >= c.from && frame < c.to)?.text;

  return (
    <AbsoluteFill>
      <Scene frame={sourceFrame} textOverride={text ?? ''} />
      {entries.map(entry => (
        <Sequence key={entry.id} from={entry.startFrame} durationInFrames={entry.durationFrames}>
          <AbsoluteFill>
            <Audio src={staticFile(entry.src)} />
          </AbsoluteFill>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
