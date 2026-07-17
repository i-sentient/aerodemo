// ============================================================
//  SHARED ONTOLOGY  — the in-memory clinical data model.
//  Both interfaces (Command Hub + Patient Hub) read from this.
// ============================================================
import { clamp, rand } from './utils.js';

export const COL = { stable: '#5dcaa5', watch: '#f5a623', critical: '#e24b4a', empty: '#9aa6b3' };
export const ACU_HEX = { stable: 0x5dcaa5, watch: 0xf5a623, critical: 0xe24b4a };

export const ward = { id: 'WARD-N', name: 'ICU — North', bed_count: 8, command_center_status: 'online' };

export const clinicians = [
  { id: 'C1', name: 'N. Adeyemi', role: 'nurse', shift: 'Day 07:00–19:00', assigned: ['ICU-01', 'ICU-02', 'ICU-04', 'ICU-08'], on_call: false },
  { id: 'C2', name: 'Dr. Okafor', role: 'intensivist', shift: 'On unit', assigned: ['ICU-03', 'ICU-05', 'ICU-06', 'ICU-07', 'ICU-08'], on_call: true },
  { id: 'C3', name: 'Dr. Mensah', role: 'cardiologist', shift: 'On call', assigned: [], on_call: true },
];

export const inventory = [
  { item: 'Troponin I assay kit', qty: 4, reorder: true, expiry: '2026-09' },
  { item: 'IV giving set', qty: 38, reorder: false, expiry: '2027-02' },
  { item: 'Norepinephrine 4mg', qty: 6, reorder: true, expiry: '2026-08' },
  { item: 'ECG electrodes (pk)', qty: 21, reorder: false, expiry: '2027-05' },
  { item: 'Heparin 5000u', qty: 12, reorder: false, expiry: '2026-11' },
];

function medsFor(id) {
  const m = {
    'ICU-01': [['Paracetamol', '1 g', 'IV', 'q6h', 'given'], ['Enoxaparin', '40 mg', 'SC', 'OD', 'due']],
    'ICU-02': [['Salbutamol neb', '5 mg', 'NEB', 'q4h', 'due'], ['Prednisolone', '40 mg', 'PO', 'OD', 'given'], ['Co-amoxiclav', '1.2 g', 'IV', 'q8h', 'due']],
    'ICU-03': [['Insulin infusion', 'variable', 'IV', 'cont.', 'given'], ['0.9% Saline', '1 L', 'IV', 'q4h', 'given']],
    'ICU-04': [['Aspirin', '300 mg', 'PO', 'STAT', 'given'], ['Ticagrelor', '180 mg', 'PO', 'STAT', 'due'], ['Heparin', '5000 u', 'IV', 'STAT', 'due'], ['Morphine', '4 mg', 'IV', 'PRN', 'due']],
    'ICU-05': [['Piptazo', '4.5 g', 'IV', 'q8h', 'given'], ['Norepinephrine', 'wean', 'IV', 'cont.', 'due']],
    'ICU-06': [['Co-amoxiclav', '1.2 g', 'IV', 'q8h', 'given'], ['Paracetamol', '1 g', 'IV', 'q6h', 'due']],
    'ICU-07': [['Salbutamol neb', '5 mg', 'NEB', 'PRN', 'given'], ['Hydrocortisone', '100 mg', 'IV', 'q6h', 'given']],
    'ICU-08': [['Aspirin', '300 mg', 'PO', 'STAT', 'given'], ['Ticagrelor', '180 mg', 'PO', 'STAT', 'due'], ['Heparin', '5000 u', 'IV', 'STAT', 'due'], ['Morphine', '4 mg', 'IV', 'PRN', 'due']],
  }[id] || [];
  return m.map((r) => ({ drug: r[0], dose: r[1], route: r[2], schedule: r[3], status: r[4] }));
}
function labsFor(id) {
  if (id === 'ICU-04') return [
    { test: 'Troponin I', value: 'pending', ref: '<0.04 ng/mL', flag: '', status: 'ordered' },
    { test: 'Lactate', value: '2.1', ref: '0.5–1.6 mmol/L', flag: 'high', status: 'resulted' }];
  if (id === 'ICU-08') return [
    { test: 'Troponin I', value: 'pending', ref: '<0.04 ng/mL', flag: '', status: 'ordered' },
    { test: 'Lactate', value: '2.4', ref: '0.5–1.6 mmol/L', flag: 'high', status: 'resulted' }];
  if (id === 'ICU-02') return [
    { test: 'CRP', value: '88', ref: '<5 mg/L', flag: 'high', status: 'resulted' },
    { test: 'ABG pCO₂', value: '6.9', ref: '4.7–6.0 kPa', flag: 'high', status: 'resulted' }];
  if (id === 'ICU-05') return [
    { test: 'WCC', value: '9.2', ref: '4–11 ×10⁹/L', flag: '', status: 'resulted' },
    { test: 'Lactate', value: '1.1', ref: '0.5–1.6 mmol/L', flag: '', status: 'resulted' }];
  return [{ test: 'FBC', value: 'normal', ref: '—', flag: '', status: 'resulted' }];
}

