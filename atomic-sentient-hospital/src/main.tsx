import React from 'react'
import ReactDOM from 'react-dom/client'
import { PodComposer } from './PodComposer'
import { HeroScene } from './HeroScene'
import { App } from './App'

// default = App (hospital ⇄ ER unified transition).
// /?view=composer = the pod editor · /?view=hero = the bare structure viewer
const view = new URLSearchParams(window.location.search).get('view')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {view === 'composer' ? <PodComposer /> : view === 'hero' ? <HeroScene /> : <App />}
  </React.StrictMode>,
)
