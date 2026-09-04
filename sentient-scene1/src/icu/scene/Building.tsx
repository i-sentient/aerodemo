import { useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { Edges, Line, MeshReflectorMaterial } from '@react-three/drei'
import { AdditiveBlending, CanvasTexture, Color, MathUtils, SRGBColorSpace, type Group, type Mesh, type MeshBasicMaterial } from 'three'
import { CText, type Vec3 } from '../ontology'
import { hdrCss } from './glow'

// ===========================================================================
//  ICU — GREYBOX FLOORPLAN
//  A round room (half the ER drum's footprint): a glowing circular zone with a
//  ring of greybox beds. Seven beds are plain "occupied". One HERO bed runs the
//  de-escalation → shift-out → clean lifecycle, advanced by the step counter.
//
//  Bed-local frame: head = -z (outer wall), foot = +z (centre).
// ===========================================================================

// --- state colour grammar --------------------------------------------------
const GREEN = CText.green // flagged for de-escalation (stable to move)
const VIOLET = '#9b6dff'  // the patient presence orb
const BROWN = '#a06b3c'   // bed dirty / needs making
const BLUE = '#4ba8ff'    // clean & ready
const RED = '#ff5a5a'     // inbound critical patient
const REST = '#8fbbe2'    // beds at rest (light blue)
const REST_EDGE = '#5c93cc' // neutral outline for occupied beds (not green!)
const MATT = '#a9cdec'    // mattress at rest (lighter blue)
const PULSE = 4.6         // blink / pulse rate

// --- room layout -----------------------------------------------------------
const R_ICU = 9
const N_BEDS = 8
const R_BED = 7.0
const CENTER: Vec3 = [0, 0, 3]
const HERO = 7 // front-right bed — the lifecycle plays out here

const BED_SLOTS = Array.from({ length: N_BEDS }, (_, i) => {
  const a = (i / N_BEDS) * Math.PI * 2
  return {
    index: i,
    position: [CENTER[0] + Math.cos(a) * R_BED, 0, CENTER[2] + Math.sin(a) * R_BED] as Vec3,
    rotationY: -Math.PI / 2 - a,
  }
})

// base-footprint border, bed-local (front/back tightened to hug the ends)
const BORDER_PTS: Vec3[] = (() => {
  const y = 0.03, hw = 0.82, hl = 1.22
  return [
    [-hw, y, -hl],
    [hw, y, -hl],
    [hw, y, hl],
    [-hw, y, hl],
    [-hw, y, -hl],
  ]
})()

// --- "ICU" floor decal texture (blue text on transparent) ------------------
const icuTex = (() => {
  const cv = document.createElement('canvas')
  cv.width = 640
  cv.height = 320
  const c = cv.getContext('2d')!
  c.clearRect(0, 0, 640, 320)
  c.fillStyle = '#4ba8ff'
  c.font = '800 210px system-ui, "Segoe UI", sans-serif'
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  ;(c as unknown as { letterSpacing: string }).letterSpacing = '24px'
  c.fillText('ICU', 320 + 12, 168)
  const tex = new CanvasTexture(cv)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 8
  return tex
})()

// --- reusable frosted greybox with a holographic edge outline --------------
function FrostBox({
  size,
  position = [0, 0, 0],
  edge = CText.blue,
  opacity = 0.9,
  children,
}: {
  size: Vec3
  position?: Vec3
  edge?: string
  opacity?: number
  children?: ReactNode
}) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={REST} transparent opacity={opacity} roughness={0.28} metalness={0.1} envMapIntensity={0.9} />
      <Edges scale={1.001} threshold={15} color={edge} lineWidth={1.6} />
      {children}
    </mesh>
  )
}

// --- reflective aero floor -------------------------------------------------
function AeroFloor() {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, -0.12, 3]} receiveShadow>
      <planeGeometry args={[110, 110]} />
      <MeshReflectorMaterial
        resolution={512}
        mixBlur={1.0}
        mixStrength={2.2}
        blur={[320, 110]}
        roughness={0.55}
        depthScale={0.8}
        minDepthThreshold={0.5}
        maxDepthThreshold={1.2}
        color="#e0eaf1"
        metalness={0.2}
        mirror={0.22}
      />
    </mesh>
  )
}

