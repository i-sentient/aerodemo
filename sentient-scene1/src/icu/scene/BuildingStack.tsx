import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, RoundedBox } from '@react-three/drei'
import {
  CapsuleGeometry,
  Color,
  ExtrudeGeometry,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  Shape,
  type Group,
} from 'three'
import { hdrCss } from './glow'
import { makePanelTexture } from './textures'

// ===========================================================================
//  BUILDING STACK — Sony-Ericsson-style sculpted PAVILION.
//  A tall squircle (superellipse) white molded-fiberglass shell, banded by
//  glowing green frosted clerestory slots with white pod silhouettes; a green
//  ER "mouth" on the ground front; a brushed-metal stair; a green liquid-metal
//  jewel orb crown. Staged in a dark reflective hall (Environment `dark`).
//  Export contract (App/fly-in depend on these) preserved exactly.
// ===========================================================================

const W = 11.6 // wider
const D = 7.2
const BLOCK_H = 1.9
const PLATE_H = 0.28
const GAP = 0.34
const PITCH = BLOCK_H + PLATE_H + GAP // 2.52
const HALF_W = (W * 0.9) / 2 // 5.22
const HALF_D = (D * 0.9) / 2 // 3.24
const SQ_N = 7 // higher n = less corner curvature (boxier)

const GREEN_GLOW = '#2EE6A6'
const GREEN_FROST = '#BFEFDD'
const METAL = '#C3CCD2'
const ORB_GREEN = '#12C07A'

export interface FloorDef {
  id: string
  label: string
  sub: string
  rooms: number
  hero?: boolean
}

export const FLOORS: FloorDef[] = [
  { id: 'er', label: 'Emergency', sub: 'ER · ground', rooms: 3, hero: true },
  { id: 'imaging', label: 'Imaging', sub: 'radiology', rooms: 2 },
  { id: 'cath', label: 'Cath Lab', sub: 'PCI · procedures', rooms: 2 },
  { id: 'theatres', label: 'Theatres', sub: 'surgery', rooms: 2 },
  { id: 'icu', label: 'ICU', sub: 'critical care', rooms: 2 },
  { id: 'hdu', label: 'HDU', sub: 'high dependency', rooms: 2 },
  { id: 'wardA', label: 'Ward A', sub: 'inpatient', rooms: 3 },
  { id: 'wardB', label: 'Ward B', sub: 'step-down', rooms: 3 },
  { id: 'command', label: 'Command', sub: 'TARS · ops', rooms: 2 },
]

export const floorCenterY = (i: number) => i * PITCH + PLATE_H + BLOCK_H / 2
export const STACK_TOP = FLOORS.length * PITCH
export const ER_INFO = { y: floorCenterY(0), frontZ: (D * 0.9) / 2, w: W * 0.9, h: BLOCK_H }

// --- shared squircle profile ------------------------------------------------
function squircle(halfW: number, halfD: number, n: number, seg: number): Shape {
  const s = new Shape()
  for (let i = 0; i <= seg; i++) {
    const t = (i / seg) * Math.PI * 2
    const c = Math.cos(t)
    const d = Math.sin(t)
    const x = halfW * Math.sign(c) * Math.abs(c) ** (2 / n)
    const y = halfD * Math.sign(d) * Math.abs(d) ** (2 / n)
    i ? s.lineTo(x, y) : s.moveTo(x, y)
  }
  return s
}
const SHAPE = squircle(HALF_W, HALF_D, SQ_N, 88)

function extrudeUp(depth: number, bevel: number): ExtrudeGeometry {
  const g = new ExtrudeGeometry(SHAPE, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 8,
    curveSegments: 72,
    steps: 1,
  })
  g.center()
  g.rotateX(-Math.PI / 2)
  return g
}
const RIB_GEO = extrudeUp(1.62, 0.14) // total height 1.9 = BLOCK_H; less bevel = less curvature
const COVER_GEO = extrudeUp(0.62, 0)
const CORE_GEO = extrudeUp(0.7, 0)
const POD_GEO = new CapsuleGeometry(0.26, 0.5, 6, 12)

function roundedRect(w: number, h: number, r: number): Shape {
  const s = new Shape()
  const x = -w / 2
  const y = -h / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}
