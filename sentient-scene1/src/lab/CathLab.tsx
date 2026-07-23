import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { Color, DoubleSide, MathUtils, type MeshBasicMaterial, type PointLight, type Texture } from 'three'
import { hdrCss } from '../scene/glow'
import { angioTex, hemoTex, xrayOnTex, cathInUseTex, cathCompletedTex, standbyTex } from './cathTex'

// ===========================================================================
//  CATH LAB — architecture shell + signature equipment (no patients, no story).
//  A bright shielded procedure room: glossy vinyl floor with a blue procedure
//  mat, white wall panels, a recessed-panel ceiling, and the pieces that make a
//  cath lab read instantly — the C-arm gantry over an angio table, a ceiling
//  boom carrying the monitor bank, twin surgical lights on articulated arms, and
//  a wall fluoroscopy display. Same chrome + frosted-glass + bloom language as
//  the round ER. Every dimension is a knob at the top so the shape is tunable.
//  Front (open, camera-facing) side = -Z; back wall = +Z.
// ===========================================================================

const W = 11          // room width  (x) — real cath-lab footprint, not a hall
const D = 11          // room depth  (z)
const H = 3.6         // wall height (y) — real ~3.5 m ceiling
const HW = W / 2
const HD = D / 2

// table / iso-centre — the room is composed around the patient on the table
const TABLE_TOP = 0.92
const ISO: [number, number, number] = [0, 1.55, 0.4] // C-arm centre-of-rotation
const deg = MathUtils.degToRad

// published so a future population/story layer lands on the same anchors
export const CATH_DIMS = {
  W, D, H, HW, HD, TABLE_TOP,
  iso: ISO,
  tableCenter: [0, 0, 0.4] as [number, number, number],
  boomScreen: [-3.3, 2.45, 2.6] as [number, number, number], // hangs below the 3.6 m ceiling
}

const WHITE = '#eef1f4'   // equipment housing white (soft plastic)
const CHROME = '#c9cfd5'
const DARK_BEZEL = '#12171d'

// --- a bezel + emissive screen (faces -Z / the operator by default) ---------
function Screen({
  size,
  tex,
  tint = '#eaf1f8',
  glow = 1.32,
}: {
  size: [number, number]
  tex: Texture
  tint?: string
  glow?: number
}) {
  const [w, h] = size
  return (
    <group>
      {/* slim bezel, screen face pointing -Z (toward the operator / camera) */}
      <RoundedBox args={[w + 0.05, h + 0.05, 0.05]} radius={0.02} smoothness={3}>
        <meshStandardMaterial color={DARK_BEZEL} metalness={0.5} roughness={0.42} />
      </RoundedBox>
      <mesh position={[0, 0, -0.032]} rotation-y={Math.PI}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={tex} color={hdrCss(tint, glow)} toneMapped={false} />
      </mesh>
    </group>
  )
}

// ---------------------------------------------------------------------------
//  ROOM — floor, blue mat, walls, ceiling + recessed light panels
// ---------------------------------------------------------------------------
function Room() {
  const panels: [number, number][] = []
  for (let ix = -1; ix <= 1; ix++) for (let iz = -1; iz <= 1; iz++) panels.push([ix * 3.3, iz * 3.3])
  return (
    <group>
      {/* glossy vinyl floor */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#dfe4ea" metalness={0.35} roughness={0.32} envMapIntensity={1} />
      </mesh>
      {/* blue procedure mat, slightly raised — small pad right under the table */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.012, 0.2]} receiveShadow>
        <planeGeometry args={[2.6, 4.0]} />
        <meshStandardMaterial color="#3f79c9" metalness={0.25} roughness={0.4} envMapIntensity={0.9} />
      </mesh>
      {/* walls are single-sided (facing in) — orbit outside the room and the
          wall in the way culls away so you can always see the interior */}
      {/* back wall (+z, faces -z) */}
      <mesh position={[0, H / 2, HD]} rotation-y={Math.PI}>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial color="#f3f6f9" roughness={0.6} metalness={0.05} />
      </mesh>
      {/* left wall (-x, faces +x) */}
      <mesh position={[-HW, H / 2, 0]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[D, H]} />
        <meshStandardMaterial color="#eef2f6" roughness={0.6} metalness={0.05} />
      </mesh>
      {/* right wall (+x, faces -x) */}
      <mesh position={[HW, H / 2, 0]} rotation-y={-Math.PI / 2}>
        <planeGeometry args={[D, H]} />
        <meshStandardMaterial color="#eef2f6" roughness={0.6} metalness={0.05} />
      </mesh>

      {/* subtle chrome skirting where walls meet floor (back + sides) */}
      {[
        { p: [0, 0.06, HD] as [number, number, number], r: 0, len: W },
        { p: [-HW, 0.06, 0] as [number, number, number], r: Math.PI / 2, len: D },
        { p: [HW, 0.06, 0] as [number, number, number], r: Math.PI / 2, len: D },
      ].map((s, i) => (
        <mesh key={i} position={s.p} rotation-y={s.r}>
          <boxGeometry args={[s.len, 0.12, 0.06]} />
          <meshStandardMaterial color={CHROME} metalness={0.9} roughness={0.25} envMapIntensity={1.4} />
        </mesh>
      ))}

      {/* ceiling slab (single-sided too — culls when orbiting above) */}
      <mesh rotation-x={Math.PI / 2} position={[0, H, 0]}>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#e7ebf0" roughness={0.7} metalness={0.05} />
      </mesh>
      {/* recessed LED light panels — dimmed for the run, still clearly the source */}
      {panels.map(([x, z], i) => (
        <mesh key={i} rotation-x={Math.PI / 2} position={[x, H - 0.04, z]}>
          <planeGeometry args={[2.1, 2.1]} />
          <meshBasicMaterial color="#c3d2e0" toneMapped={false} />
        </mesh>
      ))}
      {/* cool cove strip around the ceiling edge */}
      {[
        { p: [0, H - 0.16, HD - 0.2] as [number, number, number], r: 0, len: W - 0.4 },
        { p: [0, H - 0.16, -HD + 0.2] as [number, number, number], r: 0, len: W - 0.4 },
        { p: [-HW + 0.2, H - 0.16, 0] as [number, number, number], r: Math.PI / 2, len: D - 0.4 },
        { p: [HW - 0.2, H - 0.16, 0] as [number, number, number], r: Math.PI / 2, len: D - 0.4 },
      ].map((s, i) => (
        <mesh key={i} position={s.p} rotation-y={s.r}>
          <boxGeometry args={[s.len, 0.04, 0.04]} />
          <meshBasicMaterial color={hdrCss('#dceafa', 0.85)} toneMapped={false} />
        </mesh>
      ))}

      {/* (the X-RAY ON plate is its own done-driven component — see XRayPlate) */}

      {/* (the CATH-1 sign is its own double-faced component — see CathSign) */}
    </group>
  )
}

