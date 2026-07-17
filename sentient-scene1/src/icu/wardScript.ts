// ============================================================================
//  WARD-PHASE AGENT SCRIPT — what TARS / the SAMs say at each ICU state.
//  Key = the ICU step (the Nth right-arrow press). Value = that step's beat:
//  a list of { who, html } lines played in sequence in the docked Panel B.
//    who:  'lsam' | 'tars' | 'isam' (agents) · 'clinician' | 'nurse' (humans)
//    html: message body — supports <b>, and <span class="em"> for emphasis.
//  ⚠ PLACEHOLDER CONTENT — rewrite these lines with the real dialogue.
// ============================================================================
export type WardLine = { who: string; html: string }

export const WARD_BEATS: Record<number, WardLine[]> = {
  // state 2 — bird's-eye scan · hero bed flags green (de-escalation eligible)
  2: [
    { who: 'lsam', html: `Ward scan complete — ICU·North, <b>8 beds</b>. Trajectories nominal on seven.` },
    { who: 'isam', html: `Bed 8 reviewed: NEWS2 falling, pressors off 12h. <span class="em">Step-down eligible.</span>` },
    { who: 'tars', html: `Flagging Bed 8 for de-escalation.` },
  ],

  // state 3 — hero push-in · violet orb grows (patient lifted out)
  3: [
    { who: 'tars', html: `Initiating transfer — step-down bed reserved, portering paged.` },
  ],

  // state 4 — orb shrinks away · bed brown/blinking (dirty, needs making)
  4: [
    { who: 'tars', html: `Patient off the unit. Bed 8 marked <b>unmade</b> — housekeeping queued.` },
  ],

  // state 5 — bed blue (clean & ready)
  5: [
    { who: 'tars', html: `Bed 8 turned. <span class="em">Clean and ready.</span> Net effect: +1 Level-3 bed.` },
  ],

  // state 6 — red orb + halo (inbound critical patient)
  6: [
    { who: 'lsam', html: `Inbound — chest pain, ETA 9 minutes. Routing to Bed 8.` },
    { who: 'isam', html: `ECG relayed: <b style="color:var(--redD)">anterior STEMI pattern.</b> Advisory: pre-activate pathway.` },
  ],

  // state 7 — arrival · patient solidifies onto the bed
  7: [
    { who: 'tars', html: `Patient arrived — Bed 8 occupied. Vitals streaming live.` },
  ],

  // state 8 — bed blinks red (deterioration)
  8: [
    { who: 'lsam', html: `Deterioration alarm — Bed 8 trajectory <b style="color:var(--redD)">rising fast.</b>` },
    { who: 'tars', html: `Opening the Patient Hub. Entering the interface…` },
  ],

  // state 9 — the eMAR workspace (Panel C) slides in
  9: [
    { who: 'tars', html: `Workspace online — <b>eMAR</b> loaded. Med-admin queue ready across the unit.` },
  ],
}
