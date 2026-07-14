import { CanvasTexture, SRGBColorSpace, LinearFilter } from 'three'

// shared screen font — the app's system stack (Segoe UI on Windows), matched on
// the canvas screens so they read identically to the HTML iSAM/TARS panels.
const ISAM_FONT = '"Segoe UI", Inter, system-ui, sans-serif'

// ===========================================================================
//  SCREEN TEXTURES — the bedside triptych + the command board, drawn to a 2D
//  canvas and mapped onto the screen meshes. Robust (part of the 3D, always
//  visible), unlike Html-in-3D. Placeholder content — "just giving info".
// ===========================================================================

function make(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): CanvasTexture {
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const c = cv.getContext('2d')!
  draw(c)
  const t = new CanvasTexture(cv)
  t.colorSpace = SRGBColorSpace
  t.minFilter = LinearFilter
  t.anisotropy = 8
  return t
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath()
  c.moveTo(x + r, y)
  c.arcTo(x + w, y, x + w, y + h, r)
  c.arcTo(x + w, y + h, x, y + h, r)
  c.arcTo(x, y + h, x, y, r)
  c.arcTo(x, y, x + w, y, r)
  c.closePath()
}

// wrap `text` to `maxW`, drawing each line at `x` with `lineH` spacing; returns
// the y of the LAST line so callers can flow more content beneath a variable block.
function wrapText(c: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number) {
  const words = text.split(' ')
  let line = ''
  let yy = y
  for (const word of words) {
    const test = line ? line + ' ' + word : word
    if (c.measureText(test).width > maxW && line) {
      c.fillText(line, x, yy)
      line = word
      yy += lineH
    } else {
      line = test
    }
  }
  if (line) c.fillText(line, x, yy)
  return yy
}

// a Switch-style tab header pill
function tabHead(c: CanvasRenderingContext2D, x: number, y: number, w: number, label: string, color: string) {
  roundRect(c, x, y, w, 24, 7)
  c.fillStyle = color + '26'
  c.fill()
  c.strokeStyle = color + '99'
  c.lineWidth = 1.2
  c.stroke()
  c.fillStyle = color
  c.font = 'bold 12px system-ui, sans-serif'
  c.textBaseline = 'middle'
  c.fillText(label, x + 9, y + 13)
  c.textBaseline = 'top'
}

// --- bedside triptych: telemetry | agents | EMR -----------------------------
export const bedsideTex = make(540, 234, (c) => {
  const w = 540
  const h = 234
  const col = w / 3
  c.fillStyle = '#0e141b'
  c.fillRect(0, 0, w, h)
  c.strokeStyle = '#233040'
  c.lineWidth = 2
  c.beginPath()
  c.moveTo(col, 16); c.lineTo(col, h - 16)
  c.moveTo(col * 2, 16); c.lineTo(col * 2, h - 16)
  c.stroke()
  c.textBaseline = 'top'

  // col 1 — telemetry tab
  tabHead(c, 14, 14, col - 30, 'STATE · TELEMETRY', '#7fd7ff')
  c.strokeStyle = '#7fd7ff'
  c.lineWidth = 2.2
  c.beginPath()
  const base = 78
  const ecg = [[0, 0], [26, 0], [36, -22], [48, 26], [60, 0], [116, 0], [128, -13], [138, 20], [148, 0], [col - 24, 0]]
  ecg.forEach(([x, y], i) => { const X = 16 + x, Y = base + y; i ? c.lineTo(X, Y) : c.moveTo(X, Y) })
  c.stroke()
  c.fillStyle = '#c7d3de'
  c.font = '14px system-ui, sans-serif'
  c.fillText('HR 96 · SpO2 94%', 16, 128)
  c.fillText('BP 130/82 · RR 20', 16, 152)
  c.fillStyle = '#ffcf8f'
  c.fillText('NEWS2 5 · watch', 16, 176)

  // col 2 — agents tab
  const x2 = col + 16
  tabHead(c, col + 14, 14, col - 30, 'AGENTS', '#5fe3c0')
  c.fillStyle = '#7ff0d2'
  c.font = '15px system-ui, sans-serif'
  c.fillText('◆ TARS', x2, 74)
  c.fillStyle = '#8fa0ad'
  c.font = '12px system-ui, sans-serif'
  c.fillText('monitoring · stable', x2, 96)
  c.fillStyle = '#ffd27f'
  c.font = '15px system-ui, sans-serif'
  c.fillText('◆ SAM', x2, 128)
  c.fillStyle = '#8fa0ad'
  c.font = '12px system-ui, sans-serif'
  c.fillText('no new read', x2, 150)

  // col 3 — EMR tab
  const x3 = col * 2 + 16
  tabHead(c, col * 2 + 14, 14, col - 30, 'EMR', '#ffb37a')
  c.fillStyle = '#c7d3de'
  c.font = '14px system-ui, sans-serif'
  c.fillText('Aspirin 300mg', x3, 74)
  c.fillText('Troponin — pending', x3, 98)
  c.fillText('Hx: HTN, T2DM', x3, 122)
  c.fillStyle = '#8fa0ad'
  c.font = '12px system-ui, sans-serif'
  c.fillText('Allergies: none', x3, 148)
})

