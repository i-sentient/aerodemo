// ============================================================================
//  LOCATION REGISTRY — logical id → world transform, authored as DATA.
//  Ontology objects only ever reference logical location ids
//  ("er-bay-3", "ward-bed-7", "cath-lab", "icu-bed-2"). This registry is the
//  ONLY place that knows where those live in 3D. Swapping the greybox for a
//  Blender GLB later means re-authoring these transforms — nothing else.
//
//  Layout (top-down, X right / Z toward camera-far, Y up):
//
//        ICU (y=5, back)          [icu-bed-1] [icu-bed-2]
//        WARD (z=+10)     [ward-bed-6] [ward-bed-7] [ward-bed-8]
//        ER   (z=0)          [er-bay-1] [er-bay-2] [er-bay-3]      [cath-lab →]
//        staging (z=-6)             (ghost hovers here)
//        ambulance (z=-14, offscreen-left)      physician-view (right)
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

const bay = (id: string, x: number, label: string): LocationNode => ({
  id, role: 'bay', unit: 'er', position: [x, 0, 0], label,
})
const wardBed = (id: string, x: number, label: string): LocationNode => ({
  id, role: 'bed', unit: 'ward', position: [x, 0, 10], label,
})
const icuBed = (id: string, x: number, label: string): LocationNode => ({
  id, role: 'bed', unit: 'icu', position: [x, 5, 14], label,
})

export const LOCATIONS: Record<string, LocationNode> = {
  // ER — a row of three bays
  'er-bay-1': bay('er-bay-1', -5, 'ER Bay 1'),
  'er-bay-2': bay('er-bay-2', 0, 'ER Bay 2'),
  'er-bay-3': bay('er-bay-3', 5, 'ER Bay 3'),

  // WARD — step-down beds
  'ward-bed-6': wardBed('ward-bed-6', -5, 'Ward Bed 6'),
  'ward-bed-7': wardBed('ward-bed-7', 0, 'Ward Bed 7'),
  'ward-bed-8': wardBed('ward-bed-8', 5, 'Ward Bed 8'),

  // CATH LAB — off to the right of ER
  'cath-lab': {
    id: 'cath-lab', role: 'lab', unit: 'cath', position: [12, 0, 3], label: 'Cath Lab',
  },

  // ICU — elevated, back
  'icu-bed-1': icuBed('icu-bed-1', -3, 'ICU Bed 1'),
  'icu-bed-2': icuBed('icu-bed-2', 3, 'ICU Bed 2'),

  // Non-bed anchors
  staging: {
    id: 'staging', role: 'staging', position: [0, 1.6, -6], label: 'Inbound staging',
  },
  ambulance: {
    id: 'ambulance', role: 'external', position: [-16, 1, -14], label: 'Ambulance (inbound)',
  },
  'physician-view': {
    id: 'physician-view', role: 'view', position: [12, 3.5, -8], label: 'Physician view',
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
