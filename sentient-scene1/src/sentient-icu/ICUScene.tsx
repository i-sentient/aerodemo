import { useEffect, useMemo, useRef, useState, type RefObject, type MutableRefObject } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Billboard, Environment, Lightformer, OrbitControls, RoundedBox } from '@react-three/drei'
import {
  NoToneMapping, CanvasTexture, SRGBColorSpace, RepeatWrapping,
  Color, MeshStandardMaterial, MeshBasicMaterial, MeshPhysicalMaterial,
  Vector3, Quaternion, MathUtils, CatmullRomCurve3, BufferGeometry, BufferAttribute,
  ShaderMaterial, AdditiveBlending, NormalBlending, DoubleSide, TubeGeometry,
} from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { Postprocessing } from './Postprocessing'
import { useShotCapture } from './useShotCapture'

// ---------------------------------------------------------------------------
//  SENTIENT ICU — BAY 04. A bright, high-key, mint-clinical intensive-care bay
//  (the soft-clay illustration look): tiled walls, glass partition, big ceiling
//  luminaires, ICU bed + two clinicians, and the full device ring — ventilator,
//  wall monitor, infusion stack, syringe pumps, dialysis rig. The story layer:
//  glowing DATA RIBBONS stream from every device, converge on the patient, and
//  feed one braided trunk into the EDGE SERVER (brushed-alu slab, cyan light
//  bar) on the wall shelf — the room's sentient node. Bloom (light grade) keys
//  on luminance>1.05, so anything glowing uses HDR colors via hdr().
//  ?view=icu · Space/→ camera presets · P copies the current shot (dev).
// ---------------------------------------------------------------------------

const hdr = (hex: string, m = 1) => new Color(hex).multiplyScalar(m)

