// ===========================================================================
//  iSAM — the reasoning agent's title card, standing at the ER's hinge: the
//  beat where "who is this" has just been answered and "what is wrong with him"
//  is about to begin.
//
//  A direct sibling of TarsTitle by construction — same grid field, same halo,
//  same stroke-only sigil drawing itself with a dash offset, same two beats,
//  same heading face. Green instead of amber. The layout says "this is the same
//  system"; the colour says "this is a different part of it".
//
//  Colour, mark and expansion all come from the MAAYA platform slide in the
//  deck (presentationAlpha/src/act3/SentientPlatform.jsx) so the two never
//  diverge. The card is not introducing a stranger — it is naming something the
//  room has already watched work on the ER's CV box.
//
//  Two beats, as on the sibling cards:
//    0 · the sigil draws, the name lands
//    1 · what it does, then what its letters stand for
// ===========================================================================
// the locked-set green from the MAAYA platform slide (act3/SentientPlatform.jsx),
// not the ICU AGENTS table's darker #2FA96E — the deck's set is the identity.
const GREEN = '#4fe08a'
const INK = '#eef4f8'
const MUTED = '#8ea3b2'

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'
// the deck's theme.fonts.heading, verbatim — these cards are siblings and the
// name has to be set in the same face as PLEXUS, ATLAS and TARS
const HEADING = "'Copperplate Gothic Light', 'Copperplate Light', serif"

// verbatim from the MAAYA cube. SAM = Sentient Agent for Medicine, which is why
// it stays all-caps in every derived name.
const EXPANSION = 'intellectual · Sentient Agent for Medicine'

/** ids are is-* so they cannot collide with TarsTitle's defs in the document */
function GridField() {
  return (
    <svg aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
      <defs>
        <pattern id="is-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40,0 H0 V40" fill="none" stroke="#0d2b1c" strokeWidth="1" />
        </pattern>
        <pattern id="is-grid-lg" width="200" height="200" patternUnits="userSpaceOnUse">
          <path d="M200,0 H0 V200" fill="none" stroke="#1d5738" strokeWidth="1.2" />
        </pattern>
        <radialGradient id="is-fade" cx="50%" cy="50%" r="58%">
          <stop offset="0%" stopColor="#fff" stopOpacity="1" />
          <stop offset="58%" stopColor="#fff" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0.03" />
        </radialGradient>
        {/* userSpaceOnUse — the objectBoundingBox default resolves the gradient
            against the rect's own box and flattens it into graph paper */}
        <mask id="is-mask" maskUnits="userSpaceOnUse">
          <rect width="100%" height="100%" fill="url(#is-fade)" />
        </mask>
        <radialGradient id="is-halo" cx="50%" cy="50%" r="46%">
          <stop offset="0%" stopColor="#11663f" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#11663f" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* a green-shifted near-black, not the platform's blue-black */}
      <rect width="100%" height="100%" fill="#050a07" />
      <rect width="100%" height="100%" fill="url(#is-halo)" />
      <g mask="url(#is-mask)">
        <rect width="100%" height="100%" fill="url(#is-grid)" />
        <rect width="100%" height="100%" fill="url(#is-grid-lg)" />
      </g>
    </svg>
  )
}

/** The mark from the MAAYA cube, at title scale, drawing itself.
 *
 *  Its whole meaning is the contrast with TARS: TARS is a SQUARE spiral whose
 *  outermost turn closes into a box — a task loop that shuts. iSAM is a ROUND
 *  spiral wound far enough that its last coil reads as a closed circle — a line
 *  of reasoning opening outward and arriving somewhere. Same gesture, opposite
 *  geometry, which is the difference between the two agents in one glance.
 *
 *  Point-sampled from the whiteboard original, so it is copied rather than
 *  redrawn — the deck and this card must never diverge.
 *
 *  Stroke is lighter than TarsTitle's 1.5: the round spiral's coils sit ~2
 *  units apart against the square one's ~2.83, and at 128 px a 1.5 stroke
 *  closes those gaps into a solid disc.
 */