// ---------------------------------------------------------------------------
//  ANGIO TABLE — long cantilevered pad on a chrome pedestal
// ---------------------------------------------------------------------------
function AngioTable() {
  return (
    <group position={[0, 0, 0.4]}>
      {/* floor base — low slim plate */}
      <RoundedBox args={[0.84, 0.09, 0.98]} radius={0.04} smoothness={3} position={[0, 0.05, 1.1]} castShadow>
        <meshStandardMaterial color="#c3cad1" metalness={0.6} roughness={0.35} envMapIntensity={1.2} />
      </RoundedBox>
      {/* pedestal column — sleek rounded pillar, not a fat stump */}
      <RoundedBox args={[0.4, 0.9, 0.52]} radius={0.15} smoothness={4} position={[0, 0.5, 1.1]}>
        <meshStandardMaterial color={CHROME} metalness={0.8} roughness={0.26} envMapIntensity={1.4} />
      </RoundedBox>
      {/* cantilever arm carrying the top out over the mat */}
      <RoundedBox args={[0.7, 0.22, 2.2]} radius={0.06} smoothness={3} position={[0, 0.83, 0.1]}>
        <meshStandardMaterial color="#aeb7c1" metalness={0.7} roughness={0.3} envMapIntensity={1.2} />
      </RoundedBox>
      {/* the table top / pad (cream, radiolucent) */}
      <RoundedBox args={[0.66, 0.12, 3.4]} radius={0.05} smoothness={4} position={[0, TABLE_TOP, -0.35]} castShadow>
        <meshPhysicalMaterial color="#efe9da" roughness={0.5} clearcoat={0.4} clearcoatRoughness={0.4} envMapIntensity={0.7} />
      </RoundedBox>
      {/* thin sterile drape overhang on the pad */}
      <mesh position={[0, TABLE_TOP + 0.065, -0.35]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[0.72, 3.44]} />
        <meshStandardMaterial color="#f4f7fb" roughness={0.7} side={DoubleSide} />
      </mesh>
      {/* head rest at the far (+... actually -z head) end */}
      <RoundedBox args={[0.6, 0.1, 0.5]} radius={0.05} smoothness={3} position={[0, TABLE_TOP + 0.02, -2.0]}>
        <meshPhysicalMaterial color="#efe9da" roughness={0.5} clearcoat={0.4} envMapIntensity={0.7} />
      </RoundedBox>
      {/* tableside control rail + a small paddle control */}
      <mesh position={[0.4, TABLE_TOP - 0.02, 0.7]}>
        <boxGeometry args={[0.06, 0.06, 1.2]} />
        <meshStandardMaterial color={CHROME} metalness={0.9} roughness={0.2} />
      </mesh>
    </group>
  )
}

// ---------------------------------------------------------------------------
//  C-ARM — the iconic gantry. A thick ~200° arc straddling the table with the
//  flat detector above the patient and the tube housing below, on a floor L-arm.
// ---------------------------------------------------------------------------
const C_R = 1.7          // C radius
const C_ARC = deg(200)   // sweep of the C
const C_START = deg(80)  // rotate so the gap opens to +x (the mount side)
function CArm() {
  // tip angles (in the group's rotated frame, measured from +x):
  const topA = C_START                    // upper tip → detector
  const botA = C_START + C_ARC             // lower tip → source
  const tip = (a: number): [number, number, number] => [Math.cos(a) * C_R, Math.sin(a) * C_R, 0]
  const [dx, dy] = tip(topA)
  const [sx, sy] = tip(botA)
  return (
    <group position={ISO}>
      {/* the C ring — a torus arc in the x-y plane facing the camera */}
      <mesh rotation-z={C_START} castShadow>
        <torusGeometry args={[C_R, 0.2, 20, 80, C_ARC]} />
        <meshStandardMaterial color={WHITE} metalness={0.4} roughness={0.4} envMapIntensity={1} />
      </mesh>
      {/* chrome inner rail on the C (the slide track) */}
      <mesh rotation-z={C_START}>
        <torusGeometry args={[C_R - 0.12, 0.05, 12, 80, C_ARC]} />
        <meshStandardMaterial color={CHROME} metalness={0.95} roughness={0.18} envMapIntensity={1.6} />
      </mesh>

      {/* DETECTOR (flat panel) at the top tip, aimed down at the patient */}
      <group position={[dx, dy - 0.35, 0]}>
        <RoundedBox args={[1.15, 0.42, 1.15]} radius={0.06} smoothness={3} castShadow>
          <meshStandardMaterial color={WHITE} metalness={0.35} roughness={0.42} envMapIntensity={1} />
        </RoundedBox>
        <mesh position={[0, -0.23, 0]}>
          <boxGeometry args={[0.92, 0.05, 0.92]} />
          <meshStandardMaterial color="#20262c" metalness={0.5} roughness={0.35} />
        </mesh>
      </group>

      {/* X-RAY TUBE housing at the bottom tip, aimed up — slimmer drum */}
      <group position={[sx, sy + 0.32, 0]}>
        <mesh>
          <cylinderGeometry args={[0.3, 0.34, 0.54, 24]} />
          <meshStandardMaterial color={WHITE} metalness={0.35} roughness={0.42} envMapIntensity={1} />
        </mesh>
        {/* collimator box on top */}
        <RoundedBox args={[0.4, 0.2, 0.4]} radius={0.04} smoothness={3} position={[0, 0.36, 0]}>
          <meshStandardMaterial color="#2a3138" metalness={0.5} roughness={0.35} />
        </RoundedBox>
      </group>

      {/* faint beam cone between source and detector */}
      <mesh position={[(dx + sx) / 2, (dy + sy) / 2, 0]}>
        <cylinderGeometry args={[0.05, 0.5, dy - sy - 0.7, 16, 1, true]} />
        <meshBasicMaterial color={hdrCss('#bfe0ff', 0.6)} transparent opacity={0.06} toneMapped={false} side={DoubleSide} depthWrite={false} />
      </mesh>

      {/* L support arm from the gap side (+x) back to a floor pedestal */}
      <group>
        {/* short arm off the C into the mount */}
        <mesh position={[C_R + 0.5, 0, 0]}>
          <boxGeometry args={[1.1, 0.7, 0.7]} />
          <meshStandardMaterial color={WHITE} metalness={0.4} roughness={0.4} envMapIntensity={1} />
        </mesh>
        {/* horizontal arm back toward the wall */}
        <mesh position={[C_R + 1.3, 0, 1.4]}>
          <boxGeometry args={[0.55, 0.55, 3.4]} />
          <meshStandardMaterial color={WHITE} metalness={0.4} roughness={0.4} envMapIntensity={1} />
        </mesh>
      </group>
    </group>
  )
}
// vertical column + base for the C-arm mount (placed in world, not iso-space)
function CArmBase() {
  return (
    <group position={[C_R + 2.3, 0, 2.8]}>
      {/* sleek rounded column — refined, not a fat cylinder */}
      <RoundedBox args={[0.54, 2.8, 0.62]} radius={0.17} smoothness={4} position={[0, 1.4, 0]}>
        <meshStandardMaterial color={WHITE} metalness={0.4} roughness={0.4} envMapIntensity={1} />
      </RoundedBox>
      {/* low base plate */}
      <RoundedBox args={[1.15, 0.13, 1.15]} radius={0.05} smoothness={3} position={[0, 0.065, 0]} castShadow>
        <meshStandardMaterial color="#c3cad1" metalness={0.6} roughness={0.35} envMapIntensity={1.2} />
      </RoundedBox>
    </group>
  )
}

