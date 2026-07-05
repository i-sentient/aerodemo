// ============================================================================
//  LOCATION REGISTRY — logical id → world transform, authored as DATA.
//  Ontology objects only ever reference logical location ids ("er-bay-3", …).
//  This registry is the ONLY place that knows where those live in 3D. Swapping
//  the greybox for a Blender GLB later means re-authoring these transforms —
//  nothing else.
//
//  SCENE 1 (ER-only): a single Emergency room laid out as a CORRIDOR — four
//  bays down each side wall, a central aisle, one open bay (er-bay-3) waiting
//  for the inbound patient. The camera flies in from the entrance (−Z) and
//  looks straight down the aisle, so the arriving patient lands dead-centre.
//
//  Layout (top-down, X right / Z down the aisle, Y up):
//
//     left wall (x=−5.5)   [er-1]  [er-3*]  [er-5]  [er-7]
//     aisle (x=0)          → → →  inbound comes down the aisle  → → →
//     right wall (x=+5.5)  [er-2]  [er-4]   [er-6]  [er-8]
//        z = −3      1       5       9
//     entrance (z=−6)   (inbound ghost hovers in the aisle mouth)
//     ambulance (front-left, offscreen)                (* = open bay)
// ============================================================================

export type Vec3 = [number, number, number]

export type LocationRole = 'bay' | 'bed' | 'lab' | 'staging' | 'external' | 'view'

export interface LocationNode {
  id: string
  role: LocationRole
  /** unit tag for beds/bays; undefined for external/staging/view */
  unit?: 'er' | 'ward' | 'icu' | 'cath'
  position: Vec3
  /** Y-rotation in radians (bed facing) */
  rotationY?: number
  label: string
}

const LEFT_X = -3.8
const RIGHT_X = 3.8
const ZS = [-2, 1.5, 5, 8.5] as const

const bay = (id: string, x: number, z: number, label: string): LocationNode => ({
  id, role: 'bay', unit: 'er', position: [x, 0, z], label,
})

export const LOCATIONS: Record<string, LocationNode> = {
  // ER — left wall (er-bay-3 is the open landing bay)
  'er-bay-1': bay('er-bay-1', LEFT_X, ZS[0], 'ER Bay 1'),
  'er-bay-3': bay('er-bay-3', LEFT_X, ZS[1], 'ER Bay 3'),
  'er-bay-5': bay('er-bay-5', LEFT_X, ZS[2], 'ER Bay 5'),
  'er-bay-7': bay('er-bay-7', LEFT_X, ZS[3], 'ER Bay 7'),

  // ER — right wall
  'er-bay-2': bay('er-bay-2', RIGHT_X, ZS[0], 'ER Bay 2'),
  'er-bay-4': bay('er-bay-4', RIGHT_X, ZS[1], 'ER Bay 4'),
  'er-bay-6': bay('er-bay-6', RIGHT_X, ZS[2], 'ER Bay 6'),
  'er-bay-8': bay('er-bay-8', RIGHT_X, ZS[3], 'ER Bay 8'),

  // Non-bed anchors
  staging: {
    id: 'staging', role: 'staging', position: [0, 1.6, -5], label: 'ER entrance',
  },
  ambulance: {
    id: 'ambulance', role: 'external', position: [-16, 1, -14], label: 'Ambulance (inbound)',
  },
  'physician-view': {
    id: 'physician-view', role: 'view', position: [9, 3, -2], label: 'Physician view',
  },
}

export const ALL_LOCATIONS: LocationNode[] = Object.values(LOCATIONS)

/** World position for a logical location id (falls back to origin with a warn). */
export const locationPosition = (id: string): Vec3 => {
  const node = LOCATIONS[id]
  if (!node) {
    console.warn(`[locationRegistry] unknown location "${id}" — defaulting to origin`)
    return [0, 0, 0]
  }
  return node.position
}

export const locationNode = (id: string): LocationNode | undefined => LOCATIONS[id]

export const locationsInUnit = (unit: LocationNode['unit']): LocationNode[] =>
  ALL_LOCATIONS.filter((l) => l.unit === unit)
