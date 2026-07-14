import { beds, bedById, inventory, clinicians } from './ontology.js';
import { state, onModeChange } from './state.js';

const APPMETA = {
  emr: { nm: 'EMR', icon: '🗂️', tint: '#6aa6ff', sub: 'Electronic record' },
  emar: { nm: 'eMAR', icon: '💊', tint: '#5dcaa5', sub: 'Med admin' },
  inventory: { nm: 'Inventory', icon: '📦', tint: '#f5a623', sub: 'Stock control' },
  staffing: { nm: 'Staffing', icon: '👥', tint: '#7a9cf0', sub: 'Shift board' },
  protocols: { nm: 'Protocols', icon: '📋', tint: '#9aa6b3', sub: 'Care pathways' },
  lis: { nm: 'LIS', icon: '🧪', tint: '#7a5cd0', sub: 'Lab orders' },
  pacs: { nm: 'PACS', icon: '🩻', tint: '#4aa3c7', sub: 'Imaging' },
};
// Floor state leads with the full sectioned EMR (like the ward's Panel C), with
// the workspace apps still reachable in the dock. Patient state = clinical apps.
const FLOOR_EMR_FOCUS = 'ICU-08'; // default patient the floor EMR opens on (the new STEMI admission)
const dockApps = () => (state.mode === 'patient' ? ['emr', 'lis', 'pacs'] : ['emr', 'emar', 'inventory', 'staffing', 'protocols']);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

let activeApp = null, emarAgentFlag = false, emarExtra = [], lisOrdered = false;
let emrSection = 'summary', lastFocus = null;
const view = () => document.getElementById('appView');
const dockEl = () => document.getElementById('dock');

