import { useEffect, useRef, useState } from 'react'
import { DeviceHistory } from './DeviceHistory'
import { ICUScene } from './ICUScene'

// ---------------------------------------------------------------------------
//  SENTIENT ICU — the whole ?view=icu experience in one route:
//    ① DEVICE HISTORY showcase (the hardware, one product shot at a time)
//    → advance past the last device (or "Enter the ward") crossfades through
//      black into ② the 3D ICU BAY guided tour (ICUScene).
//  A deep-link that names a scene beat (?shot=N) skips the intro and lands
//  straight in the ward, so screenshots / presentation links stay stable.
// ---------------------------------------------------------------------------

// The DEVICE HISTORY graphic (CRITICAL CARE UNIT · equipment at the bedside) is
// parked. Act 2 now opens on the platform slide, and the equipment material
// belongs beside LSAM's introduction rather than ahead of it. Flip to true to
// restore the two-phase flow exactly as it was — nothing else has to change.
const SHOW_DEVICE_HISTORY = false

type Phase = 'devices' | 'toBlack' | 'scene'

export function SentientICU({ onComplete, onPrevious, startAt, onBeat }: {
  onComplete?: () => void
  onPrevious?: () => void
  startAt?: number
  onBeat?: (n: number) => void
} = {}) {
  const deepLink = new URLSearchParams(window.location.search).has('shot')
  const [phase, setPhase] = useState<Phase>(
    !SHOW_DEVICE_HISTORY || deepLink || startAt != null ? 'scene' : 'devices',
  )
  const timers = useRef<number[]>([])

  useEffect(() => () => { timers.current.forEach(clearTimeout) }, [])

  const [dhStart, setDhStart] = useState(0)
  const cross = (to: Phase) => {
    setPhase('toBlack') // overlay fades to opaque, then we swap underneath it
    timers.current.push(window.setTimeout(() => setPhase(to), 480))
  }
  const enter = () => { if (phase === 'devices') cross('scene') }
  // ← off the ward's first beat comes back through the same curtain, landing
  // on the graphic's LAST beat (the six machines) rather than its first —
  // you're re-entering where you left, not restarting the section
  // with the graphic parked there is nothing behind the ward, so ← off its
  // first beat hands straight back to the previous slide
  const back = () => {
    if (phase !== 'scene') return
    if (!SHOW_DEVICE_HISTORY) { onPrevious?.(); return }
    setDhStart(2)
    cross('devices')
  }

  // black curtain: transparent in the ward, opaque during the handoff. It
  // covers the DeviceHistory→ICUScene swap so the WebGL boot never flashes.
  const covered = phase === 'toBlack'
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000' }}>
      {phase === 'scene'
        ? <ICUScene onExitForward={onComplete} onExitBack={back} startAt={startAt} onBeat={onBeat} />
        : <DeviceHistory startAt={dhStart} onEnter={enter} onExitBack={onPrevious} />}
      <div
        style={{
          position: 'fixed', inset: 0, background: '#000', zIndex: 50,
          pointerEvents: 'none',
          opacity: covered ? 1 : 0,
          transition: `opacity ${covered ? 460 : 640}ms ease`,
        }}
      />
    </div>
  )
}
