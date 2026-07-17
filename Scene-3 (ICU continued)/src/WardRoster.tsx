import './ward-roster.css'
// @ts-ignore — plain-JS tars module, no type declarations
import { beds } from './tars/ontology.js'
import { bed8ForStep, type RosterRow } from './wardFloor'

// ---------------------------------------------------------------------------
//  WARD BED ROSTER — the patient list, top-left over the ICU 3D view.
//  Beds 1–7 read the shared `beds` ontology (static ambient ward); ICU-08 is
//  the story bed and changes with `step` (Jagan Mohan → turnover → Chandrababu).
//  Display-only.
// ---------------------------------------------------------------------------
type Bed = {
  id: string
  patient: { name: string; dx: string; acuity: 'stable' | 'watch' | 'critical' }
  traj: { news2: number }
}

function badgeLabel(news: string) {
  if (news === '—') return '—'
  if (news === 'IN') return 'IN'
  return `N2 ${news}` // nbsp so "N2 8" never wraps
}

export function WardRoster({
  step,
  armed = false,
  onSelect,
}: {
  step: number
  armed?: boolean
  onSelect?: (id: string) => void
}) {
  // ICU-08 exists in the tars ontology as the story's END state (Chandrababu,
  // post-admission) — during the ward tour its row is driven per-step by
  // bed8ForStep instead, so filter the ontology copy out (no duplicate rows).
  const ambient: RosterRow[] = (beds as Bed[])
    .filter((b) => b.id !== 'ICU-08')
    .map((b) => ({
      id: b.id,
      tone: b.patient.acuity,
      name: b.patient.name,
      dx: b.patient.dx,
      news: String(b.traj.news2),
    }))
  const rows = [...ambient, bed8ForStep(step)] // ICU-01…07 + the dynamic ICU-08

  return (
    <div className={'ward-roster' + (armed ? ' armed' : '')}>
      <div className="wr-tk">PATIENTS · select to scan ›</div>
      <div className="wr-list">
        {rows.map((r) => (
          <div
            className={'wr-row' + (r.alarm ? ' alarm' : '')}
            key={r.id}
            onClick={armed && onSelect ? () => onSelect(r.id) : undefined}
          >
            <span className={'wr-dot ' + r.tone} />
            <span className="wr-id">{r.id}</span>
            <span className="wr-nm">{r.name || '—'}</span>
            <span className="wr-dx">{r.dx}</span>
            <span className={'wr-news ' + r.tone}>{badgeLabel(r.news)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
