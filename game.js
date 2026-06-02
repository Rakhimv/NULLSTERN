// =====================================================================
//  NULLSTERN — top-down med-bay defense. 3D survival-horror.
//  Self-contained scene: renderer + shadows + bloom + retro grade
//  (grain, scan-lines, chromatic aberration, vignette, light pixelation).
//  Dark industrial hall: sodium lamps pooling warm light,
//  green bulkhead airlock, server racks, gurneys, IV drips,
//  crates, blood on the floor. Cursor-aimed flashlight, shooting.
// =====================================================================
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

window.addEventListener('error', e=>console.error('[nullstern]', e.message, '@', e.filename+':'+e.lineno));

// ----- VIBE PALETTE -----
const SODIUM = new THREE.Color(0xffb24a);   // warm sodium lamp light
const SODIUM2= new THREE.Color(0xffc878);   // lighter, for glow
const PHOSPH = new THREE.Color(0x57ff9a);   // phosphor green (door/screens)
const BLOOD  = new THREE.Color(0xb01616);   // blood / alarm
const FOG_COL= new THREE.Color(0x070d0e);   // near-black dark teal fog

// base path for assets (models/sounds live in ./assets)
const ASSET = './assets/';

// --- PRELOADER: track all GLB loads, show a progress bar, gate the menu ---
const manager = new THREE.LoadingManager();
const _ld=document.getElementById('load'), _ldfill=document.getElementById('ldfill'), _ldpct=document.getElementById('ldpct');
let _loadDone=false;
manager.onProgress=(url, a, b)=>{ const p=b?Math.round(a/b*100):0;
  if(_ldfill) _ldfill.style.width=p+'%'; if(_ldpct) _ldpct.textContent='LOADING '+p+'%'; };
function finishLoad(){ if(_loadDone) return; _loadDone=true;
  if(_ldfill) _ldfill.style.width='100%'; if(_ldpct) _ldpct.textContent='READY';
  setTimeout(()=>{ if(_ld) _ld.classList.add('hide'); }, 300); }
manager.onLoad=finishLoad;
setTimeout(finishLoad, 20000);   // safety: never hang on the loader

// ---------------------------------------------------------------------
//  RENDERER / SCENE / CAMERA
// ---------------------------------------------------------------------
const canvas = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, powerPreference:'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.8;             // brighter
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const MAXANISO = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(FOG_COL, 0.014);   // light haze into the distance
scene.background = FOG_COL.clone();

// top-down camera with a slight tilt (NULLSTERN-style native view)
const camera = new THREE.PerspectiveCamera(46, innerWidth/innerHeight, 0.1, 400);
const CAM_OFF = new THREE.Vector3(0, 25, 13);    // high & behind -> steep top-down

// ---------------------------------------------------------------------
//  TEXTURE HELPERS (all procedural on canvas)
// ---------------------------------------------------------------------
function cvs(w,h){ const c=document.createElement('canvas'); c.width=w; c.height=h; return c; }
function tex(c, rx=1, ry=1, srgb=true){
  const t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(rx,ry);
  t.anisotropy=MAXANISO; if(srgb) t.colorSpace=THREE.SRGBColorSpace; return t;
}

// soft radial glow (lamp sprites, light pools)
function glowTexture(){
  const N=128, c=cvs(N,N), x=c.getContext('2d');
  const g=x.createRadialGradient(N/2,N/2,1,N/2,N/2,N/2);
  g.addColorStop(0,'rgba(255,255,255,1)'); g.addColorStop(0.22,'rgba(255,255,255,0.6)');
  g.addColorStop(0.5,'rgba(255,255,255,0.2)'); g.addColorStop(1,'rgba(255,255,255,0)');
  x.fillStyle=g; x.fillRect(0,0,N,N);
  return tex(c);
}
const GLOW = glowTexture();
function groundGlow(color, r, op){
  const m=new THREE.Mesh(new THREE.PlaneGeometry(r,r),
    new THREE.MeshBasicMaterial({ map:GLOW, color, transparent:true, opacity:op,
      blending:THREE.AdditiveBlending, depthWrite:false, fog:true }));
  m.rotation.x=-Math.PI/2; m.position.y=0.03; return m;
}

// metal tiled med-bay floor: square grid, rivets, scuffs
function floorTexture(){
  const N=1024, c=cvs(N,N), x=c.getContext('2d');
  x.fillStyle='#3a4642'; x.fillRect(0,0,N,N);                  // metal (a bit lighter so the hall reads)
  // graininess
  for(let i=0;i<60000;i++){ const v=46+Math.random()*30|0;
    x.fillStyle=`rgba(${v},${v+6},${v+3},${0.05+Math.random()*0.1})`;
    x.fillRect(Math.random()*N, Math.random()*N, 1, 1); }
  // 8x8 tile grid — double line (dark seam + light bevel)
  const T=N/8;
  for(let i=0;i<=8;i++){
    const p=i*T;
    x.strokeStyle='rgba(8,12,12,0.9)'; x.lineWidth=5;
    x.beginPath(); x.moveTo(p,0); x.lineTo(p,N); x.moveTo(0,p); x.lineTo(N,p); x.stroke();
    x.strokeStyle='rgba(120,140,135,0.10)'; x.lineWidth=1.5;
    x.beginPath(); x.moveTo(p+2,0); x.lineTo(p+2,N); x.moveTo(0,p+2); x.lineTo(N,p+2); x.stroke();
  }
  // rivets at tile corners + occasional scuffs
  for(let i=0;i<=8;i++) for(let j=0;j<=8;j++){
    x.fillStyle='rgba(150,165,160,0.14)'; x.beginPath();
    x.arc(i*T, j*T, 2.4, 0, 7); x.fill();
  }
  for(let i=0;i<40;i++){ const px=Math.random()*N,py=Math.random()*N,r=10+Math.random()*60;
    const g=x.createRadialGradient(px,py,1,px,py,r);
    g.addColorStop(0,'rgba(90,110,105,0.10)'); g.addColorStop(1,'rgba(90,110,105,0)');
    x.fillStyle=g; x.fillRect(0,0,N,N); }
  return c;
}
// noise for roughness
function noiseTexture(){
  const N=512, c=cvs(N,N), x=c.getContext('2d'), im=x.createImageData(N,N);
  for(let i=0;i<im.data.length;i+=4){ const v=Math.random()*255|0;
    im.data[i]=im.data[i+1]=im.data[i+2]=v; im.data[i+3]=255; }
  x.putImageData(im,0,0); return c;
}

// panel wall: ribbed metal panels + bolts
function wallTexture(){
  const N=512, c=cvs(N,N), x=c.getContext('2d');
  x.fillStyle='#2b3633'; x.fillRect(0,0,N,N);
  for(let i=0;i<24000;i++){ const v=40+Math.random()*24|0;
    x.fillStyle=`rgba(${v},${v+5},${v+3},${0.06+Math.random()*0.1})`;
    x.fillRect(Math.random()*N, Math.random()*N, 1, 1); }
  // vertical panels
  for(let i=0;i<=4;i++){ const p=i*N/4;
    x.strokeStyle='rgba(6,9,9,0.9)'; x.lineWidth=4; x.beginPath(); x.moveTo(p,0); x.lineTo(p,N); x.stroke();
    x.strokeStyle='rgba(110,130,125,0.08)'; x.lineWidth=1; x.beginPath(); x.moveTo(p+3,0); x.lineTo(p+3,N); x.stroke(); }
  // horizontal rib belt
  x.fillStyle='rgba(8,11,11,0.8)'; x.fillRect(0,N*0.62,N,10);
  x.fillStyle='rgba(120,140,135,0.07)'; x.fillRect(0,N*0.62+10,N,2);
  // bolts
  for(let i=0;i<5;i++) for(let j=0;j<3;j++){
    x.fillStyle='rgba(150,165,160,0.13)'; x.beginPath();
    x.arc(40+i*N/4, 50+j*N/3, 3, 0, 7); x.fill(); }
  return c;
}

// server "screen": dark, dashed text rows, running dots
function screenTexture(green){
  const W=256,H=160,c=cvs(W,H),x=c.getContext('2d');
  x.fillStyle= green? '#04140b':'#0a0d12'; x.fillRect(0,0,W,H);
  const col= green? 'rgba(90,255,150,' : 'rgba(120,200,255,';
  for(let r=0;r<12;r++){ const y=10+r*12;
    let cx=10; const segs=2+Math.random()*5|0;
    for(let s=0;s<segs;s++){ const w=8+Math.random()*40;
      x.fillStyle=col+(0.3+Math.random()*0.5)+')'; x.fillRect(cx,y, w, 4); cx+=w+6; if(cx>W-20)break; }
  }
  // frame
  x.strokeStyle=col+'0.5)'; x.lineWidth=2; x.strokeRect(3,3,W-6,H-6);
  return c;
}

// hazard stripe (yellow-black) by the door
function hazardTexture(){
  const W=256,H=64,c=cvs(W,H),x=c.getContext('2d');
  x.fillStyle='#0c0f0e'; x.fillRect(0,0,W,H);
  x.save(); x.translate(0,0);
  for(let i=-2;i<W/24+2;i++){
    x.fillStyle = (i%2===0)? '#d99a20':'#15140c';
    x.beginPath(); x.moveTo(i*24,0); x.lineTo(i*24+24,0); x.lineTo(i*24-24,H); x.lineTo(i*24-48,H); x.closePath(); x.fill();
  }
  x.restore();
  return c;
}

// blood — wet pool with splatter
function bloodTexture(){
  const N=256,c=cvs(N,N),x=c.getContext('2d'); x.clearRect(0,0,N,N);
  function blob(cx,cy,r,a){ const g=x.createRadialGradient(cx,cy,1,cx,cy,r);
    g.addColorStop(0,`rgba(120,8,8,${a})`); g.addColorStop(0.6,`rgba(85,5,5,${a*0.8})`);
    g.addColorStop(1,'rgba(60,2,2,0)'); x.fillStyle=g; x.beginPath(); x.arc(cx,cy,r,0,7); x.fill(); }
  blob(N/2,N/2, 70, 0.9);
  for(let i=0;i<60;i++){ const a=Math.random()*7, d=40+Math.random()*90;
    blob(N/2+Math.cos(a)*d, N/2+Math.sin(a)*d, 4+Math.random()*16, 0.7+Math.random()*0.3); }
  // thin splatter droplets
  x.fillStyle='rgba(110,6,6,0.85)';
  for(let i=0;i<120;i++){ const a=Math.random()*7, d=30+Math.random()*110;
    x.beginPath(); x.arc(N/2+Math.cos(a)*d, N/2+Math.sin(a)*d, 0.6+Math.random()*2.4,0,7); x.fill(); }
  return c;
}

// stencil text/number on a wall or crate
function stencilTexture(label, col='rgba(180,200,190,0.5)'){
  const W=256,H=128,c=cvs(W,H),x=c.getContext('2d'); x.clearRect(0,0,W,H);
  x.fillStyle=col; x.font='800 64px Consolas,monospace'; x.textAlign='center'; x.textBaseline='middle';
  x.fillText(label, W/2, H/2);
  return c;
}

// ---------------------------------------------------------------------
//  MATERIALS
// ---------------------------------------------------------------------
const NOISE = tex(noiseTexture(), 4, 4, false);
const floorMat = new THREE.MeshStandardMaterial({
  map: tex(floorTexture(), 6, 4), roughnessMap: NOISE,
  color:0xb4c0ba, roughness:0.62, metalness:0.5, envMapIntensity:0.4,
  emissive:0x10201d, emissiveIntensity:0.5 });                 // faint glow — floor never goes pure black
const wallMat = new THREE.MeshStandardMaterial({
  map: tex(wallTexture(), 3, 1), color:0xa3ada9, roughness:0.9, metalness:0.25,
  emissive:0x0e1413, emissiveIntensity:0.5 });