function ISamMark({ size = 128, run }: { size?: number; run: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ display: 'block', overflow: 'visible' }}>
      <path
        d="M12.00 12.00L12.00 11.96L12.01 11.93L12.03 11.89L12.05 11.86L12.08 11.83L12.11 11.81L12.15 11.79L12.20 11.77L12.24 11.77L12.29 11.76L12.34 11.77L12.39 11.78L12.45 11.80L12.50 11.83L12.55 11.87L12.59 11.91L12.64 11.96L12.67 12.02L12.71 12.09L12.73 12.16L12.75 12.23L12.76 12.31L12.77 12.40L12.76 12.48L12.74 12.57L12.72 12.66L12.68 12.75L12.63 12.84L12.58 12.92L12.51 13.00L12.43 13.08L12.35 13.15L12.25 13.21L12.15 13.27L12.03 13.31L11.92 13.35L11.79 13.37L11.66 13.38L11.53 13.38L11.39 13.37L11.25 13.34L11.11 13.30L10.98 13.25L10.85 13.18L10.72 13.10L10.59 13.00L10.48 12.89L10.37 12.77L10.27 12.63L10.19 12.49L10.12 12.33L10.06 12.16L10.01 11.99L9.98 11.81L9.97 11.62L9.98 11.44L10.00 11.24L10.04 11.05L10.10 10.86L10.18 10.68L10.28 10.50L10.39 10.32L10.52 10.16L10.67 10.00L10.84 9.86L11.02 9.73L11.21 9.61L11.42 9.52L11.64 9.44L11.86 9.38L12.10 9.34L12.34 9.32L12.58 9.33L12.83 9.35L13.08 9.40L13.32 9.47L13.56 9.57L13.79 9.69L14.02 9.83L14.23 9.99L14.43 10.18L14.61 10.38L14.78 10.60L14.93 10.84L15.06 11.09L15.16 11.36L15.24 11.64L15.30 11.93L15.33 12.23L15.33 12.53L15.31 12.83L15.26 13.13L15.18 13.44L15.07 13.73L14.94 14.02L14.77 14.29L14.59 14.56L14.37 14.81L14.13 15.04L13.87 15.25L13.59 15.44L13.30 15.60L12.98 15.74L12.65 15.85L12.31 15.93L11.96 15.97L11.60 15.99L11.24 15.98L10.88 15.93L10.52 15.85L10.17 15.74L9.82 15.59L9.49 15.42L9.17 15.21L8.87 14.97L8.59 14.70L8.33 14.41L8.10 14.09L7.90 13.75L7.72 13.39L7.58 13.01L7.47 12.62L7.39 12.22L7.35 11.81L7.35 11.39L7.39 10.97L7.46 10.55L7.58 10.14L7.72 9.74L7.91 9.34L8.13 8.97L8.39 8.61L8.68 8.28L9.00 7.97L9.35 7.68L9.73 7.43L10.13 7.21L10.56 7.03L11.00 6.89L11.45 6.78L11.92 6.71L12.39 6.69L12.87 6.71L13.34 6.77L13.82 6.87L14.28 7.02L14.73 7.21L15.17 7.44L15.58 7.71L15.98 8.02L16.34 8.37L16.68 8.75L16.98 9.16L17.25 9.60L17.48 10.06L17.67 10.55L17.81 11.05L17.91 11.57L17.96 12.09L17.97 12.63L17.92 13.16L17.83 13.69L17.69 14.22L17.51 14.73L17.28 15.23L17.00 15.71L16.68 16.17L16.31 16.59L15.91 16.99L15.47 17.35L15.00 17.67L14.50 17.95L13.97 18.18L13.42 18.37L12.86 18.51L12.28 18.59L11.69 18.63L11.09 18.61L10.50 18.54L9.91 18.42L9.34 18.24L8.77 18.01L8.23 17.74L7.71 17.41L7.22 17.03L6.77 16.61L6.35 16.15L5.97 15.65L5.64 15.12L5.35 14.55L5.11 13.96L4.93 13.35L4.80 12.72L4.73 12.08L4.71 11.43L4.75 10.77L4.85 10.13L5.01 9.48L5.23 8.86L5.50 8.25L5.83 7.67L6.21 7.11L6.65 6.59L7.12 6.11L7.65 5.66L8.21 5.27L8.81 4.93L9.43 4.63L10.09 4.40L10.77 4.22L11.46 4.11L12.17 4.05L12.88 4.06L13.59 4.13L14.29 4.27L14.98 4.47L15.66 4.73L16.31 5.05L16.93 5.43L17.52 5.87L18.07 6.36L18.58 6.90L19.04 7.48L19.44 8.11L19.80 8.77L20.09 9.47L20.32 10.19L20.48 10.93L20.58 11.69L20.61 12.45L20.58 13.22L20.47 13.99L20.30 14.74L20.05 15.48L19.74 16.20L19.37 16.90L18.94 17.56L18.44 18.18L17.89 18.75L17.29 19.28"
        fill="none" stroke={GREEN} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"
        pathLength={1}
        style={{
          strokeDasharray: 1,
          strokeDashoffset: run ? 0 : 1,
          transition: 'stroke-dashoffset 1.5s cubic-bezier(.4,0,.2,1) .15s',
        }}
      />
    </svg>
  )
}

