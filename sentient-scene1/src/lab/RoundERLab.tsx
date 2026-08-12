import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  Environment,
  Lightformer,
  ContactShadows,
  MeshReflectorMaterial,
  OrbitControls,
} from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useShotCapture } from './useShotCapture'
import { BackSide, MathUtils, NoToneMapping, Vector3, type AmbientLight, type DirectionalLight, type Mesh, type MeshBasicMaterial } from 'three'
import { Postprocessing } from '../scene/Postprocessing'
import { RoundER } from '../scene/RoundER'
import { CommBadge, ERPopulation, NURSE_HERO, type BadgeMode } from './ERPopulation'
import { ISamTitle } from '../scene/ISamTitle'
// read from the census, never typed as a literal — 346 was the WHOLE
// building's device count; the ER floor's own row is what belongs here
import { censusFor, KIND_STYLE } from '../ontology/census'

// ---------------------------------------------------------------------------
//  ROUND ER — LAB. Isolated preview of just the ER architecture shell.
//  Reach it at  http://localhost:5173/#er-lab  (see main.tsx). Nothing here
//  touches the real Scene 1 — it's a throwaway sandbox for the room only.
//  The ER has its OWN neutral studio lighting (no borrowed green) so the chrome
//  + glass read on their own terms; slowly auto-rotating.
// ---------------------------------------------------------------------------

/** Clean neutral studio — key + cool rim, a crisp env for the chrome, a soft
 *  reflective floor. No green, no fog haze — just the room. */
/** Powers the studio down to near-black for the radar beats and back up
 *  after, all damped: three light refs plus the ENVIRONMENT itself (three
 *  r163+'s scene.environmentIntensity — the chrome would otherwise stay lit
 *  by the lightformers with every lamp off), plus a backdrop shroud because
 *  the canvas background is a fixed colour attach. */
function ScanDim({ scan }: { scan: boolean }) {
  const shroud = useRef<Mesh>(null)
  useFrame(({ scene }, dt) => {
    const env = scan ? 0.05 : 1
    scene.environmentIntensity = MathUtils.damp(scene.environmentIntensity ?? 1, env, 2.2, dt)
    const m = shroud.current?.material as MeshBasicMaterial | undefined
    if (m) m.opacity = MathUtils.damp(m.opacity, scan ? 0.94 : 0, 2.2, dt)
    if (shroud.current) shroud.current.visible = (m?.opacity ?? 0) > 0.01
  })
  return (
    <mesh ref={shroud} visible={false}>
      <sphereGeometry args={[90, 24, 16]} />
      <meshBasicMaterial color="#04070c" side={BackSide} transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}

function ERStudio({ scan = false }: { scan?: boolean }) {
  const ambRef = useRef<AmbientLight>(null)
  const keyRef = useRef<DirectionalLight>(null)
  const fillRef = useRef<DirectionalLight>(null)
  useFrame((_, dt) => {
    const k = scan ? 0.04 : 1
    if (ambRef.current) ambRef.current.intensity = MathUtils.damp(ambRef.current.intensity, 0.5 * k, 2.2, dt)
    if (keyRef.current) keyRef.current.intensity = MathUtils.damp(keyRef.current.intensity, 1.35 * k, 2.2, dt)
    if (fillRef.current) fillRef.current.intensity = MathUtils.damp(fillRef.current.intensity, 0.95 * k, 2.2, dt)
  })
  return (
    <>
      <color attach="background" args={['#aab2bb']} />
      <ScanDim scan={scan} />
      <ambientLight ref={ambRef} intensity={0.5} color={0xdfe6ee} />
      <directionalLight
        ref={keyRef}
        castShadow
        intensity={1.35}
        color={0xffffff}
        position={[18, 28, 20]}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={1}
        shadow-camera-far={120}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight ref={fillRef} intensity={0.95} color={0xbfe9ff} position={[-20, 14, -18]} />

      {/* crisp studio env → the glints on the chrome */}
      <Environment resolution={256} frames={1}>
        <color attach="background" args={['#5c646e']} />
        <Lightformer form="rect" intensity={4} color="#ffffff" position={[0, 14, -16]} scale={[18, 10, 1]} />
        <Lightformer form="rect" intensity={3.4} color="#eef6ff" position={[-18, 9, 12]} scale={[2, 20, 1]} rotation-y={Math.PI / 2} />
        <Lightformer form="rect" intensity={3.4} color="#eef6ff" position={[18, 9, 12]} scale={[2, 20, 1]} rotation-y={-Math.PI / 2} />
        <Lightformer form="ring" intensity={1.6} color="#ffffff" position={[0, 22, 4]} scale={[14, 14, 1]} rotation-x={Math.PI / 2} />
      </Environment>

      {/* soft reflective ground the drum sits on */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[220, 220]} />
        <MeshReflectorMaterial
          color="#9aa1a8"
          metalness={0.5}
          roughness={0.52}
          mirror={0.42}
          blur={[320, 120]}
          mixStrength={3}
          mixBlur={1}
          resolution={512}
          depthScale={1}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.2}
        />
      </mesh>
      <ContactShadows position={[0, 0.01, 0]} scale={110} resolution={1024} blur={2.6} opacity={0.4} far={22} color="#2a3138" />
    </>
  )
}

