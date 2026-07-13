import { useCallback, useState } from 'react'
import { HeroScene, type Flight } from './HeroScene'
import { RoundERLab } from './scene1/lab/RoundERLab'

// ===========================================================================
//  UNIFIED APP — hospital ⇄ Emergency-Sick-Bay ER, one page, one canvas at a
//  time. Click the emergency drum → camera flies in → white cross-fade → the
//  round ER (scene1). "‹ Back to hospital" fades out and flies the hospital
//  camera back OUT of the drum to the overview.
//
//    view:   which scene is mounted   ('hospital' | 'er')
//    flight: hospital camera leg       ('none' | 'in' | 'out')
//    white:  cross-fade overlay opacity (0..1), transition length = whiteMs
// ===========================================================================

type View = 'hospital' | 'er'

export function App() {
  const [view, setView] = useState<View>('hospital')
  const [flight, setFlight] = useState<Flight>('none')
  const [white, setWhite] = useState(0)
  const [whiteMs, setWhiteMs] = useState(0)

  // drum clicked → begin the fly-in
  const startEnter = useCallback(() => {
    if (view === 'hospital' && flight === 'none') setFlight('in')
  }, [view, flight])

  // per-frame fade tied to the actual camera-leg progress (t = 0..1)
  const onFlyProgress = useCallback(
    (t: number) => {
      setWhiteMs(0)
      if (flight === 'in') setWhite(t < 0.72 ? 0 : Math.min(1, (t - 0.72) / 0.28))
      else if (flight === 'out') setWhite(t < 0.3 ? Math.max(0, 1 - t / 0.3) : 0)
    },
    [flight],
  )

  // fly-in finished under full white → swap to the ER, then fade it in
  const onArrived = useCallback(() => {
    setWhiteMs(0)
    setWhite(1)
    setView('er')
    setFlight('none')
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setWhiteMs(850)
        setWhite(0)
      }),
    )
  }, [])

  // fly-out finished → hospital fully revealed, controls back on
  const onReturned = useCallback(() => {
    setFlight('none')
    setWhiteMs(0)
    setWhite(0)
  }, [])

  // Back button → fade to white, then mount the hospital mid-drum and fly out
  const backToHospital = useCallback(() => {
    setWhiteMs(600)
    setWhite(1)
    window.setTimeout(() => {
      setView('hospital')
      setFlight('out')
    }, 640)
  }, [])

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      {view === 'hospital' ? (
        <HeroScene
          initialMode="studio"
          flight={flight}
          onDrumClick={startEnter}
          onFlyProgress={onFlyProgress}
          onArrived={onArrived}
          onReturned={onReturned}
        />
      ) : (
        <RoundERLab onBack={backToHospital} startStep={1} />
      )}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: '#eaf0f3',
          opacity: white,
          transition: whiteMs ? `opacity ${whiteMs}ms ease` : 'none',
          pointerEvents: 'none',
          zIndex: 60,
        }}
      />
    </div>
  )
}
