import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

import { beds, COL, bedById } from './ontology.js';
import { state, isPostopWorld, setMode, onModeChange, onThemeChange } from './state.js';
import { glowTexture, makeHologramMaterial, makeClinicalMaterial, makeClinicalXrayMaterial, makeVascularMaterial, makeGridMaterial, makeBodyHologramMaterial } from './xray.js';

// Patient figure = real anatomical system layers (GLB) rendered as teal holograms.
import { buildHuman } from './human.js';
import { playTransition, updateHud } from './hud.js';
import { damp } from './utils.js';

const GLOW = glowTexture();

const HOME = { pos: new THREE.Vector3(0, 24, -14), look: new THREE.Vector3(0, 0.3, 3) }; // ring overview — the whole 8-bed ICU ring (matches the ward tour's final shot)
const PATIENT = { pos: new THREE.Vector3(0, 1.12, 4.1), look: new THREE.Vector3(0, 0.95, 0) };
const HEART = { pos: new THREE.Vector3(0.03, 1.34, 0.82), look: new THREE.Vector3(0.02, 1.31, 0.14) }; // tight close-up centred on the heart
const BEDCAM = { pos: new THREE.Vector3(0, 3.2, 2.3), look: new THREE.Vector3(0, 0.9, -0.05) }; // WATCH supine: raised foot-of-bed view — the lying body runs up the tall panel
// WATCH upright: BEDSIDE view — near-side-on, because hip/knee flexion only
// reads in profile (front-on foreshortens a sitting figure into a blob). The
// narrow panel only shows ~0.97 m of width at this range, which is just enough
// for a seated thigh or a walking stride.
const WATCHCAM = { pos: new THREE.Vector3(-3.55, 1.18, 0.32), look: new THREE.Vector3(0, 0.9, 0.22) };

let renderer, composer, renderPass, bloom, camera, canvas;
let floorScene, patientScene, human;
let activeScene, displayMode = 'floor';
const pickables = [], bedHalos = [], inboundMarks = [];
let ringGroup = null; // the bed ring + zone + decal — slowly carousels in floor mode
const camPos = HOME.pos.clone(), camLook = HOME.look.clone();
const raycaster = new THREE.Raycaster(), ptr = new THREE.Vector2();
let reveal = 1, driftT = 0, swapTimer = 0;
let activeLayer = 'body', hoverLabel = null;
let zoomHeart = false; // toggled by clicking the heart itself (no button)

function gradientTex(top, bottom) {
  const cv = document.createElement('canvas'); cv.width = 4; cv.height = 256;
  const x = cv.getContext('2d'); const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top); g.addColorStop(1, bottom); x.fillStyle = g; x.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function labelSprite(id, acuity) {
  const cv = document.createElement('canvas'); cv.width = 320; cv.height = 96; const x = cv.getContext('2d');
  const rr = (a, b, w, h, r) => { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); };
  x.shadowColor = 'rgba(0,0,0,.45)'; x.shadowBlur = 12; x.shadowOffsetY = 3;
  x.fillStyle = 'rgba(18,24,32,.85)'; rr(16, 18, 288, 58, 26); x.fill(); x.shadowColor = 'transparent';
  x.fillStyle = COL[acuity] || COL.empty; x.beginPath(); x.arc(52, 47, 10, 0, 7); x.fill();
  x.fillStyle = '#eaf0f5'; x.font = '700 32px "Segoe UI",Arial'; x.textBaseline = 'middle'; x.fillText(id, 78, 49);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  s.scale.set(2.4, 0.72, 1); return s;
}

// ============================================================
//  FLOOR = the ICU bed-ring, ported from the ward tour's Building.tsx
//  (same layout, colours and frosted-glass look — vanilla three.js).
//  Bed-local frame: head = -z (outer wall), foot = +z (centre).
// ============================================================
const RING = { cx: 0, cz: 3, rZone: 9, rBed: 7.0, n: beds.length }; // 8 ICU · 16 ER
const WARD = {
  rest: 0x9fc4e6,      // beds at rest — pale glass blue
  restEdge: 0x9cc2e6,  // pastel outline — ALL beds (acuity shows via halo, not edges);
                       // lightened vs the ward's 0x5c93cc to read pastel in this pipeline
  matt: 0xbdd6ee,      // mattress — pale
  zone: 0xa6cbec,      // glowing zone circle — pastel blue (was a dark royal blue)
  decal: 0xa6cbec,     // "ICU" floor decal — pastel blue
};
// acuity halo colours = the HUD roster's dot colours, so 3D and list agree
const HALO = {
  stable: { color: 0x2c8a8b, amp: 0.1, rate: 1.4 },
  watch: { color: 0xd98a1f, amp: 0.14, rate: 2.4 },
  critical: { color: 0xd23b3b, amp: 0.22, rate: 4.6 },
};

// "ICU" floor decal texture (blue text on transparent) — verbatim from the ward
function icuDecalTex() {
  const cv = document.createElement('canvas'); cv.width = 640; cv.height = 320;
  const c = cv.getContext('2d');
  c.clearRect(0, 0, 640, 320);
  c.fillStyle = '#a6cbec'; c.font = '800 210px system-ui, "Segoe UI", sans-serif';
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.letterSpacing = '24px';
  c.fillText(state.chapter === 'er' ? 'ER' : 'ICU', 320 + 12, 168);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}

// NOTE: every floor material is toneMapped:false — the ward authored these
// pastels under NoToneMapping; the tars renderer runs ACESFilmic (for the
// patient scanner), which would wash them out. Opting the floor's materials
// out reproduces the ward's colours exactly while leaving the patient look alone.

// frosted greybox with a holographic edge outline (the ward's FrostBox)
function frostBox(parent, w, h, d, y, z, edgeHex, opacity) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color: WARD.rest, transparent: true, opacity, roughness: 0.28, metalness: 0.1, envMapIntensity: 0.9, toneMapped: false }));
  m.position.set(0, y, z); m.castShadow = m.receiveShadow = true;
  const eg = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 15),
    new THREE.LineBasicMaterial({ color: edgeHex, transparent: true, opacity: 0.95, toneMapped: false }));
  eg.scale.setScalar(1.001); m.add(eg);
  parent.add(m); return m;
}