// ---- canvas textures -------------------------------------------------------
function tex(cv: HTMLCanvasElement, rx = 1, ry = 1) {
  const t = new CanvasTexture(cv); t.colorSpace = SRGBColorSpace; t.anisotropy = 4
  if (rx !== 1 || ry !== 1) { t.wrapS = t.wrapT = RepeatWrapping; t.repeat.set(rx, ry) }
  return t
}
function tileTexture(base: string, grout: string, rep = 7, sheen = 0.05) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256; const x = cv.getContext('2d')!
  x.fillStyle = base; x.fillRect(0, 0, 256, 256)
  x.strokeStyle = grout; x.lineWidth = 4
  const n = 4, s = 256 / n
  for (let i = 0; i <= n; i++) { x.beginPath(); x.moveTo(i * s, 0); x.lineTo(i * s, 256); x.stroke(); x.beginPath(); x.moveTo(0, i * s); x.lineTo(256, i * s); x.stroke() }
  for (let iy = 0; iy < n; iy++) for (let ix = 0; ix < n; ix++) {
    const g = x.createLinearGradient(ix * s, iy * s, ix * s, iy * s + s)
    g.addColorStop(0, `rgba(255,255,255,${sheen + ((ix + iy) % 3) * 0.015})`)
    g.addColorStop(1, 'rgba(255,255,255,0)')
    x.fillStyle = g; x.fillRect(ix * s + 2, iy * s + 2, s - 4, s - 4)
  }
  return tex(cv, rep, rep)
}
// multipara wave layer — 4 rows (ECG · SpO2 pleth · ART · RESP) drawn with an
// INTEGER number of cycles across the canvas so it tiles seamlessly; the
// monitor scrolls texture.offset.x each frame = running waves.
function multiparaWaveTexture() {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 384; const x = cv.getContext('2d')!
  x.fillStyle = '#050d14'; x.fillRect(0, 0, 512, 384)
  const wave = (mid: number, color: string, cycles: number, kind: 'ecg' | 'pleth' | 'art' | 'resp', amp = 30) => {
    x.strokeStyle = color; x.lineWidth = 2.6; x.shadowColor = color; x.shadowBlur = 7; x.beginPath()
    for (let px = 0; px <= 512; px++) {
      const p = ((px / 512) * cycles) % 1; let y = 0
      if (kind === 'ecg') y = p < 0.1 ? Math.sin(p / 0.1 * Math.PI) * 0.12 : p < 0.2 ? -0.06 : p < 0.24 ? 1 : p < 0.28 ? -0.35 : p < 0.5 ? 0.05 : Math.sin((p - 0.5) / 0.2 * Math.PI) * 0.2
      else if (kind === 'art') { const b = Math.max(0, Math.sin(p * Math.PI * 1.15)); y = Math.pow(b, 1.4) * 0.85 + (p > 0.45 && p < 0.6 ? 0.12 * Math.sin((p - 0.45) / 0.15 * Math.PI) : 0) - 0.1 }
      else if (kind === 'pleth') y = Math.max(0, Math.sin(p * Math.PI)) * 0.72 - 0.08
      else y = Math.sin(p * Math.PI * 2) * 0.45
      const yy = mid - y * amp; px ? x.lineTo(px, yy) : x.moveTo(px, yy)
    }
    x.stroke(); x.shadowBlur = 0
  }
  wave(52, '#39f08a', 6, 'ecg')
  wave(146, '#37c8ff', 5, 'pleth')
  wave(240, '#ff5a55', 5, 'art')
  wave(334, '#ffd24a', 3, 'resp', 22)
  const t = tex(cv); t.wrapS = RepeatWrapping
  return t
}
// multipara static layer — faint grid + header + the numeric column (HR, SpO2,
// ABP, RR, TEMP); transparent over the wave area so the waves run beneath.
function multiparaOverlayTexture() {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 384; const x = cv.getContext('2d')!
  x.clearRect(0, 0, 512, 384)
  x.strokeStyle = 'rgba(70,110,130,.14)'; x.lineWidth = 1
  for (let g = 0; g <= 368; g += 26) { x.beginPath(); x.moveTo(g, 0); x.lineTo(g, 384); x.stroke() }
  for (let g = 0; g <= 384; g += 26) { x.beginPath(); x.moveTo(0, g); x.lineTo(368, g); x.stroke() }
  // numeric side-panel
  x.fillStyle = 'rgba(3,8,13,0.96)'; x.fillRect(368, 0, 144, 384)
  x.strokeStyle = 'rgba(109,130,150,.35)'; x.beginPath(); x.moveTo(368, 0); x.lineTo(368, 384); x.stroke()
  x.textBaseline = 'middle'
  const num = (label: string, val: string, unit: string, color: string, y: number, big = 44) => {
    x.font = '13px ui-monospace, monospace'; x.fillStyle = '#6d8296'; x.textAlign = 'left'
    x.fillText(label, 378, y - 26)
    x.fillStyle = color; x.shadowColor = color; x.shadowBlur = 8
    x.font = `bold ${big}px ui-monospace, monospace`; x.fillText(val, 378, y + 4)
    x.shadowBlur = 0
    if (unit) { x.font = '12px ui-monospace, monospace'; x.fillStyle = '#6d8296'; x.fillText(unit, 462, y + 14) }
  }
  num('HR', '90', 'bpm', '#39f08a', 52)
  num('SpO2', '98', '%', '#37c8ff', 128)
  num('ABP', '121/79', '', '#ff5a55', 204, 30)
  num('RR', '16', '/min', '#ffd24a', 276, 38)
  num('TEMP', '37.2', '°C', '#e8eef2', 344, 30)
  // header
  x.fillStyle = 'rgba(3,8,13,0.85)'; x.fillRect(0, 0, 368, 24)
  x.fillStyle = '#7d93a5'; x.font = 'bold 14px ui-monospace, monospace'; x.textAlign = 'left'
  x.fillText('BAY 04 · ADULT', 10, 12)
  x.fillStyle = '#39f08a'; x.textAlign = 'right'; x.fillText('● MULTIPARA', 358, 12)
  // row labels
  x.textAlign = 'left'; x.font = '12px ui-monospace, monospace'
  x.fillStyle = '#39f08a'; x.fillText('II', 8, 36)
  x.fillStyle = '#37c8ff'; x.fillText('PLETH', 8, 122)
  x.fillStyle = '#ff5a55'; x.fillText('ART', 8, 216)
  x.fillStyle = '#ffd24a'; x.fillText('RESP', 8, 310)
  return tex(cv)
}
// a tiny infusion-channel screen: drug name + colored rate + progress bar
function pumpScreenTexture(drug: string, rate: string, color: string) {
  const cv = document.createElement('canvas'); cv.width = 160; cv.height = 72; const x = cv.getContext('2d')!
  x.fillStyle = '#08111a'; x.fillRect(0, 0, 160, 72)
  x.font = 'bold 15px ui-monospace, monospace'; x.textBaseline = 'middle'
  x.fillStyle = '#9fb4c4'; x.fillText(drug, 10, 13)
  x.fillStyle = color; x.shadowColor = color; x.shadowBlur = 8
  x.font = 'bold 27px ui-monospace, monospace'
  x.fillText(rate, 10, 38)
  x.shadowBlur = 0; x.font = '12px ui-monospace, monospace'; x.fillStyle = '#7d93a5'; x.fillText('mL/h', 108, 40)
  x.fillStyle = 'rgba(125,147,165,.25)'; x.fillRect(10, 56, 140, 7)
  x.fillStyle = color; x.fillRect(10, 56, 96, 7)
  return tex(cv)
}
// ventilator screen — mode, pressure/flow waves, TV · PEEP · FiO2
function ventScreenTexture() {
  const cv = document.createElement('canvas'); cv.width = 320; cv.height = 220; const x = cv.getContext('2d')!
  x.fillStyle = '#050d14'; x.fillRect(0, 0, 320, 220)
  x.fillStyle = '#37e0c8'; x.font = 'bold 17px ui-monospace, monospace'; x.textBaseline = 'middle'
  x.fillText('PC-AC', 12, 18)
  x.fillStyle = '#6d8296'; x.font = '13px ui-monospace, monospace'; x.fillText('RR 16', 88, 18); x.fillText('I:E 1:2', 150, 18)
  const wave = (mid: number, color: string, kind: 'p' | 'f') => {
    x.strokeStyle = color; x.lineWidth = 2.2; x.shadowColor = color; x.shadowBlur = 6; x.beginPath()
    for (let px = 0; px <= 236; px++) {
      const p = (px % 78) / 78; let y = 0
      if (kind === 'p') y = p < 0.12 ? p / 0.12 : p < 0.45 ? 1 - (p - 0.12) * 0.25 : p < 0.55 ? 1 - (p - 0.12) * 0.25 - (p - 0.45) * 6 : 0.05
      else y = p < 0.1 ? p / 0.1 : p < 0.5 ? 1 - (p - 0.1) / 0.4 : p < 0.6 ? -(p - 0.5) / 0.1 * 0.7 : -0.7 + (p - 0.6) / 0.4 * 0.7
      const yy = mid - y * 26; px ? x.lineTo(px, yy) : x.moveTo(px, yy)
    }
    x.stroke(); x.shadowBlur = 0
  }
  wave(70, '#ffd77a', 'p'); wave(136, '#37c8ff', 'f')
  x.textAlign = 'right'
  x.fillStyle = '#37e0c8'; x.font = 'bold 30px ui-monospace, monospace'; x.fillText('420', 306, 62)
  x.fillStyle = '#ffd77a'; x.font = 'bold 26px ui-monospace, monospace'; x.fillText('8', 306, 118)
  x.fillStyle = '#37c8ff'; x.font = 'bold 26px ui-monospace, monospace'; x.fillText('45', 306, 172)
  x.textAlign = 'left'; x.font = '12px ui-monospace, monospace'; x.fillStyle = '#6d8296'
  x.fillText('TV mL', 262, 82); x.fillText('PEEP', 268, 136); x.fillText('FiO2 %', 258, 190)
  x.fillStyle = '#39f08a'; x.fillRect(12, 202, 190, 6)
  return tex(cv)
}
// floating device tag — dark slate pill, accent dot, white label
function tagTexture(label: string, accent: string) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 112; const x = cv.getContext('2d')!
  x.clearRect(0, 0, 512, 112)
  const r = 46
  x.beginPath()
  x.moveTo(r, 8); x.lineTo(512 - r, 8); x.arc(512 - r, 56, 48, -Math.PI / 2, Math.PI / 2)
  x.lineTo(r, 104); x.arc(r, 56, 48, Math.PI / 2, -Math.PI / 2); x.closePath()
  x.fillStyle = 'rgba(40,50,60,0.92)'; x.fill()
  x.strokeStyle = 'rgba(255,255,255,0.25)'; x.lineWidth = 3; x.stroke()
  x.beginPath(); x.arc(58, 56, 15, 0, 7); x.fillStyle = accent; x.shadowColor = accent; x.shadowBlur = 12; x.fill(); x.shadowBlur = 0
  x.fillStyle = '#f2f6f8'; x.font = 'bold 40px ui-sans-serif, system-ui, sans-serif'; x.textBaseline = 'middle'
  x.fillText(label, 96, 58)
  return tex(cv)
}
// the console screen — faithful replica of the ACTUAL app frame (the
// icu/tars ward UI): header (Chandrababu · CRITICAL · ICU — North · staff),
// Panel A body-scan (vitals + connected devices + blue body + ECG strip),
// Panel B TARS orchestration feed (LSAM/ISAM/TARS lines + order pills +
// clinician gate), Panel C LIS lab orders + app dock.
function rrPath(x: CanvasRenderingContext2D, px: number, py: number, w: number, h: number, r: number) {
  x.beginPath()
  x.moveTo(px + r, py)
  x.arcTo(px + w, py, px + w, py + h, r)
  x.arcTo(px + w, py + h, px, py + h, r)
  x.arcTo(px, py + h, px, py, r)
  x.arcTo(px, py, px + w, py, r)
  x.closePath()
}
function tarsSplitTexture() {
  const cv = document.createElement('canvas'); cv.width = 960; cv.height = 640; const x = cv.getContext('2d')!
  x.textBaseline = 'middle'
  const sans = 'ui-sans-serif, system-ui, sans-serif'
  const mono = 'ui-monospace, monospace'
  // app background
  x.fillStyle = '#eef2f4'; x.fillRect(0, 0, 960, 640)
  // ── header bar ────────────────────────────────────────────────────────────
  x.fillStyle = '#fbfcfd'; x.fillRect(0, 0, 960, 64)
  x.fillStyle = '#e3e9ec'; x.fillRect(0, 63, 960, 1)
  x.strokeStyle = '#c6d0d6'; x.lineWidth = 2; x.beginPath(); x.arc(34, 32, 15, 0, 7); x.stroke()
  x.fillStyle = '#8a99a8'; x.beginPath(); x.arc(34, 27, 5, 0, 7); x.fill()
  x.beginPath(); x.arc(34, 42, 9, Math.PI, 0); x.fill()
  x.fillStyle = '#1c242c'; x.font = `bold 22px ${sans}`; x.fillText('Chandrababu', 62, 24)
  rrPath(x, 216, 13, 84, 22, 11); x.fillStyle = '#fdeaee'; x.fill()
  x.strokeStyle = '#f0b3c0'; x.lineWidth = 1.5; x.stroke()
  x.fillStyle = '#d94a62'; x.font = `bold 11px ${sans}`; x.fillText('CRITICAL', 234, 24)
  x.fillStyle = '#8a99a8'; x.font = `12px ${sans}`; x.fillText('Bed 08 · MRN-31890', 62, 47)
  rrPath(x, 350, 17, 132, 30, 15); x.fillStyle = '#ffffff'; x.fill()
  x.strokeStyle = '#d8e0e4'; x.lineWidth = 1.5; x.stroke()
  x.fillStyle = '#3a4750'; x.font = `13px ${sans}`; x.fillText('‹  ICU — North', 366, 32)
  x.fillStyle = '#98a6b2'; x.font = `9px ${mono}`; x.fillText('ATTENDING', 742, 20)
  x.fillStyle = '#1c242c'; x.font = `bold 14px ${sans}`; x.fillText('Dr. Okafor', 742, 40)
  x.fillStyle = '#98a6b2'; x.font = `9px ${mono}`; x.fillText('NURSE', 852, 20)
  x.fillStyle = '#1c242c'; x.font = `bold 14px ${sans}`; x.fillText('N. Adeyemi', 852, 40)
  // ── PANEL A — body scan ──────────────────────────────────────────────────
  const ag = x.createLinearGradient(0, 76, 0, 584)
  ag.addColorStop(0, '#f3f7f8'); ag.addColorStop(1, '#e6edef')
  rrPath(x, 16, 76, 296, 508, 10); x.fillStyle = ag; x.fill()
  x.strokeStyle = '#dfe6ea'; x.lineWidth = 1.5; x.stroke()
  x.fillStyle = '#5a6a76'; x.font = `10px ${mono}`; x.fillText('BODY SCAN · ICU-08', 30, 94)
  const vital = (label: string, val: string, unit: string, y: number) => {
    x.fillStyle = '#7c8b96'; x.font = `10px ${mono}`; x.fillText(label, 30, y)
    x.fillStyle = '#22303a'; x.font = `bold 21px ${mono}`; x.fillText(val, 30, y + 20)
    x.fillStyle = '#96a4ae'; x.font = `9px ${mono}`; x.fillText(unit, 30 + x.measureText(val).width * 2.4 + 8, y + 24)
  }
  vital('HR', '125', 'bpm', 120); vital('BP', '104/65', 'mmHg', 168)
  vital('SpO2', '91', '%', 216); vital('RR', '24', '/min', 264); vital('TEMP', '37.0', '°C', 312)
  x.textAlign = 'right'
  x.fillStyle = '#7c8b96'; x.font = `9px ${mono}`; x.fillText('CONNECTED DEVICES · LIVE', 298, 96)
  x.fillStyle = '#44525c'; x.font = `9px ${mono}`
  ;['O2 · NASAL 4 L/min · FiO2 28%', 'IV · NS 0.9% 80 mL/hr · 18G L-AC', 'NIBP q5m · next 4:11', 'DEFIB PADS STANDBY', 'BED EXIT-ALARM ON'].forEach((l, i) => x.fillText(l, 298, 116 + i * 18))
  x.textAlign = 'left'
  // dial ring + the blue body hologram
  x.save()
  x.strokeStyle = 'rgba(120,150,160,0.4)'; x.lineWidth = 1; x.setLineDash([2, 7])
  x.beginPath(); x.arc(164, 330, 138, 0, 7); x.stroke(); x.setLineDash([])
  x.translate(164, 330)
  const bg2 = x.createLinearGradient(0, -130, 0, 140)
  bg2.addColorStop(0, '#b6d8f4'); bg2.addColorStop(1, '#7cabdb')
  x.fillStyle = bg2; x.shadowColor = '#9cc8ec'; x.shadowBlur = 16; x.globalAlpha = 0.92
  x.beginPath(); x.ellipse(0, -118, 13, 16, 0, 0, 7); x.fill()          // head
  rrPath(x, -25, -98, 50, 84, 20); x.fill()                              // torso
  x.beginPath(); x.ellipse(-32, -56, 7.5, 36, 0.12, 0, 7); x.fill()      // arms
  x.beginPath(); x.ellipse(32, -56, 7.5, 36, -0.12, 0, 7); x.fill()
  rrPath(x, -23, -18, 46, 36, 14); x.fill()                              // hips
  rrPath(x, -21, 16, 17, 104, 8); x.fill()                               // legs
  rrPath(x, 4, 16, 17, 104, 8); x.fill()
  x.restore()
  x.strokeStyle = '#2fbfae'; x.lineWidth = 3
  x.beginPath(); x.ellipse(164, 468, 96, 20, 0, 0, 7); x.stroke()
  x.strokeStyle = 'rgba(47,191,174,0.35)'; x.lineWidth = 1.5
  x.beginPath(); x.ellipse(164, 468, 78, 15, 0, 0, 7); x.stroke()
  // ECG strip
  x.fillStyle = '#7c8b96'; x.font = `9px ${mono}`; x.fillText('ECG · LEAD II', 30, 520)
  x.strokeStyle = '#e8564c'; x.lineWidth = 2; x.shadowColor = '#e8564c'; x.shadowBlur = 5
  x.beginPath()
  for (let px2 = 0; px2 <= 250; px2++) {
    const p = (px2 % 56) / 56
    const y = p < 0.1 ? Math.sin(p / 0.1 * Math.PI) * 0.12 : p < 0.2 ? -0.06 : p < 0.24 ? 1 : p < 0.28 ? -0.35 : p < 0.5 ? 0.05 : Math.sin((p - 0.5) / 0.2 * Math.PI) * 0.18
    const yy = 552 - y * 16
    px2 ? x.lineTo(30 + px2, yy) : x.moveTo(30 + px2, yy)
  }
  x.stroke(); x.shadowBlur = 0
  x.fillStyle = '#2fc86e'; x.font = `9px ${mono}`; x.textAlign = 'right'
  x.fillText('● VISION · LIVE', 298, 566); x.textAlign = 'left'
  // ── PANEL B — TARS orchestration feed ────────────────────────────────────
  const bg3 = x.createLinearGradient(0, 76, 0, 584)
  bg3.addColorStop(0, '#f5f0e9'); bg3.addColorStop(1, '#efe8df')
  rrPath(x, 326, 76, 308, 508, 10); x.fillStyle = bg3; x.fill()
  x.strokeStyle = '#e2d9cc'; x.lineWidth = 1.5; x.stroke()
  const hg = x.createLinearGradient(0, 88, 0, 160)
  hg.addColorStop(0, '#54443a'); hg.addColorStop(1, '#2c221b')
  rrPath(x, 338, 88, 284, 72, 14); x.fillStyle = hg; x.fill()
  x.fillStyle = '#f4efe9'; x.font = `26px Georgia, serif`; x.fillText('TARS', 356, 116)
  x.fillStyle = '#cbb9a8'; x.font = `9px ${mono}`; x.fillText('ORCHESTRATION · PLACING ORDERS', 356, 142)
  x.fillStyle = '#8a7a68'; x.fillText('· · ·', 592, 104)
  const feed: [string, string, string[]][] = [
    ['LSAM', '#2e86e6', ["Chandrababu, 58. His chart's up."]],
    ['ISAM', '#2fc86e', ['Bed 8 — Jagan Mohan. Sepsis — off pressors,', "NEWS2 down to 2. He's ready to step down."]],
    ['LSAM', '#2e86e6', ["Monitor's ugly — HR 119 and climbing, sats", "91, and the ECG's got the front wall lit."]],
    ['ISAM', '#2fc86e', ["Big anterior heart attack. Won't call it yet —", "let's confirm before we commit him."]],
    ['TARS', '#c8802f', ["Cath lab's on standby. Before I commit —", 'bloods and a repeat ECG. Needs your name.']],
  ]
  let fy = 178
  for (const [who, cc, lines] of feed) {
    x.fillStyle = cc; x.beginPath(); x.arc(344, fy + 1, 3.5, 0, 7); x.fill()
    x.font = `bold 9px ${mono}`; x.fillText(who, 354, fy + 2)
    x.fillStyle = '#3c342b'; x.font = `12.5px ${sans}`
    lines.forEach((l, i) => x.fillText(l, 340, fy + 19 + i * 16))
    fy += 24 + lines.length * 16
  }
  const pill = (py: number, c1: string, c2: string, title: string, right: string) => {
    const pg = x.createLinearGradient(0, py, 0, py + 40)
    pg.addColorStop(0, c1); pg.addColorStop(1, c2)
    rrPath(x, 338, py, 284, 40, 12); x.fillStyle = pg; x.fill()
    x.fillStyle = 'rgba(255,255,255,0.85)'; x.beginPath(); x.arc(356, py + 20, 9, 0, 7); x.fill()
    x.fillStyle = '#ffffff'; x.font = `bold 12px ${sans}`; x.fillText(title, 372, py + 14)
    x.font = `9px ${mono}`; x.fillStyle = 'rgba(255,255,255,0.85)'; x.fillText(right, 372, py + 29)
  }
  pill(452, '#43b873', '#2f9e5c', 'Pre-alert cath lab — STANDBY', 'Operational · AUTO · ✓ done')
  pill(500, '#ef8098', '#e2647f', 'STAT troponin + repeat 12-lead', 'Diagnostics · GATED · ✓ authorised')
  x.fillStyle = '#8a7a68'; x.font = `9px ${mono}`; x.textAlign = 'center'
  x.fillText('TARS IS NAVIGATING THE RECORD →', 480, 556); x.textAlign = 'left'
  rrPath(x, 338, 566, 284, 60, 14); x.fillStyle = '#1d2126'; x.fill()
  x.fillStyle = '#f2f6f8'; x.font = `20px Georgia, serif`; x.fillText('Clinician', 356, 592)
  x.fillStyle = '#9aa8b4'; x.font = `8px ${mono}`; x.fillText('CLINICAL GATE · IN THE LOOP', 356, 614)
  // ── PANEL C — LIS lab orders + dock ──────────────────────────────────────
  rrPath(x, 648, 88, 296, 230, 12); x.fillStyle = '#ffffff'; x.fill()
  x.strokeStyle = '#e0e7ea'; x.lineWidth = 1.5; x.stroke()
  rrPath(x, 662, 102, 24, 24, 7); x.fillStyle = '#e8f5ee'; x.fill()
  x.strokeStyle = '#2fae72'; x.lineWidth = 2; x.beginPath(); x.moveTo(668, 120); x.lineTo(680, 108); x.stroke()
  x.fillStyle = '#1c242c'; x.font = `bold 15px ${sans}`; x.fillText('LIS', 696, 114)
  x.fillStyle = '#8a99a8'; x.font = `12px ${sans}`; x.fillText('Lab orders', 728, 114)
  rrPath(x, 662, 140, 216, 34, 10); x.fillStyle = '#2fae72'; x.fill()
  x.fillStyle = '#ffffff'; x.font = `bold 12.5px ${sans}`; x.fillText('+  Place order · STAT Troponin', 676, 157)
  x.fillStyle = '#98a6b2'; x.font = `9px ${mono}`
  x.fillText('TEST', 664, 196); x.fillText('VALUE', 776, 196); x.fillText('REFERENCE', 826, 196); x.fillText('STATUS', 896, 196)
  x.fillStyle = '#e8edf0'; x.fillRect(662, 206, 270, 1)
  x.fillStyle = '#1c242c'; x.font = `bold 12px ${sans}`; x.fillText('Troponin I (STAT)', 664, 226)
  x.fillStyle = '#5a6a76'; x.font = `11px ${sans}`; x.fillText('pending', 776, 226)
  x.fillStyle = '#98a6b2'; x.font = `10px ${sans}`; x.fillText('<0.04 ng/mL', 826, 226)
  rrPath(x, 884, 216, 52, 18, 9); x.fillStyle = '#fdeaea'; x.fill()
  x.fillStyle = '#e05252'; x.font = `bold 8px ${mono}`; x.fillText('PENDING', 891, 226)
  x.fillStyle = '#e8edf0'; x.fillRect(662, 242, 270, 1)
  x.fillStyle = '#1c242c'; x.font = `bold 12px ${sans}`; x.fillText('Lactate', 664, 262)
  x.fillStyle = '#22303a'; x.font = `bold 11px ${sans}`; x.fillText('2.4 ▲', 776, 262)
  x.fillStyle = '#98a6b2'; x.font = `10px ${sans}`; x.fillText('0.5–1.6 mmol/L', 826, 262)
  rrPath(x, 884, 252, 52, 18, 9); x.fillStyle = '#e6f6ec'; x.fill()
  x.fillStyle = '#2fae72'; x.font = `bold 8px ${mono}`; x.fillText('RESULTED', 888, 262)
  // app dock
  rrPath(x, 648, 560, 296, 64, 16); x.fillStyle = '#f4f7f8'; x.fill()
  x.strokeStyle = '#e0e7ea'; x.lineWidth = 1.5; x.stroke()
  const apps: [string, string][] = [['Summary', '#c9d4da'], ['Vitals', '#e05252'], ['LIS', '#2fae72'], ['eMAR', '#e0a03a'], ['Referrals', '#8a6fd6'], ['PACS', '#2e86e6'], ['Notes', '#c9d4da'], ['Case', '#5a6a76']]
  apps.forEach(([name, cc], i) => {
    const ax = 660 + i * 34.5
    rrPath(x, ax, 570, 26, 26, 7); x.fillStyle = '#ffffff'; x.fill()
    x.strokeStyle = i === 2 ? '#2fae72' : '#e0e7ea'; x.lineWidth = i === 2 ? 2 : 1; x.stroke()
    x.fillStyle = cc; rrPath(x, ax + 7, 577, 12, 12, 3); x.fill()
    x.fillStyle = '#7c8b96'; x.font = `6px ${sans}`; x.textAlign = 'center'
    x.fillText(name, ax + 13, 606); x.textAlign = 'left'
  })
  return tex(cv)
}
// dialysis face UI — light medical panel, cyan accents
function dialysisScreenTexture() {
  const cv = document.createElement('canvas'); cv.width = 260; cv.height = 200; const x = cv.getContext('2d')!
  x.fillStyle = '#dfeaf2'; x.fillRect(0, 0, 260, 200)
  x.fillStyle = '#9fb8c9'; x.fillRect(0, 0, 260, 34)
  x.fillStyle = '#eef5fa'; x.font = 'bold 18px ui-sans-serif, system-ui, sans-serif'; x.textBaseline = 'middle'
  x.fillText('CRRT · RUN', 12, 18)
  const row = (y: number, w: number, c: string) => { x.fillStyle = 'rgba(90,120,140,.25)'; x.fillRect(14, y, 232, 12); x.fillStyle = c; x.fillRect(14, y, w, 12) }
  row(52, 170, '#37b8d8'); row(76, 120, '#5ac48a'); row(100, 200, '#37b8d8'); row(124, 90, '#e8b04a')
  x.fillStyle = '#3d5468'; x.font = 'bold 22px ui-monospace, monospace'
  x.fillText('180', 14, 165); x.font = '13px ui-monospace, monospace'; x.fillText('mL/min', 62, 168)
  x.fillStyle = '#37b8d8'; x.font = 'bold 22px ui-monospace, monospace'; x.fillText('1.8 L', 150, 165)
  return tex(cv)
}
// ribbed breathing-circuit hose rings
function hoseTexture() {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 16; const x = cv.getContext('2d')!
  x.fillStyle = '#e6edf0'; x.fillRect(0, 0, 64, 16)
  for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#c3ced4' : '#eef3f5'; x.fillRect(i * 8, 0, 4, 16) }
  const t = tex(cv); t.wrapS = t.wrapT = RepeatWrapping; return t
}
// brushed anodised aluminium — fine horizontal satin grain
function brushedTexture() {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 512; const x = cv.getContext('2d')!
  x.fillStyle = '#c9cdd1'; x.fillRect(0, 0, 512, 512)
  for (let i = 0; i < 1400; i++) {
    const y = Math.random() * 512, w = 40 + Math.random() * 300
    const l = Math.random() > 0.5
    x.fillStyle = `rgba(${l ? '255,255,255' : '40,46,52'},${0.02 + Math.random() * 0.06})`
    x.fillRect(Math.random() * 512, y, w, 1)
  }
  const t = tex(cv); t.wrapS = t.wrapT = RepeatWrapping; return t
}
// the server's light bar — hex-tapered channel, hot white core, cyan bloom
function lightBarTexture() {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 64; const x = cv.getContext('2d')!
  x.fillStyle = '#04090c'; x.fillRect(0, 0, 512, 64)
  const bar = (hh: number, blur: number, c: string) => {
    x.beginPath()
    x.moveTo(16, 32); x.lineTo(16 + hh * 1.7, 32 - hh); x.lineTo(496 - hh * 1.7, 32 - hh)
    x.lineTo(496, 32); x.lineTo(496 - hh * 1.7, 32 + hh); x.lineTo(16 + hh * 1.7, 32 + hh); x.closePath()
    x.fillStyle = c; x.shadowColor = c; x.shadowBlur = blur; x.fill()
  }
  bar(11, 26, 'rgba(25,190,255,0.55)')   // outer cyan bloom
  bar(7, 14, '#2fd4ff')                  // cyan body
  const g = x.createLinearGradient(60, 0, 452, 0)
  g.addColorStop(0, '#aef2ff'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, '#aef2ff')
  x.shadowBlur = 10; x.shadowColor = '#ffffff'
  x.beginPath(); x.moveTo(40, 32); x.lineTo(52, 29); x.lineTo(460, 29); x.lineTo(472, 32); x.lineTo(460, 35); x.lineTo(52, 35); x.closePath()
  x.fillStyle = g; x.fill(); x.shadowBlur = 0
  return tex(cv)
}
// rear micro-perforation hint
function perfTexture() {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64; const x = cv.getContext('2d')!
  x.fillStyle = '#b7bcc1'; x.fillRect(0, 0, 128, 64)
  x.fillStyle = 'rgba(30,34,38,.5)'
  for (let iy = 0; iy < 8; iy++) for (let ix = 0; ix < 16; ix++) { x.beginPath(); x.arc(4 + ix * 8, 4 + iy * 8, 1.1, 0, 7); x.fill() }
  return tex(cv)
}

