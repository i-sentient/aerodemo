import { useEffect, useRef, useState, type RefObject, type MutableRefObject } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, Lightformer, OrbitControls, RoundedBox } from '@react-three/drei'
import {
  NoToneMapping, CanvasTexture, SRGBColorSpace, RepeatWrapping,
  DoubleSide, Color, MeshStandardMaterial, MeshBasicMaterial, MeshPhysicalMaterial,
  Vector3, Quaternion, MathUtils, PointLight,
} from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { Postprocessing } from '../scene/Postprocessing'
import { useShotCapture } from './useShotCapture'

// ---------------------------------------------------------------------------
//  OPERATING THEATRE (OR-1) — a dark, equipment-dense cardiac OR: tiled walls,
//  the hero surgical-light array pooling warm light on a blue-draped table,
//  glowing patient monitors + an endoscopy screen, and the heart-lung/perfusion
//  rig (the CABG tell). Lit like a real theatre — dark room, bright instruments.
//  Reached from the tower dive after the CABG decision; → at the last preset
//  fires onFinish (→ the Post-Op Manager). Bloom (Postprocessing dark) keys on
//  luminance>1, so lamps + screens use HDR-bright (>1) materials to glow.
// ---------------------------------------------------------------------------

const hdr = (hex: string, m = 1) => new Color(hex).multiplyScalar(m)

// ---- canvas textures (screens glow via bloom; tiles dress the room) --------
function tex(cv: HTMLCanvasElement, rx = 1, ry = 1) {
  const t = new CanvasTexture(cv); t.colorSpace = SRGBColorSpace; t.anisotropy = 4
  if (rx !== 1 || ry !== 1) { t.wrapS = t.wrapT = RepeatWrapping; t.repeat.set(rx, ry) }
  return t
}
function tileTexture(base = '#222932', grout = '#0d1218', rep = 6) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256; const x = cv.getContext('2d')!
  x.fillStyle = base; x.fillRect(0, 0, 256, 256)
  x.strokeStyle = grout; x.lineWidth = 5
  const n = 4, s = 256 / n
  for (let i = 0; i <= n; i++) { x.beginPath(); x.moveTo(i * s, 0); x.lineTo(i * s, 256); x.stroke(); x.beginPath(); x.moveTo(0, i * s); x.lineTo(256, i * s); x.stroke() }
  for (let iy = 0; iy < n; iy++) for (let ix = 0; ix < n; ix++) { x.fillStyle = `rgba(210,225,240,${0.012 + ((ix + iy) % 3) * 0.01})`; x.fillRect(ix * s + 3, iy * s + 3, s - 6, s - 6) }
  return tex(cv, rep, rep)
}
function vitalsTexture(hr = '88', spo2 = '98', rr = '14') {
  const cv = document.createElement('canvas'); cv.width = 480; cv.height = 300; const x = cv.getContext('2d')!
  x.fillStyle = '#040a11'; x.fillRect(0, 0, 480, 300)
  x.strokeStyle = 'rgba(70,110,130,.12)'; x.lineWidth = 1
  for (let g = 0; g <= 480; g += 30) { x.beginPath(); x.moveTo(g, 0); x.lineTo(g, 300); x.stroke() }
  for (let g = 0; g <= 300; g += 30) { x.beginPath(); x.moveTo(0, g); x.lineTo(480, g); x.stroke() }
  const wave = (mid: number, color: string, kind: 'ecg' | 'pleth' | 'resp') => {
    x.strokeStyle = color; x.lineWidth = 2.4; x.shadowColor = color; x.shadowBlur = 7; x.beginPath()
    for (let px = 0; px <= 356; px++) {
      const p = (px % 89) / 89; let y = 0
      if (kind === 'ecg') y = p < 0.1 ? Math.sin(p / 0.1 * Math.PI) * 0.1 : p < 0.2 ? -0.06 : p < 0.24 ? 1 : p < 0.28 ? -0.35 : p < 0.5 ? 0.05 : Math.sin((p - 0.5) / 0.2 * Math.PI) * 0.18
      else if (kind === 'pleth') y = Math.max(0, Math.sin(p * Math.PI)) * 0.72 - 0.08
      else y = Math.sin(p * Math.PI * 0.85) * 0.5
      const yy = mid - y * 32; px ? x.lineTo(px, yy) : x.moveTo(px, yy)
    }
    x.stroke(); x.shadowBlur = 0
  }
  wave(58, '#39f08a', 'ecg'); wave(150, '#37c8ff', 'pleth'); wave(238, '#ffd24a', 'resp')
  x.textBaseline = 'middle'; x.textAlign = 'right'
  x.font = 'bold 46px ui-monospace, monospace'; x.fillStyle = '#39f08a'; x.fillText(hr, 466, 54)
  x.font = 'bold 38px ui-monospace, monospace'; x.fillStyle = '#37c8ff'; x.fillText(spo2, 466, 150)
  x.font = 'bold 32px ui-monospace, monospace'; x.fillStyle = '#ffd24a'; x.fillText(rr, 466, 238)
  return tex(cv)
}
function inUseTexture() {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; const x = cv.getContext('2d')!
  x.fillStyle = '#1c0806'; x.fillRect(0, 0, 512, 128)
  x.strokeStyle = 'rgba(255,110,90,.55)'; x.lineWidth = 6; x.strokeRect(10, 10, 492, 108)
  x.font = 'bold 58px ui-sans-serif, system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'
  x.fillStyle = '#ff6a55'; x.shadowColor = '#ff5a40'; x.shadowBlur = 18
  x.fillText('OR-1 · IN USE', 256, 68)
  return tex(cv)
}
function completedTexture() {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; const x = cv.getContext('2d')!
  x.fillStyle = '#06180c'; x.fillRect(0, 0, 512, 128)
  x.strokeStyle = 'rgba(90,255,150,.5)'; x.lineWidth = 6; x.strokeRect(10, 10, 492, 108)
  x.font = 'bold 48px ui-sans-serif, system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'
  x.fillStyle = '#4ade80'; x.shadowColor = '#34d058'; x.shadowBlur = 18
  x.fillText('OR-1 · COMPLETED', 256, 68)
  return tex(cv)
}
// both faces of the sign share these (drawn once)
const IN_USE_TEX = inUseTexture()
const COMPLETED_TEX = completedTexture()
function endoTexture() {
  const cv = document.createElement('canvas'); cv.width = 420; cv.height = 300; const x = cv.getContext('2d')!
  const g = x.createRadialGradient(210, 150, 16, 210, 150, 250)
  g.addColorStop(0, '#f4c0b8'); g.addColorStop(.35, '#d1665c'); g.addColorStop(.7, '#7c2822'); g.addColorStop(1, '#180505')
  x.fillStyle = g; x.fillRect(0, 0, 420, 300)
  for (let i = 0; i < 26; i++) { x.fillStyle = `rgba(255,225,220,${0.04 + (i % 5) * 0.02})`; x.beginPath(); x.arc(40 + (i * 53) % 380, 30 + (i * 71) % 250, 8 + (i % 4) * 11, 0, 7); x.fill() }
  x.strokeStyle = 'rgba(26,28,32,.9)'; x.lineWidth = 12; x.lineCap = 'round'; x.beginPath(); x.moveTo(70, 300); x.lineTo(232, 150); x.stroke()
  x.fillStyle = 'rgba(200,240,255,.9)'; x.font = '15px ui-monospace, monospace'; x.textAlign = 'left'; x.fillText('LAP · 1080p', 16, 22)
  return tex(cv)
}

