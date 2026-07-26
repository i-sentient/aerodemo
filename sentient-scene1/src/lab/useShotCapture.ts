import { useEffect, type RefObject } from 'react'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'

// DEV: press "P" to capture the current camera as a ready-to-paste SHOT line —
// same workflow as the ward rig. Orbit to the angle you want, hit P: the
// `{ pos: [...], look: [...] }` line pops up on screen AND lands on your
// clipboard. No-op in production builds.
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
      navigator.clipboard?.writeText(shot).catch(() => {})

      // on-screen toast so no DevTools needed
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
      el.textContent = '📷 SHOT (copied to clipboard):\n' + shot
      el.style.opacity = '1'
      window.clearTimeout((el as unknown as { __t?: number }).__t)
      ;(el as unknown as { __t?: number }).__t = window.setTimeout(() => { el!.style.opacity = '0' }, 6000)
      el.style.transition = 'opacity .4s'
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [controls])
}
