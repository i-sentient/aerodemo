import { CanvasTexture, SRGBColorSpace, LinearFilter } from 'three'

// ===========================================================================
//  CATH LAB SCREEN TEXTURES — the boom monitor bank + the wall display, drawn
//  to a 2D canvas and mapped onto the screen meshes (same approach as the ER
//  `screenTex.ts`). Placeholder clinical content: a coronary fluoroscopy frame,
//  a hemodynamics strip, and a small "X-RAY ON" warning plate.
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

// --- a branching coronary "vessel tree" drawn recursively -------------------
function vessel(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  ang: number,
  len: number,
  width: number,
  depth: number,
) {
  if (depth <= 0 || len < 6) return
  // gentle curve: split the segment into a few steps that drift the angle
  const steps = 5
  c.lineWidth = width
  c.lineCap = 'round'
  c.beginPath()
  c.moveTo(x, y)
  let px = x
  let py = y
  let a = ang
  for (let i = 0; i < steps; i++) {
    a += (((i * 928 + depth * 517) % 100) / 100 - 0.5) * 0.5 // deterministic wiggle
    px += Math.cos(a) * (len / steps)
    py += Math.sin(a) * (len / steps)
    c.lineTo(px, py)
  }
  c.stroke()
  // branch
  const branches = depth > 3 ? 2 : 1
  for (let b = 0; b < branches; b++) {
    const spread = (b === 0 ? -1 : 1) * (0.45 + (depth % 3) * 0.12)
    vessel(c, px, py, a + spread, len * 0.74, Math.max(1, width * 0.7), depth - 1)
  }
}

// --- coronary fluoroscopy frame: dark, grainy, a bright catheter vessel tree -
export const angioTex = make(720, 720, (c) => {
  const w = 720
  const h = 720
  // dark radiographic field with a soft vignette
  c.fillStyle = '#0a0d10'
  c.fillRect(0, 0, w, h)
  const g = c.createRadialGradient(w / 2, h / 2, 60, w / 2, h / 2, w * 0.62)
  g.addColorStop(0, '#2b3138')
  g.addColorStop(1, '#0a0d10')
  c.fillStyle = g
  c.fillRect(0, 0, w, h)

  // faint ribs / spine shadow for radiographic realism
  c.strokeStyle = 'rgba(120,132,146,0.10)'
  c.lineWidth = 22
  for (let i = 0; i < 7; i++) {
    c.beginPath()
    c.arc(w * 0.32, 120 + i * 78, 210, -0.5, 0.9)
    c.stroke()
  }

  // the vessel tree — bright, radio-dense (catheter-filled coronaries)
  c.strokeStyle = '#e9eef3'
  vessel(c, w * 0.5, h * 0.24, Math.PI / 2 + 0.35, 150, 9, 6)
  vessel(c, w * 0.5, h * 0.24, Math.PI / 2 - 0.15, 140, 8, 5)

  // the guide catheter entering from the top edge
  c.strokeStyle = '#f4f7fa'
  c.lineWidth = 6
  c.beginPath()
  c.moveTo(w * 0.5, 0)
  c.quadraticCurveTo(w * 0.6, h * 0.12, w * 0.5, h * 0.24)
  c.stroke()

  // (no lesion markings yet — the anomalies get flagged later in the story,
  //  by iSAM in the Post Cath Manager, not on the raw run)

  // corner HUD — the case
  c.fillStyle = '#9fb0bd'
  c.font = '17px ui-monospace, monospace'
  c.fillText('FLUORO · 15 fps', 22, 34)
  c.fillText('RAO 30  CAU 20', 22, 58)
  c.fillStyle = '#c8d4de'
  c.fillText('CHANDRABABU · ICU-08', 22, h - 46)
  c.fillStyle = '#9fb0bd'
  c.fillText('ANT OMI · DIAGNOSTIC', 22, h - 22)
  c.textAlign = 'right'
  c.fillText('DAP 42 Gy·cm²', w - 22, 34)
  c.fillText('CINE', w - 22, 58)
  c.textAlign = 'left'
})

