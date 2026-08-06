import React from 'react'
import ReactDOM from 'react-dom/client'
import { CastleView } from './CastleView'
import './index.css'

// Standalone castle-inspector app: loads the hospital-building GLB (base.glb).
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CastleView />
  </React.StrictMode>,
)
