import React from 'react'
import ReactDOM from 'react-dom/client'
import { Root } from './Root'
import { useOntologyStore } from './ontology'
import './index.css'

// dev-only handle for debugging / scripted screenshots (window.ontology)
if (import.meta.env.DEV) {
  ;(window as unknown as { ontology: typeof useOntologyStore }).ontology =
    useOntologyStore
}

// Scene 2 · "ICU story": Sentient Ward tour → (handoff) → TARS ICU app.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
