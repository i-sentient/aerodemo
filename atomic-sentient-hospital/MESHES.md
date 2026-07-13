# Mesh manifest — atomic-sentient-hospital-v2.glb

Export: `exports/atomic-sentient-hospital-v2.glb` (glTF 2.0, **Y-up** for three.js/R3F).
In R3F: `const { nodes } = useGLTF('/atomic-sentient-hospital-v2.glb')` → access any part by
name, e.g. `nodes.BigFrontRoom.geometry`.

Dims are Blender-unit bounding boxes at the current (scaled) size, for relative reference.

## Structural base (simple — can also be rebuilt as R3F `<cylinderGeometry>`)
| Name | Dims (W×D×H) | What it is |
|---|---|---|
| `CoreCylinder` | 16 × 16 × 52 | Fat central stem (the continuous spine) |
| `ERDrum` | 48 × 48 × 7.2 | Wide "Emergency Sick Bay" base drum |
| `DeckTier` | 28 × 28 × 4 | Mid deck ring |

## Castle central spine
| Name | Dims | What it is |
|---|---|---|
| `HouseBase` | 9 × 9 × 28 | Castle's central column (sits on the core axis) |
| `Windows` | 34 × 45 × 31 | Big wraparound curved window shell |

## Cantilevered window-pods (the main rooms)
| Name | Dims | What it is |
|---|---|---|
| `BigFrontRoom` | 17 × 9 × 28 | Large front curved window room |
| `BigBackRoom` | 10 × 21 × 30 | Large back curved room |
| `FrontRoom` | 8 × 15 × 28 | Tall front room |
| `BackRoom` | 13 × 9 × 24 | Back window room |
| `CliffRoom` | 11 × 10 × 7 | Small pod room |

## Extra cliff pods (duplicates added for the cluster)
| Name | Dims | What it is |
|---|---|---|
| `ExtraCliff_1` | 8 × 7 × 5 | Bigger extra cliff pod |
| `ExtraCliff_2` | 5 × 4.5 × 3.4 | Smaller extra cliff pod |

## Rooftop
| Name | Dims | What it is |
|---|---|---|
| `BackDeck` | 10.5 × 17 × 1.3 | Rooftop deck slab |
| `RailPost_110` … `RailPost_117` | 0.3 × 0.3 × 7.3 | 8 rooftop railing posts |
| `Extension` | 27 × 22 × 4.5 | Roof extension piece |

## Entrances / slabs
| Name | Dims | What it is |
|---|---|---|
| `TopEntrance` | 17.6 × 18.7 × 1.4 | Top entrance slab |
| `BottomEntrance` | 17.7 × 19 × 2.9 | Bottom entrance slab |

---
**Naming note:** intermediate transform empties were renamed `<name>_grp`; the mesh you
reference is the clean `<name>`.
