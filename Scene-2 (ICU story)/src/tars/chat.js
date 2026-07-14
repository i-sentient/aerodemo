import { bedById } from './ontology.js';
import { state, onModeChange } from './state.js';
import { agentUpdateEMAR, agentStopPressor, agentOrderTroponin, agentGiveMeds, agentOrderRoutine, emrNavigate } from './apps.js';

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
  clinician: { name: 'Clinician', role: 'Clinical gate · in the loop', stat: '51', unit: 'REVIEWED', label: 'Clinician · Dr. Rao' },
  nurse: { name: 'Nurse', role: 'Bedside · executing', stat: '24', unit: 'TASKS', label: 'Nurse · N. Adeyemi' },
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

/* ---------- module state ---------- */
let chatEl, nextBtn, hintEl, panelB, statusEl;
let washPrev, washCur, agentNotch, humanNotch;
let steps = [], idx = 0, gated = false, ordSeq = 0, busy = false;
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
  humanNotch.querySelector('#humanDots').innerHTML = HUMAN_ORDER.map((k) => `<span class="pd${k === activeHuman ? ' on' : ''}"></span>`).join('');
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
  if (isSys) { activeAgent = who; state.speaker = who; renderAgent(); fireWash(who, true); if (statusEl && status) statusEl.textContent = status; }
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
      const btn = document.createElement('button'); btn.className = 'confirm'; btn.textContent = 'Confirm'; gated = true; updateNext();
      btn.onclick = () => { o.exec && o.exec(); act.innerHTML = `<div class="state">✓ authorised</div>`; el.querySelector('.tag').style.opacity = 0.5; el.classList.add('done'); gated = false; updateNext(); };
      act.appendChild(btn);
    }
  });
  chatEl.appendChild(wrap); trimFeed(); scroll();
}