// ---- shared materials ------------------------------------------------------
const WALL = new MeshStandardMaterial({ map: tileTexture('#c0cec7', '#a2b5ac'), roughness: 0.42, metalness: 0.02, envMapIntensity: 0.45 })
const WALL_BACK = new MeshStandardMaterial({ map: tileTexture('#c4d1cb', '#a6b9b1'), roughness: 0.42, metalness: 0.02, envMapIntensity: 0.45 })
const FLOOR = new MeshStandardMaterial({ map: tileTexture('#8f9694', '#7d8482', 3, 0.015), roughness: 0.5, metalness: 0.05, envMapIntensity: 0.4 })
const CEIL = new MeshStandardMaterial({ color: '#dfe3e1', roughness: 0.9, metalness: 0, emissive: new Color('#dfe6e2'), emissiveIntensity: 0.06 })
const HOUSING = new MeshStandardMaterial({ color: '#eef1f2', roughness: 0.4, metalness: 0.08, envMapIntensity: 0.85 })
const HOUSING2 = new MeshStandardMaterial({ color: '#c3ccd0', roughness: 0.48, metalness: 0.1, envMapIntensity: 0.85 })
const GREYPANEL = new MeshStandardMaterial({ color: '#aeb9bd', roughness: 0.55, metalness: 0.08 })
const POST = new MeshStandardMaterial({ color: '#ccd4d2', roughness: 0.45, metalness: 0.15, envMapIntensity: 0.8 })
const RAIL = new MeshStandardMaterial({ color: '#b2bcc0', roughness: 0.4, metalness: 0.3, envMapIntensity: 0.9 })
const LEAD = new MeshStandardMaterial({ color: '#49545c', roughness: 0.6, metalness: 0.1 })
const CHROME = new MeshStandardMaterial({ color: '#ccd2d8', roughness: 0.22, metalness: 0.95, envMapIntensity: 1.4 })
const ALLOY = new MeshStandardMaterial({ color: '#dfe5e8', roughness: 0.3, metalness: 0.6, envMapIntensity: 1.1 })
const DARKP = new MeshStandardMaterial({ color: '#2b333a', roughness: 0.55, metalness: 0.3 })
const BEZEL = new MeshStandardMaterial({ color: '#10141a', roughness: 0.5, metalness: 0.4 })
// NOTE: no transmission — SwiftShader renders transmissive panes as milk;
// plain low-opacity + clearcoat reads as crisp clinical glass everywhere.
// depthWrite OFF — panes draw before the ribbons (renderOrder) and would
// depth-block every stream seen through the glass from outside cameras.
const GLASS = new MeshPhysicalMaterial({ color: '#e8f4ef', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.16, clearcoat: 0.6, clearcoatRoughness: 0.1, envMapIntensity: 1.1, depthWrite: false })
const VESSEL = new MeshPhysicalMaterial({ color: '#d7e8ef', roughness: 0.15, metalness: 0, transparent: true, opacity: 0.5, clearcoat: 0.5, envMapIntensity: 1.0 })
const BLANKET = new MeshStandardMaterial({ color: '#aacbe2', roughness: 0.8, metalness: 0, emissive: new Color('#8fb4cc'), emissiveIntensity: 0.04 })
const SHEET = new MeshStandardMaterial({ color: '#f3f6f7', roughness: 0.85, metalness: 0 })
const MATTRESS = new MeshStandardMaterial({ color: '#f2f4f5', roughness: 0.7, metalness: 0 })
const BEDBASE = new MeshStandardMaterial({ color: '#b7c1c6', roughness: 0.45, metalness: 0.2, envMapIntensity: 0.9 })
const BEDBLUE = new MeshStandardMaterial({ color: '#a5cde2', roughness: 0.5, metalness: 0.05 })
const SKIN = new MeshStandardMaterial({ color: '#e9cba6', roughness: 0.55, metalness: 0.02 })
const CAP = new MeshStandardMaterial({ color: '#5f9db3', roughness: 0.72, metalness: 0.02 })
const SCRUB = new MeshStandardMaterial({ color: '#4b8fa3', roughness: 0.78, metalness: 0.03 })
const SCRUB2 = new MeshStandardMaterial({ color: '#3f7d92', roughness: 0.78, metalness: 0.03 })
const MASK = new MeshStandardMaterial({ color: '#d9e7ec', roughness: 0.6, metalness: 0.02 })
const PANEL_LIGHT = new MeshBasicMaterial({ color: hdr('#f4faf7', 0.98), toneMapped: false })
const HOSE = new MeshStandardMaterial({ map: hoseTexture(), color: '#eef2f4', roughness: 0.6, metalness: 0.05 })
const TUBE_RED = new MeshStandardMaterial({ color: '#c0392b', roughness: 0.35, metalness: 0.05 })
const TUBE_BLUE = new MeshStandardMaterial({ color: '#2e6fbb', roughness: 0.35, metalness: 0.05 })
const BAG = new MeshPhysicalMaterial({ color: '#cfe2ec', roughness: 0.3, transmission: 0.45, transparent: true, opacity: 0.75 })

