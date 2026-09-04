// ============================================================================
//  ECG — synthetic waveform generator for LabResult ECG payloads.
//  Pure data (no three.js). Produces normalized samples in ~[-1, 1] so the
//  EcgCard can draw a raw strip. Patterns encode the clinical read:
//    sinus        — normal PQRST
//    deWinter     — upsloping ST depression + tall symmetric T (proximal LAD OMI)
//    stemi        — ST-segment elevation plateau
//    oldInferior  — a HEALED infarct: pathological Q, small R, nothing acute
// ============================================================================
import type { EcgStripData } from './types'

export type EcgPattern = 'sinus' | 'deWinter' | 'stemi' | 'oldInferior' | 'pericarditis'

const gauss = (t: number, c: number, w: number, a: number): number =>
  a * Math.exp(-((t - c) ** 2) / (2 * w * w))

/** Which morphology a bed's monitor draws.
 *
 *  Read off the ontology's own `cardiac` flag, never off acuity. The ward holds
 *  two critical patients and only one of them is an infarct — Okonkwo is in
 *  septic shock — so an acuity switch drew a STEMI on both of them, and drew it
 *  on the one man in the building we have spent the whole act establishing does
 *  NOT have ST elevation. Two live monitors used to carry their own copy of that
 *  switch; both now come through here.
 *
 *  Post-PCI morphology is deliberately not modelled: that belongs to the POD
 *  arc, which is being rebuilt separately. */
export function ecgPatternForBed(bed?: { cardiac?: boolean } | null): EcgPattern {
  return bed && bed.cardiac ? 'deWinter' : 'sinus'
}

/** One heartbeat over normalized phase t ∈ [0,1).
 *  The single source for every ECG on screen — baked strips call it in a loop,
 *  live monitors sample it per frame. Noise-free by design: `makeEcgStrip` bakes
 *  textures and needs determinism, so the animated callers add their own. */
export function ecgAt(t: number, pattern: EcgPattern): number {
  // A healed infarct rewrites the QRS itself, not just the ST segment, so this
  // one cannot share the complex below — dead muscle generates no depolarising
  // vector, which is why the Q goes deep and wide and the R never recovers.
  //
  // It is the only pattern here that says something about the PAST. Nothing in
  // it is acute: no ST shift, no hyperacute T, nothing a monitor would alarm
  // on. That is the point — it is a silent MI, weeks old, sitting in plain
  // sight on the admission ECG for anyone who thinks to look at a territory
  // nobody is worried about.
  if (pattern === 'oldInferior') {
    let q = gauss(t, 0.16, 0.022, 0.10)   // P, normal
    q += gauss(t, 0.31, 0.024, -0.62)     // pathological Q — deep AND broad
    // the Q's own tail eats into this, which is the physiology — at 0.26 the
    // net R came out 12% of baseline, a QS complex. Real, but on screen it is
    // just a downstroke. 0.42 leaves a small visible R (Qr), which reads as an
    // R that WAS there and got destroyed rather than one that never existed.
    q += gauss(t, 0.35, 0.012, 0.42)      // R, badly reduced
    q += gauss(t, 0.38, 0.012, -0.06)     // S, small
    q += gauss(t, 0.62, 0.05, 0.20)       // T, upright and unremarkable
    return q
  }
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
  } else if (pattern === 'pericarditis') {
    // POST-CARDIAC-INJURY SYNDROME (POD 3). Two signs, and the first one is the
    // one that matters: PR DEPRESSION — the segment between the P wave and the
    // QRS sits BELOW baseline. An infarct does not do that. It is what lets this
    // be told apart from the graft failure it otherwise looks like.
    if (t > 0.20 && t < 0.29) v += -0.055
    // ...and a CONCAVE ST elevation, modest, and the same in every territory.
    // A STEMI's is convex and regional; this dishes upward into the T and would
    // look identical in leads that share no blood supply.
    if (t > 0.40 && t < 0.60) { const u = (t - 0.40) / 0.20; v += 0.12 - 0.04 * Math.sin(Math.PI * u) }
    v += gauss(t, 0.66, 0.05, 0.26)
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
    for (let i = 0; i < perBeat; i++) out.push(ecgAt(i / perBeat, pattern))
  }
  return out
}

export function makeEcgPayload(pattern: EcgPattern = 'sinus'): EcgStripData {
  return { type: 'ecg', leads: ['II'], samples: makeEcgStrip(pattern), sampleRate: 250 }
}
