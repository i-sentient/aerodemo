import { useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  Environment,
  Lightformer,
  ContactShadows,
  MeshReflectorMaterial,
} from '@react-three/drei'
import { MathUtils, NoToneMapping, Vector3 } from 'three'
import { Postprocessing } from '../scene/Postprocessing'
import { RoundER } from '../scene/RoundER'
import { ERPopulation } from './ERPopulation'

// ---------------------------------------------------------------------------
//  ROUND ER — LAB. Isolated preview of just the ER architecture shell.
//  Reach it at  http://localhost:5173/#er-lab  (see main.tsx). Nothing here
//  touches the real Scene 1 — it's a throwaway sandbox for the room only.
//  The ER has its OWN neutral studio lighting (no borrowed green) so the chrome
//  + glass read on their own terms; slowly auto-rotating.
// ---------------------------------------------------------------------------

/** Clean neutral studio — key + cool rim, a crisp env for the chrome, a soft
 *  reflective floor. No green, no fog haze — just the room. */
function ERStudio() {
  return (
    <>
      <color attach="background" args={['#aab2bb']} />
      <ambientLight intensity={0.5} color={0xdfe6ee} />
      <directionalLight
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
      <directionalLight intensity={0.95} color={0xbfe9ff} position={[-20, 14, -18]} />

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
type Shot = { pos: [number, number, number]; look: [number, number, number] }
// heights stay BELOW the roof (wall = 7.5) so the fly-in threads through the
// glass wall instead of diving over the ceiling (which used to fill the frame).
const SHOTS: Shot[] = [
  { pos: [0, 6.8, -52], look: [0, 3, 0] },          // 0 · outside — approach from behind (same side as the dive, so no overshoot)
  { pos: [0, 5.5, -8], look: [0, 1, 2] },           // 1 · fly in — both consoles / the hub
  { pos: [0, 2.7, -0.6], look: [0, 0.7, 9] },       // 2 · dive deeper — over-console (+alert)
  { pos: [1.6, 2.5, 10.6], look: [-0.3, 1.25, 15] }, // 3 · zoom to the hero bed (+SAM console)
]
// which shot each beat uses (2 holds through alert/ghost/solidify; 5+6 zoom in;
// 7 pulls back to the command hub — TARS talks to the ICU bed)
const STEP_SHOT = [0, 1, 2, 2, 2, 3, 3, 2]

// interior fly-in start when arriving from the tower dive: already INSIDE the
// drum, low + behind, looking the SAME way as the overhead (SHOT 1) so it just
// rises up into the hub — no 180° swing.
const ENTER_START: Shot = { pos: [0, 1.8, -15], look: [0, 1.5, 1] }

function CinematicCamera({ step, initialLook }: { step: number; initialLook?: [number, number, number] }) {
  const { camera } = useThree()
  // seed the look target so the entry can fly-in from a chosen start
  const look = useRef<Vector3 | null>(null)
  if (!look.current) {
    look.current = new Vector3(...(initialLook ?? SHOTS[STEP_SHOT[Math.min(step, STEP_SHOT.length - 1)]].look))
  }
  useFrame((_, dt) => {
    const s = SHOTS[STEP_SHOT[Math.min(step, STEP_SHOT.length - 1)]]
    const k = 1.0 // damping — lower = slower / more cinematic
    camera.position.x = MathUtils.damp(camera.position.x, s.pos[0], k, dt)
    camera.position.y = MathUtils.damp(camera.position.y, s.pos[1], k, dt)
    camera.position.z = MathUtils.damp(camera.position.z, s.pos[2], k, dt)
    look.current!.x = MathUtils.damp(look.current!.x, s.look[0], k, dt)
    look.current!.y = MathUtils.damp(look.current!.y, s.look[1], k, dt)
    look.current!.z = MathUtils.damp(look.current!.z, s.look[2], k, dt)
    camera.lookAt(look.current!)
  })
  return null
}

const N_BEATS = 8 // outside · hub · dive+alert · ghost · solidify · zoom+SAM · STEMI+admit · TARS→ICU

export function RoundERLab({
  onExit,
  onFinish,
  enterInside = false,
}: {
  /** called when ← is pressed at the first beat — e.g. go back to the tower */
  onExit?: () => void
  /** called when → is pressed at the LAST beat — e.g. begin the ICU return */
  onFinish?: () => void
  /** arrive already INSIDE the drum (skip the outside approach fly-in) */
  enterInside?: boolean
} = {}) {
  // when we land here from the tower dive, start at the first interior beat so
  // there's no re-approach transition; ← at that beat exits to the building.
  const ENTER_STEP = enterInside ? 1 : 0
  const [step, setStep] = useState(ENTER_STEP)
  const onExitRef = useRef(onExit)
  onExitRef.current = onExit
  const onFinishRef = useRef(onFinish)
  onFinishRef.current = onFinish
  // presentation control: Space / → advance a beat, ← / Backspace go back
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowRight') {
        e.preventDefault()
        // (callbacks fire OUTSIDE the state updater — calling setView mid-render
        // triggers React's setState-in-render warning)
        setStep((s) => {
          if (s >= N_BEATS - 1) {
            queueMicrotask(() => onFinishRef.current?.()) // past the last beat → start the ICU return
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
        camera={{ position: enterInside ? ENTER_START.pos : SHOTS[0].pos, fov: 55 }}
      >
        <CinematicCamera step={step} initialLook={enterInside ? ENTER_START.look : undefined} />
        <ERStudio />

        <RoundER />
        <ERPopulation step={step} />

        <Postprocessing dark />
      </Canvas>

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
      </div>
    </div>
  )
}
