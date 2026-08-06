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

type Phase = 'devices' | 'toBlack' | 'scene'

export function SentientICU() {
  const deepLink = new URLSearchParams(window.location.search).has('shot')
  const [phase, setPhase] = useState<Phase>(deepLink ? 'scene' : 'devices')
  const timers = useRef<number[]>([])

  useEffect(() => () => { timers.current.forEach(clearTimeout) }, [])

  const enter = () => {
    if (phase !== 'devices') return
    setPhase('toBlack') // overlay fades to opaque over the still-black showcase
    timers.current.push(window.setTimeout(() => setPhase('scene'), 480))
  }

  // black curtain: transparent in the ward, opaque during the handoff. It
  // covers the DeviceHistory→ICUScene swap so the WebGL boot never flashes.
  const covered = phase === 'toBlack'
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000' }}>
      {phase === 'scene' ? <ICUScene /> : <DeviceHistory onEnter={enter} />}
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
