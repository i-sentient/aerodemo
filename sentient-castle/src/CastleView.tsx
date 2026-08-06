import { Suspense, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import {
  OrbitControls,
  useGLTF,
  Environment,
  Lightformer,
  ContactShadows,
  MeshReflectorMaterial,
} from '@react-three/drei'
import { ACESFilmicToneMapping, type Mesh, type MeshStandardMaterial } from 'three'

// ---------------------------------------------------------------------------
//  CASTLE VIEW — hospital-building GLB (base.glb) with a chrome pass. Its own
//  app (sentient-castle, port 5400). Orbit to inspect.
// ---------------------------------------------------------------------------

const CASTLE_SCALE = 4

function Castle() {
  const { scene } = useGLTF('/base.glb')
  useMemo(() => {
    scene.traverse((o) => {
      const mesh = o as Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      const m = mesh.material as MeshStandardMaterial
      if (m) {
        m.color.set('#cdd2d9')
        m.metalness = 0.9
        m.roughness = 0.32
        m.envMapIntensity = 1.35
        m.needsUpdate = true
      }
    })
  }, [scene])
  return <primitive object={scene} scale={CASTLE_SCALE} position={[0, 0, 0]} />
}
useGLTF.preload('/base.glb')

export function CastleView() {
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true, toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
        camera={{ position: [20, 12, 22], fov: 40 }}
      >
        <color attach="background" args={['#c4cad1']} />
        <ambientLight intensity={0.4} color={0xe8eef5} />
        <directionalLight
          castShadow
          intensity={1.6}
          color={0xffffff}
          position={[22, 34, 20]}
          shadow-mapSize={[2048, 2048]}
          shadow-camera-near={1}
          shadow-camera-far={140}
          shadow-camera-left={-40}
          shadow-camera-right={40}
          shadow-camera-top={40}
          shadow-camera-bottom={-40}
          shadow-bias={-0.0004}
        />
        <directionalLight intensity={0.7} color={0xbfe4ff} position={[-24, 16, -20]} />

        <Environment resolution={256} frames={1}>
          <color attach="background" args={['#565e68']} />
          <Lightformer form="rect" intensity={4} color="#ffffff" position={[0, 18, -20]} scale={[24, 12, 1]} />
          <Lightformer form="rect" intensity={3.2} color="#eef6ff" position={[-22, 12, 14]} scale={[3, 26, 1]} rotation-y={Math.PI / 2} />
          <Lightformer form="rect" intensity={3.2} color="#eef6ff" position={[22, 12, 14]} scale={[3, 26, 1]} rotation-y={-Math.PI / 2} />
          <Lightformer form="ring" intensity={1.7} color="#ffffff" position={[0, 28, 6]} scale={[18, 18, 1]} rotation-x={Math.PI / 2} />
        </Environment>

        <Suspense fallback={null}>
          <Castle />
        </Suspense>

        <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 0]} receiveShadow>
          <planeGeometry args={[240, 240]} />
          <MeshReflectorMaterial
            color="#9aa1a8"
            metalness={0.5}
            roughness={0.5}
            mirror={0.4}
            blur={[320, 120]}
            mixStrength={3}
            mixBlur={1}
            resolution={512}
            depthScale={1}
            minDepthThreshold={0.4}
            maxDepthThreshold={1.2}
          />
        </mesh>
        <ContactShadows position={[0, 0.01, 0]} scale={80} resolution={1024} blur={2.6} opacity={0.5} far={30} color="#2a3138" />

        <OrbitControls target={[0, 5, 0]} enableDamping dampingFactor={0.08} minDistance={8} maxDistance={90} maxPolarAngle={Math.PI / 2.05} />
      </Canvas>

      <div
        style={{
          position: 'absolute', top: 14, left: 14,
          font: '700 12px ui-sans-serif, system-ui, sans-serif', letterSpacing: 1,
          color: '#33566f', background: 'rgba(255,255,255,0.65)',
          border: '1px solid rgba(120,160,190,0.4)', borderRadius: 8, padding: '5px 10px',
        }}
      >
        CASTLE · GLB <span style={{ color: '#7a99a0', fontWeight: 500 }}>· chrome pass</span>
      </div>
    </div>
  )
}
