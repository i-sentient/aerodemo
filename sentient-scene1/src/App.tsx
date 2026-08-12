import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Line, OrbitControls } from '@react-three/drei'
import { MathUtils, NoToneMapping, type Group } from 'three'
import { SceneEnvironment } from './scene/Environment'
import { Building } from './scene/Building'
import { RoundERLab } from './lab/RoundERLab'
import { CathLabScene } from './lab/CathLabScene'
import { ORScene } from './lab/ORScene'
import { BuildingStack, ER_INFO, ICU_INFO, CATH_INFO, OR_INFO, STEPDOWN_INFO, STACK_TOP, roomVol } from './scene/BuildingStack'
import { OntologyTower, OntologyPanels } from './scene/OntologyTower'
import { TransitAgentPanel } from './icu/TransitAgentPanel'
import { TarsTitle } from './scene/TarsTitle'
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
      camera={{ position: [0, 4.6, -14.5], fov: 49 }}
      onPointerMissed={() => setFocus(null)}
    >
      <SceneEnvironment />
      <EpisodePlayer />
      <Building />
      <RelationEdges />
      <PatientLayer />
      <OrderLayer />
      <HandoffLayer />
      {/* Land at the low, forward "flew-in through the doors" angle the dive
          ends on — looking down the ER. No auto-rotate: the view stays put. */}
      <OrbitControls
        target={[0, 1.1, 3.8]}
        enableDamping
        dampingFactor={0.08}
        minDistance={5}
        maxDistance={44}
        maxPolarAngle={Math.PI / 2.1}
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
const RETICLE_RED = '#ff3344'
const ORBIT_TARGET: [number, number, number] = [0, STACK_TOP * 0.45, 0]
// Hero elevation, straight-on. 45.5 rather than 51: the tower reads ~1.12x
// larger in frame, which is the framing the building was composed for. Done by
// moving the camera IN rather than narrowing the FOV, so it stays 34 everywhere
// and the dive (which lerps 34 -> 44) has nothing to jump over.
const FRONT_VIEW_POS: [number, number, number] = [0, 18, 45.5]
const FRONT_LOOK_Y = STACK_TOP * 0.45
// the ring the resumed walk-around runs on — the front view's own distance,
// so picking the turn back up cannot shift the tower's size in frame
const FRONT_R = Math.hypot(FRONT_VIEW_POS[0], FRONT_VIEW_POS[2])
const LOCK_POS: [number, number, number] = [0, ER_INFO.y + 2.8, 27]
const DIVE_POS: [number, number, number] = [0, ER_INFO.y + 0.2, ER_INFO.frontZ + 0.1]
// ICU return: pull out of the ER (start close on the ER tier) → reveal building
// → dive into the ICU drum → hand off to Scene-2
const ICU_RETURN_START: [number, number, number] = [0, ER_INFO.y + 3, ER_INFO.frontZ + 7]
// the IntroView orbit, in numbers: it opened at [34, 18, 40] looking at
// ORBIT_TARGET, so the ring is its horizontal distance and height
const ORBIT_R = Math.hypot(34, 40)
const ORBIT_H = 18
const ORBIT_RATE = 0.055 // rad/s ~= OrbitControls autoRotateSpeed 0.5
const ICU_LOCK_POS: [number, number, number] = [0, ICU_INFO.y + 2.8, 27]
const ICU_DIVE_POS: [number, number, number] = [0, ICU_INFO.y + 0.2, ICU_INFO.frontZ + 0.1]
// Cath return: after Scene-2 (ICU) ends we land back here (#cath-return). Start
// close on the ICU tier (as if stepping out of it) → reveal the whole tower →
// dive into the Cath Lab (the +x hex half of the imgcath level) → CathLabScene.
const CATH_RETURN_START: [number, number, number] = [0, ICU_INFO.y + 3, ICU_INFO.frontZ + 7]
const CATH_LOCK_POS: [number, number, number] = [CATH_INFO.x, CATH_INFO.y + 2.8, 24]
const CATH_DIVE_POS: [number, number, number] = [CATH_INFO.x, CATH_INFO.y + 0.2, CATH_INFO.frontZ + 0.1]
// OR transition: after the CABG decision (Scene 3 end) we step out of the ICU
// again → reveal the tower → dive into the theatres tier (OR-1, the −x half).
const OR_RETURN_START: [number, number, number] = [0, ICU_INFO.y + 3, ICU_INFO.frontZ + 7]
const OR_LOCK_POS: [number, number, number] = [OR_INFO.x, OR_INFO.y + 2.8, 24]
const OR_DIVE_POS: [number, number, number] = [OR_INFO.x, OR_INFO.y + 0.2, OR_INFO.frontZ + 0.1]
// Step-Down transfer: after POD 3 (Scene 4's ICU days end) we step out of the
// ICU one last time → reveal the tower → the thread draws its FINAL leg → hold
// on the wards tier as it individuates → dive into the +x Step-Down slab.
const STEP_RETURN_START: [number, number, number] = [0, ICU_INFO.y + 3, ICU_INFO.frontZ + 7]
const STEP_LOCK_POS: [number, number, number] = [STEPDOWN_INFO.x, STEPDOWN_INFO.y + 2.8, 24]
const STEP_DIVE_POS: [number, number, number] = [STEPDOWN_INFO.x, STEPDOWN_INFO.y + 0.2, STEPDOWN_INFO.frontZ + 0.1]
const lp = (a: number, b: number, t: number) => a + (b - a) * t
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

// ---------------------------------------------------------------------------
//  THE HOLD — the beat before every dive. The camera stops close on the tier it
//  is about to enter and that floor resolves from a count into its objects:
//  one cluster per occupied bed, each patient inside their own cage of devices.
//  You read the room as ontology, and THEN you go in.
//
//  Which floor each sequence is aimed at. The rooms are the same names the
//  journey thread routes through (census.ts JOURNEY), so the hero bed the hold
//  picks out is the same bed the thread already threads.
// ---------------------------------------------------------------------------
const FOCUS = {
  er: { floorId: 'er', room: 'Emergency' },
  icu: { floorId: 'icu', room: 'ICU' },
  cath: { floorId: 'imgcath', room: 'Cath Lab' },
  or: { floorId: 'theatres', room: 'OR1' },
  stepdown: { floorId: 'wards', room: 'Step-Down' },
} as const