// --- inbound alert flag (big, RED, centered — replaces the map on beat 1) ----
export const inboundAlertTex = make(720, 168, (c) => {
  const w = 720
  const h = 168
  c.clearRect(0, 0, w, h)
  roundRect(c, 10, 24, w - 20, h - 48, 20)
  c.fillStyle = 'rgba(255,54,54,0.22)'
  c.fill()
  c.strokeStyle = '#ff4d4d'
  c.lineWidth = 6
  c.stroke()
  c.fillStyle = '#ffdcdc'
  c.font = 'bold 52px system-ui, sans-serif'
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.fillText('⚠  NEW PATIENT INBOUND', w / 2, h / 2 + 2)
  c.textAlign = 'left'
})
// the flag lies face-up on the tilted screen; rotate the texture 180° so it
// reads right-way-up for the nurse (and, by symmetry, the mirrored console too)
inboundAlertTex.center.set(0.5, 0.5)
inboundAlertTex.rotation = Math.PI

// TARS copper wash — matches the TARS agent colour from the notch (#A9744F).
function tarsBg(c: CanvasRenderingContext2D, w: number, h: number) {
  const g = c.createRadialGradient(w * 0.5, h * 0.58, 10, w * 0.5, h * 0.58, w * 0.55)
  g.addColorStop(0, '#e6c8a6')
  g.addColorStop(0.36, '#c2905f')
  g.addColorStop(0.72, '#a9744f')
  g.addColorStop(1, '#754f34')
  c.fillStyle = g
  c.fillRect(0, 0, w, h)
}
// warm-glass tint for the TARS card (parallels the green iSAM glass)
const TARS_GLASS: [string, string, string] = ['rgba(70,47,30,0.46)', 'rgba(40,26,16,0.5)', 'rgba(22,13,7,0.58)']

// a centred two-weight line: bold agent name + lighter remainder
function centredAgentLine(
  c: CanvasRenderingContext2D, name: string, rest: string,
  cx: number, cy: number, size: number, nameCol: string, restCol: string,
) {
  c.textBaseline = 'middle'
  c.textAlign = 'left'
  c.font = `700 ${size}px ${ISAM_FONT}`
  const wN = c.measureText(name).width
  c.font = `400 ${size}px ${ISAM_FONT}`
  const wR = c.measureText(rest).width
  const x0 = cx - (wN + wR) / 2
  c.fillStyle = nameCol
  c.font = `700 ${size}px ${ISAM_FONT}`
  c.fillText(name, x0, cy)
  c.fillStyle = restCol
  c.font = `400 ${size}px ${ISAM_FONT}`
  c.fillText(rest, x0 + wN, cy)
}

// --- command flag · beat 4–6: alert resolved, TARS waits for SAM (copper) ----
export const tarsAwaitingTex = make(760, 168, (c) => {
  const w = 760
  const h = 168
  c.clearRect(0, 0, w, h) // transparent — the copper wash lives on the screen behind
  glassCard(c, 22, 20, w - 44, h - 40, TARS_GLASS)
  centredAgentLine(c, 'TARS', '  ·  awaiting SAM analysis', w / 2, h / 2 + 2, 40, '#f7ecdd', '#e6cfb6')
})
// same 180° texture rotation as the inbound flag, so it reads right-way-up
tarsAwaitingTex.center.set(0.5, 0.5)
tarsAwaitingTex.rotation = Math.PI

