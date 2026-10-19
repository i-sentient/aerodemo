import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { Box3, MeshStandardMaterial, Vector3 } from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import { useSlideNavigation, theme } from '../presentationTheme';
import FloatingDevices from './FloatingDevices';

// ---------------------------------------------------------------------------
//  ACT 2 · THE SENTIENT REALITY PLATFORM — the act's opening slide, and the
//  only one that explains rather than shows. Everything after it is the story.
//
//  Opens on the platform's name alone; MAAYA and the cube arrive on the
//  second beat. The cube rests sealed; opening an agent explodes its
//  quarter-prism out of the body, and closing flies it back in. It NEVER leaves the centre of the page. Each quadrant is one part of the platform; its
//  intro takes the FULL side column that quadrant faces and cascades in
//  element by element. Only one is ever open at a time.
//
//  Driven both ways: arrow keys walk PLEXUS → ATLAS → TARS → iSAM (beats 1-4,
//  beat 0 is the cube alone), and clicking a quadrant jumps straight to it.
//  Clicking the open quadrant again closes it — same swoosh, reversed.
//
//  The last beat is the whiteboard: intros close, the cube shrinks to the
//  middle, and the four full cards take their quadrant positions around it —
//  TARS · iSAM over ATLAS · PLEXUS, MAAYA still heading the page.
//
//  The Operational Digital → Geo-Spatial Virtual Twin strike line is parked on
//  request ("leave it aside for a min") — rebuild: two terms, DIGITAL struck
//  with RED, the replacement pushing in via layout.
//
//  Grid, ground and hairlines are lifted from CommandLayers so the act reads as
//  one surface. Colours follow the locked set: TARS coffee, iSAM green, and
//  cyan for the platform itself — so two coloured agents visibly sit ON a cyan
//  substrate. LSAM is deliberately absent: perception is stated here as a job,
//  and the agent that does it is introduced later, at the bedside.
//
//  Every cube's copy is sourced from the AMTZ report (§3.2). Nothing invented.
// ---------------------------------------------------------------------------

const ACCENT = '#2fd4ff';   // the platform
const TARS = '#c69a6d';
const ISAM = '#4fe08a';
const INK = '#eef4f8';
const MUTED = '#8ea3b2';
const DIM = '#5b6b78';
const HAIR = '#1b2833';
const RED = '#ff3b3b';      // only used to strike the wrong term
// PLEXUS runs warm against the platform's cyan — deliberately a rose
// red, not the alarm red above, so the strike keeps meaning "wrong" while the
// card just means "this half of perception".
const PLEXUS_RED = '#ff5d73';
// ATLAS's heading. Violet is the one hue nothing else on this slide uses: not
// TARS coffee, not iSAM green, not PLEXUS red, not the platform's cyan, and not
// any of the seven legend colours inside ATLAS's own chips. It is also cool,
// which sets it against PLEXUS's warm red across the floor.
// Swaps if this misses too: '#e8c14a' gold (warmer, but near the doctors
// glyph), '#2fd4ff' cyan (safe, blends into the frame), '#c8d4e0' silver.
const ATLAS_INK = '#a78bfa';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
const WIDTH = 'min(1520px, 92vw)';

// Gap between the two cubes on a floor. Within-floor connectors are drawn as
// children of the cube they leave and extend exactly this far, so alignment is
// structural — no second source of truth to drift when the layout changes.
const FLOOR_GAP = 48;
// Height of the slab between floors, where the closed loop runs.
const LOOP_H = 'clamp(38px, 4.2vh, 58px)';

// grid ids are sp-* so they cannot collide with CommandLayers' cl-* defs
function GridField() {
  return (
    <svg aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
      <defs>
        <pattern id="sp-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40,0 H0 V40" fill="none" stroke="#16303f" strokeWidth="1" />
        </pattern>
        <pattern id="sp-grid-lg" width="200" height="200" patternUnits="userSpaceOnUse">
          <path d="M200,0 H0 V200" fill="none" stroke="#28576f" strokeWidth="1.2" />
        </pattern>
        <radialGradient id="sp-fade" cx="50%" cy="52%" r="58%">
          <stop offset="0%" stopColor="#fff" stopOpacity="1" />
          <stop offset="58%" stopColor="#fff" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0.03" />
        </radialGradient>
        {/* userSpaceOnUse, not the objectBoundingBox default — otherwise the
            gradient is resolved against the rect's own box and the falloff
            collapses into flat graph paper. */}
        <mask id="sp-mask" maskUnits="userSpaceOnUse">
          <rect width="100%" height="100%" fill="url(#sp-fade)" />
        </mask>
        <radialGradient id="sp-halo" cx="50%" cy="50%" r="46%">
          <stop offset="0%" stopColor="#0d3a4d" stopOpacity="0.62" />
          <stop offset="100%" stopColor="#0d3a4d" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="#05090d" />
      <rect width="100%" height="100%" fill="url(#sp-halo)" />
      <g mask="url(#sp-mask)">
        <rect width="100%" height="100%" fill="url(#sp-grid)" />
        <rect width="100%" height="100%" fill="url(#sp-grid-lg)" />
      </g>
    </svg>
  );
}

// ── asset glyphs ──────────────────────────────────────────────────────────
// Ward Ontology colours and shapes are lifted verbatim from the scene's own
// legend (sentient-scene1/src/ontology/census.ts) so a coral circle means the
// same thing on this slide as it does in the hospital a few beats later.
function Wifi({ size = 13, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M1.6 5.4a9.6 9.6 0 0 1 12.8 0" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.45" />
      <path d="M3.9 8.1a6.2 6.2 0 0 1 8.2 0" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.75" />
      <path d="M6.1 10.7a2.9 2.9 0 0 1 3.8 0" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="13.2" r="1.15" fill={color} />
    </svg>
  );
}

function Glyph({ shape, color, size = 12 }) {
  const s = size;
  const common = { width: s, height: s, viewBox: '0 0 12 12', fill: 'none', 'aria-hidden': true };
  if (shape === 'sphere') return <svg {...common}><circle cx="6" cy="6" r="4.6" fill={color} /></svg>;
  if (shape === 'cone') return <svg {...common}><path d="M6 1.4 10.6 10.2H1.4z" fill={color} /></svg>;
  if (shape === 'coneLow') return <svg {...common}><path d="M6 3.2 10.6 10.2H1.4z" fill={color} /></svg>;
  if (shape === 'cube') return <svg {...common}><rect x="1.8" y="1.8" width="8.4" height="8.4" rx="1" fill={color} /></svg>;
  if (shape === 'plate') return <svg {...common}><rect x="0.8" y="4.6" width="10.4" height="2.8" rx="1.4" fill={color} /></svg>;
  if (shape === 'octa') return <svg {...common}><path d="M6 1.2 10.8 6 6 10.8 1.2 6z" fill={color} /></svg>;
  // inventory — a crate, deliberately outlined rather than solid: it is the
  // one class the ward counts but does not continuously sense
  return <svg {...common}><rect x="1.6" y="2.6" width="8.8" height="6.8" rx="1" stroke={color} strokeWidth="1.5" /><path d="M1.6 5.2h8.8" stroke={color} strokeWidth="1.2" /></svg>;
}

