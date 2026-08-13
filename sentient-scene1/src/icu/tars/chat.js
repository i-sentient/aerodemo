import './panelb.css'; // Panel B's own styles — single copy, loads in BOTH the ward dock and the 3-split
import { bedById } from './ontology.js';
import { state, onModeChange, onThemeChange } from './state.js';
import { HOOKUP, PODS } from './postop.js';
import { agentUpdateEMAR, agentStopPressor, agentOrderTroponin, agentGiveMeds, agentOrderRoutine, emrNavigate, openApp } from './apps.js';

/* ============================================================
   SPLIT 2 — the agent-swap surface (ported from the React v4).
   - top notch  = active SYSTEM agent  (TARS · iSAM), tap to swap
   - bottom notch = active HUMAN        (Clinician · Nurse),  tap to swap
   - notches minimise to a slim bar; caret expands the full card
   - each message washes its speaker's colour radially across the panel
   - firewall preserved: AUTO/GATED order cards + emrNavigate still fire
   ============================================================ */

const MARKER = '#F4E23A';

const AGENTS = {
  tars: { name: 'TARS', role: 'Orchestration', stat: '12', unit: 'ORDERS', gauge: 62, dot: '#A9744F',
    wash: ['#A9744F', '#D9B08C'],
    blobs: [['#A9744F', '16%', '18%', '115%'], ['#8A5A3B', '86%', '64%', '105%'], ['#E2C3A2', '48%', '112%', '125%']] },
  isam: { name: 'iSAM', role: 'Reasoning', stat: '07', unit: 'OPEN', gauge: 38, dot: '#2FA96E',
    wash: ['#2FA96E', '#A8E8C8'],
    blobs: [['#1F7A50', '18%', '20%', '110%'], ['#2FA96E', '86%', '58%', '105%'], ['#A8E8C8', '50%', '114%', '125%']] },
};
// LSam is retired: it became PLEXUS, the signal layer, and PLEXUS does not
// speak — it carries device feeds, LIS, PACS and EMR traffic, and its output is
// data. Everything LSam used to SAY was sensing-with-interpretation, which is
// reasoning, so those lines went to iSAM. Nothing here is railed to a function:
// either agent does whatever the beat needs.
const AGENT_ORDER = ['tars', 'isam'];
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