// ---- shared materials (created once) ---------------------------------------
const WALL = new MeshStandardMaterial({ map: tileTexture('#26494a', '#0f2426'), color: '#c4ded8', roughness: 0.68, metalness: 0.08, envMapIntensity: 0.8 })
const FLOOR = new MeshStandardMaterial({ map: tileTexture('#35393b', '#1f2325', 9), color: '#cbc6bc', roughness: 0.55, metalness: 0.12, envMapIntensity: 0.9 })
const CEIL = new MeshStandardMaterial({ color: '#5a646d', roughness: 0.85, metalness: 0.05, emissive: new Color('#242c33'), emissiveIntensity: 1 })
const HOUSING = new MeshStandardMaterial({ color: '#e6e9ec', roughness: 0.42, metalness: 0.1, envMapIntensity: 0.9 })
const HOUSING2 = new MeshStandardMaterial({ color: '#c3cad1', roughness: 0.5, metalness: 0.15, envMapIntensity: 0.9 })
const CHROME = new MeshStandardMaterial({ color: '#ccd2d8', roughness: 0.22, metalness: 0.95, envMapIntensity: 1.5 })
const DARKP = new MeshStandardMaterial({ color: '#12161c', roughness: 0.55, metalness: 0.35 })
const BEZEL = new MeshStandardMaterial({ color: '#0c0f14', roughness: 0.5, metalness: 0.4 })
const DRAPE = new MeshStandardMaterial({ color: '#2a6a96', roughness: 0.78, metalness: 0.0, emissive: new Color('#1b4d70'), emissiveIntensity: 0.15 })
const CORRIDOR_WALL = new MeshStandardMaterial({ map: tileTexture('#1e3a3c', '#0c1c1e', 4), color: '#a8c4be', roughness: 0.7, metalness: 0.06 })
const SKIN = new MeshStandardMaterial({ color: '#d8a887', roughness: 0.55, metalness: 0.02 })
const CAP = new MeshStandardMaterial({ color: '#3f7ea6', roughness: 0.72, metalness: 0.02 })
const GOWN = new MeshStandardMaterial({ color: '#3d7a8a', roughness: 0.78, metalness: 0.03 })
const GOWN2 = new MeshStandardMaterial({ color: '#356374', roughness: 0.78, metalness: 0.03 })
const MASK = new MeshStandardMaterial({ color: '#c9dde3', roughness: 0.6, metalness: 0.02 })
const GLASS = new MeshPhysicalMaterial({ color: '#cfe0ea', roughness: 0.15, metalness: 0, transmission: 0.6, transparent: true, opacity: 0.5, thickness: 0.2 })
const LAMP = new MeshBasicMaterial({ color: hdr('#fff4e2', 2.2), toneMapped: false })
const LAMP_RING = new MeshBasicMaterial({ color: hdr('#fff6ea', 1.35), toneMapped: false })
const PANEL_LIGHT = new MeshBasicMaterial({ color: hdr('#e9f3fb', 1.1), toneMapped: false })

// an emissive monitor screen (bezel + glowing face)
function Screen({ pos, rot = [0, 0, 0], size = [0.62, 0.42], map, tint = 1.4 }:
  { pos: [number, number, number]; rot?: [number, number, number]; size?: [number, number]; map: CanvasTexture; tint?: number }) {
  const [w, h] = size
  return (
    <group position={pos} rotation={rot as any}>
      <RoundedBox args={[w + 0.06, h + 0.06, 0.05]} radius={0.02} smoothness={3} material={BEZEL} castShadow />
      <mesh position={[0, 0, 0.028]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={map} color={new Color(tint, tint, tint)} toneMapped={false} />
      </mesh>
    </group>
  )
}

// ---- the room shell --------------------------------------------------------
function Room() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0.5]} receiveShadow>
        <planeGeometry args={[13, 13]} /><primitive object={FLOOR} attach="material" />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position={[0, 4, 0.5]}>
        <planeGeometry args={[13, 13]} /><primitive object={CEIL} attach="material" />
      </mesh>
      {/* recessed ceiling luminaires — the room's general lighting (dimmed-for-
          surgery level: room clearly legible, surgical lamps still dominate) */}
      {([[-2.9, -2.4], [2.9, -2.4], [-2.9, 2.6], [2.9, 2.6]] as const).map(([px, pz], i) => (
        <group key={i} position={[px, 3.96, pz]}>
          <RoundedBox args={[1.75, 0.07, 1.15]} radius={0.02} smoothness={2} material={HOUSING2} />
          <mesh position={[0, -0.04, 0]} rotation-x={Math.PI / 2}>
            <planeGeometry args={[1.55, 0.95]} />
            <primitive object={PANEL_LIGHT} attach="material" />
          </mesh>
          <pointLight position={[0, -0.5, 0]} intensity={16} distance={10} decay={2} color={'#e8f2fa'} />
        </group>
      ))}
      {/* back + side walls (front is behind the camera) */}
      <mesh position={[0, 2, -5]} receiveShadow><planeGeometry args={[13, 4]} /><primitive object={WALL} attach="material" /></mesh>
      <mesh position={[-5.6, 2, 0.5]} rotation-y={Math.PI / 2} receiveShadow><planeGeometry args={[12, 4]} /><primitive object={WALL} attach="material" /></mesh>
      <mesh position={[5.6, 2, 0.5]} rotation-y={-Math.PI / 2} receiveShadow><planeGeometry args={[12, 4]} /><primitive object={WALL} attach="material" /></mesh>
      {/* stainless pass-through cabinet, back-centre */}
      <RoundedBox args={[2.0, 1.5, 0.18]} radius={0.03} smoothness={3} position={[0.4, 1.4, -4.9]} material={CHROME} castShadow />
      <mesh position={[0.4, 1.5, -4.79]}><planeGeometry args={[1.7, 1.05]} /><meshStandardMaterial color="#1a1f26" roughness={0.3} metalness={0.6} /></mesh>
      {/* corridor-side face of the back wall around the sign — single-sided
          facing OUT, so the opening corridor shot has a wall to hang the light
          on while the interior view stays untouched */}
      <mesh position={[-2.65, 2, -5.02]} rotation-y={Math.PI}>
        <planeGeometry args={[5.7, 4]} />
        <primitive object={CORRIDOR_WALL} attach="material" />
      </mesh>
    </group>
  )
}

