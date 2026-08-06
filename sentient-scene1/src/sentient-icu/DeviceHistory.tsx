import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
// bundled assets — imported so they travel INSIDE this folder (Vite hashes +
// serves them); no dependency on /public. The folder is self-contained.
import imgOverview from './assets/devices/critical-care-overview.png'
import imgVent from './assets/devices/philips-v200-ventilator.jpg'
import imgMonitor from './assets/devices/ge-patient-monitor.jpg'
import imgDefib from './assets/devices/defibrillator.jpg'
import imgSyringe from './assets/devices/mdk-ms51-syringe-pump.webp'
import imgNipro from './assets/devices/nipro-surdial-55plus.png'
import imgAdvin from './assets/devices/advin-dialysis-machine.jpg'

// ---------------------------------------------------------------------------
//  DEVICE HISTORY — a full-screen, pure-black showcase of the ICU hardware.
//  One device at a time: the product shot sits centered with its name +
//  category beneath it. Navigation is two souls-like chevron arrows at the
//  screen edges (← / → / Space also work). The Critical Care overview is
//  featured near-full-screen; every other device is large but contained.
//  Images are bundled from ./assets/devices. Standalone at ?view=devices; also
//  plays as the opening act of ?view=icu — pass onEnter to advance past the
//  last device INTO the ward (instead of wrapping around).
// ---------------------------------------------------------------------------

type Device = { src: string; name: string; category: string; feature?: boolean }

const DEVICES: Device[] = [
  { src: imgOverview, name: 'Critical Care Unit', category: 'Bedside equipment · overview', feature: true },
  { src: imgVent, name: 'Philips V200', category: 'ICU ventilator' },
  { src: imgMonitor, name: 'GE Patient Monitor', category: 'Multi-parameter monitor' },
  { src: imgDefib, name: 'Defibrillator', category: 'Cardiac resuscitation' },
  { src: imgSyringe, name: 'MDK-MED MS-51', category: 'Syringe pump' },
  { src: imgNipro, name: 'NIPRO SurDial 55Plus', category: 'Hemodialysis machine' },
  { src: imgAdvin, name: 'Advin Dialysis Machine', category: 'Hemodialysis machine' },
]

const ACCENT = '#2fd4ff'

function Arrow({ dir, onClick }: { dir: 'left' | 'right'; onClick: () => void }) {
  const left = dir === 'left'
  return (
    <button
      aria-label={left ? 'Previous device' : 'Next device'}
      onClick={onClick}
      className={`dh-arrow ${left ? 'dh-arrow-l' : 'dh-arrow-r'}`}
      style={{ ...S.arrow, [left ? 'left' : 'right']: 'clamp(8px, 2.2vw, 40px)' }}
    >
      <svg width="38" height="66" viewBox="0 0 38 66" fill="none" aria-hidden>
        <path
          d={left ? 'M25 9 L12 33 L25 57' : 'M13 9 L26 33 L13 57'}
          stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}

export function DeviceHistory({ onEnter }: { onEnter?: () => void } = {}) {
  const [i, setI] = useState(0)
  const n = DEVICES.length
  const iRef = useRef(0)
  useEffect(() => { iRef.current = i }, [i])

  // advancing past the last device → into the ward (if wired); else wrap
  const next = useCallback(() => {
    if (onEnter && iRef.current === n - 1) { onEnter(); return }
    setI((p) => (p + 1) % n)
  }, [n, onEnter])
  const prev = useCallback(() => setI((p) => (p - 1 + n) % n), [n])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next() }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prev() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev])

  const d = DEVICES[i]
  const last = i === n - 1

  return (
    <div style={S.root}>
      <style>{CSS}</style>

      {/* stage */}
      <div style={S.stage}>
        <img
          key={d.src}
          src={d.src}
          alt={d.name}
          className="dh-img"
          draggable={false}
          style={{
            ...S.img,
            width: d.feature ? '94vw' : '58vw',
            height: d.feature ? '82vh' : '66vh',
          }}
        />
      </div>

      {/* readability scrims (over the image top/bottom edges) */}
      <div style={S.scrimTop} />
      <div style={S.scrimBottom} />

      {/* header */}
      <div style={S.header}>
        <span style={S.dot} />
        <span style={S.brand}>DEVICE HISTORY</span>
        <span style={S.count}>{String(i + 1).padStart(2, '0')} <span style={S.countTot}>/ {String(n).padStart(2, '0')}</span></span>
      </div>

      {/* souls-like navigation arrows */}
      <Arrow dir="left" onClick={prev} />
      <Arrow dir="right" onClick={next} />

      {/* caption */}
      <div key={i} style={S.caption} className="dh-caption">
        <div style={S.name}>{d.name}</div>
        <div style={S.category}>{d.category}</div>
        {onEnter && (
          <button
            onClick={onEnter}
            className="dh-enter"
            style={{ ...S.enter, opacity: last ? 1 : 0.5 }}
          >
            {last ? 'Enter the ward' : 'Skip intro'} →
          </button>
        )}
      </div>
    </div>
  )
}