// --- cinematic camera: smoothly damps between per-step shots ----------------
type Shot = { pos: [number, number, number]; look: [number, number, number]; orbit?: boolean }
// heights stay BELOW the roof (wall = 7.5) so the fly-in threads through the
// glass wall instead of diving over the ceiling (which used to fill the frame).
const SHOTS: Shot[] = [
  { pos: [0, 6.8, -52], look: [0, 3, 0] },          // 0 · outside — approach from behind (same side as the dive, so no overshoot)
  { pos: [0, 5.5, -8], look: [0, 1, 2] },           // 1 · fly in — both consoles / the hub
  { pos: [0, 2.7, -0.6], look: [0, 0.7, 9] },       // 2 · dive deeper — over-console (+alert)
  { pos: [1.6, 2.5, 10.6], look: [-0.3, 1.25, 15] }, // 3 · zoom to the hero bed (+SAM console)
  // ── the coverage quartet, before the story starts ──
  // 4 · the ward's eye — up close on the dome pendant at the drum's crown
  { pos: [1.15, 6.5, 1.15], look: [0, 6.95, 0] },
  // 5 · bird's eye — straight down from above the drum (the roof thins to a
  // veil for this beat); the dome sits dead centre, its cyan coverage ring at
  // the glass line. The 0.02 z offset keeps lookAt off the exact vertical,
  // where the up-vector flips.
  { pos: [0, 40, 0.02], look: [0, 0, 0] },
  // 6 · nurse hero — framed on her ENDPOINT, from in front at chest height,
  // so she walks INTO the frame and arrives face-on, badge readable. The
  // numbers live in ERPopulation (NURSE_HERO): her walk is cued off the camera
  // reaching this exact framing, so the two must read one source.
  { pos: NURSE_HERO.pos, look: NURSE_HERO.look },
  // 7 · her two metres — a small pull-back, her violet ring on the floor
  // around where she now stands. NOT a return to the overhead: at bird's eye
  // a 2 m circle is the size of a full stop.
  { pos: [-2.11, 1.97, 9.83], look: [1.7, 0.55, 6.91] },
  // 8 · the badge, close — she turns to put it square in the camera's eyeline
  { pos: [1.27, 1.28, 7.58], look: [1.68, 1.2, 7] },
  // 9 · the ward at work — start at the captured three-quarter and keep a
  // slow orbit around the drum while the shift moves below. The damp chases a
  // moving target on the circle, so arriving from the bird's eye eases
  // straight into the turn with no seam.
  { pos: [10.7, 6.7, 13.56], look: [0, 0, 0], orbit: true },
  // 10 · the DETECTION shot — square onto bay 4, low and centred, so the CV
  // frame reads flat-on and its analysis card sits directly above the box.
  // (The hub shot this replaced was 15 m out, where a card meant to be READ
  // rendered as a smudge.)
  { pos: [-0.06, 1.94, 8.2], look: [-0.5, 1.2, 14.9] },
  // 11 · the CARD shot — shot 10's bearing exactly, moved in to 5.2 m and
  // lifted to 2.2 so the grown frame clears the EMERGENCY signage behind it.
  // The eye height is doing real work: the card is 5.2 m out and the sign 8.1,
  // so raising the camera drops the sign's underside faster than the card's
  // top, which is what buys the gap. Staying at shot 10's 6.7 m left the card
  // a smudge; coming closer than this pushes it back into the word.
  { pos: [-0.16, 2.2, 9.71], look: [-0.5, 1.62, 14.9] },
]
// which shot each beat uses: outside · hub · CAMERA HERO · BIRD'S EYE · NURSE
// · BADGE CLOSE-UP · HER RING · BOTH PERIMETERS · then the RADIO EXCHANGE,
// three beats on the SAME held bird's eye (the camera never moves — the badge
// HUD in the screen corner and the two dialogue cards carry it): INBOUND
// (red ring + station chips + badge blinking red top-right) · MEDIC 12 (the
// speaker glows, the handoff lands lower-left) · THE REPLY (mic pressed, the
// nurse answers lower-right) · then the story (2 holds through alert/ghost/
// solidify; the two bed shots zoom in; the last pulls back)
const STEP_SHOT = [0, 1, 4, 5, 9, 6, 8, 7, 5, 5, 5, 5, 5, 5, 5, 5, 2, 2, 10, 10, 10, 10, 10, 10, 11, 11, 2]

// interior fly-in start when arriving from the tower dive: already INSIDE the
// drum, low + behind, looking the SAME way as the overhead (SHOT 1) so it just
// rises up into the hub — no 180° swing.
const ENTER_START: Shot = { pos: [0, 1.8, -15], look: [0, 1.5, 1] }

