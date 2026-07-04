import { useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Line, OrbitControls } from '@react-three/drei'
import { MathUtils, NoToneMapping, type Group } from 'three'
import { SceneEnvironment } from './scene/Environment'
import { Building } from './scene/Building'
import { BuildingStack, ER_INFO, STACK_TOP } from './scene/BuildingStack'
import { Postprocessing } from './scene/Postprocessing'
import { PatientLayer } from './components/PatientLayer'
import { RelationEdges } from './components/RelationEdges'
import { OrderLayer } from './components/OrderLayer'
import { HandoffLayer } from './components/HandoffCard'
import { TimelineScrubber } from './components/TimelineScrubber'
import { EpisodePlayer } from './episode/EpisodePlayer'
import {
  AERO,
  CText,
  PROVENANCE,
  STATE_TYPE_LABEL,
  autonomyColor,
  capacitySense,
  transferSense,
  useOntologyStore,
  type OntologyData,
  type StateType,
} from './ontology'

// ---------------------------------------------------------------------------
//  SCENE 1 — full app. The EpisodePlayer drives the ontology store along the
//  scripted timeline (swap it for a live WS feed and nothing else changes).
// ---------------------------------------------------------------------------

function SceneRoot() {
  const setFocus = useOntologyStore((s) => s.setFocus)
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, toneMapping: NoToneMapping }}
      camera={{ position: [17, 13, 23], fov: 42 }}
      onPointerMissed={() => setFocus(null)}
    >
      <SceneEnvironment />
      <EpisodePlayer />
      <Building />
      <RelationEdges />
      <PatientLayer />
      <OrderLayer />
      <HandoffLayer />
      <OrbitControls
        target={[2, 1.2, 5]}
        enableDamping
        dampingFactor={0.08}
        autoRotate
        autoRotateSpeed={0.25}
        minDistance={8}
        maxDistance={60}
        maxPolarAngle={Math.PI / 2.05}
      />
      <Postprocessing />
    </Canvas>
  )
}

// ---------------------------------------------------------------------------
//  Overlay — aero frosted glass, reads the store live
// ---------------------------------------------------------------------------
const panel: React.CSSProperties = {
  background: AERO.glass,
  border: `1px solid ${AERO.glassBorder}`,
  borderRadius: 14,
  padding: '14px 16px',
  backdropFilter: 'blur(14px) saturate(1.1)',
  WebkitBackdropFilter: 'blur(14px) saturate(1.1)',
  boxShadow: '0 10px 34px rgba(40,70,110,0.16)',
  color: AERO.ink,
  maxWidth: 320,
}

function ProvenanceSwatch({ s }: { s: StateType }) {
  const v = PROVENANCE[s]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
      <span
        style={{
          width: 18, height: 18, borderRadius: 4,
          background: CText.blue, opacity: v.opacity,
          boxShadow: `0 0 12px ${CText.blue}88`, flex: '0 0 auto',
          border: '1px solid rgba(120,200,255,0.5)',
        }}
      />
      <span style={{ color: AERO.ink }}>
        <b>Type {s}</b> · {STATE_TYPE_LABEL[s]}{' '}
        <span style={{ color: AERO.inkDim }}>(opacity {v.opacity.toFixed(2)})</span>
      </span>
    </div>
  )
}