// one ring bed: ward glass bed (neutral edges) + blob patient + a small blinking
// acuity halo underneath · label on hover · click → patient hub.
// Positioned LOCAL to the ring group so the whole ring can turn about its centre.
function buildRingBed(b, slot, ringGroup) {
  const a = (slot / RING.n) * Math.PI * 2;
  const g = new THREE.Group();
  g.position.set(Math.cos(a) * RING.rBed, 0, Math.sin(a) * RING.rBed);
  g.rotation.y = -Math.PI / 2 - a;

  frostBox(g, 1.5, 0.4, 2.4, 0.2, 0, WARD.restEdge, 0.9);        // base
  frostBox(g, 1.5, 0.5, 0.12, 0.6, -1.06, WARD.restEdge, 0.85);  // headboard
  const matt = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.16, 2.1),
    new THREE.MeshPhysicalMaterial({ color: WARD.matt, roughness: 0.2, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.2, transparent: true, opacity: 0.78, envMapIntensity: 0.9, toneMapped: false }));
  matt.position.y = 0.46; matt.castShadow = true;
  const me = new THREE.LineSegments(new THREE.EdgesGeometry(matt.geometry, 15),
    new THREE.LineBasicMaterial({ color: WARD.restEdge, transparent: true, opacity: 0.95, toneMapped: false }));
  me.scale.setScalar(1.001); matt.add(me); g.add(matt);

  // sleeping blob patient (abstract, like the ward)
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.02, 6, 14), new THREE.MeshStandardMaterial({ color: 0x6f97c4, roughness: 0.8, toneMapped: false }));
  body.rotation.x = Math.PI / 2; body.position.set(0, 0.74, 0.12); body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 20, 20), new THREE.MeshStandardMaterial({ color: 0xc99b74, roughness: 0.65, toneMapped: false }));
  head.position.set(0, 0.72, -0.8); head.castShadow = true; g.add(head);

  // small blinking halo under the bed — the ONLY acuity colour-coding on the ring
  const spec = HALO[b.patient.acuity] || HALO.stable;
  const halo = new THREE.Mesh(new THREE.CircleGeometry(1.35, 48),
    new THREE.MeshBasicMaterial({ color: spec.color, transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  halo.rotation.x = -Math.PI / 2; halo.position.y = 0.02; g.add(halo);
  bedHalos.push({ mesh: halo, amp: spec.amp, rate: spec.rate, phase: slot * 0.9 });

  // THE INBOUND BAY announces itself. The acuity halos all breathe on a sine,
  // so another sine would just be a slightly brighter neighbour among sixteen.
  // This one is a hard square blink on the floor ring — a different KIND of
  // motion, which is what makes it findable at a glance rather than merely
  // brighter.
  if (b.inbound) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.42, 1.62, 64),
      new THREE.MeshBasicMaterial({ color: 0xff5a52, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; g.add(ring);
    inboundMarks.push(ring);
  }

  // hover label + invisible pick target → the existing patient drill-down
  const lab = labelSprite(b.id, b.patient.acuity); lab.position.set(0, 1.6, 0); lab.visible = false; g.add(lab);
  const hit = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.6, 2.7), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = 0.8; hit.userData.bedId = b.id; hit.userData.label = lab; g.add(hit); pickables.push(hit);

  ringGroup.add(g);
}

// the ward page's radial aero gradient (white centre → cool blue edges), as a
// floor texture — stands in for the ward's reflector + page background.
function aeroFloorTex() {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 1024;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(512, 460, 60, 512, 460, 620);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.34, '#eef6fb');
  g.addColorStop(0.64, '#dce9f1'); g.addColorStop(1, '#c6d7e2');
  c.fillStyle = g; c.fillRect(0, 0, 1024, 1024);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// light/dark scene backgrounds — swapped by the global top-bar theme toggle.
// Meshes/lights stay as-authored; only the backdrop + fog re-dress.
function applySceneTheme(dark) {
  if (!floorScene || !patientScene) return;
  const pGround = patientScene.userData.ground;
  const fGround = floorScene.userData.ground;
  if (dark) {
    floorScene.background = gradientTex('#1b2430', '#0a0e14');
    floorScene.backgroundIntensity = 1;
    floorScene.fog = new THREE.Fog(0x0c1118, 46, 115);
    patientScene.background = gradientTex('#202a35', '#0d1218');
    if (pGround) pGround.material.color.set(0x10161d); // dark stage floor
    if (fGround) { fGround.material.map = null; fGround.material.color.set(0x0e141c); fGround.material.needsUpdate = true; }
  } else {
    floorScene.background = gradientTex('#ffffff', '#c6d7e2'); // ward bright aero
    floorScene.backgroundIntensity = 1.12;
    floorScene.fog = new THREE.Fog(0xc6d7e2, 46, 115);
    patientScene.background = gradientTex('#f1f5f7', '#d7e3ea');
    if (pGround) pGround.material.color.set(0xe6edf1); // light stage floor
    if (fGround) { fGround.material.map = floorScene.userData.aeroTex || null; fGround.material.color.set(0xffffff); fGround.material.needsUpdate = true; }
  }
  // body hologram legibility: the translucent blue vanishes on the light stage —
  // raise the see-through-face floor + deepen the diffuse so it still reads
  const bodyFig = figs.body;
  if (bodyFig) bodyFig.group.traverse((o) => {
    if (o.isMesh && o.material && o.material.userData && o.material.userData.uAlphaMin) {
      o.material.userData.uAlphaMin.value = dark ? 0.10 : 0.30;
      o.material.color.set(dark ? 0x3f8fe0 : 0x175a9e);
    }
  });
}
onThemeChange(applySceneTheme);

function buildFloor() {
  floorScene = new THREE.Scene();
  floorScene.background = gradientTex('#ffffff', '#c6d7e2'); // ward bright aero
  floorScene.backgroundIntensity = 1.12; // offset ACES on the background (meshes opt out per-material)
  floorScene.fog = new THREE.Fog(0xc6d7e2, 46, 115);

  // the ward's light rig (SceneEnvironment, bright branch)
  floorScene.add(new THREE.HemisphereLight(0xffffff, 0xd6e2ec, 1.25));
  const key = new THREE.DirectionalLight(0xffffff, 1.05);
  key.position.set(14, 22, 12); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  Object.assign(key.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 95 });
  floorScene.add(key);
  const rim = new THREE.DirectionalLight(0xcfe4ff, 0.55); rim.position.set(-14, 10, -10); floorScene.add(rim);
  floorScene.add(new THREE.AmbientLight(0xeaf2fa, 0.68));

  // aero floor — the ward's radial white→blue ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(110, 110),
    new THREE.MeshStandardMaterial({ map: aeroFloorTex(), roughness: 0.5, metalness: 0.05, envMapIntensity: 0.5, toneMapped: false }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.02, RING.cz); ground.receiveShadow = true; floorScene.add(ground);
  floorScene.userData.ground = ground; floorScene.userData.aeroTex = ground.material.map; // themed by applySceneTheme

  // everything ring-shaped lives in one group centred on the zone, so the whole
  // arrangement can carousel about its centre (very slowly) in floor mode
  ringGroup = new THREE.Group();
  ringGroup.position.set(RING.cx, 0, RING.cz);
  floorScene.add(ringGroup);

  // glowing round zone footprint — thin, pastel, soft
  const zone = new THREE.Mesh(new THREE.RingGeometry(RING.rZone - 0.03, RING.rZone + 0.03, 160),
    new THREE.MeshBasicMaterial({ color: WARD.zone, transparent: true, opacity: 0.6, side: THREE.DoubleSide, toneMapped: false }));
  zone.rotation.x = -Math.PI / 2; zone.position.y = 0.02; ringGroup.add(zone);

  // "ICU" decal, flat in the centre — pale
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.2),
    new THREE.MeshBasicMaterial({ map: icuDecalTex(), transparent: true, opacity: 0.72, depthWrite: false, toneMapped: false }));
  decal.rotation.x = -Math.PI / 2; decal.position.y = 0.03; ringGroup.add(decal);

  // the 8-bed ring — ICU-01…07 + ICU-08 (Chandrababu) on the hero slot, front-right
  beds.forEach((b, i) => buildRingBed(b, i, ringGroup));
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
  patientScene.userData.ground = ground; // themed by applySceneTheme
  const cshadow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: GLOW, color: 0x36505c, transparent: true, opacity: 0.22, depthWrite: false }));
  cshadow.rotation.x = -Math.PI / 2; cshadow.position.y = 0.004; patientScene.add(cshadow);

  // discreet scan platform ring (subtle, not neon)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.006, 8, 96), new THREE.MeshBasicMaterial({ color: 0x2f8d8e, transparent: true, opacity: 0.55 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.01; patientScene.add(ring);
  patientScene.userData.ring = ring;

  // longitudinal scan axis — a REAL 3D dashed line (was an SVG overlay in the
  // HUD, which floated in front of everything). In-scene it depth-tests, so the
  // body's depth mask hides it behind the figure; it peeks out above the head.
  const axisGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.02, 0), new THREE.Vector3(0, 2.05, 0)]);
  const axis = new THREE.Line(axisGeo, new THREE.LineDashedMaterial({ color: 0x96cde1, transparent: true, opacity: 0.25, dashSize: 0.045, gapSize: 0.06 }));
  axis.computeLineDistances(); patientScene.add(axis);
}

