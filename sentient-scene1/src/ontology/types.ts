// ============================================================================
//  ONTOLOGY — TYPES
//  The typed clinical data model that every visual renders. This is the single
//  vocabulary shared across the three Sentient layers:
//    PLEXUS — the SIGNAL layer (devices, feeds, LIS/PACS/EMR traffic). It
//             carries data and never speaks; it is not an agent.
//    TARS  — ONTOLOGY + ORCHESTRATION (holds live state, acts via the Governor)
//    iSAM  — clinical REASONING (assess → propose → execute → read → reassess)
//
//  Design rules that the rest of the app depends on:
//   • `entity` is the discriminant on every object (NOT `kind`, which several
//     objects use for their own domain sub-type, e.g. Observation.kind).
//   • Every value that can be more or less trustworthy carries a `stateType`
//     (provenance). stateType drives opacity/refraction — see provenance.ts.
//   • The event/entity schema here is intentionally identical to what a live
//     backend WebSocket feed would emit, so the mock EpisodePlayer can later be
//     swapped for a real feed with zero component changes.
// ============================================================================

/**
 * PROVENANCE / STATE-TYPE — the confidence→opacity axis.
 * Philosophy: "infer-then-confirm, never manual-originate."
 *   A = sensor-driven   (device / PLEXUS, e.g. HR from monitor OCR) → SOLID, sharp.
 *   B = inferred        (derived, e.g. "bed vacated", rising trend) → mostly solid, subtle shimmer.
 *   C = human-asserted  (paramedic radio, manual AVPU) → GHOSTED, translucent, provisional.
 * A key Scene-1 beat is a Type C→A transition (a provisional inbound patient
 * solidifies as real vitals arrive). stateType is therefore ANIMATABLE.
 */
export type StateType = 'A' | 'B' | 'C'

// ---------------------------------------------------------------------------
//  Shared enums
// ---------------------------------------------------------------------------
export type EntityKind =
  | 'patient'
  | 'encounter'
  | 'bed'
  | 'device'
  | 'observation'
  | 'vitalTrajectory'
  | 'alert'
  | 'clinician'
  | 'order'
  | 'labResult'
  | 'medication'
  | 'inventory'

export type Acuity = 'stable' | 'elevated' | 'critical'
export type Unit = 'er' | 'ward' | 'icu' | 'cath'

/**
 * Bed lifecycle. The spec's core set is
 * occupied | vacant | dirty | clean | warming. We additionally carry
 * `reserved` to support Downstream-stage (earmarking a post-PCI ICU bed).
 */
export type BedStatus =
  | 'occupied'
  | 'vacant'
  | 'dirty'
  | 'clean'
  | 'warming'
  | 'reserved'

export type DeviceKind = 'multipara-monitor' | 'ecg'
export type ObservationKind = 'hr' | 'spo2' | 'rr' | 'bp' | 'temp'
export type TrajectoryDirection = 'flat' | 'rising' | 'falling'
export type Severity = 'green' | 'amber' | 'red'
export type AlertLevel = 'info' | 'warn' | 'critical'
export type ClinicianRole = 'doctor' | 'nurse' | 'ops'
export type EncounterKind = 'ed' | 'inpatient'
export type EncounterStatus = 'active' | 'transferring' | 'closed'

export type OrderKind = 'lab' | 'imaging' | 'move' | 'medication' | 'activation'
export type OrderStatus = 'proposed' | 'authorized' | 'inProgress' | 'done'

/**
 * AUTONOMY — where the Autonomy Governor lives. Drives Order color:
 *   autonomous   → teal   (system acts on its own)
 *   autoConfirm  → amber   (acts, but announces / confirmable)
 *   clinicalGated → coral  (WAITS for a human hand before committing)
 */
export type Autonomy = 'autonomous' | 'autoConfirm' | 'clinicalGated'

export type LabResultKind = 'ecg' | 'troponin' | 'panel' | (string & {})
export type MedicationStatus = 'ordered' | 'given'

// ---------------------------------------------------------------------------
//  Base
// ---------------------------------------------------------------------------
interface EntityBase {
  /** discriminant */
  entity: EntityKind
  /** globally-unique id */
  id: string
}

// ---------------------------------------------------------------------------
//  1. Patient — the anchor everything relates to.
// ---------------------------------------------------------------------------
export interface Patient extends EntityBase {
  entity: 'patient'
  label: string
  /** logical location id (see locationRegistry) — objects never hold world coords */
  locationId: string
  acuity: Acuity
  chiefComplaint: string
  priority: number
  stateType: StateType
  active: boolean
}

// ---------------------------------------------------------------------------
//  2. Encounter — a visit/episode binding a patient to a care timeline.
// ---------------------------------------------------------------------------
export interface Encounter extends EntityBase {
  entity: 'encounter'
  patientId: string
  kind: EncounterKind
  startTime: number
  status: EncounterStatus
}

// ---------------------------------------------------------------------------
//  3. Bed — a physical slot that can hold a patient.
// ---------------------------------------------------------------------------
export interface Bed extends EntityBase {
  entity: 'bed'
  locationId: string
  unit: Unit
  status: BedStatus
  occupantPatientId?: string
}

// ---------------------------------------------------------------------------
//  4. Device — a monitor/sensor feeding observations.
// ---------------------------------------------------------------------------
export interface Device extends EntityBase {
  entity: 'device'
  locationId: string
  kind: DeviceKind
  online: boolean
}

// ---------------------------------------------------------------------------
//  5. Observation — a single vitals reading.
// ---------------------------------------------------------------------------
export interface Observation extends EntityBase {
  entity: 'observation'
  patientId: string
  kind: ObservationKind
  /** numeric for most vitals; string for compound values like BP "120/80" */
  value: number | string
  unit: string
  stateType: StateType
  timestamp: number
}