// ── agent sigils ──────────────────────────────────────────────────────────
// Drawn from the whiteboard: TARS a square spiral whose outermost turn
// closes into the box, iSAM a round spiral wound far enough that its last
// coil reads as a closed circle,
// ATLAS a plate of scattered points, PLEXUS a starburst. Stroke-only, so they
// read as marks rather than icons.
function AgentGlyph({ type, color, size = 30 }) {
  const p = { fill: 'none', stroke: color, strokeWidth: 1.35, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (type === 'tars') return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      {/* one unbroken square spiral — the outer turn IS the box, not a rect
          drawn around a separate mark */}
      <path d="M12 12 H14.83 V9.17 H9.17 V14.83 H17.67 V6.33 H6.33 V17.67 H20.5 V3.5 H3.5 V20.5 H20.5" {...p} />
    </svg>
  );
  if (type === 'isam') return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M12.00 12.00L12.00 11.96L12.01 11.93L12.03 11.89L12.05 11.86L12.08 11.83L12.11 11.81L12.15 11.79L12.20 11.77L12.24 11.77L12.29 11.76L12.34 11.77L12.39 11.78L12.45 11.80L12.50 11.83L12.55 11.87L12.59 11.91L12.64 11.96L12.67 12.02L12.71 12.09L12.73 12.16L12.75 12.23L12.76 12.31L12.77 12.40L12.76 12.48L12.74 12.57L12.72 12.66L12.68 12.75L12.63 12.84L12.58 12.92L12.51 13.00L12.43 13.08L12.35 13.15L12.25 13.21L12.15 13.27L12.03 13.31L11.92 13.35L11.79 13.37L11.66 13.38L11.53 13.38L11.39 13.37L11.25 13.34L11.11 13.30L10.98 13.25L10.85 13.18L10.72 13.10L10.59 13.00L10.48 12.89L10.37 12.77L10.27 12.63L10.19 12.49L10.12 12.33L10.06 12.16L10.01 11.99L9.98 11.81L9.97 11.62L9.98 11.44L10.00 11.24L10.04 11.05L10.10 10.86L10.18 10.68L10.28 10.50L10.39 10.32L10.52 10.16L10.67 10.00L10.84 9.86L11.02 9.73L11.21 9.61L11.42 9.52L11.64 9.44L11.86 9.38L12.10 9.34L12.34 9.32L12.58 9.33L12.83 9.35L13.08 9.40L13.32 9.47L13.56 9.57L13.79 9.69L14.02 9.83L14.23 9.99L14.43 10.18L14.61 10.38L14.78 10.60L14.93 10.84L15.06 11.09L15.16 11.36L15.24 11.64L15.30 11.93L15.33 12.23L15.33 12.53L15.31 12.83L15.26 13.13L15.18 13.44L15.07 13.73L14.94 14.02L14.77 14.29L14.59 14.56L14.37 14.81L14.13 15.04L13.87 15.25L13.59 15.44L13.30 15.60L12.98 15.74L12.65 15.85L12.31 15.93L11.96 15.97L11.60 15.99L11.24 15.98L10.88 15.93L10.52 15.85L10.17 15.74L9.82 15.59L9.49 15.42L9.17 15.21L8.87 14.97L8.59 14.70L8.33 14.41L8.10 14.09L7.90 13.75L7.72 13.39L7.58 13.01L7.47 12.62L7.39 12.22L7.35 11.81L7.35 11.39L7.39 10.97L7.46 10.55L7.58 10.14L7.72 9.74L7.91 9.34L8.13 8.97L8.39 8.61L8.68 8.28L9.00 7.97L9.35 7.68L9.73 7.43L10.13 7.21L10.56 7.03L11.00 6.89L11.45 6.78L11.92 6.71L12.39 6.69L12.87 6.71L13.34 6.77L13.82 6.87L14.28 7.02L14.73 7.21L15.17 7.44L15.58 7.71L15.98 8.02L16.34 8.37L16.68 8.75L16.98 9.16L17.25 9.60L17.48 10.06L17.67 10.55L17.81 11.05L17.91 11.57L17.96 12.09L17.97 12.63L17.92 13.16L17.83 13.69L17.69 14.22L17.51 14.73L17.28 15.23L17.00 15.71L16.68 16.17L16.31 16.59L15.91 16.99L15.47 17.35L15.00 17.67L14.50 17.95L13.97 18.18L13.42 18.37L12.86 18.51L12.28 18.59L11.69 18.63L11.09 18.61L10.50 18.54L9.91 18.42L9.34 18.24L8.77 18.01L8.23 17.74L7.71 17.41L7.22 17.03L6.77 16.61L6.35 16.15L5.97 15.65L5.64 15.12L5.35 14.55L5.11 13.96L4.93 13.35L4.80 12.72L4.73 12.08L4.71 11.43L4.75 10.77L4.85 10.13L5.01 9.48L5.23 8.86L5.50 8.25L5.83 7.67L6.21 7.11L6.65 6.59L7.12 6.11L7.65 5.66L8.21 5.27L8.81 4.93L9.43 4.63L10.09 4.40L10.77 4.22L11.46 4.11L12.17 4.05L12.88 4.06L13.59 4.13L14.29 4.27L14.98 4.47L15.66 4.73L16.31 5.05L16.93 5.43L17.52 5.87L18.07 6.36L18.58 6.90L19.04 7.48L19.44 8.11L19.80 8.77L20.09 9.47L20.32 10.19L20.48 10.93L20.58 11.69L20.61 12.45L20.58 13.22L20.47 13.99L20.30 14.74L20.05 15.48L19.74 16.20L19.37 16.90L18.94 17.56L18.44 18.18L17.89 18.75L17.29 19.28" {...p} />
    </svg>
  );
  // atlas — the survey plate from the title card: corner registration ticks,
  // a faint coordinate grid, and the census's own shapes as located objects.
  // Monochrome: the shapes carry the ontology's vocabulary, the colour would
  // only turn six marks into a game overlay.
  if (type === 'atlas') return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      {[[3, 3, 1, 1], [21, 3, -1, 1], [3, 21, 1, -1], [21, 21, -1, -1]].map(([x, y, dx, dy]) => (
        <path key={`${x}${y}`} d={`M${x} ${y + dy * 3.4}V${y}H${x + dx * 3.4}`}
          fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.95" />
      ))}
      <g stroke={color} strokeWidth="0.85" opacity="0.34">
        <path d="M12 3.6V20.4M3.6 12h16.8" />
        <path d="M7.8 4.6v14.8M16.2 4.6v14.8M4.6 7.8h14.8M4.6 16.2h14.8" opacity="0.66" />
      </g>
      <circle cx="7.6" cy="8.4" r="1" fill={color} />
      <path d="M15.8 5.8l1.15 2.1h-2.3z" fill={color} />
      <path d="M17.2 13.55l1.25 1.25-1.25 1.25-1.25-1.25z" fill={color} />
      <rect x="5.95" y="15.98" width="2.5" height="0.84" rx="0.42" fill={color} />
      <rect x="11.45" y="11.25" width="1.9" height="1.9" rx="0.3" fill={color} />
      <path d="M11.2 17.8l1.05 1.6h-2.1z" fill={color} />
    </svg>
  );
  // plexus — eight rays of unequal length, like the hand-drawn asterisk
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      {[[12, 2.6, 12, 21.4], [3.4, 12, 20.6, 12], [5.2, 5.2, 18.8, 18.8], [18.4, 5.6, 5.6, 18.4]].map(([x1, y1, x2, y2]) => (
        <line key={`${x1}-${y1}`} x1={x1} y1={y1} x2={x2} y2={y2} {...p} />
      ))}
      <circle cx="12" cy="12" r="1.5" fill={color} stroke="none" />
    </svg>
  );
}

