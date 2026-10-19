// ---------------------------------------------------------------------------
//  CRITICAL CARE UNIT — bedside equipment overview, drawn in SVG.
//  Replaces the AI-generated raster this slide used to ship: that image was
//  soft at projection size and its labels were garbled ("Equipments you may
//  see", "a large central into to enable semitline"), which is not something
//  you want on screen in front of clinicians.
//  Re-cut from the original's scatter into two honest columns — what goes IN
//  the patient on the left, what stands AT the bedside on the right — with a
//  leader from every label to the part of the body it touches.
// ---------------------------------------------------------------------------

type Item = {
  name: string
  sub?: string
  desc: string[]          // pre-wrapped: SVG has no text flow
  color: string
  to: [number, number]    // where the leader lands on the body
  keep?: boolean          // survives the focus pass — these six are the ones
}                         // the 3D ward actually builds, one per beat

const AIRWAY = '#5fe8c8'
const LINE = '#ff9ad5'
const MONITOR = '#8fd0ff'
const RENAL = '#ffa8c8'
const CARE = '#ffd77a'

// body anchor points on the silhouette (cx = 800)
const MOUTH: [number, number] = [800, 258]
const NECK: [number, number] = [772, 318]
const CHEST: [number, number] = [800, 400]
const ARM_L: [number, number] = [703, 487]
const ARM_R: [number, number] = [897, 487]
const WRIST_L: [number, number] = [690, 566]
const WRIST_R: [number, number] = [910, 566]
const BACK: [number, number] = [836, 452]
const GROIN: [number, number] = [800, 610]
const LEG: [number, number] = [776, 742]

const LEFT: Item[] = [
  { name: 'Oral endotracheal (ET) tube', color: AIRWAY, to: MOUTH,
    desc: ['Passed down the windpipe through the mouth', 'to connect the patient to a ventilator.'] },
  { name: 'Tracheostomy tube', color: AIRWAY, to: NECK,
    desc: ['Placed into the windpipe through the neck. Protects', 'the airway and helps clear secretions.'] },
  { name: 'Ventilation mask', color: AIRWAY, to: MOUTH,
    desc: ['Tight-fitting mask attached to a ventilator', 'to support breathing without a tube.'] },
  { name: 'High-flow oxygen', sub: 'Optiflow', color: AIRWAY, to: MOUTH,
    desc: ['Delivers warmed, humidified oxygen and air', 'at high flow through nasal prongs.'] },
  { name: 'Central venous catheter', color: LINE, to: NECK,
    desc: ['A tube into a large central vein for drugs that', 'cannot go peripherally, and for pressure readings.'] },
  { name: 'Arterial line', color: LINE, to: WRIST_L,
    desc: ['A fine line in an artery — beat-to-beat blood', 'pressure, and the route for blood gas samples.'] },
  { name: 'Infusion pumps', color: LINE, to: ARM_L, keep: true,
    desc: ['Deliver fluids and continuous drugs — sedation,', 'pain relief, antibiotics, vasopressors.'] },
  { name: 'Syringe pumps', color: LINE, to: ARM_L, keep: true,
    desc: ['Drive a single syringe at millilitres per hour for', 'drugs that need a precise, low rate.'] },
  { name: 'PCA pump', sub: 'Patient controlled analgesia', color: LINE, to: ARM_L,
    desc: ['Gives a metered dose of intravenous pain relief', 'when the patient presses the handset.'] },
  { name: 'Feeding pump', color: CARE, to: MOUTH,
    desc: ['Delivers liquid feed at a controlled rate through', 'a fine tube passed via the nose to the stomach.'] },
]