function CinematicCamera({ step, initialLook, active = true, controls, onSettled }: {
  step: number; initialLook?: [number, number, number]; active?: boolean
  controls?: RefObject<OrbitControlsImpl | null>
  /** fires once per beat, the frame the damp has effectively arrived — the
   *  spec card waits for this instead of a guessed delay */
  onSettled?: (step: number) => void
}) {
  const { camera } = useThree()
  // seed the look target so the entry can fly-in from a chosen start
  const look = useRef<Vector3 | null>(null)
  if (!look.current) {
    look.current = new Vector3(...(initialLook ?? SHOTS[STEP_SHOT[Math.min(step, STEP_SHOT.length - 1)]].look))
  }
  const beatOrbit = useRef<number | null>(null)
  const settledFor = useRef(-1)
  useFrame((_, dt) => {
    if (!active) return // orbit mode owns the camera; fighting it re-frames every drag
    let s = SHOTS[STEP_SHOT[Math.min(step, STEP_SHOT.length - 1)]]
    // an orbiting shot: the target GLIDES around the ward at the captured
    // radius and height, seeded from the shot's own angle so it starts exactly
    // where the capture was framed
    if (s.orbit) {
      const R = Math.hypot(s.pos[0], s.pos[2])
      if (beatOrbit.current === null) beatOrbit.current = Math.atan2(s.pos[0], s.pos[2])
      beatOrbit.current += dt * 0.06
      s = { ...s, pos: [Math.sin(beatOrbit.current) * R, s.pos[1], Math.cos(beatOrbit.current) * R] }
    } else {
      beatOrbit.current = null
    }
    // keep the (disabled) orbit controls' target on the beat's look, so
    // flipping into orbit picks up seamlessly from the current framing
    if (controls?.current) controls.current.target.copy(look.current!)
    const k = 1.0 // damping — lower = slower / more cinematic
    camera.position.x = MathUtils.damp(camera.position.x, s.pos[0], k, dt)
    camera.position.y = MathUtils.damp(camera.position.y, s.pos[1], k, dt)
    camera.position.z = MathUtils.damp(camera.position.z, s.pos[2], k, dt)
    look.current!.x = MathUtils.damp(look.current!.x, s.look[0], k, dt)
    look.current!.y = MathUtils.damp(look.current!.y, s.look[1], k, dt)
    look.current!.z = MathUtils.damp(look.current!.z, s.look[2], k, dt)
    camera.lookAt(look.current!)
    // settled = both the position and the look-target are within a whisker of
    // the shot. Reported once per beat; the damp never truly reaches zero, so
    // a threshold is the honest test rather than an equality.
    if (onSettled && settledFor.current !== step) {
      const dp = Math.hypot(camera.position.x - s.pos[0], camera.position.y - s.pos[1], camera.position.z - s.pos[2])
      const dl = Math.hypot(look.current!.x - s.look[0], look.current!.y - s.look[1], look.current!.z - s.look[2])
      if (dp < 0.12 && dl < 0.12) { settledFor.current = step; onSettled(step) }
    }
  })
  return null
}

// ---------------------------------------------------------------------------
//  THE RADIO EXCHANGE HUD — beats 8-10 play entirely on the held bird's eye.
//
//  The corner badge is NOT a drawing of the badge: it is the badge — the same
//  CommBadge the nurse wears, rendered by a second small Canvas with its own
//  lights. One model, two cameras. Its `mode` walks alert → speak → reply.
//
//  The dialogue cards type themselves out, each fronted by a round blob
//  avatar (the LeoFace grammar), and the medic's card greys while the nurse
//  has the floor.
// ---------------------------------------------------------------------------
function BadgeHudCanvas({ mode, face = 'nurse', corner = 'right' }: { mode: BadgeMode; face?: 'nurse' | 'medic'; corner?: 'left' | 'right' }) {
  return (
    <div
      style={{
        position: 'absolute', top: 64, [corner]: 72, width: 216, height: 256,
        zIndex: 6, pointerEvents: 'none',
        filter: 'drop-shadow(0 10px 30px rgba(0,0,0,.35))',
        // not a fade — the badge SLIDES IN from its own edge of the screen,
        // like it was clipped to someone walking into frame
        // slow, and from genuinely OFF-SCREEN. 340px started the badge inside
        // the frame at any normal width, so the "slide" was a nudge; 100vw
        // guarantees it enters from beyond the edge whatever the aspect.
        animation: `er-badge-in-${corner} 1.5s cubic-bezier(.16,.84,.3,1) both`,
      } as CSSProperties}
    >
      <style>{`
        @keyframes er-badge-in-right { from { transform: translateX(100vw) } to { transform: none } }
        @keyframes er-badge-in-left { from { transform: translateX(-100vw) } to { transform: none } }
      `}</style>
      <Canvas dpr={[1, 2]} gl={{ alpha: true, antialias: true, toneMapping: NoToneMapping }} camera={{ position: [0, -0.004, 0.3], fov: 40 }}>
        <ambientLight intensity={1.15} />
        <directionalLight position={[0.5, 0.7, 1]} intensity={1.5} />
        <directionalLight position={[-0.8, -0.2, 0.6]} intensity={0.5} />
        <group scale={2.3}>
          <CommBadge mode={mode} face={face} />
        </group>
      </Canvas>
    </div>
  )
}

