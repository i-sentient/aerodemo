import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

import { beds, COL, bedById } from './ontology.js';
import { state, setMode, onModeChange } from './state.js';
import { glowTexture, makeHologramMaterial, makeClinicalMaterial, makeClinicalXrayMaterial, makeVascularMaterial } from './xray.js';

// Patient figure = real anatomical system layers (GLB) rendered as teal holograms.
import { buildHuman } from './human.js';
import { playTransition, updateHud } from './hud.js';
import { damp } from './utils.js';

const HEX = { stable: 0x5dcaa5, watch: 0xf5a623, critical: 0xe24b4a };
const GLOW = glowTexture();

const HOME = { pos: new THREE.Vector3(0, 1.1, 4.3), look: new THREE.Vector3(0.5, 0.95, 0) }; // look.x>0 shifts the body left, clearing the roster on the right
const PATIENT = { pos: new THREE.Vector3(0, 1.12, 4.1), look: new THREE.Vector3(0, 0.95, 0) };
const HEART = { pos: new THREE.Vector3(0.03, 1.34, 0.82), look: new THREE.Vector3(0.02, 1.31, 0.14) }; // tight close-up centred on the heart

let renderer, composer, renderPass, bloom, camera, canvas;
let floorScene, patientScene, human;
let activeScene, displayMode = 'floor';
const pickables = [], bedNodes = [], flowDots = [];
let ccRing, ccNode;
const camPos = HOME.pos.clone(), camLook = HOME.look.clone();
const raycaster = new THREE.Raycaster(), ptr = new THREE.Vector2();
let reveal = 1, driftT = 0, swapTimer = 0;
let activeLayer = 'skeletal', layerToggleEl = null, floorBody = null;
let heartBtn = null, zoomHeart = false;

function gradientTex(top, bottom) {
  const cv = document.createElement('canvas'); cv.width = 4; cv.height = 256;
  const x = cv.getContext('2d'); const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top); g.addColorStop(1, bottom); x.fillStyle = g; x.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const matte = (hex, r = 0.78, m = 0.05) => new THREE.MeshStandardMaterial({ color: hex, roughness: r, metalness: m });

function labelSprite(id, acuity) {
  const cv = document.createElement('canvas'); cv.width = 320; cv.height = 96; const x = cv.getContext('2d');
  const rr = (a, b, w, h, r) => { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); };
  x.shadowColor = 'rgba(0,0,0,.45)'; x.shadowBlur = 12; x.shadowOffsetY = 3;
  x.fillStyle = 'rgba(18,24,32,.85)'; rr(16, 18, 288, 58, 26); x.fill(); x.shadowColor = 'transparent';
  x.fillStyle = COL[acuity] || COL.empty; x.beginPath(); x.arc(52, 47, 10, 0, 7); x.fill();
  x.fillStyle = '#eaf0f5'; x.font = '700 32px "Segoe UI",Arial'; x.textBaseline = 'middle'; x.fillText(id, 78, 49);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false }));
  s.scale.set(2.4, 0.72, 1); return s;
}

// ---------- floor twin (photoreal-ish, lit) ----------
function normalizeToHeight(root, h = 1.72) {
  root.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(root), size = new THREE.Vector3(); box.getSize(size);
  root.scale.setScalar(h / (size.y || h)); root.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(root); const c = new THREE.Vector3(); box.getCenter(c);
  root.position.x -= c.x; root.position.z -= c.z; root.position.y -= box.min.y;
}

// Command Hub macro view: a clean, light/sterile clinical body console (Rise-UI style).
function buildFloor() {
  floorScene = new THREE.Scene();
  floorScene.background = gradientTex('#eef3f6', '#dce6ec');
  floorScene.add(new THREE.HemisphereLight(0xffffff, 0xc4d0d8, 1.05));
  const key = new THREE.DirectionalLight(0xffffff, 1.0); key.position.set(3, 6, 5); floorScene.add(key);
  const fill = new THREE.DirectionalLight(0xe2edf4, 0.45); fill.position.set(-4, 2, 2); floorScene.add(fill);

  const loader = new GLTFLoader();
  const draco = new DRACOLoader(); draco.setDecoderPath(import.meta.env.BASE_URL + 'draco/gltf/'); loader.setDRACOLoader(draco);
  loader.load(SKELETON_URL, (g) => {
    const root = g.scene; normalizeToHeight(root, 1.72);
    root.traverse((o) => { if (o.isMesh) { o.material = new THREE.MeshStandardMaterial({ color: 0x2f8d8e, roughness: 0.6, metalness: 0.05 }); o.frustumCulled = false; o.castShadow = false; } });
    floorBody = new THREE.Group(); floorBody.add(root); floorScene.add(floorBody);
  }, undefined, (e) => console.warn('[TARS] floor body load failed', e));
}