const darkMetal = new THREE.MeshStandardMaterial({ color:0x20262a, roughness:0.7, metalness:0.6 });
const lightMetal= new THREE.MeshStandardMaterial({ color:0x3a4440, roughness:0.55, metalness:0.65 });

// ---------------------------------------------------------------------
//  HALL GEOMETRY
// ---------------------------------------------------------------------
const ROOM = { hx:22, hz:15, wallH:6 };
const colliders = [];   // {minX,maxX,minZ,maxZ} in plan, for collisions
function addCollider(cx, cz, sx, sz){ colliders.push({minX:cx-sx/2,maxX:cx+sx/2,minZ:cz-sz/2,maxZ:cz+sz/2}); }

// floor
const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.hx*2, ROOM.hz*2), floorMat);
floor.rotation.x=-Math.PI/2; floor.receiveShadow=true; scene.add(floor);

// ceiling (dark, catches a little light -> sense of a "roof")
const ceil = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.hx*2, ROOM.hz*2),
  new THREE.MeshStandardMaterial({ color:0x0c1110, roughness:1.0, metalness:0.1 }));
ceil.rotation.x=Math.PI/2; ceil.position.y=ROOM.wallH; scene.add(ceil);

// walls (4, facing inward)
function addWall(w, h, x, y, z, ry){
  const m=new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.4), wallMat);
  m.position.set(x,y,z); m.rotation.y=ry; m.receiveShadow=true; m.castShadow=true; scene.add(m); return m;
}
addWall(ROOM.hx*2, ROOM.wallH, 0, ROOM.wallH/2, -ROOM.hz, 0);   // far (the door is there)
addWall(ROOM.hx*2, ROOM.wallH, 0, ROOM.wallH/2,  ROOM.hz, 0);   // near
addWall(ROOM.hz*2, ROOM.wallH, -ROOM.hx, ROOM.wallH/2, 0, Math.PI/2);
addWall(ROOM.hz*2, ROOM.wallH,  ROOM.hx, ROOM.wallH/2, 0, Math.PI/2);
addCollider(0,-ROOM.hz, ROOM.hx*2, 0.8); addCollider(0,ROOM.hz, ROOM.hx*2, 0.8);
addCollider(-ROOM.hx,0, 0.8, ROOM.hz*2); addCollider(ROOM.hx,0, 0.8, ROOM.hz*2);

// ---------------------------------------------------------------------
//  GREEN BULKHEAD AIRLOCK (iconic NULLSTERN door) — far wall
// ---------------------------------------------------------------------
function buildDoor(){
  const g=new THREE.Group();
  // recessed niche frame
  const frame=new THREE.Mesh(new THREE.BoxGeometry(6.4, 5.2, 0.9), lightMetal);
  frame.position.y=2.6; frame.castShadow=true; frame.receiveShadow=true; g.add(frame);
  // door leaf
  const slab=new THREE.Mesh(new THREE.BoxGeometry(5.0, 4.4, 0.5),
    new THREE.MeshStandardMaterial({ color:0x2b332f, roughness:0.6, metalness:0.7 }));
  slab.position.set(0,2.5,0.35); slab.castShadow=true; slab.receiveShadow=true; g.add(slab);
  // green glowing strips on the leaf
  const stripeMat=new THREE.MeshStandardMaterial({ color:0x0a1a12, emissive:PHOSPH, emissiveIntensity:1.7, roughness:0.5 });
  for(const yy of [1.3, 3.7]){
    const s=new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.28, 0.06), stripeMat);
    s.position.set(0, yy, 0.62); g.add(s);
  }
  const cseam=new THREE.Mesh(new THREE.BoxGeometry(0.14, 4.0, 0.06), stripeMat);
  cseam.position.set(0,2.5,0.62); g.add(cseam);
  // keypad on the right
  const padBase=new THREE.Mesh(new THREE.BoxGeometry(0.7,1.1,0.2), darkMetal);
  padBase.position.set(3.3,2.4,0.5); g.add(padBase);
  const padScr=new THREE.Mesh(new THREE.PlaneGeometry(0.5,0.5),
    new THREE.MeshStandardMaterial({ map:tex(screenTexture(true),1,1), emissive:PHOSPH,
      emissiveMap:tex(screenTexture(true),1,1), emissiveIntensity:1.4, roughness:1 }));
  padScr.position.set(3.3,2.7,0.61); g.add(padScr);
  // hazard stripe above the door
  const haz=new THREE.Mesh(new THREE.PlaneGeometry(6.6,0.7),
    new THREE.MeshStandardMaterial({ map:tex(hazardTexture(),2,1), emissive:0x4a3a10, emissiveIntensity:0.25, roughness:1 }));
  haz.position.set(0,5.0,0.5); g.add(haz);
  // green light from the door + pool on the floor
  const dl=new THREE.PointLight(PHOSPH, 14, 22, 2.0); dl.position.set(0,2.6,1.6); g.add(dl);
  g.add(groundGlow(PHOSPH, 16, 0.4));   // green pool in front of the door
  // glow sprite
  const gl=new THREE.Sprite(new THREE.SpriteMaterial({ map:GLOW, color:PHOSPH, transparent:true,
    opacity:0.4, blending:THREE.AdditiveBlending, depthWrite:false, fog:false }));
  gl.scale.set(7,7,1); gl.position.set(0,2.6,0.8); g.add(gl);

  g.position.set(0, 0, -ROOM.hz+0.45);
  scene.add(g);
  addCollider(0, -ROOM.hz+0.7, 6.4, 1.2);
  return { light:dl, stripeMat };
}
const door = buildDoor();

// ---------------------------------------------------------------------
//  START CONSOLE — walk up and press E -> defense begins (music + enemies)
// ---------------------------------------------------------------------
const consolePos=new THREE.Vector3(-7, 0, 13.0);
let consoleScrMat=null;
function consoleScreen(label, active){
  const W=256,H=160,c=cvs(W,H),x=c.getContext('2d');
  x.fillStyle= active? '#1a0604':'#04140b'; x.fillRect(0,0,W,H);
  const col= active? 'rgba(255,90,70,' : 'rgba(90,255,150,';
  for(let r=0;r<H;r+=4){ x.fillStyle=col+'0.05)'; x.fillRect(0,r,W,2); }   // scan-lines
  x.fillStyle=col+'0.5)'; x.lineWidth=3; x.strokeStyle=col+'0.5)'; x.strokeRect(6,6,W-12,H-12);
  x.fillStyle=col+'0.95)'; x.textAlign='center'; x.textBaseline='middle';
  x.font='800 40px Consolas,monospace'; x.fillText(label, W/2, H/2-8);
  x.font='600 15px Consolas,monospace'; x.fillText(active?'// defense active':'// press  E', W/2, H/2+34);
  return c;
}
(function buildConsole(){
  const g=new THREE.Group(); g.position.copy(consolePos); g.rotation.y=Math.PI;   // screen faces the hall
  const base=new THREE.Mesh(new THREE.BoxGeometry(1.6,1.0,0.7), lightMetal); base.position.y=0.5; base.castShadow=true; base.receiveShadow=true; g.add(base);
  const head=new THREE.Mesh(new THREE.BoxGeometry(1.5,0.95,0.45), darkMetal); head.position.set(0,1.45,0.05); head.castShadow=true; g.add(head);
  const scrTex=tex(consoleScreen('START',false),1,1);
  consoleScrMat=new THREE.MeshStandardMaterial({ map:scrTex, emissive:PHOSPH, emissiveMap:scrTex, emissiveIntensity:1.4, roughness:1 });
  const scr=new THREE.Mesh(new THREE.PlaneGeometry(1.25,0.78), consoleScrMat);
  scr.position.set(0,1.5,0.29); scr.rotation.x=-0.16; g.add(scr);
  const pl=new THREE.PointLight(PHOSPH, 7, 8, 1.6); pl.position.set(0,1.6,0.7); g.add(pl);
  g.add(groundGlow(PHOSPH, 8, 0.28));
  scene.add(g);
  addCollider(consolePos.x, consolePos.z, 1.8, 0.9);
})();
// (defense start now lives in startMission() — press E anywhere, see combat block)

// ---------------------------------------------------------------------
//  CEILING SODIUM LAMPS — pools of warm light (like the reference)
// ---------------------------------------------------------------------
const lamps=[];   // {mat, gl, pt, base, flick, ph}
function makeLamp(x, z, flick=false){
  const g=new THREE.Group();
  // hanger
  const wire=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,1.2,6), darkMetal);
  wire.position.y=ROOM.wallH-0.6; g.add(wire);
  // conical metal shade
  const shade=new THREE.Mesh(new THREE.CylinderGeometry(0.55,0.95,0.7,12,1,true),
    new THREE.MeshStandardMaterial({ color:0x2a2a26, roughness:0.8, metalness:0.5, side:THREE.DoubleSide }));
  shade.position.y=ROOM.wallH-1.4; g.add(shade);
  // glowing "bulb"
  const bulbMat=new THREE.MeshStandardMaterial({ color:0x3a2e18, emissive:SODIUM, emissiveIntensity:2.2, roughness:1 });
  const bulb=new THREE.Mesh(new THREE.SphereGeometry(0.32,12,10), bulbMat);
  bulb.position.y=ROOM.wallH-1.55; g.add(bulb);
  // volumetric light cone
  const cone=new THREE.Mesh(new THREE.ConeGeometry(3.6, ROOM.wallH-1.6, 24, 1, true),
    new THREE.MeshBasicMaterial({ color:SODIUM2, transparent:true, opacity:0.05,
      blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide, fog:false }));
  cone.position.y=(ROOM.wallH-1.6)/2 + 0.0; g.add(cone);
  // glow around the lamp
  const gl=new THREE.Sprite(new THREE.SpriteMaterial({ map:GLOW, color:SODIUM2, transparent:true,
    opacity:0.5, blending:THREE.AdditiveBlending, depthWrite:false, fog:false }));
  gl.scale.set(3.4,3.4,1); gl.position.y=ROOM.wallH-1.55; g.add(gl);
  // warm pool on the floor
  g.add(groundGlow(SODIUM, 13, 0.38));
  // real light — brighter & longer reach, warm pools read on the floor
  const pt=new THREE.PointLight(SODIUM, 30, 30, 1.5); pt.position.y=ROOM.wallH-1.55; g.add(pt);

  g.position.set(x,0,z); scene.add(g);
  lamps.push({ bulbMat, gl, pt, cone, base:2.2, glBase:0.5, ptBase:30, flick, ph:Math.random()*6.28 });
}
makeLamp(-12, -6, false); makeLamp(0, -7, true);  makeLamp(12, -6, false);
makeLamp(-13, 7, false);  makeLamp(13, 8, false);

// ---------------------------------------------------------------------
//  SERVER RACKS / COMPUTER BANKS (left wall in the reference)
// ---------------------------------------------------------------------
function serverRack(x, z, ry){
  const g=new THREE.Group();
  const body=new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.2, 1.3),
    new THREE.MeshStandardMaterial({ color:0x6f6f4e, roughness:0.85, metalness:0.3 })); // beige-yellow like the photo
  body.position.y=1.6; body.castShadow=true; body.receiveShadow=true; g.add(body);
  // dark front panel with screens/indicators
  const scrTex=tex(screenTexture(Math.random()<0.5),1,1);
  const panel=new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.2),
    new THREE.MeshStandardMaterial({ map:scrTex, emissive:0x335577, emissiveMap:scrTex, emissiveIntensity:1.1, roughness:1 }));
  panel.position.set(0, 2.2, 0.66); g.add(panel);
  // row of blinking indicators
  const leds=[];
  for(let i=0;i<6;i++){
    const on=Math.random()<0.7; const col=[0x57ff9a,0xff5a3c,0xffc040][i%3];
    const led=new THREE.Mesh(new THREE.CircleGeometry(0.05,8),
      new THREE.MeshStandardMaterial({ color:0x111, emissive:col, emissiveIntensity:on?2.0:0.2, roughness:1 }));
    led.position.set(-0.8+i*0.32, 1.2, 0.66); g.add(led); leds.push({led, ph:Math.random()*6.28});
  }
  // ventilation slots
  for(let i=0;i<5;i++){ const slot=new THREE.Mesh(new THREE.BoxGeometry(1.8,0.05,0.02), darkMetal);
    slot.position.set(0, 0.5+i*0.13, 0.66); g.add(slot); }
  g.position.set(x,0,z); g.rotation.y=ry; scene.add(g);
  addCollider(x,z, ry?1.3:2.4, ry?2.4:1.3);
  rackLeds.push(...leds);
}
const rackLeds=[];
// row of racks along the left wall, facing right (ry=+PI/2)
for(let i=0;i<4;i++) serverRack(-ROOM.hx+1.1, -9+i*4.5, Math.PI/2);
// a pair on the far right
serverRack(ROOM.hx-1.1, -8, -Math.PI/2);
serverRack(ROOM.hx-1.1, -3.5, -Math.PI/2);