/** Framing for the hold, derived from the block's OWN geometry so it can't
 *  drift from the building: standoff scales with the mass, and the camera sits
 *  ~20° above it — high enough to read the floor's cluster layout in plan,
 *  shallow enough to still see the device cages standing up off the beds. */
function holdShot(f: { floorId: string; room?: string }) {
  const { v, b } = roomVol(f.floorId, f.room)!
  const round = b.shape === 'drum' || b.shape === 'crown' || b.shape === 'hex'
  const depth = round ? b.r : b.halfD
  const reach = round ? b.r : b.halfW
  const standoff = depth + reach * 1.3 + 3
  return {
    pos: [b.x, v.y + standoff * 0.36, standoff] as [number, number, number],
    look: [b.x, v.y - v.h * 0.12, 0] as [number, number, number],
  }
}
const HOLD = {
  er: holdShot(FOCUS.er),
  icu: holdShot(FOCUS.icu),
  cath: holdShot(FOCUS.cath),
  or: holdShot(FOCUS.or),
  stepdown: holdShot(FOCUS.stepdown),
}

/** ease the camera onto a fixed shot — the hold is the same move in all four
 *  sequences, so it is written once here rather than four times in the rigs */
function dampTo(cam: any, s: { pos: [number, number, number]; look: [number, number, number] }, dt: number) {
  cam.position.x = MathUtils.damp(cam.position.x, s.pos[0], 1.9, dt)
  cam.position.y = MathUtils.damp(cam.position.y, s.pos[1], 1.9, dt)
  cam.position.z = MathUtils.damp(cam.position.z, s.pos[2], 1.9, dt)
  cam.fov = MathUtils.damp(cam.fov, 30, 2.4, dt)
  cam.updateProjectionMatrix()
  cam.lookAt(s.look[0], s.look[1], s.look[2])
}

type Phase = 'orbit' | 'front' | 'onto' | 'hold' | 'target' | 'fly'

