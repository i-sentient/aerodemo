import { CanvasTexture, SRGBColorSpace, LinearFilter } from 'three'

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

// --- command flag · beat 4+: alert resolved, TARS waits for SAM (teal) -------
export const tarsAwaitingTex = make(760, 168, (c) => {
  const w = 760
  const h = 168
  c.clearRect(0, 0, w, h)
  roundRect(c, 10, 24, w - 20, h - 48, 20)
  c.fillStyle = 'rgba(95,227,192,0.16)'
  c.fill()
  c.strokeStyle = '#5fe3c0'
  c.lineWidth = 5
  c.stroke()
  c.fillStyle = '#c6f5ea'
  c.font = 'bold 44px system-ui, sans-serif'
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.fillText('TARS · awaiting SAM analysis', w / 2, h / 2 + 2)
  c.textAlign = 'left'
})
// same 180° texture rotation as the inbound flag, so it reads right-way-up
tarsAwaitingTex.center.set(0.5, 0.5)
tarsAwaitingTex.rotation = Math.PI

// --- command flag · beat 7: TARS hands off → ICU bed for pre-cath prep -------
export const tarsIcuTex = make(760, 168, (c) => {
  const w = 760
  const h = 168
  c.clearRect(0, 0, w, h)
  roundRect(c, 10, 24, w - 20, h - 48, 20)
  c.fillStyle = 'rgba(95,227,192,0.16)'
  c.fill()
  c.strokeStyle = '#5fe3c0'
  c.lineWidth = 5
  c.stroke()
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  // line 1 — the handoff
  c.fillStyle = '#c6f5ea'
  c.font = 'bold 34px system-ui, sans-serif'
  c.fillText('TARS · communicating with ICU bed', w / 2, h / 2 - 16)
  // line 2 — the purpose
  c.fillStyle = '#7fd7c8'
  c.font = '24px system-ui, sans-serif'
  c.fillText('pre-cath prep', w / 2, h / 2 + 26)
  c.textAlign = 'left'
})
// same 180° texture rotation so it reads right-way-up on the tilted console
tarsIcuTex.center.set(0.5, 0.5)
tarsIcuTex.rotation = Math.PI

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

// --- bedside SAM console · beat 5: case context ✓ · awaiting telemetry -------
export const samAwaitingTex = make(560, 350, (c) => {
  const w = 560
  const h = 350
  c.fillStyle = '#0d131a'
  c.fillRect(0, 0, w, h)
  // header
  c.textBaseline = 'alphabetic'
  c.fillStyle = '#ffd27f'
  c.font = 'bold 34px system-ui, sans-serif'
  c.fillText('SAM', 34, 58)
  c.fillStyle = '#8a97a3'
  c.font = '18px system-ui, sans-serif'
  c.fillText('clinical reasoning', 122, 56)
  c.strokeStyle = 'rgba(255,210,127,0.35)'
  c.lineWidth = 2
  c.beginPath(); c.moveTo(34, 84); c.lineTo(w - 34, 84); c.stroke()

  // row 1 — Case context ✓ (drawn check)
  c.strokeStyle = '#5fe3a0'
  c.lineWidth = 5
  c.lineCap = 'round'
  c.beginPath(); c.moveTo(40, 146); c.lineTo(50, 156); c.lineTo(66, 134); c.stroke()
  c.textBaseline = 'middle'
  c.fillStyle = '#e6edf4'
  c.font = '25px system-ui, sans-serif'
  c.fillText('Case context', 86, 146)
  c.fillStyle = '#7f8b97'
  c.font = '17px system-ui, sans-serif'
  c.fillText('linked · confirmed', 86, 176)

  // row 2 — Awaiting telemetry (amber dot + thinking dots)
  c.fillStyle = '#ffcf8f'
  c.beginPath(); c.arc(52, 240, 8, 0, Math.PI * 2); c.fill()
  c.fillStyle = '#e6edf4'
  c.font = '25px system-ui, sans-serif'
  c.fillText('Awaiting telemetry', 86, 240)
  c.fillStyle = '#7f8b97'
  c.font = '17px system-ui, sans-serif'
  c.fillText('for analysis', 86, 270)
  c.fillStyle = '#ffd27f'
  for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(330 + i * 24, 270, 6, 0, Math.PI * 2); c.fill() }
})

// --- bedside SAM console · beat 6: analysis done → STEMI, admit -------------
export const samStemiTex = make(560, 350, (c) => {
  const w = 560
  const h = 350
  c.fillStyle = '#0d131a'
  c.fillRect(0, 0, w, h)
  // header
  c.textBaseline = 'alphabetic'
  c.fillStyle = '#ffd27f'
  c.font = 'bold 34px system-ui, sans-serif'
  c.fillText('SAM', 34, 58)
  c.fillStyle = '#8a97a3'
  c.font = '18px system-ui, sans-serif'
  c.fillText('analysis complete', 122, 56)
  c.strokeStyle = 'rgba(255,210,127,0.35)'
  c.lineWidth = 2
  c.beginPath(); c.moveTo(34, 84); c.lineTo(w - 34, 84); c.stroke()

  // diagnosis — STEMI (red, prominent)
  c.textBaseline = 'middle'
  c.fillStyle = '#ff5a5a'
  c.beginPath(); c.arc(52, 148, 9, 0, Math.PI * 2); c.fill()
  c.fillStyle = '#ff8080'
  c.font = 'bold 34px system-ui, sans-serif'
  c.fillText('Anterior STEMI', 82, 146)
  c.fillStyle = '#9aa7b2'
  c.font = '17px system-ui, sans-serif'
  c.fillText('de Winter T-waves · proximal LAD', 82, 182)

  // recommendation — admit
  c.fillStyle = '#5fe3a0'
  c.beginPath(); c.arc(52, 250, 8, 0, Math.PI * 2); c.fill()
  c.fillStyle = '#e6edf4'
  c.font = 'bold 26px system-ui, sans-serif'
  c.fillText('Admit patient', 82, 250)
  c.fillStyle = '#9aa7b2'
  c.font = '17px system-ui, sans-serif'
  c.fillText('activate cath lab', 82, 282)
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
