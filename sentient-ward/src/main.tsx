import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { useOntologyStore } from './ontology'
import './index.css'

// dev-only handle for debugging / scripted screenshots (window.ontology)
if (import.meta.env.DEV) {
  ;(window as unknown as { ontology: typeof useOntologyStore }).ontology =
    useOntologyStore
}

// This project is the hospital building + corridor/ward scene, split out of
// sentient-scene1 into its own app. It always renders the full App.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
