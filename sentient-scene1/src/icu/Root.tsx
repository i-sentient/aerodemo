import { useCallback, useEffect, useState } from 'react'
import { WardApp } from './App'
import { TarsMount } from './TarsMount'

// ---------------------------------------------------------------------------
//  ICU STORY — embedded (as a same-origin iframe) inside the Scene-1 host.
//   chapter 'workup'    : Sentient Ward tour → TARS STEMI workup. Story end →
//                         host advances to the Cath Lab transition.
//   chapter 'continued' : opens straight on the patient (post-angio). The
//                         PTCA/CABG decision plays; story end → host advances
//                         to the OR transition.
//   chapter 'postop'    : Scene 4, PODs 0-3 (post-CABG, in the ICU). Story end
//                         → host flies the Step-Down transfer.
//   chapter 'stepdown'  : Scene 4, POD 4 — after the transfer, in the Step-Down
//                         ward. Telemetry only. The terminus: holds at its end.
//  Every chapter runs the TARS app with ALL its own controls intact.
// ---------------------------------------------------------------------------
export type IcuChapter = 'workup' | 'continued' | 'postop' | 'stepdown'

export function Root({ chapter = 'workup' }: { chapter?: IcuChapter }) {
  const [phase, setPhase] = useState<'ward' | 'tars'>(chapter === 'workup' ? 'ward' : 'tars')
  const enterICU = useCallback(() => setPhase('tars'), [])

  // the TARS app dispatches 'tars:finished' at the end of a patient story →
  // bridge it to the host (parent window), tagged with the chapter so the host
  // routes the right transition (workup → cath dive · continued → OR dive).
  useEffect(() => {
    const onFinished = () => window.parent?.postMessage({ type: 'icu:finished', chapter }, '*')
    window.addEventListener('tars:finished', onFinished)
    return () => window.removeEventListener('tars:finished', onFinished)
  }, [chapter])

  if (chapter !== 'workup') return <TarsMount />
  return phase === 'ward' ? <WardApp onEnterICU={enterICU} /> : <TarsMount />
}
