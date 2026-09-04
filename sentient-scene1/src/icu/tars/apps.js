import { beds, bedById, inventory, clinicians, ward } from './ontology.js';
import { state, isPostopWorld, onModeChange, setMode } from './state.js';
import { DISCHARGE, POD0, POD0_ORDERS, PODS, WATCH, podByDay } from './postop.js';
import { ecgAt } from '../ontology/ecg';

const APPMETA = {
  emr: { nm: 'EMR', icon: '🗂️', tint: '#6aa6ff', sub: 'Electronic record' },
  emar: { nm: 'eMAR', icon: '💊', tint: '#5dcaa5', sub: 'Med admin' },
  inventory: { nm: 'Inventory', icon: '📦', tint: '#f5a623', sub: 'Stock control' },
  staffing: { nm: 'Staffing', icon: '👥', tint: '#7a9cf0', sub: 'Shift board' },
  protocols: { nm: 'Protocols', icon: '📋', tint: '#9aa6b3', sub: 'Care pathways' },
  lis: { nm: 'LIS', icon: '🧪', tint: '#7a5cd0', sub: 'Lab orders' },
  pacs: { nm: 'PACS', icon: '🩻', tint: '#4aa3c7', sub: 'Imaging' },
  summary: { nm: 'Summary', icon: '🧾', tint: '#6aa6ff', sub: 'Overview' },
  vitals: { nm: 'Vitals', icon: '📈', tint: '#5dcaa5', sub: 'Monitoring' },
  referrals: { nm: 'Referrals', icon: '📨', tint: '#f5a623', sub: 'Referrals · OR · cath' },
  notes: { nm: 'Notes', icon: '📝', tint: '#9aa6b3', sub: 'Clinical notes' },
  case: { nm: 'Case', icon: '📁', tint: '#7a9cf0', sub: 'Case history' },
};
// Floor state leads with the full sectioned EMR (like the ward's Panel C), with
// the workspace apps still reachable in the dock. Patient state = clinical apps.
const FLOOR_EMR_FOCUS = 'ICU-08'; // default patient the floor EMR opens on (the new OMI admission)
const dockApps = () => (state.mode === 'patient'
  ? ['summary', 'vitals', 'lis', 'emar', 'referrals', 'pacs', 'notes', 'case'] // clinical systems (no EMR container)
  : ['staffing', 'inventory', 'protocols']); // ward/floor operational apps
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// lisOrdered: false | 'ordered' | 'resulted' — three states, because the LIS
// button has to be able to say "in the lab" between the two.
let activeApp = null, emarAgentFlag = false, emarExtra = [], lisOrdered = false;
let lastFocus = null;

// Where the cath lab is on its ladder — pre-alerted from the ER, put on standby
// with the workup, activated once the troponin is back. The Orders app used to
// hardcode "Cath lab activation · executing · DONE", so step 4 navigated to a
// screen claiming the lab was already live while TARS was in the middle of
// saying "cath lab's on standby — before I escalate it". chat.js's two order
// rows drive this now (setCathLab).
const CATH = { prealert: ['Cath lab — pre-alerted', 'pre-alert'], standby: ['Cath lab — standby', 'standby'], live: ['Cath lab — ACTIVATED', 'live'] };
let cathState = 'prealert';
/* Which study the imaging viewer is showing. The chapter picks the default, but
 * POD 3 walks through two studies in one scene, so the beats set it explicitly.
 * '' = whatever the chapter implies. */
let pacsView = '';
export function setPacsView(v) { pacsView = v || ''; if (activeApp === 'pacs') openApp('pacs'); }
export function setCathLab(s) { cathState = s; refreshEMR(); }
const view = () => document.getElementById('appView');
const dockEl = () => document.getElementById('dock');

export function initApps() {
  // The record travels with the patient: arriving in Step-Down (POD 6), the
  // three ICU progress notes are already written — the stack must not restart.
  if (state.chapter === 'stepdown') notedDay = 3;
  onModeChange((mode) => {
    lisOrdered = false; lastFocus = null;
    // pre-cath starts the lab on its first rung; post-cath it is long since live
    cathState = (state.chapter === 'workup' || state.chapter === 'er') ? 'prealert' : 'live';
    if (mode === 'floor') { emarAgentFlag = false; emarExtra = []; }
    // patient identification banner → the full-width top bar (patient mode);
    // the ward label sits there in floor mode
    const info = document.getElementById('topInfo');
    if (info) {
      info.innerHTML = mode === 'patient'
        ? patientHeaderHTML(bedById(state.focusId) || bedById(FLOOR_EMR_FOCUS))
        : `<span class="ward">${ward.name} · ${ward.bed_count} ${state.chapter === 'er' ? 'bays' : 'beds'}</span>`;
      const wb = document.getElementById('wardBack'); // ward button → back to floor
      if (wb) wb.onclick = () => setMode('floor');
    }
    buildDock(); openApp(mode === 'patient' && state.chapter === 'continued' ? 'pacs' : dockApps()[0]); // continued chapter opens on PACS (imaging)
  });
  // live vitals inside EMR without re-rendering (keeps the agent focus intact) —
  // ticks whenever the EMR is open, floor or patient
  setInterval(() => {
    if (activeApp !== 'emr') return;
    const b = bedById(state.focusId) || bedById(FLOOR_EMR_FOCUS); if (!b) return;
    view().querySelectorAll('[data-vit]').forEach((el) => {
      const k = el.dataset.vit;
      el.textContent = k === 'bp' ? b.vitals.sys + '/' + b.vitals.dia : k === 'temp' ? b.vitals.temp.toFixed(1) : b.vitals[k];
    });
  }, 1000);

}

function buildDock() {
  const d = dockEl(); d.innerHTML = '';
  dockApps().forEach((k) => {
    const m = APPMETA[k];
    const el = document.createElement('div'); el.className = 'ico'; el.dataset.app = k;
    el.style.background = `linear-gradient(150deg,${m.tint}33,${m.tint}14)`;
    el.innerHTML = `<span>${m.icon}</span><span class="nm">${m.nm}</span>`;
    el.onclick = () => openApp(k);
    d.appendChild(el);
  });
}

export function openApp(k) {
  activeApp = k;
  [...dockEl().querySelectorAll('.ico')].forEach((e) => e.classList.toggle('active', e.dataset.app === k));
  view().innerHTML = renderApp(k);
  if (k === 'lis') { const b = document.getElementById('lisOrderBtn'); if (b) b.onclick = placeLisOrder; }
  if (k === 'case') { view().querySelectorAll('.case-item .case-k').forEach((el) => (el.onclick = () => el.parentElement.classList.toggle('open'))); }
  // restore a pending agent field-focus if it lives in the app we just opened
  if (lastFocus && lastFocus.app === k) requestAnimationFrame(() => focusField(lastFocus.field, lastFocus.label, false, lastFocus.agent));
}
export function pingDock(k) { const el = dockEl().querySelector(`.ico[data-app="${k}"]`); if (el) { el.classList.remove('pinged'); void el.offsetWidth; el.classList.add('pinged'); } }