// ---------------------------------------------------------------------
//  GURNEYS (med-bay) + IV DRIPS nearby
// ---------------------------------------------------------------------
function gurney(x, z, ry){
  const g=new THREE.Group();
  const frameMat=new THREE.MeshStandardMaterial({ color:0x3c4a46, roughness:0.5, metalness:0.7 });
  const top=new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.16, 1.0), frameMat);
  top.position.y=0.95; top.castShadow=true; top.receiveShadow=true; g.add(top);
  const mat=new THREE.Mesh(new THREE.BoxGeometry(2.2,0.18,0.85),
    new THREE.MeshStandardMaterial({ color:0x7a8278, roughness:1 }));
  mat.position.y=1.08; mat.castShadow=true; g.add(mat);
  // stained sheet
  const sheet=new THREE.Mesh(new THREE.PlaneGeometry(2.2,0.85),
    new THREE.MeshStandardMaterial({ color:0x9aa49a, roughness:1 }));
  sheet.rotation.x=-Math.PI/2; sheet.position.y=1.18; g.add(sheet);
  // legs
  for(const sx of [-1,1]) for(const sz of [-1,1]){
    const leg=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,0.95,6), frameMat);
    leg.position.set(sx*1.05, 0.47, sz*0.4); leg.castShadow=true; g.add(leg);
  }
  g.position.set(x,0,z); g.rotation.y=ry; scene.add(g);
  addCollider(x,z, ry?1.0:2.4, ry?2.4:1.0);
}
function ivStand(x, z){
  const g=new THREE.Group();
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,2.2,6), lightMetal);
  pole.position.y=1.1; pole.castShadow=true; g.add(pole);
  const hook=new THREE.Mesh(new THREE.TorusGeometry(0.12,0.02,6,12), lightMetal);
  hook.position.set(0.12,2.15,0); hook.rotation.x=Math.PI/2; g.add(hook);
  // IV bag (semi-transparent, faintly glowing)
  const bag=new THREE.Mesh(new THREE.BoxGeometry(0.22,0.5,0.1),
    new THREE.MeshStandardMaterial({ color:0xa8c0b0, emissive:0x2a4a3a, emissiveIntensity:0.5,
      transparent:true, opacity:0.8, roughness:0.4 }));
  bag.position.set(0.12,1.85,0); g.add(bag);
  // thin tube
  const tube=new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,1.4,4),
    new THREE.MeshStandardMaterial({ color:0xb04040, transparent:true, opacity:0.7 }));
  tube.position.set(0.16,1.1,0.1); tube.rotation.z=0.1; g.add(tube);
  // wheeled base
  const base=new THREE.Mesh(new THREE.CylinderGeometry(0.32,0.32,0.05,12), darkMetal);
  base.position.y=0.03; g.add(base);
  g.position.set(x,0,z); scene.add(g);
}
gurney(-4, 4, 0); ivStand(-5.6, 3.2);
gurney(4, 2, 0.15); ivStand(5.6, 1.2);
gurney(7, 9, -0.2); ivStand(8.6, 9.6);

// ---------------------------------------------------------------------
//  CRATES / CONTAINERS (stacked in corners)
// ---------------------------------------------------------------------
function crateTexture(){
  const N=256,c=cvs(N,N),x=c.getContext('2d');
  x.fillStyle='#6e6a3e'; x.fillRect(0,0,N,N);
  for(let i=0;i<8000;i++){ const v=90+Math.random()*40|0;
    x.fillStyle=`rgba(${v},${v-6},${v-40},${0.08})`; x.fillRect(Math.random()*N,Math.random()*N,1,1); }
  // edge trim
  x.strokeStyle='rgba(20,22,10,0.8)'; x.lineWidth=14; x.strokeRect(7,7,N-14,N-14);
  x.strokeStyle='rgba(20,22,10,0.6)'; x.lineWidth=8;
  x.beginPath(); x.moveTo(0,N/2); x.lineTo(N,N/2); x.moveTo(N/2,0); x.lineTo(N/2,N); x.stroke();
  // stencil
  x.fillStyle='rgba(220,200,120,0.55)'; x.font='800 40px Consolas,monospace'; x.textAlign='center';
  x.fillText(['S-23','EAES','512','RF'][Math.random()*4|0], N/2, N/2+14);
  return c;
}
const crateMat=()=>new THREE.MeshStandardMaterial({ map:tex(crateTexture(),1,1), color:0xb0a86a, roughness:0.9, metalness:0.2 });
function crate(x,z,s,ry){
  const m=new THREE.Mesh(new THREE.BoxGeometry(s,s,s), crateMat());
  m.position.set(x, s/2, z); m.rotation.y=ry; m.castShadow=true; m.receiveShadow=true; scene.add(m);
  addCollider(x,z,s*1.1,s*1.1); return m;
}
// stack bottom-left (lower row + one on top)
crate(-18, 11, 1.8, 0.1); crate(-16.2, 11.3, 1.5, -0.2); crate(-17.4, 10.6, 1.4, 0.4);
crate(-18, 11, 1.4, 0.3).position.y=1.8+0.7;   // top one sits on the lower (1.8)
// stack bottom-right
crate(18, 10, 2.0, -0.15); crate(16.4, 11, 1.6, 0.25);
// singles closer to the center
crate(-9, 12, 1.6, 0.5); crate(11, -10, 1.7, -0.3);

// ---------------------------------------------------------------------
//  PIPES / CONDUITS along the ceiling (silhouettes)
// ---------------------------------------------------------------------
function pipe(x1,z1,x2,z2,y,r){
  const dx=x2-x1, dz=z2-z1, len=Math.hypot(dx,dz);
  const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,len,8), darkMetal);
  m.position.set((x1+x2)/2, y, (z1+z2)/2);
  m.rotation.z=Math.PI/2; m.rotation.y=Math.atan2(dx,dz)+Math.PI/2;
  m.castShadow=true; scene.add(m);
}
pipe(-ROOM.hx+0.5,-12, ROOM.hx-0.5,-12, ROOM.wallH-0.5, 0.16);
pipe(-ROOM.hx+0.5,-12.6, ROOM.hx-0.5,-12.6, ROOM.wallH-0.9, 0.1);
pipe(8,-ROOM.hz+0.5, 8,ROOM.hz-0.5, ROOM.wallH-0.6, 0.13);

// ---------------------------------------------------------------------
//  BLOOD ON THE FLOOR (decals) + warning stencils on the floor
// ---------------------------------------------------------------------
function bloodDecal(x,z,s){
  const m=new THREE.Mesh(new THREE.PlaneGeometry(s,s),
    new THREE.MeshStandardMaterial({ map:tex(bloodTexture(),1,1), transparent:true,
      roughness:0.3, metalness:0.2, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-2 }));
  m.rotation.x=-Math.PI/2; m.rotation.z=Math.random()*7; m.position.set(x,0.04,z);
  m.userData.noFlash=true; scene.add(m);
}
bloodDecal(2, -2, 6); bloodDecal(-1, 1, 4.5); bloodDecal(5.5, 5, 3.5);

function floorStencil(x,z,label,ry){
  const m=new THREE.Mesh(new THREE.PlaneGeometry(3,1.5),
    new THREE.MeshStandardMaterial({ map:tex(stencilTexture(label),1,1), transparent:true,
      roughness:1, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-1 }));
  m.rotation.x=-Math.PI/2; m.rotation.z=ry; m.position.set(x,0.05,z);
  m.userData.noFlash=true; scene.add(m);
}
floorStencil(0, 10, 'S-23', 0);
floorStencil(-10, -2, '04', Math.PI/2);

// ---------------------------------------------------------------------
//  DUST / AIRBORNE MOTES — soft particles in the light
// ---------------------------------------------------------------------
const DUST_N=900, dustPos=new Float32Array(DUST_N*3);
for(let i=0;i<DUST_N;i++){ dustPos[i*3]=(Math.random()-0.5)*ROOM.hx*2;
  dustPos[i*3+1]=Math.random()*ROOM.wallH; dustPos[i*3+2]=(Math.random()-0.5)*ROOM.hz*2; }
const dustGeo=new THREE.BufferGeometry();
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos,3));
const dust=new THREE.Points(dustGeo, new THREE.PointsMaterial({ color:0xffcf9a, size:0.05,
  transparent:true, opacity:0.45, depthWrite:false, fog:true, blending:THREE.AdditiveBlending }));
scene.add(dust);

// ---------------------------------------------------------------------
//  PLAYER — "Elster"-style replika (low-poly), spotlight flashlight
// ---------------------------------------------------------------------
const player=new THREE.Group();
player.position.set(0, 0, 11);
scene.add(player);
const PLAYER_R=0.55;
const playerModel=new THREE.Group(); player.add(playerModel);   // visible body (hidden in first-person)
(function buildPlayer(){
  // self-emissive so the figure reads from above even in shadow
  const suit=new THREE.MeshStandardMaterial({ color:0x3a4254, roughness:0.6, metalness:0.4, emissive:0x1a2030, emissiveIntensity:0.7 });
  const skin=new THREE.MeshStandardMaterial({ color:0xccb9a8, roughness:0.9, emissive:0x2a201a, emissiveIntensity:0.5 });
  const hair=new THREE.MeshStandardMaterial({ color:0x9a4f30, emissive:0x3a1a0e, emissiveIntensity:0.45, roughness:0.85 });
  // torso
  const torso=new THREE.Mesh(new THREE.CapsuleGeometry(0.34,0.7,4,10), suit);
  torso.position.y=1.05; torso.castShadow=true; playerModel.add(torso);
  // shoulders / coat
  const coat=new THREE.Mesh(new THREE.CylinderGeometry(0.42,0.36,0.5,12), suit);
  coat.position.y=1.0; coat.castShadow=true; playerModel.add(coat);
  // head
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.24,14,12), skin);
  head.position.y=1.72; head.castShadow=true; playerModel.add(head);
  // hair (top hemisphere)
  const hairMesh=new THREE.Mesh(new THREE.SphereGeometry(0.27,14,12,0,Math.PI*2,0,Math.PI*0.62), hair);
  hairMesh.position.y=1.74; hairMesh.castShadow=true; playerModel.add(hairMesh);
  // legs
  for(const sx of [-0.16,0.16]){
    const leg=new THREE.Mesh(new THREE.CapsuleGeometry(0.13,0.5,4,8), suit);
    leg.position.set(sx,0.45,0); leg.castShadow=true; playerModel.add(leg);
  }
  // arm with pistol (extended forward, +Z local)
  const arm=new THREE.Mesh(new THREE.CapsuleGeometry(0.1,0.4,4,8), suit);
  arm.position.set(0.18,1.15,0.32); arm.rotation.x=Math.PI/2*0.9; arm.castShadow=true; playerModel.add(arm);
  const gun=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.16,0.4), darkMetal);
  gun.position.set(0.2,1.12,0.6); playerModel.add(gun);
})();