/** Drives the camera through the target-lock + dive; calls onArrived at the end. */
function FlyRig({
  phase,
  onArrived,
}: {
  phase: Phase
  onArrived: () => void
}) {
  const prog = useRef(0)
  const done = useRef(false)
  useFrame((state, dt) => {
    const cam = state.camera as any
    if (phase === 'front' || phase === 'onto') {
      cam.position.x = MathUtils.damp(cam.position.x, FRONT_VIEW_POS[0], 2.4, dt)
      cam.position.y = MathUtils.damp(cam.position.y, FRONT_VIEW_POS[1], 2.4, dt)
      cam.position.z = MathUtils.damp(cam.position.z, FRONT_VIEW_POS[2], 2.4, dt)
      cam.fov = MathUtils.damp(cam.fov, 34, 3, dt)
      cam.updateProjectionMatrix()
      cam.lookAt(0, FRONT_LOOK_Y, 0)
    } else if (phase === 'hold') {
      dampTo(cam, HOLD.er, dt)
    } else if (phase === 'target') {
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
      cam.fov = lp(34, 44, p)
      cam.updateProjectionMatrix()
      cam.lookAt(0, ER_INFO.y, 0)
      // cut ~0.20s before the 1.9s dive completes (stop just short of the plunge)
      if (prog.current >= 0.895 && !done.current) {
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

// ---------------------------------------------------------------------------
//  ONTOLOGY MODE — shared by every view that shows the tower (the intro and all
//  three between-scene returns). The solid pavilion dissolves into what TARS
//  actually holds: each tier classified, counted and scored for provenance.
//  The switch is a fluorescent tube striking — the building swaps during the
//  first dark, so it reads as a fixture powering on, not a cut.
// ---------------------------------------------------------------------------
/** `initial` matters: a view that opens ALREADY in ontology mode must say so
 *  at construction, not in an effect. Setting it post-mount let the very
 *  first frame render the solid BuildingStack before the swap — a one-frame
 *  flash of the solid tower on the way out of the ER. */
function useOntologyMode(initial = false) {
  const [onto, setOnto] = useState(initial)
  const [strike, setStrike] = useState(0)
  const switching = useRef(false)
  const run = useRef((next: boolean) => {})
  run.current = (next: boolean) => {
    if (switching.current || next === onto) return
    switching.current = true
    setStrike((n) => n + 1)
    window.setTimeout(() => setOnto(next), 70) // swap inside the first dark
    window.setTimeout(() => { switching.current = false }, 420)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyO') { e.preventDefault(); run.current(!onto) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onto])
  return {
    onto,
    strike,
    toggle: () => run.current(!onto),
    /** drive it explicitly — the dive sequences turn it ON before plunging */
    setOnto: (v: boolean) => run.current(v),
  }
}

/** The [O] switch + the tube-strike cover. Fixed-positioned so it works in any
 *  view regardless of what wraps the canvas. */
function OntologyChrome({ strike }: { strike: number }) {
  // The [O] button is gone — the mode is driven by the keyboard and by the
  // dive sequences, so the on-screen toggle was clutter in the top-right where
  // the hospital card now lives. The tube-strike cover stays: it is the visible
  // "fixture powering on" that sells the swap into ontology mode.
  return strike > 0 ? (
    <div key={strike} className="tube-strike" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 50, background: '#050c13' }} />
  ) : null
}

function IntroView({ onEnter }: { onEnter: () => void }) {
  const [phase, setPhase] = useState<Phase>('orbit')
  const { onto, strike, toggle: toggleOnto, setOnto } = useOntologyMode()
  const phaseRef = useRef<Phase>('orbit')
  phaseRef.current = phase

  // → / Space starts the dive into the ER (O is handled by useOntologyMode)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'ArrowRight' && e.code !== 'Space') return
      e.preventDefault()
      const p = phaseRef.current
      // the dive is now three beats: read the building as ontology, hold close
      // while the floor individuates into care units, THEN go in
      if (p === 'orbit') setPhase('front')
      else if (p === 'front') { setOnto(true); setPhase('onto') }
      else if (p === 'onto') setPhase('hold')
      else if (p === 'hold') {
        setPhase('target')
        window.setTimeout(() => setPhase('fly'), 1500)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, toneMapping: NoToneMapping }}
        camera={{ position: [34, 18, 40], fov: 34 }}
      >
        <SceneEnvironment orb={false} dark onto={onto} />
        {onto ? <OntologyTower focus={FOCUS.er} open={phase === 'hold'} tags={phase === 'onto'} labels={phase !== 'fly' && phase !== 'target'} /> : <BuildingStack showPills={phase === 'front' || phase === 'target'} />}
        {phase === 'orbit' && (
          <OrbitControls
            target={ORBIT_TARGET}
            enableDamping
            dampingFactor={0.08}
            // Keeps turning in ontology mode too. It used to stop, because the
            // labels are pinned to fixed sides of the building (census left,
            // journey right) and orbiting swings them around it — but a tower
            // that freezes the moment you switch to ontology reads as broken,
            // and that costs more than the labels do.
            autoRotate
            autoRotateSpeed={0.5}
            minDistance={20}
            maxDistance={95}
            maxPolarAngle={Math.PI / 2.05}
          />
        )}
        <FlyRig phase={phase} onArrived={onEnter} />
        <Postprocessing dark />
      </Canvas>

      <OntologyChrome strike={strike} />
      <OntologyPanels showTotals={onto && phase !== 'hold' && phase !== 'target' && phase !== 'fly'} showTags={onto && phase === 'onto'} showJourney={false} />

      <div className="overlay">
        {/* Dark glass, not the light `panel`: this sits on the near-black
            ontology hall, where the frosted-white panel washed out to nothing.
            Bright cyan title + pale subtitle read cleanly on the dark. */}
        <div
          style={{
            position: 'absolute', top: 22, right: 22, textAlign: 'right',
            background: 'rgba(6,14,20,0.72)',
            border: '1px solid rgba(95,208,230,0.42)',
            borderRadius: 12, padding: '12px 16px',
            backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
            boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
          }}
        >
          <div style={{ fontSize: 15, letterSpacing: 1.5, color: '#7de3f5', fontWeight: 800 }}>
            SENTIENT HOSPITAL
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', marginTop: 5, fontSize: 11, color: 'rgba(190,235,245,0.75)' }}>
            <span className="pulse-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: '#2EE6A6', boxShadow: '0 0 6px #2EE6A6', flex: '0 0 auto' }} />
            <span style={{ letterSpacing: 1.5 }}>Live Clinical Ontology</span>
            <span className="pulse-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: '#2EE6A6', boxShadow: '0 0 6px #2EE6A6', flex: '0 0 auto' }} />
          </div>
        </div>

      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
//  ICU RETURN — after the ER story ends (TARS→ICU), pull back out of the ER to
//  reveal the whole tower, then dive into the ICU drum and hand off to Scene-2.
// ---------------------------------------------------------------------------
// 'erplot' is the first stop coming out of the ER: the tower focused on the
// ER tier, its own assets plotted. It used to live in IntroView, which the
// ride no longer visits now that it opens inside the ER — so without this
// the pull-out jumped straight to the solid building and the ER's own
// ontology beat was lost.
// 'plan' is the building turning to blueprint — the census reads, but the
// journey thread is NOT drawn yet. It is the state the old IntroView showed
// at its own `onto`, which never passed `journey` at all.
// 'orbit' is the walk-around the old IntroView opened on: the building back
// in the solid, seen whole, turning slowly — restored here between the ER
// plot and the settled front view.
// 'tars' / 'tarsx' are the agent title card, two beats like its siblings in
// the deck. It stands AFTER the hospital ontology and BEFORE the thread: the
// building has to have been shown before the thing that acts on it is named.
type IcuPhase = 'erplot' | 'orbit' | 'reveal' | 'plan' | 'tars' | 'tarsx' | 'onto' | 'hold' | 'target' | 'fly'

/**
 * The resumed walk-around, shared by every rig that shows the whole tower.
 *
 * Each of them settles the camera onto the front view for the pills beat and
 * used to stay there for the rest of the read — a tower that freezes the moment
 * you start reading it looks broken, which is the same reason IntroView was
 * always allowed to keep auto-rotating in ontology mode.
 *
 * `step` resumes from wherever the settle left the camera and eases the angular
 * rate in, so the building never snaps into motion, and it runs on FRONT_R —
 * the front view's own distance — so picking the turn back up cannot change the
 * tower's size in frame. `reset` drops the seed whenever the turning beats are
 * not live, so re-entering from a later scene starts from the live camera
 * rather than a stale angle.
 *
 * Written once on purpose: the five rigs are otherwise byte-identical blocks,
 * and a fifth copy of this is a fifth thing to forget when one of them changes.
 */
function useResumedTurn() {
  const ang = useRef<number | null>(null)
  const ease = useRef(0)
  const from = useRef<[number, number]>([0, 0])
  const reset = () => { ang.current = null }
  const step = (cam: any, dt: number) => {
    if (ang.current === null) {
      ang.current = Math.atan2(cam.position.x, cam.position.z)
      ease.current = 0
      from.current = [Math.hypot(cam.position.x, cam.position.z), cam.position.y]
    }
    ease.current = Math.min(1, ease.current + dt / 1.6)
    const e = easeInOut(ease.current)
    ang.current += dt * ORBIT_RATE * e
    const r = lp(from.current[0], FRONT_R, e)
    const h = lp(from.current[1], FRONT_VIEW_POS[1], e)
    cam.position.set(Math.sin(ang.current) * r, h, Math.cos(ang.current) * r)
    cam.fov = MathUtils.damp(cam.fov, 34, 2, dt)
    cam.updateProjectionMatrix()
    cam.lookAt(0, FRONT_LOOK_Y, 0)
  }
  return { reset, step }
}

/** Reveal the building, then dive into the ICU; calls onArrived at the cut. */
function IcuRig({ phase, onArrived }: { phase: IcuPhase; onArrived: () => void }) {
  const prog = useRef(0)
  const done = useRef(false)
  const ang = useRef<number | null>(null)   // seeded on the first orbit frame
  const pull = useRef(0)                    // 0..1 through the pull-back
  const pullFrom = useRef<[number, number, number]>([0, 0, 0])
  const turn = useResumedTurn()
  useFrame((state, dt) => {
    const cam = state.camera as any
    if (phase !== 'plan' && phase !== 'tars' && phase !== 'tarsx' && phase !== 'onto') turn.reset()
    if (phase === 'erplot') {
      // the ER's own plot, framed off the ER block rather than the ICU's
      dampTo(cam, HOLD.er, dt)
    } else if (phase === 'orbit') {
      // A SCRIPTED pull-back, like the dives — not a damp. Damping position
      // while snapping the look-target from the ER tier to the tower's
      // midpoint whipped the frame on the first press and then drifted.
      // Here position AND look are eased together from where the ER plot
      // left them out to the orbit ring, and the turn's angular rate builds
      // with the same ease, so the walk-around inherits its motion from the
      // pull instead of starting under it.
      if (ang.current === null) {
        ang.current = Math.atan2(cam.position.x, cam.position.z)
        pull.current = 0
        pullFrom.current = [cam.position.x, cam.position.y, cam.position.z]
      }
      pull.current = Math.min(1, pull.current + dt / 2.6)
      const e = easeInOut(pull.current)
      ang.current += dt * ORBIT_RATE * e
      const rx = Math.sin(ang.current) * ORBIT_R
      const rz = Math.cos(ang.current) * ORBIT_R
      cam.position.set(
        lp(pullFrom.current[0], rx, e),
        lp(pullFrom.current[1], ORBIT_H, e),
        lp(pullFrom.current[2], rz, e),
      )
      cam.fov = MathUtils.damp(cam.fov, 34, 2, dt)
      cam.updateProjectionMatrix()
      cam.lookAt(
        lp(HOLD.er.look[0], ORBIT_TARGET[0], e),
        lp(HOLD.er.look[1], ORBIT_TARGET[1], e),
        lp(HOLD.er.look[2], ORBIT_TARGET[2], e),
      )
    } else if (phase === 'reveal') {
      // the ONE still beat: the turn settles onto the front so the floor pills
      // can be read off a stationary building
      cam.position.x = MathUtils.damp(cam.position.x, FRONT_VIEW_POS[0], 1.5, dt)
      cam.position.y = MathUtils.damp(cam.position.y, FRONT_VIEW_POS[1], 1.5, dt)
      cam.position.z = MathUtils.damp(cam.position.z, FRONT_VIEW_POS[2], 1.5, dt)
      cam.fov = MathUtils.damp(cam.fov, 34, 2, dt)
      cam.updateProjectionMatrix()
      cam.lookAt(0, FRONT_LOOK_Y, 0)
    } else if (phase === 'plan' || phase === 'onto') {
      turn.step(cam, dt)
    } else if (phase === 'tars' || phase === 'tarsx') {
      // FROZEN behind the TARS card, deliberately. It used to keep turning so
      // the tower was already in motion when the card lifted, but that means
      // coming back to a building that moved while you were reading — and the
      // longer the card is held, the further it has gone. No branch touches the
      // camera here, and the turn's seed is NOT reset, so `onto` picks up from
      // the same angle at full rate rather than easing in a second time.
    } else if (phase === 'hold') {
      dampTo(cam, HOLD.icu, dt)
    } else if (phase === 'target') {
      cam.position.x = MathUtils.damp(cam.position.x, ICU_LOCK_POS[0], 2.2, dt)
      cam.position.y = MathUtils.damp(cam.position.y, ICU_LOCK_POS[1], 2.2, dt)
      cam.position.z = MathUtils.damp(cam.position.z, ICU_LOCK_POS[2], 2.2, dt)
      cam.fov = MathUtils.damp(cam.fov, 34, 3, dt)
      cam.updateProjectionMatrix()
      cam.lookAt(0, ICU_INFO.y, 0)
    } else if (phase === 'fly') {
      prog.current = Math.min(1, prog.current + dt / 1.9)
      const p = easeInOut(prog.current)
      cam.position.set(
        lp(ICU_LOCK_POS[0], ICU_DIVE_POS[0], p),
        lp(ICU_LOCK_POS[1], ICU_DIVE_POS[1], p),
        lp(ICU_LOCK_POS[2], ICU_DIVE_POS[2], p),
      )
      cam.fov = lp(34, 44, p)
      cam.updateProjectionMatrix()
      cam.lookAt(0, ICU_INFO.y, 0)
      // cut ~0.2s before the plunge, then hand off to Scene-2
      if (prog.current >= 0.895 && !done.current) {
        done.current = true
        onArrived()
      }
    }
  })
  return null
}

function IcuReturnView({ onDone, segment = 'full' }: { onDone: () => void; segment?: 'atlas' | 'transfer' | 'full' }) {
  // 'atlas'    · ER plot → building → blueprint/ATLAS → the TARS card, then
  //              onDone — the story goes BACK to the ER before any thread
  // 'transfer' · opens on the thread (journey to the ICU) → lock → dive
  // 'full'     · the original ride, kept for dev deep links
  const [phase, setPhase] = useState<IcuPhase>(segment === 'transfer' ? 'onto' : 'erplot')
  const { onto, strike, toggle: toggleOnto, setOnto } = useOntologyMode(true)
  const phaseRef = useRef<IcuPhase>('erplot')
  phaseRef.current = phase
  // The SOLID-BUILDING beats. `onto` does go false for these, but not
  // instantly: useOntologyMode's setter routes through the strike animation
  // and only flips 70 ms later. In that window the phase has already changed
  // while `onto` is still true — long enough for the ATLAS panel and the
  // journey caption to begin their fade-in and be snatched back, which is the
  // flash on every pull-back. Gating on the PHASE too makes the race invisible.
  const solidBeat = phase === 'orbit' || phase === 'reveal'
  // While TARS has the left side, ATLAS steps off it. Introducing the agent
  // panel against a hospital census competes for the same read, and a census is
  // the wrong thing to be looking at during a transfer anyway — nobody is in a
  // room. The journey caption on the right stays: it is the patient moving,
  // which is the one thing this beat IS.
  // The panel waits for the DOT. It arrives on his arrival, not on the beat's:
  // sliding in while the thread was still drawing meant TARS was reporting a
  // bed held for a patient who had not got there yet, and it read as a caption
  // over the animation rather than as something happening because of it.
  const [threadSettled, setThreadSettled] = useState(false)
  useEffect(() => { if (phase !== 'onto') setThreadSettled(false) }, [phase])
  const transit = segment === 'transfer' && phase === 'onto' && threadSettled
  // Everything before the thread exists — now including the pull-back and the
  // reveal, so the transfer can never arm itself while the tower is solid.
  const preThread = solidBeat || phase === 'erplot' || phase === 'plan' || phase === 'tars' || phase === 'tarsx'
  // The transfer has to draw on HIS cue. Mounting it the instant the phase
  // flips meant it drew UNDER the TARS card while that faded, so by the time
  // the tower was visible the thread had already arrived. Arm it only once the
  // card is genuinely gone.
  const [threadArmed, setThreadArmed] = useState(false)
  useEffect(() => {
    if (preThread) { setThreadArmed(false); return }
    const t = window.setTimeout(() => setThreadArmed(true), 580)   // the card's .55s fade + a frame
    return () => window.clearTimeout(t)
  }, [preThread])
  const segmentRef = useRef(segment)
  segmentRef.current = segment
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone
  // (ontology mode is seeded at construction — see useOntologyMode's note)
  // → / Space: (once the building is revealed) dive into the ICU
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'ArrowRight' && e.code !== 'Space') return
      e.preventDefault()
      const p = phaseRef.current
      // ER plot -> the solid building -> the blueprint with the thread
      // solid again, pulled back to the whole building, slowly turning
      if (p === 'erplot') { setOnto(false); setPhase('orbit'); return }
      // the turn settles onto the front and the floor pills come up
      if (p === 'orbit') { setPhase('reveal'); return }
      // the solid building converts to blueprint...
      if (p === 'reveal') { setOnto(true); setPhase('plan'); return }
      // name the agent that works the building...
      if (p === 'plan') { setPhase('tars'); return }
      if (p === 'tars') { setPhase('tarsx'); return }
      // ...and then: in the split ride the TARS card is the ATLAS half's LAST
      // page — the story returns to the ER for the inbound before any thread
      if (p === 'tarsx') {
        if (segmentRef.current === 'atlas') { queueMicrotask(() => onDoneRef.current?.()) }
        else setPhase('onto')
        return
      }
      // hold close on the tier first — it individuates into care units — and
      // only then lock the reticle and plunge
      if (p === 'onto') { setPhase('hold'); return }
      if (p !== 'hold') return
      setPhase('target')
      window.setTimeout(() => setPhase('fly'), 1500)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <>
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, toneMapping: NoToneMapping }}
      camera={{ position: ICU_RETURN_START, fov: 40 }}
    >
      <SceneEnvironment orb={false} dark onto={onto} />
      {onto ? <OntologyTower
          // 0 at the ER plot — he has only just arrived, so the leg up to
          // the ICU has not happened yet and drawing it gives away the
          // next beat. It advances to 1 the moment the building appears.
          journey={preThread || !threadArmed ? 0 : 1}
          onJourneySettled={() => setThreadSettled(true)}
          focus={phase === 'erplot' ? FOCUS.er : FOCUS.icu} open={phase === 'hold' || phase === 'erplot'} tags={phase === 'plan'} handedOff={phase === 'hold' || phase === 'target' || phase === 'fly'} labels={phase !== 'fly' && phase !== 'target'} /> : <BuildingStack showPills={phase === 'reveal'} />}
      <IcuRig phase={phase} onArrived={onDone} />
      <Postprocessing dark />
    </Canvas>
    <OntologyChrome strike={strike} />
    <TarsTitle show={phase === 'tars' || phase === 'tarsx'} expanded={phase === 'tarsx'} />
    {/* the ward's own agent panel, docked over the tower while he is between
        rooms — see TransitAgentPanel for why it is the same component */}
    {segment === 'transfer' && <TransitAgentPanel phase={phase} armed={threadSettled} />}
    <OntologyPanels showTotals={onto && !transit && !solidBeat && phase !== 'hold' && phase !== 'erplot' && phase !== 'tars' && phase !== 'tarsx' && phase !== 'target' && phase !== 'fly'} showTags={onto && phase === 'plan'} showJourney={onto && !solidBeat && phase !== 'erplot' && phase !== 'plan' && phase !== 'tars' && phase !== 'tarsx' && phase !== 'hold' && phase !== 'target' && phase !== 'fly'} scope={phase === 'erplot' || phase === 'plan' ? null : 'icu'} />
    </>
  )
}

