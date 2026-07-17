import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, RoundedBox } from '@react-three/drei'
import {
  CapsuleGeometry,
  Color,
  DoubleSide,
  ExtrudeGeometry,
  LatheGeometry,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  Shape,
  Vector2,
  type Group,
} from 'three'
import { hdrCss } from './glow'
import { makeLabelTexture, makePanelTexture } from './textures'

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

// round-drum radii for the two circular floors.
//   ER  = the hero drum, deliberately WIDER than the slab boxes (HALF_W = 5.22)
//   ICU = a smaller drum tucked within the footprint depth
const R_ER = HALF_W * 1.32 // 6.89 — overhangs the boxes
// ER tier is taller than the default block so its drum matches the ER room's
// proportion: room is 4.8:1 (36 wide / 7.5 tall); at r=6.89 that's ≈2.87 tall.
const H_ER = 2.87
// ICU drum: a bit over half the ER's radius, and a touch shorter than the ER tier.
const R_ICU = R_ER * 0.68 // 4.69
const H_ICU = 2.5 // a tad less than the ER's 2.87
// Command crown: a tapered tier — narrow base, wide overhanging roof (flares up).
const DISC_ROOF_R = 7.5 // top (roof) radius — the wide overhang
const DISC_BASE_R = 6.0 // bottom (base) radius — wider base, gentler flare
const H_DISC = 1.6

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
  // when set, this level is split into two half-width blocks side by side:
  // the left half uses label/sub, the right half uses twin.label/twin.sub
  twin?: { label: string; sub: string }
  // silhouette override: 'hex' = hexagon twin-half, 'disc' = crown
  shape?: 'hex' | 'disc'
}

export const FLOORS: FloorDef[] = [
  { id: 'er', label: 'Emergency', sub: 'ER · ground', rooms: 3, hero: true },
  { id: 'imgcath', label: 'Imaging', sub: 'radiology', rooms: 2, twin: { label: 'Cath Lab', sub: 'PCI · procedures' }, shape: 'hex' },
  { id: 'theatres', label: 'OR1', sub: 'surgery', rooms: 2, twin: { label: 'OR2', sub: 'surgery' } },
  { id: 'icu', label: 'ICU', sub: 'critical care', rooms: 2 },
  { id: 'wards', label: 'Post-Op', sub: 'recovery', rooms: 3, twin: { label: 'Step-Down', sub: 'step-down' } },
  { id: 'hdu', label: 'Main Ward', sub: 'inpatient', rooms: 2 },
  { id: 'command', label: 'Command', sub: 'TARS · ops', rooms: 2, shape: 'disc' },
]

// per-floor vertical layout — floors stack cumulatively so a single floor can
// be a custom height (the ER tier is taller) without disturbing the others.
const FLOOR_HEIGHT = (id: string) =>
  id === 'er' ? H_ER : id === 'icu' ? H_ICU : id === 'command' ? H_DISC : BLOCK_H
interface FloorRow { base: number; height: number; center: number; bandY: number }
const LAYOUT: FloorRow[] = (() => {
  const rows: FloorRow[] = []
  let base = 0
  for (const f of FLOORS) {
    const height = FLOOR_HEIGHT(f.id)
    rows.push({
      base,
      height,
      center: base + PLATE_H + height / 2,
      bandY: base + PLATE_H + height + GAP / 2,
    })
    base += PLATE_H + height + GAP
  }
  return rows
})()

export const floorCenterY = (i: number) => LAYOUT[i].center
const last = LAYOUT[LAYOUT.length - 1]
export const STACK_TOP = last.base + PLATE_H + last.height + GAP
// ER_INFO tracks the big ER drum so the fly-in dive, target reticle and green
// mouth light all frame the drum front (z = R_ER), not the old slab depth.
export const ER_INFO = { y: floorCenterY(0), frontZ: R_ER, w: 2 * R_ER, h: H_ER }
// ICU drum dive target (for the ER→ICU return transition). icu is FLOORS index 3.
export const ICU_INFO = { y: floorCenterY(3), frontZ: R_ICU, w: 2 * R_ICU, h: H_ICU }

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

