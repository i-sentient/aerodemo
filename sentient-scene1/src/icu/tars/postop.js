// ===========================================================================
//  SCENE 4 · POST-OP (POD 0) — the single source of truth.
//  The surgeon's post-op ORDERS live here. Each bedside device is configured
//  TO these parameters, so the checklist reading, the hover card, and the note
//  line all quote the SAME values — change an order and every surface follows.
// ===========================================================================

// --- ordered parameters (what the devices get set up to) --------------------
export const POD0 = {
  vent: { mode: 'SIMV', fio2: 50, peep: 5, tv: 480, rate: 14 },
  norad: 0.08,          // µg/kg/min
  dobut: 5,             // µg/kg/min
  iabp: '1:1',          // augmentation
  drainSuction: -20,    // cmH₂O
  drainRate: 40,        // mL/hr
  warmTarget: 37.0,     // °C
  suctionVac: -200,     // mmHg (standby)
  ett: { size: 7.5, depth: 22, cuff: 25 },
  glucoseTarget: '6–10 mmol/L',
  // arrival readings quoted by the connection lines
  hr: 96, spo2: 91, art: '96/54', map: 68, cvp: 9, urine: 45,
};

// --- the 12 devices, each set up per POD0 -----------------------------------
// short = the one-line reading in the rail row · note = the documentation line
// written into the post-op note · site/full = the hover card detail.
export const HOOKUP = [
  { key: 'monitor', label: 'Monitor', short: '5-lead + SpO₂',
    full: 'pads + SpO₂ probe · live', site: 'L index finger', feeds: ['hr', 'spo2', 'temp', 'ecg'], marker: 'chestR', waves: ['ecg', 'pleth'],
    note: `Patient monitor — 5-lead ECG + SpO₂ probe applied. HR ${POD0.hr}, SpO₂ ${POD0.spo2}%.` },
  { key: 'art', label: 'Art line', short: `ART ${POD0.art}`,
    full: `ART ${POD0.art} (${POD0.map})`, site: 'L radial · transduced', feeds: ['bp'], marker: 'lwrist', waves: ['abp'],
    note: `Arterial line — left radial, transduced. ${POD0.art} (MAP ${POD0.map}).` },
  { key: 'cvc', label: 'CVC', short: `CVP ${POD0.cvp}`,
    full: `CVP ${POD0.cvp} · 4-lumen`, site: 'R internal jugular', marker: 'neckR', waves: ['cvp'],
    note: `Central line — right internal jugular, 4-lumen, position confirmed. CVP ${POD0.cvp}.` },
  { key: 'ett', label: 'ET tube', short: `${POD0.ett.size} · ${POD0.ett.depth} cm`,
    full: `size ${POD0.ett.size} · ${POD0.ett.depth} cm at lips · cuff ${POD0.ett.cuff} cmH₂O`, site: 'secured', marker: 'mouth',
    note: `ET tube — size ${POD0.ett.size} secured at ${POD0.ett.depth} cm, cuff ${POD0.ett.cuff} cmH₂O.` },
  { key: 'vent', label: 'Ventilator', short: `${POD0.vent.mode} · FiO₂ ${POD0.vent.fio2}`,
    full: `${POD0.vent.mode} · FiO₂ ${POD0.vent.fio2}% · PEEP ${POD0.vent.peep} · TV ${POD0.vent.tv} · rate ${POD0.vent.rate}`, site: 'per ventilation order', feeds: ['rr'], marker: 'chestL', waves: ['vent', 'flow', 'capno'],
    note: `Ventilator — set to order: ${POD0.vent.mode}, FiO₂ ${POD0.vent.fio2}%, PEEP ${POD0.vent.peep}, TV ${POD0.vent.tv} mL, rate ${POD0.vent.rate}.` },
  { key: 'iabp', label: 'IABP', short: `${POD0.iabp} augmenting`,
    full: `${POD0.iabp} augmentation · timing auto`, site: 'R femoral', marker: 'groin', waves: ['iabp'],
    note: `IABP — right femoral, ${POD0.iabp} augmentation, timing auto.` },
  { key: 'pumps', label: 'Inotropes', short: `norad ${POD0.norad} · dob ${POD0.dobut}`,
    full: `noradrenaline ${POD0.norad} · dobutamine ${POD0.dobut} µg/kg/min`, site: 'via central line', marker: 'neckL',
    note: `Inotropes — noradrenaline ${POD0.norad} and dobutamine ${POD0.dobut} µg/kg/min via central line (per order).` },
  { key: 'drains', label: 'Drains', short: `${POD0.drainRate} mL/hr`,
    full: `mediastinal + L pleural · ${POD0.drainSuction} cmH₂O · ${POD0.drainRate} mL/hr`, site: 'swinging, no clots', marker: 'drain',
    note: `Chest drains — mediastinal + left pleural on ${POD0.drainSuction} cmH₂O suction, swinging, ${POD0.drainRate} mL/hr.`,
    recon: true, ask: `Drains aren't on a transducer — nurse, measure the chest drains and check they're swinging.`,
    reconAsk: `Measure chest drains · check swinging / clots`, reconAfter: `${POD0.drainRate} mL/hr, swinging, no clots — logged. I'll ask again each hour.` },
  { key: 'ucath', label: 'Urine', short: `${POD0.urine} mL/hr`,
    full: `hourly volumes · ${POD0.urine} mL/hr`, site: 'clear', marker: 'pelvis',
    note: `Urinary catheter — draining clear, hourly volumes; ${POD0.urine} mL/hr.`,
    recon: true, ask: `The urostat's a manual read — nurse, check the catheter and confirm the hourly urine.`,
    reconAsk: `Read urostat · confirm hourly output`, reconAfter: `${POD0.urine} mL/hr — logged. Hourly urine reminder set.` },
  { key: 'warm', label: 'Warm-air', short: `→ ${POD0.warmTarget.toFixed(1)} °C`,
    full: `forced-air · target ${POD0.warmTarget.toFixed(1)} °C`, site: 'rewarming post-bypass',
    note: `Forced-air warming — target ${POD0.warmTarget.toFixed(1)} °C, rewarming after bypass.` },
  { key: 'flowtron', label: 'Flowtron', short: 'cuffs cycling',
    full: 'intermittent pneumatic compression · both calves', site: 'DVT prophylaxis', marker: 'calf',
    note: `Flowtron — intermittent pneumatic calf compression, cycling (DVT prophylaxis).` },
  { key: 'suction', label: 'Suction', short: `standby ${POD0.suctionVac}`,
    full: `bedhead · ${POD0.suctionVac} mmHg · standby`, site: 'airway ready',
    note: `Suction — bedhead unit set to ${POD0.suctionVac} mmHg, standby.` },
];

