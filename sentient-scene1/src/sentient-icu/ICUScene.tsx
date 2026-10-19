import { useEffect, useMemo, useRef, useState, type RefObject, type MutableRefObject } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Billboard, Environment, Lightformer, OrbitControls, RoundedBox } from '@react-three/drei'
import {
  NoToneMapping, CanvasTexture, SRGBColorSpace, RepeatWrapping,
  Color, MeshStandardMaterial, MeshBasicMaterial, MeshPhysicalMaterial,
  Vector3, Quaternion, MathUtils, CatmullRomCurve3, BufferGeometry, BufferAttribute,
  ShaderMaterial, AdditiveBlending, NormalBlending, DoubleSide, TubeGeometry,
  type Group,
} from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { Postprocessing } from './Postprocessing'
import { useShotCapture } from './useShotCapture'

// ---------------------------------------------------------------------------
//  SENTIENT ICU — BAY 04. A bright, high-key, mint-clinical intensive-care bay
//  (the soft-clay illustration look): tiled walls, glass partition, big ceiling
//  luminaires, ICU bed + a clinician, and the full device ring — ventilator,
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
function tileTexture(base: string, grout: string, rep = 7, sheen = 0.05, repY = rep) {
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
  return tex(cv, rep, repY)
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
// defibrillator face — one ECG trace over the energy readout and charge state
function defibScreenTexture() {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 168; const x = cv.getContext('2d')!
  x.fillStyle = '#050d14'; x.fillRect(0, 0, 256, 168)
  x.textBaseline = 'middle'
  x.fillStyle = '#ff8a7a'; x.font = 'bold 15px ui-monospace, monospace'; x.fillText('DEFIB · SYNC', 10, 16)
  x.fillStyle = '#6d8296'; x.font = '12px ui-monospace, monospace'; x.textAlign = 'right'
  x.fillText('PADDLES', 246, 16); x.textAlign = 'left'
  x.strokeStyle = '#39f08a'; x.lineWidth = 2.2; x.shadowColor = '#39f08a'; x.shadowBlur = 6; x.beginPath()
  for (let px = 0; px <= 256; px++) {
    const p = ((px / 256) * 3) % 1
    const y = p < 0.1 ? Math.sin(p / 0.1 * Math.PI) * 0.12 : p < 0.2 ? -0.06 : p < 0.24 ? 1
      : p < 0.28 ? -0.35 : p < 0.5 ? 0.05 : Math.sin((p - 0.5) / 0.2 * Math.PI) * 0.2
    const yy = 68 - y * 26; px ? x.lineTo(px, yy) : x.moveTo(px, yy)
  }
  x.stroke(); x.shadowBlur = 0
  x.fillStyle = '#6d8296'; x.font = '12px ui-monospace, monospace'; x.fillText('ENERGY', 12, 106)
  x.fillStyle = '#ffd24a'; x.shadowColor = '#ffd24a'; x.shadowBlur = 10
  x.font = 'bold 44px ui-monospace, monospace'; x.fillText('200', 12, 136); x.shadowBlur = 0
  x.fillStyle = '#6d8296'; x.font = '13px ui-monospace, monospace'; x.fillText('J', 106, 148)
  x.fillStyle = '#39f08a'; x.font = 'bold 15px ui-monospace, monospace'; x.textAlign = 'right'
  x.fillText('CHARGED', 246, 132); x.textAlign = 'left'
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
// The accent dot lives OUTSIDE the pill, in the left margin — inside it the
// label had to start at x=96 and ran past the right cap. The pill is inset from
// BOTH ends so its round caps land inside the bitmap (the old path ran to x=514
// on a 512-wide canvas, so both caps were sliced off by the edge), and it is
// centred on the canvas so it hangs square off the stalk.
const TAG_W = 640, TAG_H = 112, TAG_PILL_H = 78
function tagTexture(label: string, accent: string) {
  const cv = document.createElement('canvas'); cv.width = TAG_W; cv.height = TAG_H
  const x = cv.getContext('2d')!
  x.clearRect(0, 0, TAG_W, TAG_H)
  // Type is set FIRST and the capsule is then sized to hug it — a fixed-width
  // pill left a short name like VENTILATOR swimming in a baggy capsule.
  const DOT = 11, GAP = 18, PAD = 34
  const font = (s: number) => `bold ${s}px ui-sans-serif, system-ui, sans-serif`
  let size = 33
  x.font = font(size)
  const room = TAG_W - (DOT * 2 + GAP) - PAD * 2 - 8
  while (x.measureText(label).width > room && size > 18) { size -= 1; x.font = font(size) }
  // pill — centred on the canvas so it hangs square off the stalk
  const pw = x.measureText(label).width + PAD * 2
  const px = (TAG_W - pw) / 2, py = (TAG_H - TAG_PILL_H) / 2
  rrPath(x, px, py, pw, TAG_PILL_H, TAG_PILL_H / 2)
  x.fillStyle = 'rgba(40,50,60,0.92)'; x.fill()
  x.strokeStyle = 'rgba(255,255,255,0.25)'; x.lineWidth = 2.5; x.stroke()
  // accent dot, parked clear of the pill's left cap
  x.beginPath(); x.arc(px - GAP - DOT, TAG_H / 2, DOT, 0, 7)
  x.fillStyle = accent; x.shadowColor = accent; x.shadowBlur = 9; x.fill(); x.shadowBlur = 0
  x.fillStyle = '#f2f6f8'; x.textAlign = 'center'; x.textBaseline = 'middle'
  x.fillText(label, TAG_W / 2, TAG_H / 2 + 1)
  // pillFrac lets Tag find the capsule's edge — the pill hugs the label, so its
  // width isn't known until the text is measured
  return { map: tex(cv), pillFrac: pw / TAG_W }
}
// the console screen — faithful replica of the ACTUAL app frame (the
// icu/tars ward UI): header (Chandrababu · CRITICAL · Critical Care · staff),
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
function splitCanvas() {
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
  x.fillStyle = '#3a4750'; x.font = `13px ${sans}`; x.fillText('‹  Critical Care', 366, 32)
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
  return cv
}
const tarsSplitTexture = () => tex(splitCanvas())

// ---------------------------------------------------------------------------
//  The console, showing PANEL A + PANEL C — no Panel B.
//
//  Panel B is TARS's orchestration feed, and at this point in the deck TARS has
//  not been introduced: showing its feed here answers a question the room has
//  not been asked. A (what the instruments see) and C (the clinical apps acting
//  on it) are the two halves that stand on their own.
//
//  Composed by re-blitting the finished split rather than re-drawing it, so the
//  two panels are pixel-for-pixel the app's own artwork. Both are portrait and
//  the screen is landscape, so they are fitted to the HEIGHT and centred —
//  fitting to width would run them off the bottom.
// ---------------------------------------------------------------------------
/** The console at the moment it first lights: PANEL A alone. What the machines
 *  in this room are emitting, and nothing else — the record systems have not
 *  been introduced yet, so their panel would be answering an unasked question. */
function aPanelTexture() {
  const src = splitCanvas()
  const cv = document.createElement('canvas'); cv.width = 960; cv.height = 640
  const x = cv.getContext('2d')!
  x.fillStyle = '#eef2f4'; x.fillRect(0, 0, 960, 640)
  x.drawImage(src, 0, 0, 960, 64, 0, 0, 960, 64)
  const TOP = 76, H = 548, s = H / 508, aw = 296 * s
  x.drawImage(src, 16, 76, 296, 508, (960 - aw) / 2, TOP, aw, H)
  return tex(cv)
}

function acPanelTexture() {
  const src = splitCanvas()
  const cv = document.createElement('canvas'); cv.width = 960; cv.height = 640
  const x = cv.getContext('2d')!
  x.fillStyle = '#eef2f4'; x.fillRect(0, 0, 960, 640)
  x.drawImage(src, 0, 0, 960, 64, 0, 0, 960, 64)          // the header, unchanged

  const TOP = 76, H = 548                                  // the band below the header
  const s = H / 508                                        // both panels are 508 tall
  const aw = 296 * s, cw = 304 * s, GAP = 44
  const x0 = (960 - (aw + GAP + cw)) / 2
  x.drawImage(src, 16, 76, 296, 508, x0, TOP, aw, H)            // PANEL A
  x.drawImage(src, 640, 76, 304, 508, x0 + aw + GAP, TOP, cw, H) // PANEL C
  return tex(cv)
}
// dialysis face UI — dark panel, glowing bars. The light medical-blue version
// was the only lit screen in the bay and read as a different product entirely;
// this follows the multipara/vent/pump grammar (near-black base, #6d8296
// labels, HDR-ish values that catch the bloom).
function dialysisScreenTexture() {
  const cv = document.createElement('canvas'); cv.width = 260; cv.height = 200; const x = cv.getContext('2d')!
  x.fillStyle = '#050d14'; x.fillRect(0, 0, 260, 200)
  x.fillStyle = 'rgba(3,8,13,0.85)'; x.fillRect(0, 0, 260, 30)
  x.strokeStyle = 'rgba(109,130,150,.35)'; x.lineWidth = 1
  x.beginPath(); x.moveTo(0, 30); x.lineTo(260, 30); x.stroke()
  x.textBaseline = 'middle'
  x.fillStyle = '#5fe8c8'; x.font = 'bold 16px ui-monospace, monospace'
  x.fillText('CRRT · RUN', 12, 16)
  x.fillStyle = '#6d8296'; x.font = '11px ui-monospace, monospace'; x.textAlign = 'right'
  x.fillText('CVVHDF', 248, 16); x.textAlign = 'left'
  const row = (label: string, y: number, w: number, c: string) => {
    x.fillStyle = '#6d8296'; x.font = '10px ui-monospace, monospace'; x.fillText(label, 14, y - 8)
    x.fillStyle = 'rgba(109,130,150,.2)'; x.fillRect(14, y, 232, 9)
    x.fillStyle = c; x.shadowColor = c; x.shadowBlur = 7; x.fillRect(14, y, w, 9); x.shadowBlur = 0
  }
  row('BLOOD FLOW', 54, 170, '#37c8ff'); row('DIALYSATE', 82, 120, '#5fe8c8')
  row('EFFLUENT', 110, 200, '#37c8ff'); row('NET UF', 138, 90, '#ffd24a')
  x.fillStyle = '#39f08a'; x.shadowColor = '#39f08a'; x.shadowBlur = 8
  x.font = 'bold 24px ui-monospace, monospace'; x.fillText('180', 14, 176); x.shadowBlur = 0
  x.fillStyle = '#6d8296'; x.font = '12px ui-monospace, monospace'; x.fillText('mL/min', 66, 179)
  x.fillStyle = '#37c8ff'; x.shadowColor = '#37c8ff'; x.shadowBlur = 8
  x.font = 'bold 24px ui-monospace, monospace'; x.fillText('1.8 L', 158, 176); x.shadowBlur = 0
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
const WALL = new MeshStandardMaterial({ color: '#eef2f6', roughness: 0.6, metalness: 0.05, envMapIntensity: 0.9 })
const WALL_BACK = new MeshStandardMaterial({ color: '#f3f6f9', roughness: 0.6, metalness: 0.05, envMapIntensity: 0.9 })
// 2.65 x 3 repeats across the 10.6 x 12 bay slab keeps the tiles square at 1m
const FLOOR = new MeshStandardMaterial({ color: '#dfe4ea', roughness: 0.32, metalness: 0.35, envMapIntensity: 1 })
// corridor slab (4 x 12) — same tile and tone as FLOOR, only the repeat differs
// so the grout keeps 1 tile per metre and runs continuously across the seam
// cooler and paler than the bay's warm tile — the corridor should read as a
// different space through the glass, not as the bay continuing
const FLOOR_CORRIDOR = new MeshStandardMaterial({ color: '#d6dce4', roughness: 0.34, metalness: 0.32, envMapIntensity: 1 })
const CEIL = new MeshStandardMaterial({ color: '#e7ebf0', roughness: 0.7, metalness: 0.05, emissive: new Color('#ffffff'), emissiveIntensity: 0.03 })
const HOUSING = new MeshStandardMaterial({ color: '#eef1f2', roughness: 0.4, metalness: 0.08, envMapIntensity: 0.85 })
const HOUSING2 = new MeshStandardMaterial({ color: '#c3ccd0', roughness: 0.48, metalness: 0.1, envMapIntensity: 0.85 })
const GREYPANEL = new MeshStandardMaterial({ color: '#a9b7c2', roughness: 0.55, metalness: 0.08 })
const POST = new MeshStandardMaterial({ color: '#cdd8e0', roughness: 0.45, metalness: 0.15, envMapIntensity: 0.8 })
const RAIL = new MeshStandardMaterial({ color: '#b8c6d2', roughness: 0.3, metalness: 0.6, envMapIntensity: 1.2 })
const LEAD = new MeshStandardMaterial({ color: '#49545c', roughness: 0.6, metalness: 0.1 })
const CHROME = new MeshStandardMaterial({ color: '#ccd2d8', roughness: 0.22, metalness: 0.95, envMapIntensity: 1.4 })
const ALLOY = new MeshStandardMaterial({ color: '#dfe5e8', roughness: 0.3, metalness: 0.6, envMapIntensity: 1.1 })
const DARKP = new MeshStandardMaterial({ color: '#2b333a', roughness: 0.55, metalness: 0.3 })
// The panel's shell is the same white plastic as the dome — one object in
// two parts, not a white machine carrying a black television.
const BEZEL = new MeshStandardMaterial({ color: '#eef1f2', roughness: 0.42, metalness: 0.08, envMapIntensity: 0.85 })
// NOTE: no transmission — SwiftShader renders transmissive panes as milk;
// plain low-opacity + clearcoat reads as crisp clinical glass everywhere.
// depthWrite OFF — panes draw before the ribbons (renderOrder) and would
// depth-block every stream seen through the glass from outside cameras.
const GLASS = new MeshPhysicalMaterial({ color: '#e8f4ef', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.16, clearcoat: 0.6, clearcoatRoughness: 0.1, envMapIntensity: 1.1, depthWrite: false })
const VESSEL = new MeshPhysicalMaterial({ color: '#d7e8ef', roughness: 0.15, metalness: 0, transparent: true, opacity: 0.5, clearcoat: 0.5, envMapIntensity: 1.0 })
const BLANKET = new MeshStandardMaterial({ color: '#9fb9ab', roughness: 0.8, metalness: 0, emissive: new Color('#87a394'), emissiveIntensity: 0.04 })
const SHEET = new MeshStandardMaterial({ color: '#f3f6f7', roughness: 0.85, metalness: 0 })
const MATTRESS = new MeshStandardMaterial({ color: '#f2f4f5', roughness: 0.7, metalness: 0 })
const BEDBASE = new MeshStandardMaterial({ color: '#b7c1c6', roughness: 0.45, metalness: 0.2, envMapIntensity: 0.9 })
const BEDBLUE = new MeshStandardMaterial({ color: '#a5cde2', roughness: 0.5, metalness: 0.05 })
const SKIN = new MeshStandardMaterial({ color: '#e9cba6', roughness: 0.55, metalness: 0.02 })
const CAP = new MeshStandardMaterial({ color: '#5f9db3', roughness: 0.72, metalness: 0.02 })
const SCRUB = new MeshStandardMaterial({ color: '#4b8fa3', roughness: 0.78, metalness: 0.03 })
const SCRUB2 = new MeshStandardMaterial({ color: '#3f7d92', roughness: 0.78, metalness: 0.03 })
const MASK = new MeshStandardMaterial({ color: '#d9e7ec', roughness: 0.6, metalness: 0.02 })
const PANEL_LIGHT = new MeshBasicMaterial({ color: hdr('#fdeecf', 0.92), toneMapped: false })
const HOSE = new MeshStandardMaterial({ map: hoseTexture(), color: '#eef2f4', roughness: 0.6, metalness: 0.05 })
const TUBE_RED = new MeshStandardMaterial({ color: '#c0392b', roughness: 0.35, metalness: 0.05 })
const TUBE_BLUE = new MeshStandardMaterial({ color: '#2e6fbb', roughness: 0.35, metalness: 0.05 })
const BAG = new MeshPhysicalMaterial({ color: '#cfe2ec', roughness: 0.3, transmission: 0.45, transparent: true, opacity: 0.75 })

const DEFIB_RED = new MeshStandardMaterial({ color: '#c4643f', roughness: 0.5, metalness: 0.1, envMapIntensity: 0.8 })
const VENT_TEX = ventScreenTexture()
const DEFIB_TEX = defibScreenTexture()
const TARS_TEX = tarsSplitTexture()
// A alone when the screen lights; C JOINS it later, once the record systems
// have been shown feeding in. Both built once at module load.
const PANEL_A_TEX = aPanelTexture()
const PANEL_AC_TEX = acPanelTexture()

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
// wall / hanging room sign — "CRITICAL CARE · BED 08"
function roomSignTexture() {
  const cv = document.createElement('canvas'); cv.width = 640; cv.height = 176; const x = cv.getContext('2d')!
  x.fillStyle = '#242c31'; x.fillRect(0, 0, 640, 176)
  x.strokeStyle = 'rgba(255,255,255,0.14)'; x.lineWidth = 4; x.strokeRect(6, 6, 628, 164)
  x.fillStyle = '#2fbfae'; x.fillRect(24, 30, 8, 116)
  x.fillStyle = '#f2f6f8'; x.textBaseline = 'middle'
  x.font = 'bold 52px ui-sans-serif, system-ui, sans-serif'
  x.fillText('CRITICAL CARE', 56, 66)
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
// lw — leader radius. The default 0.004 is tuned for the device beats, where
// the camera is ~2m out and it reads as a hairline. Close-ups need it much
// finer or an 8mm six-sided tube reads as a stick lying in mid-air.
function Tag({ pos, label, accent, w = 0.78, stalk = 0.22, lead = 0, lw = 0.004 }:
  { pos: [number, number, number]; label: string; accent: string; w?: number; stalk?: number; lead?: number; lw?: number }) {
  const { map, pillFrac } = useMemo(() => tagTexture(label, accent), [label, accent])
  const h = w * (TAG_H / TAG_W)
  const pill = h * (TAG_PILL_H / TAG_H)   // the capsule, not the transparent plate
  const halfPill = (w * pillFrac) / 2
  const dir = Math.sign(lead), len = Math.abs(lead)
  return (
    <group position={pos}>
      {lead !== 0 ? (
        // horizontal leader off the capsule's side cap, for a tag parked beside
        // its subject rather than above it. Sign picks the side.
        <mesh position={[dir * (halfPill + len / 2), 0, 0]} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[lw, lw, len, 12]} /><primitive object={LEAD} attach="material" />
        </mesh>
      ) : (
        // the stalk hangs off the pill's BOTTOM edge — starting it at y=0 ran
        // the leader line straight up through the middle of the label
        <mesh position={[0, -pill / 2 - stalk / 2, 0]}>
          <cylinderGeometry args={[lw, lw, stalk, 12]} /><primitive object={LEAD} attach="material" />
        </mesh>
      )}
      <Billboard follow>
        <mesh renderOrder={7}>
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial map={map} transparent toneMapped={false} depthWrite={false} />
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
  uniform float uMaster; uniform float uHalo; uniform float uReveal; uniform float uDrain;
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
    // termination runs the OTHER way: the tail is eaten from the device end
    // (uv.x=0) forward, so the stream drains INTO the server and the last thing
    // to vanish is the part touching it. Winding uReveal back down instead
    // would retract the head and send the stream home to its machine.
    float drain = smoothstep(uDrain - 0.06, uDrain, vUv.x);
    float tail = smoothstep(uDrain + 0.02, uDrain + 0.1, vUv.x) * (1.0 - smoothstep(uDrain + 0.11, uDrain + 0.2, vUv.x));
    vec3 col = mix(uColor, vec3(1.35), core * 0.55) * (1.0 + head * 1.4 + tail * 1.2);
    float bright = (0.55 + 0.8 * seg) * uMaster;
    float a = mix(edge * endFade * (0.5 + 0.42 * seg + 0.5 * head + 0.4 * tail), edge * endFade * 0.1, uHalo) * reveal * drain;
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
function Ribbon({ pts, color, width = 0.13, speed = 0.55, dash = 9, master = 1.5, on = true, lag = 1.5, drain = false }:
  { pts: [number, number, number][]; color: string; width?: number; speed?: number; dash?: number; master?: number; on?: boolean; lag?: number; drain?: boolean }) {
  const geoCore = useMemo(() => ribbonGeometry(pts, width), [pts, width])
  const geoHalo = useMemo(() => ribbonGeometry(pts, width * 2.5), [pts, width])
  const mk = (halo: number) => new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uColor: { value: hdr(color, 1.25) },
      uSpeed: { value: speed }, uDash: { value: dash },
      uMaster: { value: halo ? master * 0.7 : master }, uHalo: { value: halo },
      uReveal: { value: on ? 1.1 : 0 }, // deep-links land in-state; tour animates
      uDrain: { value: drain ? 1.2 : 0 },
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
    // Cut, don't rewind. Easing uReveal back to 0 retracts the head out of the
    // server and back down the path, and easing uDrain back to 0 re-grows the
    // tail from the machine — so on the beat-11 auto-advance, where BOTH flip
    // at once, the streams appeared to run backwards. Off is off, instantly;
    // the drain has already emptied them by then, so the snap is invisible.
    if (!on) {
      matCore.uniforms.uReveal.value = 0; matHalo.uniforms.uReveal.value = 0
      matCore.uniforms.uDrain.value = 0; matHalo.uniforms.uDrain.value = 0
      return
    }
    // staggered grow-out (device → server); lag differs per ribbon
    const cur = matCore.uniforms.uReveal.value as number
    const next = MathUtils.damp(cur, 1.1, lag * 0.55, dt)
    matCore.uniforms.uReveal.value = next
    matHalo.uniforms.uReveal.value = next
    // the drain runs on its own clock — same per-ribbon lag, so they empty in
    // the same staggered order they filled
    const dcur = matCore.uniforms.uDrain.value as number
    const dnext = MathUtils.damp(dcur, drain ? 1.2 : 0, lag * 0.45, dt)
    matCore.uniforms.uDrain.value = dnext
    matHalo.uniforms.uDrain.value = dnext
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
// ON the light bar, not proud of it. Solved through the nesting rather than
// eyeballed: bar at EdgeServer-local [0, 0.082, 0.2312] → server ry 0.15 and
// pos [0, 0.735, 0] → station ry PI at [0.2, 0, 2.1] = world [0.165, 0.817,
// 1.871]. The old z=1.78 sat 0.09 in front of the case, so the streams stopped
// short in mid-air instead of landing on it.
const DOCK: [number, number, number] = [0.165, 0.818, 1.885]
// fan the endpoints along the bar's width axis (≈ (-0.99, 0, 0.15) in world)
const dock = (s: number, dy = 0): [number, number, number] => [DOCK[0] - 0.99 * s, DOCK[1] + dy, DOCK[2] + 0.15 * s]

function DataRibbons({ on, drain = false }: { on: boolean; drain?: boolean }) {
  return (
    <group>
      {/* Each start is its machine's own top, pushed through that rig's origin
          and rotation — the values below are world, but derived, not eyeballed.
          The vent's was 0.44 ABOVE the cart and the multipara's 0.8 off in z,
          so both streams launched out of open air beside their machines. */}
      {/* ventilator → server (mint) — cart top is local y=1.31 */}
      <Ribbon on={on} drain={drain} lag={1.9} pts={[[-2.15, 1.38, -1.05], [-1.6, 2.3, -0.4], [-0.7, 1.7, 1.25], dock(-0.13, 0.03)]} color="#5fe8c8" />
      {/* CUT: the console screen's short hop down the mast. The mast is gone,
          and the screen doesn't exist until the last beat, so on SIGNALS MERGE
          it was a stream leaving thin air above the server. */}
      {/* MULTIPARA monitor → server (pale blue) — case top is local y=1.86 */}
      <Ribbon on={on} drain={drain} lag={1.7} pts={[[-1.7, 1.92, -2.49], [-1.15, 2.35, -0.1], [-0.45, 1.75, 1.3], dock(-0.08, 0.02)]} color="#8fd0ff" speed={0.6} />
      {/* infusion stack → server (magenta) — arcs the length of the bed */}
      <Ribbon on={on} drain={drain} lag={1.55} pts={[[1.26, 2.02, -2.60], [1.05, 2.55, -0.5], [0.55, 1.85, 1.15], dock(0.05, 0.02)]} color="#ff9ad5" speed={0.7} />
      {/* syringe pumps → server (amber) */}
      <Ribbon on={on} drain={drain} lag={1.4} pts={[[0.50, 1.42, -2.70], [1.4, 2.1, 0.3], [0.95, 1.65, 1.4], dock(0.1, 0.03)]} color="#ffd77a" speed={0.45} />
      {/* dialysis → server (pink) — up off the tower and across the foot corner */}
      <Ribbon on={on} drain={drain} lag={1.25} pts={[[2.4, 1.75, -0.55], [1.9, 2.3, 0.9], [1.05, 1.6, 1.9], dock(0.14, 0.02)]} color="#ffa8c8" speed={0.6} />
      {/* defibrillator → server (coral) — up the left-foot corner */}
      <Ribbon on={on} drain={drain} lag={1.1} pts={[[1.9, 1.55, -1.55], [1.55, 2.25, 0.2], [0.6, 1.8, 1.7], dock(-0.12, 0.03)]} color="#ff9a7a" speed={0.55} />
      {/* CUT: the network feed. It entered at x=7.6, outside the room, coming
          through the glass partition — and that wall is parked with the rest of
          the shell, so it flew in off bare floor. It was also the one stream
          with no machine and no label, and the widest, so it read as an error.
          Bring it back with the cubicle if the ABDM link needs showing. */}
    </group>
  )
}

// ---------------------------------------------------------------------------
//  SECOND WAVE — the streams that are not machines. The first wave said "it
//  hears every instrument in the room"; this one says "and it reaches what is
//  not in the room at all."
//
//  · CAMERA leaves the corner dome and arcs the length of the bay.
//  · LIS and PACS arrive THROUGH the glass from off-frame — longer, straighter
//    entries than the bedside blooms, so they read as coming from elsewhere in
//    the building rather than as two more devices.
//  · EMR is the special one: TWO ribbons on one path, the second with negative
//    speed, so the dashes visibly run both ways — read AND write. Everything
//    else flows in; this one also flows back out.
//
//  `stage` gates them in story order (1 camera · 2 records · 3 EMR); the cut
//  at the end happens under the second boot cover, so no drain choreography.
// ---------------------------------------------------------------------------
type P3 = [number, number, number]
// The four second-wave paths, declared ONCE so a ribbon and its name tag can
// never drift apart — the tag measures its position against this same array.
const SYS_PATH: Record<'cam' | 'lis' | 'pacs' | 'emr', P3[]> = {
  cam: [[4.25, 3.5, -4.55], [3.0, 3.05, -2.5], [1.4, 2.25, 0.3], dock(-0.04, 0.05)],
  lis: [[7.4, 2.1, -3.4], [4.6, 2.35, -2.2], [2.2, 2.15, 0.2], dock(0.02, 0.06)],
  pacs: [[7.4, 2.5, 3.8], [4.6, 2.6, 2.9], [2.0, 2.25, 2.3], dock(0.18, 0.05)],
  emr: [[7.5, 1.6, 0.8], [4.6, 1.95, 1.1], [2.6, 1.85, 1.6], dock(-0.18, 0.06)],
}

/**
 * A stream's name tag, held back until the stream has actually REACHED it.
 * Showing it the moment the beat flips labelled a ribbon that had not arrived.
 *
 * Two measurements, both derived rather than dialled in:
 *
 *  1 · WHERE the anchor falls along the ribbon. The shader reveals up to
 *      uv.x < uReveal, and ribbonGeometry writes uv.x = t from getPointAt(t) —
 *      which is ARC-LENGTH parameterised, so a control point is NOT at
 *      index/(n-1). Measured against evenly spaced samples, same as the
 *      ontology tower's journey stops.
 *
 *  2 · WHEN the reveal crosses it. uReveal is MathUtils.damp toward 1.1 at
 *      lambda = lag*0.55, which integrates to 1.1·(1 − e^(−lambda·t)) from
 *      zero — so it passes u at t = −ln(1 − u/1.1)/lambda. Closed form, no
 *      per-frame polling.
 *
 * The floor keeps a tag anchored at its stream's own origin (the camera's)
 * from popping on the very frame the beat lands.
 */
function StreamTag({ on, path, lag, anchor, ...tag }: {
  on: boolean; path: P3[]; lag: number; anchor: P3
} & Omit<Parameters<typeof Tag>[0], 'pos'> & { pos: P3 }) {
  const delay = useMemo(() => {
    const curve = new CatmullRomCurve3(path.map((q) => new Vector3(...q)), false, 'centripetal', 0.5)
    const N = 400
    const pts = curve.getSpacedPoints(N)
    const a = new Vector3(...anchor)
    let best = 0, bd = Infinity
    for (let i = 0; i <= N; i++) { const d = pts[i].distanceToSquared(a); if (d < bd) { bd = d; best = i } }
    const u = best / N
    return Math.max(0.3, -Math.log(Math.max(1e-3, 1 - u / 1.1)) / (lag * 0.55))
  }, [path, anchor, lag])
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!on) { setShown(false); return }
    const t = window.setTimeout(() => setShown(true), delay * 1000)
    return () => window.clearTimeout(t)
  }, [on, delay])
  return shown ? <Tag {...tag} /> : null
}

function SystemRibbons({ stage, drain = false }: { stage: number; drain?: boolean }) {
  return (
    <group>
      {/* camera → server (pale vision cyan) */}
      <Ribbon on={stage >= 1} drain={drain} lag={1.8} pts={SYS_PATH.cam} color="#9fe8ff" speed={0.6} />
      {/* LIS → server (lab green) — enters through the glass, back end */}
      <Ribbon on={stage >= 2} drain={drain} lag={1.6} pts={SYS_PATH.lis} color="#8fe8a8" speed={0.5} />
      {/* PACS → server (imaging blue) — through the glass, front end */}
      <Ribbon on={stage >= 2} drain={drain} lag={1.45} pts={SYS_PATH.pacs} color="#7fb2ff" speed={0.65} />
      {/* EMR ⇄ server (record gold) — the pair: read in, write back out */}
      <Ribbon on={stage >= 3} drain={drain} lag={1.3} pts={SYS_PATH.emr} color="#f6c46a" speed={0.5} />
      <Ribbon on={stage >= 3} drain={drain} lag={1.3} width={0.09} master={1.2} pts={[[7.5, 1.62, 0.83], [4.6, 1.97, 1.13], [2.6, 1.87, 1.63], dock(-0.18, 0.08)]} color="#ffe2a0" speed={-0.5} />

      {/* Each tag sits directly above (or level with) one of ITS OWN ribbon's
          control points — the curve is a centripetal CatmullRom, so it passes
          through control points exactly and bows away from the midpoints
          between them. A stalk over a midpoint points at empty air.

          The drop is solved, not eyeballed: the stalk hangs off the pill's
          BOTTOM edge, so tip = y − pillHalf − stalk, pillHalf =
          w·(112/640)·(78/112)/2. Same for the camera's horizontal leader,
          which runs +x off the pill's side cap: tip = x + halfPill + lead.

          Sized by DISTANCE, not importance: the tag plane has no distance
          factor, so apparent size falls off linearly, and these sit ~9-10m
          from the diagonal where the devices sit ~7. */}
      {/* camera · leader lands on the ribbon's origin under the dome */}
      <StreamTag on={stage >= 1} path={SYS_PATH.cam} lag={1.8} anchor={[4.25, 3.5, -4.55]}
        pos={[3.47, 3.5, -4.55]} label="CAMERA" accent="#9fe8ff" w={1.7} lead={0.5} lw={0.0028} />
      <StreamTag on={stage >= 2} path={SYS_PATH.lis} lag={1.6} anchor={[2.2, 2.15, 0.2]}
        pos={[2.2, 2.8736, 0.2]} label="LIS" accent="#8fe8a8" w={1.7} stalk={0.62} />
      <StreamTag on={stage >= 2} path={SYS_PATH.pacs} lag={1.45} anchor={[2.0, 2.25, 2.3]}
        pos={[2.0, 2.9736, 2.3]} label="PACS" accent="#7fb2ff" w={1.7} stalk={0.62} />
      <StreamTag on={stage >= 3} path={SYS_PATH.emr} lag={1.3} anchor={[2.6, 1.85, 1.6]}
        pos={[2.6, 2.5097, 1.6]} label="EMR · READ / WRITE" accent="#f6c46a" w={1.8} stalk={0.55} />
    </group>
  )
}

// physical patient wiring — ECG leads + electrodes, arterial line, CRRT blood
// lines. Dumb cables, no glow: the DATA leaves via the MULTIPARA's ribbon.
// These live outside their machines (they run device → patient), so they need
// gating of their own — otherwise the ECG leads and the CRRT blood lines are
// lying on the bed from beat 0, before either machine has been wheeled in.
function PatientLeads({ ecg = true, crrt = true }: { ecg?: boolean; crrt?: boolean }) {
  const electrodes: [number, number, number][] = [[0.0, 0.885, -1.06], CHEST, [0.32, 0.87, -0.92]]
  return (
    <group>
      {/* 3-lead ECG from the multipara's side port — the start is that port
          block (local [0.41, 1.34, 0.04]) pushed through the monitor's
          origin/rotation, so it moves when the monitor does. Short bedside
          drape, approaching flat along the blanket. */}
      <Arrive on={ecg}>
        {electrodes.map((e, i) => (
          <Hose key={i} pts={[[-1.42, 1.34 + i * 0.02, -2.79], [-1.15, 1.15, -2.25], [-0.85, 0.95, -1.7], [e[0] - 0.32, e[1] + 0.06, e[2] - 0.4], e]} r={0.007} mat={LEAD} />
        ))}
        {electrodes.map((e, i) => (
          <mesh key={i} position={e}><cylinderGeometry args={[0.022, 0.026, 0.012, 14]} /><primitive object={LEAD} attach="material" /></mesh>
        ))}
      </Arrive>
      {/* CRRT blood lines — red out / blue return, off the tower's pump face and
          across to the bed's right edge. They used to start at x=3.0 and dip to
          y≈0.25, so they swept the floor the whole width of the room; the rig is
          at [1.95, -0.55] now and the run stays up at bed height. */}
      {/* These START on the tower's own face loops — red at local [0.05, 0.6,
          0.29], blue at [0.12, 0.52, 0.29] — pushed through the rig's current
          origin/rotation. Eyeballed world coords leave a visible break between
          the patient line and the roller loop every time the tower moves. */}
      <Arrive on={crrt}>
        <Hose pts={[[2.26, 0.6, -0.29], [1.75, 0.5, -0.38], [1.15, 0.52, -0.46], [0.75, 0.7, -0.5], [0.5, 0.76, -0.52]]} r={0.011} mat={TUBE_RED} />
        <Hose pts={[[2.31, 0.52, -0.25], [1.78, 0.44, -0.34], [1.18, 0.46, -0.5], [0.78, 0.66, -0.58], [0.52, 0.72, -0.6]]} r={0.011} mat={TUBE_BLUE} />
      </Arrive>
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
// roughness up from 0.34 — at that value the brushed metal threw a tight
// specular hot spot off the key light onto the top face, which read as a flare
const ALU = new MeshStandardMaterial({
  map: BRUSHED, color: '#b4bac0', roughness: 0.55, metalness: 0.74,
  envMapIntensity: 0.8, bumpMap: BRUSHED, bumpScale: 0.0015,
})
const BAR_TEX = lightBarTexture()
const PERF_TEX = perfTexture()

// ---- PCB artwork -----------------------------------------------------------
//  A board is a FLAT object with dense 2-D detail — copper pour, routed
//  traces, via barrels, ENIG pads, silkscreen. Building that out of boxes is
//  why the first pass read as toy blocks; boards are textured, not modelled.
//  Drawn procedurally at 1024² so it holds up when the camera is a hand's
//  width away on the teardown beat.
//
//  Layer order matches fabrication: mask -> pour -> traces -> vias -> pads ->
//  silkscreen. Traces route at 45° and 90° only, which is what makes copper
//  read as copper rather than as scribble.
function pcbTexture(mask = '#0b3626', dense = 1) {
  const N = 1024
  const cv = document.createElement('canvas'); cv.width = cv.height = N
  const x = cv.getContext('2d')!
  // solder mask
  x.fillStyle = mask; x.fillRect(0, 0, N, N)
  // ground pour — a shade lighter than bare mask, with a hatched relief
  x.fillStyle = 'rgba(255,255,255,0.045)'
  x.fillRect(28, 28, N - 56, N - 56)
  x.strokeStyle = 'rgba(255,255,255,0.03)'; x.lineWidth = 2
  for (let i = -N; i < N * 2; i += 14) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i - N, N); x.stroke() }

  // routed traces — orthogonal runs with 45° corners, in bundles
  const trace = (x0: number, y0: number, segs: number, w: number, tint: string) => {
    x.strokeStyle = tint; x.lineWidth = w; x.lineCap = 'square'; x.lineJoin = 'miter'
    x.beginPath(); x.moveTo(x0, y0)
    let cx2 = x0, cy2 = y0
    for (let i = 0; i < segs; i++) {
      const horiz = i % 2 === 0
      const len = 40 + ((i * 97) % 150)
      const dir = ((i * 53) % 7) < 3 ? -1 : 1
      if (horiz) { cx2 += len * dir } else { cy2 += len * dir }
      // clip a 45 into the corner so it never turns square
      x.lineTo(cx2, cy2)
    }
    x.stroke()
  }
  const COPPER = 'rgba(196,158,84,0.5)'
  for (let b = 0; b < 26 * dense; b++) {
    const gx = 60 + ((b * 191) % (N - 120))
    const gy = 60 + ((b * 331) % (N - 120))
    for (let t = 0; t < 4; t++) trace(gx + t * 7, gy + t * 7, 5, 3.4, COPPER)
  }
  // fan-out under the big package — fine pitch, tightly parallel
  x.strokeStyle = 'rgba(196,158,84,0.62)'; x.lineWidth = 2.4
  for (let i = 0; i < 56; i++) {
    const yy = 300 + i * 7.4
    x.beginPath(); x.moveTo(360, yy); x.lineTo(470 + (i % 9) * 12, yy); x.stroke()
  }

  // via barrels — a gold ring with the drill dark in the middle
  for (let i = 0; i < 150 * dense; i++) {
    const vx = 40 + ((i * 137) % (N - 80)), vy = 40 + ((i * 251) % (N - 80))
    x.beginPath(); x.arc(vx, vy, 5.2, 0, 7)
    x.fillStyle = 'rgba(201,169,97,0.85)'; x.fill()
    x.beginPath(); x.arc(vx, vy, 2.2, 0, 7)
    x.fillStyle = 'rgba(6,14,10,0.9)'; x.fill()
  }

  // ENIG pads — component footprints in pairs, plus a few QFN squares
  x.fillStyle = '#c9a961'
  for (let i = 0; i < 64 * dense; i++) {
    const px = 50 + ((i * 173) % (N - 100)), py = 50 + ((i * 89) % (N - 100))
    const vert = i % 3 === 0
    for (const d of [-11, 11]) {
      if (vert) x.fillRect(px - 7, py + d - 5, 14, 10)
      else x.fillRect(px + d - 5, py - 7, 10, 14)
    }
  }
  for (let i = 0; i < 7; i++) {
    const px = 90 + ((i * 233) % (N - 220)), py = 90 + ((i * 149) % (N - 220))
    for (let k = 0; k < 12; k++) {
      x.fillRect(px + k * 9, py, 6, 13)
      x.fillRect(px + k * 9, py + 96, 6, 13)
    }
  }

  // silkscreen — outlines and reference designators
  x.strokeStyle = 'rgba(232,240,244,0.5)'; x.lineWidth = 2
  x.font = '600 15px ui-monospace, Menlo, monospace'
  x.fillStyle = 'rgba(232,240,244,0.46)'
  for (let i = 0; i < 30 * dense; i++) {
    const px = 60 + ((i * 211) % (N - 160)), py = 60 + ((i * 127) % (N - 160))
    x.strokeRect(px, py, 44, 26)
    x.fillText(['U', 'C', 'R', 'L', 'J', 'D'][i % 6] + (i + 1), px + 2, py - 5)
  }
  return tex(cv)
}

// ---- die floorplans --------------------------------------------------------
//  What actually tells a CPU from a GPU from an NPU is the FLOORPLAN, not the
//  colour. A CPU is a handful of large complex cores beside a big cache; a GPU
//  is the same small shader block tiled hundreds of times; an NPU is one huge
//  uniform MAC array with SRAM banked down its sides. Drawing those makes the
//  three legible at a glance and gives each one something to hold a close-up.
function dieTexture(kind: 'cpu' | 'gpu' | 'npu', tint: string) {
  const N = 512
  const cv = document.createElement('canvas'); cv.width = cv.height = N
  const x = cv.getContext('2d')!
  x.fillStyle = '#0a1418'; x.fillRect(0, 0, N, N)
  const glow = (a: number) => `rgba(${parseInt(tint.slice(1, 3), 16)},${parseInt(tint.slice(3, 5), 16)},${parseInt(tint.slice(5, 7), 16)},${a})`

  if (kind === 'cpu') {
    // four big cores, each with its own block structure, over a shared L3
    for (let c = 0; c < 4; c++) {
      const cx2 = 30 + (c % 2) * 232, cy2 = 30 + ((c / 2) | 0) * 200
      x.fillStyle = glow(0.3); x.fillRect(cx2, cy2, 210, 150)
      x.strokeStyle = glow(0.85); x.lineWidth = 3; x.strokeRect(cx2, cy2, 210, 150)
      for (let i = 0; i < 5; i++) { x.fillStyle = glow(0.5); x.fillRect(cx2 + 12, cy2 + 12 + i * 27, 120, 18) }
      for (let i = 0; i < 8; i++) { x.fillStyle = glow(0.42); x.fillRect(cx2 + 145, cy2 + 12 + i * 17, 52, 11) }
    }
    x.fillStyle = glow(0.22); x.fillRect(30, 438, 452, 48)
    for (let i = 0; i < 22; i++) { x.fillStyle = glow(0.5); x.fillRect(36 + i * 20, 444, 13, 36) }
  } else if (kind === 'gpu') {
    // the same small shader block, tiled — that repetition IS the GPU
    for (let r = 0; r < 14; r++) for (let c = 0; c < 12; c++) {
      const px = 22 + c * 39, py = 20 + r * 33
      x.fillStyle = glow(0.34); x.fillRect(px, py, 32, 26)
      x.fillStyle = glow(0.62); x.fillRect(px + 3, py + 3, 26, 7)
      x.fillStyle = glow(0.45); x.fillRect(px + 3, py + 14, 12, 9); x.fillRect(px + 18, py + 14, 11, 9)
    }
    x.strokeStyle = glow(0.7); x.lineWidth = 4
    for (let c = 1; c < 4; c++) { x.beginPath(); x.moveTo(22 + c * 117, 10); x.lineTo(22 + c * 117, N - 10); x.stroke() }
  } else {
    // one enormous uniform MAC array with SRAM banked either side
    x.fillStyle = glow(0.2); x.fillRect(96, 26, 320, 400)
    x.strokeStyle = glow(0.5); x.lineWidth = 1.6
    for (let i = 0; i <= 32; i++) {
      x.beginPath(); x.moveTo(96 + i * 10, 26); x.lineTo(96 + i * 10, 426); x.stroke()
      x.beginPath(); x.moveTo(96, 26 + i * 12.5); x.lineTo(416, 26 + i * 12.5); x.stroke()
    }
    x.strokeStyle = glow(0.95); x.lineWidth = 4; x.strokeRect(96, 26, 320, 400)
    for (const bx of [22, 428]) {
      for (let i = 0; i < 11; i++) { x.fillStyle = glow(0.55); x.fillRect(bx, 30 + i * 36, 62, 27) }
    }
    x.fillStyle = glow(0.4); x.fillRect(96, 440, 320, 46)
  }
  // the marking every die carries
  x.fillStyle = 'rgba(226,238,244,0.9)'
  x.font = '700 34px ui-monospace, Menlo, monospace'
  x.fillText(kind.toUpperCase(), 20, N - 14)
  return tex(cv)
}

const DIE_TEX = {
  cpu: dieTexture('cpu', '#4fe8d8'),
  npu: dieTexture('npu', '#2fd4ff'),
  gpu: dieTexture('gpu', '#4fe08a'),
}

// ---- RF board artwork ------------------------------------------------------
//  Packed the way a real radio module is. RF boards are the DENSEST thing in a
//  product because everything has to sit inside its own shielded compartment
//  with a stitched ground wall around it, and every part carries a designator.
//
//  What makes it read as RF rather than as generic green board:
//   · compartment walls of stitched vias, not just an edge guard ring
//   · a coplanar waveguide feed — signal centred in poured ground
//   · an antenna keep-out with NO copper under it at all
//   · a meandered inverted-F antenna, which is what a chip antenna looks like
//   · matching networks in π sections either side of the balun
//   · differential pairs routed as tightly-coupled pairs, never single-ended
function rfTexture() {
  const N = 1024
  const cv = document.createElement('canvas'); cv.width = cv.height = N
  const x = cv.getContext('2d')!
  const GOLD = '#c9a961', SILK = 'rgba(232,240,244,0.62)'
  const via = (vx: number, vy: number, r = 5) => {
    x.beginPath(); x.arc(vx, vy, r, 0, 7); x.fillStyle = 'rgba(201,169,97,0.92)'; x.fill()
    x.beginPath(); x.arc(vx, vy, r * 0.4, 0, 7); x.fillStyle = 'rgba(4,16,10,0.92)'; x.fill()
  }
  const stitch = (x0: number, y0: number, dx: number, dy: number, n: number) => {
    for (let i = 0; i < n; i++) via(x0 + dx * i, y0 + dy * i)
  }
  const pad = (px: number, py: number, w: number, h: number) => { x.fillStyle = GOLD; x.fillRect(px, py, w, h) }
  const part = (px: number, py: number, w: number, h: number, ref: string, gap = 9) => {
    pad(px, py, w, h); pad(px + w + gap, py, w, h)
    x.strokeStyle = 'rgba(232,240,244,0.34)'; x.lineWidth = 1.6
    x.strokeRect(px - 4, py - 4, w * 2 + gap + 8, h + 8)
    x.fillStyle = SILK; x.font = '600 14px ui-monospace, Menlo, monospace'
    x.fillText(ref, px - 3, py - 9)
  }

  x.fillStyle = '#07281c'; x.fillRect(0, 0, N, N)
  x.fillStyle = 'rgba(255,255,255,0.055)'; x.fillRect(18, 18, N - 36, N - 36)
  x.strokeStyle = 'rgba(255,255,255,0.03)'; x.lineWidth = 2
  for (let i = -N; i < N * 2; i += 9) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i - N, N); x.stroke() }

  // ── antenna keep-out: bare laminate, no pour, no ground ──
  x.fillStyle = '#03150c'; x.fillRect(N - 372, 34, 338, 292)
  x.strokeStyle = 'rgba(232,240,244,0.55)'; x.lineWidth = 3
  x.setLineDash([11, 9]); x.strokeRect(N - 372, 34, 338, 292); x.setLineDash([])
  // meandered inverted-F antenna
  x.strokeStyle = GOLD; x.lineWidth = 11; x.lineJoin = 'miter'
  x.beginPath(); x.moveTo(N - 348, 296)
  let ay = 296
  for (let i = 0; i < 7; i++) {
    const top = 70 + (i % 2) * 8
    x.lineTo(N - 348 + i * 44, ay); x.lineTo(N - 348 + i * 44, top); x.lineTo(N - 348 + (i + 1) * 44, top)
    ay = i % 2 ? 296 : 262
    x.lineTo(N - 348 + (i + 1) * 44, ay)
  }
  x.stroke()
  x.lineWidth = 9; x.beginPath(); x.moveTo(N - 348, 296); x.lineTo(N - 348, 322); x.stroke()  // the shorting stub
  x.fillStyle = SILK; x.font = '600 21px ui-monospace, Menlo, monospace'
  x.fillText('ANT1  2.4 / 5 / 6 GHz', N - 366, 356)
  x.font = '600 16px ui-monospace, Menlo, monospace'
  x.fillText('KEEP-OUT — NO COPPER ANY LAYER', N - 366, 378)

  // ── shielded compartments, each walled in stitched vias ──
  const COMPARTMENTS: [number, number, number, number, string][] = [
    [60, 430, 380, 300, 'RF FRONT-END'],
    [470, 430, 300, 300, 'TRANSCEIVER'],
    [60, 770, 400, 210, 'PMIC / LDO'],
    [500, 770, 470, 210, 'HOST INTERFACE'],
  ]
  for (const [cx2, cy2, w, h, name] of COMPARTMENTS) {
    x.strokeStyle = 'rgba(232,240,244,0.5)'; x.lineWidth = 2.5; x.strokeRect(cx2, cy2, w, h)
    stitch(cx2 + 12, cy2 + 12, 19, 0, Math.floor((w - 24) / 19))
    stitch(cx2 + 12, cy2 + h - 12, 19, 0, Math.floor((w - 24) / 19))
    stitch(cx2 + 12, cy2 + 12, 0, 19, Math.floor((h - 24) / 19))
    stitch(cx2 + w - 12, cy2 + 12, 0, 19, Math.floor((h - 24) / 19))
    x.fillStyle = SILK; x.font = '600 19px ui-monospace, Menlo, monospace'
    x.fillText(name, cx2 + 6, cy2 - 8)
  }

  // ── coplanar waveguide: signal centred in poured ground ──
  x.strokeStyle = 'rgba(255,255,255,0.075)'; x.lineWidth = 52
  x.beginPath(); x.moveTo(150, 600); x.lineTo(430, 600); x.lineTo(520, 510); x.lineTo(690, 510); x.lineTo(N - 348, 350); x.stroke()
  x.strokeStyle = 'rgba(196,158,84,0.92)'; x.lineWidth = 13
  x.beginPath(); x.moveTo(150, 600); x.lineTo(430, 600); x.lineTo(520, 510); x.lineTo(690, 510); x.lineTo(N - 348, 350); x.stroke()
  // its ground walls, stitched right up against the trace
  for (let i = 0; i < 16; i++) { via(160 + i * 17, 566); via(160 + i * 17, 634) }

  // ── differential pairs to the host, routed as coupled pairs ──
  x.strokeStyle = 'rgba(196,158,84,0.72)'; x.lineWidth = 5
  for (let pr = 0; pr < 4; pr++) {
    const y0 = 812 + pr * 26
    for (const off of [0, 10]) {
      x.beginPath(); x.moveTo(520, y0 + off); x.lineTo(760, y0 + off); x.lineTo(830, y0 + off - 34); x.lineTo(950, y0 + off - 34); x.stroke()
    }
  }
  x.fillStyle = SILK; x.font = '600 16px ui-monospace, Menlo, monospace'
  x.fillText('MDI 0-3  100Ω DIFF', 524, 806)

  // ── the parts, each designated ──
  part(120, 470, 22, 38, 'L1'); part(200, 470, 22, 38, 'C1'); part(280, 470, 22, 38, 'L2')
  part(120, 660, 22, 38, 'C2'); part(200, 660, 22, 38, 'L3'); part(280, 660, 22, 38, 'C3')
  part(340, 470, 22, 38, 'FL1', 16)
  part(96, 812, 26, 42, 'C10'); part(220, 812, 26, 42, 'C11'); part(340, 812, 26, 42, 'L10')
  part(96, 900, 26, 42, 'C12'); part(220, 900, 26, 42, 'R1'); part(340, 900, 26, 42, 'R2')

  // transceiver QFN, its exposed pad and pin ring
  x.fillStyle = 'rgba(201,169,97,0.5)'; x.fillRect(560, 520, 130, 130)
  for (let i = 0; i < 16; i++) {
    pad(556 + i * 8.6, 500, 6, 18); pad(556 + i * 8.6, 652, 6, 18)
    pad(540, 496 + i * 8.6, 18, 6); pad(692, 496 + i * 8.6, 18, 6)
  }
  x.strokeStyle = 'rgba(232,240,244,0.66)'; x.lineWidth = 3; x.strokeRect(534, 490, 168, 186)
  x.beginPath(); x.arc(548, 504, 8, 0, 7); x.fillStyle = 'rgba(232,240,244,0.85)'; x.fill()
  x.fillStyle = 'rgba(232,240,244,0.9)'; x.font = '700 26px ui-monospace, Menlo, monospace'
  x.fillText('U5', 534, 482)
  x.font = '600 17px ui-monospace, Menlo, monospace'; x.fillStyle = SILK
  x.fillText('WI-FI 6E / BLE 5.4', 534, 700)

  // crystal, u.FL, test points, and the board marking
  pad(760, 540, 96, 58); x.strokeStyle = SILK; x.lineWidth = 2; x.strokeRect(756, 536, 104, 66)
  x.fillStyle = SILK; x.font = '600 17px ui-monospace, Menlo, monospace'
  x.fillText('Y1 38.4MHz', 756, 528)
  x.beginPath(); x.arc(806, 640, 26, 0, 7); x.strokeStyle = GOLD; x.lineWidth = 7; x.stroke()
  x.fillStyle = SILK; x.fillText('J2  U.FL', 774, 690)
  for (let i = 0; i < 6; i++) {
    const tx = 84 + i * 62
    x.beginPath(); x.arc(tx, 402, 9, 0, 7); x.fillStyle = GOLD; x.fill()
    x.fillStyle = SILK; x.font = '600 13px ui-monospace, Menlo, monospace'; x.fillText('TP' + (i + 1), tx - 13, 386)
  }
  for (const [fx, fy] of [[40, 40], [N - 40, N - 40]]) { x.beginPath(); x.arc(fx, fy, 11, 0, 7); x.fillStyle = GOLD; x.fill() }
  x.fillStyle = 'rgba(232,240,244,0.66)'; x.font = '600 21px ui-monospace, Menlo, monospace'
  x.fillText('SENTIENT · RADIO MODULE  RF-2', 52, N - 24)
  return tex(cv)
}

const RF_TEX = rfTexture()

// ---- SoC substrate artwork -------------------------------------------------
//  The engine names are SILKSCREENED where the dies land — U1/U2/U3 with their
//  part names beside them, the way a real substrate is marked — rather than
//  floated on tags in front of the object. Die u-coordinates are derived from
//  the same x offsets the meshes use (substrate is 0.32 wide, so u = (x+0.16)/0.32).
function socTexture() {
  const N = 1024
  const cv = document.createElement('canvas'); cv.width = cv.height = N
  const x = cv.getContext('2d')!
  x.fillStyle = '#07281c'; x.fillRect(0, 0, N, N)
  x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(20, 20, N - 40, N - 40)
  x.strokeStyle = 'rgba(255,255,255,0.028)'; x.lineWidth = 2
  for (let i = -N; i < N * 2; i += 11) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i - N, N); x.stroke() }

  const DIES: [string, string, number, number][] = [
    ['U1', 'CPU', 243, 0.42], ['U2', 'NPU', 493, 0.55], ['U3', 'GPU', 774, 0.40],
  ]
  // fan-out: fine parallel escape routing radiating off each die shadow
  x.lineWidth = 2.2
  for (const [, , cx2, w] of DIES) {
    const hw = (N * w) / 2
    x.strokeStyle = 'rgba(196,158,84,0.6)'
    for (let i = 0; i < 34; i++) {
      const yy = 250 + i * 15
      x.beginPath(); x.moveTo(cx2 - hw * 0.5, yy); x.lineTo(cx2 - hw * 0.5 - 40 - (i % 7) * 14, yy); x.stroke()
      x.beginPath(); x.moveTo(cx2 + hw * 0.5, yy); x.lineTo(cx2 + hw * 0.5 + 40 + (i % 7) * 14, yy); x.stroke()
    }
  }
  // die shadows + their markings
  for (const [ref, name, cx2, w] of DIES) {
    const hw = (N * w) / 2
    x.strokeStyle = 'rgba(232,240,244,0.62)'; x.lineWidth = 3
    x.strokeRect(cx2 - hw * 0.5, 236, hw, 540)
    // pin-1 chamfer, as marked on every package
    x.beginPath(); x.arc(cx2 - hw * 0.5 + 22, 258, 9, 0, 7); x.fillStyle = 'rgba(232,240,244,0.8)'; x.fill()
    x.fillStyle = 'rgba(232,240,244,0.92)'
    x.font = '700 40px ui-monospace, Menlo, monospace'; x.fillText(name, cx2 - hw * 0.5 + 6, 220)
    x.font = '600 27px ui-monospace, Menlo, monospace'; x.fillText(ref, cx2 - hw * 0.5 + 6, 815)
  }
  // decoupling field with real designators
  x.font = '600 15px ui-monospace, Menlo, monospace'
  for (let i = 0; i < 54; i++) {
    const px = 40 + ((i * 167) % (N - 90)), py = 40 + ((i * 313) % 170) + (i % 2 ? 800 : 0)
    x.fillStyle = '#c9a961'; x.fillRect(px, py, 13, 26); x.fillRect(px + 22, py, 13, 26)
    x.strokeStyle = 'rgba(232,240,244,0.4)'; x.lineWidth = 1.6; x.strokeRect(px - 4, py - 4, 43, 34)
    x.fillStyle = 'rgba(232,240,244,0.5)'; x.fillText('C' + (i + 1), px - 3, py - 9)
  }
  // fiducials + the board's own marking
  for (const [fx, fy] of [[46, 46], [N - 46, 46], [46, N - 46], [N - 46, N - 46]]) {
    x.beginPath(); x.arc(fx, fy, 11, 0, 7); x.fillStyle = '#c9a961'; x.fill()
  }
  x.fillStyle = 'rgba(232,240,244,0.62)'; x.font = '600 22px ui-monospace, Menlo, monospace'
  x.fillText('SENTIENT · EDGE COMPUTE MODULE  ECM-1', 60, N - 30)
  return tex(cv)
}
const SOC_TEX = socTexture()

