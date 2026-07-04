// ============================================================================
//  STORE — the single source of truth for ontology objects, relations, and a
//  scene clock. Built on zustand + `subscribeWithSelector` so that:
//    • React components read STRUCTURAL state (entity added/removed, status
//      changed) reactively, and
//    • useFrame code reads FAST-CHANGING state transiently via
//      `useOntologyStore.getState()` / `.subscribe(selector, cb)` — NEVER
//      driving per-frame updates through React setState (see PERF BUDGET).
//
//  The store is deliberately a generic ontology container. It knows nothing
//  about "Scene 1" beyond the baseline seed below; the EpisodePlayer (added in
//  a later step) mutates it through these same actions — and a live WebSocket
//  feed would too, unchanged.
// ============================================================================
import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type {
  EntityKind,
  EntityOf,
  OntologyEntity,
  Relation,
} from './types'
import { relationId } from './relations'

// ---------------------------------------------------------------------------
//  Shape
// ---------------------------------------------------------------------------
export interface SceneClock {
  /** scene time in seconds */
  t: number
  playing: boolean
  /** playback rate multiplier */
  rate: number
  /** total authored duration (set by the player; used by the scrubber) */
  duration: number
}

/** The pure data slice — what selectors and a live feed operate on. */
export interface OntologyData {
  entities: Record<string, OntologyEntity>
  relations: Record<string, Relation>
}

export interface OntologyStore extends OntologyData {
  clock: SceneClock
  /** currently focused object id (camera + overlay), or null */
  focusId: string | null

  // --- entity actions ---
  upsertEntity: (e: OntologyEntity) => void
  upsertEntities: (es: OntologyEntity[]) => void
  patchEntity: <T extends OntologyEntity = OntologyEntity>(
    id: string,
    patch: Partial<T>,
  ) => void
  removeEntity: (id: string) => void

  // --- relation actions ---
  upsertRelation: (r: Relation) => void
  patchRelation: (id: string, patch: Partial<Relation>) => void
  removeRelation: (id: string) => void

  // --- Autonomy Governor ---
  /** Authorize an Order → status 'authorized' and commit its proposed-move
   *  relation (the clinical-gated gate: it waited for a human hand). */
  authorizeOrder: (orderId: string) => void

  // --- clock actions ---
  setClock: (patch: Partial<SceneClock>) => void
  tick: (dt: number) => void
  play: () => void
  pause: () => void
  togglePlay: () => void
  seek: (t: number) => void

  // --- focus / lifecycle ---
  setFocus: (id: string | null) => void
  /** reset entities + relations to the baseline seed, PRESERVING the clock.
   *  Used by the EpisodePlayer to rebuild state on a backward scrub. */
  resetOntology: () => void
  /** full reset — baseline + clock + focus. Used by the scrubber's Restart. */
  reset: () => void
}

// ---------------------------------------------------------------------------
//  Non-reactive read helpers (safe to call inside useFrame)
// ---------------------------------------------------------------------------
export const getEntity = <K extends EntityKind>(
  id: string,
): EntityOf<K> | undefined =>
  useOntologyStore.getState().entities[id] as EntityOf<K> | undefined

export const getEntitiesByKind = <K extends EntityKind>(
  kind: K,
): EntityOf<K>[] =>
  Object.values(useOntologyStore.getState().entities).filter(
    (e): e is EntityOf<K> => e.entity === kind,
  )

