// ============================================================================
//  SELECTORS — pure reads over the ontology data slice.
//  These back the TARS "sense" capabilities. They MUTATE NOTHING; a capability
//  is: read via a selector → (maybe) emit entities/relations via store actions.
//  Keeping them pure means the same functions work over a mock store or a live
//  feed snapshot.
// ============================================================================
import type { OntologyData } from './store'
import type {
  Bed,
  Clinician,
  EntityKind,
  EntityOf,
  OntologyEntity,
  Order,
  Patient,
  Relation,
  RelationKind,
  Unit,
  VitalTrajectory,
} from './types'

// --- generic ---------------------------------------------------------------
export const allEntities = (d: OntologyData): OntologyEntity[] =>
  Object.values(d.entities)

export const byKind = <K extends EntityKind>(
  d: OntologyData,
  kind: K,
): EntityOf<K>[] =>
  Object.values(d.entities).filter((e): e is EntityOf<K> => e.entity === kind)

export const entity = <K extends EntityKind>(
  d: OntologyData,
  id: string,
): EntityOf<K> | undefined => d.entities[id] as EntityOf<K> | undefined

export const relationsOfKind = (d: OntologyData, kind: RelationKind): Relation[] =>
  Object.values(d.relations).filter((r) => r.kind === kind)

export const relationsFrom = (d: OntologyData, from: string): Relation[] =>
  Object.values(d.relations).filter((r) => r.from === from)

export const relationsTo = (d: OntologyData, to: string): Relation[] =>
  Object.values(d.relations).filter((r) => r.to === to)

// --- patient-centric -------------------------------------------------------
export const trajectoryForPatient = (
  d: OntologyData,
  patientId: string,
): VitalTrajectory | undefined =>
  byKind(d, 'vitalTrajectory').find((t) => t.patientId === patientId)

export const bedForPatient = (d: OntologyData, patientId: string): Bed | undefined =>
  byKind(d, 'bed').find((b) => b.occupantPatientId === patientId)

export const cliniciansForPatient = (
  d: OntologyData,
  patientId: string,
): Clinician[] =>
  byKind(d, 'clinician').filter((c) => c.assignedPatientIds.includes(patientId))

// --- bed / unit ------------------------------------------------------------
export const bedsInUnit = (d: OntologyData, unit: Unit): Bed[] =>
  byKind(d, 'bed').filter((b) => b.unit === unit)

const AVAILABLE_STATUSES = new Set(['vacant', 'clean'])

/**
 * CAPACITY-SENSE (TARS): a pure READ of all Bed.status in a unit → derives
 * "unit full". No mutation; the visual is simply all halos reading occupied.
 */
export interface CapacityReading {
  unit: Unit
  total: number
  occupied: number
  available: number
  full: boolean
}

export const capacitySense = (d: OntologyData, unit: Unit): CapacityReading => {
  const beds = bedsInUnit(d, unit)
  const available = beds.filter((b) => AVAILABLE_STATUSES.has(b.status)).length
  const occupied = beds.filter((b) => b.status === 'occupied').length
  return { unit, total: beds.length, occupied, available, full: available === 0 }
}

/** First bed in a unit that is ready to receive a patient (clean/vacant). */
export const firstAvailableBed = (d: OntologyData, unit: Unit): Bed | undefined =>
  bedsInUnit(d, unit).find((b) => AVAILABLE_STATUSES.has(b.status))

// --- Transfer-sense --------------------------------------------------------
export interface TransferCandidate {
  patient: Patient
  fromBed: Bed
  destBed: Bed
}

/**
 * TRANSFER-SENSE (TARS): find a step-ready Patient (stable acuity + flat-green
 * VitalTrajectory) currently in `fromUnit`, plus a clean destination Bed in
 * `toUnit`. Returns the pair a proposed-move Order/relation would bind.
 */
export const transferSense = (
  d: OntologyData,
  fromUnit: Unit = 'er',
  toUnit: Unit = 'ward',
): TransferCandidate | null => {
  const dest = firstAvailableBed(d, toUnit)
  if (!dest) return null

  for (const patient of byKind(d, 'patient')) {
    if (!patient.active || patient.acuity !== 'stable') continue
    const bed = bedForPatient(d, patient.id)
    if (!bed || bed.unit !== fromUnit) continue
    const traj = trajectoryForPatient(d, patient.id)
    if (!traj || traj.direction !== 'flat' || traj.severity !== 'green') continue
    return { patient, fromBed: bed, destBed: dest }
  }
  return null
}

// --- orders ----------------------------------------------------------------
export const ordersForPatient = (d: OntologyData, patientId: string): Order[] =>
  byKind(d, 'order').filter((o) => o.patientId === patientId)

/** A clinical-gated Order still waiting on a human hand. */
export const pendingGatedOrders = (d: OntologyData): Order[] =>
  byKind(d, 'order').filter(
    (o) => o.autonomy === 'clinicalGated' && o.status === 'proposed',
  )

// --- devices / Blind-flag --------------------------------------------------
export const devicesAtLocation = (d: OntologyData, locationId: string) =>
  byKind(d, 'device').filter((dev) => dev.locationId === locationId)

/**
 * BLIND-FLAG (LSam) predicate: a location is "blind" when it has devices but
 * none are online — the linked object should grey out and show "no signal"
 * rather than a stale value.
 */
export const isLocationBlind = (d: OntologyData, locationId: string): boolean => {
  const devs = devicesAtLocation(d, locationId)
  return devs.length > 0 && devs.every((dev) => !dev.online)
}