// ---- patient figure = switchable anatomical system layers (skeletal / vascular / nervous) ----
// Skeleton: AnatomyTOOL.org overview skeleton (CC BY-SA 4.0). Vascular & nervous: derived from
// Z-Anatomy (CC BY-SA), curve-tessellated, decimated and Draco-compressed for the web.
const SYSTEM_URLS = {
  skeletal: new URL('./assets/skeleton/overview-skeleton.glb', import.meta.url).href,
  vascular: new URL('./assets/systems/vascular.glb', import.meta.url).href,
  nervous: new URL('./assets/systems/nervous.glb', import.meta.url).href,
  // ported from tars-app (:5180) — REGISTERED BUT DORMANT until a beat asks for
  // them. `body` = solid hologram body; `grid` = the SAME body.glb painted with
  // the procedural wireframe-lattice shader (grid.glb is retired — its wires
  // were baked tubes with fixed cell count).
  body: new URL('./assets/systems/body.glb', import.meta.url).href,
  grid: new URL('./assets/systems/body.glb', import.meta.url).href,
  // Post-cath: the patient's OWN reconstruction, replacing the whole-body
  // vasculature once the heart is zoomed. Sketchfab STL export — 790k tris and
  // 20.8 MB as delivered; welded, joined, decimated 4x and Draco'd to 548 KB
  // with 0.01% silhouette drift. It is ONE unnamed mesh, so no vessel can be
  // addressed by name and the lesions are marked by coordinate (CORONARY_BLOCKS).
  coronary: new URL('./assets/systems/coronary-recon.glb', import.meta.url).href,
};
const SYSTEM_COLORS = { skeletal: 0x35808d, vascular: 0x2f8d80, nervous: 0x4a8f72, body: 0x3f8fe0, grid: 0x2fd0e0, coronary: 0xff5a52 };
// The recon is an ORGAN, not a body: robustPlace normalises every other layer to
// a 1.72 m figure, which would stretch a heart to the height of a person. Height
// and lift are per-layer for this reason — it sits at chest height, at organ size.
const LAYER_PLACE = { coronary: { h: 0.27, y: 1.19 } }; // 270 mm: leaves frame margin for the callouts

// Robust placement onto the stage. The raw AABB midpoint is thrown off by
// asymmetric limbs (a raised arm) and stray/among-scene geometry, so models from
// different sources (AnatomyTOOL skeleton vs Z-Anatomy vascular/nervous) landed
// off-centre. Instead we use per-vertex statistics: MEDIAN x/z = the anatomical
// midline (robust to outliers), and low/high percentiles = the true body height &
// floor. Result: every system centres identically on the platform.
function robustPlace(root, targetH = 1.72, liftY = 0) {
  root.position.set(0, 0, 0); root.scale.setScalar(1); root.updateMatrixWorld(true);
  const xs = [], ys = [], zs = []; const v = new THREE.Vector3();
  root.traverse((o) => {
    const pos = o.isMesh && o.geometry && o.geometry.attributes && o.geometry.attributes.position;
    if (!pos) return;
    const step = Math.max(1, Math.floor(pos.count / 4000));      // sample dense meshes
    for (let i = 0; i < pos.count; i += step) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); xs.push(v.x); ys.push(v.y); zs.push(v.z); }
  });
  if (!ys.length) return;
  const sx = xs.sort((a, b) => a - b), sy = ys.sort((a, b) => a - b), sz = zs.sort((a, b) => a - b);
  const at = (s, p) => s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
  const cx = at(sx, 0.5), cz = at(sz, 0.5), yLo = at(sy, 0.005), yHi = at(sy, 0.995);
  const s = targetH / Math.max(1e-3, yHi - yLo);
  root.scale.setScalar(s); root.position.set(-cx * s, -yLo * s + liftY, -cz * s); root.updateMatrixWorld(true);
}

function makeFigureFromGLTF(gltf, { heart = false, color = 0x49e0ff, vascular = false, style = null } = {}) {
  const root = gltf.scene;
  const place = LAYER_PLACE[style];
  const targetH = place ? place.h : (style === 'body' || style === 'grid' ? 1.81 : 1.72); // body reads a touch (+5%) bigger on stage
  robustPlace(root, targetH, place ? place.y : 0);
  // Pitch has to turn about the model's CENTRE. robustPlace leaves the group's
  // origin on the model's FLOOR, so rotating the group in x swung the whole
  // thing through an arc as tall as itself and threw it out of frame. An inner
  // pivot lifted to the centre — with the root pushed down by the same amount —
  // tips it in place and leaves every world position exactly where it was, so
  // the reveal clip plane and the heart raycast are untouched.
  const pivotY = (place ? place.y : 0) + targetH / 2;
  const pivot = new THREE.Group();
  pivot.position.y = pivotY; root.position.y -= pivotY; pivot.add(root);
  const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 2.0);
  const mats = [], heartMeshes = [];
  // collect first, then process — the body/grid branch ADDS mask children, and
  // mutating the tree mid-traverse would make traverse visit (and re-skin) them
  const meshes = []; root.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const o of meshes) {
    {
      if (vascular) {
        const isHeart = /atrium|ventricl|heart|cardi|aort/i.test(o.name);   // heart chambers → cardiac red
        o.material = makeVascularMaterial(clip, { heart: isHeart });
        if (isHeart) { o.userData.isHeart = true; heartMeshes.push(o); } // click-to-zoom target
      } else if (style === 'body') {
        o.material = makeBodyHologramMaterial(clip, color);
      } else if (style === 'grid') {
        o.material = makeGridMaterial(clip, color);
      } else {
        o.material = makeClinicalXrayMaterial(clip, color);
      }
      if (style === 'body' || style === 'grid') {
        // depth prepass: an invisible depth-only twin renders in the opaque pass,
        // so the transparent hologram depth-tests against the body's own nearest
        // skin — far limbs/backfaces can't bleed through in profile views
        o.material.side = THREE.FrontSide;
        const mask = new THREE.Mesh(o.geometry, new THREE.MeshBasicMaterial({ colorWrite: false, clippingPlanes: clip ? [clip] : null }));
        mask.frustumCulled = false;
        o.add(mask);
      }
      o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; mats.push(o.material);
    }
  }
  const group = new THREE.Group(); group.add(pivot); group.visible = false;
  let hsp = null;
  if (heart) { hsp = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0xff5a52, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); hsp.scale.set(0.34, 0.34, 1); hsp.position.set(0.02, 1.24, 0.14); group.add(hsp); }
  let cardiac = false, spin = 0;
  return {
    group, pivot, clip, heartMeshes,
    setHeartColor(hex, isC) { cardiac = !!isC; if (hsp) hsp.material.color.set(hex); },
    setReveal(r) { clip.constant = THREE.MathUtils.lerp(-0.05, 1.92, r); },
    /** `yaw` non-null hands rotation to the caller (the orbit drag). It also
     *  writes back into `spin`, so releasing the model does not snap: the idle
     *  spin picks up exactly where the drag left it. Without this the assignment
     *  below fought the drag every frame and the model buzzed in place. */
    setPitch(rx) { pivot.rotation.x = rx; },
    update(dt, { hr = 70, reveal = 1, spinSpeed = 0.32, freeze = false, focus = false, yaw = null } = {}) {
      if (yaw != null) spin = yaw;
      else if (freeze) { const tgt = Math.round(spin / (Math.PI * 2)) * Math.PI * 2; spin = THREE.MathUtils.lerp(spin, tgt, 1 - Math.exp(-dt * 3.2)); } // ease to anterior (front)
      else spin += dt * spinSpeed;
      group.rotation.y = spin; this.setReveal(reveal);
      const t = performance.now() / 1000; for (const m of mats) m.userData.uTime.value = t;
      // heartbeat glow: subtle on the full-body vascular view, but NO beating halo
      // once zoomed into the heart (focus) — it's distracting up close
      if (hsp) { const beat = 0.5 + 0.5 * Math.sin(t * (hr / 60) * Math.PI * 2); hsp.material.opacity = focus ? 0 : (0.12 + beat * 0.22) * (cardiac ? reveal : 0); hsp.scale.setScalar(0.3 + beat * 0.14); }
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
    // the recon is all vessel, so it wears the vascular treatment and the heart
    // glow — `vascular` drives the material, `heart` drives the beating halo
    const vasc = name === 'vascular' || name === 'coronary';
    figs[name] = makeFigureFromGLTF(g, { heart: vasc, color: SYSTEM_COLORS[name], vascular: vasc, style: name });
    patientScene.add(figs[name].group); loadingNames.delete(name);
    applySceneTheme(state.dark); // dress the fresh figure for the current theme (body legibility)
    if (name === 'body' && pendingMarkers) { const d = pendingMarkers; pendingMarkers = null; applyMarkers(d); } // markers queued before the mesh landed
    cb && cb();
  }, undefined, (e) => { loadingNames.delete(name); console.warn('[TARS] layer load failed', name, e); });
}
/* ---- post-cath · the lesions, marked on the reconstruction -----------------
 * The recon is ONE unnamed mesh (a Sketchfab STL export), so no vessel can be
 * addressed by name — the lesions are marked by coordinate instead. Positions
 * are in PIVOT space (the model's own centre), so a marker rides both the yaw
 * and the pitch of the drag.
 *
 * These were seeded by anatomy, NOT measured off the model. Set them for real
 * with the DEV picker: with the recon up, shift-click a lesion and the finished
 * line lands on your clipboard, ready to paste over the entry below.
 */
