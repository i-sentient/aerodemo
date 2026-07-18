import './panelb.css'; // Panel B's own styles — single copy, loads in BOTH the ward dock and the 3-split
import { bedById } from './ontology.js';
import { state, onModeChange, onThemeChange } from './state.js';
import { agentUpdateEMAR, agentStopPressor, agentOrderTroponin, agentGiveMeds, agentOrderRoutine, emrNavigate, openApp } from './apps.js';

/* ============================================================
   SPLIT 2 — the agent-swap surface (ported from the React v4).
   - top notch  = active SYSTEM agent  (LSam · TARS · iSAM), tap to swap
   - bottom notch = active HUMAN        (Clinician · Nurse),  tap to swap
   - notches minimise to a slim bar; caret expands the full card
   - each message washes its speaker's colour radially across the panel
   - firewall preserved: AUTO/GATED order cards + emrNavigate still fire
   ============================================================ */

const MARKER = '#F4E23A';

const AGENTS = {
  lsam: { name: 'LSam', role: 'Sensing', stat: '98', unit: 'SIGNAL', gauge: 84, dot: '#3E8EF7',
    wash: ['#3E8EF7', '#7BD4FF'],
    blobs: [['#2E6FE0', '20%', '20%', '115%'], ['#3E8EF7', '86%', '62%', '110%'], ['#A9D6FF', '42%', '112%', '125%']] },
  tars: { name: 'TARS', role: 'Orchestration', stat: '12', unit: 'ORDERS', gauge: 62, dot: '#A9744F',
    wash: ['#A9744F', '#D9B08C'],
    blobs: [['#A9744F', '16%', '18%', '115%'], ['#8A5A3B', '86%', '64%', '105%'], ['#E2C3A2', '48%', '112%', '125%']] },
  isam: { name: 'iSAM', role: 'Reasoning', stat: '07', unit: 'OPEN', gauge: 38, dot: '#2FA96E',
    wash: ['#2FA96E', '#A8E8C8'],
    blobs: [['#1F7A50', '18%', '20%', '110%'], ['#2FA96E', '86%', '58%', '105%'], ['#A8E8C8', '50%', '114%', '125%']] },
};
const AGENT_ORDER = ['lsam', 'tars', 'isam'];
const HUMANS = {
  clinician: { name: 'Clinician', role: 'Clinical gate', status: 'in the loop', stat: '51', unit: 'REVIEWED', label: 'Clinician · Dr. Rao' },
  nurse: { name: 'Nurse', role: 'Bedside', status: 'executing', stat: '24', unit: 'TASKS', label: 'Nurse · N. Adeyemi' },
};
const HUMAN_ORDER = ['clinician', 'nurse'];

/* ---------- dot-matrix numerals ---------- */
const DIGITS = {
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
};
function dotDigitsSVG(value, cell = 4.4, color = '#fff') {
  const chars = String(value).split('');
  const adv = 5 * cell + cell * 0.9;
  const W = chars.length * adv, H = 7 * cell;
  let cir = '';
  chars.forEach((ch, ci) => (DIGITS[ch] || DIGITS['0']).forEach((row, r) => row.split('').forEach((b, c) => {
    if (b === '1') cir += `<circle cx="${(ci * adv + c * cell + cell / 2).toFixed(1)}" cy="${(r * cell + cell / 2).toFixed(1)}" r="${(cell * 0.34).toFixed(1)}" fill="${color}"/>`;
  })));
  return `<svg width="${W.toFixed(1)}" height="${H.toFixed(1)}" viewBox="0 0 ${W.toFixed(1)} ${H.toFixed(1)}" style="display:block">${cir}</svg>`;
}
function arcGaugeSVG(value, dim = 82) {
  const c = dim / 2, r = c - 8, a0 = -115, a1 = 115;
  const pol = (d) => [c + r * Math.sin(d * Math.PI / 180), c - r * Math.cos(d * Math.PI / 180)];
  const [sx, sy] = pol(a0), [ex, ey] = pol(a1);
  const ang = a0 + ((a1 - a0) * value) / 100;
  return `<svg width="${dim}" height="${(dim * 0.62).toFixed(0)}" viewBox="0 0 ${dim} ${(dim * 0.62).toFixed(0)}" style="overflow:visible">
    <path d="M ${sx.toFixed(1)} ${sy.toFixed(1)} A ${r} ${r} 0 1 1 ${ex.toFixed(1)} ${ey.toFixed(1)}" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="1.5" stroke-linecap="round"/>
    <g style="transform:rotate(${ang}deg);transform-origin:${c}px ${c}px">
      <line x1="${c}" y1="${(c - r + 8).toFixed(1)}" x2="${c}" y2="${(c - 4).toFixed(1)}" stroke="rgba(255,255,255,0.75)" stroke-width="1" stroke-dasharray="1 3"/>
      <path d="M ${(c - 4.5).toFixed(1)} ${(c - r - 2).toFixed(1)} L ${(c + 4.5).toFixed(1)} ${(c - r - 2).toFixed(1)} L ${c} ${(c - r + 6).toFixed(1)} Z" fill="${MARKER}"/>
    </g></svg>`;
}
function blobsHTML(blobs) {
  return blobs.map((b, i) => `<div class="nblob" style="left:${b[1]};top:${b[2]};width:${b[3]};height:${b[3]};background:radial-gradient(circle, ${b[0]} 0%, ${b[0]} 24%, transparent 70%);animation:bd${i % 3} ${15 + i * 3}s ease-in-out infinite"></div>`).join('');
}

