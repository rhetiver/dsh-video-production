import React from 'react';
import {AbsoluteFill} from 'remotion';
import manifest from './beats.json';
import {Grain} from './components/Grain';

export type Beat = {id: string; chapter: string; text: string; startFrame: number; endFrame: number};
export const beats = manifest.beats as Beat[];
export const totalFrames = beats.length ? beats[beats.length - 1].endFrame : 1;
export const fps = manifest.fps;
export const canvas = manifest.canvas;

const clamp = (n: number, a: number, b: number) => Math.min(1, Math.max(0, (n - a) / (b - a)));

// textOverride：有声版由字幕排程驱动文字，其余情况用节拍原文
export const Scene: React.FC<{frame: number; textOverride?: string}> = ({frame, textOverride}) => {
  const index = Math.max(0, beats.findIndex((b, i) => frame >= b.startFrame && (i === beats.length - 1 || frame < beats[i + 1].startFrame)));
  const beat = beats[index] || beats[0];
  const local = frame - beat.startFrame;
  const enter = clamp(local, 0, 14);
  const p = Math.min(1, frame / totalFrames);
  const text = textOverride ?? beat.text;

  return (
    <AbsoluteFill className="stage">
      <div className="texture" />
      {/* 质感层：不想要就去掉这一行；强度调 opacity（0.04–0.12）与 contrast（12–24） */}
      <Grain opacity={0.07} />
      <div className="chapter">{beat.chapter}</div>
      <div className="body">
        <div className="line" style={{opacity: enter, transform: `translateY(${(1 - enter) * 24}px)`}}>{text}</div>
      </div>
      <div className="meta">
        <span>{String(index + 1).padStart(2, '0')} / {String(beats.length).padStart(2, '0')}</span>
      </div>
      <div className="progress"><div style={{width: `${p * 100}%`}} /></div>
    </AbsoluteFill>
  );
};