const CORONARY_BLOCKS = [
  // Chosen by projecting through the REAL camera, restricted to the MAIN BODY.
  //
  // Two things had to be true and each one caught a different bug. Picking by
  // model-space +z assumed that face pointed at the viewer — it does not, so the
  // rings sat on a turned-away surface and projected into empty space. And the
  // mesh has 441 connected components: one body of 104,903 verts and 440 loose
  // fragments. Picking from all vertices put the RCA ring on a stray fragment
  // floating clear of the heart. These are the front-most vertices of the main
  // body under a ray from the HEART camera.
  //
  // Still NOT established: which vessel each one is. The left and right trees
  // are welded into that single component, so nothing in the file names them.
  // The labels are an anatomical guess — fix them with the shift-click picker.
  { key: 'lad', label: 'LAD · POBA', pos: [0.029, 0.014, 0.046], side: 'r', rise: 62, treated: true },
  { key: 'lcx', label: 'LCx 75%', pos: [-0.034, -0.05, 0.07], side: 'l', rise: 116 },
  { key: 'rca', label: 'RCA 60%', pos: [0.037, -0.09, 0.065], side: 'r', rise: 152 },
];
const BLOCK_RED = 0xff5347, BLOCK_TEAL = 0x4fe0b0;
let blockGroup = null;
/* Ring + leader + pill, drawn as ONE canvas and shown as ONE billboard.
 *
 * Three objects would have to be kept in agreement every frame under rotation;
 * baked into a single sprite they are welded by construction — the leader can
 * never miss the ring and the pill can never drift off the leader.
 *
 * The sprite's `center` is set to the RING, not the middle of the canvas, so
 * the anchor lands on the lesion and everything else hangs up-and-right of it.
 * The pill therefore stands clear of the vessel it is pointing at, which is the
 * whole reason for a leader on a tree this dense.
 *
 * Same grammar as the 2D angiogram in PACS (apps.js): a ring on the lesion and
 * a label beside it. Two views of one study should annotate the same way.
 */
/* A lesion marker is TWO objects, because they are two different kinds of thing.
 *
 *   the RING  is part of the anatomy. depthTest ON, so the heart occludes it:
 *             when its vessel turns to the back the geometry hides it, exactly
 *             as it would hide a mark drawn on the vessel itself. No facing
 *             maths — the depth buffer already knows.
 *
 *   the PILL  is a callout ABOUT the anatomy. depthTest OFF, so it stays
 *             readable wherever it hangs and never gets sliced in half by a
 *             vessel passing in front of the label.
 *
 * They were one baked sprite so the leader could not miss the ring. That worked,
 * but it welded them to a single depth — turn depth testing on and the pill gets
 * tested at the lesion's depth too, so on a cage this dense the label would be
 * chopped constantly. Split, they keep their own depth behaviour and stay
 * aligned by sharing an anchor: both are camera-facing sprites at the same
 * world point, so the leader's aim is a fixed offset in the pill's own texture,
 * not a live calculation that could drift.
 */
const RING_PX = 128, RING_R = 46;   // the ring's own little canvas
function ringSprite(col) {
  const cv = document.createElement('canvas'); cv.width = cv.height = RING_PX;
  const x = cv.getContext('2d'); const c = RING_PX / 2;
  // a dark liner either side: the model is bright coral in places and near-white
  // in others, and a bare stroke vanishes on one of them
  x.strokeStyle = 'rgba(6,12,16,.5)'; x.lineWidth = 4;
  x.beginPath(); x.arc(c, c, RING_R + 5.5, 0, 7); x.stroke();
  x.beginPath(); x.arc(c, c, RING_R - 5.5, 0, 7); x.stroke();
  x.strokeStyle = col; x.lineWidth = 9;
  x.beginPath(); x.arc(c, c, RING_R, 0, 7); x.stroke();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  // depthTest TRUE — this is the half that belongs to the scene
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, opacity: 0, depthTest: true, depthWrite: false, toneMapped: false }));
  sp.scale.set(0.036, 0.036, 1);
  return sp;
}

/* The label half: leader + pill, anchored at the same lesion point. The leader
 * starts where the ring's edge is, so the two read as one mark even though they
 * are now separate objects at separate depths. */
const ANNOT_W = 512, ANNOT_H = 256, ANCH_Y = 186;
function pillSprite(text, treated, side = 'r', rise = 90) {
  const cv = document.createElement('canvas'); cv.width = ANNOT_W; cv.height = ANNOT_H;
  const x = cv.getContext('2d');
  const col = treated ? '#5fe8bf' : '#ff6a5e';
  const right = side === 'r';
  const AX = right ? 74 : ANNOT_W - 74;                    // the anchor = where the ring is
  const LX = right ? AX + 58 : AX - 58, LY = rise;
  const RGAP = 30;                                          // clear the ring's radius on this canvas
  const a = Math.atan2(LY - ANCH_Y, LX - AX);
  x.strokeStyle = col; x.lineWidth = 3.5; x.lineCap = 'round';
  x.beginPath();
  x.moveTo(AX + Math.cos(a) * RGAP, ANCH_Y + Math.sin(a) * RGAP);
  x.lineTo(LX, LY); x.stroke();
  x.font = '700 30px ui-monospace, SFMono-Regular, monospace';
  const pw = x.measureText(text).width + 30, ph = 42;
  const PX = right ? LX : LX - pw;
  x.fillStyle = 'rgba(8,14,18,.88)';
  x.beginPath(); x.roundRect(PX, LY - ph / 2, pw, ph, 21); x.fill();
  x.strokeStyle = col; x.lineWidth = 2; x.stroke();
  x.fillStyle = col; x.textBaseline = 'middle'; x.textAlign = 'left';
  x.fillText(text, PX + 15, LY + 1);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  // depthTest FALSE — a callout is never occluded by the thing it describes
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false }));
  sp.scale.set(0.225, 0.1125, 1);
  sp.center.set(AX / ANNOT_W, 1 - ANCH_Y / ANNOT_H);
  return sp;
}
function buildBlocks(fig) {
  if (blockGroup) { blockGroup.removeFromParent(); blockGroup = null; }
  if (!fig || !fig.pivot) return;
  blockGroup = new THREE.Group();
  for (const bl of CORONARY_BLOCKS) {
    const g = new THREE.Group(); g.position.set(bl.pos[0], bl.pos[1], bl.pos[2]);
    const ring = ringSprite(bl.treated ? '#5fe8bf' : '#ff6a5e');
    const pill = pillSprite(bl.label, bl.treated, bl.side, bl.rise);
    g.add(ring); g.add(pill);
    g.userData = { ring, pill, treated: !!bl.treated, t: Math.random() * 6.28 };
    blockGroup.add(g);
  }
  fig.pivot.add(blockGroup);
}
function updateBlocks(dt) {
  if (!blockGroup) return;
  const on = activeLayer === 'coronary';
  for (const g of blockGroup.children) {
    const u = g.userData; u.t += dt * (u.treated ? 1.3 : 2.3);
    const beat = 0.5 + 0.5 * Math.sin(u.t);
    const lit = u.treated ? 0.85 : 0.72 + beat * 0.28;
    // the RING needs no facing test — the depth buffer hides it behind the heart
    u.ring.material.opacity += ((on ? lit : 0) - u.ring.material.opacity) * Math.min(1, dt * 7);
    u.ring.visible = u.ring.material.opacity > 0.01;
    // the PILL does, so a label never points at a ring the heart is covering
    g.getWorldPosition(BLOCK_WP);
    BLOCK_OUT.copy(BLOCK_WP).sub(blockGroup.parent.getWorldPosition(BLOCK_EYE)).normalize();
    BLOCK_EYE.copy(camera.position).sub(BLOCK_WP).normalize();
    const v = Math.max(0, Math.min(1, (BLOCK_OUT.dot(BLOCK_EYE) - 0.02) / 0.30));
    const tgt = on ? lit * v * v * (3 - 2 * v) : 0;   // smoothstep, no edge at the turn
    u.pill.material.opacity += (tgt - u.pill.material.opacity) * Math.min(1, dt * 7);
    u.pill.visible = u.pill.material.opacity > 0.01;
  }
}