export function ISamTitle({ show, expanded }: { show: boolean; expanded: boolean }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: '#050a07',
        opacity: show ? 1 : 0,
        pointerEvents: 'none',
        // visibility is discrete and is NOT interpolated, so listing only
        // opacity means `hidden` snaps on the same frame the beat changes and
        // the fade never plays. Hold it until the fade has actually finished.
        transition: show
          ? 'opacity .55s ease, visibility 0s linear 0s'
          : 'opacity .55s ease, visibility 0s linear .55s',
        visibility: show ? 'visible' : 'hidden',
      }}
    >
      <GridField />
      <div
        style={{
          position: 'relative', height: '100%',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 'clamp(14px, 2.4vh, 30px)', textAlign: 'center',
          padding: '0 6vw', boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            filter: `drop-shadow(0 0 34px ${GREEN}59)`,
            opacity: show ? 1 : 0,
            transform: show ? 'scale(1)' : 'scale(.86)',
            transition: 'opacity .8s ease, transform .8s ease',
          }}
        >
          <ISamMark run={show} />
        </div>

        <div
          style={{
            fontFamily: HEADING, color: INK,
            // NO textTransform here, unlike TarsTitle. The name is `iSAM` with a
            // deliberate lowercase i — uppercasing it renders ISAM and throws
            // that away. Copperplate sets lowercase as small caps anyway, so the
            // literal string gives exactly the intended small-i-then-SAM.
            // letter-spacing hangs a gap off the final character, so nudge left
            // by half of it to sit optically centred rather than measurably so
            fontSize: 'clamp(2.6rem, 6vw, 5.6rem)',
            letterSpacing: '0.3em', paddingLeft: '0.3em',
            lineHeight: 1, margin: 0,
            marginBottom: 'clamp(-26px, -3vh, -12px)',
            opacity: show ? 1 : 0,
            transform: show ? 'translateY(0)' : 'translateY(14px)',
            transition: 'opacity .85s ease .15s, transform .85s ease .15s',
          }}
        >
          iSAM
        </div>

        {/* Plain English first — the room learns what iSAM DOES before being
            asked to parse what its letters stand for. Parallel to TARS's
            "What the department has to do next". */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 'clamp(12px, 1.4vw, 22px)',
            marginTop: 'clamp(4px, 1vh, 12px)',
            opacity: expanded ? 1 : 0, transition: 'opacity .6s ease .25s',
          }}
        >
          <span style={{ width: 'clamp(30px, 6vw, 90px)', height: 1, background: `linear-gradient(to right, ${GREEN}00, ${GREEN}80)` }} />
          <span style={{
            fontFamily: MONO, color: MUTED, whiteSpace: 'nowrap',
            fontSize: 'clamp(11px, 1vw, 15px)', letterSpacing: '0.18em',
            textTransform: 'uppercase', paddingLeft: '0.18em',
          }}>
            What is actually wrong with this patient
          </span>
          <span style={{ width: 'clamp(30px, 6vw, 90px)', height: 1, background: `linear-gradient(to left, ${GREEN}00, ${GREEN}80)` }} />
        </div>

        {EXPANSION && (
          <div
            style={{
              fontFamily: MONO, color: `${GREEN}cc`,
              fontSize: 'clamp(12px, 1.15vw, 18px)',
              letterSpacing: '0.24em', textTransform: 'uppercase',
              // one line: nowrap rather than a maxWidth, so the browser cannot
              // break it somewhere awkward at an in-between width
              paddingLeft: '0.24em', whiteSpace: 'nowrap', lineHeight: 1.55,
              opacity: expanded ? 1 : 0,
              transform: expanded ? 'translateY(0)' : 'translateY(10px)',
              transition: 'opacity .6s ease, transform .6s ease',
            }}
          >
            {EXPANSION}
          </div>
        )}
      </div>
    </div>
  )
}
