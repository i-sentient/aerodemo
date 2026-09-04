import { useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { BackSide, DoubleSide, MathUtils, type Mesh, type MeshStandardMaterial } from 'three'
import { hdrCss } from './glow'
import { emergencyTex } from '../lab/screenTex'

// ===========================================================================
//  ROUND ER — architecture shell only (no patients, no story, no tags).
//  A circular glass drum: a disc floor, a central chrome column, a 360° curved
//  glass wall banded by chrome rings, radial "spoke" beds around the rim, and a
//  soft ceiling with a faint cove strip. Modeled after the "EMERGENCY SICK BAY"
//  ring. Every dimension is a knob at the top so the shape is easy to tune.
// ===========================================================================

const R = 18          // room radius (glass wall) — big ER
const WALL_H = 7.5    // glass wall height (taller = more elegant, counters the width)
const N_BEDS = 16     // beds around the rim
const R_BED = 15.3    // radius the beds sit at
const N_MULLIONS = 40 // vertical window posts
const N_SIGNS = 1     // a single red "EMERGENCY" on the back glass wall
const COVE = '#eaf2fb' // cool-white cove light (no green)

// Bed layout published so the population layer (patients / consoles / props)
// lands exactly on the same slots the shell draws.
export interface BedSlot { index: number; position: [number, number, number]; rotationY: number }
export const BED_SLOTS: BedSlot[] = Array.from({ length: N_BEDS }, (_, i) => {
  const a = (i / N_BEDS) * Math.PI * 2
  // feet point to the centre, head to the outer glass wall (round-ward layout)
  return { index: i, position: [Math.cos(a) * R_BED, 0, Math.sin(a) * R_BED], rotationY: -Math.PI / 2 - a }
})
export const ER_DIMS = { R, WALL_H, R_BED, N_BEDS }

// --- one clean bed (frosted slab + chrome frame), no labels -----------------
function SpokeBed({ position, rotationY }: { position: [number, number, number]; rotationY: number }) {
  return (
    <group position={position} rotation-y={rotationY}>
      {/* base frame */}
      <RoundedBox args={[1.5, 0.44, 2.3]} radius={0.08} smoothness={3} position={[0, 0.22, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#d7dde3" metalness={0.7} roughness={0.28} envMapIntensity={1.3} />
      </RoundedBox>
      {/* mattress */}
      <RoundedBox args={[1.28, 0.18, 2.0]} radius={0.06} smoothness={3} position={[0, 0.5, 0]}>
        <meshPhysicalMaterial color="#eef4fb" roughness={0.35} clearcoat={0.5} clearcoatRoughness={0.3} envMapIntensity={0.9} />
      </RoundedBox>
      {/* pillow */}
      <RoundedBox args={[1.0, 0.14, 0.5]} radius={0.06} smoothness={3} position={[0, 0.63, -0.78]}>
        <meshStandardMaterial color="#f7fafe" roughness={0.55} />
      </RoundedBox>
      {/* headboard (head to the glass) */}
      <RoundedBox args={[1.5, 0.5, 0.1]} radius={0.04} smoothness={3} position={[0, 0.55, -1.12]}>
        <meshStandardMaterial color="#cbd2d8" metalness={0.8} roughness={0.24} envMapIntensity={1.3} />
      </RoundedBox>
    </group>
  )
}

/** The ward's eye — a dome camera pendant at the drum's crown. A fixture, not
 *  a beat prop: it hangs from the first frame, and the coverage beat just looks
 *  up at what was always there (the CCU corner cam made the same argument).
 *  The ceiling annulus is open from r=0 to 2, so the pendant hangs off a hub
 *  cap that closes the oculus. */
function CeilingCam({ capRef }: { capRef: RefObject<Mesh> }) {
  return (
    <group position={[0, WALL_H, 0]}>
      {/* the hub cap over the oculus */}
      <mesh ref={capRef} rotation-x={Math.PI / 2} position={[0, 0.01, 0]}>
        <circleGeometry args={[1.55, 64]} />
        <meshStandardMaterial color="#dfe6ed" metalness={0.4} roughness={0.42} side={DoubleSide} envMapIntensity={0.8} transparent />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position={[0, -0.02, 0]}>
        <torusGeometry args={[1.49, 0.045, 12, 96]} />
        <meshStandardMaterial color="#c4cbd1" metalness={1} roughness={0.2} envMapIntensity={1.5} />
      </mesh>
      {/* pendant stem */}
      <mesh position={[0, -0.24, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.48, 12]} />
        <meshStandardMaterial color="#cdd3d9" metalness={0.9} roughness={0.24} envMapIntensity={1.4} />
      </mesh>
      {/* housing + dark glass dome, scaled to the drum (the CCU dome is desk-scale) */}
      <mesh position={[0, -0.52, 0]}>
        <cylinderGeometry args={[0.17, 0.19, 0.1, 24]} />
        <meshStandardMaterial color="#aeb7c1" metalness={0.6} roughness={0.32} envMapIntensity={1.1} />
      </mesh>
      <mesh position={[0, -0.57, 0]}>
        <sphereGeometry args={[0.14, 24, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
        <meshPhysicalMaterial color="#10151c" roughness={0.12} metalness={0.1} clearcoat={1} clearcoatRoughness={0.08} />
      </mesh>
      {/* the recording tick */}
      <mesh position={[0.1, -0.5, 0.1]}>
        <sphereGeometry args={[0.014, 10, 10]} />
        <meshBasicMaterial color={hdrCss('#4cff88', 1.6)} toneMapped={false} />
      </mesh>
    </group>
  )
}

export function RoundER({ xray = false }: { xray?: boolean } = {}) {
  // The bird's-eye beats look straight down from ABOVE the drum, so the roof
  // thins to a veil. It never comes back to solid: once the ATLAS chapter has
  // opened the ceiling up, re-sealing it between beats read as the room
  // slamming shut — and the ward is legible through a permanent 0.35 veil at
  // every other angle anyway. Damped, so the opening still dissolves.
  const ceilRef = useRef<Mesh>(null)
  const capRef = useRef<Mesh>(null)
  useFrame((_, dt) => {
    const target = xray ? 0.1 : 0.35
    for (const r of [ceilRef.current, capRef.current]) {
      const m = r?.material as MeshStandardMaterial | undefined
      if (m) m.opacity = MathUtils.damp(m.opacity, target, 3, dt)
    }
  })
  return (
    <group>
      {/* ── floor disc ─────────────────────────────────────────────── */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]} receiveShadow>
        <circleGeometry args={[R, 128]} />
        <meshStandardMaterial color="#e9eef4" metalness={0.3} roughness={0.34} envMapIntensity={1} />
      </mesh>
      {/* floor chrome rim */}
      <mesh rotation-x={Math.PI / 2} position={[0, 0.04, 0]}>
        <torusGeometry args={[R, 0.16, 16, 160]} />
        <meshStandardMaterial color="#cdd3d9" metalness={1} roughness={0.16} envMapIntensity={1.7} />
      </mesh>

      {/* ── curved glass wall (open cylinder) ──────────────────────── */}
      <mesh position={[0, WALL_H / 2, 0]}>
        <cylinderGeometry args={[R, R, WALL_H, 128, 1, true]} />
        <meshPhysicalMaterial
          color="#eaf3fb"
          transparent
          transmission={0.94}
          thickness={0.4}
          ior={1.4}
          roughness={0.06}
          metalness={0}
          clearcoat={1}
          clearcoatRoughness={0.05}
          envMapIntensity={1.5}
          opacity={0.9}
          side={DoubleSide}
        />
      </mesh>
      {/* vertical chrome mullions (window frame segments) */}
      {Array.from({ length: N_MULLIONS }, (_, i) => {
        const a = (i / N_MULLIONS) * Math.PI * 2
        return (
          <mesh key={i} position={[Math.cos(a) * R, WALL_H / 2, Math.sin(a) * R]}>
            <boxGeometry args={[0.08, WALL_H, 0.08]} />
            <meshStandardMaterial color="#c4cbd1" metalness={1} roughness={0.2} envMapIntensity={1.5} />
          </mesh>
        )
      })}
      {/* top chrome ring */}
      <mesh rotation-x={Math.PI / 2} position={[0, WALL_H, 0]}>
        <torusGeometry args={[R, 0.18, 16, 160]} />
        <meshStandardMaterial color="#cdd3d9" metalness={1} roughness={0.16} envMapIntensity={1.7} />
      </mesh>

      {/* ── red EMERGENCY signage — curved to hug the glass so the whole
          word stays inside the drum (a flat panel would bow out & clip) ── */}
      {Array.from({ length: N_SIGNS }, (_, i) => {
        const Rs = R - 0.15         // sign radius, just inside the glass
        const signH = 1.92          // sign height
        const arc = 10.8 / Rs       // arc length → angular span of the word
        // place the single sign on the back (+z) wall the camera faces
        const a = Math.PI / 2 + (i / N_SIGNS) * Math.PI * 2
        // cylinder theta 0 sits on +Z; our bed angle a sits on (cos a, sin a),
        // so centre the arc at (π/2 − a) and open it symmetrically.
        const thetaStart = Math.PI / 2 - a - arc / 2
        return (
          <mesh key={`sign-${i}`} position={[0, WALL_H * 0.5 + 1.0, 0]}>
            <cylinderGeometry args={[Rs, Rs, signH, 24, 1, true, thetaStart, arc]} />
            <meshBasicMaterial
              map={emergencyTex}
              color={hdrCss('#ff3535', 1.7)}
              transparent
              toneMapped={false}
              side={BackSide} // inner face → reads from the room centre
              depthWrite={false}
            />
          </mesh>
        )
      })}

      {/* ── ceiling annulus + faint cool cove ──────────────────────── */}
      <mesh ref={ceilRef} rotation-x={Math.PI / 2} position={[0, WALL_H, 0]}>
        <ringGeometry args={[1.5, R, 128]} />
        <meshStandardMaterial color="#dfe6ed" metalness={0.4} roughness={0.42} side={DoubleSide} envMapIntensity={0.8} transparent />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position={[0, WALL_H - 0.16, 0]}>
        <torusGeometry args={[R - 0.6, 0.05, 12, 160]} />
        <meshBasicMaterial color={hdrCss(COVE, 1.05)} toneMapped={false} />
      </mesh>

      <CeilingCam capRef={capRef} />

      {/* ── radial spoke beds ──────────────────────────────────────── */}
      {BED_SLOTS.map((s) => (
        <SpokeBed key={s.index} position={s.position} rotationY={s.rotationY} />
      ))}
    </group>
  )
}
