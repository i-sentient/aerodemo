import React from 'react'
import ReactDOM from 'react-dom/client'
import { Root } from './Root'
import { useOntologyStore } from './ontology'
import './index.css'

// Which chapter of the ICU story to play — read from the (iframe) URL ?chapter=:
//   workup    → ward tour → TARS STEMI workup (ends → host shows the Cath Lab)
//   continued → opens straight on the patient, post-CT-angio (terminus)
const chapter =
  ((new URLSearchParams(location.search).get('chapter') as 'workup' | 'continued') || 'workup')
;(window as unknown as { __tarsChapter: string }).__tarsChapter = chapter

// dev-only handle for debugging / scripted screenshots (window.ontology)
if (import.meta.env.DEV) {
  ;(window as unknown as { ontology: typeof useOntologyStore }).ontology = useOntologyStore
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root chapter={chapter} />
  </React.StrictMode>,
)