// ---------------------------------------------------------------------------
//  Store
// ---------------------------------------------------------------------------
export const useOntologyStore = create<OntologyStore>()(
  subscribeWithSelector((set) => {
    const seed = createScene1Seed()
    return {
      entities: seed.entities,
      relations: seed.relations,
      clock: { t: 0, playing: false, rate: 1, duration: 60 },
      focusId: null,

      upsertEntity: (e) =>
        set((s) => ({ entities: { ...s.entities, [e.id]: e } })),

      upsertEntities: (es) =>
        set((s) => {
          const entities = { ...s.entities }
          for (const e of es) entities[e.id] = e
          return { entities }
        }),

      patchEntity: (id, patch) =>
        set((s) => {
          const cur = s.entities[id]
          if (!cur) return {}
          return {
            entities: {
              ...s.entities,
              [id]: { ...cur, ...patch } as OntologyEntity,
            },
          }
        }),

      removeEntity: (id) =>
        set((s) => {
          if (!s.entities[id]) return {}
          const entities = { ...s.entities }
          delete entities[id]
          return { entities }
        }),

      upsertRelation: (r) =>
        set((s) => ({ relations: { ...s.relations, [r.id]: r } })),

      patchRelation: (id, patch) =>
        set((s) => {
          const cur = s.relations[id]
          if (!cur) return {}
          return { relations: { ...s.relations, [id]: { ...cur, ...patch } } }
        }),

      removeRelation: (id) =>
        set((s) => {
          if (!s.relations[id]) return {}
          const relations = { ...s.relations }
          delete relations[id]
          return { relations }
        }),

      authorizeOrder: (orderId) =>
        set((s) => {
          const o = s.entities[orderId]
          if (!o || o.entity !== 'order') return {}
          const entities = {
            ...s.entities,
            [orderId]: { ...o, status: 'authorized' as const },
          }
          // commit any proposed-move relation for this order's patient →
          // dashed coral snaps to solid teal (RelationEdges reads `committed`).
          const relations = { ...s.relations }
          for (const r of Object.values(relations)) {
            if (r.kind === 'proposed-move' && r.from === o.patientId && !r.committed) {
              relations[r.id] = { ...r, committed: true }
            }
          }
          return { entities, relations }
        }),

      setClock: (patch) => set((s) => ({ clock: { ...s.clock, ...patch } })),

      tick: (dt) =>
        set((s) => {
          if (!s.clock.playing) return {}
          const t = Math.min(s.clock.duration, s.clock.t + dt * s.clock.rate)
          const playing = t < s.clock.duration
          return { clock: { ...s.clock, t, playing } }
        }),

      play: () => set((s) => ({ clock: { ...s.clock, playing: true } })),
      pause: () => set((s) => ({ clock: { ...s.clock, playing: false } })),
      togglePlay: () =>
        set((s) => ({ clock: { ...s.clock, playing: !s.clock.playing } })),
      seek: (t) =>
        set((s) => ({
          clock: { ...s.clock, t: Math.max(0, Math.min(s.clock.duration, t)) },
        })),

      setFocus: (id) => set({ focusId: id }),

      resetOntology: () => {
        const fresh = createScene1Seed()
        set({ entities: fresh.entities, relations: fresh.relations })
      },

      reset: () => {
        const fresh = createScene1Seed()
        set({
          entities: fresh.entities,
          relations: fresh.relations,
          clock: { t: 0, playing: false, rate: 1, duration: 60 },
          focusId: null,
        })
      },
    }
  }),
)

