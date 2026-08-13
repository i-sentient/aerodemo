import { useMemo } from 'react'
import { Billboard } from '@react-three/drei'
import {
  AERO,
  isEcgPayload,
  isLabResult,
  isPatient,
  isVitalTrajectory,
  severityColor,
  useOntologyStore,
  type LabResult,
  type Vec3,
  type VitalTrajectory,
} from '../ontology'
import { hdrCss } from '../scene/glow'
import { PatientNode } from './PatientNode'
import { VitalTrajectoryCard } from './VitalTrajectoryCard'
import { EcgCard } from './EcgCard'
import { addV, patientNodePosition, CARD_OFFSET, ECG_OFFSET } from '../scene/anchors'

// ---------------------------------------------------------------------------
//  PATIENT LAYER — maps ontology patients to glass nodes.
//  DETAIL-ON-FOCUS: only the hero (focus, default = inbound OMI) shows full
//  cards + the expensive transmission material. Ambient patients render just
//  their node + a small severity dot (declutter). Click any node to focus it.
// ---------------------------------------------------------------------------

/** A compact billboarded dot carrying trajectory severity for ambient patients. */
function SeverityDot({ position, color }: { position: Vec3; color: string }) {
  return (
    <Billboard position={position}>
      <mesh>
        <circleGeometry args={[0.12, 24]} />
        <meshBasicMaterial color={hdrCss(color, 1.7)} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, -0.01]}>
        <circleGeometry args={[0.18, 24]} />
        <meshBasicMaterial color={AERO.smoke} transparent opacity={0.85} />
      </mesh>
    </Billboard>
  )
}

export function PatientLayer() {
  const entities = useOntologyStore((s) => s.entities)
  const focusId = useOntologyStore((s) => s.focusId)

  const { patients, trajByPatient, ecgByPatient } = useMemo(() => {
    const list = Object.values(entities)
    const trajByPatient = new Map<string, VitalTrajectory>()
    const ecgByPatient = new Map<string, LabResult>()
    for (const e of list) {
      if (isVitalTrajectory(e)) trajByPatient.set(e.patientId, e)
      else if (isLabResult(e) && isEcgPayload(e.payload)) ecgByPatient.set(e.patientId, e)
    }
    return {
      patients: list.filter(isPatient).filter((p) => p.active),
      trajByPatient,
      ecgByPatient,
    }
  }, [entities])

  const heroId = focusId ?? 'pt-inbound'

  return (
    <group>
      {patients.map((p) => {
        const nodePos = patientNodePosition(p)
        const hero = p.id === heroId
        const traj = trajByPatient.get(p.id)
        const ecg = ecgByPatient.get(p.id)

        return (
          <group key={p.id}>
            <PatientNode patient={p} position={nodePos} hero={hero} />

            {hero ? (
              <>
                {traj && (
                  <VitalTrajectoryCard
                    traj={traj}
                    position={addV(nodePos, CARD_OFFSET)}
                    live={p.stateType === 'A'}
                  />
                )}
                {ecg && <EcgCard lab={ecg} position={addV(nodePos, ECG_OFFSET)} />}
              </>
            ) : (
              traj && (
                <SeverityDot
                  position={addV(nodePos, [0.55, 0.55, 0])}
                  color={severityColor[traj.severity]}
                />
              )
            )}
          </group>
        )
      })}
    </group>
  )
}