function renderApp(k) {
  return ({ summary: renderSummary, vitals: renderVitals, lis: renderLIS, emar: renderEMAR, referrals: renderReferrals, pacs: renderPACS, notes: renderNotes, case: renderCase, inventory: renderInventory, staffing: renderStaffing, protocols: renderProtocols }[k] || (() => ''))();
}

// ============================================================ EMR (full, sectioned)
const SECTIONS = [
  ['summary', '🧾', 'Summary'], ['vitals', '📈', 'Vitals'], ['labs', '🧪', 'Labs'], ['meds', '💊', 'Meds'],
  ['orders', '📋', 'Orders'], ['notes', '📝', 'Notes'], ['imaging', '🩻', 'Imaging'], ['history', '🕑', 'History'],
];
const emrBed = () => bedById(state.focusId) || bedById(FLOOR_EMR_FOCUS);
// attending doctor + nurse (the clinician objects) for a bed, from assignments
function attendingsFor(bedId) {
  const care = clinicians.filter((c) => (c.assigned || []).includes(bedId));
  return { nurse: care.find((c) => c.role === 'nurse'), doctor: care.find((c) => c.role !== 'nurse') };
}
const avIni = (name) => name.replace(/^Dr\.?\s*/i, '').split(/\s+/).map((w) => w[0] || '').join('').slice(0, 2).toUpperCase();
const capRole = (r) => (r ? r.charAt(0).toUpperCase() + r.slice(1) : '');
// patient IDENTIFICATION bar (full-width top strip, patient mode): ward button
// (click → floor) · patient · care team.
function patientHeaderHTML(b) {
  if (!b) return '<span class="ward">Clinical apps</span>';
  const bedNo = b.id.split('-')[1] || b.id;
  const { doctor, nurse } = attendingsFor(b.id);
  const chevron = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
  const care = [
    doctor ? `<div class="idc"><span class="idc-k">Attending</span><span class="idc-v">${doctor.name}</span></div>` : '',
    nurse ? `<div class="idc"><span class="idc-k">Nurse</span><span class="idc-v">${nurse.name}</span></div>` : '',
  ].join('');
  return `<div class="idbar">
    <div class="idp">
      <div class="idp-av"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.6"/><path d="M5.5 20c0-3.6 3-5.5 6.5-5.5s6.5 1.9 6.5 5.5"/></svg></div>
      <div class="idp-txt">
        <div class="idp-nm">${b.patient.name}<span class="idp-acu ${b.patient.acuity}">${b.patient.acuity}</span></div>
        <div class="idp-sub">Bed ${bedNo} · ${b.patient.mrn}</div>
      </div>
    </div>
    <button class="wardbtn" id="wardBack" title="Back to the ICU floor">${chevron}<span>ICU — North</span></button>
    <div class="idbar-spring"></div>
    ${isPostopWorld() ? podSpineHTML(currentNotedDay) : ''}
    <div class="idbar-spring"></div>
    <div class="idcare">${care}</div>
  </div>`;
}

// The case spine. Recovery is a three-stop arc — day 0, day 3, day 6 — and every
// panel shows only a slice of it, so the top bar carries the whole thing: which
// day we're on, which are behind us, and what today is about. Without it you
// can't tell where in the story you are.
let currentNotedDay = 0;
function podSpineHTML(day) {
  const p = podByDay(day);
  // past/now compare the DAY, not the array position. While the days were
  // 0,1,2,3,4 those were the same number; at 0,3,6 an index test marks every dot
  // "past" and never lights the one you are standing on.
  return `<div class="podspine" id="podSpine">
    <span class="ps-k">POST-OP</span>
    <div class="ps-dots">${PODS.map((x) => `<i class="${x.pod < p.pod ? 'past' : x.pod === p.pod ? 'now' : ''}">${x.pod}</i>`).join('')}</div>
    <span class="ps-t">${p.title}</span>
  </div>`;
}
window.addEventListener('hud:pod:changed', (e) => {
  currentNotedDay = (e.detail || {}).day | 0;
  const el = document.getElementById('podSpine');
  if (el) el.outerHTML = podSpineHTML(currentNotedDay);
});
// each clinical system is now its own dock app (no EMR container). Summary /
// Vitals / Notes reuse the section bodies so the story's agent-focus field ids
// (emr-vit-*, emr-lab-*, emr-med-*, …) are preserved. Labs live in LIS, Meds in
// e-MAR, Imaging in PACS, Orders split into Referrals, History into Case.
function renderSummary() { const b = emrBed(); return b ? shell('summary', `<div class="emr-body">${emrSectionBody('summary', b)}</div>`) : ''; }
function renderVitals()  { const b = emrBed(); return b ? shell('vitals',  `<div class="emr-body">${emrSectionBody('vitals', b)}</div>`)  : ''; }
function renderNotes()   {
  const b = emrBed(); if (!b) return '';
  if (!isPostopWorld()) return shell('notes', `<div class="emr-body">${emrSectionBody('notes', b)}</div>`);
  // newest on top — the discharge summary (once drafted) caps the record, then
  // the days count down into the operation note
  let out = '';
  // walk the days that EXIST, newest first — counting down integers only worked
  // while the days were contiguous; with 0, 3, 6 it spends most of its iterations
  // asking for notes that were never written. POD 0 is excluded because its note
  // is the operation note below, not a progress note.
  PODS.filter((p) => p.pod > 0 && p.pod <= notedDay).sort((x, y) => y.pod - x.pod)
    .forEach((p) => { out += progressNoteHTML(b, p.pod); });
  return shell('notes', `<div class="emr-body">${dischargeHTML(b)}${out}${postopNoteHTML(b)}</div>`);
}

// Scene 4 · the daily PROGRESS NOTE. Its mobility paragraph is quoted straight
// out of WATCH — the camera's movement log becomes the written record, which is
// then what the clinician assesses and turns into the next day's orders.
// A day's note is published when TARS DRAFTS it — at the end of that day, not
// when the day starts. Otherwise the day-break card lands and Panel C instantly
// spoils everything that hasn't happened yet ("extubated 11:20").
let notedDay = 0;
window.addEventListener('hud:note:publish', (e) => {
  notedDay = Math.max(notedDay, (e.detail || {}).day | 0);
  if (isPostopWorld()) emrNavigate('notes');
});
window.addEventListener('hud:hookup:reset', () => { notedDay = 0; dischargeState = 0; });

