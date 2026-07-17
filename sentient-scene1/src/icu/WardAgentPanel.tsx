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
export function WardAgentPanel({ step, dockRight = 0 }: { step: number; dockRight?: number | string }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const booted = useRef(false)
  const fired = useRef(new Set<number>())
  const visible = step >= 2

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
    <div className={'ward-agent-dock' + (visible ? ' in' : '')} style={{ right: dockRight }}>
      <div ref={hostRef} id="panelB" />
    </div>
  )
}
