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
    </svg>
    <div class="tele tl">
      <div class="tk">BODY SCAN · <span id="p_id">ICU-04</span></div>
      <div class="vit"><span>HR</span><b id="p_hr">--</b><i>bpm</i></div>
      <div class="vit"><span>BP</span><b id="p_bp">--</b><i>mmHg</i></div>
      <div class="vit"><span>SpO₂</span><b id="p_spo2">--</b><i>%</i></div>
      <div class="vit"><span>RR</span><b id="p_rr">--</b><i>/min</i></div>
      <div class="vit"><span>TEMP</span><b id="p_temp">--</b><i>°C</i></div>
    </div>
    <div class="tele tr" id="devRail"></div>
    <div class="tele bl lsam">
      <div class="tk">L<b>Sam</b> TRAJECTORY · <span id="p_lstatus" class="st">ANALYZING</span></div>
      <div class="lrow"><div><span>NEWS2</span><b id="p_news">…</b></div><div><span>DETERIORATION</span><b id="p_prob">…</b></div></div>
      <div class="lbar"><i id="p_bar"></i></div>
      <div class="verdict" id="p_verdict">computing…</div>
    </div>
    <div class="tele bl blecg">
      <div class="tk">ECG · LEAD II</div>
      <canvas id="hudEcg"></canvas>
    </div>
    <div class="tele br small mono vision"><span class="vd"></span>VISION · LIVE</div>

    <div class="pa-tabs mono" id="paTabs">
      <button data-w="twin" class="on">TWIN</button><button data-w="scope">SCOPE</button><button data-w="watch">WATCH</button>
    </div>
    <div class="pa-win pa-scope">
      <div class="pw-tk">SCOPE · TELEMETRY + RECOVERY ANALYTICS</div>
      <div class="pw-empty">waveform bank · scores · trajectory — building</div>
    </div>
    <div class="pa-win pa-watch">
      <div class="pw-tk">WATCH · ACTIVITY MONITOR</div>
      <div class="pw-empty">pose reconstruction · mobility ledger · pain read — building</div>
    </div>
  </div>

  <div class="hud-wipe"></div>
