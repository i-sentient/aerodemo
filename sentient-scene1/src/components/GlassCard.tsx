import { type ReactNode } from 'react'
import { Line, RoundedBox } from '@react-three/drei'
import { AERO, type Vec3 } from '../ontology'

// ---------------------------------------------------------------------------
//  GLASS CARD — the shared LIGHT FROSTED-glass shell for data cards (bright Y2K
//  grammar). A clean frosted-white panel with a crisp candy edge; content sits
//  "inside" between the plate face and a faint front sheen.
//  Content is placed by the caller at z ≈ 0.055.
// ---------------------------------------------------------------------------

function roundedRectPoints(w: number, h: number, r: number, z: number): Vec3[] {
  const hw = w / 2 - r
  const hh = h / 2 - r
  const seg = 5
  const pts: Vec3[] = []
  const corner = (cx: number, cy: number, a0: number, a1: number) => {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (a1 - a0) * (i / seg)
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, z])
    }
  }
  corner(hw, hh, 0, Math.PI / 2)
  corner(-hw, hh, Math.PI / 2, Math.PI)
  corner(-hw, -hh, Math.PI, 1.5 * Math.PI)
  corner(hw, -hh, 1.5 * Math.PI, 2 * Math.PI)
  pts.push(pts[0])
  return pts
}

export function GlassCard({
  w,
  h,
  accent,
  children,
}: {
  w: number
  h: number
  accent: string
  children?: ReactNode
}) {
  return (
    <group>
      {/* soft accent halo behind (normal blend — reads on the light ground) */}
      <mesh position={[0, 0, -0.05]}>
        <planeGeometry args={[w + 0.24, h + 0.24]} />
        <meshBasicMaterial color={accent} transparent opacity={0.14} depthWrite={false} />
      </mesh>

      {/* light frosted glass back plate */}
      <RoundedBox args={[w, h, 0.06]} radius={0.07} smoothness={5} castShadow>
        <meshPhysicalMaterial
          color={AERO.smoke}
          metalness={0.1}
          roughness={0.3}
          transparent
          opacity={0.88}
          clearcoat={0.7}
          clearcoatRoughness={0.25}
          envMapIntensity={1.0}
        />
      </RoundedBox>

      {/* crisp candy edge */}
      <Line
        points={roundedRectPoints(w - 0.02, h - 0.02, 0.07, 0.05)}
        color={accent}
        lineWidth={2.2}
        transparent
        opacity={0.9}
      />

      {children}

      {/* faint front sheen */}
      <mesh position={[0, 0, 0.078]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial
          color="#eef5fb"
          roughness={0.2}
          metalness={0.1}
          transparent
          opacity={0.12}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}