const PCB_TEX = pcbTexture('#0b3626', 1)
const SUB_TEX = pcbTexture('#07281c', 0.55)   // package substrate — finer, darker


// ---- the exploded internals -------------------------------------------------
//  The Apple-keynote move: on the hero beat the unibody lifts away and the
//  boards it was covering fan out below it, each holding its own altitude and
//  carrying a leader to its name. Everything is driven off one `k` (0 sealed,
//  1 fully open) damped in EdgeServer, so the whole assembly opens and closes
//  as a single gesture rather than as six independent animations.
//
//  Layer order top-down is the real stack: heatsink and fan over the compute
//  die, compute over the main PCB, radio and storage on the underside.
//
//  Nothing here is transparent. Fading them in against a white cath-lab
//  floor made every board read as frosted glass — they mount when the
//  teardown starts and are solid from the first frame.
const LAYERS = [
  { id: 'fan',   y: 0.40, label: 'BLOWER · 12,000 RPM',       accent: '#8a99a8', side: -1 },
  // Each hero camera sits on one side of the object, so the label goes to
  // the other — a tag on the camera's own side sits in front of the board
  // it is naming. soc/radio are shot from world +x (server-local -x), the
  // PCB from world -x.
  { id: 'soc',   y: 0.26, label: 'CPU · GPU · NPU',           accent: '#4fe8d8', side:  1, ox: 0.38, hw: 0.16 },
  { id: 'pcb',   y: 0.13, label: 'MAIN PCB',                  accent: '#4fe08a', side: -1, ox: 0.42, hw: 0.2 },
  // ox — how far out the tag parks, per layer: boardHalf + half-pill + a
  // gap, so it always clears the board rather than lying across it. The
  // radio sits further still, using the empty right third of its own shot.
  { id: 'radio', y: 0.0,  label: 'BLE · WI-FI 6E · ETHERNET', accent: '#2fd4ff', side:  1, ox: 0.56, hw: 0.19 },
]

