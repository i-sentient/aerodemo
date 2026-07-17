// ============================================================================
//  RELATION STYLE — the edge grammar.
//  Maps each RelationKind to how its QuadraticBezierLine should render:
//    solid    = committed
//    dashed   = proposed
//    animated = data flow (marching dashes)
//    gold     = reasoning
//  Also holds the id-minting helper so relation ids are deterministic.
// ============================================================================
import { C, N } from './palette'
import type { RelationKind } from './types'

export interface RelationStyle {
  /** committed color */
  color: string
  colorN: number
  /** dashed line (proposed / candidate) */
  dashed: boolean
  /** marching-dash animation (data flow) */
  animated: boolean
  /** base line width */
  width: number
  /** emissive intensity — feeds selective bloom on edges */
  glow: number
  /** short human label for the overlay/legend */
  label: string
}

export const RELATION_STYLE: Record<RelationKind, RelationStyle> = {
  occupies: {
    color: C.teal, colorN: N.teal, dashed: false, animated: false,
    width: 2.5, glow: 0.6, label: 'occupies',
  },
  'proposed-move': {
    color: C.coral, colorN: N.coral, dashed: true, animated: false,
    width: 2, glow: 0.8, label: 'proposed move',
  },
  assigned: {
    color: C.slate, colorN: N.slate, dashed: false, animated: false,
    width: 1.25, glow: 0.2, label: 'assigned',
  },
  inbound: {
    color: C.blue, colorN: N.blue, dashed: false, animated: true,
    width: 2, glow: 0.9, label: 'inbound',
  },
  'data-flow': {
    color: C.blue, colorN: N.blue, dashed: true, animated: true,
    width: 1.5, glow: 0.7, label: 'data flow',
  },
  reasoning: {
    color: C.gold, colorN: N.gold, dashed: false, animated: true,
    width: 2, glow: 1.0, label: 'reasoning',
  },
  authorizes: {
    color: C.teal, colorN: N.teal, dashed: false, animated: false,
    width: 3, glow: 1.2, label: 'authorizes',
  },
}

/**
 * When a proposed relation commits, it uses the "committed" style.
 * proposed-move (dashed coral) → snaps to solid teal on authorize.
 */
export const committedStyleFor = (kind: RelationKind): RelationStyle => {
  if (kind === 'proposed-move') {
    return { ...RELATION_STYLE.occupies, label: 'move · committed' }
  }
  return { ...RELATION_STYLE[kind], dashed: false }
}

export const relationId = (kind: RelationKind, from: string, to: string): string =>
  `rel:${kind}:${from}->${to}`
