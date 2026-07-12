import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { RoundERLab } from './lab/RoundERLab'
import { useOntologyStore } from './ontology'
import './index.css'

// dev-only handle for debugging / scripted screenshots (window.ontology)
if (import.meta.env.DEV) {
  ;(window as unknown as { ontology: typeof useOntologyStore }).ontology =
    useOntologyStore
}

// Default view is the ER lab (what we're building). The old full app (intro
// dive + corridor scene) now lives in its own project — ../sentient-ward — but
// is still reachable here behind #app for convenience.
const showOldApp =
  typeof window !== 'undefined' && window.location.hash.includes('app')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{showOldApp ? <App /> : <RoundERLab />}</React.StrictMode>,
)
