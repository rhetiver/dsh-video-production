import React, {useLayoutEffect, useMemo, useRef} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {makeRng} from '../lib/random';

/**
 * 质感层：在画面上叠一层确定性的颗粒 / 纸纹。
 *
 * 设计约束（改之前先读）：
 * 1. 只用 makeRng 生成噪声，禁用 Math.random()，否则同一帧每次渲染不同。
 * 2. 噪声贴图只在挂载时生成一次，逐帧只做「位移 + 平铺」，不做全屏 getImageData。
 * 3. 画布尺寸固定取合成尺寸，不乘 devicePixelRatio，避免 headless 与预览不一致。
 * 4. 绘制放在 useLayoutEffect 里同步完成，保证截图前已经画好。
 *
 * 用法：<Grain opacity={0.06} />，放在背景之上、文字之下。
 * 想要胶片闪烁用 flicker；想要纸张纹理用默认（静态 + 缓慢漂移）。
 */
export type GrainProps = {
  /** 图层整体不透明度，0.04–0.12 是「有但不抢」的区间 */
  opacity?: number;
  /** 种子，换一个数字就是另一张纹理 */
  seed?: number;
  /** 噪声贴图边长，越大颗粒越粗，512 适合 1080p */
  tile?: number;
  /** 每帧漂移像素，0 为完全静止 */
  drift?: number;
  /** 混合模式。normal 最通用（黑白色带 alpha）；overlay 只适合中间调画面，近黑底几乎无效 */
  blend?: React.CSSProperties['mixBlendMode'];
  /** 颗粒强度，12–24 之间比较自然 */
  contrast?: number;
  /** 逐帧切换两张噪声，制造胶片闪烁 */
  flicker?: boolean;
};

const buildTile = (size: number, contrast: number, seed: number): HTMLCanvasElement | null => {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const image = ctx.createImageData(size, size);
  const rng = makeRng(seed);
  // 黑白各半 + alpha 三次方衰减：多数像素极淡，少数明显，密度接近胶片颗粒。
  // 用 alpha 而不是灰度，是为了在深底和浅底上都能看见（overlay 在近黑底上等于没效果）。
  for (let i = 0; i < image.data.length; i += 4) {
    const v = rng.chance(0.5) ? 255 : 0;
    const a = Math.pow(rng.next(), 3) * 255 * (contrast / 16);
    image.data[i] = v;
    image.data[i + 1] = v;
    image.data[i + 2] = v;
    image.data[i + 3] = Math.min(255, a);
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
};

export const Grain: React.FC<GrainProps> = ({
  opacity = 0.07,
  seed = 7,
  tile = 512,
  drift = 0.35,
  blend = 'normal',
  contrast = 16,
  flicker = false,
}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const ref = useRef<HTMLCanvasElement>(null);

  const tileA = useMemo(() => buildTile(tile, contrast, seed), [tile, contrast, seed]);
  const tileB = useMemo(
    () => (flicker ? buildTile(tile, contrast, seed + 101) : null),
    [flicker, tile, contrast, seed]
  );

  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const source = flicker ? (frame % 2 === 0 ? tileA : tileB) : tileA;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!source) return;
    const pattern = ctx.createPattern(source, 'repeat');
    if (!pattern) return;
    const ox = drift === 0 ? 0 : (((frame * drift) % tile) + tile) % tile;
    const oy = drift === 0 ? 0 : (((frame * drift * 0.6) % tile) + tile) % tile;
    ctx.save();
    ctx.translate(-Math.floor(ox), -Math.floor(oy));
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, canvas.width + tile, canvas.height + tile);
    ctx.restore();
  }, [frame, tile, drift, flicker, tileA, tileB]);

  return (
    <AbsoluteFill style={{pointerEvents: 'none'}} aria-hidden>
      <canvas
        ref={ref}
        width={width}
        height={height}
        style={{width: '100%', height: '100%', opacity, mixBlendMode: blend}}
      />
    </AbsoluteFill>
  );
};
