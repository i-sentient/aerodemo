import { Environment, Lightformer, ContactShadows, MeshReflectorMaterial } from '@react-three/drei'
import { AERO } from '../ontology'
import { ER_INFO } from './BuildingStack'

// ---------------------------------------------------------------------------
//  SCENE ENVIRONMENT
//   • default (bright): the ER-floorplan product-shot lighting.
//   • dark: the Sony-Ericsson exhibition HALL — near-black, a cool rim to peel
//     the white shell off black, green spill at the ER mouth + crown, a wet
//     reflective floor, and a dark studio for crisp highlights on the shell.
// ---------------------------------------------------------------------------

function BackdropOrb() {
  return (
    <mesh position={[8, 18, -34]}>
      <sphereGeometry args={[15, 64, 64]} />
      <meshStandardMaterial color="#d4dee6" metalness={0.85} roughness={0.28} envMapIntensity={1.1} />
    </mesh>
  )
}

// --- the dark exhibition stage ---------------------------------------------
function DarkStage() {
  return (
    <>
      <color attach="background" args={['#cbd0d5']} />
      <fog attach="fog" args={['#cbd0d5', 45, 140]} />

      <ambientLight intensity={0.5} color={0xdfe6ee} />
      {/* key rakes the metal */}
      <directionalLight
        castShadow
        intensity={1.35}
        color={0xffffff}
        position={[11, 21, 15]}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={1}
        shadow-camera-far={90}
        shadow-camera-left={-32}
        shadow-camera-right={32}
        shadow-camera-top={32}
        shadow-camera-bottom={-32}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      {/* cool rim — separates the silhouette */}
      <directionalLight intensity={1.15} color={0xbfe9ff} position={[-13, 9, -15]} />
      {/* green spill at the ER mouth + crown */}
      <pointLight color={0x23e6a0} intensity={6} distance={10} decay={2} position={[0, ER_INFO.y, ER_INFO.frontZ - 1.2]} />
      <pointLight color={0x23e6a0} intensity={4} distance={9} decay={2} position={[0, 24, 0]} />

      {/* dark studio — the crisp side-streak highlights on the white shell */}
      <Environment resolution={256} frames={1}>
        {/* studio → bright streaks give the shiny gunmetal its glints */}
        <color attach="background" args={['#6b727c']} />
        <Lightformer form="rect" intensity={4} color="#ffffff" position={[0, 9, -10]} scale={[10, 8, 1]} />
        <Lightformer form="rect" intensity={3.4} color="#eef6ff" position={[-11, 6, 7]} scale={[1.6, 15, 1]} rotation-y={Math.PI / 2} />
        <Lightformer form="rect" intensity={3.4} color="#eef6ff" position={[11, 6, 7]} scale={[1.6, 15, 1]} rotation-y={-Math.PI / 2} />
        <Lightformer form="rect" intensity={1.4} color="#1fbf86" position={[0, -4, 4]} scale={[16, 4, 1]} />
      </Environment>

      {/* wet-black reflective floor */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[130, 130]} />
        <MeshReflectorMaterial
          color="#9aa1a8"
          metalness={0.5}
          roughness={0.55}
          mirror={0.4}
          blur={[300, 110]}
          mixStrength={3}
          mixBlur={1}
          resolution={512}
          depthScale={1}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.2}
        />
      </mesh>
      <ContactShadows position={[0, 0.012, 0]} scale={70} resolution={1024} blur={2.6} opacity={0.42} far={14} color="#2a3138" />
    </>
  )
}

export function SceneEnvironment({ orb = true, dark = false }: { orb?: boolean; dark?: boolean }) {
  if (dark) return <DarkStage />

  return (
    <>
      {orb && <BackdropOrb />}
      <fog attach="fog" args={[AERO.bgBottom, 46, 115]} />
      <hemisphereLight args={[0xffffff, 0xd6e2ec, 1.25]} />
      <directionalLight
        castShadow
        position={[14, 22, 12]}
        intensity={1.05}
        color={0xffffff}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={1}
        shadow-camera-far={95}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[-14, 10, -10]} intensity={0.55} color={0xcfe4ff} />
      <ambientLight intensity={0.68} color={0xeaf2fa} />

      <Environment resolution={512} frames={1}>
        <color attach="background" args={['#dfe8f2']} />
        <Lightformer intensity={2.8} position={[0, 7, -9]} scale={[12, 10, 1]} color="#ffffff" />
        <Lightformer form="rect" intensity={2.6} position={[-9, 5, 6]} scale={[2.2, 13, 1]} rotation-y={Math.PI / 2} color="#ffffff" />
        <Lightformer form="rect" intensity={2.6} position={[9, 5, 6]} scale={[2.2, 13, 1]} rotation-y={-Math.PI / 2} color="#dcefff" />
        <Lightformer form="ring" intensity={2} position={[0, 14, 2]} scale={[9, 9, 1]} rotation-x={Math.PI / 2} color="#ffffff" />
        <Lightformer intensity={0.8} position={[0, -6, 4]} scale={[14, 5, 1]} color="#cddce8" />
      </Environment>

      <ContactShadows position={[2, 0.012, 6]} scale={84} resolution={1024} blur={2.6} opacity={0.28} far={16} color="#4a5a6a" />
    </>
  )
}