function buildFloorBed(b) {
  const g = new THREE.Group(); g.position.set(b.pos.x, 0, b.pos.z); g.rotation.y = b.rot;
  const col = HEX[b.patient.acuity];

  const frame = new THREE.Mesh(new RoundedBoxGeometry(1.18, 0.42, 2.28, 3, 0.08), matte(0x363d47)); frame.position.y = 0.32; frame.castShadow = frame.receiveShadow = true; g.add(frame);
  const matt = new THREE.Mesh(new RoundedBoxGeometry(1.02, 0.16, 2.06, 3, 0.06), matte(0x596270)); matt.position.y = 0.58; matt.castShadow = true; g.add(matt);
  const hb = new THREE.Mesh(new RoundedBoxGeometry(1.1, 0.46, 0.14, 3, 0.06), matte(0x2c323b)); hb.position.set(0, 0.58, -1.05); hb.castShadow = true; g.add(hb);
  // reclining figure (matte, abstract)
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.74, 5, 12), matte(0x8b95a2, 0.85)); body.rotation.x = Math.PI / 2; body.position.set(0, 0.7, -0.05); body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 14), matte(0x9aa3b0, 0.8)); head.position.set(0, 0.74, -0.78); head.castShadow = true; g.add(head);

  // subtle status: thin ring + soft pool + small marker light
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.28, 1.4, 48), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; g.add(ring);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 3.0), new THREE.MeshBasicMaterial({ map: GLOW, color: col, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending }));
  pool.rotation.x = -Math.PI / 2; pool.position.y = 0.016; g.add(pool);
  const marker = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.2, roughness: 0.4 })); marker.position.set(0.46, 0.62, -1.0); g.add(marker);

  const lab = labelSprite(b.id, b.patient.acuity); lab.position.set(0, 1.65, 0); g.add(lab);

  const hit = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.6, 2.7), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = 0.8; hit.userData.bedId = b.id; g.add(hit); pickables.push(hit);

  floorScene.add(g);
  bedNodes.push({ b, ring, pool, marker, col, phase: Math.random() * 6.28 });
}

function buildCommandCenter() {
  const CC = new THREE.Vector3(0, 0, 6.2);
  const grp = new THREE.Group(); grp.position.copy(CC); floorScene.add(grp);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 3.0), new THREE.MeshBasicMaterial({ map: GLOW, color: 0x37c8b0, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
  pool.rotation.x = -Math.PI / 2; pool.position.y = 0.02; grp.add(pool);
  const oval = new THREE.Mesh(new THREE.CircleGeometry(1.0, 48), matte(0x122a2a, 0.6)); oval.scale.set(1.7, 1, 1); oval.rotation.x = -Math.PI / 2; oval.position.y = 0.03; grp.add(oval);
  ccRing = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.1, 56), new THREE.MeshBasicMaterial({ color: 0x49e6c8, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
  ccRing.scale.set(1.7, 1, 1); ccRing.rotation.x = -Math.PI / 2; ccRing.position.y = 0.04; grp.add(ccRing);
  ccNode = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 1), new THREE.MeshStandardMaterial({ color: 0x49e6c8, emissive: 0x1d9a86, emissiveIntensity: 0.8, roughness: 0.4 })); ccNode.position.y = 0.32; grp.add(ccNode);

  const cv = document.createElement('canvas'); cv.width = 460; cv.height = 84; const x = cv.getContext('2d');
  x.fillStyle = '#bff3e8'; x.font = '700 32px "Segoe UI",Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('COMMAND CENTER', 230, 44);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const lbl = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false })); lbl.scale.set(4.2, 0.78, 1); lbl.position.set(0, 1.0, 0); grp.add(lbl);

  beds.forEach((b) => {
    const start = new THREE.Vector3(b.pos.x, 0.07, b.pos.z), end = CC.clone().setY(0.07);
    const mid = start.clone().lerp(end, 0.5); mid.y = 1.2;
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    const col = HEX[b.patient.acuity];
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.018, 6, false), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.3 }));
    floorScene.add(tube);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), new THREE.MeshBasicMaterial({ color: col, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    floorScene.add(dot);
    flowDots.push({ curve, dot, u: Math.random() });
  });
}

