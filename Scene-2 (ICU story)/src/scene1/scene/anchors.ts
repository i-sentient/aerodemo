// ============================================================================
//  ANCHORS — where each ontology object lives in the world, for edge endpoints
//  and layer placement. The ONLY module (besides Building) that turns logical
//  ids into world coordinates. Everything derives from the locationRegistry.
// ============================================================================
import {
  locationNode,
  locationPosition,
  type OntologyData,
  type Patient,
  type Vec3,
} from '../ontology'

export const addV = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]

/** Where a patient's glass node hovers (bed patients float above the mattress). */
export function patientNodePosition(p: Patient): Vec3 {
  const base = locationPosition(p.locationId)
  const node = locationNode(p.locationId)
  const hover = node && (node.role === 'bed' || node.role === 'bay') ? 1.15 : 0.3
  return [base[0], base[1] + hover, base[2]]
}

/** Card cluster offsets relative to a patient's node. */
export const CARD_OFFSET: Vec3 = [1.55, 0.5, 0]
export const ECG_OFFSET: Vec3 = [0, 1.9, 0]
export const ORDER_OFFSET: Vec3 = [-1.65, 0.2, 0]

/** Logical SAM/iSAM reasoning origin (co-located with the physician view). */
const SAM_ORIGIN: Vec3 = [12, 3.5, -8]

/**
 * Resolve any relation endpoint id (entity id OR logical/location id) to a
 * world position. Returns null when it can't be placed (edge is skipped).
 */
export function resolveAnchor(id: string, data: OntologyData): Vec3 | null {
  const e = data.entities[id]
  if (e) {
    switch (e.entity) {
      case 'patient':
        return patientNodePosition(e)
      case 'bed':
        return addV(locationPosition(e.locationId), [0, 0.5, 0])
      case 'clinician':
        return addV(locationPosition(e.locationId), [1.0, 1.1, 1.0])
      case 'order': {
        const p = data.entities[e.patientId]
        return p && p.entity === 'patient'
          ? addV(patientNodePosition(p), ORDER_OFFSET)
          : null
      }
      case 'labResult': {
        const p = data.entities[e.patientId]
        return p && p.entity === 'patient'
          ? addV(patientNodePosition(p), ECG_OFFSET)
          : null
      }
      case 'observation':
      case 'vitalTrajectory': {
        const p = data.entities[e.patientId]
        return p && p.entity === 'patient'
          ? addV(patientNodePosition(p), CARD_OFFSET)
          : null
      }
    }
  }
  // logical sources / bare location ids
  if (id === 'sam') return SAM_ORIGIN
  const loc = locationNode(id)
  if (loc) return loc.position
  return null
}