function Internals({ k }: { k: number }) {
  // nothing to draw while sealed — and this keeps the boards out of the
  // depth buffer entirely on every beat that is not the hero shot
  if (k < 0.02) return null
  const lift = (y: number) => y * k
  return (
    <group>
      {/* blower — hub, shroud and blades */}
      <group position={[0, lift(LAYERS[0].y), 0]}>
        <mesh><cylinderGeometry args={[0.115, 0.115, 0.016, 28]} /><meshStandardMaterial color="#2b323a" roughness={0.62} metalness={0.25} envMapIntensity={0.4} /></mesh>
        <mesh position={[0, 0.001, 0]}><cylinderGeometry args={[0.032, 0.032, 0.022, 20]} /><meshStandardMaterial color="#7d8b98" roughness={0.3} metalness={0.75} envMapIntensity={0.7} /></mesh>
        {Array.from({ length: 11 }, (_, i) => (
          <mesh key={i} position={[0, 0.002, 0]} rotation-y={(i / 11) * Math.PI * 2}>
            <boxGeometry args={[0.008, 0.014, 0.15]} />
            <meshStandardMaterial color="#3d4650" roughness={0.55} metalness={0.35} envMapIntensity={0.45} />
          </mesh>
        ))}
      </group>

      {/* THE COMPUTE MODULE. Three dies on one substrate, built the way a real
          package is: a green organic substrate, a black die-attach shelf, the
          silicon itself lidded in metal, then BGA balls underneath, decoupling
          caps around the shoulder, and a ring of substrate vias. The three
          engines are sized to their die area — the NPU is the biggest, which
          is the whole point of an inference box. */}
      <group position={[0, lift(LAYERS[1].y), 0]}>
        {/* organic substrate */}
        <RoundedBox args={[0.32, 0.009, 0.28]} radius={0.004} smoothness={3}>
          <meshStandardMaterial color="#07281c" roughness={0.68} metalness={0.2} envMapIntensity={0.35} />
        </RoundedBox>
        <mesh position={[0, 0.0047, 0]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[0.32, 0.28]} />
          <meshStandardMaterial map={SOC_TEX} roughness={0.58} metalness={0.34} envMapIntensity={0.5} />
        </mesh>
        {/* the BGA field on the underside */}
        {Array.from({ length: 88 }, (_, i) => {
          const c = i % 11, r = (i / 11) | 0
          return (
            <mesh key={`b${i}`} position={[-0.125 + c * 0.025, -0.007, -0.087 + r * 0.025]}>
              <sphereGeometry args={[0.0042, 6, 5]} />
              <meshStandardMaterial color="#c9a961" roughness={0.28} metalness={0.95} envMapIntensity={0.7} />
            </mesh>
          )
        })}
        {/* die-attach shelf */}
        <RoundedBox args={[0.25, 0.004, 0.2]} radius={0.002} smoothness={2} position={[0, 0.0075, 0]}>
          <meshStandardMaterial color="#08090b" roughness={0.5} metalness={0.3} />
        </RoundedBox>
        {/* the three engines, sized to real die area */}
        {[
          { x: -0.084, w: 0.05, d: 0.13, c: '#4fe8d8', k: 'cpu' as const },
          { x: -0.006, w: 0.088, d: 0.155, c: '#2fd4ff', k: 'npu' as const }, // the big one
          { x: 0.082, w: 0.056, d: 0.12, c: '#4fe08a', k: 'gpu' as const },
        ].map((e, i) => (
          <group key={`e${i}`} position={[e.x, 0.0125, 0]}>
            {/* silicon, with its floorplan showing */}
            <mesh><boxGeometry args={[e.w, 0.0055, e.d]} /><meshStandardMaterial color="#0a1418" roughness={0.34} metalness={0.5} /></mesh>
            <mesh position={[0, 0.0029, 0]} rotation-x={-Math.PI / 2}>
              <planeGeometry args={[e.w, e.d]} />
              <meshStandardMaterial map={DIE_TEX[e.k]} emissiveMap={DIE_TEX[e.k]} emissive={new Color(e.c)} emissiveIntensity={0.8} roughness={0.3} metalness={0.45} />
            </mesh>
            {/* bond-wire hint along the two long edges */}
            {[-1, 1].map((sgn) => (
              <mesh key={sgn} position={[sgn * e.w * 0.52, 0.001, 0]}>
                <boxGeometry args={[0.0025, 0.0018, e.d * 0.9]} />
                <meshStandardMaterial color="#c9a961" roughness={0.3} metalness={0.9} />
              </mesh>
            ))}
          </group>
        ))}
        {/* decoupling caps around the shoulder */}
        {[[-0.14, -0.115], [-0.14, 0.115], [0.14, -0.115], [0.14, 0.115], [0, -0.125], [0, 0.125], [-0.07, 0.125], [0.07, -0.125]].map(([x, z], i) => (
          <mesh key={`c${i}`} position={[x, 0.0075, z]}>
            <boxGeometry args={[0.012, 0.005, 0.007]} />
            <meshStandardMaterial color={i % 3 ? '#3a2318' : '#c9a961'} roughness={0.45} metalness={0.6} />
          </mesh>
        ))}
      </group>

      {/* main PCB — board, connectors, a scatter of components */}
      <group position={[0, lift(LAYERS[2].y), 0]}>
        {/* radius must stay UNDER half the thickness (0.0045) — at 0.005 the
            rounding bulged the solid past the artwork plane and buried it,
            which is why this board rendered bare while the others did not */}
        <RoundedBox args={[0.4, 0.009, 0.4]} radius={0.0034} smoothness={3}>
          <meshStandardMaterial color="#0b3626" roughness={0.68} metalness={0.2} envMapIntensity={0.35} />
        </RoundedBox>
        <mesh position={[0, 0.0049, 0]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[0.4, 0.4]} />
          <meshStandardMaterial map={PCB_TEX} roughness={0.58} metalness={0.34} envMapIntensity={0.5} />
        </mesh>
        {[[-0.14, -0.13], [0.13, -0.15], [-0.15, 0.12], [0.15, 0.11], [0.02, 0.16], [-0.06, -0.05]].map(([x, z], i) => (
          <mesh key={i} position={[x, 0.011, z]}>
            <boxGeometry args={[0.03 + (i % 3) * 0.012, 0.007, 0.022]} />
            <meshStandardMaterial color={i % 2 ? '#161c22' : '#c9a227'} roughness={0.5} metalness={0.55} envMapIntensity={0.5} />
          </mesh>
        ))}
      </group>

      {/* THE RADIO. A shielded can with its lid part-lifted so the RF section
          reads, a meandered PCB antenna on its own keep-out, a u.FL connector,
          the magjack for copper ethernet, and the NVMe module beside it. */}
      <group position={[0, lift(LAYERS[3].y), 0]}>
        {/* radio board */}
        <RoundedBox args={[0.21, 0.007, 0.135]} radius={0.003} smoothness={3} position={[-0.09, 0, 0]}>
          <meshStandardMaterial color="#07281c" roughness={0.68} metalness={0.2} envMapIntensity={0.35} />
        </RoundedBox>
        <mesh position={[-0.09, 0.0037, 0]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[0.21, 0.135]} />
          <meshStandardMaterial map={RF_TEX} roughness={0.58} metalness={0.34} envMapIntensity={0.5} />
        </mesh>
        {/* shield can, lid floating just above so the RF block shows */}
        <mesh position={[-0.152, 0.0125, -0.018]}><boxGeometry args={[0.066, 0.0125, 0.056]} /><meshStandardMaterial color="#0a0d11" roughness={0.55} metalness={0.4} /></mesh>
        <mesh position={[-0.152, 0.027, -0.018]}><boxGeometry args={[0.072, 0.0022, 0.062]} /><meshStandardMaterial color="#9aa6b2" roughness={0.28} metalness={0.92} envMapIntensity={0.95} /></mesh>

        {/* the transceiver QFN under the lifted lid, with its 40-pin ring */}
        <mesh position={[-0.152, 0.0075, -0.018]}><boxGeometry args={[0.03, 0.006, 0.03]} /><meshStandardMaterial color="#0e1319" roughness={0.45} metalness={0.35} /></mesh>
        {Array.from({ length: 40 }, (_, i) => {
          const sd = (i / 10) | 0, o = -0.0135 + (i % 10) * 0.003
          const pos: [number, number, number] =
            sd === 0 ? [-0.152 + o, 0.0055, -0.0345] : sd === 1 ? [-0.152 + o, 0.0055, -0.0015]
            : sd === 2 ? [-0.1685, 0.0055, -0.018 + o] : [-0.1355, 0.0055, -0.018 + o]
          return (
            <mesh key={`q${i}`} position={pos} rotation-y={sd < 2 ? 0 : Math.PI / 2}>
              <boxGeometry args={[0.0016, 0.0012, 0.004]} />
              <meshStandardMaterial color="#c9a961" roughness={0.3} metalness={0.92} />
            </mesh>
          )
        })}

        {/* crystal can — its own metal lid, as every radio has */}
        <mesh position={[-0.062, 0.007, -0.042]}><boxGeometry args={[0.022, 0.008, 0.014]} /><meshStandardMaterial color="#b6c2cc" roughness={0.26} metalness={0.9} envMapIntensity={0.95} /></mesh>

        {/* π matching network — twelve 0402s in two rows either side of the feed */}
        {Array.from({ length: 12 }, (_, i) => (
          <mesh key={`mn${i}`} position={[-0.115 + (i % 6) * 0.013, 0.0055, i < 6 ? -0.006 : 0.012]}>
            <boxGeometry args={[0.0055, 0.0035, 0.0028]} />
            <meshStandardMaterial color={i % 3 === 0 ? '#2b2119' : '#c9a961'} roughness={0.42} metalness={0.62} />
          </mesh>
        ))}

        {/* SMD passives over the rest of the board */}
        {[[-0.038, 0.03], [-0.026, 0.046], [-0.052, 0.05], [-0.012, 0.03], [-0.17, 0.038], [-0.145, 0.05], [-0.108, 0.052], [-0.078, 0.048]].map(([px, pz], i) => (
          <mesh key={`sm${i}`} position={[px, 0.0055, pz]} rotation-y={i % 2 ? Math.PI / 2 : 0}>
            <boxGeometry args={[0.006, 0.0032, 0.003]} />
            <meshStandardMaterial color={i % 4 ? '#1b2026' : '#8a6a2a'} roughness={0.45} metalness={0.55} />
          </mesh>
        ))}

        {/* Meandered antenna, sat INSIDE the keep-out. Element pitch and the
            feed length are derived from the board edge (local x 0.015) with a
            2mm margin — hardcoded offsets had the last two elements and the
            feed hanging off the laminate into open air. */}
        {Array.from({ length: 7 }, (_, i) => (
          <mesh key={`m${i}`} position={[-0.058 + i * 0.0098, 0.0045, 0.044]}>
            <boxGeometry args={[0.003, 0.0011, 0.024]} />
            <meshStandardMaterial color="#2fd4ff" emissive={new Color('#2fd4ff')} emissiveIntensity={1.15} />
          </mesh>
        ))}
        <mesh position={[-0.0286, 0.0045, 0.0325]}><boxGeometry args={[0.062, 0.0011, 0.003]} /><meshStandardMaterial color="#2fd4ff" emissive={new Color('#2fd4ff')} emissiveIntensity={1.15} /></mesh>
        {/* the shorting stub back to ground */}
        <mesh position={[-0.058, 0.0045, 0.0245]}><boxGeometry args={[0.003, 0.0011, 0.019]} /><meshStandardMaterial color="#2fd4ff" emissive={new Color('#2fd4ff')} emissiveIntensity={1.0} /></mesh>

        {/* u.FL connector, with its centre pin */}
        <mesh position={[-0.03, 0.0085, 0.012]}><cylinderGeometry args={[0.0055, 0.0055, 0.004, 12]} /><meshStandardMaterial color="#b8c2cc" roughness={0.28} metalness={0.92} /></mesh>
        <mesh position={[-0.03, 0.0108, 0.012]}><cylinderGeometry args={[0.0022, 0.0022, 0.0015, 10]} /><meshStandardMaterial color="#c9a961" roughness={0.3} metalness={0.95} /></mesh>

        {/* RJ45 magjack — eight gold contacts and its two link LEDs */}
        <group position={[0.045, 0.012, -0.03]}>
          <mesh><boxGeometry args={[0.05, 0.026, 0.042]} /><meshStandardMaterial color="#1a1d21" roughness={0.65} metalness={0.2} /></mesh>
          <mesh position={[0, 0, 0.022]}><boxGeometry args={[0.036, 0.018, 0.004]} /><meshStandardMaterial color="#c9a961" roughness={0.3} metalness={0.9} /></mesh>
          {Array.from({ length: 8 }, (_, i) => (
            <mesh key={`rj${i}`} position={[-0.0126 + i * 0.0036, 0.004, 0.0235]}>
              <boxGeometry args={[0.0014, 0.008, 0.0012]} />
              <meshStandardMaterial color="#c9a961" roughness={0.28} metalness={0.95} />
            </mesh>
          ))}
          {[-1, 1].map((sg) => (
            <mesh key={sg} position={[sg * 0.014, 0.006, 0.0215]}><boxGeometry args={[0.005, 0.005, 0.002]} /><meshStandardMaterial color={sg < 0 ? '#4fe08a' : '#e0a03a'} emissive={new Color(sg < 0 ? '#4fe08a' : '#e0a03a')} emissiveIntensity={1.1} /></mesh>
          ))}
        </group>


        {/* NVMe module on its standoff */}
        <RoundedBox args={[0.115, 0.006, 0.042]} radius={0.002} smoothness={3} position={[0.115, 0.004, 0.038]}>
          <meshStandardMaterial color="#07281c" roughness={0.68} metalness={0.2} />
        </RoundedBox>
        <mesh position={[0.115, 0.0072, 0.038]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[0.115, 0.042]} />
          <meshStandardMaterial map={SUB_TEX} roughness={0.58} metalness={0.32} />
        </mesh>
        {[0.085, 0.135].map((x, i) => (
          <mesh key={`n${i}`} position={[x, 0.0105, 0.038]}><boxGeometry args={[0.036, 0.007, 0.03]} /><meshStandardMaterial color="#141a20" roughness={0.5} metalness={0.35} /></mesh>
        ))}
      </group>
    </group>
  )
}

