import { useEffect, useRef } from 'react'
import './ward-workspace.css'
// @ts-ignore — plain-JS tars module, no type declarations
import { initApps } from './tars/apps.js'
// @ts-ignore — plain-JS tars module, no type declarations
import { setMode } from './tars/state.js'

// ---------------------------------------------------------------------------
//  WARD WORKSPACE — Panel C. Mounts the REAL tars workspace (apps.js) into the
//  sliding dock and opens the full sectioned patient EMR (left rail: Summary ·
//  Vitals · Labs · Meds · Orders · Notes · Imaging · History), with the EMR /
//  LIS / PACS clinical apps in the dock. The scaffold IDs below —
//  #appsTitle / #appView / #dock — are exactly what apps.js queries; initApps()
//  wires it up and setMode('patient', …) builds the dock and opens the record.
//  Slides in on the final ICU step. It dies with the ward phase in the handoff
//  fade — the tars phase then boots its own Panel C untouched.
// ---------------------------------------------------------------------------
export function WardWorkspacePanel({ inView }: { inView: boolean }) {
  const booted = useRef(false)

  useEffect(() => {
    if (booted.current) return
    booted.current = true // guard against StrictMode double-invoke
    initApps() // register the workspace against #appView / #dock / #appsTitle
    // Open the FULL sectioned patient EMR — left rail: Summary · Vitals · Labs ·
    // Meds · Orders · Notes · Imaging · History + the record body. Not the flat
    // floor med list. ICU-04 is the critical STEMI, so every section is populated.
    setMode('patient', 'ICU-04')
  }, [])

  return (
    <div className={'ward-workspace-dock' + (inView ? ' in' : '')}>
      <div className="panel-hd">
        <span className="accent" />
        <span className="t" id="appsTitle">Workspace</span>
      </div>
      <div id="appView" />
      <div className="dock" id="dock" />
    </div>
  )
}
