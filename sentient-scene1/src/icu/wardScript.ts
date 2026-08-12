// ============================================================================
//  WARD-PHASE AGENT SCRIPT — what TARS / the SAMs say at each ICU state.
//  Key = the ICU step (the Nth right-arrow press). Value = that step's beat:
//  a list of { who, html } lines played in sequence in the docked Panel B.
//    who:  'tars' | 'isam' (agents) · 'clinician' | 'nurse' (humans)
//  LSam is retired — it is PLEXUS now, and PLEXUS carries signal rather than
//  speaking. Its lines were re-bucketed by what each line IS, not by who used
//  to say it: anything scored, trended or judged is iSAM; anything that books,
//  pages or reconciles is TARS.
//    html: message body — supports <b>, and <span class="em"> for emphasis.
//  ⚠ PLACEHOLDER CONTENT — rewrite these lines with the real dialogue.
// ============================================================================
export type WardLine = { who: string; html: string }

export const WARD_BEATS: Record<number, WardLine[]> = {
  // state 2 — the unit + why we're making room (capacity motivation), Bed 8 flagged
  2: [
    { who: 'isam', html: `Overnight scan's in — ICU·North, <b>eight beds</b>. Seven holding steady.` },
    { who: 'tars', html: `Cardiology just called: a STEMI's inbound and there's no Level-3 bed. Let me find them one.` },
    { who: 'isam', html: `Bed 8 — <b>Jagan Mohan</b>. Sepsis, but he's turned the corner: off pressors, NEWS2 down to 2. <span class="em">He's ready to step down.</span>` },
  ],

  // state 3 — hero push-in · violet orb grows (patient lifted out)
  3: [
    { who: 'tars', html: `Moving him — step-down bed booked, porters paged. All handled.` },
  ],

  // state 4 — orb shrinks away · bed brown/blinking (dirty, needs making)
  4: [
    { who: 'tars', html: `Jagan's on his way to the ward. Housekeeping's turning Bed 8 now.` },
  ],

  // state 5 — bed blue (clean & ready)
  5: [
    { who: 'tars', html: `Bed 8 turned — <span class="em">clean and ready.</span> There's your Level-3 bed.` },
  ],

  // state 6 — red orb + halo (inbound critical patient)
  6: [
    { who: 'tars', html: `And here's the inbound — chest pain, <b>nine minutes out</b>. Routing him to Bed 8.` },
    { who: 'isam', html: `Pre-hospital ECG's already through — <b style="color:var(--redD)">front-wall STEMI pattern.</b> I'd pre-warn the cath lab.` },
  ],

  // state 7 — arrival · patient solidifies onto the bed
  7: [
    { who: 'tars', html: `Chandrababu's in. Bed 8 occupied, monitors live.` },
  ],

  // state 8 — bed blinks red (deterioration)
  8: [
    { who: 'isam', html: `He's not settling — heart rate climbing, sats dropping. <b style="color:var(--redD)">This one's going the wrong way, fast.</b>` },
  ],

  // state 9 — the dive: hand straight into his Patient Hub (→ enters)
  9: [
    { who: 'tars', html: `Taking us in — opening his Patient Hub.` },
  ],
}