// The discharge summary — drafted (state 1) by TARS at the end of POD 6, then
// SIGNED (state 2) by the clinician, which files it and closes the record.
let dischargeState = 0;
window.addEventListener('hud:discharge:publish', () => { dischargeState = Math.max(dischargeState, 1); if (isPostopWorld()) emrNavigate('notes'); });
window.addEventListener('hud:discharge:sign', () => { dischargeState = 2; if (isPostopWorld()) emrNavigate('notes'); });
function dischargeHTML(b) {
  if (!dischargeState) return '';
  const p = b.patient;
  const signed = dischargeState === 2;
  const course = DISCHARGE.course.map(([h, t]) => `<div class="pn-r"><span>${h}</span><div>${t}</div></div>`).join('');
  const meds = DISCHARGE.meds.map(([k, v]) => `<div class="pn-o"><span class="pn-ok">${k}</span><span class="pn-ov">${v}</span></div>`).join('');
  const fup = DISCHARGE.followup.map(([k, v]) => `<div class="pn-o"><span class="pn-ok">${k}</span><span class="pn-ov">${v}</span></div>`).join('');
  return `<div class="pnote dsum">
    <div class="pn-hd"><b>DISCHARGE SUMMARY · Cardiac Surgery</b><span class="ds-tag ${signed ? 'signed' : 'draft'}">${signed ? 'SIGNED · FILED' : 'DRAFT'}</span></div>
    <div class="pn-id">${p.name} · ${b.id} · ${p.age} ${p.sex || 'M'} &nbsp;·&nbsp; admitted day 0 · discharged POD 6 (planned) &nbsp;·&nbsp; drafted by <b>TARS</b> from the admission record</div>
    <div class="pn-sh">DIAGNOSIS</div><div class="pn-p">${DISCHARGE.dx}</div>
    <div class="pn-sh">PROCEDURE</div><div class="pn-p">${DISCHARGE.proc}</div>
    <div class="pn-sh">HOSPITAL COURSE</div>${course}
    <div class="pn-sh">PRE-DISCHARGE ECHO</div><div class="pn-p">${DISCHARGE.echo}</div>
    <div class="pn-sh">DISCHARGE MEDICATIONS</div><div class="pn-orders">${meds}</div>
    <div class="pn-sh">FOLLOW-UP</div><div class="pn-orders">${fup}</div>
    <div class="pn-sh">FUNCTION AT DISCHARGE</div><div class="pn-p">${DISCHARGE.functional}</div>
    ${signed ? `<div class="ds-sig">Signed · Dr. Rao — copies filed to GP + cardiothoracic clinic</div>` : ''}
  </div>`;
}
function progressNoteHTML(b, day) {
  const p = PODS.find((x) => x.pod === (day | 0)); if (!p || !p.note) return '';
  const w = WATCH.days.find((x) => x.pod === (day | 0)); // by POD, not by index — the days are 0, 3, 6
  const rows = p.note.map(([h, t]) => `<div class="pn-r"><span>${h}</span><div>${t}</div></div>`).join('');
  const mob = w ? `<div class="pn-r"><span>Mobility</span><div>${w.note} <i class="pn-src">— from WATCH · ${w.log.length} camera-logged events</i></div></div>` : '';
  const plan = p.orders ? `<div class="pn-sh">PLAN</div><ul class="pn-ul">${p.orders.items.map((x) => `<li>${x}</li>`).join('')}</ul>` : '';
  return `<div class="pnote">
    <div class="pn-hd"><b>PROGRESS NOTE · ${p.title}</b><span>POD ${p.pod}</span></div>
    <div class="pn-id">${b.patient.name} · ${b.id} &nbsp;·&nbsp; post-op day ${p.pod} &nbsp;·&nbsp; drafted by <b>TARS</b> from bedside + WATCH</div>
    <div class="pn-sh">PROGRESS</div>${rows}${mob}${plan}
  </div>`;
}

// Scene 4 · the CABG post-operative note (Panel C) — the pure RECORD. The live
// device hookup happens in Panel B now; the note just documents the operation,
// findings and plan. Settings quoted from POD0 → same numbers as the checklist.
function postopNoteHTML(b) {
  const p = b.patient, v = POD0;
  return `<div class="pnote">
    <div class="pn-hd"><b>POST-OPERATIVE NOTE · Cardiac Surgery</b><span>POD 0</span></div>
    <div class="pn-id">${p.name} · ${b.id} · ${p.age} ${p.sex || 'M'} &nbsp;·&nbsp; POD 0, hour 1 &nbsp;·&nbsp; documented by <b>TARS · Clinical Information System</b></div>

    <div class="pn-sh">PROCEDURE</div>
    <div class="pn-p"><b>CABG ×3 (on-pump)</b>, median sternotomy — LIMA → LAD · SVG → OM · SVG → PDA. <b>Same-day surgery</b>: culprit LAD reperfused by balloon angioplasty alone at cath, no stent deployed and no P2Y12 loaded, so no antiplatelet washout was required. CPB 88 min · cross-clamp 62 min · cold blood cardioplegia. Weaned off bypass on noradrenaline + dobutamine. Epicardial pacing wires (atrial + ventricular). Mediastinal + left pleural drains. Sternum wired, chest closed. Surgeon S. Iyer · Anaesthetist A. Menon · EBL ~450 mL.</div>

    <div class="pn-sh">INTRA-OP FINDINGS</div>
    <div class="pn-p">All three grafts patent, good flows; no intracoronary hardware. TOE: preserved biventricular function, LVEF ~40%, no new RWMA, trivial MR, well de-aired.</div>

    <div class="pn-sh">ON ARRIVAL · ICU</div>
    <div class="pn-p">Ventilated (${v.vent.mode}), sedated. Sinus rhythm, paced backup. MAP ${v.map} on inotropes. Rewarming from bypass. Lines &amp; devices being established per orders — see bedside checklist.</div>

    <div class="pn-sh">POST-OP ORDERS &amp; PLAN</div>
    <div class="pn-orders">${POD0_ORDERS.map(([k, val]) => `<div class="pn-o"><span class="pn-ok">${k}</span><span class="pn-ov">${val}</span></div>`).join('')}</div>

    <div class="pn-sh">ANTICIPATED COURSE</div>
    <div class="pn-p">Extubate POD 1 · drains and lines out by POD 2 · step-down POD 4 · discharge POD 6.</div>
  </div>`;
}
// Orders split by system: Referrals keeps the referral/OR/cath-lab items only
// (the troponin order lives in LIS, the drugs in e-MAR).
function renderReferrals() {
  const b = emrBed(); if (!b) return '';
  const rows = referralsFor(b).map((o, i) => `<tr id="emr-ref-${i}"><td><b>${o.label}</b></td><td class="dim">${o.detail}</td><td class="${o.done ? 's-done' : 's-due'}">${(o.done ? 'done' : o.status).toUpperCase()}</td></tr>`).join('');
  return shell('referrals', `<div class="emr-body"><table class="tbl"><thead><tr><th>Referral</th><th>Detail</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>`);
}
function referralsFor(b) {
  if (b.patient.acuity === 'critical') return [
    { label: 'Cath lab activation', detail: 'Interventional cardiology · door-to-balloon clock', status: 'executing', done: true },
    { label: 'Cardiology referral — Dr. Mensah', detail: 'On-call · paged', status: 'accepted', done: true },
    { label: 'ICU bed hold — post-PCI', detail: 'Bed management', status: 'held', done: true },
  ];
  return [{ label: 'No active referrals', detail: '—', status: 'none', done: false }];
}
// Case history: nine collapsed one-liners; click a heading to expand (see openApp).
function renderCase() {
  const b = emrBed(); if (!b) return '';
  const p = b.patient, v = b.vitals, t = b.traj, crit = p.acuity === 'critical';
  const items = [
    ['Chief complaint (CC)', `"${p.chief}"${crit ? ' — sudden, severe' : ''}`],
    ['History of presenting illness (HPI)', crit ? `${p.chief}: abrupt onset, ongoing at presentation, radiating, not relieved by rest.` : `${p.chief}: gradual onset, stable.`],
    ['Past medical & surgical (PMH)', p.comorbid.length ? p.comorbid.join(' · ') : 'Nil significant'],
    ['Family history', 'Not contributory — to be completed.'],
    ['Social / personal', `${p.comorbid.includes('Smoker') ? 'Current smoker. ' : ''}Occupation / lifestyle — to be completed.`],
    ['Review of systems (ROS)', crit ? 'CVS: chest pain, diaphoresis. Resp: mild dyspnoea. Other systems unremarkable.' : 'Largely unremarkable.'],
    ['Objective examination', `HR ${v.hr} · BP ${v.sys}/${v.dia} · SpO₂ ${v.spo2}% · RR ${v.rr} · Temp ${v.temp.toFixed(1)}°C · NEWS2 ${t.news2}`],
    // keyed off `cardiac`, not `crit` — the ward's other critical patient is in
    // septic shock, and this line was giving him an anterior infarct
    ['Investigations', b.cardiac ? '12-lead ECG: anterior de Winter pattern (V2–V4) — hyperacute T waves on upsloping ST depression, no ST elevation in any territory. STAT troponin + repeat lactate ordered (see LIS).' : crit ? 'Bloods, cultures and lactate sent. Serial observation.' : 'Routine bloods, monitoring.'],
    ['Assessment & diagnosis (Dx)', `${p.dx} — ${t.verdict}.`],
  ];
  // Each item carries an id so emrNavigate can put an agent's caret on one line,
  // and the chief complaint starts OPEN — nine collapsed headings is the right
  // image for "his chart's up", but the room needs one line it can actually read.
  const rows = items.map(([k, val], i) => `<div class="case-item${i === 0 ? ' open' : ''}" id="emr-case-${i}" data-i="${i}"><div class="case-k">${k}<span class="case-cx">＋</span></div><div class="case-v">${val}</div></div>`).join('');
  return shell('case', `<div class="emr-body case">${rows}</div>`);
}

