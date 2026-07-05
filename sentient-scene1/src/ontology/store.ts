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
  Acuity,
  EntityKind,
  EntityOf,
  OntologyEntity,
  Relation,
  Severity,
  TrajectoryDirection,
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
//  Ambient ER population (declared before the store, which seeds on creation)
// ---------------------------------------------------------------------------
interface AmbientBay {
  bay: string
  pid: string
  bedId: string
  name: string
  cc: string
  acuity: Acuity
  sev: Severity
  score: number
  dir: TrajectoryDirection
  series: number[]
}

// Seven occupied bays (everything except er-bay-3, the open landing bay).
const AMBIENT: AmbientBay[] = [
  { bay: 'er-bay-1', pid: 'pt-er1', bedId: 'bed-er1', name: 'A. Boateng', cc: 'Abdominal pain', acuity: 'elevated', sev: 'amber', score: 4, dir: 'rising', series: [2, 2, 3, 3, 4, 4] },
  { bay: 'er-bay-2', pid: 'pt-er2', bedId: 'bed-er2', name: 'L. Fernandes', cc: 'Breathlessness', acuity: 'elevated', sev: 'amber', score: 3, dir: 'flat', series: [3, 3, 3, 4, 3, 3] },
  { bay: 'er-bay-4', pid: 'pt-er4', bedId: 'bed-er4', name: 'R. Okafor', cc: 'Resolved syncope', acuity: 'stable', sev: 'green', score: 0, dir: 'flat', series: [1, 0, 0, 1, 0, 0] },
  { bay: 'er-bay-5', pid: 'pt-er5', bedId: 'bed-er5', name: 'T. Suzuki', cc: 'Laceration — sutured', acuity: 'stable', sev: 'green', score: 1, dir: 'flat', series: [1, 1, 0, 1, 0, 1] },
  { bay: 'er-bay-6', pid: 'pt-er6', bedId: 'bed-er6', name: 'P. Almeida', cc: 'Asthma — stabilised', acuity: 'stable', sev: 'green', score: 1, dir: 'falling', series: [3, 2, 2, 1, 1, 1] },
  { bay: 'er-bay-7', pid: 'pt-er7', bedId: 'bed-er7', name: 'M. Haddad', cc: 'Chest pain — low risk', acuity: 'elevated', sev: 'amber', score: 3, dir: 'flat', series: [2, 3, 3, 3, 3, 3] },
  { bay: 'er-bay-8', pid: 'pt-er8', bedId: 'bed-er8', name: 'D. Ferreira', cc: 'Migraine', acuity: 'stable', sev: 'green', score: 0, dir: 'flat', series: [0, 1, 0, 0, 1, 0] },
]

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
//  SCENE-1 BASELINE SEED  (ER-only, single-patient focus)
//  The world *before* the episode plays: a single Emergency room with 8 bays.
//  Seven are occupied by quiet ambient patients; ER Bay 3 is left CLEAN — the
//  open bay the inbound patient will land in. The inbound STEMI ghost is NOT
//  seeded here — the EpisodePlayer spawns it at beat B1, exactly as a live feed
//  would.
// ===========================================================================
function createScene1Seed(): OntologyData {
  const entities: OntologyEntity[] = []
  const relations: Relation[] = []
  const push = (...es: OntologyEntity[]) => entities.push(...es)

  const occupies = (patientId: string, bedId: string) =>
    relations.push({
      id: relationId('occupies', patientId, bedId), from: patientId, to: bedId,
      kind: 'occupies', committed: true,
    })

  // -- seven occupied ER bays (ambient background patients) -------------------
  for (const a of AMBIENT) {
    push(
      {
        entity: 'patient', id: a.pid, label: a.name, locationId: a.bay,
        acuity: a.acuity, chiefComplaint: a.cc, priority: a.acuity === 'stable' ? 5 : 3,
        stateType: 'A', active: true,
      },
      {
        entity: 'bed', id: a.bedId, locationId: a.bay, unit: 'er',
        status: 'occupied', occupantPatientId: a.pid,
      },
      {
        entity: 'vitalTrajectory', id: `traj-${a.pid}`, patientId: a.pid,
        score: a.score, direction: a.dir, severity: a.sev, series: a.series,
      },
    )
    occupies(a.pid, a.bedId)
  }

  // -- er-bay-3: the OPEN landing bay (clean, waiting for the inbound) ---------
  push({
    entity: 'bed', id: 'bed-er3', locationId: 'er-bay-3', unit: 'er', status: 'clean',
  })

  // -- an ECG device at the open bay (used by the OMI-read later) -------------
  push({
    entity: 'device', id: 'dev-ecg', locationId: 'er-bay-3', kind: 'ecg', online: true,
  })

  // -- CLINICIANS -------------------------------------------------------------
  push(
    {
      entity: 'clinician', id: 'cl-nurse', role: 'nurse', locationId: 'er-bay-2',
      assignedPatientIds: ['pt-er1', 'pt-er2'],
    },
    {
      entity: 'clinician', id: 'cl-doc', role: 'doctor', locationId: 'er-bay-6',
      assignedPatientIds: ['pt-er7'],
    },
    {
      entity: 'clinician', id: 'cl-ops', role: 'ops', locationId: 'staging',
      assignedPatientIds: [],
    },
  )

  const assign = (clinicianId: string, patientId: string) =>
    relations.push({
      id: relationId('assigned', clinicianId, patientId), from: clinicianId,
      to: patientId, kind: 'assigned', committed: true,
    })
  assign('cl-nurse', 'pt-er1')
  assign('cl-doc', 'pt-er7')

  // reduce to keyed records
  return {
    entities: Object.fromEntries(entities.map((e) => [e.id, e])),
    relations: Object.fromEntries(relations.map((r) => [r.id, r])),
  }
}