// --- command flag · beat 7: TARS hands off → ICU bed for pre-cath prep -------
export const tarsIcuTex = make(760, 168, (c) => {
  const w = 760
  const h = 168
  c.clearRect(0, 0, w, h) // transparent — the copper wash lives on the screen behind
  glassCard(c, 22, 20, w - 44, h - 40, TARS_GLASS)
  centredAgentLine(c, 'TARS', '  ·  communicating with ICU bed', w / 2, h / 2 - 16, 32, '#f7ecdd', '#e6cfb6')
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.fillStyle = '#e0b98f'
  c.font = `400 24px ${ISAM_FONT}`
  c.fillText('pre-cath prep', w / 2, h / 2 + 28)
  c.textAlign = 'left'
})
// same 180° texture rotation so it reads right-way-up on the tilted console
tarsIcuTex.center.set(0.5, 0.5)
tarsIcuTex.rotation = Math.PI

// --- command-table SCREEN wash: fills the screen with the TARS copper (behind
//     the flag card). Edges fade to near-black so it blends into the screen
//     frame rather than reading as a hard copper rectangle. -------------------
export const tarsScreenTex = make(1024, 640, (c) => {
  const w = 1024
  const h = 640
  tarsBg(c, w, h)
  const v = c.createRadialGradient(w / 2, h / 2, h * 0.26, w / 2, h / 2, Math.hypot(w, h) / 2)
  v.addColorStop(0, 'rgba(10,6,3,0)')
  v.addColorStop(0.66, 'rgba(10,6,3,0.16)')
  v.addColorStop(1, 'rgba(6,4,2,0.92)')
  c.fillStyle = v
  c.fillRect(0, 0, w, h)
})

// --- central command TABLE: abstract round-ward map (no literal data) -------
export const tableTex = make(600, 400, (c) => {
  const w = 600
  const h = 400
  c.fillStyle = '#0e1b26'
  c.fillRect(0, 0, w, h)
  const cx = w / 2
  const cy = h / 2 + 6
  const R = 140
  // radial spokes
  c.strokeStyle = 'rgba(140,230,246,0.22)'
  c.lineWidth = 1.5
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2
    c.beginPath()
    c.moveTo(cx, cy)
    c.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R)
    c.stroke()
  }
  // ward rings (bold)
  c.strokeStyle = '#7fe4f5'
  c.lineWidth = 3.5
  c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke()
  c.strokeStyle = 'rgba(140,230,246,0.4)'
  c.lineWidth = 2
  c.beginPath(); c.arc(cx, cy, R - 20, 0, Math.PI * 2); c.stroke()
  // bed dots (one "open" highlighted)
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2
    const x = cx + Math.cos(a) * R
    const y = cy + Math.sin(a) * R
    const open = i === 4
    c.beginPath()
    c.arc(x, y, open ? 10 : 7, 0, Math.PI * 2)
    c.fillStyle = open ? '#c7f4ff' : '#8fe6f5'
    c.fill()
    if (open) { c.strokeStyle = '#ffffff'; c.lineWidth = 2.5; c.stroke() }
  }
  // hub
  c.beginPath(); c.arc(cx, cy, 8, 0, Math.PI * 2); c.fillStyle = '#bff0ff'; c.fill()
  // abstract side panels
  const panel = (px: number) => {
    c.fillStyle = 'rgba(140,230,246,0.14)'
    roundRect(c, px, 32, 122, 82, 10); c.fill()
    c.strokeStyle = 'rgba(140,230,246,0.5)'; c.lineWidth = 1.5; c.stroke()
    c.fillStyle = '#8fe6f5'
    c.fillRect(px + 14, 48, 84, 6)
    c.fillRect(px + 14, 66, 58, 5)
    c.fillRect(px + 14, 82, 72, 5)
  }
  panel(24)
  panel(w - 146)
})

// ===========================================================================
//  iSAM console skin — matches the app's iSAM agent panel: green radial wash,
//  Segoe-light typography, agent status dots, and floating "liquid-glass"
//  cards (tinted body + soft drop shadow + bright top edge + corner glint).
//  Canvas can't do true backdrop refraction, but the tint + edge light read
//  the same and keep the text crisp over the bright wash.
// ===========================================================================
function isamBg(c: CanvasRenderingContext2D, w: number, h: number) {
  const g = c.createRadialGradient(w * 0.46, h * 0.74, 20, w * 0.46, h * 0.74, w * 0.95)
  g.addColorStop(0, '#cdeeda')
  g.addColorStop(0.3, '#5cbd8e')
  g.addColorStop(0.64, '#2d8560')
  g.addColorStop(1, '#1d5f45')
  c.fillStyle = g
  c.fillRect(0, 0, w, h)
}

