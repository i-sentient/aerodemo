// ===========================================================================
//  TARS — the agent title card, standing between the hospital ontology and the
//  patient's thread.
//
//  A sibling of the deck's PlexusTitle / AtlasTitle by construction: same
//  composition, same beats, same grammar — grid field, halo, a stroke-only
//  sigil, the name in the deck's heading face, then what it does and what its
//  letters stand for. Amber instead of red or violet. The layout says "this is
//  the same system"; the colour says "this is a different part of it".
//
//  It lives HERE rather than in presentationAlpha because the beat that follows
//  it — the patient's thread drawing through the tower — is inside this scene.
//  The deck shows Scene 1 as a single iframe and cannot interleave a slide into
//  the middle of it, so a deck-side card would have to come before the ride
//  starts, which is the wrong moment: TARS is introduced once the building has
//  been shown, not before we have seen it.
//
//  No framer-motion here (the deck has it, this app does not), so the beats are
//  CSS transitions and the sigil draws itself with a dash offset.
//
//  Two beats, as on the sibling cards:
//    0 · the sigil draws, the name lands
//    1 · what it does, then what its letters stand for
// ===========================================================================
// TARS's identity colour on the MAAYA cube is #c69a6d — a bronze at roughly 45%
// saturation. That works inside a small coloured block, but at title scale on
// near-black it has no punch next to PLEXUS's fully-saturated #ff5d73 and
// ATLAS's #a78bfa: the siblings run their accent at full chroma and this did
// not. Same hue family, taken to full strength.
const TAN = '#ffa23d'
const INK = '#eef4f8'
const MUTED = '#8ea3b2'

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'
// the deck's theme.fonts.heading, verbatim — these cards are siblings and the
// name has to be set in the same face as PLEXUS and ATLAS
const HEADING = "'Copperplate Gothic Light', 'Copperplate Light', serif"

/** ids are ts-* so they cannot collide with any other defs in the document */
function GridField() {
  return (
    <svg aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
      <defs>
        <pattern id="ts-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40,0 H0 V40" fill="none" stroke="#2a1c0d" strokeWidth="1" />
        </pattern>
        <pattern id="ts-grid-lg" width="200" height="200" patternUnits="userSpaceOnUse">
          <path d="M200,0 H0 V200" fill="none" stroke="#4d3616" strokeWidth="1.2" />
        </pattern>
        <radialGradient id="ts-fade" cx="50%" cy="50%" r="58%">
          <stop offset="0%" stopColor="#fff" stopOpacity="1" />
          <stop offset="58%" stopColor="#fff" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0.03" />
        </radialGradient>
        {/* userSpaceOnUse — the objectBoundingBox default resolves the gradient
            against the rect's own box and flattens it into graph paper */}
        <mask id="ts-mask" maskUnits="userSpaceOnUse">
          <rect width="100%" height="100%" fill="url(#ts-fade)" />
        </mask>
        <radialGradient id="ts-halo" cx="50%" cy="50%" r="46%">
          <stop offset="0%" stopColor="#5e3d0f" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#5e3d0f" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* a warm-shifted near-black, not the platform's blue-black */}
      <rect width="100%" height="100%" fill="#0a0805" />
      <rect width="100%" height="100%" fill="url(#ts-halo)" />
      <g mask="url(#ts-mask)">
        <rect width="100%" height="100%" fill="url(#ts-grid)" />
        <rect width="100%" height="100%" fill="url(#ts-grid-lg)" />
      </g>
    </svg>
  )
}

/** The sigil from the MAAYA cube at title scale, drawing itself: one unbroken
 *  square spiral whose outermost turn IS the box, rather than a rect drawn
 *  around a separate mark. */
function TarsMark({ size = 128, run }: { size?: number; run: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ display: 'block', overflow: 'visible' }}>
      <path
        d="M12 12 H14.83 V9.17 H9.17 V14.83 H17.67 V6.33 H6.33 V17.67 H20.5 V3.5 H3.5 V20.5 H20.5"
        fill="none" stroke={TAN} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
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

export function TarsTitle({ show, expanded }: { show: boolean; expanded: boolean }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: '#0a0805',
        // opaque and full-bleed: the building keeps turning underneath, so when
        // the card clears the tower is already in motion rather than starting
        opacity: show ? 1 : 0,
        pointerEvents: 'none',
        // visibility is discrete and is NOT interpolated, so listing only
        // opacity meant `hidden` snapped on the same frame the phase changed
        // and the fade never played — the card cut, and whatever was animating
        // underneath had already been running. Hold visibility until the fade
        // has actually finished.
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
            filter: `drop-shadow(0 0 34px ${TAN}59)`,
            opacity: show ? 1 : 0,
            transform: show ? 'scale(1)' : 'scale(.86)',
            transition: 'opacity .8s ease, transform .8s ease',
          }}
        >
          <TarsMark run={show} />
        </div>

        <div
          style={{
            fontFamily: HEADING, color: INK, textTransform: 'uppercase',
            // letter-spacing hangs a gap off the final character, so nudge left
            // by half of it to sit optically centred rather than measurably so
            fontSize: 'clamp(2.6rem, 6vw, 5.6rem)',
            letterSpacing: '0.3em', paddingLeft: '0.3em',
            lineHeight: 1, margin: 0,
            // pulls the caption + expansion block up under the name without
            // touching the space BETWEEN them
            marginBottom: 'clamp(-26px, -3vh, -12px)',
            opacity: show ? 1 : 0,
            transform: show ? 'translateY(0)' : 'translateY(14px)',
            transition: 'opacity .85s ease .15s, transform .85s ease .15s',
          }}
        >
          Tars
        </div>

        {/* Plain English first, acronym second — it sits directly under the name
            so the room learns what TARS DOES before being asked to parse what
            its letters stand for. */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 'clamp(12px, 1.4vw, 22px)',
            marginTop: 'clamp(4px, 1vh, 12px)',
            opacity: expanded ? 1 : 0, transition: 'opacity .6s ease .25s',
          }}
        >
          <span style={{ width: 'clamp(30px, 6vw, 90px)', height: 1, background: `linear-gradient(to right, ${TAN}00, ${TAN}80)` }} />
          <span style={{
            fontFamily: MONO, color: MUTED, whiteSpace: 'nowrap',
            fontSize: 'clamp(11px, 1vw, 15px)', letterSpacing: '0.18em',
            textTransform: 'uppercase', paddingLeft: '0.18em',
          }}>
            What the department has to do next
          </span>
          <span style={{ width: 'clamp(30px, 6vw, 90px)', height: 1, background: `linear-gradient(to left, ${TAN}00, ${TAN}80)` }} />
        </div>

        <div
          style={{
            fontFamily: MONO, color: `${TAN}cc`,
            fontSize: 'clamp(12px, 1.15vw, 18px)',
            letterSpacing: '0.24em', textTransform: 'uppercase',
            // one line: nowrap rather than a maxWidth, so the browser cannot
            // decide to break it somewhere awkward at an in-between width
            paddingLeft: '0.24em', whiteSpace: 'nowrap', lineHeight: 1.55,
            opacity: expanded ? 1 : 0,
            transform: expanded ? 'translateY(0)' : 'translateY(10px)',
            transition: 'opacity .6s ease, transform .6s ease',
          }}
        >
          Task Automation Reconciliation System
        </div>
      </div>
    </div>
  )
}
