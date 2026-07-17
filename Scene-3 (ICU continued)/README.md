# Sentient · Scene 1 — ontology visualizer

A runnable, web-friendly react-three-fiber app that plays **"Scene 1"**: a
choreographed STEMI arrival where a hospital's **live ontology state** is
rendered in real time. Every visual is a rendering of ontology state — the same
components are meant to be driven later by a live backend feed instead of the
scripted timeline, **with zero component changes**.

```bash
npm install
npm run dev      # http://localhost:5173  — Scene 1 autoplays
npm run build    # tsc --noEmit && vite build
```

Use the **timeline scrubber** (bottom) to play/pause, scrub, and jump between
beats. Click any patient node to focus it (the hero gets real glass
transmission + full cards); click empty space to clear focus.

## The idea

Sentient is a 3-layer clinical intelligence platform; this app visualizes its
shared ontology.

- **LSam** — edge SENSING (devices, observations, vital trajectories).
- **TARS** — ONTOLOGY + ORCHESTRATION; acts through an Autonomy Governor.
- **iSAM / SAM** — clinical REASONING; always surfaces the raw result BESIDE its
  read, never the read alone.

Two visual grammars carry all the meaning:

| Channel | Encodes |
| --- | --- |
| **Opacity / refraction** | confidence — provenance `stateType` A (sensor, solid) · B (inferred) · C (human-asserted, ghosted) |
| **Color** | autonomy / clinical state — teal=autonomous/committed · amber=autoConfirm · coral=clinical-gated+waiting · gold=reasoning · green/amber/red=severity |
| **Pulse rate** | urgency |
| **Bloom / fill** | readiness (e.g. a bed `warming`) |
| **Edges** | relations — solid=committed · dashed=proposed · animated dot=data-flow · gold=reasoning |

## Architecture

```
src/
  ontology/          ← single source of truth (NO three.js here)
    types.ts           11 entities + relations + provenance StateType + guards
    provenance.ts      confidence → opacity/refraction targets (animatable)
    palette.ts         colour grammar (CSS + THREE) incl. AERO light theme
    relations.ts       per-RelationKind edge style + committed snap
    locationRegistry.ts  logical id → world transform (the ONLY place with coords)
    store.ts           zustand store (+ subscribeWithSelector) + baseline seed
    selectors.ts       capacitySense / transferSense / isLocationBlind …
    ecg.ts             synthetic ECG waveform (de Winter / STEMI / sinus)
  episode/           ← the swappable data source
    scene1.ts          typed, timestamped event OPS (WS-feed-shaped) for B1–B7
    EpisodePlayer.tsx  turns the clock into ops; scrubbable (fwd apply / back rebuild)
  scene/             Environment, Building (greybox), Postprocessing, anchors, glow, textures
  components/        PatientNode, VitalTrajectoryCard, EcgCard, GlassCard,
                     RelationEdges, OrderLayer, HandoffCard, PatientLayer
  App.tsx            Canvas wiring + overlay + timeline scrubber
```

### The swappable seam (mock → live)

Components read **only** from `@/ontology` (the store). The `EpisodePlayer`
applies `Op`s (`{op:'patchEntity', id, patch}`, `{op:'upsertRelation', …}`) on a
timeline — the **exact shape a live WebSocket feed would emit**. Swapping to a
live feed means replacing `EpisodePlayer` with a `WebSocketPlayer` that applies
the same ops. Nothing in `components/` or `scene/` changes.

### Performance

- Structural changes (entity added/status changed) flow through the React store
  hook. Per-frame work (tweens, pulses, the precise scene clock, flow dots)
  reads via refs / `getState()` — **never** per-frame React setState. The clock
  is pushed to React only ~12 Hz for the scrubber.
- Real `MeshTransmissionMaterial` is used **only** on the focused/hero object;
  ambient patients use cheap fake-glass. Cards are frosted clearcoat (no
  transmission). Selective bloom keys on luminance > 1 (HDR emissives only).

## Scene 1 beats (`src/episode/scene1.ts`)

| Beat | What happens (ontology mutation) |
| --- | --- |
| **B1** | Inbound provisional Patient spawns as a **Type C ghost** at staging; animated inbound arc from the ambulance. |
| **B2** | Capacity-sense: ER reads FULL (a pure read — no mutation). |
| **B3** | Transfer-sense finds step-ready Patient-X (flat-green) → emits a **proposed-move** (dashed coral) + clinical-gated move Order. |
| **B4** | The gated Order **pulses and waits**; an autonomous display Order fires teal on its own; the nurse-tap authorizes → edge snaps solid teal. |
| **B5** | Pre-warm: ward-bed-7 → `warming` (bloom); Patient-X transfers (node glides), handoff card travels; vacated ER bay → `dirty` then cleaned. |
| **B6** | iSAM OMI-read on the ECG: sets the read (de Winter), acuity → critical; gold reasoning edge; Lysis-guard advisory; Priority-drive; cath lab pre-warms; an ICU bed is reserved. Raw strip shown WITH the read. |
| **B7** | Arrival: the ghost **solidifies (Type C→A)** as vitals go live (running sparkline), lands in the prepared bay; the handoff surfaces in the physician view. |

`window.ontology` is exposed in dev for poking at the store from the console.