function isamHeader(c: CanvasRenderingContext2D) {
  c.textBaseline = 'alphabetic'
  c.fillStyle = '#f4fbf7'
  c.font = `300 46px ${ISAM_FONT}`
  c.fillText('iSAM', 34, 64)
  const ls = c as unknown as { letterSpacing: string }
  ls.letterSpacing = '3px'
  c.fillStyle = 'rgba(234,255,244,0.85)'
  c.font = `600 13px ${ISAM_FONT}`
  c.fillText('REASONING · LIVE', 36, 90)
  ls.letterSpacing = '0px'
  // agent status dots (LSam · TARS · iSAM — iSAM active)
  c.fillStyle = 'rgba(255,255,255,0.4)'
  c.beginPath(); c.arc(470, 44, 4, 0, Math.PI * 2); c.fill()
  c.beginPath(); c.arc(488, 44, 4, 0, Math.PI * 2); c.fill()
  c.fillStyle = '#ffffff'
  c.beginPath(); c.arc(508, 44, 5.5, 0, Math.PI * 2); c.fill()
}

function glassCard(
  c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  tint: [string, string, string] = ['rgba(30,64,50,0.42)', 'rgba(10,31,23,0.46)', 'rgba(4,18,12,0.54)'],
) {
  // tinted glass body + soft drop shadow (one pass)
  c.save()
  c.shadowColor = 'rgba(2,13,8,0.9)'
  c.shadowBlur = 22
  c.shadowOffsetY = 12
  const body = c.createLinearGradient(0, y, 0, y + h)
  body.addColorStop(0, tint[0])
  body.addColorStop(0.5, tint[1])
  body.addColorStop(1, tint[2])
  c.fillStyle = body
  roundRect(c, x, y, w, h, 28)
  c.fill()
  c.restore()
  // rim
  c.strokeStyle = 'rgba(255,255,255,0.22)'
  c.lineWidth = 1.2
  roundRect(c, x, y, w, h, 28)
  c.stroke()
  // bright specular strip along the top edge
  const hi = c.createLinearGradient(x + 24, 0, x + w - 24, 0)
  hi.addColorStop(0, 'rgba(255,255,255,0)')
  hi.addColorStop(0.5, 'rgba(255,255,255,0.6)')
  hi.addColorStop(1, 'rgba(255,255,255,0)')
  c.fillStyle = hi
  c.fillRect(x + 24, y + 2, w - 48, 2)
  // corner glint (clipped inside the card)
  c.save()
  roundRect(c, x, y, w, h, 28)
  c.clip()
  const bl = c.createRadialGradient(x + 32, y + 28, 0, x + 32, y + 28, 46)
  bl.addColorStop(0, 'rgba(255,255,255,0.4)')
  bl.addColorStop(1, 'rgba(255,255,255,0)')
  c.fillStyle = bl
  c.fillRect(x, y, w, h)
  c.restore()
}

// --- bedside iSAM console · beat 5: analysing ECG · awaiting telemetry -------
export const samAwaitingTex = make(560, 350, (c) => {
  const w = 560
  const h = 350
  isamBg(c, w, h)
  isamHeader(c)
  glassCard(c, 30, 124, 500, 196)

  c.textBaseline = 'alphabetic'
  // row 1 — analysing the ECG (amber in-progress dot)
  c.fillStyle = '#ffd27f'
  c.beginPath(); c.arc(62, 182, 7, 0, Math.PI * 2); c.fill()
  c.fillStyle = '#f8fefb'
  c.font = `300 25px ${ISAM_FONT}`
  c.fillText('Analysing pre-hospital 12-lead ECG', 88, 190)
  c.fillStyle = '#cdeede'
  c.font = `400 16px ${ISAM_FONT}`
  c.fillText('along with case context', 88, 218)

  // row 2 — awaiting telemetry (amber dot + thinking dots)
  c.fillStyle = '#ffd27f'
  c.beginPath(); c.arc(62, 270, 7, 0, Math.PI * 2); c.fill()
  c.fillStyle = '#f8fefb'
  c.font = `300 25px ${ISAM_FONT}`
  c.fillText('Awaiting telemetry…', 88, 278)
  c.fillStyle = '#cdeede'
  for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(362 + i * 18, 271, 4.5, 0, Math.PI * 2); c.fill() }
})

