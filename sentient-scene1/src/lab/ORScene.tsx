import { useEffect, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { Environment, Lightformer, ContactShadows, OrbitControls, RoundedBox } from '@react-three/drei'
import { NoToneMapping } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { Postprocessing } from '../scene/Postprocessing'

// ---------------------------------------------------------------------------
//  OPERATING THEATRE (OR-1) — greybox shell in the Cath-Lab style: neutral
//  clinical studio, chrome + white housings, keyboard-stepped camera presets.
//  Reached from the tower dive after the CABG decision; → at the last preset
//  fires onFinish (→ Scene 4, post-op ICU). Architecture only — art pass later.
// ---------------------------------------------------------------------------

function ORStudio() {
  return (
    <>
      <color attach="background" args={['#c6cbd1']} />
      <ambientLight intensity={0.6} color={0xeef3f8} />
      <directionalLight
        castShadow
        intensity={1.1}
        color={0xffffff}
        position={[8, 20, -8]}
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
      {/* the surgical lights are the light source — warm-white pools over the table */}
      <pointLight position={[-0.9, 3.1, 0.4]} intensity={22} distance={12} decay={2} color={0xfff6e8} />
      <pointLight position={[1.1, 3.3, -0.6]} intensity={22} distance={12} decay={2} color={0xfff6e8} />
      <pointLight position={[0, 3.2, 2.6]} intensity={9} distance={12} decay={2} color={0xeaf2ff} />

      <Environment resolution={256} frames={1}>
        <color attach="background" args={['#5c646e']} />
        <Lightformer form="rect" intensity={4} color="#ffffff" position={[0, 12, -14]} scale={[16, 9, 1]} />
        <Lightformer form="rect" intensity={3.2} color="#eef6ff" position={[-14, 8, 6]} scale={[2, 16, 1]} rotation-y={Math.PI / 2} />
        <Lightformer form="rect" intensity={3.2} color="#eef6ff" position={[14, 8, 6]} scale={[2, 16, 1]} rotation-y={-Math.PI / 2} />
        <Lightformer form="ring" intensity={1.6} color="#ffffff" position={[0, 18, 2]} scale={[12, 12, 1]} rotation-x={Math.PI / 2} />
      </Environment>

      <ContactShadows position={[0, 0.02, 0]} scale={24} resolution={1024} blur={2.4} opacity={0.4} far={10} color="#2a3138" />
    </>
  )
}

// --- the room set: table · twin surgical lights · anaesthesia stack · back table
function ORSet() {
  const chrome = { color: '#c8ced4', metalness: 0.9, roughness: 0.25, envMapIntensity: 1.4 } as const
  const housing = { color: '#f2f4f6', metalness: 0.1, roughness: 0.35, envMapIntensity: 0.9 } as const
  const pad = { color: '#3f6f68', metalness: 0.05, roughness: 0.6 } as const // surgical green
  return (
    <group>
      {/* floor slab (soft clinical grey) */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]} receiveShadow>
        <circleGeometry args={[9, 64]} />
        <meshStandardMaterial color="#aeb6bd" metalness={0.35} roughness={0.5} envMapIntensity={0.8} />
      </mesh>

      {/* operating table: pedestal + slab + green pad + side rails */}
      <RoundedBox args={[0.5, 0.7, 0.9]} radius={0.06} smoothness={3} position={[0, 0.35, 0]} castShadow>
        <meshStandardMaterial {...chrome} />
      </RoundedBox>
      <RoundedBox args={[0.72, 0.1, 2.1]} radius={0.04} smoothness={3} position={[0, 0.78, 0]} castShadow>
        <meshStandardMaterial {...chrome} />
      </RoundedBox>
      <RoundedBox args={[0.68, 0.09, 2.0]} radius={0.045} smoothness={3} position={[0, 0.88, 0]} castShadow>
        <meshStandardMaterial {...pad} />
      </RoundedBox>
      {[-0.38, 0.38].map((x, i) => (
        <mesh key={i} position={[x, 0.84, 0]} castShadow>
          <boxGeometry args={[0.03, 0.03, 1.9]} />
          <meshStandardMaterial {...chrome} />
        </mesh>
      ))}

      {/* twin surgical light heads on ceiling arms */}
      {[
        { p: [-0.9, 3.05, 0.4] as const, r: 0.52 },
        { p: [1.1, 3.25, -0.6] as const, r: 0.44 },
      ].map((L, i) => (
        <group key={i}>
          <mesh position={[L.p[0], 3.85, L.p[2]]}>
            <cylinderGeometry args={[0.05, 0.05, 1.1, 12]} />
            <meshStandardMaterial {...chrome} />
          </mesh>
          <mesh position={[L.p[0], L.p[1], L.p[2]]} rotation-x={Math.PI / 2.25} castShadow>
            <cylinderGeometry args={[L.r, L.r * 0.82, 0.16, 40]} />
            <meshStandardMaterial {...housing} />
          </mesh>
          <mesh position={[L.p[0], L.p[1] - 0.075, L.p[2] + 0.05]} rotation-x={Math.PI / 2.25}>
            <circleGeometry args={[L.r * 0.72, 40]} />
            <meshBasicMaterial color="#fff8ea" toneMapped={false} />
          </mesh>
        </group>
      ))}

      {/* anaesthesia workstation (head end, -z) with a screen */}
      <RoundedBox args={[1.0, 1.5, 0.62]} radius={0.06} smoothness={3} position={[-1.7, 0.75, -1.7]} castShadow>
        <meshStandardMaterial {...housing} />
      </RoundedBox>
      <RoundedBox args={[0.62, 0.42, 0.05]} radius={0.03} smoothness={3} position={[-1.7, 1.78, -1.62]} rotation-y={0.35} castShadow>
        <meshStandardMaterial color="#10161d" metalness={0.4} roughness={0.4} />
      </RoundedBox>
      <mesh position={[-1.7, 1.78, -1.59]} rotation-y={0.35}>
        <planeGeometry args={[0.56, 0.36]} />
        <meshBasicMaterial color="#12312b" toneMapped={false} />
      </mesh>

      {/* perfusion / heart-lung stack (the CABG tell) */}
      <RoundedBox args={[0.9, 1.25, 0.7]} radius={0.06} smoothness={3} position={[2.2, 0.62, -1.3]} castShadow>
        <meshStandardMaterial {...housing} />
      </RoundedBox>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[1.95 + i * 0.25, 1.42, -1.3]} castShadow>
          <cylinderGeometry args={[0.07, 0.07, 0.34, 16]} />
          <meshStandardMaterial color="#dfe9f0" metalness={0.2} roughness={0.25} transparent opacity={0.8} />
        </mesh>
      ))}

      {/* back instrument table with tray */}
      <RoundedBox args={[1.6, 0.06, 0.6]} radius={0.03} smoothness={3} position={[0.4, 0.95, 2.3]} castShadow>
        <meshStandardMaterial {...chrome} />
      </RoundedBox>
      {[[-0.25, 0.15], [1.05, 0.15]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.475, 2.3 + (z as number)]} castShadow>
          <cylinderGeometry args={[0.03, 0.03, 0.95, 10]} />
          <meshStandardMaterial {...chrome} />
        </mesh>
      ))}
      <RoundedBox args={[0.9, 0.05, 0.42]} radius={0.02} smoothness={3} position={[0.4, 1.0, 2.3]} castShadow>
        <meshStandardMaterial color="#e8edf1" metalness={0.6} roughness={0.2} envMapIntensity={1.2} />
      </RoundedBox>
    </group>
  )
}

