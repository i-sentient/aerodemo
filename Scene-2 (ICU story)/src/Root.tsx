import { useCallback, useEffect, useState } from 'react'
import { WardApp } from './App'
import { TarsMount } from './TarsMount'

// Scene-1 (the tower) — after the TARS ICU story, we hand back here so the
// camera steps out of the ICU, reveals the building, and dives into the Cath Lab.
const SCENE1_CATH_URL = 'http://localhost:5210/#cath-return'

// ---------------------------------------------------------------------------
//  SCENE 2 · "ICU story" — two finished apps spliced end to end.
//   Phase 1: the Sentient Ward tour plays with ALL its own controls intact
//            (free orbit + Space/→/← stepping through its shots).
//   Handoff: the tour's extra terminal step fades out and flips the phase.
//   Phase 2: the TARS ICU app runs with ALL of ITS own controls intact
//            (bed clicks, layer toggles, heart-zoom, free camera).
//  Neither app is automated or rewritten — this only chooses which is on screen.
// ---------------------------------------------------------------------------
export function Root() {
  const [phase, setPhase] = useState<'ward' | 'tars'>('ward')
  const enterICU = useCallback(() => setPhase('tars'), [])

  // The TARS app steps its own beats on → / Space; only when the PATIENT story
  // reaches its last step does it dispatch 'tars:finished'. That's our cue to
  // hand back to Scene-1 for the Cath Lab dive (no more twitchy first-key exit).
  useEffect(() => {
    if (phase !== 'tars') return
    const onFinished = () => { window.location.href = SCENE1_CATH_URL }
    window.addEventListener('tars:finished', onFinished)
    return () => window.removeEventListener('tars:finished', onFinished)
  }, [phase])

  return phase === 'ward' ? (
    <WardApp onEnterICU={enterICU} />
  ) : (
    <TarsMount />
  )
}