// ---------------------------------------------------------------------------
//  CATH RETURN — after Scene-2 (the ICU story) ends, we return here via the
//  #cath-return hash. Step out of the ICU → reveal the whole tower → dive into
//  the Cath Lab tier (the +x hex half) → hard-cut into the CathLabScene.
// ---------------------------------------------------------------------------
type CathPhase = 'reveal' | 'onto' | 'hold' | 'target' | 'fly'

/** Reveal the building, then dive into the Cath Lab; calls onArrived at the cut. */
function CathRig({ phase, onArrived }: { phase: CathPhase; onArrived: () => void }) {
  const prog = useRef(0)
  const done = useRef(false)
  const turn = useResumedTurn()
  useFrame((state, dt) => {
    const cam = state.camera as any
    if (phase !== 'onto') turn.reset()
    if (phase === 'reveal') {
      // the one still beat: the turn settles onto the front so the floor pills
      // read off a stationary building
      cam.position.x = MathUtils.damp(cam.position.x, FRONT_VIEW_POS[0], 1.5, dt)
      cam.position.y = MathUtils.damp(cam.position.y, FRONT_VIEW_POS[1], 1.5, dt)
      cam.position.z = MathUtils.damp(cam.position.z, FRONT_VIEW_POS[2], 1.5, dt)
      cam.fov = MathUtils.damp(cam.fov, 34, 2, dt)
      cam.updateProjectionMatrix()
      cam.lookAt(0, FRONT_LOOK_Y, 0)
    } else if (phase === 'onto') {
      turn.step(cam, dt)
    } else if (phase === 'hold') {
      dampTo(cam, HOLD.cath, dt)
    } else if (phase === 'target') {
      cam.position.x = MathUtils.damp(cam.position.x, CATH_LOCK_POS[0], 2.2, dt)
      cam.position.y = MathUtils.damp(cam.position.y, CATH_LOCK_POS[1], 2.2, dt)
      cam.position.z = MathUtils.damp(cam.position.z, CATH_LOCK_POS[2], 2.2, dt)
      cam.fov = MathUtils.damp(cam.fov, 34, 3, dt)
      cam.updateProjectionMatrix()
      cam.lookAt(CATH_INFO.x, CATH_INFO.y, 0)
    } else if (phase === 'fly') {
      prog.current = Math.min(1, prog.current + dt / 1.9)
      const p = easeInOut(prog.current)
      cam.position.set(
        lp(CATH_LOCK_POS[0], CATH_DIVE_POS[0], p),
        lp(CATH_LOCK_POS[1], CATH_DIVE_POS[1], p),
        lp(CATH_LOCK_POS[2], CATH_DIVE_POS[2], p),
      )
      cam.fov = lp(34, 44, p)
      cam.updateProjectionMatrix()
      cam.lookAt(CATH_INFO.x, CATH_INFO.y, 0)
      // cut ~0.2s before the plunge, then hand off to the CathLabScene
      if (prog.current >= 0.895 && !done.current) {
        done.current = true
        onArrived()
      }
    }
  })
  return null
}

