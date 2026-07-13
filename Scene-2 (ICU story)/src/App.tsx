import { useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { MathUtils, NoToneMapping } from 'three'
import { SceneEnvironment } from './scene/Environment'
import { Building } from './scene/Building'
import { Postprocessing } from './scene/Postprocessing'
import { WardAgentPanel } from './WardAgentPanel'
import { WardRoster } from './WardRoster'
import { WardHud } from './WardHud'
import { WardWorkspacePanel } from './WardWorkspacePanel'

// ---------------------------------------------------------------------------
//  ICU — floorplan view. Free orbit to inspect the room; Space / → snaps the
//  camera to the next presentation shot (← / Backspace to go back), then hands
//  control back so you can keep dragging. No timeline / cards / graph yet.
// ---------------------------------------------------------------------------

type Shot = { pos: [number, number, number]; look: [number, number, number] }
const SHOTS: Shot[] = [
  { pos: [0, 17, -17], look: [0, 0.5, 3] },        // 0 · establishing — high, wide, whole ring
  { pos: [0, 4.6, -14.5], look: [0, 1.1, 3.8] },   // 1 · working — low, down the room
  { pos: [0, 23, -3], look: [0, 0.3, 3] },         // 2 · bird's-eye scan — TARS surveys the ward
  { pos: [0, 2.9, 3.3], look: [4.9, 0.95, -1.95] }, // 3 · hero push-in — foot of bed, facing the patient
  { pos: [0, 23, -13], look: [0, 0.3, 3] },        // 4 · ring overview — whole 8-bed ring, centred (Panel C step)
]
// camera arc mapped to the beats:
//   0 establish · 1 working · 2 bird's-eye · 3-8 lifecycle → hero · 9 workspace → ring overview
const STEP_SHOT = [0, 1, 2, 3, 3, 3, 3, 3, 3, 4]
const N_BEATS = STEP_SHOT.length
// the final step slides Panel C (eMAR) in — the ICU shrinks again to a 3-column
// layout (ICU | Panel B | Panel C) and only then does the ENTER button appear.
const PANEL_C_STEP = N_BEATS - 1

// camera rig: OrbitControls for free look, but a Space/→ beat tweens to a shot
// and only then releases control back to the user.
function CameraRig({ step }: { step: number }) {
  const { camera } = useThree()
  const controls = useRef<any>(null)
  const goal = useRef(SHOTS[0])
  const transit = useRef(false)

  useEffect(() => {
    goal.current = SHOTS[STEP_SHOT[Math.min(step, STEP_SHOT.length - 1)]]
    transit.current = true
    if (controls.current) controls.current.enabled = false
  }, [step])

  useFrame((_, dt) => {
    if (!transit.current || !controls.current) return
    const g = goal.current
    const k = 2.0
    camera.position.x = MathUtils.damp(camera.position.x, g.pos[0], k, dt)
    camera.position.y = MathUtils.damp(camera.position.y, g.pos[1], k, dt)
    camera.position.z = MathUtils.damp(camera.position.z, g.pos[2], k, dt)
    const t = controls.current.target
    t.x = MathUtils.damp(t.x, g.look[0], k, dt)
    t.y = MathUtils.damp(t.y, g.look[1], k, dt)
    t.z = MathUtils.damp(t.z, g.look[2], k, dt)
    controls.current.update()
    const dp = Math.hypot(
      camera.position.x - g.pos[0],
      camera.position.y - g.pos[1],
      camera.position.z - g.pos[2],
    )
    if (dp < 0.06) {
      transit.current = false
      controls.current.enabled = true // hand control back to the user
    }
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      target={SHOTS[0].look}
      minDistance={4}
      maxDistance={90}
      maxPolarAngle={Math.PI / 2.05}
    />
  )
}

// Keeps the ICU framed in the visible LEFT region while the panels overlay the
// right — a smooth camera lens-shift (setViewOffset) instead of resizing the
// canvas (the resize is what caused the jank). `cover` = fraction of the width
// the panels take on the right: 0 (none) · 0.3 (Panel B) · 0.6 (Panel B + C).
function ViewFraming({ cover }: { cover: number }) {
  const { camera, size } = useThree()
  const cur = useRef(0)
  useFrame((_, dt) => {
    cur.current = MathUtils.damp(cur.current, cover, 3, dt)
    const c = cur.current
    const cam = camera as unknown as {
      setViewOffset: (fw: number, fh: number, x: number, y: number, w: number, h: number) => void
      clearViewOffset: () => void
      view?: { enabled: boolean }
    }
    if (c < 0.002) {
      if (cam.view?.enabled) cam.clearViewOffset()
      return
    }
    // shift the frustum left by half the covered width → ICU re-centres in [0,(1-c)·W]
    cam.setViewOffset(size.width, size.height, (c * size.width) / 2, 0, size.width, size.height)
  })
  return null
}

// Scene-2: the ward tour gets ONE extra terminal step past its last shot.
// Landing on it fades out and hands control to the TARS ICU app (onEnterICU).
export function WardApp({ onEnterICU }: { onEnterICU: () => void }) {
  const [step, setStep] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const [interfaceReady, setInterfaceReady] = useState(false)
  const LAST = N_BEATS - 1 // final step (9) — Panel C docks, then the roster arms for click-to-enter

  // presentation control: Space / → advance a beat, ← / Backspace go back.
  // Arrows only walk the ward states (0…LAST). The ICU handoff is NO LONGER armed
  // by the arrow keys — it fires only when the ENTER ICU button is clicked.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowRight') {
        e.preventDefault()
        setStep((s) => Math.min(s + 1, LAST))
      } else if (e.code === 'ArrowLeft' || e.code === 'Backspace') {
        e.preventDefault()
        setStep((s) => Math.max(s - 1, 0))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // the ENTER ICU button arms `leaving`; once leaving, hand off to the ICU (tars)
  // app after the fade settles. (No arrow-key trigger — the handoff is click-only.)
  useEffect(() => {
    if (!leaving) return
    const id = window.setTimeout(onEnterICU, 900)
    return () => window.clearTimeout(id)
  }, [leaving, onEnterICU])

  // ~a beat after Panel C has slid in and the camera has pulled back to the ring,
  // the roster arms: clicking any patient hands off to the interface. Reads as
  // "the floor settles, now pick a patient to step in" — not clickable mid-transition.
  useEffect(() => {
    if (step < LAST) {
      setInterfaceReady(false)
      return
    }
    const id = window.setTimeout(() => setInterfaceReady(true), 1050)
    return () => window.clearTimeout(id)
  }, [step, LAST])

  // camera/building hold on the last real shot during the handoff step
  const shotStep = Math.min(step, LAST)
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__ward = { step, leaving }

  return (
    <>
      {/* ICU 3D view — a full-screen canvas that NEVER resizes (no per-frame WebGL
          resize = no jank). The camera lens-shifts the ICU into the visible left
          region as the panels slide over the right (see ViewFraming). */}
      <div style={{ position: 'fixed', inset: 0 }}>
        <Canvas
          shadows
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: true, toneMapping: NoToneMapping }}
          camera={{ position: SHOTS[0].pos, fov: 49 }}
        >
          <CameraRig step={shotStep} />
          <ViewFraming cover={step >= PANEL_C_STEP ? 0.6 : step >= 2 ? 0.3 : 0} />
          <SceneEnvironment orb={false} />
          <Building step={shotStep} />
          <Postprocessing />
        </Canvas>
      </div>

      {/* instrument-panel chrome framing the ICU (brackets, texture, title, capacity) */}
      <WardHud step={step} />

      {/* bed roster — top-left; at the final step it arms: click a patient to enter the interface */}
      <WardRoster step={step} armed={interfaceReady && !leaving} onSelect={() => setLeaving(true)} />

      {/* Panel B docks at state 2; shifts to the middle column when Panel C arrives */}
      <WardAgentPanel step={step} dockRight={step >= PANEL_C_STEP ? '30vw' : 0} />

      {/* Panel C (eMAR workspace) slides into the far-right column on the final step */}
      <WardWorkspacePanel inView={step >= PANEL_C_STEP} />

      {/* fade to the dark ICU scanner as tars boots */}
      <div
        style={{
          position: 'fixed', inset: 0, background: '#06080c',
          opacity: leaving ? 1 : 0, pointerEvents: 'none',
          transition: 'opacity 0.85s ease', zIndex: 50,
        }}
      />
    </>
  )
}