// A half of the unibody, HOLLOW — a face plate with four walls hanging off it,
// so the parted shell shows its wall thickness and the machined cavity inside
// rather than reading as two solid billets. `up` picks which way the walls go:
// the lid's hang down from its top plate, the tray's stand up from its floor.
//   W 0.46 outer · 0.0575 per half · 5mm wall · cavity lined in a darker alloy
function ShellHalf({ y, up }: { y: number; up: boolean }) {
  const H = 0.0575, W = 0.46, T = 0.005, WH = H - T
  const face = up ? y - H / 2 + T / 2 : y + H / 2 - T / 2      // floor or ceiling
  const wallY = up ? y + T / 2 : y - T / 2
  const e = W / 2 - T / 2
  return (
    <group>
      <RoundedBox args={[W, T, W]} radius={0.0018} smoothness={3} position={[0, face, 0]} material={ALU} castShadow />
      {/* four walls */}
      <mesh position={[0, wallY, e]} castShadow><boxGeometry args={[W, WH, T]} /><primitive object={ALU} attach="material" /></mesh>
      <mesh position={[0, wallY, -e]} castShadow><boxGeometry args={[W, WH, T]} /><primitive object={ALU} attach="material" /></mesh>
      <mesh position={[e, wallY, 0]} castShadow><boxGeometry args={[T, WH, W - T * 2]} /><primitive object={ALU} attach="material" /></mesh>
      <mesh position={[-e, wallY, 0]} castShadow><boxGeometry args={[T, WH, W - T * 2]} /><primitive object={ALU} attach="material" /></mesh>
      {/* the cavity floor, in the darker bead-blasted finish a machined
          pocket has — without it the inside reads as the same polished face
          as the outside and the hollow does not register */}
      <mesh position={[0, up ? face + T / 2 + 0.0004 : face - T / 2 - 0.0004, 0]} rotation-x={up ? -Math.PI / 2 : Math.PI / 2}>
        <planeGeometry args={[W - T * 2, W - T * 2]} />
        <meshStandardMaterial color="#7d868e" roughness={0.72} metalness={0.65} envMapIntensity={0.5} />
      </mesh>
    </group>
  )
}