// ---- Scene 4 · body connection markers (postop hookup) ---------------------
// Where each device docks on the 1.81 m body figure — LOCAL coords on the
// figure group (x right, y up, z front). TUNE HERE if a glow sits off-anatomy.
const BODY_MARKER_POS = {
  chestR: [0.16, 1.31, 0.10],  // monitor — ECG/SpO₂ pads, right chest
  chestL: [-0.16, 1.31, 0.10], // ventilator — left chest
  neckR: [0.13, 1.48, 0.06],   // central line — R internal jugular
  neckL: [-0.13, 1.48, 0.06],  // inotrope pumps — left of neck
  mouth: [0.00, 1.60, 0.10],   // ET tube — airway
  lwrist: [-0.24, 0.90, 0.10], // arterial line
  groin: [0.08, 0.96, 0.07],   // IABP (R femoral)
  drain: [-0.10, 1.12, 0.10],  // chest drains (lower left)
  pelvis: [0.00, 0.94, 0.09],  // urinary catheter
  calf: [0.06, 0.42, 0.06],    // Flowtron cuffs
  // ── the ACUTE bedside (pre-cath, hud.js ACUTE_DEVICES) ────────────────────
  // Scene 4 shows twelve of these; before the lab he already has four, and the
  // twin used to show none of them. Same sprite, same event — so the post-op
  // hookup reads as an escalation of something the room has already seen rather
  // than a mechanism appearing from nowhere.
  face: [0.00, 1.63, 0.11],    // nasal cannula — nose, just above the mouth mark
  lac: [-0.23, 1.08, 0.09],    // 18G cannula — LEFT antecubital fossa (elbow crease)
  rarm: [0.22, 1.24, 0.06],    // NIBP cuff — right upper arm, mid-humerus
};
const bodyMarkers = {};
let pendingMarkers = null;
function applyMarkers(detail) {
  const fig = figs.body;
  if (!fig) { pendingMarkers = detail; return; } // body still streaming in — apply on load
  const { keys = [], ping = null } = detail || {};
  for (const k of Object.keys(BODY_MARKER_POS)) {
    let s = bodyMarkers[k];
    const on = keys.includes(k);
    if (on && !s) {
      s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0x57d7ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
      s.scale.set(0.09, 0.09, 1); s.position.set(...BODY_MARKER_POS[k]);
      s.userData.deviceKey = k; s.userData.ping = 0;
      fig.group.add(s); bodyMarkers[k] = s;
    }
    if (s) { s.userData.on = on; if (on && k === ping) s.userData.ping = 1; }
  }
}
window.addEventListener('hud:markers', (e) => applyMarkers(e.detail));
// the script can fire the reconstruction itself — same path the double-click
// takes, so the beat and the gesture cannot diverge
window.addEventListener('hud:recon:show', () => {
  if (displayMode !== 'patient') return;
  toggleHeartZoom(true); showCoronary(true);
});
window.addEventListener('hud:recon:hide', () => showCoronary(false));
// a control confirm in SCOPE pings that device's marker on the twin
window.addEventListener('hud:marker:pulse', (e) => { const m = e.detail && e.detail.marker, s = m && bodyMarkers[m]; if (s) s.userData.ping = 1; });
function updateMarkers(dt) {
  for (const k of Object.keys(bodyMarkers)) {
    const s = bodyMarkers[k], u = s.userData;
    u.ping = Math.max(0, u.ping - dt * 1.6);
    const base = u.on ? 0.5 : 0;
    s.material.opacity += ((base + u.ping * 0.5) - s.material.opacity) * Math.min(1, dt * 8);
    const sc = 0.09 * (1 + u.ping * 1.7); s.scale.set(sc, sc, 1);
  }
}
function markerHit(e) {
  if (displayMode !== 'patient' || !isPostopWorld() || !figs.body || activeLayer !== 'body') return null;
  const live = Object.values(bodyMarkers).filter((s) => s.userData.on);
  if (!live.length) return null;
  const r = canvas.getBoundingClientRect();
  ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1; ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(ptr, camera);
  return raycaster.intersectObjects(live, false)[0] || null;
}