// --- round zone footprint (glowing circle on the floor) --------------------
function CircleZone({ center, radius, color }: { center: Vec3; radius: number; color: string }) {
  const [cx, cy, cz] = center
  const y = cy + 0.02
  const SEG = 96
  const pts: Vec3[] = Array.from({ length: SEG + 1 }, (_, i) => {
    const a = (i / SEG) * Math.PI * 2
    return [cx + Math.cos(a) * radius, y, cz + Math.sin(a) * radius]
  })
  return <Line points={pts} color={color} lineWidth={2.2} transparent opacity={0.85} />
}

// --- a sleeping "blob" patient (abstract) lying on the bed -----------------
function BlobPatient() {
  return (
    <group>
      <mesh position={[0, 0.74, 0.12]} rotation-x={Math.PI / 2} castShadow>
        <capsuleGeometry args={[0.3, 1.02, 6, 14]} />
        <meshStandardMaterial color="#6f97c4" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.72, -0.8]} castShadow>
        <sphereGeometry args={[0.18, 20, 20]} />
        <meshStandardMaterial color="#c99b74" roughness={0.65} />
      </mesh>
    </group>
  )
}

// --- a plain occupied ICU bed (the 7 non-hero beds) ------------------------
function ICUBed({ position, rotationY, label }: { position: Vec3; rotationY: number; label: string }) {
  const edge = REST_EDGE
  return (
    <group position={position} rotation-y={rotationY} name={label}>
      <FrostBox size={[1.5, 0.4, 2.4]} position={[0, 0.2, 0]} edge={edge} />
      <mesh position={[0, 0.46, 0]} castShadow>
        <boxGeometry args={[1.3, 0.16, 2.1]} />
        <meshPhysicalMaterial color={MATT} roughness={0.2} metalness={0.05} clearcoat={0.8} clearcoatRoughness={0.2} transparent opacity={0.78} envMapIntensity={0.9} />
        <Edges scale={1.001} threshold={15} color={edge} lineWidth={1.4} />
      </mesh>
      <FrostBox size={[1.5, 0.5, 0.12]} position={[0, 0.6, -1.06]} edge={edge} opacity={0.85} />
      <BlobPatient />
    </group>
  )
}

const _c1 = new Color()
const _c2 = new Color()
// damped setter: lerp colour + emissive toward target so changes fade, not snap
const lerpMat = (m: any, color: string, emissive: string, ei: number, f: number) => {
  if (!m) return
  m.color.lerp(_c1.set(color), f)
  m.emissive.lerp(_c2.set(emissive), f)
  m.emissiveIntensity += (ei - m.emissiveIntensity) * f
}