// ---------------------------------------------------------------------------
//  LAB MONITORS — two slim displays on one ceiling drop (the big bank slab is
//  gone). Hemo lives on one; the other idles on standby and lights up with the
//  completed angiogram when the sign goes green.
// ---------------------------------------------------------------------------
function CathMonitors({ done }: { done: boolean }) {
  return (
    <group position={[-3.1, 0, 2.2]}>
      <mesh position={[0, 3.16, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.88, 12]} />
        <meshStandardMaterial color={CHROME} metalness={0.9} roughness={0.22} envMapIntensity={1.4} />
      </mesh>
      <mesh position={[0, 2.72, 0]}>
        <boxGeometry args={[1.9, 0.1, 0.12]} />
        <meshStandardMaterial color={WHITE} metalness={0.4} roughness={0.4} envMapIntensity={1} />
      </mesh>
      {[-0.52, 0.52].map((dx, i) => (
        <mesh key={i} position={[dx, 2.6, 0]}>
          <boxGeometry args={[0.07, 0.14, 0.07]} />
          <meshStandardMaterial color="#2a323b" metalness={0.5} roughness={0.42} />
        </mesh>
      ))}
      <group position={[-0.52, 2.26, 0]} rotation-y={0.12}>
        <Screen size={[0.92, 0.72]} tex={done ? angioTex : standbyTex} glow={done ? 1.2 : 0.6} />
      </group>
      <group position={[0.52, 2.26, 0]} rotation-y={-0.1}>
        <Screen size={[0.92, 0.72]} tex={hemoTex} />
      </group>
    </group>
  )
}

// X-RAY ON plate — lit through the run, dies with the beam when the run ends
function XRayPlate({ done }: { done: boolean }) {
  const mat = useRef<MeshBasicMaterial>(null)
  const wash = useRef<PointLight>(null)
  const fade = useRef(1)
  useFrame((_, dt) => {
    fade.current = MathUtils.damp(fade.current, done ? 0 : 1, 1.4, dt)
    if (mat.current) mat.current.opacity = fade.current
    if (wash.current) wash.current.intensity = 1.6 * fade.current
  })
  return (
    <group>
      <mesh position={[3.2, 3.0, HD - 0.04]} rotation-y={Math.PI}>
        <planeGeometry args={[1.5, 0.47]} />
        <meshBasicMaterial ref={mat} map={xrayOnTex} transparent toneMapped={false} color={hdrCss('#ffffff', 1.35)} />
      </mesh>
      <pointLight ref={wash} position={[3.2, 2.85, HD - 0.7]} intensity={1.6} distance={2.6} decay={2} color={'#ff8a5a'} />
    </group>
  )
}

