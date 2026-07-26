import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

import { beds, COL, bedById } from './ontology.js';
import { state, setMode, onModeChange, onThemeChange } from './state.js';
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
const pickables = [], bedHalos = [];
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
const RING = { cx: 0, cz: 3, rZone: 9, rBed: 7.0, n: 8 };
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
  c.fillText('ICU', 320 + 12, 168);
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
};
const SYSTEM_COLORS = { skeletal: 0x35808d, vascular: 0x2f8d80, nervous: 0x4a8f72, body: 0x3f8fe0, grid: 0x2fd0e0 };

// Robust placement onto the stage. The raw AABB midpoint is thrown off by
// asymmetric limbs (a raised arm) and stray/among-scene geometry, so models from
// different sources (AnatomyTOOL skeleton vs Z-Anatomy vascular/nervous) landed
// off-centre. Instead we use per-vertex statistics: MEDIAN x/z = the anatomical
// midline (robust to outliers), and low/high percentiles = the true body height &
// floor. Result: every system centres identically on the platform.
function robustPlace(root, targetH = 1.72) {
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
  root.scale.setScalar(s); root.position.set(-cx * s, -yLo * s, -cz * s); root.updateMatrixWorld(true);
}

function makeFigureFromGLTF(gltf, { heart = false, color = 0x49e0ff, vascular = false, style = null } = {}) {
  const root = gltf.scene; robustPlace(root, style === 'body' || style === 'grid' ? 1.81 : 1.72); // body reads a touch (+5%) bigger on stage
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
  const group = new THREE.Group(); group.add(root); group.visible = false;
  let hsp = null;
  if (heart) { hsp = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0xff5a52, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); hsp.scale.set(0.34, 0.34, 1); hsp.position.set(0.02, 1.24, 0.14); group.add(hsp); }
  let cardiac = false, spin = 0;
  return {
    group, clip, heartMeshes,
    setHeartColor(hex, isC) { cardiac = !!isC; if (hsp) hsp.material.color.set(hex); },
    setReveal(r) { clip.constant = THREE.MathUtils.lerp(-0.05, 1.92, r); },
    update(dt, { hr = 70, reveal = 1, spinSpeed = 0.32, freeze = false, focus = false } = {}) {
      if (freeze) { const tgt = Math.round(spin / (Math.PI * 2)) * Math.PI * 2; spin = THREE.MathUtils.lerp(spin, tgt, 1 - Math.exp(-dt * 3.2)); } // ease to anterior (front)
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
    figs[name] = makeFigureFromGLTF(g, { heart: name === 'vascular', color: SYSTEM_COLORS[name], vascular: name === 'vascular', style: name });
    patientScene.add(figs[name].group); loadingNames.delete(name);
    applySceneTheme(state.dark); // dress the fresh figure for the current theme (body legibility)
    if (name === 'body' && pendingMarkers) { const d = pendingMarkers; pendingMarkers = null; applyMarkers(d); } // markers queued before the mesh landed
    cb && cb();
  }, undefined, (e) => { loadingNames.delete(name); console.warn('[TARS] layer load failed', name, e); });
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
  if (displayMode !== 'patient' || state.chapter !== 'postop' || !figs.body || activeLayer !== 'body') return null;
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
// rig stays parked for POD 4, where the twin has to stand up off the bed and
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
  if (activeLayer !== 'vascular' && zoomHeart) toggleHeartZoom(false);
}
function toggleHeartZoom(force) {
  zoomHeart = force != null ? force : !zoomHeart;
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
  if (displayMode !== 'patient' || activeLayer !== 'vascular' || !human || !human.heartMeshes || !human.heartMeshes.length) return null;
  const r = canvas.getBoundingClientRect();
  ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1; ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(ptr, camera);
  return raycaster.intersectObjects(human.heartMeshes, false)[0] || null;
}
function onPointerDown(e) {
  if (displayMode === 'patient') {
    // a glow-marker click → that machine's full feed in SCOPE (hud.js listens)
    const mh = markerHit(e);
    if (mh) { window.dispatchEvent(new CustomEvent('hud:scope:open', { detail: { marker: mh.object.userData.deviceKey } })); return; }
    if (heartHit(e)) toggleHeartZoom(); return;
  }
  if (displayMode !== 'floor') return;
  const r = canvas.getBoundingClientRect();
  ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1; ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(ptr, camera);
  const hit = raycaster.intersectObjects(pickables, false)[0];
  if (hit) setMode('patient', hit.object.userData.bedId);
}
function onPointerMove(e) {
  if (displayMode === 'patient') {
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
  else if (zoomHeart) { dp = HEART.pos; dl = HEART.look; }
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
}
function updatePatient(dt) {
  if (reveal < 1) reveal = Math.min(1, reveal + dt / 1.3);
  const b = bedById(state.focusId) || beds[3];
  // postop: the twin stands still, facing front — devices are being connected
  // to a patient, not to a turntable (freeze eases to the anterior view)
  const still = state.chapter === 'postop';
  human.update(dt, { hr: b.vitals.hr, reveal, spinSpeed: (zoomHeart || still) ? 0 : 0.38, freeze: zoomHeart || still, focus: zoomHeart });
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
  addEventListener('resize', resize); resize();
  applySceneTheme(state.dark); // dress the scenes for the current theme
  requestAnimationFrame(frame);
}
