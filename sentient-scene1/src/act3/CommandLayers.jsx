import { motion, AnimatePresence } from 'framer-motion';
import { useSlideNavigation, theme } from '../presentationTheme';

// ---------------------------------------------------------------------------
//  ACT 3 — THE COMMAND. The architecture slide that sits between the CCU
//  hardware tour and the live system: what is actually reading the room.
//
//  Styled to carry straight on from the CCU bedside-equipment graphic — same
//  #05090d ground, same 40/200px blue grid under a radial fade, same hairline
//  rules and mono caps.
//
//  The three layers carry their own colours rather than the ward's: iSAM green,
//  TARS coffee, LSAM blue. Cyan stays reserved for the slide's own furniture
//  (the feedback loop and the CAL ladder) so the system reads as one thing the
//  three layers sit inside.
//
//  SAM = Sentient Agent for Medicine. It is an acronym, so it stays all-caps
//  in every derived name (iSAM, LSAM) — never iSam / LSam.
//
//  Three beats:
//    0 · the stack        — L1 LSAM / L2 TARS / L3 iSAM
//    1 · the closed loop  — inference writes back down into perception
//    2 · the CAL ladder   — Care Autonomy Levels 0-5, and where this sits
// ---------------------------------------------------------------------------

const ACCENT = '#2fd4ff';        // matches the ward's edge-node cyan
const INK = '#eef4f8';
const MUTED = '#8ea3b2';
const DIM = '#5b6b78';
const HAIR = '#1b2833';

const LAYERS = [
  {
    id: 'L3',
    engine: 'iSAM',
    name: 'Inference',
    blurb: 'Reasoning, forecasting, orchestration — what should happen next.',
    color: '#4fe08a',
  },
  {
    id: 'L2',
    engine: 'TARS',
    name: 'Ontology State',
    blurb: 'Patient and hospital operations, assembled into one live truth.',
    color: '#c69a6d',
  },
  {
    id: 'L1',
    engine: 'LSAM',
    name: 'Sensory / Perception',
    blurb: 'Lossless physiological capture. Nothing is thrown away.',
    color: '#4d9dff',
  },
];

// The autonomy ladder, bottom rung first — the product climbs it.
const CAL = [
  { n: 0, label: 'No Perception' },
  { n: 1, label: 'Perception' },
  { n: 2, label: 'Interpretation' },
  { n: 3, label: 'Gated Action' },
  { n: 4, label: 'Bounded Autonomy' },
  { n: 5, label: 'Closed-loop Autonomy' },
];

// How far the system reaches today. Rungs above this render as horizon, not
// as claim — an investor room reads an unqualified CAL5 as vapour.
const REACHED = 3;

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
// one column width for heading, stack and ladder so all three edges align
const WIDTH = 'min(1520px, 92vw)';

// The grid field. Ids are cl-* so they can't collide with the CCU graphic's
// cco-* defs if both ever mount at once.
function GridField() {
  return (
    <svg aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
      <defs>
        <pattern id="cl-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40,0 H0 V40" fill="none" stroke="#16303f" strokeWidth="1" />
        </pattern>
        <pattern id="cl-grid-lg" width="200" height="200" patternUnits="userSpaceOnUse">
          <path d="M200,0 H0 V200" fill="none" stroke="#28576f" strokeWidth="1.2" />
        </pattern>
        {/* strongest behind the stack, gone at the edges — the grid should sit
            under the type, never compete with it */}
        <radialGradient id="cl-fade" cx="50%" cy="48%" r="58%">
          <stop offset="0%" stopColor="#fff" stopOpacity="1" />
          <stop offset="58%" stopColor="#fff" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0.03" />
        </radialGradient>
        <mask id="cl-mask"><rect width="100%" height="100%" fill="url(#cl-fade)" /></mask>
        <radialGradient id="cl-halo" cx="50%" cy="46%" r="46%">
          <stop offset="0%" stopColor="#0d3a4d" stopOpacity="0.62" />
          <stop offset="100%" stopColor="#0d3a4d" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="#05090d" />
      <rect width="100%" height="100%" fill="url(#cl-halo)" />
      <g mask="url(#cl-mask)">
        <rect width="100%" height="100%" fill="url(#cl-grid)" />
        <rect width="100%" height="100%" fill="url(#cl-grid-lg)" />
      </g>
    </svg>
  );
}