// ---------------------------------------------------------------------------
//  CEILING BOOM — articulated white service pendant (arm + boxy console head).
//  Reaches from a ceiling flange out over the table. Arm extends along local +x;
//  use yaw to aim it inward. (Not a surgical light — a service/equipment boom.)
// ---------------------------------------------------------------------------
function CeilingBoom({ mount, yaw = 0 }: { mount: [number, number, number]; yaw?: number }) {
  return (
    <group position={mount} rotation-y={yaw}>
      {/* ceiling flange */}
      <mesh position={[0, -0.06, 0]}>
        <cylinderGeometry args={[0.32, 0.36, 0.14, 24]} />
        <meshStandardMaterial color={WHITE} metalness={0.4} roughness={0.4} envMapIntensity={1} />
      </mesh>
      {/* short chrome drop + rotation collar */}
      <mesh position={[0, -0.34, 0]}>
        <cylinderGeometry args={[0.11, 0.11, 0.5, 20]} />
        <meshStandardMaterial color={CHROME} metalness={0.9} roughness={0.22} envMapIntensity={1.4} />
      </mesh>
      {/* boxy horizontal arm reaching out (+x local) */}
      <RoundedBox args={[2.0, 0.3, 0.4]} radius={0.1} smoothness={3} position={[1.02, -0.62, 0]}>
        <meshStandardMaterial color={WHITE} metalness={0.4} roughness={0.42} envMapIntensity={1} />
      </RoundedBox>
      {/* elbow joint */}
      <mesh position={[2.02, -0.62, 0]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.2, 0.2, 0.44, 20]} />
        <meshStandardMaterial color={CHROME} metalness={0.85} roughness={0.25} envMapIntensity={1.4} />
      </mesh>
      {/* short second arm down to the head (keeps the head high / overhead) */}
      <RoundedBox args={[0.32, 0.44, 0.36]} radius={0.1} smoothness={3} position={[2.14, -0.83, 0]} rotation-z={deg(-8)}>
        <meshStandardMaterial color={WHITE} metalness={0.4} roughness={0.42} envMapIntensity={1} />
      </RoundedBox>
      {/* pendant head — a boxy service console (spun 180° so its dark face fronts) */}
      <group position={[2.3, -1.06, 0]} rotation-y={Math.PI}>
        <RoundedBox args={[0.85, 0.55, 0.72]} radius={0.06} smoothness={3} castShadow>
          <meshStandardMaterial color={WHITE} metalness={0.4} roughness={0.4} envMapIntensity={1} />
        </RoundedBox>
        {/* dark control face on the front (-z local) */}
        <mesh position={[0, 0.02, -0.4]} rotation-y={Math.PI}>
          <planeGeometry args={[0.72, 0.36]} />
          <meshStandardMaterial color="#1a2027" metalness={0.5} roughness={0.4} />
        </mesh>
        {/* chrome outlet strip on the underside */}
        <mesh position={[0, -0.32, 0]}>
          <boxGeometry args={[0.72, 0.07, 0.5]} />
          <meshStandardMaterial color={CHROME} metalness={0.8} roughness={0.3} envMapIntensity={1.3} />
        </mesh>
      </group>
    </group>
  )
}

// ---------------------------------------------------------------------------
//  CATH-1 SIGN — one lightbox through the back wall, a glowing face on BOTH
//  sides. Red IN USE during the run; slowly crossfades to green COMPLETED
//  (same language as the OR's sign).
// ---------------------------------------------------------------------------
const CWASH_RED = new Color('#ff5a4a')
const CWASH_GRN = new Color('#3ae08a')
const CWASH_TMP = new Color()
function CathSign({ done }: { done: boolean }) {
  const fade = useRef(0)
  const redMats = useRef<(MeshBasicMaterial | null)[]>([null, null])
  const grnMats = useRef<(MeshBasicMaterial | null)[]>([null, null])
  const washes = useRef<(PointLight | null)[]>([null, null])
  useFrame((_, dt) => {
    fade.current = MathUtils.damp(fade.current, done ? 1 : 0, 1.1, dt)
    const t = fade.current
    for (const m of redMats.current) if (m) m.opacity = 1 - t
    for (const m of grnMats.current) if (m) m.opacity = t
    CWASH_TMP.copy(CWASH_RED).lerp(CWASH_GRN, t)
    for (const l of washes.current) if (l) l.color.copy(CWASH_TMP)
  })
  return (
    <group position={[0, 2.3, HD + 0.03]}>
      <RoundedBox args={[1.6, 0.46, 0.14]} radius={0.03} smoothness={3}>
        <meshStandardMaterial color={DARK_BEZEL} metalness={0.4} roughness={0.5} />
      </RoundedBox>
      {/* inside face (-z) and corridor face (+z), red + green stacked on each */}
      {([[-0.075, Math.PI], [0.075, 0]] as const).map(([z, ry], i) => (
        <group key={i} position={[0, 0, z]} rotation-y={ry}>
          <mesh>
            <planeGeometry args={[1.5, 0.38]} />
            <meshBasicMaterial ref={(m) => { redMats.current[i] = m }} map={cathInUseTex} color={hdrCss('#ffffff', 1.4)} toneMapped={false} transparent depthWrite={false} />
          </mesh>
          <mesh position={[0, 0, 0.002]}>
            <planeGeometry args={[1.5, 0.38]} />
            <meshBasicMaterial ref={(m) => { grnMats.current[i] = m }} map={cathCompletedTex} color={hdrCss('#ffffff', 1.4)} toneMapped={false} transparent opacity={0} depthWrite={false} />
          </mesh>
        </group>
      ))}
      <pointLight ref={(l) => { washes.current[0] = l }} position={[0, -0.15, -0.9]} intensity={2.2} distance={3.4} decay={2} color={CWASH_RED} />
      <pointLight ref={(l) => { washes.current[1] = l }} position={[0, -0.15, 0.9]} intensity={2.6} distance={3.8} decay={2} color={CWASH_RED} />
    </group>
  )
}

// ---------------------------------------------------------------------------
//  CORRIDOR SIDE — an outward-facing wall patch behind the sign (so the outside
//  shots have a wall) + the consult display showing Chandrababu's angiogram.
//  All of it faces +z only: invisible from inside the room.
// ---------------------------------------------------------------------------
function CorridorSide() {
  return (
    <mesh position={[0, H / 2, HD + 0.06]}>
      <planeGeometry args={[W, H]} />
      <meshStandardMaterial color="#9aa6ae" roughness={0.7} metalness={0.05} />
    </mesh>
  )
}

// ---------------------------------------------------------------------------
//  PEOPLE — Chandrababu draped on the table, the operator + tech in the room,
//  and the docs seated in the console. Same stylized language as the OR team.
// ---------------------------------------------------------------------------
const CDRAPE = { color: '#31699b', roughness: 0.8, metalness: 0.02 }
const CSKIN = { color: '#d8a887', roughness: 0.55, metalness: 0.02 }
const APRON = { color: '#3a5a7a', roughness: 0.75, metalness: 0.03 } // lead apron blue
const SCRUB = { color: '#3d7a8a', roughness: 0.78, metalness: 0.03 }
const CMASK = { color: '#c9dde3', roughness: 0.6, metalness: 0.02 }
const CCAP = { color: '#3f7ea6', roughness: 0.72, metalness: 0.02 }