function emrSectionBody(sec, b) {
  const p = b.patient, v = b.vitals, t = b.traj;
  const acuCol = p.acuity === 'critical' ? 'var(--redD)' : p.acuity === 'watch' ? 'var(--amberD)' : 'var(--tealD)';
  if (sec === 'summary') return `
    <div class="fgrid">
      <div class="fld" id="emr-dx"><div class="k">Primary diagnosis</div><div class="val">${p.dx}</div></div>
      <div class="fld" id="emr-acuity"><div class="k">Acuity</div><div class="val" style="color:${acuCol};font-weight:800;text-transform:capitalize">${p.acuity}</div></div>
      <div class="fld" id="emr-chief"><div class="k">Chief complaint</div><div class="val">${p.chief}</div></div>
      <div class="fld" id="emr-code"><div class="k">Code status</div><div class="val">Full code</div></div>
      <div class="fld" id="emr-allergy"><div class="k">Allergies</div><div class="val">NKDA</div></div>
      <div class="fld" id="emr-admit"><div class="k">Admitted</div><div class="val">${p.admit}</div></div>
    </div>
    <div class="sec-h">Problem list</div>
    <ul class="plist"><li>${p.dx}</li>${p.comorbid.map((c) => `<li>${c}</li>`).join('')}</ul>`;
  if (sec === 'vitals') return `
    <div class="vgrid">
      ${vfield('hr', 'Heart rate', v.hr, 'bpm')}${vfield('bp', 'Blood pressure', v.sys + '/' + v.dia, 'mmHg')}
      ${vfield('spo2', 'SpO₂', v.spo2, '%')}${vfield('rr', 'Resp rate', v.rr, '/min')}
      ${vfield('temp', 'Temp', v.temp.toFixed(1), '°C')}
      <div class="fld big" id="emr-vit-news2"><div class="k">NEWS2 aggregate</div><div class="val" style="color:${acuCol}">${t.news2}</div></div>
    </div>`;
  if (sec === 'labs') return tableSec(['Test', 'Value', 'Reference', 'Status'],
    b.labs.map((l) => `<tr id="emr-lab-${slug(l.test)}" class="${l._flash ? 'flashG' : ''}"><td><b>${l.test}</b></td><td class="mono ${l.flag === 'high' ? 's-low' : ''}">${l.value}${l.flag === 'high' ? ' ▲' : ''}</td><td class="mono dim">${l.ref}</td><td>${l.status === 'ordered' ? '<span class="pillbadge b-flag">PENDING</span>' : '<span class="pillbadge b-ok">RESULTED</span>'}</td></tr>`).join(''));
  if (sec === 'meds') return tableSec(['Drug', 'Dose', 'Route', 'Sched', 'Status'],
    b.meds.map((m) => `<tr id="emr-med-${slug(m.drug)}" class="${m._flash ? 'flashG' : ''}"><td><b>${m.drug}</b></td><td>${m.dose}</td><td>${m.route}</td><td>${m.schedule}</td><td class="${m.status === 'given' ? 's-given' : m.status === 'done' ? 's-done' : m.status === 'held' ? 's-held' : 's-due'}">${m.status.toUpperCase()}</td></tr>`).join(''));
  if (sec === 'orders') { const ords = ordersFor(b); return tableSec(['Order', 'Type', 'Autonomy', 'Status'],
    ords.map((o, i) => `<tr id="emr-ord-${i}"><td><b>${o.label}</b></td><td>${o.type}</td><td><span class="pillbadge ${o.auto ? 'b-auto' : 'b-flag'}">${o.auto ? 'AUTONOMOUS' : 'GATED'}</span></td><td class="${o.done ? 's-done' : 's-due'}">${(o.done ? 'done' : o.status).toUpperCase()}</td></tr>`).join('')); }
  if (sec === 'notes') return `
    ${state.chapter === 'continued' ? `<div class="note" id="emr-note-rad"><div class="nh"><b>Radiology · Dr. S. Varma</b><span>reported · just now</span></div><p><b>Coronary angiography, post-PCI.</b> Culprit proximal LAD reperfused by balloon angioplasty; TIMI 3 flow restored, no stent deployed. Residual disease: left circumflex 75% at a large obtuse marginal, right coronary 60% mid-vessel. LV gram shows anterior hypokinesis, EF ~40%. <span class="em">Concordant with the automated read. Three territories for revascularisation — surgical opinion advised.</span></p></div>` : ''}
    <div class="note" id="emr-note-1"><div class="nh"><b>iSAM · trajectory</b><span>auto · just now</span></div><p>${t.verdict}. NEWS2 ${t.news2}, ${t.trend}. Deterioration probability ${(t.detProb * 100).toFixed(0)}%. ${p.acuity === 'critical' ? 'Reperfusion pathway recommended.' : 'Continue current management.'}</p></div>
    <div class="note" id="emr-note-2"><div class="nh"><b>Nursing · N. Adeyemi</b><span>07:40</span></div><p>${p.chief}. Patient ${p.acuity === 'critical' ? 'in distress, escalated to intensivist.' : 'comfortable, observations stable.'}</p></div>`;
  if (sec === 'imaging') return `
    <!-- chat.js's verdict beat navigates straight here (emrNavigate('imaging',
         'emr-img-1')), so this string is on screen the moment iSAM commits the
         read — it cannot be the one thing still saying ST-elevation. -->
    <div class="fld" id="emr-img-1"><div class="k">12-lead ECG</div><div class="val">${b.cardiac ? 'Anterior de Winter pattern (V2–V4)' : 'Sinus rhythm'} · <a class="lnk">open in PACS ›</a></div></div>
    <div class="fld" id="emr-img-2"><div class="k">Chest X-ray</div><div class="val">${b.id === 'ICU-06' ? 'RLL consolidation' : 'No acute findings'} · <a class="lnk">open in PACS ›</a></div></div>`;
  if (sec === 'history') return `
    <div class="sec-h">Past medical history</div><ul class="plist">${p.comorbid.length ? p.comorbid.map((c) => `<li>${c}</li>`).join('') : '<li>Nil significant</li>'}</ul>
    <div class="sec-h">Admission</div><div class="fld" id="emr-hist-adm"><div class="k">This admission</div><div class="val">${p.chief} — ${p.dx} · admitted ${p.admit}</div></div>`;
  return '';
}
function vfield(k, label, val, unit) { return `<div class="fld" id="emr-vit-${k}"><div class="k">${label}</div><div class="val"><b data-vit="${k}">${val}</b> <i>${unit}</i></div></div>`; }
function tableSec(head, rows) { return `<table class="tbl emr-tbl"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`; }
function ordersFor(b) {
  // Every row reads real state now. All four used to be hardcoded literals, so
  // the screen was fixed in time while the story moved: the lab read DONE
  // before it was activated, and the troponin stayed "proposed" long after the
  // result was sitting in the LIS two apps away.
  if (b.patient.acuity === 'critical') return [
    { label: CATH[cathState][0], type: 'operational', auto: true, status: CATH[cathState][1], done: cathState === 'live' },
    { label: 'Cardiology referral', type: 'operational', auto: true, status: 'done', done: true },
    { label: 'STAT troponin + repeat lactate', type: 'clinical', auto: false, status: lisOrdered === 'resulted' ? 'resulted' : lisOrdered ? 'in the lab' : 'proposed', done: lisOrdered === 'resulted' },
    { label: 'Ticagrelor + heparin', type: 'clinical', auto: false, status: b.meds.some((m) => /ticagrelor|heparin/i.test(m.drug) && m.status === 'given') ? 'given' : 'proposed', done: b.meds.some((m) => /ticagrelor|heparin/i.test(m.drug) && m.status === 'given') }];
  return [{ label: 'Routine bloods', type: 'clinical', auto: false, status: 'proposed' }, { label: 'Continue monitoring', type: 'operational', auto: true, status: 'done', done: true }];
}