// --- SCOPE · trend histories for the numeric devices (last ~6 h, authored) ---
export const TRENDS = {
  pumps: { unit: 'µg/kg/min', label: 'noradrenaline', series: [0.16, 0.14, 0.12, 0.10, 0.09, POD0.norad], target: 0 },
  drains: { unit: 'mL/hr', label: 'combined output', series: [110, 92, 78, 66, 52, POD0.drainRate], target: null },
  ucath: { unit: 'mL/hr', label: 'hourly urine', series: [30, 34, 42, 50, 38, POD0.urine], target: 35 },
  warm: { unit: '°C', label: 'core temp', series: [35.2, 35.6, 36.0, 36.4, 36.7, POD0.warmTarget], target: 37 },
};

// --- SCOPE · the number docked beside each waveform (monitor grammar) --------
// Every trace carries its own primary readout, coloured to match the trace.
// 'live' pulls from the bed sim so it ticks; the rest are POD 0 constants.
export const WAVE_NUM = {
  ecg:   { l: 'HR', v: POD0.hr, u: 'bpm', live: 'hr' },
  pleth: { l: 'SpO₂', v: POD0.spo2, u: '%', live: 'spo2' },
  abp:   { l: 'ART', v: POD0.art, u: `MAP ${POD0.map}`, wide: true },
  cvp:   { l: 'CVP', v: POD0.cvp, u: 'mmHg' },
  vent:  { l: 'Ppeak', v: 24, u: 'cmH₂O' },
  capno: { l: 'EtCO₂', v: 38, u: 'mmHg' },
  flow:  { l: 'PIF', v: 42, u: 'L/min' },
  iabp:  { l: 'AUG', v: 118, u: 'mmHg' },
};