// spotlight flashlight — main shadow caster, shines where the player looks.
// UNIFORM: very low decay (0.3) -> doesn't blind point-blank, still reaches far.
const flash=new THREE.SpotLight(0xffeccb, 28, 70, 0.72, 0.6, 0.3);
flash.position.set(0, 1.55, 0);
flash.castShadow=true;
flash.shadow.mapSize.set(2048,2048);
flash.shadow.camera.near=0.4; flash.shadow.camera.far=55; flash.shadow.bias=-0.0006;
player.add(flash);
const flashTarget=new THREE.Object3D(); flashTarget.position.set(0,0.3,5); player.add(flashTarget);
flash.target=flashTarget;
// soft warm "halo" around the player so the silhouette never disappears
const halo=new THREE.PointLight(0xffd6a0, 9.0, 12, 1.4); halo.position.y=1.4; player.add(halo);

// muzzle flash (off, blinks on shot)
const muzzle=new THREE.PointLight(0xffd070, 0, 12, 2.0); muzzle.position.set(0.2,1.12,0.9); player.add(muzzle);
const muzzleSpr=new THREE.Sprite(new THREE.SpriteMaterial({ map:GLOW, color:0xffe49a, transparent:true,
  opacity:0, blending:THREE.AdditiveBlending, depthWrite:false, fog:false }));
muzzleSpr.scale.set(1.6,1.6,1); muzzleSpr.position.set(0.2,1.12,0.95); player.add(muzzleSpr);

// ---------------------------------------------------------------------
//  FP WEAPON VIEWMODEL — at the camera, bottom-right (visible in first-person).
//  Box rig = fallback; replaced by the model when weapon.glb loads.
//  GLB TUNING (if the barrel points the wrong way / crooked) — tweak these:
const WPN_GLB = { len:0.5, pos:new THREE.Vector3(0.04,-0.12,-0.02), rot:new THREE.Euler(0, Math.PI/2, 0) };
// ---------------------------------------------------------------------
const weapon=new THREE.Group();              // attached to the camera
const wpnHome=new THREE.Vector3(0.16, -0.14, -0.4);   // bottom-right of frame (with wide FP FOV)
weapon.position.copy(wpnHome);
weapon.visible=false;
const boxRig=new THREE.Group(); weapon.add(boxRig);
(function buildRifle(){
  const body =new THREE.MeshStandardMaterial({ color:0x1c2024, roughness:0.55, metalness:0.7, emissive:0x0a0c0d, emissiveIntensity:0.4 });
  const accent=new THREE.MeshStandardMaterial({ color:0x2a2f33, roughness:0.4, metalness:0.8 });
  const grey  =new THREE.MeshStandardMaterial({ color:0x33383c, roughness:0.6, metalness:0.6 });
  function box(w,h,d,x,y,z,m){ const b=new THREE.Mesh(new THREE.BoxGeometry(w,h,d), m||body); b.position.set(x,y,z); boxRig.add(b); return b; }
  box(0.075,0.085,0.34, 0,0,-0.02, body);
  box(0.05,0.05,0.40, 0,0.012,-0.34, accent);
  const barrel=new THREE.Mesh(new THREE.CylinderGeometry(0.018,0.018,0.5,10), accent);
  barrel.rotation.x=Math.PI/2; barrel.position.set(0,0.012,-0.4); boxRig.add(barrel);
  box(0.052,0.13,0.07, 0,-0.11,0.04, grey).rotation.x=-0.25;
  box(0.05,0.06,0.16, 0,-0.005,0.18, grey);
  box(0.07,0.11,0.06, 0,0.0,0.26, body);
  box(0.035,0.09,0.05, 0,-0.085,-0.02, grey).rotation.x=0.2;
  box(0.02,0.03,0.02, 0,0.06,-0.12, accent);
  box(0.02,0.025,0.02,0,0.06,0.08, accent);
  boxRig.traverse(o=>{ if(o.isMesh){ o.castShadow=false; o.receiveShadow=false; } });
})();
// muzzle flash (at the barrel tip)
const wpnFlash=new THREE.Sprite(new THREE.SpriteMaterial({ map:GLOW, color:0xffe6a0, transparent:true,
  opacity:0, blending:THREE.AdditiveBlending, depthWrite:false, fog:false }));
wpnFlash.scale.set(0.5,0.5,1); wpnFlash.position.set(0,0.012,-0.66); weapon.add(wpnFlash);
camera.add(weapon);
scene.add(camera);                            // camera in the scene graph -> its children (weapon) render

// VIEWMODEL on its own layer 2 with its OWN soft light, so flashlight/halo don't overexpose it
const WPN_LAYER=2;
camera.layers.enable(WPN_LAYER);              // camera also renders layer 2 (the weapon)
function setWeaponLayer(){ weapon.traverse(o=>o.layers.set(WPN_LAYER)); }
setWeaponLayer();
const wpnFill=new THREE.HemisphereLight(0xc6d0d4, 0x1c2226, 1.2); wpnFill.layers.set(WPN_LAYER); camera.add(wpnFill);
const wpnKey =new THREE.PointLight(0xffeede, 2.4, 5, 1.0); wpnKey.position.set(0.4,0.5,0.3); wpnKey.layers.set(WPN_LAYER); camera.add(wpnKey);

// load the gun model and replace the box rig
new GLTFLoader(manager).load(ASSET+'weapon.glb', (g)=>{
  const m=g.scene; const kill=[];
  m.traverse(o=>{ if(o.isLight||o.isCamera) kill.push(o); o.frustumCulled=false;
    if(o.isMesh){ o.castShadow=false; o.receiveShadow=false; const mt=o.material;
      if(mt){ if(mt.color) mt.color.multiplyScalar(0.7);          // lit by its own soft light (layer 2)
        if('emissive' in mt && mt.emissive) mt.emissiveIntensity=0;
        if('metalness' in mt) mt.metalness=0.35; if('roughness' in mt) mt.roughness=0.65;
        mt.needsUpdate=true; } } });
  kill.forEach(o=>o.parent&&o.parent.remove(o));   // remove sketchfab camera/lamp
  const bb=new THREE.Box3().setFromObject(m), sz=new THREE.Vector3(), ctr=new THREE.Vector3();
  bb.getSize(sz); bb.getCenter(ctr);
  m.position.sub(ctr);                              // model center -> to zero
  const holder=new THREE.Group(); holder.add(m);
  holder.scale.setScalar(WPN_GLB.len/(Math.max(sz.x,sz.y,sz.z)||1));
  holder.rotation.copy(WPN_GLB.rot); holder.position.copy(WPN_GLB.pos);
  weapon.add(holder); boxRig.visible=false;
  holder.traverse(o=>o.layers.set(WPN_LAYER));      // gun onto the viewmodel layer (own light, no overexposure)
  console.log('[nullstern] weapon GLB loaded');
}, undefined, e=>console.warn('[nullstern] weapon GLB failed to load (keeping box rig):', e));

// ---------------------------------------------------------------------
//  GLOBAL LIGHT — dim base so the dark is never absolute
// ---------------------------------------------------------------------
scene.add(new THREE.HemisphereLight(0x9aaaa4, 0x3a4642, 3.0));    // bright base light (floor reads)
const fill=new THREE.DirectionalLight(0xcfe0da, 0.9); fill.position.set(-0.3,1,0.4); scene.add(fill);
scene.add(new THREE.AmbientLight(0x55635f, 1.1));                 // keep shadows from going pure black