function Overlay() {
  const data = useOntologyStore(
    (s): OntologyData => ({ entities: s.entities, relations: s.relations }),
  )

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const e of Object.values(data.entities)) c[e.entity] = (c[e.entity] ?? 0) + 1
    return c
  }, [data.entities])

  const erCap = capacitySense(data, 'er')
  const candidate = transferSense(data, 'er', 'ward')

  return (
    <div className="overlay">
      <div style={{ position: 'absolute', top: 16, left: 16, ...panel }}>
        <div style={{ fontSize: 13, letterSpacing: 1, color: CText.teal, fontWeight: 800 }}>
          SENTIENT · SCENE 1
        </div>
        <div style={{ fontSize: 11, color: AERO.inkDim, marginTop: 2 }}>
          STEMI arrival · live ontology
        </div>

        <div style={{ marginTop: 12, fontSize: 12 }}>
          <div style={{ color: AERO.inkDim, marginBottom: 4 }}>ontology objects</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
            {Object.entries(counts)
              .sort()
              .map(([k, n]) => (
                <span key={k}>
                  <b>{n}</b> <span style={{ color: AERO.inkDim }}>{k}</span>
                </span>
              ))}
          </div>
        </div>

        <div style={{ marginTop: 12, fontSize: 12 }}>
          <div style={{ color: AERO.inkDim, marginBottom: 4 }}>Capacity-sense · ER</div>
          <div style={{ color: erCap.full ? CText.coral : CText.green, fontWeight: 700 }}>
            {erCap.full ? 'ER FULL' : `${erCap.available} free`}{' '}
            <span style={{ color: AERO.inkDim, fontWeight: 400 }}>
              ({erCap.occupied}/{erCap.total} occupied)
            </span>
          </div>
        </div>

        <div style={{ marginTop: 10, fontSize: 12 }}>
          <div style={{ color: AERO.inkDim, marginBottom: 4 }}>Transfer-sense</div>
          {candidate ? (
            <div>
              <b style={{ color: CText.green }}>{candidate.patient.label}</b> (flat-green) →{' '}
              <b style={{ color: CText.teal }}>{candidate.destBed.locationId}</b>
            </div>
          ) : (
            <div style={{ color: AERO.inkDim }}>—</div>
          )}
        </div>
      </div>

      <div style={{ position: 'absolute', bottom: 96, left: 16, ...panel }}>
        <div style={{ color: AERO.inkDim, fontSize: 11, marginBottom: 6 }}>
          PROVENANCE (confidence → opacity)
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <ProvenanceSwatch s="A" />
          <ProvenanceSwatch s="B" />
          <ProvenanceSwatch s="C" />
        </div>
        <div style={{ color: AERO.inkDim, fontSize: 11, margin: '12px 0 6px' }}>
          AUTONOMY (Governor → color)
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
          {(['autonomous', 'autoConfirm', 'clinicalGated'] as const).map((a) => (
            <span key={a} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span
                style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: autonomyColor[a], boxShadow: `0 0 8px ${autonomyColor[a]}`,
                }}
              />
              <span style={{ color: AERO.ink }}>{a}</span>
            </span>
          ))}
        </div>
      </div>

      <TimelineScrubber />
    </div>
  )
}

// ---------------------------------------------------------------------------
//  INTRO — the whole hospital tower, slowly rotating. Sequence on enter:
//    orbit → TARGET (rotation stops, red reticle locks the ER block)
//          → FLY (camera dives into the ER) → fade → ER floorplan scene.
// ---------------------------------------------------------------------------
const GREEN = '#5ece3a'
const RETICLE_RED = '#ff3344'
const ORBIT_TARGET: [number, number, number] = [0, STACK_TOP * 0.45, 0]
const LOCK_POS: [number, number, number] = [0, ER_INFO.y + 2.8, 27]
const DIVE_POS: [number, number, number] = [0, ER_INFO.y + 0.2, ER_INFO.frontZ - 0.6]
const lp = (a: number, b: number, t: number) => a + (b - a) * t
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

const enterBtn: React.CSSProperties = {
  pointerEvents: 'auto',
  cursor: 'pointer',
  font: '800 15px ui-sans-serif, system-ui, sans-serif',
  letterSpacing: 0.3,
  color: '#0d2a10',
  background: `linear-gradient(180deg, ${GREEN}, #2f9c26)`,
  border: '1px solid rgba(255,255,255,0.6)',
  borderRadius: 12,
  padding: '12px 22px',
  boxShadow: `0 8px 26px ${GREEN}66`,
}

type Phase = 'orbit' | 'target' | 'fly'

/** Drives the camera through the target-lock + dive; calls onArrived at the end. */
function FlyRig({
  phase,
  onFade,
  onArrived,
}: {
  phase: Phase
  onFade: (v: number) => void
  onArrived: () => void
}) {
  const prog = useRef(0)
  const done = useRef(false)
  useFrame((state, dt) => {
    const cam = state.camera as any
    if (phase === 'target') {
      cam.position.x = MathUtils.damp(cam.position.x, LOCK_POS[0], 2.2, dt)
      cam.position.y = MathUtils.damp(cam.position.y, LOCK_POS[1], 2.2, dt)
      cam.position.z = MathUtils.damp(cam.position.z, LOCK_POS[2], 2.2, dt)
      cam.fov = MathUtils.damp(cam.fov, 34, 3, dt)
      cam.updateProjectionMatrix()
      cam.lookAt(0, ER_INFO.y, 0)
    } else if (phase === 'fly') {
      prog.current = Math.min(1, prog.current + dt / 1.9)
      const p = easeInOut(prog.current)
      cam.position.set(
        lp(LOCK_POS[0], DIVE_POS[0], p),
        lp(LOCK_POS[1], DIVE_POS[1], p),
        lp(LOCK_POS[2], DIVE_POS[2], p),
      )
      cam.fov = lp(34, 52, p)
      cam.updateProjectionMatrix()
      cam.lookAt(0, ER_INFO.y, 0)
      onFade(Math.max(0, (p - 0.7) / 0.3))
      if (prog.current >= 1 && !done.current) {
        done.current = true
        onArrived()
      }
    }
  })
  return null
}