/** Round speaker avatar — the ward's own blob figure in a tinted disc. */
function BlobAvatar({ bg, body }: { bg: string; body: string }) {
  return (
    <svg width={40} height={40} viewBox="0 0 24 24" style={{ flex: '0 0 auto' }}>
      <circle cx="12" cy="12" r="12" fill={bg} />
      <circle cx="12" cy="9.2" r="3.4" fill={body} />
      <path d="M5.5 21 Q12 13.5 18.5 21 Z" fill={body} />
    </svg>
  )
}

/** Types its segments out character by character on mount, cursor while live. */
/** Types the transcript out at a readable pace. `cps` is characters per
 *  second WALL-CLOCK, not per frame: the interval is the clock, so a slow
 *  render slows the picture but never the typing — which is why this looked
 *  sluggish on a heavy frame and needed no speeding up at all. */
function TypeOut({ segments, cps = 42 }: { segments: { t: string; b?: boolean; c?: string }[]; cps?: number }) {
  const total = segments.reduce((n, seg) => n + seg.t.length, 0)
  const [n, setN] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setN((v) => (v >= total ? v : v + 1)), 1000 / cps)
    return () => window.clearInterval(id)
  }, [total, cps])
  let used = 0
  return (
    <>
      {segments.map((seg, i) => {
        const take = Math.max(0, Math.min(seg.t.length, n - used))
        used += seg.t.length
        const txt = seg.t.slice(0, take)
        return seg.b
          ? <b key={i} style={seg.c ? { color: seg.c } : undefined}>{txt}</b>
          : <span key={i} style={seg.c ? { color: seg.c } : undefined}>{txt}</span>
      })}
      {n < total && <span style={{ opacity: 0.8 }}>▍</span>}
    </>
  )
}

/** One LeoFace-style dialogue card: dark glass, a speaker-coloured edge, the
 *  blob avatar and small-caps header up top, then the line itself. `dim`
 *  greys it while the other end of the radio has the floor. */
function RadioCard({ corner, accent, header, avatar, dim = false, delay = 0, children }: {
  corner: 'left' | 'right'; accent: string; header: string
  avatar: ReactNode; dim?: boolean
  /** hold the card back until its speaker's badge has finished sliding in —
   *  the transcript should start once the radio is on screen, not race it */
  delay?: number
  children: ReactNode
}) {
  const [armed, setArmed] = useState(delay === 0)
  useEffect(() => {
    if (delay === 0) return
    const t = window.setTimeout(() => setArmed(true), delay)
    return () => window.clearTimeout(t)
  }, [delay])
  if (!armed) return null
  return (
    <div
      style={{
        position: 'absolute', bottom: 24, zIndex: 6, pointerEvents: 'none',
        [corner]: 24,
        width: 302, padding: '16px 18px', borderRadius: 14,
        background: 'rgba(13,19,25,.92)', backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255,255,255,.09)',
        [corner === 'left' ? 'borderLeft' : 'borderRight']: `3px solid ${accent}`,
        font: '16px/1.65 ui-sans-serif, system-ui, sans-serif', color: '#e8eef4',
        boxShadow: '0 14px 40px rgba(0,0,0,.38)',
        animation: 'er-card-in .45s cubic-bezier(.2,.8,.2,1) both',
        opacity: dim ? 0.42 : 1,
        filter: dim ? 'grayscale(.65)' : 'none',
        transition: 'opacity .45s ease, filter .45s ease',
      } as CSSProperties}
    >
      <style>{'@keyframes er-card-in { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }'}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <BlobAvatarSlot>{avatar}</BlobAvatarSlot>
        <div style={{ font: '700 11.5px ui-monospace, monospace', letterSpacing: '.1em', color: accent, whiteSpace: 'nowrap' }}>
          {header}
        </div>
      </div>
      {children}
    </div>
  )
}
const BlobAvatarSlot = ({ children }: { children: ReactNode }) => <>{children}</>

