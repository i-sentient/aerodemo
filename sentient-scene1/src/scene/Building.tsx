import { useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { Edges, Html, Line, MeshReflectorMaterial } from '@react-three/drei'
import {
  AERO,
  ALL_LOCATIONS,
  CText,
  LOCATIONS,
  bedStatusColor,
  isBed,
  useOntologyStore,
  type Bed,
  type LocationNode,
  type Vec3,
} from '../ontology'
import { hdrCss } from './glow'

// ===========================================================================
//  GREYBOX BUILDING
//  Simple frosted boxes forming the floorplan, every bay/bed placed from
//  `locationRegistry` (the ONLY source of world transforms). Each bed/bay is a
//  named <GreyboxBed>. A clean seam is marked so a Blender GLB can drop in
//  later with the same transform + props and nothing else changes.
// ===========================================================================

// --- shared bits -----------------------------------------------------------
const FROST = AERO.frost

/** A tiny frosted glass label chip that floats over a node. */
function Label({
  position,
  title,
  sub,
  accent = CText.blue,
}: {
  position: Vec3
  title: string
  sub?: string
  accent?: string
}) {
  return (
    <Html position={position} center distanceFactor={14} zIndexRange={[10, 0]}>
      <div
        style={{
          pointerEvents: 'none',
          transform: 'translateY(-50%)',
          whiteSpace: 'nowrap',
          background: AERO.chip,
          border: `1px solid ${AERO.chipBorder}`,
          borderRadius: 8,
          padding: '3px 8px',
          font: '600 12px/1.2 ui-sans-serif, system-ui, sans-serif',
          color: AERO.ink,
          boxShadow: '0 4px 16px rgba(0,8,26,0.5)',
          backdropFilter: 'blur(7px)',
        }}
      >
        <span style={{ color: accent }}>{title}</span>
        {sub && (
          <span style={{ color: AERO.inkDim, fontWeight: 500 }}> · {sub}</span>
        )}
      </div>
    </Html>
  )
}

/** Reusable frosted greybox mesh with a holographic edge outline.
 *  `blink` makes the outline pulse like a notification (attention needed). */
function FrostBox({
  size,
  position = [0, 0, 0],
  edge = CText.blue,
  opacity = 0.9,
  blink = false,
  children,
}: {
  size: Vec3
  position?: Vec3
  edge?: string
  opacity?: number
  blink?: boolean
  children?: ReactNode
}) {
  const edgesRef = useRef<any>(null)
  useFrame((s) => {
    const m = edgesRef.current?.material
    if (!m) return
    if (blink) {
      m.transparent = true
      // ~1.5 Hz notification blink (bright ↔ dim, never fully off)
      m.opacity = (s.clock.elapsedTime * 1.5) % 1 < 0.5 ? 1 : 0.16
    } else if (m.opacity !== 1) {
      m.opacity = 1
    }
  })
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={FROST}
        transparent
        opacity={opacity}
        roughness={0.28}
        metalness={0.1}
        envMapIntensity={0.9}
      />
      <Edges ref={edgesRef} scale={1.001} threshold={15} color={edge} lineWidth={blink ? 3.5 : 1.6} />
      {children}
    </mesh>
  )
}

// --- reflective aero floor -------------------------------------------------
function AeroFloor() {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[2, -0.12, 6]} receiveShadow>
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

// --- zone footprint (glowing rectangle on the floor) -----------------------
function ZoneOutline({
  center,
  size,
  color,
  label,
}: {
  center: Vec3
  size: [number, number]
  color: string
  label: string
}) {
  const [cx, cy, cz] = center
  const [w, d] = size
  const y = cy + 0.02
  const hw = w / 2
  const hd = d / 2
  const pts: Vec3[] = [
    [cx - hw, y, cz - hd],
    [cx + hw, y, cz - hd],
    [cx + hw, y, cz + hd],
    [cx - hw, y, cz + hd],
    [cx - hw, y, cz - hd],
  ]
  return (
    <>
      <Line points={pts} color={color} lineWidth={2.2} transparent opacity={0.85} />
      <Label position={[cx - hw + 1.1, y + 0.02, cz - hd + 0.5]} title={label} accent={color} />
    </>
  )
}