// --- SCOPE · what each machine REPORTS BACK (its measured block) -------------
// This is the density that makes a device page feel like the real instrument:
// set values are in CONTROLS, these are the readings the machine returns.
// w = colour key (matches its waveform) · live = tracks the bed sim.
export const MEASURED = {
  monitor: [
    { l: 'HR', v: POD0.hr, u: 'bpm', w: 'ecg', live: 'hr' }, { l: 'SpO₂', v: POD0.spo2, u: '%', w: 'pleth', live: 'spo2' },
    { l: 'RR', v: POD0.vent.rate, u: '/min', w: 'vent' }, { l: 'Temp', v: '36.4', u: '°C' },
    { l: 'Rhythm', v: 'SR' }, { l: 'Ectopy', v: 'nil' },
  ],
  art: [
    { l: 'Systolic', v: 96, u: 'mmHg', w: 'abp' }, { l: 'Diastolic', v: 54, u: 'mmHg', w: 'abp' },
    { l: 'MAP', v: POD0.map, u: 'mmHg', w: 'abp' }, { l: 'Pulse press', v: 42, u: 'mmHg' },
    { l: 'Damping', v: 'optimal' }, { l: 'Zeroed', v: '00:40' },
  ],
  cvc: [
    { l: 'CVP', v: POD0.cvp, u: 'mmHg', w: 'cvp' }, { l: 'a-wave', v: 11, u: 'mmHg', w: 'cvp' },
    { l: 'v-wave', v: 9, u: 'mmHg', w: 'cvp' }, { l: 'ScvO₂', v: 68, u: '%' },
    { l: 'Lumens', v: '4 · patent' }, { l: 'Tip', v: 'SVC/RA' },
  ],
  ett: [
    { l: 'Size', v: POD0.ett.size, u: 'mm' }, { l: 'At lips', v: POD0.ett.depth, u: 'cm' },
    { l: 'Cuff', v: POD0.ett.cuff, u: 'cmH₂O' }, { l: 'Leak', v: 'nil' },
    { l: 'CXR', v: 'confirmed' }, { l: 'Secured', v: 'tie' },
  ],
  vent: [
    { l: 'Ppeak', v: 24, u: 'cmH₂O', w: 'vent' }, { l: 'Pplat', v: 18, u: 'cmH₂O', w: 'vent' },
    { l: 'PEEP', v: POD0.vent.peep, u: 'cmH₂O', w: 'vent' }, { l: 'Vte', v: 465, u: 'mL' },
    { l: 'MV', v: '6.7', u: 'L/min' }, { l: 'I:E', v: '1:2.1' },
    { l: 'Cstat', v: 34, u: 'mL/cmH₂O' }, { l: 'Raw', v: 8, u: 'cmH₂O/L/s' },
    { l: 'EtCO₂', v: 38, u: 'mmHg', w: 'capno' }, { l: 'PIF', v: 42, u: 'L/min', w: 'flow' },
  ],
  iabp: [
    { l: 'Unassisted sys', v: 96, u: 'mmHg', w: 'iabp' }, { l: 'Aug diastolic', v: 118, u: 'mmHg', w: 'iabp' },
    { l: 'Assisted EDP', v: 48, u: 'mmHg', w: 'iabp' }, { l: 'Balloon', v: 40, u: 'cc' },
    { l: 'Helium', v: 'ok' }, { l: 'Timing', v: 'auto' },
  ],
  pumps: [
    { l: 'Noradrenaline', v: POD0.norad, u: 'µg/kg/min' }, { l: 'Dobutamine', v: POD0.dobut, u: 'µg/kg/min' },
    { l: 'Norad volume', v: 14, u: 'mL' }, { l: 'Syringe left', v: 36, u: 'mL' },
    { l: 'Line', v: 'central' }, { l: 'Occlusion', v: 'nil' },
  ],
  drains: [
    { l: 'Last hour', v: POD0.drainRate, u: 'mL' }, { l: '4-h total', v: 236, u: 'mL' },
    { l: 'Since arrival', v: 310, u: 'mL' }, { l: 'Suction', v: POD0.drainSuction, u: 'cmH₂O' },
    { l: 'Swinging', v: 'yes' }, { l: 'Clots', v: 'nil' },
  ],
  ucath: [
    { l: 'Last hour', v: POD0.urine, u: 'mL' }, { l: '4-h total', v: 164, u: 'mL' },
    { l: 'Since arrival', v: 219, u: 'mL' }, { l: 'Per kg', v: '0.6', u: 'mL/kg/hr' },
    { l: 'Colour', v: 'clear' }, { l: 'Balance', v: '+1.2 L' },
  ],
  warm: [
    { l: 'Core temp', v: '36.4', u: '°C' }, { l: 'Target', v: POD0.warmTarget.toFixed(1), u: '°C' },
    { l: 'Delta', v: '−0.6', u: '°C' }, { l: 'Blanket', v: 'upper body' },
    { l: 'Rate', v: '+0.4', u: '°C/hr' }, { l: 'Shivering', v: 'nil' },
  ],
  flowtron: [
    { l: 'Pressure', v: 45, u: 'mmHg' }, { l: 'Cycle', v: 60, u: 's' },
    { l: 'Garment', v: 'calf' }, { l: 'Both legs', v: 'yes' },
  ],
  suction: [
    { l: 'Vacuum', v: POD0.suctionVac, u: 'mmHg' }, { l: 'Mode', v: 'standby' },
    { l: 'Canister', v: 20, u: 'mL' }, { l: 'Catheter', v: '14 Fr' },
  ],
};

