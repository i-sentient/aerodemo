import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Html, Line } from '@react-three/drei'
import { type Mesh } from 'three'
import {
  AERO,
  CText,
  severityColor,
  type Vec3,
  type VitalTrajectory,
} from '../ontology'
import { GlassCard } from './GlassCard'
import { hdrCss } from '../scene/glow'

// ---------------------------------------------------------------------------
//  VITAL-TRAJECTORY CARD — frosted glass card with the sparkline INSIDE the
//  glass. severity → line + edge color. `live` (sensor-driven, Type A) adds a
//  running scan line + a LIVE badge — the arrival "vitals go live" beat.
// ---------------------------------------------------------------------------

const W = 1.7
const H = 0.8

function sparkPoints(series: number[], w: number, h: number): Vec3[] {
  if (series.length < 2) return [[-w / 2, 0, 0.055], [w / 2, 0, 0.055]]
  const min = Math.min(...series)
  const max = Math.max(...series)
  const span = max - min || 1
  return series.map((v, i): Vec3 => {
    const x = -w / 2 + (i / (series.length - 1)) * w
    const y = ((v - min) / span - 0.5) * h
    return [x, y, 0.055]
  })
}

export function VitalTrajectoryCard({
  traj,
  position,
  live = false,
}: {
  traj: VitalTrajectory
  position: Vec3
  live?: boolean
}) {
  const color = severityColor[traj.severity]
  const pts = sparkPoints(traj.series, W * 0.82, H * 0.5)
  const scanRef = useRef<Mesh>(null)

  useFrame((state) => {
    if (!live || !scanRef.current) return
    const span = W * 0.82
    const x = (((state.clock.elapsedTime * 0.6) % 1) - 0.5) * span
    scanRef.current.position.x = x
  })

  return (
    <Billboard position={position}>
      <GlassCard w={W} h={H} accent={color}>
        {/* sparkline sits inside the glass sandwich */}
        <Line points={pts} color={color} lineWidth={2.6} position={[0, -0.02, 0]} />
        {/* running scan line when live */}
        {live && (
          <mesh ref={scanRef} position={[0, 0, 0.05]}>
            <boxGeometry args={[0.02, H * 0.6, 0.002]} />
            <meshBasicMaterial color={hdrCss(color, 1.6)} toneMapped={false} transparent opacity={0.85} />
          </mesh>
        )}
      </GlassCard>

      {/* score + severity chip */}
      <Html center position={[0, H / 2 + 0.16, 0]} zIndexRange={[8, 0]}>
        <div
          style={{
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            font: '700 11px ui-sans-serif, system-ui, sans-serif',
            color: AERO.ink,
            background: AERO.chip,
            border: `1px solid ${AERO.chipBorder}`,
            borderRadius: 6,
            padding: '2px 7px',
            backdropFilter: 'blur(7px)',
          }}
        >
          <span style={{ color }}>● </span>
          NEWS2 {traj.score} · {traj.direction}
          {live && <span style={{ color: CText.red, fontWeight: 800 }}> · LIVE</span>}
        </div>
      </Html>
    </Billboard>
  )
}
