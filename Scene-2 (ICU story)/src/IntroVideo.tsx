import { useCallback, useEffect, useRef } from 'react'

// ---------------------------------------------------------------------------
//  Scene-2 · film player — used for the intro (hospital → sick bay) and the
//  ER→ICU transition. It autoplays muted (no user gesture needed) and fills the
//  screen. At `fadeAt` seconds the zoom has landed; we fire `onFadeStart` and
//  the parent fades to black + swaps in the next piece.
//
//  The cue is driven off the video's `timeupdate` (tied to media playback)
//  rather than requestAnimationFrame — rAF is throttled when the tab isn't
//  focused. A rAF poll is layered on for precision when the tab IS visible;
//  whichever crosses `fadeAt` first wins (guarded so it fires once).
// ---------------------------------------------------------------------------
export function IntroVideo({
  fadeAt,
  onFadeStart,
  src = '/intro.mp4',
}: {
  fadeAt: number
  onFadeStart: () => void
  src?: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const fired = useRef(false)

  const fire = useCallback(() => {
    if (fired.current) return
    fired.current = true
    onFadeStart()
  }, [onFadeStart])

  const checkTime = useCallback(
    (v: HTMLVideoElement | null) => {
      if (v && v.currentTime >= fadeAt) fire()
    },
    [fadeAt, fire],
  )

  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    v.muted = true // set the property directly — the JSX attr isn't always honored
    // best-effort autoplay; muted playback is allowed without a user gesture
    const p = v.play()
    if (p && typeof p.catch === 'function') p.catch(() => {})

    // precision poll for when the tab is visible (rAF may be throttled otherwise)
    let raf = 0
    const tick = () => {
      if (fired.current) return
      if (v.currentTime >= fadeAt) return fire()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    // safety net: if the clip stalls or never reaches fadeAt, hand off anyway
    const safety = window.setTimeout(fire, 15000)

    // presenter shortcut: Space / → / Enter skips the film straight to the fade
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowRight' || e.code === 'Enter') {
        e.preventDefault()
        fire()
      }
    }
    window.addEventListener('keydown', onKey)

    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(safety)
      window.removeEventListener('keydown', onKey)
    }
  }, [fadeAt, fire])

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#06080c', zIndex: 0 }}>
      <video
        ref={videoRef}
        src={src}
        autoPlay
        muted
        playsInline
        preload="auto"
        onTimeUpdate={(e) => checkTime(e.currentTarget)}
        onEnded={fire}
        onError={fire}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
    </div>
  )
}
