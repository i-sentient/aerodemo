import { useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { type Group } from 'three'
import {
  AERO,
  C,
  autonomyColor,
  isOrder,
  useOntologyStore,
  type Order,
  type Vec3,
} from '../ontology'
import { patientNodePosition, addV, ORDER_OFFSET } from '../scene/anchors'
import { hdrCss } from '../scene/glow'

// ---------------------------------------------------------------------------
//  ORDER LAYER — Orders as glyphs, colored by AUTONOMY (the Autonomy Governor):
//    autonomous   → teal, steady (acts on its own)
//    autoConfirm  → amber
//    clinicalGated + proposed → CORAL, PULSES and WAITS for a human tap.
//  Tapping a gated order authorizes it → snaps to solid teal and commits its
//  proposed-move relation. Authorized/done orders read solid teal.
// ---------------------------------------------------------------------------

function orderChip(color: string): React.CSSProperties {
  return {
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
    font: '700 10px ui-sans-serif, system-ui, sans-serif',
    color: AERO.ink,
    background: AERO.chip,
    border: `1px solid ${color}`,
    borderRadius: 6,
    padding: '2px 7px',
    backdropFilter: 'blur(7px)',
  }
}

function OrderGlyph({
  order,
  position,
  onAuthorize,
}: {
  order: Order
  position: Vec3
  onAuthorize: () => void
}) {
  const gated = order.autonomy === 'clinicalGated'
  const committed = order.status === 'authorized' || order.status === 'done'
  const waiting = gated && order.status === 'proposed'
  const color = committed ? C.teal : autonomyColor[order.autonomy]

  const groupRef = useRef<Group>(null)
  const matRef = useRef<any>(null)

  useFrame((state) => {
    const g = groupRef.current
    if (!g) return
    if (waiting) {
      const pulse = 0.85 + 0.18 * Math.sin(state.clock.elapsedTime * 4)
      g.scale.setScalar(pulse)
      if (matRef.current) matRef.current.emissiveIntensity = 0.9 + 0.7 * Math.sin(state.clock.elapsedTime * 4)
    } else {
      g.scale.setScalar(1)
      if (matRef.current) matRef.current.emissiveIntensity = committed ? 1.15 : 0.55
    }
  })

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!waiting) return
    e.stopPropagation()
    onAuthorize()
  }

  const label = waiting
    ? `${order.kind} · WAITS · tap`
    : `${order.kind} · ${order.status}`

  return (
    <group position={position}>
      <group
        ref={groupRef}
        onClick={onClick}
        onPointerOver={() => waiting && (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = 'auto')}
      >
        <mesh>
          <octahedronGeometry args={[0.24, 0]} />
          <meshStandardMaterial
            ref={matRef}
            color={color}
            emissive={color}
            emissiveIntensity={0.55}
            roughness={0.3}
            metalness={0.2}
            transparent
            opacity={0.94}
            toneMapped={false}
          />
        </mesh>
        {waiting && (
          <mesh rotation-x={-Math.PI / 2} position={[0, -0.34, 0]}>
            <ringGeometry args={[0.3, 0.4, 32]} />
            <meshBasicMaterial
              color={hdrCss(color, 1.7)}
              transparent
              opacity={0.6}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        )}
      </group>

      <Html center position={[0, 0.5, 0]} zIndexRange={[7, 0]}>
        <div style={orderChip(color)}>{label}</div>
      </Html>
    </group>
  )
}

export function OrderLayer() {
  const entities = useOntologyStore((s) => s.entities)
  const authorizeOrder = useOntologyStore((s) => s.authorizeOrder)

  const orders = useMemo(
    () => Object.values(entities).filter(isOrder) as Order[],
    [entities],
  )
  // stack multiple orders per patient
  const stackIndex = useMemo(() => {
    const counts = new Map<string, number>()
    const idx = new Map<string, number>()
    for (const o of orders) {
      const n = counts.get(o.patientId) ?? 0
      idx.set(o.id, n)
      counts.set(o.patientId, n + 1)
    }
    return idx
  }, [orders])

  return (
    <group>
      {orders.map((o) => {
        const patient = entities[o.patientId]
        if (!patient || patient.entity !== 'patient') return null
        const i = stackIndex.get(o.id) ?? 0
        const pos = addV(patientNodePosition(patient), [
          ORDER_OFFSET[0],
          ORDER_OFFSET[1] - i * 0.72,
          ORDER_OFFSET[2],
        ])
        return (
          <OrderGlyph
            key={o.id}
            order={o}
            position={pos}
            onAuthorize={() => authorizeOrder(o.id)}
          />
        )
      })}
    </group>
  )
}