function CathPatient() {
  // supine on the angio table pad (top ≈ 0.98), head on the -z head rest
  return (
    <group position={[0, 0.98, 0.4]}>
      <mesh position={[0, 0.02, -2.35]}><sphereGeometry args={[0.1, 20, 16]} /><meshStandardMaterial {...CSKIN} /></mesh>
      <mesh position={[0, -0.01, -1.55]} scale={[0.56, 0.3, 0.9]} castShadow><sphereGeometry args={[0.5, 24, 18]} /><meshStandardMaterial {...CDRAPE} /></mesh>
      <mesh position={[0, -0.02, -0.85]} scale={[0.5, 0.24, 0.8]} castShadow><sphereGeometry args={[0.5, 24, 18]} /><meshStandardMaterial {...CDRAPE} /></mesh>
      <mesh position={[0, -0.03, -0.15]} scale={[0.46, 0.2, 0.9]}><sphereGeometry args={[0.5, 24, 18]} /><meshStandardMaterial {...CDRAPE} /></mesh>
      <mesh position={[0, -0.04, 0.55]} scale={[0.36, 0.15, 0.85]}><sphereGeometry args={[0.5, 24, 18]} /><meshStandardMaterial {...CDRAPE} /></mesh>
      {[-0.09, 0.09].map((dx, i) => (
        <mesh key={i} position={[dx, 0.0, 0.98]} scale={[0.8, 1.05, 1.25]}><sphereGeometry args={[0.08, 16, 12]} /><meshStandardMaterial {...CDRAPE} /></mesh>
      ))}
    </group>
  )
}

function CathFigure({ pos, ry = 0, lean = 0.12, seated = false, apron = false }: {
  pos: [number, number, number]; ry?: number; lean?: number; seated?: boolean; apron?: boolean
}) {
  const gown = apron ? APRON : SCRUB
  const hipY = seated ? 0.6 : 0.95
  return (
    <group position={pos} rotation-y={ry}>
      {seated ? (
        <>
          {/* task chair under them */}
          <mesh position={[0, 0.04, 0]}><cylinderGeometry args={[0.26, 0.3, 0.08, 18]} /><meshStandardMaterial color="#14181d" roughness={0.55} metalness={0.35} /></mesh>
          <mesh position={[0, 0.3, 0]}><cylinderGeometry args={[0.03, 0.03, 0.46, 10]} /><meshStandardMaterial color="#c9cfd5" metalness={0.9} roughness={0.22} /></mesh>
          <mesh position={[0, 0.55, 0]}><cylinderGeometry args={[0.23, 0.23, 0.06, 20]} /><meshStandardMaterial color="#20262c" roughness={0.6} /></mesh>
          <RoundedBox args={[0.4, 0.45, 0.07]} radius={0.03} smoothness={3} position={[0, 0.85, -0.22]} rotation-x={0.08}>
            <meshStandardMaterial color="#252c33" roughness={0.6} />
          </RoundedBox>
          <mesh position={[0, 0.61, 0.13]} scale={[1, 0.55, 1.35]}><sphereGeometry args={[0.17, 16, 12]} /><meshStandardMaterial {...gown} /></mesh>
        </>
      ) : (
        <mesh position={[0, hipY / 2 + 0.02, 0]} castShadow>
          <cylinderGeometry args={[0.155, 0.2, hipY, 14]} /><meshStandardMaterial {...gown} />
        </mesh>
      )}
      <group position={[0, hipY, 0]} rotation-x={lean}>
        <mesh position={[0, 0.22, 0]} castShadow><capsuleGeometry args={[0.17, 0.26, 6, 14]} /><meshStandardMaterial {...gown} /></mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.21, 0.26, 0.08]} rotation-x={-0.9} rotation-z={s * 0.18}>
            <capsuleGeometry args={[0.045, 0.34, 6, 10]} /><meshStandardMaterial {...gown} />
          </mesh>
        ))}
        <mesh position={[0, 0.56, 0]}><sphereGeometry args={[0.1, 18, 14]} /><meshStandardMaterial {...CSKIN} /></mesh>
        <mesh position={[0, 0.6, -0.012]} scale={[1, 0.7, 1]}><sphereGeometry args={[0.108, 18, 14]} /><meshStandardMaterial {...CCAP} /></mesh>
        <mesh position={[0, 0.53, 0.082]} scale={[1, 1, 0.55]}><sphereGeometry args={[0.075, 14, 10]} /><meshStandardMaterial {...CMASK} /></mesh>
      </group>
    </group>
  )
}

// ---------------------------------------------------------------------------
//  SET DRESSING — the OR's element language, arranged cath's own way:
//  a scrub at a back instrument table, doors on the RIGHT wall, clock on the
//  back wall, crash cart front-left. Kept simple.
// ---------------------------------------------------------------------------
function CathBackTable({ pos, ry = 0 }: { pos: [number, number, number]; ry?: number }) {
  // a draped stainless tray on chrome legs with instrument silhouettes laid out
  return (
    <group position={pos} rotation-y={ry}>
      {[[-0.6, -0.2], [0.6, -0.2], [-0.6, 0.2], [0.6, 0.2]].map(([dx, dz], i) => (
        <mesh key={i} position={[dx, 0.47, dz as number]}>
          <cylinderGeometry args={[0.025, 0.025, 0.94, 10]} />
          <meshStandardMaterial color={CHROME} metalness={0.9} roughness={0.22} envMapIntensity={1.4} />
        </mesh>
      ))}
      <RoundedBox args={[1.5, 0.05, 0.62]} radius={0.02} smoothness={3} position={[0, 0.95, 0]} castShadow>
        <meshStandardMaterial color={CHROME} metalness={0.9} roughness={0.22} envMapIntensity={1.4} />
      </RoundedBox>
      <RoundedBox args={[1.42, 0.04, 0.54]} radius={0.02} smoothness={3} position={[0, 0.99, 0]}>
        <meshStandardMaterial color="#4a8fb0" roughness={0.6} />
      </RoundedBox>
      {/* instruments laid in a row */}
      {[-0.5, -0.32, -0.14, 0.04, 0.24].map((dx, i) => (
        <mesh key={i} position={[dx, 1.02, 0.02]} rotation-z={0.18 + i * 0.08}>
          <cylinderGeometry args={[0.008, 0.008, 0.3, 6]} />
          <meshStandardMaterial color={CHROME} metalness={0.9} roughness={0.22} envMapIntensity={1.4} />
        </mesh>
      ))}
      {/* a small kidney dish + gauze stack */}
      <mesh position={[0.52, 1.0, 0.08]} rotation-x={-Math.PI / 2}>
        <torusGeometry args={[0.08, 0.02, 8, 20, Math.PI]} />
        <meshStandardMaterial color={CHROME} metalness={0.85} roughness={0.25} />
      </mesh>
      <mesh position={[0.5, 1.02, -0.14]}>
        <boxGeometry args={[0.14, 0.03, 0.12]} />
        <meshStandardMaterial color="#eef2f5" roughness={0.7} />
      </mesh>
    </group>
  )
}