const VENT_TEX = ventScreenTexture()
const TARS_TEX = tarsSplitTexture()

// an emissive monitor screen (bezel + glowing face)
function Screen({ pos, rot = [0, 0, 0], size = [0.62, 0.42], map, tint = 1.35 }:
  { pos: [number, number, number]; rot?: [number, number, number]; size?: [number, number]; map: CanvasTexture; tint?: number }) {
  const [w, h] = size
  return (
    <group position={pos} rotation={rot as [number, number, number]}>
      <RoundedBox args={[w + 0.07, h + 0.07, 0.05]} radius={0.02} smoothness={3} material={BEZEL} castShadow />
      <mesh position={[0, 0, 0.028]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={map} color={new Color(tint, tint, tint)} toneMapped={false} />
      </mesh>
    </group>
  )
}
// wall / hanging room sign — "ICU — NORTH · BED 08"
function roomSignTexture() {
  const cv = document.createElement('canvas'); cv.width = 640; cv.height = 176; const x = cv.getContext('2d')!
  x.fillStyle = '#242c31'; x.fillRect(0, 0, 640, 176)
  x.strokeStyle = 'rgba(255,255,255,0.14)'; x.lineWidth = 4; x.strokeRect(6, 6, 628, 164)
  x.fillStyle = '#2fbfae'; x.fillRect(24, 30, 8, 116)
  x.fillStyle = '#f2f6f8'; x.textBaseline = 'middle'
  x.font = 'bold 58px ui-sans-serif, system-ui, sans-serif'
  x.fillText('ICU — NORTH', 56, 66)
  x.font = 'bold 38px ui-monospace, monospace'; x.fillStyle = '#7fd8cc'
  x.fillText('BED 08', 56, 132)
  x.font = '24px ui-monospace, monospace'; x.fillStyle = '#8a99a8'; x.textAlign = 'right'
  x.fillText('BAY 04', 606, 132)
  return tex(cv)
}
const SIGN_TEX = roomSignTexture()
function RoomSign({ pos }: { pos: [number, number, number] }) {
  return (
    <group position={pos}>
      <RoundedBox args={[1.5, 0.42, 0.045]} radius={0.02} smoothness={2} material={DARKP} castShadow />
      <mesh position={[0, 0, 0.024]}>
        <planeGeometry args={[1.42, 0.39]} />
        <meshBasicMaterial map={SIGN_TEX} toneMapped={false} color={new Color(0.95, 0.95, 0.95)} />
      </mesh>
    </group>
  )
}

// floating device label — camera-facing pill on a thin stalk
function Tag({ pos, label, accent, w = 0.62, stalk = 0.22 }:
  { pos: [number, number, number]; label: string; accent: string; w?: number; stalk?: number }) {
  const t = useMemo(() => tagTexture(label, accent), [label, accent])
  return (
    <group position={pos}>
      <mesh position={[0, -stalk / 2, 0]}><cylinderGeometry args={[0.004, 0.004, stalk, 6]} /><primitive object={LEAD} attach="material" /></mesh>
      <Billboard follow>
        <mesh renderOrder={7}>
          <planeGeometry args={[w, w * (112 / 512)]} />
          <meshBasicMaterial map={t} transparent toneMapped={false} depthWrite={false} />
        </mesh>
      </Billboard>
    </group>
  )
}
// straight chrome strut a → b (from the OR boom kit)
function Strut({ a, b, r = 0.04, mat = CHROME }: { a: [number, number, number]; b: [number, number, number]; r?: number; mat?: MeshStandardMaterial }) {
  const av = new Vector3(...a), bv = new Vector3(...b)
  const d = bv.clone().sub(av)
  const len = d.length()
  const mid = av.clone().add(bv).multiplyScalar(0.5)
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.normalize())
  return (
    <mesh position={[mid.x, mid.y, mid.z]} quaternion={q}>
      <cylinderGeometry args={[r, r, len, 12]} />
      <primitive object={mat} attach="material" />
    </mesh>
  )
}
// a smooth hose / tube along waypoints
function Hose({ pts, r = 0.034, mat = HOSE, rep = 14 }: { pts: [number, number, number][]; r?: number; mat?: MeshStandardMaterial; rep?: number }) {
  const geo = useMemo(() => {
    const curve = new CatmullRomCurve3(pts.map((p) => new Vector3(...p)), false, 'centripetal', 0.5)
    const g = new TubeGeometry(curve, 60, r, 10, false)
    return g
  }, [pts, r])
  const m = useMemo(() => {
    if (mat !== HOSE) return mat
    const c = mat.clone(); const t = (c.map as CanvasTexture).clone()
    t.needsUpdate = true; t.repeat.set(rep, 1); c.map = t
    return c
  }, [mat, rep])
  return <mesh geometry={geo} material={m} castShadow />
}

// ===========================================================================
//  DATA RIBBONS — the sentient story layer. Flat glowing bands sampled along
//  a CatmullRom path (parallel-transport frames), with animated packet dashes
//  streaming device → patient → server. Each ribbon = soft halo + bright core
//  (HDR > bloom threshold, ACES at the end of the post chain).
// ===========================================================================
const RIBBON_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const RIBBON_FRAG = /* glsl */ `
  uniform float uTime; uniform vec3 uColor; uniform float uSpeed; uniform float uDash;
  uniform float uMaster; uniform float uHalo; uniform float uReveal;
  varying vec2 vUv;
  void main() {
    float across = abs(vUv.y - 0.5) * 2.0;
    float edge = 1.0 - smoothstep(0.6, 1.0, across);
    float core = 1.0 - smoothstep(0.0, 0.5, across);
    float d = fract(vUv.x * uDash - uTime * uSpeed);
    float seg = smoothstep(0.02, 0.12, d) * (1.0 - smoothstep(0.5, 0.6, d));
    float endFade = smoothstep(0.0, 0.05, vUv.x) * (1.0 - smoothstep(0.96, 1.0, vUv.x));
    // tour reveal: the stream EMERGES from its device (uv.x=0) toward the
    // server; a hot head leads the growing tip
    float reveal = 1.0 - smoothstep(uReveal - 0.05, uReveal, vUv.x);
    float head = smoothstep(uReveal - 0.12, uReveal - 0.045, vUv.x) * (1.0 - smoothstep(uReveal - 0.03, uReveal, vUv.x));
    vec3 col = mix(uColor, vec3(1.35), core * 0.55) * (1.0 + head * 1.4);
    float bright = (0.55 + 0.8 * seg) * uMaster;
    float a = mix(edge * endFade * (0.5 + 0.42 * seg + 0.5 * head), edge * endFade * 0.1, uHalo) * reveal;
    gl_FragColor = vec4(col * bright, a);
  }
`
function ribbonGeometry(pts: [number, number, number][], width: number, segs = 220) {
  const curve = new CatmullRomCurve3(pts.map((p) => new Vector3(...p)), false, 'centripetal', 0.5)
  const frames = curve.computeFrenetFrames(segs, false)
  const pos = new Float32Array((segs + 1) * 2 * 3)
  const uv = new Float32Array((segs + 1) * 2 * 2)
  const idx: number[] = []
  const p = new Vector3()
  // BANKED FLAT like the illustration: width axis = horizontal perpendicular
  // to the path, tilted ~30° up — level cameras AND high three-quarter
  // cameras both see the band broadside (pure-flat goes edge-on at camera
  // height). Frenet fallback on near-vertical dives; sign continuity so the
  // strip never twist-flips.
  const up = new Vector3(0, 1, 0)
  const tang = new Vector3()
  const bin = new Vector3()
  const prev = new Vector3()
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    curve.getPointAt(t, p)
    curve.getTangentAt(t, tang)
    bin.crossVectors(tang, up)
    if (bin.lengthSq() < 0.02) bin.copy(frames.binormals[i])
    bin.normalize()
    if (i > 0 && bin.dot(prev) < 0) bin.negate()
    bin.addScaledVector(up, 0.6).normalize()
    prev.copy(bin)
    const hw = width / 2
    pos.set([p.x + bin.x * hw, p.y + bin.y * hw, p.z + bin.z * hw, p.x - bin.x * hw, p.y - bin.y * hw, p.z - bin.z * hw], i * 6)
    uv.set([t, 1, t, 0], i * 4)
    if (i < segs) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('uv', new BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}
function Ribbon({ pts, color, width = 0.13, speed = 0.55, dash = 9, master = 1.5, on = true, lag = 1.5 }:
  { pts: [number, number, number][]; color: string; width?: number; speed?: number; dash?: number; master?: number; on?: boolean; lag?: number }) {
  const geoCore = useMemo(() => ribbonGeometry(pts, width), [pts, width])
  const geoHalo = useMemo(() => ribbonGeometry(pts, width * 2.5), [pts, width])
  const mk = (halo: number) => new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uColor: { value: hdr(color, 1.25) },
      uSpeed: { value: speed }, uDash: { value: dash },
      uMaster: { value: halo ? master * 0.7 : master }, uHalo: { value: halo },
      uReveal: { value: on ? 1.1 : 0 }, // deep-links land in-state; tour animates
    },
    vertexShader: RIBBON_VERT, fragmentShader: RIBBON_FRAG,
    transparent: true, depthWrite: false, side: DoubleSide,
    blending: halo ? AdditiveBlending : NormalBlending,
  })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const matCore = useMemo(() => mk(0), [color, speed, dash, master])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const matHalo = useMemo(() => mk(1), [color, speed, dash, master])
  useFrame((s, dt) => {
    matCore.uniforms.uTime.value = s.clock.elapsedTime
    matHalo.uniforms.uTime.value = s.clock.elapsedTime
    // staggered grow-out (device → server); lag differs per ribbon
    const cur = matCore.uniforms.uReveal.value as number
    const next = MathUtils.damp(cur, on ? 1.1 : 0, lag * 0.55, dt)
    matCore.uniforms.uReveal.value = next
    matHalo.uniforms.uReveal.value = next
  })
  return (
    <group>
      <mesh geometry={geoHalo} material={matHalo} renderOrder={8} />
      <mesh geometry={geoCore} material={matCore} renderOrder={9} />
    </group>
  )
}