function CathReturnView({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<CathPhase>('reveal')
  const { onto, strike, toggle: toggleOnto, setOnto } = useOntologyMode()
  const phaseRef = useRef<CathPhase>('reveal')
  phaseRef.current = phase
  // → / Space: (once the building is revealed) dive into the Cath Lab
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'ArrowRight' && e.code !== 'Space') return
      e.preventDefault()
      const p = phaseRef.current
      if (p === 'reveal') { setOnto(true); setPhase('onto'); return }
      // hold close on the tier first — it individuates into care units — and
      // only then lock the reticle and plunge
      if (p === 'onto') { setPhase('hold'); return }
      if (p !== 'hold') return
      setPhase('target')
      window.setTimeout(() => setPhase('fly'), 1500)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <>
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, toneMapping: NoToneMapping }}
      camera={{ position: CATH_RETURN_START, fov: 40 }}
    >
      <SceneEnvironment orb={false} dark onto={onto} />
      {onto ? <OntologyTower journey={2} focus={FOCUS.cath} open={phase === 'hold'} tags={false} handedOff={phase === 'hold' || phase === 'target' || phase === 'fly'} labels={phase !== 'fly' && phase !== 'target'} /> : <BuildingStack showPills={phase === 'reveal'} keepPill="cath" />}
      <CathRig phase={phase} onArrived={onDone} />
      <Postprocessing dark />
    </Canvas>
    <OntologyChrome strike={strike} />
    <OntologyPanels showTotals={onto && phase !== 'hold' && phase !== 'target' && phase !== 'fly'} showTags={false} showJourney={onto && phase !== 'hold' && phase !== 'target' && phase !== 'fly'} scope="imgcath" />
    </>
  )
}

