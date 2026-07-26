// ============================================================================
//  CENSUS — what is inside the building, by floor and by entity type.
//
//  This is the data the ontology view renders. It is a SIMULATED census: the
//  live episode store only carries Scene 1's ER cast (3 patients, 4 clinicians,
//  a couple of devices), which is a story sample, not a hospital. Rather than
//  imply a live feed we don't have, the counts below are authored to plausible
//  scale for a mid-size tertiary unit — and the view labels itself as simulated.
//
//  The TYPES are not invented: they are the same EntityKind vocabulary the rest
//  of the app runs on (ontology/types.ts). Swapping this file for a real feed's
//  aggregate query is the only change needed to make the view live.
// ============================================================================
import type { EntityKind, StateType } from './types'

/** The entity classes the ontology view draws. A subset of EntityKind — the
 *  things that physically occupy a floor and can be pointed at. */
export type CensusKind = Extract<EntityKind, 'patient' | 'clinician' | 'device' | 'bed'>

export const CENSUS_KINDS: CensusKind[] = ['patient', 'clinician', 'device', 'bed']

/** Display grammar per class — colour, short tag, and the plural noun. */
export const KIND_STYLE: Record<CensusKind, { color: string; tag: string; plural: string }> = {
  patient:   { color: '#ff6a54', tag: 'PT',  plural: 'patients' },   // coral — the people we're here for
  clinician: { color: '#f2b01e', tag: 'CLN', plural: 'staff' },      // gold — the people doing the work
  device:    { color: '#2e86e6', tag: 'DEV', plural: 'devices' },    // blue — sensing (LSam's domain)
  bed:       { color: '#12c2b0', tag: 'BED', plural: 'beds' },       // teal — capacity
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
}

// Authored to plausible scale. Device counts dominate — which is the point: a
// modern floor has far more instrumented objects than people, and almost none
// of them are visible to the humans working there.
export const CENSUS: FloorCensus[] = [
  { floorId: 'er',       counts: { patient: 14, clinician: 11, device: 63, bed: 18 }, provenance: { A: 61, B: 22, C: 17 }, occupancy: [14, 18] },
  { floorId: 'imgcath',  counts: { patient: 3,  clinician: 9,  device: 41, bed: 6  }, provenance: { A: 78, B: 16, C: 6  }, occupancy: [3, 6] },
  { floorId: 'theatres', counts: { patient: 2,  clinician: 14, device: 52, bed: 2  }, provenance: { A: 83, B: 13, C: 4  }, occupancy: [2, 2] },
  { floorId: 'icu',      counts: { patient: 8,  clinician: 12, device: 96, bed: 8  }, provenance: { A: 88, B: 9,  C: 3  }, occupancy: [8, 8] },
  { floorId: 'wards',    counts: { patient: 19, clinician: 8,  device: 44, bed: 24 }, provenance: { A: 66, B: 21, C: 13 }, occupancy: [19, 24] },
  { floorId: 'hdu',      counts: { patient: 26, clinician: 7,  device: 38, bed: 32 }, provenance: { A: 52, B: 25, C: 23 }, occupancy: [26, 32] },
  { floorId: 'command',  counts: { patient: 0,  clinician: 4,  device: 12, bed: 0  }, provenance: { A: 94, B: 6,  C: 0  } },
]

export const censusFor = (floorId: string) => CENSUS.find((c) => c.floorId === floorId)

export const TOTALS = CENSUS.reduce(
  (acc, f) => {
    for (const k of CENSUS_KINDS) acc[k] += f.counts[k]
    return acc
  },
  { patient: 0, clinician: 0, device: 0, bed: 0 } as Record<CensusKind, number>,
)

/** Whole-building provenance mix, weighted by how many objects each floor holds. */
export const TOTAL_PROVENANCE = (() => {
  let A = 0, B = 0, C = 0, w = 0
  for (const f of CENSUS) {
    const n = CENSUS_KINDS.reduce((s, k) => s + f.counts[k], 0)
    A += f.provenance.A * n; B += f.provenance.B * n; C += f.provenance.C * n; w += n
  }
  return { A: Math.round(A / w), B: Math.round(B / w), C: Math.round(C / w) }
})()

// --- the one patient's route through the building ---------------------------
// This is the DEMO'S OWN view order (App.tsx): er → icu-story → cath-lab →
// or-room → post-op. He is admitted to the ICU from the ER and worked up there
// BEFORE the cath lab — so the thread climbs, drops back down to the Imaging
// tier, then climbs again. `room` matters: Cath Lab is the +x hexagon of the
// imaging tier and OR-1 the −x slab of theatres, so the thread has to cross the
// building, not just rise through its middle.
export const JOURNEY: { floorId: string; room: string; label: string; scene: string }[] = [
  { floorId: 'er',       room: 'Emergency', label: 'Arrival',   scene: 'anterior STEMI · door' },
  { floorId: 'icu',      room: 'ICU',       label: 'ICU-08',    scene: 'admission · workup' },
  { floorId: 'imgcath',  room: 'Cath Lab',  label: 'Cath Lab',  scene: 'angiography · 3-vessel' },
  { floorId: 'theatres', room: 'OR1',       label: 'OR 1',      scene: 'CABG ×3' },
  { floorId: 'wards',    room: 'Post-Op',   label: 'Post-Op',   scene: 'POD 0 → 4 · recovery' },
]
