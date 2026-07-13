import { useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { MathUtils, NoToneMapping } from 'three'
import { SceneEnvironment } from './scene/Environment'
import { Building } from './scene/Building'
import { Postprocessing } from './scene/Postprocessing'

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
]
// camera arc mapped to the beats:
//   0 establish · 1 working · 2 flagged → bird's-eye scan · 3-8 lifecycle → hero push-in
const STEP_SHOT = [0, 1, 2, 3, 3, 3, 3, 3, 3]
const N_BEATS = STEP_SHOT.length

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

export function App() {
  const [step, setStep] = useState(0)
  // presentation control: Space / → advance a beat, ← / Backspace go back
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowRight') {
        e.preventDefault()
        setStep((s) => Math.min(s + 1, N_BEATS - 1))
      } else if (e.code === 'ArrowLeft' || e.code === 'Backspace') {
        e.preventDefault()
        setStep((s) => Math.max(s - 1, 0))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, toneMapping: NoToneMapping }}
      camera={{ position: SHOTS[0].pos, fov: 49 }}
    >
      <CameraRig step={step} />
      <SceneEnvironment orb={false} />
      <Building step={step} />
      <Postprocessing />
    </Canvas>
  )
}
