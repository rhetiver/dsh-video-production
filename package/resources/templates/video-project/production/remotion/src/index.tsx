import React from 'react';
import {AbsoluteFill, Composition, registerRoot, useCurrentFrame} from 'remotion';
import {Scene, totalFrames, fps, canvas} from './scene';
import {Dubbed} from './dubbed';
import manifest from './dubbed-manifest.json';
import './style.css';

const Silent: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Scene frame={frame} />
    </AbsoluteFill>
  );
};

const Root: React.FC = () => (
  <>
    <Composition
      id="Video"
      component={Silent}
      durationInFrames={totalFrames}
      fps={fps}
      width={canvas.width}
      height={canvas.height}
    />
    <Composition
      id="VideoDubbed"
      component={Dubbed}
      durationInFrames={manifest.durationInFrames || totalFrames}
      fps={fps}
      width={canvas.width}
      height={canvas.height}
    />
  </>
);

registerRoot(Root);