export default function CommandLayers({ onComplete, onPrevious }) {
  const { currentSlide } = useSlideNavigation({ totalSlides: 3, onComplete, onPrevious });

  const showLoop = currentSlide >= 1;
  const showCal = currentSlide >= 2;

  return (
    <div
      style={{
        position: 'relative', width: '100%', height: '100%', overflow: 'hidden',
        background: '#05090d', fontFamily: theme.fonts.body, color: INK,
      }}
    >
      <GridField />

      <div style={{
        position: 'relative', width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 38,
        padding: '48px 4vw 72px',
      }}>
        {/* ── heading, on a hairline rule like the CCU graphic ─────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          style={{ width: WIDTH }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 34 }}>
            <div>
              <h2 style={{
                fontFamily: theme.fonts.heading, fontWeight: 800, margin: 0,
                fontSize: 'clamp(2.1rem, 4vw, 3.3rem)', letterSpacing: '-0.01em', color: INK,
              }}>
                One System, Three Layers
              </h2>
              <div style={{
                fontFamily: MONO, fontSize: 15, letterSpacing: '0.24em',
                textTransform: 'uppercase', color: ACCENT, marginTop: 11,
              }}>
                The Command
              </div>
            </div>
            {/* Expanding both acronyms once makes iSAM/LSAM read as a family
                and stops TARS looking like a borrowed codename. */}
            <div style={{ fontFamily: MONO, fontSize: 14, letterSpacing: '0.12em', color: DIM, textAlign: 'right', lineHeight: 1.9 }}>
              <div><span style={{ color: ACCENT }}>SAM</span> · SENTIENT AGENT FOR MEDICINE</div>
              <div><span style={{ color: '#c69a6d' }}>TARS</span> · TASK AUTOMATION RECONCILIATION SYSTEM</div>
            </div>
          </div>
          <div style={{ height: 1, background: HAIR, marginTop: 22 }} />
        </motion.div>

        {/* ── the stack ─────────────────────────────────────────────── */}
        {/* The loop gutter is reserved on every step, not just when the loop is
            visible — otherwise the cards resize under the audience mid-slide. */}
        <div style={{ position: 'relative', width: WIDTH, paddingRight: 224 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {LAYERS.map((l, i) => (
              <motion.div
                key={l.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                // Build the stack from the ground up — perception first,
                // inference last — even though L3 is drawn on top. Sensing
                // genuinely happens first, and a stack that assembles downward
                // reads backwards.
                transition={{
                  delay: 0.25 + (LAYERS.length - 1 - i) * 0.16,
                  duration: 0.55,
                  ease: 'easeOut',
                }}
                style={{
                  display: 'grid', gridTemplateColumns: '26px 64px 158px 1fr',
                  alignItems: 'center', gap: 22,
                  borderTop: `1px solid ${HAIR}`,
                  borderLeft: `3px solid ${l.color}`,
                  background: 'rgba(20,42,56,0.28)',
                  padding: '24px 30px',
                }}
              >
                <span style={{
                  width: 13, height: 13, borderRadius: '50%', background: l.color,
                  boxShadow: `0 0 14px ${l.color}`,
                }} />
                <span style={{ fontFamily: MONO, fontSize: 17, color: DIM, letterSpacing: '0.1em' }}>
                  {l.id}
                </span>
                <span style={{
                  fontFamily: MONO, fontSize: 25, color: l.color,
                  letterSpacing: '0.04em', fontWeight: 700,
                }}>
                  {l.engine}
                </span>
                <span>
                  <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.01em', color: INK }}>
                    {l.name}
                  </span>
                  <span style={{ display: 'block', fontSize: 18, color: MUTED, marginTop: 6 }}>
                    {l.blurb}
                  </span>
                </span>
              </motion.div>
            ))}
          </div>

          {/* closed feedback loop — drawn outside the stack on the right */}
          <AnimatePresence>
            {showLoop && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
                style={{
                  position: 'absolute', top: 0, bottom: 0, right: 0,
                  width: 214, display: 'flex', alignItems: 'center',
                }}
                aria-hidden="true"
              >
                <svg width="74" height="100%" viewBox="0 0 62 220" preserveAspectRatio="none"
                     style={{ overflow: 'visible', flexShrink: 0 }}>
                  <motion.path
                    d="M2 18 H40 Q58 18 58 60 V160 Q58 202 40 202 H2"
                    fill="none" stroke={ACCENT} strokeWidth="1.4" strokeDasharray="4 4"
                    initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                    transition={{ duration: 0.9, ease: 'easeInOut' }}
                  />
                  <motion.path
                    d="M2 202 l9 -5 M2 202 l9 5"
                    fill="none" stroke={ACCENT} strokeWidth="1.4"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    transition={{ delay: 0.85, duration: 0.3 }}
                  />
                </svg>
                <span style={{
                  marginLeft: 16, lineHeight: 1.5, fontFamily: MONO,
                  fontSize: 14, letterSpacing: '0.18em', textTransform: 'uppercase',
                  color: ACCENT,
                }}>
                  closed<br />feedback<br />loop
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── CAL ladder ──────────────────────────────────────────────
            ALWAYS mounted, so it reserves its space from beat 0. Rendering it
            conditionally meant the flex column's content height changed when it
            arrived, and centring pushed the heading and the stack upward — the
            jump you saw. Now only opacity changes; nothing moves. */}
        <div>
            <div
              style={{
                width: WIDTH,
                opacity: showCal ? 1 : 0,
                pointerEvents: showCal ? 'auto' : 'none',
                transition: 'opacity 700ms ease',
              }}
              aria-hidden={!showCal}
            >
              <div style={{ height: 1, background: HAIR, marginBottom: 26 }} />
              <div style={{
                fontFamily: MONO, fontSize: 15, letterSpacing: '0.22em',
                textTransform: 'uppercase', color: DIM, marginBottom: 22, textAlign: 'center',
              }}>
                Care Autonomy Levels
              </div>

              <div style={{
                display: 'grid', gridTemplateColumns: `repeat(${CAL.length}, 1fr)`,
                gap: 12, alignItems: 'end',
              }}>
                {CAL.map((c, i) => {
                  const on = c.n <= REACHED;
                  const here = c.n === REACHED;
                  return (
                    <motion.div
                      key={c.n}
                      // driven off showCal, not mount — the block is mounted from
                      // beat 0, so keying the stagger to mount would have spent it
                      // while the ladder was still invisible
                      initial={{ opacity: 0, y: 10 }}
                      animate={showCal ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
                      transition={{ delay: showCal ? 0.15 + i * 0.07 : 0, duration: 0.4 }}
                      style={{ textAlign: 'center' }}
                    >
                      <div style={{
                        fontFamily: MONO, fontSize: 17, letterSpacing: '0.06em',
                        color: on ? ACCENT : DIM, marginBottom: 12, fontWeight: on ? 700 : 400,
                      }}>
                        CAL{c.n}
                      </div>
                      <div style={{
                        height: here ? 6 : 4,
                        background: on ? ACCENT : HAIR,
                        boxShadow: here ? `0 0 18px ${ACCENT}` : 'none',
                      }} />
                      <div style={{
                        fontSize: 16, lineHeight: 1.35, marginTop: 14,
                        color: on ? INK : DIM,
                      }}>
                        {c.label}
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              <div style={{ textAlign: 'center', marginTop: 32, fontSize: 18, color: MUTED }}>
                Everything after this slide runs at{' '}
                <span style={{ color: ACCENT, fontWeight: 700 }}>CAL{REACHED} — gated action</span>.
                The clinician still signs.
              </div>
            </div>
        </div>
      </div>
    </div>
  );
}