function extrudeUp(shape: Shape, depth: number, bevel: number): ExtrudeGeometry {
  const g = new ExtrudeGeometry(shape, {
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

// squircle floors (the default tower slabs)
const RIB_GEO = extrudeUp(SHAPE, 1.62, 0.14) // total height 1.9 = BLOCK_H; less bevel = less curvature
const COVER_GEO = extrudeUp(SHAPE, 0.62, 0)
const CORE_GEO = extrudeUp(SHAPE, 0.7, 0)

// round-drum floors — ER + ICU render as true circles instead of the squircle
// slab. Each gets its own radius (R_ER / R_ICU): the ER drum overhangs the
// boxes as the hero, ICU is a smaller tucked drum.
function circleShape(r: number, seg: number): Shape {
  const s = new Shape()
  for (let i = 0; i <= seg; i++) {
    const t = (i / seg) * Math.PI * 2
    const x = r * Math.cos(t)
    const y = r * Math.sin(t)
    i ? s.lineTo(x, y) : s.moveTo(x, y)
  }
  return s
}
type GeoSet = { rib: ExtrudeGeometry; cover: ExtrudeGeometry; core: ExtrudeGeometry }
function drumGeos(r: number, h: number = BLOCK_H): GeoSet {
  const shape = circleShape(r, 96)
  const bevel = 0.14
  return {
    rib: extrudeUp(shape, h - 2 * bevel, bevel), // total rib height = h
    cover: extrudeUp(shape, 0.62, 0),
    core: extrudeUp(shape, 0.7, 0),
  }
}
const SLAB_GEOS: GeoSet = { rib: RIB_GEO, cover: COVER_GEO, core: CORE_GEO }
const FLOOR_GEOS: Record<string, GeoSet> = { er: drumGeos(R_ER, H_ER), icu: drumGeos(R_ICU, H_ICU) }
// tapered crown, revolved so the rims are blunt (no hard 90°). The top rim is a
// rounded fillet (blunter), the bottom a subtle chamfer.
const DISC_TOP_CHAMFER = 0.35 // rounded, blunt top rim
const DISC_BOT_CHAMFER = 0.15 // subtle bottom chamfer
const DISC_GEO = (() => {
  const top = H_DISC / 2
  const bot = -H_DISC / 2
  const tc = DISC_TOP_CHAMFER
  const bc = DISC_BOT_CHAMFER
  const pts: Vector2[] = [new Vector2(0, top), new Vector2(DISC_ROOF_R - tc, top)]
  // rounded top rim: quarter-arc from the top cap out to the wall
  const N = 6
  for (let i = 1; i <= N; i++) {
    const a = (i / N) * (Math.PI / 2)
    pts.push(new Vector2(DISC_ROOF_R - tc + tc * Math.sin(a), top - tc + tc * Math.cos(a)))
  }
  pts.push(new Vector2(DISC_BASE_R, bot + bc)) // flared wall down to the base
  pts.push(new Vector2(DISC_BASE_R - bc, bot)) // bottom chamfer
  pts.push(new Vector2(0, bot))
  return new LatheGeometry(pts, 96)
})()

// twin level — two half-width squircle slabs sitting side by side on one floor.
const TWIN_HALF_W = HALF_W / 2 - 0.12 // each half, minus a small centre gap
const TWIN_DX = 2.9 // ±x offset for the hex halves (Imaging | Cath) — spaced to clear the bigger hexes
const WARD_DX = 3.0 // wards pushed further out → a clear centre gap (creeps out a touch)
const OR_DX = 3.0 // OR halves spaced apart, leaving a centre gap for the bridge
const TWIN_SHAPE = squircle(TWIN_HALF_W, HALF_D, SQ_N, 88)
const TWIN_GEOS: GeoSet = {
  rib: extrudeUp(TWIN_SHAPE, 1.62, 0.14),
  cover: extrudeUp(TWIN_SHAPE, 0.62, 0),
  core: extrudeUp(TWIN_SHAPE, 0.7, 0),
}

// twin level, hexagon variant (Imaging | Cath Lab) — flat sides face each other
const HEX_R = 3.2
const HEX_FRONT_STRETCH = 1.6 // elongate the +Z (ER-entry-facing) vertex into a longer point
// Cath Lab dive target (for the ICU→Cath return transition). The imgcath hex
// twin is FLOORS index 1; Cath Lab is the RIGHT (+x) half at x = +TWIN_DX. The
// dive aims at the hex's forward point (~the stretched +Z vertex).
export const CATH_INFO = { x: TWIN_DX, y: floorCenterY(1), frontZ: 4.6, w: 2 * HEX_R, h: BLOCK_H }
function hexShape(r: number): Shape {
  const s = new Shape()
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6 // +30° → flat left/right edges
    const rr = i === 4 ? r * HEX_FRONT_STRETCH : r // i=4 is the ER-facing (+Z) vertex
    const x = rr * Math.cos(a)
    const y = rr * Math.sin(a)
    i ? s.lineTo(x, y) : s.moveTo(x, y)
  }
  s.closePath()
  return s
}
const HEX_SHAPE = hexShape(HEX_R)
const TWIN_HEX_GEOS: GeoSet = {
  rib: extrudeUp(HEX_SHAPE, 1.62, 0.14),
  cover: extrudeUp(HEX_SHAPE, 0.62, 0),
  core: extrudeUp(HEX_SHAPE, 0.7, 0),
}

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
// ICU shell — its own texture instance so the single horizontal seam can be
// centred on the drum height without moving the seams on every other floor.
// ICU_SEAM_Y is derived from the height + 0.22 texture repeat so it stays
// centred when the height changes; nudge ICU_SEAM_NUDGE (larger = up) if off.
const ICU_SEAM_NUDGE = 0
const ICU_SEAM_Y = 0.22 * ((H_ICU - 0.28) / 2 - 1) + ICU_SEAM_NUDGE
const icuShellTex = shellTex.clone()
icuShellTex.needsUpdate = true
icuShellTex.offset.y = ICU_SEAM_Y
const icuShellMat = new MeshStandardMaterial({
  color: new Color('#ffffff'),
  map: icuShellTex,
  metalness: 0.92,
  roughness: 0.22,
  envMapIntensity: 1.5,
})
// crown shell — same panel grid as the tiers, retiled for the cylinder UVs
const discShellTex = shellTex.clone()
discShellTex.needsUpdate = true
discShellTex.repeat.set(8, 1) // grid density: around × up the flared wall
const discShellMat = new MeshStandardMaterial({
  color: new Color('#ffffff'),
  map: discShellTex,
  metalness: 0.92,
  roughness: 0.22,
  envMapIntensity: 1.5,
  side: DoubleSide,
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
  const bandY = LAYOUT[index].bandY
  const geos = FLOOR_GEOS[floor.id] ?? SLAB_GEOS
  const shell = floor.id === 'icu' ? icuShellMat : shellMat
  // pod row spread: wide on the big ER drum, tight on the small ICU drum,
  // default on the slabs
  const podXs =
    floor.id === 'er'
      ? [-4.8, -1.7, 1.7, 4.8]
      : floor.id === 'icu'
        ? [-2.2, -0.7, 0.7, 2.2]
        : floor.rooms >= 3
          ? [-3.2, -1, 1, 3.2]
          : [-2.3, 0.4, 2.7]
  return (
    <group>
      <mesh geometry={geos.rib} material={shell} position={[0, floorCenterY(index), 0]} castShadow receiveShadow />
      <mesh geometry={geos.core} material={coreMat} position={[0, bandY, 0]} scale={[0.9, 1, 0.9]} />
      <mesh geometry={geos.cover} material={frostMat} position={[0, bandY, 0]} scale={[0.985, 1, 0.985]} />
      {podXs.map((x, i) => (
        <mesh key={i} geometry={POD_GEO} material={podMat} position={[x, bandY, 1.7]} />
      ))}
    </group>
  )
}

// --- twin floor: two half-slabs side by side on ONE level (Ward A | Ward B) --
function TwinFloorBlock({ floor, index }: { floor: FloorDef; index: number }) {
  const bandY = LAYOUT[index].bandY
  const cy = floorCenterY(index)
  const geos = floor.shape === 'hex' ? TWIN_HEX_GEOS : TWIN_GEOS
  const dx = floor.shape === 'hex' ? TWIN_DX : floor.id === 'theatres' ? OR_DX : WARD_DX
  const podXs = floor.shape === 'hex' ? [-1, 1] : [-1.1, 0, 1.1]
  return (
    <group>
      {[-dx, dx].map((x, h) => (
        <group key={h}>
          <mesh geometry={geos.rib} material={shellMat} position={[x, cy, 0]} castShadow receiveShadow />
          <mesh geometry={geos.core} material={coreMat} position={[x, bandY, 0]} scale={[0.9, 1, 0.9]} />
          <mesh geometry={geos.cover} material={frostMat} position={[x, bandY, 0]} scale={[0.985, 1, 0.985]} />
          {podXs.map((px, i) => (
            <mesh key={i} geometry={POD_GEO} material={podMat} position={[x + px, bandY, 1.7]} />
          ))}
        </group>
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
      {/* (dark throat box removed — it clipped through the round drum and
          reflected as a black sliver on the floor) */}
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

// --- disc crown: a wide, flat DISC-shaped slab replacing the 'command' slab --
function DiscCrown({ index }: { index: number }) {
  const cy = floorCenterY(index)
  return (
    <group>
      {/* tapered tier: wide overhanging roof over a wider base, same panel grid */}
      <mesh geometry={DISC_GEO} material={discShellMat} position={[0, cy, 0]} castShadow receiveShadow />
    </group>
  )
}

// green hospital plus/cross that crowns the disc (replaces the orb)
function plusShape(arm: number, thick: number): Shape {
  const a = arm
  const t = thick / 2
  const s = new Shape()
  s.moveTo(-t, -a)
  s.lineTo(t, -a)
  s.lineTo(t, -t)
  s.lineTo(a, -t)
  s.lineTo(a, t)
  s.lineTo(t, t)
  s.lineTo(t, a)
  s.lineTo(-t, a)
  s.lineTo(-t, t)
  s.lineTo(-a, t)
  s.lineTo(-a, -t)
  s.lineTo(-t, -t)
  s.closePath()
  return s
}
const PLUS_GEO = (() => {
  const g = new ExtrudeGeometry(plusShape(1.2, 0.8), {
    depth: 0.5,
    bevelEnabled: true,
    bevelThickness: 0.07,
    bevelSize: 0.07,
    bevelSegments: 3,
    curveSegments: 4,
  })
  g.center()
  return g
})()

function CrownPlus() {
  const ref = useRef<Group>(null)
  useFrame((s) => {
    if (ref.current) {
      ref.current.rotation.y += 0.006
      ref.current.scale.setScalar(1 + 0.04 * Math.sin(s.clock.elapsedTime * 1.5))
    }
  })
  // sit the plus on top of the disc crown (the 'command' level)
  const ci = FLOORS.findIndex((f) => f.shape === 'disc')
  const plusY = ci >= 0 ? floorCenterY(ci) + H_DISC / 2 + 1.35 : STACK_TOP + 1.5
  return (
    <group ref={ref} position={[0, plusY, 0]}>
      <mesh geometry={PLUS_GEO} material={orbMat} castShadow />
      {/* bright inner core for the glow */}
      <mesh geometry={PLUS_GEO} material={orbCoreMat} scale={[0.86, 0.86, 0.7]} />
    </group>
  )
}

function Chip({ x, y, label, right = false }: { x: number; y: number; label: string; sub?: string; right?: boolean }) {
  return (
    <Html position={[x, y, 0]} distanceFactor={20} zIndexRange={[10, 0]}>
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
          transform: right ? 'translateX(-100%)' : undefined, // anchor to +x, extend toward tower
        }}
      >
        <span style={{ width: 9, height: 9, borderRadius: 3, background: GREEN_GLOW, boxShadow: `0 0 8px ${GREEN_GLOW}` }} />
        <span style={{ font: '700 13px ui-sans-serif, system-ui, sans-serif', color: '#eafff2', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
      </div>
    </Html>
  )
}

function DirectoryChip({ floor, index }: { floor: FloorDef; index: number }) {
  const y = floorCenterY(index)
  if (floor.twin) {
    return (
      <>
        {/* left pill sits to the LEFT of the tower, extending outward */}
        <Chip x={-(HALF_W + 1.3)} y={y} label={floor.label} sub={floor.sub} right />
        {/* right pill sits to the RIGHT, extending outward */}
        <Chip x={HALF_W + 1.3} y={y} label={floor.twin.label} sub={floor.twin.sub} />
      </>
    )
  }
  return <Chip x={-(HALF_W + 1.3)} y={y} label={floor.label} right />
}

// --- etched signage: the floor name rendered onto the tier's front ----------
function EtchedLabel({
  text,
  position,
  height = 0.55,
  color,
  flat = false,
  spacing = 0,
  rotationY = 0,
  rotationX = 0,
  card,
}: {
  text: string
  position: [number, number, number]
  height?: number
  color?: string
  flat?: boolean
  spacing?: number
  rotationY?: number
  rotationX?: number
  /** when set, a rounded plaque of this color sits behind the text (blocks the
   *  tier's grid lines so the label reads cleanly) */
  card?: string
}) {
  const tex = useMemo(() => makeLabelTexture(text, color, !flat, spacing), [text, color, flat, spacing])
  const img = tex.image as HTMLCanvasElement
  const aspect = img.width / img.height
  const w = height * aspect
  return (
    <group position={position} rotation-x={rotationX} rotation-y={rotationY}>
      {card && (
        <RoundedBox args={[w + 0.4, height + 0.34, 0.06]} radius={0.08} smoothness={3} position={[0, 0, -0.05]} castShadow>
          <meshStandardMaterial color={card} roughness={0.24} metalness={0.9} envMapIntensity={1.5} />
        </RoundedBox>
      )}
      <mesh>
        <planeGeometry args={[w, height]} />
        <meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

// where a tier's label sits on its front face, and the ±x offset for twins
const labelFrontZ = (f: FloorDef): number =>
  f.shape === 'disc'
    ? 6.9
    : f.id === 'er'
      ? R_ER + 0.1
      : f.id === 'icu'
        ? R_ICU + 0.1
        : f.shape === 'hex'
          ? 4.3
          : HALF_D + 0.5
const twinLabelDX = (f: FloorDef): number =>
  f.shape === 'hex' ? TWIN_DX : f.id === 'theatres' ? OR_DX : WARD_DX

// --- skybridge connecting a split level's two halves across the centre gap ---
function TwinBridge({ floorId }: { floorId: string }) {
  const i = FLOORS.findIndex((f) => f.id === floorId)
  const y = floorCenterY(i)
  const w = 2.2 // spans the centre gap and laps into both blocks
  return (
    <group position={[0, y, 0]}>
      <RoundedBox args={[w, 0.9, 1.7]} radius={0.12} smoothness={3} material={metalMat} castShadow receiveShadow />
      {/* frosted glazing along the front + back walls */}
      {[0.87, -0.87].map((z, k) => (
        <mesh key={k} position={[0, 0.06, z]}>
          <boxGeometry args={[w * 0.9, 0.44, 0.04]} />
          <meshPhysicalMaterial color="#dff0ea" transparent opacity={0.55} roughness={0.18} metalness={0} clearcoat={0.6} />
        </mesh>
      ))}
      {/* green underglow */}
      <mesh position={[0, -0.42, 0]}>
        <boxGeometry args={[w * 0.96, 0.05, 1.5]} />
        <meshBasicMaterial color={hdrCss(GREEN_GLOW, 1.3)} toneMapped={false} />
      </mesh>
    </group>
  )
}

export function BuildingStack({ showPills = false }: { showPills?: boolean } = {}) {
  return (
    <group>
      <RoundedBox args={[W + 0.4, 0.5, D + 0.4]} radius={0.1} smoothness={4} material={shellMat} position={[0, -0.25, 0]} receiveShadow />
      {FLOORS.map((f, i) =>
        f.shape === 'disc' ? (
          <DiscCrown key={f.id} index={i} />
        ) : f.twin ? (
          <TwinFloorBlock key={f.id} floor={f} index={i} />
        ) : (
          <FloorBlock key={f.id} floor={f} index={i} />
        ),
      )}
      {FLOORS.map((f, i) => {
        const y = floorCenterY(i)
        // --- etched labels: ALWAYS visible (incl. autorotate) ---
        if (f.id === 'er') {
          // EMERGENCY: big, bold, coral — in front of the green portal so it reads
          return (
            <EtchedLabel
              key={'l' + f.id}
              text={f.label}
              position={[0, y + 0.15, R_ER + 0.35]}
              height={0.8}
              color="#ff6a4d"
              flat
            />
          )
        }
        if (f.id === 'icu') {
          // ICU: soft blue, upright on the drum front, bigger + spaced out
          return (
            <EtchedLabel
              key={'l' + f.id}
              text={f.label}
              position={[0, y, R_ICU + 0.15]}
              height={1.15}
              color="#8fb3db"
              flat
              spacing={48}
            />
          )
        }
        // --- side pills: only after "next" (showPills) ---
        if (!showPills) return null
        if (f.shape === 'disc') {
          // TARS / SAM pills flanking the command deck
          return (
            <group key={'l' + f.id}>
              <Chip x={-(DISC_ROOF_R + 1)} y={y} label="TARS" right />
              <Chip x={DISC_ROOF_R + 1} y={y} label="SAM" />
            </group>
          )
        }
        if (f.id === 'hdu') return <DirectoryChip key={'d' + f.id} floor={f} index={i} />
        if (f.twin) return <DirectoryChip key={'d' + f.id} floor={f} index={i} />
        return null
      })}
      <ERMouth />
      {/* <Stair /> removed for now — re-add this line to bring it back */}
      <TwinBridge floorId="wards" />
      <TwinBridge floorId="theatres" />
      <CrownPlus />
    </group>
  )
}
