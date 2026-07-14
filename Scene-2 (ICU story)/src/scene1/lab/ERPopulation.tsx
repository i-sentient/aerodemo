import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { DoubleSide, type Group, type Mesh, type MeshBasicMaterial, type MeshStandardMaterial } from 'three'
import { BED_SLOTS } from '../scene/RoundER'
import { hdrCss } from '../scene/glow'
import { tableTex, tarsScreenTex, inboundAlertTex, tarsAwaitingTex, tarsIcuTex, samAwaitingTex, samStemiTex } from './screenTex'

// ===========================================================================
//  ER POPULATION (lab mock) — everything is an abstract REPRESENTATION, nothing
//  literal. Patients + nurses (matte mannequins), an abstract 3-tab bedside
//  console (blank glowing tabs), IV poles, and one big central command box the
//  nurses fiddle with. Judged from the nurse's inside-out POV.
//
//  Bed-local frame: head = -z (out to glass), foot = +z (in to centre).
// ===========================================================================

const SKIN = '#c3c8cf'
const BLANKET = '#e2e8ef'
const SCRUB = '#4fb2c6'
const CHROME = '#cdd3d9'
const TAB = ['#7fd7ff', '#5fe3c0', '#ffb37a'] // abstract tab tints — no content

// every bay occupied except bed 4 — the single open bay the new patient lands in
const OCCUPIED = [0, 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]

// --- simple matte figure ----------------------------------------------------
function Mannequin({ pose, color = SKIN }: { pose: 'lying' | 'standing'; color?: string }) {
  if (pose === 'lying') {
    return (
      <group>
        <mesh position={[0, 0.62, 0.15]} rotation-x={Math.PI / 2}>
          <capsuleGeometry args={[0.3, 1.05, 6, 14]} />
          <meshStandardMaterial color={BLANKET} roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.66, -0.82]}>
          <sphereGeometry args={[0.185, 20, 20]} />
          <meshStandardMaterial color={SKIN} roughness={0.7} />
        </mesh>
      </group>
    )
  }
  return (
    <group>
      <mesh position={[0, 0.92, 0]} castShadow>
        <capsuleGeometry args={[0.23, 0.92, 6, 14]} />
        <meshStandardMaterial color={color} roughness={0.72} />
      </mesh>
      <mesh position={[0, 1.63, 0]} castShadow>
        <sphereGeometry args={[0.185, 20, 20]} />
        <meshStandardMaterial color={SKIN} roughness={0.7} />
      </mesh>
    </group>
  )
}

// --- IV pole ----------------------------------------------------------------
function IVPole({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.16, 0.18, 0.06, 16]} />
        <meshStandardMaterial color="#b9c0c7" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.95, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 1.85, 12]} />
        <meshStandardMaterial color={CHROME} metalness={0.9} roughness={0.24} />
      </mesh>
      <mesh position={[0.12, 1.6, 0]}>
        <boxGeometry args={[0.13, 0.24, 0.05]} />
        <meshStandardMaterial color="#e6eef5" transparent opacity={0.85} roughness={0.4} />
      </mesh>
    </group>
  )
}