// --- SCOPE · extra detail lines per device (the full-interface view) ---------
export const SCOPE_DETAIL = {
  monitor: ['Alarms: HR 50–130 · SpO₂ ≥ 90%', '5-lead · paced-rhythm detection ON'],
  art: [`MAP target ≥ ${POD0.map} (per orders)`, 'Zeroed at phlebostatic axis'],
  cvc: ['Target CVP 8–12 (per orders)', '4-lumen · distal port transduced'],
  ett: [`Size ${POD0.ett.size} · secured ${POD0.ett.depth} cm at lips`, `Cuff ${POD0.ett.cuff} cmH₂O`, 'Position confirmed on CXR'],
  vent: ['Wean & extubate when awake, gases acceptable (per orders)', 'ABG 4-hourly · next due 04:00'],
  iabp: ['Trigger: ECG · timing auto', 'Wean overnight if cardiac index holds'],
  pumps: [`Noradrenaline ${POD0.norad} + dobutamine ${POD0.dobut} µg/kg/min`, `Weaning to MAP ≥ ${POD0.map} (per orders)`],
  drains: [`Suction ${POD0.drainSuction} cmH₂O · swinging, no clots`, 'Escalate: > 200 mL/hr, or > 100 ×4 h (per orders)', 'Nurse recon: hourly measure'],
  ucath: ['Target ≥ 0.5 mL/kg/hr (per orders)', 'Nurse recon: hourly volumes'],
  warm: [`Target ${POD0.warmTarget.toFixed(1)} °C · forced-air`, 'Rewarming after bypass'],
  flowtron: ['Both calves · continuous cycling', 'Mechanical DVT prophylaxis'],
  suction: [`Set ${POD0.suctionVac} mmHg · standby`, 'Bedhead · airway ready'],
};

