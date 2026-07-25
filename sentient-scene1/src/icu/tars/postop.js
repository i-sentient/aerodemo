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
    full: `${POD0.vent.mode} · FiO₂ ${POD0.vent.fio2}% · PEEP ${POD0.vent.peep} · TV ${POD0.vent.tv} · rate ${POD0.vent.rate}`, site: 'per ventilation order', feeds: ['rr'], marker: 'chestL', waves: ['vent', 'capno'],
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