function updateNext() {
  const done = idx >= steps.length;
  nextBtn.disabled = gated || done || busy;
  nextBtn.textContent = done ? '↺' : '›';
  nextBtn.title = done ? 'Replay' : 'Next';
  hintEl.textContent = gated ? 'Awaiting clinical sign-off →' : done ? 'Replay the scripted demo' : (state.mode === 'patient' ? 'TARS is navigating the record →' : 'Step through the briefing →');
}
function runStep() {
  busy = true; updateNext(); thinking(true, state.mode === 'patient' ? 'reading record…' : 'thinking…');
  const typing = addTyping();
  setTimeout(() => { typing.remove(); thinking(false); steps[idx](); idx++; busy = false; updateNext(); }, 480);
}
function load(kind, bedId) {
  chatEl.innerHTML = ''; idx = 0; gated = false; busy = false;
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
  if (b.patient.acuity === 'critical') return [
    // 1 · LSam opens the record
    () => { addMsg('lsam', `Scanning <b>${b.id}</b> — ${b.patient.name}, ${b.patient.age}${b.patient.sex}. Opening the chart…`, 'opening record'); emrNavigate('summary'); },
    // 2 · LSam reports ONLY what the monitor + ECG show — no troponin yet
    () => { addMsg('lsam', `Monitor: <b>HR ${b.vitals.hr}, climbing</b> · BP ${b.vitals.sys}/${b.vitals.dia} · SpO₂ ${b.vitals.spo2}. 12-lead: <b>anterior ST-elevation (V1–V4)</b>.`, 'reading vitals'); emrNavigate('vitals', 'emr-vit-hr', 'Heart rate'); },
    // 3 · iSAM — PROVISIONAL read; recommends a workup, no verdict yet
    () => { addMsg('isam', `ST-elevation pattern — <b class="em">suspected anterior MI</b>. Provisional; recommend an MI workup to confirm and stage before we commit the pathway.`, 'provisional read'); emrNavigate('imaging', 'emr-img-1', '12-lead ECG'); },
    // 4 · TARS activates the workup: cath lab to STANDBY (auto) + gated diagnostics
    () => { addMsg('tars', `Activating <b>MI Workup Protocol</b>. Pre-alerting the cath lab to standby — the diagnostics need your sign-off:`, 'placing orders'); emrNavigate('orders'); addOrders([
      { label: 'Pre-alert cath lab — STANDBY', detail: 'Operational · provisional, not yet committed', autonomy: 'autonomous' },
      { label: 'STAT troponin + repeat lactate + 12-lead', detail: 'Diagnostics · requires sign-off', autonomy: 'gated', exec: () => { agentOrderTroponin(); emrNavigate('labs'); } }]); },
    // 5 · order placed → awaiting results
    () => { addMsg('tars', `Signed off — samples to the lab. Results returning live.`, 'awaiting results'); emrNavigate('labs'); },
    // 6 · LSam takes the returning result and forms the trajectory
    () => { addMsg('lsam', `Result in: troponin <b>elevated 8.4</b> (ref &lt;0.04), lactate 2.4, HR still climbing. Formulating trajectory — logging to the note.`, 'formulating trajectory'); emrNavigate('labs', 'emr-lab-troponin-i-stat', 'Troponin I (STAT)'); },
    // 7 · iSAM — COMMITTED verdict, derived from the trajectory
    () => { addMsg('isam', `Trajectory confirms it — deterioration probability <b style="color:var(--redD)">${(b.traj.detProb * 100).toFixed(0)}%</b>, <b>rising</b>. Verdict: <b style="color:var(--redD)">STEMI — CRITICAL.</b> Commit the reperfusion pathway.`, 'committing verdict'); emrNavigate('notes', 'emr-note-1', 'LSam · trajectory'); },
    // 8 · TARS commits the pathway — ONE bundle: auto operational + gated clinical
    () => { addMsg('tars', `Committing STEMI pathway. Operational actions fire autonomously; the loading doses need your sign-off:`, 'activating pathway'); emrNavigate('orders'); addOrders([
      { label: 'Cath lab — ACTIVATE', detail: 'Operational · standby → live · door-to-balloon clock started', autonomy: 'autonomous' },
      { label: 'Page interventional cardiology', detail: 'Dr. Mensah · on call · operational', autonomy: 'autonomous' },
      { label: 'Hold ICU bed post-PCI', detail: 'Bed management · operational', autonomy: 'autonomous' },
      { label: 'Give ticagrelor 180 mg + heparin 5000u', detail: 'Antiplatelet/anticoag loading · requires sign-off', autonomy: 'gated', exec: () => { agentGiveMeds(b); emrNavigate('meds', 'emr-med-ticagrelor', 'Ticagrelor'); } }]); },
    // 9 · done
    () => { addMsg('tars', `Documented in the EMR. Cath lab confirmed ready. <span class="em">Pathway active — clock running.</span>`, 'pathway live'); emrNavigate('summary'); },
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
function cycleAgent() { activeAgent = AGENT_ORDER[(AGENT_ORDER.indexOf(activeAgent) + 1) % AGENT_ORDER.length]; renderAgent(); fireWash(activeAgent, true); }
function cycleHuman() { activeHuman = HUMAN_ORDER[(HUMAN_ORDER.indexOf(activeHuman) + 1) % HUMAN_ORDER.length]; renderHuman(); fireWash(null, false); }
function setDark(v) { dark = v; panelB.classList.toggle('dark', dark); renderHuman(); }

function buildPanel2() {
  panelB.classList.add('p2');
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
      </div>
      <button class="notch-caret" id="agentCaret" aria-label="Expand agent">⌄</button>
    </div>

    <div id="chat" class="p2-feed"></div>

    <div class="p2-foot">
      <span class="p2-hint" id="chatHint">Step through the briefing →</span>
      <button class="p2-next" id="nextBtn">›</button>
    </div>

    <button class="p2-dark" id="p2Dark" aria-label="Toggle dark mode"></button>

    <div class="p2-notch bottom" id="humanNotch">
      <button class="notch-caret" id="humanCaret" aria-label="Expand human">⌃</button>
      <div class="notch-inner">
        <div class="notch-id">
          <div class="notch-name" id="humanName">Clinician</div>
          <div class="notch-role" id="humanRole">Clinical gate · in the loop</div>
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

  // tap notch body = swap · caret = expand/collapse (stop the tap swallowing it)
  agentNotch.addEventListener('click', cycleAgent);
  humanNotch.addEventListener('click', cycleHuman);
  panelB.querySelector('#agentCaret').addEventListener('click', (e) => { e.stopPropagation(); expTop = !expTop; renderAgent(); });
  panelB.querySelector('#humanCaret').addEventListener('click', (e) => { e.stopPropagation(); expBottom = !expBottom; renderHuman(); });
  panelB.querySelector('#p2Dark').addEventListener('click', () => setDark(!dark));

  renderAgent(); renderHuman(); fireWash('lsam', true);
}

export function initChat() {
  panelB = document.getElementById('panelB');
  buildPanel2();
  nextBtn.onclick = () => {
    if (gated || busy) return;
    if (idx >= steps.length) { load(state.mode, state.focusId); return; }
    runStep();
  };
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
