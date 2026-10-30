import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// ---- the five sliders (pose name above, slider below) ----
const SLIDERS = [
  { id:'squat',  label:'Deep squat',               sub:'garland pose, feet planted' },
  { id:'stance', label:'Wider stance',             sub:'feet apart' },
  { id:'bend',   label:'Bend and touch toes',      sub:'forward fold' },
  { id:'bust',   label:'Running: bust bounce',     sub:'amplitude' },
  { id:'glute',  label:'Running: glute motion',    sub:'amplitude' },
];
const val = { squat:0, stance:0, bend:0, bust:0, glute:0 };
let running = true;

const rows = document.getElementById('rows');
for (const s of SLIDERS) {
  const d = document.createElement('div'); d.className = 'row';
  d.innerHTML = `<div class="t"><span>${s.label} <span class="sub">${s.sub}</span></span><span id="v_${s.id}">0%</span></div>
    <input type="range" id="s_${s.id}" min="0" max="1" step="0.001" value="0" aria-label="${s.label}">`;
  rows.appendChild(d);
  const inp = d.querySelector('input');
  const upd = () => { val[s.id] = +inp.value; inp.style.setProperty('--p', (inp.value*100)+'%'); document.getElementById('v_'+s.id).textContent = Math.round(inp.value*100)+'%'; };
  inp.addEventListener('input', upd); upd();
  s.inp = inp; s.upd = upd;
}
document.getElementById('reset').onclick = () => { for (const s of SLIDERS) { s.inp.value = 0; s.upd(); } };
const runBtn = document.getElementById('run');
runBtn.onclick = () => { running = !running; runBtn.classList.toggle('on', running); runBtn.textContent = 'Run: ' + (running ? 'on' : 'off'); };
const panel = document.getElementById('panel');
document.getElementById('grab').addEventListener('click', e => { if (e.target.closest('button')) return; panel.classList.toggle('min'); });

// ---- three.js scene ----
const host = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference:'high-performance', preserveDrawingBuffer:true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = 0.9;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
host.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b1e24);
const pm = new THREE.PMREMGenerator(renderer);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.75;
const key = new THREE.DirectionalLight(0xfff1e0, 1.05); key.position.set(2.5, 4, 3); key.castShadow = true;
key.shadow.mapSize.set(1024, 1024); Object.assign(key.shadow.camera, { left:-1.6, right:1.6, top:2.2, bottom:-0.4, near:0.5, far:12 }); key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02;
scene.add(key);
const rim = new THREE.DirectionalLight(0x9ab8ff, 0.45); rim.position.set(-3, 2.5, -3); scene.add(rim);
const floor = new THREE.Mesh(new THREE.CircleGeometry(3, 64), new THREE.MeshStandardMaterial({ color:0x2a2e36, roughness:0.95 }));
floor.rotation.x = -Math.PI/2; floor.receiveShadow = true; scene.add(floor);

const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 50);
const home = { pos:new THREE.Vector3(0, 1.05, 4.0), tgt:new THREE.Vector3(0, 0.85, 0) };
camera.position.copy(home.pos);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(home.tgt); controls.enableDamping = true; controls.dampingFactor = 0.09;
controls.screenSpacePanning = true; controls.minDistance = 0.7; controls.maxDistance = 9; controls.maxPolarAngle = Math.PI * 0.55;
controls.rotateSpeed = 0.8; controls.zoomSpeed = 1.0;
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
controls.update();
renderer.domElement.style.touchAction = 'none';
function resize() {
  const w = host.clientWidth, h = host.clientHeight; renderer.setSize(w, h, false); camera.aspect = w/h;
  camera.fov = w/h < 0.8 ? 46 : 38; camera.updateProjectionMatrix();
}
function fitView() {   // keep the model centred in the area above the slider panel
  const w = host.clientWidth, h = host.clientHeight, top = panel.getBoundingClientRect().top;
  const cover = Math.max(0, Math.min(h*0.6, h - top)); camera.setViewOffset(w, h, 0, cover/2, w, h);
}
addEventListener('resize', resize); resize();
renderer.domElement.addEventListener('dblclick', () => { camera.position.copy(home.pos); controls.target.copy(home.tgt); });
const hint = document.getElementById('hint'); setTimeout(() => hint.style.opacity = 0, 6000);

