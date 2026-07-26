import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { SentientICU } from './sentient-icu/SentientICU'
import { DeviceHistory } from './sentient-icu/DeviceHistory'
import { useOntologyStore } from './ontology'
import './index.css'

// dev-only handle for debugging / scripted screenshots (window.ontology)
if (import.meta.env.DEV) {
  ;(window as unknown as { ontology: typeof useOntologyStore }).ontology =
    useOntologyStore
}

// Single clean entry point — the whole ride plays in-app from here
// (tower → ER → ICU story → Cath Lab → ICU continued), no hash routes.
// ?view=icu = the SENTIENT ICU experience: DEVICE HISTORY showcase → 3D ward
//   tour (sentient-icu/SentientICU). ?shot=N deep-links skip the intro.
// ?view=devices = the DEVICE HISTORY showcase on its own.
const view = new URLSearchParams(window.location.search).get('view')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {view === 'icu' ? <SentientICU /> : view === 'devices' ? <DeviceHistory /> : <App />}
  </React.StrictMode>,
)

