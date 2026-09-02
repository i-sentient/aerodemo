import { useEffect, useRef, useState, type RefObject, type MutableRefObject } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, Lightformer, ContactShadows, OrbitControls } from '@react-three/drei'
import { NoToneMapping, MathUtils } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { Postprocessing } from '../scene/Postprocessing'
import { CathLab } from './CathLab'
import { useShotCapture } from './useShotCapture'

// ---------------------------------------------------------------------------
//  CATH LAB — LAB. Isolated preview of just the cath-lab architecture shell,
//  built the same way as the Round ER lab: neutral studio lighting so the chrome
//  + white housings read on their own terms, a soft reflective interior, and a
//  keyboard-stepped cinematic camera. Reach it at  http://localhost:5210/#cath-lab
//  (see main.tsx). Architecture only — no patients, no story yet.
// ---------------------------------------------------------------------------

/** Dimmed-for-the-run clinical light — a real cath lab drops the room lights
 *  during fluoro so the screens read. Half a notch toward the OR's mood, but
 *  cool/steel where the OR is warm: the room stays white, the glow stays blue. */
function CathStudio() {
  return (
    <>
      <color attach="background" args={['#454f59']} />
      <ambientLight intensity={0.35} color={0xdfe8f0} />
      <directionalLight
        castShadow
        intensity={0.72}
        color={0xf2f6fb}
        position={[6, 22, -10]}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={1}
        shadow-camera-far={80}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={24}
        shadow-camera-bottom={-24}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      {/* soft interior fills approximating the (dimmed) ceiling panel wash */}
      <pointLight position={[-3, 3.3, -2]} intensity={9} distance={16} decay={2} color={0xe8f0fa} />
      <pointLight position={[3, 3.3, 2]} intensity={9} distance={16} decay={2} color={0xe8f0fa} />
      <pointLight position={[0, 3.3, -3]} intensity={6} distance={14} decay={2} color={0xdfeafc} />

      {/* studio env → glints on the chrome + glass (dimmed with the room) */}
      <Environment resolution={256} frames={1}>
        <color attach="background" args={['#3d454e']} />
        <Lightformer form="rect" intensity={2.6} color="#f2f6fb" position={[0, 12, -14]} scale={[16, 9, 1]} />
        <Lightformer form="rect" intensity={2.2} color="#e4eefc" position={[-14, 8, 6]} scale={[2, 16, 1]} rotation-y={Math.PI / 2} />
        <Lightformer form="rect" intensity={2.2} color="#e4eefc" position={[14, 8, 6]} scale={[2, 16, 1]} rotation-y={-Math.PI / 2} />
        <Lightformer form="ring" intensity={1.1} color="#ffffff" position={[0, 18, 2]} scale={[12, 12, 1]} rotation-x={Math.PI / 2} />
      </Environment>

      <ContactShadows position={[0, 0.02, 0]} scale={22} resolution={1024} blur={2.4} opacity={0.5} far={10} color="#232930" />
    </>
  )
}

// --- preset camera angles (pos → camera, look → orbit target) ----------------
// The sign bookends the room: red outside → through the wall → the long shot
// through the console glass → back to the sign (green) → the console shot.
type Shot = { pos: [number, number, number]; look: [number, number, number] }
const SHOTS: Shot[] = [
  { pos: [0.04, 2.23, 8.65], look: [0, 2.32, 5.49] },   // 0 · corridor — the red CATH-1 · IN USE off the back wall
  { pos: [0, 2.12, 2.55], look: [0, 2.3, 5.53] },       // 1 · pushes through the wall — inside, on the sign
  { pos: [0.11, 1.68, -6.22], look: [0.39, 1.36, 0.59] }, // 2 · the long shot — through the open window (no glass yet); reads as a clean opening
  { pos: [-0.03, 2.36, 2.45], look: [-0.03, 2.3, 5.5] }, // 3 · back to the sign → green COMPLETED (slow fade)
  { pos: [0.07, 1.61, -9.44], look: [-0.03, 2.3, 5.5] }, // 4 · the console shot — across the whole lab to the green sign
]
const N_BEATS = SHOTS.length
const LAST = N_BEATS - 1
const DONE_AT = 3  // arriving here: sign green, X-ray off, the DTB clock stops
const ANGIO_AT = 4 // ...and only THEN the angiogram — the next chapter's problem

