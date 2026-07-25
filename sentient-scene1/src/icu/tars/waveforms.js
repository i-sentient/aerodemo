// ===========================================================================
//  SHARED WAVEFORM ENGINE — one source of traces for the device-hover overlay
//  AND the SCOPE window (and the bottom ECG strip could migrate here too).
//  Each sampler takes a cycle phase (0..1) and returns y in ~[-1, 1]. A trace
//  is heart-rate-paced ('hr') or respiratory ('rr'). makeMiniScope() runs a
//  small scrolling render on a canvas; SCOPE will reuse the same samplers at a
//  larger size.
// ===========================================================================

import { state } from './state.js';

const HR = 96, RR = 14; // Chandrababu · POD 0 (fixed for the demo)

function ecg(p) {
  if (p < 0.12) return Math.sin(p / 0.12 * Math.PI) * 0.16;   // P
  if (p < 0.18) return 0;
  if (p < 0.20) return -0.18;                                  // Q
  if (p < 0.23) return 1.0;                                    // R
  if (p < 0.26) return -0.34;                                  // S
  if (p < 0.46) return 0;
  if (p < 0.62) return Math.sin((p - 0.46) / 0.16 * Math.PI) * 0.30; // T
  return 0;
}
function pleth(p) { const s = Math.max(0, Math.sin(p * Math.PI)) * (1 - 0.32 * p); return s * 1.7 - 0.7; } // upstroke + runoff
function abp(p) {
  if (p < 0.12) return -1 + (p / 0.12) * 1.85;                 // sharp upstroke
  if (p < 0.30) return 0.85 - ((p - 0.12) / 0.18) * 0.45;
  if (p < 0.36) return 0.40 + Math.sin((p - 0.30) * 30) * 0.12; // dicrotic notch
  return 0.40 - ((p - 0.36) / 0.64) * 1.4;                     // diastolic runoff
}
function cvp(p) { return 0.42 * Math.sin(p * Math.PI * 2 - 0.4) + 0.22 * Math.sin(p * Math.PI * 6) - 0.05; } // a-c-v
function vent(p) {                                             // airway pressure (PIP → PEEP)
  if (p < 0.08) return -1 + (p / 0.08) * 2;
  if (p < 0.33) return 1;
  if (p < 0.42) return 1 - ((p - 0.33) / 0.09) * 2;
  return -1;
}
function capno(p) {                                            // EtCO₂ rectangular plateau
  if (p < 0.50) return -1;
  if (p < 0.58) return -1 + ((p - 0.50) / 0.08) * 2;
  if (p < 0.92) return 1;
  if (p < 0.97) return 1 - ((p - 0.92) / 0.05) * 2;
  return -1;
}
function iabp(p) {                                             // arterial WITH balloon augmentation
  if (p < 0.10) return -0.6 + (p / 0.10) * 1.5;               // systole
  if (p < 0.25) return 0.9 - ((p - 0.10) / 0.15) * 0.7;
  if (p < 0.46) return 0.2 + Math.sin((p - 0.25) / 0.21 * Math.PI) * 0.7; // augmentation bump
  return 0.2 - ((p - 0.46) / 0.54) * 0.85;                    // lowered end-diastole
}

// each trace carries a light + dark colour — deeper on the light strip, bright
// on the dark monitor screen — so both themes read clean
export const WAVES = {
  ecg:   { label: 'ECG · II',   dark: '#2fbf71', light: '#159a56', rate: 'hr', sample: ecg },
  pleth: { label: 'SpO₂ pleth', dark: '#57c8e0', light: '#1f8fb0', rate: 'hr', sample: pleth },
  abp:   { label: 'ART',        dark: '#ff6a64', light: '#d84a44', rate: 'hr', sample: abp },
  cvp:   { label: 'CVP',        dark: '#9db6e6', light: '#5a78bc', rate: 'hr', sample: cvp },
  vent:  { label: 'Paw',        dark: '#5fb0e0', light: '#2f80b8', rate: 'rr', sample: vent },
  capno: { label: 'EtCO₂',      dark: '#e0b34c', light: '#b0891a', rate: 'rr', sample: capno },
  iabp:  { label: 'IABP · aug', dark: '#ff8a5a', light: '#d86a30', rate: 'hr', sample: iabp },
};

const SPEED = 80, GAP = 1.4; // samples/sec · px between samples (matches the ECG strip)

// A small scrolling scope on a canvas. Returns { start, stop }. Cheap enough to
// spin up per hover card; SCOPE will call the same with bigger canvases.
export function makeMiniScope(canvas, key) {
  const w = WAVES[key]; if (!w) return { start() {}, stop() {} };
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cyc = (w.rate === 'rr' ? RR : HR) / 60; // cycles per second
  let buf = [], phase = 0, raf = 0, last = 0;
  function frame(t) {
    if (!last) last = t; const dt = Math.min(0.05, (t - last) / 1000); last = t;
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (!cw || !ch) { raf = requestAnimationFrame(frame); return; }
    if (canvas.width !== Math.round(cw * dpr)) { canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    const n = Math.max(1, Math.round(dt * SPEED));
    for (let i = 0; i < n; i++) { phase = (phase + cyc / SPEED) % 1; buf.push(w.sample(phase)); }
    const maxN = Math.ceil(cw / GAP) + 2; while (buf.length > maxN) buf.shift();
    ctx.clearRect(0, 0, cw, ch);
    const mid = ch * 0.55, amp = ch * 0.38;
    const color = state.dark ? w.dark : w.light;
    ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = state.dark ? 4 : 0; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.beginPath();
    for (let i = 0; i < buf.length; i++) { const x = i * GAP, y = mid - buf[i] * amp; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke(); ctx.shadowBlur = 0;
    raf = requestAnimationFrame(frame);
  }
  return { start() { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } }, stop() { cancelAnimationFrame(raf); raf = 0; } };
}