// ── the sealed MAAYA cube, beat 0 ─────────────────────────────────────────
// A cabinet-projection cube whose front face is quartered, each quadrant
// tinted with the card that will unfold from it — same geography as the full
// diagram: TARS top-left, iSAM top-right, ATLAS bottom-left, PLEXUS
// bottom-right. The room meets the whole object before any part of it.
// The living sigils — one animation per quarter, each the agent's mark doing
// its own thing: TARS's spiral draws itself over and over, iSAM's spiral
// breathes inside a sonar aura, ATLAS's points come and go like map contacts,
// PLEXUS's rays spike outward from the centre. All CSS keyframes on SVG
// strokes; pointer-events stay off so the faces keep the clicks.
function InnerSigil({ k, c, cx, cy }) {
  const g = { pointerEvents: 'none' };
  if (k === 'tars') return (
    <g style={g} transform={`translate(${cx - 15}, ${cy - 15}) scale(1.25)`}>
      <path d="M12 12 H14.83 V9.17 H9.17 V14.83 H17.67 V6.33 H6.33 V17.67 H20.5 V3.5 H3.5 V20.5 H20.5" fill="none" stroke={c} strokeWidth="1.7"
        strokeLinecap="round" strokeLinejoin="round" pathLength="1"
        style={{ strokeDasharray: 1, animation: 'mc-draw 4.2s ease-in-out infinite' }} />
    </g>
  );
  if (k === 'isam') return (
    <g style={g}>
      {/* the spiral writes itself from the centre outward, like TARS's */}
      <g transform={`translate(${cx - 15}, ${cy - 15}) scale(1.25)`}>
        <path d="M12.00 12.00L12.00 11.96L12.01 11.93L12.03 11.89L12.05 11.86L12.08 11.83L12.11 11.81L12.15 11.79L12.20 11.77L12.24 11.77L12.29 11.76L12.34 11.77L12.39 11.78L12.45 11.80L12.50 11.83L12.55 11.87L12.59 11.91L12.64 11.96L12.67 12.02L12.71 12.09L12.73 12.16L12.75 12.23L12.76 12.31L12.77 12.40L12.76 12.48L12.74 12.57L12.72 12.66L12.68 12.75L12.63 12.84L12.58 12.92L12.51 13.00L12.43 13.08L12.35 13.15L12.25 13.21L12.15 13.27L12.03 13.31L11.92 13.35L11.79 13.37L11.66 13.38L11.53 13.38L11.39 13.37L11.25 13.34L11.11 13.30L10.98 13.25L10.85 13.18L10.72 13.10L10.59 13.00L10.48 12.89L10.37 12.77L10.27 12.63L10.19 12.49L10.12 12.33L10.06 12.16L10.01 11.99L9.98 11.81L9.97 11.62L9.98 11.44L10.00 11.24L10.04 11.05L10.10 10.86L10.18 10.68L10.28 10.50L10.39 10.32L10.52 10.16L10.67 10.00L10.84 9.86L11.02 9.73L11.21 9.61L11.42 9.52L11.64 9.44L11.86 9.38L12.10 9.34L12.34 9.32L12.58 9.33L12.83 9.35L13.08 9.40L13.32 9.47L13.56 9.57L13.79 9.69L14.02 9.83L14.23 9.99L14.43 10.18L14.61 10.38L14.78 10.60L14.93 10.84L15.06 11.09L15.16 11.36L15.24 11.64L15.30 11.93L15.33 12.23L15.33 12.53L15.31 12.83L15.26 13.13L15.18 13.44L15.07 13.73L14.94 14.02L14.77 14.29L14.59 14.56L14.37 14.81L14.13 15.04L13.87 15.25L13.59 15.44L13.30 15.60L12.98 15.74L12.65 15.85L12.31 15.93L11.96 15.97L11.60 15.99L11.24 15.98L10.88 15.93L10.52 15.85L10.17 15.74L9.82 15.59L9.49 15.42L9.17 15.21L8.87 14.97L8.59 14.70L8.33 14.41L8.10 14.09L7.90 13.75L7.72 13.39L7.58 13.01L7.47 12.62L7.39 12.22L7.35 11.81L7.35 11.39L7.39 10.97L7.46 10.55L7.58 10.14L7.72 9.74L7.91 9.34L8.13 8.97L8.39 8.61L8.68 8.28L9.00 7.97L9.35 7.68L9.73 7.43L10.13 7.21L10.56 7.03L11.00 6.89L11.45 6.78L11.92 6.71L12.39 6.69L12.87 6.71L13.34 6.77L13.82 6.87L14.28 7.02L14.73 7.21L15.17 7.44L15.58 7.71L15.98 8.02L16.34 8.37L16.68 8.75L16.98 9.16L17.25 9.60L17.48 10.06L17.67 10.55L17.81 11.05L17.91 11.57L17.96 12.09L17.97 12.63L17.92 13.16L17.83 13.69L17.69 14.22L17.51 14.73L17.28 15.23L17.00 15.71L16.68 16.17L16.31 16.59L15.91 16.99L15.47 17.35L15.00 17.67L14.50 17.95L13.97 18.18L13.42 18.37L12.86 18.51L12.28 18.59L11.69 18.63L11.09 18.61L10.50 18.54L9.91 18.42L9.34 18.24L8.77 18.01L8.23 17.74L7.71 17.41L7.22 17.03L6.77 16.61L6.35 16.15L5.97 15.65L5.64 15.12L5.35 14.55L5.11 13.96L4.93 13.35L4.80 12.72L4.73 12.08L4.71 11.43L4.75 10.77L4.85 10.13L5.01 9.48L5.23 8.86L5.50 8.25L5.83 7.67L6.21 7.11L6.65 6.59L7.12 6.11L7.65 5.66L8.21 5.27L8.81 4.93L9.43 4.63L10.09 4.40L10.77 4.22L11.46 4.11L12.17 4.05L12.88 4.06L13.59 4.13L14.29 4.27L14.98 4.47L15.66 4.73L16.31 5.05L16.93 5.43L17.52 5.87L18.07 6.36L18.58 6.90L19.04 7.48L19.44 8.11L19.80 8.77L20.09 9.47L20.32 10.19L20.48 10.93L20.58 11.69L20.61 12.45L20.58 13.22L20.47 13.99L20.30 14.74L20.05 15.48L19.74 16.20L19.37 16.90L18.94 17.56L18.44 18.18L17.89 18.75L17.29 19.28"
          fill="none" stroke={c} strokeWidth="1.45" strokeLinecap="round" pathLength="1"
          style={{ strokeDasharray: 1, animation: 'mc-draw 4.2s ease-in-out infinite' }} />
      </g>
    </g>
  );
  if (k === 'ward') {
    // Inside a 58px quarter the survey plate loses — the grid vanishes and
    // monochrome shapes at that scale read as specks. So the cube keeps the
    // ORIGINAL treatment: the legend's own colours, solid and blinking, which
    // is exactly what carries at this size. The monochrome plate belongs on
    // the title card and the cards, where it has room.
    const A = 'mc-blink 3.2s ease-in-out';
    return (
      <g style={g}>
        <circle cx={cx - 9} cy={cy - 8} r="2.6" fill="#ff6a54" style={{ animation: `${A} 0s infinite` }} />
        <path d={`M${cx + 6} ${cy - 13} l3.4 6 h-6.8z`} fill="#f2b01e" style={{ animation: `${A} 0.55s infinite` }} />
        <path d={`M${cx + 12} ${cy + 1} l3 4.4 h-6z`} fill="#f5a25d" style={{ animation: `${A} 1.1s infinite` }} />
        <rect x={cx - 13} y={cy + 1} width="4.6" height="4.6" rx="0.8" fill="#9a8f7a" style={{ animation: `${A} 1.65s infinite` }} />
        <rect x={cx - 3} y={cy + 9} width="7.4" height="2.4" rx="1.2" fill="#12c2b0" style={{ animation: `${A} 2.2s infinite` }} />
        <path d={`M${cx + 9} ${cy + 8} l3 3 -3 3 -3 -3z`} fill="#2e86e6" style={{ animation: `${A} 2.75s infinite` }} />
      </g>
    );
  }
  // plexus — eight rays growing out of the centre, staggered
  return (
    <g style={g}>
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        const L = i % 2 ? 9.5 : 14;
        return (
          <line key={i} x1={cx} y1={cy} x2={cx + Math.cos(a) * L} y2={cy + Math.sin(a) * L}
            stroke={c} strokeWidth="1.45" strokeLinecap="round" pathLength="1"
            style={{ strokeDasharray: 1, animation: `mc-spike 3s ease-out ${i * 0.19}s infinite` }} />
        );
      })}
    </g>
  );
}

// MAAYA at rest is the sealed cube — the four quarter-prisms sit flush
// (gap 0), cyan-edged, so it reads exactly as the single quartered cube.
// Opening an agent EXPLODES its quarter out of the body along its own
// diagonal (toward the side its intro panel lives on); the block lights in
// its colour mid-flight while the other three stay home. Closing flies it
// back in. Painter order (bottom row first) keeps depth faces tucked.
function MaayaCube({ active, onPick, small = false, interactive = true }) {
  const Q = 58, D = 22, X = 12, Y = 48, E = 26;
  const PRISMS = [
    { k: 'ward',   c: ATLAS_INK,  x: X,     y: Y + Q, ex: -E, ey: E },   // bottom-left
    { k: 'device', c: PLEXUS_RED, x: X + Q, y: Y + Q, ex: E,  ey: E },   // bottom-right
    { k: 'tars',   c: TARS,       x: X,     y: Y,     ex: -E, ey: -E },  // top-left
    { k: 'isam',   c: ISAM,       x: X + Q, y: Y,     ex: E,  ey: -E },  // top-right
  ];
  return (
    <motion.div
      animate={{ y: [0, -9, 0] }}
      transition={{ duration: 5.2, repeat: Infinity, ease: 'easeInOut' }}
      style={{ filter: `drop-shadow(0 0 26px ${ACCENT}30)` }}
    >
      <svg viewBox="0 0 170 178" aria-hidden={false}
        style={{ display: 'block', width: small ? 'min(15vh, 152px)' : 'min(31vh, 320px)', overflow: 'visible' }}>
        <style>{`
          @keyframes mc-draw { 0% { stroke-dashoffset: 1; opacity: 1; } 45% { stroke-dashoffset: 0; opacity: 1; } 68% { stroke-dashoffset: 0; opacity: 1; } 84% { stroke-dashoffset: 0; opacity: 0; } 85% { stroke-dashoffset: 1; opacity: 0; } 100% { stroke-dashoffset: 1; opacity: 1; } }
          @keyframes mc-blink { 0%, 100% { opacity: 0; } 35%, 62% { opacity: 1; } }
          @keyframes mc-slowspin { to { transform: rotate(360deg); } }
          @keyframes mc-spike { 0% { stroke-dashoffset: 1; opacity: 0.9; } 38% { stroke-dashoffset: 0; opacity: 1; } 66% { stroke-dashoffset: 0; opacity: 0.25; } 100% { stroke-dashoffset: 1; opacity: 0; } }
        `}</style>
        {PRISMS.map(({ k, c, x, y, ex, ey }) => {
          const on = active === k;
          // cyan wireframe while sealed — the cube is ONE object until a
          // quarter leaves it, and only the travelling block takes its colour
          const edge = on ? `${c}ee` : `${ACCENT}99`;
          return (
            <motion.g
              key={k}
              animate={{ x: on ? ex : 0, y: on ? ey : 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 24 }}
              onClick={interactive ? () => onPick(k) : undefined}
              style={{ cursor: interactive ? 'pointer' : 'default' }}
            >
              {/* top face — catches the light */}
              <polygon
                points={`${x},${y} ${x + Q},${y} ${x + Q + D},${y - D} ${x + D},${y - D}`}
                fill={`${c}${on ? '5c' : '2b'}`} stroke={edge} strokeWidth="1.2" strokeLinejoin="round"
                style={{ transition: 'fill 0.35s ease, stroke 0.35s ease' }}
              />
              {/* right face — in shadow */}
              <polygon
                points={`${x + Q},${y} ${x + Q + D},${y - D} ${x + Q + D},${y + Q - D} ${x + Q},${y + Q}`}
                fill={`${c}${on ? '3d' : '14'}`} stroke={edge} strokeWidth="1.2" strokeLinejoin="round"
                style={{ transition: 'fill 0.35s ease, stroke 0.35s ease' }}
              />
              {/* front face */}
              <rect
                x={x} y={y} width={Q} height={Q}
                fill={`${c}${on ? '4d' : '26'}`} stroke={edge} strokeWidth="1.5" strokeLinejoin="round"
                style={{ transition: 'fill 0.35s ease, stroke 0.35s ease' }}
              />
              {/* the living sigil belongs to the SPOTLIGHT, not the cube —
                  it materialises only in the exploded, concentrated-on block;
                  sealed quarters stay empty glass */}
              <AnimatePresence>
                {on && (
                  <motion.g
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, transition: { duration: 0.4, delay: 0.25 } }}
                    exit={{ opacity: 0, transition: { duration: 0.15 } }}
                  >
                    <InnerSigil k={k} c={c} cx={x + Q / 2} cy={y + Q / 2} />
                  </motion.g>
                )}
              </AnimatePresence>
            </motion.g>
          );
        })}
      </svg>
    </motion.div>
  );
}

