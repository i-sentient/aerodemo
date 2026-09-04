import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Html } from '@react-three/drei'
import { MathUtils, type Group } from 'three'
import {
  AERO,
  CText,
  isEncounter,
  isPatient,
  locationPosition,
  useOntologyStore,
  type Vec3,
} from '../ontology'
import { patientNodePosition, addV } from '../scene/anchors'
import { GlassCard } from './GlassCard'

// ---------------------------------------------------------------------------
//  HANDOFF — Handoff-sense packages the Encounter into a summary card.
//   • while an encounter is 'transferring', the card TRAVELS with the patient
//     (glides along the move path).
//   • when the inbound patient has solidified (Type A), a handoff card SURFACES
//     in the physician view.
//  Both are driven purely by ontology state.
// ---------------------------------------------------------------------------

function HandoffCard({
  target,
  title,
  sub,
  accent,
  glide,
}: {
  target: Vec3
  title: string
  sub: string
  accent: string
  glide: boolean
}) {
  const ref = useRef<Group>(null)
  useEffect(() => {
    ref.current?.position.set(target[0], target[1], target[2])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useFrame((_, dt) => {
    const g = ref.current
    if (!g) return
    if (glide) {
      g.position.x = MathUtils.damp(g.position.x, target[0], 3.5, dt)
      g.position.y = MathUtils.damp(g.position.y, target[1], 3.5, dt)
      g.position.z = MathUtils.damp(g.position.z, target[2], 3.5, dt)
    } else {
      g.position.set(target[0], target[1], target[2])
    }
  })

  return (
    <group ref={ref}>
      <Billboard>
        <GlassCard w={2.0} h={0.92} accent={accent}>
          <Html center position={[0, 0, 0.06]} zIndexRange={[7, 0]}>
            <div
              style={{
                pointerEvents: 'none',
                width: 168,
                textAlign: 'center',
                font: '600 11px ui-sans-serif, system-ui, sans-serif',
                color: AERO.ink,
              }}
            >
              <div style={{ color: accent, fontWeight: 800, letterSpacing: 0.5 }}>
                ⇄ HANDOFF
              </div>
              <div style={{ fontWeight: 700, marginTop: 2 }}>{title}</div>
              <div style={{ color: AERO.inkDim, marginTop: 2 }}>{sub}</div>
            </div>
          </Html>
        </GlassCard>
      </Billboard>
    </group>
  )
}

export function HandoffLayer() {
  const entities = useOntologyStore((s) => s.entities)

  const cards = useMemo(() => {
    const list = Object.values(entities)
    const out: {
      key: string
      target: Vec3
      title: string
      sub: string
      accent: string
      glide: boolean
    }[] = []

    // 1. traveling handoff for any encounter in transfer
    for (const e of list) {
      if (!isEncounter(e) || e.status !== 'transferring') continue
      const p = entities[e.patientId]
      if (!p || !isPatient(p)) continue
      out.push({
        key: `travel-${e.id}`,
        target: addV(patientNodePosition(p), [0, 1.5, 0]),
        title: p.label,
        sub: 'transfer summary · travelling',
        accent: CText.teal,
        glide: true,
      })
    }

    // 2. inbound handoff surfaces in the physician view once solidified (Type A)
    const inbound = entities['pt-inbound']
    if (inbound && isPatient(inbound) && inbound.stateType === 'A') {
      out.push({
        key: 'physician-inbound',
        target: addV(locationPosition('physician-view'), [0, 0, 0.2]),
        title: inbound.label,
        sub: 'OMI · to physician view',
        accent: CText.coral,
        glide: false,
      })
    }
    return out
  }, [entities])

  return (
    <group>
      {cards.map((c) => (
        <HandoffCard
          key={c.key}
          target={c.target}
          title={c.title}
          sub={c.sub}
          accent={c.accent}
          glide={c.glide}
        />
      ))}
    </group>
  )
}