function EdgeServer({ pos, ry = 0, float = false, open = false, focus }:
  { pos: [number, number, number]; ry?: number; float?: boolean; open?: boolean; focus?: string }) {
  const g = useRef<import('three').Group>(null)
  const shellTop = useRef<import('three').Group>(null)
  const shellBottom = useRef<import('three').Group>(null)
  const k = useRef(0)
  const [kv, setKv] = useState(0)
  // deep-links (?shot=6) land already-floated; live tour transitions animate
  const booted = useRef(false)
  useEffect(() => {
    if (!booted.current && g.current) { g.current.position.y = float ? 0.24 : 0; booted.current = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // product moment: levitate + slow turntable; on settle, ease back down and
  // unwind to the seated orientation
  useFrame((s, dt) => {
    const gr = g.current; if (!gr) return
    // hovers straight up off the table top, then settles back onto it
    gr.position.y = MathUtils.damp(gr.position.y, float ? 0.24 : 0, 2.0, dt)
    // one damped value drives the whole teardown; state is only pushed when
    // it moves enough to matter, so this is not a re-render every frame
    k.current = MathUtils.damp(k.current, open ? 1 : 0, 2.4, dt)
    if (Math.abs(k.current - kv) > 0.004) setKv(k.current)
    if (shellTop.current) shellTop.current.position.y = k.current * 0.5
    if (shellBottom.current) shellBottom.current.position.y = k.current * -0.2
    if (open) {
      // dead still — the CAMERA orbits this beat, not the object
      gr.rotation.y = MathUtils.damp(gr.rotation.y, Math.round(gr.rotation.y / (Math.PI * 2)) * Math.PI * 2, 2.2, dt)
    } else if (float) {
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
      {/* Sealed, the case names itself. This lives INSIDE the server group so
          it rides the hover — as a sibling in station space it stayed on the
          floor while the server floated up away from it. */}
      {!open && <Tag pos={[-0.56, 0.08, 0]} label="EDGE NODE" accent="#4fe8d8" w={0.5} lead={0.19} lw={0.0016} />}

      {/* the boards, revealed as the shell lifts */}
      <Internals k={kv} />
      {/* a label only while its own layer is the subject — during the
          teardown itself the boards speak for themselves */}
      {kv > 0.35 && LAYERS.filter((l) => l.id === focus).map((l) => (
        <Tag
          key={l.id}
          pos={[l.side * (l.ox ?? 0.33), l.y * kv, 0.0]}
          // NEGATIVE side: the tag is parked out at side*0.42 and the board
          // is at the centre, so the leader has to run back INWARD. A
          // positive lead points it out into empty room.
          label={l.label} accent={l.accent} w={0.52} lead={-l.side * ((l.ox ?? 0.38) - 0.156 - (l.hw ?? 0.2) + 0.12)} lw={0.0016}
        />
      ))}

      {/* THE SHELL, IN TWO HALVES — now a dome and the foot it stands on.
          The teardown is unchanged: the dome rises, the foot drops, and the
          boards are left standing in the gap between them. That the case is
          curved and the boards are flat is the point — the shell is a
          product, the inside is a machine. */}
      <group ref={shellTop}>
      {/* the dome. One shell, and the whole computer is under it. */}
      <mesh position={[0, 0.045, 0]} castShadow>
        <sphereGeometry args={[0.235, 44, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <primitive object={HOUSING} attach="material" />
      </mesh>
      {/* the vent band around its foot, where the intake actually is */}
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.2355, 0.2355, 0.032, 44, 1, true]} />
        <meshStandardMaterial map={PERF_TEX} roughness={0.6} metalness={0.4} side={DoubleSide} />
      </mesh>
      {/* the light slot, low on the shell and raked to sit flat against the
          curve. A dome has no front face to recess it into. */}
      <mesh position={[0, 0.072, 0.208]} rotation-x={-0.42}><planeGeometry args={[0.2, 0.03]} /><meshStandardMaterial color="#07141a" roughness={0.4} metalness={0.5} /></mesh>
      {/* Bloom keys on luminance>1.05, so pure white at 1.3 was well over and
          blew out into a hard flare that washed the plate below. Tinted and
          held just under the knee: the bar reads as lit, not incandescent. */}
      <mesh position={[0, 0.0735, 0.2095]} rotation-x={-0.42}>
        <planeGeometry args={[0.185, 0.022]} />
        <meshBasicMaterial map={BAR_TEX} color={hdr('#ffffff', 1.0)} toneMapped={false} transparent depthWrite={false} />
      </mesh>
      </group>

      <group ref={shellBottom}>
      {/* the foot the dome stands on — a shallow recessed disc, so the shell
          looks like it is resting rather than bolted down */}
      <mesh position={[0, 0.012, 0]}><cylinderGeometry args={[0.198, 0.216, 0.024, 44]} /><meshStandardMaterial color="#3a4046" roughness={0.85} metalness={0.1} /></mesh>
      {/* tiny red status LED, low front */}
      <mesh position={[0.1, 0.024, 0.185]} rotation-x={-Math.PI / 2.6}><circleGeometry args={[0.006, 12]} /><meshBasicMaterial color={hdr('#ff3b30', 1.1)} toneMapped={false} /></mesh>
      {/* the bar's cyan spill — was 1.4 over 1.1m, which floodlit the plate
          directly beneath it into a white pool. Just a hint now. */}
      <pointLight position={[0, 0.09, 0.3]} intensity={0.4} distance={0.6} decay={2} color={'#2fd4ff'} />
      </group>
      </group>
    </group>
  )
}

// ---- the room shell --------------------------------------------------------
function Room() {
  return (
    <group>
      {/* The bay ENDS at the glass partition (x=4.6) and the corridor takes
          over from there. It used to be a 12-wide slab running to x=6 with the
          corridor tucked underneath at y=-0.002, so the bay's warm tile carried
          straight through the glass and the corridor only appeared past x=6. */}
      <mesh rotation-x={-Math.PI / 2} position={[-0.7, 0, 0.3]} receiveShadow>
        <planeGeometry args={[10.6, 12]} /><primitive object={FLOOR} attach="material" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[6.5, 0, 0.3]} receiveShadow>
        <planeGeometry args={[3.8, 12]} /><primitive object={FLOOR_CORRIDOR} attach="material" />
      </mesh>
      {/* bed zone — deliberately untiled, a plain mat grounding the bed.
          The cath lab's own procedure-mat blue (#3f79c9) — it was the one
          warm surface left once the room went cool. */}
      <mesh rotation-x={-Math.PI / 2} position={[0.2, 0.006, -1.2]} receiveShadow>
        <planeGeometry args={[3.6, 4.4]} /><meshStandardMaterial color="#3f79c9" roughness={0.4} metalness={0.25} envMapIntensity={0.9} />
      </mesh>
      {/* Back + left walls, with chrome skirting where they meet the floor
          (the cath lab's trick — it stops a flat panel reading as a void)
          and a dado band. The back
          run stops at the glass too — at its old 12-wide it carried on past the
          partition and read as tiled corridor. 10.6 wide off centre x=-0.7
          spans -6 to 4.6, meeting the glass line exactly. */}
      <mesh position={[-0.7, 1.85, -5]} receiveShadow><planeGeometry args={[10.6, 3.7]} /><primitive object={WALL_BACK} attach="material" /></mesh>
      <mesh position={[-5, 1.85, 0.3]} rotation-y={Math.PI / 2} receiveShadow><planeGeometry args={[12, 3.7]} /><primitive object={WALL} attach="material" /></mesh>
      <mesh position={[-0.7, 0.06, -4.97]}><boxGeometry args={[10.6, 0.12, 0.06]} /><primitive object={CHROME} attach="material" /></mesh>
      <mesh position={[-4.97, 0.06, 0.3]} rotation-y={Math.PI / 2}><boxGeometry args={[12, 0.12, 0.06]} /><primitive object={CHROME} attach="material" /></mesh>
      <mesh position={[-0.7, 1.02, -4.982]}><boxGeometry args={[10.6, 0.26, 0.025]} /><primitive object={HOUSING2} attach="material" /></mesh>
      <mesh position={[-4.982, 1.02, 0.3]} rotation-y={Math.PI / 2}><boxGeometry args={[12, 0.26, 0.025]} /><primitive object={HOUSING2} attach="material" /></mesh>
      {/* ceiling + the T-grid strips running between the luminaires */}
      <mesh rotation-x={Math.PI / 2} position={[0, 3.7, 0.3]}>
        <planeGeometry args={[12, 12]} /><primitive object={CEIL} attach="material" />
      </mesh>
      <mesh position={[-0.4, 3.69, 0.3]}><boxGeometry args={[0.1, 0.015, 12]} /><primitive object={HOUSING2} attach="material" /></mesh>
      <mesh position={[0, 3.69, -0.9]}><boxGeometry args={[12, 0.015, 0.1]} /><primitive object={HOUSING2} attach="material" /></mesh>
      <mesh position={[0, 3.69, 2.2]}><boxGeometry args={[12, 0.015, 0.1]} /><primitive object={HOUSING2} attach="material" /></mesh>
      {/* front wall, behind the console. The original set was open on this side
          — it's the camera's fourth wall — so it has to sit past every shot:
          beat 0 stands at z=5.0 and beat 7 at 4.03, hence 6.2 (the floor slab
          ends at 6.3). Close enough to catch light, far enough to stay behind. */}
      <mesh position={[-0.7, 1.85, 6.2]} rotation-y={Math.PI} receiveShadow><planeGeometry args={[10.6, 3.7]} /><primitive object={WALL} attach="material" /></mesh>
      {/* Dado only — no rail and no skirting on this run. This wall is what
          stands behind the edge server on the hero and teardown beats, and a
          bright chrome handrail plus a dark floor strip both crossed the frame
          right where the product hangs. The back and left walls keep theirs;
          this one is a backdrop, not a wall you walk along. */}
      <mesh position={[-0.7, 1.02, 6.182]} rotation-y={Math.PI}><boxGeometry args={[10.6, 0.26, 0.025]} /><primitive object={HOUSING2} attach="material" /></mesh>
      {/* The corridor box, all in a pale grey so it reads as a lit space
          BEYOND the bay rather than a hole. Its back and front ends were open
          past x=4.6, so the room's own background colour showed through the
          glass as a brown void where a corridor should be. */}
      <mesh position={[8.4, 1.85, 0.3]} rotation-y={-Math.PI / 2}><planeGeometry args={[12, 3.7]} /><meshStandardMaterial color="#e3eae6" roughness={0.6} /></mesh>
      <mesh position={[6.5, 1.85, -5]}><planeGeometry args={[3.8, 3.7]} /><meshStandardMaterial color="#dde4e0" roughness={0.6} /></mesh>
      <mesh position={[6.5, 1.85, 6.3]} rotation-y={Math.PI}><planeGeometry args={[3.8, 3.7]} /><meshStandardMaterial color="#dde4e0" roughness={0.6} /></mesh>
      <mesh rotation-x={Math.PI / 2} position={[6.5, 3.7, 0.3]}>
        <planeGeometry args={[3.8, 12]} /><meshStandardMaterial color="#e8ede9" roughness={0.85} />
      </mesh>
      <CornerCam />
      {/* room signage — head wall, and one hanging off the glass header */}
      <RoomSign pos={[0.9, 3.0, -4.96]} />
      <group position={[3.4, 2.62, 4.16]} rotation-y={Math.PI}>
        {[-0.55, 0.55].map((dx, i) => (
          <mesh key={i} position={[dx, 0.33, 0]}><cylinderGeometry args={[0.012, 0.012, 0.28, 8]} /><primitive object={CHROME} attach="material" /></mesh>
        ))}
        <RoomSign pos={[0, 0, 0]} />
      </group>
      {/* stainless handrail tubes on standoff brackets, riding the dado band.
          The back run is trimmed to 10.6 with the wall it hangs on — at its
          original 11.4 it carried on through the glass into the corridor. */}
      <mesh position={[-0.7, 1.16, -4.9]} rotation-z={Math.PI / 2}><cylinderGeometry args={[0.03, 0.03, 10.4, 14]} /><primitive object={CHROME} attach="material" /></mesh>
      <mesh position={[-4.9, 1.16, 0.3]} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.03, 0.03, 11.4, 14]} /><primitive object={CHROME} attach="material" /></mesh>
      {[-4.5, -2.2, 0.6, 3.4].map((x, i) => (
        <mesh key={`hb${i}`} position={[x, 1.16, -4.95]}><boxGeometry args={[0.05, 0.05, 0.1]} /><primitive object={RAIL} attach="material" /></mesh>
      ))}
      {[-4.2, -1.2, 1.8, 4.8].map((z, i) => (
        <mesh key={`hl${i}`} position={[-4.95, 1.16, z]}><boxGeometry args={[0.1, 0.05, 0.05]} /><primitive object={RAIL} attach="material" /></mesh>
      ))}
    </group>
  )
}
// The room's eye — a ceiling dome camera in the glass-end corner of the back
// wall. A fixture, not a beat prop: it is mounted from the first shot, because
// Panel A has claimed VISION · LIVE all along and a camera that materialises
// only when its ribbon needs it would give the game away. Beat 19 just looks
// up at what was always there.
function CornerCam() {
  return (
    <group position={[4.25, 3.6, -4.55]}>
      <mesh><cylinderGeometry args={[0.095, 0.11, 0.055, 24]} /><primitive object={HOUSING2} attach="material" /></mesh>
      <mesh position={[0, -0.045, 0]}>
        <sphereGeometry args={[0.078, 24, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
        <meshPhysicalMaterial color="#10151c" roughness={0.12} metalness={0.1} clearcoat={1} clearcoatRoughness={0.08} />
      </mesh>
      {/* the recording tick */}
      <mesh position={[0.06, -0.02, 0.06]}>
        <sphereGeometry args={[0.008, 10, 10]} />
        <meshBasicMaterial color={hdr('#4cff88', 1.6)} toneMapped={false} />
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
          {/* luminaire housings parked with the ceiling — the LIGHT stays */}
          <pointLight position={[0, -0.6, 0]} intensity={2.6} distance={8.5} decay={2} color={'#fde8c8'} />
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
function MonitorStation({ float = false, tv = false, show = false, stand = false, open = false, focus, withC = false }:
  { float?: boolean; tv?: boolean; show?: boolean; stand?: boolean; open?: boolean; focus?: string; withC?: boolean }) {
  return (
    <group position={[0.2, 0, 2.1]} rotation-y={Math.PI}>
      {/* A low pedestal — weighted disc, single column, plate on top, and
          nothing above the plate. It only arrives once the unit comes DOWN
          onto it: while the server hovers there is deliberately nothing
          underneath it. Each part gates itself rather than sharing one outer
          fade, so the three can run on their own beats. */}
      <FadeIn on={stand}>
        <mesh position={[0, 0.03, 0]}><cylinderGeometry args={[0.3, 0.34, 0.06, 24]} /><primitive object={DARKP} attach="material" /></mesh>
        <mesh position={[0, 0.35, 0]}><cylinderGeometry args={[0.05, 0.062, 0.64, 16]} /><primitive object={RAIL} attach="material" /></mesh>
        <RoundedBox args={[0.72, 0.045, 0.5]} radius={0.012} smoothness={2} position={[0, 0.69, 0]} material={HOUSING} castShadow receiveShadow />
        {/* THE ARM. It leaves the dome’s crown rather than the plate’s back
            edge, which is the whole difference: the screen is carried by the
            machine, not propped up by the furniture next to it. Two chrome
            runs with a ball at each joint, so it reads as articulated. */}
        <mesh position={[0, 0.982, 0]}><sphereGeometry args={[0.046, 20, 16]} /><primitive object={CHROME} attach="material" /></mesh>
        <Strut a={[0, 0.982, 0]} b={[0, 1.30, -0.05]} r={0.026} mat={CHROME} />
        <mesh position={[0, 1.305, -0.05]}><sphereGeometry args={[0.042, 20, 16]} /><primitive object={CHROME} attach="material" /></mesh>
        <Strut a={[0, 1.305, -0.05]} b={[0, 1.452, 0.014]} r={0.022} mat={CHROME} />
        {/* the panel arrives with the stand but DARK — hardware first, and the
            room's data only fills it once the signals have merged. It drops
            onto the arm rather than appearing already seated. */}
        <DropIn on={stand}>
          <group position={[0, 1.48, 0.06]} rotation={[0.04, 0, 0]}>
            <RoundedBox args={[1.06, 0.73, 0.05]} radius={0.02} smoothness={3} material={BEZEL} castShadow />
            <mesh position={[0, 0, 0.028]}>
              <planeGeometry args={[0.99, 0.66]} />
              <meshBasicMaterial color="#0a1016" toneMapped={false} />
            </mesh>
          </group>
        </DropIn>
      </FadeIn>
      {/* the app-UI surface — body scan | TARS feed | LIS (the real frame).
          Its own layer, sitting a hair proud of the dark face, so the screen
          can light without the hardware re-appearing under it. */}
      <FadeIn on={tv}>
        <group position={[0, 1.48, 0.06]} rotation={[0.04, 0, 0]}>
          <mesh position={[0, 0, 0.031]} renderOrder={4}>
            <planeGeometry args={[0.99, 0.66]} />
            <meshBasicMaterial map={withC ? PANEL_AC_TEX : PANEL_A_TEX} transparent toneMapped={false} color={new Color(1.06, 1.06, 1.06)} depthWrite={false} />
          </mesh>
        </group>
      </FadeIn>
      {/* ry stays 0.15 (bar facing back up the bed axis) — DOCK at z=1.78 is
          tuned to that face, and flipping it would land every ribbon on the back */}
      <FadeIn on={show} rate={1.2}>
        <EdgeServer pos={[0, 0.735, 0]} ry={0.15} float={float} open={open} focus={focus} />
      </FadeIn>
    </group>
  )
}
// ventilator cart + breathing circuit to the patient's head
function Ventilator() {
  return (
    <group>
      <group position={[-2.15, 0, -1.05]} rotation-y={0.24}>
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
        <Tag pos={[0, 1.47, 0]} label="VENTILATOR" accent="#5fe8c8" w={0.72} stalk={0.26} />
      </group>
      {/* The two corrugated circuit hoses, ventilator flank → patient airway.
          These are authored in WORLD space (outside the cart's group), so the
          redistribution pass that moved the cart to x=-3.0 left them behind —
          they were still sprouting from the multipara's new spot at -1.75. */}
      {/* Start points are the cart's own upper flank — local [0.36, 1.00, 0.15]
          and [0.36, 0.86, 0.02] pushed through its origin/rotation — so they
          root INSIDE the shell (half-width is 0.4). Eyeballed world coords sat
          just proud of the case and the hoses hung in mid-air. */}
      <Hose pts={[[-1.765, 1.0, -0.99], [-1.3, 1.2, -1.25], [-0.75, 1.18, -1.42], [-0.3, 1.02, -1.48], [0.05, 0.95, -1.46]]} r={0.04} rep={16} />
      <Hose pts={[[-1.795, 0.86, -1.12], [-1.35, 1.06, -1.42], [-0.8, 1.04, -1.56], [-0.32, 0.92, -1.56], [0.02, 0.9, -1.52]]} r={0.04} rep={16} />
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
    <group position={[-1.75, 0, -2.55]} rotation-y={0.75}>
      {/* rolling stand: 5-star base + column + tilt yoke */}
      <mesh position={[0, 0.04, 0]}><cylinderGeometry args={[0.3, 0.36, 0.07, 5]} /><primitive object={DARKP} attach="material" /></mesh>
      {[[-0.22, -0.19], [0.22, -0.19], [-0.22, 0.19], [0.22, 0.19]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.04, z]}><sphereGeometry args={[0.04, 10, 10]} /><primitive object={DARKP} attach="material" /></mesh>
      ))}
      <mesh position={[0, 0.72, 0]}><cylinderGeometry args={[0.032, 0.042, 1.36, 12]} /><primitive object={CHROME} attach="material" /></mesh>
      <mesh position={[0, 1.36, 0.02]} rotation-x={-0.15}><boxGeometry args={[0.12, 0.1, 0.12]} /><primitive object={GREYPANEL} attach="material" /></mesh>
      {/* the monitor head: bezel + dark base + waves + overlay, tilted to the bed */}
      <group position={[0, 1.52, 0.08]} rotation={[-0.15, 0, 0]}>
        {/* case: deep shell + chunky bezel, screen inset into the front face */}
        <RoundedBox args={[0.88, 0.68, 0.16]} radius={0.03} smoothness={3} material={HOUSING2} castShadow receiveShadow />
        <RoundedBox args={[0.80, 0.60, 0.03]} radius={0.02} smoothness={3} position={[0, 0.01, 0.076]} material={BEZEL} />
        <mesh position={[0, 0.01, 0.094]}><planeGeometry args={[0.66, 0.5]} /><meshBasicMaterial color="#050d14" toneMapped={false} /></mesh>
        <mesh position={[0, 0.01, 0.096]}>
          <planeGeometry args={[0.66, 0.5]} />
          <meshBasicMaterial map={waves} color={new Color(1.3, 1.3, 1.3)} toneMapped={false} transparent depthWrite={false} />
        </mesh>
        <mesh position={[0, 0.01, 0.098]}>
          <planeGeometry args={[0.66, 0.5]} />
          <meshBasicMaterial map={overlay} color={new Color(1.25, 1.25, 1.25)} toneMapped={false} transparent depthWrite={false} />
        </mesh>
        {/* power LED + soft knob row under the screen */}
        <mesh position={[-0.33, -0.30, 0.082]}><circleGeometry args={[0.009, 10]} /><meshBasicMaterial color={hdr('#39f08a', 1.3)} toneMapped={false} /></mesh>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[0.15 + i * 0.085, -0.30, 0.085]} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.022, 0.022, 0.02, 12]} /><primitive object={GREYPANEL} attach="material" /></mesh>
        ))}
      </group>
      {/* lead bundle exit — small port block on the right flank */}
      <mesh position={[0.41, 1.34, 0.04]}><boxGeometry args={[0.07, 0.1, 0.08]} /><primitive object={GREYPANEL} attach="material" /></mesh>
      <Tag pos={[0, 2.02, 0.02]} label="MULTIPARA MONITOR" accent="#8fd0ff" w={0.72} stalk={0.26} />
    </group>
  )
}
// four stacked infusion channels on a pole, by the bed head
// Pulled in toward the bed head and turned to face the tour camera at
// [0.1, 1.72, -1.01] — parked out at x=1.85 the stack sat almost directly
// behind the scrub figure at [1.4, -1.55] on the wide approach.
function InfusionStack() {
  const screens = useMemo(() => [
    pumpScreenTexture('NORAD', '12.5', '#37c8ff'), pumpScreenTexture('PROPOFOL', '4.0', '#ff9ad5'),
    pumpScreenTexture('FENTANYL', '8.2', '#ffd77a'), pumpScreenTexture('INSULIN', '2.1', '#5fe8c8'),
  ], [])
  return (
    <group position={[1.26, 0, -2.63]} rotation-y={-0.64}>
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
      {/* IV line down to the patient's right arm. Leaves the NORAD channel
          (i=0, y=1.06) — it used to start at y=1.5, which is FENTANYL's box, so
          a blue line ran out of the amber pump. Solved in LOCAL space for this
          group's origin/rotation so it lands at world [0.56, 0.84, -1.50]. */}
      <Hose pts={[[0, 1.0, 0.13], [0.05, 0.85, 0.72], [0.11, 0.84, 1.32]]} r={0.008} mat={TUBE_BLUE} />
      <Tag pos={[0, 2.02, 0]} label="INFUSION STACK" accent="#ff9ad5" w={0.72} stalk={0.26} />
    </group>
  )
}
// two horizontal syringe drivers on a lean drip stand, parked behind the bed
// head alongside the infusion stack at [1.26, -2.63] — the two pole rigs read
// as a pair there, and it keeps the scrub figure out of the device's eye line.
function SyringePumps({ label = true }: { label?: boolean }) {
  const s1 = useMemo(() => pumpScreenTexture('HEPARIN', '6.4', '#ff9ad5'), [])
  const s2 = useMemo(() => pumpScreenTexture('MIDAZOLAM', '3.2', '#37c8ff'), [])
  return (
    <group position={[0.50, 0, -2.72]} rotation-y={0.02}>
      {/* taller and thinner on a smaller foot — 1.3m of pole on a 0.32 base read
          stumpy beside the infusion stack's 1.9m on 0.34. Also: at the old 1.0
          the upper driver at y=1.16 floated clear of the pole entirely. */}
      <mesh position={[0, 0.65, 0]}><cylinderGeometry args={[0.018, 0.022, 1.3, 10]} /><primitive object={CHROME} attach="material" /></mesh>
      <mesh position={[0, 0.03, 0]}><cylinderGeometry args={[0.2, 0.24, 0.05, 5]} /><primitive object={DARKP} attach="material" /></mesh>
      {/* midaz on the bottom rail so the single blue line leaves the blue channel */}
      {[[1.02, s2], [1.20, s1]].map(([y, s], i) => (
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
      {/* one line off the BOTTOM of the midaz driver, drifting right to clear
          the head board (world x -0.25..0.65 at z -1.78..-1.70 — a straight run
          would spear it) and back in onto the mattress edge. This rig was the
          one device in the room with no line at all. */}
      <Hose pts={[[0, 0.96, 0.10], [0.15, 0.88, 0.52], [0.24, 0.80, 0.91], [0.14, 0.72, 1.24]]} r={0.007} mat={TUBE_BLUE} />
      {label && <Tag pos={[0, 1.46, 0]} label="SYRINGE PUMPS" accent="#ffd77a" w={0.72} stalk={0.26} />}
    </group>
  )
}
// the dialysis / CRRT tower + integrated pole & bag — stood at the bed's right
// side, forward of the scrub figure at [1.4, -1.55]; out in the corner at
// [3.5, 1.35] it read as belonging to a different room.
function Dialysis() {
  const face = useMemo(() => dialysisScreenTexture(), [])
  return (
    <group position={[2.4, 0, -0.55]} rotation-y={-0.68}>
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
      {/* sits on the TOWER top (1.57), not up level with the bag on the pole —
          nudged left so the pill's right cap clears the pole at local x=0.2 */}
      <Tag pos={[-0.08, 1.71, 0]} label="CRRT · DIALYSIS" accent="#ffa8c8" w={0.72} stalk={0.26} />
    </group>
  )
}
// crash-cart DEFIBRILLATOR — biphasic unit on a single-deck castored trolley,
// stood at the bed's right side next to the CRRT tower (this is the spot the
// second scrub used to occupy). Paddles nested in their wells, charge live.
function Defibrillator() {
  return (
    <group position={[1.9, 0, -1.55]} rotation-y={-0.28}>
      {/* trolley: one deck on a castored frame */}
      <RoundedBox args={[0.66, 0.05, 0.5]} radius={0.02} smoothness={2} position={[0, 0.78, 0]} material={GREYPANEL} castShadow />
      {[[-0.28, -0.2], [0.28, -0.2], [-0.28, 0.2], [0.28, 0.2]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.42, 0]}><cylinderGeometry args={[0.018, 0.018, 0.76, 8]} /><primitive object={CHROME} attach="material" /></mesh>
          <mesh position={[0, 0.05, 0]}><sphereGeometry args={[0.05, 10, 10]} /><primitive object={DARKP} attach="material" /></mesh>
        </group>
      ))}
      <group position={[0, 1.0, 0]}>
        <RoundedBox args={[0.6, 0.42, 0.44]} radius={0.04} smoothness={3} material={DEFIB_RED} castShadow receiveShadow />
        {/* screen recessed into a dark bezel on the front face */}
        <RoundedBox args={[0.44, 0.3, 0.03]} radius={0.02} smoothness={3} position={[-0.05, 0.04, 0.222]} material={BEZEL} />
        <mesh position={[-0.05, 0.04, 0.242]}>
          <planeGeometry args={[0.38, 0.25]} />
          <meshBasicMaterial map={DEFIB_TEX} toneMapped={false} color={new Color(1.25, 1.25, 1.25)} />
        </mesh>
        {/* energy dial + the shock button */}
        <mesh position={[0.22, 0.06, 0.228]} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.05, 0.05, 0.03, 16]} /><primitive object={GREYPANEL} attach="material" /></mesh>
        <mesh position={[0.22, -0.09, 0.228]} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.035, 0.035, 0.035, 16]} /><meshBasicMaterial color={hdr('#ff8a2a', 1.5)} toneMapped={false} /></mesh>
        {/* paddles nested in their wells on top */}
        {[-0.15, 0.15].map((dx, i) => (
          <group key={i} position={[dx, 0.23, 0]}>
            <mesh><cylinderGeometry args={[0.075, 0.075, 0.04, 16]} /><primitive object={ALLOY} attach="material" /></mesh>
            <mesh position={[0, 0.07, 0]}><boxGeometry args={[0.07, 0.1, 0.05]} /><primitive object={DARKP} attach="material" /></mesh>
          </group>
        ))}
      </group>
      {/* paddle cables draping back into the unit's flanks */}
      <Hose pts={[[-0.15, 1.3, 0.02], [-0.25, 1.16, 0.14], [-0.31, 1.02, 0.2], [-0.3, 0.92, 0.18]]} r={0.012} mat={LEAD} />
      <Hose pts={[[0.15, 1.3, 0.02], [0.25, 1.16, 0.14], [0.31, 1.02, 0.2], [0.3, 0.92, 0.18]]} r={0.012} mat={LEAD} />
      <Tag pos={[0, 1.49, 0]} label="DEFIBRILLATOR" accent="#ff9a7a" w={0.72} stalk={0.26} />
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

