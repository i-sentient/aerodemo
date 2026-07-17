import { CanvasTexture } from 'three'

// ---------------------------------------------------------------------------
//  Small procedural textures (created once, reused). Browser-only (canvas).
// ---------------------------------------------------------------------------

/** Soft white radial glow — tinted per-use via material color + additive blend. */
export function makeRadialTexture(size = 128): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.4, 'rgba(255,255,255,0.55)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new CanvasTexture(c)
  tex.needsUpdate = true
  return tex
}

/** Big-square checkerboard tile texture (two greys) for the metal shell. */
export function makeCheckerTexture(
  squares = 2,
  a = '#d0d5da',
  b = '#b0b6bd',
  size = 512,
  grout = false,
): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const s = size / squares
  for (let y = 0; y < squares; y++) {
    for (let x = 0; x < squares; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? a : b
      ctx.fillRect(x * s, y * s, s, s)
    }
  }
  if (grout) {
    ctx.strokeStyle = 'rgba(60,70,80,0.35)'
    ctx.lineWidth = Math.max(2, size * 0.004)
    for (let i = 0; i <= squares; i++) {
      ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s, size); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, i * s); ctx.lineTo(size, i * s); ctx.stroke()
    }
  }
  const tex = new CanvasTexture(c)
  tex.needsUpdate = true
  return tex
}

/** Architectural PANEL-GRID: a uniform light metallic grey divided into large
 *  square panels by thin dark seam lines (like the Microsoft Theater cladding).
 *  NOT a checkerboard — one flat colour + a grid of dark grout lines. */
export function makePanelTexture(
  cells = 2,
  base = '#cbd0d6',
  line = '#454d56',
  size = 512,
): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  ctx.fillStyle = base
  ctx.fillRect(0, 0, size, size)
  ctx.strokeStyle = line
  ctx.lineWidth = Math.max(3, size * 0.016)
  const s = size / cells
  for (let i = 0; i <= cells; i++) {
    ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s, size); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, i * s); ctx.lineTo(size, i * s); ctx.stroke()
  }
  const tex = new CanvasTexture(c)
  tex.needsUpdate = true
  return tex
}

/** Vertical gradient for the aero skydome (light top → cooler bottom). */
export function makeVerticalGradientTexture(
  top = '#eef4fc',
  bottom = '#cdddef',
  size = 256,
): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 2
  c.height = size
  const ctx = c.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 0, size)
  g.addColorStop(0, top)
  g.addColorStop(1, bottom)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 2, size)
  const tex = new CanvasTexture(c)
  tex.needsUpdate = true
  return tex
}
