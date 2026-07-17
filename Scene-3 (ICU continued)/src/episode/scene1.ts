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
const REL_OCC_INB_ER3 = relationId('occupies', 'pt-inbound', 'bed-er3')
const REL_DATAFLOW = relationId('data-flow', 'lab-inbound-ecg', 'pt-inbound')
const REL_REASONING = relationId('reasoning', 'sam', 'lab-inbound-ecg')

export const EPISODE_DURATION = 22

// ── SCENE 1 (ER-only) — one new patient arriving into the open bay (Bay 3).
//    B1 inbound ghost · B2 capacity (one bay open) · B3 iSAM OMI-read ·
//    B4 TARS pre-warms Bay 3 · B5 arrival: ghost solidifies (C→A), vitals live.
export const EPISODE: EpisodeEvent[] = [
  // ── B1 — inbound provisional ghost at the ER entrance ─────────────────────
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

  // ── B2 — capacity (READ, no mutation): one bay open ───────────────────────
  {
    t: 5,
    beat: 'B2',
    title: 'Capacity-sense · ER 7/8 — Bay 3 open for the inbound',
    ops: [],
  },

  // ── B3 — iSAM OMI-read on the inbound ECG ─────────────────────────────────
  {
    t: 9,
    beat: 'B3',
    title: 'iSAM OMI-read · de Winter → CRITICAL (raw strip shown with the read)',
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
    ],
  },

  // ── B4 — TARS pre-warms the open bay (autonomous operational action) ──────
  {
    t: 12.5,
    beat: 'B4',
    title: 'Autonomy Governor · TARS pre-warms Bay 3 for the STEMI (autonomous)',
    ops: [
      {
        op: 'upsertEntity',
        entity: {
          entity: 'order', id: 'ord-prep-bay', patientId: 'pt-inbound',
          kind: 'activation', status: 'inProgress', autonomy: 'autonomous',
        },
      },
      { op: 'patchEntity', id: 'bed-er3', patch: { status: 'warming' } },
    ],
  },

  // ── B5 — arrival: ghost solidifies (C→A), lands in Bay 3, vitals live ──────
  {
    t: 16.5,
    beat: 'B5',
    title: 'Arrival · ghost solidifies (C→A) · lands in Bay 3 · vitals live · handoff',
    ops: [
      { op: 'patchEntity', id: 'pt-inbound', patch: { stateType: 'A', locationId: 'er-bay-3' } },
      { op: 'patchEntity', id: 'bed-er3', patch: { status: 'occupied', occupantPatientId: 'pt-inbound' } },
      { op: 'patchEntity', id: 'ord-prep-bay', patch: { status: 'done' } },
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
