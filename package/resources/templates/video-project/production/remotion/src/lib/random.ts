// 确定性随机：Remotion 逐帧渲染要求「同一帧永远出同一结果」。
// 组件里一律用这里的函数，禁止 Math.random()，否则整片每次渲染都不一样。

/** 把任意种子转成 32 位无符号整数（FNV-1a） */
export function hashSeed(seed: number | string): number {
  if (typeof seed === 'number') return seed >>> 0;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type Rng = {
  /** [0, 1) */
  next: () => number;
  /** [min, max) */
  range: (min: number, max: number) => number;
  /** [min, max] 整数 */
  int: (min: number, max: number) => number;
  pick: <T>(items: readonly T[]) => T;
  chance: (p: number) => boolean;
};

/** mulberry32：轻量、确定、足够均匀，适合逐帧重算的纹理与位移 */
export function makeRng(seed: number | string): Rng {
  let a = hashSeed(seed) || 1;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    pick: (items) => items[Math.floor(next() * items.length)],
    chance: (p) => next() < p,
  };
}