export function initApps() {
  onModeChange((mode) => {
    lisOrdered = false; emrSection = 'summary'; lastFocus = null;
    if (mode === 'floor') { emarAgentFlag = false; emarExtra = []; }
    document.getElementById('appsTitle').textContent = mode === 'patient' ? 'Clinical apps · EMR' : 'Workspace';
    buildDock(); openApp(dockApps()[0]);
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
  if (k === 'emr') {
    view().querySelectorAll('.emr-rail .ri').forEach((el) => (el.onclick = () => { emrSection = el.dataset.sec; openApp('emr'); }));
    if (lastFocus && lastFocus.section === emrSection) requestAnimationFrame(() => focusField(lastFocus.field, lastFocus.label, false, lastFocus.agent));
  }
}
export function pingDock(k) { const el = dockEl().querySelector(`.ico[data-app="${k}"]`); if (el) { el.classList.remove('pinged'); void el.offsetWidth; el.classList.add('pinged'); } }

function renderApp(k) {
  return ({ emr: renderEMR, emar: renderEMAR, inventory: renderInventory, staffing: renderStaffing, protocols: renderProtocols, lis: renderLIS, pacs: renderPACS }[k] || (() => ''))();
}

// ============================================================ EMR (full, sectioned)
const SECTIONS = [
  ['summary', '🧾', 'Summary'], ['vitals', '📈', 'Vitals'], ['labs', '🧪', 'Labs'], ['meds', '💊', 'Meds'],
  ['orders', '📋', 'Orders'], ['notes', '📝', 'Notes'], ['imaging', '🩻', 'Imaging'], ['history', '🕑', 'History'],
];
function renderEMR() {
  const b = bedById(state.focusId) || bedById(FLOOR_EMR_FOCUS); if (!b) return '';
  const rail = SECTIONS.map(([id, ic, nm]) => `<div class="ri ${id === emrSection ? 'on' : ''}" data-sec="${id}"><span class="ic">${ic}</span>${nm}</div>`).join('');
  const secName = SECTIONS.find((s) => s[0] === emrSection)[2];
  return `<div class="emr">
    <div class="emr-rail">
      <div class="emr-pt"><div class="av">${b.patient.name.split(' ').map((x) => x[0]).join('')}</div><div><div class="nm">${b.patient.name}</div><div class="mn">${b.id} · ${b.patient.mrn}</div></div></div>
      ${rail}
    </div>
    <div class="emr-main">
      <div class="emr-crumb" id="emrCrumb"><b>EMR</b> ▸ ${b.id} ▸ <span>${secName}</span></div>
      <div class="emr-body">${emrSectionBody(emrSection, b)}</div>
    </div>
  </div>`;
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
    b.meds.map((m) => `<tr id="emr-med-${slug(m.drug)}" class="${m._flash ? 'flashG' : ''}"><td><b>${m.drug}</b></td><td>${m.dose}</td><td>${m.route}</td><td>${m.schedule}</td><td class="${m.status === 'given' ? 's-given' : m.status === 'done' ? 's-done' : 's-due'}">${m.status.toUpperCase()}</td></tr>`).join(''));
  if (sec === 'orders') { const ords = ordersFor(b); return tableSec(['Order', 'Type', 'Autonomy', 'Status'],
    ords.map((o, i) => `<tr id="emr-ord-${i}"><td><b>${o.label}</b></td><td>${o.type}</td><td><span class="pillbadge ${o.auto ? 'b-auto' : 'b-flag'}">${o.auto ? 'AUTONOMOUS' : 'GATED'}</span></td><td class="${o.done ? 's-done' : 's-due'}">${(o.done ? 'done' : o.status).toUpperCase()}</td></tr>`).join('')); }
  if (sec === 'notes') return `
    <div class="note" id="emr-note-1"><div class="nh"><b>LSam · trajectory</b><span>auto · just now</span></div><p>${t.verdict}. NEWS2 ${t.news2}, ${t.trend}. Deterioration probability ${(t.detProb * 100).toFixed(0)}%. ${p.acuity === 'critical' ? 'Reperfusion pathway recommended.' : 'Continue current management.'}</p></div>
    <div class="note" id="emr-note-2"><div class="nh"><b>Nursing · N. Adeyemi</b><span>07:40</span></div><p>${p.chief}. Patient ${p.acuity === 'critical' ? 'in distress, escalated to intensivist.' : 'comfortable, observations stable.'}</p></div>`;
  if (sec === 'imaging') return `
    <div class="fld" id="emr-img-1"><div class="k">12-lead ECG</div><div class="val">${p.acuity === 'critical' ? 'Anterior ST-elevation (V1–V4)' : 'Sinus rhythm'} · <a class="lnk">open in PACS ›</a></div></div>
    <div class="fld" id="emr-img-2"><div class="k">Chest X-ray</div><div class="val">${b.id === 'ICU-06' ? 'RLL consolidation' : 'No acute findings'} · <a class="lnk">open in PACS ›</a></div></div>`;
  if (sec === 'history') return `
    <div class="sec-h">Past medical history</div><ul class="plist">${p.comorbid.length ? p.comorbid.map((c) => `<li>${c}</li>`).join('') : '<li>Nil significant</li>'}</ul>
    <div class="sec-h">Admission</div><div class="fld" id="emr-hist-adm"><div class="k">This admission</div><div class="val">${p.chief} — ${p.dx} · admitted ${p.admit}</div></div>`;
  return '';
}
function vfield(k, label, val, unit) { return `<div class="fld" id="emr-vit-${k}"><div class="k">${label}</div><div class="val"><b data-vit="${k}">${val}</b> <i>${unit}</i></div></div>`; }
function tableSec(head, rows) { return `<table class="tbl emr-tbl"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`; }
function ordersFor(b) {
  if (b.patient.acuity === 'critical') return [
    { label: 'Cath lab activation', type: 'operational', auto: true, status: 'executing', done: true },
    { label: 'Cardiology referral', type: 'operational', auto: true, status: 'done', done: true },
    { label: 'STAT troponin + 12-lead', type: 'clinical', auto: false, status: 'proposed' },
    { label: 'Ticagrelor + heparin', type: 'clinical', auto: false, status: 'proposed' }];
  return [{ label: 'Routine bloods', type: 'clinical', auto: false, status: 'proposed' }, { label: 'Continue monitoring', type: 'operational', auto: true, status: 'done', done: true }];
}

// ---- agentic navigation (TARS drives the EMR like an IDE) ----
export function emrNavigate(section, fieldId = null, label = null) {
  if (state.mode !== 'patient') return;
  emrSection = section;
  openApp('emr');
  requestAnimationFrame(() => { document.querySelectorAll('.emr-rail .ri.on').forEach((e) => e.classList.add('nav')); setTimeout(() => document.querySelectorAll('.ri.nav').forEach((e) => e.classList.remove('nav')), 900); focusField(fieldId, label, true); });
}
// which agent's flag pins to a field the agent is driving — matches the speaker
const AGENT_LABEL = { lsam: 'LSam', isam: 'iSAM', tars: 'TARS' };
function focusField(fieldId, label, scroll, agent = null) {
  const v = view();
  v.querySelectorAll('.agent-focus').forEach((e) => e.classList.remove('agent-focus'));
  v.querySelectorAll('.agent-caret').forEach((e) => e.remove());
  // capture the speaker at focus time so re-renders keep the same label
  const who = agent || state.speaker || 'tars';
  lastFocus = fieldId ? { section: emrSection, field: fieldId, label, agent: who } : null;
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
const medRow = (bed, m) => { const cls = m.status === 'given' ? 's-given' : m.status === 'done' ? 's-done' : 's-due'; return `<tr class="${m._flash ? 'flashG' : ''}"><td><b>${bed}</b></td><td>${m.drug}</td><td>${m.dose}</td><td>${m.route}</td><td class="${cls}">${m.status.toUpperCase()}</td></tr>`; };
function renderEMAR() {
  const rows = beds.flatMap((b) => b.meds.filter((m) => m.status !== 'given').slice(0, 1).map((m) => medRow(b.id, m))).join('') + emarExtra.join('');
  return shell('emar', `<table class="tbl"><thead><tr><th>Bed</th><th>Drug</th><th>Dose</th><th>Route</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`, emarAgentFlag);
}
function renderInventory() { const rows = inventory.map((i) => `<tr class="${i._flash ? 'flashG' : ''}"><td>${i.item}</td><td class="mono">${i.qty}</td><td>${i.reorder ? '<span class="pillbadge b-flag">REORDER</span>' : '<span class="pillbadge b-ok">OK</span>'}</td><td class="mono">${i.expiry}</td></tr>`).join(''); return shell('inventory', `<table class="tbl"><thead><tr><th>Item</th><th>Qty</th><th>Status</th><th>Expiry</th></tr></thead><tbody>${rows}</tbody></table>`); }
function renderStaffing() { const rows = clinicians.map((c) => `<tr><td><b>${c.name}</b></td><td style="text-transform:capitalize">${c.role}</td><td>${c.shift}</td><td>${c.assigned.length ? c.assigned.join(', ') : '—'}</td><td>${c.on_call ? '<span class="pillbadge b-ok">ON-CALL</span>' : ''}</td></tr>`).join(''); return shell('staffing', `<table class="tbl"><thead><tr><th>Name</th><th>Role</th><th>Shift</th><th>Assigned</th><th></th></tr></thead><tbody>${rows}</tbody></table>`); }
function renderProtocols() { const list = [['STEMI — primary PCI pathway', 'active', 'b-flag'], ['Sepsis 6 bundle', 'available', 'b-ok'], ['COPD exacerbation', 'available', 'b-ok'], ['DKA management', 'available', 'b-ok'], ['ICU step-down criteria', 'referenced', 'b-auto']]; const rows = list.map((p) => `<tr><td><b>${p[0]}</b></td><td><span class="pillbadge ${p[2]}">${p[1].toUpperCase()}</span></td></tr>`).join(''); return shell('protocols', `<table class="tbl"><thead><tr><th>Protocol</th><th>State</th></tr></thead><tbody>${rows}</tbody></table>`); }
function renderLIS() { const b = bedById(state.focusId); const rows = b.labs.map((l) => { const cls = l.flag === 'high' ? 's-low' : ''; const st = l.status === 'ordered' ? '<span class="pillbadge b-flag">PENDING</span>' : '<span class="pillbadge b-ok">RESULTED</span>'; return `<tr class="${l._flash ? 'flashG' : ''}"><td><b>${l.test}</b></td><td class="mono ${cls}">${l.value}${l.flag === 'high' ? ' ▲' : ''}</td><td class="mono dim">${l.ref}</td><td>${st}</td></tr>`; }).join(''); return shell('lis', `<div class="lis-order"><button id="lisOrderBtn" ${lisOrdered ? 'disabled' : ''}>＋ Place order · STAT Troponin</button></div><table class="tbl"><thead><tr><th>Test</th><th>Value</th><th>Ref range</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`); }
function placeLisOrder() { const b = bedById(state.focusId); lisOrdered = true; b.labs.unshift({ test: 'Troponin I (STAT)', value: 'pending', ref: '<0.04 ng/mL', flag: '', status: 'ordered', _flash: true }); openApp('lis'); setTimeout(() => { const l = b.labs[0]; l.value = '8.4'; l.flag = 'high'; l.status = 'resulted'; l._flash = true; if (activeApp === 'lis') openApp('lis'); }, 1900); }
function renderPACS() { return shell('pacs', `<div class="pacs"><div class="lbl">${state.focusId} · 12-LEAD ECG · ANT</div><div class="scan"></div><svg viewBox="0 0 400 200" preserveAspectRatio="none"><polyline fill="none" stroke="#e24b4a" stroke-width="1.6" points="0,140 30,140 40,128 48,150 56,60 64,170 72,118 110,118 120,108 150,110 160,140 190,140 200,128 208,150 216,60 224,170 232,118 270,118 280,108 310,110 320,140 360,140 370,128 378,150 386,60 394,170 400,118"/></svg><div class="lbl2">ST-elevation V1–V4 · provisional</div></div><div style="padding:0 15px 14px"><div class="agent-tag" style="color:var(--ink-3)">Imaging viewer · demo render</div></div>`); }

// ---------- agent side-effects ----------
export function agentUpdateEMAR() { emarAgentFlag = true; emarExtra = [`<tr class="flashG"><td><b>ICU-05</b></td><td>Step-down reconciliation</td><td>—</td><td>auto</td><td class="s-done">RECONCILED</td></tr>`]; pingDock('emar'); openApp('emar'); setTimeout(() => { emarAgentFlag = false; if (activeApp === 'emar') openApp('emar'); }, 2600); }
export function agentStopPressor() { const b = bedById('ICU-05'); const m = b.meds.find((x) => /norepin/i.test(x.drug)); if (m) { m.drug = 'Norepinephrine (D/C)'; m.status = 'done'; } emarExtra.push(`<tr class="flashG"><td><b>ICU-05</b></td><td>Norepinephrine</td><td>—</td><td>IV</td><td class="s-done">DISCONTINUED</td></tr>`); pingDock('emar'); openApp('emar'); }
export function agentOrderTroponin() { const b = bedById(state.focusId); const l = b.labs.find((x) => /troponin/i.test(x.test)); if (l) { l.test = 'Troponin I (STAT)'; l.status = 'ordered'; l.value = 'pending'; l._flash = true; } refreshEMR(); setTimeout(() => { if (l) { l.value = '8.4'; l.flag = 'high'; l.status = 'resulted'; l._flash = true; } refreshEMR(); }, 2200); }
export function agentGiveMeds(b) { b.meds.forEach((m) => { if (/ticagrelor|heparin/i.test(m.drug)) { m.status = 'given'; m._flash = true; } }); refreshEMR(); }
export function agentOrderRoutine(b) { b.labs.unshift({ test: 'Repeat panel (FBC/U&E/CRP)', value: 'pending', ref: '—', flag: '', status: 'ordered', _flash: true }); refreshEMR(); setTimeout(() => { const l = b.labs[0]; l.value = 'within range'; l.status = 'resulted'; l._flash = true; refreshEMR(); }, 2200); }
