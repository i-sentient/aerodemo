// ============================================================================
//  PALETTE — BRIGHT aero / Y2K clear-plastic grammar.
//  A LIGHT ground (cool whites + greys) with SATURATED CANDY-TRANSLUCENT
//  objects (royal blue, turquoise, cyan, purple, candy green). Reference:
//  translucent Y2K gadgets on a white surface. Rich & glossy — NOT pale.
//    teal   = autonomous / committed
//    amber  = autoConfirm
//    coral  = clinical-gated + waiting
//    gold   = iSAM reasoning
//    green/amber/red = trajectory & alert severity
// ============================================================================
import type {
  Acuity,
  AlertLevel,
  Autonomy,
  BedStatus,
  Severity,
} from './types'

/** Semantic accents — SATURATED candy colours (CSS). */
export const C = {
  teal: '#12c2b0', // candy turquoise (autonomous / committed)
  amber: '#ff9e2c', // candy amber (autoConfirm)
  coral: '#ff6a54', // candy coral (clinical-gated + waiting)
  gold: '#f2b01e', // candy gold (reasoning)
  green: '#2fc86e', // candy green (severity ok)
  red: '#f0455f', // candy pink-red (critical)
  blue: '#2e86e6', // candy royal blue (sensor / data)
  purple: '#8b6fe6', // candy purple accent
  slate: '#8a99a8', // neutral grey
  ink: '#28323c', // dark charcoal text
  panel: 'rgba(255,255,255,0.62)',
  text: '#28323c',
  textDim: '#6a7885',
} as const

/** Numeric THREE color literals. */
export const N = {
  teal: 0x12c2b0,
  amber: 0xff9e2c,
  coral: 0xff6a54,
  gold: 0xf2b01e,
  green: 0x2fc86e,
  red: 0xf0455f,
  blue: 0x2e86e6,
  purple: 0x8b6fe6,
  slate: 0x8a99a8,
  white: 0xffffff,
} as const

/**
 * AERO — the BRIGHT surface tokens. Light cool-white ground, silver/charcoal
 * greys for structure, light frosted glass for panels, dark charcoal text.
 */
export const AERO = {
  bgTop: '#f6fbfe', // near-white top
  bgGlow: '#ffffff',
  bgBottom: '#cfdde7', // cool light-grey bottom
  bg: '#e8f1f6',
  chrome: '#cdd8e0', // light silver-grey (glossy plastic/metal)
  chromeDark: '#454f5a', // dark charcoal component
  smoke: '#eef4f9', // light frosted card glass
  frost: '#dbe7f1', // light frosted structure (crisp, iteration-1 look)
  edge: '#2e86e6', // candy-blue edge
  glass: 'rgba(255,255,255,0.6)', // overlay panel (light frosted)
  glassStrong: 'rgba(255,255,255,0.8)',
  glassBorder: 'rgba(140,165,190,0.4)',
  chip: 'rgba(255,255,255,0.74)', // in-scene label chips
  chipBorder: 'rgba(120,150,180,0.3)',
  ink: '#28323c', // dark text
  inkDim: '#6a7885', // secondary text
} as const

export const N_AERO = {
  bg: 0xe8f1f6,
  chrome: 0xcdd8e0,
  chromeDark: 0x454f5a,
  smoke: 0xeef4f9,
  frost: 0xdbe7f1,
  edge: 0x2e86e6,
  white: 0xffffff,
} as const

/** Text/edge accents on the light ground — slightly deeper candy for contrast. */
export const CText = {
  teal: '#0fa89a',
  amber: '#e8851a',
  coral: '#ea4f3a',
  gold: '#cf9615',
  green: '#22a85a',
  red: '#dd2f4e',
  blue: '#1f6fd0',
} as const

// --- semantic lookups --------------------------------------------------------

export const acuityColor: Record<Acuity, string> = {
  stable: C.green,
  elevated: C.amber,
  critical: C.red,
}
export const acuityColorN: Record<Acuity, number> = {
  stable: N.green,
  elevated: N.amber,
  critical: N.red,
}

export const severityColor: Record<Severity, string> = {
  green: C.green,
  amber: C.amber,
  red: C.red,
}
export const severityColorN: Record<Severity, number> = {
  green: N.green,
  amber: N.amber,
  red: N.red,
}

export const alertColor: Record<AlertLevel, string> = {
  info: C.blue,
  warn: C.amber,
  critical: C.red,
}

/** Autonomy is the Order color grammar (Autonomy Governor). */
export const autonomyColor: Record<Autonomy, string> = {
  autonomous: C.teal,
  autoConfirm: C.amber,
  clinicalGated: C.coral,
}
export const autonomyColorN: Record<Autonomy, number> = {
  autonomous: N.teal,
  autoConfirm: N.amber,
  clinicalGated: N.coral,
}

/** Bed status halo colors. `warming` reads hot (readiness). */
export const bedStatusColor: Record<BedStatus, string> = {
  occupied: C.blue,
  vacant: C.slate,
  dirty: '#c8934f',
  clean: C.green,
  warming: C.gold,
  reserved: C.teal,
}
export const bedStatusColorN: Record<BedStatus, number> = {
  occupied: N.blue,
  vacant: N.slate,
  dirty: 0xc8934f,
  clean: N.green,
  warming: N.gold,
  reserved: N.teal,
}