// ---------------------------------------------------------------------
//  POST — bloom + retro grade (grain/scan-lines/CA/vignette/pixel)
// ---------------------------------------------------------------------
const composer=new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight), 0.42, 0.7, 0.9);
composer.addPass(bloom);
const grade=new ShaderPass({
  uniforms:{ tDiffuse:{value:null}, uTime:{value:0}, uRes:{value:new THREE.Vector2(innerWidth,innerHeight)} },
  vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position,1.0);} `,
  fragmentShader:`uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
    void main(){
      // light pixel snap (retro crunch, target ~430 rows)
      float px = uRes.y/430.0; vec2 grid = px/uRes;
      vec2 uv = (floor(vUv/grid)+0.5)*grid;
      vec2 q=uv-0.5; float r2=dot(q,q);
      // chromatic aberration toward the edges
      float ca=0.0016+r2*0.006; vec3 c;
      c.r=texture2D(tDiffuse, uv+q*ca).r;
      c.g=texture2D(tDiffuse, uv).g;
      c.b=texture2D(tDiffuse, uv-q*ca).b;
      // desaturation + film contrast
      float l=dot(c,vec3(0.299,0.587,0.114));
      c=mix(vec3(l), c, 0.82);
      c=(c-0.5)*1.12+0.5;
      c=max(c,0.0);
      // NULLSTERN grade: shadows toward dark teal, highlights toward warm amber
      vec3 shTint=vec3(0.80,1.04,1.02), liTint=vec3(1.06,0.99,0.86);
      c*=mix(shTint, liTint, smoothstep(0.0,0.65,l));
      c+=vec3(-0.004,0.012,0.012)*(1.0-l);          // teal tint in shadows
      c*=0.97+0.03;                                  // slightly lifted black
      // scan-lines (softer)
      c*=0.94+0.06*sin(uv.y*uRes.y*1.5);
      // vignette (edges darker, but not black)
      float vig=smoothstep(1.10,0.32,length(q*vec2(1.0,1.12)));
      c*=mix(0.72,1.0,vig);
      // film grain
      c+=(hash(uv*uRes+uTime)-0.5)*0.055;
      gl_FragColor=vec4(max(c,0.0),1.0);
    }`
});
composer.addPass(grade);

addEventListener('resize', ()=>{
  camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight); composer.setSize(innerWidth,innerHeight);
  bloom.setSize(innerWidth,innerHeight); grade.uniforms.uRes.value.set(innerWidth,innerHeight);
});

// ---------------------------------------------------------------------
//  CONTROLS — WASD + mouse aim (raycast to floor) + LMB shoot
// ---------------------------------------------------------------------
// view modes: top-down (default) <-> first-person (V)
let fpMode=false, yaw=Math.PI, pitch=0;     // yaw=PI -> start facing into the hall (toward the door)
const LOOK_SENS=0.0022;

const keys={};
addEventListener('keydown', e=>{
  keys[e.code]=true;
  if(e.code==='KeyM') toggleAmbient();
  if(e.code==='KeyV') toggleView();
  if(e.code==='KeyR') reload();
  if(e.code==='KeyF') kick();
  if(e.code==='KeyE') startMission();
  if(e.code==='Escape') togglePause();
  if(e.code==='Enter' && overEl && overEl.classList.contains('show')) resetGame();
});
addEventListener('keyup',   e=>{ keys[e.code]=false; });

function toggleView(){
  fpMode=!fpMode; playerModel.visible=!fpMode;
  camera.fov = fpMode? 70 : 46;                 // wider FOV in first-person -> see the gun in hand
  camera.updateProjectionMatrix();
  const ce=document.getElementById('cross'); if(ce) ce.style.opacity=fpMode?'1':'0';
  hintEl.style.opacity='1'; hideHintAt=0;
  hintEl.innerHTML = fpMode
    ? 'WASD MOVE&nbsp;·&nbsp;MOUSE LOOK&nbsp;·&nbsp;LMB FIRE&nbsp;·&nbsp;R RELOAD&nbsp;·&nbsp;F KICK&nbsp;·&nbsp;V TOP-DOWN'
    : 'WASD MOVE&nbsp;·&nbsp;LMB FIRE&nbsp;·&nbsp;R RELOAD&nbsp;·&nbsp;F KICK&nbsp;·&nbsp;E START&nbsp;·&nbsp;V FIRST-PERSON';
  if(fpMode) canvas.requestPointerLock();
  else if(document.pointerLockElement===canvas) document.exitPointerLock();
}

const mouseNDC=new THREE.Vector2(0,0);
addEventListener('mousemove', e=>{
  if(fpMode && document.pointerLockElement===canvas){
    yaw   -= e.movementX*LOOK_SENS;             // mouse right -> turn right
    pitch -= e.movementY*LOOK_SENS;             // mouse up    -> look up
    pitch = Math.max(-1.3, Math.min(1.3, pitch));
  } else {
    mouseNDC.x=(e.clientX/innerWidth)*2-1;
    mouseNDC.y=-(e.clientY/innerHeight)*2+1;
  }
});
const raycaster=new THREE.Raycaster();
const groundPlane=new THREE.Plane(new THREE.Vector3(0,1,0), 0);
const aimPoint=new THREE.Vector3(0,0,0);

let started=false, muzzleT=0, shake=0, firing=false;
addEventListener('mousedown', e=>{
  if(e.button!==0) return;
  if(paused) return;
  // grab the cursor only IN-GAME (not on death/menu, so clicks reach the overlay)
  if(started && fpMode && document.pointerLockElement!==canvas){ canvas.requestPointerLock(); return; }
  firing=true;
});
addEventListener('mouseup', e=>{ if(e.button===0) firing=false; });

const intro=document.getElementById('intro');
const hintEl=document.getElementById('hint');
intro.addEventListener('click', ()=>{ intro.classList.add('hide'); started=true; startAmbient(); });

// ---------------------------------------------------------------------
//  AUDIO — ambient + reverb (space) + samples (shot/steps) + music
// ---------------------------------------------------------------------
let actx=null, ambGain=null, ambOn=true, sfxBus=null, reverbBus=null;
let bufShot=null, bufSteps=[], bufDeath=[], bgAudio=null;
let musicOn=true, enemyVoiceOn=true, sfxOn=true;     // separate toggles (ESC menu)
const _lp=new THREE.Vector3(), _lq=new THREE.Quaternion(), _lf=new THREE.Vector3(), _lu=new THREE.Vector3();

function makeReverbIR(sec, decay){
  const rate=actx.sampleRate, len=Math.floor(rate*sec), ir=actx.createBuffer(2,len,rate);
  for(let ch=0;ch<2;ch++){ const d=ir.getChannelData(ch);
    for(let i=0;i<len;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/len, decay); }
  return ir;
}
async function loadBuf(url){
  try{ const r=await fetch(url); const ab=await r.arrayBuffer(); return await actx.decodeAudioData(ab); }
  catch(e){ console.warn('[nullstern] sound failed to load', url, e); return null; }
}
function startAmbient(){
  if(actx){ if(actx.state==='suspended') actx.resume(); return; }
  actx=new (window.AudioContext||window.webkitAudioContext)();
  // buses: dry SFX + reverb (space for shots/steps)
  sfxBus=actx.createGain(); sfxBus.gain.value=1.0; sfxBus.connect(actx.destination);
  const conv=actx.createConvolver(); conv.buffer=makeReverbIR(1.8, 2.4);
  reverbBus=actx.createGain(); reverbBus.gain.value=0.9; reverbBus.connect(conv); conv.connect(actx.destination);
  // uneasy drone
  ambGain=actx.createGain(); ambGain.gain.value=ambOn?0.18:0.0; ambGain.connect(actx.destination);
  [41.2,41.9,61.7].forEach((f,i)=>{ const o=actx.createOscillator(); o.type='sine'; o.frequency.value=f;
    const g=actx.createGain(); g.gain.value=i===2?0.16:0.4; o.connect(g); g.connect(ambGain); o.start(); });
  const nb=actx.createBuffer(1, actx.sampleRate*2, actx.sampleRate);
  const nd=nb.getChannelData(0); for(let i=0;i<nd.length;i++) nd[i]=(Math.random()*2-1)*0.5;
  const noise=actx.createBufferSource(); noise.buffer=nb; noise.loop=true;
  const lp=actx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=480;
  const ng=actx.createGain(); ng.gain.value=0.07; noise.connect(lp); lp.connect(ng); ng.connect(ambGain); noise.start();
  // load the samples
  loadBuf(ASSET+'shot.wav').then(b=>bufShot=b);
  Promise.all([loadBuf(ASSET+'footsteps/step1.wav'),loadBuf(ASSET+'footsteps/step2.wav'),loadBuf(ASSET+'footsteps/step3.wav')])
    .then(a=>bufSteps=a.filter(Boolean));
  Promise.all([loadBuf(ASSET+'enemysounds/h1.mp3'),loadBuf(ASSET+'enemysounds/h2.mp3'),loadBuf(ASSET+'enemysounds/h3.mp3'),loadBuf(ASSET+'enemysounds/h4.mp3')])
    .then(a=>bufDeath=a.filter(Boolean));
}
// listener = camera (for 3D/8D panning of death sounds)
function updateAudioListener(){
  if(!actx) return; const L=actx.listener;
  camera.getWorldPosition(_lp); camera.getWorldQuaternion(_lq);
  _lf.set(0,0,-1).applyQuaternion(_lq); _lu.set(0,1,0).applyQuaternion(_lq);
  if(L.positionX){ L.positionX.value=_lp.x; L.positionY.value=_lp.y; L.positionZ.value=_lp.z;
    L.forwardX.value=_lf.x; L.forwardY.value=_lf.y; L.forwardZ.value=_lf.z; L.upX.value=_lu.x; L.upY.value=_lu.y; L.upZ.value=_lu.z; }
  else { L.setPosition(_lp.x,_lp.y,_lp.z); L.setOrientation(_lf.x,_lf.y,_lf.z,_lu.x,_lu.y,_lu.z); }
}
// positional enemy death sound — heard from where it died (HRTF)
function deathSound(x,y,z){
  if(!actx||!ambOn||!enemyVoiceOn||!bufDeath.length) return;
  const b=bufDeath[(Math.random()*bufDeath.length)|0]; if(!b) return;
  const src=actx.createBufferSource(); src.buffer=b; src.playbackRate.value=0.92+Math.random()*0.16;
  const pan=actx.createPanner(); pan.panningModel='HRTF'; pan.distanceModel='inverse';
  pan.refDistance=2.5; pan.maxDistance=45; pan.rolloffFactor=1.1;
  if(pan.positionX){ pan.positionX.value=x; pan.positionY.value=y+1; pan.positionZ.value=z; }
  else pan.setPosition(x,y+1,z);
  const g=actx.createGain(); g.gain.value=1.0; src.connect(g); g.connect(pan); pan.connect(actx.destination);
  const rg=actx.createGain(); rg.gain.value=0.45; pan.connect(rg); rg.connect(reverbBus);
  src.start();
}
function toggleAmbient(){
  ambOn=!ambOn;
  if(ambGain&&actx) ambGain.gain.setTargetAtTime(ambOn?0.18:0.0, actx.currentTime, 0.3);
  if(bgAudio) bgAudio.muted=!(ambOn&&musicOn);
  refreshPauseLabels();
}
// toggles from the pause menu
function setMusic(v){ musicOn=v; if(bgAudio) bgAudio.muted=!(ambOn&&musicOn); refreshPauseLabels(); }
function setEnemyVoice(v){ enemyVoiceOn=v; refreshPauseLabels(); }
function setSfx(v){ sfxOn=v; refreshPauseLabels(); }
function playBuf(buf, vol, rate, revSend){
  if(!actx||!buf||!ambOn) return;
  const src=actx.createBufferSource(); src.buffer=buf; src.playbackRate.value=rate||1;
  const g=actx.createGain(); g.gain.value=vol; src.connect(g); g.connect(sfxBus);
  if(revSend){ const rg=actx.createGain(); rg.gain.value=revSend; g.connect(rg); rg.connect(reverbBus); }
  src.start();
}
// punchy "bang": shot sample + sub thump + reverb tail
function gunSound(){
  if(!actx||!ambOn||!sfxOn) return; const now=actx.currentTime;
  if(bufShot) playBuf(bufShot, 0.95, 0.82+Math.random()*0.12, 0.55);
  else { const b=actx.createBuffer(1, actx.sampleRate*0.12, actx.sampleRate);
    const d=b.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,2);
    const s=actx.createBufferSource(); s.buffer=b; const bp=actx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=1500;
    const g=actx.createGain(); g.gain.value=0.3; s.connect(bp); bp.connect(g); g.connect(sfxBus); g.connect(reverbBus); s.start(now); }
  const o=actx.createOscillator(); o.type='sine'; o.frequency.setValueAtTime(120,now);
  o.frequency.exponentialRampToValueAtTime(38,now+0.12);
  const og=actx.createGain(); og.gain.setValueAtTime(0.5,now); og.gain.exponentialRampToValueAtTime(0.001,now+0.16);
  o.connect(og); og.connect(sfxBus); o.start(now); o.stop(now+0.18);
}
function footstepSound(){ if(sfxOn && bufSteps.length) playBuf(bufSteps[(Math.random()*bufSteps.length)|0], 0.45, 0.95+Math.random()*0.12, 0.3); }
function kickSound(){
  if(!actx||!ambOn||!sfxOn) return; const now=actx.currentTime;
  const o=actx.createOscillator(); o.type='triangle'; o.frequency.setValueAtTime(230,now);
  o.frequency.exponentialRampToValueAtTime(60,now+0.18);
  const g=actx.createGain(); g.gain.setValueAtTime(0.45,now); g.gain.exponentialRampToValueAtTime(0.001,now+0.22);
  o.connect(g); g.connect(sfxBus); g.connect(reverbBus); o.start(now); o.stop(now+0.24);
}
function startMusic(){
  if(!bgAudio){ bgAudio=new Audio(ASSET+'bg.mp3'); bgAudio.loop=true; bgAudio.volume=0.05; }
  bgAudio.muted=!(ambOn&&musicOn); bgAudio.play().catch(e=>console.warn('[nullstern] music:', e));
}

// ---------------------------------------------------------------------
//  PAUSE / SETTINGS (ESC) — controls + sound toggles
// ---------------------------------------------------------------------
let paused=false;
const pauseEl=document.getElementById('pause');
const optMusic=document.getElementById('optMusic');
const optEnemy=document.getElementById('optEnemy');
const optSfx  =document.getElementById('optSfx');
function refreshPauseLabels(){
  if(optMusic){ optMusic.textContent='MUSIC: '+(musicOn?'ON':'OFF'); optMusic.classList.toggle('off',!musicOn); }
  if(optEnemy){ optEnemy.textContent='ENEMY SFX: '+(enemyVoiceOn?'ON':'OFF'); optEnemy.classList.toggle('off',!enemyVoiceOn); }
  if(optSfx){ optSfx.textContent='WEAPON SFX: '+(sfxOn?'ON':'OFF'); optSfx.classList.toggle('off',!sfxOn); }
}
if(optMusic) optMusic.onclick=()=>setMusic(!musicOn);
if(optEnemy) optEnemy.onclick=()=>setEnemyVoice(!enemyVoiceOn);
if(optSfx)   optSfx.onclick  =()=>setSfx(!sfxOn);
function togglePause(){
  if(!started) return;
  paused=!paused;
  if(pauseEl) pauseEl.classList.toggle('show', paused);
  if(paused){ firing=false; if(document.pointerLockElement===canvas) document.exitPointerLock(); }
  else if(fpMode){ canvas.requestPointerLock(); }
}
refreshPauseLabels();

// ---------------------------------------------------------------------
//  HUD
// ---------------------------------------------------------------------
const clockEl=document.getElementById('clock');
let t0=performance.now(), hideHintAt=0;
function tickHud(t){
  const s=Math.floor((performance.now()-t0)/1000);
  if(clockEl) clockEl.textContent='REC '+String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
}

// ---------------------------------------------------------------------
//  COLLISIONS — push the player out of AABB colliders (along the least-penetration axis)
// ---------------------------------------------------------------------
function resolveCollisions(){
  const p=player.position;
  for(const b of colliders){
    const minX=b.minX-PLAYER_R, maxX=b.maxX+PLAYER_R, minZ=b.minZ-PLAYER_R, maxZ=b.maxZ+PLAYER_R;
    if(p.x>minX && p.x<maxX && p.z>minZ && p.z<maxZ){
      const dl=p.x-minX, dr=maxX-p.x, dt=p.z-minZ, db=maxZ-p.z;
      const m=Math.min(dl,dr,dt,db);
      if(m===dl) p.x=minX; else if(m===dr) p.x=maxX;
      else if(m===dt) p.z=minZ; else p.z=maxZ;
    }
  }
}

// =====================================================================
//  COMBAT: enemies (GLB + animations), shooting, HP, Game Over
// =====================================================================
const hpbar  = document.getElementById('hpbar');
const waveEl = document.getElementById('wave');
const ammoEl = document.getElementById('ammo');
const ammoBox= document.getElementById('ammoBox');
const dmgEl  = document.getElementById('dmg');
const overEl = document.getElementById('over');
const kickEl = document.getElementById('kick');
const promptEl=document.getElementById('prompt');
const lvlEl  = document.getElementById('lvl');
const scoreEl= document.getElementById('score');
const bannerEl=document.getElementById('banner');
const overStats=document.getElementById('overStats');

// --- player state ---
let hp=100, dmgFlash=0;
function updateHP(){
  const r=Math.max(0,hp); hpbar.style.width=r+'%';
  // the lower the HP — the redder
  hpbar.style.background = hp>55 ? 'linear-gradient(90deg,#ff6a3c,#ffc06a)'
                         : hp>28 ? 'linear-gradient(90deg,#ff4a28,#ff8a40)'
                         : '#ff1e16';
  hpbar.style.boxShadow = hp<=28 ? '0 0 10px rgba(255,30,20,.9)' : 'none';
}
function damagePlayer(a){
  if(!started || hp<=0) return;
  hp=Math.max(0, hp-a); updateHP();
  dmgFlash=Math.min(1, dmgFlash + a*0.05);
  if(hp<=0) gameOver();
}
function gameOver(){
  started=false; firing=false; mission=false;
  if(score>record){ record=score; localStorage.setItem(REC_KEY, String(record)); }
  if(overStats) overStats.innerHTML='REACHED LEVEL <b>'+level+'</b> · SCORE <b>'+score+'</b> · BEST <b>'+record+'</b>';
  overEl.classList.add('show');
  if(document.pointerLockElement===canvas) document.exitPointerLock();
}
// defense start — from ANY point by E (no need to walk to the console)
function startMission(){
  if(mission || !started) return;
  mission=true; level=1; levelKills=0; levelTarget=levelTargetFor(1); score=0; applyLevel();
  spawnTimer=1.0; startMusic(); updateScoreHUD(); showBanner('LEVEL 1');
  if(consoleScrMat){ const t2=tex(consoleScreen('ALERT',true),1,1); consoleScrMat.map=t2; consoleScrMat.emissiveMap=t2; consoleScrMat.emissive.set(0xff4030); consoleScrMat.needsUpdate=true; }
  if(promptEl) promptEl.classList.remove('show');
}
function resetGame(){
  for(let i=enemies.length-1;i>=0;i--) removeEnemy(i);
  hp=100; updateHP(); dmgFlash=0; dmgEl.style.opacity='0';
  ammo=AMMO_MAG; reloading=false; ammoBox.classList.remove('reload'); updateAmmoHUD();
  killCount=0; spawnTimer=1.0; kickCd=0; player.position.set(0,0,11);
  overEl.classList.remove('show'); started=true; startAmbient();
  mission=false; startMission();                    // straight into a fresh run
  if(fpMode) canvas.requestPointerLock();
}
overEl.addEventListener('click', resetGame);

// --- shooting / ammo ---
const AMMO_MAG=30, FIRE_RATE=0.092, BULLET_DMG=26, GUN_RANGE=60, RELOAD_TIME=1.3;
let ammo=AMMO_MAG, reloading=false, reloadT=0, fireCd=0, recoil=0;
function updateAmmoHUD(){ ammoEl.textContent = reloading? '··' : ammo; }
function reload(){
  if(reloading || ammo===AMMO_MAG || !started) return;
  reloading=true; reloadT=RELOAD_TIME; ammoBox.classList.add('reload'); updateAmmoHUD();
  if(actx){ const o=actx.createOscillator(), g=actx.createGain(); o.type='square'; o.frequency.value=120;
    g.gain.setValueAtTime(0.12,actx.currentTime); g.gain.exponentialRampToValueAtTime(0.001,actx.currentTime+0.12);
    o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime+0.13); }
}
// (gunSound is defined in the audio section above — sample + sub thump + reverb)

// hit sparks (pool)
const sparks=[];
for(let i=0;i<18;i++){ const s=new THREE.Sprite(new THREE.SpriteMaterial({ map:GLOW, color:0xff5630,
    transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false, fog:false }));
  s.scale.set(0.7,0.7,1); s.visible=false; scene.add(s); sparks.push({s,life:0}); }
let sparkI=0;
function spawnHit(p){ const o=sparks[sparkI=(sparkI+1)%sparks.length]; o.s.position.copy(p);
  o.s.visible=true; o.s.material.opacity=0.95; o.life=0.12; }

// blood on the floor — pool of reused splats (they stay "where shots landed")
const BLOODTEX=tex(bloodTexture(),1,1);
const bloodPool=[];
for(let i=0;i<26;i++){ const m=new THREE.Mesh(new THREE.PlaneGeometry(1,1),
    new THREE.MeshBasicMaterial({ map:BLOODTEX, transparent:true, opacity:0, depthWrite:false, fog:true,
      polygonOffset:true, polygonOffsetFactor:-2 }));
  m.rotation.x=-Math.PI/2; m.position.y=0.05; m.visible=false; scene.add(m); bloodPool.push(m); }
let bloodI=0;
function bloodSplat(x,z,s){ const m=bloodPool[bloodI=(bloodI+1)%bloodPool.length];
  m.position.set(x,0.05,z); m.scale.set(s,s,1); m.rotation.z=Math.random()*7; m.visible=true; m.material.opacity=0.9; }

// HP bar above the enemy (canvas sprite, always facing the camera)
function makeBar(){
  const c=document.createElement('canvas'); c.width=64; c.height=10;
  const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace;
  const spr=new THREE.Sprite(new THREE.SpriteMaterial({ map:t, transparent:true, depthTest:true, depthWrite:false, fog:false }));
  spr.scale.set(1.1,0.18,1); scene.add(spr);
  return { spr, c, t };
}
function drawBar(bar, r){
  const x=bar.c.getContext('2d'); x.clearRect(0,0,64,10);
  x.fillStyle='rgba(10,4,4,0.85)'; x.fillRect(0,0,64,10);
  x.fillStyle = r>0.5?'#ffd23a':(r>0.25?'#ff7a30':'#ff2e22'); x.fillRect(1,1,Math.max(0,62*r),8);
  x.strokeStyle='rgba(255,200,150,0.45)'; x.lineWidth=1; x.strokeRect(0.5,0.5,63,9);
  bar.t.needsUpdate=true;
}

// obstacles for steering + pushing out of colliders (like the player)
function inAnyCollider(x,z,r){ for(const b of colliders){ if(x>b.minX-r&&x<b.maxX+r&&z>b.minZ-r&&z<b.maxZ+r) return true; } return false; }
function resolveEnemyCollision(p,r){
  for(const b of colliders){ const minX=b.minX-r,maxX=b.maxX+r,minZ=b.minZ-r,maxZ=b.maxZ+r;
    if(p.x>minX&&p.x<maxX&&p.z>minZ&&p.z<maxZ){ const dl=p.x-minX,dr=maxX-p.x,dt=p.z-minZ,db=maxZ-p.z,m=Math.min(dl,dr,dt,db);
      if(m===dl)p.x=minX; else if(m===dr)p.x=maxX; else if(m===dt)p.z=minZ; else p.z=maxZ; } }
  const lx=ROOM.hx-0.5, lz=ROOM.hz-0.5;
  if(p.x<-lx)p.x=-lx; if(p.x>lx)p.x=lx; if(p.z<-lz)p.z=-lz; if(p.z>lz)p.z=lz;
}

// tracer (one reused line)
const tracerGeo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]);
const tracer=new THREE.Line(tracerGeo, new THREE.LineBasicMaterial({ color:0xffd28a, transparent:true,
  opacity:0, blending:THREE.AdditiveBlending, depthWrite:false, fog:false }));
tracer.frustumCulled=false; scene.add(tracer);
let tracerLife=0;
const _o=new THREE.Vector3(), _d=new THREE.Vector3();
function fireOneShot(){
  ammo--; fireCd=FIRE_RATE; muzzleT=0.05; shake=Math.max(shake,0.3); recoil=Math.min(1,recoil+0.5);
  muzzle.intensity=11; muzzleSpr.material.opacity=0.95; wpnFlash.material.opacity=0.95;
  updateAmmoHUD(); gunSound();
  // ray: in FP — from camera along the view; top-down — from player along body facing
  if(fpMode){ camera.getWorldPosition(_o); camera.getWorldDirection(_d); }
  else { _o.set(player.position.x, 1.2, player.position.z); _d.set(Math.sin(yaw),0,Math.cos(yaw)); }
  _d.normalize(); raycaster.set(_o, _d); raycaster.far=GUN_RANGE; raycaster.near=0;
  const hits=raycaster.intersectObjects(hitboxes, false);
  let endLen=GUN_RANGE;
  if(hits.length){ const h=hits[0]; endLen=h.distance; const e=h.object.userData.enemy;
    spawnHit(h.point);
    if(e && e.state!=='dying'){
      const zoneY=h.point.y - e.container.position.y;     // hit height
      const head=zoneY>1.5, leg=zoneY<0.7;
      e.hp -= head?260:(leg?BULLET_DMG*0.7:BULLET_DMG);
      bloodSplat(h.point.x, h.point.z, head?2.0:1.4+Math.random());
      drawBar(e.bar, Math.max(0,e.hp/ENEMY.hp));
      if(e.hp<=0){
        if(head)      startRagdoll(e, new THREE.Vector3(_d.x*3.5, 3.6, _d.z*3.5), new THREE.Vector3(-8,0,0));        // ragdoll back like a rag
        else if(leg)  startRagdoll(e, new THREE.Vector3(_d.x*1.6, 1.0, _d.z*1.6), new THREE.Vector3(5.5,(Math.random()-0.5)*3,(Math.random()-0.5)*7)); // legs buckle
        else          startRagdoll(e, new THREE.Vector3(_d.x*4.2, 2.3, _d.z*4.2), new THREE.Vector3((Math.random()-0.5)*3,0,(Math.random()-0.5)*9));   // flies back
      } else {
        knockback(e, _d, 1.6, 0.22);                       // alive — feels the bullet (knockback + flinch)
      }
    }
  }
  // tracer
  const arr=tracerGeo.attributes.position.array;
  const sx=_o.x+_d.x*0.6, sy=_o.y+_d.y*0.6, sz=_o.z+_d.z*0.6;
  arr[0]=sx; arr[1]=sy; arr[2]=sz;
  arr[3]=_o.x+_d.x*endLen; arr[4]=_o.y+_d.y*endLen; arr[5]=_o.z+_d.z*endLen;
  tracerGeo.attributes.position.needsUpdate=true; tracer.material.opacity=0.8; tracerLife=0.05;
}

// --- ENEMIES: load model + animations ---
const ENEMY_YAW = 0;            // if the enemy walks backwards — set Math.PI
const ENEMY = { speed:1.7, hp:100, dps:14, attackRange:1.7, leaveRange:2.6, max:5, interval:5.0 };
const GRAV=15, KICK_CD=4.0;     // ragdoll gravity, kick cooldown
const gltfLoader=new GLTFLoader(manager);
let enemyProto=null, walkClip=null, attackClip=null, enemyK=1, enemyFeet=0, enemiesReady=false;
const enemies=[], hitboxes=[];
let spawnTimer=3.0, killCount=0, mission=false, kickCd=0;

// --- LEVELS / SCORE / RECORD (endless ramp-up) ---
const REC_KEY='nullstern.record';
let level=1, levelKills=0, levelTarget=8, score=0;
let record = (parseInt(localStorage.getItem(REC_KEY),10) || 0);
{ const mb=document.getElementById('menuBest'); if(mb) mb.textContent=record; }   // record in the menu
function levelTargetFor(l){ return 4 + l*2; }                    // shorter levels -> difficulty ramps faster
function applyLevel(){                                            // each level — noticeably harder
  ENEMY.speed    = 1.7 + level*0.3;
  ENEMY.hp       = 90  + (level-1)*32;
  ENEMY.dps      = 12  + level*2.2;
  ENEMY.max      = Math.min(3 + level, 10);
  ENEMY.interval = Math.max(0.7, 3.6 - level*0.45);
}
function onEnemyKilled(){
  score++; levelKills++;
  if(levelKills>=levelTarget){ level++; levelKills=0; levelTarget=levelTargetFor(level); applyLevel(); showBanner('LEVEL '+level); }
  updateScoreHUD();
}
function updateScoreHUD(){
  if(lvlEl)   lvlEl.textContent='LEVEL '+level;
  if(scoreEl) scoreEl.textContent='SCORE '+score+'  ·  BEST '+Math.max(record,score);
}
let bannerT=0;
function showBanner(txt){ if(!bannerEl) return; bannerEl.textContent=txt; bannerEl.classList.add('show'); bannerT=1.8; }

function stripHips(clip){ if(!clip) return; clip.tracks=clip.tracks.filter(tr=>!(tr.name.endsWith('.position')&&/Hips/i.test(tr.name))); }
Promise.all([ gltfLoader.loadAsync(ASSET+'enemy.glb'), gltfLoader.loadAsync(ASSET+'udar.glb') ])
  .then(([gE,gU])=>{
    enemyProto=gE.scene;
    walkClip   = gE.animations[0] || null;  stripHips(walkClip);   // walk "in place"
    attackClip = gU.animations[0] || null;                          // attack (same mixamorig_* bones)
    enemyProto.traverse(o=>{ if(o.isMesh){ o.frustumCulled=false; o.castShadow=true; o.receiveShadow=true; } });
    const bb=new THREE.Box3().setFromObject(enemyProto), sz=new THREE.Vector3(); bb.getSize(sz);
    enemyK = 1.85/(sz.y||1); enemyFeet = bb.min.y;
    enemiesReady=true;
    console.log('[nullstern] enemies loaded (scale '+enemyK.toFixed(3)+'); walk:'+!!walkClip+' udar:'+!!attackClip);
  })
  .catch(e=>console.warn('[nullstern] enemies failed to load:', e));

function spawnPoint(){
  for(let i=0;i<24;i++){
    const x=(Math.random()*2-1)*(ROOM.hx-2.5), z=(Math.random()*2-1)*(ROOM.hz-2.5);
    if(Math.hypot(x-player.position.x, z-player.position.z) > 9) return new THREE.Vector3(x,0,z);
  }
  return new THREE.Vector3((Math.random()*2-1)*(ROOM.hx-3), 0, -ROOM.hz+3);
}
function makeCapsuleFX(pos){
  const g=new THREE.Group(); g.position.copy(pos);
  const mat=new THREE.MeshBasicMaterial({ color:PHOSPH, transparent:true, opacity:0,
    blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide, fog:false });
  const cyl=new THREE.Mesh(new THREE.CylinderGeometry(0.62,0.62,2.1,20,1,true), mat); cyl.position.y=1.05; g.add(cyl);
  const core=new THREE.Sprite(new THREE.SpriteMaterial({ map:GLOW, color:PHOSPH, transparent:true, opacity:0,
    blending:THREE.AdditiveBlending, depthWrite:false, fog:false })); core.scale.set(1.8,3.2,1); core.position.y=1.05; g.add(core);
  const ring=new THREE.Mesh(new THREE.RingGeometry(0.55,0.9,28),
    new THREE.MeshBasicMaterial({ color:PHOSPH, transparent:true, opacity:0, side:THREE.DoubleSide,
      blending:THREE.AdditiveBlending, depthWrite:false, fog:false })); ring.rotation.x=-Math.PI/2; ring.position.y=0.04; g.add(ring);
  const light=new THREE.PointLight(PHOSPH, 0, 9, 2.0); light.position.y=1.0; g.add(light);
  scene.add(g);
  return { g, mat, core, ring, light, cyl };
}
function spawnEnemy(){
  if(!enemiesReady || !enemyProto) return;
  const pos=spawnPoint();
  const model=SkeletonUtils.clone(enemyProto);
  model.scale.setScalar(0.0001); model.visible=false; model.position.y=-enemyFeet*enemyK;
  const container=new THREE.Group(); container.position.copy(pos); container.add(model); scene.add(container);
  const mixer=new THREE.AnimationMixer(model);
  const walkAction   = walkClip?   mixer.clipAction(walkClip)   : null;
  const attackAction = attackClip? mixer.clipAction(attackClip) : null;
  if(walkAction){ walkAction.play(); }
  const hb=new THREE.Mesh(new THREE.CapsuleGeometry(0.45,1.0,4,8), new THREE.MeshBasicMaterial({ visible:false }));
  hb.visible=false; scene.add(hb);
  const e={ container, model, mixer, walkAction, attackAction, hb, hp:ENEMY.hp,
            state:'spawning', spawnT:0, fx:makeCapsuleFX(pos), revealed:false, dieT:0,
            vel:new THREE.Vector3(), angVel:new THREE.Vector3(), sq:0, sqv:0, flinch:0,
            bar:makeBar() };
  e.bar.spr.visible=false; drawBar(e.bar, 1);
  hb.userData.enemy=e; enemies.push(e); hitboxes.push(hb);
}
function toAttack(e){ e.state='attacking'; if(!e.attackAction) return;
  e.attackAction.reset().play();
  if(e.walkAction) e.walkAction.crossFadeTo(e.attackAction, 0.25, false); }
function toWalk(e){ e.state='walking'; if(!e.walkAction){ return; }
  e.walkAction.reset().play();
  if(e.attackAction) e.attackAction.crossFadeTo(e.walkAction, 0.25, false); }
// bullet knockback (a live enemy feels the hit)
function knockback(e, dir, power, flinch){ e.vel.x+=dir.x*power; e.vel.z+=dir.z*power; e.sqv+=1.4; e.flinch=Math.min(0.55,e.flinch+flinch); }
// transition to ragdoll (physics corpse). If already ragdolling — just add impulse.
function startRagdoll(e, vel, angVel){
  if(e.state==='dying'){ e.vel.add(vel); e.angVel.add(angVel); e.sqv+=3; return; }
  e.state='dying'; e.dieT=0; killCount++;
  const hi=hitboxes.indexOf(e.hb); if(hi>=0) hitboxes.splice(hi,1); scene.remove(e.hb);
  // DO NOT fade to the bind pose (that caused the T-pose) — FREEZE the current animation frame
  if(e.walkAction)   e.walkAction.paused=true;
  if(e.attackAction) e.attackAction.paused=true;
  e.bar.spr.visible=false; e.model.rotation.x=0;
  e.vel.copy(vel); e.angVel.copy(angVel); e.sqv+=3.5;
  // guarantee a topple: add lean if the impulse is weak
  if(Math.abs(e.angVel.x)<2 && Math.abs(e.angVel.z)<2){ e.angVel.x += (Math.random()<0.5?-1:1)*(4+Math.random()*3); }
  bloodSplat(e.container.position.x, e.container.position.z, 3.2+Math.random()*1.6);
  deathSound(e.container.position.x, e.container.position.y, e.container.position.z);   // positional (8D)
  onEnemyKilled();                                                                       // score + levels
}
// KICK — launches enemies in front (cooldown)
function kick(){
  if(!started || kickCd>0) return;
  kickCd=KICK_CD; kickSound(); shake=Math.max(shake,0.5); recoil=Math.min(1,recoil+0.35);
  let kx,kz; if(fpMode){ camera.getWorldDirection(_d); kx=_d.x; kz=_d.z; } else { kx=Math.sin(yaw); kz=Math.cos(yaw); }
  const l=Math.hypot(kx,kz)||1; kx/=l; kz/=l;
  for(const e of enemies){ if(e.state==='dying'||e.state==='spawning') continue;
    const ex=e.container.position.x-player.position.x, ez=e.container.position.z-player.position.z, d=Math.hypot(ex,ez);
    if(d>2.7) continue; if((ex*kx+ez*kz)/(d||1) < 0.35) continue;       // only in front
    startRagdoll(e, new THREE.Vector3(kx*10, 4.6, kz*10),
      new THREE.Vector3((Math.random()-0.5)*6,(Math.random()-0.5)*4,(Math.random()-0.5)*11));
  }
}
function removeEnemy(i){
  const e=enemies[i]; scene.remove(e.container);
  if(e.fx && e.fx.g.parent) scene.remove(e.fx.g);
  if(e.bar) scene.remove(e.bar.spr);
  const hi=hitboxes.indexOf(e.hb); if(hi>=0) hitboxes.splice(hi,1); scene.remove(e.hb);
  enemies.splice(i,1);
}
function updateCombat(dt){
  // auto-fire + reload + kick cooldown
  fireCd-=dt; if(kickCd>0) kickCd=Math.max(0,kickCd-dt);
  if(reloading){ reloadT-=dt; if(reloadT<=0){ reloading=false; ammo=AMMO_MAG; ammoBox.classList.remove('reload'); updateAmmoHUD(); } }
  if(started && firing && !reloading){ if(ammo>0){ if(fireCd<=0) fireOneShot(); } else reload(); }

  // start hint (E anywhere, until defense begins)
  if(promptEl) promptEl.classList.toggle('show', !mission && started);
  if(bannerT>0){ bannerT-=dt; if(bannerT<=0 && bannerEl) bannerEl.classList.remove('show'); }

  // spawn (only after defense starts -> mission)
  if(started && mission && enemiesReady){
    let alive=0; for(const e of enemies) if(e.state!=='dying') alive++;
    spawnTimer-=dt;
    if(spawnTimer<=0){ if(alive<ENEMY.max) spawnEnemy(); spawnTimer=ENEMY.interval; }
  }

  for(let i=enemies.length-1;i>=0;i--){
    const e=enemies[i]; e.mixer.update(dt);
    e.hb.position.set(e.container.position.x, 0.9, e.container.position.z);
    const dx=player.position.x-e.container.position.x, dz=player.position.z-e.container.position.z;
    const dist=Math.hypot(dx,dz);

    if(e.state==='spawning'){
      e.spawnT+=dt; const f=e.fx, tt=e.spawnT;
      if(tt<1.0){ const k=tt, fl=0.85+0.15*Math.sin(tt*40);
        f.cyl.scale.y=0.1+0.9*k; f.mat.opacity=0.7*k*fl; f.core.material.opacity=0.55*k;
        f.ring.material.opacity=0.8*k; f.ring.scale.setScalar(0.5+0.7*k); f.light.intensity=11*k*fl;
      } else {
        if(!e.revealed){ e.revealed=true; e.model.visible=true; }
        const k=Math.min(1,(tt-1.0)/0.5);
        e.model.scale.setScalar(0.0001+enemyK*k);
        f.mat.opacity=0.7*(1-k); f.core.material.opacity=0.55*(1-k); f.ring.material.opacity=0.8*(1-k); f.light.intensity=11*(1-k);
        if(tt>=1.5){ e.state='walking'; e.model.scale.setScalar(enemyK); if(e.fx.g.parent) scene.remove(e.fx.g); e.bar.spr.visible=true; }
      }
      continue;
    }

    if(e.state==='walking' || e.state==='attacking'){
      // direction to the player + obstacle avoidance (steering by angles)
      let ddx=dx/(dist||1), ddz=dz/(dist||1);
      if(inAnyCollider(e.container.position.x+ddx*1.6, e.container.position.z+ddz*1.6, 0.5)){
        for(const a of [0.6,-0.6,1.2,-1.2,1.9,-1.9,2.7,-2.7]){
          const c=Math.cos(a),s=Math.sin(a), nx=ddx*c-ddz*s, nz=ddx*s+ddz*c;
          if(!inAnyCollider(e.container.position.x+nx*1.6, e.container.position.z+nz*1.6, 0.5)){ ddx=nx; ddz=nz; break; }
        }
      }
      if(e.state==='walking'){
        if(dist>ENEMY.attackRange){ e.container.position.x+=ddx*ENEMY.speed*dt; e.container.position.z+=ddz*ENEMY.speed*dt; }
        e.container.rotation.y=Math.atan2(ddx,ddz)+ENEMY_YAW;
        if(dist<=ENEMY.attackRange) toAttack(e);
      } else {
        e.container.rotation.y=Math.atan2(dx,dz)+ENEMY_YAW;
        damagePlayer(ENEMY.dps*dt);
        if(dist>ENEMY.leaveRange) toWalk(e);
      }
      // bullet knockback (decays) + flinch lean + keep on the floor
      e.container.position.x+=e.vel.x*dt; e.container.position.z+=e.vel.z*dt;
      const damp=Math.exp(-9*dt); e.vel.x*=damp; e.vel.z*=damp; e.vel.y=0;
      e.flinch*=Math.exp(-6*dt); e.model.rotation.x=-e.flinch; e.container.position.y=0;
      resolveEnemyCollision(e.container.position, 0.5);
    }
    else if(e.state==='dying'){
      // RAGDOLL: gravity + tumble (topple) + bounce, then sink UNDER THE FLOOR
      e.dieT+=dt; e.vel.y-=GRAV*dt;
      const sink = e.dieT>2.2 ? -1.7*(e.dieT-2.2) : 0;   // after 2.2s the body sinks through the floor
      e.container.position.x+=e.vel.x*dt; e.container.position.y+=e.vel.y*dt; e.container.position.z+=e.vel.z*dt;
      e.container.rotation.x+=e.angVel.x*dt; e.container.rotation.y+=e.angVel.y*dt; e.container.rotation.z+=e.angVel.z*dt;
      if(e.container.position.y<=sink){ e.container.position.y=sink;
        if(e.dieT<2.2){ if(e.vel.y<-0.6){ e.vel.y=-e.vel.y*0.42; e.sqv+=Math.min(5,-e.vel.y*0.9); } else e.vel.y=0;
          e.vel.x*=0.6; e.vel.z*=0.6; e.angVel.multiplyScalar(0.55); }
        else { e.vel.set(0,0,0); }                        // laid down and slowly sinking
      }
      const lx=ROOM.hx-0.4, lz=ROOM.hz-0.4;
      if(Math.abs(e.container.position.x)>lx){ e.container.position.x=Math.sign(e.container.position.x)*lx; e.vel.x*=-0.45; e.angVel.y+=3; e.sqv+=1.5; }
      if(Math.abs(e.container.position.z)>lz){ e.container.position.z=Math.sign(e.container.position.z)*lz; e.vel.z*=-0.45; e.angVel.z+=3; e.sqv+=1.5; }
      e.vel.x*=(1-0.7*dt); e.vel.z*=(1-0.7*dt); e.angVel.multiplyScalar(1-0.9*dt);
      if(e.dieT>=3.8){ removeEnemy(i); continue; }
    }

    // jelly squash (spring) — "rubberiness", + corpse fade
    e.sqv += (-42*e.sq - 9*e.sqv)*dt; e.sq += e.sqv*dt;
    if(e.sq>0.6)e.sq=0.6; if(e.sq<-0.4)e.sq=-0.4;
    let fade=1; if(e.state==='dying' && e.dieT>3.2) fade=Math.max(0,1-(e.dieT-3.2)/0.6);
    const sc=enemyK*fade;
    e.model.scale.set(sc*(1+e.sq*0.5), sc*(1-e.sq), sc*(1+e.sq*0.5));

    // HP bar above the head (alive)
    if(e.state==='walking'||e.state==='attacking'){
      e.bar.spr.position.set(e.container.position.x, e.container.position.y+2.15, e.container.position.z);
      drawBar(e.bar, Math.max(0,e.hp/ENEMY.hp));
    }
  }

  // sparks / tracer / damage flash / recoil decay
  for(const o of sparks){ if(o.life>0){ o.life-=dt; const k=Math.max(0,o.life/0.12);
    o.s.material.opacity=0.95*k; if(o.life<=0) o.s.visible=false; } }
  if(tracerLife>0){ tracerLife-=dt; tracer.material.opacity=Math.max(0,tracerLife/0.05)*0.8; }
  if(dmgFlash>0) dmgFlash=Math.max(0,dmgFlash-dt*1.5);
  dmgEl.style.opacity=String(dmgFlash);
  recoil=Math.max(0,recoil-dt*5);

  // HUD
  let al=0; for(const e of enemies) if(e.state!=='dying') al++;
  if(waveEl) waveEl.textContent = mission ? ('HOSTILES '+al+'  ·  NEXT '+Math.max(0,levelTarget-levelKills)) : 'STANDBY';
  if(kickEl){ kickEl.textContent = kickCd>0 ? ('KICK '+kickCd.toFixed(1)+'s') : 'KICK [F]';
    kickEl.style.opacity = kickCd>0 ? '0.4' : '1'; }
}
updateHP(); updateAmmoHUD(); updateScoreHUD();

// ---------------------------------------------------------------------
//  LOOP
// ---------------------------------------------------------------------
const clock=new THREE.Clock();
let bob=0, stepDist=0;
camera.position.copy(player.position).add(CAM_OFF);
camera.lookAt(player.position.x, 1.0, player.position.z);

function animate(){
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),0.05), t=clock.elapsedTime;

  // paused — freeze the game but keep rendering the frame
  if(paused){ grade.uniforms.uTime.value=t; composer.render(); return; }

  // --- view / body turn depending on mode ---
  if(fpMode){
    player.rotation.y=yaw;                       // first-person: body turns with the mouse
  } else {
    // top-down: ray from camera through cursor onto floor -> body faces the aim point
    raycaster.setFromCamera(mouseNDC, camera);
    raycaster.ray.intersectPlane(groundPlane, aimPoint);
    const ang=Math.atan2(aimPoint.x-player.position.x, aimPoint.z-player.position.z);
    let cur=player.rotation.y, diff=((ang-cur+Math.PI)%(Math.PI*2))-Math.PI;
    player.rotation.y=cur+diff*Math.min(1, dt*12);
    yaw=player.rotation.y;                        // keep yaw in sync for switching to FP
  }

  // --- WASD movement ---
  let moving=false;
  if(started){
    const sp=(keys['ShiftLeft']?6.5:3.6)*dt;
    let f=0,s=0;
    if(keys['KeyW']||keys['ArrowUp'])    f+=1;
    if(keys['KeyS']||keys['ArrowDown'])  f-=1;
    if(keys['KeyD']||keys['ArrowRight']) s+=1;
    if(keys['KeyA']||keys['ArrowLeft'])  s-=1;
    if(f||s){
      moving=true; const inv=1/Math.hypot(f,s); f*=inv; s*=inv;
      if(fpMode){                                  // relative to view: forward=(sin,cos), right=(-cos,sin)
        player.position.x+=(f*Math.sin(yaw)-s*Math.cos(yaw))*sp;
        player.position.z+=(f*Math.cos(yaw)+s*Math.sin(yaw))*sp;
      } else {                                     // world axes (W = away from camera, into depth)
        player.position.x+=s*sp; player.position.z+=-f*sp;
      }
      bob+=dt*10; if(!hideHintAt) hideHintAt=t+2.5;
      // footsteps by distance travelled (faster when sprinting)
      stepDist += sp; if(stepDist > (keys['ShiftLeft']?2.1:1.7)){ stepDist=0; footstepSound(); }
    }
    player.position.y=Math.sin(bob)*0.04*(moving?1:0);
    resolveCollisions();
  }
  if(hideHintAt && t>hideHintAt) hintEl.style.opacity='0';

  // --- camera + flashlight per mode ---
  if(shake>0) shake=Math.max(0,shake-dt*3);
  if(fpMode){
    const EY=1.62, cp=Math.cos(pitch);
    camera.position.set(player.position.x, player.position.y+EY, player.position.z);
    if(shake>0){ camera.position.x+=(Math.random()-0.5)*shake*0.25;
      camera.position.y+=(Math.random()-0.5)*shake*0.18; }
    camera.lookAt(
      player.position.x+Math.sin(yaw)*cp,
      player.position.y+EY+Math.sin(pitch),
      player.position.z+Math.cos(yaw)*cp);
    flashTarget.position.set(0, 1.55+Math.sin(pitch)*6, cp*6);   // shines exactly where I look
    // rifle in hands: sway while walking + recoil back/up
    weapon.visible=true;
    weapon.position.set(wpnHome.x+Math.sin(bob)*0.006,
                        wpnHome.y+Math.cos(bob*0.5)*0.004 - recoil*0.04,
                        wpnHome.z + recoil*0.10);
    weapon.rotation.set(-recoil*0.45, 0, 0);
  } else {
    const camTarget=player.position.clone().add(CAM_OFF);
    if(shake>0){ camTarget.x+=(Math.random()-0.5)*shake*0.6; camTarget.y+=(Math.random()-0.5)*shake*0.4; }
    camera.position.lerp(camTarget, 1-Math.pow(0.001, dt));
    camera.lookAt(player.position.x, 1.0, player.position.z);
    flashTarget.position.set(0, -0.6, 4.2);                     // down-forward -> lights the FLOOR in front of the player
    weapon.visible=false;                                       // viewmodel only in first-person
  }

  // --- lamp flicker (the central one is dying) ---
  lamps.forEach(L=>{
    let k;
    if(L.flick){ k=0.5+0.5*Math.abs(Math.sin(t*11+L.ph))*(Math.random()<0.07?0.25:1.0); }
    else { k=0.93+0.07*Math.sin(t*2.3+L.ph); }
    L.bulbMat.emissiveIntensity=L.base*k;
    L.gl.material.opacity=L.glBase*k; L.pt.intensity=L.ptBase*k;
    L.cone.material.opacity=0.05*k;
  });

  // --- rack indicators blink ---
  rackLeds.forEach(o=>{ o.led.material.emissiveIntensity=1.0+Math.sin(t*3+o.ph)*0.9; });

  // --- door breathes green ---
  door.light.intensity=12+Math.sin(t*1.4)*2.5;
  door.stripeMat.emissiveIntensity=1.5+Math.sin(t*1.4)*0.4;

  // --- muzzle flash fades (light + sprites on player and rifle) ---
  if(muzzleT>0){ muzzleT-=dt;
    const f=Math.max(0,muzzleT/0.05);
    muzzle.intensity=11*f; muzzleSpr.material.opacity=0.95*f; wpnFlash.material.opacity=0.95*f;
    if(muzzleT<=0){ muzzle.intensity=0; muzzleSpr.material.opacity=0; wpnFlash.material.opacity=0; }
  }

  // --- combat: enemies, shooting, HP ---
  updateAudioListener();
  updateCombat(dt);

  // --- dust drifts slowly upward ---
  const dp=dustGeo.attributes.position.array;
  for(let i=0;i<DUST_N;i++){ dp[i*3+1]+=dt*(0.15+ (i%5)*0.04);
    dp[i*3]+=Math.sin(t*0.3+i)*dt*0.04;
    if(dp[i*3+1]>ROOM.wallH){ dp[i*3+1]=0; dp[i*3]=(Math.random()-0.5)*ROOM.hx*2; dp[i*3+2]=(Math.random()-0.5)*ROOM.hz*2; } }
  dustGeo.attributes.position.needsUpdate=true;

  grade.uniforms.uTime.value=t;
  tickHud(t);
  composer.render();
}
animate();
console.log('[nullstern] scene loaded');