// ---------- patient scanner stage (lit) ----------
function buildPatient() {
  patientScene = new THREE.Scene();
  patientScene.background = gradientTex('#f1f5f7', '#d7e3ea');

  patientScene.add(new THREE.HemisphereLight(0xffffff, 0xc4d0d8, 0.95));
  const key = new THREE.DirectionalLight(0xffffff, 1.05);
  key.position.set(3.5, 5.5, 5); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0005; key.shadow.radius = 7;
  Object.assign(key.shadow.camera, { left: -3, right: 3, top: 4, bottom: -1, near: 1, far: 20 });
  patientScene.add(key);
  const fill = new THREE.DirectionalLight(0xa9c4dc, 0.3); fill.position.set(-4, 2.5, 2); patientScene.add(fill);
  const rim = new THREE.DirectionalLight(0x9fc4ff, 0.5); rim.position.set(-1, 3, -5); patientScene.add(rim);

  buildPatientFigure();

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshBasicMaterial({ color: 0xe6edf1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.001; patientScene.add(ground);
  const cshadow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: GLOW, color: 0x36505c, transparent: true, opacity: 0.22, depthWrite: false }));
  cshadow.rotation.x = -Math.PI / 2; cshadow.position.y = 0.004; patientScene.add(cshadow);

  // discreet scan platform ring (subtle, not neon)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.006, 8, 96), new THREE.MeshBasicMaterial({ color: 0x2f8d8e, transparent: true, opacity: 0.55 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.01; patientScene.add(ring);
  patientScene.userData.ring = ring;
}

// ---- patient figure = switchable anatomical system layers (skeletal / vascular / nervous) ----
// Skeleton: AnatomyTOOL.org overview skeleton (CC BY-SA 4.0). Vascular & nervous: derived from
// Z-Anatomy (CC BY-SA), curve-tessellated, decimated and Draco-compressed for the web.
const SYSTEM_URLS = {
  skeletal: new URL('./assets/skeleton/overview-skeleton.glb', import.meta.url).href,
  vascular: new URL('./assets/systems/vascular.glb', import.meta.url).href,
  nervous: new URL('./assets/systems/nervous.glb', import.meta.url).href,
};
const SYSTEM_COLORS = { skeletal: 0x35808d, vascular: 0x2f8d80, nervous: 0x4a8f72 };
const SKELETON_URL = SYSTEM_URLS.skeletal; // floor twin reuses the skeleton

function makeFigureFromGLTF(gltf, { heart = false, color = 0x49e0ff, vascular = false } = {}) {
  const root = gltf.scene; root.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(root), size = new THREE.Vector3(); box.getSize(size);
  root.scale.setScalar(1.72 / (size.y || 1.72)); root.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(root); const c = new THREE.Vector3(); box.getCenter(c);
  root.position.x -= c.x; root.position.z -= c.z; root.position.y -= box.min.y;
  const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 2.0);
  const mats = [];
  root.traverse((o) => {
    if (o.isMesh) {
      if (vascular) {
        const isHeart = /atrium|ventricl|heart|cardi|aort/i.test(o.name);   // heart chambers → cardiac red
        o.material = makeVascularMaterial(clip, { heart: isHeart });
      } else {
        o.material = makeClinicalXrayMaterial(clip, color);
      }
      o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; mats.push(o.material);
    }
  });
  const group = new THREE.Group(); group.add(root); group.visible = false;
  let hsp = null;
  if (heart) { hsp = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0xff5a52, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); hsp.scale.set(0.34, 0.34, 1); hsp.position.set(0.02, 1.24, 0.14); group.add(hsp); }
  let cardiac = false, spin = 0;
  return {
    group, clip,
    setHeartColor(hex, isC) { cardiac = !!isC; if (hsp) hsp.material.color.set(hex); },
    setReveal(r) { clip.constant = THREE.MathUtils.lerp(-0.05, 1.92, r); },
    update(dt, { hr = 70, reveal = 1, spinSpeed = 0.32, freeze = false, focus = false } = {}) {
      if (freeze) { const tgt = Math.round(spin / (Math.PI * 2)) * Math.PI * 2; spin = THREE.MathUtils.lerp(spin, tgt, 1 - Math.exp(-dt * 3.2)); } // ease to anterior (front)
      else spin += dt * spinSpeed;
      group.rotation.y = spin; this.setReveal(reveal);
      const t = performance.now() / 1000; for (const m of mats) m.userData.uTime.value = t;
      if (hsp) { const beat = 0.5 + 0.5 * Math.sin(t * (hr / 60) * Math.PI * 2); const fb = focus ? 1.55 : 1.0; hsp.material.opacity = (0.12 + beat * 0.22) * (cardiac ? reveal : 0) * fb; hsp.scale.setScalar((0.3 + beat * 0.14) * (focus ? 1.25 : 1.0)); }
    },
  };
}