// ── the reality cloud + the three layers ──────────────────────────────────
//  The doc's Figure 2 stack, drawn in the cube's own cabinet projection so
//  the two objects read as the same solid. Bottom to top:
//
//      INFERENCE LAYER   iSAM reasons over state · TARS renders operations
//      TWIN LAYER        Atlas holds the patient as one object
//      SENSORY LAYER     Plexus captures at source
//      ~ reality ~       the physical: MRI, CT, ultrasound, ECG, labs, vitals
//
//  The arrival is the argument: reality RISES from below, and the three
//  layers FALL onto it in order. The two directions meet at the sensory
//  boundary, which is the one place the platform touches the world.
const SENSORY_C = PLEXUS_RED;
const TWIN_C = ATLAS_INK;
const INFER_C = ISAM;

// What is actually in the room. Both axes are sensed from here, and the
// asymmetry is the point: the patient axis has fourteen channels, the unit
// axis five, and nothing in the unit axis measures a ward directly —
// occupancy, saturation and attention deficit are all derived from these.
//
// The three keystones are marked. They are load-bearing rather than merely
// useful: without an arterial waveform, cardiac output is formally
// unidentifiable (MAP = CO × SVR is two unknowns in one equation), and the
// ventilator and the gas analyser each unlock a whole subsystem behind them.
const SENSORS = [
  { label: 'MONITOR', color: '#2fd4ff', axis: 'patient' },
  { label: 'ART LINE', color: '#ff5d73', axis: 'patient', keystone: true },
  { label: 'VENTILATOR', color: '#4fe08a', axis: 'patient', keystone: true },
  { label: 'BLOOD GAS', color: '#f2b01e', axis: 'patient', keystone: true },
  { label: 'ECG', color: '#ff9ad5', axis: 'patient' },
  { label: 'EtCO₂', color: '#6fe0e8', axis: 'patient' },
  { label: 'PACS', color: '#a78bfa', axis: 'patient' },
  { label: 'LABS', color: '#e8c14a', axis: 'patient' },
  { label: 'PUMPS', color: '#12c2b0', axis: 'patient' },
  { label: 'CASE SHEET', color: '#8ea3b2', axis: 'patient' },
  { label: 'CAMERAS', color: '#4d9dff', axis: 'unit' },
  { label: 'BADGES', color: '#c69a6d', axis: 'unit' },
  { label: 'TAGS', color: '#f5a25d', axis: 'unit' },
  { label: 'READERS', color: '#9a8f7a', axis: 'unit' },
];
// Deterministic scatter — a seeded LCG rather than Math.random, so the cloud
// is the same cloud on every render and every reload. A field that reshuffles
// under a re-render reads as noise the slide is generating, not as the world
// it is sampling.
function seeded(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

const LAYERS = {
  sensory: {
    kicker: 'perception · at source',
    name: 'SENSORY LAYER',
    symbol: 'plexus',
    expansion: 'PLEXUS',
    color: SENSORY_C,
    chipColor: ACCENT,
    verb: 'captures what the instruments measure',
    chips: [
      'capture at source', 'signal quality', 'time stamping', 'provenance',
      'signal-only inference', 'sensed and alarmed without a world model',
    ],
  },
  twin: {
    kicker: 'state · the patient',
    name: 'TWIN LAYER',
    symbol: 'atlas',
    expansion: 'ATLAS',
    color: TWIN_C,
    chipColor: ACCENT,
    verb: 'holds the patient as one object',
    chips: [
      'patient state twin', 'the clinical record beneath it', 'confidence',
      'provenance', 'decay rate', 'gaps recorded, never interpolated',
      'persists across shifts',
    ],
  },
  inference: {
    kicker: 'cognition · over state',
    name: 'INFERENCE LAYER',
    symbol: 'isam',
    expansion: 'iSAM · TARS',
    color: INFER_C,
    chipColor: ACCENT,
    verb: 'reasons over state, never raw signal',
    // The five faculties, C1-C5, from the report's §3.1 table, then the two
    // renderings that share this one layer (§7.1).
    chips: [
      'notice', 'recall', 'reason', 'foresee', 'doubt',
      'clinical picture · iSAM', 'operational picture · TARS',
    ],
  },
};

// Which side a layer's intro genies to. Alternating keeps three panels in a
// row from reading as one long column on the same edge.
const SIDE = { inference: 'right', twin: 'left', sensory: 'right' };

// Geometry shared by the slabs. Same D-skew as the cube, so both objects sit
// in one projection.
const SW = 150, SD = 34, SH = 26, SX = 46;
const HALF = SW / 2;
// How far each half travels when the stack cleaves.
const SPLIT_G = 25;
// The cut. It falls at the front-face midline and runs the full height of
// the stack, clearing the top face of the first slab and the front face of
// the last — the blade has to leave the object before the object opens.
const CUT_X = SX + HALF;
const CUT_TOP = 20;
const CUT_BOT = 212;
// How long the blade takes to reach the bottom layer before anything parts.
const CUT_MS = 820;
const SLABS = [
  { k: 'inference', c: INFER_C, y: 62, label: 'INFERENCE' },
  { k: 'twin', c: TWIN_C, y: 120, label: 'TWIN' },
  { k: 'sensory', c: SENSORY_C, y: 178, label: 'SENSORY' },
];
// Beat offsets: reality settles first, then each slab lands on the one below.
const FALL_AT = { sensory: 0.55, twin: 1.0, inference: 1.45 };

// The two axes, and what each layer contributes to each. Rev B §1: both axes
// run through all three layers, share one perception pipeline, and meet in one
// world model. The unit axis carries TWO pipelines at the bottom because
// neither is sufficient alone — the camera has activity without identity, the
// badge identity without activity, and Plexus fuses them.
const SPLIT_PARTS = {
  inference: { left: 'iSAM', right: 'TARS' },
  twin: { left: 'TWIN A', right: 'TWIN B' },
  sensory: { left: 'DEVICE', right: 'VIDEO · BEACON' },
};

// REALITY, and the names of what is sensed in it.
//
// The cloud sits close under the SENSORY layer — a short hop, because that is
// the one place the platform touches the world — and a few capture lines carry
// signal up into the half that reads it. The sensor NAMES live below the cloud,
// captioning what the dots are, and each wires a short distance up into the
// cloud's underside rather than running the whole height of the diagram. Long
// wires through the middle of the dot field were the mess.
const CLOUD_Y = 250;        // the cloud's own midline, close under the stack
const CLOUD_RY = 21;
const SLAB_FOOT = 178 + SH; // where the capture lines meet the sensory layer
const REALITY_Y = 288;      // the caption

// Two lobes, one per axis, overlapping enough to still read as one world.
const LOBES = {
  patient: { cx: 100, rx: 62, n: 44 },
  unit: { cx: 182, rx: 47, n: 24 },
};

function RealityCloud({ cleave }) {
  const dots = useMemo(() => {
    const r = seeded(20260904);
    const out = [];
    Object.entries(LOBES).forEach(([axis, lobe]) => {
      const pool = SENSORS.filter((s) => s.axis === axis);
      for (let i = 0; i < lobe.n; i += 1) {
        const a = r() * Math.PI * 2;
        const rad = Math.sqrt(r());
        const s = pool[i % pool.length];
        out.push({
          id: axis + i,
          x: lobe.cx + Math.cos(a) * lobe.rx * rad,
          y: CLOUD_Y + Math.sin(a) * CLOUD_RY * rad,
          r: s.keystone ? 1.7 + r() * 0.9 : 0.9 + r() * 1.1,
          c: s.color,
          d: (r() * 3.4).toFixed(2),
        });
      }
    });
    return out;
  }, []);

  // capture: a few signals leaving the world for the half that reads them
  const hubL = cleave ? SX - SPLIT_G + HALF / 2 : SX + SW / 2;
  const hubR = cleave ? SX + HALF + SPLIT_G + HALF / 2 : SX + SW / 2;
  const capture = [
    { x: 76, hub: hubL, c: SENSORY_C, i: 0 },
    { x: 108, hub: hubL, c: SENSORY_C, i: 1 },
    { x: 140, hub: hubL, c: SENSORY_C, i: 2 },
    { x: 172, hub: hubR, c: SENSORY_C, i: 3 },
    { x: 200, hub: hubR, c: SENSORY_C, i: 4 },
  ];

  return (
    <g style={{ pointerEvents: 'none' }}>
      {capture.map((cp) => (
        <g key={cp.x}>
          <line
            x1={cp.x} y1={CLOUD_Y - CLOUD_RY - 2} x2={cp.hub} y2={SLAB_FOOT}
            stroke={cp.c} strokeWidth="0.4" opacity="0.26"
          />
          <line
            x1={cp.x} y1={CLOUD_Y - CLOUD_RY - 2} x2={cp.hub} y2={SLAB_FOOT}
            stroke={cp.c} strokeWidth="0.9" strokeLinecap="round" pathLength="1"
            style={{
              strokeDasharray: '0.18 0.82',
              animation: 'st-fire 2.8s linear ' + (cp.i * 0.42).toFixed(2) + 's infinite',
            }}
          />
        </g>
      ))}
      {dots.map((d) => (
        <circle
          key={d.id}
          cx={d.x}
          cy={d.y}
          r={d.r}
          fill={d.c}
          style={{ animation: 'st-twinkle 3.6s ease-in-out ' + d.d + 's infinite' }}
        />
      ))}
      <text
        x={138}
        y={REALITY_Y}
        textAnchor="middle"
        style={{ fontFamily: MONO, fontSize: 8.4, letterSpacing: '0.42em', fill: DIM }}
      >
        REALITY
      </text>
    </g>
  );
}

// The three faces of one slab (or one half of one), in cabinet projection.
function Faces({ x, y, w, c, on, edge }) {
  return (
    <>
      {/* top face — catches the light */}
      <polygon
        points={x + ',' + y + ' ' + (x + w) + ',' + y + ' ' + (x + w + SD) + ',' + (y - SD) + ' ' + (x + SD) + ',' + (y - SD)}
        fill={c + (on ? '5c' : '2b')}
        stroke={edge}
        strokeWidth="1.2"
        strokeLinejoin="round"
        style={{ transition: 'fill 0.35s ease, stroke 0.35s ease' }}
      />
      {/* right face — in shadow */}
      <polygon
        points={(x + w) + ',' + y + ' ' + (x + w + SD) + ',' + (y - SD) + ' ' + (x + w + SD) + ',' + (y + SH - SD) + ' ' + (x + w) + ',' + (y + SH)}
        fill={c + (on ? '3d' : '14')}
        stroke={edge}
        strokeWidth="1.2"
        strokeLinejoin="round"
        style={{ transition: 'fill 0.35s ease, stroke 0.35s ease' }}
      />
      {/* front face */}
      <rect
        x={x}
        y={y}
        width={w}
        height={SH}
        fill={c + (on ? '4d' : '26')}
        stroke={edge}
        strokeWidth="1.5"
        strokeLinejoin="round"
        style={{ transition: 'fill 0.35s ease, stroke 0.35s ease' }}
      />
    </>
  );
}

// The stack. `active` lights and slides one layer toward its panel, exactly
// as a quarter-prism leaves the cube. `split` cleaves every layer down the
// middle into its patient half and its unit half.
function MaayaStack({ active, onPick, small = false, interactive = true, split = false }) {
  const E = 26;
  // Two stages, not one. `split` starts the cut; `cleave` opens the halves
  // once the line has actually reached the bottom layer, so the separation
  // reads as a consequence of the cut rather than as a second thing that
  // happens to coincide with it.
  const [cleave, setCleave] = useState(false);
  useEffect(() => {
    if (!split) { setCleave(false); return undefined; }
    const t = setTimeout(() => setCleave(true), CUT_MS);
    return () => clearTimeout(t);
  }, [split]);
  return (
    <motion.div
      animate={{ y: [0, -7, 0] }}
      transition={{ duration: 5.2, repeat: Infinity, ease: 'easeInOut' }}
      // No drop-shadow here. A filter on this wrapper forces the whole
      // subtree to re-rasterise every frame, and with ~120 independently
      // animating cells inside it the slide could not finish its own fade-in.
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
    >
      <svg
        viewBox="-76 0 416 404"
        aria-hidden={false}
        style={{ display: 'block', width: small ? 'min(22vh, 220px)' : 'min(70vh, 690px)', overflow: 'visible' }}
      >
        <style>{`
          @keyframes st-twinkle { 0%, 100% { opacity: 0.24; } 45% { opacity: 0.95; } }
          @keyframes st-fire { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
          @keyframes st-soma { 0%, 100% { opacity: 0.35; } 45% { opacity: 1; } }
          @keyframes st-cut { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
        `}</style>

        {/* The blade takes the colour of whatever it is passing through, and
            dies out above the first slab and below the last, so it reads as a
            cut in the object rather than a rule drawn over it. Stops track the
            slab positions down CUT_TOP → CUT_BOT. */}
        <defs>
          <linearGradient id="sp-cut" gradientUnits="userSpaceOnUse" x1={CUT_X} y1={CUT_TOP} x2={CUT_X} y2={CUT_BOT}>
            <stop offset="0" stopColor={INFER_C} stopOpacity="0" />
            <stop offset="0.10" stopColor={INFER_C} stopOpacity="0.85" />
            <stop offset="0.34" stopColor={INFER_C} stopOpacity="0.85" />
            <stop offset="0.50" stopColor={TWIN_C} stopOpacity="0.85" />
            <stop offset="0.66" stopColor={SENSORY_C} stopOpacity="0.85" />
            <stop offset="0.90" stopColor={SENSORY_C} stopOpacity="0.85" />
            <stop offset="1" stopColor={SENSORY_C} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* The cut: one line down the whole stack, drawn from the top. Plain
            SVG on a CSS keyframe — framer-motion animated neither pathLength
            nor scaleY on a <line> here and it rendered at zero height, while
            this dash-offset idiom is the one the cube's sigils already run on. */}
        {split && !cleave && (
          <line
            x1={CUT_X}
            y1={CUT_TOP}
            x2={CUT_X}
            y2={CUT_BOT}
            stroke="url(#sp-cut)"
            strokeWidth="1.1"
            strokeLinecap="round"
            pathLength="1"
            style={{
              strokeDasharray: 1,
              animation: `st-cut ${CUT_MS}ms cubic-bezier(0.65, 0, 0.35, 1) forwards`,
              // screen, not source-over: the blade lightens the face it
              // crosses instead of sitting on top of it
              mixBlendMode: 'screen',
            }}
          />
        )}

        {/* the two axis headings — only once the stack has cleaved */}
        <AnimatePresence>
          {cleave && (
            <motion.g
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.5, delay: 0.3 } }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
            >
              <text
                x={SX + HALF / 2 - SPLIT_G + SD / 2}
                y="16"
                textAnchor="middle"
                style={{ fontFamily: MONO, fontSize: 8.4, letterSpacing: '0.3em', fill: MUTED }}
              >
                PATIENT
              </text>
              <text
                x={SX + HALF + HALF / 2 + SPLIT_G + SD / 2}
                y="16"
                textAnchor="middle"
                style={{ fontFamily: MONO, fontSize: 8.4, letterSpacing: '0.3em', fill: MUTED }}
              >
                UNIT
              </text>
            </motion.g>
          )}
        </AnimatePresence>

        {/* reality rises from below and settles */}
        <motion.g
          initial={{ opacity: 0, y: 84 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        >
          <RealityCloud cleave={cleave} />
        </motion.g>
        {/* then the layers fall onto it, bottom first */}
        {SLABS.map(({ k, c, y, label }) => {
          const on = active === k;
          const edge = on ? c + 'ee' : ACCENT + '99';
          const parts = SPLIT_PARTS[k];
          return (
            <motion.g
              key={k}
              initial={{ opacity: 0, y: -280 }}
              animate={{ opacity: 1, y: 0, x: on ? (SIDE[k] === 'right' ? E : -E) : 0 }}
              transition={{
                y: { type: 'spring', stiffness: 210, damping: 20, delay: FALL_AT[k] },
                opacity: { duration: 0.3, delay: FALL_AT[k] },
                x: { type: 'spring', stiffness: 260, damping: 24 },
              }}
              onClick={interactive ? () => onPick(k) : undefined}
              style={{ cursor: interactive ? 'pointer' : 'default' }}
            >
              {/* the patient half — travels left when the stack cleaves */}
              <motion.g
                animate={{ x: cleave ? -SPLIT_G : 0 }}
                transition={{ type: 'spring', stiffness: 190, damping: 22 }}
              >
                <Faces x={SX} y={y} w={cleave ? HALF : SW} c={c} on={on} edge={edge} />
                <text
                  x={SX + 10}
                  y={y + SH / 2 + 3.6}
                  style={{
                    fontFamily: MONO,
                    fontSize: 9.4,
                    letterSpacing: '0.22em',
                    fill: on ? INK : ACCENT + 'cc',
                    transition: 'fill 0.35s ease',
                    pointerEvents: 'none',
                    userSelect: 'none',
                  }}
                >
                  {label}
                </text>
                {cleave && (
                  <text
                    x={SX + HALF / 2 + SD / 2}
                    y={y - SD / 2 + 3}
                    textAnchor="middle"
                    style={{ fontFamily: MONO, fontSize: 7.4, letterSpacing: '0.16em', fill: c, pointerEvents: 'none' }}
                  >
                    {parts.left}
                  </text>
                )}
              </motion.g>

              {/* the unit half — only exists while the stack is cleaved */}
              <AnimatePresence>
                {cleave && (
                  <motion.g
                    initial={{ opacity: 0, x: 0 }}
                    animate={{ opacity: 1, x: SPLIT_G, transition: { type: 'spring', stiffness: 190, damping: 22 } }}
                    exit={{ opacity: 0, x: 0, transition: { duration: 0.25 } }}
                  >
                    <Faces x={SX + HALF} y={y} w={HALF} c={c} on={on} edge={edge} />
                    <text
                      x={SX + HALF + HALF / 2 + SD / 2}
                      y={y - SD / 2 + 3}
                      textAnchor="middle"
                      style={{ fontFamily: MONO, fontSize: 7.4, letterSpacing: '0.16em', fill: c, pointerEvents: 'none' }}
                    >
                      {parts.right}
                    </text>
                  </motion.g>
                )}
              </AnimatePresence>
            </motion.g>
          );
        })}
      </svg>

    </motion.div>
  );
}

const DEVICE_ASSETS = [
  'monitors', 'ventilators', 'pumps', 'dialysis', 'point-of-care',
  'cameras', 'microphones',
  'LIS', 'PACS', 'EMR (read and write)',
];

const WARD_ASSETS = [
  { label: 'patients',  color: '#ff6a54', shape: 'sphere' },
  { label: 'nurses',    color: '#f5a25d', shape: 'coneLow' },
  { label: 'doctors',   color: '#f2b01e', shape: 'cone' },
  { label: 'staff',     color: '#9a8f7a', shape: 'cube' },
  { label: 'beds',      color: '#12c2b0', shape: 'plate' },
  { label: 'devices',   color: '#2e86e6', shape: 'octa' },
  { label: 'inventory', color: '#8ea3b2', shape: 'crate' },
];

// One asset, standing on its own — a bordered chip rather than a word in a
// comma list, so the eye counts them instead of reading them.
function Chip({ children, color }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      border: `1px solid ${color}38`,
      background: `${color}0f`,
      borderRadius: 3,
      padding: '5px clamp(7px, 0.62vw, 10px)',
      fontFamily: MONO, fontSize: 'clamp(13.2px, 1.08vw, 16.5px)',
      letterSpacing: '0.04em', color: INK, whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

// A wrapped, centred row of chips. `items` are either plain strings or
// {label, color, shape} objects; `icon` decides which mark leads each chip.
// An optional `label` rides at the head of the same row rather than sitting on
// its own line above — two extra lines of group headings made the card
// noticeably taller for no information gained.
function ChipRow({ items, icon, color, label }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 'clamp(5px, 0.45vw, 7px)' }}>
      {label && (
        <span style={{
          fontFamily: MONO, fontSize: 'clamp(11.22px, 0.9vw, 13.86px)',
          letterSpacing: '0.26em', textTransform: 'uppercase',
          color: DIM, paddingLeft: '0.26em', marginRight: 2, whiteSpace: 'nowrap',
        }}>
          {label}
        </span>
      )}
      {items.map((it) => {
        const isGlyph = icon === 'glyph';
        const label = isGlyph ? it.label : it;
        const tint = isGlyph ? it.color : color;
        return (
          <Chip key={label} color={tint}>
            {isGlyph && <Glyph shape={it.shape} color={it.color} />}
            {icon === 'wifi' && <Wifi color={color} />}
            {label}
          </Chip>
        );
      })}
    </div>
  );
}