// --- SCOPE · on-device CONTROLS for the 5 actuators we can actually command --
// Each mirrors the real machine's control surface AND its step size, so setting
// it here maps 1:1 onto the bedside panel. 'seed' = current setting (from POD0).
// Every change stages as PENDING until confirm — the same select → set → confirm
// interlock the device enforces itself. The other 7 devices are sensors /
// passive lines (read-only) and carry no control panel.
export const CONTROLS = {
  vent: {
    kind: 'knob',                                   // push-and-turn rotary + tiles + mode menu
    modes: ['SIMV', 'PC-AC', 'PSV', 'ASV'],
    params: [
      { key: 'fio2', label: 'FiO₂', unit: '%', min: 21, max: 100, step: 5 },
      { key: 'peep', label: 'PEEP', unit: 'cmH₂O', min: 0, max: 20, step: 1 },
      { key: 'tv', label: 'Vt', unit: 'mL', min: 300, max: 700, step: 10 },
      { key: 'rate', label: 'f', unit: '/min', min: 6, max: 35, step: 1 },
    ],
    seed: { mode: POD0.vent.mode, fio2: POD0.vent.fio2, peep: POD0.vent.peep, tv: POD0.vent.tv, rate: POD0.vent.rate },
  },
  pumps: {
    kind: 'pumps',                                  // per-channel titrate + confirm (DERS limits)
    channels: [
      { key: 'norad', label: 'Noradrenaline', unit: 'µg/kg/min', min: 0, max: 0.5, step: 0.01, dp: 2 },
      { key: 'dobut', label: 'Dobutamine', unit: 'µg/kg/min', min: 0, max: 20, step: 0.5, dp: 1 },
    ],
    seed: { norad: POD0.norad, dobut: POD0.dobut },
  },
  iabp: {
    kind: 'iabp',                                   // ratio + trigger + augment%, one CONFIRM
    ratios: ['1:1', '1:2', '1:3'],
    triggers: ['ECG', 'Pressure', 'Internal'],
    aug: { min: 0, max: 100, step: 5, unit: '%' },
    seed: { ratio: POD0.iabp, trigger: 'ECG', aug: 100, running: true },
  },
  warm: {
    kind: 'bands',                                  // Bair Hugger temperature bands
    context: `patient core target ${POD0.warmTarget.toFixed(1)} °C`,
    bands: [{ label: 'Off', v: 0 }, { label: '32°', v: 32 }, { label: '38°', v: 38 }, { label: '43°', v: 43 }],
    seed: { band: 38 },                             // medium — rewarming post-bypass
  },
  flowtron: {
    kind: 'toggle',                                 // run / standby (garment auto)
    context: 'garment auto · calf · 45 mmHg preset',
    seed: { on: true },
  },
};

// --- the POD timeline — what the bedside looks like on each recovery day ------
// `off` = devices that come off THAT day (beat 0 in reverse: the twin's markers
// go dark one by one and SCOPE's wall empties). `vitals` is where the numbers
// land once the day's weaning is done. Recovery you can see, not narrate.
/* Three days, not five. The old 0-1-2-3-4 was a recovery timeline — extubate,
 * drains out, lines out, step down — competent and unfalsifiable, because
 * nothing ever went wrong. POD 3 now carries a DIAGNOSIS, and POD 6 carries what
 * that diagnosis changed. The retired days' content survives as one-line history
 * inside POD 3's note and the discharge course, which is where a reader looks
 * for it anyway.
 *
 * `off` lists devices that come OFF on that day (keys from HOOKUP). POD 3 sheds
 * everything invasive at once because three days of weaning happened between the
 * scenes — the note says so rather than the beats acting it out.
 */
