import { createRoot } from 'react-dom/client'
import { SentientICU } from './SentientICU'

// ---------------------------------------------------------------------------
//  CCU, standalone — the way it ran before the deck merge.
//  Mounts SentientICU with no onComplete/onPrevious, so it owns every key and
//  never tries to hand control back to a deck that isn't there: ← at the first
//  device wraps instead of exiting, → at the last ward beat holds.
//  ?shot=N (N = 0-9) still skips the intro and deep-links a tour beat.
// ---------------------------------------------------------------------------
createRoot(document.getElementById('root')).render(<SentientICU />)
