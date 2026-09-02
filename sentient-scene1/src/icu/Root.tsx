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
export type IcuChapter = 'workup' | 'continued' | 'postop' | 'stepdown' | 'er'

export function Root({ chapter = 'workup' }: { chapter?: IcuChapter }) {
  /* 'workup' is two places — the ward tour (triage) and then the bedside — and
   * it always opened on the first. That is right when you WALK in, and wrong for
   * the bar's PRE-CATH pill, which means the bedside: clicking it landed you on
   * triage, the stop before the one you asked for. ?seek=bedside skips the tour. */
  const seekBedside = new URLSearchParams(window.location.search).get('seek') === 'bedside'
  const [phase, setPhase] = useState<'ward' | 'tars'>(chapter === 'workup' && !seekBedside ? 'ward' : 'tars')
  const enterICU = useCallback(() => setPhase('tars'), [])

  // the TARS app dispatches 'tars:finished' at the end of a patient story →
  // bridge it to the host (parent window), tagged with the chapter so the host
  // routes the right transition (workup → cath dive · continued → OR dive).
  useEffect(() => {
    const onFinished = () => window.parent?.postMessage({ type: 'icu:finished', chapter }, '*')
    window.addEventListener('tars:finished', onFinished)
    return () => window.removeEventListener('tars:finished', onFinished)
  }, [chapter])

  // Keys do not cross an iframe boundary. This app fills the frame for four of
  // the host's scenes, so once focus is in here the host never sees ` and its
  // scene bar could be opened but not closed. Forward those keys up.
  // Not DEV-gated: the deck's bar is the real navigation now, not a dev tool.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Escape travels too: the bar is opened with ` and dismissed with Esc, and
      // a bar you can open from in here but not close is worse than no bar.
      const toggle = e.key === '`' || e.key === '~'
      if (!toggle && e.key !== 'Escape') return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      // window.TOP, not window.parent. In the deck this app is nested twice —
      // deck > scene1 > icu.html — so posting to `parent` only reached scene1,
      // which has no bar of its own any more, and the key vanished. That is why
      // the bar would not close in PRE-CATH and every other IcuFrame chapter.
      // Standalone, `top` is scene1's own window, where SceneBar is listening.
      window.top?.postMessage({ type: toggle ? 'scenebar:toggle' : 'scenebar:close' }, '*')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /* Report which half of the chapter is on screen.
   *
   * 'workup' is TWO places: the ward tour (the ICU floor twin — triage) and then
   * the patient at the bedside. That split is THIS component's phase, not the
   * TARS app's mode — main.js only boots, and only posts, once phase is 'tars' —
   * so during the whole ward tour the host heard nothing and its navigation bar
   * had no way to know triage was up. */
  useEffect(() => {
    try { window.parent?.postMessage({ type: 'icu:mode', mode: phase, chapter }, '*') } catch { /* not framed */ }
  }, [phase, chapter])

  if (chapter !== 'workup') return <TarsMount />
  return phase === 'ward' ? <WardApp onEnterICU={enterICU} /> : <TarsMount />
}
