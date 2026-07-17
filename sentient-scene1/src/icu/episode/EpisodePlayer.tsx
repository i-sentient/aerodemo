import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useOntologyStore } from '../ontology'
import { EPISODE, EPISODE_DURATION, applyOp } from './scene1'

// ---------------------------------------------------------------------------
//  EPISODE PLAYER — turns the scene clock into ontology mutations.
//  Design for a SCRUBBABLE timeline without per-frame React state:
//   • a precise clock lives in a ref (tRef); events apply against it every frame
//   • forward motion applies pending events; a backward seek rebuilds from the
//     baseline seed and replays up to t (cheap — events are sparse)
//   • the store's clock.t is pushed only ~12Hz (throttled) for the scrubber UI
//   • an external seek (slider) is detected by comparing clock.t to what we last
//     pushed, and adopted into tRef.
//  A live WebSocketPlayer would replace this file and emit the same ops.
// ---------------------------------------------------------------------------
export function EpisodePlayer() {
  const tRef = useRef(0)
  const appliedRef = useRef(0) // index of next unapplied event
  const lastPushed = useRef(0)
  const lastPushTime = useRef(0)

  // configure duration + autoplay once
  useEffect(() => {
    const s = useOntologyStore.getState()
    s.setClock({ duration: EPISODE_DURATION, t: 0 })
    s.play()
  }, [])

  useFrame((state, dt) => {
    const s = useOntologyStore.getState()

    // adopt an external seek (slider moved clock.t away from our last push)
    if (Math.abs(s.clock.t - lastPushed.current) > 1e-4) {
      tRef.current = s.clock.t
    }

    // advance the precise clock
    if (s.clock.playing) {
      tRef.current = Math.min(EPISODE_DURATION, tRef.current + dt * s.clock.rate)
      if (tRef.current >= EPISODE_DURATION) s.pause()
    }
    const t = tRef.current

    // backward seek → rebuild from baseline, then replay
    const lastAppliedT = appliedRef.current > 0 ? EPISODE[appliedRef.current - 1].t : -1
    if (t < lastAppliedT - 1e-6) {
      s.resetOntology()
      appliedRef.current = 0
    }

    // forward apply everything due at t
    while (appliedRef.current < EPISODE.length && EPISODE[appliedRef.current].t <= t) {
      const ev = EPISODE[appliedRef.current]
      const store = useOntologyStore.getState()
      for (const op of ev.ops) applyOp(op, store)
      appliedRef.current++
    }

    // throttled push of t for the scrubber (~12Hz), avoids per-frame setState
    if (state.clock.elapsedTime - lastPushTime.current > 0.08) {
      if (Math.abs(s.clock.t - t) > 1e-4) useOntologyStore.getState().setClock({ t })
      lastPushed.current = t
      lastPushTime.current = state.clock.elapsedTime
    }
  })

  return null
}

/** The current beat/title for a given scene time (for the scrubber caption). */
export function beatAt(t: number): { beat: string; title: string } | null {
  let cur: (typeof EPISODE)[number] | null = null
  for (const ev of EPISODE) {
    if (ev.t <= t) cur = ev
    else break
  }
  return cur ? { beat: cur.beat, title: cur.title } : null
}
