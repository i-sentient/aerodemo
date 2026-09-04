import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { SentientICU } from './sentient-icu/SentientICU'
import { useOntologyStore } from './ontology'
import './index.css'

// dev-only handle for debugging / scripted screenshots (window.ontology)
if (import.meta.env.DEV) {
  ;(window as unknown as { ontology: typeof useOntologyStore }).ontology =
    useOntologyStore
}

// Single clean entry point — the whole ride plays in-app from here
// (tower → ER → ICU story → Cath Lab → ICU continued), no hash routes.
// Opt-in side door: ?view=icu plays the standalone Sentient ICU showcase+tour.
const view = new URLSearchParams(window.location.search).get('view')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {view === 'icu' ? <SentientICU /> : <App />}
  </React.StrictMode>,
)