const RIGHT: Item[] = [
  { name: 'Ventilator', color: AIRWAY, to: CHEST, keep: true,
    desc: ['Breathes for the patient — moves oxygen into the', 'lungs and carbon dioxide out.'] },
  { name: 'Suction machine', color: AIRWAY, to: NECK,
    desc: ['Clears secretions from the airway when the patient', 'is too weak or too sedated to cough.'] },
  { name: 'Patient monitor', color: MONITOR, to: CHEST, keep: true,
    desc: ['The bedside screen — heart rhythm and rate,', 'oxygen saturation, blood pressure, temperature.'] },
  { name: 'Defibrillator', color: '#ff9a7a', to: CHEST, keep: true,
    desc: ['Delivers a controlled shock to reset the heart', 'when the rhythm collapses. Kept charged, at hand.'] },
  { name: 'Cardiac output monitor', sub: 'Doppler', color: MONITOR, to: CHEST,
    desc: ['Measures how much blood the heart is actually', 'moving, not just how fast it is beating.'] },
  { name: 'Blood gas analyser', sub: 'ABG', color: MONITOR, to: WRIST_R,
    desc: ['Reads oxygen, carbon dioxide and acid levels', 'from a small arterial sample, taken regularly.'] },
  { name: 'Haemofiltration machine', color: RENAL, to: GROIN, keep: true,
    desc: ['Continuous dialysis — clears toxins and excess', 'fluid when the kidneys have stopped.'] },
  { name: 'Urinary catheter', color: RENAL, to: GROIN,
    desc: ['Drains and measures urine, the most direct', 'hourly read on how the kidneys are coping.'] },
  { name: 'Epidural', color: LINE, to: BACK,
    desc: ['A fine tube into the space around the spinal', 'cord, delivering regional pain relief.'] },
  { name: 'Flowtron therapy', color: CARE, to: LEG,
    desc: ['Sleeves that inflate and release in a cycle to', 'keep blood moving and prevent clots.'] },
]

const TOP = 150, GAP = 73
const L_X = 46, R_X = 1554

function Block({ item, i, side, phase }: { item: Item; i: number; side: 'l' | 'r'; phase: number }) {
  const y = TOP + i * GAP
  const left = side === 'l'
  const x = left ? L_X : R_X
  const anchor = left ? 'start' : 'end'
  const dotX = left ? x - 16 : x + 16
  const edge = left ? 470 : 1130
  const [bx, by] = item.to
  const mx = edge + (bx - edge) * 0.55
  // ONE path, authored body → label so the dash reveal runs outward from the
  // patient. pathLength=1 normalises every curve so they all draw in step
  // regardless of actual length.
  const d = `M${bx},${by} C${mx},${by} ${mx},${y - 4} ${edge},${y - 4} H${x}`

  const on = phase >= 1
  const dim = phase >= 2 && !item.keep
  const t = i * 55                              // stagger down the column
  const ease = 'cubic-bezier(0.22, 1, 0.36, 1)'
  return (
    <g style={{ opacity: dim ? 0.08 : 1, transition: 'opacity 700ms ease' }}>
      <path
        d={d} stroke={item.color} strokeWidth="1" fill="none" opacity="0.34"
        pathLength={1} strokeDasharray="1" strokeDashoffset={on ? 0 : 1}
        style={{ transition: `stroke-dashoffset 780ms ${ease} ${t}ms` }}
      />
      <g style={{ opacity: on ? 1 : 0, transition: `opacity 420ms ease ${t + 620}ms` }}>
        <circle cx={dotX} cy={y - 9} r="4.5" fill={item.color} />
        <text x={x} y={y} textAnchor={anchor} fill="#eef4f8" fontSize="18" fontWeight="700" letterSpacing="0.1">
          {item.name}
          {item.sub && <tspan fill="#7d93a5" fontSize="13" fontWeight="500">  {item.sub}</tspan>}
        </text>
        {item.desc.map((s, k) => (
          <text key={k} x={x} y={y + 19 + k * 16} textAnchor={anchor} fill="#8ea3b2" fontSize="13" fontWeight="400">{s}</text>
        ))}
      </g>
    </g>
  )
}

