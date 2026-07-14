import { useEffect, useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Billboard, MeshTransmissionMaterial } from '@react-three/drei'
import { MathUtils, type Group, type Mesh } from 'three'
import {
  PROVENANCE,
  acuityColor,
  useOntologyStore,
  type Patient,
  type Vec3,
} from '../ontology'
import { makeRadialTexture } from '../scene/textures'

// ---------------------------------------------------------------------------
//  PATIENT NODE — a SATURATED CANDY-TRANSLUCENT jelly orb (Y2K clear-plastic).
//   • the shell is a saturated COOL-candy hue (blue / teal / cyan / purple),
//     varied per patient like the reference gadgets — hero (focus) refracts the
//     scene via real transmission, ambient uses cheap translucent glass.
//   • a glowing ACUITY-coloured faceted CORE floats inside (the "coloured guts"
//     seen through the clear shell), slowly tumbling.
//   • acuity also drives a soft NORMAL-BLEND colour halo (additive glow is
//     invisible on a light ground) + pulse.
//   • stateType drives PRESENCE (opacity/core), ANIMATABLE (C→A solidify).
//   • the group position GLIDES toward its target (transfers/arrivals travel).
// ---------------------------------------------------------------------------

const COOL_CANDY = ['#2e86e6', '#12c2b0', '#33cfe6', '#8b6fe6', '#2fb0d6']
const hashHue = (id: string) =>
  COOL_CANDY[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % COOL_CANDY.length]

const presence = (opacity: number) =>
  MathUtils.clamp((opacity - 0.32) / (1.0 - 0.32), 0, 1)

export function PatientNode({
  patient,
  position,
  hero,
}: {
  patient: Patient
  position: Vec3
  hero: boolean
}) {
  const groupRef = useRef<Group>(null)
  const matRef = useRef<any>(null)
  const coreRef = useRef<Mesh>(null)
  const coreMatRef = useRef<any>(null)
  const rimRef = useRef<any>(null)
  const auraRef = useRef<any>(null)
  const opacity = useRef(PROVENANCE[patient.stateType].opacity)
  const glow = useMemo(() => makeRadialTexture(), [])
  const aura = acuityColor[patient.acuity]
  const shell = useMemo(() => hashHue(patient.id), [patient.id])
  const setFocus = useOntologyStore((s) => s.setFocus)

  useEffect(() => {
    groupRef.current?.position.set(position[0], position[1], position[2])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useFrame((state, dt) => {
    const g = groupRef.current
    if (g) {
      g.position.x = MathUtils.damp(g.position.x, position[0], 3.2, dt)
      g.position.y = MathUtils.damp(g.position.y, position[1], 3.2, dt)
      g.position.z = MathUtils.damp(g.position.z, position[2], 3.2, dt)
    }

    const target = PROVENANCE[patient.stateType].opacity
    opacity.current = MathUtils.damp(opacity.current, target, 4, dt)
    const p = presence(opacity.current)

    const m = matRef.current
    if (m) {
      m.opacity = (hero ? 0.18 : 0.42) + 0.5 * opacity.current
      if (hero) {
        m.transmission = 0.5 + 0.45 * p
        m.thickness = 0.8 + 1.0 * p
      }
    }
    if (coreRef.current) coreRef.current.rotation.y += dt * 0.5
    if (coreMatRef.current) coreMatRef.current.emissiveIntensity = 0.3 + 1.0 * p
    if (rimRef.current) rimRef.current.opacity = 0.12 + 0.22 * p
    if (auraRef.current) {
      const t = state.clock.elapsedTime
      const pulse =
        patient.acuity === 'critical'
          ? 0.5 + 0.5 * Math.sin(t * 3.4)
          : patient.acuity === 'elevated'
            ? 0.62 + 0.38 * Math.sin(t * 1.8)
            : 0.85
      auraRef.current.opacity = (0.18 + 0.4 * p) * pulse
    }
  })

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    setFocus(patient.id)
  }

  return (
    <group ref={groupRef}>
      {/* acuity aura — soft NORMAL-blend colour halo (visible on light ground) */}
      <Billboard>
        <mesh position={[0, 0, -0.06]}>
          <planeGeometry args={[2.5, 2.5]} />
          <meshBasicMaterial
            ref={auraRef}
            map={glow}
            color={aura}
            transparent
            opacity={0.32}
            depthWrite={false}
          />
        </mesh>
      </Billboard>

      {/* glowing faceted CORE inside the jelly (the "coloured guts") */}
      <mesh ref={coreRef} scale={0.5}>
        <icosahedronGeometry args={[0.5, 1]} />
        <meshStandardMaterial
          ref={coreMatRef}
          color={aura}
          emissive={aura}
          emissiveIntensity={0.8}
          roughness={0.35}
          metalness={0.1}
          toneMapped={false}
        />
      </mesh>

      {/* saturated candy-translucent shell */}
      <mesh
        onClick={onClick}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = 'auto')}
      >
        <sphereGeometry args={[0.54, 64, 64]} />
        {hero ? (
          <MeshTransmissionMaterial
            ref={matRef}
            transmission={0.95}
            thickness={1.3}
            roughness={0.1}
            ior={1.33}
            chromaticAberration={0.06}
            distortion={0.14}
            distortionScale={0.3}
            temporalDistortion={0}
            backside
            samples={6}
            resolution={256}
            color="#eaf6ff"
            attenuationColor={shell}
            attenuationDistance={0.5}
            transparent
          />
        ) : (
          <meshPhysicalMaterial
            ref={matRef}
            color={shell}
            metalness={0}
            roughness={0.08}
            clearcoat={1}
            clearcoatRoughness={0.06}
            ior={1.3}
            envMapIntensity={1.2}
            transparent
            opacity={0.68}
          />
        )}
      </mesh>

      {/* subtle colour rim (normal blend) */}
      <mesh scale={1.13}>
        <sphereGeometry args={[0.54, 32, 32]} />
        <meshBasicMaterial ref={rimRef} color={shell} transparent opacity={0.18} depthWrite={false} />
      </mesh>

      {/* base ring anchoring the node above its bed */}
      <mesh position={[0, -0.68, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.5, 0.64, 40]} />
        <meshBasicMaterial color={aura} transparent opacity={0.55} depthWrite={false} />
      </mesh>
    </group>
  )
}
