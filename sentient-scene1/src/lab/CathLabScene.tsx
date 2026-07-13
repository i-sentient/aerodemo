import { useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer, ContactShadows } from '@react-three/drei'
import { MathUtils, NoToneMapping, Vector3 } from 'three'
import { Postprocessing } from '../scene/Postprocessing'
import { CathLab } from './CathLab'

// ---------------------------------------------------------------------------
//  CATH LAB — LAB. Isolated preview of just the cath-lab architecture shell,
//  built the same way as the Round ER lab: neutral studio lighting so the chrome
//  + white housings read on their own terms, a soft reflective interior, and a
//  keyboard-stepped cinematic camera. Reach it at  http://localhost:5210/#cath-lab
//  (see main.tsx). Architecture only — no patients, no story yet.
// ---------------------------------------------------------------------------

/** Bright, clean clinical light. Cool key + soft fill so the white equipment
 *  stays crisp and the recessed ceiling panels read as the light source. */
function CathStudio() {
  return (
    <>
      <color attach="background" args={['#c2c8ce']} />
      <ambientLight intensity={0.62} color={0xeef3f8} />
      <directionalLight
        castShadow
        intensity={1.15}
        color={0xffffff}
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
      {/* soft interior fills approximating the ceiling panel wash */}
      <pointLight position={[-4, 6, -3]} intensity={22} distance={26} decay={2} color={0xf3f8ff} />
      <pointLight position={[4, 6, 3]} intensity={22} distance={26} decay={2} color={0xf3f8ff} />
      <pointLight position={[0, 6, -5]} intensity={16} distance={22} decay={2} color={0xeaf2ff} />

      {/* crisp studio env → glints on the chrome + glass */}
      <Environment resolution={256} frames={1}>
        <color attach="background" args={['#5c646e']} />
        <Lightformer form="rect" intensity={4} color="#ffffff" position={[0, 12, -14]} scale={[16, 9, 1]} />
        <Lightformer form="rect" intensity={3.2} color="#eef6ff" position={[-14, 8, 6]} scale={[2, 16, 1]} rotation-y={Math.PI / 2} />
        <Lightformer form="rect" intensity={3.2} color="#eef6ff" position={[14, 8, 6]} scale={[2, 16, 1]} rotation-y={-Math.PI / 2} />
        <Lightformer form="ring" intensity={1.5} color="#ffffff" position={[0, 18, 2]} scale={[12, 12, 1]} rotation-x={Math.PI / 2} />
      </Environment>

      <ContactShadows position={[0, 0.02, 0]} scale={40} resolution={1024} blur={2.4} opacity={0.42} far={14} color="#2a3138" />
    </>
  )
}

// --- cinematic camera: smoothly damps between per-step architectural shots ---
type Shot = { pos: [number, number, number]; look: [number, number, number] }
const SHOTS: Shot[] = [
  { pos: [0, 4.6, -11.5], look: [0, 1.7, 1] },     // 0 · wide establishing from the open front
  { pos: [-3.7, 2.3, -6.2], look: [-0.2, 1.4, 0.7] }, // 1 · in on the table + C-arm
  { pos: [-3.7, 3.5, -2.7], look: [-4.0, 3.85, 3.0] }, // 2 · the boom monitor bank (high-left)
  { pos: [-1.5, 1.85, -3.4], look: [0, 1.45, 0.5] },  // 3 · over-table C-arm detail
]
const N_BEATS = SHOTS.length

function CinematicCamera({ step }: { step: number }) {
  const { camera } = useThree()
  const look = useRef(new Vector3(...SHOTS[0].look))
  useFrame((_, dt) => {
    const s = SHOTS[Math.min(step, SHOTS.length - 1)]
    const k = 1.0
    camera.position.x = MathUtils.damp(camera.position.x, s.pos[0], k, dt)
    camera.position.y = MathUtils.damp(camera.position.y, s.pos[1], k, dt)
    camera.position.z = MathUtils.damp(camera.position.z, s.pos[2], k, dt)
    look.current.x = MathUtils.damp(look.current.x, s.look[0], k, dt)
    look.current.y = MathUtils.damp(look.current.y, s.look[1], k, dt)
    look.current.z = MathUtils.damp(look.current.z, s.look[2], k, dt)
    camera.lookAt(look.current)
  })
  return null
}

export function CathLabScene() {
  const [step, setStep] = useState(0)
  // presentation control: Space / → advance a shot, ← / Backspace go back
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
    <div style={{ position: 'fixed', inset: 0 }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, toneMapping: NoToneMapping }}
        camera={{ position: [0, 4.6, -11.5], fov: 52 }}
      >
        <CinematicCamera step={step} />
        <CathStudio />
        <CathLab />
        <Postprocessing dark />
      </Canvas>

      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          font: '700 13px ui-sans-serif, system-ui, sans-serif',
          letterSpacing: 1,
          color: '#2f5f6f',
          background: 'rgba(255,255,255,0.6)',
          border: '1px solid rgba(120,160,180,0.4)',
          borderRadius: 10,
          padding: '6px 12px',
          backdropFilter: 'blur(8px)',
        }}
      >
        CATH LAB · SHELL <span style={{ color: '#7a99a0', fontWeight: 500 }}>· architecture only</span>
      </div>
    </div>
  )
}
