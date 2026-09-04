// ============================================================================
//  WARD-PHASE AGENT SCRIPT — what TARS and iSAM do at each ICU state.
//  Key = the ICU step (the Nth right-arrow press).
//
//  Two kinds of entry, and the split is the whole point:
//
//    { who, html, status }   an agent SAYS something — a finding, a judgement,
//                            a conclusion. Things only a reasoner produces.
//    { orders: [...] }       an agent DOES something — rows that spin and tick.
//
//  Everything operational belongs in the second kind. A system that writes the
//  sentence "step-down bed booked, porters paged" is narrating its own work;
//  one that shows four rows fire is doing it. The first reads as two colleagues
//  chatting, which is exactly what this script used to read as — nine messages,
//  four of them consecutive TARS, every one of them prose.
//
//  Rules that keep it from drifting back:
//    · No line is addressed to anyone. "There's your Level-3 bed" and "All
//      handled" were spoken TO a listener who is not in the room. State the
//      fact; let the panel carry it.
//    · `status` is the notch's doing-word and is never omitted. 'thinking…' on
//      every beat is what made two agents sound like two people.
//    · At least one order is GATED. The clinician notch promises CLINICAL GATE ·
//      IN THE LOOP, and a panel that fires everything autonomously breaks that
//      promise on screen. Discontinuing a vasopressor is the honest one: it is
//      the clinical decision that frees the bed.
//
//  who: 'tars' | 'isam' (agents) · 'clinician' | 'nurse' (humans)
//  LSam is retired — it is PLEXUS now, and PLEXUS carries signal rather than
//  speaking. Its lines were re-bucketed by what each line IS, not by who used
//  to say it: anything scored, trended or judged is iSAM; anything that books,
//  pages or reconciles is TARS — and most of that became orders.
//  html: supports <b>, and <span class="em"> for emphasis.
// ============================================================================
export type WardOrder = {
  label: string
  detail: string
  autonomy: 'autonomous' | 'gated'
  /** a side effect, named rather than passed — chat.js resolves it (EFFECTS) */
  effect?: 'heparin'
}
export type WardLine =
  /** `effect` fires when the line LANDS, not when the beat starts — the whole
   *  point is that the floor changes on the sentence that explains it. */
  | { who: string; html: string; status?: string; effect?: 'flagBed8'; orders?: never }
  | { orders: WardOrder[]; who?: never; html?: never; status?: never }

export const WARD_BEATS: Record<number, WardLine[]> = {
  // state 2 — the unit, the squeeze, and the candidate
  2: [
    {
      who: 'isam',
      status: 'reading the overnight scan',
      html: `ICU·North, <b>eight beds</b>, eight occupied. Seven trajectories flat.`,
    },
    {
      who: 'tars',
      status: 'no level-3 bed',
      html: `Cardiology has an MI inbound. <span class="em">There is no Level-3 bed.</span>`,
    },
    // the reasoning that JUSTIFIES the block below — it comes first, because the
    // orders are only defensible once the candidate is named
    {
      who: 'isam',
      status: 'scoring step-down eligibility',
      // the bed goes green on THIS sentence. It used to turn the instant the
      // beat opened, ~3.2 s before iSAM said why — the floor answering a
      // question nobody had asked yet.
      effect: 'flagBed8',
      html: `Bed 8 — <b>Jagan Mohan</b>. Off pressors, NEWS2 2 and falling, lactate normalised. <span class="em">Step-down eligible.</span>`,
    },
  ],

  // state 3 — the work itself. Four sentences became four rows.
  3: [
    {
      orders: [
        { label: 'Reserve step-down bed B-12', detail: 'Bed management · operational', autonomy: 'autonomous' },
        { label: 'Page portering for transfer', detail: 'Transport · operational', autonomy: 'autonomous' },
        { label: 'Reconcile Bed 8 orders in eMAR', detail: 'TARS writing to eMAR', autonomy: 'autonomous' },
      ],
    },
    // ...and the one it is NOT allowed to take. The panel stops here until a
    // human signs, which is the only moment in the ward that proves the gate.
    {
      orders: [
        { label: 'Discontinue norepinephrine — Bed 8', detail: 'Clinical decision · requires sign-off', autonomy: 'gated' },
      ],
    },
  ],

  // state 4 — the bed turns over
  4: [
    {
      who: 'tars',
      status: 'bed in turnover',
      html: `Signed. Jagan is on the ward, housekeeping has Bed 8.`,
    },
  ],

  // state 5 — clean & ready
  5: [
    {
      who: 'tars',
      status: 'level-3 available',
      html: `Bed 8 turned — <span class="em">clean, ready, Level-3.</span>`,
    },
  ],

  // state 6 — the inbound, and the read that reroutes him
  6: [
    {
      who: 'tars',
      status: 'routing the inbound',
      html: `Inbound: chest pain, <b>nine minutes out</b>. Bed 8.`,
    },
    {
      who: 'isam',
      status: 'reading the pre-hospital ECG',
      html: `Pre-hospital twelve-lead is through — <b style="color:var(--redD)">front-wall OMI · de Winter pattern.</b> No ST elevation in any territory.`,
    },
    // the ward's OWN job. Pre-warning the lab and paging Mensah both already
    // happened in the ER — repeating them here made the cath lab climb its
    // ladder twice. What a ward actually does with an inbound is receive him.
    {
      orders: [
        { label: 'Route to Bed 8', detail: 'Bed management · operational', autonomy: 'autonomous' },
        { label: 'Cardiac monitor to the bay', detail: 'Equipment · 5-lead + defib standby', autonomy: 'autonomous' },
        { label: 'Notify receiving nurse', detail: 'N. Adeyemi · operational', autonomy: 'autonomous' },
      ],
    },
  ],

  // state 7 — arrival. The loading doses are NOT ordered here: the Patient Hub
  // already gates ticagrelor + heparin together right after the verdict, with a
  // nurse step behind it. Ordering heparin twice was the duplicate.
  7: [
    {
      who: 'tars',
      status: 'bed 8 occupied',
      html: `Chandrababu is in. Monitors live, feed continuous.`,
    },
  ],

  // state 8 — the trajectory turns
  8: [
    {
      who: 'isam',
      status: 'trajectory rising',
      html: `He is not settling — rate climbing, sats falling. <b style="color:var(--redD)">This one is going the wrong way, fast.</b>`,
    },
  ],

  // state 9 — into the record
  9: [
    {
      who: 'tars',
      status: 'opening the patient hub',
      html: `Taking us in.`,
    },
  ],
}