// ---------------------------------------------------------------------------
//  6. VitalTrajectory — trend of observations + computed deterioration (NEWS2).
// ---------------------------------------------------------------------------
export interface VitalTrajectory extends EntityBase {
  entity: 'vitalTrajectory'
  patientId: string
  /** NEWS2-style aggregate deterioration score */
  score: number
  direction: TrajectoryDirection
  /** most-recent-last sparkline series (drawn INSIDE the glass card) */
  series: number[]
  severity: Severity
}

// ---------------------------------------------------------------------------
//  7. Alert — a deterioration/clinical alert.
// ---------------------------------------------------------------------------
export interface Alert extends EntityBase {
  entity: 'alert'
  patientId: string
  level: AlertLevel
  reason: string
  acknowledged: boolean
}

// ---------------------------------------------------------------------------
//  8. Clinician — a care-team member.
// ---------------------------------------------------------------------------
export interface Clinician extends EntityBase {
  entity: 'clinician'
  role: ClinicianRole
  locationId: string
  assignedPatientIds: string[]
}

// ---------------------------------------------------------------------------
//  9. Order — a clinical/operational intent, proposed then authorized.
//     This is where the Autonomy Governor lives.
// ---------------------------------------------------------------------------
export interface Order extends EntityBase {
  entity: 'order'
  patientId: string
  kind: OrderKind
  status: OrderStatus
  autonomy: Autonomy
}

// ---------------------------------------------------------------------------
//  10. LabResult — a returned diagnostic, including ECG.
//      HARD RULE (iSAM): always surface the raw payload BESIDE the read,
//      never the read alone.
// ---------------------------------------------------------------------------
export interface EcgStripData {
  type: 'ecg'
  /** optional lead labels, e.g. ["II"] or the 12-lead set */
  leads: string[]
  /** normalized waveform samples in [-1, 1] for the rendered strip */
  samples: number[]
  sampleRate?: number
}

export interface ScalarPayload {
  type: 'scalar'
  value: number
  unit?: string
  ref?: string
}

export type LabPayload = EcgStripData | ScalarPayload

export interface LabResult extends EntityBase {
  entity: 'labResult'
  patientId: string
  kind: LabResultKind
  payload: LabPayload
  /** iSAM's interpretation, e.g. "de Winter T-waves — LAD occlusion". Shown WITH the raw payload. */
  read?: string
  stateType: StateType
}

// ---------------------------------------------------------------------------
//  11. Medication — an ordered/administered drug.
// ---------------------------------------------------------------------------
export interface Medication extends EntityBase {
  entity: 'medication'
  patientId: string
  name: string
  status: MedicationStatus
}

// ---------------------------------------------------------------------------
//  (+) InventoryItem — Inventory/Stock. Stub for Scene 1 completeness.
// ---------------------------------------------------------------------------
export interface InventoryItem extends EntityBase {
  entity: 'inventory'
  sku: string
  label: string
  onHand: number
  locationId?: string
  reorder?: boolean
}

// ---------------------------------------------------------------------------
//  Union + kind→type map
// ---------------------------------------------------------------------------
export type OntologyEntity =
  | Patient
  | Encounter
  | Bed
  | Device
  | Observation
  | VitalTrajectory
  | Alert
  | Clinician
  | Order
  | LabResult
  | Medication
  | InventoryItem

/** Map an EntityKind literal to its concrete interface. */
export interface EntityTypeMap {
  patient: Patient
  encounter: Encounter
  bed: Bed
  device: Device
  observation: Observation
  vitalTrajectory: VitalTrajectory
  alert: Alert
  clinician: Clinician
  order: Order
  labResult: LabResult
  medication: Medication
  inventory: InventoryItem
}

export type EntityOf<K extends EntityKind> = EntityTypeMap[K]

// ---------------------------------------------------------------------------
//  RELATIONS (edges) — { id, from, to, kind, committed }
//  `from`/`to` are entity ids, OR logical source ids for offscreen origins
//  (e.g. "ambulance") / location ids (e.g. "ward-bed-7").
// ---------------------------------------------------------------------------
export type RelationKind =
  | 'occupies' // Patient → Bed          : solid teal
  | 'proposed-move' // Patient → Bed     : dashed coral (candidate move)
  | 'assigned' // Clinician → Patient     : thin solid
  | 'inbound' // Ambulance → ER Encounter : animated arc from offscreen
  | 'data-flow' // Observation/LabResult → Patient/Trajectory : animated dash
  | 'reasoning' // iSAM → object          : gold thread
  | 'authorizes' // Clinician → Order      : transient flash on tap

export interface Relation {
  id: string
  from: string
  to: string
  kind: RelationKind
  /** committed=false renders as provisional (dashed / waiting); true snaps solid. */
  committed: boolean
}

// ---------------------------------------------------------------------------
//  Type guards — narrow OntologyEntity by kind.
// ---------------------------------------------------------------------------
export const isEntity =
  <K extends EntityKind>(kind: K) =>
  (e: OntologyEntity): e is EntityOf<K> =>
    e.entity === kind

export const isPatient = isEntity('patient')
export const isEncounter = isEntity('encounter')
export const isBed = isEntity('bed')
export const isDevice = isEntity('device')
export const isObservation = isEntity('observation')
export const isVitalTrajectory = isEntity('vitalTrajectory')
export const isAlert = isEntity('alert')
export const isClinician = isEntity('clinician')
export const isOrder = isEntity('order')
export const isLabResult = isEntity('labResult')
export const isMedication = isEntity('medication')
export const isInventory = isEntity('inventory')

export const isEcgPayload = (p: LabPayload): p is EcgStripData => p.type === 'ecg'