const figs = {};                              // name -> figure (lazy-loaded)
const loadingNames = new Set();
let patLoader = null;
function getLoader() {
  if (!patLoader) {
    patLoader = new GLTFLoader();
    const d = new DRACOLoader(); d.setDecoderPath(import.meta.env.BASE_URL + 'draco/gltf/'); patLoader.setDRACOLoader(d);
  }
  return patLoader;
}
function ensureLayer(name, cb) {
  if (figs[name]) { cb && cb(); return; }
  if (loadingNames.has(name)) return;
  loadingNames.add(name);
  getLoader().load(SYSTEM_URLS[name], (g) => {
    figs[name] = makeFigureFromGLTF(g, { heart: name === 'vascular', color: SYSTEM_COLORS[name], vascular: name === 'vascular' });
    patientScene.add(figs[name].group); loadingNames.delete(name); cb && cb();
  }, undefined, (e) => { loadingNames.delete(name); console.warn('[TARS] layer load failed', name, e); });
}
function buildPatientFigure() {
  human = buildHuman(); human.group.visible = false; patientScene.add(human.group); // invisible placeholder
  ensureLayer('skeletal', () => { if (activeLayer === 'skeletal') applyLayer(); });  // default layer streams in
}

function applyLayer() {
  const fig = figs[activeLayer];
  if (!fig) { ensureLayer(activeLayer, applyLayer); return; }    // not loaded yet → load then retry
  if (human && human.group && human !== fig) human.group.visible = false;
  for (const f of Object.values(figs)) f.group.visible = (f === fig);
  human = fig; fig.group.visible = true; fig.setReveal(reveal);
  const b = bedById(state.focusId); if (b) configurePatient(b);
  if (layerToggleEl) layerToggleEl.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.l === activeLayer));
  // heart zoom is only offered on the vascular layer (that's where the heart lives)
  if (heartBtn) heartBtn.style.display = (activeLayer === 'vascular' && displayMode === 'patient') ? 'flex' : 'none';
  if (activeLayer !== 'vascular' && zoomHeart) toggleHeartZoom(false);
}
function setLayer(name) { activeLayer = name; ensureLayer(name, applyLayer); applyLayer(); }
function toggleHeartZoom(force) {
  zoomHeart = force != null ? force : !zoomHeart;
  if (heartBtn) { heartBtn.classList.toggle('on', zoomHeart); heartBtn.innerHTML = zoomHeart ? '↩ EXIT HEART' : '♥ ZOOM HEART'; }
}
function configurePatient(b) { human.setHeartColor(b.cardiac ? 0xff5a52 : b.patient.acuity === 'watch' ? 0xffb24a : 0x9be8ff, b.cardiac); }

onModeChange((mode, focusId) => {
  playTransition();
  clearTimeout(swapTimer);
  swapTimer = setTimeout(() => {
    displayMode = mode;
    if (mode === 'patient') {
      activeLayer = 'skeletal'; applyLayer(); configurePatient(bedById(focusId));
      activeScene = patientScene; reveal = 0; camPos.copy(PATIENT.pos); camLook.copy(PATIENT.look);
      if (layerToggleEl) layerToggleEl.style.display = 'flex';
    } else {
      activeScene = floorScene; camPos.copy(HOME.pos); camLook.copy(HOME.look);
      if (layerToggleEl) layerToggleEl.style.display = 'none';
      toggleHeartZoom(false); if (heartBtn) heartBtn.style.display = 'none';
    }
  }, 360);
});

