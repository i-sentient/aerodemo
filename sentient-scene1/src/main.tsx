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
//   (default) → full app (intro dive through the tower + corridor ER)
//   #cath-return → App resumes at the ICU→Cath transition (Scene-2 hands back here)
//   #lab → ER shell lab   ·   #cath-lab → Cath Lab shell
const hash = typeof window !== 'undefined' ? window.location.hash : ''
const view = hash.includes('cath-return') ? (
  <App initialView="cath-return" />
) : hash.includes('cath') ? (
  <CathLabScene />
) : hash.includes('lab') ? (
  <RoundERLab />
) : (
  <App />
)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{view}</React.StrictMode>,
)