// the patient's chest — where the physical leads land (electrodes)
const CHEST: [number, number, number] = [0.15, 0.88, -1.0]
// every data stream converges HERE — the edge server's light bar, on the
// foot-of-bed console (station at (0.2, 2.1) ry π, server ry 0.15; the bar
// faces BACK up the bed axis toward the patient)
const DOCK: [number, number, number] = [0.165, 1.05, 1.78]
// fan the endpoints along the bar's width axis (≈ (-0.99, 0, 0.15) in world)
const dock = (s: number, dy = 0): [number, number, number] => [DOCK[0] - 0.99 * s, DOCK[1] + dy, DOCK[2] + 0.15 * s]

function DataRibbons({ on }: { on: boolean }) {
  return (
    <group>
      {/* ventilator → server (mint) — down the left side, over the foot */}
      <Ribbon on={on} lag={1.9} pts={[[-1.85, 1.5, -2.4], [-1.6, 2.3, -0.4], [-0.7, 1.7, 1.25], dock(-0.13, 0.03)]} color="#5fe8c8" />
      {/* console screen → server (pale blue) — short hop down the mast */}
      <Ribbon on={on} lag={1.1} pts={[[0.14, 1.72, 1.88], [0.16, 1.4, 1.84], dock(-0.02, 0.01)]} color="#8fd0ff" width={0.08} dash={7} />
      {/* MULTIPARA monitor → server (pale blue) — along the bed's left rail */}
      <Ribbon on={on} lag={1.7} pts={[[-1.42, 1.9, -1.72], [-1.15, 2.35, -0.1], [-0.45, 1.75, 1.3], dock(-0.08, 0.02)]} color="#8fd0ff" speed={0.6} />
      {/* infusion stack → server (magenta) — arcs the length of the bed */}
      <Ribbon on={on} lag={1.55} pts={[[1.35, 2.0, -2.45], [1.05, 2.55, -0.5], [0.55, 1.85, 1.15], dock(0.05, 0.02)]} color="#ff9ad5" speed={0.7} />
      {/* syringe pumps → server (amber) */}
      <Ribbon on={on} lag={1.4} pts={[[2.32, 1.4, -1.35], [1.7, 2.1, 0.3], [0.95, 1.65, 1.4], dock(0.1, 0.03)]} color="#ffd77a" speed={0.45} />
      {/* dialysis → server (pink) — across the foot corner */}
      <Ribbon on={on} lag={1.25} pts={[[3.2, 1.75, 0.68], [2.0, 2.3, 1.7], [1.05, 1.6, 2.0], dock(0.14, 0.02)]} color="#ffa8c8" speed={0.6} />
      {/* network feed arriving through the glass wall → server (cyan) */}
      <Ribbon on={on} lag={0.95} pts={[[7.6, 2.5, 2.9], [4.62, 2.4, 2.7], [2.3, 2.4, 2.6], [1.1, 1.8, 2.25], dock(0.02, 0.08)]} color="#6fe0e8" width={0.09} speed={0.8} />
    </group>
  )
}

// physical patient wiring — ECG leads + electrodes, arterial line, CRRT blood
// lines. Dumb cables, no glow: the DATA leaves via the MULTIPARA's ribbon.
function PatientLeads() {
  const electrodes: [number, number, number][] = [[0.0, 0.885, -1.06], CHEST, [0.32, 0.87, -0.92]]
  return (
    <group>
      {/* 3-lead ECG from the multipara's side port, short bedside drape,
          approaching flat along the blanket */}
      {electrodes.map((e, i) => (
        <Hose key={i} pts={[[-1.24, 1.3 + i * 0.02, -1.97], [-0.85, 0.92, -1.6], [e[0] - 0.32, e[1] + 0.06, e[2] - 0.4], e]} r={0.007} mat={LEAD} />
      ))}
      {electrodes.map((e, i) => (
        <mesh key={i} position={e}><cylinderGeometry args={[0.022, 0.026, 0.012, 14]} /><primitive object={LEAD} attach="material" /></mesh>
      ))}
      {/* CRRT blood lines — red out / blue return, running LOW along the floor
          then up over the right bed edge */}
      <Hose pts={[[3.0, 0.78, 0.62], [2.1, 0.28, 0.15], [1.25, 0.3, -0.3], [0.8, 0.7, -0.52]]} r={0.011} mat={TUBE_RED} />
      <Hose pts={[[3.02, 0.68, 0.55], [2.15, 0.22, 0.05], [1.3, 0.26, -0.42], [0.82, 0.68, -0.64]]} r={0.011} mat={TUBE_BLUE} />
    </group>
  )
}

// ===========================================================================
//  THE EDGE SERVER — compact edge-compute node, built to spec: 4:4:1 brushed
//  anodised-alu unibody slab, generous corner radius, recessed cyan light bar
//  with hot white core + hex-taper ends, tiny red status LED, micro-perf rear,
//  matte-dark recessed base ring. Lives on the wall shelf; the trunk ribbon
//  terminates at its light bar.
// ===========================================================================
const BRUSHED = brushedTexture()
const ALU = new MeshStandardMaterial({
  map: BRUSHED, color: '#b4bac0', roughness: 0.34, metalness: 0.74,
  envMapIntensity: 1.0, bumpMap: BRUSHED, bumpScale: 0.0015,
})
const BAR_TEX = lightBarTexture()
const PERF_TEX = perfTexture()

function EdgeServer({ pos, ry = 0, float = false, specs = false }:
  { pos: [number, number, number]; ry?: number; float?: boolean; specs?: boolean }) {
  const g = useRef<import('three').Group>(null)
  // deep-links (?shot=6) land already-floated; live tour transitions animate
  const booted = useRef(false)
  useEffect(() => {
    if (!booted.current && g.current) { g.current.position.y = float ? 0.32 : 0; booted.current = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // product moment: levitate + slow turntable; on settle, ease back down and
  // unwind to the seated orientation
  useFrame((s, dt) => {
    const gr = g.current; if (!gr) return
    gr.position.y = MathUtils.damp(gr.position.y, float ? 0.32 : 0, 2.0, dt)
    if (float) {
      gr.rotation.y += dt * 0.7
      gr.position.y += Math.sin(s.clock.elapsedTime * 1.7) * 0.0012
    } else {
      const snapped = Math.round(gr.rotation.y / (Math.PI * 2)) * Math.PI * 2
      gr.rotation.y = MathUtils.damp(gr.rotation.y, snapped, 2.6, dt)
    }
  })
  return (
    <group position={pos} rotation-y={ry}>
      <group ref={g}>
      {/* product spec callouts — shown while the server floats */}
      {specs && (
        <>
          <Tag pos={[-0.58, 0.3, 0.14]} label="MACHINED UNIBODY · ALU" accent="#b8c4cc" w={0.62} stalk={0.2} />
          <Tag pos={[0.56, 0.16, 0.3]} label="LIGHT CHANNEL · STATUS" accent="#2fd4ff" w={0.58} stalk={0.12} />
          <Tag pos={[0.55, 0.42, -0.26]} label="MICRO-PERF VENT" accent="#8a99a8" w={0.5} stalk={0.3} />
          <Tag pos={[-0.52, 0.52, -0.12]} label="EDGE COMPUTE CORE" accent="#4fe8d8" w={0.56} stalk={0.36} />
        </>
      )}
      {/* recessed matte-dark base ring */}
      <mesh position={[0, 0.011, 0]}><cylinderGeometry args={[0.165, 0.175, 0.022, 36]} /><meshStandardMaterial color="#3a4046" roughness={0.85} metalness={0.1} /></mesh>
      {/* the unibody slab — 4 : 4 : 1, machined edge */}
      <RoundedBox args={[0.46, 0.115, 0.46]} radius={0.028} smoothness={4} position={[0, 0.0795, 0]} material={ALU} castShadow />
      {/* light-bar channel, recessed into the front face */}
      <mesh position={[0, 0.082, 0.2302]}><planeGeometry args={[0.37, 0.044]} /><meshStandardMaterial color="#07141a" roughness={0.4} metalness={0.5} /></mesh>
      <mesh position={[0, 0.082, 0.2312]}>
        <planeGeometry args={[0.35, 0.034]} />
        <meshBasicMaterial map={BAR_TEX} color={hdr('#ffffff', 1.3)} toneMapped={false} transparent depthWrite={false} />
      </mesh>
      {/* tiny red status LED, low right */}
      <mesh position={[0.185, 0.045, 0.2305]}><circleGeometry args={[0.006, 12]} /><meshBasicMaterial color={hdr('#ff3b30', 1.4)} toneMapped={false} /></mesh>
      {/* micro-perf rear vent */}
      <mesh position={[0, 0.082, -0.2305]} rotation-y={Math.PI}><planeGeometry args={[0.36, 0.07]} /><meshStandardMaterial map={PERF_TEX} roughness={0.6} metalness={0.4} /></mesh>
      {/* the bar's cyan spill onto shelf + wall */}
      <pointLight position={[0, 0.09, 0.3]} intensity={1.4} distance={1.1} decay={2} color={'#2fd4ff'} />
      </group>
    </group>
  )
}

// ---- the room shell --------------------------------------------------------
function Room() {
  return (
    <group>
      {/* floor + a soft corridor slab beyond the glass */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0.3]} receiveShadow>
        <planeGeometry args={[12, 12]} /><primitive object={FLOOR} attach="material" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[6.5, -0.002, 0.3]} receiveShadow>
        <planeGeometry args={[4, 12]} /><meshStandardMaterial color="#878d8b" roughness={0.55} />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position={[0, 3.7, 0.3]}>
        <planeGeometry args={[12, 12]} /><primitive object={CEIL} attach="material" />
      </mesh>
      {/* back + left walls */}
      <mesh position={[0, 1.85, -5]} receiveShadow><planeGeometry args={[12, 3.7]} /><primitive object={WALL_BACK} attach="material" /></mesh>
      <mesh position={[-5, 1.85, 0.3]} rotation-y={Math.PI / 2} receiveShadow><planeGeometry args={[12, 3.7]} /><primitive object={WALL} attach="material" /></mesh>
      {/* corridor's far wall, seen through the glass */}
      <mesh position={[8.4, 1.85, 0.3]} rotation-y={-Math.PI / 2}><planeGeometry args={[12, 3.7]} /><meshStandardMaterial color="#e3eae6" roughness={0.6} /></mesh>
      {/* skirting + light-grey dado band + equipment rail (the grey pass) */}
      <mesh position={[0, 0.06, -4.985]}><boxGeometry args={[12, 0.12, 0.03]} /><primitive object={GREYPANEL} attach="material" /></mesh>
      <mesh position={[-4.985, 0.06, 0.3]} rotation-y={Math.PI / 2}><boxGeometry args={[12, 0.12, 0.03]} /><primitive object={GREYPANEL} attach="material" /></mesh>
      <mesh position={[0, 1.02, -4.982]}><boxGeometry args={[12, 0.26, 0.025]} /><primitive object={HOUSING2} attach="material" /></mesh>
      <mesh position={[-4.982, 1.02, 0.3]} rotation-y={Math.PI / 2}><boxGeometry args={[12, 0.26, 0.025]} /><primitive object={HOUSING2} attach="material" /></mesh>
      {/* stainless handrail tubes on standoff brackets (the metal railing) */}
      <mesh position={[0, 1.16, -4.9]} rotation-z={Math.PI / 2}><cylinderGeometry args={[0.03, 0.03, 11.4, 14]} /><primitive object={CHROME} attach="material" /></mesh>
      <mesh position={[-4.9, 1.16, 0.3]} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.03, 0.03, 11.4, 14]} /><primitive object={CHROME} attach="material" /></mesh>
      {[-4.5, -1.5, 1.5, 4.5].map((x, i) => (
        <mesh key={`hb${i}`} position={[x, 1.16, -4.95]}><boxGeometry args={[0.05, 0.05, 0.1]} /><primitive object={RAIL} attach="material" /></mesh>
      ))}
      {[-4.2, -1.2, 1.8, 4.8].map((z, i) => (
        <mesh key={`hl${i}`} position={[-4.95, 1.16, z]}><boxGeometry args={[0.1, 0.05, 0.05]} /><primitive object={RAIL} attach="material" /></mesh>
      ))}
      {/* room signage — head wall + hanging off the leg-side glass header */}
      <RoomSign pos={[0.9, 3.0, -4.96]} />
      <group position={[3.4, 2.62, 4.16]} rotation-y={Math.PI}>
        {[-0.55, 0.55].map((dx, i) => (
          <mesh key={i} position={[dx, 0.33, 0]}><cylinderGeometry args={[0.012, 0.012, 0.28, 8]} /><primitive object={CHROME} attach="material" /></mesh>
        ))}
        <RoomSign pos={[0, 0, 0]} />
      </group>
      {/* ceiling T-grid strips between the luminaires */}
      <mesh position={[-0.4, 3.69, 0.3]}><boxGeometry args={[0.1, 0.015, 12]} /><primitive object={HOUSING2} attach="material" /></mesh>
      <mesh position={[0, 3.69, -0.9]}><boxGeometry args={[12, 0.015, 0.1]} /><primitive object={HOUSING2} attach="material" /></mesh>
      <mesh position={[0, 3.69, 2.2]}><boxGeometry args={[12, 0.015, 0.1]} /><primitive object={HOUSING2} attach="material" /></mesh>
      {/* darker grey floor zone grounding the bed + head wall */}
      <mesh rotation-x={-Math.PI / 2} position={[0.2, 0.006, -1.2]} receiveShadow>
        <planeGeometry args={[3.6, 4.4]} /><meshStandardMaterial color="#848a88" roughness={0.55} metalness={0.03} />
      </mesh>
    </group>
  )
}
// big flush ceiling luminaires (the ref's high-key light source)
function CeilingPanels() {
  const spots: [number, number][] = [[-2.5, -2.6], [1.7, -2.6], [-2.5, 0.9], [1.7, 0.9], [-0.4, 3.1]]
  return (
    <group>
      {spots.map(([px, pz], i) => (
        <group key={i} position={[px, 3.68, pz]}>
          <RoundedBox args={[2.1, 0.06, 1.35]} radius={0.02} smoothness={2} material={HOUSING} />
          <mesh position={[0, -0.035, 0]} rotation-x={Math.PI / 2}>
            <planeGeometry args={[1.9, 1.15]} />
            <primitive object={PANEL_LIGHT} attach="material" />
          </mesh>
          <pointLight position={[0, -0.6, 0]} intensity={4.5} distance={9} decay={2} color={'#f2f8f5'} />
        </group>
      ))}
    </group>
  )
}
// glass partition — right wall + front-right return, white posts + rails
function GlassWall() {
  const posts = [-5, -2.6, -0.2, 2.2, 4.2] // z positions along the right run
  return (
    <group>
      {/* right run x = 4.6 */}
      {posts.map((z, i) => (
        <mesh key={i} position={[4.6, 1.55, z]} castShadow><boxGeometry args={[0.09, 3.1, 0.09]} /><primitive object={POST} attach="material" /></mesh>
      ))}
      <mesh position={[4.6, 3.06, -0.4]}><boxGeometry args={[0.11, 0.1, 9.2]} /><primitive object={POST} attach="material" /></mesh>
      <mesh position={[4.6, 0.05, -0.4]}><boxGeometry args={[0.11, 0.1, 9.2]} /><primitive object={GREYPANEL} attach="material" /></mesh>
      <mesh position={[4.6, 1.55, -0.4]}><boxGeometry args={[0.025, 2.9, 9.1]} /><primitive object={GLASS} attach="material" /></mesh>
      {/* front-right return z = 4.2 */}
      <mesh position={[3.4, 3.06, 4.2]}><boxGeometry args={[2.5, 0.1, 0.11]} /><primitive object={POST} attach="material" /></mesh>
      <mesh position={[3.4, 0.05, 4.2]}><boxGeometry args={[2.5, 0.1, 0.11]} /><primitive object={GREYPANEL} attach="material" /></mesh>
      <mesh position={[2.2, 1.55, 4.2]} castShadow><boxGeometry args={[0.09, 3.1, 0.09]} /><primitive object={POST} attach="material" /></mesh>
      <mesh position={[3.4, 1.55, 4.2]}><boxGeometry args={[2.4, 2.9, 0.025]} /><primitive object={GLASS} attach="material" /></mesh>
    </group>
  )
}