// --- the HERO bed: de-escalation → shift → clean → inbound lifecycle --------
//  steps: <2 occupied · 2 flagged(green) · 3 violet orb grows→blink · 4 orb
//         shrinks→brown blink · 5 clean(blue) · 6 red orb + red halo in ·
//         7 red orb → dummy patient solidifies. border + edges follow colour.
function HeroBed({ position, rotationY, step, flagged }: { position: Vec3; rotationY: number; step: number; flagged?: boolean }) {
  const baseMat = useRef<any>(null)
  const headMat = useRef<any>(null)
  const mattMat = useRef<any>(null)
  const baseEdge = useRef<any>(null)
  const headEdge = useRef<any>(null)
  const mattEdge = useRef<any>(null)
  const border = useRef<any>(null)
  const orbGrp = useRef<Group>(null)
  const orbAura = useRef<Mesh>(null)
  const orbGlow = useRef<Mesh>(null)
  const redGrp = useRef<Group>(null)
  const redAura = useRef<Mesh>(null)
  const redGlow = useRef<Mesh>(null)
  const halo = useRef<Mesh>(null)
  const blob = useRef<Group>(null)
  const dummy = useRef<Group>(null)
  const os = useRef(0) // violet orb scale
  const rs = useRef(0) // red orb scale
  const ds = useRef(0) // dummy inbound-patient scale

  useFrame((s, dt) => {
    const t = s.clock.elapsedTime
    const f = 1 - Math.exp(-7 * dt) // colour damping → smooth fades, no snaps
    const pulse = 0.5 + 0.5 * Math.sin(t * PULSE)
    const bob = 0.98 + 0.06 * Math.sin(t * 1.4)

    // orb / dummy scales
    os.current = MathUtils.damp(os.current, step === 3 ? 1 : 0, 3.5, dt)
    rs.current = MathUtils.damp(rs.current, step === 6 ? 1 : 0, 3.5, dt)
    ds.current = MathUtils.damp(ds.current, step >= 7 ? 1 : 0, 3.5, dt)
    const grown = step === 3 && os.current > 0.97
    const shrunk = step >= 4 && os.current < 0.03

    // phase → fill (bed body) · mark (border/edges/halo accent) · blink
    let fill: string = REST
    let mark: string = REST_EDGE
    let blink = false
    if (step === 2) { if (flagged) { fill = GREEN; mark = GREEN } }
    else if (step === 3) { fill = GREEN; mark = GREEN; blink = grown }
    else if (step === 4) { const c = shrunk ? BROWN : GREEN; fill = c; mark = c; blink = true }
    else if (step === 5) { fill = BLUE; mark = BLUE }
    else if (step === 6 || step === 7) { fill = REST; mark = RED } // inbound: occupied, red accent
    else if (step >= 8) { fill = RED; mark = RED; blink = true } // deterioration: bed blinks red

    const blinkOn = Math.sin(t * PULSE) > 0
    const showFill = !blink || blinkOn
    const emis = blink && blinkOn ? 1.1 : 0

    lerpMat(baseMat.current, showFill ? fill : REST, fill, emis, f)
    lerpMat(headMat.current, showFill ? fill : REST, fill, emis, f)
    lerpMat(mattMat.current, showFill ? fill : MATT, fill, emis, f)

    const edgeCol = step >= 2 ? mark : REST_EDGE
    for (const r of [baseEdge, headEdge, mattEdge]) {
      const m = r.current?.material
      if (m) m.color.lerp(_c1.set(edgeCol), f)
    }
    if (border.current) {
      const bm = border.current.material
      if (bm) {
        bm.color.lerp(_c1.set(mark), f)
        bm.opacity += ((step >= 2 ? 1 : 0) - bm.opacity) * f
      }
    }

    // violet orb (de-escalation)
    if (orbGrp.current) { orbGrp.current.scale.setScalar(os.current); orbGrp.current.position.y = bob }
    const va = orbAura.current?.material as MeshBasicMaterial | undefined
    if (va) va.opacity = 0.3 + 0.28 * pulse
    const vg = orbGlow.current?.material as MeshBasicMaterial | undefined
    if (vg) vg.opacity = 0.25 + 0.2 * pulse

    // red orb (inbound)
    if (redGrp.current) { redGrp.current.scale.setScalar(rs.current); redGrp.current.position.y = bob }
    const on = rs.current > 0.01 ? 1 : 0
    const ra = redAura.current?.material as MeshBasicMaterial | undefined
    if (ra) ra.opacity = (0.3 + 0.28 * pulse) * on
    const rg = redGlow.current?.material as MeshBasicMaterial | undefined
    if (rg) rg.opacity = (0.25 + 0.2 * pulse) * on

    // red arrival halo pooled under the bed
    const hm = halo.current?.material as MeshBasicMaterial | undefined
    if (hm) hm.opacity += ((step >= 6 ? 0.16 + 0.16 * pulse : 0) - hm.opacity) * f

    // dummy inbound patient solidifies in
    if (dummy.current) {
      dummy.current.scale.setScalar(ds.current)
      dummy.current.visible = ds.current > 0.01
    }

    // original de-escalated blob stays until the violet orb grows in
    if (blob.current) blob.current.visible = step < 4 && os.current < 0.45
  })

  return (
    <group position={position} rotation-y={rotationY} name="HERO">
      {/* base */}
      <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.5, 0.4, 2.4]} />
        <meshStandardMaterial ref={baseMat} color={REST} emissive={GREEN} emissiveIntensity={0} transparent opacity={0.9} roughness={0.28} metalness={0.1} envMapIntensity={0.9} />
        <Edges ref={baseEdge} scale={1.001} threshold={15} color={REST_EDGE} lineWidth={1.6} />
      </mesh>
      {/* mattress */}
      <mesh position={[0, 0.46, 0]} castShadow>
        <boxGeometry args={[1.3, 0.16, 2.1]} />
        <meshStandardMaterial ref={mattMat} color={MATT} emissive={GREEN} emissiveIntensity={0} transparent opacity={0.8} roughness={0.2} metalness={0.05} envMapIntensity={0.9} />
        <Edges ref={mattEdge} scale={1.001} threshold={15} color={REST_EDGE} lineWidth={1.4} />
      </mesh>
      {/* headboard */}
      <mesh position={[0, 0.6, -1.06]} castShadow receiveShadow>
        <boxGeometry args={[1.5, 0.5, 0.12]} />
        <meshStandardMaterial ref={headMat} color={REST} emissive={GREEN} emissiveIntensity={0} transparent opacity={0.85} roughness={0.28} metalness={0.1} envMapIntensity={0.9} />
        <Edges ref={headEdge} scale={1.001} threshold={15} color={REST_EDGE} lineWidth={1.6} />
      </mesh>
      {/* base-footprint border (follows the state colour) */}
      <Line ref={border} points={BORDER_PTS} color={GREEN} lineWidth={6} transparent opacity={0} toneMapped={false} />
      {/* red arrival halo (soft glow pooled under the bed) */}
      <mesh ref={halo} position={[0, 0.02, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[1.7, 48]} />
        <meshBasicMaterial color={hdrCss(RED, 1.4)} transparent opacity={0} depthWrite={false} toneMapped={false} blending={AdditiveBlending} />
      </mesh>
      {/* original blob patient (hidden once the violet orb grows in) */}
      <group ref={blob}>
        <BlobPatient />
      </group>
      {/* inbound dummy patient (solidifies in on step 7) */}
      <group ref={dummy} visible={false}>
        <BlobPatient />
      </group>
      {/* violet patient orb (de-escalation) */}
      <group ref={orbGrp} position={[0, 0.98, -0.1]} scale={0}>
        <mesh>
          <sphereGeometry args={[0.4, 32, 24]} />
          <meshBasicMaterial color={hdrCss(VIOLET, 2.4)} toneMapped={false} />
        </mesh>
        <mesh ref={orbAura} scale={1.55}>
          <sphereGeometry args={[0.4, 24, 18]} />
          <meshBasicMaterial color={hdrCss(VIOLET, 1.6)} toneMapped={false} transparent opacity={0.35} depthWrite={false} blending={AdditiveBlending} />
        </mesh>
        <mesh ref={orbGlow} scale={2.3}>
          <sphereGeometry args={[0.4, 20, 14]} />
          <meshBasicMaterial color={hdrCss(VIOLET, 1.2)} toneMapped={false} transparent opacity={0.22} depthWrite={false} blending={AdditiveBlending} />
        </mesh>
      </group>
      {/* red patient orb (inbound) */}
      <group ref={redGrp} position={[0, 0.98, -0.1]} scale={0}>
        <mesh>
          <sphereGeometry args={[0.4, 32, 24]} />
          <meshBasicMaterial color={hdrCss(RED, 2.4)} toneMapped={false} />
        </mesh>
        <mesh ref={redAura} scale={1.55}>
          <sphereGeometry args={[0.4, 24, 18]} />
          <meshBasicMaterial color={hdrCss(RED, 1.6)} toneMapped={false} transparent opacity={0} depthWrite={false} blending={AdditiveBlending} />
        </mesh>
        <mesh ref={redGlow} scale={2.3}>
          <sphereGeometry args={[0.4, 20, 14]} />
          <meshBasicMaterial color={hdrCss(RED, 1.2)} toneMapped={false} transparent opacity={0} depthWrite={false} blending={AdditiveBlending} />
        </mesh>
      </group>
    </group>
  )
}

// ===========================================================================
export function Building({ step = 0, flagged = false }: { step?: number; flagged?: boolean }) {
  return (
    <group>
      <AeroFloor />
      <CircleZone center={CENTER} radius={R_ICU} color={CText.blue} />
      {/* ICU floor decal, flat in the centre */}
      <mesh position={[CENTER[0], 0.02, CENTER[2]]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[6.4, 3.2]} />
        <meshBasicMaterial map={icuTex} transparent opacity={0.9} depthWrite={false} toneMapped={false} />
      </mesh>
      {BED_SLOTS.map((s) =>
        s.index === HERO ? (
          <HeroBed key={s.index} position={s.position} rotationY={s.rotationY} step={step} flagged={flagged} />
        ) : (
          <ICUBed key={s.index} position={s.position} rotationY={s.rotationY} label={`Bed ${s.index + 1}`} />
        ),
      )}
    </group>
  )
}
