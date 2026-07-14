// ============================================================================
//  ECG — synthetic waveform generator for LabResult ECG payloads.
//  Pure data (no three.js). Produces normalized samples in ~[-1, 1] so the
//  EcgCard can draw a raw strip. Patterns encode the clinical read:
//    sinus     — normal PQRST
//    deWinter  — upsloping ST depression + tall symmetric T (proximal LAD OMI)
//    stemi     — ST-segment elevation plateau
// ============================================================================
import type { EcgStripData } from './types'

export type EcgPattern = 'sinus' | 'deWinter' | 'stemi'

const gauss = (t: number, c: number, w: number, a: number): number =>
  a * Math.exp(-((t - c) ** 2) / (2 * w * w))

/** One heartbeat over normalized phase t ∈ [0,1). */
function beat(t: number, pattern: EcgPattern): number {
  let v = 0
  v += gauss(t, 0.16, 0.022, 0.12) // P
  v += gauss(t, 0.30, 0.010, -0.09) // Q
  v += gauss(t, 0.33, 0.011, 1.0) // R
  v += gauss(t, 0.37, 0.013, -0.26) // S

  if (pattern === 'sinus') {
    v += gauss(t, 0.62, 0.05, 0.22) // normal T
  } else if (pattern === 'deWinter') {
    // upsloping ST depression at the J-point + tall symmetric T
    if (t > 0.4 && t < 0.56) v += -0.1 + (t - 0.4) * 0.5
    v += gauss(t, 0.64, 0.055, 0.62) // tall T
  } else {
    // STEMI — ST elevation plateau then T
    if (t > 0.4 && t < 0.6) v += 0.28
    v += gauss(t, 0.66, 0.05, 0.34)
  }
  return v
}

export function makeEcgStrip(
  pattern: EcgPattern = 'sinus',
  beats = 8,
  perBeat = 110,
): number[] {
  const out: number[] = []
  for (let b = 0; b < beats; b++) {
    for (let i = 0; i < perBeat; i++) out.push(beat(i / perBeat, pattern))
  }
  return out
}

export function makeEcgPayload(pattern: EcgPattern = 'sinus'): EcgStripData {
  return { type: 'ecg', leads: ['II'], samples: makeEcgStrip(pattern), sampleRate: 250 }
}