function frameGeo(ow: number, oh: number, or_: number, iw: number, ih: number, ir: number, depth: number) {
  const s = roundedRect(ow, oh, or_)
  s.holes.push(roundedRect(iw, ih, ir))
  return new ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 24 })
}
const MOUTH_RIM_GEO = frameGeo(2 * HALF_W * 0.82, 2.2, 0.24, 2 * HALF_W * 0.72, 1.7, 0.2, 0.14)
const MOUTH_LIP_GEO = frameGeo(2 * HALF_W * 0.86, 2.55, 0.28, 2 * HALF_W * 0.75, 1.82, 0.22, 0.16)

// --- shared materials (created once; pick up scene.environment) -------------
// light gunmetal + large panels divided by thin dark seam lines; shiny metal
const shellTex = makePanelTexture(2, '#a8adb4', '#333a42', 512)
shellTex.wrapS = shellTex.wrapT = RepeatWrapping
shellTex.repeat.set(0.22, 0.22) // very low repeat = large panels
shellTex.anisotropy = 4
const shellMat = new MeshStandardMaterial({
  color: new Color('#ffffff'),
  map: shellTex,
  metalness: 0.92,
  roughness: 0.22,
  envMapIntensity: 1.5,
})
const frostMat = new MeshPhysicalMaterial({
  color: new Color(GREEN_FROST),
  transparent: true,
  opacity: 0.55,
  roughness: 0.42,
  metalness: 0,
  clearcoat: 0.6,
  clearcoatRoughness: 0.25,
  emissive: new Color('#1FBF86'),
  emissiveIntensity: 0.4,
  envMapIntensity: 1,
})
const coreMat = new MeshBasicMaterial({ color: hdrCss(GREEN_GLOW, 1.7), toneMapped: false, transparent: true, opacity: 0.85 })
const metalMat = new MeshStandardMaterial({ color: new Color(METAL), metalness: 0.9, roughness: 0.34, envMapIntensity: 1.5 })
const podMat = new MeshStandardMaterial({
  color: new Color('#F2F5F2'),
  metalness: 0,
  roughness: 0.32,
  envMapIntensity: 0.9,
  emissive: new Color('#12351f'),
  emissiveIntensity: 0.15,
})
const throatMat = new MeshStandardMaterial({
  color: new Color('#080B0E'),
  metalness: 0.3,
  roughness: 0.7,
  emissive: new Color('#0E6B4A'),
  emissiveIntensity: 0.45,
})
const rimMat = new MeshBasicMaterial({ color: hdrCss(GREEN_GLOW, 1.9), toneMapped: false })
const orbMat = new MeshPhysicalMaterial({
  color: new Color(ORB_GREEN),
  metalness: 1,
  roughness: 0.12,
  clearcoat: 1,
  clearcoatRoughness: 0.05,
  envMapIntensity: 2.2,
  emissive: new Color('#0A9C5E'),
  emissiveIntensity: 0.35,
})
const orbCoreMat = new MeshBasicMaterial({ color: hdrCss(GREEN_GLOW, 2.2), toneMapped: false })

// --- one floor: white rib + recessed green band + pods ----------------------
function FloorBlock({ floor, index }: { floor: FloorDef; index: number }) {
  const base = index * PITCH
  const bandY = base + PLATE_H + BLOCK_H + GAP / 2
  const podXs = floor.rooms >= 3 ? [-3.2, -1, 1, 3.2] : [-2.3, 0.4, 2.7]
  return (
    <group>
      <mesh geometry={RIB_GEO} material={shellMat} position={[0, floorCenterY(index), 0]} castShadow receiveShadow />
      <mesh geometry={CORE_GEO} material={coreMat} position={[0, bandY, 0]} scale={[0.9, 1, 0.9]} />
      <mesh geometry={COVER_GEO} material={frostMat} position={[0, bandY, 0]} scale={[0.985, 1, 0.985]} />
      {podXs.map((x, i) => (
        <mesh key={i} geometry={POD_GEO} material={podMat} position={[x, bandY, 1.7]} />
      ))}
    </group>
  )
}