// ---------------------------------------------------------------------------
//  CAMERA SPEC CARD — the hero shot's label. The shot is locked (the damp
//  settles on one fixed framing), so the dome's screen position is known and
//  a DOM overlay can point at it: a dot on the housing, a hairline out to the
//  spec card. Vision blue — the same hue as the ward-coverage ring this
//  camera later draws, so the object and its claim share a colour.
// ---------------------------------------------------------------------------
function SpecCard({ show, accent, header, specs, dot, card, elbow }: {
  show: boolean; accent: string; header: string; specs: string[]
  /** leader endpoints in viewport % — dot on the subject, card at the end */
  dot: [string, string]; card: [string, string]
  /** optional bend: the leader runs HORIZONTALLY out to this x at the dot's
   *  own height, then breaks diagonally down to the card. A straight
   *  dot-to-card line leaves the subject at whatever angle the card happens
   *  to sit at; a horizontal run reads as "this specific thing, out here". */
  elbow?: string
}) {
  if (!show) return null
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 6, pointerEvents: 'none' }}>
      <style>{`
        @keyframes er-lead-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes er-spec-in { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
      `}</style>
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', animation: 'er-lead-in .45s ease both' }}>
        {/* Every stroke is drawn TWICE: a dark casing underneath, the accent
            over it. The ER is a white room — a 1.2px teal hairline and a small
            teal dot both disappear against the floor. The casing gives the
            line its own contrast wherever it runs, instead of depending on
            what happens to be behind it. */}
        <defs>
          <filter id="er-lead-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.6" floodColor="#0d1319" floodOpacity="0.55" />
          </filter>
        </defs>
        <g filter="url(#er-lead-shadow)">
          {elbow ? (
            <>
              <line x1={dot[0]} y1={dot[1]} x2={elbow} y2={dot[1]} stroke="#0d1319" strokeWidth="3.4" opacity="0.5" />
              <line x1={elbow} y1={dot[1]} x2={card[0]} y2={card[1]} stroke="#0d1319" strokeWidth="3.4" opacity="0.5" />
            </>
          ) : (
            <line x1={dot[0]} y1={dot[1]} x2={card[0]} y2={card[1]} stroke="#0d1319" strokeWidth="3.4" opacity="0.5" />
          )}
          <circle cx={dot[0]} cy={dot[1]} r="7" fill="#0d1319" opacity="0.5" />
        </g>
        <circle cx={dot[0]} cy={dot[1]} r="5" fill={accent} stroke="#0d1319" strokeWidth="1.4" />
        {/* TWO <line>s, not a <polyline>: `points` is user-space only — it
            silently rejects percentages, which is why the elbow drew nothing
            while the circle (cx/cy DO take %) still appeared. */}
        {elbow ? (
          <>
            <line x1={dot[0]} y1={dot[1]} x2={elbow} y2={dot[1]} stroke={accent} strokeWidth="1.8" opacity="0.95" />
            <line x1={elbow} y1={dot[1]} x2={card[0]} y2={card[1]} stroke={accent} strokeWidth="1.8" opacity="0.95" />
          </>
        ) : (
          <line x1={dot[0]} y1={dot[1]} x2={card[0]} y2={card[1]} stroke={accent} strokeWidth="1.8" opacity="0.95" />
        )}
      </svg>
      <div
        style={{
          position: 'absolute', left: card[0], top: card[1], transform: 'translateY(-14px)',
          width: 300, padding: '14px 16px', borderRadius: 14,
          background: 'rgba(13,19,25,.92)', backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,.09)', borderLeft: `3px solid ${accent}`,
          boxShadow: '0 14px 40px rgba(0,0,0,.35)',
          animation: 'er-spec-in .5s cubic-bezier(.2,.8,.2,1) .18s both',
        }}
      >
        <div style={{ font: '700 11.5px ui-monospace, monospace', letterSpacing: '.18em', color: accent, marginBottom: 9 }}>
          {header}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {specs.map((spec) => (
            <div key={spec} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <i style={{ width: 5, height: 5, borderRadius: 5, background: accent, flex: '0 0 auto' }} />
              <span style={{ font: '500 15px ui-sans-serif, system-ui, sans-serif', color: '#e8eef4' }}>{spec}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
//  THE FLOOR KEY — beat 10, the last ATLAS beat before we leave for the plot.
//  Every class is lit on the floor by now, so the room finally gets told what
//  it has been looking at: the same SHAPES the marks are drawn as (squat cone
//  for nurses, tall for doctors, square for ops, rect for beds, dot for
//  patients) in the same colours, from the same KIND_STYLE table the 3D marks
//  read. Rows land one after another, in the order the roll call revealed
//  them — the key replays the reveal rather than arriving as a finished list.
//
//  It is also a rehearsal: the ATLAS panel two beats later shows this exact
//  vocabulary, so the audience meets the legend on the floor first.
// ---------------------------------------------------------------------------
const KEY_ROWS: { kind: 'nurse' | 'doctor' | 'ops' | 'bed' | 'patient'; label: string; note: string }[] = [
  { kind: 'nurse', label: 'Nurses', note: 'badge · RTLS' },
  { kind: 'doctor', label: 'Doctors', note: 'badge · RTLS' },
  { kind: 'ops', label: 'Porters & techs', note: 'badge · RTLS' },
  { kind: 'bed', label: 'Bays', note: 'fixed · 16 tracked' },
  { kind: 'patient', label: 'Patients', note: 'bay-resident' },
]

function KeyGlyph({ kind, color }: { kind: string; color: string }) {
  const c = { fill: color }
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" aria-hidden style={{ flex: '0 0 auto' }}>
      {kind === 'patient' && <circle cx="12" cy="12" r="6" {...c} />}
      {/* the legend's own cone vs coneLow — squat for nurses, tall for doctors */}
      {kind === 'nurse' && <polygon points="12,6 21,17 3,17" {...c} />}
      {kind === 'doctor' && <polygon points="12,2 19,20 5,20" {...c} />}
      {kind === 'ops' && <rect x="5" y="5" width="14" height="14" rx="2" {...c} />}
      {kind === 'bed' && <rect x="4" y="7" width="16" height="10" rx="2" fill="none" stroke={color} strokeWidth="2.6" />}
    </svg>
  )
}

function FloorKey({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <div
      style={{
        // light, and in the low-right corner: the ER is a bright white room
        // and a dark slab floated over it read as a different application.
        // This one reads as a card lying on the same desk.
        position: 'absolute', right: 26, bottom: 26,
        zIndex: 6, pointerEvents: 'none', width: 250,
        padding: '16px 18px', borderRadius: 14,
        // barely there: a wash and a hairline, no card. The ward reads
        // straight through it — the key annotates the room rather than
        // sitting on top of it
        background: 'rgba(252,253,254,.42)', backdropFilter: 'blur(14px) saturate(1.1)',
        border: '1px solid rgba(120,150,170,.16)',
        boxShadow: '0 10px 30px rgba(30,60,90,.07)',
        animation: 'er-key-in .5s cubic-bezier(.2,.8,.2,1) both',
      }}
    >
      <style>{`
        @keyframes er-key-in { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }
        @keyframes er-key-row { from { opacity: 0; transform: translateX(10px) } to { opacity: 1; transform: none } }
      `}</style>
      <div style={{ font: '700 10.5px ui-monospace, monospace', letterSpacing: '.2em', color: '#16494b', marginBottom: 4 }}>
        WHAT ATLAS SEES
      </div>
      <div style={{ font: '400 12px ui-sans-serif, system-ui, sans-serif', color: '#5f6f7b', marginBottom: 13 }}>
        every object, classified
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {KEY_ROWS.map((r, i) => (
          <div key={r.kind} style={{
            display: 'flex', alignItems: 'center', gap: 11,
            animation: `er-key-row .4s ease ${0.25 + i * 0.13}s both`,
          }}>
            <KeyGlyph kind={r.kind} color={KIND_STYLE[r.kind].color} />
            <div style={{ minWidth: 0 }}>
              <div style={{ font: '600 14px ui-sans-serif, system-ui, sans-serif', color: '#1c242c', lineHeight: 1.2 }}>{r.label}</div>
              <div style={{ font: '400 10.5px ui-monospace, monospace', color: '#6f7f8b', marginTop: 2 }}>{r.note}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{
        marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(120,150,170,.16)',
        font: '400 11px ui-sans-serif, system-ui, sans-serif', color: '#5a6a76', lineHeight: 1.5,
      }}>
        Devices are tracked too — <b style={{ color: '#1c242c' }}>{censusFor('er')?.counts.device ?? 0} of them</b>,
        none of them visible from up here.
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
//  THE NURSE CONSOLE TAKES THE SCREEN — the beat after the radio: the REAL
//  TARS app (icu.html?chapter=er&embed=1), not a replica. The app boots its ER
//  world — 16-bay floor twin on the left, the ARRIVAL CLOCK pinned big in the
//  TARS feed, Protocols open on the OMI inbound bundle — plays its whole brief
//  at boot, and forwards → / ← up as beat navigation while the mouse stays
//  yours inside it. "Initialising TARS" covers the load, exactly like every
//  other door into the app.
// ---------------------------------------------------------------------------
function TarsERFrame({ mounted, shown }: { mounted: boolean; shown: boolean }) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!mounted) { setReady(false); return }
    const onMsg = (e: MessageEvent) => { if (e.data?.type === 'icu:ready') setReady(true) }
    window.addEventListener('message', onMsg)
    const t = window.setTimeout(() => setReady(true), 4000)   // never strand the cover
    return () => { window.removeEventListener('message', onMsg); window.clearTimeout(t) }
  }, [mounted])
  if (!mounted) return null
  return (
    <>
      <iframe
        src="/icu.html?chapter=er&embed=1"
        title="TARS · ER inbound"
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', zIndex: 7,
          opacity: shown && ready ? 1 : 0,
          // quick to arrive, SLOW to leave: the dissolve is the transition —
          // the camera is already diving underneath it
          transition: shown ? 'opacity .4s ease' : 'opacity 1.4s ease',
          pointerEvents: shown && ready ? 'auto' : 'none',
        }}
      />
      {/* the boot cover — the same door as every other TARS entry */}
      <div
        style={{
          position: 'absolute', inset: 0, zIndex: 8,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 15,
          background: 'radial-gradient(1200px 900px at 50% 20%, #ffffff 0%, #eef6fb 34%, #dce9f1 64%, #c6d7e2 100%)',
          opacity: shown && !ready ? 1 : 0,
          transition: shown && !ready ? 'opacity .3s ease, visibility 0s linear 0s' : 'opacity .3s ease, visibility 0s linear .3s',
          visibility: shown && !ready ? 'visible' : 'hidden',
          pointerEvents: 'none',
        }}
      >
        <div style={{
          width: 46, height: 46, borderRadius: 13,
          background: 'linear-gradient(145deg,#5dcaa5,#15966f)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 900, fontSize: 20,
        }}>T</div>
        <div style={{ fontSize: 11, letterSpacing: '0.26em', textTransform: 'uppercase', color: 'rgba(34,48,60,.45)' }}>
          Initialising TARS
        </div>
      </div>
    </>
  )
}