// Machines are placed as the tour reaches them, so the bay fills up in front of
// the audience instead of arriving pre-cluttered. Driven purely by `step`, so
// stepping BACK removes them again and the sequence replays cleanly.
// Scale (not opacity) does the work: every material here is a shared
// module-level constant, so fading one device would fade all of them.
function Arrive({ on, children }: { on: boolean; children: React.ReactNode }) {
  const g = useRef<Group>(null!)
  const k = useRef(on ? 1 : 0)
  useFrame((_, dt) => {
    const o = g.current
    if (!o) return
    k.current = MathUtils.damp(k.current, on ? 1 : 0, 7, dt)
    const s = k.current
    o.visible = s > 0.004
    o.scale.setScalar(Math.max(0.0001, s))
    o.position.y = (1 - s) * -0.18
  })
  return <group ref={g}>{children}</group>
}
// Same idea as Arrive, but a true opacity fade — used where a machine should
// materialise in place rather than drop in. Every material in this scene is a
// shared module-level constant, so animating opacity on them directly would
// fade every other object using the same material; this clones each one once
// per instance on mount and animates the copies.
// Comes DOWN into its seat. The panel used to appear already in position,
// which read as a texture switching on rather than a part being fitted.
function DropIn({ on, from = 0.5, rate = 2.4, children }:
  { on: boolean; from?: number; rate?: number; children: React.ReactNode }) {
  const g = useRef<Group>(null!)
  return (
    <group ref={g} position={[0, from, 0]}>
      <DropDriver g={g} on={on} from={from} rate={rate} />
      {children}
    </group>
  )
}
// the frame loop lives in its own component so the group is mounted and
// measurable before the first damp runs
function DropDriver({ g, on, from, rate }:
  { g: RefObject<Group>; on: boolean; from: number; rate: number }) {
  useFrame((_, dt) => {
    const o = g.current
    if (!o) return
    o.position.y = MathUtils.damp(o.position.y, on ? 0 : from, rate, dt)
  })
  return null
}

