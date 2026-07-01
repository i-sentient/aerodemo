import { bedById } from './ontology.js';
import { state, onModeChange } from './state.js';
import { agentUpdateEMAR, agentStopPressor, agentOrderTroponin, agentGiveMeds, agentOrderRoutine, emrNavigate } from './apps.js';

let chatEl, nextBtn, hintEl, panelB, statusEl;
let steps = [], idx = 0, gated = false, ordSeq = 0, busy = false;

function scroll() { chatEl.scrollTop = chatEl.scrollHeight; }

// ambient glow responds to the live session, not a timer:
// thinking → teal; otherwise it settles to the focused patient's acuity.
function setAmbient(name) {
  if (!panelB) return;
  panelB.classList.remove('amb-think', 'amb-stable', 'amb-watch', 'amb-critical');
  if (name) panelB.classList.add(name);
}
function contextAmbient() {
  if (state.mode !== 'patient') return '';                 // floor view → calm default (blue)
  const acu = (bedById(state.focusId) || {}).patient?.acuity;
  return acu === 'critical' ? 'amb-critical' : acu === 'watch' ? 'amb-watch' : acu ? 'amb-stable' : '';
}
function thinking(on, label) {
  setAmbient(on ? 'amb-think' : contextAmbient());
  if (statusEl) statusEl.textContent = on ? (label || 'thinking…') : 'ready';
}

function addMsg(who, html) {
  const m = document.createElement('div'); m.className = 'msg ' + who;
  const label = who === 'nurse' ? 'Nurse · N. Adeyemi' : who === 'lsam' ? 'LSam · trajectory' : 'TARS';
  m.innerHTML = `<div class="who">${label}</div><div class="bub">${html}</div>`;
  chatEl.appendChild(m); scroll();
}
function addTyping() { const t = document.createElement('div'); t.className = 'msg tars typing-msg'; t.innerHTML = `<div class="bub typing"><i></i><i></i><i></i></div>`; chatEl.appendChild(t); scroll(); return t; }

function addOrders(list) {
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
  chatEl.appendChild(wrap); scroll();
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
  setTimeout(() => {
    typing.remove(); thinking(false);
    steps[idx](); idx++; busy = false; updateNext();
  }, 480);
}

function load(kind, bedId) {
  chatEl.innerHTML = ''; idx = 0; gated = false; busy = false;
  setAmbient(contextAmbient());
  steps = kind === 'patient' ? patientScript(bedById(bedId)) : floorScript();
  if (steps.length) { steps[0](); idx = 1; }
  updateNext();
}

function floorScript() {
  return [
    () => addMsg('tars', `Good morning. ICU—North is <b>7 of 7 occupied</b>. Acuity: <span class="em">4 stable</span>, <b style="color:var(--amberD)">2 watch</b>, <b style="color:var(--redD)">1 critical</b> (ICU-04, anterior STEMI).`),
    () => addMsg('nurse', `What's our real capacity if cardiology needs a Level-3 bed?`),
    () => addMsg('tars', `LSam reviewed all trajectories. <b>ICU-05</b> (A. Kristof, sepsis) is <span class="em">step-down eligible</span> — NEWS2 2, falling, lactate normalised. Stepping her down frees one Level-3 bed. Operational steps are autonomous; I'll proceed.`),
    () => { addMsg('tars', `Executing transfer logistics:`); addOrders([
      { label: 'Reserve step-down bed B-12', detail: 'Bed management · operational', autonomy: 'autonomous' },
      { label: 'Page portering for transfer', detail: 'Transport · operational', autonomy: 'autonomous' },
      { label: 'Reconcile ICU-05 orders in eMAR', detail: 'TARS writing to eMAR', autonomy: 'autonomous', exec: agentUpdateEMAR }]); },
    () => addMsg('tars', `Done — B-12 held, transport paged, and eMAR updated automatically (Workspace ›). One clinical item needs your sign-off:`),
    () => addOrders([{ label: 'Discontinue norepinephrine — ICU-05', detail: 'Clinical decision · requires sign-off', autonomy: 'gated', exec: agentStopPressor }]),
    () => addMsg('tars', `Signed off. Vasopressor discontinued, ICU-05 flagged for step-down. <span class="em">Net effect: +1 Level-3 bed.</span>`),
    () => addMsg('nurse', `Perfect. Keep watching ICU-04.`),
    () => addMsg('tars', `Always — it's the unit's highest risk. Click the red bed to open its Patient Hub and I'll walk the record with you.`),
  ];
}

