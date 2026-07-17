import { useCallback, useEffect, useState } from 'react'
import { WardApp } from './App'
import { TarsMount } from './TarsMount'

// ---------------------------------------------------------------------------
//  ICU STORY — embedded (as a same-origin iframe) inside the Scene-1 host.
//   chapter 'workup'    : Sentient Ward tour → TARS STEMI workup. When the
//                         patient story ends it posts 'icu:finished' to the
//                         host, which advances to the Cath Lab transition.
//   chapter 'continued' : opens straight on the TARS ICU app (post-CT-angio).
//                         Terminus of the chain — no onward handoff.
//  Both chapters run the TARS app with ALL its own controls intact.
// ---------------------------------------------------------------------------
export function Root({ chapter = 'workup' }: { chapter?: 'workup' | 'continued' }) {
  const [phase, setPhase] = useState<'ward' | 'tars'>(chapter === 'continued' ? 'tars' : 'ward')
  const enterICU = useCallback(() => setPhase('tars'), [])

  // workup: the TARS app dispatches 'tars:finished' at the end of the patient
  // story → tell the host (parent window) to advance to the Cath Lab.
  useEffect(() => {
    if (chapter !== 'workup') return
    const onFinished = () => window.parent?.postMessage({ type: 'icu:finished', chapter }, '*')
    window.addEventListener('tars:finished', onFinished)
    return () => window.removeEventListener('tars:finished', onFinished)
  }, [chapter])

  if (chapter === 'continued') return <TarsMount />
  return phase === 'ward' ? <WardApp onEnterICU={enterICU} /> : <TarsMount />
}