// ===========================================================================
//  SCENE-1 BASELINE SEED
//  The world *before* the episode plays: ER is FULL (Capacity-sense → "ER
//  full"), Patient-X sits stable in er-bay-3 with a flat-green trajectory
//  (the Transfer-sense target), ward-bed-7 is clean (the destination),
//  cath-lab and icu-bed-2 are free (Cath-ready / Downstream-stage targets).
//  The inbound STEMI ghost is NOT seeded here — the EpisodePlayer spawns it
//  at beat B1, exactly as a live feed would.
// ===========================================================================
function createScene1Seed(): OntologyData {
  const entities: OntologyEntity[] = []
  const relations: Relation[] = []
  const push = (...es: OntologyEntity[]) => entities.push(...es)

  // -- occupied ER bays (ER is full) -----------------------------------------
  // er-bay-1: elevated, deteriorating a little (amber, rising)
  push(
    {
      entity: 'patient', id: 'pt-er1', label: 'A. Boateng', locationId: 'er-bay-1',
      acuity: 'elevated', chiefComplaint: 'Abdominal pain', priority: 3,
      stateType: 'A', active: true,
    },
    {
      entity: 'bed', id: 'bed-er1', locationId: 'er-bay-1', unit: 'er',
      status: 'occupied', occupantPatientId: 'pt-er1',
    },
    {
      entity: 'device', id: 'dev-er1', locationId: 'er-bay-1',
      kind: 'multipara-monitor', online: true,
    },
    {
      entity: 'encounter', id: 'enc-er1', patientId: 'pt-er1', kind: 'ed',
      startTime: -3600, status: 'active',
    },
    {
      entity: 'vitalTrajectory', id: 'traj-er1', patientId: 'pt-er1', score: 4,
      direction: 'rising', severity: 'amber', series: [2, 2, 3, 3, 4, 4],
    },
  )

  // er-bay-2: elevated, stable-ish
  push(
    {
      entity: 'patient', id: 'pt-er2', label: 'L. Fernandes', locationId: 'er-bay-2',
      acuity: 'elevated', chiefComplaint: 'Breathlessness', priority: 3,
      stateType: 'A', active: true,
    },
    {
      entity: 'bed', id: 'bed-er2', locationId: 'er-bay-2', unit: 'er',
      status: 'occupied', occupantPatientId: 'pt-er2',
    },
    {
      entity: 'device', id: 'dev-er2', locationId: 'er-bay-2',
      kind: 'multipara-monitor', online: true,
    },
    {
      entity: 'encounter', id: 'enc-er2', patientId: 'pt-er2', kind: 'ed',
      startTime: -5400, status: 'active',
    },
    {
      entity: 'vitalTrajectory', id: 'traj-er2', patientId: 'pt-er2', score: 3,
      direction: 'flat', severity: 'amber', series: [3, 3, 3, 4, 3, 3],
    },
  )

  // er-bay-3: PATIENT-X — stable, flat-green trajectory (step-ready). The
  // Transfer-sense target that will be moved to ward-bed-7 to free a bay.
  push(
    {
      entity: 'patient', id: 'pt-x', label: 'R. Okafor', locationId: 'er-bay-3',
      acuity: 'stable', chiefComplaint: 'Resolved syncope', priority: 5,
      stateType: 'A', active: true,
    },
    {
      entity: 'bed', id: 'bed-er3', locationId: 'er-bay-3', unit: 'er',
      status: 'occupied', occupantPatientId: 'pt-x',
    },
    {
      entity: 'device', id: 'dev-er3', locationId: 'er-bay-3',
      kind: 'multipara-monitor', online: true,
    },
    {
      entity: 'encounter', id: 'enc-x', patientId: 'pt-x', kind: 'ed',
      startTime: -7200, status: 'active',
    },
    {
      entity: 'vitalTrajectory', id: 'traj-x', patientId: 'pt-x', score: 0,
      direction: 'flat', severity: 'green', series: [1, 0, 0, 1, 0, 0],
    },
    // A few real (Type A) observations backing Patient-X's flat-green trend.
    {
      entity: 'observation', id: 'obs-x-hr', patientId: 'pt-x', kind: 'hr',
      value: 72, unit: 'bpm', stateType: 'A', timestamp: -30,
    },
    {
      entity: 'observation', id: 'obs-x-spo2', patientId: 'pt-x', kind: 'spo2',
      value: 98, unit: '%', stateType: 'A', timestamp: -30,
    },
    {
      entity: 'observation', id: 'obs-x-bp', patientId: 'pt-x', kind: 'bp',
      value: '118/76', unit: 'mmHg', stateType: 'A', timestamp: -30,
    },
  )

  // -- WARD: destination bed clean, neighbours occupied -----------------------
  push(
    {
      entity: 'bed', id: 'bed-w6', locationId: 'ward-bed-6', unit: 'ward',
      status: 'occupied', occupantPatientId: 'pt-w6',
    },
    {
      entity: 'patient', id: 'pt-w6', label: 'T. Suzuki', locationId: 'ward-bed-6',
      acuity: 'stable', chiefComplaint: 'Pneumonia — recovering', priority: 5,
      stateType: 'A', active: true,
    },
    {
      entity: 'bed', id: 'bed-w7', locationId: 'ward-bed-7', unit: 'ward',
      status: 'clean', // the prepared destination (Pre-warm target)
    },
    {
      entity: 'bed', id: 'bed-w8', locationId: 'ward-bed-8', unit: 'ward',
      status: 'occupied', occupantPatientId: 'pt-w8',
    },
    {
      entity: 'patient', id: 'pt-w8', label: 'P. Almeida', locationId: 'ward-bed-8',
      acuity: 'stable', chiefComplaint: 'Asthma — stabilised', priority: 5,
      stateType: 'A', active: true,
    },
  )

  // -- CATH LAB: free (Cath-ready target) -------------------------------------
  push({
    entity: 'bed', id: 'bed-cath', locationId: 'cath-lab', unit: 'cath',
    status: 'clean',
  })

  // -- ICU: one occupied, icu-bed-2 free (Downstream-stage reserve target) ----
  push(
    {
      entity: 'bed', id: 'bed-icu1', locationId: 'icu-bed-1', unit: 'icu',
      status: 'occupied', occupantPatientId: 'pt-icu1',
    },
    {
      entity: 'patient', id: 'pt-icu1', label: 'M. Haddad', locationId: 'icu-bed-1',
      acuity: 'critical', chiefComplaint: 'Post-arrest', priority: 1,
      stateType: 'A', active: true,
    },
    {
      entity: 'bed', id: 'bed-icu2', locationId: 'icu-bed-2', unit: 'icu',
      status: 'clean',
    },
  )

  // -- CLINICIANS -------------------------------------------------------------
  push(
    {
      entity: 'clinician', id: 'cl-nurse', role: 'nurse', locationId: 'er-bay-2',
      assignedPatientIds: ['pt-er1', 'pt-er2', 'pt-x'],
    },
    {
      entity: 'clinician', id: 'cl-doc', role: 'doctor', locationId: 'er-bay-1',
      assignedPatientIds: ['pt-er1', 'pt-icu1'],
    },
    {
      entity: 'clinician', id: 'cl-ops', role: 'ops', locationId: 'staging',
      assignedPatientIds: [],
    },
  )

  // -- an ECG device present in ER (used by OMI-read later) -------------------
  push({
    entity: 'device', id: 'dev-ecg', locationId: 'er-bay-3', kind: 'ecg', online: true,
  })

  //  NOTE: the inbound STEMI ghost, the move/display Orders, and the
  //  proposed-move / data-flow / reasoning relations are NOT seeded here — the
  //  EpisodePlayer (src/episode/scene1.ts) emits them at beats B1–B7, exactly
  //  as a live WebSocket feed would. This baseline is the true pre-episode
  //  state: ER full, Patient-X step-ready, ward-7/cath/icu-2 clean.

  // -- RELATIONS: occupies (solid teal) + assigned (thin) ---------------------
  const occupies = (patientId: string, bedId: string) =>
    relations.push({
      id: relationId('occupies', patientId, bedId), from: patientId, to: bedId,
      kind: 'occupies', committed: true,
    })
  occupies('pt-er1', 'bed-er1')
  occupies('pt-er2', 'bed-er2')
  occupies('pt-x', 'bed-er3')
  occupies('pt-w6', 'bed-w6')
  occupies('pt-w8', 'bed-w8')
  occupies('pt-icu1', 'bed-icu1')

  const assign = (clinicianId: string, patientId: string) =>
    relations.push({
      id: relationId('assigned', clinicianId, patientId), from: clinicianId,
      to: patientId, kind: 'assigned', committed: true,
    })
  assign('cl-nurse', 'pt-x')
  assign('cl-nurse', 'pt-er1')
  assign('cl-doc', 'pt-icu1')

  // reduce to keyed records
  return {
    entities: Object.fromEntries(entities.map((e) => [e.id, e])),
    relations: Object.fromEntries(relations.map((r) => [r.id, r])),
  }
}