// ---- agentic navigation (TARS drives the EMR like an IDE) ----
// the story still calls emrNavigate('labs'/'imaging'/'meds'/…); map each old EMR
// section to its new dock app, open it, flash its dock icon, and focus the field.
const SECTION_APP = { summary: 'summary', vitals: 'vitals', labs: 'lis', meds: 'emar', orders: 'referrals', imaging: 'pacs', notes: 'notes', history: 'case' };
export function emrNavigate(section, fieldId = null, label = null) {
  if (state.mode !== 'patient') return;
  const app = SECTION_APP[section] || 'summary';
  openApp(app);
  pingDock(app); // flash the dock icon TARS is navigating to
  requestAnimationFrame(() => focusField(fieldId, label, true));
}
// which agent's flag pins to a field the agent is driving — matches the speaker
const AGENT_LABEL = { isam: 'iSAM', tars: 'TARS' };
function focusField(fieldId, label, scroll, agent = null) {
  const v = view();
  v.querySelectorAll('.agent-focus').forEach((e) => e.classList.remove('agent-focus'));
  v.querySelectorAll('.agent-caret').forEach((e) => e.remove());
  // capture the speaker at focus time so re-renders keep the same label
  const who = agent || state.speaker || 'tars';
  lastFocus = fieldId ? { app: activeApp, field: fieldId, label, agent: who } : null;
  if (!fieldId) return;
  const el = v.querySelector('#' + fieldId); if (!el) return;
  if (scroll) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.classList.add('agent-focus');
  const caret = document.createElement('span'); caret.className = 'agent-caret'; caret.innerHTML = '◈ ' + (AGENT_LABEL[who] || 'TARS');
  const host = el.tagName === 'TR' ? (el.querySelector('td') || el) : el; // span can't live directly in <tr>
  host.appendChild(caret);
  const crumb = document.getElementById('emrCrumb');
  if (crumb && label) { const sp = crumb.querySelector('span'); sp.innerHTML = sp.textContent.split(' ▸ ')[0] + ' ▸ <em>' + label + '</em>'; }
}
function refreshEMR() { if (state.mode === 'patient' && activeApp === 'emr') openApp('emr'); }

