// ============================================================================
//  CENSUS — what is inside the building, by floor and by class.
//
//  This is the data the ontology view renders. It is a SIMULATED census: the
//  live episode store only carries Scene 1's ER cast (3 patients, 4 clinicians,
//  a couple of devices), which is a story sample, not a hospital. Rather than
//  imply a live feed we don't have, the counts below are authored to plausible
//  scale for a mid-size tertiary unit — and the view labels itself as simulated.
//
//  The CLASSES are not invented. They are two real axes crossed:
//    • EntityKind    — what a thing is (ontology/types.ts)
//    • ClinicianRole — which kind of staff it is, for the people
//  The census used to flatten every human into a single `clinician` row, which
//  meant a floor could tell you it held twelve staff but not whether they were
//  doctors or nurses. Splitting on a role the type system already defines costs
//  nothing in honesty and is the thing a clinician actually reads.
//
//  Swapping this file for a real feed's aggregate query is the only change
//  needed to make the view live.
// ============================================================================
import type { ClinicianRole, EntityKind, StateType } from './types'

/** The classes the ontology view counts and individuates. */
export type CensusKind = 'patient' | 'doctor' | 'nurse' | 'ops' | 'bed' | 'device'

export const CENSUS_KINDS: CensusKind[] = ['patient', 'doctor', 'nurse', 'ops', 'bed', 'device']

/** Every census class maps back to a real EntityKind... */
export const KIND_ENTITY: Record<CensusKind, EntityKind> = {
  patient: 'patient',
  doctor: 'clinician',
  nurse: 'clinician',
  ops: 'clinician',
  bed: 'bed',
  device: 'device',
}
/** ...and the three staff classes to a real ClinicianRole. */
export const KIND_ROLE: Partial<Record<CensusKind, ClinicianRole>> = {
  doctor: 'doctor',
  nurse: 'nurse',
  ops: 'ops',
}

export const STAFF_KINDS: CensusKind[] = ['doctor', 'nurse', 'ops']
/** staff are the things on a floor that MOVE — the motion grammar keys off this */
export const isStaffKind = (k: CensusKind) => k === 'doctor' || k === 'nurse' || k === 'ops'

/** The mark each class is drawn as when a floor individuates. Declared here
 *  beside its colour so the 3D marks and the on-screen legend are generated
 *  from one table and cannot drift into disagreeing with each other. */
export type MarkShape = 'sphere' | 'cone' | 'coneLow' | 'cube' | 'plate' | 'octa'

/** Display grammar per class — colour, the word for it, and its mark. */
export const KIND_STYLE: Record<CensusKind, { color: string; label: string; shape: MarkShape }> = {
  patient: { color: '#ff6a54', label: 'patients', shape: 'sphere' },  // coral — the people we're here for
  // The people-classes were retuned to the ER floor's punchy palette (the old
  // gold/amber/stone went to mush as glowing floor marks) — one vocabulary,
  // and the floor is the reference implementation now. Bonus: nurse-amber and
  // ops-stone previously collided EXACTLY with the ATLAS panel's INFERRED and
  // ASSERTED provenance hexes; these do not.
  doctor:  { color: '#8a2bff', label: 'doctors',  shape: 'cone' },    // electric violet — the decision makers
  nurse:   { color: '#ff2fb9', label: 'nurses',   shape: 'coneLow' }, // magenta — the continuous presence
  ops:     { color: '#ff8a00', label: 'staff',    shape: 'cube' },    // blazing orange — porters, techs, cleaners
  bed:     { color: '#12c2b0', label: 'beds',     shape: 'plate' },   // teal — capacity
  device:  { color: '#2e86e6', label: 'devices',  shape: 'octa' },    // blue — sensing (PLEXUS's domain)
}

export interface FloorCensus {
  /** matches FloorDef.id in scene/BuildingStack */
  floorId: string
  counts: Record<CensusKind, number>
  /** how much of this floor's knowledge is sensor-driven vs asserted.
   *  Same StateType axis the hero glass uses — A sensed, B inferred, C claimed. */
  provenance: Record<StateType, number>
  /** occupied / capacity, for the floor tag */
  occupancy?: [number, number]
  /** consumables held on the floor: [on hand, granted allocation]. Shown as the
   *  PERCENTAGE of the granted allocation still left, because that is the number
   *  a unit acts on — nobody restocks on an absolute count. This rolls up the
   *  `inventory` EntityKind rather than listing SKUs: supplies are a level, not
   *  a set of objects you can point at on a floorplan. */
  supplies?: [number, number]
}

