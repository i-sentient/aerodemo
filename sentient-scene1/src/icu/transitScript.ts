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
      html: `Read is committed — <b>anterior OMI</b>. He doesn't need a ward bed, he needs an artery opened.`,
    },
    {
      who: 'isam',
      html: `Every minute of this transfer is myocardium. <b style="color:var(--redD)">86%</b> he deteriorates without reperfusion — <span class="em">and that number climbs while he's in the lift.</span>`,
    },
    // TARS answers it — not reporting to nobody, answering iSAM
    {
      who: 'tars',
      html: `Then we don't wait for him to arrive. Level-3 bed <b>ICU-04</b> is held in his name, cath lab activated — <span class="em">door-to-balloon clock is running from now, not from the door.</span>`,
    },
    {
      who: 'tars',
      html: `Dr. Mensah paged, interventional cardiology, acknowledged. Bay pre-warmed: monitor, vent, lines drawn.`,
    },
  ],
}