// ============================================================ floor apps (light cards)
function shell(k, body, agent) {
  const m = APPMETA[k];
  return `<div class="app-card"><div class="app-top"><div class="nm"><span class="ai" style="background:${m.tint}22">${m.icon}</span>${m.nm}<span class="sub">${m.sub}</span></div>${agent ? '<span class="agent-tag"><span class="d"></span>TARS operating</span>' : ''}</div>${body}</div>`;
}
const medRow = (bed, m) => { const cls = m.status === 'given' ? 's-given' : m.status === 'done' ? 's-done' : m.status === 'held' ? 's-held' : 's-due'; return `<tr class="${m._flash ? 'flashG' : ''}"><td><b>${bed}</b></td><td>${m.drug}</td><td>${m.dose}</td><td>${m.route}</td><td class="${cls}">${m.status.toUpperCase()}</td></tr>`; };
function renderEMAR() {
  // patient view: this patient's med chart (reuses the meds body → emr-med-* ids)
  if (state.mode === 'patient') { const b = emrBed(); return b ? shell('emar', `<div class="emr-body">${emrSectionBody('meds', b)}</div>`) : ''; }
  // floor view: the unit-wide med-admin queue
  const rows = beds.flatMap((b) => b.meds.filter((m) => m.status !== 'given').slice(0, 1).map((m) => medRow(b.id, m))).join('') + emarExtra.join('');
  return shell('emar', `<table class="tbl"><thead><tr><th>Bed</th><th>Drug</th><th>Dose</th><th>Route</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`, emarAgentFlag);
}
function renderInventory() { const rows = inventory.map((i) => `<tr class="${i._flash ? 'flashG' : ''}"><td>${i.item}</td><td class="mono">${i.qty}</td><td>${i.reorder ? '<span class="pillbadge b-flag">REORDER</span>' : '<span class="pillbadge b-ok">OK</span>'}</td><td class="mono">${i.expiry}</td></tr>`).join(''); return shell('inventory', `<table class="tbl"><thead><tr><th>Item</th><th>Qty</th><th>Status</th><th>Expiry</th></tr></thead><tbody>${rows}</tbody></table>`); }
function renderStaffing() { const rows = clinicians.map((c) => `<tr><td><b>${c.name}</b></td><td style="text-transform:capitalize">${c.role}</td><td>${c.shift}</td><td>${c.assigned.length ? c.assigned.join(', ') : '—'}</td><td>${c.on_call ? '<span class="pillbadge b-ok">ON-CALL</span>' : ''}</td></tr>`).join(''); return shell('staffing', `<table class="tbl"><thead><tr><th>Name</th><th>Role</th><th>Shift</th><th>Assigned</th><th></th></tr></thead><tbody>${rows}</tbody></table>`); }
function renderProtocols() {
  // The ER inbound beat opens THIS app with the OMI bundle live: the checklist
  // is the star — TARS ticking the operational items, one clinical item held
  // at the gate — with the pathway library beneath it.
  if (state.chapter === 'er') {
    const items = [
      // pre-alerted, not activated: the ER has a medic's ECG and nothing else.
      // Activation is the Hub's, once the troponin is back (chat.js step 9).
      ['Bay 04 cleared & prepped', 'done'], ['Cath lab pre-alerted — team on notice', 'done'],
      ['ECG tech standing by at doors', 'done'], ['Defib pads · airway cart to bay', 'busy'],
      ['Heparin per OMI bundle', 'gated'],
    ];
    const rows = items.map(([t, st]) => `<div class="omi-row"><span class="omi-tick omi-${st}">${st === 'done' ? '✓' : st === 'busy' ? '…' : ''}</span><span class="omi-t${st === 'gated' ? ' omi-dim' : ''}">${t}</span>${st === 'gated' ? '<span class="omi-gate">NEEDS SIGN-OFF</span>' : ''}</div>`).join('');
    return shell('protocols', `
      <style>
        .omi-card{border:1px solid rgba(217,43,43,.35);border-left:3px solid #d92b2b;border-radius:10px;padding:10px 12px;background:var(--card,#fff);margin-bottom:12px}
        .omi-hd{font:700 13px system-ui;color:#b71c1c}.omi-sub{font:500 10px ui-monospace,monospace;color:#7c8b96;margin:3px 0 9px}
        .omi-row{display:flex;align-items:center;gap:8px;margin:6px 0}
        .omi-tick{width:15px;height:15px;border-radius:8px;display:flex;align-items:center;justify-content:center;font:700 9px ui-monospace,monospace;color:#fff;flex:0 0 auto}
        .omi-done{background:#2fae72}.omi-busy{background:#e0a03a}.omi-gated{background:transparent;border:1px solid #d8e0e4}
        .omi-t{font:500 12px system-ui;color:#22303a}.omi-dim{color:#8a99a8}
        .omi-gate{font:700 8px ui-monospace,monospace;color:#c96a10;margin-left:auto}
      </style>
      <div class="omi-card">
        <div class="omi-hd">OMI — Patient Inbound Protocol</div>
        <div class="omi-sub">auto-opened by TARS · SH-2891 · bay 04</div>
        ${rows}
      </div>
      <table class="tbl"><thead><tr><th>Protocol</th><th>State</th></tr></thead><tbody>
        <tr><td><b>STEMI — primary PCI pathway</b></td><td><span class="pillbadge b-flag">QUEUED</span></td></tr>
        <tr><td><b>Sepsis 6 bundle</b></td><td><span class="pillbadge b-ok">AVAILABLE</span></td></tr>
        <tr><td><b>COPD exacerbation</b></td><td><span class="pillbadge b-ok">AVAILABLE</span></td></tr>
      </tbody></table>`);
  }
  const list = [['STEMI — primary PCI pathway', 'active', 'b-flag'], ['Sepsis 6 bundle', 'available', 'b-ok'], ['COPD exacerbation', 'available', 'b-ok'], ['DKA management', 'available', 'b-ok'], ['ICU step-down criteria', 'referenced', 'b-auto']]; const rows = list.map((p) => `<tr><td><b>${p[0]}</b></td><td><span class="pillbadge ${p[2]}">${p[1].toUpperCase()}</span></td></tr>`).join(''); return shell('protocols', `<table class="tbl"><thead><tr><th>Protocol</th><th>State</th></tr></thead><tbody>${rows}</tbody></table>`);
}
// The order button is a STATE, not a label. It used to be one hardcoded string
// with `disabled` toggled on it, so once the agent had pulled the troponin the
// screen sat there still offering to order the result it was already showing.
function lisOrderBtn() {
  // A STAT troponin is the ER's order. Three days after the CABG the fever is the
  // question, not the infarct — offering it here read as the panel having been
  // left behind by the story, which it had been.
  if (isPostopWorld()) return '';
  if (lisOrdered === 'resulted') return `<button id="lisOrderBtn" disabled>✓ STAT Troponin · resulted</button>`;
  if (lisOrdered) return `<button id="lisOrderBtn" disabled>STAT Troponin · in the lab…</button>`;
  return `<button id="lisOrderBtn">＋ Place order · STAT Troponin</button>`;
}
function renderLIS() { const b = emrBed(); if (!b) return ''; return shell('lis', `<div class="emr-body"><div class="lis-order">${lisOrderBtn()}</div>${emrSectionBody('labs', b)}</div>`); }
function refreshLIS() { if (activeApp === 'lis') openApp('lis'); }
function placeLisOrder() { const b = bedById(state.focusId); lisOrdered = 'ordered'; b.labs.unshift({ test: 'Troponin I (STAT)', value: 'pending', ref: '<0.04 ng/mL', flag: '', status: 'ordered', _flash: true }); openApp('lis'); setTimeout(() => { const l = b.labs[0]; l.value = '8.4'; l.flag = 'high'; l.status = 'resulted'; l._flash = true; lisOrdered = 'resulted'; refreshLIS(); }, 1900); }
function renderPACS() {
  /* POD 3 · the two-up. The day-0 twelve-lead beside today's, same generator,
   * same scale — because the ONLY way to prove the inferior Q waves are old is to
   * show that they were already there. That comparison is what iSAM is claiming
   * when it says "not a graft", and a clinician meeting this patient on POD 3
   * has no day-0 tracing in their head to compare against.
   *
   * `preserveAspectRatio="none"` on both, so the two tracings stretch identically
   * and the eye can run straight across. Today's is the pericarditis pattern:
   * elevation everywhere and PR depression, which no single artery can produce. */
  if (pacsView === 'ecg2up') return shell('pacs', `<div class="pacs2">
      <div class="p2u"><div class="lbl">${state.focusId} · 12-LEAD · <b>DAY 0</b> — on arrival</div><div class="scan"></div><svg viewBox="0 0 400 96" preserveAspectRatio="none"><polyline fill="none" stroke="#8fb6c9" stroke-width="1.5" points="${ecgPolyline('oldInferior', 400, 3, 62, 34)}"/></svg><div class="lbl2">inferior Q waves · III · aVF <span class="mk">already present</span></div></div>
      <div class="p2u"><div class="lbl">${state.focusId} · 12-LEAD · <b>TODAY</b> — post-op day 3</div><div class="scan"></div><svg viewBox="0 0 400 96" preserveAspectRatio="none"><polyline fill="none" stroke="#e24b4a" stroke-width="1.5" points="${ecgPolyline('pericarditis', 400, 3, 62, 34)}"/></svg><div class="lbl2" style="color:#ff8f8b">diffuse concave ST · <b>PR depression</b> · not territorial</div></div>
      <div class="p2f">Same inferior Q waves on both. <b>The change is the diffuse elevation — and it respects no coronary territory.</b></div>
    </div><div style="padding:0 15px 14px"><div class="agent-tag" style="color:var(--ink-3)">Imaging viewer · serial comparison</div></div>`);
  // POD 3 · the echo that closes it. A rim, not a volume: enough to name the
  // pericardium, nowhere near enough to call tamponade — and saying so is half
  // the value, because it is the question the fever raises.
  if (pacsView === 'echo') return shell('pacs', `<div class="pacs"><div class="lbl">${state.focusId} · TTE · SUBCOSTAL</div><div class="scan"></div><svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid meet"><defs><radialGradient id="ef" cx="50%" cy="50%" r="50%"><stop offset="55%" stop-color="#0b1520"/><stop offset="100%" stop-color="#12212e"/></radialGradient></defs><path d="M40,18 L360,18 L300,192 L100,192 Z" fill="url(#ef)"/><g fill="none" stroke="#dfe9f0" stroke-width="2.2"><path d="M196,52 C238,58 258,96 246,134 C236,166 196,178 168,160 C142,144 138,96 158,68 C168,56 182,50 196,52 Z"/></g><g fill="none" stroke="#3ecf8e" stroke-width="1.4" stroke-dasharray="5 4"><path d="M198,40 C252,48 276,96 262,142 C250,182 196,196 160,174 C126,153 122,92 148,58 C162,40 180,38 198,40 Z"/></g><g font-family="ui-monospace,monospace" font-size="11" font-weight="700"><text x="272" y="34" fill="#8ff0c4">effusion 8 mm</text><text x="52" y="186" fill="#8ff0c4">no RV collapse</text></g><g fill="none" stroke="#8ff0c4" stroke-width="1.2"><path d="M266,44 L258,62"/></g></svg><div class="lbl2" style="color:#8ff0c4">Small circumferential pericardial effusion · no respiratory variation · <b>no tamponade</b></div></div><div style="padding:0 15px 14px"><div class="agent-tag" style="color:var(--ink-3)">Imaging viewer · bedside echo</div></div>`);
  // continued chapter: the POST-PCI angiogram. The culprit LAD is already open
  // — the lab stented it on arrival, which is the thing the whole ER-to-cath
  // arc was arguing for — so it wears a stent glyph in teal, not a red stenosis
  // ring. What is still red is what is still a problem: the circumflex and the
  // right coronary. That contrast IS the scene: the emergency is handled, the
  // disease is not.
  // (placeholder sketch; Revanth swaps in real cine imagery — see HANDOFF-REVANTH.md)
  if (state.chapter === 'continued') return shell('pacs', `<div class="pacs"><div class="lbl">${state.focusId} · CORONARY ANGIOGRAM · POST-POBA</div><div class="scan"></div><svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid meet"><g fill="none" stroke="#dfe9f0" stroke-width="2.6" stroke-linecap="round"><path d="M198,8 C198,32 194,48 186,62"/><path d="M186,62 C164,96 146,134 126,192"/><path d="M156,112 C182,122 206,132 230,152"/><path d="M148,146 C166,156 182,166 196,182"/><path d="M186,62 C218,80 254,92 316,100"/><path d="M286,94 C304,118 314,150 322,192"/><path d="M300,120 C284,134 272,150 262,170"/></g><g fill="none" stroke="#3ecf8e" stroke-linecap="round"><path d="M178,74 C171,85 165,96 160,108" stroke-width="6.5" opacity="0.3"/><path d="M178,74 C171,85 165,96 160,108" stroke-width="1.7" stroke-dasharray="4 3"/></g><g fill="none" stroke="#e24b4a" stroke-width="1.6"><circle cx="246" cy="87" r="11"/><circle cx="308" cy="136" r="11"/></g><g font-family="ui-monospace,monospace" font-size="11" font-weight="700"><text x="58" y="76" fill="#8ff0c4">LAD · POBA (no stent)</text><text x="250" y="70" fill="#ff8f8b">LCx 75%</text><text x="322" y="128" fill="#ff8f8b">RCA 60%</text></g></svg><div class="lbl2" style="color:#ff8f8b">LAD reperfused by balloon, TIMI 3 — no stent, no DAPT · three vessels for revascularisation</div></div><div style="padding:0 15px 14px"><div class="agent-tag" style="color:var(--ink-3)">Imaging viewer · demo render</div></div>`);
  // workup chapter: the 12-lead iSAM committed its read on. Drawn from the same
  // generator as the ER card and both live monitors (../ontology/ecg) — this
  // used to be a hand-typed polyline with an elevated ST plateau, captioned
  // "ST-elevation", on the one patient whose entire diagnosis is that he has
  // none. Nor is it "provisional": the read is committed by the time this opens.
  return shell('pacs', `<div class="pacs"><div class="lbl">${state.focusId} · 12-LEAD ECG · ANT</div><div class="scan"></div><svg viewBox="0 0 400 200" preserveAspectRatio="none"><polyline fill="none" stroke="#e24b4a" stroke-width="1.6" points="${ecgPolyline('deWinter')}"/></svg><div class="lbl2">de Winter pattern · V2–V4 · no ST elevation</div></div><div style="padding:0 15px 14px"><div class="agent-tag" style="color:var(--ink-3)">Imaging viewer · demo render</div></div>`);
}
/** A static tracing for the PACS viewer, sampled off the shared ECG generator.
 *  Baseline 132 / amplitude 74 keeps every pattern inside the 0–200 viewBox:
 *  the tallest excursion is the R at 1.0 (y=58), the deepest the S at −0.26. */
