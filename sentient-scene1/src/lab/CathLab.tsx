import { RoundedBox } from '@react-three/drei'
import { DoubleSide, MathUtils, type Texture } from 'three'
import { hdrCss } from '../scene/glow'
import { angioTex, hemoTex, xrayOnTex } from './cathTex'

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
      {/* back wall (+z, faces -z) */}
      <mesh position={[0, H / 2, HD]} rotation-y={Math.PI}>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial color="#f3f6f9" roughness={0.6} metalness={0.05} side={DoubleSide} />
      </mesh>
      {/* left wall (-x, faces +x) */}
      <mesh position={[-HW, H / 2, 0]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[D, H]} />
        <meshStandardMaterial color="#eef2f6" roughness={0.6} metalness={0.05} side={DoubleSide} />
      </mesh>
      {/* right wall (+x, faces -x) */}
      <mesh position={[HW, H / 2, 0]} rotation-y={-Math.PI / 2}>
        <planeGeometry args={[D, H]} />
        <meshStandardMaterial color="#eef2f6" roughness={0.6} metalness={0.05} side={DoubleSide} />
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

      {/* ceiling slab */}
      <mesh rotation-x={Math.PI / 2} position={[0, H, 0]}>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#e7ebf0" roughness={0.7} metalness={0.05} side={DoubleSide} />
      </mesh>
      {/* recessed LED light panels (emissive, gently bloom-free) */}
      {panels.map(([x, z], i) => (
        <mesh key={i} rotation-x={Math.PI / 2} position={[x, H - 0.04, z]}>
          <planeGeometry args={[2.1, 2.1]} />
          <meshBasicMaterial color="#f4f8ff" toneMapped={false} />
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
          <meshBasicMaterial color={hdrCss('#eaf2fb', 1.05)} toneMapped={false} />
        </mesh>
      ))}

      {/* small illuminated X-RAY ON plate on the back wall */}
      <mesh position={[3.2, 3.0, HD - 0.04]}>
        <planeGeometry args={[1.5, 0.47]} />
        <meshBasicMaterial map={xrayOnTex} transparent toneMapped={false} color={hdrCss('#ffffff', 1.15)} />
      </mesh>
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
//  CEILING BOOM — monitor bank. A drop from the ceiling + arm carrying a frame
//  of six displays (fluoro + hemodynamics) angled toward the operator.
// ---------------------------------------------------------------------------
function MonitorBoom() {
  // 3×2 array of displays, screens facing -Z (the operator / camera)
  const screens: { pos: [number, number, number]; tex: Texture }[] = [
    { pos: [-0.98, 0.45, 0], tex: angioTex },
    { pos: [0, 0.45, 0], tex: hemoTex },
    { pos: [0.98, 0.45, 0], tex: angioTex },
    { pos: [-0.98, -0.42, 0], tex: hemoTex },
    { pos: [0, -0.42, 0], tex: angioTex },
    { pos: [0.98, -0.42, 0], tex: hemoTex },
  ]
  const [, by] = CATH_DIMS.boomScreen
  return (
    <group position={CATH_DIMS.boomScreen}>
      {/* slim ceiling drop, set BEHIND the array so it never crosses the screens */}
      <mesh position={[0, (H - by + 1.15) / 2, 0.75]}>
        <cylinderGeometry args={[0.08, 0.08, H - by - 1.15, 16]} />
        <meshStandardMaterial color={CHROME} metalness={0.9} roughness={0.22} envMapIntensity={1.4} />
      </mesh>
      {/* horizontal arm reaching forward over the top edge to the array */}
      <mesh position={[0, 1.06, 0.42]}>
        <boxGeometry args={[0.2, 0.15, 0.78]} />
        <meshStandardMaterial color={WHITE} metalness={0.4} roughness={0.4} envMapIntensity={1} />
      </mesh>
      {/* small pivot where the arm meets the array top-back */}
      <mesh position={[0, 0.9, 0.13]}>
        <boxGeometry args={[0.34, 0.3, 0.22]} />
        <meshStandardMaterial color="#2a323b" metalness={0.5} roughness={0.42} />
      </mesh>
      {/* the array — glowing screens on a dark backing panel, tilted down */}
      <group rotation-x={deg(9)}>
        <RoundedBox args={[2.95, 1.78, 0.1]} radius={0.05} smoothness={3} position={[0, 0, 0.07]}>
          <meshStandardMaterial color="#2a323b" metalness={0.5} roughness={0.42} />
        </RoundedBox>
        {screens.map((s, i) => (
          <group key={i} position={s.pos}>
            <Screen size={[0.88, 0.78]} tex={s.tex} />
          </group>
        ))}
      </group>
    </group>
  )
}

// ---------------------------------------------------------------------------
//  WALL DISPLAY — big fluoroscopy panel on the right wall
// ---------------------------------------------------------------------------
function WallDisplay() {
  return (
    <group position={[HW - 0.06, 2.15, 1.2]} rotation-y={-Math.PI / 2}>
      <Screen size={[2.3, 1.7]} tex={angioTex} glow={1.02} />
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

export function CathLab() {
  return (
    <group>
      <Room />
      <AngioTable />
      <CArm />
      <CArmBase />
      <MonitorBoom />
      {/* one service boom reaching in over the table (the boom that crowded the
          monitor bank was removed) */}
      <CeilingBoom mount={[3.9, H, -0.9]} yaw={Math.PI} />
      <WallDisplay />
    </group>
  )
}
