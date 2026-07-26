import { useEffect, useRef } from 'react'
import './ward-panelb.css'
// @ts-ignore — plain-JS tars module, no type declarations
import { initWardPanel, wardBeat } from './tars/chat.js'
import { WARD_BEATS } from './wardScript'

// ---------------------------------------------------------------------------
//  WARD AGENT PANEL — tars' Panel B, docked over the ICU during the ward tour.
//  Slides in from the right at state 2 (bird's-eye) and sits in the far-right
//  corner at real Panel-B dimensions. Each ICU step's chatter comes from
//  WARD_BEATS (wardScript.ts). It dies with the ward phase in the handoff
//  fade — the tars phase rebuilds its own Panel B in the 3-panel layout.
// ---------------------------------------------------------------------------
export function WardAgentPanel({
  step,
  width = 0.3,
  onResize,
}: {
  step: number
  /** chat width as a fraction of the viewport (the camera lens-shift follows it) */
  width?: number
  onResize?: (frac: number) => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const booted = useRef(false)
  const fired = useRef(new Set<number>())
  const visible = step >= 2

  // drag the dock's left edge to trade width between the ICU floor and the chat.
  // No canvas resize happens — the 3D reframes via the camera lens-shift — so the
  // drag is live and flash-free. Window-level listeners + a buttons guard (the
  // hardened pattern from the 3-split gutters).
  const onDragStart = (e: React.PointerEvent) => {
    e.preventDefault()
    const el = e.currentTarget as HTMLElement
    el.classList.add('dragging')
    document.body.classList.add('ward-resizing')
    const move = (ev: PointerEvent) => {
      if (!ev.buttons) return end()
      const frac = Math.min(0.45, Math.max(0.22, (window.innerWidth - ev.clientX) / window.innerWidth))
      onResize?.(frac)
    }
    const end = () => {
      el.classList.remove('dragging')
      document.body.classList.remove('ward-resizing')
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  // build the panel once (guarded against StrictMode double-invoke)
  useEffect(() => {
    if (booted.current || !hostRef.current) return
    booted.current = true
    initWardPanel(hostRef.current)
  }, [])

  // play each step's beat the first time that step is reached
  useEffect(() => {
    if (step < 2 || fired.current.has(step)) return
    fired.current.add(step)
    const beat = WARD_BEATS[step]
    if (beat && beat.length) wardBeat(beat)
  }, [step])

  return (
    <div className={'ward-agent-dock' + (visible ? ' in' : '')} style={{ width: `${width * 100}vw` }}>
      <div className="ward-drag" title="Drag to resize" onPointerDown={onDragStart} />
      <div ref={hostRef} id="panelB" />
    </div>
  )
}