function ecgPolyline(pattern, w = 400, beats = 3, mid = 132, amp = 74) {
  const pts = [];
  for (let x = 0; x <= w; x += 2) pts.push(x + ',' + (mid - ecgAt(((x / w) * beats) % 1, pattern) * amp).toFixed(1));
  return pts.join(' ');
}

// ---------- agent side-effects ----------
export function agentUpdateEMAR() { emarAgentFlag = true; emarExtra = [`<tr class="flashG"><td><b>ICU-05</b></td><td>Step-down reconciliation</td><td>—</td><td>auto</td><td class="s-done">RECONCILED</td></tr>`]; pingDock('emar'); openApp('emar'); setTimeout(() => { emarAgentFlag = false; if (activeApp === 'emar') openApp('emar'); }, 2600); }
export function agentStopPressor() { const b = bedById('ICU-05'); const m = b.meds.find((x) => /norepin/i.test(x.drug)); if (m) { m.drug = 'Norepinephrine (D/C)'; m.status = 'done'; } emarExtra.push(`<tr class="flashG"><td><b>ICU-05</b></td><td>Norepinephrine</td><td>—</td><td>IV</td><td class="s-done">DISCONTINUED</td></tr>`); pingDock('emar'); openApp('emar'); }
export function agentOrderTroponin() {
  const b = bedById(state.focusId);
  const l = b.labs.find((x) => /troponin/i.test(x.test));
  if (l) { l.test = 'Troponin I (STAT)'; l.status = 'ordered'; l.value = 'pending'; l._flash = true; }
  // The repeat lactate belongs to the SAME gated order (ordersFor → 'STAT
  // troponin + repeat lactate'), so it is placed here. It used to just appear
  // in the panel, resulted, with nobody on screen having asked for it.
  let lac = b.labs.find((x) => /lactate \(repeat\)/i.test(x.test));
  if (!lac) { lac = { test: 'Lactate (repeat)', value: 'pending', ref: '0.5–1.6 mmol/L', flag: '', status: 'ordered' }; b.labs.unshift(lac); }
  lac._flash = true;
  lisOrdered = 'ordered'; refreshEMR(); refreshLIS();
  setTimeout(() => {
    if (l) { l.value = '8.4'; l.flag = 'high'; l.status = 'resulted'; l._flash = true; }
    lac.value = '3.1'; lac.flag = 'high'; lac.status = 'resulted'; lac._flash = true;
    lisOrdered = 'resulted'; refreshEMR(); refreshLIS();
  }, 2200);
}
// Heparin goes in; the ticagrelor is HELD, not given. The chart has to carry
// the reason, because an unexplained un-given STAT antiplatelet reads as a miss
// rather than a decision — and this one is the reason he makes theatre today.
/** Pre-op: the heparin infusion stops at midnight so he can go to theatre.
 *  TARS says it out loud; without this the eMAR still read STAT · DUE and the
 *  record contradicted the sentence next to it. */