// ---- Scene 4 · WATCH — the rigged grid twin --------------------------------
// body.glb ships as a single unrigged shell, so we rig it PROCEDURALLY: an
// armature authored from anthropometric fractions of the figure's own height,
// capsule-distance skin weights, and clinical poses (supine / edge-of-bed /
// standing / walking) tweened on the bones. The wireframe lattice shader reads
// PRE-skinned object space, so the grid stays glued to the body as limbs bend.
function makeRiggedFigure(gltf) {
  let src = null; gltf.scene.traverse((o) => { if (o.isMesh && !src) src = o; });
  robustPlace(gltf.scene, 1.81); gltf.scene.updateMatrixWorld(true);
  const geo = src.geometry.clone().applyMatrix4(src.matrixWorld); // bake stage placement
  const H = 1.81, D2R = THREE.MathUtils.degToRad;

  // joints: [x, y, z] as fractions of height (x mirrored per side). Heights are
  // standard anthropometry; lateral offsets match this mesh's near-A-pose (max
  // |x| ≈ 0.198·H at the hands).
  const JF = {
    hips: [0, 0.530], spine: [0, 0.585], chest: [0, 0.660], neck: [0, 0.810], head: [0, 0.870], headTop: [0, 0.995],
    shL: [0.129, 0.800], elL: [0.160, 0.650], wrL: [0.185, 0.500], haL: [0.198, 0.435],
    shR: [-0.129, 0.800], elR: [-0.160, 0.650], wrR: [-0.185, 0.500], haR: [-0.198, 0.435],
    hipL: [0.058, 0.515], knL: [0.062, 0.285], anL: [0.066, 0.048], toL: [0.066, 0.018, 0.065],
    hipR: [-0.058, 0.515], knR: [-0.062, 0.285], anR: [-0.066, 0.048], toR: [-0.066, 0.018, 0.065],
  };
  const P = {}; for (const k in JF) P[k] = new THREE.Vector3(JF[k][0] * H, JF[k][1] * H, (JF[k][2] || 0) * H);

  // bones: [name, parent, head joint, tail joint, capsule radius (m)]
  const DEF = [
    ['hips', null, 'hips', 'spine', 0.165], ['spine', 'hips', 'spine', 'chest', 0.165], ['chest', 'spine', 'chest', 'neck', 0.175],
    ['neck', 'chest', 'neck', 'head', 0.07], ['head', 'neck', 'head', 'headTop', 0.125],
    ['uaL', 'chest', 'shL', 'elL', 0.06], ['faL', 'uaL', 'elL', 'wrL', 0.05], ['haL', 'faL', 'wrL', 'haL', 0.05],
    ['uaR', 'chest', 'shR', 'elR', 0.06], ['faR', 'uaR', 'elR', 'wrR', 0.05], ['haR', 'faR', 'wrR', 'haR', 0.05],
    ['thL', 'hips', 'hipL', 'knL', 0.095], ['snL', 'thL', 'knL', 'anL', 0.07], ['ftL', 'snL', 'anL', 'toL', 0.06],
    ['thR', 'hips', 'hipR', 'knR', 0.095], ['snR', 'thR', 'knR', 'anR', 0.07], ['ftR', 'snR', 'anR', 'toR', 0.06],
  ];
  const bones = [], byName = {};
  for (const [name, parent, headJ] of DEF) {
    const b = new THREE.Bone(); b.name = name;
    if (parent) { b.position.copy(P[headJ]).sub(P[DEF.find((d) => d[0] === parent)[2]]); byName[parent].add(b); }
    else b.position.copy(P[headJ]);
    byName[name] = b; bones.push(b);
  }

  // skin weights: nearest-4 capsule distances, radius-relative so the fat torso
  // bones win their own volume; the armpit blend is genuinely ambiguous and the
  // wireframe forgives it.
  const posA = geo.attributes.position, n = posA.count;
  const sIdx = new Uint16Array(n * 4), sWt = new Float32Array(n * 4);
  const v = new THREE.Vector3(), ab = new THREE.Vector3(), ap = new THREE.Vector3(), cl = new THREE.Vector3();
  const segs = DEF.map((d, i) => ({ i, a: P[d[2]], b: P[d[3]], r: d[4] }));
  const distSeg = (p, a, b) => { ab.subVectors(b, a); ap.subVectors(p, a); const t = THREE.MathUtils.clamp(ap.dot(ab) / Math.max(ab.lengthSq(), 1e-8), 0, 1); return cl.copy(ab).multiplyScalar(t).add(a).distanceTo(p); };
  const cand = [];
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(posA, i); cand.length = 0;
    for (const s of segs) cand.push({ i: s.i, w: 1 / Math.pow(distSeg(v, s.a, s.b) / s.r + 0.15, 3) });
    cand.sort((a, b) => b.w - a.w);
    let sum = 0; for (let k = 0; k < 4; k++) sum += cand[k].w;
    for (let k = 0; k < 4; k++) { sIdx[i * 4 + k] = cand[k].i; sWt[i * 4 + k] = cand[k].w / sum; }
  }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(sIdx, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sWt, 4));

  const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 2.0);
  const mat = makeGridMaterial(clip, 0x2fd0e0);
  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.add(byName.hips); mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));

  const figG = new THREE.Group(); figG.add(mesh);
  // holographic bed slab — fades in for the lying/sitting poses only
  const slabGeo = new THREE.BoxGeometry(0.98, 0.07, 2.12);
  const slabMat = new THREE.MeshBasicMaterial({ color: 0x2fd0e0, transparent: true, opacity: 0, depthWrite: false });
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x2fd0e0, transparent: true, opacity: 0 });
  const slab = new THREE.Mesh(slabGeo, slabMat);
  slab.add(new THREE.LineSegments(new THREE.EdgesGeometry(slabGeo), edgeMat));
  slab.position.y = 0.845;
  const bedG = new THREE.Group(); bedG.add(slab);
  const group = new THREE.Group(); group.add(figG, bedG); group.visible = false;

  // clinical poses: per-bone Euler degrees (−x pitch swings a limb forward).
  const Q_LIE = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)); // head away, face up
  const POSES = {
    // yaw turns the chest a few degrees toward the bedside camera so the figure
    // isn't a flat silhouette, while the legs stay effectively in profile
    standing: { yaw: -0.30, pos: [0, 0, 0], bones: { uaL: [-4, 0, -11], uaR: [-4, 0, 11] } },
    sitting: { yaw: -0.26, pos: [0, -0.09, 0], bed: 1, bedZ: -0.96, bones: {
      thL: [-78, 0, -3], thR: [-78, 0, 3], snL: [72, 0, 0], snR: [72, 0, 0], ftL: [10, 0, 0], ftR: [10, 0, 0],
      spine: [7, 0, 0], chest: [5, 0, 0], neck: [2, 0, 0], head: [4, 0, 0],
      uaL: [-16, 0, -14], uaR: [-16, 0, 14], faL: [-44, 0, 0], faR: [-44, 0, 0] } },
    supine: { lie: 1, pos: [0, 1.0, 0.92], bed: 1, bedZ: 0, bones: {
      thL: [-7, 0, -2], thR: [-7, 0, 2], snL: [13, 0, 0], snR: [13, 0, 0], ftL: [30, 0, 0], ftR: [30, 0, 0],
      neck: [-5, 0, 0], head: [-8, 0, 0], uaL: [2, 0, -9], uaR: [2, 0, 9], faL: [-8, 0, 0], faR: [-8, 0, 0] } },
    walking: { yaw: -0.34, pos: [0, 0, 0], gait: 1, bones: { spine: [-3, 0, 0] } },
  };
  let poseKey = 'standing', ph = 0;
  const rootPos = new THREE.Vector3(), rootQ = new THREE.Quaternion(), bedPos = new THREE.Vector3();
  let bedT = 0;
  const tE = new THREE.Euler(), tQ = new THREE.Quaternion(), idQ = new THREE.Quaternion();
  const setPose = (k) => {
    poseKey = POSES[k] ? k : 'standing';
    const p = POSES[poseKey];
    rootPos.set(p.pos[0], p.pos[1], p.pos[2]);
    if (p.lie) rootQ.copy(Q_LIE); else rootQ.setFromEuler(tE.set(0, p.yaw || 0, 0));
    bedT = p.bed ? 1 : 0; bedPos.set(0, 0, p.bedZ || 0);
  };
  setPose('standing');
  figG.position.copy(rootPos); figG.quaternion.copy(rootQ); // no ease-in from origin on first show

  return {
    group, clip, heartMeshes: [],
    setPose,
    setHeartColor() {},
    setReveal() { clip.constant = 2.0; },
    update(dt) {
      const t = performance.now() / 1000;
      const p = POSES[poseKey];
      const deg = {};
      if (p.bones) for (const nm in p.bones) deg[nm] = p.bones[nm];
      const br = 1.3 * Math.sin(t * 0.9); // quiet breathing on the chest
      deg.chest = deg.chest ? [deg.chest[0] + br, deg.chest[1], deg.chest[2]] : [br, 0, 0];
      let bob = 0;
      if (p.gait) {
        ph += dt * 5.2;
        const s = Math.sin(ph), s2 = Math.sin(ph + Math.PI);
        deg.thL = [-26 * s, 0, 0]; deg.thR = [-26 * s2, 0, 0];
        deg.snL = [8 + 30 * Math.max(0, Math.sin(ph - 1.1)), 0, 0];
        deg.snR = [8 + 30 * Math.max(0, Math.sin(ph - 1.1 + Math.PI)), 0, 0];
        deg.uaL = [18 * s2, 0, -12]; deg.uaR = [18 * s, 0, 12];
        deg.faL = [-26, 0, 0]; deg.faR = [-26, 0, 0];
        bob = 0.024 * Math.abs(Math.cos(ph));
      }
      const k = 1 - Math.exp(-dt * (p.gait ? 12 : 5.5));
      for (const b of bones) {
        const d = deg[b.name];
        if (d) { tQ.setFromEuler(tE.set(D2R(d[0]), D2R(d[1]), D2R(d[2]))); b.quaternion.slerp(tQ, k); }
        else b.quaternion.slerp(idQ, k);
      }
      const kp = 1 - Math.exp(-dt * 4);
      cl.copy(rootPos); cl.y += bob;
      figG.position.lerp(cl, kp); figG.quaternion.slerp(rootQ, kp);
      bedG.position.lerp(bedPos, kp);
      const bo = slabMat.opacity + (bedT * 0.05 - slabMat.opacity) * Math.min(1, dt * 4);
      slabMat.opacity = bo; edgeMat.opacity = bo * 9;
      mat.userData.uTime.value = t;
    },
  };
}
const watchCbs = [];
function ensureWatchLayer(cb) {
  if (figs.watch) { cb && cb(); return; }
  if (cb) watchCbs.push(cb);
  if (loadingNames.has('watch')) return;
  loadingNames.add('watch');
  getLoader().load(SYSTEM_URLS.body, (g) => {
    figs.watch = makeRiggedFigure(g);
    patientScene.add(figs.watch.group); loadingNames.delete('watch');
    while (watchCbs.length) watchCbs.shift()();
  }, undefined, (e) => { loadingNames.delete('watch'); watchCbs.length = 0; console.warn('[TARS] watch rig failed', e); });
}
// DORMANT until the discharge beat. WATCH is a 2-D surveillance panel now — the
// rig stays parked for POD 6, where the twin has to stand up off the bed and
// walk out, which nothing else can do. Drive it with:
//   hud:rig {on:true, pose:'standing'|'sitting'|'supine'|'walking'}
let watchOn = false, watchPose = 'standing';
window.addEventListener('hud:rig', (e) => {
  const d = e.detail || {};
  watchOn = !!d.on; if (d.pose) watchPose = d.pose;
  if (displayMode !== 'patient') return;
  if (watchOn) ensureWatchLayer(() => { if (!watchOn) return; activeLayer = 'watch'; applyLayer(); figs.watch.setPose(watchPose); });
  else if (activeLayer === 'watch') { activeLayer = state.chapter === 'continued' ? 'vascular' : 'body'; applyLayer(); }
});
window.addEventListener('hud:rig:pose', (e) => { const p = e.detail && e.detail.pose; if (p) { watchPose = p; if (figs.watch) figs.watch.setPose(p); } });

