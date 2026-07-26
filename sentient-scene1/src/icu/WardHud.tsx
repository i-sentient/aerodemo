import { useEffect, useState } from 'react'
import './ward-hud.css'
import { capacityForStep } from './wardFloor'
// @ts-ignore — plain-JS tars module, no type declarations
import { state as tarsState, setTheme, onThemeChange } from './tars/state.js'

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

export function WardHud({ step, rightFrac = 0.3 }: { step: number; rightFrac?: number }) {
  const cap = capacityForStep(step)
  const [clock, setClock] = useState(nowStr)
  const [dark, setDark] = useState<boolean>(!!(tarsState as { dark?: boolean }).dark)
  useEffect(() => {
    const id = window.setInterval(() => setClock(nowStr()), 1000)
    return () => window.clearInterval(id)
  }, [])
  useEffect(() => onThemeChange((v: boolean) => setDark(v)), [])

  return (
    <div className="ward-hud" style={{ right: step >= 2 ? `${rightFrac * 100}vw` : 0 }}>
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

      {/* light/dark toggle — same global theme the TARS phase uses */}
      <button className="wh-theme" title="Light / dark" aria-label="Toggle theme" onClick={() => setTheme(!dark)}>
        {dark ? (
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.4 14.2A8.4 8.4 0 0 1 9.8 3.6a8.4 8.4 0 1 0 10.6 10.6z" /></svg>
        )}
      </button>
    </div>
  )
}
