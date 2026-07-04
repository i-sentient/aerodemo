// ============================================================================
//  SCENE 1 — the mock episode.
//  A typed, timestamped list of events. Each event carries `ops` — mutations
//  whose shape is IDENTICAL to what a live backend WebSocket feed would emit
//  ({op:'patchEntity', id, patch}, etc.). The EpisodePlayer is the only thing
//  that turns time → ops; swapping it for a WebSocketPlayer that emits the same
//  ops requires zero component changes.
//
//  Beats (STEMI arrival):
//   B1 inbound ghost · B2 capacity · B3 transfer-sense · B4 gate/authorize ·
//   B5 pre-warm/transfer · B6 iSAM OMI-read · B7 arrival/solidify.
// ============================================================================
import {
  makeEcgPayload,
  relationId,
  type OntologyEntity,
  type OntologyStore,
  type Relation,
} from '../ontology'

// --- op schema (mirrors the store actions / a live feed message) -----------
export type Op =
  | { op: 'upsertEntity'; entity: OntologyEntity }
  | { op: 'patchEntity'; id: string; patch: Partial<OntologyEntity> }
  | { op: 'removeEntity'; id: string }
  | { op: 'upsertRelation'; relation: Relation }
  | { op: 'patchRelation'; id: string; patch: Partial<Relation> }
  | { op: 'removeRelation'; id: string }

export interface EpisodeEvent {
  t: number // scene seconds
  beat: string // B1..B7
  title: string // short caption for the scrubber
  ops: Op[]
}

/** Apply a single op through the store actions (also how a live feed applies). */
export function applyOp(op: Op, store: OntologyStore): void {
  switch (op.op) {
    case 'upsertEntity':
      store.upsertEntity(op.entity)
      break
    case 'patchEntity':
      store.patchEntity(op.id, op.patch)
      break
    case 'removeEntity':
      store.removeEntity(op.id)
      break
    case 'upsertRelation':
      store.upsertRelation(op.relation)
      break
    case 'patchRelation':
      store.patchRelation(op.id, op.patch)
      break
    case 'removeRelation':
      store.removeRelation(op.id)
      break
  }
}

// --- relation id helpers ----------------------------------------------------
const REL_INBOUND = relationId('inbound', 'ambulance', 'pt-inbound')
const REL_PROPMOVE = relationId('proposed-move', 'pt-x', 'bed-w7')
const REL_OCC_X_ER3 = relationId('occupies', 'pt-x', 'bed-er3')
const REL_OCC_X_W7 = relationId('occupies', 'pt-x', 'bed-w7')
const REL_OCC_INB_ER3 = relationId('occupies', 'pt-inbound', 'bed-er3')
const REL_DATAFLOW = relationId('data-flow', 'lab-inbound-ecg', 'pt-inbound')
const REL_REASONING = relationId('reasoning', 'sam', 'lab-inbound-ecg')

export const EPISODE_DURATION = 32