// --- abstract bedside "Switch" console: 3 blank glowing tabs, on an angled stand
function BedsideConsole() {
  return (
    <group position={[1.05, 0, 0.05]}>
      <mesh position={[0, 0.04, 0]}>
        <cylinderGeometry args={[0.2, 0.24, 0.08, 20]} />
        <meshStandardMaterial color="#b9c0c7" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.52, 0]}>
        <cylinderGeometry args={[0.045, 0.05, 1.0, 16]} />
        <meshStandardMaterial color={CHROME} metalness={0.9} roughness={0.24} />
      </mesh>
      {/* screen faces the room CENTRE (bed-local +z = toward the hub/nurse),
          NOT the patient — angled up a touch for the standing nurse */}
      <group position={[0, 1.02, 0.42]} rotation={[-0.22, 0, 0]}>
        <RoundedBox args={[1.3, 0.58, 0.07]} radius={0.05} smoothness={3}>
          <meshStandardMaterial color="#141a21" metalness={0.5} roughness={0.42} />
        </RoundedBox>
        {[-0.42, 0, 0.42].map((x, i) => (
          <mesh key={i} position={[x, 0, 0.04]}>
            <planeGeometry args={[0.36, 0.46]} />
            <meshBasicMaterial color={hdrCss(TAB[i], 1.05)} toneMapped={false} transparent opacity={0.85} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

// --- pulsing amber "inbound" alert chip, top-right of a console screen -------
function InboundChip({ step }: { step: number }) {
  const ref = useRef<Mesh>(null)
  useFrame((s) => {
    const m = ref.current?.material as MeshBasicMaterial | undefined
    // urgent pulse while alarming (<4); calm waiting pulse; livelier "transmitting" once talking to ICU (>=7)
    const speed = step < 4 ? 3 : step < 7 ? 1.4 : 2.1
    if (m) m.opacity = 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(s.clock.elapsedTime * speed))
  })
  const tex = step < 4 ? inboundAlertTex : step < 7 ? tarsAwaitingTex : tarsIcuTex
  return (
    <mesh ref={ref} position={[0, 0.09, 0.28]} rotation-x={-Math.PI / 2}>
      <planeGeometry args={[2.7, 0.63]} />
      <meshBasicMaterial map={tex} toneMapped={false} transparent side={DoubleSide} />
    </mesh>
  )
}

// --- central command TABLE: a box base + a big angled glowing touch-screen ---
function CommandTable({ step }: { step: number }) {
  return (
    <group>
      {/* box base */}
      <RoundedBox args={[3.5, 0.88, 2.3]} radius={0.06} smoothness={3} position={[0, 0.44, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#aeb7c1" metalness={0.5} roughness={0.35} envMapIntensity={1} />
      </RoundedBox>
      {/* angled screen top — tilts up toward the nurse on the centre side */}
      <group position={[0, 0.92, 0]} rotation-x={-0.26}>
        <RoundedBox args={[3.34, 0.07, 2.14]} radius={0.04} smoothness={3}>
          <meshStandardMaterial color="#0b1117" metalness={0.4} roughness={0.4} />
        </RoundedBox>
        {/* ward map — shown until the alert fires (step 2) */}
        {step < 2 && (
          <mesh position={[0, 0.075, 0]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[3.18, 2.0]} />
            <meshBasicMaterial map={tableTex} toneMapped={false} side={DoubleSide} />
          </mesh>
        )}
        {/* from the SAM-analysis step on, the screen washes TARS copper. The earlier
            inbound-alert step keeps the black screen. Inset so a dark frame shows. */}
        {step >= 4 && (
          <mesh position={[0, 0.075, 0]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[3.0, 1.84]} />
            <meshBasicMaterial map={tarsScreenTex} toneMapped={false} side={DoubleSide} />
          </mesh>
        )}
        {step >= 2 && <InboundChip step={step} />}
      </group>
    </group>
  )
}

// --- beat-1: the open bay (bed 4) pulses amber "prepping" --------------------
function InboundRing({ step }: { step: number }) {
  const ring = useRef<Mesh>(null)
  const disc = useRef<Mesh>(null)
  const fade = useRef(1)
  useFrame((s, dt) => {
    const alerting = step < 4 // once the patient solidifies, stop pulsing → faint steady marker
    fade.current += ((alerting ? 1 : 0.18) - fade.current) * Math.min(1, dt * 2.5)
    const k = alerting ? 0.5 + 0.5 * Math.sin(s.clock.elapsedTime * 3) : 1
    const rm = ring.current?.material as MeshBasicMaterial | undefined
    if (rm) rm.opacity = fade.current * (0.42 + 0.38 * k)
    const dm = disc.current?.material as MeshBasicMaterial | undefined
    if (dm) dm.opacity = fade.current * (0.1 + 0.12 * k)
  })
  const p = BED_SLOTS[4].position
  return (
    <group position={[p[0], 0.055, p[2]]} rotation-x={-Math.PI / 2}>
      <mesh ref={disc} position={[0, 0, -0.004]}>
        <circleGeometry args={[2.25, 64]} />
        <meshBasicMaterial color={hdrCss('#ff4d4d', 1.4)} toneMapped={false} transparent opacity={0.2} depthWrite={false} />
      </mesh>
      <mesh ref={ring}>
        <ringGeometry args={[1.7, 2.25, 64]} />
        <meshBasicMaterial color={hdrCss('#ff4d4d', 2.2)} toneMapped={false} transparent opacity={0.8} depthWrite={false} />
      </mesh>
    </group>
  )
}

// --- beat-2: a soft glowing PRESENCE forms in the open bay (no body shape) ---
const GHOST = '#cbb6ff'
const GHOST_GLOW = '#9d63ff'
function GhostPresence({ step }: { step: number }) {
  const holder = useRef<Group>(null)
  const core = useRef<Mesh>(null)
  const aura = useRef<Mesh>(null)
  const glow = useRef<Mesh>(null)
  const prog = useRef(0)
  useFrame((s, dt) => {
    const dir = step >= 4 ? -1 : 1 // form in on beat 3; fade out as it solidifies on beat 4
    prog.current = Math.max(0, Math.min(1, prog.current + (dir * dt) / 1.2))
    const k = prog.current
    const breathe = 0.9 + 0.1 * Math.sin(s.clock.elapsedTime * 1.8)
    if (holder.current) holder.current.scale.setScalar((0.75 + 0.25 * k) * breathe)
    const fade = (r: Mesh | null, base: number) => {
      const m = r?.material as MeshBasicMaterial | undefined
      if (m) m.opacity = base * k
    }
    fade(core.current, 0.66)
    fade(aura.current, 0.2)
    fade(glow.current, 0.3)
  })
  const slot = BED_SLOTS[4]
  return (
    <group position={[slot.position[0], 0, slot.position[2]]} rotation-y={slot.rotationY}>
      <group ref={holder} position={[0, 1.0, 0]}>
        {/* soft glowing core */}
        <mesh ref={core} scale={[0.8, 0.72, 0.92]}>
          <sphereGeometry args={[0.5, 32, 24]} />
          <meshBasicMaterial color={hdrCss(GHOST_GLOW, 1.9)} toneMapped={false} transparent opacity={0} depthWrite={false} />
        </mesh>
        {/* fainter outer aura */}
        <mesh ref={aura} scale={[1.32, 1.16, 1.5]}>
          <sphereGeometry args={[0.5, 24, 18]} />
          <meshBasicMaterial color={hdrCss(GHOST, 1.0)} toneMapped={false} transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
      {/* soft light pooled on the bed under the presence */}
      <mesh ref={glow} position={[0, 0.5, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[1.05, 40]} />
        <meshBasicMaterial color={hdrCss(GHOST_GLOW, 1.2)} toneMapped={false} transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}

// --- beat-4: the presence SOLIDIFIES into a reclined, coloured patient -------
const GOWN = '#9cc0dd'      // soft-blue hospital gown / blanket
const SKINTONE = '#d8b28c'  // warm skin tone
function SolidPatient() {
  const grp = useRef<Group>(null)
  const prog = useRef(0)
  useFrame((_, dt) => {
    prog.current = Math.min(1, prog.current + dt / 1.0) // ~1s solidify
    const k = prog.current
    grp.current?.traverse((o) => {
      const m = (o as Mesh).material as MeshStandardMaterial | undefined
      if (m && m.transparent) m.opacity = k
    })
  })
  const slot = BED_SLOTS[4]
  return (
    <group position={slot.position} rotation-y={slot.rotationY}>
      <group ref={grp}>
        {/* raised backrest — the bed head cranked up (head end = -z) */}
        <RoundedBox args={[1.28, 0.55, 0.12]} radius={0.05} smoothness={3} position={[0, 0.92, -0.9]} rotation-x={0.5}>
          <meshStandardMaterial color="#cbd2d8" metalness={0.5} roughness={0.35} transparent opacity={0} />
        </RoundedBox>
        {/* legs under a blanket (flat, soft) */}
        <RoundedBox args={[0.8, 0.28, 1.1]} radius={0.13} smoothness={4} position={[0, 0.64, 0.5]}>
          <meshStandardMaterial color={GOWN} roughness={0.85} transparent opacity={0} />
        </RoundedBox>
        {/* torso, propped up — near-full rounding so it reads as a body, not a box */}
        <RoundedBox args={[0.74, 0.34, 0.86]} radius={0.16} smoothness={4} position={[0, 0.82, -0.32]} rotation-x={0.5}>
          <meshStandardMaterial color={GOWN} roughness={0.8} transparent opacity={0} />
        </RoundedBox>
        {/* rounded shoulders where the torso meets the head */}
        <mesh position={[0, 1.0, -0.62]} rotation-x={0.5} scale={[1, 0.6, 0.7]}>
          <sphereGeometry args={[0.34, 24, 20]} />
          <meshStandardMaterial color={GOWN} roughness={0.8} transparent opacity={0} />
        </mesh>
        {/* head, resting on the backrest */}
        <mesh position={[0, 1.28, -0.8]}>
          <sphereGeometry args={[0.22, 24, 24]} />
          <meshStandardMaterial color={SKINTONE} roughness={0.6} transparent opacity={0} />
        </mesh>
      </group>
    </group>
  )
}

// --- beat-5/6: bedside SAM console. beat 5 = "awaiting", pulsing as it thinks;
//     beat 6 = analysis lands → STEMI + admit, steady/solid -------------------
function SamConsole({ step }: { step: number }) {
  const scr = useRef<Mesh>(null)
  useFrame((s) => {
    const m = scr.current?.material as MeshBasicMaterial | undefined
    // "thinking" pulse while awaiting (beat 5); locks to solid once it resolves
    if (m) m.opacity = step < 6 ? 0.9 + 0.1 * Math.sin(s.clock.elapsedTime * 2.5) : 1
  })
  const tex = step < 6 ? samAwaitingTex : samStemiTex
  const slot = BED_SLOTS[4]
  return (
    <group position={slot.position} rotation-y={slot.rotationY}>
      {/* beside the bed, toward the foot; screen faces the aisle/camera (+z local) */}
      <group position={[1.4, 0, 0.7]}>
        <mesh position={[0, 0.04, 0]}>
          <cylinderGeometry args={[0.22, 0.26, 0.08, 20]} />
          <meshStandardMaterial color="#b9c0c7" metalness={0.8} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.62, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 1.2, 16]} />
          <meshStandardMaterial color={CHROME} metalness={0.9} roughness={0.24} />
        </mesh>
        <group position={[0, 1.32, 0]} rotation-y={-0.5}>
          <RoundedBox args={[1.5, 0.98, 0.06]} radius={0.04} smoothness={3} position={[0, 0, 0.09]}>
            <meshStandardMaterial color="#0b1117" metalness={0.4} roughness={0.4} />
          </RoundedBox>
          <mesh ref={scr} position={[0, 0, 0.13]}>
            <planeGeometry args={[1.42, 0.9]} />
            <meshBasicMaterial map={tex} toneMapped={false} transparent side={DoubleSide} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

export function ERPopulation({ step = 0 }: { step?: number }) {
  return (
    <group>
      {step >= 2 && <InboundRing step={step} />}
      {step >= 3 && step < 5 && <GhostPresence step={step} />}
      {step >= 4 && <SolidPatient />}
      {step >= 5 && <SamConsole step={step} />}
      {/* patients + abstract bedside consoles */}
      {BED_SLOTS.filter((s) => OCCUPIED.includes(s.index)).map((s) => (
        <group key={s.index} position={s.position} rotation-y={s.rotationY}>
          <Mannequin pose="lying" />
          <BedsideConsole />
          {[6, 11].includes(s.index) && <IVPole position={[-0.95, 0, -0.4]} />}
        </group>
      ))}

      {/* central big box + two nurses fiddling with it (the camera is a third) */}
      {/* central command island — two consoles facing OUT on each side, spread
          apart to leave a centre gap for the nurses */}
      <group position={[0, 0, 2.4]}>
        <CommandTable step={step} />
      </group>
      <group position={[0, 0, -2.4]} rotation-y={Math.PI}>
        <CommandTable step={step} />
      </group>
      {/* nurses stand in the centre BEHIND the counters, facing out at the ward */}
      <group position={[-0.7, 0, 0.85]}><Mannequin pose="standing" color={SCRUB} /></group>
      <group position={[0.7, 0, 0.85]}><Mannequin pose="standing" color={SCRUB} /></group>
      <group position={[-0.7, 0, -0.85]}><Mannequin pose="standing" color={SCRUB} /></group>
      <group position={[0.7, 0, -0.85]}><Mannequin pose="standing" color={SCRUB} /></group>
    </group>
  )
}