// ---- the ICU bed + patient -------------------------------------------------
function Bed() {
  return (
    <group position={[0.2, 0, -0.6]}>
      {/* base + lift columns + castors */}
      <RoundedBox args={[0.78, 0.26, 1.6] as [number, number, number]} radius={0.06} smoothness={3} position={[0, 0.24, 0]} material={BEDBASE} castShadow />
      <mesh position={[0, 0.24, 0]}><boxGeometry args={[0.8, 0.05, 1.62]} /><primitive object={BEDBLUE} attach="material" /></mesh>
      {[[-0.32, -0.62], [0.32, -0.62], [-0.32, 0.62], [0.32, 0.62]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.09, 0]}><cylinderGeometry args={[0.035, 0.035, 0.2, 10]} /><primitive object={DARKP} attach="material" /></mesh>
          <mesh position={[0, 0.045, 0.02]}><sphereGeometry args={[0.05, 12, 10]} /><primitive object={DARKP} attach="material" /></mesh>
        </group>
      ))}
      {/* deck + mattress, head section raised */}
      <RoundedBox args={[0.95, 0.09, 2.2]} radius={0.03} smoothness={3} position={[0, 0.47, 0]} material={BEDBASE} castShadow />
      <RoundedBox args={[0.92, 0.13, 1.28]} radius={0.05} smoothness={3} position={[0, 0.57, 0.42]} material={MATTRESS} castShadow />
      <RoundedBox args={[0.92, 0.13, 0.95]} radius={0.05} smoothness={3} position={[0, 0.68, -0.62]} rotation-x={0.34} material={MATTRESS} castShadow />
      {/* pillow + patient head on the raised section */}
      <RoundedBox args={[0.6, 0.09, 0.34]} radius={0.04} smoothness={3} position={[0, 0.83, -0.83]} rotation-x={0.34} material={SHEET} />
      <mesh position={[0, 0.92, -0.86]} castShadow><sphereGeometry args={[0.115, 20, 16]} /><primitive object={SKIN} attach="material" /></mesh>
      {/* blanket mounds — overlapped into one continuous draped body */}
      <mesh position={[0, 0.74, -0.45]} scale={[0.68, 0.3, 0.95]} castShadow><sphereGeometry args={[0.5, 24, 18]} /><primitive object={BLANKET} attach="material" /></mesh>
      <mesh position={[0, 0.66, -0.02]} scale={[0.64, 0.26, 0.95]} castShadow><sphereGeometry args={[0.5, 24, 18]} /><primitive object={BLANKET} attach="material" /></mesh>
      <mesh position={[0, 0.62, 0.42]} scale={[0.58, 0.22, 1.0]}><sphereGeometry args={[0.5, 24, 18]} /><primitive object={BLANKET} attach="material" /></mesh>
      {[-0.12, 0.12].map((dx, i) => (
        <mesh key={i} position={[dx, 0.64, 0.88]} scale={[0.85, 1.05, 1.3]}><sphereGeometry args={[0.085, 14, 12]} /><primitive object={BLANKET} attach="material" /></mesh>
      ))}
      {/* folded sheet edge across the chest */}
      <RoundedBox args={[0.9, 0.05, 0.22]} radius={0.02} smoothness={2} position={[0, 0.85, -0.6]} rotation-x={0.3} material={SHEET} />
      {/* side rails (head half) */}
      {[-0.5, 0.5].map((sx, i) => (
        <group key={i} position={[sx, 0, -0.45]}>
          <mesh position={[0, 0.88, 0]} rotation-x={Math.PI / 2}><capsuleGeometry args={[0.024, 0.85, 6, 10]} /><primitive object={ALLOY} attach="material" /></mesh>
          <mesh position={[0, 0.72, 0]} rotation-x={Math.PI / 2}><capsuleGeometry args={[0.024, 0.85, 6, 10]} /><primitive object={ALLOY} attach="material" /></mesh>
          {[-0.36, 0, 0.36].map((dz, j) => (
            <mesh key={j} position={[0, 0.66, dz]}><cylinderGeometry args={[0.02, 0.02, 0.34, 8]} /><primitive object={ALLOY} attach="material" /></mesh>
          ))}
        </group>
      ))}
      {/* head + foot boards */}
      <RoundedBox args={[0.9, 0.5, 0.06]} radius={0.05} smoothness={3} position={[0, 0.78, -1.14]} rotation-x={0.15} material={HOUSING} castShadow />
      <RoundedBox args={[0.9, 0.45, 0.06]} radius={0.05} smoothness={3} position={[0, 0.62, 1.12]} material={BEDBLUE} castShadow />
    </group>
  )
}

// ---- staff (from the OR silhouette kit, re-dressed in teal) ----------------
function StaffFigure({ pos, ry = 0, lean = 0.12, gown = SCRUB }: {
  pos: [number, number, number]; ry?: number; lean?: number; gown?: MeshStandardMaterial
}) {
  const hipY = 0.95
  return (
    <group position={pos} rotation-y={ry}>
      <mesh position={[0, hipY / 2 + 0.02, 0]} castShadow>
        <cylinderGeometry args={[0.155, 0.2, hipY, 14]} /><primitive object={gown} attach="material" />
      </mesh>
      <group position={[0, hipY, 0]} rotation-x={lean}>
        <mesh position={[0, 0.22, 0]} castShadow><capsuleGeometry args={[0.17, 0.26, 6, 14]} /><primitive object={gown} attach="material" /></mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.21, 0.26, 0.08]} rotation-x={-0.9} rotation-z={s * 0.18}>
            <capsuleGeometry args={[0.045, 0.34, 6, 10]} /><primitive object={gown} attach="material" />
          </mesh>
        ))}
        <mesh position={[0, 0.56, 0]}><sphereGeometry args={[0.1, 18, 14]} /><primitive object={SKIN} attach="material" /></mesh>
        <mesh position={[0, 0.6, -0.012]} scale={[1, 0.7, 1]}><sphereGeometry args={[0.108, 18, 14]} /><primitive object={CAP} attach="material" /></mesh>
        <mesh position={[0, 0.53, 0.078]} scale={[1, 0.9, 0.5]}><sphereGeometry args={[0.07, 14, 10]} /><primitive object={MASK} attach="material" /></mesh>
      </group>
    </group>
  )
}

