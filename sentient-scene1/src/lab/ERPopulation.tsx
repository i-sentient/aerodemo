import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { AdditiveBlending, CanvasTexture, RepeatWrapping, CatmullRomCurve3, Color, DoubleSide, ExtrudeGeometry, LinearFilter, MathUtils, ShaderMaterial, Shape, ShapeGeometry, SRGBColorSpace, Vector3, type BufferGeometry, type Group, type Mesh, type Object3D, type MeshBasicMaterial, type MeshStandardMaterial } from 'three'
import { BED_SLOTS } from '../scene/RoundER'
import { KIND_STYLE } from '../ontology/census'
import { makeEcgStrip } from '../icu/ontology/ecg'
import { hdrCss } from '../scene/glow'
import { tableTex, inboundAlertTex, tarsConfirmTex, tarsIdentifiedTex } from './screenTex'

// ===========================================================================
//  ER POPULATION (lab mock) — everything is an abstract REPRESENTATION, nothing
//  literal. Patients + nurses (matte mannequins), an abstract 3-tab bedside
//  console (blank glowing tabs), IV poles, and one big central command box the
//  nurses fiddle with. Judged from the nurse's inside-out POV.
//
//  Bed-local frame: head = -z (out to glass), foot = +z (in to centre).
// ===========================================================================

const SKIN = '#c3c8cf'
const BLANKET = '#e2e8ef'
const SCRUB = '#4fb2c6'
const CHROME = '#cdd3d9'
const TAB = ['#7fd7ff', '#5fe3c0', '#ffb37a'] // abstract tab tints — no content

// every bay occupied except bed 4 — the single open bay the new patient lands in
const OCCUPIED = [0, 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]

// --- simple matte figure ----------------------------------------------------
function Mannequin({ pose, color = SKIN }: { pose: 'lying' | 'standing'; color?: string }) {
  if (pose === 'lying') {
    return (
      <group>
        <mesh position={[0, 0.62, 0.15]} rotation-x={Math.PI / 2}>
          <capsuleGeometry args={[0.3, 1.05, 6, 14]} />
          <meshStandardMaterial color={BLANKET} roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.66, -0.82]}>
          <sphereGeometry args={[0.185, 20, 20]} />
          <meshStandardMaterial color={SKIN} roughness={0.7} />
        </mesh>
      </group>
    )
  }
  return (
    <group>
      <mesh position={[0, 0.92, 0]} castShadow>
        <capsuleGeometry args={[0.23, 0.92, 6, 14]} />
        <meshStandardMaterial color={color} roughness={0.72} />
      </mesh>
      <mesh position={[0, 1.63, 0]} castShadow>
        <sphereGeometry args={[0.185, 20, 20]} />
        <meshStandardMaterial color={SKIN} roughness={0.7} />
      </mesh>
    </group>
  )
}

// --- IV pole ----------------------------------------------------------------
function IVPole({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.16, 0.18, 0.06, 16]} />
        <meshStandardMaterial color="#b9c0c7" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.95, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 1.85, 12]} />
        <meshStandardMaterial color={CHROME} metalness={0.9} roughness={0.24} />
      </mesh>
      <mesh position={[0.12, 1.6, 0]}>
        <boxGeometry args={[0.13, 0.24, 0.05]} />
        <meshStandardMaterial color="#e6eef5" transparent opacity={0.85} roughness={0.4} />
      </mesh>
    </group>
  )
}