// Authored to plausible scale. Device counts dominate — which is the point: a
// modern floor has far more instrumented objects than people, and almost none
// of them are visible to the humans working there. Nurses outnumber doctors on
// every clinical floor, which is also the point.
export const CENSUS: FloorCensus[] = [
  // beds/patients match the drum EXACTLY — 16 bays are built, 15 occupied,
  // bay 4 held for the inbound. The census and the geometry are one claim.
  { floorId: 'er',       counts: { patient: 15, doctor: 4, nurse: 6, ops: 1, bed: 16, device: 63 }, provenance: { A: 61, B: 22, C: 17 }, occupancy: [15, 16], supplies: [412, 640] },
  { floorId: 'imgcath',  counts: { patient: 3,  doctor: 4, nurse: 4, ops: 1, bed: 6,  device: 41 }, provenance: { A: 78, B: 16, C: 6  }, occupancy: [3, 6],   supplies: [188, 240] },
  { floorId: 'theatres', counts: { patient: 2,  doctor: 5, nurse: 7, ops: 2, bed: 2,  device: 52 }, provenance: { A: 83, B: 13, C: 4  }, occupancy: [2, 2],   supplies: [96, 180] },
  { floorId: 'icu',      counts: { patient: 8,  doctor: 3, nurse: 8, ops: 1, bed: 8,  device: 96 }, provenance: { A: 88, B: 9,  C: 3  }, occupancy: [8, 8],   supplies: [305, 420] },
  { floorId: 'wards',    counts: { patient: 19, doctor: 2, nurse: 5, ops: 1, bed: 24, device: 44 }, provenance: { A: 66, B: 21, C: 13 }, occupancy: [19, 24], supplies: [268, 320] },
  { floorId: 'hdu',      counts: { patient: 26, doctor: 2, nurse: 4, ops: 1, bed: 32, device: 38 }, provenance: { A: 52, B: 25, C: 23 }, occupancy: [26, 32], supplies: [214, 300] },
  // Command holds no patients and no beds, and its people are all ops. It is
  // the floor that watches the other six rather than treating anyone — which is
  // why describing it with a ward's vocabulary reads as nonsense, and why it
  // carries no supplies line at all.
  { floorId: 'command',  counts: { patient: 0,  doctor: 0, nurse: 0, ops: 4, bed: 0,  device: 12 }, provenance: { A: 94, B: 6,  C: 0  } },
]

/** What to call a floor when the ontology narrows from the whole building down
 *  to one room. Kept here beside the census rather than in the view, so the name
 *  a floor is announced by and the numbers announced under it come from one
 *  table. JOURNEY.room is close but not usable directly — it carries 'OR1' for
 *  the theatres tier, which reads as a typo at 26px. */
export const FLOOR_TITLE: Record<string, string> = {
  er: 'EMERGENCY',
  imgcath: 'CATH LAB',
  theatres: 'OR 1',
  icu: 'ICU',
  wards: 'STEP-DOWN',
  hdu: 'HDU',
  command: 'COMMAND',
}

export const censusFor = (floorId: string) => CENSUS.find((c) => c.floorId === floorId)

/** percentage of the granted supply allocation still on the floor */
export const suppliesPct = (c: FloorCensus) =>
  c.supplies ? Math.round((c.supplies[0] / c.supplies[1]) * 100) : null

const zero = (): Record<CensusKind, number> =>
  ({ patient: 0, doctor: 0, nurse: 0, ops: 0, bed: 0, device: 0 })

export const TOTALS = CENSUS.reduce((acc, f) => {
  for (const k of CENSUS_KINDS) acc[k] += f.counts[k]
  return acc
}, zero())

/** Whole-building provenance mix, weighted by how many objects each floor holds. */
export const TOTAL_PROVENANCE = (() => {
  let A = 0, B = 0, C = 0, w = 0
  for (const f of CENSUS) {
    const n = CENSUS_KINDS.reduce((s, k) => s + f.counts[k], 0)
    A += f.provenance.A * n; B += f.provenance.B * n; C += f.provenance.C * n; w += n
  }
  return { A: Math.round(A / w), B: Math.round(B / w), C: Math.round(C / w) }
})()

/** every classified object in the building */
export const TOTAL_OBJECTS = CENSUS_KINDS.reduce((s, k) => s + TOTALS[k], 0)
/** the floors Command is responsible for — everything that treats anyone */
export const CLINICAL_FLOORS = CENSUS.filter((c) => c.floorId !== 'command').length

// --- the one patient's route through the building ---------------------------
// This is the DEMO'S OWN view order (App.tsx): er → icu-story → cath-lab →
// or-room → icu (PODs 0-3, back in ICU-08) → step-down. He is admitted to the
// ICU from the ER and worked up there BEFORE the cath lab — so the thread
// climbs, drops back down to the Imaging tier, then climbs again. After the
// CABG he recovers where he already lay (ICU-08 — no new stop, the bed is stop
// 2), and the LAST leg is the POD 4 transfer to Step-Down. `room` matters:
// Cath Lab is the +x hexagon, OR-1 the −x slab, Step-Down the +x ward slab —
// the thread has to cross the building, not just rise through its middle.
export const JOURNEY: { floorId: string; room: string; label: string; scene: string }[] = [
  { floorId: 'er',       room: 'Emergency', label: 'Arrival',   scene: 'anterior STEMI · door' },
  { floorId: 'icu',      room: 'ICU',       label: 'ICU-08',    scene: 'admission · POD 0-3' },
  { floorId: 'imgcath',  room: 'Cath Lab',  label: 'Cath Lab',  scene: 'angiography · 3-vessel' },
  { floorId: 'theatres', room: 'OR1',       label: 'OR 1',      scene: 'CABG ×3' },
  { floorId: 'wards',    room: 'Step-Down', label: 'Step-Down', scene: 'POD 4 · telemetry only' },
]