// ---- devices ---------------------------------------------------------------
// wall monitor station: track + articulated arm + big vitals screen; the shelf
// below carries the EDGE SERVER
// the SENTIENT CONSOLE — freestanding mast at the FOOT of the bed, ON the bed
// axis: heavy base, column, the app-UI screen facing back up the bed at the
// patient, and the EDGE SERVER on its mid-shelf. Every ribbon docks here.
function MonitorStation({ float = false, specs = false }: { float?: boolean; specs?: boolean }) {
  return (
    <group position={[0.2, 0, 2.1]} rotation-y={Math.PI}>
      {/* base + mast */}
      <mesh position={[0, 0.035, 0]}><cylinderGeometry args={[0.34, 0.42, 0.07, 6]} /><primitive object={DARKP} attach="material" /></mesh>
      <mesh position={[0, 0.03, 0]}><cylinderGeometry args={[0.43, 0.45, 0.02, 6]} /><primitive object={GREYPANEL} attach="material" /></mesh>
      <mesh position={[0, 1.2, 0]}><cylinderGeometry args={[0.045, 0.058, 2.34, 14]} /><primitive object={RAIL} attach="material" /></mesh>
      <mesh position={[0, 2.38, 0]}><sphereGeometry args={[0.055, 12, 12]} /><primitive object={HOUSING2} attach="material" /></mesh>
      {/* the app-UI surface — body scan | TARS feed | LIS (the real frame) */}
      <Strut a={[0, 2.3, 0]} b={[0, 2.24, 0.14]} r={0.028} mat={RAIL} />
      <Screen pos={[0, 2.02, 0.2]} rot={[0.04, 0, 0]} size={[0.99, 0.66]} map={TARS_TEX} tint={1.06} />
      {/* mid-shelf + the server */}
      <RoundedBox args={[0.74, 0.04, 0.52]} radius={0.015} smoothness={2} position={[0, 0.93, 0.06]} material={HOUSING} castShadow />
      <mesh position={[0, 0.905, 0.06]}><boxGeometry args={[0.74, 0.012, 0.52]} /><primitive object={GREYPANEL} attach="material" /></mesh>
      {[-0.28, 0.28].map((x, i) => (
        <mesh key={i} position={[x, 0.82, -0.02]} rotation-x={0.4}><boxGeometry args={[0.045, 0.2, 0.03]} /><primitive object={HOUSING2} attach="material" /></mesh>
      ))}
      <EdgeServer pos={[0, 0.95, 0.09]} ry={0.15} float={float} specs={specs} />
      {/* cable drop from server down the mast */}
      <Hose pts={[[0, 0.94, -0.12], [0, 0.5, -0.06], [0, 0.12, 0]]} r={0.012} mat={LEAD} />
      {!specs && <Tag pos={[0.52, 1.5, 0.12]} label="EDGE NODE" accent="#4fe8d8" w={0.56} stalk={0.3} />}
    </group>
  )
}
// ventilator cart + breathing circuit to the patient's head
function Ventilator() {
  return (
    <group>
      <group position={[-2.05, 0, -2.5]} rotation-y={0.5}>
        <RoundedBox args={[0.8, 1.06, 0.6]} radius={0.06} smoothness={3} position={[0, 0.78, 0]} material={HOUSING} castShadow />
        {/* grey flank panels + pedestal (two-tone) */}
        <mesh position={[-0.38, 0.78, 0]}><boxGeometry args={[0.06, 0.9, 0.52]} /><primitive object={GREYPANEL} attach="material" /></mesh>
        <mesh position={[0, 0.28, 0]}><boxGeometry args={[0.62, 0.16, 0.5]} /><primitive object={GREYPANEL} attach="material" /></mesh>
        {/* mode / waves / TV·PEEP·FiO2 screen */}
        <Screen pos={[0, 1.08, 0.31]} rot={[-0.1, 0, 0]} size={[0.5, 0.34]} map={VENT_TEX} tint={1.2} />
        {/* dials + status strip */}
        {[0, 1, 2].map((i) => <mesh key={i} position={[-0.2 + i * 0.2, 0.62, 0.31]} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.045, 0.045, 0.03, 16]} /><primitive object={CHROME} attach="material" /></mesh>)}
        <mesh position={[0, 0.42, 0.31]}><planeGeometry args={[0.5, 0.02]} /><meshBasicMaterial color={hdr('#37e0c8', 1.3)} toneMapped={false} /></mesh>
        {/* humidifier chamber on the right flank */}
        <mesh position={[0.44, 0.62, 0.12]} castShadow><cylinderGeometry args={[0.06, 0.06, 0.14, 16]} /><primitive object={VESSEL} attach="material" /></mesh>
        <mesh position={[0.44, 0.71, 0.12]}><cylinderGeometry args={[0.065, 0.065, 0.035, 16]} /><primitive object={CHROME} attach="material" /></mesh>
        {[[-0.3, -0.22], [0.3, -0.22], [-0.3, 0.22], [0.3, 0.22]].map(([x, z], i) => (
          <mesh key={i} position={[x, 0.05, z]}><sphereGeometry args={[0.05, 10, 10]} /><primitive object={DARKP} attach="material" /></mesh>
        ))}
        <Tag pos={[0, 1.72, 0]} label="VENTILATOR" accent="#5fe8c8" w={0.74} stalk={0.28} />
      </group>
      {/* the two corrugated circuit hoses → patient airway */}
      <Hose pts={[[-1.78, 1.3, -2.25], [-1.2, 1.12, -1.8], [-0.55, 0.98, -1.55], [0.05, 0.95, -1.46]]} r={0.04} rep={16} />
      <Hose pts={[[-1.85, 1.26, -2.42], [-1.1, 0.9, -2.0], [-0.5, 0.84, -1.65], [0.02, 0.9, -1.52]]} r={0.04} rep={16} />
    </group>
  )
}
// the MULTIPARA MONITOR — bedside, on a rolling stand at the patient's left
// shoulder. Screen = dark base + SCROLLING wave layer (texture.offset.x runs
// each frame → live ECG/pleth/ART/resp) + static numeric overlay (HR · SpO2 ·
// ABP · RR · TEMP). The 3 ECG leads land HERE, and its own pale-blue ribbon
// carries the data on to the edge server.
function MultiparaMonitor() {
  const waves = useMemo(() => multiparaWaveTexture(), [])
  const overlay = useMemo(() => multiparaOverlayTexture(), [])
  useFrame((_, dt) => { waves.offset.x = (waves.offset.x + dt * 0.09) % 1 })
  return (
    <group position={[-1.5, 0, -1.75]} rotation-y={0.95}>
      {/* rolling stand: 5-star base + column + tilt yoke */}
      <mesh position={[0, 0.04, 0]}><cylinderGeometry args={[0.3, 0.36, 0.07, 5]} /><primitive object={DARKP} attach="material" /></mesh>
      {[[-0.22, -0.19], [0.22, -0.19], [-0.22, 0.19], [0.22, 0.19]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.04, z]}><sphereGeometry args={[0.04, 10, 10]} /><primitive object={DARKP} attach="material" /></mesh>
      ))}
      <mesh position={[0, 0.72, 0]}><cylinderGeometry args={[0.032, 0.042, 1.36, 12]} /><primitive object={CHROME} attach="material" /></mesh>
      <mesh position={[0, 1.38, 0.04]} rotation-x={-0.15}><boxGeometry args={[0.1, 0.08, 0.1]} /><primitive object={HOUSING2} attach="material" /></mesh>
      {/* the monitor head: bezel + dark base + waves + overlay, tilted to the bed */}
      <group position={[0, 1.52, 0.08]} rotation={[-0.15, 0, 0]}>
        <RoundedBox args={[0.74, 0.57, 0.07]} radius={0.025} smoothness={3} material={BEZEL} castShadow />
        <mesh position={[0, 0, 0.037]}><planeGeometry args={[0.66, 0.5]} /><meshBasicMaterial color="#050d14" toneMapped={false} /></mesh>
        <mesh position={[0, 0, 0.039]}>
          <planeGeometry args={[0.66, 0.5]} />
          <meshBasicMaterial map={waves} color={new Color(1.3, 1.3, 1.3)} toneMapped={false} transparent depthWrite={false} />
        </mesh>
        <mesh position={[0, 0, 0.041]}>
          <planeGeometry args={[0.66, 0.5]} />
          <meshBasicMaterial map={overlay} color={new Color(1.25, 1.25, 1.25)} toneMapped={false} transparent depthWrite={false} />
        </mesh>
        {/* power LED + soft knob row under the screen */}
        <mesh position={[-0.3, -0.315, 0.03]}><circleGeometry args={[0.008, 10]} /><meshBasicMaterial color={hdr('#39f08a', 1.3)} toneMapped={false} /></mesh>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[0.14 + i * 0.08, -0.315, 0.035]} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.02, 0.02, 0.02, 12]} /><primitive object={HOUSING2} attach="material" /></mesh>
        ))}
      </group>
      {/* lead bundle exit — small port block on the right flank */}
      <mesh position={[0.34, 1.32, 0.06]}><boxGeometry args={[0.07, 0.1, 0.08]} /><primitive object={GREYPANEL} attach="material" /></mesh>
      <Tag pos={[0, 2.06, 0]} label="MULTIPARA MONITOR" accent="#8fd0ff" w={0.9} stalk={0.22} />
    </group>
  )
}
// four stacked infusion channels on a pole, by the bed head
function InfusionStack() {
  const screens = useMemo(() => [
    pumpScreenTexture('NORAD', '12.5', '#37c8ff'), pumpScreenTexture('PROPOFOL', '4.0', '#ff9ad5'),
    pumpScreenTexture('FENTANYL', '8.2', '#ffd77a'), pumpScreenTexture('INSULIN', '2.1', '#5fe8c8'),
  ], [])
  return (
    <group position={[1.35, 0, -2.45]} rotation-y={-0.15}>
      <mesh position={[0, 0.95, 0]}><cylinderGeometry args={[0.025, 0.025, 1.9, 12]} /><primitive object={CHROME} attach="material" /></mesh>
      <mesh position={[0, 0.04, 0]}><cylinderGeometry args={[0.3, 0.34, 0.07, 5]} /><primitive object={DARKP} attach="material" /></mesh>
      {screens.map((s, i) => (
        <group key={i} position={[0, 1.06 + i * 0.21, 0]}>
          <RoundedBox args={[0.44, 0.18, 0.3]} radius={0.03} smoothness={3} material={HOUSING} castShadow />
          <mesh position={[0.02, 0.0, 0.155]}>
            <planeGeometry args={[0.24, 0.11]} />
            <meshBasicMaterial map={s} toneMapped={false} color={new Color(1.25, 1.25, 1.25)} />
          </mesh>
          <mesh position={[-0.15, 0, 0.155]} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.028, 0.028, 0.02, 14]} /><primitive object={CHROME} attach="material" /></mesh>
        </group>
      ))}
      {/* IV line down to the patient's right arm */}
      <Hose pts={[[0, 1.5, 0.12], [-0.25, 1.1, 0.75], [-0.78, 0.84, 1.62]]} r={0.008} mat={TUBE_BLUE} />
      <Tag pos={[0, 2.12, 0]} label="INFUSION STACK" accent="#ff9ad5" w={0.8} stalk={0.24} />
    </group>
  )
}
// two horizontal syringe drivers on a short stand (mid-right)
function SyringePumps() {
  const s1 = useMemo(() => pumpScreenTexture('HEPARIN', '6.4', '#ff9ad5'), [])
  const s2 = useMemo(() => pumpScreenTexture('MIDAZOLAM', '3.2', '#37c8ff'), [])
  return (
    <group position={[2.35, 0, -1.35]} rotation-y={-0.45}>
      <mesh position={[0, 0.5, 0]}><cylinderGeometry args={[0.03, 0.04, 1.0, 12]} /><primitive object={CHROME} attach="material" /></mesh>
      <mesh position={[0, 0.04, 0]}><cylinderGeometry args={[0.28, 0.32, 0.07, 5]} /><primitive object={DARKP} attach="material" /></mesh>
      {[[0.98, s1], [1.16, s2]].map(([y, s], i) => (
        <group key={i} position={[0, y as number, 0]}>
          <RoundedBox args={[0.52, 0.15, 0.22]} radius={0.03} smoothness={3} material={HOUSING} castShadow />
          <mesh position={[0.06, 0.0, 0.115]}>
            <planeGeometry args={[0.22, 0.09]} />
            <meshBasicMaterial map={s as CanvasTexture} toneMapped={false} color={new Color(1.25, 1.25, 1.25)} />
          </mesh>
          {/* the syringe barrel clamped along the top */}
          <mesh position={[-0.05, 0.095, 0.02]} rotation-z={Math.PI / 2}><cylinderGeometry args={[0.028, 0.028, 0.34, 12]} /><primitive object={VESSEL} attach="material" /></mesh>
          <mesh position={[-0.24, 0.095, 0.02]} rotation-z={Math.PI / 2}><cylinderGeometry args={[0.032, 0.032, 0.03, 12]} /><primitive object={HOUSING2} attach="material" /></mesh>
        </group>
      ))}
      <Tag pos={[0, 1.62, 0]} label="SYRINGE PUMPS" accent="#ffd77a" w={0.78} stalk={0.24} />
    </group>
  )
}
// the dialysis / CRRT tower (right-front) + integrated pole & bag
function Dialysis() {
  const face = useMemo(() => dialysisScreenTexture(), [])
  return (
    <group position={[3.25, 0, 0.7]} rotation-y={-0.7}>
      <RoundedBox args={[0.64, 1.42, 0.52]} radius={0.07} smoothness={3} position={[0, 0.86, 0]} material={HOUSING} castShadow />
      {/* grey flank panels (two-tone) */}
      <mesh position={[-0.3, 0.8, 0]}><boxGeometry args={[0.05, 1.15, 0.44]} /><primitive object={GREYPANEL} attach="material" /></mesh>
      <mesh position={[0.3, 0.8, 0]}><boxGeometry args={[0.05, 1.15, 0.44]} /><primitive object={GREYPANEL} attach="material" /></mesh>
      {/* face screen */}
      <mesh position={[0, 1.32, 0.268]}>
        <planeGeometry args={[0.42, 0.32]} />
        <meshBasicMaterial map={face} toneMapped={false} color={new Color(1.15, 1.15, 1.15)} />
      </mesh>
      {/* pump housing + roller discs */}
      <mesh position={[0, 0.78, 0.262]}><planeGeometry args={[0.5, 0.5]} /><primitive object={DARKP} attach="material" /></mesh>
      {[[-0.12, 0.88], [0.12, 0.68]].map(([x, y], i) => (
        <group key={i} position={[x, y, 0.28]}>
          <mesh rotation-x={Math.PI / 2}><cylinderGeometry args={[0.085, 0.085, 0.04, 22]} /><primitive object={CHROME} attach="material" /></mesh>
          <mesh rotation-x={Math.PI / 2} position={[0, 0, 0.022]}><torusGeometry args={[0.08, 0.012, 8, 22]} /><primitive object={i ? TUBE_BLUE : TUBE_RED} attach="material" /></mesh>
        </group>
      ))}
      {/* blood lines looping across the face */}
      <Hose pts={[[-0.12, 1.05, 0.29], [-0.22, 0.88, 0.3], [-0.1, 0.72, 0.3], [0.05, 0.6, 0.29]]} r={0.011} mat={TUBE_RED} />
      <Hose pts={[[0.12, 0.52, 0.29], [0.24, 0.68, 0.3], [0.16, 0.85, 0.3], [0.02, 0.98, 0.29]]} r={0.011} mat={TUBE_BLUE} />
      {/* integrated pole + bag */}
      <mesh position={[0.2, 1.85, -0.1]}><cylinderGeometry args={[0.016, 0.016, 0.75, 10]} /><primitive object={CHROME} attach="material" /></mesh>
      <RoundedBox args={[0.16, 0.24, 0.05]} radius={0.03} smoothness={3} position={[0.2, 1.98, 0.02]} material={BAG} />
      {/* castors */}
      {[[-0.24, -0.18], [0.24, -0.18], [-0.24, 0.18], [0.24, 0.18]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.05, z]}><sphereGeometry args={[0.05, 10, 10]} /><primitive object={DARKP} attach="material" /></mesh>
      ))}
      <Tag pos={[0, 2.35, 0]} label="CRRT · DIALYSIS" accent="#ffa8c8" w={0.84} stalk={0.28} />
    </group>
  )
}
function IVPole({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1.05, 0]}><cylinderGeometry args={[0.02, 0.02, 2.1, 10]} /><primitive object={CHROME} attach="material" /></mesh>
      {[0.4, -0.4].map((s, i) => (
        <mesh key={i} position={[s * 0.28, 2.08, 0]} rotation-z={Math.PI / 2}><cylinderGeometry args={[0.013, 0.013, 0.5, 8]} /><primitive object={CHROME} attach="material" /></mesh>
      ))}
      <RoundedBox args={[0.15, 0.25, 0.05]} radius={0.03} smoothness={3} position={[0.2, 1.82, 0]} material={BAG} />
      <mesh position={[0, 0.035, 0]}><cylinderGeometry args={[0.26, 0.3, 0.07, 5]} /><primitive object={DARKP} attach="material" /></mesh>
    </group>
  )
}