// phase 0 · the patient alone   1 · leaders draw out, labels land
// phase 2 · everything but the six machines the ward builds falls away
export function CriticalCareOverview({ phase = 1 }: { phase?: number } = {}) {
  return (
    <svg viewBox="0 0 1600 900" style={{ width: '100vw', height: '100vh', display: 'block' }} role="img"
      aria-label="Critical Care Unit — bedside equipment overview">
      <defs>
        <filter id="cco-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="9" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <linearGradient id="cco-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2fd4ff" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#2fd4ff" stopOpacity="0.12" />
        </linearGradient>
        {/* fine grid + a heavier 200px rule over it, the way the source read */}
        <pattern id="cco-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40,0 H0 V40" fill="none" stroke="#16303f" strokeWidth="1" />
        </pattern>
        <pattern id="cco-grid-lg" width="200" height="200" patternUnits="userSpaceOnUse">
          <path d="M200,0 H0 V200" fill="none" stroke="#28576f" strokeWidth="1.2" />
        </pattern>
        {/* the grid is strongest around the patient and falls away under the
            label columns, so it never fights the type */}
        <radialGradient id="cco-fade" cx="50%" cy="55%" r="52%">
          <stop offset="0%" stopColor="#fff" stopOpacity="1" />
          <stop offset="55%" stopColor="#fff" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0.06" />
        </radialGradient>
        <mask id="cco-gridmask"><rect width="1600" height="900" fill="url(#cco-fade)" /></mask>
        <radialGradient id="cco-halo" cx="50%" cy="55%" r="42%">
          <stop offset="0%" stopColor="#0d3a4d" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#0d3a4d" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="1600" height="900" fill="#05090d" />
      <rect width="1600" height="900" fill="url(#cco-halo)" />
      <g mask="url(#cco-gridmask)">
        <rect width="1600" height="900" fill="url(#cco-grid)" />
        <rect width="1600" height="900" fill="url(#cco-grid-lg)" />
      </g>

      {/* title */}
      <text x="46" y="66" fill="#eef4f8" fontSize="38" fontWeight="800" letterSpacing="-0.5">Critical Care Unit</text>
      <text x="46" y="94" fill="#2fd4ff" fontSize="15" fontWeight="600" letterSpacing="2.4">EQUIPMENT YOU MAY SEE AT THE BEDSIDE</text>
      <text x="1554" y="66" textAnchor="end" fill={phase >= 2 ? '#2fd4ff' : '#5b6b78'} fontSize="13" fontWeight="600" letterSpacing="2"
        style={{ opacity: phase >= 1 ? 1 : 0, transition: 'opacity 500ms ease, fill 700ms ease' }}>
        {phase >= 2 ? 'SIX MACHINES  ·  ONE PATIENT' : 'IN THE PATIENT  ·  AT THE BEDSIDE'}
      </text>
      <path d="M46,112 H1554" stroke="#1b2833" strokeWidth="1" />

      {/* the patient — a soft lit figure the leaders can land on */}
      <g filter="url(#cco-glow)" opacity="0.9">
        <circle cx="800" cy="272" r="42" fill="url(#cco-body)" stroke="#2fd4ff" strokeWidth="1.6" strokeOpacity="0.55" />
        <path d="M760,336 Q800,320 840,336 L852,470 Q852,560 838,616 L762,616 Q748,560 748,470 Z"
          fill="url(#cco-body)" stroke="#2fd4ff" strokeWidth="1.6" strokeOpacity="0.55" />
        <path d="M756,352 L700,470 L688,580" fill="none" stroke="#2fd4ff" strokeWidth="15" strokeOpacity="0.22" strokeLinecap="round" />
        <path d="M844,352 L900,470 L912,580" fill="none" stroke="#2fd4ff" strokeWidth="15" strokeOpacity="0.22" strokeLinecap="round" />
        <path d="M778,616 L772,760 L768,838" fill="none" stroke="#2fd4ff" strokeWidth="19" strokeOpacity="0.22" strokeLinecap="round" />
        <path d="M822,616 L828,760 L832,838" fill="none" stroke="#2fd4ff" strokeWidth="19" strokeOpacity="0.22" strokeLinecap="round" />
      </g>
      {/* the bed the figure lies on */}
      <rect x="676" y="852" width="248" height="12" rx="6" fill="#16222c" />

      {LEFT.map((it, i) => <Block key={it.name} item={it} i={i} side="l" phase={phase} />)}
      {RIGHT.map((it, i) => <Block key={it.name} item={it} i={i} side="r" phase={phase} />)}
    </svg>
  )
}