function CathDoors() {
  // tall double swing doors on the RIGHT wall (not mirroring the OR's back wall)
  return (
    <group position={[5.44, 0, 1.5]} rotation-y={-Math.PI / 2}>
      {[-0.5, 0.5].map((dx, i) => (
        <group key={i} position={[dx, 1.52, 0]}>
          <RoundedBox args={[0.96, 3.0, 0.07]} radius={0.02} smoothness={3} castShadow>
            <meshStandardMaterial color="#dde2e7" metalness={0.25} roughness={0.5} envMapIntensity={0.9} />
          </RoundedBox>
          <mesh position={[0, 0.36, 0.045]}><circleGeometry args={[0.16, 24]} /><meshStandardMaterial color="#131d27" roughness={0.2} metalness={0.3} /></mesh>
          <mesh position={[0, 0.36, 0.045]}><torusGeometry args={[0.165, 0.016, 10, 28]} /><meshStandardMaterial color={CHROME} metalness={0.85} roughness={0.25} envMapIntensity={1.3} /></mesh>
          <mesh position={[0, -1.28, 0.042]}><boxGeometry args={[0.86, 0.4, 0.015]} /><meshStandardMaterial color={CHROME} metalness={0.85} roughness={0.25} envMapIntensity={1.3} /></mesh>
          <mesh position={[i === 0 ? 0.38 : -0.38, -0.44, 0.05]}><boxGeometry args={[0.05, 0.58, 0.03]} /><meshStandardMaterial color={CHROME} metalness={0.85} roughness={0.25} envMapIntensity={1.3} /></mesh>
        </group>
      ))}
      <mesh position={[0, 3.12, 0.01]}><boxGeometry args={[2.14, 0.16, 0.06]} /><meshStandardMaterial color={WHITE} metalness={0.4} roughness={0.4} envMapIntensity={1} /></mesh>
    </group>
  )
}

function CathClock({ pos, ry = 0, r = 0.24 }: { pos: [number, number, number]; ry?: number; r?: number }) {
  return (
    <group position={pos} rotation-y={ry}>
      <mesh rotation-x={Math.PI / 2}><cylinderGeometry args={[r + 0.02, r + 0.02, 0.06, 28]} /><meshStandardMaterial color="#12161c" metalness={0.35} roughness={0.55} /></mesh>
      <mesh position={[0, 0, 0.035]}><circleGeometry args={[r, 28]} /><meshBasicMaterial color={hdrCss('#eef3f6', 0.95)} toneMapped={false} /></mesh>
      <mesh position={[0, r * 0.23, 0.04]}><boxGeometry args={[0.016, r * 0.46, 0.006]} /><meshBasicMaterial color="#22303a" /></mesh>
      <mesh position={[r * 0.26, -0.02, 0.04]} rotation-z={-1.1}><boxGeometry args={[0.013, r * 0.62, 0.006]} /><meshBasicMaterial color="#22303a" /></mesh>
      <mesh position={[-r * 0.2, r * 0.2, 0.042]} rotation-z={0.8}><boxGeometry args={[0.006, r * 0.8, 0.005]} /><meshBasicMaterial color={hdrCss('#e04a3a', 1.05)} toneMapped={false} /></mesh>
    </group>
  )
}

function CathCrashCart() {
  // parked beside the tech at the monitors, front angled toward them
  return (
    <group position={[-3.85, 0, 1.7]} rotation-y={0.85 + Math.PI / 2}>
      <RoundedBox args={[0.64, 1.02, 0.5]} radius={0.04} smoothness={3} position={[0, 0.62, 0]} castShadow>
        <meshStandardMaterial color="#a03636" roughness={0.45} metalness={0.15} envMapIntensity={0.9} />
      </RoundedBox>
      {[0.32, 0.54, 0.76, 0.98].map((y, i) => (
        <mesh key={i} position={[0, y, 0.253]}><boxGeometry args={[0.54, 0.13, 0.01]} /><meshStandardMaterial color="#7e2a2a" roughness={0.5} /></mesh>
      ))}
      <mesh position={[0, 0.06, 0]}><cylinderGeometry args={[0.3, 0.34, 0.09, 20]} /><meshStandardMaterial color="#12161c" metalness={0.35} roughness={0.55} /></mesh>
      <mesh position={[0.36, 1.0, 0]} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.02, 0.02, 0.46, 10]} /><meshStandardMaterial color={CHROME} metalness={0.85} roughness={0.25} envMapIntensity={1.3} /></mesh>
      {/* defib on top */}
      <RoundedBox args={[0.42, 0.24, 0.34]} radius={0.03} smoothness={3} position={[-0.04, 1.26, 0]}>
        <meshStandardMaterial color="#12161c" metalness={0.35} roughness={0.55} />
      </RoundedBox>
      <mesh position={[-0.09, 1.3, 0.13]} rotation-x={-0.5}><planeGeometry args={[0.2, 0.13]} /><meshBasicMaterial color={hdrCss('#7de0a8', 1.02)} toneMapped={false} /></mesh>
      {[-0.05, 0.12].map((dz, i) => (
        <mesh key={i} position={[0.16, 1.41, dz]} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.05, 0.06, 0.04, 14]} /><meshStandardMaterial color={CHROME} metalness={0.85} roughness={0.25} envMapIntensity={1.3} /></mesh>
      ))}
    </group>
  )
}