function FadeIn({ on, rate = 1.6, children }: { on: boolean; rate?: number; children: React.ReactNode }) {
  const g = useRef<Group>(null!)
  const k = useRef(on ? 1 : 0)
  const mats = useRef<{ m: any; base: number }[]>([])
  const owned = useRef(new Map<any, any>())
  useFrame((_, dt) => {
    const o = g.current
    if (!o) return
    // Adopt on the frame, not on mount: children come and go mid-beat (the spec
    // labels mount when `specs` flips) and a mount-time clone would miss them.
    // The __fade marker also means a nested FadeIn keeps what it already owns —
    // otherwise an outer traverse re-clones the inner's meshes and the inner
    // ends up animating a material nothing is using.
    o.traverse((n: any) => {
      if (!n.isMesh || !n.material || n.userData.__fade) return
      let c = owned.current.get(n.material)
      if (!c) {
        c = n.material.clone(); c.transparent = true
        owned.current.set(n.material, c)
        // keep each clone's authored opacity so glass/bags stay translucent
        mats.current.push({ m: c, base: c.opacity })
      }
      n.material = c
      n.userData.__fade = true
    })
    k.current = MathUtils.damp(k.current, on ? 1 : 0, rate, dt)
    const s = k.current
    o.visible = s > 0.004
    for (const { m, base } of mats.current) m.opacity = base * s
  })
  return <group ref={g}>{children}</group>
}

// ---- the whole set ---------------------------------------------------------
// step drives the tour: 0 room · 1-5 device flybys · 6 server floats w/ spec
// callouts · 7 settles + zoom out · 8 signals emerge and merge · 9 into the
// interface screen
function ICUSet({ step, ribbons = 'off' }: { step: number; ribbons?: 'off' | 'flow' | 'drain' }) {
  const float = step >= 8 && step <= 12
  return (
    <group>
      <Room />
      <CeilingPanels />
      {/* the right side of the bay is glass, not tile — cubicle partition at
          x=4.6 with the corridor beyond it */}
      <GlassWall />
      <Bed />
      {/* one machine per beat — the clutter accumulates as the argument builds */}
      <Arrive on={step >= 1}><MultiparaMonitor /></Arrive>
      <Arrive on={step >= 2}><Ventilator /></Arrive>
      <Arrive on={step >= 3}><InfusionStack /></Arrive>
      {/* its pill sits 1.6m dead in front of the beat-11 camera, so it fills a
          third of that frame — dropped for that beat only */}
      <Arrive on={step >= 4}><SyringePumps label={step !== 11} /></Arrive>
      <Arrive on={step >= 5}><Dialysis /></Arrive>
      <Arrive on={step >= 6}><Defibrillator /></Arrive>
      {/* the answer arrives last — showing it earlier gives away the ending */}
      {/* the count at beat 7 stays clean — the answer only materialises on the
          NEXT beat, slow fade, and bare: no screen on the mast until the last */}
      {/* server fades in hovering at 8 with nothing under it, the pedestal
          arrives at 9 as it settles, the screen only at 11 */}
      <MonitorStation float={float} open={step >= 9 && step <= 12} focus={FOCUS[step]} show={step >= 8} stand={step >= 13} tv={step >= 18} withC={step >= 18} />
      <Arrive on={step >= 3}><IVPole x={-1.0} z={-2.85} /></Arrive>
      <Arrive on={step >= 5}><IVPole x={4.1} z={2.2} /></Arrive>
      {/* one clinician, leaning over the patient — the second scrub stood at
          [1.4, -1.55], which is where the defib cart now lives */}
      <StaffFigure pos={[-0.75, 0, -0.95]} ry={Math.PI / 2 - 0.3} lean={0.32} />
      <DataRibbons on={ribbons !== 'off'} drain={ribbons === 'drain'} />
      {/* the second wave joins beat by beat, then drains into the server with
          the first on the screen beat; the cut to 0 hides under the boot */}
      <SystemRibbons stage={step >= 19 ? 0 : step >= 17 ? 3 : step >= 16 ? 2 : step >= 15 ? 1 : 0} drain={ribbons === 'drain'} />
      {/* leads land with the monitor, blood lines with the CRRT tower */}
      <PatientLeads ecg={step >= 1} crrt={step >= 5} />
      {/* soft cyan spill around the console dock */}
      <pointLight position={[0.2, 1.5, 1.7]} intensity={1.5} distance={3} decay={2} color={'#5fe8d8'} />
    </group>
  )
}

