import { useEffect, useState } from 'react'
import './ward-hud.css'
import { capacityForStep } from './wardFloor'

// ---------------------------------------------------------------------------
//  WARD HUD — the instrument-panel chrome framing the ICU 3D view: corner
//  brackets, a scanline + grid texture, a soft vignette, a centred title, a
//  live CAPACITY tile (ticks 8/8 → 7/8 → 8/8 with the bed turnover) and a
//  foot ref + clock. Display-only (pointer-events:none) so it never blocks
//  orbiting. The whole frame retracts left with the ICU when the panel docks.
// ---------------------------------------------------------------------------
function nowStr() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export function WardHud({ step }: { step: number }) {
  const cap = capacityForStep(step)
  const [clock, setClock] = useState(nowStr)
  useEffect(() => {
    const id = window.setInterval(() => setClock(nowStr()), 1000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="ward-hud" style={{ right: step >= 2 ? '30vw' : 0 }}>
      {/* texture layers */}
      <div className="wh-grid" />
      <div className="wh-scan" />
      <div className="wh-vignette" />

      {/* corner brackets */}
      <div className="wh-bracket tl" />
      <div className="wh-bracket tr" />
      <div className="wh-bracket bl" />
      <div className="wh-bracket br" />

      {/* centred title */}
      <div className="wh-title">
        <div className="wh-title-main">DIGITAL STATE · ICU FLOOR</div>
        <div className="wh-title-sub">Live spatial twin · 8 monitored beds</div>
      </div>

      {/* capacity — bottom-right of the ICU area */}
      <div className="wh-capacity">
        <div className="wh-cap-tk">CAPACITY</div>
        <div className="wh-cap-num">
          {cap.occupied} / {cap.total}
        </div>
        <div className="wh-cap-u">beds occupied</div>
      </div>

      {/* foot ref + live clock — bottom-left */}
      <div className="wh-foot">REF 0xN-ICU · GRID 8x · {clock}</div>
    </div>
  )
}