export const EPISODE: EpisodeEvent[] = [
  // ── B1 — inbound provisional ghost ────────────────────────────────────────
  {
    t: 1.5,
    beat: 'B1',
    title: 'Inbound · chest pain · ETA 9 — provisional (Type C)',
    ops: [
      {
        op: 'upsertEntity',
        entity: {
          entity: 'encounter', id: 'enc-inbound', patientId: 'pt-inbound',
          kind: 'ed', startTime: 0, status: 'active',
        },
      },
      {
        op: 'upsertEntity',
        entity: {
          entity: 'patient', id: 'pt-inbound', label: 'Inbound · chest pain',
          locationId: 'staging', acuity: 'elevated',
          chiefComplaint: 'Crushing chest pain · ETA 9', priority: 3,
          stateType: 'C', active: true,
        },
      },
      {
        op: 'upsertRelation',
        relation: {
          id: REL_INBOUND, from: 'ambulance', to: 'pt-inbound',
          kind: 'inbound', committed: false,
        },
      },
    ],
  },

  // ── B2 — capacity (READ, no mutation) ─────────────────────────────────────
  {
    t: 5,
    beat: 'B2',
    title: 'Capacity-sense · ER FULL — no free bay for the ghost',
    ops: [],
  },

  // ── B3 — Transfer-sense proposes the move ─────────────────────────────────
  {
    t: 8,
    beat: 'B3',
    title: 'Transfer-sense · Patient-X step-ready → ward-bed-7',
    ops: [
      {
        op: 'upsertEntity',
        entity: {
          entity: 'order', id: 'ord-move-x', patientId: 'pt-x', kind: 'move',
          status: 'proposed', autonomy: 'clinicalGated',
        },
      },
      {
        op: 'upsertRelation',
        relation: {
          id: REL_PROPMOVE, from: 'pt-x', to: 'bed-w7',
          kind: 'proposed-move', committed: false,
        },
      },
    ],
  },

  // ── B4a — Governor: gated move WAITS; autonomous display fires teal ───────
  {
    t: 11,
    beat: 'B4',
    title: 'Autonomy Governor · clinical-gated move WAITS for a hand',
    ops: [
      {
        op: 'upsertEntity',
        entity: {
          entity: 'order', id: 'ord-display', patientId: 'pt-x',
          kind: 'activation', status: 'inProgress', autonomy: 'autonomous',
        },
      },
    ],
  },

  // ── B4b — the nurse tap: authorize → commit ───────────────────────────────
  {
    t: 14.5,
    beat: 'B4',
    title: 'Nurse authorized · move commits (dashed coral → solid teal)',
    ops: [
      { op: 'patchEntity', id: 'ord-move-x', patch: { status: 'authorized' } },
      { op: 'patchRelation', id: REL_PROPMOVE, patch: { committed: true } },
    ],
  },

  // ── B5 — Pre-warm + transfer ──────────────────────────────────────────────
  {
    t: 17,
    beat: 'B5',
    title: 'Pre-warm · ward-bed-7 warming · Patient-X transfers · bay vacated',
    ops: [
      { op: 'patchEntity', id: 'bed-w7', patch: { status: 'warming', occupantPatientId: 'pt-x' } },
      { op: 'patchEntity', id: 'enc-x', patch: { status: 'transferring' } },
      { op: 'patchEntity', id: 'pt-x', patch: { locationId: 'ward-bed-7' } },
      { op: 'patchEntity', id: 'bed-er3', patch: { status: 'dirty', occupantPatientId: undefined } },
      { op: 'removeRelation', id: REL_OCC_X_ER3 },
      { op: 'removeRelation', id: REL_PROPMOVE },
      {
        op: 'upsertRelation',
        relation: { id: REL_OCC_X_W7, from: 'pt-x', to: 'bed-w7', kind: 'occupies', committed: true },
      },
    ],
  },

  // ── B5b — Patient-X settled; bay cleaned for the inbound ──────────────────
  {
    t: 20,
    beat: 'B5',
    title: 'Ward bed occupied · Patient-X settled · ER bay cleaned',
    ops: [
      { op: 'patchEntity', id: 'bed-w7', patch: { status: 'occupied' } },
      { op: 'patchEntity', id: 'enc-x', patch: { status: 'active' } },
      { op: 'patchEntity', id: 'bed-er3', patch: { status: 'clean' } },
    ],
  },

  // ── B6 — iSAM OMI-read ────────────────────────────────────────────────────
  {
    t: 22.5,
    beat: 'B6',
    title: 'iSAM OMI-read · de Winter → CRITICAL · cath pre-warm · ICU reserved',
    ops: [
      {
        op: 'upsertEntity',
        entity: {
          entity: 'labResult', id: 'lab-inbound-ecg', patientId: 'pt-inbound',
          kind: 'ecg', payload: makeEcgPayload('deWinter'),
          read: 'de Winter T-waves — proximal LAD occlusion (OMI)', stateType: 'A',
        },
      },
      {
        op: 'upsertRelation',
        relation: { id: REL_REASONING, from: 'sam', to: 'lab-inbound-ecg', kind: 'reasoning', committed: true },
      },
      {
        op: 'upsertRelation',
        relation: { id: REL_DATAFLOW, from: 'lab-inbound-ecg', to: 'pt-inbound', kind: 'data-flow', committed: true },
      },
      // Priority-drive: SAM's finding raises priority; acuity → critical (still Type C ghost)
      { op: 'patchEntity', id: 'pt-inbound', patch: { acuity: 'critical', priority: 1 } },
      // Lysis-guard advisory
      {
        op: 'upsertEntity',
        entity: {
          entity: 'alert', id: 'al-lysis', patientId: 'pt-inbound', level: 'info',
          reason: 'Lysis-guard: no contraindication — primary PCI preferred', acknowledged: false,
        },
      },
      // Cath-ready + Downstream-stage
      { op: 'patchEntity', id: 'bed-cath', patch: { status: 'warming' } },
      { op: 'patchEntity', id: 'bed-icu2', patch: { status: 'reserved' } },
    ],
  },

  // ── B7 — arrival: ghost solidifies (C→A), vitals live, lands in prepared bay
  {
    t: 27,
    beat: 'B7',
    title: 'Arrival · ghost solidifies (C→A) · vitals live · handoff to physician',
    ops: [
      { op: 'patchEntity', id: 'pt-inbound', patch: { stateType: 'A', locationId: 'er-bay-3' } },
      { op: 'patchEntity', id: 'bed-er3', patch: { status: 'occupied', occupantPatientId: 'pt-inbound' } },
      {
        op: 'upsertEntity',
        entity: {
          entity: 'vitalTrajectory', id: 'traj-inbound', patientId: 'pt-inbound',
          score: 8, direction: 'rising', severity: 'red', series: [4, 5, 6, 7, 8, 8],
        },
      },
      {
        op: 'upsertRelation',
        relation: { id: REL_OCC_INB_ER3, from: 'pt-inbound', to: 'bed-er3', kind: 'occupies', committed: true },
      },
      { op: 'patchEntity', id: 'enc-inbound', patch: { status: 'active' } },
      { op: 'removeRelation', id: REL_INBOUND },
    ],
  },
]