function patientScript(b) {
  if (b.patient.acuity === 'critical') return [
    () => { addMsg('lsam', `Scanning <b>${b.id}</b> — ${b.patient.name}, ${b.patient.age}${b.patient.sex}. Opening the chart…`); emrNavigate('summary'); },
    () => { addMsg('lsam', `Vitals: HR ${b.vitals.hr}, BP ${b.vitals.sys}/${b.vitals.dia}, SpO₂ ${b.vitals.spo2}. Tachycardic and hypotensive.`); emrNavigate('vitals', 'emr-vit-hr', 'Heart rate'); },
    () => { addMsg('lsam', `<b>Anterior ST-elevation</b> on 12-lead, troponin trend rising. Deterioration probability <b style="color:var(--redD)">${(b.traj.detProb * 100).toFixed(0)}%</b>. Verdict: <b style="color:var(--redD)">STEMI — CRITICAL.</b>`); emrNavigate('labs', 'emr-lab-troponin', 'Troponin I'); },
    () => { addMsg('tars', `Activating STEMI pathway. Operational actions fire autonomously:`); emrNavigate('orders'); addOrders([
      { label: 'Notify cath lab — activate', detail: 'Operational · door-to-balloon clock started', autonomy: 'autonomous' },
      { label: 'Page interventional cardiology', detail: 'Dr. Mensah · on call · operational', autonomy: 'autonomous' },
      { label: 'Hold ICU bed post-PCI', detail: 'Bed management · operational', autonomy: 'autonomous' }]); },
    () => { addMsg('tars', `Clinical orders need your confirmation:`); addOrders([
      { label: 'STAT troponin + repeat 12-lead', detail: 'Lab + diagnostics · requires sign-off', autonomy: 'gated', exec: () => { agentOrderTroponin(); emrNavigate('labs', 'emr-lab-troponin', 'Troponin I'); } }]); },
    () => { addMsg('tars', `Order placed — result returning live. Logging to the trajectory note.`); emrNavigate('notes', 'emr-note-1', 'LSam note'); },
    () => { addMsg('tars', `Aspirin given. <b>Ticagrelor 180 mg</b> + <b>heparin</b> are due — confirm administration?`); emrNavigate('meds', 'emr-med-ticagrelor', 'Ticagrelor'); addOrders([
      { label: 'Give ticagrelor 180 mg + heparin 5000u', detail: 'Antiplatelet/anticoag · requires sign-off', autonomy: 'gated', exec: () => { agentGiveMeds(b); emrNavigate('meds', 'emr-med-ticagrelor', 'Ticagrelor'); } }]); },
    () => { addMsg('tars', `Documented in the EMR. Cath lab confirmed ready. <span class="em">Pathway active — clock running.</span>`); emrNavigate('summary'); },
  ];
  return [
    () => { addMsg('lsam', `Scanning <b>${b.id}</b> — ${b.patient.name}. ${b.patient.dx}. Opening the chart…`); emrNavigate('summary'); },
    () => { addMsg('lsam', `NEWS2 <b>${b.traj.news2}</b>, trend <b>${b.traj.trend}</b>. Verdict: <b class="em">${b.traj.verdict}</b>.`); emrNavigate('vitals', 'emr-vit-news2', 'NEWS2'); },
    () => { addMsg('tars', `${b.patient.acuity === 'watch' ? 'Keeping this one under closer watch. ' : 'Trajectory looks reassuring. '}Reviewing the latest labs.`); emrNavigate('labs'); },
    () => { addMsg('tars', `Routine labs can be re-checked — place a repeat panel?`); addOrders([
      { label: 'Order repeat bloods (FBC, U&E, CRP)', detail: 'Lab · requires sign-off', autonomy: 'gated', exec: () => { agentOrderRoutine(b); emrNavigate('labs'); } }]); },
    () => { addMsg('tars', `Ordered. I'll surface results here and flag any trajectory shift.`); emrNavigate('summary'); },
  ];
}

export function initChat() {
  chatEl = document.getElementById('chat');
  nextBtn = document.getElementById('nextBtn');
  hintEl = document.getElementById('chatHint');
  panelB = document.getElementById('panelB');
  statusEl = document.getElementById('tarsStatus');
  nextBtn.onclick = () => {
    if (gated || busy) return;
    if (idx >= steps.length) { load(state.mode, state.focusId); return; }
    runStep();
  };
  onModeChange((mode, focusId) => load(mode, focusId));
}
