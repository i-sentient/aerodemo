import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { RoundERLab } from './lab/RoundERLab'
import { CathLabScene } from './lab/CathLabScene'
import { useOntologyStore } from './ontology'
import './index.css'

// dev-only handle for debugging / scripted screenshots (window.ontology)
if (import.meta.env.DEV) {
  ;(window as unknown as { ontology: typeof useOntologyStore }).ontology =
    useOntologyStore
}

// Views by hash:
//   (default) → ER shell lab   ·   #cath-lab → Cath Lab shell   ·   #app → old full app
// The old full app (intro dive + corridor scene) also lives in ../sentient-ward.
const hash = typeof window !== 'undefined' ? window.location.hash : ''
const view = hash.includes('app') ? (
  <App />
) : hash.includes('cath') ? (
  <CathLabScene />
) : (
  <RoundERLab />
)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{view}</React.StrictMode>,
)