// smooth glide between presets — same rig as the OR (position + target damped,
// arrival re-enables orbit and reports in so the sign can flip).
function GlideRig({ controls, goal, onArrive }: {
  controls: RefObject<OrbitControlsImpl | null>
  goal: MutableRefObject<Shot | null>
  onArrive: () => void
}) {
  useFrame((_, dt) => {
    const g = goal.current
    const c = controls.current
    if (!g || !c) return
    const cam = c.object
    const k = 2.2
    cam.position.x = MathUtils.damp(cam.position.x, g.pos[0], k, dt)
    cam.position.y = MathUtils.damp(cam.position.y, g.pos[1], k, dt)
    cam.position.z = MathUtils.damp(cam.position.z, g.pos[2], k, dt)
    c.target.x = MathUtils.damp(c.target.x, g.look[0], k, dt)
    c.target.y = MathUtils.damp(c.target.y, g.look[1], k, dt)
    c.target.z = MathUtils.damp(c.target.z, g.look[2], k, dt)
    c.update()
    const d = Math.hypot(cam.position.x - g.pos[0], cam.position.y - g.pos[1], cam.position.z - g.pos[2])
    if (d < 0.06) {
      goal.current = null
      c.enabled = true
      onArrive()
    }
  })
  return null
}

export function CathLabScene({ onFinish }: { onFinish?: () => void } = {}) {
  // Free orbit (drag / scroll) between beats; Space / → glides to the next
  // preset (← / Backspace back). Past the last beat → Post Cath Manager.
  const controls = useRef<OrbitControlsImpl>(null)
  const step = useRef(0)
  const glideGoal = useRef<Shot | null>(null)
  // Two beats, not one. DONE_AT ends the PROCEDURE — sign green, X-ray plate
  // out, and the door-to-balloon clock the ER started stopping under the sign.
  // ANGIO_AT is the next chapter arriving on the screens. Landing them together
  // spent the clock as a detail on the same frame as the images, when it is the
  // payoff of three scenes of tension and wants the room to itself first.
  const [done, setDone] = useState(false)
  const [angio, setAngio] = useState(false)
  const [glass, setGlass] = useState(false) // the observation glass: appears the INSTANT you click past the long shot
  const onFinishRef = useRef(onFinish)
  onFinishRef.current = onFinish
  useShotCapture(controls) // DEV: P = copy current camera as a SHOT line
  useEffect(() => {
    const go = (i: number) => {
      glideGoal.current = SHOTS[i]
      if (controls.current) controls.current.enabled = false
      if (i < DONE_AT) setDone(false)   // stepping back re-arms the red sign
      if (i < ANGIO_AT) setAngio(false) // ...and takes the images back down
      setGlass(i >= DONE_AT)          // glass appears/hides the instant you click past the long shot
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowRight') {
        e.preventDefault()
        if (step.current >= LAST) {
          onFinishRef.current?.()
          return
        }
        step.current += 1
        go(step.current)
      } else if (e.code === 'ArrowLeft' || e.code === 'Backspace') {
        e.preventDefault()
        step.current = Math.max(step.current - 1, 0)
        go(step.current)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, toneMapping: NoToneMapping }}
        camera={{ position: SHOTS[0].pos, fov: 46 }}
      >
        <CathStudio />
        <CathLab done={done} angio={angio} glass={glass} />
        <GlideRig controls={controls} goal={glideGoal} onArrive={() => { if (step.current >= DONE_AT) setDone(true); if (step.current >= ANGIO_AT) setAngio(true) }} />
        <OrbitControls
          ref={controls}
          target={SHOTS[0].look}
          enableDamping
          dampingFactor={0.08}
          minDistance={2.5}
          maxDistance={22}
          maxPolarAngle={Math.PI / 1.75}
        />
        <Postprocessing dark />
      </Canvas>
      {/* the "CATH LAB · SHELL · drag to orbit" badge is gone — it was scaffold
          from when this room was built in isolation, and it named the room the
          audience is already standing in while advertising dev controls */}
    </div>
  )
}