function onPointerDown(e) {
  if (displayMode !== 'floor') return;
  const r = canvas.getBoundingClientRect();
  ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1; ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(ptr, camera);
  const hit = raycaster.intersectObjects(pickables, false)[0];
  if (hit) setMode('patient', hit.object.userData.bedId);
}
function onPointerMove(e) {
  if (displayMode !== 'floor') { canvas.style.cursor = 'default'; return; }
  const r = canvas.getBoundingClientRect();
  ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1; ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(ptr, camera);
  canvas.style.cursor = raycaster.intersectObjects(pickables, false)[0] ? 'pointer' : 'default';
}

function resize() {
  const host = canvas.parentElement; const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
  renderer.setSize(w, h, false); composer.setSize(w, h); bloom.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}

let last = performance.now();
function frame(now) {
  let dt = (now - last) / 1000; last = now; dt = Math.min(dt, 0.05); driftT += dt;
  let dp, dl;
  if (displayMode === 'floor') { dp = HOME.pos.clone(); dp.x += Math.sin(driftT * 0.16) * 0.22; dl = HOME.look.clone(); }
  else if (zoomHeart) { dp = HEART.pos; dl = HEART.look; }
  else { dp = PATIENT.pos; dl = PATIENT.look; }
  const k = damp(dt, zoomHeart ? 3.0 : 2.3); camPos.lerp(dp, k); camLook.lerp(dl, k);
  camera.position.copy(camPos); camera.lookAt(camLook);

  if (displayMode === 'floor') updateFloor(dt); else updatePatient(dt);

  renderer.render(activeScene, camera);            // light clinical → plain render, no bloom
  updateHud(dt);
  requestAnimationFrame(frame);
}

function updateFloor(dt) { if (floorBody) floorBody.rotation.y += dt * 0.16; }
function updatePatient(dt) {
  if (reveal < 1) reveal = Math.min(1, reveal + dt / 1.3);
  const b = bedById(state.focusId) || beds[3];
  human.update(dt, { hr: b.vitals.hr, reveal, spinSpeed: zoomHeart ? 0 : 0.38, freeze: zoomHeart, focus: zoomHeart });
  const ring = patientScene.userData.ring; if (ring) ring.rotation.z += dt * 0.2;
}

export function initScene(canvasEl) {
  canvas = canvasEl;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.localClippingEnabled = true;

  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200); camera.position.copy(camPos);
  buildFloor(); buildPatient(); activeScene = floorScene;

  // image-based lighting (procedural room env — no asset) for realistic shading
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  patientScene.environment = envTex; floorScene.environment = envTex;

  composer = new EffectComposer(renderer);
  renderPass = new RenderPass(floorScene, camera); composer.addPass(renderPass);
  bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.32, 0.5, 0.82); composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // layer toggle (Body / Skeleton) over the scanner stage
  layerToggleEl = document.createElement('div');
  layerToggleEl.className = 'layer-toggle'; layerToggleEl.style.display = 'none';
  layerToggleEl.innerHTML = '<button data-l="skeletal" class="on">SKELETAL</button><button data-l="vascular">VASCULAR</button><button data-l="nervous">NERVOUS</button>';
  document.getElementById('stage').appendChild(layerToggleEl);
  layerToggleEl.querySelectorAll('button').forEach((b) => (b.onclick = () => setLayer(b.dataset.l)));

  // heart-zoom toggle (shown only on the vascular layer)
  heartBtn = document.createElement('button');
  heartBtn.className = 'heart-zoom'; heartBtn.style.display = 'none';
  heartBtn.innerHTML = '♥ ZOOM HEART';
  heartBtn.onclick = () => toggleHeartZoom();
  document.getElementById('stage').appendChild(heartBtn);

  // dev-only test hook: snap the camera straight to its target (screenshots can't wait for the eased glide)
  if (import.meta.env && import.meta.env.DEV) window.__snapCam = () => { const t = displayMode !== 'patient' ? HOME : zoomHeart ? HEART : PATIENT; camPos.copy(t.pos); camLook.copy(t.look); if (human && zoomHeart) human.group.rotation.y = Math.round(human.group.rotation.y / (Math.PI * 2)) * Math.PI * 2; };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  addEventListener('resize', resize); resize();
  requestAnimationFrame(frame);
}
