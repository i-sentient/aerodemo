# Atomic Sentient Hospital — v2 (Blender → React)

A **version 2** of the hospital building, authored in **Blender** and exported as a
`.glb` to be imported into the React / react-three-fiber app in
[`../sentient-scene1`](../sentient-scene1). This folder is a proving ground for the
Blender→R3F asset pipeline: if we can build v2 in Blender, export it, and drop it
into the R3F scene cleanly, we develop it further from there.

## Why
`sentient-scene1` already exposes the seam for this:
- `src/scene/Building.tsx` — greybox floorplan with a documented **SEAM** where a
  Blender GLB replaces the greybox group, same transform + props, nothing else changes.
- `src/scene/BuildingStack.tsx` — the current **v1** procedural pavilion (the sculpted
  Sony-Ericsson-style hospital tower) with a preserved **Export contract**.

v2 = the same hospital, but modeled in Blender instead of procedurally, so we can
compare fidelity/effort and iterate on geometry outside of code.

## Source
The starting geometry is derived from the Gorillaz **Plastic Beach floating island**
(Sketchfab, `gorillaz_plastic_beach_floating_island.glb`). Plan: **strip the island
rock / water base, keep only the building**, then re-work it into the hospital v2.

## Folder layout
| Folder | Holds |
|---|---|
| `blender/`   | Working `.blend` files (v2 authoring) |
| `exports/`   | `.glb` / `.gltf` exports destined for R3F |
| `reference/` | Renders, reference images, screenshots |

## Pipeline
1. **Model / clean up** in Blender (strip rock, keep building).
2. **Export** `exports/atomic-sentient-hospital-v2.glb`
   (glTF 2.0, +Y up, apply transforms, Draco optional).
3. **Import** into `sentient-scene1`: copy the `.glb` into `sentient-scene1/public/`,
   load with `useGLTF`, and mount it at the `Building.tsx` SEAM.
4. **Develop further** in React (materials, labels, interactivity).

## Status
- [x] Folder scaffold created
- [ ] Strip island rock → isolate building in Blender
- [ ] First clean `.glb` export
- [ ] First import into `sentient-scene1`