/** Red targeting reticle that locks onto the ER block front. */
function TargetReticle() {
  const ref = useRef<Group>(null)
  useFrame((s) => {
    if (!ref.current) return
    const pulse = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(s.clock.elapsedTime * 6))
    ref.current.traverse((o: any) => {
      if (o.material && 'opacity' in o.material) o.material.opacity = pulse
    })
  })
  const w = ER_INFO.w + 0.7
  const h = ER_INFO.h + 0.8
  const hw = w / 2
  const hh = h / 2
  const b = 0.55
  const corner = (sx: number, sy: number): [number, number, number][] => [
    [sx * (hw - b), sy * hh, 0],
    [sx * hw, sy * hh, 0],
    [sx * hw, sy * (hh - b), 0],
  ]
  return (
    <group ref={ref} position={[0, ER_INFO.y, ER_INFO.frontZ + 0.25]}>
      <Line
        points={[[-hw, -hh, 0], [hw, -hh, 0], [hw, hh, 0], [-hw, hh, 0], [-hw, -hh, 0]]}
        color={RETICLE_RED}
        lineWidth={1.5}
        transparent
      />
      {([[1, 1], [-1, 1], [-1, -1], [1, -1]] as const).map(([sx, sy], i) => (
        <Line key={i} points={corner(sx, sy)} color={RETICLE_RED} lineWidth={3.5} transparent />
      ))}
      <mesh>
        <ringGeometry args={[0.14, 0.19, 24]} />
        <meshBasicMaterial color={RETICLE_RED} transparent toneMapped={false} />
      </mesh>
    </group>
  )
}

function IntroView({ onEnter }: { onEnter: () => void }) {
  const [phase, setPhase] = useState<Phase>(() =>
    typeof window !== 'undefined' && window.location.hash === '#target' ? 'target' : 'orbit',
  )
  const [fade, setFade] = useState(0)

  const start = () => {
    setPhase('target')
    window.setTimeout(() => setPhase('fly'), 1500)
  }

  return (
    <>
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, toneMapping: NoToneMapping }}
        camera={{ position: [34, 18, 40], fov: 34 }}
      >
        <SceneEnvironment orb={false} dark />
        <BuildingStack />
        {phase !== 'orbit' && <TargetReticle />}
        {phase === 'orbit' && (
          <OrbitControls
            target={ORBIT_TARGET}
            enableDamping
            dampingFactor={0.08}
            autoRotate
            autoRotateSpeed={0.5}
            minDistance={20}
            maxDistance={95}
            maxPolarAngle={Math.PI / 2.05}
          />
        )}
        <FlyRig
          phase={phase}
          onFade={setFade}
          onArrived={() => {
            setFade(1)
            window.setTimeout(onEnter, 450)
          }}
        />
        <Postprocessing dark />
      </Canvas>

      <div className="overlay">
        <div style={{ position: 'absolute', top: 22, left: 22, ...panel }}>
          <div style={{ fontSize: 15, letterSpacing: 1.5, color: CText.teal, fontWeight: 800 }}>
            SENTIENT
          </div>
          <div style={{ fontSize: 11, color: AERO.inkDim, marginTop: 2 }}>
            hospital · live clinical ontology
          </div>
        </div>

        {phase !== 'orbit' && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -150px)',
              font: '800 13px ui-monospace, monospace',
              letterSpacing: 2,
              color: RETICLE_RED,
              textShadow: `0 0 12px ${RETICLE_RED}88`,
            }}
          >
            ▶ TARGET · EMERGENCY (ER)
          </div>
        )}

        {phase === 'orbit' && (
          <div style={{ position: 'absolute', bottom: 34, left: '50%', transform: 'translateX(-50%)' }}>
            <button style={enterBtn} onClick={start}>
              Enter ER →
            </button>
          </div>
        )}
      </div>

      {/* fade to light on arrival */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: '#cbd0d5',
          opacity: fade,
          pointerEvents: 'none',
          transition: 'opacity 0.25s linear',
          zIndex: 50,
        }}
      />
    </>
  )
}

export function App() {
  const [view, setView] = useState<'intro' | 'scene'>('intro')
  if (view === 'intro') return <IntroView onEnter={() => setView('scene')} />
  return (
    <>
      <SceneRoot />
      <Overlay />
    </>
  )
}