export function agentHoldHeparin(b) {
  const m = b.meds.find((x) => /heparin/i.test(x.drug));
  if (m) { m.drug = 'Heparin (hold from 00:00 — pre-op)'; m.status = 'held'; m._flash = true; }
  const t = b.meds.find((x) => /ticagrelor/i.test(x.drug));
  if (t && t.status !== 'held') { t.drug = 'Ticagrelor (held — surgical decision)'; t.status = 'held'; t._flash = true; }
  refreshEMR();
}
/* POD 3, in two halves — and the second half is the point.
 *
 * The fever gets what a fever on POD 3 always gets: cultures and empiric cover,
 * started before anyone knows anything. He is NOT on an antibiotic in the ER or
 * pre-cath scenes and must not be, so it goes on the chart here, at the moment a
 * real team would have started it.
 *
 * Then it comes off. An agent that only ever appends to a med list is
 * accumulating, not reasoning — the diagnosis is worth something precisely
 * because it lets something be STOPPED. This is the one med action in the whole
 * arc that removes a drug on the strength of a diagnosis rather than a
 * procedure. */
const EMPIRIC = 'Piperacillin–tazobactam';
export function agentStartEmpiric(b) {
  if (!b.meds.some((x) => x.drug.startsWith(EMPIRIC))) b.meds.push({ drug: EMPIRIC, dose: '4.5 g', route: 'IV', schedule: 'q8h', status: 'due', _flash: true });
  emarExtra.push(`<tr class="flashG"><td><b>${b.id}</b></td><td>${EMPIRIC} — empiric, pending cultures</td><td>4.5 g</td><td>IV</td><td class="s-due">STARTED</td></tr>`);
  refreshEMR(); pingDock('emar');
}
/* POD 3 · the bloods the fever prompted.
 *
 * Panel C was still showing the ER's troponin and arrival lactate while iSAM
 * talked about CRP and the white count — the record contradicting the reasoning
 * on screen beside it. These are the rows the "not infection" beat is reading.
 *
 * Both TRENDS are carried in the value, because a single CRP says nothing: 184
 * matters because it is climbing, and 9.1 matters because it is falling. That
 * pairing — inflammation rising, white count settling — is the exclusion. */
export function agentPod3Bloods(b) {
  const add = (test, value, ref, flag) => {
    if (!b.labs.some((l) => l.test === test)) b.labs.unshift({ test, value, ref, flag, status: 'resulted', _flash: true });
  };
  // unshift, so these land newest-first: cultures, then WCC, then CRP on top
  add('Blood cultures ×2', 'no growth at 36 h', 'no growth at 5 d', '');
  add('White cell count', '9.1 (was 14.2)', '4.0–11.0 ×10⁹/L', '');
  add('CRP', '184 (was 96)', '<5 mg/L', 'high');
  refreshLIS(); pingDock('lis');
}
export function agentTreatPericarditis(b) {
  // matched off the same constant that added it — a hand-written regex here is
  // exactly how this silently stops matching later
  const abx = b.meds.find((x) => x.drug.startsWith(EMPIRIC));
  if (abx) { abx.drug = EMPIRIC + ' (stopped — not infective)'; abx.status = 'held'; abx._flash = true; }
  const add = (drug, dose, route) => { if (!b.meds.some((x) => x.drug.split(' ')[0] === drug.split(' ')[0])) b.meds.push({ drug, dose, route, schedule: '', status: 'due', _flash: true }); };
  add('Colchicine', '500 µg', 'PO');
  add('Ibuprofen', '400 mg', 'PO');
  add('Pantoprazole', '40 mg', 'PO');   // the cover the NSAID obliges, not an afterthought
  emarExtra.push(`<tr class="flashG"><td><b>${b.id}</b></td><td>${EMPIRIC} — <b>STOPPED</b>, not infective</td><td>—</td><td>IV</td><td class="s-done">DISCONTINUED</td></tr>`);
  emarExtra.push(`<tr class="flashG"><td><b>${b.id}</b></td><td>Pericarditis set — colchicine + ibuprofen + PPI</td><td>—</td><td>PO</td><td class="s-done">STARTED</td></tr>`);
  refreshEMR(); pingDock('emar'); openApp('emar');
}
export function agentGiveMeds(b) {
  b.meds.forEach((m) => {
    if (/heparin/i.test(m.drug)) { m.status = 'given'; m._flash = true; }
    else if (/ticagrelor/i.test(m.drug)) { m.drug = 'Ticagrelor (held — surgical decision pending)'; m.status = 'held'; m._flash = true; }
  });
  refreshEMR();
}
export function agentOrderRoutine(b) { b.labs.unshift({ test: 'Repeat panel (FBC/U&E/CRP)', value: 'pending', ref: '—', flag: '', status: 'ordered', _flash: true }); refreshEMR(); setTimeout(() => { const l = b.labs[0]; l.value = 'within range'; l.status = 'resulted'; l._flash = true; refreshEMR(); }, 2200); }