function buildPatientFigure() {
  human = buildHuman(); human.group.visible = false; patientScene.add(human.group); // invisible placeholder
  { const dl = state.chapter === 'continued' ? 'vascular' : 'body'; ensureLayer(dl, () => { if (activeLayer === dl) applyLayer(); }); }  // default layer streams in (chapter-aware)
}

function applyLayer() {
  const fig = figs[activeLayer];
  if (!fig) { ensureLayer(activeLayer, applyLayer); return; }    // not loaded yet → load then retry
  if (human && human.group && human !== fig) human.group.visible = false;
  for (const f of Object.values(figs)) f.group.visible = (f === fig);
  human = fig; fig.group.visible = true; fig.setReveal(reveal);
  const b = bedById(state.focusId); if (b) configurePatient(b);
  // heart zoom lives on the vascular layer only (that's where the heart is)
  if (activeLayer !== 'vascular' && activeLayer !== 'coronary' && zoomHeart) toggleHeartZoom(false);
}
/* Clicking the heart post-cath does two things, in order: the camera closes in,
 * and then the whole-body vasculature gives way to the patient's own coronary
 * reconstruction. The body has to LEAVE — "just the vessels be there" — so this
 * is a layer swap, not an overlay, and it is held back ~620 ms so the close-up
 * reads as its own move before the anatomy changes underneath it. Zooming back
 * out restores the body vasculature.
 *
 * Post-cath only. In every other chapter the heart zoom is just a close-up, as
 * it has always been — there is no reconstruction to show yet. */
function toggleHeartZoom(force) {
  zoomHeart = force != null ? force : !zoomHeart;
  if (!zoomHeart) orbitZoom = 1; // next close-up opens at the preset distance
  // leaving the close-up always drops the reconstruction with it
  if (!zoomHeart && activeLayer === 'coronary') showCoronary(false);
}

/* The reconstruction is the SECOND click, not the first.
 *
 *   click   → close in on the heart. Still the whole-body vasculature.
 *   dblclick→ the body blinks out and the patient's own vessels fade in.
 *
 * Two gestures because they are two statements: "look at this heart" and "now
 * look at HIS arteries". Folding them into one press meant the anatomy changed
 * underneath a camera move that had not finished making its own point.
 * Post-cath only — nowhere else is there a reconstruction to show. */
function showCoronary(on) {
  if (state.chapter !== 'continued') return;
  if (on) {
    if (activeLayer === 'coronary') return;
    ensureLayer('coronary', () => { if (!zoomHeart) return; activeLayer = 'coronary'; orbitYaw = orbitPitch = orbitYawS = orbitPitchS = 0; orbitZoom = 1; applyLayer(); buildBlocks(figs.coronary); });
  } else if (activeLayer === 'coronary') {
    activeLayer = 'vascular'; applyLayer();
  }
}
function configurePatient(b) { human.setHeartColor(b.cardiac ? 0xff5a52 : b.patient.acuity === 'watch' ? 0xffb24a : 0x9be8ff, b.cardiac); }

onModeChange((mode, focusId) => {
  playTransition();
  clearTimeout(swapTimer);
  swapTimer = setTimeout(() => {
    displayMode = mode;
    if (hoverLabel) { hoverLabel.visible = false; hoverLabel = null; } // don't strand a hover label on re-entry
    if (mode === 'patient') {
      activeLayer = state.chapter === 'continued' ? 'vascular' : 'body'; applyLayer(); configurePatient(bedById(focusId));
      activeScene = patientScene; reveal = 0; camPos.copy(PATIENT.pos); camLook.copy(PATIENT.look);
    } else {
      activeScene = floorScene; camPos.copy(HOME.pos); camLook.copy(HOME.look);
      toggleHeartZoom(false);
    }
  }, 360);
});

function heartHit(e) {
  // raycast the vascular figure's heart meshes — the heart IS the zoom control
  if (displayMode !== 'patient' || (activeLayer !== 'vascular' && activeLayer !== 'coronary')) return null;
  if (!human || !human.heartMeshes || !human.heartMeshes.length) return null;
  const r = canvas.getBoundingClientRect();
  ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1; ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(ptr, camera);
  return raycaster.intersectObjects(human.heartMeshes, false)[0] || null;
}
/* Drag-to-orbit, for the reconstruction only.
 *
 * Not OrbitControls: the patient view drives its own camera (camPos/camLook are
 * damped toward a preset every frame), so a controls rig would spend the whole
 * time fighting it. Rotating the MODEL instead leaves the camera alone and is
 * what "rotate it around" actually means for an object on a plinth.
 *
 * Pitch is clamped: past about a quarter turn you are looking at a heart from
 * underneath, which tells you nothing and loses the orientation the markers
 * will depend on. Yaw is free.
 */
