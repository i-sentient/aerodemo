import { beds, bedById } from './ontology.js';
import { state, onModeChange, setMode } from './state.js';
import { lerp } from './utils.js';

let root, floorLayer, patientLayer, wipe, ecgCv, ecgX;
let lsamRevealAt = 0, lsamShown = 0;
let ecgBuf = [], beatPhase = 0;
const ECG_SPEED = 80, ECG_GAP = 1.4, DPR = Math.min(devicePixelRatio || 1, 2);

const rosterRows = beds.map((b) => `
  <button class="rrow" data-bed="${b.id}">
    <span class="rdot ${b.patient.acuity}"></span>
    <span class="rid">${b.id}</span>
    <span class="rnm">${b.patient.name}</span>
    <span class="rdx">${b.patient.dx}</span>
    <span class="rnews ${b.patient.acuity}">N2&nbsp;${b.traj.news2}</span>
  </button>`).join('');

const TPL = `
  <div class="hud-bracket tl"></div><div class="hud-bracket tr"></div>
  <div class="hud-bracket bl"></div><div class="hud-bracket br"></div>
  <div class="hud-scan"></div>
  <div class="hud-grid"></div>
  <div class="hud-vignette"></div>

  <div class="hud-floor">
    <!-- ward-tour layout: roster top-left · title centred (stage-hd) ·
         capacity bottom-right · foot bottom-left -->
    <div class="rise roster">
      <div class="tk">PATIENTS · select to scan ›</div>
      <div class="rlist">${rosterRows}</div>
    </div>
    <div class="rise readout">
      <div class="tk">CAPACITY</div><div class="num" id="wardCap">8 / 8</div><div class="u">beds occupied</div>
    </div>
    <div class="rise foot">REF 0xN-ICU · GRID 8x · <span id="h_clock">--:--:--</span></div>
  </div>

  <div class="hud-patient">
    <svg class="reticle" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet">
      <circle cx="100" cy="100" r="86" class="r-faint"/>
      <circle cx="100" cy="100" r="70" class="r-ring"/>
      <g class="r-spin">
        <circle cx="100" cy="100" r="92" class="r-faint2"/>
        ${Array.from({ length: 36 }).map((_, i) => { const a = i * 10 * Math.PI / 180; const x1 = 100 + Math.cos(a) * 88, y1 = 100 + Math.sin(a) * 88, x2 = 100 + Math.cos(a) * (i % 3 ? 92 : 95), y2 = 100 + Math.sin(a) * (i % 3 ? 92 : 95); return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="r-tick"/>`; }).join('')}
      </g>
      <line x1="100" y1="6" x2="100" y2="26" class="r-cross"/><line x1="100" y1="174" x2="100" y2="194" class="r-cross"/>
      <line x1="6" y1="100" x2="26" y2="100" class="r-cross"/><line x1="174" y1="100" x2="194" y2="100" class="r-cross"/>
      <line x1="100" y1="40" x2="100" y2="160" class="r-axis"/>
    </svg>
    <div class="tele tl">
      <div class="tk">BODY SCAN · <span id="p_id">ICU-04</span></div>
      <div class="vit"><span>HR</span><b id="p_hr">--</b><i>bpm</i></div>
      <div class="vit"><span>BP</span><b id="p_bp">--</b><i>mmHg</i></div>
      <div class="vit"><span>SpO₂</span><b id="p_spo2">--</b><i>%</i></div>
      <div class="vit"><span>RR</span><b id="p_rr">--</b><i>/min</i></div>
      <div class="vit"><span>TEMP</span><b id="p_temp">--</b><i>°C</i></div>
    </div>
    <div class="tele tr">
      <div class="tk">SUBJECT</div>
      <div class="big" id="p_name">—</div>
      <div class="kv"><span>AGE/SEX</span><b id="p_as">—</b></div>
      <div class="kv"><span>MRN</span><b id="p_mrn">—</b></div>
      <div class="kv"><span>DX</span><b id="p_dx">—</b></div>
      <div class="kv"><span>ADMIT</span><b id="p_admit">—</b></div>
    </div>
    <div class="tele bl lsam">
      <div class="tk">L<b>Sam</b> TRAJECTORY · <span id="p_lstatus" class="st">ANALYZING</span></div>
      <div class="lrow"><div><span>NEWS2</span><b id="p_news">…</b></div><div><span>DETERIORATION</span><b id="p_prob">…</b></div></div>
      <div class="lbar"><i id="p_bar"></i></div>
      <div class="verdict" id="p_verdict">computing…</div>
      <canvas id="hudEcg"></canvas>
    </div>
    <div class="tele br small mono">VITRUVIAN BODY · AXIAL ROTATE · LIVE</div>
  </div>

  <div class="hud-wipe"></div>
