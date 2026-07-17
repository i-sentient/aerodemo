// ============================================================================
//  PROVENANCE — the confidence→opacity/refraction mapping.
//  stateType is an ANIMATABLE property: components tween toward these target
//  values whenever an entity's stateType changes (the Scene-1 C→A "solidify").
//
//  These are pure visual targets — no three.js imported here so the mapping
//  stays testable and reusable by both the hero glass material and cheap
//  ambient fresnel fakes.
// ============================================================================
import type { StateType } from './types'

/** Which Sentient layer originates each provenance class. */
export const STATE_TYPE_SOURCE: Record<StateType, string> = {
  A: 'LSam · sensor',
  B: 'TARS · inferred',
  C: 'human · asserted',
}

export const STATE_TYPE_LABEL: Record<StateType, string> = {
  A: 'sensor-driven',
  B: 'inferred',
  C: 'human-asserted',
}

export interface ProvenanceVisual {
  /** overall opacity of the object [0..1] */
  opacity: number
  /** MeshTransmissionMaterial transmission for the hero object [0..1] */
  transmission: number
  /** surface roughness — sharper (low) for confident sensor data */
  roughness: number
  /** index of refraction — richer refraction for Type A */
  ior: number
  /** animated shimmer amplitude — Type B "subtle shimmer", 0 elsewhere */
  shimmer: number
  /** emissive rim strength — ghosts read cooler/dimmer */
  rim: number
}

/**
 * Target visuals per provenance class.
 *   A → SOLID, fully present, sharp refraction.
 *   B → mostly solid, subtle shimmer.
 *   C → GHOSTED, translucent, low opacity (provisional).
 */
export const PROVENANCE: Record<StateType, ProvenanceVisual> = {
  A: { opacity: 1.0, transmission: 1.0, roughness: 0.05, ior: 1.5, shimmer: 0.0, rim: 1.0 },
  B: { opacity: 0.82, transmission: 0.85, roughness: 0.18, ior: 1.35, shimmer: 0.25, rim: 0.8 },
  C: { opacity: 0.32, transmission: 0.45, roughness: 0.4, ior: 1.15, shimmer: 0.0, rim: 0.5 },
}

export const provenanceVisual = (s: StateType): ProvenanceVisual => PROVENANCE[s]

/** Linear interpolation between two provenance targets (for tweening C→A etc.). */
export const lerpProvenance = (
  a: ProvenanceVisual,
  b: ProvenanceVisual,
  t: number,
): ProvenanceVisual => ({
  opacity: a.opacity + (b.opacity - a.opacity) * t,
  transmission: a.transmission + (b.transmission - a.transmission) * t,
  roughness: a.roughness + (b.roughness - a.roughness) * t,
  ior: a.ior + (b.ior - a.ior) * t,
  shimmer: a.shimmer + (b.shimmer - a.shimmer) * t,
  rim: a.rim + (b.rim - a.rim) * t,
})