// ---------------------------------------------------------------------------
//  CONSOLE ROOM — the annex beyond the LEFT wall: observation window onto the
//  lab, a long desk of monitors + keyboards, PC tower, printer, seated docs.
//  The wall display across the lab faces straight at this window.
// ---------------------------------------------------------------------------
function ConsoleRoom({ done, glass }: { done: boolean; glass: boolean }) {
  return (
    <group>
      {/* shell — a proper enclosed console box (opaque walls, facing in) */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.005, -7.75]}><planeGeometry args={[5.0, 4.5]} /><meshStandardMaterial color="#565d64" roughness={0.6} metalness={0.1} /></mesh>
      <mesh rotation-x={Math.PI / 2} position={[0, 3.3, -7.75]}><planeGeometry args={[5.0, 4.5]} /><meshStandardMaterial color="#39424c" roughness={0.85} /></mesh>
      <mesh rotation-x={Math.PI / 2} position={[0, 3.28, -7.75]}><planeGeometry args={[1.9, 1.4]} /><meshBasicMaterial color="#b8c8d8" toneMapped={false} /></mesh>
      <pointLight position={[0, 2.85, -7.75]} intensity={6} distance={9} decay={2} color={'#dfe9f5'} />
      <mesh position={[0, 1.8, -10.0]}><planeGeometry args={[5.0, 3.6]} /><meshStandardMaterial color="#aab4bc" roughness={0.7} /></mesh>
      <mesh position={[-2.5, 1.8, -7.75]} rotation-y={Math.PI / 2}><planeGeometry args={[4.5, 3.6]} /><meshStandardMaterial color="#a4aeb6" roughness={0.7} /></mesh>
      <mesh position={[2.5, 1.8, -7.75]} rotation-y={-Math.PI / 2}><planeGeometry args={[4.5, 3.6]} /><meshStandardMaterial color="#a4aeb6" roughness={0.7} /></mesh>
      {/* the shared wall: ONE solid opaque wall with a rectangular hole, built
          as four segments that overlap so the opening is fully sealed — no
          crevices at the edges, no gap at the top. No frame. */}
      {/* knee wall (below the opening) */}
      <mesh position={[0, 0.5, -5.48]}><boxGeometry args={[5.0, 1.0, 0.14]} /><meshStandardMaterial color="#aab4bc" roughness={0.7} side={DoubleSide} /></mesh>
      {/* header (above the opening) — runs up past the ceiling line, sealing the top */}
      <mesh position={[0, 3.02, -5.48]}><boxGeometry args={[5.0, 0.66, 0.14]} /><meshStandardMaterial color="#aab4bc" roughness={0.7} side={DoubleSide} /></mesh>
      {/* left + right jambs — these were the missing pieces (the old crevices) */}
      {[-2.325, 2.325].map((x, i) => (
        <mesh key={i} position={[x, 1.85, -5.48]}><boxGeometry args={[0.35, 1.9, 0.14]} /><meshStandardMaterial color="#aab4bc" roughness={0.7} side={DoubleSide} /></mesh>
      ))}
      {/* the glass — appears the INSTANT you click past the long shot (not on
          the slow "completed" fade), so the long shot stays a clean opening but
          the reveal lands on the very next click. Oversized to overlap the
          opening edges (no crevice). */}
      {glass && (
        <mesh position={[0, 1.85, -5.44]}><planeGeometry args={[4.5, 1.9]} /><meshStandardMaterial color="#c8dce8" transparent opacity={0.18} roughness={0.08} metalness={0.1} envMapIntensity={1.5} side={DoubleSide} /></mesh>
      )}
      {/* the long console desk facing the window */}
      <RoundedBox args={[4.4, 0.07, 0.95]} radius={0.02} smoothness={3} position={[0, 1.0, -6.2]} castShadow>
        <meshStandardMaterial color="#2c343c" roughness={0.5} metalness={0.2} />
      </RoundedBox>
      <mesh position={[0, 0.5, -6.28]}><boxGeometry args={[4.1, 0.95, 0.55]} /><meshStandardMaterial color="#454e57" roughness={0.6} /></mesh>
      {/* two desk monitors, screens toward the docs — the middle stays open so
          the long shot keeps a clear line to the patient. The right one is the
          review station: standby through the run, the angiogram after. */}
      {([[-1.35, 0.12, hemoTex, 1.0], [0.85, -0.1, done ? angioTex : standbyTex, done ? 1.2 : 0.7]] as const).map(([x, ryy, tx, glow], i) => (
        <group key={i} position={[x as number, 1.32, -6.15]} rotation-y={ryy as number}>
          <RoundedBox args={[0.68, 0.42, 0.05]} radius={0.02} smoothness={2}><meshStandardMaterial color={DARK_BEZEL} metalness={0.4} roughness={0.45} /></RoundedBox>
          <mesh position={[0, 0, -0.03]} rotation-y={Math.PI}><planeGeometry args={[0.62, 0.36]} /><meshBasicMaterial map={tx as Texture} toneMapped={false} color={hdrCss('#ffffff', glow as number)} /></mesh>
          {/* stand neck + base plate — sit ON the desk top (world y≈1.04),
              not sunk beneath it */}
          <mesh position={[0, -0.2, 0]}><cylinderGeometry args={[0.028, 0.034, 0.18, 10]} /><meshStandardMaterial color="#3a424a" roughness={0.5} /></mesh>
          <RoundedBox args={[0.34, 0.03, 0.24]} radius={0.012} smoothness={2} position={[0, -0.275, 0.02]}>
            <meshStandardMaterial color="#2c343c" metalness={0.35} roughness={0.45} />
          </RoundedBox>
        </group>
      ))}
      {/* keyboards on the operator side */}
      {[-1.3, 0.9].map((x, i) => (
        <mesh key={i} position={[x, 1.05, -6.6]} rotation-y={0.06 - i * 0.1}><boxGeometry args={[0.38, 0.02, 0.15]} /><meshStandardMaterial color="#1e252c" roughness={0.6} /></mesh>
      ))}
      {/* PC tower + status LED */}
      <mesh position={[1.85, 0.28, -6.3]}><boxGeometry args={[0.24, 0.5, 0.46]} /><meshStandardMaterial color="#252c33" roughness={0.55} /></mesh>
      <mesh position={[1.74, 0.42, -6.06]}><sphereGeometry args={[0.014, 8, 8]} /><meshBasicMaterial color={hdrCss('#57e08a', 1.1)} toneMapped={false} /></mesh>
      {/* printer on its cabinet, paper tray out, little LED */}
      <mesh position={[-1.9, 0.36, -8.3]}><boxGeometry args={[0.8, 0.72, 0.55]} /><meshStandardMaterial color="#aab2ba" roughness={0.55} /></mesh>
      <RoundedBox args={[0.56, 0.26, 0.44]} radius={0.05} smoothness={3} position={[-1.9, 0.86, -8.3]}>
        <meshStandardMaterial color="#e8ebee" roughness={0.5} />
      </RoundedBox>
      <mesh position={[-1.9, 0.78, -8.0]}><boxGeometry args={[0.3, 0.02, 0.26]} /><meshStandardMaterial color="#f4f6f8" roughness={0.4} /></mesh>
      <mesh position={[-1.7, 0.95, -8.09]}><sphereGeometry args={[0.012, 8, 8]} /><meshBasicMaterial color={hdrCss('#57e08a', 1.1)} toneMapped={false} /></mesh>
      {/* control-room detail: gooseneck intercom mic to talk to the lab */}
      <group position={[0.12, 1.035, -6.0]}>
        <mesh><cylinderGeometry args={[0.05, 0.06, 0.03, 12]} /><meshStandardMaterial color="#20262c" metalness={0.4} roughness={0.5} /></mesh>
        <mesh position={[0.02, 0.14, 0.02]} rotation-z={-0.18} rotation-x={0.15}><cylinderGeometry args={[0.008, 0.008, 0.26, 8]} /><meshStandardMaterial color="#454e57" roughness={0.5} /></mesh>
        <mesh position={[0.06, 0.27, 0.05]}><capsuleGeometry args={[0.018, 0.03, 4, 8]} /><meshStandardMaterial color="#12161c" roughness={0.5} /></mesh>
      </group>
      {/* coffee, paperwork, and the equipment rack humming in the corner */}
      <group position={[-0.5, 1.035, -6.42]}>
        <mesh position={[0, 0.045, 0]}><cylinderGeometry args={[0.04, 0.035, 0.09, 14]} /><meshStandardMaterial color="#e8ebee" roughness={0.5} /></mesh>
        <mesh position={[0, 0.085, 0]}><cylinderGeometry args={[0.032, 0.032, 0.008, 14]} /><meshStandardMaterial color="#3d2b1f" roughness={0.8} /></mesh>
      </group>
      <group position={[1.55, 1.04, -6.5]}>
        <mesh rotation-y={0.12}><boxGeometry args={[0.3, 0.006, 0.42]} /><meshStandardMaterial color="#f4f6f8" roughness={0.6} /></mesh>
        <mesh position={[0.05, 0.008, 0.03]} rotation-y={-0.08}><boxGeometry args={[0.28, 0.006, 0.4]} /><meshStandardMaterial color="#e8ecef" roughness={0.6} /></mesh>
      </group>
      <group position={[2.0, 0, -9.55]}>
        <mesh position={[0, 0.8, 0]}><boxGeometry args={[0.56, 1.6, 0.6]} /><meshStandardMaterial color="#1c2229" metalness={0.4} roughness={0.5} /></mesh>
        {[[-0.14, 1.32, '#57e08a'], [0.02, 1.32, '#57e08a'], [0.18, 1.32, '#e0b34c'], [-0.06, 1.18, '#57c8e0']].map(([dx, y, c], i) => (
          <mesh key={i} position={[dx as number, y as number, 0.302]}><sphereGeometry args={[0.012, 8, 8]} /><meshBasicMaterial color={hdrCss(c as string, 1.1)} toneMapped={false} /></mesh>
        ))}
        {[0.5, 0.7, 0.9].map((y, i) => (
          <mesh key={i} position={[0, y, 0.302]}><boxGeometry args={[0.44, 0.015, 0.004]} /><meshStandardMaterial color="#39424c" roughness={0.6} /></mesh>
        ))}
      </group>
      {/* console wall clock */}
      <CathClock pos={[0, 2.7, -9.97]} r={0.2} />
      {/* the docs at the console, facing the lab */}
      <CathFigure pos={[-0.7, 0, -7.0]} ry={0} seated lean={0.08} />
      <CathFigure pos={[0.85, 0, -7.05]} ry={0} seated lean={0.16} apron />
    </group>
  )
}

