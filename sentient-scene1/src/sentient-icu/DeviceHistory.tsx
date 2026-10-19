import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { CriticalCareOverview } from './CriticalCareOverview'

// ---------------------------------------------------------------------------
//  DEVICE HISTORY — the bedside-equipment graphic, in three beats on one
//  drawing:
//    0  the patient alone
//    1  leaders draw out from the body, labels land
//    2  everything but the six machines the ward builds falls away
//
//  No chrome. No header, no counter, no caption, no arrows — the graphic is
//  the slide, edge to edge, and it's driven by → / Space / ← like the rest of
//  the deck. Advancing off the last beat enters the ward; stepping back off
//  the first hands ← to the deck.
//
//  The six vendor product shots that used to follow are gone: the ward builds
//  every one of those machines in 3D with its own hero shot and a live screen,
//  so the photos said it twice — and real Philips/GE/NIPRO marks assert a
//  vendor relationship the deck doesn't claim. Files remain in assets/devices.
// ---------------------------------------------------------------------------

const N = 3

export function DeviceHistory({ startAt = 0, onEnter, onExitBack }: {
  startAt?: number
  onEnter?: () => void
  onExitBack?: () => void
} = {}) {
  // startAt lets the ward hand ← back here on the LAST beat, not the first
  const [i, setI] = useState(startAt)
  const iRef = useRef(startAt)
  useEffect(() => { iRef.current = i }, [i])

  // advancing past the last beat → into the ward (if wired); else hold
  const next = useCallback(() => {
    if (iRef.current === N - 1) { onEnter?.(); return }
    setI((p) => Math.min(p + 1, N - 1))
  }, [onEnter])
  // stepping back off the first beat → out of the section (this is how the
  // deck reclaims ← at the CCU boundary); else hold
  const prev = useCallback(() => {
    if (iRef.current === 0) { onExitBack?.(); return }
    setI((p) => Math.max(p - 1, 0))
  }, [onExitBack])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next() }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prev() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev])

  return (
    <div style={S.root} onClick={next}>
      {/* no key on the child — both phase changes CROSS-FADE in place rather
          than remounting the drawing under themselves */}
      <CriticalCareOverview phase={i} />
    </div>
  )
}

const S: Record<string, CSSProperties> = {
  root: {
    position: 'absolute', inset: 0, background: '#05090d',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', cursor: 'pointer',
  },
}