// --- hemodynamics strip: ECG + arterial pressure + numbers ------------------
export const hemoTex = make(640, 400, (c) => {
  const w = 640
  const h = 400
  c.fillStyle = '#05070a'
  c.fillRect(0, 0, w, h)

  // faint grid
  c.strokeStyle = 'rgba(90,110,130,0.14)'
  c.lineWidth = 1
  for (let x = 0; x <= w; x += 32) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke() }
  for (let y = 0; y <= h; y += 32) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke() }

  const traceW = w - 150

  // ECG (green) — top band
  c.strokeStyle = '#39e05a'
  c.lineWidth = 2.4
  c.beginPath()
  const eb = 84
  for (let x = 0; x <= traceW; x++) {
    const t = x % 160
    let y = 0
    if (t > 60 && t < 66) y = -8
    else if (t >= 66 && t < 72) y = 46
    else if (t >= 72 && t < 78) y = -26
    else if (t >= 90 && t < 118) y = -14 * Math.sin(((t - 90) / 28) * Math.PI)
    x === 0 ? c.moveTo(x, eb + y) : c.lineTo(x, eb + y)
  }
  c.stroke()

  // arterial pressure (red) — middle band
  c.strokeStyle = '#ff5a5a'
  c.lineWidth = 2.4
  c.beginPath()
  const ab = 216
  for (let x = 0; x <= traceW; x++) {
    const t = (x % 160) / 160
    // sharp upstroke, dicrotic notch, diastolic runoff
    let y = 0
    if (t < 0.12) y = -54 * (t / 0.12)
    else if (t < 0.3) y = -54 + 20 * ((t - 0.12) / 0.18)
    else if (t < 0.36) y = -34 + 8 * Math.sin((t - 0.3) * 30)
    else y = -30 * Math.exp(-(t - 0.36) * 3)
    x === 0 ? c.moveTo(x, ab + y) : c.lineTo(x, ab + y)
  }
  c.stroke()

  // SpO2 pleth (cyan) — lower band
  c.strokeStyle = '#57d7ff'
  c.lineWidth = 2.2
  c.beginPath()
  const sb = 330
  for (let x = 0; x <= traceW; x++) {
    const t = (x % 130) / 130
    const y = -30 * Math.max(0, Math.sin(t * Math.PI)) * (1 - 0.4 * t)
    x === 0 ? c.moveTo(x, sb + y) : c.lineTo(x, sb + y)
  }
  c.stroke()

  // patient line — whose strip this is
  c.fillStyle = '#94a4b0'
  c.font = '15px ui-monospace, monospace'
  c.fillText('CHANDRABABU · ICU-08 · ANT OMI', 16, 24)

  // numeric column — his numbers on the table (stabilised, still stressed)
  const nx = traceW + 20
  c.textBaseline = 'alphabetic'
  c.fillStyle = '#39e05a'
  c.font = 'bold 44px ui-monospace, monospace'
  c.fillText('96', nx, 92)
  c.fillStyle = '#7f8b97'
  c.font = '14px system-ui, sans-serif'
  c.fillText('HR bpm', nx, 112)

  c.fillStyle = '#ff8080'
  c.font = 'bold 34px ui-monospace, monospace'
  c.fillText('108/70', nx, 216)
  c.fillStyle = '#7f8b97'
  c.font = '14px system-ui, sans-serif'
  c.fillText('ABP  (83)', nx, 236)

  c.fillStyle = '#8fe0ff'
  c.font = 'bold 40px ui-monospace, monospace'
  c.fillText('97', nx, 336)
  c.fillStyle = '#7f8b97'
  c.font = '14px system-ui, sans-serif'
  c.fillText('SpO2 %', nx, 356)
})

// --- illuminated "CATH-1 · IN USE" plate — same signage stack as the OR -----
export const cathInUseTex = make(512, 128, (c) => {
  c.fillStyle = '#1c0806'
  c.fillRect(0, 0, 512, 128)
  c.strokeStyle = 'rgba(255,110,90,0.55)'
  c.lineWidth = 6
  c.strokeRect(10, 10, 492, 108)
  c.font = 'bold 52px ui-sans-serif, system-ui, sans-serif'
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.fillStyle = '#ff6a55'
  c.shadowColor = '#ff5a40'
  c.shadowBlur = 18
  c.fillText('CATH-1 · IN USE', 256, 68)
})

// --- green partner plate: the run is done ------------------------------------
export const cathCompletedTex = make(512, 128, (c) => {
  c.fillStyle = '#06180c'
  c.fillRect(0, 0, 512, 128)
  c.strokeStyle = 'rgba(90,255,150,.5)'
  c.lineWidth = 6
  c.strokeRect(10, 10, 492, 108)
  c.font = 'bold 44px ui-sans-serif, system-ui, sans-serif'
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.fillStyle = '#4ade80'
  c.shadowColor = '#34d058'
  c.shadowBlur = 18
  c.fillText('CATH-1 · COMPLETED', 256, 68)
})

// --- quiet idle screen for the in-room displays (the angio lives elsewhere) --
export const standbyTex = make(640, 640, (c) => {
  const w = 640, h = 640
  c.fillStyle = '#0a0f14'
  c.fillRect(0, 0, w, h)
  c.strokeStyle = 'rgba(90,110,130,0.10)'
  c.lineWidth = 1
  for (let x = 0; x <= w; x += 40) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke() }
  for (let y = 0; y <= h; y += 40) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke() }
  c.textAlign = 'center'
  c.fillStyle = '#3d5666'
  c.font = 'bold 34px ui-monospace, monospace'
  c.fillText('FLUORO · STANDBY', w / 2, h / 2 - 10)
  c.fillStyle = '#2c3f4c'
  c.font = '20px ui-monospace, monospace'
  c.fillText('SENTIENT IMAGING', w / 2, h / 2 + 30)
})

// --- small illuminated "X-RAY ON" warning plate (door-side) -----------------
export const xrayOnTex = make(512, 160, (c) => {
  const w = 512
  const h = 160
  c.clearRect(0, 0, w, h)
  roundRect(c, 6, 6, w - 12, h - 12, 18)
  c.fillStyle = 'rgba(255,45,45,0.18)'
  c.fill()
  c.strokeStyle = '#ff5252'
  c.lineWidth = 5
  c.stroke()
  // radiation trefoil
  c.save()
  c.translate(96, h / 2)
  c.fillStyle = '#ffd0d0'
  c.beginPath(); c.arc(0, 0, 12, 0, Math.PI * 2); c.fill()
  for (let i = 0; i < 3; i++) {
    c.rotate((Math.PI * 2) / 3)
    c.beginPath()
    c.moveTo(0, 0)
    c.arc(0, 0, 40, -0.5, 0.5)
    c.closePath()
    c.fill()
  }
  c.restore()
  c.fillStyle = '#ffe2e2'
  c.font = 'bold 58px system-ui, sans-serif'
  c.textBaseline = 'middle'
  c.fillText('X-RAY ON', 168, h / 2 + 4)
})