export function CathLab({ done = false, glass = false }: { done?: boolean; glass?: boolean } = {}) {
  return (
    <group>
      <Room />
      <AngioTable />
      <CArm />
      <CArmBase />
      <CathMonitors done={done} />
      {/* one service boom reaching in over the table */}
      <CeilingBoom mount={[3.9, H, -0.9]} yaw={Math.PI} />
      <CathBackTable pos={[-1.0, 0, 2.6]} ry={0.4 + Math.PI / 2} />
      <CathDoors />
      <CathClock pos={[-3.2, 3.0, 5.46]} ry={Math.PI} />
      <CathCrashCart />
      <XRayPlate done={done} />
      <CathSign done={done} />
      <CorridorSide />
      <ConsoleRoom done={done} glass={glass} />
      {/* the case in progress — patient on the table, operator + tech at the
          bedside, and a scrub arranging instruments at the back table */}
      <CathPatient />
      <CathFigure pos={[0.85, 0, -0.55]} ry={-Math.PI / 2} lean={0.28} apron />
      <CathFigure pos={[-2.7, 0, 1.3]} ry={-0.43} lean={0.08} />
      <CathFigure pos={[-1.75, 0, 2.6]} ry={Math.PI / 2} lean={0.24} />
      {/* dimmed-for-the-run mood: the bank is the brightest thing in the room */}
      <pointLight position={[-3.3, 2.3, 1.5]} intensity={5} distance={5.5} decay={2} color={'#57d7ff'} />
      <pointLight position={[4.6, 2.1, 1.2]} intensity={2} distance={4} decay={2} color={'#4aa8d8'} />
    </group>
  )
}