// 27 beats.
// coverage · outside · hub · CAMERA (specs land when the shot settles) · bird's
//   eye · BED HERO (ward alive) · nurse · BADGE (specs on settle) · her ring ·
//   both perimeters · RADAR · census + legend
// story · the room alone · badge slides in · medic 12 · the reply · ARRIVAL
//   CLOCK (console takeover) · dive · ghost · DETECT · unidentified ·
//   reconcile · NAMED (ring retires, bay goes green) · iSAM CARD · iSAM CARD
//   EXPANDED · iSAM reads the ECG · the verdict · TARS→ICU
const N_BEATS = 27

/** Where each chapter of the ER lives in the one beat list. 'coverage' is the
 *  quiet ward (through the census roll call); 'story' opens on the inbound and
 *  runs the case; 'full' is the whole strip for dev deep links. */
const CHAPTER_RANGE = {
  coverage: { first: 0, last: 10 },
  // the story opens on the ROOM alone (beat 11) — the badge arrives on 12
  story: { first: 11, last: N_BEATS - 1 },
  full: { first: 0, last: N_BEATS - 1 },
} as const

export function RoundERLab({
  onExit,
  onFinish,
  enterInside = false,
  chapter = 'full',
}: {
  /** called when ← is pressed at the first beat — e.g. go back to the tower */
  onExit?: () => void
  /** called when → is pressed at the LAST beat — e.g. begin the ICU return */
  onFinish?: () => void
  /** arrive already INSIDE the drum (skip the outside approach fly-in) */
  enterInside?: boolean
  chapter?: keyof typeof CHAPTER_RANGE
} = {}) {
  const RANGE = CHAPTER_RANGE[chapter]
  // The story chapter mounts a whole ER from scratch — drum, sixteen bays,
  // seven figures, the reflector floor — and for the second or two that takes
  // the canvas is empty grey. So it opens BEHIND A HOLD: a matching flat fill
  // that lifts only once the first frames are actually on screen, and the
  // badge HUD is delayed a beat behind that so it slides in over a built room
  // rather than into the void.
  const [warm, setWarm] = useState(chapter !== 'story')
  useEffect(() => {
    if (chapter !== 'story') return
    // two rAFs = the first real rendered frame, then a beat for the drum's
    // materials to compile; the fill cross-dissolves out over that
    let a = 0, b = 0
    a = requestAnimationFrame(() => { b = requestAnimationFrame(() => window.setTimeout(() => setWarm(true), 260)) })
    return () => { cancelAnimationFrame(a); cancelAnimationFrame(b) }
  }, [chapter])
  // when we land here from the tower dive, start at the first interior beat so
  // there's no re-approach transition; ← at that beat exits to the building.
  const ENTER_STEP = Math.max(RANGE.first, enterInside ? 1 : 0)
  const [step, setStep] = useState(ENTER_STEP)
  // DEV free-fly: O toggles orbit (the beat camera stands down), P captures the
  // current framing as a ready-to-paste SHOT line — same workflow as the cath
  // lab and the ward rig. The orbit target seeds from the CURRENT beat's look,
  // so entering orbit never jumps the frame.
  // set the frame the camera finishes its move — the spec card keys off this,
  // so it can never appear while the shot is still flying
  const [settledStep, setSettledStep] = useState(-1)
  const [orbit, setOrbit] = useState(false)
  const controls = useRef<OrbitControlsImpl>(null)
  useShotCapture(controls)
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'o' || e.key === 'O') setOrbit((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const onExitRef = useRef(onExit)
  onExitRef.current = onExit
  const onFinishRef = useRef(onFinish)
  onFinishRef.current = onFinish
  // While the embedded TARS console owns keyboard focus, it forwards → / ← up
  // as messages; treat them exactly like the key handler does.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'plexus:next') {
        setStep((s) => {
          if (s >= RANGE.last) { queueMicrotask(() => onFinishRef.current?.()); return s }
          return s + 1
        })
      }
      if (e.data?.type === 'plexus:prev') {
        setStep((s) => {
          if (s > ENTER_STEP) return s - 1
          queueMicrotask(() => onExitRef.current?.())
          return s
        })
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // presentation control: Space / → advance a beat, ← / Backspace go back
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowRight') {
        e.preventDefault()
        // (callbacks fire OUTSIDE the state updater — calling setView mid-render
        // triggers React's setState-in-render warning)
        setStep((s) => {
          if (s >= RANGE.last) {
            queueMicrotask(() => onFinishRef.current?.()) // past the chapter's last beat
            return s
          }
          return s + 1
        })
      } else if (e.code === 'ArrowLeft' || e.code === 'Backspace') {
        e.preventDefault()
        setStep((s) => {
          if (s > ENTER_STEP) return s - 1
          queueMicrotask(() => onExitRef.current?.()) // at the first beat, ← goes back to the building
          return s
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ENTER_STEP])
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, toneMapping: NoToneMapping }}
        camera={{ position: chapter === 'story' ? SHOTS[STEP_SHOT[RANGE.first]].pos : enterInside ? ENTER_START.pos : SHOTS[0].pos, fov: 55 }}
      >
        <CinematicCamera step={step}
          initialLook={chapter === 'story' ? SHOTS[STEP_SHOT[RANGE.first]].look : enterInside ? ENTER_START.look : undefined}
          active={!orbit} controls={controls} onSettled={setSettledStep} />
        {/* mounted ALWAYS, gated by `enabled` — the cath lab's pattern. A
            conditionally-mounted OrbitControls left the capture hook's ref
            empty; this way the ref is set once and P always has a camera. */}
        <OrbitControls ref={controls} makeDefault enabled={orbit} enableDamping dampingFactor={0.08} />
        <ERStudio scan={step === 9} />

        <RoundER xray={step === 3 || (step >= 8 && step <= 14)} />
        <ERPopulation step={step} />

        <Postprocessing dark />
      </Canvas>

      {/* mounted one beat early so the app loads behind the radio cards, and
          one beat LATE so leaving is a slow dissolve over the camera's dive
          down to the bay — not a cut */}
      {/* the hold. #aab2bb IS the canvas background colour, so the lift is a
          dissolve into the room rather than a change of surface. */}
      <div
        style={{
          position: 'absolute', inset: 0, zIndex: 9, pointerEvents: 'none',
          background: '#aab2bb',
          opacity: warm ? 0 : 1,
          transition: warm ? 'opacity .5s ease' : 'none',
        }}
      />
      <FloorKey show={step === 10} />
      <TarsERFrame mounted={step >= 14 && step <= 16} shown={step === 15} />
      {/* iSAM, named at the story's hinge — identity has just been answered and
          diagnosis is about to begin, which is the one point in the ER where a
          card interrupts nothing. Its own .55s fade IS the fade to black: the
          box is still there underneath, darkening through it, and beats 22-23
          hold shot 10 so it reopens on the framing it left. */}
      <ISamTitle show={step === 22 || step === 23} expanded={step === 23} />
      {/* the room's eye — labelled the moment the shot settles on it */}
      <SpecCard show={step === 2 && settledStep === 2} accent="#3d8bff"
        header="VISUAL SENSOR" specs={['Photosensitive Camera', 'Infrared Blaster', 'High-Res']}
        dot={['52%', '55%']} card={['65%', '67%']} />
      {/* the badge — same settle grammar, on the close-up. Dot on the delta's
          RIGHT edge, card out to the right: anchored right but pointing left,
          the leader crossed the badge's own face and struck through the name
          display on its way to the card. */}
      <SpecCard show={step === 6 && settledStep === 6} accent="#5dcaa5"
        header="REAL-TIME LOCATION SENSOR" specs={['Internal Comm.', 'TARS Nudges', 'Edge Compute']}
        dot={['46%', '47%']} elbow="64%" card={['76%', '64%']} />
      {warm && step >= 12 && step <= 14 && (
        <BadgeHudCanvas corner="right" face="nurse" mode={step === 12 ? 'alert' : step === 13 ? 'speak' : 'reply'} />
      )}
      {/* the other end of the channel: the medic's badge joins when it opens.
          His states MIRROR hers — beat 9 he talks (mic hot) while her speaker
          carries him; beat 10 he listens (speaker hot) while she presses to
          answer. His display never leaves red: Chandrababu is in his truck. */}
      {warm && step >= 13 && step <= 14 && (
        <BadgeHudCanvas corner="left" face="medic" mode={step === 13 ? 'reply' : 'speak'} />
      )}
      {step >= 13 && step <= 14 && (
        <RadioCard corner="left" accent="#ff4545" header="MEDIC 12 · PATCHED THROUGH"
          avatar={<BlobAvatar bg="#7a1410" body="#ff8f86" />} dim={step === 14}
          delay={step === 13 ? 1650 : 0}>
          <TypeOut segments={[
            { t: 'Chandrababu, 58 male — crushing chest pain, forty minutes. Twelve-lead is abnormal — ' },
            { t: 'probable MI case', b: true, c: '#ff9a9a' },
            { t: '. BP 104/65 · pulse 125 · sats 91 on air. Aspirin on board. ' },
            { t: "We're four minutes out.", b: true },
          ]} />
        </RadioCard>
      )}
      {step === 14 && (
        <RadioCard corner="right" accent="#5dcaa5" header="N. ADEYEMI · RN — BAY 4"
          avatar={<BlobAvatar bg="#14524e" body="#7fe7d2" />} delay={450}>
          <TypeOut segments={[
            { t: 'Copy, Medic 12 — we have him. Bay 4 is prepped: monitor and vent standing by, cath lab paged. ' },
            { t: 'Bring Chandrababu straight through.', b: true },
          ]} />
        </RadioCard>
      )}

      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          font: '700 13px ui-sans-serif, system-ui, sans-serif',
          letterSpacing: 1,
          color: '#2f6f5e',
          background: 'rgba(255,255,255,0.6)',
          border: '1px solid rgba(120,180,160,0.4)',
          borderRadius: 10,
          padding: '6px 12px',
          backdropFilter: 'blur(8px)',
        }}
      >
        ER SHELL · LAB <span style={{ color: '#7a99a0', fontWeight: 500 }}>· architecture only</span>
        {import.meta.env.DEV && (
          <span style={{ color: orbit ? '#2f6f5e' : '#9ab0b6', fontWeight: 600, marginLeft: 10 }}>
            {orbit ? 'ORBIT · drag to fly · P captures shot · O returns' : 'O · orbit'}
          </span>
        )}
      </div>
    </div>
  )
}
