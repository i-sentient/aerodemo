// ============================================================================
//  TRANSIT AGENT SCRIPT — what TARS says while the patient is between rooms.
//
//  This is the one stretch of the act where nobody is standing anywhere. The ER
//  is behind him, the ICU has not received him, and the only thing happening is
//  a system reaching ahead. So the panel that manages the ward shows up HERE,
//  over the tower, with the human seat empty — the agents are talking to
//  services, not to a person, and every line is something they can do alone.
//
//  BOTH agents speak. Neither is railed to a room: iSAM has plenty to say about
//  a man in a lift, because the cost of the minutes he is spending in it is
//  exactly the kind of thing it computes. It states what the delay costs; TARS
//  states what it is doing about it. That alternation is the argument — the two
//  are not taking turns by rota, they are answering each other.
//
//  What TARS cannot do alone it does not raise here — the gated order belongs to
//  the ward, where there is finally somebody to refuse it.
//
//  Keyed by the transfer segment's phase (see IcuReturnView in App.tsx). Only
//  'onto' — while the thread draws. The settle before the dive is the
//  building's beat and wants no voice over it.
//  Same line shape as WARD_BEATS so both feed chat.js's wardBeat().
// ============================================================================
import type { WardLine } from './wardScript'

export const TRANSIT_BEATS: Record<string, WardLine[]> = {
  onto: [
    // iSAM opens, because the reason for everything that follows is a number
    // only it can produce: what the transfer costs him per minute.
    {
      who: 'isam',
      // the diagnosis wears --redD wherever iSAM commits it — the ward's
      // twelve-lead line and the Hub's "read stands" both do; this was the one
      // place the same phrase from the same agent came out in plain bold
      html: `Read is committed — <b style="color:var(--redD)">anterior OMI</b>. He doesn't need a ward bed, he needs an artery opened.`,
    },
    // No figure here on purpose. iSAM has an ECG and nothing else at this point
    // — the deterioration probability is a Hub number, produced once troponin is
    // back, and quoting it in a lift was inventing precision it had not earned.
    {
      who: 'isam',
      html: `Every minute of this transfer is myocardium. <b style="color:var(--redD)">Without reperfusion he deteriorates</b> — <span class="em">and the odds worsen with every minute he's in the lift.</span>`,
    },
    // TARS answers it — not reporting to nobody, answering iSAM
    {
      who: 'tars',
      // ICU-08, not ICU-04 — ICU-04 is J. Okonkwo and he is in it. And the lab
      // is PRE-ALERTED here: a pre-hospital ECG earns a pre-alert, and the
      // activation belongs to the Hub, once the troponin is back.
      html: `Then we don't wait for him to arrive. Level-3 bed <b>ICU-08</b> is held in his name, cath lab pre-alerted — <span class="em">door-to-balloon clock is running.</span>`,
    },
    {
      who: 'tars',
      html: `Dr. Mensah paged, interventional cardiology, acknowledged. Bay pre-warmed: monitor, vent, lines drawn.`,
    },
  ],
}