/* The days are 0, 3, 6 — so ARRAY INDEX IS NO LONGER THE POD NUMBER, which is
 * an assumption hud.js and apps.js both used to make (`PODS[podDay]`). Every
 * lookup goes through these two helpers instead; indexing PODS directly by a day
 * is now a bug.
 */
export const PODS = [
  { pod: 0, title: 'Arrival', sub: 'ventilated · sedated · full support', off: [],
    vitals: { hr: POD0.hr, spo2: POD0.spo2, sys: 96, dia: 54, rr: POD0.vent.rate, temp: 36.4 } },

  { pod: 3, title: 'The fever', sub: 'lines out · pleuritic · pericardium',
    off: ['ett', 'vent', 'iabp', 'pumps', 'warm', 'drains', 'suction', 'art', 'cvc', 'ucath'],
    // temp is the point of the day. HR up with the fever, everything else settled.
    vitals: { hr: 98, spo2: 96, sys: 124, dia: 72, rr: 22, temp: 38.4 },
    // the live strip changes SHAPE on this day, not just its numbers — the whole
    // scene turns on a morphology, so the monitor has to be showing it while iSAM
    // talks about it. Absent here, a day keeps whatever the bed's own rhythm is.
    ecg: 'pericarditis',
    note: [
      ['Problem', 'Second spike <b>38.4</b>. Pleuritic pain, worse supine. Pericardial rub.'],
      ['Not infection', 'CRP <b>184 rising</b>, WCC <b>9.1 falling</b>. Cultures negative at 36 h. <b>Empiric Piptazo stopped.</b>'],
      ['Not a graft', 'Diffuse concave ST with PR depression — not territorial. <b>The inferior Q waves were on the day-0 twelve-lead.</b>'],
      ['Echo', 'Small circumferential effusion. No tamponade.'],
      ['Diagnosis', '<b>Post-cardiac-injury syndrome.</b> Colchicine + ibuprofen, repeat echo 48 h.'],
    ],
    orders: { label: 'Pericarditis — treatment set', items: ['Stop piperacillin–tazobactam', 'Colchicine 500 µg BD', 'Ibuprofen 400 mg TDS with PPI cover', 'Repeat echo in 48 h', 'Notify cardiothoracic surgeon'] } },

  { pod: 6, title: 'Home', sub: 'telemetry off · pericardium settling · discharge',
    off: ['flowtron', 'monitor'],
    vitals: { hr: 72, spo2: 98, sys: 126, dia: 74, rr: 15, temp: 36.7 },
    note: [
      ['Pericardium', 'Afebrile <b>72 h</b>. Rub gone. CRP <b>184 to 41</b>. Effusion reduced, non-circumferential.'],
      ['Cardiovascular', 'Sinus 72. <b>No AF the whole admission.</b> Telemetry off this morning.'],
      ['Wound', 'Sternotomy clean and dry, no click. Harvest site settled.'],
      ['Function', 'Stairs with physio completed. 140 m yesterday. Independent.'],
      ['Disposition', 'Fit for discharge. <b>The pericarditis shapes the follow-up, not the date.</b>'],
    ],
    orders: { label: 'Discharge set', items: ['Cardiac rehabilitation referral', 'Repeat TTE at 2 weeks — effusion', 'GP + cardiothoracic clinic letters', 'Discharge medication reconciliation'] } },
];

export const podByDay = (day) => PODS.find((p) => p.pod === (day | 0)) || PODS[0];
export const podsUpTo = (day) => PODS.filter((p) => p.pod <= (day | 0));


