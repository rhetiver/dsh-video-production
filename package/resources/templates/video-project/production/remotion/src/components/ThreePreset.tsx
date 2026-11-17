import React, {useEffect, useMemo, useState} from 'react';
import {AbsoluteFill, continueRender, delayRender, useCurrentFrame, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import * as THREE from 'three';

type Palette = Record<'c0' | 'c1' | 'c2' | 'c3' | 'c4' | 'c5' | 'c6' | 'c7' | 'c8' | 'c9' | 'c10' | 'c11' | 'c12' | 'c13' | 'c14' | 'c15' | 'c16' | 'c17' | 'c18' | 'c19' | 'c20' | 'c21' | 'c22' | 'c23' | 'c24' | 'c25' | 'c26' | 'c27' | 'c28' | 'c29' | 'c30', string>;
export type ThreePresetStyle = 's1' | 's2' | 's3';
export type ThreePresetProps = {style: ThreePresetStyle; motion?: 'none' | 'push'; motionAmount?: number; durationInFrames?: number};

const Box: React.FC<{p:[number,number,number], s:[number,number,number], c:string, rough?:number}> = ({p,s,c,rough=0.8}) => <mesh position={p}><boxGeometry args={s}/><meshStandardMaterial color={c} roughness={rough}/></mesh>;
const Ball: React.FC<{p:[number,number,number], r:number, c:string}> = ({p,r,c}) => <mesh position={p}><sphereGeometry args={[r,24,16]}/><meshStandardMaterial color={c} roughness={0.75}/></mesh>;
const Edge: React.FC<{p:[number,number,number],s:[number,number,number],c:string,opacity?:number}> = ({p,s,c,opacity=1}) => {const g=useMemo(()=>new THREE.EdgesGeometry(new THREE.BoxGeometry(...s)),[s[0],s[1],s[2]]);return <lineSegments geometry={g} position={p}><lineBasicMaterial color={c} transparent opacity={opacity}/></lineSegments>};
const Classroom=({p}: {p: Palette})=> { const colors=[p.c0,p.c1,p.c2,p.c3,p.c4,p.c5]; return <>
 <color attach="background" args={[p.c6]}/><ambientLight intensity={2.1}/><directionalLight position={[8,16,8]} intensity={1.4}/>
 <Box p={[0,-0.08,0]} s={[12.8,.16,9.6]} c={p.c7}/><Box p={[0,1.1,-4.8]} s={[12.8,2.2,.12]} c={p.c8}/><Box p={[-6.4,1.1,0]} s={[.12,2.2,9.6]} c={p.c9}/>
 <Box p={[2.4,1.2,-4.72]} s={[3,1.05,.03]} c={p.c10}/><Box p={[-6.31,1.25,-1.1]} s={[.03,1,1.6]} c={p.c11}/>
 {Array.from({length:24},(_,i)=>{const x=(i%6-2.5)*1.62,z=(Math.floor(i/6)-1.5)*1.85, empty=i===0||i===23;return <group key={i}>
 <Box p={[x,.27,z]} s={[1.2,.54,1.05]} c={p.c12}/><Box p={[x,.57,z]} s={[1.23,.09,1.08]} c={p.c13}/>
 {!empty&&<><Box p={[x,.96,z-.3]} s={[.67,.7,.42]} c={colors[(i*5+Math.floor(i/6))%6]}/><Ball p={[x,1.47,z-.3]} r={.205} c={p.c14}/></>}
 </group>})}
 </>; };
const Stage=({p}: {p: Palette})=> <><color attach="background" args={[p.c15]}/><ambientLight intensity={.34}/><spotLight position={[.5,8,4]} angle={.58} penumbra={.8} intensity={140} color={p.c16}/><directionalLight position={[-5,4,5]} intensity={1.2} color={p.c17}/>
 <Box p={[0,-.07,0]} s={[200,.12,200]} c={p.c18}/>
 {Array.from({length:34},(_,i)=><Box key={i} p={[Math.sin(i*7)*.012,.09+i*.065,Math.cos(i*11)*.012]} s={[2,.052,1.35]} c={i===33?p.c19:p.c20}/>)}
 <Edge p={[0,1.18,0]} s={[2.35,2.36,1.7]} c={p.c21} opacity={.8}/><Ball p={[0,2.48,0]} r={.1} c={p.c22}/>
 {[[-3.2,.6,-.6],[-2.6,.35,1.1],[3.2,.5,-1.2],[3.8,.28,1]].map((pos,i)=><Box key={i} p={pos as [number,number,number]} s={[.4,.4,.4]} c={p.c23}/>)}
 </>;
const City=({p}: {p: Palette})=> {const buildings=useMemo(()=>{let seed=7;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};const a=[];for(let x=-12;x<=12;x++)for(let z=-10;z<=15;z++){if(Math.abs(x)<1||rand()<.12)continue;const h=1+Math.pow(rand(),1.7)*(rand()<.15?18:10);a.push({x:x*3.4+(rand()-.5)*.35,z:z*3.4,h,w:1.9+rand()*1.05,d:1.9+rand(),o:Math.max(.18, .9-(z+10)*.023)});}return a},[]);return <>
 <color attach="background" args={[p.c24]}/><ambientLight intensity={.5}/><Box p={[0,-.09,4]} s={[180,.12,180]} c={p.c25}/>
 {buildings.map((b,i)=><group key={i}><Box p={[b.x,b.h/2,b.z]} s={[b.w,b.h,b.d]} c={p.c26}/><Edge p={[b.x,b.h/2,b.z]} s={[b.w,b.h,b.d]} c={p.c27} opacity={b.o}/>{i%31===0&&<Ball p={[b.x,b.h+.1,b.z]} r={.09} c={p.c28}/>}</group>)}
 <Box p={[0,.01,2]} s={[.13,.025,100]} c={p.c29}/>
 </>};