// the theatre light — one lightbox through the wall, a glowing face on BOTH
// sides. Red IN USE while the case runs; SLOWLY crossfades to green COMPLETED
// at the end (both textures stacked per face, opacity-blended each frame, and
// the wash lights lerp red → green in step).
const WASH_RED = new Color('#ff5a4a')
const WASH_GRN = new Color('#3ae08a')
const WASH_SCRATCH = new Color()
function InUseSign({ done }: { done: boolean }) {
  const fade = useRef(0)
  const redMats = useRef<(MeshBasicMaterial | null)[]>([null, null])
  const grnMats = useRef<(MeshBasicMaterial | null)[]>([null, null])
  const washes = useRef<(PointLight | null)[]>([null, null])
  useFrame((_, dt) => {
    fade.current = MathUtils.damp(fade.current, done ? 1 : 0, 1.1, dt)
    const t = fade.current
    for (const m of redMats.current) if (m) m.opacity = 1 - t
    for (const m of grnMats.current) if (m) m.opacity = t
    WASH_SCRATCH.copy(WASH_RED).lerp(WASH_GRN, t)
    for (const l of washes.current) if (l) l.color.copy(WASH_SCRATCH)
  })
  return (
    <group position={[-2.8, 3.0, -4.97]}>
      <RoundedBox args={[1.6, 0.46, 0.14]} radius={0.03} smoothness={3} material={DARKP} />
      {([[0.075, 0], [-0.075, Math.PI]] as const).map(([z, ry], i) => (
        <group key={i} position={[0, 0, z]} rotation-y={ry}>
          <mesh>
            <planeGeometry args={[1.5, 0.38]} />
            <meshBasicMaterial ref={(m) => { redMats.current[i] = m }} map={IN_USE_TEX} color={hdr('#ffffff', 1.5)} toneMapped={false} transparent depthWrite={false} />
          </mesh>
          <mesh position={[0, 0, 0.002]}>
            <planeGeometry args={[1.5, 0.38]} />
            <meshBasicMaterial ref={(m) => { grnMats.current[i] = m }} map={COMPLETED_TEX} color={hdr('#ffffff', 1.5)} toneMapped={false} transparent opacity={0} depthWrite={false} />
          </mesh>
        </group>
      ))}
      {/* the sign's own light wash — inside + corridor side, follows the fade */}
      <pointLight ref={(l) => { washes.current[0] = l }} position={[0, -0.15, 0.8]} intensity={2} distance={3.2} decay={2} color={WASH_RED} />
      <pointLight ref={(l) => { washes.current[1] = l }} position={[0, -0.15, -1.0]} intensity={2.6} distance={3.8} decay={2} color={WASH_RED} />
    </group>
  )
}

// ---- the hero: ceiling surgical-light array --------------------------------
function LightHead({ pos, r = 0.62 }: { pos: [number, number, number]; r?: number }) {
  const lamps = Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2, rr = r * 0.6
    return [Math.cos(a) * rr, -0.06, Math.sin(a) * rr] as [number, number, number]
  })
  return (
    <group position={pos}>
      {/* housing disc */}
      <mesh castShadow><cylinderGeometry args={[r, r * 0.9, 0.14, 44]} /><primitive object={HOUSING} attach="material" /></mesh>
      {/* central big lamp + ring of small lamps (glow) */}
      <mesh position={[0, -0.075, 0]}><cylinderGeometry args={[r * 0.32, r * 0.32, 0.02, 32]} /><primitive object={LAMP} attach="material" /></mesh>
      {lamps.map((p, i) => (
        <mesh key={i} position={p}><cylinderGeometry args={[0.05, 0.05, 0.02, 16]} /><primitive object={LAMP_RING} attach="material" /></mesh>
      ))}
    </group>
  )
}
// a straight chrome strut from a → b (cylinder oriented along the segment),
// so every boom joint actually connects — no floating arms
function Strut({ a, b, r = 0.05 }: { a: [number, number, number]; b: [number, number, number]; r?: number }) {
  const av = new Vector3(...a), bv = new Vector3(...b)
  const d = bv.clone().sub(av)
  const len = d.length()
  const mid = av.clone().add(bv).multiplyScalar(0.5)
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.normalize())
  return (
    <mesh position={[mid.x, mid.y, mid.z]} quaternion={q}>
      <cylinderGeometry args={[r, r, len, 14]} />
      <primitive object={CHROME} attach="material" />
    </mesh>
  )
}
function SurgicalLights() {
  const HUB: [number, number, number] = [0, 3.38, -0.35]
  const A: [number, number, number] = [-0.55, 2.95, 0.2]
  const B: [number, number, number] = [0.95, 3.05, -0.5]
  const yokeA: [number, number, number] = [A[0], A[1] + 0.14, A[2]]
  const yokeB: [number, number, number] = [B[0], B[1] + 0.14, B[2]]
  return (
    <group>
      {/* ceiling flange → column → hub, then one arm out to each head */}
      <mesh position={[0, 3.94, -0.35]}><cylinderGeometry args={[0.28, 0.32, 0.1, 24]} /><primitive object={HOUSING} attach="material" /></mesh>
      <mesh position={[0, 3.67, -0.35]}><cylinderGeometry args={[0.085, 0.085, 0.56, 16]} /><primitive object={CHROME} attach="material" /></mesh>
      <mesh position={HUB}><cylinderGeometry args={[0.13, 0.13, 0.2, 18]} /><primitive object={HOUSING2} attach="material" /></mesh>
      <Strut a={HUB} b={yokeA} />
      <Strut a={HUB} b={yokeB} />
      {/* elbow caps + yoke spindles dropping into the heads */}
      {[yokeA, yokeB].map((p, i) => (
        <group key={i}>
          <mesh position={p}><sphereGeometry args={[0.065, 14, 14]} /><primitive object={HOUSING2} attach="material" /></mesh>
          <mesh position={[p[0], p[1] - 0.07, p[2]]}><cylinderGeometry args={[0.035, 0.035, 0.14, 12]} /><primitive object={CHROME} attach="material" /></mesh>
        </group>
      ))}
      <LightHead pos={A} r={0.66} />
      <LightHead pos={B} r={0.5} />
      {/* sterile handles hanging from the head centres */}
      {[A, B].map((p, i) => (
        <mesh key={i} position={[p[0], p[1] - 0.17, p[2]]}><cylinderGeometry args={[0.026, 0.038, 0.17, 12]} /><primitive object={HOUSING} attach="material" /></mesh>
      ))}
      {/* the warm pools they throw onto the table */}
      <spotLight position={[-0.55, 2.95, 0.2]} target-position={[0, 0.9, -0.1]} angle={0.62} penumbra={0.55} intensity={45} distance={9} decay={2} color={'#fff2df'} castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0004} />
      <spotLight position={[0.95, 3.05, -0.5]} target-position={[0.2, 0.9, -0.3]} angle={0.5} penumbra={0.6} intensity={30} distance={9} decay={2} color={'#fff4e6'} />
    </group>
  )
}

