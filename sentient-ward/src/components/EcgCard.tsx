import { Billboard, Html, Line } from '@react-three/drei'
import {
  AERO,
  CText,
  isEcgPayload,
  type LabResult,
  type Vec3,
} from '../ontology'
import { GlassCard } from './GlassCard'
import { hdrCss } from '../scene/glow'

// ---------------------------------------------------------------------------
//  ECG LabResult CARD — HARD RULE (iSAM): the raw strip is ALWAYS shown BESIDE
//  SAM's read, never the read alone. Left = raw waveform; right = the OMI read
//  + resulting acuity. Frosted glass card in the aero grammar.
// ---------------------------------------------------------------------------

const W = 3.3
const H = 1.35
const STRIP_W = W * 0.55
const Z = 0.055

function stripPoints(samples: number[], w: number, hScale: number): Vec3[] {
  if (!samples.length) return [[-w / 2, 0, Z], [w / 2, 0, Z]]
  const step = Math.max(1, Math.floor(samples.length / 480))
  const pts: Vec3[] = []
  for (let i = 0; i < samples.length; i += step) {
    const x = -w / 2 + (i / (samples.length - 1)) * w
    pts.push([x, samples[i] * hScale, Z])
  }
  return pts
}

const chip: React.CSSProperties = {
  pointerEvents: 'none',
  whiteSpace: 'nowrap',
  font: '600 10px ui-sans-serif, system-ui, sans-serif',
  color: AERO.inkDim,
  background: AERO.chip,
  border: `1px solid ${AERO.chipBorder}`,
  borderRadius: 6,
  padding: '2px 7px',
  backdropFilter: 'blur(7px)',
}

export function EcgCard({ lab, position }: { lab: LabResult; position: Vec3 }) {
  const samples = isEcgPayload(lab.payload) ? lab.payload.samples : []
  const pts = stripPoints(samples, STRIP_W, 0.34)
  const stripCx = -W / 2 + STRIP_W / 2 + 0.14

  return (
    <Billboard position={position}>
      <GlassCard w={W} h={H} accent={CText.coral}>
        {/* RAW strip (left) */}
        <group position={[stripCx, 0.06, 0]}>
          <Line points={pts} color={hdrCss(CText.red, 1.5)} lineWidth={2} />
        </group>

        {/* divider between raw and read */}
        <Line
          points={[
            [W * 0.09, -H / 2 + 0.16, Z],
            [W * 0.09, H / 2 - 0.16, Z],
          ]}
          color="#2c4e82"
          lineWidth={1}
        />
      </GlassCard>

      {/* title */}
      <Html center position={[0, H / 2 + 0.17, 0]} zIndexRange={[8, 0]}>
        <div style={{ ...chip, color: AERO.ink, fontWeight: 800 }}>ECG · LabResult</div>
      </Html>

      {/* raw label (left) */}
      <Html center position={[stripCx, -H / 2 + 0.02, 0.06]} zIndexRange={[8, 0]}>
        <div style={chip}>
          RAW · lead II · <b style={{ color: AERO.ink }}>shown beside read</b>
        </div>
      </Html>

      {/* SAM read (right) */}
      <Html position={[W * 0.12, H / 2 - 0.22, 0.06]} zIndexRange={[8, 0]}>
        <div
          style={{
            pointerEvents: 'none',
            width: 165,
            font: '600 11px ui-sans-serif, system-ui, sans-serif',
            color: AERO.ink,
            background: AERO.chip,
            border: `1px solid ${AERO.chipBorder}`,
            borderRadius: 8,
            padding: '7px 9px',
            backdropFilter: 'blur(7px)',
          }}
        >
          <div style={{ color: CText.coral, fontWeight: 800, marginBottom: 3 }}>
            SAM · OMI-read
          </div>
          <div>{lab.read ?? '—'}</div>
          <div style={{ marginTop: 5, color: CText.red, fontWeight: 700 }}>
            acuity → CRITICAL
          </div>
        </div>
      </Html>
    </Billboard>
  )
}