// ---- the DISCHARGE SUMMARY — the admission compressed into one document -----
// This is the record's closing artifact: the whole demo (door → cath → theatre
// → four PODs) as the document another hospital would actually receive. TARS
// drafts it from the notes it already wrote; the clinician's signature files it.
/* The closing artefact — and the one most at risk of becoming a case sheet.
 * FOUR course entries, not eight: door, cath, theatre, the complication. Each is
 * one line. A reader who wants the detail opens the progress notes; a reader
 * looking at this wants the shape of the admission in a glance.
 * No SYNTAX score — it described three untreated vessels and stopped describing
 * anything the moment the LAD was opened.
 */
export const DISCHARGE = {
  dx: 'Anterior OMI (de Winter) -> three-vessel disease -> post-cardiac-injury syndrome',
  proc: 'CABG x3 (on-pump) — LIMA -> LAD · SVG -> OM · SVG -> PDA',
  course: [
    ['Door', 'de Winter OMI, troponin 8.4. <b>P2Y12 withheld</b> pending anatomy.'],
    ['Cath', 'LAD reperfused by <b>balloon alone, no stent</b>. Door-to-balloon <b>47 min</b>.'],
    ['Theatre', '<b>Same-day CABG x3</b> — no antiplatelet washout to wait out.'],
    ['POD 3', '<b>Post-cardiac-injury syndrome.</b> Graft failure excluded on the day-0 ECG.'],
  ],
  echo: 'LVEF 50% (40% intra-op), all three grafts flowing. Effusion reduced, no tamponade.',
  meds: [
    ['Aspirin 75 mg', 'OD · lifelong'],
    ['Bisoprolol 2.5 mg', 'OD · 12 weeks'],
    ['Atorvastatin 80 mg', 'nocte'],
    ['Ramipril 2.5 mg', 'OD · GP to titrate'],
    // the two that exist because of POD 3 — the diagnosis leaves with him
    ['Colchicine 500 mcg', 'BD · 3 months'],
    ['Ibuprofen 400 mg', 'TDS · tapering, PPI cover'],
  ],
  followup: [
    ['Week 2', '<b>Repeat TTE — the effusion</b>'],
    ['Week 4', 'Cardiac rehabilitation'],
    ['Week 6', 'Cardiothoracic clinic'],
    ['Safety-net', '<b>Breathlessness or the pain returning -> same-day.</b>'],
  ],
  functional: 'Independent, one flight of stairs supervised, 140 m on POD 6. Sternal precautions observed.',
};