// ── the four cubes ────────────────────────────────────────────────────────
const CUBES = {
  tars: {
    kicker: 'hospital · operations',
    name: 'TARS',
    symbol: 'tars',
    // SAM = Sentient Agent for Medicine, so it stays all-caps in every derived
    // name. Expansions match the ones already used on the Command slide.
    expansion: 'Task Automation Reconciliation System',
    color: TARS,
    verb: 'manipulates the department',
    chips: [
      'spatial awareness', 'task orchestration', 'capacity sense',
      'transfer sense', 'autonomous attention', 'triaging',
      'staff reconciliation',
    ],
  },
  isam: {
    kicker: 'clinical · reasoning',
    name: 'iSAM',
    symbol: 'isam',
    expansion: 'intellectual · Sentient Agent for Medicine',
    color: ISAM,
    verb: 'reasons about the patient',
    chips: [
      'crash prediction', 'case-trajectory formulation', 'real-time vigilance',
      'case-progression', 'differential diagnosis',
      'clinical guidelines adherence', 'clinician reconciliation',
    ],
  },
  device: {
    kicker: 'perception · clinical',
    name: 'PLEXUS',
    symbol: 'plexus',
    edge: 'bottom',
    expansion: ['Perception Layer for Event eXtraction', 'and Unit State'],
    color: PLEXUS_RED,
    // The card is red, the instruments stay blue — a ventilator is not an
    // alarm, and blue keeps them reading as the same class of thing as the
    // sensors on the Ontology card beside it.
    chipColor: ACCENT,
    verb: 'what every instrument is measuring',
    assets: DEVICE_ASSETS,
    icon: 'wifi',
  },
  ward: {
    kicker: 'perception · spatial',
    name: 'ATLAS',
    symbol: 'atlas',
    edge: 'bottom',
    expansion: 'Actor · Time · Location · Assets · State',
    color: ATLAS_INK,
    // heading is maroon, but the object glyphs keep the scene's legend colours
    // and the sensor wifi marks stay blue alongside PLEXUS's
    chipColor: ACCENT,
    verb: 'where everything and everyone is',
    // Two groups: what does the sensing, then what gets sensed. The split
    // matters — the objects are only knowable because the sensors above them
    // are, which is the whole claim of a geo-spatial twin.
    groups: [
      { label: 'sensors', icon: 'wifi', items: ['visual', 'infrared', 'acoustic'] },
      { label: 'objects', icon: 'glyph', items: WARD_ASSETS },
    ],
  },
};