// ---- the whole set ---------------------------------------------------------
// step drives the tour: 0 room · 1-5 device flybys · 6 server floats w/ spec
// callouts · 7 settles + zoom out · 8 signals emerge and merge · 9 into the
// interface screen
function ICUSet({ step }: { step: number }) {
  const float = step === 6
  const ribbonsOn = step >= 8
  return (
    <group>
      <Room />
      <CeilingPanels />
      <GlassWall />
      <Bed />
      <MonitorStation float={float} specs={float} />
      <Ventilator />
      <MultiparaMonitor />
      <InfusionStack />
      <SyringePumps />
      <Dialysis />
      <IVPole x={-1.0} z={-2.85} />
      <IVPole x={4.1} z={2.2} />
      {/* the two clinicians — left one leans over the patient, right one works
          the pumps */}
      <StaffFigure pos={[-0.75, 0, -0.95]} ry={Math.PI / 2 - 0.3} lean={0.32} />
      <StaffFigure pos={[1.4, 0, -1.55]} ry={-Math.PI / 2 + 0.5} lean={0.22} gown={SCRUB2} />
      <DataRibbons on={ribbonsOn} />
      <PatientLeads />
      {/* soft cyan spill around the console dock */}
      <pointLight position={[0.2, 1.5, 1.7]} intensity={1.5} distance={3} decay={2} color={'#5fe8d8'} />
    </group>
  )
}

// --- studio: bright, high-key, mint-clinical --------------------------------
function ICUStudio() {
  return (
    <>
      <color attach="background" args={['#c2ccc8']} />
      <hemisphereLight intensity={0.3} color={0xf4f8f6} groundColor={0xa8b2ac} />
      <ambientLight intensity={0.06} color={0xf2f6f4} />
      {/* soft key with gentle shadows + cool fill */}
      <directionalLight
        intensity={0.78} color={0xfdfdf8} position={[-5, 7, 6]} castShadow
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.0005}
        shadow-camera-left={-8} shadow-camera-right={8} shadow-camera-top={8} shadow-camera-bottom={-8}
      />
      <directionalLight intensity={0.3} color={0xe8f2f6} position={[6, 5, -4]} />
      <Environment resolution={256} frames={1}>
        <color attach="background" args={['#cfd6d2']} />
        <Lightformer form="rect" intensity={0.9} color="#ffffff" position={[0, 5, -8]} scale={[10, 4, 1]} />
        <Lightformer form="rect" intensity={0.7} color="#eef6f2" position={[-8, 4, 2]} scale={[2, 8, 1]} rotation-y={Math.PI / 2} />
        <Lightformer form="rect" intensity={0.7} color="#eef6f2" position={[8, 4, 2]} scale={[2, 8, 1]} rotation-y={-Math.PI / 2} />
        <Lightformer form="rect" intensity={0.85} color="#ffffff" position={[0, 8, 0]} rotation-x={Math.PI / 2} scale={[8, 8, 1]} />
      </Environment>
    </>
  )
}

// --- the guided tour --------------------------------------------------------
//  0 the room → 1-5 device flybys → 6 server FLOATS + rotates w/ spec labels
//  → 7 settles into the stand, camera zooms out → 8 the signals emerge from
//  every device and merge at the server → 9 fly INTO the interface screen
type Shot = { pos: [number, number, number]; look: [number, number, number] }
const SHOTS: Shot[] = [
  { pos: [-3.9, 2.7, 5.0], look: [0.9, 0.85, -1.1] },     // 0 · the room (front-left, console at right)
  { pos: [-0.25, 1.6, -0.5], look: [-1.55, 1.45, -1.8] }, // 1 · multipara monitor
  { pos: [-0.75, 1.5, -1.3], look: [-2.15, 1.0, -2.6] },  // 2 · ventilator
  { pos: [0.55, 1.55, -1.15], look: [1.42, 1.4, -2.5] },  // 3 · infusion stack
  { pos: [1.3, 1.3, -0.3], look: [2.42, 1.05, -1.42] },   // 4 · syringe pumps
  { pos: [1.8, 1.5, 2.0], look: [3.32, 1.05, 0.65] },     // 5 · CRRT dialysis
  { pos: [1.6, 1.6, 0.45], look: [0.2, 1.35, 2.0] },      // 6 · the server — floating, spec callouts
  { pos: [-2.9, 2.4, 3.9], look: [0.3, 1.15, 1.85] },     // 7 · it settles into the stand — zoom out
  { pos: [-3.7, 2.9, 5.4], look: [0.8, 1.0, -0.7] },      // 8 · the signals merge (front-left wide)
  { pos: [0.2, 1.95, 0.9], look: [0.2, 2.02, 2.0] },      // 9 · into the interface
]
const CAPTIONS = [
  'THE ROOM', 'MULTIPARA MONITOR', 'VENTILATOR', 'INFUSION STACK', 'SYRINGE PUMPS',
  'CRRT · DIALYSIS', 'EDGE SERVER · SPECS', 'DOCKING', 'SIGNALS MERGE', 'THE INTERFACE',
]
const N_BEATS = SHOTS.length
const LAST = N_BEATS - 1

// smooth glide between presets (the OR rig)
function GlideRig({ controls, goal }: {
  controls: RefObject<OrbitControlsImpl | null>
  goal: MutableRefObject<Shot | null>
}) {
  useFrame((_, dt) => {
    const g = goal.current
    const c = controls.current
    if (!g || !c) return
    const cam = c.object
    const k = 2.2
    cam.position.x = MathUtils.damp(cam.position.x, g.pos[0], k, dt)
    cam.position.y = MathUtils.damp(cam.position.y, g.pos[1], k, dt)
    cam.position.z = MathUtils.damp(cam.position.z, g.pos[2], k, dt)
    c.target.x = MathUtils.damp(c.target.x, g.look[0], k, dt)
    c.target.y = MathUtils.damp(c.target.y, g.look[1], k, dt)
    c.target.z = MathUtils.damp(c.target.z, g.look[2], k, dt)
    c.update()
    const d = Math.hypot(cam.position.x - g.pos[0], cam.position.y - g.pos[1], cam.position.z - g.pos[2])
    if (d < 0.05) {
      goal.current = null
      c.enabled = true
    }
  })
  return null
}

// ?shot=N — land directly on a preset (headless screenshots / deep links)
const INIT_SHOT = (() => {
  const v = parseInt(new URLSearchParams(window.location.search).get('shot') ?? '0', 10)
  return Number.isFinite(v) ? Math.min(Math.max(v, 0), LAST) : 0
})()

export function ICUScene() {
  const controls = useRef<OrbitControlsImpl>(null)
  const [step, setStep] = useState(INIT_SHOT)
  const glideGoal = useRef<Shot | null>(null)
  useShotCapture(controls) // DEV: P = copy current camera as a SHOT line
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowRight') {
        e.preventDefault()
        setStep((s) => Math.min(s + 1, LAST))
      } else if (e.code === 'ArrowLeft' || e.code === 'Backspace') {
        e.preventDefault()
        setStep((s) => Math.max(s - 1, 0))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  // each beat change starts a glide; controls come back once we arrive
  // (on mount this is an instant no-op glide to the initial beat)
  useEffect(() => {
    glideGoal.current = SHOTS[step]
    if (controls.current) controls.current.enabled = false
  }, [step])
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, toneMapping: NoToneMapping }}
        camera={{ position: SHOTS[INIT_SHOT].pos, fov: 46 }}
      >
        <ICUStudio />
        <ICUSet step={step} />
        <GlideRig controls={controls} goal={glideGoal} />
        <OrbitControls
          ref={controls}
          target={SHOTS[INIT_SHOT].look}
          enableDamping
          dampingFactor={0.08}
          minDistance={0.35}
          maxDistance={16}
          maxPolarAngle={Math.PI / 1.9}
        />
        <Postprocessing />
      </Canvas>

      <div
        style={{
          position: 'absolute', top: 16, left: 16,
          font: '700 13px ui-sans-serif, system-ui, sans-serif', letterSpacing: 1,
          color: '#33555e', background: 'rgba(240,248,245,0.6)',
          border: '1px solid rgba(90,140,150,0.3)', borderRadius: 10, padding: '6px 12px',
          backdropFilter: 'blur(8px)',
        }}
      >
        SENTIENT ICU · BAY 04{' '}
        <span style={{ color: '#2c7a72' }}>· {step}/{LAST} {CAPTIONS[step]}</span>{' '}
        <span style={{ color: '#6d8a90', fontWeight: 500 }}>· Space/→ tour · drag to orbit</span>
      </div>
    </div>
  )
}