/* ---------- iSAM trajectory trend widget (agent chin, beat 6) ---------- */
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
  expTop = true; // iSAM's chin opens itself to show the trajectory it just built
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
  setTimeout(() => { // a beat of gap after iSAM's graph closes, then the ECG opens
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
  if (!slot.querySelector('.v-verdict')) { const v = document.createElement('div'); v.className = 'v-verdict'; v.innerHTML = 'OMI-positive · anterior <b>de WINTER</b>'; slot.appendChild(v); }
  expTop = true; renderAgent();
}

/* ---------- module state ---------- */
let chatEl, nextBtn, hintEl, panelB, statusEl;
let washPrev, washCur, agentNotch, humanNotch;
let steps = [], idx = 0, gated = false, ordSeq = 0, busy = false, pendingNurse = null;
let hkCardEl = null, hkBusyIdx = -1, hkRowTimer = 0, hkLinkTimer = 0; // Scene 4 bedside-setup card
let activeAgent = 'isam', activeHuman = 'clinician', dark = false, expTop = false, expBottom = false;

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
/** The human acting IS the next press. They have just done the one thing the
 *  panel was waiting for, so making them then hunt for → is pure friction — and
 *  worse, it leaves a resolved card sitting on screen doing nothing.
 *
 *  advance() cannot be called blind: in the ward dock `steps` is empty, so it
 *  would fall into the end-of-story branch and fire 'tars:finished', routing the
 *  host somewhere it should not go. So the panel advances itself only when it
 *  actually owns a script, and otherwise asks whoever does.
 *
 *  Delayed, so the ✓ state is legible before the beat moves under it. */
function handOn() {
  setTimeout(() => {
    if (steps.length) { advance(); return }
    window.dispatchEvent(new Event('tars:advance'));
  }, 700);
}

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
    if (btn) btn.addEventListener('click', (e) => { e.stopPropagation(); onAccept(); handOn(); });
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
    row.querySelector('.adm-btn').addEventListener('click', (e) => { handOn();
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
  const all = [...chatEl.children].filter((c) => !c.classList.contains('hk-pin')); // the bedside card stays put
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

// ---- Scene 4 · the BEDSIDE SETUP checklist card (Panel B) ------------------
// One pinned order-set card listing all 12 devices. Each → connects the next:
// pending ○ → spinner → ✓ with its feed line. On the ✓ we fire the twin marker
// + wake the vital (hud:hookup:connected). Two rows are RECON — no sensor sees
// them, so TARS asks the nurse and the row waits for a bedside confirm.
function addBedsideCard() {
  activeAgent = 'tars'; state.speaker = 'tars'; renderAgent(); fireWash('tars', true);
  const wrap = document.createElement('div'); wrap.className = 'hkset hk-pin';
  wrap.innerHTML = `<div class="hkset-hd">BEDSIDE SETUP · POST-OP ORDERS<span id="hksetCt">0 / ${HOOKUP.length}</span></div>`
    + `<div class="hkgrid">${HOOKUP.map((d, i) => `<div class="hkt wait" data-i="${i}" data-dev="${d.key}"><div class="hkt-top"><i class="hkt-mark"></i><span class="hkt-nm">${d.label}</span>${d.recon ? '<span class="hkt-recon">recon</span>' : ''}</div><div class="hkt-read"></div></div>`).join('')}</div>`;
  chatEl.appendChild(wrap); hkCardEl = wrap; hkBusyIdx = -1; trimFeed(); scroll();
}
function hkTile(i) { return hkCardEl && hkCardEl.querySelector(`.hkt[data-i="${i}"]`); }
function hkFinishRow(i) {
  const d = HOOKUP[i], tile = hkTile(i); if (!tile) return;
  clearTimeout(hkLinkTimer);
  tile.classList.remove('wait', 'busy', 'link', 'reconwait'); tile.classList.add('ok'); // step 3 · tick
  const rd = tile.querySelector('.hkt-read'); if (rd) rd.textContent = d.short;
  const ct = hkCardEl.querySelector('#hksetCt'); if (ct) ct.textContent = `${i + 1} / ${HOOKUP.length}`;
  window.dispatchEvent(new CustomEvent('hud:hookup:connected', { detail: { n: i + 1 } })); // rail row + feed + twin marker
  scroll();
}
function bedsideConnect(i) {
  if (hkBusyIdx >= 0) { clearTimeout(hkRowTimer); clearTimeout(hkLinkTimer); const b = hkBusyIdx; hkBusyIdx = -1; hkFinishRow(b); } // fast-press resolves the prior
  const d = HOOKUP[i], tile = hkTile(i); if (!tile) return;
  if (d.recon) {
    // no sensor — hand it to the nurse: the tile waits, the chin asks, confirm ticks it
    tile.classList.remove('wait'); tile.classList.add('busy', 'reconwait');
    addMsg('tars', d.ask, 'nurse check'); gated = true; updateNext();
    reconPrompt(d.reconAsk, d.short, () => {
      hkFinishRow(i); gated = false; updateNext(); humanResolve('logged ✓');
      if (d.reconAfter) addMsg('tars', d.reconAfter, 'reminder set');
    });
  } else {
    // two-step: step 1 · connecting (spinner) → step 2 · reading acquired → step 3 · ✓
    tile.classList.remove('wait'); tile.classList.add('busy'); hkBusyIdx = i;
    hkLinkTimer = window.setTimeout(() => { if (hkBusyIdx === i) { tile.classList.add('link'); const rd = tile.querySelector('.hkt-read'); if (rd) rd.textContent = d.short; } }, 400);
    hkRowTimer = window.setTimeout(() => { if (hkBusyIdx === i) { hkBusyIdx = -1; hkFinishRow(i); } }, 860);
  }
}
function hkFinishBusy() { if (hkBusyIdx >= 0) { clearTimeout(hkRowTimer); clearTimeout(hkLinkTimer); const b = hkBusyIdx; hkBusyIdx = -1; hkFinishRow(b); } }

// Each POD starts on a CLEAN feed — the previous day's chatter (and POD 0's
// pinned bedside card) would otherwise stack five days deep. Fired at every
// day-break, under the cover, so the wipe reads as the day turning rather than
// messages vanishing mid-view.
function clearFeed() { if (chatEl) chatEl.innerHTML = ''; hkCardEl = null; }
/** one POD's opening move: day-break card up, feed wiped, Panel A back on the
 *  twin, Panel C parked on the summary (the note reopens it when it publishes) */
function podOpen(day) {
  window.dispatchEvent(new CustomEvent('hud:daybreak', { detail: { day } }));
  clearFeed();
  window.dispatchEvent(new CustomEvent('hud:window', { detail: { w: 'twin' } }));
  openApp('summary');
}
const paWindow = (w) => window.dispatchEvent(new CustomEvent('hud:window', { detail: { w } }))

// RECON gate: the nurse-side confirm card (a bedside check the system can't sense)
function reconPrompt(ask, reading, onDone) {
  activeHuman = 'nurse'; humanNotch.classList.add('awaiting'); expBottom = true; renderHuman();
  const st = humanNotch.querySelector('#humanStatus'); if (st) st.textContent = 'bedside check';
  const slot = humanNotch.querySelector('#humanAction'); if (!slot) return;
  slot.innerHTML = `<div class="recon"><div class="adm"><span class="adm-lb">${ask}</span><button class="adm-btn">Confirm · ${reading}</button></div></div>`;
  const btn = slot.querySelector('.adm-btn');
  if (btn) btn.addEventListener('click', (e) => { e.stopPropagation(); btn.textContent = '✓ ' + reading; btn.disabled = true; onDone(); });
}

function updateNext() {
  const done = idx >= steps.length;
  nextBtn.disabled = gated || done || busy;
  nextBtn.textContent = done ? '↺' : '›';
  nextBtn.title = done ? 'Replay' : 'Next';
  hintEl.textContent = gated ? 'Awaiting clinical sign-off →' : done ? (state.mode === 'patient' ? 'Continue →' : 'Replay the scripted demo') : (state.mode === 'patient' ? 'TARS is navigating the record →' : 'Step through the briefing →');
}
function runStep() {
  // instant steps (the hookup connects) fire without the typing rhythm — a
  // device clicking on shouldn't pretend to think
  if (steps[idx] && steps[idx].instant) { steps[idx](); idx++; updateNext(); return; }
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

/* ---------- scripts (PLEXUS carries · iSAM reasons · TARS orchestrates) ---------- */
/** The pinned CASE CLOCKS — the centre panel's one big thing, in two acts:
 *
 *   1 · MI GOLDEN HOUR lands BIG. The radio said "chest pain, forty minutes",
 *       so on the classic 60-minute window there are 20:00 left — this is the
 *       clock the whole case answers to, and it is why the cath lab is already
 *       活. It holds the stage for ~2.6 s...
 *   2 · ...then DOCKS to a strip and hands the big slot to the ARRIVAL CLOCK
 *       (ETA 4:00) — the actionable number for the next four minutes.
 *
 *  One interval drives both; the golden hour keeps running after the ETA
 *  expires, because ischaemia does not care that the ambulance arrived. */
let arrivalTimer = 0
function addArrivalCard() {
  const wrap = document.createElement('div'); wrap.className = 'hkset hk-pin'
  wrap.innerHTML = `
    <style>
      #ghWrap{text-align:center;padding:12px 0 4px;transition:all .6s cubic-bezier(.2,.8,.2,1)}
      #ghWrap .gh-lb{font:700 10px ui-monospace,monospace;letter-spacing:.22em;color:#c96a10;transition:all .6s}
      #ghClock{font:700 84px ui-monospace,monospace;color:#e0a03a;letter-spacing:.04em;line-height:1.1;transition:all .6s cubic-bezier(.2,.8,.2,1)}
      #etaWrap{text-align:center;max-height:0;opacity:0;overflow:hidden;transition:all .65s cubic-bezier(.2,.8,.2,1) .15s}
      #etaWrap .eta-bn{font:700 15px system-ui;color:#b71c1c;letter-spacing:.02em}
      #arrClock{font:700 72px ui-monospace,monospace;color:#d92b2b;letter-spacing:.04em;line-height:1.15}
      #etaWrap .eta-sub{font:700 10px ui-monospace,monospace;letter-spacing:.26em;color:#8a99a8;margin-top:6px}
      #etaWrap .eta-case{font:600 12px system-ui;color:#44525c;background:rgba(120,150,170,.08);border-radius:9px;display:inline-block;padding:6px 14px;margin-top:10px}
    </style>
    <div id="arrCard">
      <div id="ghWrap">
        <div class="gh-lb">MI GOLDEN HOUR · PAIN ONSET 40 MIN AGO</div>
        <div id="ghClock">20:00</div>
      </div>
      <div id="etaWrap">
        <div class="eta-bn">NEW PATIENT INBOUND — ETA 4 MIN</div>
        <div id="arrClock">4:00</div>
        <div class="eta-sub">ARRIVAL CLOCK ACTIVATED</div>
        <div class="eta-case">Chandrababu · 58 M · probable MI · Medic 12 · BP 104/65 · HR 125</div>
      </div>
    </div>`
  chatEl.appendChild(wrap); trimFeed(); scroll()
  // One interval drives EVERYTHING — the two clocks AND the act-2 dock. A
  // one-shot timeout kept losing a race against a feed rebuild (its styles
  // landed on a node that was then replaced); the interval already proves it
  // reaches the live DOM every second, so the dock is applied idempotently
  // from second 3 onward — self-healing against any rebuild. Inline styles,
  // not a class flip, so there is no cascade to lose either; the base rules'
  // transitions still animate the change.
  let gh = 1200, eta = 240, secs = 0
  const fmt = (v) => `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`
  window.clearInterval(arrivalTimer)
  arrivalTimer = window.setInterval(() => {
    gh = Math.max(0, gh - 1); eta = Math.max(0, eta - 1); secs += 1
    const g = document.getElementById('ghClock'); const a = document.getElementById('arrClock')
    if (!g && !a) { window.clearInterval(arrivalTimer); return }
    if (g) g.textContent = fmt(gh)
    if (a) a.textContent = fmt(eta)
    if (secs >= 3) {
      const w = document.getElementById('ghWrap')
      const e = document.getElementById('etaWrap')
      if (w) Object.assign(w.style, { display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '10px', padding: '6px 0', borderBottom: '1px solid rgba(150,160,170,.18)' })
      const lb = w && w.querySelector('.gh-lb'); if (lb) lb.style.letterSpacing = '.14em'
      if (g) g.style.fontSize = '22px'
      if (e) Object.assign(e.style, { maxHeight: '340px', opacity: '1', padding: '10px 0 6px' })
    }
  }, 1000)
}

/** ER embed: play the whole brief at boot — the host beat shows a finished
 *  console, no keypresses owed. Same idea as seekEstablished. */
export function seekErBrief() {
  while (idx < steps.length) { steps[idx](); idx++ }
  gated = false; busy = false; pendingNurse = null; updateNext()
}

function floorScript() {
  if (state.chapter === 'er') return [
    () => {
      addMsg('tars', `Medic 12 patched through — <b>Chandrababu, 58 M, probable MI</b>. BP 104/65 · HR 125 · SpO₂ 91 on air. <span class="em">Arrival clock is running — four minutes.</span>`, 'inbound')
      addArrivalCard()
      openApp('protocols')
    },
    () => addMsg('tars', `OMI inbound bundle live: <b>bay 04 cleared</b>, cath lab activated, ECG at the doors. <span class="em">Heparin is held for the clinician gate.</span>`, 'bundle running'),
  ]
  return [
    () => addMsg('tars', `Good morning. ICU—North is <b>8 of 8 occupied</b>. Acuity: <span class="em">4 stable</span>, <b style="color:var(--amberD)">2 watch</b>, <b style="color:var(--redD)">2 critical</b> (ICU-04 anterior STEMI · ICU-08 anterior OMI).`),
    () => addMsg('clinician', `What's our real capacity if cardiology needs a Level-3 bed?`),
    () => addMsg('isam', `Trajectories reviewed. <b>ICU-05</b> (A. Kristof, sepsis) is <span class="em">step-down eligible</span> — NEWS2 2, falling, lactate normalised. Stepping her down frees one Level-3 bed. Advisory — logistics can proceed autonomously.`),
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
    // 1 · iSAM pulls the completed study it is about to read — right split holds on PACS
    () => { addMsg('isam', `Angiogram's in — pulling the coronary study for <b>${b.id}</b>, ${b.patient.name}.`, 'imaging complete'); openApp('pacs'); },
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
    // ── SCENE 4 · beat 0: the bedside hookup ──────────────────────────────
    // The BEDSIDE SETUP checklist lives in Panel B (this feed). Each → connects
    // one device: the row spins → ✓ with its feed line, its Panel-A vital wakes,
    // its glow marker pings on the twin, and a CONNECTED row lands in the rail.
    // Two rows are RECON — urine + drains have no sensor, so TARS asks the nurse
    // and the row waits for a bedside confirm. Panel C shows the post-op record.
    () => { addMsg('tars', `Back from theatre — <b>CABG ×3</b>: LIMA→LAD, SVG→OM, SVG→PDA. Off bypass, chest closed. <span class="em">Working the post-op orders — connecting him up.</span>`, 'establishing bedside'); emrNavigate('notes'); window.dispatchEvent(new CustomEvent('hud:hookup:reset')); addBedsideCard(); },
    ...Array.from({ length: 12 }, (_, i) => {
      const fn = () => {
        bedsideConnect(i);
        if (i + 1 === 5) addMsg('tars', `Airway and breathing — secured.`, 'hookup · 5 of 12');
        if (i + 1 === 7) addMsg('tars', `Support lines running.`, 'hookup · 7 of 12');
      };
      fn.instant = !HOOKUP[i].recon; // auto devices click on; recon devices go through TARS asking the nurse
      return fn;
    }),
    () => { hkFinishBusy(); addMsg('tars', `Bedside established — twelve systems live, all set to order, all feeds on the console. <span class="em">Post-op day 0, hour 1.</span>`, 'bedside established'); },

    // ── POD 1 · wake up and come off ──────────────────────────────────────
    // The day-break card hides the switch: the feed wipes and five devices
    // leave behind it, so when it lifts the clean slate and the missing tube
    // both read as the day turning. Panel A is CHOREOGRAPHED per beat: SCOPE up
    // for the beats that kill machines (their tiles die on screen), WATCH up
    // when the camera speaks, the twin otherwise. Panel C only opens when a
    // note publishes — the record is consulted, not lived in.
    () => { podOpen(1); addMsg('tars', `Overnight — he rewarmed, stayed in sinus, and the drains settled. <span class="em">Post-op day 1: time to wake him up and start taking things away.</span>`, 'post-op day 1'); },
    () => { addMsg('tars', `Sedation off at 07:30. He's opened his eyes, he's obeying commands — grip and toe wiggle both there. <b>Neurologically intact.</b>`, 'waking up'); },
    () => { paWindow('scope'); addMsg('tars', `Weaned <b>SIMV → PSV</b> and ran a spontaneous breathing trial at 10:40. Tidal volumes holding, rate 18, gases fine. <span class="em">He's passed — he doesn't need the ventilator.</span>`, 'breathing trial'); },
    () => { addMsg('tars', `<b>Extubated 11:20.</b> Facemask at 28%, sats 96, chest clear, good cough. Tube and ventilator are off him.`, 'extubated'); window.dispatchEvent(new CustomEvent('hud:hookup:remove', { detail: { keys: ['ett', 'vent'] } })); },
    () => { addMsg('tars', `Balloon pump weaned 1:1 → 1:2 overnight and <b>out at 13:10</b> — groin's stable, distal pulses intact. Noradrenaline off at 15:40; he's holding a MAP of 82 on his own. Warming blanket off, he's at 37.0.`, 'support withdrawn'); window.dispatchEvent(new CustomEvent('hud:hookup:remove', { detail: { keys: ['iabp', 'pumps', 'warm'] } })); },
    () => { paWindow('watch'); addMsg('isam', `Camera's logged the rest: <b>first sit at 14:05</b>, unaided, then forty-five minutes out in the chair. Guarding the sternotomy on transfers — CPOT peaks at 4, settles to 1 at rest.`, 'movement logged'); },
    () => { addMsg('tars', `I've written the day up — the mobility section is straight off the camera log. <span class="em">Seven devices left on him, down from twelve.</span> Plan for tomorrow needs your name:`, 'drafting note'); window.dispatchEvent(new CustomEvent('hud:note:publish', { detail: { day: 1 } })); addOrders([
      { label: PODS[1].orders.label, items: PODS[1].orders.items, detail: 'Daily plan · requires sign-off', autonomy: 'gated', exec: () => emrNavigate('notes') }]); },
    () => { paWindow('twin'); openApp('summary'); addMsg('tars', `Signed. Beta-blocker started for rhythm prophylaxis. <span class="em">He's had a good day — off the ventilator, off support, sitting out.</span>`, 'pod 1 closed'); },

    // ── POD 2 · mobilising — drains out ───────────────────────────────────
    () => { podOpen(2); addMsg('tars', `Overnight quiet — sinus on the beta-blocker, drains down to a trickle. <span class="em">Post-op day 2: get him up, get the tubes out.</span>`, 'post-op day 2'); },
    () => { paWindow('watch'); addMsg('isam', `He <b>stood at 08:40</b> — unaided, steady — then marched on the spot with physio. Two chair transfers logged since. CPOT 3 on exertion, settling at rest.`, 'movement logged'); },
    () => { paWindow('scope'); addMsg('tars', `Drains gave <b>40 mL over the last 8 hours</b>, serous — that clears the removal threshold. <b>Out at 10:15</b>, post-pull film's clean. Suction's stood down with them.`, 'drains out'); window.dispatchEvent(new CustomEvent('hud:hookup:remove', { detail: { keys: ['drains', 'suction'] } })); },
    () => { paWindow('twin'); addMsg('tars', `PCA's off — oral analgesia is holding him through transfers. <span class="em">Five machines left at the bed, down from seven.</span>`, 'de-escalating'); },
    () => { addMsg('tars', `Day 2's written up — the mobility section is the camera log again. Tomorrow's plan needs your name:`, 'drafting note'); window.dispatchEvent(new CustomEvent('hud:note:publish', { detail: { day: 2 } })); addOrders([
      { label: PODS[2].orders.label, items: PODS[2].orders.items, detail: 'Daily plan · requires sign-off', autonomy: 'gated', exec: () => emrNavigate('notes') }]); },
    () => { paWindow('twin'); openApp('summary'); addMsg('tars', `Signed. <span class="em">The lines come out in the morning.</span>`, 'pod 2 closed'); },

    // ── POD 3 · lines out — the last invasive day ─────────────────────────
    () => { podOpen(3); addMsg('tars', `Untroubled night — telemetry quiet, not a run of ectopy. <span class="em">Post-op day 3: everything invasive comes out today.</span>`, 'post-op day 3'); },
    () => { paWindow('watch'); addMsg('isam', `Three corridor walks logged — <b>sixty metres each</b>, gait steady, sternal precautions held on every stand. He queues for the walk before physio arrives.`, 'movement logged'); },
    () => { paWindow('scope'); addMsg('tars', `Arterial line <b>out 09:20</b>, central line <b>out 09:40</b> — sites clean, no ooze. The cuff agrees with everything the art line said on its way out.`, 'lines out'); window.dispatchEvent(new CustomEvent('hud:hookup:remove', { detail: { keys: ['art', 'cvc'] } })); },
    () => { addMsg('tars', `Catheter <b>out at 10:00</b> — he voided at 13:30. <span class="em">Trial of void passed.</span>`, 'catheter out'); window.dispatchEvent(new CustomEvent('hud:hookup:remove', { detail: { keys: ['ucath'] } })); },
    () => { paWindow('twin'); addMsg('tars', `Two machines left on him — <b>telemetry and the calf pumps</b>. The monitor wall has gone dark tile by tile.`, 'telemetry only'); },
    () => { addMsg('tars', `Day 3's drafted. The plan on this one moves him: <span class="em">Step-Down, in the morning.</span>`, 'drafting note'); window.dispatchEvent(new CustomEvent('hud:note:publish', { detail: { day: 3 } })); addOrders([
      { label: PODS[3].orders.label, items: PODS[3].orders.items, detail: 'Transfer plan · requires sign-off', autonomy: 'gated', exec: () => emrNavigate('notes') }]); },
    () => { paWindow('twin'); openApp('summary'); addMsg('tars', `Signed — the Step-Down bed is his. <span class="em">Moving him out of the unit.</span>`, 'transfer ready'); },
  ] : state.chapter === 'stepdown' ? [
    // ── POD 4 · STEP-DOWN — after the transfer (its own chapter: the shell
    // flies the building between POD 3 and here). Same bedside machinery, one
    // wire left. Boots straight into the day-break so the ward arrival IS the
    // title card; setPod(4) behind it leaves telemetry as the only live device.
    () => { podOpen(4); addMsg('tars', `Transferred — <b>Step-Down, bay 4</b>. Calf pumps came off on the way over. <span class="em">One wire left on him: telemetry.</span>`, 'arrived · step-down'); },
    () => { paWindow('scope'); addMsg('tars', `The monitor wall is <b>one live tile</b> now — eleven dark. Sinus 74 on the beta-blocker.`, 'telemetry only'); },
    () => { paWindow('watch'); addMsg('isam', `Camera's logging an independent patient — <b>120 metres</b> today, stairs with physio this afternoon, most of the day in the chair.`, 'movement logged'); },
    () => { paWindow('twin'); addMsg('tars', `Wound check: sternotomy clean and dry, no click, harvest site settled. <b>Not one run of AF the whole admission</b> — the prophylaxis paid for itself.`, 'wound check'); },
    () => { addMsg('tars', `Day 4's written. What's left is the way home — the discharge planning set needs your name:`, 'discharge planning'); window.dispatchEvent(new CustomEvent('hud:note:publish', { detail: { day: 4 } })); addOrders([
      { label: PODS[4].orders.label, items: PODS[4].orders.items, detail: 'Discharge planning · requires sign-off', autonomy: 'gated', exec: () => emrNavigate('notes') }]); },
    () => { paWindow('twin'); addMsg('tars', `Planning's running. Echo came back within the hour — <b>EF 50%</b>, up from 40 on the table, grafts flowing, no effusion. Rehab's booked and the letters are queued.`, 'plan running'); },
    // the record's closing artifact: the whole admission as ONE document. TARS
    // drafts it from the notes it already wrote; the signature files it.
    () => { addMsg('tars', `I've drafted his <b>discharge summary</b> — door to staircase, the med list, the follow-up. <span class="em">One signature closes the record:</span>`, 'summary drafted'); window.dispatchEvent(new CustomEvent('hud:discharge:publish')); addOrders([
      { label: 'Discharge summary — sign to file', detail: 'Closes the admission record · copies to GP + cardiothoracic clinic', autonomy: 'gated', exec: () => window.dispatchEvent(new CustomEvent('hud:discharge:sign')) }]); },
    () => { addMsg('tars', `Filed — his GP and the surgical clinic have it. <span class="em">Four days from a stopped heart to a staircase.</span> He goes home Thursday.`, 'record closed'); },
  ] : [
    // 1 · we're already in — the chart's up (continues straight from the ward dive)
    () => { addMsg('isam', `${b.patient.name}, ${b.patient.age}. His chart's up.`, 'opening record'); emrNavigate('summary'); },
    // 2 · what the monitor + ECG show — no troponin yet
    () => { addMsg('isam', `Monitor's ugly — <b>HR ${b.vitals.hr} and climbing</b>, sats ${b.vitals.spo2}, and the ECG's got the whole front wall lit.`, 'reading vitals'); emrNavigate('vitals', 'emr-vit-hr', 'Heart rate'); },
    // 3 · iSAM — PROVISIONAL read; wants to confirm before committing
    () => { addMsg('isam', `Looks like a big anterior heart attack. I won't call it yet — <span class="em">let's confirm before we commit him.</span>`, 'provisional read'); emrNavigate('imaging', 'emr-img-1', '12-lead ECG'); },
    // 4 · TARS activates the workup: cath lab to STANDBY (auto) + gated diagnostics
    () => { addMsg('tars', `Cath lab's on standby. Before I commit — bloods and a repeat ECG. That one needs your name.`, 'placing orders'); emrNavigate('orders'); addOrders([
      { label: 'Pre-alert cath lab — STANDBY', detail: 'Operational · not committed yet', autonomy: 'autonomous' },
      { label: 'STAT troponin + repeat 12-lead', items: ['STAT Troponin', 'Repeat Lactate', '12-lead ECG'], detail: 'Diagnostics · needs your sign-off', autonomy: 'gated', exec: () => { agentOrderTroponin(); emrNavigate('labs'); } }]); },
    // 5 · order placed → awaiting results
    () => { addMsg('tars', `Signed — samples are away. Results coming back live.`, 'awaiting results'); emrNavigate('labs'); },
    // 6 · iSAM takes the returning result and forms the trajectory
    () => { addMsg('isam', `Troponin's back — <b>8.4</b>, sky-high. That plus the ECG… <span class="em">it's real.</span>`, 'formulating trajectory'); showTrend(b); emrNavigate('labs', 'emr-lab-troponin-i-stat', 'Troponin I (STAT)'); },
    // 7 · the empty seat — iSAM pulls the ECG and runs OMI (no verdict yet)
    () => { addMsg('isam', `Running the ECG through the model now.`, 'reading ECG'); showEcgRead(b); emrNavigate('imaging', 'emr-img-1', '12-lead ECG'); },
    // 8 · iSAM verdict — the risk + call land on top of the ECG it just read
    () => { addMsg('isam', `Confirmed — <b>anterior OMI</b> — the LAD is shut. About <b style="color:var(--redD)">${(b.traj.detProb * 100).toFixed(0)}%</b> he deteriorates without reperfusion. <b style="color:var(--redD)">Open the artery — now.</b>`, 'committing verdict'); showVerdict(b); emrNavigate('imaging', 'emr-img-1', '12-lead ECG'); },
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
    () => { addMsg('isam', `Scanning <b>${b.id}</b> — ${b.patient.name}. ${b.patient.dx}. Opening the chart…`); emrNavigate('summary'); },
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
          <div class="notch-name" id="agentName">iSAM</div>
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

  renderAgent(); renderHuman(); fireWash('isam', true);
}

function advance() {
  if (busy) return;
  if (pendingNurse) { const p = pendingNurse; pendingNurse = null; p(); return; } // bring up the armed nurse card
  if (gated) return;
  if (idx >= steps.length) {
    // end of a patient story → hand off to the next transition (the React shell
    // listens for 'tars:finished' and the host routes by chapter: workup → Cath
    // Lab dive · continued → OR dive · postop (PODs 0-3 done) → the Step-Down
    // transfer flight. The stepdown chapter is the terminus: it HOLDS on its
    // final bedside instead of replaying — there is nowhere left to go.
    if (state.chapter === 'stepdown') return;
    if (state.mode === 'patient' && (state.chapter === 'workup' || state.chapter === 'continued' || state.chapter === 'postop')) { window.dispatchEvent(new CustomEvent('tars:finished')); return; }
    load(state.mode, state.focusId); return;
  }
  runStep();
}
// ── panelA demo seek ────────────────────────────────────────────────────────
// The deck's PLEXUS chapter boots this app straight after "Initialising
// PLEXUS" with only Panel A on screen. Opening on an EMPTY twin and walking 14
// beats of hookup would contradict the graphic that just showed every stream
// feeding the edge node — so the demo opens with the bedside already
// established: POD 0, 12/12 connected, every vital awake.
//
// Done by running beat 0 (reset + bedside card), ticking every row via
// hkFinishRow — the same call the script lands on, minus the spinners and the
// recon nurse-gate, which lives in a panel that is not on screen — and then
// running the close beat. `idx` is left agreeing with what has visibly
// happened, so his next → steps into POD 1 exactly as if he had walked it.
export function seekEstablished() {
  if (state.chapter !== 'postop') return;
  // load() (the mode-change reset) has ALREADY run steps[0] synchronously and
  // left idx at 1 — beat 0 built the bedside card. Only seek from that exact
  // point; anywhere else means the story has genuinely started.
  if (idx === 0 && steps.length) { steps[0](); idx = 1; }
  if (idx !== 1) return;
  for (let i = 0; i < HOOKUP.length; i++) hkFinishRow(i);  // rail rows, twin markers, vitals
  steps[1 + HOOKUP.length]();                              // 'bedside established'
  idx = 2 + HOOKUP.length;
  gated = false; busy = false; pendingNurse = null; updateNext();
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
    // Embedded demos (?panela=1 or ?embed=1): the story does NOT advance on
    // keys. The arrows belong to the HOST's beat navigation — main.js forwards
    // them up to the parent — and the interface is driven by mouse. Without
    // this, pressing → walked the app's own script underneath the demo.
    if (document.body.classList.contains('panela-only') || document.body.classList.contains('embed-keys')) return;
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

/* ── beat scheduling ───────────────────────────────────────────────────────
   A beat's entries were scheduled with bare setTimeouts and nothing cancelled
   them, so pressing forward while one was still playing dropped the incoming
   beat's lines into the outgoing one's gaps — the panel printed them
   interleaved and out of order.

   The fix FLUSHES rather than cancels. Dropping the pending lines would lose
   content outright (a one-line beat pressed through fast would never print at
   all); flushing prints them instantly, in order, and only then starts the new
   beat. Nothing is lost, nothing arrives out of sequence, and the panel catches
   up to wherever the room already is. */
let beatTimers = [], beatPending = [], flushing = false;
function schedule(fn, ms) {
  const entry = { fn, done: false };
  beatPending.push(entry);
  beatTimers.push(setTimeout(() => { entry.done = true; fn(); }, ms));
}
function flushBeat() {
  for (const t of beatTimers) clearTimeout(t);
  beatTimers = [];
  const q = beatPending.filter((e) => !e.done);
  beatPending = [];
  flushing = true;                       // makes wardSay print rather than re-schedule
  for (const e of q) e.fn();
  flushing = false;
  // a line cancelled mid-rhythm can leave its typing bubble behind
  if (chatEl) chatEl.querySelectorAll('.typing-msg').forEach((n) => n.remove());
  thinking(false);
}

/** One agent/human line with the standard thinking → typing → message rhythm.
 *  `status` is the notch's doing-word — 'reserving the bed', 'reading the
 *  overnight scan'. It shows WHILE the agent thinks and stays after the line
 *  lands. A generic 'thinking…' on every beat is what makes two agents read as
 *  two people chatting; naming the actual work is what makes them read as
 *  working. The post-cath script has done this from the start ('reading study',
 *  'committing verdict') — the ward simply never passed one. */
export function wardSay(who, html, status, delay = 520) {
  if (flushing) { addMsg(who, html, status); return; } // catching up — no rhythm
  thinking(true, status || 'thinking…');
  const typing = addTyping();
  schedule(() => { typing.remove(); thinking(false); addMsg(who, html, status); }, delay);
}

/** A beat = a list played in sequence (one ICU step's chatter). Two kinds of
 *  entry: {who, html, status} speaks, and {orders:[...]} fires an order block.
 *  Actions belong in the second kind — a system that WRITES that it booked a
 *  bed is narrating; one that shows the row spin and tick is working. */
export function wardBeat(items) {
  flushBeat();                           // whatever is still in the air lands NOW
  let at = 0;
  for (const it of items) {
    if (it.orders) { schedule(() => addOrders(it.orders), at); at += 900; continue; }
    schedule(() => wardSay(it.who, it.html, it.status), at);
    at += 1350;
  }
}