// One arm of the closed loop: a short arrow with what travels along it.
function Flow({ dir, color, label }) {
  const up = dir === 'up';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <svg width="11" height="26" viewBox="0 0 11 26" aria-hidden style={{ flex: '0 0 auto' }}>
        <path d="M5.5 25V1" stroke={color} strokeWidth="1.3" opacity="0.85" />
        <path
          d={up ? 'M1.4 5.4 5.5 1 9.6 5.4' : 'M1.4 20.6 5.5 25 9.6 20.6'}
          fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
      <span style={{ fontFamily: MONO, fontSize: 'clamp(11.22px, 0.95vw, 14.52px)', letterSpacing: '0.14em', textTransform: 'uppercase', color: MUTED, whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </div>
  );
}

// A within-floor connector, owned by the cube it leaves. It spans exactly
// FLOOR_GAP, so it always lands dead-centre on its neighbour.
function Link({ dir, color, on, delay = 0 }) {
  const horiz = dir === 'right';
  return (
    <motion.div
      aria-hidden
      initial={false}
      animate={{ opacity: on ? 1 : 0 }}
      transition={{ duration: 0.5, delay }}
      style={{
        position: 'absolute',
        ...(horiz
          ? { left: '100%', top: '50%', width: FLOOR_GAP, height: 1, transform: 'translateY(-0.5px)' }
          : { top: '100%', left: '50%', height: FLOOR_GAP, width: 1, transform: 'translateX(-0.5px)' }),
        background: `linear-gradient(${horiz ? 'to right' : 'to bottom'}, ${color}00, ${color}99 22%, ${color}99 78%, ${color}00)`,
      }}
    />
  );
}

function Cube({ k, on, ghost, delay, bare, children }) {
  const c = CUBES[k];
  return (
    <motion.div
      initial={false}
      // ghost: the frame is open but this card has not landed yet — it shows
      // as a faint vacancy so the unfold reads as slots being filled, not as
      // cards appearing from nowhere
      animate={{ opacity: on ? 1 : ghost ? 0.13 : 0, y: on ? 0 : 8 }}
      transition={{ duration: 0.6, delay, ease: 'easeOut' }}
      style={{
        position: 'relative',
        // bare: the side-intro mode — pure text beside the cube, no card
        // chrome. The full chrome returns on the whiteboard beat.
        ...(bare
          ? { padding: '0 clamp(8px, 1vw, 16px)' }
          : {
              border: `1px solid ${on ? `${c.color}44` : HAIR}`,
              // The accent edge faces AWAY from the centre: agents carry it on
              // top, perception layers on the bottom, so the heavy strokes sit
              // on the outer boundary of the whole arrangement.
              ...(c.edge === 'bottom'
                ? { borderBottom: `2px solid ${c.color}` }
                : { borderTop: `2px solid ${c.color}` }),
              background: 'linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.012))',
              padding: 'clamp(11px, 1.05vw, 18px) clamp(16px, 1.5vw, 26px)',
            }),
        transition: 'border-color 0.5s ease',
        // centred throughout — left-aligned type in a wide card left a ragged
        // column of text against empty space on the right
        textAlign: 'center',
      }}
    >
      <div style={{ fontFamily: MONO, fontSize: 'clamp(11.88px, 0.95vw, 14.52px)', letterSpacing: '0.26em', textTransform: 'uppercase', color: DIM, paddingLeft: '0.26em' }}>
        {c.kicker}
      </div>
      {/* the hand-drawn sigil, above the name it belongs to */}
      {c.symbol && (
        <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0 2px' }}>
          <AgentGlyph type={c.symbol} color={c.color} />
        </div>
      )}
      <div style={{
        fontFamily: theme.fonts.heading, fontSize: 'clamp(29.04px, 2.77vw, 44.88px)',
        letterSpacing: '0.1em', color: c.color, margin: '7px 0 0', lineHeight: 1,
        paddingLeft: '0.1em',
      }}>
        {c.name}
      </div>

      {/* What the acronym stands for, immediately under it — an unexpanded
          acronym in an investor room reads as jargon rather than a system. */}
      {c.expansion && (
        <div style={{
          fontFamily: MONO, fontSize: 'clamp(11.22px, 0.92vw, 14.52px)',
          letterSpacing: '0.13em', marginTop: 7, paddingLeft: '0.13em',
          // its agent's colour, dropped to ~70% so it reads as the same voice
          // as the name above without competing with it
          color: `${c.color}b3`,
        }}>
          {/* an array is a hand-set line break — PLEXUS's expansion widows
              "State" if the browser is left to wrap it */}
          {(Array.isArray(c.expansion) ? c.expansion : [c.expansion]).map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      )}

      {/* The descriptor sits between two rules rather than running on as a
          line of prose — it labels the card, it is not a sentence about it. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(10px, 1vw, 16px)', margin: '9px 0 11px' }}>
        <span style={{ flex: 1, height: 1, background: `linear-gradient(to right, ${HAIR}00, ${HAIR})` }} />
        <span style={{
          fontFamily: MONO, fontSize: 'clamp(11.88px, 0.98vw, 15.18px)',
          letterSpacing: '0.2em', textTransform: 'uppercase', color: MUTED,
          whiteSpace: 'nowrap', paddingLeft: '0.2em',
        }}>
          {c.verb}
        </span>
        <span style={{ flex: 1, height: 1, background: `linear-gradient(to left, ${HAIR}00, ${HAIR})` }} />
      </div>

      {/* Assets stand alone as chips, centred and wrapping to fill the card —
          a comma list reads as prose, chips read as an inventory. */}
      {c.groups
        ? c.groups.map((g, i) => (
            <div key={g.label} style={{ marginTop: i ? 'clamp(7px, 0.8vh, 11px)' : 0 }}>
              <ChipRow items={g.items} icon={g.icon} color={c.chipColor ?? c.color} label={g.label} />
            </div>
          ))
        : <ChipRow items={c.assets ?? c.chips} icon={c.icon} color={c.chipColor ?? c.color} />}
      {children}
    </motion.div>
  );
}

// TWIN A, as the bedside actually renders it: the patient held as one
// object, turning in space. Same body mesh the ICU app puts on its BODY
// SCAN panel, re-materialised in the layer’s own violet so it reads as
// the twin rather than as a picture of a person.
const BODY_URL = import.meta.env.BASE_URL + 'body.glb';

function BodyMesh({ color }) {
  const { scene } = useGLTF(BODY_URL);
  const spin = useRef(null);
  // 360 in place, slow enough to read as a scan rather than a spin
  useFrame((_, dt) => {
    if (spin.current) spin.current.rotation.y += dt * 0.55;
  });
  const body = useMemo(() => {
    const s = scene.clone(true);
    s.traverse((o) => {
      if (!o.isMesh) return;
      o.material = new MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.35,
        transparent: true,
        opacity: 0.62,
        roughness: 0.42,
        metalness: 0.08,
      });
    });
    // fit and centre from the mesh’s own bounds — the file’s scale is not
    // ours to assume, and an off-centre pivot makes the turn wobble
    const box = new Box3().setFromObject(s);
    const size = new Vector3();
    const ctr = new Vector3();
    box.getSize(size);
    box.getCenter(ctr);
    const k = 1.9 / (Math.max(size.x, size.y, size.z) || 1);
    s.scale.setScalar(k);
    s.position.set(-ctr.x * k, -ctr.y * k, -ctr.z * k);
    return s;
  }, [scene, color]);
  return (
    <group ref={spin}>
      <primitive object={body} />
    </group>
  );
}

