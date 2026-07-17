import { useEffect, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { Environment, Lightformer, ContactShadows, OrbitControls } from '@react-three/drei'
import { NoToneMapping } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
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
      {/* soft interior fills approximating the ceiling panel wash (below the 3.6 m ceiling) */}
      <pointLight position={[-3, 3.3, -2]} intensity={16} distance={16} decay={2} color={0xf3f8ff} />
      <pointLight position={[3, 3.3, 2]} intensity={16} distance={16} decay={2} color={0xf3f8ff} />
      <pointLight position={[0, 3.3, -3]} intensity={11} distance={14} decay={2} color={0xeaf2ff} />

      {/* crisp studio env → glints on the chrome + glass */}
      <Environment resolution={256} frames={1}>
        <color attach="background" args={['#5c646e']} />
        <Lightformer form="rect" intensity={4} color="#ffffff" position={[0, 12, -14]} scale={[16, 9, 1]} />
        <Lightformer form="rect" intensity={3.2} color="#eef6ff" position={[-14, 8, 6]} scale={[2, 16, 1]} rotation-y={Math.PI / 2} />
        <Lightformer form="rect" intensity={3.2} color="#eef6ff" position={[14, 8, 6]} scale={[2, 16, 1]} rotation-y={-Math.PI / 2} />
        <Lightformer form="ring" intensity={1.5} color="#ffffff" position={[0, 18, 2]} scale={[12, 12, 1]} rotation-x={Math.PI / 2} />
      </Environment>

      <ContactShadows position={[0, 0.02, 0]} scale={22} resolution={1024} blur={2.4} opacity={0.42} far={10} color="#2a3138" />
    </>
  )
}

// --- preset camera angles (pos → camera, look → orbit target) ----------------
type Shot = { pos: [number, number, number]; look: [number, number, number] }
const SHOTS: Shot[] = [
  { pos: [0, 1.95, -6.2], look: [0, 1.35, 0.5] },      // 0 · establishing from the doorway, eye-level
  { pos: [-2.5, 1.7, -3.6], look: [0.2, 1.3, 0.6] },   // 1 · in on the table + C-arm
  { pos: [-2.4, 2.3, -1.3], look: [-3.3, 2.4, 2.6] },  // 2 · the boom monitor bank
  { pos: [-1.9, 1.25, -3.7], look: [0.1, 1.65, 0.5] }, // 3 · low hero of the C-arm over the table
]
const N_BEATS = SHOTS.length

export function CathLabScene({ onFinish }: { onFinish?: () => void } = {}) {
  // Free orbit (drag / scroll). Space / → snap through the preset angles;
  // ← / Backspace step back. After a snap you can keep orbiting from there.
  const controls = useRef<OrbitControlsImpl>(null)
  const step = useRef(0)
  const onFinishRef = useRef(onFinish)
  onFinishRef.current = onFinish
  useEffect(() => {
    const snap = (i: number) => {
      const c = controls.current
      if (!c) return
      const s = SHOTS[i]
      c.object.position.set(s.pos[0], s.pos[1], s.pos[2])
      c.target.set(s.look[0], s.look[1], s.look[2])
      c.update()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowRight') {
        e.preventDefault()
        // at the last preset, → hard-cuts onward (e.g. to Scene 3) if wired
        if (step.current >= N_BEATS - 1) {
          onFinishRef.current?.()
          return
        }
        step.current = Math.min(step.current + 1, N_BEATS - 1)
        snap(step.current)
      } else if (e.code === 'ArrowLeft' || e.code === 'Backspace') {
        e.preventDefault()
        step.current = Math.max(step.current - 1, 0)
        snap(step.current)
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
        camera={{ position: [0, 1.95, -6.2], fov: 46 }}
      >
        <CathStudio />
        <CathLab />
        <OrbitControls
          ref={controls}
          target={[0, 1.2, 0.4]}
          enableDamping
          dampingFactor={0.08}
          minDistance={2.5}
          maxDistance={22}
          maxPolarAngle={Math.PI / 2.05}
        />
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
        CATH LAB · SHELL{' '}
        <span style={{ color: '#7a99a0', fontWeight: 500 }}>· drag to orbit · Space/→ presets</span>
      </div>
    </div>
  )
}
