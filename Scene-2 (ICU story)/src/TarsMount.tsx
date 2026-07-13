import { useEffect, useRef } from 'react'
import { TARS_HTML } from './tars-scaffold'

// ---------------------------------------------------------------------------
//  Mounts the TARS (vanilla three.js) app verbatim. We inject its exact panel
//  scaffold into the DOM, then dynamically import its entry — tars/main.js runs
//  its own boot() against that scaffold (which also injects its own CSS). Every
//  tars control stays exactly as authored; nothing here drives it.
// ---------------------------------------------------------------------------
export function TarsMount() {
  const hostRef = useRef<HTMLDivElement>(null)
  const booted = useRef(false)

  useEffect(() => {
    if (booted.current || !hostRef.current) return
    booted.current = true // guard against StrictMode double-invoke
    hostRef.current.innerHTML = TARS_HTML
    // @ts-ignore — plain-JS module, no type declarations
    import('./tars/main.js')
  }, [])

  return <div ref={hostRef} style={{ position: 'fixed', inset: 0 }} />
}