`;

// ---- Scene 4 · beat 0: the bedside hookup (postop only) --------------------
// Twelve devices connect one →-press at a time. Each connect lights a rail
// row, wakes its FEED (vitals stay '--' and the ECG stays flat until their
// source device is on), and pings a glow marker on the body twin.
const HOOKUP = [
  { key: 'monitor', label: 'PATIENT MONITOR', val: 'pads + sat probe · LIVE', site: '5-lead · L index finger', feeds: ['hr', 'spo2', 'temp', 'ecg'], marker: 'chest' },
  { key: 'art', label: 'ARTERIAL LINE', val: 'ART 96/54 (68)', site: 'L radial · transduced', feeds: ['bp'], marker: 'lwrist' },
  { key: 'cvc', label: 'CENTRAL LINE', val: 'CVP 9', site: 'R internal jugular · 4-lumen', marker: 'neck' },
  { key: 'ett', label: 'ET TUBE', val: '7.5 · 22 cm at lips', site: 'secured · cuff 25 cmH₂O', marker: 'mouth' },
  { key: 'vent', label: 'VENTILATOR', val: 'SIMV · FiO₂ 50% · PEEP 5', site: 'TV 480 mL · rate 14', feeds: ['rr'], marker: 'mouth' },
  { key: 'iabp', label: 'IABP', val: '1:1 AUGMENTING', site: 'R femoral · timing auto', marker: 'groin' },
  { key: 'pumps', label: 'PUMPS', val: 'norad 0.08 · dobutamine 5', site: 'via central line', marker: 'neck' },
  { key: 'drains', label: 'CHEST DRAINS ×2', val: '40 mL/hr · swinging', site: 'mediastinal + L pleural · −20 cmH₂O', marker: 'drain' },
  { key: 'ucath', label: 'URINARY CATHETER', val: '45 mL/hr', site: 'hourly volumes', marker: 'pelvis' },
  { key: 'warm', label: 'WARM AIR', val: 'target 37.0 °C', site: 'rewarming post-bypass' },
  { key: 'flowtron', label: 'FLOWTRON', val: 'DVT cuffs · cycling', site: 'both calves', marker: 'calf' },
  { key: 'suction', label: 'SUCTION', val: 'STANDBY', site: 'bedhead · −200 mmHg set' },
];
let hookupN = -1; // -1 = not in hookup mode · 0..12 = devices connected
const feedOn = new Set();
function hookupSet(n) {
  if (state.chapter !== 'postop' || !root) return;
  hookupN = Math.max(0, Math.min(HOOKUP.length, n | 0));
  feedOn.clear();
  const marks = [];
  for (let i = 0; i < hookupN; i++) { (HOOKUP[i].feeds || []).forEach((f) => feedOn.add(f)); if (HOOKUP[i].marker) marks.push(HOOKUP[i].marker); }
  const rail = root.querySelector('#devRail'); if (!rail) return;
  const done = hookupN >= HOOKUP.length;
  rail.innerHTML = `
      <div class="tk">${done ? 'BEDSIDE ESTABLISHED ✓' : 'ESTABLISHING BEDSIDE · POD 0'}<span class="hk-count">${hookupN} / ${HOOKUP.length}</span></div>
      ${HOOKUP.slice(0, hookupN).map((d, i) => `<div class="kv hk-row${i === hookupN - 1 ? ' hk-new' : ''}" data-dev="${d.key}"><span><i class="hk-led"></i>${d.label}</span><b>${d.val}</b></div>`).join('')}`;
  window.dispatchEvent(new CustomEvent('hud:markers', { detail: { keys: marks, ping: hookupN ? HOOKUP[hookupN - 1].marker : null } }));
}

// ---- connected-devices rail (top-right): every machine wired to this patient.
// Chapter-aware: pre-cath is a quiet room; post-cath the pumps + site checks
// light up. Timers tick live (see devTick).
const dev = { nibpEvery: 300, nibp: 300, hep: 3 * 3600 + 40 * 60, gtn: 5 * 3600 + 5 * 60, tr: 32 * 60, urine: 45, uAcc: 0 };
const mmss = (t) => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
const hm = (t) => Math.floor(t / 3600) + 'h ' + String(Math.floor((t % 3600) / 60)).padStart(2, '0') + 'm';
function devRailHTML() {
  dev.nibpEvery = dev.nibp = state.chapter === 'continued' ? 900 : 300; // q15m post-cath · q5m acute
  if (state.chapter === 'postop') {
    hookupN = 0; // boot unhooked — beat 0 connects devices one → at a time
    return `<div class="tk">ESTABLISHING BEDSIDE · POD 0<span class="hk-count">0 / ${HOOKUP.length}</span></div>`;
  }
  if (state.chapter === 'continued') return `
      <div class="tk">CONNECTED DEVICES · LIVE</div>
      <div class="kv"><span>O₂ · NASAL</span><b>2 L/min · weaning</b></div>
      <div class="kv"><span>PUMP · HEPARIN</span><b id="d_hep">1000 u/hr · ${hm(dev.hep)}</b></div>
      <div class="kv"><span>PUMP · GTN</span><b id="d_gtn">25 µg/min · ${hm(dev.gtn)}</b></div>
      <div class="kv"><span>IV · MAINT</span><b>60 mL/hr</b></div>
      <div class="kv"><span>RADIAL · TR BAND</span><b id="d_tr">check ${mmss(dev.tr)}</b></div>
      <div class="kv"><span>URINE</span><b id="d_urine">${dev.urine} mL/hr</b></div>
      <div class="kv"><span>NIBP</span><b id="d_nibp">q15m · next ${mmss(dev.nibp)}</b></div>
      <div class="kv"><span>DEFIB PADS</span><b>STANDBY</b></div>
      <div class="kv"><span>BED</span><b>EXIT-ALARM ON</b></div>`;
  return `
      <div class="tk">CONNECTED DEVICES · LIVE</div>
      <div class="kv"><span>O₂ · NASAL</span><b>4 L/min · FiO₂ 28%</b></div>
      <div class="kv"><span>IV · NS 0.9%</span><b>80 mL/hr · 18G L-AC</b></div>
      <div class="kv"><span>NIBP</span><b id="d_nibp">q5m · next ${mmss(dev.nibp)}</b></div>
      <div class="kv"><span>DEFIB PADS</span><b>STANDBY</b></div>
      <div class="kv"><span>BED</span><b>EXIT-ALARM ON</b></div>`;
}
let devAcc = 0;
function devTick(dt) {
  if (state.chapter === 'postop') return; // postop rail is the hookup checklist — no q-timers
  devAcc += dt; if (devAcc < 1) return; const step = Math.floor(devAcc); devAcc -= step;
  const q = (s2) => root.querySelector(s2);
  dev.nibp -= step; if (dev.nibp <= 0) dev.nibp = dev.nibpEvery; // cuff cycles, timer restarts
  const nb = q('#d_nibp'); if (nb) nb.textContent = (state.chapter === 'continued' ? 'q15m' : 'q5m') + ' · next ' + mmss(dev.nibp);
  if (state.chapter === 'continued') {
    dev.hep = Math.max(0, dev.hep - step); dev.gtn = Math.max(0, dev.gtn - step); dev.tr = Math.max(0, dev.tr - step);
    const h = q('#d_hep'); if (h) h.textContent = '1000 u/hr · ' + hm(dev.hep);
    const g = q('#d_gtn'); if (g) g.textContent = '25 µg/min · ' + hm(dev.gtn);
    const t = q('#d_tr'); if (t) t.textContent = dev.tr > 0 ? 'check ' + mmss(dev.tr) : 'CHECK NOW';
    dev.uAcc += step; if (dev.uAcc >= 20) { dev.uAcc = 0; dev.urine = Math.max(38, Math.min(52, dev.urine + (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 2)))); const u = q('#d_urine'); if (u) u.textContent = dev.urine + ' mL/hr'; }
  }
}

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
  // hookup gate: before the monitor connects, the strip is just noisy flatline
  const flat = state.chapter === 'postop' && hookupN >= 0 && !feedOn.has('ecg');
  const type = b.patient.acuity, hr = b.vitals.hr;
  const n = Math.max(1, Math.round(dt * ECG_SPEED));
  for (let i = 0; i < n; i++) { beatPhase = (beatPhase + (hr / 60) / ECG_SPEED) % 1; ecgBuf.push(flat ? (Math.random() - 0.5) * 0.03 : ecgSample(beatPhase, type)); }
  const maxN = Math.ceil(dim.w / ECG_GAP) + 2; while (ecgBuf.length > maxN) ecgBuf.shift();
  ecgX.clearRect(0, 0, dim.w, dim.h); const mid = dim.h * 0.55, amp = dim.h * 0.4;
  ecgX.strokeStyle = flat ? 'rgba(130,160,170,0.55)' : type === 'critical' ? '#ff6a64' : type === 'watch' ? '#ffc14a' : '#5fe6c4';
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
  // hookup gate (postop): a vital only goes live once its source device connects
  const gated = state.chapter === 'postop' && hookupN >= 0;
  const on = (k) => !gated || feedOn.has(k);
  q('#p_id').textContent = b.id;
  q('#p_hr').textContent = on('hr') ? b.vitals.hr : '--';
  q('#p_bp').textContent = on('bp') ? b.vitals.sys + '/' + b.vitals.dia : '--';
  q('#p_spo2').textContent = on('spo2') ? b.vitals.spo2 : '--';
  q('#p_rr').textContent = on('rr') ? b.vitals.rr : '--';
  q('#p_temp').textContent = on('temp') ? b.vitals.temp.toFixed(1) : '--';
  devTick(dt);
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
  const rail = root.querySelector('#devRail'); if (rail) rail.innerHTML = devRailHTML();

  // Scene 4 · hookup wiring: chat beats drive connects (hud:hookup); hovering
  // a rail row or a glowing body marker surfaces the compact device card.
  window.addEventListener('hud:hookup', (e) => hookupSet(e.detail ? e.detail.n : 0));
  const card = document.createElement('div'); card.className = 'hk-card'; patientLayer.appendChild(card);
  const placeCard = (cx, cy) => {
    const pr = patientLayer.getBoundingClientRect();
    card.style.left = Math.max(8, Math.min(pr.width - 250, cx - pr.left + 14)) + 'px';
    card.style.top = Math.max(8, Math.min(pr.height - 110, cy - pr.top + 12)) + 'px';
    card.classList.add('on');
  };
  const showDevices = (list, cx, cy) => {
    if (!list.length) return;
    card.innerHTML = list.map((d) => `<div class="hkc-t"><i class="hk-led"></i>${d.label}</div><div class="hkc-v">${d.val}</div><div class="hkc-s">${d.site}</div>`).join('<div class="hkc-hr"></div>');
    placeCard(cx, cy);
  };
  const hideCard = () => card.classList.remove('on');
  const railEl = root.querySelector('#devRail');
  railEl.addEventListener('mousemove', (e) => {
    const row = e.target.closest('.hk-row');
    if (!row) { hideCard(); return; }
    showDevices(HOOKUP.filter((d) => d.key === row.dataset.dev), e.clientX, e.clientY);
  });
  railEl.addEventListener('mouseleave', hideCard);
  window.addEventListener('hud:marker:hover', (e) => {
    const d = e.detail || {};
    if (!d.key) { hideCard(); return; }
    showDevices(HOOKUP.slice(0, Math.max(0, hookupN)).filter((v) => v.marker === d.key), d.x, d.y);
  });

  // Scene 4: the Panel A window toggle (TWIN · SCOPE · WATCH) — postop only;
  // earlier chapters never see the tabs and always render the twin.
  const tabs = root.querySelector('#paTabs');
  if (tabs) {
    if (state.chapter !== 'postop') tabs.style.display = 'none';
    tabs.querySelectorAll('button').forEach((b) => (b.onclick = () => {
      tabs.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      root.classList.remove('win-scope', 'win-watch');
      if (b.dataset.w !== 'twin') root.classList.add('win-' + b.dataset.w);
    }));
  }

  // the LSam trajectory block only appears when the story summons it
  window.addEventListener('hud:trajectory', () => patientLayer.querySelector('.lsam')?.classList.add('on'));

  onModeChange((mode, focusId) => {
    const patient = mode === 'patient';
    root.classList.toggle('patient', patient); root.classList.toggle('floor', !patient);
    if (root.parentElement) root.parentElement.classList.toggle('floor-mode', !patient);
    floorLayer.style.display = patient ? 'none' : 'block';
    patientLayer.style.display = patient ? 'block' : 'none';
    if (patient) { lsamShown = 0; lsamRevealAt = performance.now() + (bedById(focusId).cardiac ? 2600 : 1800); patientLayer.querySelector('.lsam')?.classList.remove('on'); }
  });
  root.classList.add('floor');
  if (root.parentElement) root.parentElement.classList.add('floor-mode');
  floorLayer.style.display = 'block'; patientLayer.style.display = 'none';
}
