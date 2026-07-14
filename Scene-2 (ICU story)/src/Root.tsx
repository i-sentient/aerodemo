import { useCallback, useState } from 'react'
import { WardApp } from './App'
import { TarsMount } from './TarsMount'
import { IntroVideo } from './IntroVideo'
import { RoundERLab } from './scene1/lab/RoundERLab'

// ---------------------------------------------------------------------------
//  SCENE 2 · "ICU story" — finished pieces spliced end to end.
//   Intro:   a hospital film zooms into the emergency sick bay.
//   Scene 1: a cinematic fly-in to the round ER (8 beats, ending on TARS→ICU).
//   Phase 1: the Sentient Ward tour (free orbit + Space/→/← through its shots).
//   Phase 2: the TARS ICU app runs with ALL of ITS own controls intact.
//
//  The seam between pieces is a single black overlay: the current piece fades
//  to black, the next piece is mounted UNDER the black, then the black fades
//  off to reveal it. #06080c is the ward's own background, so every reveal
//  lands on an identical colour — a true seam, not a visible cut.
//
//  Presenter flow, one key throughout:
//   film auto-fades at FADE_AT → Space/→ steps Scene 1's beats → one more →
//   at its last beat hands to the ward → Space/→ steps the ward → click a
//   patient → the TARS ICU app.
// ---------------------------------------------------------------------------

// The film's zoom lands here (seconds); from this instant we fade to black.
const FADE_AT = 5.51
// Fade duration, used for every piece→black and black→piece so easing matches.
const BLACKOUT_MS = 1200
// Hold on black after a swap so the next piece can paint a frame before reveal.
const REVEAL_DELAY = 700
// The ER→ICU transition film (~10s) fades to black as it lands zoomed into the
// ICU, then hands to the ward through the same black bridge as every other seam.
const TRANSITION_FADE_AT = 9.5

type Phase = 'intro' | 'scene1' | 'transition' | 'ward' | 'tars'

export function Root() {
  const [phase, setPhase] = useState<Phase>('intro')
  const [blackout, setBlackout] = useState(false)

  // fade the whole screen to black, mount `next` under it, then fade back off.
  const bridgeTo = useCallback((next: Phase) => {
    setBlackout(true)
    window.setTimeout(() => {
      setPhase(next)
      window.setTimeout(() => setBlackout(false), REVEAL_DELAY)
    }, BLACKOUT_MS)
  }, [])

  // the ward runs its own fade-to-dark on handoff, so tars needs no bridge here.
  const enterICU = useCallback(() => setPhase('tars'), [])

  return (
    <>
      {phase === 'intro' && (
        <IntroVideo fadeAt={FADE_AT} onFadeStart={() => bridgeTo('scene1')} />
      )}
      {phase === 'scene1' && <RoundERLab onExit={() => bridgeTo('transition')} />}
      {phase === 'transition' && (
        <IntroVideo src="/transition.mp4" fadeAt={TRANSITION_FADE_AT} onFadeStart={() => bridgeTo('ward')} />
      )}
      {phase === 'ward' && <WardApp onEnterICU={enterICU} />}
      {phase === 'tars' && <TarsMount />}

      {/* the black bridge that carries every seam: film → ER → ward. */}
      <div
        style={{
          position: 'fixed', inset: 0, background: '#06080c',
          opacity: blackout ? 1 : 0, pointerEvents: 'none',
          transition: `opacity ${BLACKOUT_MS}ms ease`, zIndex: 100,
        }}
      />
    </>
  )
}
