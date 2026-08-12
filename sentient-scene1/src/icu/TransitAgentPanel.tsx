import { useEffect, useRef } from 'react'
import './ward-panelb.css'
// @ts-ignore — plain-JS tars module, no type declarations
import { initWardPanel, wardBeat } from './tars/chat.js'
import { TRANSIT_BEATS } from './transitScript'

// ---------------------------------------------------------------------------
//  TRANSIT AGENT PANEL — the ward's Panel B, docked over the ATLAS tower while
//  the patient is BETWEEN rooms.
//
//  Deliberately the same component the ICU uses, not a lookalike: the argument
//  the beat has to make is that this is one system spanning the building, and
//  that argument dies the moment the transit surface is a different object from
//  the ward surface. Same panel, different place — so the audience learns it
//  once and reads every later appearance for free.
//
//  What changes is who is in it. addMsg() sets the active agent from the line's
//  `who`, so a TARS-only script gives the bronze wash and the ORCHESTRATION
//  header for nothing, and the human notch simply never fills — nobody is on
//  this channel. That vacancy is the whole "in between" feeling; it is also why
//  the gated order at the end cannot resolve here.
//
//  It rides the transfer segment's phases and leaves before the dive: once the
//  camera is plunging into the ICU, the ward's own docked panel takes over.
// ---------------------------------------------------------------------------
/** dock width as a fraction of the viewport */
export const TRANSIT_DOCK = 0.3

export function TransitAgentPanel({ phase, armed, width = TRANSIT_DOCK }: { phase: string; armed: boolean; width?: number }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const booted = useRef(false)
  const fired = useRef(new Set<string>())
  // Only once the dot has LANDED on the ICU and stopped. While the thread is
  // still drawing, he is not there yet and TARS has nothing to report about a
  // room he has not reached. The settle before the dive belongs to the building
  // — a panel still talking over it turns the approach into admin.
  const visible = phase === 'onto' && armed

  // build the panel once (guarded against StrictMode's double-invoke)
  useEffect(() => {
    if (booted.current || !hostRef.current) return
    booted.current = true
    initWardPanel(hostRef.current)
    // dark variant. panelb.css redefines the whole palette under #panelB.p2.dark,
    // so the class is the entire switch — no theme plumbing, and none is wanted:
    // scene 1 never mounts tars/ui.js, so there is no global toggle to follow.
    // It has to go on AFTER initWardPanel, which ends with a classList.toggle
    // against chat.js's own `dark` flag and would strip it right back off.
    hostRef.current.classList.add('dark')
  }, [])

  // the beat starts when the panel is actually on screen — keyed off the same
  // condition as the slide, so the first line can never be spoken to an empty
  // edge of the screen and then be gone by the time it opens
  useEffect(() => {
    if (!visible || fired.current.has(phase)) return
    const beat = TRANSIT_BEATS[phase]
    if (!beat || !beat.length) return
    fired.current.add(phase)
    wardBeat(beat)
  }, [visible, phase])

  return (
    <div className={'ward-agent-dock side-left' + (visible ? ' in' : '')} style={{ width: `${width * 100}vw` }}>
      <div ref={hostRef} id="panelB" />
    </div>
  )
}
