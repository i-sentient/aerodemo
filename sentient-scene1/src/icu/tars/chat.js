import './panelb.css'; // Panel B's own styles — single copy, loads in BOTH the ward dock and the 3-split
import { bedById } from './ontology.js';
import { state, onModeChange, onThemeChange } from './state.js';
import { HOOKUP, PODS, podByDay } from './postop.js';
import { agentUpdateEMAR, agentStopPressor, agentOrderTroponin, agentGiveMeds, agentHoldHeparin, agentOrderRoutine, agentStartEmpiric, agentPod3Bloods, agentTreatPericarditis, emrNavigate, openApp, setCathLab, setPacsView } from './apps.js';
import { ecgAt, ecgPatternForBed } from '../ontology/ecg';

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
    // Committed DARK. The old blobs 2 and 3 were #2FA96E and a pale #A8E8C8,
    // which put white text at 2.99 and 1.40 against them — and "CONFIDENCE" at
    // 55% white came out 1.05, the exact luminance of its own background. Same
    // greens, lower value: white now reads 5.3 / 6.5 / 7.2 across the plate.
    blobs: [['#1F7A50', '18%', '20%', '110%'], ['#1A6B46', '86%', '58%', '105%'], ['#14603D', '50%', '114%', '125%']] },
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
function arcGaugeSVG(value, dim = 107) {
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

/* ============================================================================
 *  iSAM · PHYSIOLOGICAL STATE ESTIMATE   (the agent chin, beats 6-8)
 *
 *  Not two widgets consulted at two moments — ONE estimate that assembles, with
 *  two components iSAM owns:
 *
 *    CRASH-PREDICT   the vitals, continuously  ->  a PROBABILITY  (82% / 2 h)
 *    VIGIL           the ECG, continuously     ->  a WINDOW       (overt ST
 *                                                  elevation in 34-47 min)
 *
 *  The two output shapes differ on purpose. A probability and a forecast window
 *  do not look alike, so they read as different machinery rather than as two
 *  labels on one number.
 *
 *  The panel is deliberately INCOMPLETE between beats. Beat 6 fills CRASH-
 *  PREDICT and leaves VIGIL standing by, and that gap is the whole reason beat
 *  7 exists: iSAM is not going for a second opinion, its own estimate is half
 *  built. A probability cannot say WHEN. Beat 8 closes it, and it is the first
 *  time both forecasts are in one sentence.
 *
 *  The panel is PLEXUS's state, read by iSAM. The source line — unbroken, and
 *  running before he was admitted — is the whole argument for a state estimate
 *  over a chart: a chart holds readings, PLEXUS holds a signal, and only a
 *  signal has a future in it. PLEXUS carries its own red (--plexus), which is
 *  NOT the panel's alarm red; it is infrastructure, not a warning.
 * ========================================================================== */
const VIGIL_MID = 40, VIGIL_LO = 34, VIGIL_HI = 47; // minutes to overt ST elevation

function pstateSlot() {
  const slot = agentNotch && agentNotch.querySelector('#agentAction');
  if (!slot) return null;
  agentNotch.classList.add('tall'); // this panel needs more chin than .exp gives
  if (!slot.querySelector('.pstate')) {
    slot.innerHTML = `<div class="pstate">
      <div class="ps-hd"><span class="ps-ttl"><b>PLEXUS</b> STATE</span><span class="ps-src">continuous · unbroken since 09:04 · pre-hospital</span></div>
      <div class="ps-row" id="psCrash"><span class="ps-m">CRASH-<br>PREDICT</span><div class="ps-bd"><div class="ps-graph"><span class="ps-wait">standing by</span></div><div class="ps-out"></div></div></div>
      <div class="ps-row" id="psVigil"><span class="ps-m">VIGIL</span><div class="ps-bd"><div class="ps-graph"><span class="ps-wait">standing by</span></div><div class="ps-out"></div></div></div>
    </div>`;
  }
  return slot;
}
const psRow = (slot, id) => ({ row: slot.querySelector('#' + id), g: slot.querySelector('#' + id + ' .ps-graph'), out: slot.querySelector('#' + id + ' .ps-out') });

/** The chin is `overflow:hidden` at a fixed .exp height, and this panel is the
 *  tallest thing it ever holds. Rather than hardcode a number — which is wrong
 *  the moment a caption rewraps or a font metric shifts — measure what the
 *  content actually needs and set it. `.tall` in the CSS stays as the floor so
 *  a failed measurement clips gracefully instead of catastrophically.
 *  Bottom padding is added by hand: Chromium leaves it out of scrollHeight when
 *  the content overflows, which is exactly the case here. */
function fitNotch(notch, marker, isOpen) {
  if (!notch) return;
  const inner = notch.querySelector('.notch-inner');
  if (!inner) return;
  requestAnimationFrame(() => {
    if (!isOpen() || !notch.querySelector(marker)) return;
    // skip out-of-flow children (.notch-dots, .notch-caret are absolute) — their
    // offsets describe where they are pinned, not how tall the content is
    const kids = [...inner.children].filter((el) => getComputedStyle(el).position !== 'absolute');
    const last = kids[kids.length - 1];
    if (!last) return;
    const padB = parseFloat(getComputedStyle(inner).paddingBottom) || 0;
    // offsetTop/offsetHeight, NOT getBoundingClientRect: .notch-action animates
    // in with fadeUp (translateY(8px)), and a rect measured mid-animation bakes
    // that transform into the height. Layout offsets ignore transforms.
    const h = Math.ceil(last.offsetTop + last.offsetHeight + padB);
    if (h > 0) notch.style.height = h + 'px';
  });
}
const fitChin = () => fitNotch(agentNotch, '.pstate, .icase', () => expTop);
/** the clinician chin has the same problem for the same reason: the decision
 *  card is far taller than .exp's 222px once it carries its working */
const fitHumanChin = () => fitNotch(humanNotch, '.ord.decide', () => expBottom);

function sparkSVG(b) {
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
  return `<svg class="ps-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <defs><linearGradient id="tgGrad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${H}">
        <stop offset="0" stop-color="var(--redD)"/><stop offset="${thr}" stop-color="var(--redD)"/>
        <stop offset="${thr}" stop-color="#ffffff"/><stop offset="1" stop-color="#ffffff"/>
      </linearGradient></defs>
      <path d="${area}" fill="var(--redD)" opacity="0.12"/>
      <path d="${line}" fill="none" stroke="url(#tgGrad)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.4" fill="var(--redD)"/>
    </svg>`;
}

/** BEAT 6 — CRASH-PREDICT's row fills completely: the trajectory it built from
 *  serial vitals, and the probability that follows from it. VIGIL is left
 *  standing by on purpose. */
function showCrash(b) {
  window.dispatchEvent(new Event('hud:trajectory')); // summon the scanner's trajectory block
  const slot = pstateSlot(); if (!slot) return;
  const news2 = (b.traj && b.traj.news2) || 8;
  const pct = Math.round((b.traj && b.traj.detProb ? b.traj.detProb : 0.82) * 100);
  const { row, g, out } = psRow(slot, 'psCrash');
  g.innerHTML = `${sparkSVG(b)}<div class="ps-cap">NEWS2 <b>2 → ${news2}</b> · five readings · rising</div>`;
  out.innerHTML = `<div class="v-num">${dotDigitsSVG(pct, 8, 'var(--redD)')}<span class="v-pct">%</span></div><div class="v-lb">risk · 2 h</div><div class="v-bar"><i style="width:${pct}%"></i></div>`;
  row.classList.add('live');
  expTop = true; renderAgent(); fitChin();
}

/* ---------- VIGIL's channel: the live lead, and the one it predicts -------- */
let ecgRaf = null, ecgBuf = [], ecgPh = 0, ecgLast = 0;
let ecgGhost = [], ecgGhostOn = false, ecgGhostA = 0;
function stopEcg() { if (ecgRaf) cancelAnimationFrame(ecgRaf); ecgRaf = null; ecgBuf = []; ecgGhost = []; ecgGhostOn = false; ecgGhostA = 0; ecgPh = 0; ecgLast = 0; }
const revealGhost = () => { ecgGhostOn = true; };
/** Draws TWO phase-locked traces on one canvas: `pat` live and solid, `ghost`
 *  dashed and faint. Same phase, same rate, so the QRS complexes land exactly
 *  on top of one another and the only thing that moves between them is the ST
 *  segment — the whole OMI-vs-STEMI argument in a single frame.
 *
 *  The ghost starts at zero alpha and is revealed by revealGhost(), because a
 *  prediction has to ARRIVE; present from the first frame it just reads as a
 *  second signal. It stays dashed and captioned PREDICTED — solid and
 *  unlabelled it is a STEMI drawn on the one patient in this building whose
 *  entire diagnosis is that he has not got one. */
function startEcg(cv, pat, hr, ghost) {
  stopEcg();
  const ctx = cv.getContext('2d');
  const GAP = 2.2, SPEED = 60;
  const stroke = (getComputedStyle(cv).getPropertyValue('--redD') || '#ff7a73').trim();
  const yOf = (v, h) => h * 0.58 - v * (h * 0.40);
  const trace = (buf, h) => {
    ctx.beginPath();
    for (let i = 0; i < buf.length; i++) { const x = i * GAP, y = yOf(buf[i], h); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
  };
  /** The area BETWEEN the two traces. They share an identical P-QRS, so this
   *  fill is zero-width through the complex and opens into a lens only where
   *  the prediction actually differs — across the ST segment and the T wave.
   *  It exists because the true separation is ~0.375 of an R wave, which is
   *  the honest proportion and about seven pixels: legible as a shaded gap,
   *  invisible as two thin lines. Shading it beats exaggerating the waveform,
   *  which would be lying about the ECG to make a point about the ECG. */
  const lens = (a, gh, h) => {
    const n = Math.min(a.length, gh.length); if (n < 2) return;
    ctx.beginPath();
    for (let i = 0; i < n; i++) { const x = i * GAP, y = yOf(a[i], h); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(i * GAP, yOf(gh[i], h));
    ctx.closePath(); ctx.fill();
  };
  const loop = (t) => {
    if (!cv.isConnected) { stopEcg(); return; } // widget gone -> stop the loop
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h = cv.clientHeight;
    if (w && cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const dt = ecgLast ? Math.min(0.05, (t - ecgLast) / 1000) : 0.016; ecgLast = t;
    if (ecgGhostOn) ecgGhostA = Math.min(1, ecgGhostA + dt * 1.5);
    const n = Math.max(1, Math.round(dt * SPEED));
    for (let i = 0; i < n; i++) {
      ecgPh = (ecgPh + (hr / 60) / SPEED) % 1;
      ecgBuf.push(ecgAt(ecgPh, pat) + (Math.random() - 0.5) * 0.015);
      if (ghost) ecgGhost.push(ecgAt(ecgPh, ghost)); // same phase — the complexes MUST align
    }
    const cap = Math.ceil(w / GAP) + 2;
    while (ecgBuf.length > cap) ecgBuf.shift();
    while (ecgGhost.length > cap) ecgGhost.shift();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (ghost && ecgGhostA > 0) { // under the live trace, never over it
      ctx.save();
      ctx.globalAlpha = 0.20 * ecgGhostA; ctx.fillStyle = stroke; lens(ecgBuf, ecgGhost, h);
      ctx.globalAlpha = 0.55 * ecgGhostA; ctx.setLineDash([3, 3]); ctx.lineWidth = 1.3;
      trace(ecgGhost, h); ctx.restore();
    }
    ctx.globalAlpha = 1; ctx.setLineDash([]); ctx.lineWidth = 1.6;
    trace(ecgBuf, h);
    ecgRaf = requestAnimationFrame(loop);
  };
  ecgRaf = requestAnimationFrame(loop);
}

/** BEAT 7 — VIGIL's row. The live lead comes up and reads; a beat later the
 *  prediction lands on top of it. That landing is the cue that beat 8 is ready
 *  — the same grammar the ER's CV card uses. */
function showVigil(b) {
  const slot = pstateSlot(); if (!slot) return;
  const { row, g, out } = psRow(slot, 'psVigil');
  const pat = ecgPatternForBed(b);
  // the forecast only exists where the evolution is the actual claim: de Winter
  // is a pre-infarction pattern, and predicting a STEMI off a sinus rhythm
  // would be the model inventing a disease
  const ghost = pat === 'deWinter' ? 'stemi' : null;
  g.innerHTML = `<canvas class="ps-ecg"></canvas><div class="ps-cap" id="psVigilCap">reading lead II · continuous</div>`;
  out.innerHTML = `<span class="ps-wait">forecasting</span>`;
  row.classList.add('live');
  expTop = true; renderAgent(); fitChin();
  const cv = g.querySelector('.ps-ecg');
  if (!cv) return;
  startEcg(cv, pat, (b.vitals && b.vitals.hr) || 118, ghost);
  if (!ghost) return;
  setTimeout(() => {
    if (!cv.isConnected) return;
    revealGhost();
    const cap = slot.querySelector('#psVigilCap');
    if (cap) cap.innerHTML = `<b>PREDICTED</b> · overt anterior ST elevation`;
    out.innerHTML = `<div class="v-num">${dotDigitsSVG(VIGIL_MID, 8, 'var(--redD)')}<span class="ps-unit">min</span></div><div class="v-lb">${VIGIL_LO}–${VIGIL_HI} min</div>`;
    fitChin(); // the forecast block is taller than the "forecasting" placeholder
  }, 1300);
}

/* ============================================================================
 *  iSAM · CORONARY DECISION  (the agent chin, post-cath)
 *
 *  The recommendation is the hero of this scene, so it gets the surface where
 *  iSAM shows its work — the same chin the PLEXUS state estimate used — and not
 *  the feed, which scrolls it away in two beats.
 *
 *  It also fixes a structural mistake: the case and the CHOICE were the same
 *  card in the clinician's chin, which is why that chin had to grow to 372 px.
 *  They are two different things belonging to two different people. Reasoning
 *  lives up top and STAYS UP while the choice is made below it, so the decision
 *  is taken with the argument still on screen rather than from memory.
 * ========================================================================== */
/* What iSAM READ, then what it CONCLUDED — in that order, because the order is
 * the argument. Each row names the system it came from, so the panel shows a
 * reasoner working ACROSS the record rather than looking at one screen: the
 * demographics arrived at the ER door, the ECG off the monitor, the numbers out
 * of the LIS, the anatomy off PACS. Nothing here is new information; the verdict
 * underneath is new, and it is new because these five were read together.
 *
 * Only ONE course is stated. The alternative is not hidden — it is a BUTTON, in
 * the clinician's chin directly below, and iSAM argues against it out loud if
 * they take it. Putting both here duplicated the choice card and turned a
 * recommendation into a comparison table. */
const CORONARY_CASE = [
  // six, so the two columns come out even — and six DISTINCT systems, which is
  // the claim. Values stay under ~30 characters: the column is ~230 px and an
  // ellipsis in the middle of the evidence makes the sweep look partial.
  ['EMR', '58 M · T2DM · active smoker'],
  ['ECG', 'anterior OMI · de Winter'],
  ['LIS', 'troponin 8.4 · lactate 3.1'],
  ['PACS', 'LCx 75% · RCA 60% · LAD POBA'],
  ['ECHO', 'LVEF 40% · anterior hypokinesis'],
  ['eMAR', 'aspirin only · ticagrelor held'],
]
const CORONARY_VERDICT = { label: 'CABG ×3', sub: 'graft all three — today', conf: 78, src: 'revascularisation' }
// the alternative, argued against only if the clinician reaches for it
const CASE_ALT = { key: 'ptca', label: 'STAGED PCI', sub: 'second sitting · stent all three', conf: 22 }

/* POD 3 — the same panel, the same grammar, a different question.
 *
 * Row order is the order the beats put them on screen, because this panel is an
 * ASSEMBLY of things the room has already seen and not a reveal. Two of the six
 * are negatives, and that is the point: a fever three days after a sternotomy
 * needs "not infection" and "not a graft" answered before anything else, and the
 * second one is the whole scene.
 *
 * The d0 ECG row is the hero. Those inferior Q waves are on the DAY-0 twelve-lead
 * — iSAM can only call them old because it has held the record since the front
 * door. A clinician meeting this patient on POD 3 cannot.
 */
const PERICARD_CASE = [
  ['OBS', 'T 38.4 · second spike'],
  ['WATCH', 'walks 3 → 0 · CPOT 5'],
  ['LIS', 'CRP 184 ↑ · WCC 9.1 ↓'],
  ['TELEM', 'diffuse ST · PR depressed'],
  ['ECG d0', 'inferior Q — already there'],
  ['ECHO', 'effusion 8 mm · no tamponade'],
]
// two verdicts, one case: the panel opens at 5 of 6 and the echo beat tops it up.
// Same label both times — iSAM does not change its mind, it stops hedging.
const PERICARD_PROV = { label: "DRESSLER'S", sub: 'provisional', conf: 74, src: 'post-cardiac injury' }
const PERICARD_VERDICT = { label: "DRESSLER'S", sub: 'confirmed', conf: 91, src: 'post-cardiac injury' }

/** `rows` caps how many input rows carry a value — so the panel can open
 *  deliberately incomplete and be topped up by a later beat. That is what makes
 *  POD 3's echo beat do work instead of just repeating the verdict. */
function showCase(inputs, v, title = 'CORONARY', rows = null) {
  const slot = agentNotch && agentNotch.querySelector('#agentAction');
  if (!slot) return;
  agentNotch.classList.add('tall');
  const n = rows == null ? inputs.length : Math.min(rows, inputs.length);
  slot.innerHTML = `<div class="icase">
    <div class="ps-hd"><span class="ps-ttl">${title} <b>DECISION</b></span><span class="ps-src">${v.src} · iSAM</span></div>
    <div class="ic-inhd">reading<span>${n} of ${inputs.length} sources</span></div>
    <div class="ic-in">${inputs.map(([src, val], i) => `<div class="ic-row${i >= inputs.length / 2 ? ' rev' : ''}${i >= n ? ' pend' : ''}"><span class="ic-src">${src}</span><span class="ic-val">${i < n ? val : 'standing by'}</span></div>`).join('')}</div>
    <div class="ic-verdict">
      <div class="ic-vb">
        <div class="ic-vk">verdict</div>
        <div class="ic-lb">${v.label}</div>
      </div>
      <div class="ic-cf">
        <div class="ic-ck">confidence</div>
        <div class="ic-cn">${dotDigitsSVG(v.conf, 5.5, '#ffffff')}<i>%</i></div>
      </div>
    </div>
  </div>`;
  expTop = true; renderAgent(); fitChin();
}

/** BEAT 8 — the estimate closes. Both rows are already full; what lands here is
 *  the conclusion drawn ACROSS them, which is the one thing neither component
 *  could produce alone. */
function closeState(b) {
  window.dispatchEvent(new Event('hud:trajectory')); // verdict lands → make sure the block is up
  const slot = pstateSlot(); if (!slot) return;
  if (!slot.querySelector('#psCrash.live')) showCrash(b); // stepped through too fast
  if (!slot.querySelector('#psVigil.live')) showVigil(b);
  const panel = slot.querySelector('.pstate');
  if (panel && !panel.querySelector('.ps-verdict')) {
    const v = document.createElement('div'); v.className = 'ps-verdict';
    v.innerHTML = 'OMI-positive · anterior <b>de WINTER</b> · <b>reperfuse now</b>';
    panel.appendChild(v);
  }
  expTop = true; renderAgent(); fitChin();
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
  if (!expTop) agentNotch.style.height = ''; // collapsing: hand the height back to CSS
  agentNotch.querySelector('#agentBlobs').innerHTML = blobsHTML(a.blobs);
  agentNotch.querySelector('#agentName').textContent = a.name;
  agentNotch.querySelector('#agentRole').textContent = a.role;
  agentNotch.querySelector('#agentDots').innerHTML = AGENT_ORDER.map((k) => `<span class="pd${k === activeAgent ? ' on' : ''}"></span>`).join('');
}
function renderHuman() {
  const h = HUMANS[activeHuman];
  humanNotch.classList.toggle('exp', expBottom);
  if (!expBottom) humanNotch.style.height = ''; // collapsing: hand the height back to CSS
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
    // The armed nurse card still owes us an appearance — that is the whole
    // point of the clinician's approve, and it must run even on the last beat.
    if (pendingNurse) { advance(); return }
    // The ward and transit have no step list of their own — their beats live in
    // the host, and this event is the only way to reach them. Checked FIRST:
    // with steps empty, the end-of-script guard below reads 0 >= 0 and would
    // swallow the ward's own gate.
    if (!steps.length) { window.dispatchEvent(new Event('tars:advance')); return }
    // ...and a gate must never advance OFF THE END of a script. Since pre-cath
    // lost its closing beat, the nurse's administer IS the last thing in the
    // scene, and the auto-advance ran straight past it into `tars:finished` —
    // the room got yanked back out to the building the instant the drug was
    // given, with no beat left to land on. Leaving a scene is the operator's
    // press, never a side effect of clearing a gate.
    if (idx >= steps.length) { updateNext(); return }
    advance();
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
/** `factors` is the convergence, made structural.
 *
 *  iSAM's recommendation is only as good as the reader's ability to see WHAT it
 *  converged. Carrying six inputs in a sentence turns the strongest moment in
 *  the act into a paragraph nobody finishes; carrying them as chips above the
 *  choice shows the reasoner's working, and every chip is a fact the story has
 *  already put on screen — the comorbidities came in at the ER door, the
 *  anatomy off the angiogram, the ventricle off the post-PCI echo.
 *
 *  Each option also takes `why`: the two or three consequences that actually
 *  separate them. Under the recommended one they read as support; under the
 *  other they read as the cost — which is the honest way to show a lean without
 *  hiding the alternative. */
function decisionPrompt(options, onChoose, factors) {
  activeHuman = 'clinician';
  humanNotch.classList.add('awaiting');
  expBottom = true;
  renderHuman();
  const st = humanNotch.querySelector('#humanStatus'); if (st) st.textContent = 'decision required';
  const slot = humanNotch.querySelector('#humanAction');
  if (!slot) return;
  const strip = factors && factors.length
    ? `<div class="dfx"><span class="dfx-k">converging</span>${factors.map((f) => `<span class="dfx-c">${f}</span>`).join('')}</div>`
    : '';
  slot.innerHTML = `<div class="ord gated decide">${strip}${options.map((o) => `
    <button class="opt${o.lean ? ' lean' : ''}" data-k="${o.key}">
      <span class="ol">${o.label}</span>
      <span class="os">${o.sub}</span>
      <span class="oc">${o.conf}</span>
      ${o.why && o.why.length ? `<span class="ow">${o.why.map((w) => `<i>${w}</i>`).join('')}</span>` : ''}
    </button>`).join('')}</div>`;
  humanNotch.classList.add('tall'); // .exp's 222px cannot hold the working
  renderHuman(); fitHumanChin();
  slot.querySelectorAll('.opt').forEach((btn) => btn.addEventListener('click', (e) => { e.stopPropagation(); onChoose(btn.dataset.k); }));
}

function humanResolve(text) {
  humanNotch.classList.remove('awaiting');
  humanNotch.classList.remove('tall'); humanNotch.style.height = '';
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
    if (changed) { const as = agentNotch && agentNotch.querySelector('#agentAction'); if (as) as.innerHTML = ''; agentNotch.classList.remove('tall'); agentNotch.style.height = ''; stopEcg(); expTop = false; }
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

/* Rows LAND one at a time.
 *
 * The block used to be built in a single frame: every row appeared together,
 * every autonomous row resolved within ~400 ms of every other, and humanPrompt
 * threw the clinician card up while they were all still spinning. There was no
 * moment in which you could see what the agents had DONE before being asked to
 * countersign it — which is the one thing the panel exists to show.
 *
 * So each row waits its turn, each autonomous row fires FIRE_MS after ITS OWN
 * arrival rather than the block's, and a gated row does not appear until every
 * autonomous row still in flight has finished — including rows from an earlier
 * block in the same beat, which is why the watermark is module state and not a
 * local (ward state 3 fires its three autos and its one gated order as two
 * separate blocks, 900 ms apart). The signature arrives after the work it
 * depends on, which is also the honest order. */
const ROW_GAP = 420, FIRE_MS = 900, GATE_PAUSE = 520;
let ordBusyUntil = 0; // performance.now() by which every autonomous row is done

function addOrders(list) {
  activeAgent = 'tars'; state.speaker = 'tars'; renderAgent(); fireWash('tars', true);
  const wrap = document.createElement('div'); wrap.className = 'orders';
  // `flushing` is read live, not captured: a beat can be flushed mid-stagger,
  // and when it is, the rest of the block lands at once — same rule as wardSay.
  const at = (fn, ms) => (flushing ? fn() : schedule(fn, ms));

  // The gate arms NOW even though its card lands later, or → would stay live
  // through the stagger and the sign-off could be walked straight past.
  if (list.some((o) => o.autonomy !== 'autonomous')) { gated = true; updateNext(); }

  const t0 = performance.now(), when = new Map();
  let slot = 0;
  for (const o of list) if (o.autonomy === 'autonomous') {
    const ms = slot++ * ROW_GAP; when.set(o, ms);
    ordBusyUntil = Math.max(ordBusyUntil, t0 + ms + FIRE_MS);
  }
  let gate = 0;
  for (const o of list) if (o.autonomy !== 'autonomous') {
    gate = Math.max(gate + ROW_GAP, ordBusyUntil - t0 + GATE_PAUSE); when.set(o, gate);
  }

  list.forEach((o) => at(() => {
    if (!wrap.isConnected) { chatEl.appendChild(wrap); trimFeed(); } // mount on the first row, so .orders' own entrance plays with something in it
    const el = document.createElement('div'); el.className = 'ord pre ' + o.autonomy; el.id = 'ord' + (++ordSeq);
    el.innerHTML = `<div class="ic">${o.autonomy === 'autonomous' ? '⚡' : '✋'}</div><div class="bd"><div class="lb">${o.label}</div><div class="dt">${o.detail}</div></div><span class="tag">${o.autonomy === 'autonomous' ? 'AUTO' : 'GATED'}</span><div class="act"></div>`;
    wrap.appendChild(el); scroll();
    // .pre is a transition, not an animation — ordLive already owns `animation`
    // on these rows. The reflow is what gives the transition a starting frame;
    // a bare rAF can be batched with the insert and the row just pops in. Same
    // idiom fireWash uses to restart its own animation.
    void el.offsetWidth; el.classList.remove('pre');
    const act = el.querySelector('.act');
    if (o.autonomy === 'autonomous') {
      act.innerHTML = `<div class="state"><span class="spin"></span>firing</div>`;
      at(() => { o.exec && o.exec(); act.innerHTML = `<div class="state">✓ done</div>`; el.classList.add('done'); }, FIRE_MS);
    } else {
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
  }, when.get(o)));
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
  // Broadcast the gate. In the Hub this button IS the control, but the ward and
  // transit hide .p2-foot and step from the host's arrow keys — which knew
  // nothing about `gated`, so → walked straight past an unsigned sign-off and
  // the CLINICAL GATE · IN THE LOOP promise was decorative there.
  window.dispatchEvent(new CustomEvent('tars:gate', { detail: { gated } }));
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
/* The ER embed is MOUNTED a beat before it is SHOWN, so the app can boot behind
 * the cover. load() runs beat 0 synchronously — and for the ER that beat is the
 * arrival card, which starts the golden-hour clock and its dock to the ETA. Held
 * open, that whole beat played to an empty room and the frame dissolved in on a
 * clock already counting. seekErBrief was the obvious suspect and was NOT the
 * culprit; this line was. */
let holdOpening = false;
export function setHoldOpening(v) { holdOpening = !!v; }
function load(kind, bedId) {
  chatEl.innerHTML = ''; idx = 0; gated = false; busy = false; pendingNurse = null;
  steps = kind === 'patient' ? patientScript(bedById(bedId)) : floorScript();
  if (steps.length && !holdOpening) { steps[0](); idx = 1; }
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
    // pre-alerted, like every other mention before the troponin is back
    () => addMsg('tars', `OMI inbound bundle live: <b>bay 04 cleared</b>, cath lab pre-alerted, ECG at the doors. <span class="em">Heparin is held for the clinician gate.</span>`, 'bundle running'),
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
    // 2 · iSAM reads the angio. The CULPRIT IS ALREADY OPEN — the lab stented
    // the LAD on arrival, which is what the whole ER-to-cath arc was arguing
    // for. What the same run also found is the rest of the disease, and THAT
    // is the thing still needing a decision.
    () => { addMsg('isam', `Reading it now. The LAD's open — <b style="color:var(--tealD)">balloon only, TIMI 3, no stent in him</b>. That bought the muscle back; it did not fix the artery. And the run found the rest: <b style="color:var(--redD)">circumflex 75%</b> · <b style="color:var(--redD)">right coronary 60%</b>. <span class="em">The infarct was the emergency. This is the disease.</span>`, 'reading study'); },
    // 3 · the radiologist's report lands — concordant.
    // No SYNTAX score: that number described three vessels, and with the LAD
    // treated it no longer describes anything on this study. Quoting it would
    // be the same invented precision the transit panel was pulled up for.
    () => { addMsg('isam', `Radiologist's report just landed — <b>concordant</b> with my read. Three vessels want revascularising, and the LAD is holding on a balloon. <span class="em">Nothing here is finished.</span>`, 'cross-checking report'); emrNavigate('notes', 'emr-note-rad', 'Radiology report'); },
    // 4 · iSAM BUILDS ITS CASE — in the chin, not the feed.
    // The line states the MECHANISM, which is the thing a room can check;
    // "surgery wins in diabetics" is a fact to be taken on trust. Everything
    // else — the eight converging inputs, both courses, their confidences and
    // what separates them — goes on the panel, where it stays put.
    () => {
      addMsg('isam', `Two ways to finish this. Here's what decides it — a stent treats the segment you can see. In a diabetic smoker at 58 the disease is diffuse and it is <span class="em">still moving</span>: the lesion that takes him in five years is not on this film yet. A graft covers the territory, not the lesion — and he has no stent in him, so nothing is committed.`, 'building the case');
      showCase(CORONARY_CASE, CORONARY_VERDICT, 'CORONARY');
    },
    // 5 · ...and shows him the arteries it is talking about. The reconstruction
    // is the EVIDENCE, so it lands between the case and the choice — the
    // clinician decides looking at the vessels, not at a memory of them.
    () => {
      addMsg('isam', `This is his own reconstruction — the three lesions are marked. <span class="em">Turn it if you want to look.</span>`, 'reconstruction up');
      window.dispatchEvent(new Event('hud:recon:show'));
    },
    // 6 · THE CHOICE. Two buttons and nothing else: the argument is still on
    // screen above it, so the card does not have to repeat itself.
    () => {
      addMsg('isam', `That's my call. <span class="em">Your decision, doctor.</span>`, 'awaiting decision');
      gated = true; updateNext();
      const offer = () => decisionPrompt([
        { key: CASE_ALT.key, label: CASE_ALT.label, sub: CASE_ALT.sub, conf: `iSAM ${CASE_ALT.conf}%` },
        { key: 'cabg', label: CORONARY_VERDICT.label, sub: CORONARY_VERDICT.sub, conf: `iSAM ${CORONARY_VERDICT.conf}%`, lean: true },
      ], (k) => {
        if (k === 'cabg') {
          humanResolve('CABG selected ✓');
          addMsg('clinician', `Bypass. Three vessels, diabetic, and no stent tying my hands — take him today.`);
          gated = false; updateNext();
        } else {
          humanResolve('STAGED PCI selected');
          addMsg('clinician', `The LAD's already open. Why not just stent the three and be done?`);
          setTimeout(() => {
            addMsg('isam', `The diabetes and the ventricle. Same anatomy in a non-diabetic with a normal LV and I'd agree with you — stent them and send him home. Here, staged PCI carries the highest repeat-revascularisation rate of any group we treat, and the first stent commits him to DAPT: <span class="em">the surgical door shuts behind it.</span> I'd still advise CABG. Your call stands, doctor.`, 'advising');
            gated = true; updateNext(); offer(); // re-offer — the doctor still owns the call
          }, 1400);
        }
      });
      offer();
    },
    // 7 · TARS books the OR — operational fires, the pre-op needs a signature
    () => { addMsg('tars', `CABG it is. Booking cardiothoracic — the pre-op set needs your name:`, 'booking theatre'); emrNavigate('orders'); addOrders([
      { label: 'Book OR-1 — cardiothoracic', detail: 'Theatre scheduling · first on the morning list', autonomy: 'autonomous' },
      { label: 'Page surgical + perfusion + anaesthesia', detail: 'CT surgery on-call · operational', autonomy: 'autonomous' },
      { label: 'Hold ICU bed — post-op return', detail: 'Bed management · operational', autonomy: 'autonomous' },
      { label: 'Pre-op workup — consent · cross-match 4u · CXR · bloods', items: ['Surgical consent', 'Cross-match 4 units', 'Chest X-ray', 'Pre-op bloods'], detail: 'Pre-operative set · requires sign-off', autonomy: 'gated', exec: () => emrNavigate('orders') }]); },
    // 6 · pre-op underway
    () => { addMsg('tars', `Signed — pre-op running. Heparin holds from midnight; he's first on the list.`, 'pre-op running'); agentHoldHeparin(b); emrNavigate('meds', 'emr-med-heparin-hold-from-0000-pre-op', 'Heparin'); },
    // 7 · to theatre — the last beat; → past it leaves for the OR
    () => { addMsg('tars', `Theatre's ready — team's scrubbed. <span class="em">Taking him through to the OR.</span>`, 'to theatre'); emrNavigate('summary'); },
  ] : state.chapter === 'postop' ? [
    // ── SCENE 4 · beat 0: the bedside hookup ──────────────────────────────
    // The BEDSIDE SETUP checklist lives in Panel B (this feed). Each → connects
    // one device: the row spins → ✓ with its feed line, its Panel-A vital wakes,
    // its glow marker pings on the twin, and a CONNECTED row lands in the rail.
    // Two rows are RECON — urine + drains have no sensor, so TARS asks the nurse
    // and the row waits for a bedside confirm. Panel C shows the post-op record.
    // The whole argument, in one line: same day, and nothing left behind. The
    // conventional path is cath → stent → DAPT → three days of washout → CABG,
    // and it ends with a stent buried in a grafted vessel. Holding the P2Y12
    // and taking the balloon result straight to theatre is what collapsed it.
    () => { addMsg('tars', `Back from theatre — <b>CABG ×3</b>: LIMA→LAD, SVG→OM, SVG→PDA. <span class="em">Same day, and not one stent in him.</span> Working the post-op orders — connecting him up.`, 'establishing bedside'); emrNavigate('notes'); window.dispatchEvent(new CustomEvent('hud:hookup:reset')); addBedsideCard(); },
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

    /* ── POD 3 · THE CONVERGENCE ────────────────────────────────────────────
     * Days 1 and 2 are gone. They were eight beats each of a recovery going
     * well, which is a progress report and not a scene — and the day-break card
     * does that work for free: it lifts on ten devices already removed, so
     * "three days of uneventful weaning" is a fact the room reads off Panel A
     * instead of sitting through.
     *
     * What survives is the day the recovery turns. Seven beats, and the shape is
     * a differential being closed, not a diagnosis being announced:
     *
     *   1  the fever, off the trend
     *   2  he stopped moving — and the camera saw it before anyone charted it
     *   3  not infection      (the first exclusion)
     *   4  the frightening one named out loud
     *   5  not a graft        (the second exclusion — THE HERO)
     *   6  the echo agrees, and the confidence steps up
     *   7  treatment, gated
     *
     * The governing rule, and the one that keeps beat 5 honest: NO ROW IN iSAM'S
     * CASE PANEL IS INFORMATION THE ROOM HAS NOT ALREADY BEEN SHOWN. The panel
     * assembles; it does not reveal. Every row was on a screen in beats 1-4.
     *
     * Beat 4 names graft failure FIRST and on purpose. An agent that only ever
     * announces the right answer is a magic trick; an agent that states the
     * dangerous possibility and then rules it out with evidence is doing the
     * job. The exclusion is the product.
     */
    () => { podOpen(3); addMsg('tars', `Two quiet days. <span class="em">Then this morning he spiked.</span>`, 'post-op day 3'); },
    // 1 · the fever is a TREND, not a reading. One temp is a nurse's note; the
    // second spike on a falling curve is the thing worth interrupting for.
    () => { paWindow('scope'); addMsg('tars', `Second spike in twenty-four hours. Cultures away, empiric <b>pip-tazo</b> started. <span class="em">Day three is late for a wound and early for a chest.</span>`, 'febrile'); agentStartEmpiric(bedById(state.focusId)); },
    // 2 · the camera got there first. Not "he is in pain" — a NUMBER, and the
    // number's shape is the tell: CPOT peaking on inspiration and not on
    // movement is pleuritic, and nobody had charted that yet.
    () => { paWindow('watch'); addMsg('isam', `He has stopped moving — and the pain peaks <b>on inspiration, not on transfers</b>. <span class="em">That is pleuritic, and it is on no chart yet.</span>`, 'mobility collapse'); },
    // 3 · first exclusion. The pairing is what does it: CRP high with a WCC that
    // has come DOWN is inflammation without infection.
    () => { paWindow('scope'); agentPod3Bloods(bedById(state.focusId)); openApp('lis'); addMsg('isam', `CRP climbing, white count <b>falling</b>, cultures negative at 36 hours. <span class="em">Inflammation without a source — and that antibiotic is treating nothing.</span>`, 'not infection'); },
    // 4 · name the bad one out loud, and hand the room the finding it rests on
    () => { paWindow('scope'); addMsg('isam', `Which leaves the one I have to exclude first, because it is the one that goes back to theatre: <b class="warn">early graft failure</b>. <span class="em">Pulling the twelve-lead.</span>`, 'differential'); },
    // 5 · THE HERO. Two-up on Panel C, and iSAM's case panel opens at 5 of 6 —
    // deliberately incomplete, because the echo has not come back yet.
    () => { paWindow('scope'); setPacsView('ecg2up'); openApp('pacs'); addMsg('isam', `It is not a graft. An occluded graft is <b>territorial</b>; this is everywhere. And those inferior Q waves are on his <b>day-0 twelve-lead</b>, taken before anyone touched him. <span class="em">I have held that tracing since the front door.</span>`, 'not a graft'); showCase(PERICARD_CASE, PERICARD_PROV, 'PERICARDIAL', 5); },
    // 6 · the echo lands. Confidence steps 74 → 91 in the SAME panel, which is
    // the whole reason the panel opened incomplete.
    () => { setPacsView('echo'); openApp('pacs'); addMsg('tars', `Echo back. <span class="em">No tamponade.</span>`, 'echo reported'); showCase(PERICARD_CASE, PERICARD_VERDICT, 'PERICARDIAL', 6); },
    // 7 · treatment. Named, gated, and the note publishes with it.
    () => { paWindow('twin'); addMsg('isam', `Fever, pleuritic pain that will not lie flat, diffuse ST with PR depression, a rub on the effusion, raised CRP with a normal white count, day three after a sternotomy. <span class="em">That is <b>post-cardiac injury syndrome</b> — Dressler's. It is anti-inflammatories, not antibiotics, and not the OR.</span>`, "dressler's"); window.dispatchEvent(new CustomEvent('hud:note:publish', { detail: { day: 3 } })); emrNavigate('orders'); addOrders([
      { label: podByDay(3).orders.label, items: podByDay(3).orders.items, detail: 'Pericarditis set · requires sign-off', autonomy: 'gated', exec: () => agentTreatPericarditis(bedById(state.focusId)) }]); },
    () => { paWindow('twin'); setPacsView(''); openApp('summary'); addMsg('tars', `Signed. <span class="em">He never went back to theatre.</span>`, 'pod 3 closed'); },
  ] : state.chapter === 'stepdown' ? [
    /* ── POD 6 · HOME ───────────────────────────────────────────────────────
     * Its own chapter, because the shell flies the building between POD 3 and
     * here — the transfer to Step-Down happens in the air, and the day-break card
     * doubles as the arrival title.
     *
     * Five beats, and the discipline is that this day CLOSES things rather than
     * finding them: the pericardium settled, the record assembles itself, one
     * signature files it. The one line that has to land is the counterfactual —
     * this is the admission where nobody went back to theatre and nobody spent
     * three days washing out a P2Y12 inhibitor, and both of those were agent
     * decisions taken days earlier.
     */
    () => { podOpen(6); addMsg('tars', `Step-Down since day 4. <span class="em">He is not wired to anything.</span>`, 'post-op day 6'); },
    // 1 · the callback. The repeat echo is the order signed on POD 3, closing.
    () => { paWindow('scope'); setPacsView(''); addMsg('tars', `Repeat echo — the one you signed on day 3 — is back: <b>effusion 3 mm</b>, rub gone, afebrile 72 hours, <b>EF 50%</b> up from 40 on the table. <span class="em">The pericarditis is settling on the colchicine.</span>`, 'echo repeated'); },
    // 2 · the camera closes its own arc: POD 3 was walks 3 → 0, this is stairs.
    () => { paWindow('watch'); addMsg('isam', `<span class="em">Three days ago he would not lie flat. He did a flight of stairs today.</span>`, 'movement logged'); },
    // 3 · the record assembles from notes TARS already wrote. Not a new document
    // — that is the claim, and it is why this beat is short.
    () => { addMsg('tars', `His <b>discharge summary</b> is drafted — from the notes I already wrote, so there is nothing to reconcile. <span class="em">One signature files it:</span>`, 'summary drafted'); window.dispatchEvent(new CustomEvent('hud:note:publish', { detail: { day: 6 } })); window.dispatchEvent(new CustomEvent('hud:discharge:publish')); addOrders([
      { label: podByDay(6).orders.label, items: podByDay(6).orders.items, detail: 'Discharge set · requires sign-off', autonomy: 'gated', exec: () => emrNavigate('notes') },
      { label: 'Discharge summary — sign to file', detail: 'Closes the admission record · copies to GP + cardiothoracic clinic', autonomy: 'gated', exec: () => window.dispatchEvent(new CustomEvent('hud:discharge:sign')) }]); },
    // 4 · the counterfactual. Both halves were agent calls, days apart, and this
    // is the only beat in the arc that is allowed to say so out loud.
    // The record is the last thing on screen. Panel C lands on NOTES, not the
    // summary tab: the discharge summary renders at the top of that stack, so
    // the admission closes on the document the whole arc was assembling rather
    // than on a generic overview.
    () => { paWindow('twin'); openApp('notes'); addMsg('tars', `Filed — GP and cardiothoracic clinic have it. <span class="em">Six days: door to staircase.</span> No stent, no washout for a drug he was never loaded with, and no second trip to theatre.`, 'record closed'); },
  ] : [
    // ── PRE-CATH · seven beats ────────────────────────────────────────────
    // Was ten. Three went because a line that describes what the panel is
    // already showing is not an agent working, it is an agent narrating — the
    // rule wardScript.ts sets out and this script had drifted from. Cut: the
    // "samples are away" wait (the order card says `authorised`), the closing
    // "it's all in the record" (all of it is on screen), and the split between
    // the monitor finding and the read, which were always one thought.
    //
    // What survives the cut is the tell: iSAM's lines are its REASONING, which
    // nothing on screen can show, so they stay. TARS's shrank to the ask alone,
    // because its order rows say the rest better than its sentences did.

    // 1 · the readout, not "the chart is open" — an agent that announces its own
    // UI is describing a thing the room can already see. CASE app: the whole
    // admission as headings ('history' is its section key in SECTION_APP).
    () => { addMsg('isam', `${b.patient.name}, ${b.patient.age}. Diabetic, smoker, crushing chest pain — through the door at ${b.patient.admit}.`, 'reading the record'); emrNavigate('history', 'emr-case-0', 'Chief complaint'); },
    // 2 · the monitor AND the read, in one breath.
    // iSAM does NOT walk its verdict back here — it committed this read on the
    // ER's own card, and an agent that hedges its own call on screen is a weaker
    // claim than one that stands by it and is vindicated four beats later. The
    // troponin is confirmation, not a second opinion.
    () => { addMsg('isam', `Monitor's ugly — <b>HR ${b.vitals.hr} and climbing</b>, sats ${b.vitals.spo2}, the ECG's got the whole front wall lit. My pre-hospital read stands: <b style="color:var(--redD)">anterior OMI</b>. Troponin will settle it.`, 'holding the read'); emrNavigate('vitals', 'emr-vit-hr', 'Heart rate'); },
    // 3 · TARS opens the workup: cath lab to STANDBY (auto) + gated diagnostics.
    // The line no longer says "cath lab's on standby" — the row immediately
    // beneath it says exactly that, and says it better by doing it.
    () => { addMsg('tars', `Before I escalate the lab — bloods and a repeat ECG. <span class="em">That one needs your name.</span>`, 'placing orders'); emrNavigate('orders'); addOrders([
      // the exec moves the Orders app's own row up the ladder — the screen this
      // step navigates to must not already be claiming the lab is live
      { label: 'Pre-alert cath lab — STANDBY', detail: 'Operational · not committed yet', autonomy: 'autonomous', exec: () => setCathLab('standby') },
      { label: 'STAT troponin + repeat 12-lead', items: ['STAT Troponin', 'Repeat Lactate', '12-lead ECG'], detail: 'Diagnostics · needs your sign-off', autonomy: 'gated', exec: () => { agentOrderTroponin(); emrNavigate('labs'); } }]); },
    // 4 · CRASH-PREDICT's half of the estimate.
    // The graph that opens here is a NEWS2 trajectory — five serial readings off
    // the monitor — so the line has to say where it comes from, or one lab value
    // appears to have drawn a line. The troponin is a MEASUREMENT against its
    // ceiling rather than "troponin's back, sky-high": the LIS already announced
    // its own arrival, twice, in two apps.
    // (The old "samples are away" beat sat here. The gated order's own exec does
    // the labs navigation, so nothing was lost by cutting it.)
    () => { addMsg('isam', `Troponin <b>8.4</b> against a ceiling of 0.04. And he's been climbing since he got here — <b>NEWS2 2 → 8</b> across five readings. <span class="em"><span class="mdl">CRASH-PREDICT</span> says he doesn't hold.</span>`, 'building the state estimate'); showCrash(b); emrNavigate('labs', 'emr-lab-troponin-i-stat', 'Troponin I (STAT)'); },
    // 5 · THE CHERRY — VIGIL completes the estimate.
    // The reason iSAM goes to the ECG here is not a second opinion: a
    // probability cannot say WHEN, so its own state estimate is half built.
    // What comes back is a forecast on the trace itself — de Winter is a
    // pre-infarction pattern, and VIGIL draws the elevation before it exists.
    () => { addMsg('isam', `The vitals tell me he's going. <span class="em">They don't tell me when.</span> <span class="mdl">VIGIL</span>'s had this lead since the ambulance — <span class="em"><span class="plx">PLEXUS</span> never put it down.</span> I want its forecast, not its read.`, 'completing the estimate'); showVigil(b); emrNavigate('imaging', 'emr-img-1', '12-lead ECG'); },
    // 6 · the estimate closes — both forecasts in one sentence for the first
    // time. "There it is." went: it is a reaction, and a reaction is the one
    // thing a room can read off the panel without being told.
    () => { addMsg('isam', `Overt ST elevation <b style="color:var(--redD)">inside the hour</b> — the artery finishes closing while he's lying in this bed. <b style="color:var(--redD)">${(b.traj.detProb * 100).toFixed(0)}% he crashes inside two.</b> <span class="em">Two signals, one answer.</span> <b style="color:var(--redD)">Open the artery — now.</b> <span class="em">And hold the ticagrelor.</span> Aspirin and heparin are enough to get him to the lab; if the rest of that tree turns out surgical, loading a P2Y12 now costs us three days of washout before anyone can open his chest.`, 'estimate committed'); closeState(b); emrNavigate('imaging', 'emr-img-1', '12-lead ECG'); },
    // 7 · TARS commits the pathway — ONE bundle: auto operational + gated
    // clinical, and the scene ENDS on the nurse giving the drugs. The old
    // closing beat listed back what these four rows had just done; the rows
    // are the ending, and a summary after them only softened it.
    () => { addMsg('tars', `Committing the pathway. <span class="em">Heparin only — the ticagrelor stays on the shelf.</span>`, 'activating pathway'); emrNavigate('orders'); addOrders([
      { label: 'Cath lab — ACTIVATE', detail: 'Standby → live · clock running since the door', autonomy: 'autonomous', exec: () => setCathLab('live') },
      { label: 'Page interventional cardiology', detail: 'Dr. Mensah · on call', autonomy: 'autonomous' },
      { label: 'Hold ICU bed post-PCI', detail: 'Bed management', autonomy: 'autonomous' },
      // Heparin alone. The ticagrelor is HELD, and the hold is the point: the
      // drug that protects a stent is the drug that stops you operating, so
      // giving it before the anatomy is known quietly books a three-day delay
      // nobody has agreed to. Deferring P2Y12 until the tree is seen is real
      // practice — and two scenes from now it is why he makes theatre today.
      { label: 'Heparin 5000 u IV — ticagrelor HELD', items: ['Heparin 5000 u IV'], administer: true, detail: 'Anticoagulation only · P2Y12 deferred until the anatomy is known · needs your sign-off', autonomy: 'gated', exec: () => { agentGiveMeds(b); window.dispatchEvent(new Event('hud:heparin')); emrNavigate('meds', 'emr-med-ticagrelor', 'Ticagrelor'); } }]); },
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
    // Lab dive · continued → OR dive · postop (POD 0 + POD 3 done) → the Step-Down
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
// happened, so his next → steps into POD 3 exactly as if he had walked it.
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

/** Cut straight to POD 3 — the bar's POD 3 pill.
 *
 *  seekEstablished alone lands you on POD 0 with the hookup done, which is what
 *  the deck's PLEXUS demo wants but NOT what "jump to POD 3" means: the day-break
 *  is the very next beat, so you arrive looking at POD 0's twelve-device bedside
 *  for a patient whose scene is three days later. Run that one beat too and the
 *  day-break fires, which is what moves the rail, the vitals, WATCH and the note
 *  stack to POD 3 — no separate seeding needed, the beat already does all of it.
 */
export function seekPod(day) {
  if (state.chapter !== 'postop') return;
  seekEstablished();
  if (idx !== 2 + HOOKUP.length) return;   // seek did not take — leave it alone
  if ((day | 0) !== 3) return;
  // Move the bedside FIRST. runStep waits ~480 ms on its typing beat before the
  // day-break fires, and that gap would show POD 0's twelve-device rail — the
  // exact thing the jump is meant to skip. hud listens for this; the beat's own
  // day-break then just plays over an already-correct bedside.
  window.dispatchEvent(new CustomEvent('hud:pod', { detail: { day: 3 } }));
  runStep();                               // the POD 3 day-break beat
}

/* A = approve / administer.
 *
 * Bound from BOTH entry points. This used to live inside initChat(), which only
 * the Patient Hub calls — so in the WARD, which is the one place in the whole
 * act with a real clinical gate, the key did nothing at all. Idempotent so
 * mounting both panels in a session cannot double-fire a click.
 */
let approveKeyBound = false;
function bindApproveKey() {
  if (approveKeyBound) return;
  approveKeyBound = true;
  // A = approve / administer. The gates are the one place the story stops dead
  // and waits for a human, so clearing them was the only reach for the mouse in
  // an otherwise keyboard run. Two shapes behind one key: the clinician's single
  // APPROVE, and the nurse's one-button-per-drug. A takes the first still
  // outstanding, so a rhythm on A walks the whole gate.
  //
  // Deliberately NOT wired to the decision card (.opt): choosing between PTCA
  // and CABG is a judgement with two real answers, and a key that silently
  // picks one of them is not a shortcut, it is a wrong answer waiting to happen.
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'a' && e.key !== 'A') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return; // ⌘A / ctrl-A stay select-all
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const slot = humanNotch && humanNotch.querySelector('#humanAction');
    const btn = slot && slot.querySelector('.confirm:not(:disabled), .adm:not(.done) .adm-btn:not(:disabled)');
    if (!btn) return; // no gate open — A does nothing rather than something
    e.preventDefault();
    btn.click(); // the same path the mouse takes, so handOn() and the rest still fire
  });
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
  bindApproveKey();
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
  bindApproveKey(); // the ward's gate is the only one in the act — A must work here
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
  ordBusyUntil = 0;                      // a cancelled block must not hold the next beat's gate back
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
export function wardSay(who, html, status, delay = 520, effect) {
  const land = () => { addMsg(who, html, status); if (effect && EFFECTS[effect]) EFFECTS[effect](); };
  if (flushing) { land(); return; } // catching up — no rhythm
  thinking(true, status || 'thinking…');
  const typing = addTyping();
  schedule(() => { typing.remove(); thinking(false); land(); }, delay);
}

/** A beat = a list played in sequence (one ICU step's chatter). Two kinds of
 *  entry: {who, html, status} speaks, and {orders:[...]} fires an order block.
 *  Actions belong in the second kind — a system that WRITES that it booked a
 *  bed is narrating; one that shows the row spin and tick is working. */
/* An order's side effect is named in the script as a STRING and resolved here.
   wardScript stays pure data that way — it never has to import a HUD function —
   and the wiring sits beside the panel's other side effects. Dispatched as an
   event because that is how chat.js has always reached the HUD; an import would
   be the first one between them. */
// heparin is no longer script-driven: the loading-dose order in the Hub fires
// it directly from its own exec, where the drugs are actually given
const EFFECTS = {
  flagBed8: () => window.dispatchEvent(new Event('ward:flagBed8')),
};

export function wardBeat(items) {
  flushBeat();                           // whatever is still in the air lands NOW
  let at = 0;
  for (const it of items) {
    if (it.orders) {
      const list = it.orders.map((o) => (o.effect && EFFECTS[o.effect] ? { ...o, exec: EFFECTS[o.effect] } : o));
      schedule(() => addOrders(list), at); at += 900; continue;
    }
    schedule(() => wardSay(it.who, it.html, it.status, 520, it.effect), at);
    at += 1350;
  }
}
