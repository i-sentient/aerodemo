// ============================================================================
//  WARD FLOOR — the 8th bed's story arc + live capacity, keyed to the ICU step.
//  ICU-08 is the "story bed": Jagan Mohan is stepped down and transferred out,
//  the bed turns over (dirty → clean), then Chandrababu (anterior OMI) is
//  admitted and deteriorates. Beds 1–7 come from the shared ontology and stay
//  put — nothing here mutates that ontology, so the TARS phase is untouched.
//  States mirror WARD_BEATS (wardScript.ts): 2 flag · 3 transfer · 4 dirty ·
//  5 clean · 6 inbound · 7 arrival · 8 deterioration.
// ============================================================================

export type Tone = 'stable' | 'watch' | 'critical' | 'empty'

export type RosterRow = {
  id: string
  tone: Tone // dot + badge colour
  name: string // patient name; '' renders as an em dash
  dx: string // diagnosis / status line
  news: string // NEWS2 badge text: a number, '—' (empty), or 'IN' (inbound)
  alarm?: boolean // pulsing dot for the urgent beats
}

const STEPDOWN = 'Jagan Mohan' // the patient being de-escalated out of Bed 8
const INCOMING = 'Chandrababu' // the anterior-OMI patient who takes it

// ICU-08 across the ICU states (0…8); anything past the end clamps to the last.
export function bed8ForStep(step: number): RosterRow {
  const s = Math.max(0, Math.min(step, 8))
  switch (s) {
    case 0:
    case 1:
      return { id: 'ICU-08', tone: 'stable', name: STEPDOWN, dx: 'Sepsis — resolved', news: '2' }
    case 2:
      return { id: 'ICU-08', tone: 'stable', name: STEPDOWN, dx: 'Step-down eligible ✓', news: '2' }
    case 3:
      return { id: 'ICU-08', tone: 'stable', name: STEPDOWN, dx: 'Transferring out →', news: '2' }
    case 4:
      return { id: 'ICU-08', tone: 'empty', name: '', dx: 'Bed unmade · cleaning', news: '—' }
    case 5:
      return { id: 'ICU-08', tone: 'empty', name: '', dx: 'Clean · ready', news: '—' }
    case 6:
      return { id: 'ICU-08', tone: 'critical', name: 'Inbound', dx: 'Probable MI · ETA 9m', news: 'IN', alarm: true }
    case 7:
      return { id: 'ICU-08', tone: 'critical', name: INCOMING, dx: 'Anterior OMI · admitted', news: '8' }
    default:
      return { id: 'ICU-08', tone: 'critical', name: INCOMING, dx: 'Deteriorating — trajectory rising', news: '8', alarm: true }
  }
}

// occupied / total as the bed turns over: Bed 8 is empty from state 4 (Jagan
// gone) until state 7 (Chandrababu admitted). The other seven are always full.
export function capacityForStep(step: number): { occupied: number; total: number } {
  const bed8Empty = step >= 4 && step <= 6
  return { occupied: bed8Empty ? 7 : 8, total: 8 }
}