function BodyTwin({ color }) {
  return (
    <div style={{ width: 'min(26vh, 230px)', height: 'min(30vh, 265px)' }}>
      <Canvas camera={{ position: [0, 0, 3.1], fov: 34 }} dpr={[1, 2]}>
        <ambientLight intensity={0.85} />
        <directionalLight position={[2, 3, 4]} intensity={1.15} />
        <directionalLight position={[-3, 1, -2]} intensity={0.5} color={color} />
        <Suspense fallback={null}>
          <BodyMesh color={color} />
        </Suspense>
      </Canvas>
    </div>
  );
}
useGLTF.preload(BODY_URL);

// ── the inference layer's own figure ──────────────────────────────────────
//  Two agents, one substrate. iSAM branches to the left, TARS to the right,
//  and the trunk they share runs between them in the platform's cyan — the
//  same claim the report makes in §7.1: two renderings of one state layer,
//  "neither owns the state", so they cannot disagree about what is true.
//  Pulses cross the trunk in both directions because both are reading the
//  same thing, not talking to each other.
//
//  Firing is the dash-offset idiom the cube sigils already use here, and the
//  glow is a wide low-opacity underlay rather than a CSS filter — a filter on
//  animated strokes re-rasterises every frame, which stalled this slide once.
const NF_LEFT = [
  'M74,62 C52,48 38,36 20,24',
  'M74,62 C54,55 36,51 14,47',
  'M74,62 C52,69 36,77 16,85',
  'M74,62 C58,80 50,94 40,110',
  'M74,62 C64,44 60,30 54,12',
  'M38,36 C32,30 28,24 22,12',
  'M36,77 C30,83 26,91 20,101',
];
const NF_RIGHT = [
  'M226,62 C248,48 262,36 280,24',
  'M226,62 C246,55 264,51 286,47',
  'M226,62 C248,69 264,77 284,85',
  'M226,62 C242,80 250,94 260,110',
  'M226,62 C236,44 240,30 246,12',
  'M262,36 C268,30 272,24 278,12',
  'M264,77 C270,83 274,91 280,101',
];
const NF_TRUNK = [
  'M74,62 C112,50 188,50 226,62',
  'M74,62 C112,74 188,74 226,62',
];
// junctions that flare — where a branch divides is where a synapse reads
const NF_NODES_L = [[38, 36], [36, 51], [36, 77], [50, 94], [60, 30], [20, 24]];
const NF_NODES_R = [[262, 36], [264, 51], [264, 77], [250, 94], [240, 30], [280, 24]];

function NeuronBranch({ d, c, i }) {
  return (
    <g>
      {/* the glow, baked as geometry */}
      <path d={d} fill="none" stroke={c} strokeWidth="3.4" opacity="0.09" strokeLinecap="round" />
      <path d={d} fill="none" stroke={c} strokeWidth="1.05" opacity="0.34" strokeLinecap="round" />
      <path
        d={d}
        fill="none"
        stroke={c}
        strokeWidth="1.5"
        strokeLinecap="round"
        pathLength="1"
        style={{
          strokeDasharray: '0.2 0.8',
          animation: `nf-fire ${(2.6 + i * 0.31).toFixed(2)}s linear ${(i * 0.44).toFixed(2)}s infinite`,
        }}
      />
    </g>
  );
}

function NeuronField() {
  return (
    <svg viewBox="0 0 300 140" style={{ display: 'block', width: 'min(34vh, 320px)', overflow: 'visible' }} aria-hidden>
      <style>{`
        @keyframes nf-fire { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
        @keyframes nf-node { 0%, 100% { opacity: 0.28; } 45% { opacity: 1; } }
        @keyframes nf-soma { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
      `}</style>

      {/* the shared substrate, and traffic across it in both directions */}
      {NF_TRUNK.map((d, i) => (
        <g key={d}>
          <path d={d} fill="none" stroke={ACCENT} strokeWidth="3.6" opacity="0.08" strokeLinecap="round" />
          <path d={d} fill="none" stroke={ACCENT} strokeWidth="1.1" opacity="0.4" strokeLinecap="round" />
          <path
            d={d}
            fill="none"
            stroke={ACCENT}
            strokeWidth="1.5"
            strokeLinecap="round"
            pathLength="1"
            style={{
              strokeDasharray: '0.16 0.84',
              // direction folded into the shorthand: setting animationDirection
              // alongside the animation shorthand makes React warn, and the shorthand resets
              // it anyway depending on which lands last
              animation: `nf-fire ${i ? 4.4 : 3.8}s linear ${i ? 1.1 : 0}s infinite ${i ? 'reverse' : 'normal'}`,
            }}
          />
        </g>
      ))}

      {NF_LEFT.map((d, i) => <NeuronBranch key={d} d={d} c={ISAM} i={i} />)}
      {NF_RIGHT.map((d, i) => <NeuronBranch key={d} d={d} c={TARS} i={i + 3} />)}

      {NF_NODES_L.map(([x, y], i) => (
        <circle key={'l' + i} cx={x} cy={y} r={i < 4 ? 2.3 : 1.6} fill={ISAM}
          style={{ animation: `nf-node ${(2.4 + i * 0.4).toFixed(1)}s ease-in-out ${(i * 0.37).toFixed(2)}s infinite` }} />
      ))}
      {NF_NODES_R.map(([x, y], i) => (
        <circle key={'r' + i} cx={x} cy={y} r={i < 4 ? 2.3 : 1.6} fill={TARS}
          style={{ animation: `nf-node ${(2.6 + i * 0.4).toFixed(1)}s ease-in-out ${(0.9 + i * 0.37).toFixed(2)}s infinite` }} />
      ))}

      {/* the two somas */}
      <circle cx="74" cy="62" r="9" fill={ISAM} opacity="0.13" />
      <circle cx="74" cy="62" r="4.4" fill={ISAM}
        style={{ animation: 'nf-soma 3.1s ease-in-out infinite' }} />
      <circle cx="226" cy="62" r="9" fill={TARS} opacity="0.13" />
      <circle cx="226" cy="62" r="4.4" fill={TARS}
        style={{ animation: 'nf-soma 3.6s ease-in-out 0.7s infinite' }} />

      <text x="74" y="130" textAnchor="middle"
        style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.24em', fill: ISAM }}>
        iSAM
      </text>
      <text x="226" y="130" textAnchor="middle"
        style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.24em', fill: TARS }}>
        TARS
      </text>
    </svg>
  );
}