// --- abstract bedside "Switch" console: 3 blank glowing tabs, on an angled stand
function BedsideConsole() {
  return (
    <group position={[1.05, 0, 0.05]}>
      <mesh position={[0, 0.04, 0]}>
        <cylinderGeometry args={[0.2, 0.24, 0.08, 20]} />
        <meshStandardMaterial color="#b9c0c7" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.52, 0]}>
        <cylinderGeometry args={[0.045, 0.05, 1.0, 16]} />
        <meshStandardMaterial color={CHROME} metalness={0.9} roughness={0.24} />
      </mesh>
      {/* screen faces the room CENTRE (bed-local +z = toward the hub/nurse),
          NOT the patient — angled up a touch for the standing nurse */}
      <group position={[0, 1.02, 0.42]} rotation={[-0.22, 0, 0]}>
        <RoundedBox args={[1.3, 0.58, 0.07]} radius={0.05} smoothness={3}>
          <meshStandardMaterial color="#141a21" metalness={0.5} roughness={0.42} />
        </RoundedBox>
        {[-0.42, 0, 0.42].map((x, i) => (
          <mesh key={i} position={[x, 0, 0.04]}>
            <planeGeometry args={[0.36, 0.46]} />
            <meshBasicMaterial color={hdrCss(TAB[i], 1.05)} toneMapped={false} transparent opacity={0.85} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

// --- pulsing amber "inbound" alert chip, top-right of a console screen -------
function InboundChip({ step }: { step: number }) {
  const ref = useRef<Mesh>(null)
  useFrame((s) => {
    const m = ref.current?.material as MeshBasicMaterial | undefined
    // urgent pulse while alarming (<4); calm waiting pulse; livelier "transmitting" once talking to ICU (>=7)
    const speed = step < 18 ? 3 : step < 21 ? 1.4 : 0.9
    if (m) m.opacity = 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(s.clock.elapsedTime * speed))
  })
  const tex = step < 18 ? inboundAlertTex : step < 21 ? tarsConfirmTex : tarsIdentifiedTex
  return (
    <mesh ref={ref} position={[0, 0.09, 0.28]} rotation-x={-Math.PI / 2}>
      <planeGeometry args={[2.7, 0.63]} />
      <meshBasicMaterial map={tex} toneMapped={false} transparent side={DoubleSide} />
    </mesh>
  )
}

// --- central command TABLE: a box base + a big angled glowing touch-screen ---
function CommandTable({ step }: { step: number }) {
  return (
    <group>
      {/* box base */}
      <RoundedBox args={[3.5, 0.88, 2.3]} radius={0.06} smoothness={3} position={[0, 0.44, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#aeb7c1" metalness={0.5} roughness={0.35} envMapIntensity={1} />
      </RoundedBox>
      {/* angled screen top — tilts up toward the nurse on the centre side */}
      <group position={[0, 0.92, 0]} rotation-x={-0.26}>
        <RoundedBox args={[3.34, 0.07, 2.14]} radius={0.04} smoothness={3}>
          <meshStandardMaterial color="#0b1117" metalness={0.4} roughness={0.4} />
        </RoundedBox>
        {/* ward map — shown until the alert fires (step 2) */}
        {step < 12 && (
          <mesh position={[0, 0.075, 0]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[3.18, 2.0]} />
            <meshBasicMaterial map={tableTex} toneMapped={false} side={DoubleSide} />
          </mesh>
        )}
        {step >= 12 && <InboundChip step={step} />}
      </group>
    </group>
  )
}

// --- beat-1: the open bay (bed 4) pulses amber "prepping" --------------------
function InboundRing({ step }: { step: number }) {
  const ring = useRef<Mesh>(null)
  const disc = useRef<Mesh>(null)
  const red = useRef<Group>(null)
  const box = useRef<Group>(null)
  const fade = useRef(1)
  const namedAt = useRef(-1)
  useFrame((s, dt) => {
    const alerting = step < 18 // once the patient solidifies, stop pulsing → faint steady marker
    fade.current += ((alerting ? 1 : 0.18) - fade.current) * Math.min(1, dt * 2.5)
    const k = alerting ? 0.5 + 0.5 * Math.sin(s.clock.elapsedTime * 3) : 1
    const rm = ring.current?.material as MeshBasicMaterial | undefined
    if (rm) rm.opacity = fade.current * (0.42 + 0.38 * k)
    const dm = disc.current?.material as MeshBasicMaterial | undefined
    if (dm) dm.opacity = fade.current * (0.1 + 0.12 * k)

    // The retire. Naming him settles the question the ring was asking, so the
    // red marker does not fade out — it COLLAPSES to the point, and the bay is
    // re-marked green. Sequenced against PatientDot's own CLASSIFY_AT hold
    // (1.15s), which is why the whole gesture fits inside 0.89s: red retires,
    // the box blinks, and only then does his census mark classify in.
    if (step >= 21) { if (namedAt.current < 0) namedAt.current = s.clock.elapsedTime }
    else namedAt.current = -1
    const t = namedAt.current < 0 ? -1 : s.clock.elapsedTime - namedAt.current

    const c = t < 0 ? 1 : Math.max(0, 1 - t / 0.35)
    const shrink = c * c // ease-IN, so it accelerates into the point rather than easing to a stop
    if (red.current) {
      red.current.visible = shrink > 0.002
      red.current.scale.setScalar(Math.max(0.002, shrink))
    }

    // three fast blinks, then it holds as the bay's confirmed mark
    const bt = t - 0.35
    const blink = bt < 0 ? 0 : bt < 0.54 ? (Math.floor(bt / 0.09) % 2 === 0 ? 1 : 0) : 0.5
    if (box.current) {
      box.current.visible = bt >= 0
      box.current.traverse((o) => {
        const m = (o as Mesh).material as MeshBasicMaterial | undefined
        if (m) m.opacity = blink
      })
    }
  })
  const p = BED_SLOTS[4].position
  const B = 1.9, TH = 0.075 // half-extent and stroke, in metres on the floor
  const bar = (key: string, pos: [number, number, number], w: number, h: number) => (
    <mesh key={key} position={pos}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial color={hdrCss(CV_LINE, 2.2)} toneMapped={false} transparent opacity={0} depthWrite={false} />
    </mesh>
  )
  return (
    <group position={[p[0], 0.055, p[2]]} rotation-x={-Math.PI / 2}>
      <group ref={red}>
        <mesh ref={disc} position={[0, 0, -0.004]}>
          <circleGeometry args={[2.25, 64]} />
          <meshBasicMaterial color={hdrCss('#ff4d4d', 1.4)} toneMapped={false} transparent opacity={0.2} depthWrite={false} />
        </mesh>
        <mesh ref={ring}>
          <ringGeometry args={[1.7, 2.25, 64]} />
          <meshBasicMaterial color={hdrCss('#ff4d4d', 2.2)} toneMapped={false} transparent opacity={0.8} depthWrite={false} />
        </mesh>
      </group>
      {/* the bay, claimed — outline only. A fill here would read as another
          wash on a floor that already carries the census marks. */}
      <group ref={box} visible={false} position={[0, 0, 0.002]}>
        {bar('n', [0, B, 0], 2 * B + TH, TH)}
        {bar('s', [0, -B, 0], 2 * B + TH, TH)}
        {bar('w', [-B, 0, 0], TH, 2 * B + TH)}
        {bar('e', [B, 0, 0], TH, 2 * B + TH)}
      </group>
    </group>
  )
}

// --- beat-2: a soft glowing PRESENCE forms in the open bay (no body shape) ---
const GHOST = '#cbb6ff'
const GHOST_GLOW = '#9d63ff'
function GhostPresence({ step }: { step: number }) {
  const holder = useRef<Group>(null)
  const core = useRef<Mesh>(null)
  const aura = useRef<Mesh>(null)
  const glow = useRef<Mesh>(null)
  const prog = useRef(0)
  useFrame((s, dt) => {
    const dir = step >= 18 ? -1 : 1 // form in on beat 17; fade out as it solidifies on beat 18
    prog.current = Math.max(0, Math.min(1, prog.current + (dir * dt) / 1.2))
    const k = prog.current
    const breathe = 0.9 + 0.1 * Math.sin(s.clock.elapsedTime * 1.8)
    if (holder.current) holder.current.scale.setScalar((0.75 + 0.25 * k) * breathe)
    const fade = (r: Mesh | null, base: number) => {
      const m = r?.material as MeshBasicMaterial | undefined
      if (m) m.opacity = base * k
    }
    fade(core.current, 0.66)
    fade(aura.current, 0.2)
    fade(glow.current, 0.3)
  })
  const slot = BED_SLOTS[4]
  return (
    <group position={[slot.position[0], 0, slot.position[2]]} rotation-y={slot.rotationY}>
      <group ref={holder} position={[0, 1.0, 0]}>
        {/* soft glowing core */}
        <mesh ref={core} scale={[0.8, 0.72, 0.92]}>
          <sphereGeometry args={[0.5, 32, 24]} />
          <meshBasicMaterial color={hdrCss(GHOST_GLOW, 1.9)} toneMapped={false} transparent opacity={0} depthWrite={false} />
        </mesh>
        {/* fainter outer aura */}
        <mesh ref={aura} scale={[1.32, 1.16, 1.5]}>
          <sphereGeometry args={[0.5, 24, 18]} />
          <meshBasicMaterial color={hdrCss(GHOST, 1.0)} toneMapped={false} transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
      {/* soft light pooled on the bed under the presence */}
      <mesh ref={glow} position={[0, 0.5, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[1.05, 40]} />
        <meshBasicMaterial color={hdrCss(GHOST_GLOW, 1.2)} toneMapped={false} transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}

// --- beat-4: the presence SOLIDIFIES into a reclined, coloured patient -------
const GOWN = '#9cc0dd'      // soft-blue hospital gown / blanket
const SKINTONE = '#d8b28c'  // warm skin tone
function SolidPatient() {
  const grp = useRef<Group>(null)
  const prog = useRef(0)
  useFrame((_, dt) => {
    prog.current = Math.min(1, prog.current + dt / 1.0) // ~1s solidify
    const k = prog.current
    grp.current?.traverse((o) => {
      const m = (o as Mesh).material as MeshStandardMaterial | undefined
      if (m && m.transparent) m.opacity = k
    })
  })
  const slot = BED_SLOTS[4]
  return (
    <group position={slot.position} rotation-y={slot.rotationY}>
      <group ref={grp}>
        {/* raised backrest — the bed head cranked up (head end = -z) */}
        <RoundedBox args={[1.28, 0.55, 0.12]} radius={0.05} smoothness={3} position={[0, 0.92, -0.9]} rotation-x={0.5}>
          <meshStandardMaterial color="#cbd2d8" metalness={0.5} roughness={0.35} transparent opacity={0} />
        </RoundedBox>
        {/* legs under a blanket (flat, soft) */}
        <RoundedBox args={[0.8, 0.28, 1.1]} radius={0.13} smoothness={4} position={[0, 0.64, 0.5]}>
          <meshStandardMaterial color={GOWN} roughness={0.85} transparent opacity={0} />
        </RoundedBox>
        {/* torso, propped up — near-full rounding so it reads as a body, not a box */}
        <RoundedBox args={[0.74, 0.34, 0.86]} radius={0.16} smoothness={4} position={[0, 0.82, -0.32]} rotation-x={0.5}>
          <meshStandardMaterial color={GOWN} roughness={0.8} transparent opacity={0} />
        </RoundedBox>
        {/* rounded shoulders where the torso meets the head */}
        <mesh position={[0, 1.0, -0.62]} rotation-x={0.5} scale={[1, 0.6, 0.7]}>
          <sphereGeometry args={[0.34, 24, 20]} />
          <meshStandardMaterial color={GOWN} roughness={0.8} transparent opacity={0} />
        </mesh>
        {/* head, resting on the backrest */}
        <mesh position={[0, 1.28, -0.8]}>
          <sphereGeometry args={[0.22, 24, 24]} />
          <meshStandardMaterial color={SKINTONE} roughness={0.6} transparent opacity={0} />
        </mesh>
      </group>
    </group>
  )
}

// --- beat-5/6: bedside SAM console. beat 5 = "awaiting", pulsing as it thinks;
//     beat 6 = analysis lands → STEMI + admit, steady/solid -------------------
// The acquisition frame over bay 4 — an object-recognition box, drawn the way
// a camera app draws one: HAIRLINE corner ticks that snap inward and settle,
// nothing else. The heavy planes it replaces read as neon tubing; a detection
// box is a thin line, and everything else is restraint — no sweep bar, no
// pulsing, one small caption. Vertical and square to the nurse station, which
// is where this beat watches from.
const CV_LINE = '#5dffb0'
// the frame recolours as the object's status changes — the whole object
// changes state, not just its label
const CV_UNKNOWN = '#ff5f5f'
const CV_WORKING = '#ffc74a'
const CV_NAMED = '#5fe3c0'

/** The detector's tag, welded to the box's corner. A STATE MACHINE across the
 *  whole arc — the colour walk alone tells the story:
 *    SCANNING (green) → OBJECT 0.94 (green) → UNIDENTIFIED (red)
 *    → RECONCILING (amber) → CHANDRABABU · SH-2891 (blue, a record)
 *    → iSAM · ANALYSING (iSAM's green) → VERDICT COMMITTED + his name (red)
 *  Baked once each so a state change costs one texture swap. */
const TAG_H = 0.228          // every pill is the same height, in metres
const TAG_LEFT = -2.7 / 2 + 0.02 // ...and every one is pinned to the card's left edge
const cvTagTex = (label: string, bg: string, ink: string, size = 40) => {
  const H = 96, PAD = 26
  const m = document.createElement('canvas').getContext('2d')!
  const font = `700 ${size}px ui-monospace, SFMono-Regular, Menlo, monospace`
  m.font = font; m.letterSpacing = '4px'
  const W = Math.ceil(m.measureText(label).width) + PAD * 2
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H
  const x = cv.getContext('2d')!
  x.fillStyle = bg
  x.beginPath(); x.roundRect(0, 8, W, 80, 8); x.fill()
  x.fillStyle = ink
  x.font = font
  x.textAlign = 'center'; x.textBaseline = 'middle'
  x.letterSpacing = '4px'
  x.fillText(label, W / 2, 49)
  const t = new CanvasTexture(cv)
  t.colorSpace = SRGBColorSpace; t.minFilter = LinearFilter
  return { t, w: (W / H) * TAG_H }
}
const TAG_SCAN = cvTagTex('SCANNING', 'rgba(18,184,119,0.92)', '#eafff5')
const TAG_FOUND = cvTagTex('OBJECT  0.94', 'rgba(18,184,119,0.92)', '#eafff5')
const TAG_UNKNOWN = cvTagTex('UNIDENTIFIED', 'rgba(214,42,42,0.92)', '#fff2f2')
const TAG_RECON = cvTagTex('RECONCILING', 'rgba(214,150,20,0.94)', '#fff8e8')
// blue, so his record does not read as an agent — green is iSAM's alone
const TAG_NAMED = cvTagTex('CHANDRABABU · SH-2891', 'rgba(58,95,176,0.94)', '#eef3ff', 32)
// the flag has labelled the box's state since the first frame; the read is just
// the next state, so iSAM takes the flag over rather than opening a second
// headline beside it. #2FA96E is iSAM's own colour from the ICU's AGENTS table,
// and it holds through the verdict — the agent does not change identity because
// what it found is bad. The red lives in the verdict type, one line down.
const TAG_ISAM = cvTagTex('iSAM · ANALYSING', 'rgba(47,169,110,0.94)', '#eafff4', 36)
// red, and it names him in the same breath: a verdict belongs to a person, not
// to "the object in bay 4". Carrying the record up here is what lets the ID
// block downstairs go — one statement instead of two.
const TAG_READ = cvTagTex('iSAM · VERDICT COMMITTED — CHANDRABABU · SH-2891', 'rgba(198,40,40,0.94)', '#fff2f2', 30)
// and then the flag changes hands. TARS bronze — #A9744F from the ICU's AGENTS
// table — because the reasoning is finished and what happens next is somebody
// else's job. The state machine that has run this frame since the first scan
// ends by naming a DIFFERENT agent, which is the handoff made visible on the
// one surface the room is already reading.
const TAG_TARS = cvTagTex('TARS · CATH LAB ACTIVATED', 'rgba(169,116,79,0.94)', '#fff4ea', 34)

/** The box's transcript. Three acts typed into the same slot, so the object is
 *  seen to reason: it measures, then it reconciles, then it is named. Baked
 *  frame-by-frame — a per-frame fillText while the sweep and snap are running
 *  showed up as a hitch. */
const bakeTypeStrip = (
  lines: { t: string; c: string }[],
  W = 720, H = 250, step = 3,
  font = 29, centre = false, lhOverride = 0,
) => {
  // derived so the existing callers land on exactly the numbers they had: at
  // font 29 these evaluate to the old hardcoded 26 and 56
  const y0 = Math.round(font * 0.9), lh = lhOverride || Math.round(font * 1.93)
  const total = lines.reduce((n, l) => n + l.t.length, 0)
  const frames: CanvasTexture[] = []
  // `n < total + step`, NOT `n <= total`. Stepping 4 at a time through 109
  // characters lands the final frame on 108 and the last letter is never drawn
  // — every strip in this file was quietly one character short. Overshooting by
  // one step is safe: the per-line `take` below already clamps to the line
  // length, so the extra frame is simply the complete text with no caret.
  for (let n = 0; n < total + step; n += step) {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H
    const x = cv.getContext('2d')!
    x.clearRect(0, 0, W, H)
    x.textBaseline = 'middle'
    x.font = `600 ${font}px ui-monospace, SFMono-Regular, Menlo, monospace`
    x.textAlign = centre ? 'center' : 'left'
    let used = 0
    lines.forEach((line, i) => {
      const take = Math.max(0, Math.min(line.t.length, n - used))
      used += line.t.length
      if (take <= 0) return
      const txt = line.t.slice(0, take)
      const y = y0 + i * lh
      x.fillStyle = line.c
      x.fillText(txt, centre ? W / 2 : 8, y)
      if (take < line.t.length) {
        // the caret sat 4 px off the text and was as wide as a glyph, so at
        // caption scale it read as printing ON the last letter. Thinner, and
        // a full character-width clear of it.
        const tw2 = x.measureText(txt).width
        const cx = (centre ? W / 2 + tw2 / 2 : 8 + tw2) + font * 0.42
        x.fillStyle = 'rgba(18,184,119,0.8)'
        x.fillRect(cx, y - font * 0.5, Math.max(3, font * 0.16), font)
      }
    })
    const t = new CanvasTexture(cv)
    t.colorSpace = SRGBColorSpace; t.minFilter = LinearFilter
    frames.push(t)
  }
  return frames
}
const G = '#0f8a5f', R = 'rgba(214,42,42,0.95)', A = '#b07800', T = '#0d7a63'
// act 1 · what vision measured
const CV_MEASURE = bakeTypeStrip([
  { t: 'BRG 090.0   RNG 15.53 m', c: G },
  { t: 'CLASS  BIOFORM · RECUMBENT', c: G },
  { t: 'ID  ——————————', c: R },
])
// act 2 · what TARS reconciled it against — the ID line fills in last
const RECONCILE_LINES = [
  { t: '✓ bay 4 reserved · SH-2891', c: A },
  { t: '✓ ETA 00:00 09:12 · seen 09:12', c: A },
  { t: '✓ escort MEDIC-12 in bay', c: A },
  { t: '→ MATCH 0.96', c: A },
  // its OWN line, and the only one that is not a corroboration — the three
  // checks above are things the system found, this is the one thing it cannot
  // do by itself. Brighter and uppercase so it reads as the ask, not the fifth
  // item on a list. Tighter leading (48 rather than 56) is what fits five lines
  // in the space four used.
  { t: 'AWAITING NURSE CONFIRMATION', c: '#e08a00' },
]
const CV_RECONCILE = bakeTypeStrip(RECONCILE_LINES, 720, 250, 4, 29, false, 48)
// She steps off when the ASK STARTS typing, not when it finishes. Waiting for
// the full stop bought nothing — the request is already legible a character in,
// and the 0.4 s spent staring at a finished line was dead air on top of a walk
// that is itself the long part of this beat. Derived from the lines rather than
// typed in, so rewriting the text moves her cue with it.
const RECONCILE_ASK = 0.15
  + Math.floor(RECONCILE_LINES.slice(0, -1).reduce((n, l) => n + l.t.length, 0) / 4) / 14
// act 3 · named
const CV_NAMED_STRIP = bakeTypeStrip([
  { t: 'ID  CHANDRABABU · 58 M', c: T },
  { t: 'DX  probable MI · pre-hospital', c: T },
  { t: '✓ confirmed by nurse', c: T },
])


// ---------------------------------------------------------------------------
//  The card's instruments — the ICU's, not new ones. The ECG comes from the
//  same generator the ward's EcgCard draws (icu/ontology/ecg), on the same
//  deWinter payload icu/episode/scene1 sends for this patient, and the
//  confidence is set in the same 5x7 dot matrix iSAM uses for its
//  deterioration probability. Two rooms, one instrument.
// ---------------------------------------------------------------------------
const ECG_RED = '#d6262a'

/** iSAM's dot matrix, verbatim from icu/tars/chat.js. Digits only — the ICU
 *  sets the '%' in normal type beside them, and so does this. */
const DOT_DIGITS: Record<string, string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
}
const dotNumberTex = (value: string, label: string, cell = 13, color = ECG_RED) => {
  // H is sized so the plane spans the full two-trace stack beside it rather
  // than floating centred in the gap between them — the block reads as a column
  // that belongs to the traces, not as something dropped between them.
  const W = 232, H = 248, x0 = 5, y0 = 52
  const adv = 5 * cell + cell * 0.9 // the ICU's advance, so the spacing matches
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H
  const x = cv.getContext('2d')!
  value.split('').forEach((ch, ci) => (DOT_DIGITS[ch] || DOT_DIGITS['0']).forEach((row, r) =>
    row.split('').forEach((b, c) => {
      if (b !== '1') return
      x.beginPath()
      x.arc(x0 + ci * adv + c * cell + cell / 2, y0 + r * cell + cell / 2, cell * 0.34, 0, Math.PI * 2)
      x.fillStyle = color; x.fill()
    })))
  // the '%' sits on the digits' MIDDLE, not their baseline. Drawn on the
  // baseline it hung off the bottom-right of the last digit and read as a
  // subscript rather than as part of the number.
  x.textBaseline = 'middle'
  x.font = '700 38px ui-monospace, SFMono-Regular, Menlo, monospace'
  x.fillStyle = color
  x.fillText('%', x0 + value.length * adv + 8, y0 + 3.5 * cell)
  x.textBaseline = 'alphabetic'
  x.font = '600 21px ui-monospace, SFMono-Regular, Menlo, monospace'
  x.letterSpacing = '3px'
  x.fillStyle = '#5a6b74'
  x.fillText(label, x0 + 2, y0 + 7 * cell + 44)
  const t = new CanvasTexture(cv)
  t.colorSpace = SRGBColorSpace; t.minFilter = LinearFilter
  return t
}
const CONF_TEX = dotNumberTex('96', 'confidence')

/** DOOR-TO-BALLOON, counting up, in the slot the confidence just vacated.
 *
 *  That swap is the point: 96% was the number the SYSTEM was judged on, and it
 *  is settled. This is the number the HOSPITAL is judged on, and it has just
 *  started — before the patient has moved. Every interventional cardiologist in
 *  the room knows what it is and what a good one looks like.
 *
 *  Redrawn only when the displayed second changes, so it costs one fillText a
 *  second rather than one a frame — a per-frame redraw beside the sweeping scan
 *  line is exactly what hitched before. */
const CLOCK_CV = document.createElement('canvas')
CLOCK_CV.width = 232; CLOCK_CV.height = 248
const CLOCK_TEX = (() => {
  const t = new CanvasTexture(CLOCK_CV)
  t.colorSpace = SRGBColorSpace; t.minFilter = LinearFilter
  return t
})()
let clockShown = -1
const drawClock = (sec: number) => {
  if (sec === clockShown) return false
  clockShown = sec
  const x = CLOCK_CV.getContext('2d')!
  x.clearRect(0, 0, 232, 248)
  x.textAlign = 'center'; x.textBaseline = 'middle'
  x.font = '800 52px ui-monospace, SFMono-Regular, Menlo, monospace'
  x.fillStyle = '#c62828'
  const mm = String(Math.floor(sec / 60)).padStart(2, '0')
  const ss = String(sec % 60).padStart(2, '0')
  x.fillText(`${mm}:${ss}`, 116, 104)
  x.font = '600 16px ui-monospace, SFMono-Regular, Menlo, monospace'
  x.letterSpacing = '2px'
  x.fillStyle = '#5a6b74'
  x.fillText('door-to-balloon', 116, 156)
  return true
}
drawClock(0)

/** ONE heartbeat, baked wide enough to read, wrapped so it tiles. beat(t) sits
 *  exactly on baseline at both ends (P opens at 0.16, T closes by 0.64), so the
 *  seam is invisible and the whole trace scrolls by advancing offset.x — no
 *  per-frame redraw, which is what a rolling canvas would have cost. */
const ECG_BEATS = 6    // how many complexes the strip holds at once
const ECG_CROSS = 3.4  // seconds for the trace to cross it, end to end
// one unit of offset advances exactly one complex, so this works out to about
// 106 bpm — still his tachycardia, just no longer sprinting across the card
const ECG_BPS = ECG_BEATS / ECG_CROSS
const bakeLoop = (pattern: 'deWinter' | 'oldInferior', stroke: string) => {
  const W = 220, H = 140
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H
  const x = cv.getContext('2d')!
  const samples = makeEcgStrip(pattern, 1, W) // the ICU's own generator
  const mid = H * 0.62, amp = H * 0.4
  // drawn PAST both edges by wrapping the sample index. The texture tiles, and
  // a glow is drawn outside the stroke — so ending the path at x=0 and x=W
  // would clip the halo flat and print a hard seam once per heartbeat.
  const OVER = 18
  const draw = () => {
    x.beginPath()
    for (let i = -OVER; i <= W + OVER; i++) {
      const y = mid - samples[((i % W) + W) % W] * amp
      if (i === -OVER) x.moveTo(i, y); else x.lineTo(i, y)
    }
    x.stroke()
  }
  x.strokeStyle = stroke; x.lineJoin = 'round'; x.lineCap = 'round'
  x.shadowColor = stroke
  // three passes, widest and faintest first, so the halo falls off instead of
  // sitting as one flat blur — and the crisp core goes on last so the trace
  // stays a trace rather than becoming a smear
  x.lineWidth = 2.0; x.shadowBlur = 17; x.globalAlpha = 0.5; draw()
  x.lineWidth = 2.3; x.shadowBlur = 8; x.globalAlpha = 0.8; draw()
  x.lineWidth = 2.6; x.shadowBlur = 0; x.globalAlpha = 1; draw()
  const t = new CanvasTexture(cv)
  t.colorSpace = SRGBColorSpace; t.minFilter = LinearFilter
  t.wrapS = RepeatWrapping
  t.repeat.set(ECG_BEATS, 1)
  return t
}
// V3 · the acute occlusion, which is what everybody in the room is here for
const ECG_LOOP = bakeLoop('deWinter', ECG_RED)
// III · a HEALED inferior infarct, weeks old, that he never knew he had. It is
// drawn and labelled and then completely ignored — iSAM says nothing about it,
// because on this day it changes nothing. It is a different TERRITORY from the
// acute event, which is the only way both can be true on one ECG: de Winter is
// hyperacute in V2-V4 and Q waves take hours to form, so Q waves there would
// contradict it. Inferior, old, silent — and the reason the coronaries are
// three-vessel by the time the cath lab looks.
const ECG_OLD = bakeLoop('oldInferior', '#8a5a62')

/** A lead name, set beside its own strip. */
const leadTagTex = (name: string, dim = false) => {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 56
  const x = cv.getContext('2d')!
  x.font = '700 34px ui-monospace, SFMono-Regular, Menlo, monospace'
  x.textAlign = 'right'; x.textBaseline = 'middle'
  x.letterSpacing = '2px'
  x.fillStyle = dim ? 'rgba(90,107,116,0.85)' : '#5a6b74'
  x.fillText(name, 122, 30)
  const t = new CanvasTexture(cv)
  t.colorSpace = SRGBColorSpace; t.minFilter = LinearFilter
  return t
}
const TAG_V3 = leadTagTex('V3')
const TAG_III = leadTagTex('III', true)

/** What iSAM saw, set DIRECTLY UNDER the lead it saw it in.
 *
 *  A findings list floating below both strips made the reader carry a lead name
 *  across the card to match a claim to a trace. Welding each line to its own
 *  lead removes that work entirely: the claim is adjacent to its evidence, and
 *  anyone in the room can check one against the other without moving their eye.
 *
 *  Left-set, like every measurement on this frame. Only the verdict is centred,
 *  because only the verdict is a judgement.
 *
 *  The second line is why this exists at all. An agent that reads a 12-lead and
 *  reports only the territory that is screaming has not read a 12-lead — and if
 *  it silently passes over a pathological Q, it either did not look or chose not
 *  to say. Saying it also makes the POD-3 callback stronger: an agent that MISSES
 *  this and finds it later got lucky, while one that notes it, files it as
 *  irrelevant, and retrieves it against a fever three days on is doing the thing
 *  no human team does reliably — the person reading this ECG is not the person
 *  who will see that fever.
 */
// CENTRED, and on the CARD's width rather than the trace's. The apparent font
// size is bounded by the text: ~52 characters across the trace's 2.10 m caps a
// mono glyph at about 0.067 m. Letting the caption run the card's full 2.44 m
// and centring it lifts that to 0.072 m — and centred type under a centred
// trace reads as deliberate in a way a left-set line of a different width does
// not.
const CAP_W = 1560, CAP_H = 80, CAP_ASPECT = CAP_W / CAP_H
const CAP_SPAN = 2.44
const CAP_V3 = bakeTypeStrip(
  [{ t: 'V2\u2013V4   upsloping ST depression \u00b7 tall symmetric T', c: 'rgba(214,42,42,0.95)' }],
  CAP_W, CAP_H, 3, 46, true)
const CAP_III = bakeTypeStrip(
  [{ t: 'II III aVF   pathological Q \u00b7 R < 25% \u00b7 no ST shift', c: '#8a5a62' }],
  CAP_W, CAP_H, 3, 46, true)

/** The verdict — CENTRED, and the only centred type on the whole frame.
 *  Everything else here is left-set telemetry: bearings, checkmarks, ID lines,
 *  things that were measured. Centring is what separates a conclusion from a
 *  measurement, so the one line that is a judgement is set like one.
 *
 *  The pattern is deWinter, which carries NO ST elevation — it is the OMI
 *  equivalent, which is exactly why it is worth an agent catching. */
const VERDICT_TEX = (() => {
  const W = 1000, H = 212
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H
  const x = cv.getContext('2d')!
  x.textBaseline = 'middle'; x.textAlign = 'center'
  x.font = '800 50px ui-monospace, SFMono-Regular, Menlo, monospace'
  x.letterSpacing = '3px'; x.fillStyle = '#c62828'
  // OMI, not STEMI. STEMI *is* ST elevation — it is a criterion, not a
  // diagnosis — so "anterior STEMI without ST elevation" is a contradiction in
  // terms. de Winter is an acute LAD occlusion that FAILS those criteria, which
  // is precisely why it gets missed and precisely why an agent catching it is
  // worth a beat. "STEMI equivalent" stays below, in its correct role.
  x.fillText('ANTERIOR OMI · de WINTER', W / 2, 44)
  x.font = '600 27px ui-monospace, SFMono-Regular, Menlo, monospace'
  x.letterSpacing = '2px'; x.fillStyle = '#a03530'
  x.fillText('V2–V4 · LAD occlusion', W / 2, 104)
  // The plant, stated out loud and then set aside. "Incidental" is the whole
  // trick: it is true, it is unremarkable, and it is completely forgettable to
  // a room watching a man have a heart attack. On POD 3 it stops being
  // incidental, and the callback lands because iSAM said this and meant it.
  x.font = '600 24px ui-monospace, SFMono-Regular, Menlo, monospace'
  x.letterSpacing = '2px'; x.fillStyle = '#8a5a62'
  x.fillText('old inferior infarct — not acute', W / 2, 162)
  const t = new CanvasTexture(cv)
  t.colorSpace = SRGBColorSpace; t.minFilter = LinearFilter
  return t
})()

/** The acquisition box — and then the object's whole record.
 *
 *  CV opened this frame, but it is not "the CV window": it is the system's view
 *  OF THAT OBJECT, and TARS keeps writing to it as it learns. One frame carries
 *  him from unknown to named to read, which reads truer than cards appearing
 *  somewhere else — and it is why the floating analysis panel came out.
 *
 *  `stage` walks the arc:
 *    0 · detect     the box snaps shut, telemetry types, tag ends UNIDENTIFIED
 *    1 · reconcile  frame goes amber, the three corroborations type in
 *    2 · named      frame goes teal, the ID line finally fills
 *    3 · analysing  the UPPER Ls travel up and the frame becomes a card: SAM
 *                   opens the pre-hospital strip
 *    4 · read       SAM commits the verdict, the trace goes live, confidence
 *                   lands in iSAM's dot matrix
 *  null hides it entirely.
 *
 *  Only the top corners move. The bottom pair stays welded at the bed, so the
 *  card grows OUT OF the patient rather than replacing him. */
// How far the upper Ls travel. Bounded by the EMERGENCY sign on the back
// glass, whose underside sits at y 3.79 — and the card is 5.2 m from camera
// against the sign's 8.1 m, so it climbs the frame far faster per metre than
// the sign does. 0.85 puts the flag's top at 3.10 and leaves ~0.11 m of clear
// air between them on screen; 1.45 overlapped the word by 0.60 m.
const CARD_RISE = 0.85
function CVScan({ stage }: { stage: number | null }) {
  const grp = useRef<Group>(null)
  const top = useRef<Group>(null)
  const card = useRef<Group>(null)
  const scan = useRef<Mesh>(null)
  const tag = useRef<Mesh>(null)
  const type = useRef<Mesh>(null)
  const wash = useRef<Mesh>(null)
  const head = useRef<Mesh>(null)
  const capV3 = useRef<Mesh>(null)   // what it saw in V3, welded under V3
  const capIII = useRef<Mesh>(null)  // and what it saw in III, under III
  const trace = useRef<Mesh>(null)   // V3 · the acute occlusion
  const traceOld = useRef<Mesh>(null) // III · the healed one nobody looks at
  const tagV3 = useRef<Mesh>(null)
  const tagIII = useRef<Mesh>(null)
  const conf = useRef<Mesh>(null)
  const shrink = useRef(0)
  const landed = useRef(-1)
  const t0 = useRef(-1)
  const lastAct = useRef(-1)
  const rise = useRef(0)
  const W = 2.7, H = 2.0, ARM = 0.55, TH = 0.012

  useFrame((s, dt) => {
    if (!grp.current) return
    if (stage === null) { t0.current = -1; lastAct.current = -1; rise.current = 0; landed.current = -1; grp.current.visible = false; return }
    // EVERY stage gets its own clock. This used to merge 0 and 1 into one act,
    // from when both showed the same strip and the box had to keep measuring
    // straight through the beat break rather than retype what it had said. That
    // stopped being true once stage 1 became RECONCILE with a strip of its own:
    // it inherited however many seconds you had lingered on 18-19, so by the
    // time you pressed into it the type-out was already spent and the whole
    // block appeared at once. Stage 0 still spans beats 18-19 without resetting,
    // because the stage itself does not change across them.
    const act = stage
    if (act !== lastAct.current) { lastAct.current = act; t0.current = s.clock.elapsedTime }
    const t = s.clock.elapsedTime - t0.current
    grp.current.visible = true

    // the snap belongs to the FIRST act only — later acts inherit a box that is
    // already locked, and re-snapping it would read as a second detection
    const k = stage === 0 ? Math.min(1, t / 0.4) : 1
    grp.current.scale.setScalar(1.32 - 0.32 * (1 - Math.pow(1 - k, 3)))
    const fadeIn = stage === 0 ? Math.min(1, t / 0.18) : 1
    const live = 0.72 + 0.08 * Math.sin(s.clock.elapsedTime * 2)
    // the frame carries the verdict: green while measuring, red once it has to
    // admit it has no name, amber while reasoning, teal once he is his own record
    const frameCol = stage === 0
      ? (t < 3.4 ? CV_LINE : CV_UNKNOWN)
      : stage === 1 ? CV_WORKING : CV_NAMED
    grp.current.traverse((o) => {
      if (o === scan.current || o === tag.current || o === type.current || o === wash.current) return
      if (card.current && (o === card.current || o.parent === card.current)) return
      const m = (o as Mesh).material as MeshBasicMaterial | undefined
      if (!m || !m.transparent) return
      m.opacity = fadeIn * live
      m.color.set(hdrCss(frameCol, 1.5))
    })

    // THE STRETCH — clamped dt, because a mount hitch would otherwise resolve
    // the whole 1.2s ease inside a single frame and the card would just appear
    // TWO stretches, not one. Reconcile lifts it a third of the way to make
    // room for a five-line strip; iSAM's read takes it the rest. The frame
    // grows as it learns more, and the big move still belongs to the beat where
    // the box stops being a box — it is just no longer the first move.
    rise.current = MathUtils.damp(rise.current, stage >= 3 ? 1 : stage >= 1 ? 0.35 : 0, 2.6, Math.min(dt, 0.05))
    const r = rise.current * CARD_RISE
    const open = Math.min(1, Math.max(0, (rise.current - 0.45) / 0.4)) // contents trail the stretch
    if (top.current) top.current.position.y = r
    if (wash.current) {
      wash.current.scale.y = (H + r) / H
      wash.current.position.y = r / 2
    }

    // WHILE iSAM READS, the strip owns the card: centred and near full width,
    // because it is the only thing on it and the whole beat is "look at this".
    // The verdict displaces it — it steps aside into a corner to make room for
    // the conclusion it produced, which is the right hierarchy the moment there
    // IS a conclusion. Damped, so the yield is visible rather than a cut.
    // Stages 3 and 4 share a layout deliberately: the traces do NOT move when
    // the read arrives underneath them. Only the verdict displaces them.
    shrink.current = MathUtils.damp(shrink.current, stage >= 5 ? 1 : 0, 5, Math.min(dt, 0.05))
    const q = shrink.current
    // THE CUE. Nothing red exists until the strip has finished getting out of
    // the way: while it travels, iSAM is still only analysing and the flag
    // still says so. The instant it lands, that IS the beat — the flag turns
    // over, the verdict arrives, and the three red things alarm together.
    // Landing them mid-move would have thrown a verdict at a frame that was
    // still rearranging itself, and it reads as a transition, not a finding.
    if (stage >= 5 && q > 0.96) { if (landed.current < 0) landed.current = s.clock.elapsedTime }
    else landed.current = -1
    const vt = landed.current < 0 ? -1 : s.clock.elapsedTime - landed.current
    const said = vt >= 0
    // three hard blinks at the 90 ms cadence the bay's green box uses when it
    // locks, so the room has already been taught the gesture. The heading that
    // names him, the conclusion, and the confidence behind it blink as ONE
    // object — blinking part of it would read as a glitch in that part rather
    // than as the frame raising its voice.
    const vb = said && vt < 0.54 ? (Math.floor(vt / 0.09) % 2 === 0 ? 1 : 0) : 1
    // TWO leads stacked in the space one used to take: V3 above, III below,
    // each half height with a gap, and 0.24 reserved at the left for the names.
    // Splitting rather than adding keeps the whole block inside the footprint
    // that was already solved against the EMERGENCY signage behind the card.
    // He is PROPPED UP on a raised backrest — head crown at world y 1.50 and
    // 0.8 m nearer the camera than the card plane, which throws it to screen
    // centre. Anything on the card below world y 1.59 projects behind his head.
    // The usable band is 1.59 → 2.87 (the top Ls), and there was 0.40 m of dead
    // air above the top trace that nothing was using, so the whole block moved
    // up into it rather than the card growing.
    const tw = (2.34 + (1.84 - 2.34) * q) - 0.24
    // the strips take the slack that was sitting under them — 0.40 m tall while
    // reading (was 0.30) and 0.29 at the verdict (was 0.19). The texture tiles
    // six beats across a fixed width, so taller means a taller COMPLEX rather
    // than a stretched one: the waveform gets its amplitude back.
    const th = 0.889 + (0.644 - 0.889) * q
    // The TRACE sits on the card's axis, and the lead tag overhangs into the
    // left margin. Reserving that margin inside the trace's own width instead
    // pushed the waveform 0.13 right of centre — and the waveform is what the
    // eye tracks, so the whole card read as shoved over.
    //
    // At the verdict the row cannot be centred on the trace, because the
    // confidence readout sits beside it and nothing balances it on the left.
    // So it squares up a different way: the lead tag's left edge and the
    // confidence's right edge land on ±1.22, exactly the verdict's own extents,
    // and the trace is centred in the gap between them. The card reads as
    // composed even though its top row is not itself symmetric.
    const tx = -0.19 * q
    // the leads sit FURTHER apart while reading, because each one is carrying a
    // caption underneath it; once the verdict lands the captions go and they
    // close back up to make room for it
    const ty = 0.4675 + (0.66 - 0.4675) * q
    const dy2 = 0.3025 + (0.165 - 0.3025) * q
    const sh = th * 0.45   // each strip
    const dy = dy2         // and its offset from centre
    if (trace.current) { trace.current.scale.set(tw, sh, 1); trace.current.position.set(tx, ty + dy, 0.002) }
    if (traceOld.current) { traceOld.current.scale.set(tw, sh, 1); traceOld.current.position.set(tx, ty - dy, 0.002) }
    const tagX = tx - tw / 2 - 0.13
    if (tagV3.current) tagV3.current.position.set(tagX, ty + dy, 0.002)
    if (tagIII.current) tagIII.current.position.set(tagX, ty - dy, 0.002)

    // the read pass runs only while vision is still measuring
    const sT = Math.max(0, t - 0.45)
    if (scan.current) {
      const sm = scan.current.material as MeshBasicMaterial
      if (stage !== 0) { sm.opacity = 0 } else {
        const u = (sT % 2.4) / 2.4
        scan.current.position.y = (0.5 - u) * (H - 0.06)
        sm.opacity = sT <= 0 ? 0 : fadeIn * 0.85 * Math.sin(Math.PI * u)
        sm.color.set(hdrCss(frameCol, 1.9))
      }
    }
    // the selected region — a wash, never a fill: the box exists to frame the
    // patient, and a solid ground would hide the one thing the beat is about
    const wm = wash.current?.material as MeshBasicMaterial | undefined
    if (wm) wm.opacity = fadeIn * 0.12

    const tm = tag.current?.material as MeshBasicMaterial | undefined
    if (tm) {
      const flag = stage === 0
        ? (sT < 0.05 ? TAG_SCAN : t < 3.4 ? TAG_FOUND : TAG_UNKNOWN)
        : stage === 1 ? TAG_RECON : stage === 2 ? TAG_NAMED
          : stage >= 6 ? TAG_TARS
            : said ? TAG_READ : TAG_ISAM
      tm.map = flag.t
      tm.opacity = fadeIn * vb
      tm.needsUpdate = true
      // the pill grows to its own label and keeps its LEFT edge on the card's,
      // so the states read as one flag rewriting itself rather than a row of
      // differently-centred badges
      if (tag.current) {
        tag.current.scale.x = flag.w
        tag.current.position.x = TAG_LEFT + flag.w / 2
      }
    }
    const ym = type.current?.material as MeshBasicMaterial | undefined
    if (ym) {
      const strip = stage <= 0 ? CV_MEASURE : stage === 1 ? CV_RECONCILE : CV_NAMED_STRIP
      // once the card is open his ID block is settled history — hold it whole
      // rather than retyping it under the analysis
      const f = stage >= 3 ? strip.length - 1
        : Math.floor(Math.max(0, t - (stage === 0 ? 0.6 : 0.15)) * 14)
      ym.map = strip[Math.min(strip.length - 1, f)]
      // It carries his name only while the BOX is the thing establishing it.
      // Once iSAM takes the flag the flag says it — and better, with his MRN —
      // so this hands over rather than competing, fading out on the same ramp
      // that opens the card.
      const base = (stage < 3 && t < (stage === 0 ? 0.6 : 0.15) ? 0 : fadeIn)
      ym.opacity = stage >= 3 ? base * (1 - open) : base
      ym.needsUpdate = true
    }
    // it slides down onto him rather than vanishing: the flag stopped carrying
    // his name the moment iSAM took it, and a diagnosis delivered over an
    // anonymous body is exactly the thing this whole scene argues against
    // pinned just under the box's top edge and RIDING the stretch, so the strip
    // gains exactly the room the frame gains and never has to be re-tuned
    // against the patient's crown at each stage
    if (type.current) type.current.position.y = H / 2 - 0.32 + r - open * 0.55

    // --- the card's own contents, which live above the box, not in it -------
    if (card.current) card.current.visible = open > 0.01
    // the captions type while iSAM reads — V3 first, then III, so it reads as
    // working down the leads — and clear the moment it commits, freeing the air
    // the verdict takes
    const capH = CAP_SPAN / CAP_ASPECT
    const cap = (r: typeof capV3, strip: CanvasTexture[], centreY: number, delay: number) => {
      const m = r.current?.material as MeshBasicMaterial | undefined
      if (!m) return
      if (stage !== 4) { m.opacity = 0; return }
      const f = Math.floor(Math.max(0, t - delay) * 14)
      m.map = strip[Math.min(strip.length - 1, f)]
      m.opacity = t < delay ? 0 : open
      m.needsUpdate = true
      r.current!.scale.set(CAP_SPAN, capH, 1)
      r.current!.position.set(0, centreY, 0.002)
    }
    const under = (traceCentre: number) => traceCentre - sh / 2 - 0.03 - capH / 2
    cap(capV3, CAP_V3, under(ty + dy), 0.25)
    cap(capIII, CAP_III, under(ty - dy), 1.6)
    const hm = head.current?.material as MeshBasicMaterial | undefined
    if (hm) hm.opacity = said ? open * vb : 0
    const trm = trace.current?.material as MeshBasicMaterial | undefined
    if (trm) trm.opacity = open
    const tom = traceOld.current?.material as MeshBasicMaterial | undefined
    if (tom) tom.opacity = open * 0.9 // a shade back: it is not today's problem
    for (const r of [tagV3, tagIII]) {
      const m = r.current?.material as MeshBasicMaterial | undefined
      if (m) m.opacity = open
    }
    // runs from the moment the card opens and never stops. A trace that pauses
    // while it is being read is a screenshot; this one is a patient.
    if (stage >= 3) {
      const step = Math.min(dt, 0.05) * ECG_BPS
      ECG_LOOP.offset.x += step
      ECG_OLD.offset.x += step // same heart, so the two leads cannot desynchronise
    }
    const cm = conf.current?.material as MeshBasicMaterial | undefined
    if (cm) {
      // the confidence hands its slot to the clock — same place, same size, one
      // number replaced by another
      if (stage >= 6) {
        if (drawClock(Math.floor(Math.max(0, t)))) CLOCK_TEX.needsUpdate = true
        cm.map = CLOCK_TEX
      } else cm.map = CONF_TEX
      cm.opacity = said ? open * vb : 0
      cm.needsUpdate = true
    }
  })

  const tick = (key: string, pos: [number, number, number], rotZ: number, len: number) => (
    <mesh key={key} position={pos} rotation-z={rotZ}>
      <planeGeometry args={[len, TH]} />
      <meshBasicMaterial color={hdrCss(CV_LINE, 1.5)} toneMapped={false} transparent opacity={0} depthWrite={false} side={DoubleSide} />
    </mesh>
  )
  const lower: JSX.Element[] = []
  const upper: JSX.Element[] = []
  for (const sx of [1, -1]) for (const sy of [1, -1]) {
    const x = sx * (W / 2), y = sy * (H / 2)
    const into = sy > 0 ? upper : lower
    into.push(tick(`h${sx}${sy}`, [x - sx * ARM / 2, y, 0], 0, ARM))
    into.push(tick(`v${sx}${sy}`, [x, y - sy * ARM / 2, 0], Math.PI / 2, ARM))
  }
  const slot = BED_SLOTS[4]
  return (
    <group ref={grp} visible={false} position={[slot.position[0], 1.02, slot.position[2]]} rotation-y={slot.rotationY}>
      <mesh ref={wash} position={[0, 0, -0.01]}>
        <planeGeometry args={[W, H]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} transparent opacity={0} depthWrite={false} side={DoubleSide} />
      </mesh>
      {lower}
      <mesh ref={scan}>
        <planeGeometry args={[W - 0.06, 0.016]} />
        <meshBasicMaterial color={hdrCss(CV_LINE, 1.9)} toneMapped={false} transparent opacity={0} depthWrite={false} side={DoubleSide} />
      </mesh>
      {/* the transcript, INSIDE the box — upper air, clear of the body */}
      <mesh ref={type} position={[-W / 2 + 0.95, H / 2 - 0.32, 0.002]}>
        <planeGeometry args={[1.72, 0.6]} />
        <meshBasicMaterial map={CV_MEASURE[0]} toneMapped={false} transparent opacity={0} depthWrite={false} side={DoubleSide} />
      </mesh>

      {/* everything that TRAVELS: the upper corners, his flag, and the card the
          stretch opens up. One group, one y, so they cannot drift apart. */}
      <group ref={top}>
        {upper}
        {/* the tag, WELDED to the corner the way a detector draws one */}
        <mesh ref={tag} position={[0, H / 2 + 0.12, 0.002]}>
          <planeGeometry args={[1, TAG_H]} />
          <meshBasicMaterial map={TAG_SCAN.t} toneMapped={false} transparent opacity={0} depthWrite={false} side={DoubleSide} />
        </mesh>
        <group ref={card} visible={false}>
          {/* the flag says who is reading; these are what they are reading. All
              four are placed from the frame loop — see the shrink damp above. */}
          <mesh ref={tagV3} position={[-1.05, 0.44, 0.002]}>
            <planeGeometry args={[0.2, 0.0875]} />
            <meshBasicMaterial map={TAG_V3} toneMapped={false} transparent opacity={0} depthWrite={false} side={DoubleSide} />
          </mesh>
          <mesh ref={tagIII} position={[-1.05, 0.04, 0.002]}>
            <planeGeometry args={[0.2, 0.0875]} />
            <meshBasicMaterial map={TAG_III} toneMapped={false} transparent opacity={0} depthWrite={false} side={DoubleSide} />
          </mesh>
          <mesh ref={trace} position={[0.13, 0.44, 0.002]} scale={[2.1, 0.324, 1]}>
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial map={ECG_LOOP} toneMapped={false} transparent opacity={0} depthWrite={false} side={DoubleSide} />
          </mesh>
          <mesh ref={traceOld} position={[0.13, 0.04, 0.002]} scale={[2.1, 0.324, 1]}>
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial map={ECG_OLD} toneMapped={false} transparent opacity={0} depthWrite={false} side={DoubleSide} />
          </mesh>
          {/* nudged right and down off the flush-with-the-traces position. Down
              is nearly spent here: the verdict's top edge is 0.03 below this
              block, and the patient's crown is right under that. */}
          <mesh ref={conf} position={[1, 0.64, 0.002]}>
            <planeGeometry args={[0.58, 0.62]} />
            <meshBasicMaterial map={CONF_TEX} toneMapped={false} transparent opacity={0} depthWrite={false} side={DoubleSide} />
          </mesh>
          {/* each finding welded under the lead it came from — placed from the
              frame loop so it tracks its trace through the shrink */}
          <mesh ref={capV3} position={[0, 0.61, 0.002]} scale={[CAP_SPAN, 0.125, 1]}>
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial map={CAP_V3[0]} toneMapped={false} transparent opacity={0} depthWrite={false} side={DoubleSide} />
          </mesh>
          <mesh ref={capIII} position={[0, 0.1, 0.002]} scale={[CAP_SPAN, 0.125, 1]}>
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial map={CAP_III[0]} toneMapped={false} transparent opacity={0} depthWrite={false} side={DoubleSide} />
          </mesh>
          {/* and the conclusion lands under both, across the full width */}
          <mesh ref={head} position={[0, 0.04, 0.002]}>
            <planeGeometry args={[2.44, 0.517]} />
            <meshBasicMaterial map={VERDICT_TEX} toneMapped={false} transparent opacity={0} depthWrite={false} side={DoubleSide} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

// --- coverage beats 2-5: how ATLAS knows where anything is -------------------
// Two perimeters, one argument. The ceiling camera covers the ROOM: a cyan
// ring at the glass line (vision — the same #9fe8ff the CCU gave its camera
// ribbon). The badge covers the PERSON: a violet ring, 1 m radius, that
// travels with her (RTLS — ATLAS's colour). Both fade rather than switch, and
// both stand down before the inbound alert so the red ring owns the floor.
const VISION = '#2b4fd8'   // the ward camera's coverage — royal blue, blinking

// The coverage DOME — the camera's sensing volume, not just its floor
// footprint. Rim-lit and height-faded so it reads as a shell rather than a
// blue fog: a fresnel term lights the grazing silhouette (which is what makes
// a dome look like a dome from any angle) while the apex thins away, and slow
// bands climb it from the floor so the volume feels emitted rather than
// painted. Capped at 7.2 so it stays UNDER the 7.5 ceiling — a taller dome
// pokes through the roof oculus on the bird's-eye beats.
const DOME_R = 17.55
const DOME_H = 7.2
const domeMaterial = () => new ShaderMaterial({
  uniforms: {
    // lightened from the ring's royal VISION blue — at volume scale the deep
    // hue reads heavy; the shell takes a sky tint of it instead
    uColor: { value: new Color('#7fb2ff') },
    uOpacity: { value: 0 },
    uTime: { value: 0 },
    uH: { value: DOME_H },
    // the mesh is squashed (1, H/R, 1); normals must be unsquashed by the
    // INVERSE or the fresnel reads garbage near the apex
    uInvSquash: { value: DOME_R / DOME_H },
  },
  vertexShader: /* glsl */ `
    uniform float uInvSquash;
    varying vec3 vWorld; varying vec3 vNrm;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorld = wp.xyz;
      vNrm = normalize(vec3(normal.x, normal.y * uInvSquash, normal.z));
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor; uniform float uOpacity; uniform float uTime; uniform float uH;
    varying vec3 vWorld; varying vec3 vNrm;
    void main() {
      float h = clamp(vWorld.y / uH, 0.0, 1.0);
      float ground = 1.0 - smoothstep(0.0, 0.95, h);
      vec3 V = normalize(cameraPosition - vWorld);
      // CLAMPED before pow: lerped normals can push |dot| past 1, and
      // pow(negative, 2.2) is NaN — which the bloom pass smears into full
      // black frames (the orbit-beat flicker)
      float fres = pow(clamp(1.0 - abs(dot(normalize(vNrm), V)), 0.0, 1.0), 2.0);
      // latitude ripples — the ref image's concentric shells. These are
      // view-INDEPENDENT, so the dome keeps its shape from inside, where a
      // fresnel term goes quiet (you face the far wall almost square-on).
      float lat = smoothstep(0.94, 1.0, abs(sin(h * 18.0 - uTime * 0.5))) * 0.5;
      float band = fract(h * 2.4 - uTime * 0.16);
      float ripple = smoothstep(0.88, 1.0, band) * 0.3;
      float a = uOpacity * ((0.11 + 0.75 * fres) * (0.4 + 0.6 * ground) + (lat + ripple) * (0.3 + 0.7 * ground));
      gl_FragColor = vec4(uColor, clamp(a, 0.0, 1.0));
    }`,
  transparent: true, depthWrite: false, side: DoubleSide, toneMapped: false,
})


// ---------------------------------------------------------------------------
//  THE RADAR — beats 9 and 10, over the darkened ward.
//
//  Beat 9 · the face fades in: phosphor-green graticule (rings, 30° spokes,
//  bearing numerals — the sonar reference) and the sweep starts turning,
//  finding nothing.
//  Beat 10 · detection: every object RETURNS SIGNAL as the beam crosses its
//  bearing — not as its census marker, but as a radar blip: a soft green
//  deflection that blooms under the beam and decays to a phosphor afterglow.
//  The radar sees returns, not classes; classification is what the lights
//  coming back up (beat 11) is for.
// ---------------------------------------------------------------------------
const RADAR = '#3aff77'
const SCAN = { angle: 0 }   // written by the sweep, read by every blip

const radarFaceTex = (() => {
  // 2048 for the graticule so hairlines survive being stretched across 35 m
  // of floor — at 1024 a 1 px line landed ~3 cm wide and read as a painted
  // stripe. Every stroke is drawn TWICE: a wide, very faint bloom pass then
  // a hairline core, which is what gives projected light its glow instead of
  // the flat ink of a printed chart.
  // 4096: at 2048 a "hairline" still landed ~2 cm wide across 35 m of floor.
  // Doubling again buys genuinely thin lines — the single biggest thing that
  // separates a projected graticule from a painted one.
  const S = 4096, C = S / 2, R = C - 168
  const cv = document.createElement('canvas'); cv.width = cv.height = S
  const x = cv.getContext('2d')!
  x.lineCap = 'round'
  const stroke = (draw: () => void, w: number, a: number) => {
    x.save()
    x.shadowColor = 'rgba(58,255,119,.9)'; x.shadowBlur = 18
    x.strokeStyle = `rgba(58,255,119,${a})`; x.lineWidth = w
    draw(); x.stroke()
    x.restore()
  }
  const ring = (r: number) => () => { x.beginPath(); x.arc(C, C, r, 0, Math.PI * 2) }
  const spoke = (a: number) => () => {
    x.beginPath(); x.moveTo(C + Math.cos(a) * 40, C + Math.sin(a) * 40)
    x.lineTo(C + Math.cos(a) * R, C + Math.sin(a) * R)
  }
  // TEN range rings instead of four, each a third the weight — density
  // carries the instrument, not thickness
  for (let i = 1; i <= 10; i++) {
    const r = R * (i / 10)
    const major = i % 5 === 0
    stroke(ring(r), major ? 5 : 3.5, 0.05)                     // bloom halo
    stroke(ring(r), major ? 1.5 : 1, major ? 0.6 : 0.3)        // hairline core
  }
  for (let d = 0; d < 360; d += 30) {
    const a = (d / 180) * Math.PI
    const cardinal = d % 90 === 0
    stroke(spoke(a), 4, 0.05)
    stroke(spoke(a), cardinal ? 1.4 : 1, cardinal ? 0.5 : 0.24)
  }
  // fine bearing ticks every 5° around the rim — density is what makes an
  // instrument read as an instrument
  for (let d = 0; d < 360; d += 5) {
    if (d % 30 === 0) continue
    const a = (d / 180) * Math.PI
    stroke(() => {
      x.beginPath(); x.moveTo(C + Math.cos(a) * (R - 26), C + Math.sin(a) * (R - 26))
      x.lineTo(C + Math.cos(a) * R, C + Math.sin(a) * R)
    }, 1, 0.24)
  }
  x.save()
  x.shadowColor = 'rgba(58,255,119,.9)'; x.shadowBlur = 12
  x.fillStyle = 'rgba(58,255,119,.62)'
  x.font = '500 56px ui-monospace, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'
  for (let d = 0; d < 360; d += 30) {
    const a = (d / 180) * Math.PI
    x.fillText(`${d}°`, C + Math.cos(a) * (R + 78), C + Math.sin(a) * (R + 78))
  }
  x.beginPath(); x.arc(C, C, 6, 0, Math.PI * 2); x.fill()
  x.restore()
  const t = new CanvasTexture(cv)
  t.colorSpace = SRGBColorSpace; t.minFilter = LinearFilter; t.anisotropy = 16
  return t
})()

const sweepMaterial = () => new ShaderMaterial({
  uniforms: { uAngle: { value: 0 }, uOpacity: { value: 0 }, uColor: { value: new Color(RADAR) } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform float uAngle; uniform float uOpacity; uniform vec3 uColor;
    varying vec2 vUv;
    void main() {
      vec2 p = vUv * 2.0 - 1.0;
      float r = length(p);
      if (r > 1.0) discard;
      float theta = atan(p.y, p.x);
      // angular distance BEHIND the beam, 0..2π — the phosphor trail
      float d = mod(uAngle - theta, 6.2831853);
      float trail = exp(-d * 3.2);
      float beam = smoothstep(0.05, 0.0, d) * 0.9;
      float edge = smoothstep(1.0, 0.96, r);
      gl_FragColor = vec4(uColor, uOpacity * edge * (trail * 0.34 + beam));
    }`,
  transparent: true, depthWrite: false, toneMapped: false,
})

function RadarFace({ step }: { step: number }) {
  const on = step === 9
  const grp = useRef<Group>(null)
  const face = useRef<Mesh>(null)
  const fade = useRef(0)
  const sweep = useMemo(sweepMaterial, [])
  useFrame((s, dt) => {
    fade.current += ((on ? 1 : 0) - fade.current) * Math.min(1, dt * 2.2)
    if (grp.current) grp.current.visible = fade.current > 0.01
    if (on) SCAN.angle += dt * 0.95           // ~6.6 s per revolution
    sweep.uniforms.uAngle.value = SCAN.angle
    sweep.uniforms.uOpacity.value = fade.current
    const fm = face.current?.material as MeshBasicMaterial | undefined
    if (fm) fm.opacity = fade.current * 0.85
  })
  return (
    <group ref={grp} visible={false} rotation-x={-Math.PI / 2} position={[0, 0.055, 0]}>
      <mesh ref={face}>
        <planeGeometry args={[35.6, 35.6]} />
        {/* additive: the graticule ADDS light to the floor rather than
            covering it, which is the difference between a projection and a
            decal */}
        <meshBasicMaterial map={radarFaceTex} color={hdrCss(RADAR, 1.25)} toneMapped={false} transparent opacity={0} depthWrite={false} blending={AdditiveBlending} />
      </mesh>
      <mesh material={sweep} position={[0, 0, 0.02]}>
        <planeGeometry args={[33.8, 33.8]} />
      </mesh>
    </group>
  )
}

/** shared soft-dot texture — bright core, feathered halo */
const blipTex = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128
  const x = cv.getContext('2d')!
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.25, 'rgba(255,255,255,.85)')
  g.addColorStop(0.6, 'rgba(255,255,255,.22)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  x.fillStyle = g; x.fillRect(0, 0, 128, 128)
  const t = new CanvasTexture(cv)
  t.minFilter = LinearFilter
  return t
})()

/** Has the beam crossed THIS object's bearing yet, and how long ago? Shared by
 *  both return shapes so the floor dots and the glowing bodies can never
 *  disagree about when something was found. Reads world position every frame,
 *  so moving staff are caught wherever the sweep actually finds them. */
function useSweepGlow(step: number, ref: { current: Object3D | null }) {
  const struck = useRef(false)
  const wp = useRef(new Vector3())
  const glow = useRef(0)
  useFrame(() => {
    if (!ref.current || step !== 9) { struck.current = false; glow.current = 0; return }
    ref.current.getWorldPosition(wp.current)
    const theta = Math.atan2(-wp.current.z, wp.current.x)   // plane uv y is -z
    const d = ((SCAN.angle - theta) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)
    if (d < 0.1) struck.current = true
    glow.current = struck.current ? Math.max(0.3, Math.exp(-d * 1.9)) : 0
  })
  return glow
}

/** A flat return on the floor — used for things that ARE the floor plane
 *  (beds, standing staff). `y` lifts it clear of whatever it echoes off. */
function Blip({ step, size = 1.1, tone = 1, y = 0.09 }: { step: number; size?: number; tone?: number; y?: number }) {
  const ref = useRef<Mesh>(null)
  const glow = useSweepGlow(step, ref)
  useFrame(() => {
    const m = ref.current?.material as MeshBasicMaterial | undefined
    if (!ref.current || !m) return
    const g = glow.current
    ref.current.visible = g > 0.01
    m.opacity = g * tone
    ref.current.scale.setScalar(1 + 0.45 * Math.max(0, g - 0.3) * 1.5)
  })
  return (
    <mesh ref={ref} visible={false} rotation-x={-Math.PI / 2} position={[0, y, 0]}>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial map={blipTex} color={hdrCss(RADAR, 1.8)} toneMapped={false} transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}

/** A LYING PATIENT's return: the body itself lights up. A floor dot was the
 *  wrong shape here — the bed's own base is 0.44 tall, so the plane sat inside
 *  it and never showed. The silhouette glowing is also the truer picture: the
 *  radar found a person, and the person is what you see. */
// RIM ONLY. A solid additive fill over a whole body reads as a painted green
// blob — the volume saturates and the shape stops being a return and starts
// being an object that has been coloured in. A fresnel term inverts that: the
// surface is transparent where it faces you and lights along the silhouette,
// which is what a detection looks like — an outline picked out of the dark.
const blipBodyMaterial = () => new ShaderMaterial({
  uniforms: { uColor: { value: new Color(RADAR) }, uOpacity: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec3 vNrm; varying vec3 vWorld;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorld = wp.xyz; vNrm = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor; uniform float uOpacity;
    varying vec3 vNrm; varying vec3 vWorld;
    void main() {
      vec3 V = normalize(cameraPosition - vWorld);
      // clamped before pow — lerped normals can push |dot| past 1 and
      // pow(negative, x) is NaN, which the bloom pass smears to black
      // a WIDER rim (lower exponent spreads the falloff inward) plus a
      // faint core, so the body glows rather than being a hairline outline
      float rim = pow(clamp(1.0 - abs(dot(normalize(vNrm), V)), 0.0, 1.0), 1.7);
      float a = uOpacity * (rim * 1.35 + 0.055);
      if (a < 0.004) discard;
      gl_FragColor = vec4(uColor, a);
    }`,
  transparent: true, depthWrite: false, blending: AdditiveBlending,
  side: DoubleSide, toneMapped: false,
})

function BlipBody({ step }: { step: number }) {
  const grp = useRef<Group>(null)
  const glow = useSweepGlow(step, grp)
  const mat = useMemo(blipBodyMaterial, [])
  useFrame(() => {
    const g = glow.current
    if (grp.current) grp.current.visible = g > 0.01
    mat.uniforms.uOpacity.value = g * 1.9
  })
  return (
    <group ref={grp} visible={false} scale={1.04}>
      {/* the Mannequin's own lying pose, a hair proud of it */}
      <mesh material={mat} position={[0, 0.62, 0.15]} rotation-x={Math.PI / 2}>
        <capsuleGeometry args={[0.3, 1.05, 6, 14]} />
      </mesh>
      <mesh material={mat} position={[0, 0.66, -0.82]}>
        <sphereGeometry args={[0.185, 20, 20]} />
      </mesh>
    </group>
  )
}

function WardCoverage({ on }: { on: boolean }) {
  const ring = useRef<Mesh>(null)
  const disc = useRef<Mesh>(null)
  const grp = useRef<Group>(null)
  const domeRef = useRef<Mesh>(null)
  const fade = useRef(0)
  const domeMat = useMemo(domeMaterial, [])
  useFrame((s, dt) => {
    fade.current += ((on ? 1 : 0) - fade.current) * Math.min(1, dt * 2.2)
    if (grp.current) grp.current.visible = fade.current > 0.01
    // the dome breathes rather than blinks — the floor ring carries the pulse,
    // and a strobing 36 m shell would be unwatchable
    domeMat.uniforms.uTime.value = s.clock.elapsedTime
    domeMat.uniforms.uOpacity.value = fade.current * (0.8 + 0.2 * Math.sin(s.clock.elapsedTime * 1.1))
    if (domeRef.current) domeRef.current.visible = fade.current > 0.01
    // a blink, not a breath — the same 3 Hz on/off grammar as the inbound
    // alert ring, so "a system is actively marking this" reads the same way
    // both times it appears
    const k = 0.5 + 0.5 * Math.sin(s.clock.elapsedTime * 3.2)
    const rm = ring.current?.material as MeshBasicMaterial | undefined
    // floor at half: the OFF side of the blink went so light the perimeter
    // vanished between pulses
    if (rm) rm.opacity = fade.current * (0.5 + 0.5 * k)
    const dm = disc.current?.material as MeshBasicMaterial | undefined
    // a visible pool, kept light — the fill says "covered area", the hoop
    // stays the loud part
    if (dm) dm.opacity = fade.current * (0.11 + 0.07 * k)
  })
  return (
    <>
      {/* the dome lives OUTSIDE the floor group — that group is rotated flat
          onto the ground, which would lay the hemisphere on its side */}
      <mesh ref={domeRef} material={domeMat} position={[0, 0.02, 0]} scale={[1, DOME_H / DOME_R, 1]} renderOrder={5}>
        <sphereGeometry args={[DOME_R, 72, 36, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
    <group ref={grp} position={[0, 0.06, 0]} rotation-x={-Math.PI / 2}>
      <mesh ref={disc} position={[0, 0, -0.004]}>
        <circleGeometry args={[17.55, 96]} />
        <meshBasicMaterial color={hdrCss(VISION, 1.25)} toneMapped={false} transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh ref={ring}>
        <ringGeometry args={[17.1, 17.55, 128]} />
        <meshBasicMaterial color={hdrCss(VISION, 2.0)} toneMapped={false} transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
    </>
  )
}


// --- the comm badge — a Star-Trek-style delta on her chest -------------------
// Apex-up rounded triangle the size of a glucometer, worn on the left chest:
// a silver body, a dark display strip carrying her name, a speaker grille
// under it, and a mic button that glows standby-teal near the base. The RTLS
// aerial is inside the shell — there is deliberately nothing to draw for it;
// the 2 m ring on the floor is what it looks like when it works.
const makeBadgeTex = (bg: string, frame: string, nameCol: string, subCol: string, name: string, sub: string) => {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 88
  const x = cv.getContext('2d')!
  x.fillStyle = bg; x.fillRect(0, 0, 256, 88)
  x.strokeStyle = frame; x.lineWidth = 3; x.strokeRect(3, 3, 250, 82)
  x.fillStyle = nameCol; x.font = 'bold 34px ui-monospace, monospace'
  x.textAlign = 'center'; x.textBaseline = 'middle'
  x.fillText(name, 128, 33)
  x.fillStyle = subCol; x.font = 'bold 20px ui-monospace, monospace'
  x.fillText(sub, 128, 66)
  const t = new CanvasTexture(cv)
  t.colorSpace = SRGBColorSpace; t.minFilter = LinearFilter
  return t
}
const badgeTex = makeBadgeTex('#0d1319', 'rgba(93,202,165,.5)', '#5dcaa5', 'rgba(160,200,190,.75)', 'N. ADEYEMI', 'RN · ER')
// the same face gone red — the alert blink crossfades between the two
const badgeTexAlert = makeBadgeTex('#b71c1c', 'rgba(255,255,255,.65)', '#ffffff', 'rgba(255,220,220,.9)', 'N. ADEYEMI', 'RN · ER')
// the medic's face is red FULL TIME — the patient is in his truck; his badge
// has no calm state to return to until the handover
const badgeTexMedic = makeBadgeTex('#b71c1c', 'rgba(255,255,255,.65)', '#ffffff', 'rgba(255,220,220,.9)', 'MEDIC 12', 'EMS · AMB 12')

const badgeBody = (() => {
  // rounded apex-up delta, ~8 cm tall, drawn about its centroid
  const W = 0.072, H = 0.082, r = 0.012
  const sh = new Shape()
  sh.moveTo(-W / 2 + r, -H / 2)
  sh.lineTo(W / 2 - r, -H / 2)
  sh.quadraticCurveTo(W / 2, -H / 2, W / 2 - r * 0.4, -H / 2 + r)
  sh.lineTo(r * 0.5, H / 2 - r)
  sh.quadraticCurveTo(0, H / 2, -r * 0.5, H / 2 - r)
  sh.lineTo(-W / 2 + r * 0.4, -H / 2 + r)
  sh.quadraticCurveTo(-W / 2, -H / 2, -W / 2 + r, -H / 2)
  return new ExtrudeGeometry(sh, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 3 })
})()

/** The slat field, shared by the grille and its glowing 'speaking' overlay so
 *  the two can never disagree about geometry. */
const SLAT_ROWS = [-3, -2, -1, 0, 1, 2, 3]
  .map((row) => {
    const R = 0.0113, d = row * 0.0032
    const len = 2 * Math.sqrt(Math.max(0, R * R - d * d)) - 0.001
    return { d, len }
  })
  .filter((r) => r.len > 0.002)

export type BadgeMode = 'calm' | 'alert' | 'speak' | 'reply'
export function CommBadge({ mode = 'calm', face = 'nurse' }: { mode?: BadgeMode; face?: 'nurse' | 'medic' }) {
  const mic = useRef<Mesh>(null)
  const micRing = useRef<Mesh>(null)
  const alertFace = useRef<Mesh>(null)
  const speakGrp = useRef<Group>(null)
  useFrame((s) => {
    const t = s.clock.elapsedTime
    // an alarm SNAPS — a sine crossfade read as a gentle breath, which is the
    // opposite of what a red alert is. Square wave, ~2 Hz, all-on or all-off.
    const strobe = Math.sin(t * 13) > 0 ? 1 : 0
    const m = mic.current?.material as MeshBasicMaterial | undefined
    if (m) m.opacity = mode === 'alert'
      ? 0.25 + 0.75 * strobe
      : mode === 'reply' ? 1
      : 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(t * 1.4))
    const a = alertFace.current?.material as MeshBasicMaterial | undefined
    // the red display stays lit through the whole exchange — hard strobe while
    // alerting, then HELD solid red from the moment the channel opens: once
    // the case is live, both ends' displays are red as a state, not a signal.
    if (a) a.opacity = face === 'medic' ? 1
      : mode === 'alert' ? strobe
      : mode === 'speak' || mode === 'reply' ? 1 : 0
    if (alertFace.current) alertFace.current.visible = face === 'medic' || mode !== 'calm'
    // speaking: the grille's glow overlay pulses as one
    if (speakGrp.current) {
      speakGrp.current.visible = mode === 'speak'
      const k = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 9))
      speakGrp.current.traverse((o) => {
        const om = (o as Mesh).material as MeshBasicMaterial | undefined
        if (om && om.transparent) om.opacity = k
      })
    }
    // pressed: an expanding ring leaves the button, over and over
    if (micRing.current) {
      micRing.current.visible = mode === 'reply'
      const f = (t * 1.1) % 1
      micRing.current.scale.setScalar(1 + f * 1.9)
      const rm = micRing.current.material as MeshBasicMaterial
      rm.opacity = (1 - f) * 0.8
    }
  })
  // Layout reads top to bottom on the apex-up delta, sized to its taper:
  // the MIC BUTTON at the apex (the narrowest point fits a dot and nothing
  // else), the SPEAKER at the widest middle, the NAME DISPLAY across the base.
  return (
    <group>
      <mesh geometry={badgeBody}>
        <meshStandardMaterial color="#d3d9df" metalness={0.85} roughness={0.25} envMapIntensity={1.4} />
      </mesh>

      {/* mic button — at the apex: standby teal, red when alerting or pressed */}
      <mesh position={[0, 0.026, 0.0155]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.0062, 0.0062, 0.003, 16]} />
        <meshStandardMaterial color={mode === 'reply' ? '#8a2020' : '#aeb7c1'} metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh ref={mic} position={[0, 0.026, 0.0175]}>
        <circleGeometry args={[0.0038, 14]} />
        <meshBasicMaterial color={hdrCss(mode === 'alert' || mode === 'reply' ? '#ff4545' : '#5dcaa5', 1.7)} toneMapped={false} transparent opacity={0.7} />
      </mesh>
      <mesh ref={micRing} position={[0, 0.026, 0.0176]} visible={false}>
        <ringGeometry args={[0.005, 0.0062, 24]} />
        <meshBasicMaterial color={hdrCss('#ff4545', 1.8)} toneMapped={false} transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* speaker — a grille of PARALLEL DIAGONAL SLATS in a dark recess, the
          way the Savox remote-speaker reference reads: angled bars with gaps,
          not spokes. Each slat's length is the chord of the recess circle at
          its own offset, so the field fills the round opening exactly. */}
      <mesh position={[0, -0.0005, 0.0152]}>
        <circleGeometry args={[0.0125, 24]} />
        <meshStandardMaterial color="#232a31" metalness={0.3} roughness={0.7} />
      </mesh>
      {SLAT_ROWS.map(({ d, len }, i) => (
        <mesh key={i} position={[Math.SQRT1_2 * -d, -0.0005 + Math.SQRT1_2 * d, 0.0162]} rotation-z={Math.PI / 4}>
          <boxGeometry args={[len, 0.0017, 0.0009]} />
          {/* the metal itself turns red while the far end is talking — a glow
              layer alone over silver read as no change at all */}
          <meshStandardMaterial color={mode === 'speak' ? '#ff6060' : '#cdd3d9'} metalness={mode === 'speak' ? 0.4 : 0.8} roughness={0.3} />
        </mesh>
      ))}
      {/* the voice: an underglow disc + oversize glow slats, all pulsing as one */}
      <group ref={speakGrp} visible={false}>
        <mesh position={[0, -0.0005, 0.015]}>
          <circleGeometry args={[0.0128, 24]} />
          <meshBasicMaterial color={hdrCss('#ff3d3d', 1.6)} toneMapped={false} transparent opacity={0} depthWrite={false} />
        </mesh>
        {SLAT_ROWS.map(({ d, len }, i) => (
          <mesh key={i} position={[Math.SQRT1_2 * -d, -0.0005 + Math.SQRT1_2 * d, 0.0165]} rotation-z={Math.PI / 4}>
            <boxGeometry args={[len + 0.0008, 0.0024, 0.0004]} />
            <meshBasicMaterial color={hdrCss('#ff5a5a', 2.1)} toneMapped={false} transparent opacity={0} depthWrite={false} />
          </mesh>
        ))}
      </group>

      {/* name display — across the base, the widest run of the delta */}
      <mesh position={[0, -0.0255, 0.0155]}>
        <planeGeometry args={[0.046, 0.0165]} />
        <meshBasicMaterial map={badgeTex} toneMapped={false} />
      </mesh>
      <mesh ref={alertFace} position={[0, -0.0255, 0.0157]}>
        <planeGeometry args={[0.046, 0.0165]} />
        <meshBasicMaterial map={face === 'medic' ? badgeTexMedic : badgeTexAlert} toneMapped={false} transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}

// Her route OUT of the station — not through it (the straight line from her
// counter spot ran square through the island's box: the ghost walk). And not
// a dogleg either: exit-then-ONE-diagonal, with the diagonal solved against
// the counter's corner at (1.75, 3.55) for 0.4 m clearance (capsule r 0.23).
// That is why she stops at x 1.7 rather than dead centre. CatmullRom +
// getPointAt = arc-length, constant pace.
const NURSE_PATH = new CatmullRomCurve3(
  [
    new Vector3(0.7, 0, 0.85),   // her station spot, verbatim
    new Vector3(2.5, 0, 0.95),   // out along the gap, just past the counter
    new Vector3(1.7, 0, 7.0),    // one diagonal to mid-floor — she stops here
  ],
  false, 'centripetal', 0.5,
)

/** Her SECOND walk: mid-floor to bay 4, once the box has asked for her.
 *
 *  She stops OUTSIDE the inbound ring — its outer radius is 2.25 (see
 *  InboundRing), and she stands at 2.56 from the bay's centre. That is the
 *  number that keeps her clear of both things worth seeing: the ring bounds the
 *  patient, and the CV card is only ±1.35 wide, so anything beyond the ring is
 *  beyond the card too. She approaches from +x rather than from the camera's
 *  side, so she never crosses between the lens and the bed.
 *
 *  Bows outward at the midpoint so she walks a floor route rather than a
 *  ruler-straight line at the bed. */
const NURSE_TO_BED = new CatmullRomCurve3(
  [
    new Vector3(1.7, 0, 7.0),     // where the first walk left her
    new Vector3(2.9, 0, 11.2),    // out and around
    new Vector3(2.55, 0, 15.05),  // bedside, 2.56 from bay 4 — ring is 2.25
  ],
  false, 'centripetal', 0.5,
)
// facing the bed once she is there
const BEDSIDE_RY = Math.atan2(0 - 2.55, 15.3 - 15.05)



// ---------------------------------------------------------------------------
//  LEGEND MARKS — the ATLAS census vocabulary, projected onto the floor.
//  Same shapes, same colours as ontology/census.ts KIND_STYLE, so the bird's
//  eye IS the legend the ATLAS panel will show one chapter later: coral
//  circles (patients) · gold and amber triangles (doctors, nurses) · stone
//  squares (ops) · teal rects (beds). Devices are deliberately NOT marked —
//  that absence is the panel's reveal.
// ---------------------------------------------------------------------------
const outlineShape = (outer: (sh: Shape) => void, inner: (sh: Shape) => void) => {
  const sh = new Shape()
  outer(sh)
  const hole = new Shape()
  inner(hole)
  sh.holes.push(hole)
  return new ShapeGeometry(sh)
}
const triPath = (r: number) => (sh: Shape) => {
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + (i * 2 * Math.PI) / 3
    const x = Math.cos(a) * r, y = Math.sin(a) * r
    i === 0 ? sh.moveTo(x, y) : sh.lineTo(x, y)
  }
  sh.closePath()
}
const rectPath = (w: number, h: number) => (sh: Shape) => {
  const x = w / 2, y = h / 2, r = Math.min(x, y) * 0.25
  sh.moveTo(-x + r, -y); sh.lineTo(x - r, -y); sh.quadraticCurveTo(x, -y, x, -y + r)
  sh.lineTo(x, y - r); sh.quadraticCurveTo(x, y, x - r, y)
  sh.lineTo(-x + r, y); sh.quadraticCurveTo(-x, y, -x, y - r)
  sh.lineTo(-x, -y + r); sh.quadraticCurveTo(-x, -y, -x + r, -y)
}
const triScaled = (r: number, wide: number, tall: number) => (sh: Shape) => {
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + (i * 2 * Math.PI) / 3
    const x = Math.cos(a) * r * wide, y = Math.sin(a) * r * tall
    i === 0 ? sh.moveTo(x, y) : sh.lineTo(x, y)
  }
  sh.closePath()
}
const fillOf = (path: (sh: Shape) => void) =>
  new ShapeGeometry((() => { const sh = new Shape(); path(sh); return sh })())
const circlePath = (r: number) => (sh: Shape) => { sh.absarc(0, 0, r, 0, Math.PI * 2, false) }
const ringOf = (r: number, w = 0.16) => outlineShape(circlePath(r), circlePath(r - w))
const GEO = {
  // NURSE = the legend's coneLow: squat and wide. DOCTOR = its cone: tall and
  // narrow. Flattening both to one triangle made the two classes read
  // identical from the sky — the differentiation is the legend's own.
  // Strokes are FAT and every shape carries a faint fill: at altitude a thin
  // neon line is a hair, a filled patch with a heavy rim is a mark.
  tri: outlineShape(triScaled(1.4, 1.25, 0.72), triScaled(0.95, 1.25, 0.72)),
  triFill: fillOf(triScaled(1.0, 1.25, 0.72)),
  triDoc: outlineShape(triScaled(1.5, 0.72, 1.3), triScaled(1.05, 0.72, 1.3)),
  triDocFill: fillOf(triScaled(1.1, 0.72, 1.3)),
  // ops square — the smallest people-mark, so the porter never competes with
  // the clinicians for attention
  square: outlineShape(rectPath(1.12, 1.12), rectPath(0.78, 0.78)),
  squareFill: fillOf(rectPath(0.84, 0.84)),
  // bed footprint (SpokeBed base is 1.5 × 2.3)
  bed: outlineShape(rectPath(2.25, 3.15), rectPath(1.85, 2.75)),
  bedFill: fillOf(rectPath(1.91, 2.81)),
  // the LOCATE rings — a plain perimeter, drawn before any class is claimed
  ringPerson: ringOf(1.35),
  ringOps: ringOf(1.0),
  ringBed: ringOf(1.85),
} as const

/** How a mark arrives, in two acts — ATLAS's own order of operations:
 *
 *   LOCATE   (0 → 0.55s) a plain perimeter ring: something is HERE, class not
 *                        yet claimed.
 *   CLASSIFY (0.55s →)   the ring gives way and the kind-shape settles in with
 *                        a double blink — triangle, square, rect.
 *
 * Both envelopes are pure functions of "time since this mark switched on", so
 * a mark that is turned off just damps away with no choreography. */
const CLASSIFY_AT = 1.15
const doubleBlink = (t: number) =>
  t < 0.16 ? 1 : t < 0.3 ? 0 : t < 0.46 ? 1 : t < 0.6 ? 0 : 1
// the ping's opacity: full through the growth, then GONE — cut, not faded, so
// the shape lands into an empty floor rather than through a dissolving ring
const ringEnv = (t: number) =>
  t < 0.06 ? t / 0.06 : t < CLASSIFY_AT ? 1 : 0
// ...and its scale: from a point at the subject's feet out to full radius.
// The locate ping GROWS — a ring that simply appears at its final size reads
// as a decal; one that expands from the centre reads as an emission.
const ringGrow = (t: number) => {
  const k = Math.min(1, Math.max(0, t / 0.52))   // growth time, not tied to the hold
  return 0.04 + 0.96 * (1 - Math.pow(1 - k, 3))   // ease-out cubic
}

function LegendMark({ on, geo, fillGeo, ringGeo, color, pool = false, y = 0.065, rotZ = 0 }: {
  on: boolean; geo: BufferGeometry; fillGeo?: BufferGeometry; ringGeo?: BufferGeometry
  color: string; pool?: boolean; y?: number; rotZ?: number
}) {
  const line = useRef<Mesh>(null)
  const fill = useRef<Mesh>(null)
  const ring = useRef<Mesh>(null)
  const fade = useRef(0)
  const poolFade = useRef(0)
  const onT = useRef(-1)
  useFrame((s, dt) => {
    if (on && onT.current < 0) onT.current = s.clock.elapsedTime
    if (!on) onT.current = -1
    // 999 when off, so both envelopes read "long settled" and the mark simply
    // damps away instead of replaying its arrival backwards
    const t = onT.current >= 0 ? s.clock.elapsedTime - onT.current : 999
    fade.current += ((on ? 1 : 0) - fade.current) * Math.min(1, dt * 8)
    const classify = t < CLASSIFY_AT ? 0 : doubleBlink(t - CLASSIFY_AT)
    poolFade.current += (((on && pool) ? 1 : 0) - poolFade.current) * Math.min(1, dt * 2.4)
    const pulse = 0.5 + 0.5 * Math.sin(s.clock.elapsedTime * 2.2)
    const rm = ring.current?.material as MeshBasicMaterial | undefined
    const re = ringEnv(t)
    if (rm) rm.opacity = fade.current * re * (0.7 + 0.3 * pulse)
    if (ring.current) {
      ring.current.visible = fade.current > 0.01 && re > 0.01
      ring.current.scale.setScalar(ringGrow(t))
    }
    const lm = line.current?.material as MeshBasicMaterial | undefined
    if (lm) lm.opacity = fade.current * classify * (0.7 + 0.3 * pulse)
    if (line.current) line.current.visible = fade.current > 0.01 && classify > 0.01
    const fm = fill.current?.material as MeshBasicMaterial | undefined
    // every mark keeps a quiet fill (the patch); the pool beat pours more in
    if (fm) fm.opacity = classify * Math.min(1, fade.current * (0.14 + 0.06 * pulse) + poolFade.current * (0.12 + 0.1 * pulse))
    if (fill.current) fill.current.visible = classify > 0.01 && (fade.current > 0.01 || poolFade.current > 0.01)
  })
  return (
    <group position={[0, y, 0]} rotation={[-Math.PI / 2, 0, rotZ]}>
      {ringGeo && (
        <mesh ref={ring} geometry={ringGeo} position={[0, 0, 0.0015]}>
          <meshBasicMaterial color={hdrCss(color, 2.3)} toneMapped={false} transparent opacity={0} depthWrite={false} side={DoubleSide} />
        </mesh>
      )}
      {fillGeo && (
        <mesh ref={fill} geometry={fillGeo}>
          <meshBasicMaterial color={hdrCss(color, 1.3)} toneMapped={false} transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
      <mesh ref={line} geometry={geo} position={[0, 0, 0.001]}>
        <meshBasicMaterial color={hdrCss(color, 2.3)} toneMapped={false} transparent opacity={0} depthWrite={false} side={DoubleSide} />
      </mesh>
    </group>
  )
}

/** A filled census dot — the patients, lying in their beds. */
function PatientDot({ on }: { on: boolean }) {
  const ref = useRef<Mesh>(null)
  const fade = useRef(0)
  const onT = useRef(-1)
  useFrame((s, dt) => {
    if (on && onT.current < 0) onT.current = s.clock.elapsedTime
    if (!on) onT.current = -1
    const t = onT.current >= 0 ? s.clock.elapsedTime - onT.current : 999
    fade.current += ((on ? 1 : 0) - fade.current) * Math.min(1, dt * 8)
    // same two acts as the shapes — the bed's ring locates, this classifies
    if (on) fade.current *= t < CLASSIFY_AT ? 0 : doubleBlink(t - CLASSIFY_AT)
    const m = ref.current?.material as MeshBasicMaterial | undefined
    if (m) m.opacity = fade.current * (0.75 + 0.25 * (0.5 + 0.5 * Math.sin(s.clock.elapsedTime * 2.2)))
    if (ref.current) ref.current.visible = fade.current > 0.01
  })
  return (
    <mesh ref={ref} position={[0, 1.05, 0]} rotation-x={-Math.PI / 2}>
      <circleGeometry args={[0.3, 24]} />
      <meshBasicMaterial color={hdrCss(KIND_STYLE.patient.color, 2.2)} toneMapped={false} transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}

/** The nurse hero framing — exported so the lab's SHOTS list and her walk cue
 *  read the same numbers and cannot drift apart. */
export const NURSE_HERO = {
  pos: [0.66, 1.83, 9.93] as [number, number, number],
  look: [1.68, 1.2, 7.0] as [number, number, number],
}
const NURSE_HERO_POS = new Vector3(...NURSE_HERO.pos)
// her rest heading: chest (the badge is her front) toward the badge camera
const REST_RY = Math.atan2(1.27 - 1.7, 7.58 - 7.0)

/** A staffed blob: the Mannequin plus the cheapest possible uniform — a white
 *  cap for nurses, tie + stethoscope over whites for doctors, khaki for the
 *  porter. Enough to read class from the bird's eye without character art. */
function StaffFigure({ kind }: { kind: 'nurse' | 'doctor' | 'ops' }) {
  const color = kind === 'doctor' ? '#e8ecf0' : kind === 'ops' ? '#b8a069' : SCRUB
  return (
    <group>
      <Mannequin pose="standing" color={color} />
      {kind === 'nurse' && (
        <mesh position={[0, 1.79, 0]}>
          <cylinderGeometry args={[0.125, 0.15, 0.07, 16]} />
          <meshStandardMaterial color="#f6f9fc" roughness={0.55} />
        </mesh>
      )}
      {kind === 'doctor' && (
        <>
          {/* Everything here is placed AGAINST the capsule's r=0.23 surface —
              the first pass put the tie at z 0.205 and the steth ring at
              r 0.15, both INSIDE the body, which is why neither showed. */}
          {/* tie: knot at the collar, blade down the chest, both a few mm proud */}
          <mesh position={[0, 1.345, 0.236]}>
            <boxGeometry args={[0.055, 0.05, 0.02]} />
            <meshStandardMaterial color="#27354a" roughness={0.7} />
          </mesh>
          <mesh position={[0, 1.19, 0.24]} rotation-x={-0.06}>
            <boxGeometry args={[0.06, 0.28, 0.016]} />
            <meshStandardMaterial color="#27354a" roughness={0.7} />
          </mesh>
          {/* stethoscope: a near-horizontal arc AROUND the neck — major radius
              0.265 clears the shoulder dome (0.219 at this height), open at
              the back, tilted so the front droops onto the chest */}
          <mesh position={[0, 1.45, 0.02]} rotation={[1.35, 0, Math.PI]}>
            <torusGeometry args={[0.265, 0.016, 10, 28, Math.PI * 1.3]} />
            <meshStandardMaterial color="#3a4148" metalness={0.6} roughness={0.4} />
          </mesh>
          {/* the chest piece, hanging where the arc's front ends */}
          <mesh position={[0.09, 1.16, 0.245]} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.028, 0.028, 0.012, 16]} />
            <meshStandardMaterial color="#565e66" metalness={0.75} roughness={0.3} />
          </mesh>
        </>
      )}
    </group>
  )
}

function WalkingNurse({ step, onArrived }: { step: number; onArrived?: () => void }) {
  const grp = useRef<Group>(null)
  const prog = useRef(0)
  const heading = useRef(0)
  // She does NOT step off the moment the beat flips — the camera is still
  // flying down from the bird's eye, and by the time it landed she was already
  // there. The walk is cued off the CAMERA: once it is within 2.2 m of the
  // hero framing (~95% composed, final settle still gliding) she starts, so
  // the audience watches the whole walk. Latched — orbiting afterwards can't
  // un-start her — with a 5 s fallback so she never stalls if the camera is
  // parked somewhere else in orbit mode.
  const armed = useRef(false)
  const waited = useRef(0)
  // the second walk — armed by the card, not by the beat
  const bedT0 = useRef(-1)
  const bedProg = useRef(0)
  const told = useRef(false)
  const arrivedRef = useRef(onArrived)
  arrivedRef.current = onArrived
  // The story chapter MOUNTS mid-strip (beat 12), after her walk has already
  // "happened" in chapter 1 — she must be standing at her spot from the first
  // frame, not replaying the walk. Seeded once, at mount.
  const seeded = useRef(false)
  if (!seeded.current) {
    seeded.current = true
    if (step >= 6) { armed.current = true; prog.current = 1; heading.current = REST_RY }
  }
  useFrame((s, dt) => {
    if (step >= 5 && !armed.current) {
      waited.current += dt
      if (s.camera.position.distanceTo(NURSE_HERO_POS) < 2.2 || waited.current > 5) armed.current = true
    }
    if (armed.current && step >= 5) prog.current = Math.min(1, prog.current + dt / 6)

    // THE CARD CALLS HER. It types "awaiting nurse" and then one arrives —
    // which is the whole point of the line. Cued off the strip finishing rather
    // than off the beat starting, so the request and the answer are in order.
    // Latched: pressing on mid-walk carries her through instead of resetting.
    if (step >= 20) {
      if (bedT0.current < 0) bedT0.current = s.clock.elapsedTime
      if (s.clock.elapsedTime - bedT0.current > RECONCILE_ASK) {
        // 3.6 s over ~8.4 m — 2.3 m/s, which is hurrying rather than strolling.
        // Right for the beat: the box has just told the room it is waiting on
        // her, and the whole beat is held open until she gets there.
        bedProg.current = Math.min(1, bedProg.current + dt / 3.6)
        // she reaching the bed IS the cue to move on — the beat was only ever
        // waiting for her, so it should not also wait for a keypress
        if (bedProg.current >= 1 && !told.current) { told.current = true; arrivedRef.current?.() }
      }
    } else { bedT0.current = -1; bedProg.current = 0; told.current = false }

    const onSecond = bedProg.current > 0
    const t = onSecond ? bedProg.current : prog.current
    const e = t * t * (3 - 2 * t)
    const u = Math.min(0.999, Math.max(0.001, e))
    const curve = onSecond ? NURSE_TO_BED : NURSE_PATH
    const pos = curve.getPointAt(u)
    const walking = (onSecond || step >= 4) && t < 1
    const bob = walking ? Math.abs(Math.sin(s.clock.elapsedTime * 5.2)) * 0.035 : 0
    if (grp.current) grp.current.position.set(pos.x, bob, pos.z)
    // face where she is going while she walks; at rest she settles facing the
    // badge camera, and at the bedside she turns to the patient — one rest
    // heading per destination, so there is no separate turn to choreograph
    const tan = curve.getTangentAt(u)
    const want = walking ? Math.atan2(tan.x, tan.z) : onSecond ? BEDSIDE_RY : REST_RY
    heading.current = MathUtils.damp(heading.current, want, 4, dt)
    if (grp.current) grp.current.rotation.y = heading.current
  })
  return (
    <group ref={grp}>
      <StaffFigure kind="nurse" />
      {/* the badge rides her left chest, tilted onto the capsule's curve;
          she walks +z, so +z is the face the hero shot reads */}
      <group position={[-0.075, 1.24, 0.215]} rotation={[-0.18, 0, 0]} scale={1.6}>
        {/* the radio exchange plays on the SCREEN'S badge HUD (RoundERLab),
            not at the chest — the camera never leaves the bird's eye for it */}
        <CommBadge />
      </group>
      <LegendMark on={(step >= 7 && step <= 8) || (step >= 10 && step <= 14)} pool={step === 7} geo={GEO.tri} fillGeo={GEO.triFill} ringGeo={GEO.ringPerson} color={KIND_STYLE.nurse.color} />
      <Blip step={step} />
    </group>
  )
}


// --- the ward at work: five roamers, bed to bed ------------------------------
// During the bed-hero beat the ward is ALIVE: two bedside nurses, two doctors
// and the porter walk their own zones — leg to a bed's foot, pause there as if
// working, move on. Deterministic (fixed waypoints, fixed speeds), so every
// run of the presentation is the same run. On the next beat they FREEZE where
// they stand — the held frame is the snapshot the census reads — and their
// legend marks later light wherever the freeze caught them.
const FOOT = (i: number): [number, number] => {
  const a = (i / 16) * Math.PI * 2
  return [Math.cos(a) * 13.2, Math.sin(a) * 13.2]
}
type RoamerDef = { kind: 'nurse' | 'doctor' | 'ops'; pts: [number, number][]; speed: number; pauses: number[] }
// Each roamer walks an IRREGULAR loop — short bed-to-bed hops mixed with long
// diagonals across the open floor (every leg verified against the island's
// two counters, same margin maths as the hero path). Loops are different
// lengths with different pause tables, so the five drift out of phase and the
// ward reads as random — while staying deterministic: every run is the same.
const ROAMERS: RoamerDef[] = [
  // east-side nurse: works 1-2-3, then a long run down the east flank
  { kind: 'nurse', speed: 1.15, pauses: [1.4, 2.1, 1.0, 2.6, 1.2],
    pts: [FOOT(1), FOOT(2), FOOT(3), FOOT(14), FOOT(15)] },
  // west-side nurse: 7-9, then the west flank vertical
  { kind: 'nurse', speed: 1.05, pauses: [1.8, 1.1, 2.3, 1.5],
    pts: [FOOT(7), FOOT(9), FOOT(10), FOOT(6)] },
  // doctor on southern rounds, dipping toward mid-floor between bays
  { kind: 'doctor', speed: 0.9, pauses: [2.4, 1.3, 0.9, 2.0, 1.6],
    pts: [FOOT(11), FOOT(12), [0, -7.5], FOOT(13), FOOT(12)] },
  // doctor on northern rounds with a mid-floor consult stop
  { kind: 'doctor', speed: 0.95, pauses: [2.1, 1.4, 1.9, 1.1],
    pts: [FOOT(0), FOOT(1), FOOT(2), [8, 4]] },
  // the porter hauls ACROSS the ward — down the west lane, round the south,
  // and one full diagonal back that passes clear south of the island
  { kind: 'ops', speed: 1.25, pauses: [1.0, 0.8, 1.5, 1.1, 0.7, 1.8],
    pts: [FOOT(8), [-4.5, 0.2], [-4.5, -6.5], FOOT(12), [4.5, -7.5], FOOT(14)] },
]

function Roamer({ step, def, marksOn }: { step: number; def: RoamerDef; marksOn: boolean }) {
  const grp = useRef<Group>(null)
  const heading = useRef(0)
  const leg = useRef(0)       // which leg of the loop
  const phase = useRef<'walk' | 'pause'>('pause')
  const phaseT = useRef(0)
  const pos = useRef<[number, number]>(def.pts[0])
  useFrame((s, dt) => {
    const N = def.pts.length
    const from = def.pts[leg.current % N]
    const to = def.pts[(leg.current + 1) % N]
    // the ward never stops working: they roam from the first interior beat,
    // through every bird's-eye reveal (the census marks TRAVEL with them —
    // a living census), and on under the story. Only the outside approach
    // (beat 0) sees them at their posts.
    if (step >= 1) {
      phaseT.current += dt
      const dist = Math.hypot(to[0] - from[0], to[1] - from[1])
      if (phase.current === 'pause') {
        pos.current = from
        if (phaseT.current > def.pauses[leg.current % def.pauses.length]) { phase.current = 'walk'; phaseT.current = 0 }
      } else {
        const t = Math.min(1, (phaseT.current * def.speed) / dist)
        const e = t * t * (3 - 2 * t)
        pos.current = [from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e]
        if (t >= 1) { phase.current = 'pause'; phaseT.current = 0; leg.current += 1 }
      }
    }
    const walking = step >= 1 && phase.current === 'walk'
    const bob = walking ? Math.abs(Math.sin(s.clock.elapsedTime * 5.2 + def.pts[0][0])) * 0.035 : 0
    if (grp.current) grp.current.position.set(pos.current[0], bob, pos.current[1])
    const want = walking ? Math.atan2(to[0] - from[0], to[1] - from[1]) : heading.current
    heading.current = MathUtils.damp(heading.current, want, 4, dt)
    if (grp.current) grp.current.rotation.y = heading.current
  })
  return (
    <group ref={grp}>
      <StaffFigure kind={def.kind} />
      <Blip step={step} />
      {def.kind === 'nurse'
        ? <LegendMark on={marksOn} geo={GEO.tri} fillGeo={GEO.triFill} ringGeo={GEO.ringPerson} color={KIND_STYLE.nurse.color} />
        : def.kind === 'doctor'
          ? <LegendMark on={marksOn} geo={GEO.triDoc} fillGeo={GEO.triDocFill} ringGeo={GEO.ringPerson} color={KIND_STYLE.doctor.color} />
          : <LegendMark on={marksOn} geo={GEO.square} fillGeo={GEO.squareFill} ringGeo={GEO.ringOps} color={KIND_STYLE.ops.color} />}
    </group>
  )
}

/** Every bay's footprint in bed-teal, occupied ones carrying their patient's
 *  coral dot — the census beat lights the whole ward's worth at once. */
function BedMarks({ step }: { step: number }) {
  const censusOn = step >= 10 && step <= 14
  return (
    <>
      {BED_SLOTS.map((slot) => {
        // bay 5 is the census's HERO: its rect and its patient's dot light
        // alone on the bed-hero beat, one chapter before the full sweep
        const on = censusOn || (slot.index === 5 && step === 4)
        return (
          <group key={slot.index} position={slot.position} rotation-y={slot.rotationY}>
            <LegendMark on={on} geo={GEO.bed} fillGeo={GEO.bedFill} ringGeo={GEO.ringBed} color={KIND_STYLE.bed.color} y={0.06} />
            {/* the bed's own return: broad and dim — furniture, not a person.
                The patient echoes from the roster group's body instead. */}
            <Blip step={step} size={2.1} tone={0.32} y={0.56} />
            {OCCUPIED.includes(slot.index) && <PatientDot on={on} />}
          </group>
        )
      })}
    </>
  )
}

export function ERPopulation({ step = 0, onNurseArrived }: { step?: number; onNurseArrived?: () => void }) {
  return (
    <group>
      <WardCoverage on={(step >= 3 && step <= 8) || (step >= 10 && step <= 14)} />
      <RadarFace step={step} />
      <WalkingNurse step={step} onArrived={onNurseArrived} />
      {/* nurse marks light with hers (both-perimeters beat), the rest join on
          the census sweep */}
      {ROAMERS.map((r, i) => (
        <Roamer key={i} step={step} def={r}
          marksOn={step >= 10 && step <= 14} />
      ))}
      {/* her station mate — the island stays staffed while the ward works */}
      <group position={[-0.7, 0, 0.85]}><StaffFigure kind="nurse" /><Blip step={step} /></group>
      <BedMarks step={step} />
      {step >= 12 && <InboundRing step={step} />}
      {step >= 17 && step < 19 && <GhostPresence step={step} />}
      {step >= 18 && <SolidPatient />}
      {/* one frame, the whole arc: detect (18-19) · reconcile (20) · named (21)
          · HELD behind iSAM's title card (22-23) · the card opens on the raw
          traces alone (24) · iSAM's read lands under each lead (25) · iSAM
          commits (26+). The box does not act while the card is up — it is the
          thing the card fades through. */}
      <CVScan stage={step === 18 || step === 19 ? 0 : step === 20 ? 1
        : step >= 21 && step <= 23 ? 2 : step === 24 ? 3 : step === 25 ? 4
        : step === 26 ? 5 : step >= 27 ? 6 : null} />
      {/* named means TRACKED: the unknown object joins the ontology with his own
          census dot, the same coral mark every other patient here already carries */}
      <group position={BED_SLOTS[4].position} rotation-y={BED_SLOTS[4].rotationY}>
        <PatientDot on={step >= 21} />
      </group>
      {/* patients + abstract bedside consoles */}
      {BED_SLOTS.filter((s) => OCCUPIED.includes(s.index)).map((s) => (
        <group key={s.index} position={s.position} rotation-y={s.rotationY}>
          <Mannequin pose="lying" />
          {/* the sleeping patient's own return — the BODY lights, not a dot */}
          <BlipBody step={step} />
          <BedsideConsole />
          {[6, 11].includes(s.index) && <IVPole position={[-0.95, 0, -0.4]} />}
        </group>
      ))}

      {/* central big box + two nurses fiddling with it (the camera is a third) */}
      {/* central command island — two consoles facing OUT on each side, spread
          apart to leave a centre gap for the nurses */}
      <group position={[0, 0, 2.4]}>
        <CommandTable step={step} />
      </group>
      <group position={[0, 0, -2.4]} rotation-y={Math.PI}>
        <CommandTable step={step} />
      </group>
      {/* no static nurses left: all four station figures are walkers now —
          WalkingNurse (the hero) and the three ROVERS — each starting on her
          own station spot, so the island reads exactly as before until the
          dispersal beat */}
    </group>
  )
}