// --- a single bed / bay ----------------------------------------------------
function GreyboxBed({ loc, bed }: { loc: LocationNode; bed?: Bed }) {
  const status = bed?.status ?? 'vacant'
  const halo = bedStatusColor[status]
  const isBay = loc.role === 'bay'
  // "attention" states blink the outline like a notification
  const notify = status === 'warming' || status === 'dirty' || status === 'reserved'
  const edge = notify ? halo : isBay ? CText.blue : CText.green

  return (
    <group position={loc.position} rotation-y={loc.rotationY ?? 0} name={loc.id}>
      {/* ───────────────────────────────────────────────────────────────
          SEAM: replace this whole greybox group with <BedGLB url=… /> later.
          It only depends on loc.position/rotation (from the registry) and the
          bed status → nothing outside this group needs to change.
         ─────────────────────────────────────────────────────────────── */}

      {/* base frame */}
      <FrostBox size={[1.5, 0.4, 2.4]} position={[0, 0.2, 0]} edge={edge} blink={notify} />
      {/* mattress */}
      <mesh position={[0, 0.46, 0]} castShadow>
        <boxGeometry args={[1.3, 0.16, 2.1]} />
        <meshPhysicalMaterial color="#eef4fb" roughness={0.2} metalness={0.05} clearcoat={0.8} clearcoatRoughness={0.2} transparent opacity={0.78} envMapIntensity={0.9} />
      </mesh>
      {/* headboard */}
      <FrostBox size={[1.5, 0.5, 0.12]} position={[0, 0.6, -1.06]} edge={edge} blink={notify} opacity={0.85} />

      {/* status halo on the floor (bedStatusColor grammar); warming → HDR bloom */}
      <mesh position={[0, 0.03, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[1.15, 1.42, 56]} />
        <meshBasicMaterial
          color={status === 'warming' ? hdrCss(halo, 1.8) : halo}
          transparent
          opacity={status === 'warming' ? 0.9 : status === 'occupied' ? 0.5 : 0.62}
          depthWrite={false}
          toneMapped={status !== 'warming'}
        />
      </mesh>

      <Label
        position={[0, 1.2, 0]}
        title={loc.label}
        sub={status}
        accent={edge}
      />
    </group>
  )
}

// --- inbound staging holo-pad (where the ghost patient will hover) ---------
function StagingPad() {
  const [x, , z] = LOCATIONS['staging'].position
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.03, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[1.0, 1.35, 56]} />
        <meshBasicMaterial color={CText.amber} transparent opacity={0.72} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.02, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[1.0, 48]} />
        <meshBasicMaterial color={CText.amber} transparent opacity={0.12} depthWrite={false} />
      </mesh>
      <Label position={[0, 0.4, 0]} title="Inbound staging" accent={CText.amber} />
    </group>
  )
}

// --- ambulance greybox (offscreen origin of the inbound arc) ---------------
function Ambulance() {
  const p = LOCATIONS['ambulance'].position
  return (
    <group position={p} rotation-y={0.4}>
      <mesh position={[0, 0, 0]} castShadow>
        <boxGeometry args={[2.2, 1.6, 4.2]} />
        <meshStandardMaterial color="#c2ccd4" roughness={0.32} metalness={0.5} envMapIntensity={1.0} />
        <Edges scale={1.001} threshold={20} color={CText.coral} />
      </mesh>
      <mesh position={[0, -0.1, 2.5]} castShadow>
        <boxGeometry args={[2.0, 1.2, 1.2]} />
        <meshStandardMaterial color="#d4dde4" roughness={0.3} metalness={0.45} envMapIntensity={1.0} />
      </mesh>
      <Label position={[0, 1.5, 0]} title="Ambulance" sub="inbound" accent={CText.coral} />
    </group>
  )
}

// ===========================================================================
export function Building() {
  // reactive but low-frequency: bed statuses change on episode beats, not per frame
  const beds = useOntologyStore(
    (s) => Object.values(s.entities).filter(isBed) as Bed[],
  )
  const bedByLoc = useMemo(() => {
    const m = new Map<string, Bed>()
    for (const b of beds) m.set(b.locationId, b)
    return m
  }, [beds])

  const placeable = ALL_LOCATIONS.filter(
    (l) => l.role === 'bay' || l.role === 'bed',
  )

  return (
    <group>
      <AeroFloor />

      {/* single ER zone footprint */}
      <ZoneOutline center={[0, 0, 3]} size={[15, 16]} color={CText.blue} label="EMERGENCY" />

      {/* every ER bay, placed from the registry */}
      {placeable.map((l) => (
        <GreyboxBed key={l.id} loc={l} bed={bedByLoc.get(l.id)} />
      ))}

      <StagingPad />
      <Ambulance />
    </group>
  )
}