// ---- the operating table (blue-draped) -------------------------------------
function Table() {
  return (
    <group position={[0, 0, -0.1]}>
      <RoundedBox args={[0.6, 0.16, 0.6]} radius={0.03} smoothness={3} position={[0, 0.08, 0]} material={DARKP} castShadow receiveShadow />
      <mesh position={[0, 0.45, 0]} castShadow><cylinderGeometry args={[0.16, 0.2, 0.72, 20]} /><primitive object={CHROME} attach="material" /></mesh>
      <RoundedBox args={[0.72, 0.1, 2.15]} radius={0.04} smoothness={3} position={[0, 0.82, 0]} material={CHROME} castShadow />
      {/* the draped patient — a BODY silhouette, not a blob: capped head at the
          anaesthesia end, ether screen, then chest / belly / legs / feet mounds
          under one drape sheet */}
      <RoundedBox args={[0.78, 0.06, 2.2]} radius={0.03} smoothness={3} position={[0, 0.9, 0]} material={DRAPE} castShadow />
      <mesh position={[0, 0.99, -0.93]} castShadow><sphereGeometry args={[0.105, 20, 16]} /><primitive object={SKIN} attach="material" /></mesh>
      <mesh position={[0, 1.02, -0.97]} scale={[1, 0.72, 1]}><sphereGeometry args={[0.115, 20, 16]} /><primitive object={CAP} attach="material" /></mesh>
      {/* ether screen between head and field */}
      {[-0.3, 0.3].map((dx, i) => (
        <mesh key={i} position={[dx, 1.12, -0.72]}><cylinderGeometry args={[0.012, 0.012, 0.5, 8]} /><primitive object={CHROME} attach="material" /></mesh>
      ))}
      <mesh position={[0, 1.22, -0.72]}><planeGeometry args={[0.72, 0.3]} /><primitive object={DRAPE} attach="material" /></mesh>
      {/* torso → legs → feet, overlapping low mounds under the drape */}
      <mesh position={[0, 0.94, -0.38]} scale={[0.62, 0.34, 0.8]} castShadow><sphereGeometry args={[0.5, 24, 18]} /><primitive object={DRAPE} attach="material" /></mesh>
      <mesh position={[0, 0.93, 0.05]} scale={[0.56, 0.26, 0.7]} castShadow><sphereGeometry args={[0.5, 24, 18]} /><primitive object={DRAPE} attach="material" /></mesh>
      <mesh position={[0, 0.92, 0.5]} scale={[0.5, 0.22, 0.85]} castShadow><sphereGeometry args={[0.5, 24, 18]} /><primitive object={DRAPE} attach="material" /></mesh>
      <mesh position={[0, 0.9, 0.95]} scale={[0.4, 0.16, 0.8]}><sphereGeometry args={[0.5, 24, 18]} /><primitive object={DRAPE} attach="material" /></mesh>
      {[-0.1, 0.1].map((dx, i) => (
        <mesh key={i} position={[dx, 0.95, 1.16]} scale={[0.8, 1.1, 1.3]}><sphereGeometry args={[0.09, 16, 12]} /><primitive object={DRAPE} attach="material" /></mesh>
      ))}
      {/* the exposed lit surgical field on the chest */}
      <mesh position={[0, 1.115, -0.38]} rotation-x={-Math.PI / 2}><circleGeometry args={[0.15, 24]} /><meshBasicMaterial color={hdr('#ffd8c0', 1.05)} toneMapped={false} /></mesh>
    </group>
  )
}

// ---- equipment carts / booms ----------------------------------------------
function AnaesthesiaMachine({ vitals }: { vitals: CanvasTexture }) {
  return (
    <group position={[-3.7, 0, -2.9]} rotation-y={0.42}>
      <RoundedBox args={[1.0, 1.5, 0.62]} radius={0.05} smoothness={3} position={[0, 0.75, 0]} material={HOUSING} castShadow />
      {[-0.34, 0.34].map((x, i) => <mesh key={i} position={[x, 1.9, -0.1]} castShadow><cylinderGeometry args={[0.12, 0.12, 0.6, 16]} /><meshStandardMaterial color={i ? '#3f8f5f' : '#dfe3e6'} roughness={0.4} metalness={0.3} /></mesh>)}
      <Screen pos={[0, 1.72, 0.34]} size={[0.6, 0.4]} map={vitals} />
      {[0, 1, 2, 3].map((i) => <mesh key={i} position={[-0.3 + i * 0.2, 1.15, 0.32]}><cylinderGeometry args={[0.03, 0.03, 0.12, 10]} /><primitive object={CHROME} attach="material" /></mesh>)}
      {/* castors */}
      {[[-0.4, -0.24], [0.4, -0.24], [-0.4, 0.24], [0.4, 0.24]].map(([x, z], i) => <mesh key={i} position={[x, 0.04, z as number]}><sphereGeometry args={[0.05, 10, 10]} /><primitive object={DARKP} attach="material" /></mesh>)}
    </group>
  )
}
function PerfusionRig({ vitals }: { vitals: CanvasTexture }) {
  return (
    <group position={[3.9, 0, -2.6]} rotation-y={-0.55}>
      <RoundedBox args={[1.3, 1.2, 0.72]} radius={0.05} smoothness={3} position={[0, 0.6, 0]} material={HOUSING2} castShadow />
      {/* roller-pump heads — the CABG tell */}
      {[-0.4, 0, 0.4].map((x, i) => (
        <group key={i} position={[x, 1.28, 0.15]}>
          <mesh rotation-x={Math.PI / 2}><cylinderGeometry args={[0.16, 0.16, 0.12, 28]} /><primitive object={CHROME} attach="material" /></mesh>
          <mesh rotation-x={Math.PI / 2} position={[0, 0, 0.065]}><torusGeometry args={[0.15, 0.02, 8, 28]} /><primitive object={DARKP} attach="material" /></mesh>
        </group>
      ))}
      {/* reservoir cylinders */}
      {[-0.45, 0.45].map((x, i) => <mesh key={i} position={[x, 1.55, -0.15]} castShadow><cylinderGeometry args={[0.13, 0.13, 0.5, 20]} /><primitive object={GLASS} attach="material" /></mesh>)}
      {/* row of round gauges */}
      {[-0.35, -0.12, 0.12, 0.35].map((x, i) => <mesh key={i} position={[x, 0.72, 0.37]}><cylinderGeometry args={[0.08, 0.08, 0.03, 20]} /><meshBasicMaterial color={hdr('#dfeaf2', 1.1)} toneMapped={false} /></mesh>)}
      <Screen pos={[0, 0.6, 0.38]} size={[0.5, 0.34]} map={vitals} tint={1.2} />
      {[[-0.55, -0.28], [0.55, -0.28], [-0.55, 0.28], [0.55, 0.28]].map(([x, z], i) => <mesh key={i} position={[x, 0.04, z as number]}><sphereGeometry args={[0.05, 10, 10]} /><primitive object={DARKP} attach="material" /></mesh>)}
    </group>
  )
}
function EndoMonitor({ map }: { map: CanvasTexture }) {
  return (
    <group position={[4.2, 0, 1.7]}>
      <mesh position={[0, 3, 0]}><cylinderGeometry args={[0.07, 0.07, 2, 14]} /><primitive object={CHROME} attach="material" /></mesh>
      <mesh position={[-0.5, 2.3, 0]} rotation-z={Math.PI / 2}><cylinderGeometry args={[0.04, 0.04, 1.0, 12]} /><primitive object={CHROME} attach="material" /></mesh>
      <Screen pos={[-1.05, 2.35, 0]} rot={[0, -0.55, 0]} size={[0.86, 0.6]} map={map} tint={1.5} />
    </group>
  )
}
function IVPole({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1.05, 0]}><cylinderGeometry args={[0.02, 0.02, 2.1, 10]} /><primitive object={CHROME} attach="material" /></mesh>
      <mesh position={[0.1, 2.05, 0]} rotation-z={-Math.PI / 2}><cylinderGeometry args={[0.015, 0.015, 0.3, 8]} /><primitive object={CHROME} attach="material" /></mesh>
      <mesh position={[0.18, 1.78, 0]}><boxGeometry args={[0.14, 0.24, 0.05]} /><meshPhysicalMaterial color="#c8d8e2" roughness={0.3} transmission={0.4} transparent opacity={0.7} /></mesh>
      <mesh position={[0, 0.035, 0]}><cylinderGeometry args={[0.26, 0.3, 0.07, 20]} /><primitive object={DARKP} attach="material" /></mesh>
    </group>
  )
}
function BackTable({ x, z, ry = 0 }: { x: number; z: number; ry?: number }) {
  return (
    <group position={[x, 0, z]} rotation-y={ry}>
      {[[-0.6, -0.2], [0.6, -0.2], [-0.6, 0.2], [0.6, 0.2]].map(([dx, dz], i) => <mesh key={i} position={[dx, 0.47, dz as number]}><cylinderGeometry args={[0.025, 0.025, 0.94, 10]} /><primitive object={CHROME} attach="material" /></mesh>)}
      <RoundedBox args={[1.5, 0.05, 0.6]} radius={0.02} smoothness={3} position={[0, 0.95, 0]} material={CHROME} castShadow />
      <RoundedBox args={[1.4, 0.04, 0.5]} radius={0.02} smoothness={3} position={[0, 0.99, 0]} material={DRAPE} />
      {/* a few instrument silhouettes */}
      {[-0.4, -0.2, 0, 0.2].map((dx, i) => <mesh key={i} position={[dx, 1.02, 0.05]} rotation-z={0.2 + i * 0.1}><cylinderGeometry args={[0.008, 0.008, 0.3, 6]} /><primitive object={CHROME} attach="material" /></mesh>)}
    </group>
  )
}

