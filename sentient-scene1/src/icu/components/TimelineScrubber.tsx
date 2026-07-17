import { AERO, CText, useOntologyStore } from '../ontology'
import { EPISODE, EPISODE_DURATION } from '../episode/scene1'
import { beatAt } from '../episode/EpisodePlayer'

// ---------------------------------------------------------------------------
//  TIMELINE SCRUBBER — dev overlay: play/pause, a scrubbable slider with beat
//  markers, the current beat caption, and restart. Reads the throttled
//  clock.t from the store (the EpisodePlayer owns the precise clock).
// ---------------------------------------------------------------------------

const panel: React.CSSProperties = {
  position: 'absolute',
  bottom: 16,
  left: '50%',
  transform: 'translateX(-50%)',
  width: 'min(780px, 92vw)',
  background: AERO.glass,
  border: `1px solid ${AERO.glassBorder}`,
  borderRadius: 14,
  padding: '12px 16px 14px',
  backdropFilter: 'blur(14px) saturate(1.1)',
  WebkitBackdropFilter: 'blur(14px) saturate(1.1)',
  boxShadow: '0 10px 34px rgba(40,70,110,0.16)',
  color: AERO.ink,
}

const btn: React.CSSProperties = {
  pointerEvents: 'auto',
  cursor: 'pointer',
  font: '700 13px ui-sans-serif, system-ui, sans-serif',
  color: AERO.ink,
  background: AERO.chip,
  border: `1px solid ${AERO.glassBorder}`,
  borderRadius: 9,
  width: 38,
  height: 32,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const uniqueBeats = EPISODE.filter((e, i, a) => a.findIndex((x) => x.beat === e.beat) === i)

export function TimelineScrubber() {
  const clock = useOntologyStore((s) => s.clock)
  const play = useOntologyStore((s) => s.play)
  const pause = useOntologyStore((s) => s.pause)
  const seek = useOntologyStore((s) => s.seek)
  const reset = useOntologyStore((s) => s.reset)

  const cur = beatAt(clock.t)
  const leftPct = (t: number) => `${(t / EPISODE_DURATION) * 100}%`

  return (
    <div style={panel}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button style={btn} onClick={() => (clock.playing ? pause() : play())}>
          {clock.playing ? '❚❚' : '▶'}
        </button>

        <div style={{ flex: 1, position: 'relative', paddingTop: 12 }}>
          {/* beat markers */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 12 }}>
            {uniqueBeats.map((e) => (
              <span
                key={e.beat}
                title={e.title}
                style={{
                  position: 'absolute',
                  left: leftPct(e.t),
                  transform: 'translateX(-50%)',
                  font: '700 9px ui-sans-serif, system-ui, sans-serif',
                  color: cur && cur.beat === e.beat ? CText.teal : AERO.inkDim,
                }}
              >
                {e.beat}
              </span>
            ))}
          </div>
          <input
            type="range"
            min={0}
            max={EPISODE_DURATION}
            step={0.05}
            value={clock.t}
            onChange={(e) => seek(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: CText.teal, pointerEvents: 'auto' }}
          />
        </div>

        <div
          style={{
            fontVariantNumeric: 'tabular-nums',
            fontSize: 12,
            color: AERO.inkDim,
            width: 78,
            textAlign: 'right',
          }}
        >
          {clock.t.toFixed(1)}s / {EPISODE_DURATION}s
        </div>

        <button
          style={btn}
          title="restart"
          onClick={() => {
            reset()
            play()
          }}
        >
          ⟲
        </button>
      </div>

      <div style={{ marginTop: 8, fontSize: 12, minHeight: 16 }}>
        {cur ? (
          <span>
            <b style={{ color: CText.teal }}>{cur.beat}</b>{' '}
            <span style={{ color: AERO.ink }}>· {cur.title}</span>
          </span>
        ) : (
          <span style={{ color: AERO.inkDim }}>pre-episode baseline · press ▶</span>
        )}
      </div>
    </div>
  )
}