// --- WATCH · the surveillance record (Panel A) --------------------------------
// The bed camera watches continuously; pose estimation turns what it sees into
// a timestamped movement log. That log IS the panel — the stick figure in the
// corner is just the live vision read. CPOT is scored by WATCHING (face, body
// movement, muscle tension, ventilator compliance), which is exactly why a
// camera can do it on a patient too sedated to self-report.
// Each day's log is what TARS quotes into that POD's progress note — the
// clinician reads it, examines, and orders the next step of recovery.
export const WATCH = {
  cam: { id: 'CAM 02', place: 'BED · ICU-08' },
  days: [
    { pod: 0, pose: 'supine', state: 'SEDATED', sub: 'ventilated · no spontaneous movement', cpot: 3, cl: 'on suctioning',
      g: 'No spontaneous movement. Grimace and rigidity on suctioning only.',
      log: [
        ['04:10', 'Position change → right lateral', 'nursing', 'cam'],
        ['03:20', 'CPOT 3 on suctioning', 'grimace + rigidity', 'cam'],
        ['02:45', 'Sedation hold', 'no spontaneous movement', 'cam'],
        ['01:30', 'Position change → supine', 'nursing', 'cam'],
        ['00:50', 'Arrival — transferred to bed', 'sedated', 'cam'],
      ],
      ledger: [['Out of bed', '0 m'], ['Turns', '3'], ['Walked', '—'], ['CPOT max', '3']],
      note: 'Sedated and ventilated throughout. Turned 2-hourly for pressure care. No spontaneous movement; CPOT 3 on suctioning only, settling between cares.' },
    /* POD 3 — the earliest signal in the whole scene, and nobody charted it.
     * Yesterday: three corridor walks. Today: none, and he will not lie flat.
     * The camera scores CPOT by WATCHING — face, guarding, muscle tension — so
     * it can see pleuritic pain in a patient who has not yet complained of it. */
    { pod: 3, pose: 'sitting', state: 'GUARDING', sub: 'will not lie flat · pleuritic', cpot: 5, cl: 'on inspiration',
      g: 'Sitting forward, both hands braced. Grimace on deep breath, not on movement.',
      log: [
        ['15:40', 'Declined corridor walk', 'physio · second refusal', 'cam'],
        ['15:05', 'CPOT 5 on inspiration', 'grimace + bracing', 'cam'],
        ['14:20', 'Sat forward, has not reclined since', 'relief posture', 'cam'],
        ['11:30', 'Out of bed to chair — 4 m only', 'slowed, guarding', 'cam'],
        ['08:15', 'Refused first walk', 'physio', 'cam'],
      ],
      ledger: [['Out of bed', '4 m'], ['Walks', '0 · was 3'], ['Time upright', '38 min'], ['CPOT max', '5']],
      note: 'Mobility has collapsed against yesterday: three corridor walks then, none today, 4 m to the chair and back. Sits forward and has not reclined since 14:20. CPOT peaks at 5 on inspiration rather than on movement — the pain is pleuritic, not sternal.' },

    { pod: 6, pose: 'walking', state: 'INDEPENDENT', sub: 'stairs completed · unaided', cpot: 1, cl: 'at rest',
      g: 'Upright and steady, arms free. No guarding on inspiration.',
      log: [
        ['16:10', 'Stairs with physio — one flight', 'completed, unaided', 'cam'],
        ['13:45', 'Corridor walk 60 m', 'steady, no stops', 'cam'],
        ['11:20', 'Reclined flat for echo', 'no relief posture', 'cam'],
        ['09:30', 'Corridor walk 80 m', 'unaided', 'cam'],
        ['07:50', 'Out of bed to wash', 'independent', 'cam'],
      ],
      ledger: [['Out of bed', '140 m'], ['Walks', '2 + stairs'], ['Time upright', '5 h 20 m'], ['CPOT max', '1']],
      note: '140 m walked across two corridor walks and one flight of stairs with physio, all unaided. Lay flat for the repeat echo without adopting a relief posture — the pleuritic guarding has gone. Sternal precautions observed on every transfer.' },
  ],
};

// --- the post-op ORDERS & PLAN block (reads the SAME POD0) -------------------
export const POD0_ORDERS = [
  ['Ventilation', `${POD0.vent.mode}, FiO₂ ${POD0.vent.fio2}%, PEEP ${POD0.vent.peep} — wean & extubate when awake, gases acceptable, haemodynamically stable`],
  ['Analgesia', 'regular paracetamol + opioid PCA once awake'],
  ['Antiplatelet', 'aspirin 75 mg once drains settle (<50 mL/hr, no coagulopathy)'],
  ['Inotropes', `wean noradrenaline ${POD0.norad} / dobutamine ${POD0.dobut} to MAP ≥ ${POD0.map}`],
  ['Glycaemic', `insulin infusion, target ${POD0.glucoseTarget} (diabetic)`],
  ['Antibiotics', 'cefuroxime prophylaxis ×3 doses'],
  ['Bloods', 'ABG now + 4-hourly · FBC, U&E, coags, lactate'],
  ['Imaging', 'portable CXR — line / tube / drain position'],
  ['Targets', `MAP ≥ ${POD0.map} · CVP 8–12 · urine ≥ 0.5 mL/kg/hr · lactate downtrend`],
  ['Escalation', 'drain > 200 mL/hr, or > 100 mL/hr ×4h → call surgeon (bleeding/tamponade); new AF / instability → call'],
];