const CSS = `
  @keyframes dhImgIn { from { opacity: 0; transform: scale(0.985) translateY(6px); } to { opacity: 1; transform: none; } }
  @keyframes dhCapIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  @keyframes dhNudgeL { 0%, 100% { transform: translateY(-50%) translateX(0); } 50% { transform: translateY(-50%) translateX(-6px); } }
  @keyframes dhNudgeR { 0%, 100% { transform: translateY(-50%) translateX(0); } 50% { transform: translateY(-50%) translateX(6px); } }
  .dh-img { animation: dhImgIn 440ms cubic-bezier(0.22, 1, 0.36, 1); }
  .dh-caption { animation: dhCapIn 440ms cubic-bezier(0.22, 1, 0.36, 1) both; }
  .dh-arrow {
    position: absolute; top: 50%; z-index: 5; padding: 16px;
    background: none; border: none; cursor: pointer; color: rgba(233, 242, 247, 0.6);
  }
  .dh-arrow svg { display: block; filter: drop-shadow(0 2px 9px rgba(0, 0, 0, 0.9)); transition: filter 180ms ease; }
  .dh-arrow:hover { color: #ffffff; }
  .dh-arrow:hover svg { filter: drop-shadow(0 0 13px rgba(47, 212, 255, 0.85)); }
  .dh-arrow-l { animation: dhNudgeL 2.4s ease-in-out infinite; }
  .dh-arrow-r { animation: dhNudgeR 2.4s ease-in-out infinite; }
  .dh-arrow:hover { animation-play-state: paused; }
  .dh-enter {
    margin-top: 18px; pointer-events: auto; cursor: pointer;
    font: 700 12px ui-sans-serif, system-ui, sans-serif; letter-spacing: 0.16em; text-transform: uppercase;
    color: #05161d; background: #2fd4ff; border: none; border-radius: 999px; padding: 10px 22px;
    box-shadow: 0 0 22px rgba(47,212,255,0.5); transition: transform 160ms ease, box-shadow 160ms ease, opacity 300ms ease;
  }
  .dh-enter:hover { transform: translateY(-1px); box-shadow: 0 0 30px rgba(47,212,255,0.8); }
`

const S: Record<string, CSSProperties> = {
  root: {
    position: 'fixed', inset: 0, background: '#000',
    color: '#eaf2f7', fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    overflow: 'hidden', userSelect: 'none',
  },

  stage: {
    position: 'absolute', top: 48, bottom: 96, left: 0, right: 0, zIndex: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  img: {
    objectFit: 'contain', filter: 'drop-shadow(0 26px 55px rgba(0, 0, 0, 0.7))',
  },

  scrimTop: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 84, zIndex: 2, pointerEvents: 'none',
    background: 'linear-gradient(to bottom, rgba(0,0,0,0.72), transparent)',
  },
  scrimBottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 170, zIndex: 2, pointerEvents: 'none',
    background: 'linear-gradient(to top, rgba(0,0,0,0.9), rgba(0,0,0,0.5) 45%, transparent)',
  },

  header: {
    position: 'absolute', top: 22, left: 26, right: 26, zIndex: 4,
    display: 'flex', alignItems: 'center', gap: 10, pointerEvents: 'none',
  },
  dot: { width: 8, height: 8, borderRadius: '50%', background: ACCENT, boxShadow: `0 0 12px ${ACCENT}` },
  brand: { fontSize: 13, fontWeight: 700, letterSpacing: '0.22em', color: '#cfe0ea' },
  count: { marginLeft: 'auto', fontFamily: 'ui-monospace, monospace', fontSize: 14, fontWeight: 700, color: '#eaf2f7' },
  countTot: { color: '#5f7789', fontWeight: 500 },

  arrow: {}, // positioning handled in Arrow + .dh-arrow

  caption: {
    position: 'absolute', left: 0, right: 0, bottom: 30, zIndex: 4, textAlign: 'center', pointerEvents: 'none',
  },
  name: { fontSize: 30, fontWeight: 700, letterSpacing: '-0.01em', color: '#f4f9fc' },
  category: { marginTop: 7, fontSize: 12.5, fontWeight: 600, letterSpacing: '0.24em', textTransform: 'uppercase', color: ACCENT },
  enter: {}, // styled via .dh-enter
}
