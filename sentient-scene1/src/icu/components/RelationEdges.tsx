import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { QuadraticBezierLine } from '@react-three/drei'
import { QuadraticBezierCurve3, Vector3, type Mesh } from 'three'
import {
  RELATION_STYLE,
  committedStyleFor,
  useOntologyStore,
  type OntologyData,
  type Relation,
  type Vec3,
} from '../ontology'
import { resolveAnchor } from '../scene/anchors'
import { hdrCss } from '../scene/glow'

// ---------------------------------------------------------------------------
//  RELATION EDGES — every relation drawn as a QuadraticBezierLine in the edge
//  grammar (solid=committed, dashed=proposed, gold=reasoning). Animated kinds
//  (inbound / data-flow / reasoning) also get a traveling emissive dot so the
//  flow direction reads (and blooms later).
// ---------------------------------------------------------------------------

function FlowDot({
  curve,
  color,
  speed,
  phase,
}: {
  curve: QuadraticBezierCurve3
  color: string
  speed: number
  phase: number
}) {
  const ref = useRef<Mesh>(null)
  const t = useRef(phase)
  const glowColor = useMemo(() => hdrCss(color, 1.9), [color])
  useFrame((_, dt) => {
    t.current = (t.current + dt * speed) % 1
    const p = curve.getPoint(t.current)
    ref.current?.position.set(p.x, p.y, p.z)
  })
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.1, 16, 16]} />
      <meshBasicMaterial color={glowColor} toneMapped={false} />
    </mesh>
  )
}

function RelationEdge({
  relation,
  start,
  end,
  phase,
}: {
  relation: Relation
  start: Vec3
  end: Vec3
  phase: number
}) {
  const style = relation.committed
    ? committedStyleFor(relation.kind)
    : RELATION_STYLE[relation.kind]
  const dashed = relation.kind === 'proposed-move' && !relation.committed

  const mid = useMemo<Vec3>(() => {
    const dx = end[0] - start[0]
    const dy = end[1] - start[1]
    const dz = end[2] - start[2]
    const dist = Math.hypot(dx, dy, dz)
    const lift =
      relation.kind === 'inbound' ? Math.min(8, dist * 0.4) : Math.min(2.2, dist * 0.22)
    return [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2 + lift + 0.3, (start[2] + end[2]) / 2]
  }, [start, end, relation.kind])

  const curve = useMemo(
    () =>
      new QuadraticBezierCurve3(
        new Vector3(...start),
        new Vector3(...mid),
        new Vector3(...end),
      ),
    [start, mid, end],
  )

  return (
    <>
      <QuadraticBezierLine
        start={start}
        end={end}
        mid={mid}
        color={style.color}
        lineWidth={style.width}
        dashed={dashed}
        dashScale={5}
        dashSize={0.4}
        gapSize={0.25}
        transparent
        opacity={dashed ? 0.9 : 0.95}
      />
      {style.animated && (
        <FlowDot
          curve={curve}
          color={style.color}
          speed={relation.kind === 'inbound' ? 0.25 : 0.5}
          phase={phase}
        />
      )}
    </>
  )
}

export function RelationEdges() {
  const entities = useOntologyStore((s) => s.entities)
  const relations = useOntologyStore((s) => s.relations)

  const edges = useMemo(() => {
    const data: OntologyData = { entities, relations }
    return Object.values(relations)
      .map((relation, i) => {
        const start = resolveAnchor(relation.from, data)
        const end = resolveAnchor(relation.to, data)
        if (!start || !end) return null
        return { relation, start, end, phase: (i * 0.37) % 1 }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
  }, [entities, relations])

  return (
    <group>
      {edges.map(({ relation, start, end, phase }) => (
        <RelationEdge
          key={relation.id}
          relation={relation}
          start={start}
          end={end}
          phase={phase}
        />
      ))}
    </group>
  )
}