const CameraRig: React.FC<{kind: ThreePresetStyle; motion: 'none' | 'push'; amount: number; duration?: number}> = ({kind,motion,amount,duration}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const {camera} = useThree();
  const progress = motion === 'push' ? Math.min(1, frame / Math.max(1, (duration ?? durationInFrames) - 1)) * amount : 0;
  const pos = kind === 's1' ? [15,17,15] : kind === 's2' ? [3,3.3,13] : [3,16,85];
  const target = kind === 's1' ? [0,.4,0] : kind === 's2' ? [0,1,0] : [0,7,0];
  camera.position.set(pos[0],pos[1],pos[2] - progress);
  camera.lookAt(target[0],target[1],target[2]);
  camera.updateProjectionMatrix();
  return null;
};

// 必须位于包含 tokens.css 的 Remotion 入口中；缺少令牌时停止渲染。
export const ThreePreset: React.FC<ThreePresetProps> = ({style, motion='none', motionAmount=0.5, durationInFrames}) => {
  const {width,height} = useVideoConfig();
  const [handle] = useState(() => delayRender('读取 Three.js 颜色令牌'));
  const [palette,setPalette] = useState<Palette | null>(null);
  useEffect(() => {
    const css = getComputedStyle(document.documentElement);
    const p = Object.fromEntries(Array.from({length:31},(_,i) => {
      const name = 'c' + i, value = css.getPropertyValue('--three-' + name).trim();
      if (!value) throw new Error('缺少颜色令牌 --three-' + name);
      return [name,value];
    })) as Palette;
    setPalette(p); continueRender(handle);
  },[handle]);
  if (!palette) return null;
  return <AbsoluteFill><ThreeCanvas width={width} height={height}
    camera={style==='s1' ? {position:[15,17,15],zoom:88 * height / 1080,near:.1,far:400} : {position:style==='s2'?[3,3.3,13]:[3,16,85],fov:style==='s2'?24:33,near:.1,far:400}}
    orthographic={style==='s1'}>
    <CameraRig kind={style} motion={motion} amount={motionAmount} duration={durationInFrames}/>
    {style==='s1'?<Classroom p={palette}/>:style==='s2'?<Stage p={palette}/>:<City p={palette}/>}
  </ThreeCanvas></AbsoluteFill>;
};
