import React from 'react'
import ReactDOM from 'react-dom/client'
import { Root, type IcuChapter } from './Root'
import { useOntologyStore } from './ontology'
import './index.css'

// Which chapter of the ICU story to play — read from the (iframe) URL ?chapter=:
//   workup    → ward tour → TARS STEMI workup (ends → host shows the Cath Lab)
//   continued → post-angio: PTCA/CABG decision (ends → host shows the OR)
//   postop    → Scene 4 (post-CABG) — stub terminus for now
const chapter =
  ((new URLSearchParams(location.search).get('chapter') as IcuChapter) || 'workup')
;(window as unknown as { __tarsChapter: string }).__tarsChapter = chapter

// ?panela=1 — show ONLY Panel A (the dark scanner viewport). For the deck's
// PLEXUS chapter, which iframes this app right after "Initialising PLEXUS":
// PLEXUS is the perception layer, so only the perception panel belongs on
// screen. B and C stay in the DOM (tars' modules query them by id) — CSS in
// tars/styles.css hides them.
const q = new URLSearchParams(location.search)
if (q.get('panela') === '1') document.body.classList.add('panela-only')
// &panelc=1 widens the demo to A + C — the EMR read/write beat
if (q.get('panelc') === '1') document.body.classList.add('with-c')
// &embed=1 — hosted inside a scene beat: story keys stand down and the arrows
// are forwarded to the host as beat navigation
if (q.get('embed') === '1') document.body.classList.add('embed-keys')

// dev-only handle for debugging / scripted screenshots (window.ontology)
if (import.meta.env.DEV) {
  ;(window as unknown as { ontology: typeof useOntologyStore }).ontology = useOntologyStore
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root chapter={chapter} />
  </React.StrictMode>,
)
