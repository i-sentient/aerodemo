import { useEffect, type RefObject } from 'react'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'

// ---------------------------------------------------------------------------
//  DEV: press "P" to copy the current camera as a ready-to-paste SHOT line.
//  Self-contained copy for the sentient-icu folder (no ../lab dependency).
//  Orbit to the angle you want, hit P: the `{ pos: [...], look: [...] }` line
//  logs + lands on your clipboard + shows an on-screen toast. No-op in prod.
// ---------------------------------------------------------------------------
export function useShotCapture(controls: RefObject<OrbitControlsImpl | null>) {
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'p' && e.key !== 'P') return
      const c = controls.current
      if (!c) return
      const r = (n: number) => Math.round(n * 100) / 100
      const p = c.object.position
      const t = c.target
      const shot = `{ pos: [${r(p.x)}, ${r(p.y)}, ${r(p.z)}], look: [${r(t.x)}, ${r(t.y)}, ${r(t.z)}] }`
      // eslint-disable-next-line no-console
      console.log('📷 SHOT →', shot)
      // Clipboard, belt and braces. navigator.clipboard.writeText rejects in
      // some setups even on a user gesture (Brave's clipboard gating, or the
      // document not counting as focused with DevTools open) — and it failed
      // SILENTLY here, so P looked like it copied and hadn't. Fall back to the
      // execCommand path, which works on any keydown, and say so in the toast
      // if both refuse.
      const legacyCopy = () => {
        const ta = document.createElement('textarea')
        ta.value = shot
        ta.style.cssText = 'position:fixed;opacity:0'
        document.body.appendChild(ta)
        ta.select()
        let ok = false
        try { ok = document.execCommand('copy') } catch { /* refused */ }
        ta.remove()
        return ok
      }
      let copied = true
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(shot).catch(() => {
          if (!legacyCopy()) copied = false
        })
      } else {
        copied = legacyCopy()
      }

      let el = document.getElementById('__shot_toast')
      if (!el) {
        el = document.createElement('div')
        el.id = '__shot_toast'
        el.style.cssText =
          'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:9999;' +
          'max-width:90vw;padding:12px 16px;border-radius:10px;font:13px/1.5 ui-monospace,monospace;' +
          'background:#0f172a;color:#e2e8f0;box-shadow:0 8px 30px rgba(0,0,0,.35);' +
          'border:1px solid #334155;white-space:pre-wrap;text-align:center;pointer-events:none;'
        document.body.appendChild(el)
      }
      el.textContent = (copied ? '📷 SHOT (copied to clipboard):\n' : '📷 SHOT (clipboard refused — copy by hand):\n') + shot
      el.style.opacity = '1'
      window.clearTimeout((el as unknown as { __t?: number }).__t)
      ;(el as unknown as { __t?: number }).__t = window.setTimeout(() => { el!.style.opacity = '0' }, 6000)
      el.style.transition = 'opacity .4s'
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [controls])
}