// --- bedside iSAM console · beat 6: OMI read → door-to-balloon activated -----
export const samStemiTex = make(560, 350, (c) => {
  const w = 560
  const h = 350
  isamBg(c, w, h)
  isamHeader(c)
  glassCard(c, 30, 124, 500, 196)

  c.textBaseline = 'top'
  // diagnosis (white) — wrapped inside the card, vertically centred
  c.fillStyle = '#f8fefb'
  c.font = `400 20px ${ISAM_FONT}`
  const dY0 = 182
  const yD = wrapText(c, 'Acute Anterior ST-Elevation / Myocardial Infarction (OMI)', 68, dY0, 446, 26)
  // red accent bar spanning the diagnosis block
  c.fillStyle = '#ff4d4d'
  roundRect(c, 50, dY0 - 2, 4.5, yD + 22 - (dY0 - 2), 2.25)
  c.fill()
  // action — done check + label
  c.strokeStyle = '#bff6d9'
  c.lineWidth = 3.4
  c.lineCap = 'round'
  c.lineJoin = 'round'
  const aY = yD + 38
  c.beginPath(); c.moveTo(52, aY + 10); c.lineTo(59, aY + 17); c.lineTo(72, aY + 1); c.stroke()
  c.fillStyle = '#ffffff'
  c.font = `600 21px ${ISAM_FONT}`
  c.fillText('Door-to-balloon pathway activated', 82, aY)
})

// --- EMERGENCY wall signage: white letters (tinted red + bloomed by the
//     material), transparent elsewhere so only the word floats on the glass ---
export const emergencyTex = make(1800, 320, (c) => {
  const w = 1800
  const h = 320
  const WORD = 'EMERGENCY'
  const FAMILY = '"Helvetica Neue", Helvetica, Arial, sans-serif'
  c.clearRect(0, 0, w, h)
  c.fillStyle = '#ffffff'
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  ;(c as unknown as { letterSpacing: string }).letterSpacing = '8px'
  // auto-fit: shrink the font until the whole word fits inside 88% of the canvas
  let size = 210
  const target = w * 0.88
  c.font = `700 ${size}px ${FAMILY}`
  const measured = c.measureText(WORD).width
  if (measured > target) {
    size = Math.floor((size * target) / measured)
    c.font = `700 ${size}px ${FAMILY}`
  }
  c.fillText(WORD, w / 2, h / 2 + 6)
})
// the signs render on the cylinder's INNER face (BackSide), which mirrors the
// texture — pre-flip it horizontally so the word reads left-to-right from inside
emergencyTex.center.set(0.5, 0.5)
emergencyTex.repeat.x = -1

// --- command board: all bays overview ---------------------------------------
export const commandTex = make(600, 320, (c) => {
  const w = 600
  const h = 320
  c.fillStyle = '#0e141b'
  c.fillRect(0, 0, w, h)
  c.textBaseline = 'top'
  c.fillStyle = '#5fe3c0'
  c.font = 'bold 22px system-ui, sans-serif'
  c.fillText('TARS · COMMAND', 22, 20)
  c.fillStyle = '#7a8b98'
  c.font = '14px system-ui, sans-serif'
  c.fillText('ER — all bays', 250, 27)

  const cols = 4
  const rows = 4
  const gx = 22
  const gy = 66
  const stepX = (w - 44) / cols
  const stepY = (h - 82) / rows
  const cw = stepX - 10
  const ch = stepY - 10
  for (let i = 0; i < 16; i++) {
    const cx = gx + (i % cols) * stepX
    const cy = gy + Math.floor(i / cols) * stepY
    const tone = i === 4 ? '#33d6ff' : [0, 3, 6, 10].includes(i) ? '#ffcf8f' : '#3fe0b0'
    c.fillStyle = '#151d26'
    roundRect(c, cx, cy, cw, ch, 7)
    c.fill()
    c.strokeStyle = tone
    c.lineWidth = 1.5
    c.stroke()
    c.fillStyle = '#8fa0ad'
    c.font = '12px system-ui, sans-serif'
    c.fillText('Bay ' + (i + 1), cx + 9, cy + 9)
    c.fillStyle = tone
    c.font = 'bold 14px system-ui, sans-serif'
    c.fillText(i === 4 ? 'OPEN' : 'occ', cx + 9, cy + ch - 24)
  }
})
