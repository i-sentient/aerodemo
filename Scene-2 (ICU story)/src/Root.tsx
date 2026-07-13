import { useCallback, useState } from 'react'
import { WardApp } from './App'
import { TarsMount } from './TarsMount'

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
  return phase === 'ward' ? (
    <WardApp onEnterICU={enterICU} />
  ) : (
    <TarsMount />
  )
}