// --- second wave of set dressing ------------------------------------------
// case whiteboard — ties the room to the story (Chandrababu's CABG)
function boardTexture() {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 320; const x = cv.getContext('2d')!
  x.fillStyle = '#eef2f4'; x.fillRect(0, 0, 512, 320)
  x.strokeStyle = '#9aa4ac'; x.lineWidth = 10; x.strokeRect(5, 5, 502, 310)
  x.fillStyle = '#1d2a33'; x.font = 'bold 36px ui-sans-serif, system-ui, sans-serif'
  x.fillText('OR-1 · CABG ×3', 30, 58)
  x.font = '26px ui-sans-serif, system-ui, sans-serif'
  x.fillText('CHANDRABABU · ICU-08', 30, 104)
  x.font = '24px ui-sans-serif, system-ui, sans-serif'
  x.fillText('LIMA→LAD · SVG→OM · SVG→PDA', 30, 142)
  // The line that explains why this board exists TODAY. He reached theatre on
  // the same admission because the lab took the culprit with a balloon and no
  // stent, so no P2Y12 was ever loaded and there was no 3-5 day washout to wait
  // out. A cardiac OR board would absolutely carry that — it is the reason the
  // slot could be booked.
  x.fillStyle = '#1f6f5c'; x.font = 'bold 23px ui-sans-serif, system-ui, sans-serif'
  x.fillText('NO DAPT · NO WASHOUT · SAME DAY', 30, 186)
  // OK in red read as an alarm; green is what "checked and fine" looks like
  x.fillStyle = '#2d6a4f'; x.font = '26px ui-sans-serif, system-ui, sans-serif'
  x.fillText('COUNTS: OK', 30, 228)
  x.fillText('PERFUSION: PRIMED', 30, 264)
  // 4 units, matching the pre-op set the clinician signed in the Hub
  // ("cross-match 4u") — the board used to say 2 and contradict the order
  x.fillStyle = '#5a6870'; x.font = '21px ui-monospace, monospace'
  x.fillText('BLOOD: 4u PRBC CROSS-MATCHED', 30, 300)
  return tex(cv)
}
function WhiteBoard() {
  return (
    <group position={[-2.8, 2.15, -4.95]}>
      <RoundedBox args={[1.5, 0.95, 0.05]} radius={0.02} smoothness={3} material={HOUSING2} />
      <mesh position={[0, 0, 0.032]}><planeGeometry args={[1.38, 0.84]} /><meshStandardMaterial map={boardTexture()} roughness={0.35} /></mesh>
    </group>
  )
}
// double swing doors on the back wall, round portholes + chrome kick plates
function SwingDoors() {
  return (
    <group position={[3.4, 0, -4.94]}>
      {[-0.5, 0.5].map((dx, i) => (
        <group key={i} position={[dx, 1.52, 0]}>
          <RoundedBox args={[0.96, 3.0, 0.07]} radius={0.02} smoothness={3} material={HOUSING2} castShadow />
          <mesh position={[0, 0.36, 0.045]}><circleGeometry args={[0.16, 24]} /><meshStandardMaterial color="#131d27" roughness={0.2} metalness={0.3} /></mesh>
          <mesh position={[0, 0.36, 0.045]}><torusGeometry args={[0.165, 0.016, 10, 28]} /><primitive object={CHROME} attach="material" /></mesh>
          <mesh position={[0, -1.28, 0.042]}><boxGeometry args={[0.86, 0.4, 0.015]} /><primitive object={CHROME} attach="material" /></mesh>
          <mesh position={[i === 0 ? 0.38 : -0.38, -0.44, 0.05]}><boxGeometry args={[0.05, 0.58, 0.03]} /><primitive object={CHROME} attach="material" /></mesh>
        </group>
      ))}
      <mesh position={[0, 3.12, 0.01]}><boxGeometry args={[2.14, 0.16, 0.06]} /><primitive object={HOUSING} attach="material" /></mesh>
    </group>
  )
}
// theatre wall clock — white face, red seconds
function ORClock() {
  return (
    <group position={[3.4, 3.56, -4.95]}>
      <mesh rotation-x={Math.PI / 2}><cylinderGeometry args={[0.26, 0.26, 0.06, 28]} /><primitive object={DARKP} attach="material" /></mesh>
      <mesh position={[0, 0, 0.035]}><circleGeometry args={[0.22, 28]} /><meshBasicMaterial color={hdr('#eef3f6', 0.95)} toneMapped={false} /></mesh>
      <mesh position={[0, 0.055, 0.04]}><boxGeometry args={[0.018, 0.11, 0.006]} /><meshBasicMaterial color="#22303a" /></mesh>
      <mesh position={[0.065, -0.02, 0.04]} rotation-z={-1.1}><boxGeometry args={[0.014, 0.15, 0.006]} /><meshBasicMaterial color="#22303a" /></mesh>
      <mesh position={[-0.05, 0.05, 0.042]} rotation-z={0.8}><boxGeometry args={[0.007, 0.19, 0.005]} /><meshBasicMaterial color={hdr('#e04a3a', 1.05)} toneMapped={false} /></mesh>
    </group>
  )
}
// crash cart — the red one, defib + paddles on top
function CrashCart() {
  return (
    <group position={[-3.9, 0, 0.1]} rotation-y={1.05}>
      <RoundedBox args={[0.64, 1.02, 0.5]} radius={0.04} smoothness={3} position={[0, 0.62, 0]} castShadow>
        <meshStandardMaterial color="#a03636" roughness={0.45} metalness={0.15} envMapIntensity={0.9} />
      </RoundedBox>
      {[0.32, 0.54, 0.76, 0.98].map((y, i) => (
        <mesh key={i} position={[0, y, 0.253]}><boxGeometry args={[0.54, 0.13, 0.01]} /><meshStandardMaterial color="#7e2a2a" roughness={0.5} /></mesh>
      ))}
      <mesh position={[0, 0.06, 0]}><cylinderGeometry args={[0.3, 0.34, 0.09, 20]} /><primitive object={DARKP} attach="material" /></mesh>
      <mesh position={[0.36, 1.0, 0]} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.02, 0.02, 0.46, 10]} /><primitive object={CHROME} attach="material" /></mesh>
      {/* defib on the cart top */}
      <RoundedBox args={[0.42, 0.24, 0.34]} radius={0.03} smoothness={3} position={[-0.04, 1.26, 0]} material={DARKP} />
      <mesh position={[-0.09, 1.3, 0.13]} rotation-x={-0.5}><planeGeometry args={[0.2, 0.13]} /><meshBasicMaterial color={hdr('#7de0a8', 1.02)} toneMapped={false} /></mesh>
      {[-0.05, 0.12].map((dz, i) => (
        <mesh key={i} position={[0.16, 1.41, dz]} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.05, 0.06, 0.04, 14]} /><primitive object={CHROME} attach="material" /></mesh>
      ))}
    </group>
  )
}
function Stool({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.04, 0]}><cylinderGeometry args={[0.26, 0.3, 0.08, 20]} /><primitive object={DARKP} attach="material" /></mesh>
      <mesh position={[0, 0.35, 0]}><cylinderGeometry args={[0.03, 0.03, 0.55, 12]} /><primitive object={CHROME} attach="material" /></mesh>
      <mesh position={[0, 0.66, 0]}><cylinderGeometry args={[0.23, 0.23, 0.07, 24]} /><meshStandardMaterial color="#20262c" roughness={0.6} metalness={0.1} /></mesh>
    </group>
  )
}
// stainless kick bucket with the red liner
function KickBucket({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.05, 0]}><cylinderGeometry args={[0.2, 0.23, 0.06, 18]} /><primitive object={DARKP} attach="material" /></mesh>
      <mesh position={[0, 0.24, 0]}><cylinderGeometry args={[0.17, 0.14, 0.3, 20, 1, true]} /><primitive object={CHROME} attach="material" /></mesh>
      <mesh position={[0, 0.36, 0]}><cylinderGeometry args={[0.16, 0.15, 0.1, 20]} /><meshStandardMaterial color="#b23434" roughness={0.6} /></mesh>
      <mesh position={[0, 0.395, 0]} rotation-x={Math.PI / 2}><torusGeometry args={[0.17, 0.014, 10, 26]} /><primitive object={CHROME} attach="material" /></mesh>
    </group>
  )
}
// mayo stand — instrument tray cantilevered over the table foot
function MayoStand() {
  return (
    <group position={[0.9, 0, 1.85]} rotation-y={-0.7}>
      <mesh position={[0, 0.035, 0]}><cylinderGeometry args={[0.24, 0.28, 0.07, 18]} /><primitive object={DARKP} attach="material" /></mesh>
      <mesh position={[0, 0.55, 0]}><cylinderGeometry args={[0.022, 0.022, 1.04, 10]} /><primitive object={CHROME} attach="material" /></mesh>
      <mesh position={[-0.22, 1.06, 0]} rotation-z={Math.PI / 2}><cylinderGeometry args={[0.018, 0.018, 0.46, 8]} /><primitive object={CHROME} attach="material" /></mesh>
      <RoundedBox args={[0.56, 0.025, 0.38]} radius={0.01} smoothness={3} position={[-0.42, 1.08, 0]} material={CHROME} />
      {[-0.55, -0.44, -0.32].map((dx, i) => (
        <mesh key={i} position={[dx, 1.1, 0.04]} rotation-z={0.15 + i * 0.12}><cylinderGeometry args={[0.007, 0.007, 0.26, 6]} /><primitive object={CHROME} attach="material" /></mesh>
      ))}
    </group>
  )
}
// ceiling service pendant — gas head hanging over the table's right side
function ServicePendant() {
  return (
    <group position={[2.4, 4.0, -0.7]}>
      <mesh position={[0, -0.05, 0]}><cylinderGeometry args={[0.26, 0.3, 0.12, 22]} /><primitive object={HOUSING} attach="material" /></mesh>
      <mesh position={[0, -0.4, 0]}><cylinderGeometry args={[0.08, 0.08, 0.6, 16]} /><primitive object={CHROME} attach="material" /></mesh>
      <RoundedBox args={[1.35, 0.22, 0.3]} radius={0.08} smoothness={3} position={[-0.62, -0.78, 0]} material={HOUSING} />
      <mesh position={[-1.28, -1.0, 0]}><cylinderGeometry args={[0.11, 0.11, 0.5, 14]} /><primitive object={CHROME} attach="material" /></mesh>
      <RoundedBox args={[0.68, 0.5, 0.55]} radius={0.05} smoothness={3} position={[-1.28, -1.5, 0]} material={HOUSING} castShadow />
      <mesh position={[-1.28, -1.48, 0.28]}><planeGeometry args={[0.54, 0.3]} /><primitive object={DARKP} attach="material" /></mesh>
      {[['#f2f5f7', -0.16], ['#4cae6e', 0], ['#d8c85a', 0.16]].map(([c, dx], i) => (
        <mesh key={i} position={[dx as number - 1.28, -1.48, 0.29]}><circleGeometry args={[0.032, 14]} /><meshBasicMaterial color={hdr(c as string, 0.9)} toneMapped={false} /></mesh>
      ))}
      {[[-1.42, 0.12], [-1.14, -0.14]].map(([dx, dz], i) => (
        <mesh key={i} position={[dx, -2.05, dz]} rotation-x={i ? 0.12 : -0.1}><cylinderGeometry args={[0.016, 0.016, 0.6, 8]} /><meshStandardMaterial color="#3a4148" roughness={0.7} /></mesh>
      ))}
    </group>
  )
}
// suction canister rack + medical-gas outlet panel on the left wall
function SuctionRack() {
  return (
    <group position={[-5.48, 1.45, -1.3]} rotation-y={Math.PI / 2}>
      <mesh position={[0, 0, -0.04]}><boxGeometry args={[0.56, 0.04, 0.24]} /><primitive object={CHROME} attach="material" /></mesh>
      {[-0.13, 0.13].map((dx, i) => (
        <group key={i} position={[dx, 0.16, 0]}>
          <mesh material={GLASS}><cylinderGeometry args={[0.075, 0.075, 0.28, 16]} /></mesh>
          <mesh position={[0, 0.16, 0]}><cylinderGeometry args={[0.078, 0.078, 0.045, 16]} /><primitive object={DARKP} attach="material" /></mesh>
          <mesh position={[0, -0.1, 0]}><cylinderGeometry args={[0.072, 0.072, 0.07, 16]} /><meshStandardMaterial color="#b03a3a" roughness={0.6} transparent opacity={0.85} /></mesh>
        </group>
      ))}
    </group>
  )
}
function GasPanel() {
  return (
    <group position={[-5.52, 1.5, -3.5]} rotation-y={Math.PI / 2}>
      <RoundedBox args={[0.7, 0.42, 0.05]} radius={0.02} smoothness={3} material={HOUSING2} />
      {[['#f2f5f7', -0.24], ['#4a7dc8', -0.08], ['#d8c85a', 0.08], ['#4cae6e', 0.24]].map(([c, dx], i) => (
        <group key={i} position={[dx as number, 0, 0.032]}>
          <mesh><circleGeometry args={[0.045, 16]} /><meshBasicMaterial color={hdr(c as string, 0.85)} toneMapped={false} /></mesh>
          <mesh position={[0, 0, 0.002]} rotation-x={Math.PI / 2}><torusGeometry args={[0.048, 0.008, 8, 20]} /><primitive object={CHROME} attach="material" /></mesh>
        </group>
      ))}
    </group>
  )
}
// laminar-flow diffuser frame recessed around the light-boom mount
function LaminarFrame() {
  return (
    <group position={[0, 3.96, -0.1]}>
      <mesh position={[0, 0.025, 0]}><boxGeometry args={[3.5, 0.01, 2.7]} /><meshStandardMaterial color="#39424a" roughness={0.8} metalness={0.05} /></mesh>
      {[[0, -1.32], [0, 1.32]].map(([dx, dz], i) => (
        <mesh key={i} position={[dx, 0, dz]}><boxGeometry args={[3.6, 0.06, 0.08]} /><primitive object={HOUSING2} attach="material" /></mesh>
      ))}
      {[[-1.76, 0], [1.76, 0]].map(([dx, dz], i) => (
        <mesh key={i} position={[dx, 0, dz]}><boxGeometry args={[0.08, 0.06, 2.72]} /><primitive object={HOUSING2} attach="material" /></mesh>
      ))}
      {[-0.44, 0.44].map((dz, i) => (
        <mesh key={i} position={[0, 0.01, dz]}><boxGeometry args={[3.5, 0.04, 0.04]} /><meshStandardMaterial color="#4a545e" roughness={0.7} /></mesh>
      ))}
    </group>
  )
}