// --- studio: County-General grade — warm fluorescents, green tile, moody edges --
function ICUStudio() {
  return (
    <>
      {/* The cath lab's rig, ported wholesale — that scene runs NoToneMapping
          too, so its numbers transfer exactly. Three things make it read as
          aero rather than as a dungeon or a whiteout:
            · NO FOG. A tinted fog over a small room is what hazed this bay.
            · a mid-slate void (#454f59) so the white room reads white
              against something, instead of white-on-white.
            · the interior wash done with POINT LIGHTS at ceiling height,
              not a big hemisphere — that is what gives the panelled,
              lit-from-within look without clipping.
          Its own note: cool/steel where the OR is warm — the room stays
          white, the glow stays blue. */}
      <color attach="background" args={['#454f59']} />
      <ambientLight intensity={0.35} color={0xdfe8f0} />
      <directionalLight
        castShadow
        intensity={0.72}
        color={0xf2f6fb}
        position={[6, 22, -10]}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={1}
        shadow-camera-far={80}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      {/* soft interior fills approximating the ceiling panel wash */}
      <pointLight position={[-2.4, 3.3, -2]} intensity={9} distance={16} decay={2} color={0xe8f0fa} />
      <pointLight position={[1.8, 3.3, 1.8]} intensity={9} distance={16} decay={2} color={0xe8f0fa} />
      <pointLight position={[0, 3.3, -3.4]} intensity={6} distance={14} decay={2} color={0xdfeafc} />

      {/* studio env -> glints on the chrome + glass */}
      <Environment resolution={256} frames={1}>
        <color attach="background" args={['#3d454e']} />
        <Lightformer form="rect" intensity={2.6} color="#f2f6fb" position={[0, 12, -14]} scale={[16, 9, 1]} />
        <Lightformer form="rect" intensity={2.2} color="#e4eefc" position={[-14, 8, 6]} scale={[2, 16, 1]} rotation-y={Math.PI / 2} />
        <Lightformer form="rect" intensity={2.2} color="#e4eefc" position={[14, 8, 6]} scale={[2, 16, 1]} rotation-y={-Math.PI / 2} />
        <Lightformer form="ring" intensity={1.1} color="#ffffff" position={[0, 18, 2]} scale={[12, 12, 1]} rotation-x={Math.PI / 2} />
      </Environment>
    </>
  )
}


// --- the guided tour --------------------------------------------------------
//  0 the room → 1-5 device flybys → 6 server FLOATS + rotates w/ spec labels
//  → 7 settles into the stand, camera zooms out → 8 the signals emerge from
//  every device and merge at the server → 9 fly INTO the interface screen
// k = glide rate INTO this beat; omit for the house default (2.2)
// orbit — radians/sec the camera walks around `look`, starting `hold`
// seconds after it arrives. Only the teardown uses them.
type Shot = { pos: [number, number, number]; look: [number, number, number]; k?: number; orbit?: number; hold?: number }
const SHOTS: Shot[] = [
  // you arrive from the CORRIDOR, looking in through the glass partition —
  // x=7.92 is past it (4.6) and just short of the corridor's far wall (8.4)
  { pos: [7.92, 1.93, 2.53], look: [0.9, 0.85, -1.1] },   // 0 · the room
  { pos: [-0.03, 1.67, -1.00], look: [-1.73, 1.45, -2.54] }, // 1 · multipara monitor
  { pos: [-1.38, 1.34, 2.11], look: [-2.15, 1.06, -1.10] },  // 2 · ventilator
  { pos: [-0.26, 1.62, -0.58], look: [1.26, 1.38, -2.63] }, // 3 · infusion stack
  { pos: [0.56, 1.35, -1.05], look: [0.58, 1.13, -2.71] },  // 4 · syringe pumps
  { pos: [0.24, 1.01, 2.15], look: [2.25, 1.16, -0.42] },   // 5 · CRRT dialysis
  { pos: [1.30, 1.32, 0.55], look: [1.90, 1.05, -1.55] },   // 6 · defibrillator
  // the count lands here — every machine present, nothing answering for them
  { pos: [0.13, 1.68, 4.03], look: [0.12, 1.05, -1.34] },   // 7 · the bay, from the foot
  // 8-9 shoot from the HEAD down the length of the bed: in close over the
  // patient for the hover, then pull back behind the head board as it lands
  { pos: [0.24, 1.38, -0.45], look: [0.2, 1.0, 2.01] },     // 8 · the server, hovering
  // 9 · the teardown, on the SAME camera as beat 8 — no cut, no move. The
  // shell just parts and the boards fan out in front of you. Look-at is
  // lifted a touch because the stack is taller than the sealed slab.
  { pos: [0.24, 1.38, -0.45], look: [0.2, 1.12, 2.01] },
  // 10-12 · one hero per board. Only the focused layer keeps its label.
  { pos: [0.5, 1.51, 1.67], look: [0.2, 1.23, 2.1], k: 1.6 },     // 10 · CPU · GPU · NPU
  { pos: [-0.31, 1.35, 1.67], look: [0.2, 1.11, 2.1], k: 1.6 },   // 11 · main PCB
  { pos: [0.51, 1.15, 1.6], look: [0.2, 1.0, 2.1], k: 1.6 },      // 12 · radio
  { pos: [0.2, 1.66, -2.66], look: [0.2, 0.94, 2.1] },      // 10 · it rests onto the stand
  // 14-17 · every beat where signal feeds the edge node is the SAME LOCKED
  // SHOT — front-left diagonal, holding the machines, the ribbons arcing over
  // the bed, and the server they land on. Nothing about the camera moves as
  // the second wave arrives; only new streams appear. Easing the look-at
  // between these read as the camera wandering, which fought the one thing the
  // sequence is about.
  { pos: [-5.15, 2.9, 3.19], look: [0.43, 1.42, -0.23] },  // 14 · the signals merge
  { pos: [-5.15, 2.9, 3.19], look: [0.43, 1.42, -0.23] },  // 15 · + camera
  { pos: [-5.15, 2.9, 3.19], look: [0.43, 1.42, -0.23] },  // 16 · + LIS · PACS
  { pos: [-5.15, 2.9, 3.19], look: [0.43, 1.42, -0.23] },  // 17 · + EMR
  // 18 · THEN the screen — from the bed side, everything drains in and the
  // panel lights showing A + C
  { pos: [0.22, 1.46, -0.36], look: [0.2, 1.48, 2.03] },
  // 19 · into the panel — PLEXUS boots over the loading iframe
  { pos: [0.2, 1.48, 0.62], look: [0.2, 1.48, 2.03], k: 1.5 },
  // 20 · the live app: Panels A + C, C resting on CASE, A his to navigate
  { pos: [0.2, 1.48, 0.62], look: [0.2, 1.48, 2.03], k: 1.5 },
]
const CAPTIONS = [
  'THE ROOM', 'MULTIPARA MONITOR', 'VENTILATOR', 'INFUSION STACK', 'SYRINGE PUMPS',
  'CRRT · DIALYSIS', 'DEFIBRILLATOR', 'SIX MACHINES · ONE PATIENT', 'EDGE SERVER · SPECS', 'INSIDE THE EDGE SERVER', 'CPU · GPU · NPU', 'MAIN PCB', 'RADIO · BLE / WI-FI 6E',
  'DOCKING', 'SIGNALS MERGE',
  'THE ROOM SEES · CAMERA', 'LIS · PACS · FROM THE HOSPITAL', 'EMR · READ AND WRITE',
  'THE SCREEN LIGHTS', 'INITIALISING PLEXUS', 'PLEXUS INTERFACE',
]
// ---------------------------------------------------------------------------
//  The live Panel A — the icu app itself (the same one the story's post-OR
//  chapter runs), iframed from scene-1's dev server in ?panela=1 mode so only
//  the dark scanner viewport renders. Copied here from post-op on purpose; the
//  post-op instance gets retired later.
//
//  Mounted one beat EARLY (during the boot) so the app loads behind the boot
//  screen; the boot then holds until the app posts icu:ready — the same
//  contract scene-1's own IcuFrame uses. Interaction is his: twin / scope /
//  watch are driven in the app, and the deck's clickable nav (parent document)
//  still advances the slide while the iframe holds keyboard focus.
// ---------------------------------------------------------------------------
function LivePanelA({ url, mounted, shown }: { url: string; mounted: boolean; shown: boolean }) {
  if (!mounted) return null
  return (
    <iframe
      src={url}
      style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', zIndex: 4,
        opacity: shown ? 1 : 0, transition: 'opacity .4s ease',
        pointerEvents: shown ? 'auto' : 'none',
      }}
      title="PLEXUS · Panel A"
    />
  )
}

// ---------------------------------------------------------------------------
//  The PLEXUS boot, built the same way as the ride's "Initialising TARS" loader
//  (sentient-scene1 App.tsx): a rounded tile carrying the agent's sigil over a
//  letterspaced caps line. Same construction, PLEXUS's colour and mark — so
//  arriving in an agent's world always looks the same, whichever agent it is.
//
//  Dark ground rather than TARS's light one, because the world on the other
//  side of it is the dark X-ray viewport rather than the light ward app.
// ---------------------------------------------------------------------------
function PlexusBoot({ show }: { show: boolean }) {
  return (
    <div
      style={{
        position: 'absolute', inset: 0, zIndex: 5,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 15,
        background: 'radial-gradient(1200px 900px at 50% 20%, #1b2431 0%, #141b26 40%, #0c1118 75%, #06080c 100%)',
        opacity: show ? 1 : 0,
        // visibility is discrete, so it has to be held back by the fade's own
        // duration or the panel snaps instead of dissolving
        transition: show
          ? 'opacity .5s ease, visibility 0s linear 0s'
          : 'opacity .5s ease, visibility 0s linear .5s',
        visibility: show ? 'visible' : 'hidden',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          width: 46, height: 46, borderRadius: 13,
          background: 'linear-gradient(145deg,#ff8a99,#e03350)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {/* the starburst from the MAAYA cube — eight rays, long and short */}
        <svg width={26} height={26} viewBox="0 0 24 24" aria-hidden>
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i * Math.PI) / 4
            const L = i % 2 ? 6.6 : 9.6
            return (
              <line key={i} x1="12" y1="12"
                x2={12 + Math.cos(a) * L} y2={12 + Math.sin(a) * L}
                stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
            )
          })}
          <circle cx="12" cy="12" r="1.2" fill="#fff" />
        </svg>
      </div>
      <div style={{ fontSize: 11, letterSpacing: '0.26em', textTransform: 'uppercase', color: 'rgba(207,231,242,.55)' }}>
        Initialising PLEXUS
      </div>
    </div>
  )
}

const N_BEATS = SHOTS.length
const LAST = N_BEATS - 1

// which board owns each hero beat — everything else shows no label
const FOCUS: Record<number, string | undefined> = { 10: 'soc', 11: 'pcb', 12: 'radio' }

// smooth glide between presets (the OR rig)
function GlideRig({ controls, goal }: {
  controls: RefObject<OrbitControlsImpl | null>
  goal: MutableRefObject<Shot | null>
}) {
  const held = useRef(-1)
  useFrame((_, dt) => {
    const g = goal.current
    const c = controls.current
    if (!g || !c) { held.current = -1; return }
    const cam = c.object
    const k = g.k ?? 2.2
    cam.position.x = MathUtils.damp(cam.position.x, g.pos[0], k, dt)
    cam.position.y = MathUtils.damp(cam.position.y, g.pos[1], k, dt)
    cam.position.z = MathUtils.damp(cam.position.z, g.pos[2], k, dt)
    c.target.x = MathUtils.damp(c.target.x, g.look[0], k, dt)
    c.target.y = MathUtils.damp(c.target.y, g.look[1], k, dt)
    c.target.z = MathUtils.damp(c.target.z, g.look[2], k, dt)
    c.update()
    const d = Math.hypot(cam.position.x - g.pos[0], cam.position.y - g.pos[1], cam.position.z - g.pos[2])
    if (d < 0.05) {
      // an orbiting shot never releases to OrbitControls — it keeps its goal
      // and hands off to the walk-around below
      if (!g.orbit) { goal.current = null; c.enabled = true }
      else if (held.current < 0) held.current = 0
    }
    // once arrived, swing the camera around the look-at point on its own
    // radius and height. The subject does not move; the viewpoint does.
    if (g.orbit && held.current >= 0) {
      held.current += dt
      if (held.current < (g.hold ?? 0)) return
      const dx = cam.position.x - g.look[0]
      const dz = cam.position.z - g.look[2]
      const r = Math.hypot(dx, dz)
      const a = Math.atan2(dz, dx) + g.orbit * dt
      cam.position.x = g.look[0] + Math.cos(a) * r
      cam.position.z = g.look[2] + Math.sin(a) * r
      c.update()
    }
  })
  return null
}

// ?shot=N — land directly on a preset (headless screenshots / deep links)
const INIT_SHOT = (() => {
  const v = parseInt(new URLSearchParams(window.location.search).get('shot') ?? '0', 10)
  return Number.isFinite(v) ? Math.min(Math.max(v, 0), LAST) : 0
})()

export function ICUScene({ onExitForward, onExitBack, startAt, onBeat }: {
  onExitForward?: () => void
  onExitBack?: () => void
  /** Report the current beat upward, so the deck's bar can tell the ward tour
   *  from the live interface. Without it, walking PLEXUS → the UI left the bar
   *  still lit on CCU: the deck only knew which beat you had JUMPED to, never
   *  which one you had walked to. */
  onBeat?: (n: number) => void
  // Which beat to open on. The deck's navigation bar lists the live PLEXUS
  // interface (beats 19-20, Panels A + C) as a stop of its own, because it is a
  // different thing from the ward tour that precedes it and being able to reach
  // one without sitting through the other is the whole point of the bar.
  startAt?: number
} = {}) {
  const controls = useRef<OrbitControlsImpl>(null)
  const [step, setStep] = useState(startAt ?? INIT_SHOT)
  useEffect(() => { onBeat?.(step) }, [step, onBeat])
  const glideGoal = useRef<Shot | null>(null)
  useShotCapture(controls) // DEV: P = copy current camera as a SHOT line
  // read the beat off a ref, not the updater: advancing past the last beat is a
  // side effect (hand the deck back its →), and updaters run twice under StrictMode
  const stepRef = useRef(INIT_SHOT)
  useEffect(() => { stepRef.current = step }, [step])
  // The device streams flow from SIGNALS MERGE all the way through the second
  // wave's arrivals (15-17) — every source converging at once is the picture —
  // and only start emptying on the screen beat, so the panel lights as the
  // last of the data goes in. The drain finishes under the boot cover.
  const [ribbons, setRibbons] = useState<'off' | 'flow' | 'drain'>('off')
  useEffect(() => {
    if (step >= 14 && step <= 17) { setRibbons('flow'); return }
    if (step === 18) {
      setRibbons('flow')
      const a = setTimeout(() => setRibbons('drain'), 900)
      return () => clearTimeout(a)
    }
    setRibbons('off')
  }, [step])
  // The live app posts icu:ready when it is up, and — because the iframe owns
  // keyboard focus while he mouse-drives the interface — it forwards → / ← up
  // as plexus:next / plexus:prev. Those are BEAT navigation: the same moves the
  // deck's own key handler makes, exits included.
  const [liveReady, setLiveReady] = useState(false)
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'icu:ready') setLiveReady(true)
      if (e.data?.type === 'plexus:next') {
        if (onExitForward && stepRef.current === LAST) { onExitForward(); return }
        setStep((v) => Math.min(v + 1, LAST))
      }
      if (e.data?.type === 'plexus:prev') {
        if (onExitBack && stepRef.current === 0) { onExitBack(); return }
        setStep((v) => Math.max(v - 1, 0))
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [onExitForward, onExitBack])
  // safety net, as in scene-1's IcuFrame: never strand the boot screen
  useEffect(() => {
    if (step !== 19 && step !== 20) { setLiveReady(false); return }
    const t = window.setTimeout(() => setLiveReady(true), 4000)
    return () => window.clearTimeout(t)
  }, [step])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowRight') {
        e.preventDefault()
        if (onExitForward && stepRef.current === LAST) { onExitForward(); return }
        setStep((s) => Math.min(s + 1, LAST))
      } else if (e.code === 'ArrowLeft' || e.code === 'Backspace') {
        e.preventDefault()
        // stepping back off beat 0 hands ← to the section before the ward
        if (onExitBack && stepRef.current === 0) { onExitBack(); return }
        setStep((s) => Math.max(s - 1, 0))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onExitForward, onExitBack])
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
        <ICUSet step={step} ribbons={ribbons} />
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
        <Postprocessing dark />
      </Canvas>

      {/* Panel C rests on CASE; Panel A opens on the twin and is his to
          navigate — no win param, the tabs are mouse-driven */}
      <LivePanelA url="http://localhost:5210/icu.html?chapter=postop&panela=1&panelc=1&app=case"
        mounted={step === 19 || step === 20} shown={step === 20 && liveReady} />
      <PlexusBoot show={step === 19 || (step === 20 && !liveReady)} />

      {/* the beat chip is gone — the room is the slide. CAPTIONS still names
          each beat for anyone reading SHOTS. */}
    </div>
  )
}