// ---- pose engine (same maths as the Blender drivers) ----
let POSE = null, bones = {}, rest = {}, morphMeshes = [], model = null;
const RUN_FPS = 24, STEP = 8;         // frames per running step (8 @ 24 fps = 3 steps/s)
const STATIC_FRAME = 3;               // phase shown when Run is off (bounce at its peak)
const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _q2 = new THREE.Quaternion();
const poseBones = [];
function applyPose(frame) {
  const S = { sq:val.squat, st:val.stance, bd:val.bend };
  const b = val.bust, g = val.glute;
  const ph = 2*Math.PI*(frame-1)/STEP;
  for (const name of poseBones) {
    const bone = bones[name], r = rest[name], pd = POSE[name];
    let qx=0, qy=0, qz=0, qw=1, lx=0, ly=0, lz=0, sx=1, sy=1, sz=1;
    if (pd) for (const k of ['sq','st','bd']) { const e = pd[k], s = S[k]; if (!e || !s) continue;
      qx += s*e.q[0]; qy += s*e.q[1]; qz += s*(e.q[2]); qw += s*(e.q[3]-1); lx += s*e.l[0]; ly += s*e.l[1]; lz += s*e.l[2]; }
    if (name.startsWith('breast_')) { const sg = name.endsWith('_l') ? 1 : -1;
      lx += b*sg*0.004*Math.sin(ph); ly += b*0.010*Math.cos(ph); lz += b*0.034*Math.sin(ph); }
    if (name.startsWith('glute_')) { const sg = name.endsWith('_l') ? 1 : -1, a = Math.PI*(frame-1)/STEP + (sg>0 ? 0 : Math.PI);
      ly += g*0.006*Math.cos(a-0.6); lz += g*(0.013*Math.sin(a-0.6) + 0.007*Math.sin(ph-0.9));
      sx = sz = 1 + g*0.07*Math.sin(a); sy = 1 - g*0.035*Math.sin(a); }
    _q.set(qx, qy, qz, qw).normalize();
    bone.quaternion.copy(r.q).multiply(_q);
    _v.set(lx, ly, lz).applyQuaternion(r.q); bone.position.copy(r.p).add(_v);
    bone.scale.set(r.s.x*sx, r.s.y*sy, r.s.z*sz);
  }
  for (const m of morphMeshes) { const d = m.morphTargetDictionary, inf = m.morphTargetInfluences;
    inf[d.fix_squat] = val.squat; inf[d.fix_stance] = val.stance; inf[d.fix_bend] = val.bend; }
}

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const [gltf, pd] = await Promise.all([loader.loadAsync('./models/her_poser.glb'), fetch('./models/pose_data.json').then(r => r.json())]);
POSE = pd; model = gltf.scene; scene.add(model);
model.traverse(o => {
  if (o.isBone) { bones[o.name] = o; rest[o.name] = { p:o.position.clone(), q:o.quaternion.clone(), s:o.scale.clone() }; }
  if (o.isMesh || o.isSkinnedMesh) {
    o.castShadow = true; o.frustumCulled = false; if (o.name !== 'Body.high-poly') o.receiveShadow = false;
    if (o.morphTargetDictionary && o.morphTargetDictionary.fix_squat !== undefined) morphMeshes.push(o);
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) { if (m.transparent && /hair|lash|brow/i.test(o.name)) { m.transparent = false; m.alphaTest = 0.45; m.depthWrite = true; m.alphaToCoverage = true; }
      if (m.map) m.map.anisotropy = 4; m.envMapIntensity = 0.7;
      if (m.isMeshStandardMaterial && !/eye|cornea|lens/i.test(m.name + o.name) && !/hair/i.test(o.name)) { m.roughness = Math.max(m.roughness, 0.85); if (m.metalness) m.metalness = 0; if (m.isMeshPhysicalMaterial) m.specularIntensity = 0.2; } }
  }
});
for (const n of ['pelvis','spine_01','spine_02','spine_03','neck_01','head','clavicle_l','clavicle_r','upperarm_l','upperarm_r','lowerarm_l','lowerarm_r','hand_l','hand_r','thigh_l','thigh_r','calf_l','calf_r','foot_l','foot_r','ball_l','ball_r','breast_l','breast_r','glute_l','glute_r']) if (bones[n]) poseBones.push(n);
for (const n of Object.keys(POSE)) if (bones[n] && !poseBones.includes(n)) poseBones.push(n);
document.getElementById('load').style.opacity = 0; setTimeout(() => document.getElementById('load').remove(), 500);

// ---- loop ----
let t = 0, last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now(), dt = Math.min((now-last)/1000, 0.1); last = now;
  const active = running && (val.bust > 0 || val.glute > 0);
  if (active) t += dt;
  applyPose(active ? 1 + t*RUN_FPS : STATIC_FRAME);
  fitView();
  controls.update();
  renderer.render(scene, camera);
});
window.__app = { val, scene, camera, controls, bones, model, setVals(o){ for (const s of SLIDERS) if (o[s.id] !== undefined) { s.inp.value = o[s.id]; s.upd(); } }, setRun(r){ running = r; } };
// optional presets via URL hash, e.g. #squat=1&stance=0.5&run=0
{ const h = new URLSearchParams(location.hash.slice(1)); const o = {}; for (const s of SLIDERS) if (h.has(s.id)) o[s.id] = Math.min(1, Math.max(0, +h.get(s.id) || 0));
  window.__app.setVals(o); if (h.get('run') === '0' && running) runBtn.click(); if (h.get('panel') === '0') panel.classList.add('min'); }