// ---- the team — still, masked silhouettes in the light pools ---------------
function StaffFigure({ pos, ry = 0, lean = 0.12, seated = false, gown = GOWN }: {
  pos: [number, number, number]; ry?: number; lean?: number; seated?: boolean; gown?: MeshStandardMaterial
}) {
  const hipY = seated ? 0.62 : 0.95
  return (
    <group position={pos} rotation-y={ry}>
      {seated ? (
        <>
          {/* their stool + a lap hint */}
          <mesh position={[0, 0.04, 0]}><cylinderGeometry args={[0.24, 0.28, 0.08, 18]} /><primitive object={DARKP} attach="material" /></mesh>
          <mesh position={[0, 0.32, 0]}><cylinderGeometry args={[0.03, 0.03, 0.5, 10]} /><primitive object={CHROME} attach="material" /></mesh>
          <mesh position={[0, 0.58, 0]}><cylinderGeometry args={[0.22, 0.22, 0.06, 20]} /><meshStandardMaterial color="#20262c" roughness={0.6} /></mesh>
          <mesh position={[0, 0.63, 0.13]} scale={[1, 0.55, 1.35]}><sphereGeometry args={[0.17, 16, 12]} /><primitive object={gown} attach="material" /></mesh>
        </>
      ) : (
        <mesh position={[0, hipY / 2 + 0.02, 0]} castShadow>
          <cylinderGeometry args={[0.155, 0.2, hipY, 14]} /><primitive object={gown} attach="material" />
        </mesh>
      )}
      {/* torso + arms + capped, masked head — pitched by `lean` */}
      <group position={[0, hipY, 0]} rotation-x={lean}>
        <mesh position={[0, 0.22, 0]} castShadow><capsuleGeometry args={[0.17, 0.26, 6, 14]} /><primitive object={gown} attach="material" /></mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.21, 0.26, 0.08]} rotation-x={-0.9} rotation-z={s * 0.18}>
            <capsuleGeometry args={[0.045, 0.34, 6, 10]} /><primitive object={gown} attach="material" />
          </mesh>
        ))}
        <mesh position={[0, 0.56, 0]}><sphereGeometry args={[0.1, 18, 14]} /><primitive object={SKIN} attach="material" /></mesh>
        <mesh position={[0, 0.6, -0.012]} scale={[1, 0.7, 1]}><sphereGeometry args={[0.108, 18, 14]} /><primitive object={CAP} attach="material" /></mesh>
        <mesh position={[0, 0.53, 0.082]} scale={[1, 1, 0.55]}><sphereGeometry args={[0.075, 14, 10]} /><primitive object={MASK} attach="material" /></mesh>
      </group>
    </group>
  )
}