// ---------------------------------------------------------------------------
//  OR RETURN — after the CABG decision (Scene 3), step out of the ICU, reveal
//  the tower, dive into the theatres tier (OR-1) → the operating theatre.
// ---------------------------------------------------------------------------
type OrPhase = 'reveal' | 'onto' | 'hold' | 'target' | 'fly'

function ORRig({ phase, onArrived }: { phase: OrPhase; onArrived: () => void }) {
  const prog = useRef(0)
  const done = useRef(false)
  const turn = useResumedTurn()
  useFrame((state, dt) => {
    const cam = state.camera as any
    if (phase !== 'onto') turn.reset()
    if (phase === 'reveal') {
      // the one still beat: the turn settles onto the front so the floor pills
      // read off a stationary building
      cam.position.x = MathUtils.damp(cam.position.x, FRONT_VIEW_POS[0], 1.5, dt)
      cam.position.y = MathUtils.damp(cam.position.y, FRONT_VIEW_POS[1], 1.5, dt)
      cam.position.z = MathUtils.damp(cam.position.z, FRONT_VIEW_POS[2], 1.5, dt)
      cam.fov = MathUtils.damp(cam.fov, 34, 2, dt)
      cam.updateProjectionMatrix()
      cam.lookAt(0, FRONT_LOOK_Y, 0)
    } else if (phase === 'onto') {
      turn.step(cam, dt)
    } else if (phase === 'hold') {
      dampTo(cam, HOLD.or, dt)
    } else if (phase === 'target') {
      cam.position.x = MathUtils.damp(cam.position.x, OR_LOCK_POS[0], 2.2, dt)
      cam.position.y = MathUtils.damp(cam.position.y, OR_LOCK_POS[1], 2.2, dt)
      cam.position.z = MathUtils.damp(cam.position.z, OR_LOCK_POS[2], 2.2, dt)
      cam.fov = MathUtils.damp(cam.fov, 34, 3, dt)
      cam.updateProjectionMatrix()
      cam.lookAt(OR_INFO.x, OR_INFO.y, 0)
    } else if (phase === 'fly') {
      prog.current = Math.min(1, prog.current + dt / 1.9)
      const p = easeInOut(prog.current)
      cam.position.set(
        lp(OR_LOCK_POS[0], OR_DIVE_POS[0], p),
        lp(OR_LOCK_POS[1], OR_DIVE_POS[1], p),
        lp(OR_LOCK_POS[2], OR_DIVE_POS[2], p),
      )
      cam.fov = lp(34, 44, p)
      cam.updateProjectionMatrix()
      cam.lookAt(OR_INFO.x, OR_INFO.y, 0)
      // cut ~0.2s before the plunge, then hard-cut into the theatre
      if (prog.current >= 0.895 && !done.current) {
        done.current = true
        onArrived()
      }
    }
  })
  return null
}