// --- preset camera angles (pos → camera, look → orbit target) ---------------
type Shot = { pos: [number, number, number]; look: [number, number, number] }
const SHOTS: Shot[] = [
  { pos: [0, 1.9, -6.4], look: [0, 1.2, 0] },          // 0 · doorway establishing
  { pos: [-2.6, 1.7, -2.9], look: [0, 1.0, 0.2] },     // 1 · in past the anaesthesia stack
  { pos: [-0.4, 2.7, 1.9], look: [0.2, 0.9, -0.2] },   // 2 · under the lights, over the table
  { pos: [2.6, 1.5, 1.6], look: [0.6, 1.0, -0.6] },    // 3 · hero past the perfusion stack
]
const N_BEATS = SHOTS.length

export function ORScene({ onFinish }: { onFinish?: () => void } = {}) {
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
        if (step.current >= N_BEATS - 1) {
          onFinishRef.current?.() // → past the last preset → Scene 4
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
        camera={{ position: [0, 1.9, -6.4], fov: 46 }}
      >
        <ORStudio />
        <ORSet />
        <OrbitControls
          ref={controls}
          target={[0, 1.2, 0]}
          enableDamping
          dampingFactor={0.08}
          minDistance={2.5}
          maxDistance={20}
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
          color: '#4a5a6f',
          background: 'rgba(255,255,255,0.6)',
          border: '1px solid rgba(130,150,180,0.4)',
          borderRadius: 10,
          padding: '6px 12px',
          backdropFilter: 'blur(8px)',
        }}
      >
        OPERATING THEATRE · OR-1{' '}
        <span style={{ color: '#7a8ba0', fontWeight: 500 }}>· drag to orbit · Space/→ presets</span>
      </div>
    </div>
  )
}