/* ---------- LSam trajectory trend widget (agent chin, beat 6) ---------- */
function trendHTML(b) {
  const news2 = (b.traj && b.traj.news2) || 8;
  const THRESH = 5; // NEWS2 >= 5 crosses into the escalation zone -> the line turns red there
  const series = [2, 3, 4, 6, news2]; // NEWS2 early-warning score climbing over recent readings
  const W = 210, H = 56, pad = 6, min = 0, max = 12;
  const yOf = (v) => H - pad - ((v - min) / (max - min)) * (H - 2 * pad);
  const pts = series.map((v, i) => [pad + (i / (series.length - 1)) * (W - 2 * pad), yOf(v)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const area = `M${pts[0][0].toFixed(1)},${(H - pad).toFixed(1)} ` + pts.map((p) => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') + ` L${pts[pts.length - 1][0].toFixed(1)},${(H - pad).toFixed(1)} Z`;
  const last = pts[pts.length - 1];
  const thr = (yOf(THRESH) / H).toFixed(3); // vertical gradient stop at the threshold line: white below, red above
  return `<div class="trend">
    <svg class="trend-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <defs><linearGradient id="tgGrad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${H}">
        <stop offset="0" stop-color="var(--redD)"/><stop offset="${thr}" stop-color="var(--redD)"/>
        <stop offset="${thr}" stop-color="#ffffff"/><stop offset="1" stop-color="#ffffff"/>
      </linearGradient></defs>
      <path d="${area}" fill="var(--redD)" opacity="0.12"/>
      <path d="${line}" fill="none" stroke="url(#tgGrad)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.4" fill="var(--redD)"/>
    </svg>
    <div class="trend-lb">NEWS2 trajectory · <b>rising</b></div>
  </div>`;
}
function showTrend(b) {
  window.dispatchEvent(new Event('hud:trajectory')); // summon the scanner's trajectory block
  const slot = agentNotch && agentNotch.querySelector('#agentAction');
  if (!slot) return;
  slot.innerHTML = trendHTML(b);
  expTop = true; // LSam's chin opens itself to show the trajectory it just built
  renderAgent();
}

/* ---------- iSAM verdict widget (agent chin, beat 7): OMI ECG read + risk ---------- */
let ecgRaf = null, ecgBuf = [], ecgPh = 0, ecgLast = 0;
// ST-elevation morphology when critical (mirrors the hud's ecgSample)
function ecgWave(p, crit) {
  let y = 0;
  if (p < 0.12) y = Math.sin(p / 0.12 * Math.PI) * 0.08;
  else if (p < 0.18) y = -0.05;
  else if (p < 0.2) y = -0.18;
  else if (p < 0.23) y = 1.0;
  else if (p < 0.26) y = -0.32;
  else if (p < 0.46) y = crit ? 0.34 : 0.02;
  else if (p < 0.62) y = Math.sin((p - 0.46) / 0.16 * Math.PI) * (crit ? 0.42 : 0.26);
  return y + (Math.random() - 0.5) * 0.015;
}
function stopEcg() { if (ecgRaf) cancelAnimationFrame(ecgRaf); ecgRaf = null; ecgBuf = []; ecgPh = 0; ecgLast = 0; }
function startEcg(cv, crit, hr) {
  stopEcg();
  const ctx = cv.getContext('2d');
  const GAP = 2.2, SPEED = 60;
  const stroke = (getComputedStyle(cv).getPropertyValue('--redD') || '#ff7a73').trim();
  const loop = (t) => {
    if (!cv.isConnected) { stopEcg(); return; } // widget gone -> stop the loop
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h = cv.clientHeight;
    if (w && cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const dt = ecgLast ? Math.min(0.05, (t - ecgLast) / 1000) : 0.016; ecgLast = t;
    const n = Math.max(1, Math.round(dt * SPEED));
    for (let i = 0; i < n; i++) { ecgPh = (ecgPh + (hr / 60) / SPEED) % 1; ecgBuf.push(ecgWave(ecgPh, crit)); }
    while (ecgBuf.length > Math.ceil(w / GAP) + 2) ecgBuf.shift();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.beginPath();
    const mid = h * 0.6, amp = h * 0.33;
    for (let i = 0; i < ecgBuf.length; i++) { const x = i * GAP, y = mid - ecgBuf[i] * amp; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.strokeStyle = stroke; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
    ecgRaf = requestAnimationFrame(loop);
  };
  ecgRaf = requestAnimationFrame(loop);
}
// the empty seat: iSAM's chin opens with ONLY the live ECG (reading it), no verdict yet
function showEcgRead(b) {
  const slot = agentNotch && agentNotch.querySelector('#agentAction');
  if (!slot) return;
  setTimeout(() => { // a beat of gap after LSam's graph closes, then the ECG opens
    if (activeAgent !== 'isam') return;
    slot.innerHTML = `<div class="verdict"><canvas class="v-ecg"></canvas><div class="v-risk v-reading">reading…</div></div>`;
    expTop = true; renderAgent();
    const cv = slot.querySelector('.v-ecg');
    if (cv) startEcg(cv, b.patient.acuity === 'critical', (b.vitals && b.vitals.hr) || 118);
  }, 450);
}
// the verdict lands ON TOP of the already-running ECG — no restart
function showVerdict(b) {
  window.dispatchEvent(new Event('hud:trajectory')); // verdict lands → make sure the block is up
  const slot = agentNotch && agentNotch.querySelector('#agentAction');
  if (!slot) return;
  const pct = Math.round((b.traj && b.traj.detProb ? b.traj.detProb : 0.82) * 100);
  let risk = slot.querySelector('.v-risk');
  if (!risk) { // read beat was skipped/too fast — build the whole widget now
    slot.innerHTML = `<div class="verdict"><canvas class="v-ecg"></canvas><div class="v-risk"></div></div>`;
    const cv = slot.querySelector('.v-ecg');
    if (cv) startEcg(cv, b.patient.acuity === 'critical', (b.vitals && b.vitals.hr) || 118);
    risk = slot.querySelector('.v-risk');
  }
  risk.classList.remove('v-reading');
  risk.innerHTML = `<div class="v-num">${dotDigitsSVG(pct, 6, 'var(--redD)')}<span class="v-pct">%</span></div><div class="v-lb">deterioration</div>`;
  if (!slot.querySelector('.v-verdict')) { const v = document.createElement('div'); v.className = 'v-verdict'; v.innerHTML = 'OMI-positive · anterior <b>STEMI</b>'; slot.appendChild(v); }
  expTop = true; renderAgent();
}

/* ---------- module state ---------- */
let chatEl, nextBtn, hintEl, panelB, statusEl;
let washPrev, washCur, agentNotch, humanNotch;
let steps = [], idx = 0, gated = false, ordSeq = 0, busy = false, pendingNurse = null;
let activeAgent = 'lsam', activeHuman = 'clinician', dark = false, expTop = false, expBottom = false;

function scroll() { chatEl.scrollTop = chatEl.scrollHeight; }

/* ---------- the notches ---------- */
function renderAgent() {
  const a = AGENTS[activeAgent];
  agentNotch.classList.toggle('exp', expTop);
  agentNotch.querySelector('#agentBlobs').innerHTML = blobsHTML(a.blobs);
  agentNotch.querySelector('#agentName').textContent = a.name;
  agentNotch.querySelector('#agentRole').textContent = a.role;
  agentNotch.querySelector('#agentDots').innerHTML = AGENT_ORDER.map((k) => `<span class="pd${k === activeAgent ? ' on' : ''}"></span>`).join('');
}
function renderHuman() {
  const h = HUMANS[activeHuman];
  humanNotch.classList.toggle('exp', expBottom);
  humanNotch.querySelector('#humanName').textContent = h.name;
  humanNotch.querySelector('#humanRole').textContent = h.role;
  const st = humanNotch.querySelector('#humanStatus');
  if (st && !humanNotch.classList.contains('awaiting')) st.textContent = h.status;
  humanNotch.querySelector('#humanDots').innerHTML = HUMAN_ORDER.map((k) => `<span class="pd${k === activeHuman ? ' on' : ''}"></span>`).join('');
}

// The human "chin" as a prompt surface: a pending gate lights it up and it says
// what it's waiting for; confirming resolves it. Seed of the elicitation
// (question-with-options) widget — sign-off is the one-option version.
function humanPrompt(order, onAccept) {
  activeHuman = 'clinician';
  humanNotch.classList.add('awaiting');
  expBottom = true; // the panel opens itself for the decision
  renderHuman();
  const st = humanNotch.querySelector('#humanStatus'); if (st) st.textContent = 'requesting sign-off';
  const slot = humanNotch.querySelector('#humanAction');
  if (slot) {
    const rows = (order.items || [order.label]).map((t) => `<label class="sel"><input type="checkbox" checked /><span class="ball"></span>${t}</label>`).join('');
    slot.innerHTML = `<div class="ord gated signoff"><div class="bd">${rows}</div><button class="confirm">APPROVE</button></div>`;
    const btn = slot.querySelector('.confirm');
    if (btn) btn.addEventListener('click', (e) => { e.stopPropagation(); onAccept(); });
  }
}
// ---- DECISION card: two real courses of action, the human picks ----------
// (not an approve gate — iSAM recommends with confidence, the doctor decides)
function decisionPrompt(options, onChoose) {
  activeHuman = 'clinician';
  humanNotch.classList.add('awaiting');
  expBottom = true;
  renderHuman();
  const st = humanNotch.querySelector('#humanStatus'); if (st) st.textContent = 'decision required';
  const slot = humanNotch.querySelector('#humanAction');
  if (!slot) return;
  slot.innerHTML = `<div class="ord gated decide">${options.map((o) => `
    <button class="opt${o.lean ? ' lean' : ''}" data-k="${o.key}">
      <span class="ol">${o.label}</span>
      <span class="os">${o.sub}</span>
      <span class="oc">${o.conf}</span>
    </button>`).join('')}</div>`;
  slot.querySelectorAll('.opt').forEach((btn) => btn.addEventListener('click', (e) => { e.stopPropagation(); onChoose(btn.dataset.k); }));
}

function humanResolve(text) {
  humanNotch.classList.remove('awaiting');
  const slot = humanNotch.querySelector('#humanAction'); if (slot) slot.innerHTML = '';
  expBottom = false; // panel closes itself once the decision is made
  renderHuman();
  const st = humanNotch.querySelector('#humanStatus'); if (st) st.textContent = text;
  setTimeout(() => { if (!humanNotch.classList.contains('awaiting')) renderHuman(); }, 1600);
}
// clinician approved -> hand to the Nurse to administer each drug (reconciliation),
// then it's "given". The chin swaps Clinician -> Nurse without closing.
function nursePrompt(order, onDone) {
  activeHuman = 'nurse';
  humanNotch.classList.add('awaiting');
  expBottom = true;
  renderHuman();
  const st = humanNotch.querySelector('#humanStatus'); if (st) st.textContent = 'administering';
  const slot = humanNotch.querySelector('#humanAction');
  if (!slot) return;
  const items = order.items || [order.label];
  slot.innerHTML = `<div class="recon">${items.map((t) => `<div class="adm"><span class="adm-lb">${t}</span><button class="adm-btn">Administered</button></div>`).join('')}</div>`;
  let remaining = items.length;
  slot.querySelectorAll('.adm').forEach((row) => {
    row.querySelector('.adm-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (row.classList.contains('done')) return;
      row.classList.add('done');
      const btn = row.querySelector('.adm-btn'); btn.textContent = '✓ Administered'; btn.disabled = true;
      if (--remaining === 0) onDone();
    });
  });
}

/* ---------- per-speaker ambient wash ---------- */
function washCss(kind, fromTop) {
  const y = fromTop ? '14%' : '86%';
  if (kind && AGENTS[kind]) { const w = AGENTS[kind].wash; return `radial-gradient(circle at 50% ${y}, ${w[0]}66 0%, ${w[1]}33 32%, transparent 68%)`; }
  return `radial-gradient(circle at 50% ${y}, var(--p2-nw0) 0%, var(--p2-nw1) 32%, transparent 66%)`;
}
function fireWash(kind, fromTop) {
  washPrev.style.background = washCur.style.background || 'transparent';
  washPrev.style.opacity = washCur.style.background ? '0.4' : '0';
  washCur.style.background = washCss(kind, fromTop);
  washCur.style.animation = 'none'; void washCur.offsetWidth; washCur.style.animation = 'ambientIn 2.6s ease-out both';
}

function thinking(on, label) {
  if (statusEl) statusEl.textContent = on ? (label || 'thinking…') : 'live';
  agentNotch.classList.toggle('busy', !!on);
}

/* ---------- messages ---------- */
function addMsg(who, html, status) {
  const isSys = !!AGENTS[who];
  if (isSys) {
    const changed = who !== activeAgent; // only close the widget when a DIFFERENT agent takes over
    activeAgent = who; state.speaker = who;
    if (changed) { const as = agentNotch && agentNotch.querySelector('#agentAction'); if (as) as.innerHTML = ''; stopEcg(); expTop = false; }
    renderAgent(); fireWash(who, true); if (statusEl && status) statusEl.textContent = status;
  }
  else { activeHuman = who; renderHuman(); fireWash(null, false); }

  const m = document.createElement('div'); m.className = 'msg ' + (isSys ? 'sys ' : 'hum ') + who;
  const label = isSys ? AGENTS[who].name : (HUMANS[who] || {}).label || who;
  const dot = isSys ? AGENTS[who].dot : 'var(--p2-hdot)';
  m.innerHTML = `<div class="who">${isSys ? `<span class="wd" style="background:${dot}"></span>` : ''}${label}${!isSys ? `<span class="wd" style="background:${dot}"></span>` : ''}</div><div class="bub">${html}</div>`;
  chatEl.appendChild(m); trimFeed(); scroll();
}
function addTyping() {
  activeAgent && renderAgent();
  const t = document.createElement('div'); t.className = 'msg sys typing-msg ' + activeAgent;
  t.innerHTML = `<div class="bub typing"><i></i><i></i><i></i></div>`; chatEl.appendChild(t); trimFeed(); scroll(); return t;
}
function trimFeed() {
  // keep the feed light: fade older, cap DOM
  const msgs = [...chatEl.querySelectorAll('.msg')];
  msgs.forEach((m, i) => m.classList.toggle('old', i < msgs.length - 3));
  const all = [...chatEl.children];
  while (all.length > 10) { chatEl.removeChild(all.shift()); }
}

function addOrders(list) {
  activeAgent = 'tars'; state.speaker = 'tars'; renderAgent(); fireWash('tars', true);
  const wrap = document.createElement('div'); wrap.className = 'orders';
  list.forEach((o) => {
    const el = document.createElement('div'); el.className = 'ord ' + o.autonomy; el.id = 'ord' + (++ordSeq);
    el.innerHTML = `<div class="ic">${o.autonomy === 'autonomous' ? '⚡' : '✋'}</div><div class="bd"><div class="lb">${o.label}</div><div class="dt">${o.detail}</div></div><span class="tag">${o.autonomy === 'autonomous' ? 'AUTO' : 'GATED'}</span><div class="act"></div>`;
    wrap.appendChild(el);
    const act = el.querySelector('.act');
    if (o.autonomy === 'autonomous') {
      act.innerHTML = `<div class="state"><span class="spin"></span>firing</div>`;
      setTimeout(() => { o.exec && o.exec(); act.innerHTML = `<div class="state">✓ done</div>`; el.classList.add('done'); }, 1100 + Math.random() * 500);
    } else {
      gated = true; updateNext();
      act.innerHTML = `<div class="state">awaiting sign-off ↓</div>`; // the Accept lives in the clinician panel now
      humanPrompt(o, () => {
        if (o.administer) {
          // clinician approved -> close the clinician card, drop a handoff line, and arm
          // the nurse card behind Next (a real gap: you press → to bring the nurse up)
          act.innerHTML = `<div class="state">approved · awaiting nurse ↓</div>`;
          humanResolve('signed off ✓');
          addMsg('tars', `Approved. Nurse — go ahead and administer the loading doses.`, 'awaiting nurse');
          gated = false;
          pendingNurse = () => {
            nursePrompt(o, () => {
              o.exec && o.exec(); // chart flips to "given" only once the nurse administers
              act.innerHTML = `<div class="state">✓ administered</div>`;
              el.querySelector('.tag').style.opacity = 0.5; el.classList.add('done');
              gated = false; updateNext();
              humanResolve('given ✓');
            });
            gated = true; updateNext(); // re-gate while the nurse administers
          };
          updateNext(); hintEl.textContent = 'Nurse to administer →';
        } else {
          o.exec && o.exec();
          act.innerHTML = `<div class="state">✓ authorised</div>`;
          el.querySelector('.tag').style.opacity = 0.5; el.classList.add('done');
          gated = false; updateNext();
          humanResolve('signed off ✓');
        }
      });
    }
  });
  chatEl.appendChild(wrap); trimFeed(); scroll();
}

function updateNext() {
  const done = idx >= steps.length;
  nextBtn.disabled = gated || done || busy;
  nextBtn.textContent = done ? '↺' : '›';
  nextBtn.title = done ? 'Replay' : 'Next';
  hintEl.textContent = gated ? 'Awaiting clinical sign-off →' : done ? (state.mode === 'patient' ? 'Continue →' : 'Replay the scripted demo') : (state.mode === 'patient' ? 'TARS is navigating the record →' : 'Step through the briefing →');
}
function runStep() {
  busy = true; updateNext(); thinking(true, state.mode === 'patient' ? 'reading record…' : 'thinking…');
  const typing = addTyping();
  setTimeout(() => { typing.remove(); thinking(false); steps[idx](); idx++; busy = false; updateNext(); }, 480);
}
function load(kind, bedId) {
  chatEl.innerHTML = ''; idx = 0; gated = false; busy = false; pendingNurse = null;
  steps = kind === 'patient' ? patientScript(bedById(bedId)) : floorScript();
  if (steps.length) { steps[0](); idx = 1; }
  updateNext();
}

/* ---------- scripts (re-voiced: LSam senses · iSAM reasons · TARS orchestrates) ---------- */
function floorScript() {
  return [
    () => addMsg('tars', `Good morning. ICU—North is <b>8 of 8 occupied</b>. Acuity: <span class="em">4 stable</span>, <b style="color:var(--amberD)">2 watch</b>, <b style="color:var(--redD)">2 critical</b> (ICU-04 · ICU-08, anterior STEMIs).`),
    () => addMsg('clinician', `What's our real capacity if cardiology needs a Level-3 bed?`),
    () => addMsg('isam', `LSam's trajectories reviewed. <b>ICU-05</b> (A. Kristof, sepsis) is <span class="em">step-down eligible</span> — NEWS2 2, falling, lactate normalised. Stepping her down frees one Level-3 bed. Advisory — logistics can proceed autonomously.`),
    () => { addMsg('tars', `Executing transfer logistics:`); addOrders([
      { label: 'Reserve step-down bed B-12', detail: 'Bed management · operational', autonomy: 'autonomous' },
      { label: 'Page portering for transfer', detail: 'Transport · operational', autonomy: 'autonomous' },
      { label: 'Reconcile ICU-05 orders in eMAR', detail: 'TARS writing to eMAR', autonomy: 'autonomous', exec: agentUpdateEMAR }]); },
    () => addMsg('tars', `Done — B-12 held, transport paged, and eMAR updated automatically (Workspace ›). One clinical item needs your sign-off:`),
    () => addOrders([{ label: 'Discontinue norepinephrine — ICU-05', detail: 'Clinical decision · requires sign-off', autonomy: 'gated', exec: agentStopPressor }]),
    () => addMsg('tars', `Signed off. Vasopressor discontinued, ICU-05 flagged for step-down. <span class="em">Net effect: +1 Level-3 bed.</span>`),
    () => addMsg('nurse', `Perfect. Keep watching ICU-08.`),
    () => addMsg('tars', `Always — the new admission is the unit's highest risk. Click a red bed to open its Patient Hub and I'll walk the record with you.`),
  ];
}
function patientScript(b) {
  if (b.patient.acuity === 'critical') return state.chapter === 'continued' ? [
    // ── SCENE 3 (post-angio) · hero = PACS + the surgery DECISION ──────────
    // 1 · LSam pulls the completed study — right split holds on PACS
    () => { addMsg('lsam', `Angiogram's in — pulling the coronary study for <b>${b.id}</b>, ${b.patient.name}.`, 'imaging complete'); openApp('pacs'); },
    // 2 · iSAM reads the angio — NOT one culprit: triple-vessel disease
    () => { addMsg('isam', `Reading it now. Three vessels narrowed — <b style="color:var(--redD)">LAD 90% proximal</b> · circumflex 75% · right coronary 60%. This isn't one culprit lesion — <span class="em">it's triple-vessel disease.</span>`, 'reading study'); },
    // 3 · the radiologist's report lands — concordant
    () => { addMsg('isam', `Radiologist's report just landed — <b>concordant</b> with my read. Severe triple-vessel disease, <b>SYNTAX 34</b> — surgical territory.`, 'cross-checking report'); },
    // 4 · iSAM verdict WITH CONFIDENCE + two courses — the DOCTOR decides
    () => {
      addMsg('isam', `He needs revascularisation — two ways to do it. <b>PTCA</b>: stent the LAD now, stage the rest. <b>CABG</b>: bypass all three. With this anatomy and his diabetes, my call is <b style="color:var(--tealD)">CABG · 78% confidence</b>. Your decision, doctor.`, 'awaiting decision');
      gated = true; updateNext();
      const offer = () => decisionPrompt([
        { key: 'ptca', label: 'PTCA', sub: 'Stent LAD now · stage LCx/RCA', conf: 'iSAM 22%' },
        { key: 'cabg', label: 'CABG', sub: 'Bypass all three · durable', conf: 'iSAM 78%', lean: true },
      ], (k) => {
        if (k === 'cabg') {
          humanResolve('CABG selected ✓');
          addMsg('clinician', `Bypass. Three vessels and diabetes — surgery serves him better long-term.`);
          gated = false; updateNext();
        } else {
          humanResolve('PTCA selected');
          addMsg('clinician', `Could we stent the LAD and stage the rest?`);
          setTimeout(() => {
            addMsg('isam', `You could — but at SYNTAX 34 with diabetes, staged PTCA carries a materially higher repeat-revascularisation risk. <span class="em">I'd still advise CABG.</span> Your call stands, doctor.`, 'advising');
            gated = true; updateNext(); offer(); // re-offer — the doctor still owns the call
          }, 1400);
        }
      });
      offer();
    },
    // 5 · TARS books the OR — operational fires, the pre-op needs a signature
    () => { addMsg('tars', `CABG it is. Booking cardiothoracic — the pre-op set needs your name:`, 'booking theatre'); emrNavigate('orders'); addOrders([
      { label: 'Book OR-1 — cardiothoracic', detail: 'Theatre scheduling · first on the morning list', autonomy: 'autonomous' },
      { label: 'Page surgical + perfusion + anaesthesia', detail: 'CT surgery on-call · operational', autonomy: 'autonomous' },
      { label: 'Hold ICU bed — post-op return', detail: 'Bed management · operational', autonomy: 'autonomous' },
      { label: 'Pre-op workup — consent · cross-match 4u · CXR · bloods', items: ['Surgical consent', 'Cross-match 4 units', 'Chest X-ray', 'Pre-op bloods'], detail: 'Pre-operative set · requires sign-off', autonomy: 'gated', exec: () => emrNavigate('orders') }]); },
    // 6 · pre-op underway
    () => { addMsg('tars', `Signed — pre-op running. Heparin holds from midnight; he's first on the list.`, 'pre-op running'); emrNavigate('meds'); },
    // 7 · to theatre — the last beat; → past it leaves for the OR
    () => { addMsg('tars', `Theatre's ready — team's scrubbed. <span class="em">Taking him through to the OR.</span>`, 'to theatre'); emrNavigate('summary'); },
  ] : state.chapter === 'postop' ? [
    // ── SCENE 4 stub (post-op) — story lands here next session ──
    () => { addMsg('tars', `Back from theatre — CABG ×3, off bypass, chest closed. <span class="em">Post-op day 0, hour 1.</span> Scene 4 begins here.`, 'post-op day 0'); emrNavigate('summary'); },
  ] : [
    // 1 · we're already in — the chart's up (continues straight from the ward dive)
    () => { addMsg('lsam', `${b.patient.name}, ${b.patient.age}. His chart's up.`, 'opening record'); emrNavigate('summary'); },
    // 2 · what the monitor + ECG show — no troponin yet
    () => { addMsg('lsam', `Monitor's ugly — <b>HR ${b.vitals.hr} and climbing</b>, sats ${b.vitals.spo2}, and the ECG's got the whole front wall lit.`, 'reading vitals'); emrNavigate('vitals', 'emr-vit-hr', 'Heart rate'); },
    // 3 · iSAM — PROVISIONAL read; wants to confirm before committing
    () => { addMsg('isam', `Looks like a big anterior heart attack. I won't call it yet — <span class="em">let's confirm before we commit him.</span>`, 'provisional read'); emrNavigate('imaging', 'emr-img-1', '12-lead ECG'); },
    // 4 · TARS activates the workup: cath lab to STANDBY (auto) + gated diagnostics
    () => { addMsg('tars', `Cath lab's on standby. Before I commit — bloods and a repeat ECG. That one needs your name.`, 'placing orders'); emrNavigate('orders'); addOrders([
      { label: 'Pre-alert cath lab — STANDBY', detail: 'Operational · not committed yet', autonomy: 'autonomous' },
      { label: 'STAT troponin + repeat 12-lead', items: ['STAT Troponin', 'Repeat Lactate', '12-lead ECG'], detail: 'Diagnostics · needs your sign-off', autonomy: 'gated', exec: () => { agentOrderTroponin(); emrNavigate('labs'); } }]); },
    // 5 · order placed → awaiting results
    () => { addMsg('tars', `Signed — samples are away. Results coming back live.`, 'awaiting results'); emrNavigate('labs'); },
    // 6 · LSam takes the returning result and forms the trajectory
    () => { addMsg('lsam', `Troponin's back — <b>8.4</b>, sky-high. That plus the ECG… <span class="em">it's real.</span>`, 'formulating trajectory'); showTrend(b); emrNavigate('labs', 'emr-lab-troponin-i-stat', 'Troponin I (STAT)'); },
    // 7 · the empty seat — iSAM pulls the ECG and runs OMI (no verdict yet)
    () => { addMsg('isam', `Running the ECG through the model now.`, 'reading ECG'); showEcgRead(b); emrNavigate('imaging', 'emr-img-1', '12-lead ECG'); },
    // 8 · iSAM verdict — the risk + call land on top of the ECG it just read
    () => { addMsg('isam', `Confirmed — <b>occlusive anterior STEMI</b>. About <b style="color:var(--redD)">${(b.traj.detProb * 100).toFixed(0)}%</b> he deteriorates without reperfusion. <b style="color:var(--redD)">Open the artery — now.</b>`, 'committing verdict'); showVerdict(b); emrNavigate('imaging', 'emr-img-1', '12-lead ECG'); },
    // 9 · TARS commits the pathway — ONE bundle: auto operational + gated clinical
    () => { addMsg('tars', `Committing the pathway. Cath lab's live, cardiology paged, bed held for after. The loading doses are yours.`, 'activating pathway'); emrNavigate('orders'); addOrders([
      { label: 'Cath lab — ACTIVATE', detail: 'Standby → live · door-to-balloon clock started', autonomy: 'autonomous' },
      { label: 'Page interventional cardiology', detail: 'Dr. Mensah · on call', autonomy: 'autonomous' },
      { label: 'Hold ICU bed post-PCI', detail: 'Bed management', autonomy: 'autonomous' },
      { label: 'Give ticagrelor 180 mg + heparin 5000u', items: ['Ticagrelor 180 mg', 'Heparin 5000u'], administer: true, detail: 'Antiplatelet/anticoag loading · needs your sign-off', autonomy: 'gated', exec: () => { agentGiveMeds(b); emrNavigate('meds', 'emr-med-ticagrelor', 'Ticagrelor'); } }]); },
    // 10 · done
    () => { addMsg('tars', `Done. It's all in the record, cath lab's ready, clock's running. <span class="em">He's on his way to the artery.</span>`, 'pathway live'); emrNavigate('summary'); },
  ];
  return [
    () => { addMsg('lsam', `Scanning <b>${b.id}</b> — ${b.patient.name}. ${b.patient.dx}. Opening the chart…`); emrNavigate('summary'); },
    () => { addMsg('isam', `NEWS2 <b>${b.traj.news2}</b>, trend <b>${b.traj.trend}</b>. Verdict: <b class="em">${b.traj.verdict}</b>.`); emrNavigate('vitals', 'emr-vit-news2', 'NEWS2'); },
    () => { addMsg('tars', `${b.patient.acuity === 'watch' ? 'Keeping this one under closer watch. ' : 'Trajectory looks reassuring. '}Reviewing the latest labs.`); emrNavigate('labs'); },
    () => { addMsg('tars', `Routine labs can be re-checked — place a repeat panel?`); addOrders([
      { label: 'Order repeat bloods (FBC, U&E, CRP)', detail: 'Lab · requires sign-off', autonomy: 'gated', exec: () => { agentOrderRoutine(b); emrNavigate('labs'); } }]); },
    () => { addMsg('tars', `Ordered. I'll surface results here and flag any trajectory shift.`); emrNavigate('summary'); },
  ];
}

/* ---------- interactions ---------- */
// one tap = expand/collapse the card · double tap = swap to the next agent/human
function wireNotch(notch, cycle, toggleExpand) {
  let t = null;
  notch.addEventListener('click', () => {
    if (t) return;
    t = setTimeout(() => { t = null; toggleExpand(); }, 240);
  });
  notch.addEventListener('dblclick', () => { if (t) { clearTimeout(t); t = null; } cycle(); });
}
function cycleAgent() { activeAgent = AGENT_ORDER[(AGENT_ORDER.indexOf(activeAgent) + 1) % AGENT_ORDER.length]; renderAgent(); fireWash(activeAgent, true); }
function cycleHuman() { activeHuman = HUMAN_ORDER[(HUMAN_ORDER.indexOf(activeHuman) + 1) % HUMAN_ORDER.length]; renderHuman(); fireWash(null, false); }
function setDark(v) { dark = v; if (!panelB) return; panelB.classList.toggle('dark', dark); renderHuman(); }
// the global top-bar toggle drives this panel's dark variant
onThemeChange((v) => setDark(v));

function buildPanel2() {
  panelB.classList.add('p2');
  panelB.classList.toggle('dark', dark); // keep the global theme across rebuilds
  panelB.innerHTML = `
    <div class="p2-wash prev"></div>
    <div class="p2-wash cur"></div>

    <div class="p2-notch top" id="agentNotch">
      <div class="nblobs" id="agentBlobs"></div>
      <div class="notch-inner">
        <div class="notch-dots" id="agentDots"></div>
        <div class="notch-id">
          <div class="notch-name" id="agentName">LSam</div>
          <div class="notch-role"><span id="agentRole">Sensing</span> · <span id="tarsStatus">live</span></div>
        </div>
        <div class="notch-action" id="agentAction"></div>
      </div>
    </div>

    <div id="chat" class="p2-feed"></div>

    <div class="p2-foot">
      <span class="p2-hint" id="chatHint">Step through the briefing →</span>
      <button class="p2-next" id="nextBtn">›</button>
    </div>

    <div class="p2-notch bottom" id="humanNotch">
      <div class="notch-inner">
        <div class="notch-id">
          <div class="notch-name" id="humanName">Clinician</div>
          <div class="notch-role"><span id="humanRole">Clinical gate</span> · <span id="humanStatus">in the loop</span></div>
        </div>
        <div class="notch-action" id="humanAction"></div>
        <div class="chin-input" id="humanInput">
          <input class="chin-field" id="humanField" placeholder="Add a note or ask…" />
          <button class="chin-mic" id="humanMic" aria-label="Voice input"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button>
        </div>
        <div class="notch-dots" id="humanDots"></div>
      </div>
    </div>`;

  chatEl = panelB.querySelector('#chat');
  nextBtn = panelB.querySelector('#nextBtn');
  hintEl = panelB.querySelector('#chatHint');
  statusEl = panelB.querySelector('#tarsStatus');
  washPrev = panelB.querySelector('.p2-wash.prev');
  washCur = panelB.querySelector('.p2-wash.cur');
  agentNotch = panelB.querySelector('#agentNotch');
  humanNotch = panelB.querySelector('#humanNotch');

  // one tap = expand/collapse · double tap = swap to the next agent/human
  wireNotch(agentNotch, cycleAgent, () => { expTop = !expTop; renderAgent(); });
  wireNotch(humanNotch, cycleHuman, () => { expBottom = !expBottom; renderHuman(); });
  // clicks inside the clinician input must not bubble up and toggle the panel
  const hi = panelB.querySelector('#humanInput');
  if (hi) { hi.addEventListener('click', (e) => e.stopPropagation()); hi.addEventListener('dblclick', (e) => e.stopPropagation()); }
  // clicks inside the sign-off card (select balls, Approve) must not toggle the panel
  const ha = panelB.querySelector('#humanAction');
  if (ha) { ha.addEventListener('click', (e) => e.stopPropagation()); ha.addEventListener('dblclick', (e) => e.stopPropagation()); }

  renderAgent(); renderHuman(); fireWash('lsam', true);
}

function advance() {
  if (busy) return;
  if (pendingNurse) { const p = pendingNurse; pendingNurse = null; p(); return; } // bring up the armed nurse card
  if (gated) return;
  if (idx >= steps.length) {
    // end of a patient story → hand off to the next transition (the React shell
    // listens for 'tars:finished' and the host routes by chapter: workup → Cath
    // Lab dive · continued → OR dive). The floor briefing and the postop stub
    // (current terminus) just replay.
    if (state.mode === 'patient' && (state.chapter === 'workup' || state.chapter === 'continued')) { window.dispatchEvent(new CustomEvent('tars:finished')); return; }
    load(state.mode, state.focusId); return;
  }
  runStep();
}
export function initChat() {
  panelB = document.getElementById('panelB');
  buildPanel2();
  nextBtn.onclick = advance; // kept wired, but the on-screen button is hidden — stepping is keyboard-only (→ / Space)
  nextBtn.style.display = 'none';
  // keyboard-driven: Space / → advance the briefing (ignored while typing in the note field)
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' && e.code !== 'ArrowRight') return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    e.preventDefault();
    advance();
  });
  onModeChange((mode, focusId) => load(mode, focusId));
}

/* ============================================================
   SCENE-2 WARD-PHASE API — docks this exact panel over the ICU.
   Same notches, washes, typing rhythm and message machinery; only
   the driver differs: the ward's arrow-key steps push beats in via
   wardBeat() instead of the tars scripts/next-button. The tars phase
   later calls initChat() as normal and rebuilds Panel B untouched.
   ============================================================ */
export function initWardPanel(el) {
  panelB = el;
  buildPanel2();
  panelB.querySelector('.p2-foot').style.display = 'none'; // stepping = the ICU's arrow keys
}

/** One agent/human line with the standard thinking → typing → message rhythm. */
export function wardSay(who, html, delay = 520) {
  thinking(true, 'thinking…');
  const typing = addTyping();
  setTimeout(() => { typing.remove(); thinking(false); addMsg(who, html); }, delay);
}

/** A beat = a list of {who, html} played in sequence (one ICU step's chatter). */
export function wardBeat(items) {
  let at = 0;
  for (const it of items) { setTimeout(() => wardSay(it.who, it.html), at); at += 1350; }
}