let orbitYaw = 0, orbitPitch = 0, orbiting = null;
let orbitYawS = 0, orbitPitchS = 0; // damped, the values actually applied
// The recon turns itself once it is up — a still object reads as a picture, and
// the point of a reconstruction is that it has a back. Any drag takes over
// immediately and it picks the turn back up a beat after you let go.
const AUTO_SPIN = 0.20, AUTO_RESUME = 1.4; // rad/s (~31 s a turn) · s after a drag
let lastDragAt = 0;
const BLOCK_WP = new THREE.Vector3(), BLOCK_OUT = new THREE.Vector3(), BLOCK_EYE = new THREE.Vector3();
let orbitZoom = 1;                       // 1 = the HEART preset distance
const ORBIT_PITCH_MAX = Math.PI * 0.28;
const ZOOM_MIN = 0.34, ZOOM_MAX = 2.2;   // ~3x in, ~2x out from the preset
const dollyV = new THREE.Vector3();      // reused — this runs every frame
function onPointerDown(e) {
  if (displayMode === 'patient') {
    // a glow-marker click → that machine's full feed in SCOPE (hud.js listens)
    const mh = markerHit(e);
    if (mh) { window.dispatchEvent(new CustomEvent('hud:scope:open', { detail: { marker: mh.object.userData.deviceKey } })); return; }
    // DEV: shift-click the recon to place a marker. Coordinates come back in
    // PIVOT space — the same space CORONARY_BLOCKS is written in — so the line
    // it copies pastes straight over an entry. Beats nudging three numbers
    // blind against a model you can only see after a reload.
    if (import.meta.env && import.meta.env.DEV && e.shiftKey && activeLayer === 'coronary' && human && human.pivot) {
      const r = canvas.getBoundingClientRect();
      ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1; ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      raycaster.setFromCamera(ptr, camera);
      const meshes = []; human.pivot.traverse((o) => { if (o.isMesh) meshes.push(o); });
      const hit = raycaster.intersectObjects(meshes, false)[0];
      if (hit) {
        const p = human.pivot.worldToLocal(hit.point.clone());
        const line = `pos: [${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)}]`;
        navigator.clipboard && navigator.clipboard.writeText(line);
        console.log('[recon] ' + line + '   → copied; paste over a CORONARY_BLOCKS entry');
      }
      return;
    }
    if (activeLayer === 'coronary') { // grab it
      orbiting = { x: e.clientX, y: e.clientY, yaw: orbitYaw, pitch: orbitPitch, moved: 0 }; lastDragAt = performance.now();
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (heartHit(e)) toggleHeartZoom(); return;
  }
  if (displayMode !== 'floor') return;
  const r = canvas.getBoundingClientRect();
  ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1; ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(ptr, camera);
  const hit = raycaster.intersectObjects(pickables, false)[0];
  if (hit) setMode('patient', hit.object.userData.bedId);
}
function onPointerUp(e) {
  if (!orbiting) return;
  const o = orbiting; orbiting = null;
  canvas.releasePointerCapture && canvas.hasPointerCapture && canvas.hasPointerCapture(e.pointerId) && canvas.releasePointerCapture(e.pointerId);
  canvas.style.cursor = 'grab';
  // a drag is not a click: only a press that barely moved should count as one,
  // or every rotation would also fire whatever is under the cursor
  if (o.moved < 4 && heartHit(e)) toggleHeartZoom();
}
function onPointerMove(e) {
  if (orbiting) {
    const dx = e.clientX - orbiting.x, dy = e.clientY - orbiting.y;
    orbiting.moved = Math.max(orbiting.moved, Math.hypot(dx, dy));
    orbitYaw = orbiting.yaw + dx * 0.011;
    orbitPitch = Math.max(-ORBIT_PITCH_MAX, Math.min(ORBIT_PITCH_MAX, orbiting.pitch + dy * 0.009));
    lastDragAt = performance.now();
    canvas.style.cursor = 'grabbing';
    return;
  }
  if (displayMode === 'patient') {
    if (activeLayer === 'coronary') { canvas.style.cursor = 'grab'; return; }
    // postop: hovering a body marker surfaces its compact device card (hud.js)
    const mh = markerHit(e);
    window.dispatchEvent(new CustomEvent('hud:marker:hover', { detail: mh ? { key: mh.object.userData.deviceKey, x: e.clientX, y: e.clientY } : { key: null } }));
    canvas.style.cursor = (mh || heartHit(e)) ? 'pointer' : 'default'; return;
  }
  if (displayMode !== 'floor') { canvas.style.cursor = 'default'; return; }
  const r = canvas.getBoundingClientRect();
  ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1; ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(ptr, camera);
  const hit = raycaster.intersectObjects(pickables, false)[0];
  canvas.style.cursor = hit ? 'pointer' : 'default';
  // bed label appears on hover (the ring itself stays clean, like the ward)
  const lab = hit ? hit.object.userData.label : null;
  if (hoverLabel && hoverLabel !== lab) hoverLabel.visible = false;
  hoverLabel = lab;
  if (hoverLabel) hoverLabel.visible = true;
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
  else if (zoomHeart) {
    // dolly along the preset's own view axis, so scrolling moves you toward the
    // thing you are already looking at rather than sliding the frame
    dl = HEART.look;
    dp = dollyV.copy(HEART.pos).sub(HEART.look).multiplyScalar(orbitZoom).add(HEART.look);
  }
  else if (activeLayer === 'watch') { const w = watchPose === 'supine' ? BEDCAM : WATCHCAM; dp = w.pos; dl = w.look; }
  else { dp = PATIENT.pos; dl = PATIENT.look; }
  const k = damp(dt, zoomHeart ? 3.0 : 2.3); camPos.lerp(dp, k); camLook.lerp(dl, k);
  camera.position.copy(camPos); camera.lookAt(camLook);

  if (displayMode === 'floor') updateFloor(dt); else updatePatient(dt);

  renderer.render(activeScene, camera);            // light clinical → plain render, no bloom
  updateHud(dt);
  requestAnimationFrame(frame);
}

function updateFloor(dt) {
  // the whole ring carousels CLOCKWISE (viewed from above) about its centre,
  // very slowly (~3.5 min / turn). Negative rotation.y = clockwise from overhead.
  if (ringGroup) ringGroup.rotation.y -= dt * 0.03;
  // each bed's small acuity halo blinks at its own rate (staggered phases)
  const t = performance.now() / 1000;
  for (const h of bedHalos) h.mesh.material.opacity = 0.06 + h.amp * (0.5 + 0.5 * Math.sin(t * h.rate + h.phase));
  // square wave, ~1.15 Hz: on hard, off hard. Deliberately NOT the sine the
  // halos use — the eye finds a change of rhythm faster than a change of level.
  const blink = (t * 1.15) % 1 < 0.5 ? 0.85 : 0.12;
  for (const m of inboundMarks) m.material.opacity = blink;
}
function updatePatient(dt) {
  if (reveal < 1) reveal = Math.min(1, reveal + dt / 1.3);
  const b = bedById(state.focusId) || beds[3];
  // postop: the twin stands still, facing front — devices are being connected
  // to a patient, not to a turntable (freeze eases to the anterior view)
  const still = isPostopWorld();
  // the recon is a held object: smooth the drag HERE and hand the result to
  // update(), rather than writing rotation after it and being overwritten
  const orbitable = activeLayer === 'coronary';
  const kOrb = Math.min(1, dt * 14);
  if (orbitable && !orbiting && (performance.now() - lastDragAt) / 1000 > AUTO_RESUME) orbitYaw += dt * AUTO_SPIN;
  if (orbitable) { orbitYawS += (orbitYaw - orbitYawS) * kOrb; orbitPitchS += (orbitPitch - orbitPitchS) * kOrb; }
  else orbitPitchS += (0 - orbitPitchS) * Math.min(1, dt * 8); // unwind pitch on the way out
  human.update(dt, { hr: b.vitals.hr, reveal, spinSpeed: (zoomHeart || still || orbitable) ? 0 : 0.38, freeze: zoomHeart || still, focus: zoomHeart, yaw: orbitable ? orbitYawS : null });
  if (human.setPitch) human.setPitch(orbitPitchS);
  updateBlocks(dt);
  updateMarkers(dt);
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

  // dev-only test hook: snap the camera straight to its target (screenshots can't wait for the eased glide)
  if (import.meta.env && import.meta.env.DEV) window.__snapCam = () => { const t = displayMode !== 'patient' ? HOME : zoomHeart ? HEART : PATIENT; camPos.copy(t.pos); camLook.copy(t.look); if (human && zoomHeart) human.group.rotation.y = Math.round(human.group.rotation.y / (Math.PI * 2)) * Math.PI * 2; };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  // the recon is dragged, so the cursor has to say so
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  // wheel = zoom, but ONLY while the close-up owns the frame; anywhere else the
  // page keeps its scroll. passive:false because we have to preventDefault.
  canvas.addEventListener('wheel', (e) => {
    if (displayMode !== 'patient' || !zoomHeart) return;
    e.preventDefault();
    // exponential, so a notch feels the same close in as far out
    orbitZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, orbitZoom * Math.exp(e.deltaY * 0.0011)));
  }, { passive: false });
  // dblclick is the reconstruction gesture — on the heart going in, anywhere on
  // the recon coming back out
  canvas.addEventListener('dblclick', (e) => {
    if (displayMode !== 'patient' || state.chapter !== 'continued') return;
    if (activeLayer === 'coronary') { showCoronary(false); return; }
    if (heartHit(e)) { toggleHeartZoom(true); showCoronary(true); }
  });
  addEventListener('resize', resize);
  // The deck demo zooms the whole app (body.panela-only), which changes the
  // canvas's box WITHOUT firing a window resize — the renderer would keep its
  // pre-zoom buffer and the twin would sit stretched in a stale viewport.
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(canvas.parentElement);
  resize();
  applySceneTheme(state.dark); // dress the scenes for the current theme
  requestAnimationFrame(frame);
}
