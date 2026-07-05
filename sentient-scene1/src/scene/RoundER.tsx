import { RoundedBox } from '@react-three/drei'
import { DoubleSide } from 'three'
import { hdrCss } from './glow'

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

export function RoundER() {
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

      {/* ── ceiling annulus + faint cool cove ──────────────────────── */}
      <mesh rotation-x={Math.PI / 2} position={[0, WALL_H, 0]}>
        <ringGeometry args={[2.0, R, 128]} />
        <meshStandardMaterial color="#dfe6ed" metalness={0.4} roughness={0.42} side={DoubleSide} envMapIntensity={0.8} />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position={[0, WALL_H - 0.16, 0]}>
        <torusGeometry args={[R - 0.6, 0.05, 12, 160]} />
        <meshBasicMaterial color={hdrCss(COVE, 1.05)} toneMapped={false} />
      </mesh>

      {/* ── radial spoke beds ──────────────────────────────────────── */}
      {BED_SLOTS.map((s) => (
        <SpokeBed key={s.index} position={s.position} rotationY={s.rotationY} />
      ))}
    </group>
  )
}