function ORReturnView({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<OrPhase>('reveal')
  const { onto, strike, toggle: toggleOnto, setOnto } = useOntologyMode()
  const phaseRef = useRef<OrPhase>('reveal')
  phaseRef.current = phase
  // → / Space: (once the building is revealed) dive into the OR
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'ArrowRight' && e.code !== 'Space') return
      e.preventDefault()
      const p = phaseRef.current
      if (p === 'reveal') { setOnto(true); setPhase('onto'); return }
      // hold close on the tier first — it individuates into care units — and
      // only then lock the reticle and plunge
      if (p === 'onto') { setPhase('hold'); return }
      if (p !== 'hold') return
      setPhase('target')
      window.setTimeout(() => setPhase('fly'), 1500)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <>
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, toneMapping: NoToneMapping }}
      camera={{ position: OR_RETURN_START, fov: 40 }}
    >
      <SceneEnvironment orb={false} dark onto={onto} />
      {onto ? <OntologyTower journey={3} focus={FOCUS.or} open={phase === 'hold'} tags={false} handedOff={phase === 'hold' || phase === 'target' || phase === 'fly'} labels={phase !== 'fly' && phase !== 'target'} /> : <BuildingStack showPills={phase === 'reveal'} keepPill="or" />}
      <ORRig phase={phase} onArrived={onDone} />
      <Postprocessing dark />
    </Canvas>
    <OntologyChrome strike={strike} />
    <OntologyPanels showTotals={onto && phase !== 'hold' && phase !== 'target' && phase !== 'fly'} showTags={false} showJourney={onto && phase !== 'hold' && phase !== 'target' && phase !== 'fly'} scope="theatres" />
    </>
  )
}

// ---------------------------------------------------------------------------
//  STEP-DOWN TRANSFER — after POD 3 (Scene 4's ICU days), he leaves the unit
//  for the last time. Step out of the ICU → reveal the tower → the journey
//  thread draws its FINAL leg → hold on the wards tier while it individuates
//  into care units → dive into the +x Step-Down slab → POD 4 plays there.
// ---------------------------------------------------------------------------
type StepPhase = 'reveal' | 'onto' | 'hold' | 'target' | 'fly'

function StepDownRig({ phase, onArrived }: { phase: StepPhase; onArrived: () => void }) {
  const prog = useRef(0)
  const done = useRef(false)
  const turn = useResumedTurn()
  useFrame((state, dt) => {
    const cam = state.camera as any
    if (phase !== 'onto') turn.reset()
    if (phase === 'reveal') {
      // the one still beat: the turn settles onto the front so the floor pills
      // read off a stationary building
      cam.position.x = MathUtils.damp(cam.position.x, FRONT_VIEW_POS[0], 1.5, dt)
      cam.position.y = MathUtils.damp(cam.position.y, FRONT_VIEW_POS[1], 1.5, dt)
      cam.position.z = MathUtils.damp(cam.position.z, FRONT_VIEW_POS[2], 1.5, dt)
      cam.fov = MathUtils.damp(cam.fov, 34, 2, dt)
      cam.updateProjectionMatrix()
      cam.lookAt(0, FRONT_LOOK_Y, 0)
    } else if (phase === 'onto') {
      turn.step(cam, dt)
    } else if (phase === 'hold') {
      dampTo(cam, HOLD.stepdown, dt)
    } else if (phase === 'target') {
      cam.position.x = MathUtils.damp(cam.position.x, STEP_LOCK_POS[0], 2.2, dt)
      cam.position.y = MathUtils.damp(cam.position.y, STEP_LOCK_POS[1], 2.2, dt)
      cam.position.z = MathUtils.damp(cam.position.z, STEP_LOCK_POS[2], 2.2, dt)
      cam.fov = MathUtils.damp(cam.fov, 34, 3, dt)
      cam.updateProjectionMatrix()
      cam.lookAt(STEPDOWN_INFO.x, STEPDOWN_INFO.y, 0)
    } else if (phase === 'fly') {
      prog.current = Math.min(1, prog.current + dt / 1.9)
      const p = easeInOut(prog.current)
      cam.position.set(
        lp(STEP_LOCK_POS[0], STEP_DIVE_POS[0], p),
        lp(STEP_LOCK_POS[1], STEP_DIVE_POS[1], p),
        lp(STEP_LOCK_POS[2], STEP_DIVE_POS[2], p),
      )
      cam.fov = lp(34, 44, p)
      cam.updateProjectionMatrix()
      cam.lookAt(STEPDOWN_INFO.x, STEPDOWN_INFO.y, 0)
      // cut ~0.2s before the plunge, then hard-cut into the ward (POD 4)
      if (prog.current >= 0.895 && !done.current) {
        done.current = true
        onArrived()
      }
    }
  })
  return null
}

function StepDownReturnView({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<StepPhase>('reveal')
  const { onto, strike, setOnto } = useOntologyMode()
  const phaseRef = useRef<StepPhase>('reveal')
  phaseRef.current = phase
  // → / Space: (once the building is revealed) dive into Step-Down
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'ArrowRight' && e.code !== 'Space') return
      e.preventDefault()
      const p = phaseRef.current
      if (p === 'reveal') { setOnto(true); setPhase('onto'); return }
      // hold close on the wards tier first — it individuates into care units —
      // and only then lock the reticle and plunge
      if (p === 'onto') { setPhase('hold'); return }
      if (p !== 'hold') return
      setPhase('target')
      window.setTimeout(() => setPhase('fly'), 1500)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <>
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, toneMapping: NoToneMapping }}
      camera={{ position: STEP_RETURN_START, fov: 40 }}
    >
      <SceneEnvironment orb={false} dark onto={onto} />
      {/* journey={4}: the thread completes — all five stops, ending on this tier */}
      {onto ? <OntologyTower journey={4} focus={FOCUS.stepdown} open={phase === 'hold'} tags={false} handedOff={phase === 'hold' || phase === 'target' || phase === 'fly'} labels={phase !== 'fly' && phase !== 'target'} /> : <BuildingStack showPills={phase === 'reveal'} />}
      <StepDownRig phase={phase} onArrived={onDone} />
      <Postprocessing dark />
    </Canvas>
    <OntologyChrome strike={strike} />
    <OntologyPanels showTotals={onto && phase !== 'hold' && phase !== 'target' && phase !== 'fly'} showTags={false} showJourney={onto && phase !== 'hold' && phase !== 'target' && phase !== 'fly'} scope="wards" />
    </>
  )
}

