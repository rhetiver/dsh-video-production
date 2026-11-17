import React, {useMemo} from 'react';
import {Composition, registerRoot, AbsoluteFill} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import * as THREE from 'three';

const Box: React.FC<{p:[number,number,number], s:[number,number,number], c:string, rough?:number}> = ({p,s,c,rough=0.8}) => <mesh position={p}><boxGeometry args={s}/><meshStandardMaterial color={c} roughness={rough}/></mesh>;
const Ball: React.FC<{p:[number,number,number], r:number, c:string}> = ({p,r,c}) => <mesh position={p}><sphereGeometry args={[r,24,16]}/><meshStandardMaterial color={c} roughness={0.75}/></mesh>;
const Edge: React.FC<{p:[number,number,number],s:[number,number,number],c:string,opacity?:number}> = ({p,s,c,opacity=1}) => {const g=useMemo(()=>new THREE.EdgesGeometry(new THREE.BoxGeometry(...s)),[s[0],s[1],s[2]]);return <lineSegments geometry={g} position={p}><lineBasicMaterial color={c} transparent opacity={opacity}/></lineSegments>};
const colors=['#83cfc1','#e3a19d','#a99fd0','#85b9df','#e9b66f','#99c99e'];
const Classroom=()=> <>
 <color attach="background" args={['#c8cacc']}/><ambientLight intensity={2.1}/><directionalLight position={[8,16,8]} intensity={1.4}/>
 <Box p={[0,-0.08,0]} s={[12.8,.16,9.6]} c="#e9f0f4"/><Box p={[0,1.1,-4.8]} s={[12.8,2.2,.12]} c="#e1e5e8"/><Box p={[-6.4,1.1,0]} s={[.12,2.2,9.6]} c="#e4e7e9"/>
 <Box p={[2.4,1.2,-4.72]} s={[3,1.05,.03]} c="#537b73"/><Box p={[-6.31,1.25,-1.1]} s={[.03,1,1.6]} c="#b1c0c9"/>
 {Array.from({length:24},(_,i)=>{const x=(i%6-2.5)*1.62,z=(Math.floor(i/6)-1.5)*1.85, empty=i===0||i===23;return <group key={i}>
 <Box p={[x,.27,z]} s={[1.2,.54,1.05]} c="#d7a75a"/><Box p={[x,.57,z]} s={[1.23,.09,1.08]} c="#f7e5bb"/>
 {!empty&&<><Box p={[x,.96,z-.3]} s={[.67,.7,.42]} c={colors[(i*5+Math.floor(i/6))%6]}/><Ball p={[x,1.47,z-.3]} r={.205} c="#f8f1e4"/></>}
 </group>})}
 </>;
const Stage=()=> <><color attach="background" args={['#050506']}/><ambientLight intensity={.34}/><spotLight position={[.5,8,4]} angle={.58} penumbra={.8} intensity={140} color="#ffd2a2"/><directionalLight position={[-5,4,5]} intensity={1.2} color="#d6e1ff"/>
 <Box p={[0,-.07,0]} s={[200,.12,200]} c="#151311"/>
 {Array.from({length:34},(_,i)=><Box key={i} p={[Math.sin(i*7)*.012,.09+i*.065,Math.cos(i*11)*.012]} s={[2,.052,1.35]} c={i===33?'#f3e8d4':'#b7b7b5'}/>)}
 <Edge p={[0,1.18,0]} s={[2.35,2.36,1.7]} c="#cdd0d0" opacity={.8}/><Ball p={[0,2.48,0]} r={.1} c="#ffce8a"/>
 {[[-3.2,.6,-.6],[-2.6,.35,1.1],[3.2,.5,-1.2],[3.8,.28,1]].map((p,i)=><Box key={i} p={p as [number,number,number]} s={[.4,.4,.4]} c="#222226"/>)}
 </>;
const City=()=> {const buildings=useMemo(()=>{let seed=7;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};const a=[];for(let x=-12;x<=12;x++)for(let z=-10;z<=15;z++){if(Math.abs(x)<1||rand()<.12)continue;const h=1+Math.pow(rand(),1.7)*(rand()<.15?18:10);a.push({x:x*3.4+(rand()-.5)*.35,z:z*3.4,h,w:1.9+rand()*1.05,d:1.9+rand(),o:Math.max(.18, .9-(z+10)*.023)});}return a},[]);return <>
 <color attach="background" args={['#0d131e']}/><ambientLight intensity={.5}/><Box p={[0,-.09,4]} s={[180,.12,180]} c="#080b10"/>
 {buildings.map((b,i)=><group key={i}><Box p={[b.x,b.h/2,b.z]} s={[b.w,b.h,b.d]} c="#08090b"/><Edge p={[b.x,b.h/2,b.z]} s={[b.w,b.h,b.d]} c="#e6a65c" opacity={b.o}/>{i%31===0&&<Ball p={[b.x,b.h+.1,b.z]} r={.09} c="#ffc07b"/>}</group>)}
 <Box p={[0,.01,2]} s={[.13,.025,100]} c="#ad8051"/>
 </>};
const Frame:React.FC<{kind:'s1'|'s2'|'s3'}>=({kind})=><AbsoluteFill style={{background:kind==='s1'?'#c8cacc':'#07080b'}}><ThreeCanvas width={1920} height={1080} camera={kind==='s1'?{position:[15,17,15],zoom:88,near:.1,far:400}:{position:kind==='s2'?[3,3.3,13]:[3,16,85],fov:kind==='s2'?24:33,near:.1,far:400}} orthographic={kind==='s1'} onCreated={({camera})=>{camera.lookAt(...(kind==='s1'?[0,.4,0]:kind==='s2'?[0,1,0]:[0,7,0]) as [number,number,number]);camera.updateProjectionMatrix();}}>{kind==='s1'?<Classroom/>:kind==='s2'?<Stage/>:<City/>}</ThreeCanvas>{kind==='s2'&&<div style={{position:'absolute',left:'50%',top:'27%',width:165,height:165,transform:'translate(-50%,-50%)',background:'radial-gradient(circle, rgba(255,192,112,.38), rgba(255,165,73,.09) 32%, transparent 70%)',pointerEvents:'none'}}/>}</AbsoluteFill>;
const Root=()=> <>{(['s1','s2','s3'] as const).map(kind=><Composition key={kind} id={kind} component={Frame} defaultProps={{kind}} durationInFrames={1} fps={30} width={1920} height={1080}/>)}</>;
registerRoot(Root);
