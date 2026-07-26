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
    { pod: 1, pose: 'sitting', state: 'SITTING', sub: 'edge of bed · unaided', cpot: 4, cl: 'on movement',
      g: 'Alert and following commands. Leaning forward, guarding the sternotomy.',
      log: [
        ['16:40', 'Sat out in chair', '45 min', 'cam'],
        ['14:05', 'First sit — edge of bed', 'unaided', 'cam'],
        ['11:20', 'Extubated', 'spontaneous movement returns', 'cam'],
        ['09:15', 'Obeys commands', 'grip + toe wiggle', 'cam'],
        ['07:30', 'Sedation off — eyes open', '', 'cam'],
      ],
      ledger: [['Out of bed', '45 m'], ['First sit', '14:05'], ['Walked', '—'], ['CPOT max', '4']],
      note: 'Woke to command, extubated 11:20. First sat at the edge of the bed unaided at 14:05, then 45 minutes out in the chair. Guarding the sternotomy on movement; CPOT peaks at 4 on transfers.' },
    { pod: 2, pose: 'standing', state: 'STANDING', sub: 'unaided · steady', cpot: 3, cl: 'on exertion',
      g: 'Steady on standing, one hand on the rail. Gait slow but even.',
      log: [
        ['14:22', 'Stood, unaided', '3 min', 'cam'],
        ['13:40', 'Walked 14 m', 'with frame', 'cam'],
        ['11:05', 'Sat out in chair', '2h 10m', 'cam'],
        ['09:30', 'Stood with assist', '×2', 'cam'],
        ['08:14', 'First sit of the day', 'unaided', 'cam'],
      ],
      ledger: [['Out of bed', '4h 20m'], ['Stood', '×3'], ['Walked', '14 m'], ['CPOT max', '3']],
      note: 'Mobilising well. Stood unaided, walked 14 m with a frame, and spent 4h 20m out of bed. Pain controlled — CPOT 3 on exertion, 1 at rest.' },
    { pod: 3, pose: 'walking', state: 'WALKING', sub: 'corridor · unaided', cpot: 2, cl: 'on exertion',
      g: 'Walking the corridor unaided. Slight stoop, still guarding, gait steady.',
      log: [
        ['15:10', 'Walked 60 m — corridor', 'unaided', 'cam'],
        ['12:30', 'Stairs assessment', '4 steps', 'cam'],
        ['10:00', 'Sat out in chair', '3h', 'cam'],
        ['08:00', 'Independent transfer', 'bed → chair', 'cam'],
      ],
      ledger: [['Out of bed', '6h 05m'], ['Stood', '×6'], ['Walked', '60 m'], ['CPOT max', '2']],
      note: 'Independent bed-to-chair transfers. Walked 60 m in the corridor unaided and managed 4 steps on stairs assessment. 6h 05m out of bed; pain well controlled.' },
    { pod: 4, pose: 'walking', state: 'WALKING', sub: 'independent · 120 m', cpot: 2, cl: 'settled',
      g: 'Independent for washing, dressing and walking. Ready for step-down.',
      log: [
        ['14:00', 'Walked 120 m', 'unaided', 'cam'],
        ['11:15', 'Full stair flight', 'independent', 'cam'],
        ['09:20', 'Washed and dressed', 'independent', 'cam'],
        ['07:45', 'Up for breakfast', 'unaided', 'cam'],
      ],
      ledger: [['Out of bed', '8h 30m'], ['Stood', '×9'], ['Walked', '120 m'], ['CPOT max', '2']],
      note: 'Independent with washing, dressing and mobility. Walked 120 m and completed a full flight of stairs. Meets mobility criteria for step-down and cardiac rehab referral.' },
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