// --- ER mouth (ground front) ------------------------------------------------
function ERMouth() {
  const orbRef = useRef<Group>(null)
  useFrame((s) => {
    if (orbRef.current) {
      orbRef.current.rotation.y += 0.01
      orbRef.current.scale.setScalar(1 + 0.06 * Math.sin(s.clock.elapsedTime * 2))
    }
  })
  const z = ER_INFO.frontZ
  return (
    <group position={[0, ER_INFO.y, 0]}>
      <RoundedBox args={[2 * HALF_W * 0.7, 1.7, 2.6]} radius={0.16} smoothness={4} position={[0, 0, z - 1.35]} material={throatMat} />
      <mesh geometry={MOUTH_LIP_GEO} material={metalMat} position={[0, 0, z - 0.16]} />
      <mesh geometry={MOUTH_RIM_GEO} material={rimMat} position={[0, 0, z - 0.02]} />
      <mesh geometry={POD_GEO} material={podMat} position={[-1.7, -0.1, z - 1.0]} />
      <mesh geometry={POD_GEO} material={podMat} position={[1.7, -0.1, z - 1.0]} />
      <group ref={orbRef} position={[0, 0.55, z - 0.9]}>
        <mesh material={orbMat}>
          <sphereGeometry args={[0.42, 40, 40]} />
        </mesh>
        <mesh material={orbCoreMat} scale={0.72}>
          <sphereGeometry args={[0.42, 24, 24]} />
        </mesh>
      </group>
    </group>
  )
}

// --- brushed-metal stair up the +X flank + green balustrade + mezzanine -----
function Stair() {
  const n = 12
  return (
    <group>
      {Array.from({ length: n }, (_, i) => (
        <RoundedBox
          key={i}
          args={[1.5, 0.08, 0.44]}
          radius={0.03}
          smoothness={3}
          material={metalMat}
          position={[HALF_W + 0.55 + i * 0.05, 0.42 + i * 0.28, 1.7 - i * 0.28]}
        />
      ))}
      {Array.from({ length: n }, (_, i) => (
        <mesh key={'b' + i} material={frostMat} position={[HALF_W + 1.35 + i * 0.05, 0.9 + i * 0.28, 1.7 - i * 0.28]}>
          <boxGeometry args={[0.06, 0.9, 0.5]} />
        </mesh>
      ))}
      <RoundedBox args={[2.6, 0.14, 2.0]} radius={0.08} smoothness={3} material={metalMat} position={[HALF_W - 0.1, 3.9, -1.6]} />
    </group>
  )
}

function CrownOrb() {
  const ref = useRef<Group>(null)
  useFrame((s) => {
    if (ref.current) {
      ref.current.rotation.y += 0.006
      ref.current.scale.setScalar(1 + 0.04 * Math.sin(s.clock.elapsedTime * 1.5))
    }
  })
  return (
    <group ref={ref} position={[0, STACK_TOP + 1.5, 0]}>
      <mesh material={orbMat}>
        <sphereGeometry args={[1.15, 48, 48]} />
      </mesh>
      <mesh material={orbCoreMat} scale={0.72}>
        <sphereGeometry args={[1.15, 32, 32]} />
      </mesh>
    </group>
  )
}

function DirectoryChip({ floor, index }: { floor: FloorDef; index: number }) {
  return (
    <Html position={[-(HALF_W + 0.6), floorCenterY(index), 0]} distanceFactor={20} zIndexRange={[10, 0]}>
      <div
        style={{
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          whiteSpace: 'nowrap',
          background: 'rgba(10,16,22,0.6)',
          border: '1px solid rgba(120,200,170,0.35)',
          borderRadius: 9,
          padding: '5px 10px',
          backdropFilter: 'blur(7px)',
        }}
      >
        <span style={{ width: 9, height: 9, borderRadius: 3, background: GREEN_GLOW, boxShadow: `0 0 8px ${GREEN_GLOW}` }} />
        <span style={{ font: '700 13px ui-sans-serif, system-ui, sans-serif', color: '#eafff2' }}>{floor.label}</span>
        <span style={{ font: '500 11px ui-sans-serif, system-ui, sans-serif', color: '#8fb8a8' }}>{floor.sub}</span>
      </div>
    </Html>
  )
}

export function BuildingStack() {
  return (
    <group>
      <RoundedBox args={[W + 0.4, 0.5, D + 0.4]} radius={0.1} smoothness={4} material={shellMat} position={[0, -0.25, 0]} receiveShadow />
      {FLOORS.map((f, i) => (
        <FloorBlock key={f.id} floor={f} index={i} />
      ))}
      {FLOORS.map((f, i) => (
        <DirectoryChip key={'d' + f.id} floor={f} index={i} />
      ))}
      <ERMouth />
      <Stair />
      <CrownOrb />
    </group>
  )
}