`;

function ecgSample(p, type) {
  let y = 0;
  if (p < 0.12) y = Math.sin(p / 0.12 * Math.PI) * 0.08;
  else if (p < 0.18) y = -0.05;
  else if (p < 0.2) y = -0.18;
  else if (p < 0.23) y = 1.0;
  else if (p < 0.26) y = -0.32;
  else if (p < 0.46) y = type === 'critical' ? 0.34 : 0.02;
  else if (p < 0.62) y = Math.sin((p - 0.46) / 0.16 * Math.PI) * (type === 'critical' ? 0.42 : 0.26);
  return y + (Math.random() - 0.5) * 0.015;
}
function fitCanvas(cv, ctx) {
  const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return null;
  const pw = Math.round(w * DPR); if (cv.width !== pw) { cv.width = pw; cv.height = Math.round(h * DPR); ctx.setTransform(DPR, 0, 0, DPR, 0, 0); }
  return { w, h };
}
function drawEcg(dt) {
  const b = bedById(state.focusId); if (!b || !ecgCv) return;
  const dim = fitCanvas(ecgCv, ecgX); if (!dim) return;
  const type = b.patient.acuity, hr = b.vitals.hr;
  const n = Math.max(1, Math.round(dt * ECG_SPEED));
  for (let i = 0; i < n; i++) { beatPhase = (beatPhase + (hr / 60) / ECG_SPEED) % 1; ecgBuf.push(ecgSample(beatPhase, type)); }
  const maxN = Math.ceil(dim.w / ECG_GAP) + 2; while (ecgBuf.length > maxN) ecgBuf.shift();
  ecgX.clearRect(0, 0, dim.w, dim.h); const mid = dim.h * 0.55, amp = dim.h * 0.4;
  ecgX.strokeStyle = type === 'critical' ? '#ff6a64' : type === 'watch' ? '#ffc14a' : '#5fe6c4';
  ecgX.shadowColor = ecgX.strokeStyle; ecgX.shadowBlur = 6; ecgX.lineWidth = 1.5; ecgX.lineJoin = 'round'; ecgX.beginPath();
  for (let i = 0; i < ecgBuf.length; i++) { const x = i * ECG_GAP, y = mid - ecgBuf[i] * amp; i ? ecgX.lineTo(x, y) : ecgX.moveTo(x, y); }
  ecgX.stroke(); ecgX.shadowBlur = 0;
}
let clockAcc = 0;
export function updateHud(dt) {
  if (state.mode === 'floor') {
    clockAcc += dt; if (clockAcc > 0.25) { clockAcc = 0; const el = root.querySelector('#h_clock'); if (el) el.textContent = new Date().toTimeString().slice(0, 8); }
    return;
  }
  const b = bedById(state.focusId); if (!b) return;
  const q = (s) => root.querySelector(s);
  q('#p_id').textContent = b.id; q('#p_hr').textContent = b.vitals.hr; q('#p_bp').textContent = b.vitals.sys + '/' + b.vitals.dia;
  q('#p_spo2').textContent = b.vitals.spo2; q('#p_rr').textContent = b.vitals.rr; q('#p_temp').textContent = b.vitals.temp.toFixed(1);
  q('#p_name').textContent = b.patient.name; q('#p_as').textContent = b.patient.age + ' · ' + b.patient.sex;
  q('#p_mrn').textContent = b.patient.mrn; q('#p_dx').textContent = b.patient.dx; q('#p_admit').textContent = b.patient.admit;
  const reveal = performance.now() >= lsamRevealAt, st = q('#p_lstatus'), t = b.traj, flagged = t.lsam === 'flagged';
  st.textContent = !reveal ? 'ANALYZING…' : flagged ? 'FLAGGED' : 'STABLE';
  st.className = 'st ' + (!reveal ? 'an' : flagged ? 'fl' : 'ok');
  lsamShown = lerp(lsamShown, reveal ? t.news2 : 0, 0.15);
  q('#p_news').textContent = reveal ? Math.round(lsamShown) : '…';
  q('#p_prob').textContent = reveal ? (t.detProb * 100).toFixed(0) + '%' : '…';
  const bar = q('#p_bar'); bar.style.width = (reveal ? t.detProb * 100 : 0) + '%';
  bar.style.background = t.detProb > 0.6 ? '#ff5a52' : t.detProb > 0.25 ? '#ffc14a' : '#5fe6c4';
  const vd = q('#p_verdict'); vd.textContent = reveal ? t.verdict : 'computing trajectory…';
  vd.className = 'verdict ' + (reveal ? b.patient.acuity : 'an');
  drawEcg(dt);
}

export function playTransition() { if (!wipe) return; wipe.classList.remove('run'); void wipe.offsetWidth; wipe.classList.add('run'); }

export function initHud(hostSel) {
  root = document.querySelector(hostSel);
  root.innerHTML = TPL;
  floorLayer = root.querySelector('.hud-floor'); patientLayer = root.querySelector('.hud-patient'); wipe = root.querySelector('.hud-wipe');
  ecgCv = root.querySelector('#hudEcg'); ecgX = ecgCv.getContext('2d');

  root.querySelectorAll('.rrow').forEach((el) => (el.onclick = () => setMode('patient', el.dataset.bed)));

  onModeChange((mode, focusId) => {
    const patient = mode === 'patient';
    root.classList.toggle('patient', patient); root.classList.toggle('floor', !patient);
    if (root.parentElement) root.parentElement.classList.toggle('floor-mode', !patient);
    floorLayer.style.display = patient ? 'none' : 'block';
    patientLayer.style.display = patient ? 'block' : 'none';
    if (patient) { lsamShown = 0; lsamRevealAt = performance.now() + (bedById(focusId).cardiac ? 2600 : 1800); }
  });
  root.classList.add('floor');
  if (root.parentElement) root.parentElement.classList.add('floor-mode');
  floorLayer.style.display = 'block'; patientLayer.style.display = 'none';
}