function mk(id, pos, rot, acuity, p, v, t, cardiac = false) {
  return {
    id, pos, rot, status: 'occupied', device: { feed: 'live' },
    patient: { ...p, acuity }, cardiac,
    vitals: { ...v, conf: 0.97 },
    traj: { news2: t.news2, trend: t.trend, detProb: t.prob, lsam: t.lsam, verdict: t.verdict },
    base: { ...v },
    alerts: acuity === 'critical' ? [{ severity: 'red', reason: 'ST-elevation + troponin trend', status: 'active' }]
      : acuity === 'watch' ? [{ severity: 'amber', reason: 'NEWS2 rising', status: 'active' }] : [],
    meds: medsFor(id), labs: labsFor(id), orders: [],
  };
}

export const beds = [
  mk('ICU-01', { x: -8, z: 2 }, Math.PI / 2, 'stable',
    { name: 'R. Boateng', age: 58, sex: 'M', mrn: 'MRN-30481', chief: 'Post-op observation', dx: 'S/P laparotomy, POD1', comorbid: ['HTN'], admit: '06:10' },
    { hr: 74, spo2: 98, rr: 14, sys: 124, dia: 78, temp: 36.8 }, { news2: 1, trend: 'stable', prob: 0.06, lsam: 'stable', verdict: 'STABLE · ROUTINE' }),
  mk('ICU-02', { x: -8, z: -2.5 }, Math.PI / 2, 'watch',
    { name: 'L. Fernandes', age: 71, sex: 'F', mrn: 'MRN-29117', chief: 'Breathlessness', dx: 'COPD exacerbation', comorbid: ['COPD', 'T2DM'], admit: '04:42' },
    { hr: 96, spo2: 91, rr: 24, sys: 138, dia: 84, temp: 37.6 }, { news2: 5, trend: 'rising', prob: 0.38, lsam: 'flagged', verdict: 'COPD — WATCH' }),
  mk('ICU-03', { x: -4, z: -6 }, 0, 'stable',
    { name: 'M. Haddad', age: 46, sex: 'M', mrn: 'MRN-31002', chief: 'Altered consciousness', dx: 'DKA — resolving', comorbid: ['T1DM'], admit: '01:20' },
    { hr: 82, spo2: 97, rr: 16, sys: 118, dia: 72, temp: 37.0 }, { news2: 2, trend: 'falling', prob: 0.10, lsam: 'stable', verdict: 'DKA — IMPROVING' }),
  mk('ICU-04', { x: 0, z: -6.5 }, 0, 'critical',
    { name: 'J. Okonkwo', age: 63, sex: 'M', mrn: 'MRN-28840', chief: 'Fever, hypotension', dx: 'Septic shock', comorbid: ['T2DM', 'CKD'], admit: '08:05' },
    { hr: 124, spo2: 90, rr: 28, sys: 98, dia: 60, temp: 38.9 }, { news2: 8, trend: 'rising', prob: 0.72, lsam: 'flagged', verdict: 'SEPTIC SHOCK — CRITICAL' }),
  mk('ICU-05', { x: 4, z: -6 }, 0, 'stable',
    { name: 'A. Kristof', age: 52, sex: 'F', mrn: 'MRN-30765', chief: 'Sepsis (urinary)', dx: 'Sepsis — responding', comorbid: [], admit: 'Yesterday 22:10' },
    { hr: 78, spo2: 98, rr: 15, sys: 120, dia: 76, temp: 37.2 }, { news2: 2, trend: 'falling', prob: 0.08, lsam: 'stable', verdict: 'STEP-DOWN ELIGIBLE' }),
  mk('ICU-06', { x: 8, z: -2.5 }, -Math.PI / 2, 'watch',
    { name: 'T. Suzuki', age: 67, sex: 'M', mrn: 'MRN-27553', chief: 'Fever, cough', dx: 'Pneumonia (RLL)', comorbid: ['CKD'], admit: '05:55' },
    { hr: 101, spo2: 93, rr: 22, sys: 128, dia: 80, temp: 38.4 }, { news2: 4, trend: 'stable', prob: 0.31, lsam: 'analyzing', verdict: 'PNEUMONIA — WATCH' }),
  mk('ICU-07', { x: 8, z: 2 }, -Math.PI / 2, 'stable',
    { name: 'P. Almeida', age: 39, sex: 'F', mrn: 'MRN-31544', chief: 'Severe asthma', dx: 'Asthma — stabilised', comorbid: ['Asthma'], admit: '03:30' },
    { hr: 80, spo2: 97, rr: 17, sys: 116, dia: 74, temp: 36.9 }, { news2: 1, trend: 'stable', prob: 0.05, lsam: 'stable', verdict: 'STABLE · ROUTINE' }),
  // Bed 8 — the ward story's admission: stepped-down bed turned over, then the
  // inbound STEMI (Chandrababu) arrives and deteriorates. The interface picks the
  // story up from exactly here.
  mk('ICU-08', { x: 4, z: 6 }, Math.PI, 'critical',
    { name: 'Chandrababu', age: 58, sex: 'M', mrn: 'MRN-31890', chief: 'Crushing chest pain', dx: 'Anterior STEMI', comorbid: ['T2DM', 'Smoker'], admit: '09:12' },
    { hr: 118, spo2: 91, rr: 26, sys: 102, dia: 64, temp: 37.0 }, { news2: 8, trend: 'rising', prob: 0.82, lsam: 'flagged', verdict: 'STEMI — CRITICAL' }, true),
];

export const bedById = (id) => beds.find((b) => b.id === id);

export function wardCounts() {
  const c = { stable: 0, watch: 0, critical: 0 };
  beds.forEach((b) => { c[b.patient.acuity]++; });
  return c;
}

// live device feed — small bounded random walk so numbers tick, never jump
export function startVitals(ms = 750) {
  const drift = (x, d, lo, hi) => clamp(x + rand(-d, d), lo, hi);
  setInterval(() => {
    beds.forEach((b) => {
      const v = b.vitals, base = b.base, crit = b.patient.acuity === 'critical';
      v.hr = Math.round(drift(v.hr, 1.4, base.hr - 6, base.hr + (crit ? 10 : 6)));
      v.spo2 = Math.round(drift(v.spo2, 0.5, base.spo2 - 3, Math.min(100, base.spo2 + 1)));
      v.rr = Math.round(drift(v.rr, 0.7, base.rr - 2, base.rr + (crit ? 4 : 3)));
      v.sys = Math.round(drift(v.sys, 1.6, base.sys - 8, base.sys + 6));
      v.dia = Math.round(drift(v.dia, 1.2, base.dia - 6, base.dia + 5));
    });
  }, ms);
}