// The side introduction — replaces the genie panel. It owns the WHOLE side
// column, top to bottom, with its content centred in that height, and it
// arrives as a cascade: kicker, sigil, name, expansion, verb, then the
// capabilities — each a beat behind the last. Exit is a fast fade so a swap
// never feels laggy.
function AgentIntroPanel({ k }) {
  // layers first: the three intros are LAYERS, the whiteboard cards are CUBES
  const c = LAYERS[k] ?? CUBES[k];
  const item = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
  };
  return (
    <motion.div
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.04 } } }}
      initial="hidden" animate="show"
      exit={{ opacity: 0, transition: { duration: 0.22 } }}
      style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        justifyContent: 'center', textAlign: 'center',
        gap: 'clamp(16px, 2.9vh, 36px)',
      }}
    >
      <motion.div variants={item} style={{ display: 'flex', justifyContent: 'center' }}>
        {k === 'twin' ? <BodyTwin color={c.color} />
          : k === 'inference' ? <NeuronField />
          : <AgentGlyph type={c.symbol} color={c.color} size={64} />}
      </motion.div>

      <motion.div variants={item} style={{
        fontFamily: theme.fonts.heading, fontSize: 'clamp(2.7rem, 4.4vw, 4.6rem)',
        letterSpacing: '0.12em', color: c.color, lineHeight: 1, paddingLeft: '0.12em',
      }}>
        {c.name}
      </motion.div>

      <motion.div variants={item} style={{
        fontFamily: MONO, fontSize: 'clamp(13px, 1.1vw, 17px)', letterSpacing: '0.3em',
        textTransform: 'uppercase', color: DIM, paddingLeft: '0.3em',
      }}>
        {c.kicker}
      </motion.div>

      {c.expansion && k !== 'inference' && (
        <motion.div variants={item} style={{
          fontFamily: MONO, fontSize: 'clamp(13.5px, 1.15vw, 18px)',
          letterSpacing: '0.13em', color: `${c.color}b3`, paddingLeft: '0.13em',
          lineHeight: 1.5,
        }}>
          {/* same hand-set break as the card renderer — an array element per
              line, so PLEXUS never widows "State" onto its own row */}
          {(Array.isArray(c.expansion) ? c.expansion : [c.expansion]).map((line) => (
            <div key={line}>{line}</div>
          ))}
        </motion.div>
      )}

      <motion.div variants={item} style={{ display: 'flex', alignItems: 'center', gap: 'clamp(10px, 1vw, 16px)' }}>
        <span style={{ flex: 1, height: 1, background: `linear-gradient(to right, ${HAIR}00, ${HAIR})` }} />
        <span style={{
          fontFamily: MONO, fontSize: 'clamp(13.5px, 1.12vw, 17.5px)',
          letterSpacing: '0.2em', textTransform: 'uppercase', color: MUTED,
          whiteSpace: 'nowrap', paddingLeft: '0.2em',
        }}>
          {c.verb}
        </span>
        <span style={{ flex: 1, height: 1, background: `linear-gradient(to left, ${HAIR}00, ${HAIR})` }} />
      </motion.div>

      <motion.div variants={item} style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(8px, 1.2vh, 14px)' }}>
        {c.groups
          ? c.groups.map((g) => (
              <ChipRow key={g.label} items={g.items} icon={g.icon} color={c.chipColor ?? c.color} label={g.label} />
            ))
          : <ChipRow items={c.assets ?? c.chips} icon={c.icon} color={c.chipColor ?? c.color} />}
      </motion.div>
    </motion.div>
  );
}

export default function SentientPlatform({ onComplete, onPrevious }) {
  const { currentSlide } = useSlideNavigation({ totalSlides: 7, onComplete, onPrevious });

  // 0 · the platform's name alone. 1 · MAAYA and the stack arrive.
  // 2-4 · the three layer intros, bottom to top. 5 · the two axes.
  // 6 · the whiteboard.
  const showMaaya = currentSlide >= 1;
  // Every layer cleaves into its patient half and its unit half. The two
  // axes were always there — the intros walked one layer at a time, and
  // this beat shows the other direction through all three at once.
  const split = currentSlide === 5;
  const diagram = currentSlide >= 6;

  // One selection, owned by whoever acted last: each beat resets it to that
  // beat's agent, and a quadrant click overrides it — clicking the open
  // quadrant again closes it (the toggle is the closing animation's trigger).
  const ORDER = [null, null, 'sensory', 'twin', 'inference', null, null]; // bottom → top
  const [sel, setSel] = useState(null);
  useEffect(() => { setSel(ORDER[Math.min(currentSlide, ORDER.length - 1)]); }, [currentSlide]);
  const pick = (k) => setSel((prev) => (prev === k ? null : k));
  const active = diagram || split ? null : sel;
  // SIDE lives at module scope now, beside SLABS — the stack itself needs it
  // to know which way a slab slides, and two copies would drift.
  // MAAYA steps to the OTHER side while the intro holds the floor, so the
  // travelling layer reaches toward its panel instead of colliding with it
  // SENSORY gets a wider berth than the others: it is the only beat that also
  // carries the device column, and the stack, that column and the panel all
  // have to clear each other across the same width.
  const shift = !diagram && active
    ? (SIDE[active] === 'right' ? (active === 'sensory' ? '-32vw' : '-23vw') : '23vw')
    : '0vw';

  return (
    <div style={{
      position: 'relative', width: '100%', height: '100vh', overflow: 'hidden',
      background: '#05090d', fontFamily: theme.fonts.body, color: INK,
    }}>
      <GridField />
      {/* the real instruments, adrift — only while SENSORY holds the floor */}
      <FloatingDevices show={active === 'sensory'} />
      {/* content sits above the drift */}

      <div style={{
        position: 'relative', zIndex: 1, width: WIDTH, margin: '0 auto', height: '100%',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        gap: 'clamp(10px, 1.6vh, 22px)', padding: 'clamp(12px, 2vh, 26px) 0',
        boxSizing: 'border-box',
      }}>

        {/* ── the opening: the platform's name alone, then MAAYA ───────── */}
        {/* One element plays both roles — hero line on the empty page, then
            it shrinks into the kicker as MAAYA arrives beneath it. `layout`
            animates the reflow instead of letting it snap. */}
        <motion.div layout animate={{ x: shift }} transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }} style={{ textAlign: 'center' }}>
          <motion.div
            layout="position"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            style={{
              fontFamily: MONO, textTransform: 'uppercase',
              color: showMaaya ? MUTED : INK,
              fontSize: showMaaya ? 'clamp(11px, 0.9vw, 14px)' : 'clamp(1.5rem, 2.9vw, 2.6rem)',
              letterSpacing: '0.34em', paddingLeft: '0.34em',
              transition: 'font-size 0.8s cubic-bezier(0.4,0,0.2,1), color 0.8s ease',
            }}
          >
            Sentient Reality Platform
          </motion.div>
          {showMaaya && (
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              style={{
                fontFamily: theme.fonts.heading, color: ACCENT, textTransform: 'uppercase',
                fontSize: 'clamp(1.7rem, 2.9vw, 2.7rem)',
                letterSpacing: '0.32em', paddingLeft: '0.32em',
                lineHeight: 1.05, marginTop: 8,
              }}
            >
              MAAYA
            </motion.div>
          )}
        </motion.div>

        {diagram ? (
          /* ── the whiteboard beat: four cards around the small cube ──── */
          <motion.div
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.65, ease: 'easeOut' }}
            style={{
              display: 'grid',
              // centre column belongs to the cube; the cards keep their
              // quadrant geography around it, exactly as on the board
              gridTemplateColumns: '1fr min(17vh, 165px) 1fr',
              columnGap: 'clamp(14px, 1.6vw, 30px)',
              rowGap: 'clamp(16px, 2.4vh, 36px)',
              alignItems: 'stretch',
            }}
          >
            <Cube k="tars" on delay={0} />
            <div style={{ gridColumn: 2, gridRow: '1 / 3', alignSelf: 'center', justifySelf: 'center', width: '100%' }}>
              <MaayaStack small interactive={false} active={null} onPick={() => {}} />
            </div>
            <Cube k="isam" on delay={0.1} />
            <Cube k="ward" on delay={0.2} />
            <Cube k="device" on delay={0.3} />
          </motion.div>
        ) : (
          <>
            {showMaaya && (
              <motion.div
                layout
                initial={{ opacity: 0, scale: 0.82 }}
                animate={{ opacity: 1, scale: 1, x: shift }}
                transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
                style={{ display: 'flex', justifyContent: 'center' }}
              >
                <MaayaStack active={active} onPick={pick} split={split} />
              </motion.div>
            )}

            {/* ── the side intros ────────────────────────────────────── */}
            {/* The panel owns the full height of its side — content centred
                in it, so it breathes into the space above and below the
                cube's midline instead of hugging a strip beside it. */}
            <AnimatePresence>
              {active && (
                <motion.div
                  key={active}
                  initial={{ opacity: 0, x: SIDE[active] === 'left' ? -30 : 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: SIDE[active] === 'left' ? -22 : 22 }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  style={{
                    position: 'absolute',
                    top: '50%', y: '-50%', height: '90%',
                    [SIDE[active]]: 'clamp(14px, 2.4vw, 52px)',
                    width: 'min(720px, 38vw)',
                    zIndex: 5,
                  }}
                >
                  <AgentIntroPanel k={active} />
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </div>
  );
}