// ---------------------------------------------------------------------------
//  ICU FRAME — the TARS ICU story, embedded as a same-origin iframe so its
//  vanilla-JS app gets a fresh document each time (no module-singleton clashes
//  across the two chapters). The chapter is chosen by the query param; the
//  'workup' chapter posts 'icu:finished' when its patient story ends.
// ---------------------------------------------------------------------------
function IcuFrame({ chapter, onFinished }: { chapter: 'workup' | 'continued' | 'postop' | 'stepdown'; onFinished?: () => void }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'icu:finished') onFinished?.()
      if (e.data?.type === 'icu:ready') setReady(true) // drop the loader the instant the app is up
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [onFinished])
  // safety net if the ready signal never arrives (e.g. rAF paused in a hidden tab)
  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 4000)
    return () => window.clearTimeout(t)
  }, [])
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(1200px 900px at 50% 20%, #ffffff 0%, #eef6fb 34%, #dce9f1 64%, #c6d7e2 100%)' }}>
      <iframe
        ref={ref}
        src={`/icu.html?chapter=${chapter}`}
        title="ICU"
        onLoad={() => ref.current?.contentWindow?.focus()} // so → / Space reach the app
        style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', border: 'none' }}
      />
      {/* TARS "Initialising" loader — hides the iframe's boot/unstyled window,
          then fades the instant the app posts 'icu:ready' */}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 3,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 15,
          background: 'radial-gradient(1200px 900px at 50% 20%, #ffffff 0%, #eef6fb 34%, #dce9f1 64%, #c6d7e2 100%)',
          opacity: ready ? 0 : 1, transition: 'opacity 0.3s ease', pointerEvents: ready ? 'none' : 'auto',
        }}
      >
        <div
          className="icu-boot-tile"
          style={{
            width: 46, height: 46, borderRadius: 13,
            background: 'linear-gradient(145deg,#5dcaa5,#15966f)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 900, fontSize: 20,
          }}
        >T</div>
        <div style={{ fontSize: 11, letterSpacing: '0.26em', textTransform: 'uppercase', color: 'rgba(34,48,60,.45)' }}>
          Initialising TARS
        </div>
      </div>
    </div>
  )
}

// The whole ride, one app, one port — transitions are in-app view swaps.
// It OPENS INSIDE THE ER: the deck's ATLAS card has already done the
// "here is the ontology" job, and the tower arrives properly a beat later
// as the pull-out, so leading with `intro` showed it twice.
//   er → icu-return(dive) → icu-story(workup) → cath-return(dive)
//         → cath-lab → icu-continued(decision) → or-return(dive) → or-room
//         → icu-postop(Scene 4 · PODs 0-3) → step-return(the transfer flight)
//         → icu-stepdown(POD 4 · terminus)
type View =
  | 'intro' | 'er' | 'er-onto' | 'er-story' | 'icu-return' | 'icu-story' | 'cath-return' | 'cath-lab'
  | 'icu-continued' | 'or-return' | 'or-room' | 'icu-postop' | 'step-return' | 'icu-stepdown'
// DEV-only deep link for scene work: localhost:5210/?start=or-return etc.
const DEV_START = import.meta.env.DEV
  ? (new URLSearchParams(window.location.search).get('start') as View | null)
  : null
export function App() {
  // 'er', not 'intro' — the ride starts inside the emergency room. `intro`
  // is still reachable by stepping back off the ER's first beat.
  const [view, setView] = useState<View>(DEV_START ?? 'er')
  if (view === 'intro') return <IntroView onEnter={() => setView('er')} />
  if (view === 'er')
    // CHAPTER 1 · the quiet ward: coverage, badge, roll call — no story
    return (
      <RoundERLab
        enterInside
        chapter="coverage"
        onExit={() => setView('intro')}
        onFinish={() => setView('er-onto')} // census complete → out to the plot
      />
    )
  if (view === 'er-onto')
    // CHAPTER 2+3 · the map and the actor: ER plot → building → ATLAS → TARS
    return <IcuReturnView segment="atlas" onDone={() => setView('er-story')} />
  if (view === 'er-story')
    // CHAPTER 4 · the case: back in the ER — inbound, the radio, the arrival
    return (
      <RoundERLab
        chapter="story"
        onExit={() => setView('er-onto')}
        onFinish={() => setView('icu-return')} // TARS → the ICU transfer
      />
    )
  if (view === 'icu-return')
    // the transfer: the thread draws his move → lock → dive → the ICU story
    return <IcuReturnView segment="transfer" onDone={() => setView('icu-story')} />
  if (view === 'icu-story')
    // TARS ICU workup; its last beat posts 'icu:finished' → the Cath Lab dive
    return <IcuFrame chapter="workup" onFinished={() => setView('cath-return')} />
  if (view === 'cath-return')
    // step out of the ICU → reveal tower → dive into the Cath Lab → CathLabScene
    return <CathReturnView onDone={() => setView('cath-lab')} />
  if (view === 'cath-lab')
    // Cath Lab: → at the last preset cuts to the ICU story continued
    return <CathLabScene onFinish={() => setView('icu-continued')} />
  if (view === 'icu-continued')
    // Scene 3: the PTCA/CABG decision; its last beat → the OR transition
    return <IcuFrame chapter="continued" onFinished={() => setView('or-return')} />
  if (view === 'or-return')
    // step out of the ICU → reveal tower → dive into the theatres tier (OR-1)
    return <ORReturnView onDone={() => setView('or-room')} />
  if (view === 'or-room')
    // the operating theatre: → at the last preset cuts to Scene 4 (post-op)
    return <ORScene onFinish={() => setView('icu-postop')} />
  if (view === 'icu-postop')
    // Scene 4 · PODs 0-3 at the ICU bedside; signing POD 3's transfer plan
    // posts 'icu:finished' → the Step-Down transfer flight
    return <IcuFrame chapter="postop" onFinished={() => setView('step-return')} />
  if (view === 'step-return')
    // out of the ICU one last time → the thread completes → dive into Step-Down
    return <StepDownReturnView onDone={() => setView('icu-stepdown')} />
  // Scene 4 · POD 4 in the Step-Down ward — the terminus (holds at its end)
  return <IcuFrame chapter="stepdown" />
}
