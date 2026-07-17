# `src/ontology` — the shared clinical ontology

This module is the **single source of truth** for Scene 1. Every visual in the
app is a rendering of state that lives here. It is intentionally free of any
three.js / React-rendering code so it can be reused by a real backend later.

## Files

| File | Responsibility |
| --- | --- |
| `types.ts` | The typed data model: 11 core entities (+ `InventoryItem` stub), relations, provenance `StateType`, type guards. |
| `provenance.ts` | The **confidence → opacity/refraction** mapping. `PROVENANCE[A/B/C]` are the animatable visual targets a component tweens toward (the C→A "solidify"). |
| `palette.ts` | The **color grammar**. teal=autonomous/committed, amber=autoConfirm, coral=clinical-gated+waiting, gold=reasoning, green/amber/red=severity. CSS strings (`C`) + THREE numbers (`N`). |
| `relations.ts` | The **edge grammar**: per-`RelationKind` line style (solid/dashed/animated/gold) + deterministic `relationId()`. |
| `locationRegistry.ts` | Logical location id → world transform, **authored as data**. Objects only reference logical ids; this is the only place that knows 3D coordinates. |
| `store.ts` | zustand store: entities, relations, scene clock, actions. Plus the Scene-1 **baseline seed** (world before the episode). |
| `selectors.ts` | Pure reads backing the TARS "sense" capabilities (`capacitySense`, `transferSense`, `isLocationBlind`, …). Mutate nothing. |

## Three rules that keep the data source swappable

1. **`entity` is the discriminant** on every object — not `kind` (several
   objects use `kind` for their own sub-type, e.g. `Observation.kind`).
2. **Every trust-bearing value carries a `stateType`** (A sensor / B inferred /
   C human-asserted). This drives opacity + refraction and is animatable.
3. **Components read from the store, never from the mock episode.** The
   `EpisodePlayer` (added later) and a live WebSocket feed both mutate the store
   through the same actions, emitting the same entity/relation schema — so
   swapping mock → live touches only the player's input, not the components.

## Reading fast-changing state (perf)

- Structural changes (entity added, status changed) → subscribe reactively with
  the `useOntologyStore(selector)` hook.
- Per-frame / high-frequency reads inside `useFrame` → use
  `useOntologyStore.getState()` or `useOntologyStore.subscribe(selector, cb)`
  (enabled by the `subscribeWithSelector` middleware). **Never** drive per-frame
  updates through React setState.

## The Scene-1 baseline (seed)

`createScene1Seed()` builds the world *before* the episode:

- **ER is full** — `er-bay-1/2/3` all occupied (`capacitySense('er').full === true`).
- **Patient-X** (`pt-x`) sits stable in `er-bay-3` with a flat-green trajectory
  → the `transferSense()` target, moved to `ward-bed-7` to free a bay.
- `ward-bed-7`, `cath-lab`, `icu-bed-2` are clean → the Pre-warm / Cath-ready /
  Downstream-stage targets.
- The **inbound STEMI ghost is not seeded** — the `EpisodePlayer` spawns it at
  beat B1 as a Type C ghost, exactly as a live feed would.