function ORSet({ done }: { done: boolean }) {
  // separate screen textures so they're not visually identical
  const v1 = vitalsTexture('88', '98', '14')
  const v3 = vitalsTexture('90', '97', '16')
  const endo = endoTexture()
  return (
    <group>
      <Room />
      <InUseSign done={done} />
      <SurgicalLights />
      <Table />
      <AnaesthesiaMachine vitals={v1} />
      <PerfusionRig vitals={v3} />
      <EndoMonitor map={endo} />
      <IVPole x={-1.2} z={-2.2} />
      <IVPole x={2.0} z={1.9} />
      <BackTable x={-1.6} z={-4.25} ry={0} />
      <BackTable x={2.6} z={3.2} ry={-0.3} />
      {/* the team of five — surgeon + assistant over the field, scrub nurse at
          the back table, anaesthetist at the head, perfusionist at the pump */}
      <StaffFigure pos={[0.62, 0, -0.5]} ry={-Math.PI / 2} lean={0.3} />
      <StaffFigure pos={[-0.62, 0, -0.32]} ry={Math.PI / 2} lean={0.3} gown={GOWN2} />
      <StaffFigure pos={[-1.55, 0, -3.55]} ry={Math.PI} lean={0.15} />
      <StaffFigure pos={[-0.85, 0, -1.7]} ry={0.9} lean={0.1} gown={GOWN2} />
      <StaffFigure pos={[3.15, 0, -2.0]} ry={2.2} seated gown={GOWN2} />
      {/* second wave of set dressing */}
      <SwingDoors />
      <ORClock />
      <CrashCart />
      <Stool x={-2.5} z={-1.5} />
      <Stool x={1.5} z={-0.8} />
      <KickBucket x={-1.15} z={0.85} />
      <KickBucket x={1.35} z={-1.85} />
      <MayoStand />
      <ServicePendant />
      <SuctionRack />
      <GasPanel />
      <WhiteBoard />
      <LaminarFrame />
      {/* colored screen-spill point lights for atmosphere (follow the machines) */}
      <pointLight position={[3.4, 2.3, 1.9]} intensity={4} distance={4} decay={2} color={'#e88'} />
      <pointLight position={[-3.3, 1.8, -2.5]} intensity={2} distance={3.5} decay={2} color={'#4ce0a0'} />
      <pointLight position={[3.6, 1.6, -2.2]} intensity={2.5} distance={3.5} decay={2} color={'#ffb46a'} />
    </group>
  )
}

// --- studio: dark room mood, the surgical lamps carry the illumination -------
function ORStudio() {
  return (
    <>
      <color attach="background" args={['#17202a']} />
      <ambientLight intensity={0.45} color={0xbcc6cc} />
      {/* warm key vs teal walls — chromatic contrast so the room doesn't grey out;
          this is a lit room, the surgical lamps just outshine it */}
      <directionalLight intensity={0.85} color={0xeee2cf} position={[-6, 10, 6]} />
      <hemisphereLight intensity={0.5} color={0xb4c8d2} groundColor={0x2e332e} />
      <Environment resolution={256} frames={1}>
        <color attach="background" args={['#1a222b']} />
        <Lightformer form="rect" intensity={2.6} color="#dfeeff" position={[0, 6, -8]} scale={[10, 5, 1]} />
        <Lightformer form="rect" intensity={1.8} color="#cfe0ee" position={[-8, 5, 4]} scale={[2, 10, 1]} rotation-y={Math.PI / 2} />
        <Lightformer form="rect" intensity={1.8} color="#cfe0ee" position={[8, 5, 4]} scale={[2, 10, 1]} rotation-y={-Math.PI / 2} />
      </Environment>
    </>
  )
}

// --- preset camera angles ---------------------------------------------------
type Shot = { pos: [number, number, number]; look: [number, number, number] }
const SHOTS: Shot[] = [
  { pos: [-1.42, 2.74, -7.42], look: [-2.8, 2.6, -5] }, // 0 · corridor — the red IN USE light, off-axis
  { pos: [-1.67, 2.63, -2.5], look: [-2.8, 2.6, -5] },  // 1 · pushes through the wall — inside, still on the sign
  { pos: [7.26, 0.62, 2.95], look: [-2.76, 2.58, -4.94] }, // 2 · dive way back — low corner reveal through the culled wall, sign held
  { pos: [-0.06, 1.9, 6.59], look: [0, 1.1, -0.2] },    // 3 · straight long shot
  { pos: [-5.69, 2.26, 5.22], look: [-0.02, 1.11, -0.23] }, // 4 · corner long shot
  { pos: [-2.5, 1.65, 2.5], look: [0.2, 1, -0.6] },     // 5 · in past the anaesthesia machine
  { pos: [-1.67, 2.63, -2.5], look: [-2.8, 2.6, -5] },  // 6 · dive back to the sign → green COMPLETED
]
const N_BEATS = SHOTS.length
const LAST = N_BEATS - 1

// smooth camera glide for the final "dive to the sign" beat — every other
// preset stays a hard movie cut. Damps position + target toward `goal`, then
// hands control back and reports arrival (that's when the sign flips green).
function GlideRig({ controls, goal, onArrive }: {
  controls: RefObject<OrbitControlsImpl | null>
  goal: MutableRefObject<Shot | null>
  onArrive: () => void
}) {
  useFrame((_, dt) => {
    const g = goal.current
    const c = controls.current
    if (!g || !c) return
    const cam = c.object
    const k = 2.2
    cam.position.x = MathUtils.damp(cam.position.x, g.pos[0], k, dt)
    cam.position.y = MathUtils.damp(cam.position.y, g.pos[1], k, dt)
    cam.position.z = MathUtils.damp(cam.position.z, g.pos[2], k, dt)
    c.target.x = MathUtils.damp(c.target.x, g.look[0], k, dt)
    c.target.y = MathUtils.damp(c.target.y, g.look[1], k, dt)
    c.target.z = MathUtils.damp(c.target.z, g.look[2], k, dt)
    c.update()
    const d = Math.hypot(cam.position.x - g.pos[0], cam.position.y - g.pos[1], cam.position.z - g.pos[2])
    if (d < 0.06) {
      goal.current = null
      c.enabled = true
      onArrive()
    }
  })
  return null
}

export function ORScene({ onFinish }: { onFinish?: () => void } = {}) {
  const controls = useRef<OrbitControlsImpl>(null)
  const step = useRef(0)
  const glideGoal = useRef<Shot | null>(null)
  const [done, setDone] = useState(false) // the sign: red IN USE → green COMPLETED
  const onFinishRef = useRef(onFinish)
  onFinishRef.current = onFinish
  useShotCapture(controls) // DEV: P = copy current camera as a SHOT line
  useEffect(() => {
    // every preset transition is a smooth glide (the through-the-wall push and
    // the pull-back reveal demand it — cuts would break the move)
    const go = (i: number) => {
      glideGoal.current = SHOTS[i]
      if (controls.current) controls.current.enabled = false
      if (i < LAST) setDone(false) // only the settled final beat shows green
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowRight') {
        e.preventDefault()
        if (step.current >= LAST) { onFinishRef.current?.(); return } // → past the last beat → Post-Op Manager
        step.current += 1
        go(step.current)
      } else if (e.code === 'ArrowLeft' || e.code === 'Backspace') {
        e.preventDefault()
        step.current = Math.max(step.current - 1, 0)
        go(step.current)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, toneMapping: NoToneMapping }}
        camera={{ position: SHOTS[0].pos, fov: 48 }}
      >
        <ORStudio />
        <ORSet done={done} />
        <GlideRig controls={controls} goal={glideGoal} onArrive={() => { if (step.current === LAST) setDone(true) }} />
        <OrbitControls
          ref={controls}
          target={SHOTS[0].look}
          enableDamping
          dampingFactor={0.08}
          minDistance={2}
          maxDistance={13}
          maxPolarAngle={Math.PI / 1.75}
        />
        <Postprocessing dark />
      </Canvas>
      {/* same scaffold badge the cath lab carried, removed for the same reason:
          it named the room the audience is standing in and advertised the dev
          controls underneath it */}
    </div>
  )
}
