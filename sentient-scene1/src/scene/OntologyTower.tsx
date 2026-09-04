// ===========================================================================
//  ONTOLOGY VIEW — the building as TARS sees it.
//
//  A mode, not a replacement: the sculpted tower dissolves into a transparent
//  lattice and every tier declares what it contains, in the same EntityKind
//  vocabulary the rest of the app runs on (patient / clinician / device / bed).
//
//  Two things make this more than a sci-fi prop:
//   1. the classes are the app's real type system, not decoration;
//   2. PROVENANCE is visible — the A/B/C axis (sensed / inferred / asserted)
//      that already drives the hero glass's opacity. You can look at a floor
//      and see how much of what it "knows" was measured and how much it was
//      merely told. Film holograms can't do that, because their data is fake.
//
//  Density is handled the way games do it: aggregate far, individuate near.
//  Whole building → per-floor counts. Focused floor → the objects themselves.
// ===========================================================================
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import {
  AdditiveBlending,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DoubleSide,
  EdgesGeometry,
  ExtrudeGeometry,
  MathUtils,
  MeshBasicMaterial,
  TubeGeometry,
  Vector3,
  type Group,
  type LineBasicMaterial,
  type Mesh,
} from 'three'
import {
  FLOORS, FLOOR_VOLS, squircleShape, twinShape, hexOutline, roomVol, BRIDGE_W,
  type FloorVol, type FloorBlockVol,
} from './BuildingStack'
import {
  CENSUS_KINDS, KIND_STYLE, censusFor, suppliesPct, TOTALS, TOTAL_PROVENANCE, JOURNEY, FLOOR_TITLE,
  type MarkShape,
} from '../ontology/census'
import { FloorExplode } from './FloorExplode'

const HOLO = '#5fd0e6'
const HOLO_DIM = 'rgba(95,208,230,0.42)'

// The hologram sits at the building's OWN tier spacing. Exploding the stack was
// tried and reverted: it stopped being the building and became a diagram of it.
const yOf = (v: FloorVol) => v.y

/** Both label columns stand off at the SAME fixed distance, so they read as two
 *  columns flanking the tower rather than tags stuck onto each tier. Following
 *  each tier's own `reach` made the edge ragged — the masses run 5.2 to 7.5
 *  wide — and hugging the silhouette is exactly what glued them to the floors. */
const LABEL_COL = Math.max(...FLOOR_VOLS.map((v) => v.reach)) + 4.4

// Leader-line colour, kept deliberately UNLIKE the building: a solid cyan line
// at any real opacity reads as another wall edge, so the leaders are a dashed
// pale ink — the map convention for "this label points there".
const LEADER_INK = '#bcd7e0'

// ---------------------------------------------------------------------------
//  Mass material. Same triplanar cell shader as the ICU body twin, retuned for
//  BUILDING scale: the body wants ~44 cells/unit over 1.8 m, a tower wants ~2
//  cells/unit so the grid reads as half-metre panels rather than fabric.
//
//  `uGrid` sets how strongly the cell grid is struck across a mass:
//    GRID_IDLE — barely there. Enough panelisation to read as a built surface
//                rather than a blank pane, but carrying no claim.
//    1         — the grid at full strength. This is what selection looks like.
//
//  Selection is a change of DEGREE, not of kind: the same grid, turned up. A
//  mass that had no grid at all read as bland, and a mass that lost its grid on
//  selection read as something being taken away. Turning one up says "here".
// ---------------------------------------------------------------------------
// The wash under the lines — almost transparent, just enough that a volume
// reads as a volume. Shared by both states so the box never changes density;
// only the lines over it get stronger.
const FILL_AMBIENT = 0.03
const SHADE = FILL_AMBIENT
/** how much grid an UNSELECTED mass carries — light enough to be surface, not
 *  signal, so the selected mass still arrives as an event */
const GRID_IDLE = 0.22
/** what's left of a mass's roof and floor — see the note in the fragment
 *  shader. Separate dials: the roof is pure obstruction so it goes almost all
 *  the way out, while the floor is still the plane the care units stand on, so
 *  it is pulled back rather than removed. */
const TOP_FADE = 0.1
const BASE_FADE = 0.3

function makeLattice(density = 2.1, opacity = 0.95) {
  const m = new MeshBasicMaterial({ color: HOLO, transparent: true, opacity, depthWrite: false, side: DoubleSide, toneMapped: false })
  // held on the material so the per-frame damp can reach it without waiting for
  // onBeforeCompile, which only runs once the mass is first rendered
  const uGrid = { value: GRID_IDLE }
  m.userData.uGrid = uGrid
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uDensity = { value: density }
    sh.uniforms.uGrid = uGrid
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGP;\nvarying vec3 vGN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vGP = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vGN = normalize(mat3(modelMatrix) * normal);`)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uDensity; uniform float uGrid; varying vec3 vGP; varying vec3 vGN;
        float lattice(vec2 p){ vec2 c = p * uDensity; vec2 d = abs(fract(c - 0.5) - 0.5) / max(fwidth(c), 1e-5); return 1.0 - min(min(d.x, d.y), 1.0); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 gn = normalize(vGN);
        vec3 bw = pow(abs(gn), vec3(4.0));
        bw /= max(bw.x + bw.y + bw.z, 1e-5);
        float line = lattice(vGP.zy) * bw.x + lattice(vGP.xz) * bw.y + lattice(vGP.xy) * bw.z;
        float grid = clamp(line, 0.0, 1.0) * 0.9 + ${FILL_AMBIENT.toFixed(3)};
        diffuseColor.a *= mix(${SHADE.toFixed(3)}, grid, uGrid);
        // Fade the caps. Nothing depth-writes and the material is DoubleSide,
        // so looking down into a tier stacks four gridded surfaces — top cap,
        // near wall, far wall, floor — and that doubled the apparent density
        // exactly where the objects inside need to be read. The roof is pure
        // obstruction so it goes nearly all the way; the floor is pulled back
        // but kept, because it is the plane the care units stand on. Both
        // thresholds are tight enough that the command crown's sloped wall
        // (n.y ~ 0.68) is never caught by either.
        diffuseColor.a *= mix(1.0, ${TOP_FADE.toFixed(2)}, smoothstep(0.82, 0.98, gn.y));
        diffuseColor.a *= mix(1.0, ${BASE_FADE.toFixed(2)}, smoothstep(0.82, 0.98, -gn.y));
        if (diffuseColor.a < 0.004) discard;`)
  }
  return m
}

// cyan while it is simply part of the building, green once it is the subject
const C_MASS = new Color(HOLO)
const C_MASS_SEL = new Color('#7dffd0')
const C_EDGE = new Color('#8fe6f5')
const C_EDGE_SEL = new Color('#9dffe0')
const EDGE_ON = 0.9
const EDGE_SEL = 1

// ---------------------------------------------------------------------------
//  Per-tier volume — traced from the building's OWN silhouette constants, so
//  the hologram lands exactly where the solid tier was.
// ---------------------------------------------------------------------------
function blockGeometry(b: FloorBlockVol, h: number): BufferGeometry {
  // Capped, not open tubes: every other mass on the tower is an extrusion with
  // a front and back face, so a capless drum was the one volume without a roof
  // or a base. The caps carry the same grid and wash as the walls, and because
  // a cap is a coplanar triangle fan it adds no radial spokes to the outline —
  // the silhouette stays the two rims it already was.
  if (b.shape === 'drum') return new CylinderGeometry(b.r, b.r, h, 72, 1, false)
  if (b.shape === 'crown') return new CylinderGeometry(b.r, b.r * 0.8, h, 72, 1, false)
  // hex tiers carry a stretched forward vertex; twin slabs are half-width
  // squircles. Both are traced from the building's own outline functions so the
  // hologram can't drift from the solid tier it replaces.
  const shape = b.shape === 'hex' ? hexOutline() : b.shape === 'twin' ? twinShape() : squircleShape(b.halfW, b.halfD)
  const g = new ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 72, steps: 1 })
  g.center()
  g.rotateX(-Math.PI / 2)
  return g
}

function BlockVolume({ b, h, hot, open }: { b: FloorBlockVol; h: number; hot: boolean; open: boolean }) {
  const geo = useMemo(() => blockGeometry(b, h), [b, h])
  const edges = useMemo(() => new EdgesGeometry(geo, 25), [geo])
  // Per-block material rather than one shared module-level pair: a mass can
  // only change state independently if it owns the material being changed.
  const mat = useMemo(() => makeLattice(), [])
  const lineRef = useRef<LineBasicMaterial>(null)
  // Only the selected ROOM grids — not its floor. On a twin tier that means the
  // Cath Lab hexagon strikes green while the Imaging hexagon beside it stays a
  // plain shaded mass, so the highlight reads as "this room", not "this level".
  const selected = open && hot
  useFrame((_, dt) => {
    const k = 1 - Math.exp(-3.6 * dt) // frame-rate independent, same curve as damp
    mat.userData.uGrid.value = MathUtils.damp(mat.userData.uGrid.value, selected ? 1 : GRID_IDLE, 3.6, dt)
    mat.color.lerp(selected ? C_MASS_SEL : C_MASS, k)
    if (lineRef.current) {
      lineRef.current.color.lerp(selected ? C_EDGE_SEL : C_EDGE, k)
      lineRef.current.opacity = MathUtils.damp(lineRef.current.opacity, selected ? EDGE_SEL : EDGE_ON, 3.6, dt)
    }
  })
  return (
    <group position={[b.x, 0, 0]}>
      <mesh geometry={geo} material={mat} renderOrder={2} />
      <lineSegments geometry={edges} renderOrder={3}>
        {/* colour is animated per frame, so it starts neutral and is lerped to
            green only while this room is the selected one */}
        <lineBasicMaterial ref={lineRef} color={C_EDGE} transparent opacity={EDGE_ON} toneMapped={false} />
      </lineSegments>
    </group>
  )
}

function FloorVolume({ v, hotRoom, open }: { v: FloorVol; hotRoom?: string; open: boolean }) {
  return (
    <group position={[0, yOf(v), 0]}>
      {v.blocks.map((b, i) => (
        <BlockVolume key={i} b={b} h={v.h} hot={b.room === hotRoom} open={open} />
      ))}
      {/* the glazed link bridge across a twin tier's centre gap */}
      {v.bridge && (
        <mesh renderOrder={2}>
          <boxGeometry args={[BRIDGE_W, v.h * 0.46, 1.7]} />
          <meshBasicMaterial color={HOLO} transparent opacity={0.34} wireframe toneMapped={false} />
        </mesh>
      )}
    </group>
  )
}

// ---------------------------------------------------------------------------
//  SIDE ANCHOR — pins a label to a fixed side of the SCREEN, not a fixed side
//  of the building.
//
//  There are two information layers here that must never be confused: what the
//  building contains (census, left) and where the patient went (journey,
//  right). Anchoring them to world coordinates worked only while the tower
//  stood still — once it orbits, world-left swings around to screen-right and
//  the two layers cross and read as one soup. So each frame we take the
//  camera's own right vector, flatten it, and place the label along that
//  instead. The tower turns; the labels stay where you are reading them.
// ---------------------------------------------------------------------------
function SideAnchor({ side, dist, y, children }: { side: 1 | -1; dist: number; y: number; children: ReactNode }) {
  const ref = useRef<Group>(null)
  useFrame(({ camera }) => {
    // column 0 of the camera's world matrix is its right axis
    const e = camera.matrixWorld.elements
    const len = Math.hypot(e[0], e[2]) || 1
    ref.current?.position.set((side * e[0] / len) * dist, y, (side * e[2] / len) * dist)
  })
  return <group ref={ref}>{children}</group>
}

// ===========================================================================
//  FLOOR TAGS — the aggregate "far LOD" read, as a SCREEN-SPACE HUD.
//
//  These used to be 3D objects billboarded beside each tier, which meant they
//  inherited perspective: even world spacing projected to uneven screen gaps,
//  and wide tiers pushed cards off the left edge. They only ever appear while
//  the building is STATIC (the read-the-building beat, never during the orbit),
//  so there is no reason to place them in the world at all. As plain fixed DOM
//  in a flex column they get equal gaps and a fixed margin for free — the two
//  things that kept breaking. The one thing that must still track the 3D is the
//  leader line, so a tiny in-canvas projector publishes each tier's screen
//  point and the SVG overlay draws an elbow from card to tier.
// ===========================================================================

/** Bridge between the in-canvas projector and the DOM overlay: each tier's
 *  current screen point, in CSS pixels. Module-level because the two live on
 *  opposite sides of the R3F canvas boundary; only one tower mounts at a time. */
const TIER_PROJ = FLOOR_VOLS.map(() => ({ x: 0, y: 0, vis: false }))
// ER points its leader at the DRUM WALL, not the tier axis: the axis projects to
// the drum's top edge (it looks like it floats above the drum), so ER instead
// targets the lower-left of the drum's near face — down, and on the side the
// leader arrives from. Projected live because it moves with the camera.
const ER_WALL = { x: 0, y: 0, vis: false }

/** In-canvas: project each tier's axis point to the screen every frame. Cheap,
 *  and it is the only part of the tag system that needs the camera. */
function LeaderProjector({ active }: { active: boolean }) {
  const p = useMemo(() => new Vector3(), [])
  useFrame(({ camera, size }) => {
    for (let i = 0; i < FLOOR_VOLS.length; i++) {
      const t = TIER_PROJ[i]
      if (!active) { t.vis = false; continue }
      p.set(0, FLOOR_VOLS[i].y, 0).project(camera)
      t.x = (p.x * 0.5 + 0.5) * size.width
      t.y = (-p.y * 0.5 + 0.5) * size.height
      t.vis = p.z < 1
    }
    // ER's leader targets the drum's lower-left near face rather than its axis
    const er = FLOOR_VOLS[0]
    ER_WALL.vis = active
    if (active) {
      p.set(-er.blocks[0].r * 0.7, er.y - er.h / 2, er.blocks[0].r * 0.7).project(camera)
      ER_WALL.x = (p.x * 0.5 + 0.5) * size.width
      ER_WALL.y = (-p.y * 0.5 + 0.5) * size.height
    }
  })
  return null
}

const TAG_W = 300
const TAG_H = 116
const cardBox: CSSProperties = {
  position: 'relative',
  boxSizing: 'border-box',
  width: TAG_W,
  height: TAG_H,
  display: 'flex',
  flexDirection: 'column',
  background: 'rgba(6,14,20,0.72)',
  border: `1px solid ${HOLO_DIM}`,
  borderRight: `2px solid ${HOLO}`,
  borderRadius: 3,
  padding: '7px 11px 8px',
  backdropFilter: 'blur(8px)',
  fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
}
const bracket: CSSProperties = {
  position: 'absolute', top: -1, right: -1, width: 12, height: 12,
  borderTop: `2px solid ${HOLO}`, borderRight: `2px solid ${HOLO}`, borderTopRightRadius: 3,
}

/** One floor's card — pure content, positioned by the flex column around it. */
function FloorCard({ floorId, floorLabel, sub }: { floorId: string; floorLabel: string; sub: string }) {
  const c = censusFor(floorId)
  if (!c) return null
  const total = CENSUS_KINDS.reduce((s, k) => s + c.counts[k], 0)
  const supplies = suppliesPct(c)
  return (
    <div style={cardBox}>
      <span style={bracket} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, minWidth: 0 }}>
        <span style={{ font: '700 16px ui-monospace, monospace', color: '#dffaff', letterSpacing: '.09em', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis' }}>{floorLabel}</span>
        <span style={{ font: '500 11px ui-monospace, monospace', color: 'rgba(150,215,235,.6)' }}>{sub}</span>
      </div>
      {/* fixed 3x2 grid so a floor missing a class keeps the card's height */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px 11px', marginTop: 7 }}>
        {CENSUS_KINDS.map((k) => (
          <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: c.counts[k] ? 1 : 0.22 }}>
            <i style={{ width: 7, height: 7, borderRadius: 1, background: KIND_STYLE[k].color, display: 'inline-block', flex: '0 0 auto' }} />
            <b style={{ font: '700 13px ui-monospace, monospace', color: '#eafcff' }}>{c.counts[k]}</b>
            <em style={{ font: '600 10px ui-monospace, monospace', fontStyle: 'normal', color: 'rgba(150,215,235,.62)' }}>{KIND_STYLE[k].label}</em>
          </span>
        ))}
      </div>
      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 9 }}>
        <div style={{ display: 'flex', height: 3, flex: 1, borderRadius: 2, overflow: 'hidden' }}>
          <i style={{ width: `${c.provenance.A}%`, background: '#4fdf8f' }} />
          <i style={{ width: `${c.provenance.B}%`, background: '#e0b34c' }} />
          <i style={{ width: `${c.provenance.C}%`, background: 'rgba(200,225,235,.35)' }} />
        </div>
        <span style={{ font: '700 10.5px ui-monospace, monospace', color: supplies !== null && supplies < 34 ? '#e8c877' : 'rgba(190,235,245,.75)', flex: '0 0 auto' }}>
          {supplies !== null ? `${supplies}% supplies` : '— no supplies'}
        </span>
      </div>
      <div style={{ font: '600 9.5px ui-monospace, monospace', color: 'rgba(150,215,235,.5)', marginTop: 5, letterSpacing: '.04em', whiteSpace: 'normal', lineHeight: 1.35 }}>
        {c.provenance.A}% SENSED · {c.provenance.B}% INFERRED · {c.provenance.C}% ASSERTED · {total} OBJECTS
      </div>
    </div>
  )
}

/**
 * The left column + its leader lines. `space-between` on a fixed-height column
 * gives every card the SAME vertical gap with no math, and a fixed left margin
 * means nothing can ever clip off-screen — the two problems that dogged the 3D
 * version. Order is top-of-building → bottom (Main Ward down to Emergency),
 * matching the tower, and Command is dropped (it has no ward-style census).
 *
 * Leaders are an SVG overlay under the cards; each frame a rAF loop reads the
 * card's live rect and the tier's projected point (TIER_PROJ) and draws an
 * orthogonal elbow. Because the camera is straight-on, every tier projects to
 * the SAME screen x (the building's axis) — so a leader always runs sideways
 * from centre to the card, and the only real choice is WHERE the vertical bend
 * sits. That is routed per floor (LEADER_ROUTE), because one rule looked wrong
 * on every floor at once:
 *   • tier — the bend sits at the tier (screen centre): a flat run at the card's
 *            level out over the building, then a vertical to the tier.
 *   • card — the bend sits just off the card: a short stub out, a vertical to
 *            the tier's level, then a flat run in to the tier.
 * A floor whose card happens to sit level with its tier collapses to ONE flat
 * run automatically (see leaderPoints) — which is why there is no fixed 'across'
 * style: level-ness depends on the window height, so it is detected live rather
 * than hard-assigned to a floor that is only level at one size. Dashed and pale,
 * dotted at the tier end, so it never reads as one of the building's own edges.
 */
type LeaderRoute = 'tier' | 'card'
const LEADER_ROUTE: Record<string, LeaderRoute> = {
  er: 'tier',
  imgcath: 'tier',
  theatres: 'tier',
  icu: 'card',
  wards: 'card',
  hdu: 'card',
}
const LEADER_STUB = 22 // the "short distance" the 'card' route steps out before turning
const LEVEL_EPS = 9    // within this many px, card and tier count as level → straight run
// Per-floor nudge of where the leader meets its card, off its vertical centre.
// For a 'tier' route the bend sits at this height, so raising the anchor raises
// the bend and shortens the vertical up to the tier. OR's is pulled UP so its
// run meets the tier with only a short riser instead of a tall one.
const LEADER_ANCHOR_DY: Record<string, number> = { theatres: -28 }

function leaderPoints(route: LeaderRoute, tp: { x: number; y: number }, ax: number, cy: number) {
  const f = (n: number) => n.toFixed(1)
  // Level with its tier: a single flat run, no bend. This is the clean case a
  // fixed 'across' style was reaching for, but earned from the live geometry so
  // whichever floor is level at the current height gets it — and none of them
  // draws a broken line to a dot it cannot reach.
  if (Math.abs(tp.y - cy) < LEVEL_EPS) return `${f(ax)},${f(cy)} ${f(tp.x)},${f(cy)}`
  if (route === 'card') {
    // stub runs toward the tower, i.e. away from the card's right-hand column
    const bx = ax - LEADER_STUB
    return `${f(ax)},${f(cy)} ${f(bx)},${f(cy)} ${f(bx)},${f(tp.y)} ${f(tp.x)},${f(tp.y)}`
  }
  // 'tier': flat at the card's level to the centre, then vertical to the tier
  return `${f(ax)},${f(cy)} ${f(tp.x)},${f(cy)} ${f(tp.x)},${f(tp.y)}`
}

function FloorHUD({ show }: { show: boolean }) {
  const floors = useMemo(
    () => FLOORS.map((f, i) => ({ f, i })).filter((x) => x.f.id !== 'command').reverse(),
    [],
  )
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])
  const lineRefs = useRef<(SVGPolylineElement | null)[]>([])
  const dotRefs = useRef<(SVGCircleElement | null)[]>([])
  useEffect(() => {
    let raf = 0
    const loop = () => {
      floors.forEach(({ f, i }, n) => {
        // ER aims at the drum wall; every other floor at its tier axis
        const tp = f.id === 'er' ? ER_WALL : TIER_PROJ[i]
        const card = cardRefs.current[n], line = lineRefs.current[n], dot = dotRefs.current[n]
        if (!card || !line || !dot) return
        if (!show || !tp.vis) { line.style.opacity = '0'; dot.style.opacity = '0'; return }
        const r = card.getBoundingClientRect()
        // The billboards sit on the RIGHT now, so the leader leaves their
        // LEFT edge — the near side facing the tower.
        const ax = r.left - 7
        const cy = r.top + r.height / 2 + (LEADER_ANCHOR_DY[f.id] ?? 0) // off the card's centre
        line.setAttribute('points', leaderPoints(LEADER_ROUTE[f.id] ?? 'tier', tp, ax, cy))
        // dot marks the tier the leader points AT — the map convention
        dot.setAttribute('cx', tp.x.toFixed(1)); dot.setAttribute('cy', tp.y.toFixed(1))
        line.style.opacity = '0.7'; dot.style.opacity = '0.9'
      })
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [floors, show])
  return (
    <>
      <svg style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 38 }}>
        {floors.map((_, n) => (
          <g key={n}>
            <polyline ref={(el) => { lineRefs.current[n] = el }} fill="none" stroke={LEADER_INK} strokeWidth={1.2} strokeDasharray="5 4" opacity={0} style={{ transition: 'opacity .3s ease' }} />
            <circle ref={(el) => { dotRefs.current[n] = el }} r={3.4} fill={LEADER_INK} opacity={0} style={{ transition: 'opacity .3s ease' }} />
          </g>
        ))}
      </svg>
      <div
        style={{
          position: 'fixed', right: 26, top: 88, bottom: 56, zIndex: 39,
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          alignItems: 'flex-end',
          pointerEvents: 'none', opacity: show ? 1 : 0, transition: 'opacity .34s ease',
        }}
      >
        {floors.map(({ f, i }, n) => (
          <div key={f.id} ref={(el) => { cardRefs.current[n] = el }}>
            <FloorCard floorId={f.id} floorLabel={f.twin ? `${f.label} / ${f.twin.label}` : f.label} sub={f.sub} />
          </div>
        ))}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
//  The journey thread — the one patient's route through the building. This is
//  what turns a census into a story: the same tower, with ONE line drawn
//  through the five rooms he actually passed.
// ---------------------------------------------------------------------------
// The thread is NOT a loop and it is not decoration. It advances exactly one leg
// each time Chandrababu physically moves between scenes — ER → ICU → Cath →
// OR-1 → Post-Op — and holds there. `upto` is how many stops he has reached, so
// the caller (the inter-scene transitions) drives it; at 0 nothing is drawn.
const TOTAL = JOURNEY.length - 1
/**
 * The route, built ONCE at module load instead of on mount.
 *
 * It depends on nothing but module-level data, yet it used to sit in a
 * `useMemo(..., [])` inside JourneyThread — so a 320-segment TubeGeometry plus
 * a 5x600 nearest-point search ran on the exact frame the thread appeared.
 * r3f hands the NEXT frame a `dt` that swallows that hitch, and the draw is a
 * dt-scaled damp, so `u` leapt most of the way in a single step: the transfer
 * arrived instead of drawing. Building it at import cost means the mount frame
 * is free.
 *
 * The geometry is shared, and `setDrawRange` mutates it — safe only because one
 * view renders at a time, so there is never a second live JourneyThread.
 */
const THREAD = (() => {
  const stops = JOURNEY.map((j) => {
    const hit = roomVol(j.floorId, j.room)!
    const b = hit.b
    const depth = b.shape === 'drum' || b.shape === 'crown' || b.shape === 'hex' ? b.r : b.halfD
    return new Vector3(b.x, yOf(hit.v), depth * 0.5)
  })
  const path: Vector3[] = []
  stops.forEach((p, i) => {
    path.push(p)
    if (i < stops.length - 1) {
      const n = stops[i + 1]
      // bow each leg out in front of the tower so legs never overlap
      path.push(new Vector3((p.x + n.x) / 2, (p.y + n.y) / 2, Math.max(p.z, n.z) + 2.1))
    }
  })
  const curve = new CatmullRomCurve3(path)
  const geo = new TubeGeometry(curve, 320, 0.05, 8, false)
  // Where each stop ACTUALLY falls along the curve. The legs are different
  // lengths (ER→ICU climbs four tiers, Cath→OR one) and each bows out by a
  // different amount, so `i / TOTAL` lands the thread short of — or past —
  // its dot. CatmullRom and TubeGeometry are both arc-length parameterised,
  // so measure against evenly-spaced samples and the tube ends on the node.
  const N = 600
  const samples = curve.getSpacedPoints(N)
  const uAt = stops.map((s) => {
    let best = 0
    let bd = Infinity
    for (let i = 0; i <= N; i++) {
      const d = samples[i].distanceToSquared(s)
      if (d < bd) { bd = d; best = i }
    }
    return best / N
  })
  return { curve, geo, stops, uAt }
})()

function JourneyThread({ upto, labels = true, handedOff = false, onSettled }: { upto: number; labels?: boolean; handedOff?: boolean; onSettled?: () => void }) {
  const { curve, geo, stops, uAt } = THREAD
  // fired once the thread stops MOVING, not once it starts — the same test the
  // head uses to hide itself, so "arrived" can never mean two different frames
  const settled = useRef(false)
  const onSettledRef = useRef(onSettled)
  onSettledRef.current = onSettled
  useEffect(() => { settled.current = false }, [upto])

  const rootRef = useRef<Group>(null)
  const fadeRef = useRef(1)
  const headRef = useRef<Mesh>(null)
  const tubeRef = useRef<Mesh>(null)
  const uRef = useRef(0)              // where the drawn thread currently ends
  const [reached, setReached] = useState(0)
  const reachedRef = useRef(0)
  const idxCount = geo.index ? geo.index.count : 0

  useFrame(({ clock }, dt) => {
    // ease toward the caller's stop — the leg animates when he moves, then stops
    const target = uAt[Math.max(0, Math.min(TOTAL, upto))]
    // dt is CLAMPED before it scales the ease. Any stall — a beat change, a
    // texture upload, the tab regaining focus — otherwise arrives as one huge
    // dt and the damp resolves the whole remaining distance in that one frame,
    // which is exactly what made the thread snap instead of draw.
    const u = (uRef.current += (target - uRef.current) * Math.min(1, Math.min(dt, 0.05) * 1.7))
    if (tubeRef.current) tubeRef.current.geometry.setDrawRange(0, Math.max(0, Math.floor(idxCount * u)))
    if (headRef.current) {
      const p = curve.getPointAt(Math.min(0.999, Math.max(0.001, u)))
      headRef.current.position.copy(p)
      // the head only shows while he's actually in transit
      headRef.current.visible = u > 0.004 && Math.abs(target - u) > 0.004
      headRef.current.scale.setScalar(1 + 0.35 * Math.sin(clock.elapsedTime * 7))
    }
    // a stop lights the moment the thread actually arrives at ITS point on the
    // curve — not at an even fraction of the way through
    let done = 0
    for (let i = 0; i < uAt.length; i++) if (u >= uAt[i] - 0.004) done = i
    if (done !== reachedRef.current) { reachedRef.current = done; setReached(done) }
    if (!settled.current && u > 0.004 && Math.abs(target - u) <= 0.004) {
      settled.current = true
      onSettledRef.current?.()
    }

    // The thread's job ends the moment the floor opens and the bed names
    // itself: it got him here, the care unit takes over. Leaving it lit through
    // the lock and the plunge read as an artifact stuck in the shot. Faded on
    // the ROOT only — the head runs its own visibility and must not be fought.
    const f = (fadeRef.current = MathUtils.damp(fadeRef.current, handedOff ? 0 : 1, 3.2, dt))
    if (rootRef.current) {
      rootRef.current.visible = f > 0.012
      rootRef.current.traverse((o: any) => {
        const m = o.material
        if (!m || m.opacity === undefined) return
        if (m.userData.baseOpacity === undefined) m.userData.baseOpacity = m.opacity
        m.opacity = m.userData.baseOpacity * f
      })
    }
  })

  return (
    <group ref={rootRef}>
      <mesh ref={tubeRef} geometry={geo} renderOrder={6}>
        <meshBasicMaterial color="#ffd58a" transparent opacity={0.92} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      {/* the head — the patient, moving */}
      <mesh ref={headRef} renderOrder={8}>
        <sphereGeometry args={[0.17, 20, 20]} />
        <meshBasicMaterial color="#fff3d6" transparent opacity={1} blending={AdditiveBlending} toneMapped={false} />
      </mesh>
      {stops.map((p, i) => {
        const on = i <= reached && upto > 0
        return (
          <group key={i} position={p}>
            <mesh renderOrder={7}>
              <sphereGeometry args={[on ? 0.14 : 0.08, 20, 20]} />
              <meshBasicMaterial color={on ? '#ffe9b8' : '#6b6350'} transparent opacity={on ? 0.98 : 0.5} toneMapped={false} />
            </mesh>
          </group>
        )
      })}
      {/* The route reads down the RIGHT of the SCREEN — opposite the census,
          never mixed. These sit at the thread's root rather than on each stop,
          because they anchor to the camera's right rather than to the stop's
          own position; hanging them off the dot would drag the world offset
          back in and reintroduce the swing. */}
      {labels && stops.map((p, i) => {
        const on = i <= reached && upto > 0
        const now = i === reached && upto > 0
        const j = JOURNEY[i]
        return (
          <SideAnchor key={`label-${i}`} side={1} dist={LABEL_COL} y={p.y}>
            <Html position={[0, 0, 0]} distanceFactor={44} zIndexRange={[9, 0]}>
              <div
                style={{
                  pointerEvents: 'none', transform: 'translateY(-50%)',
                  // ONE width for all five. They were sized to their own text,
                  // so every edge landed somewhere different and the column read
                  // as scattered rather than as a list.
                  width: 232, display: 'flex', alignItems: 'stretch',
                  background: on ? 'rgba(48,33,9,.9)' : 'rgba(20,20,18,.55)',
                  border: `1px solid ${on ? 'rgba(255,213,138,.5)' : 'rgba(140,135,120,.24)'}`,
                  borderRadius: 4, overflow: 'hidden',
                  transition: 'all .35s ease',
                  opacity: on ? 1 : 0.5,
                  boxShadow: now ? '0 0 0 1px rgba(255,213,138,.45), 0 0 22px rgba(255,180,60,.28)' : 'none',
                }}
              >
                {/* The STOP NUMBER, as a real badge. These cards hang at the
                    height of the floor they name, so down the screen they run
                    5·2·4·3·1 — which looks broken until the numeral is loud
                    enough to be read as an itinerary index. Then the scramble
                    becomes the point: a cardiac patient does not walk up a
                    building floor by floor, he is thrown across it. */}
                <div
                  style={{
                    flex: '0 0 30px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: on ? '#ffd58a' : 'rgba(140,135,120,.22)',
                    color: on ? '#2a1d05' : 'rgba(200,196,180,.55)',
                    font: '800 15px ui-monospace, monospace',
                    transition: 'all .35s ease',
                  }}
                >{i + 1}</div>
                <div style={{ padding: '6px 10px', minWidth: 0 }}>
                  <div style={{
                    font: '700 12.5px ui-monospace, monospace', letterSpacing: '.1em',
                    textTransform: 'uppercase', whiteSpace: 'nowrap',
                    color: on ? '#ffe9b8' : '#8b8676',
                  }}>{j.label}</div>
                  {/* on its own line, so the card's width never depends on how
                      long the scene text happens to be */}
                  <div style={{
                    font: '500 9.5px ui-monospace, monospace', whiteSpace: 'nowrap', marginTop: 2,
                    color: on ? 'rgba(255,220,160,.7)' : 'rgba(139,134,118,.55)',
                  }}>{j.scene}</div>
                </div>
              </div>
            </Html>
          </SideAnchor>
        )
      })}
    </group>
  )
}

// ---------------------------------------------------------------------------
//  BUILDING READOUT — the whole-tower total.
//
//  Lives in the DOM, not the scene. It was anchored under the tower's base,
//  which meant it inherited the tower's problems: it drifted with the orbit and
//  its distanceFactor rescaled it every time the camera moved. But it is a
//  readout ABOUT the building, not a thing IN it — so it belongs in a corner of
//  the frame like the [O] switch, fixed and always the same size.
// ---------------------------------------------------------------------------
/** The mark each class is drawn as, as a flat glyph. Same silhouettes as the 3D
 *  marks in FloorExplode, read from the same `shape` field in the class table —
 *  a legend that can disagree with the thing it explains is worse than none. */
function MarkGlyph({ shape, color }: { shape: MarkShape; color: string }) {
  const box = { width: 13, height: 13, viewBox: '0 0 12 12', style: { flex: '0 0 auto' } }
  switch (shape) {
    case 'sphere':  return <svg {...box}><circle cx="6" cy="6" r="4.3" fill={color} /></svg>
    case 'cone':    return <svg {...box}><polygon points="6,0.8 10.2,11.2 1.8,11.2" fill={color} /></svg>
    case 'coneLow': return <svg {...box}><polygon points="6,4.6 11,11.2 1,11.2" fill={color} /></svg>
    case 'cube':    return <svg {...box}><rect x="2.1" y="2.1" width="7.8" height="7.8" fill={color} /></svg>
    case 'plate':   return <svg {...box}><rect x="0.6" y="4.9" width="10.8" height="2.4" rx="0.5" fill={color} /></svg>
    case 'octa':    return <svg {...box}><polygon points="6,1 11,6 6,11 1,6" fill={color} /></svg>
  }
}

const cardStyle: CSSProperties = {
  pointerEvents: 'none',
  whiteSpace: 'nowrap',
  background: 'rgba(6,14,20,0.76)',
  border: `1px solid ${HOLO_DIM}`,
  borderRadius: 4,
  padding: '9px 14px',
  backdropFilter: 'blur(8px)',
  transition: 'opacity .34s ease, transform .34s ease',
}

/**
 * LEGEND — the key to the marks, the way a map has one.
 *
 * Fades with the totals card when a dive begins: while the building is the
 * subject the key earns its place, but once you commit to a floor it clears the
 * shot alongside the readout rather than lingering on its own. Generated by
 * mapping the class table, so adding a class to the census adds a legend row for
 * free and no second list can fall out of date.
 */
export function OntologyLegend({ show }: { show: boolean }) {
  return (
    <div
      style={{
        ...cardStyle,
        display: 'grid',
        gridTemplateColumns: 'auto auto',
        gap: '8px 22px',
        padding: '12px 18px',
        opacity: show ? 1 : 0,
        transform: show ? 'translateY(0)' : 'translateY(6px)',
      }}
    >
      <div style={{ gridColumn: '1 / -1', font: '700 10px ui-monospace, monospace', color: 'rgba(150,215,235,.62)', letterSpacing: '.22em', marginBottom: 3 }}>
        OBJECT CLASSES
      </div>
      {CENSUS_KINDS.map((k) => (
        <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MarkGlyph shape={KIND_STYLE[k].shape} color={KIND_STYLE[k].color} />
          <em style={{ font: '600 11px ui-monospace, monospace', fontStyle: 'normal', color: 'rgba(205,238,248,.85)' }}>
            {KIND_STYLE[k].label}
          </em>
        </span>
      ))}
    </div>
  )
}

/**
 * The corner stack: the key on top, the whole-building total under it.
 *
 * Both fade together on `showTotals`: it is true while the building is the
 * subject and false the moment we commit to a floor (the hold and the plunge),
 * where the floor's own numbers take over. The legend rides the same gate —
 * once you are diving, the key belongs with the readout it explains, and both
 * clear the shot together rather than the legend lingering alone.
 */
export function OntologyPanels({
  showTotals,
  showTags,
  showJourney,
  scope = null,
}: {
  showTotals: boolean
  /** the floor-tag column — only while the building is STATIC (the read beat),
   *  never during the orbit or the dive */
  showTags: boolean
  showJourney: boolean
  /** Which ontology is on screen: a floorId once the thread reaches a room,
   *  null while the view is still the whole building. */
  scope?: string | null
}) {
  return (
    <>
      <FloorHUD show={showTags} />
      {/* The whole left edge is the read-out side: totals stacked in the
          middle, the key under them in the corner. The ward billboards and the
          journey cards share the right and alternate, so nothing on the left
          ever has to move to make room. */}
      <div
        style={{
          // a band, not an edge: the tower keeps to the right, so ATLAS is
          // centred in the space actually free rather than shoved against the
          // frame with all the emptiness pooled on its right
          // the floor matters: below ~1210px the band would be narrower than the
          // 400px read-out, and centring inside it would push the panel off the
          // left edge instead of pulling it in
          position: 'fixed', left: 0, width: 'max(38vw, 460px)', top: 0, bottom: 0,
          // the last nudge off centre, in px rather than by narrowing the band:
          // shrinking the band moves the panel by a fraction of the viewport, so
          // the same "little left" lands differently on every screen
          transform: 'translate(-20px, 8px)',
          zIndex: 40, pointerEvents: 'none',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <FitToHeight pad={40}>
          <OntologyReadout show={showTotals} scope={scope} />
        </FitToHeight>
      </div>
      {/* The patient's own line belongs beside the thread it labels, so it sits
          on the right where the journey draws — not buried under the census. */}
      <JourneyCaption show={showJourney} />
      {/* No separate key: every census row above already pairs its mark with
          its label, so a legend beside it repeated the same six lines. */}
    </>
  )
}

/** Scales its child down (never up) so a tall read-out still fits a short
 *  viewport — the deck runs this scene in an iframe whose height we do not
 *  control, and centring alone would just crop the panel at both ends. */
function FitToHeight({ pad = 0, children }: { pad?: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [k, setK] = useState(1)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      const h = el.scrollHeight
      setK(h ? Math.min(1, (window.innerHeight - pad) / h) : 1)
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    window.addEventListener('resize', fit)
    return () => { ro.disconnect(); window.removeEventListener('resize', fit) }
  }, [pad])
  return (
    <div style={{ transform: `scale(${k})`, transformOrigin: 'left center' }}>
      <div ref={ref}>{children}</div>
    </div>
  )
}

/**
 * The ATLAS mark, ported from the deck's title card so the same object appears
 * in both places — corner registration ticks instead of a closed box (a full
 * rectangle at this weight reads as a button), a faint coordinate grid, and the
 * census's own six shapes located on the plate, each breathing with a locating
 * ring behind it. Violet is kept rather than recoloured to the scene's cyan:
 * the point of repeating the mark is that the room recognises it.
 *
 * 6s loop, offsets 1s apart, each ring alive 1.6s — so a ring is always already
 * going before the last one dies. Never still, never a crowd.
 */
function AtlasSigil({ size = 96 }: { size?: number }) {
  const V = '#a78bfa'
  const OBJECTS: { s: MarkShape; x: number; y: number; t: number }[] = [
    { s: 'sphere', x: 7.6, y: 8.4, t: 0 },
    { s: 'cone', x: 15.8, y: 6.9, t: 1 },
    { s: 'octa', x: 17.2, y: 14.8, t: 2 },
    { s: 'plate', x: 7.2, y: 16.4, t: 3 },
    { s: 'cube', x: 12.4, y: 12.2, t: 4 },
    { s: 'coneLow', x: 11.2, y: 18.4, t: 5 },
  ]
  const shape = (kind: MarkShape, x: number, y: number) => {
    if (kind === 'sphere') return <circle cx={x} cy={y} r="1" fill={V} />
    if (kind === 'cone') return <path d={`M${x} ${y - 1.1}l1.15 2.1h-2.3z`} fill={V} />
    if (kind === 'coneLow') return <path d={`M${x} ${y - 0.6}l1.05 1.6h-2.1z`} fill={V} />
    if (kind === 'cube') return <rect x={x - 0.95} y={y - 0.95} width="1.9" height="1.9" rx="0.3" fill={V} />
    if (kind === 'plate') return <rect x={x - 1.25} y={y - 0.42} width="2.5" height="0.84" rx="0.42" fill={V} />
    return <path d={`M${x} ${y - 1.25}l1.25 1.25-1.25 1.25-1.25-1.25z`} fill={V} />
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ display: 'block', overflow: 'visible' }}>
      {/* names prefixed: scene-1 injects other keyframes into the same document */}
      <style>{`
        @keyframes atlasSigilBreathe { 0%, 100% { opacity: 0.32; } 8%, 24% { opacity: 1; } }
        @keyframes atlasSigilRing { 0% { r: 0.9; opacity: 0.5; } 27% { r: 3.4; opacity: 0; } 100% { r: 3.4; opacity: 0; } }
      `}</style>
      {[[3, 3, 1, 1], [21, 3, -1, 1], [3, 21, 1, -1], [21, 21, -1, -1]].map(([x, y, dx, dy]) => (
        <path key={`${x}${y}`} d={`M${x} ${y + dy * 3.4}V${y}H${x + dx * 3.4}`}
          fill="none" stroke={V} strokeWidth="1" strokeLinecap="round" opacity="0.75" />
      ))}
      <g stroke={V} strokeWidth="0.5" opacity="0.16">
        <path d="M12 3.6V20.4M3.6 12h16.8" />
        <path d="M7.8 4.6v14.8M16.2 4.6v14.8M4.6 7.8h14.8M4.6 16.2h14.8" opacity="0.6" />
      </g>
      {OBJECTS.map((o) => (
        <g key={o.s}>
          <g style={{ animation: `atlasSigilBreathe 6s ease-in-out ${o.t}s infinite` }}>{shape(o.s, o.x, o.y)}</g>
          <circle cx={o.x} cy={o.y} fill="none" stroke={V} strokeWidth="0.55"
            style={{ animation: `atlasSigilRing 6s ease-out ${o.t}s infinite` }} />
        </g>
      ))}
    </svg>
  )
}

function OntologyReadout({ show, scope }: { show: boolean; scope: string | null }) {
  // Same panel, narrower subject. When the patient's thread reaches a room the
  // ontology stops describing the building and starts describing THAT room —
  // identical rows, identical grammar, different numbers. Keeping the layout
  // fixed is the point: the room is not a different kind of thing, it is the
  // same model at another scale.
  const floor = scope ? censusFor(scope) : null
  const counts = floor ? floor.counts : TOTALS
  const prov = floor ? floor.provenance : TOTAL_PROVENANCE
  const title = floor ? (FLOOR_TITLE[scope!] ?? scope!.toUpperCase()) : 'HOSPITAL'
  const total = CENSUS_KINDS.reduce((s, k) => s + counts[k], 0)
  // Provenance is the real claim — in a record system SENSED would be ~0%,
  // because a human typed every value — so each band gets a row that says in
  // plain words what it means, not a bare percentage the room has to decode.
  const PROV: [string, number, string, string][] = [
    ['SENSED', prov.A, '#3fe0c0', 'a device measured it'],
    ['INFERRED', prov.B, '#f5a25d', 'a model derived it'],
    ['ASSERTED', prov.C, '#9a8f7a', 'a human typed it'],
  ]
  const W = 400
  const Rule = ({ gap = 20 }: { gap?: number }) => (
    <div style={{ width: W, height: 1, background: 'rgba(150,215,235,.17)', margin: `${gap}px 0` }} />
  )
  const cap: CSSProperties = { font: '600 10px ui-monospace, monospace', color: 'rgba(150,215,235,.5)', letterSpacing: '.26em' }
  // Every tabular row is padded to one identical width, so centring the column
  // still leaves the numerals stacked instead of stepping with label length.
  const row: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center' }
  return (
    <div
      style={{
        pointerEvents: 'none',
        width: W,
        textAlign: 'center',
        opacity: show ? 1 : 0,
        transform: show ? 'translateY(0)' : 'translateY(6px)',
        transition: 'opacity .34s ease, transform .34s ease',
        textShadow: '0 1px 14px rgba(0,0,0,.9)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'center' }}><AtlasSigil size={96} /></div>

      {/* Mono, like every other line in this read-out. Copperplate was the
          reach for the title card's face, but neither Copperplate name resolves
          on macOS — the deck is drawing its serif fallback — so matching it here
          meant inheriting a fallback rather than choosing a font. The panel is
          an instrument; the instrument's own typeface is the honest answer. */}
      <div
        style={{
          font: '200 62px ui-monospace, SFMono-Regular, Menlo, monospace',
          color: '#eefcff',
          letterSpacing: '.26em', paddingLeft: '.26em',
          lineHeight: 1, marginTop: 24,
        }}
      >
        ATLAS
      </div>
      <div style={{ ...cap, marginTop: 16, color: 'rgba(143,227,255,.62)' }}>
        ACTOR · TIME · LOCATION · ASSET · STATE
      </div>
      <div style={{ ...row, gap: 7, marginTop: 12 }}>
        <i style={{ width: 6, height: 6, borderRadius: 9, background: '#3fe0c0', display: 'block', boxShadow: '0 0 10px #3fe0c0' }} />
        <em style={{ font: '700 10px ui-monospace, monospace', fontStyle: 'normal', color: 'rgba(63,224,192,.92)', letterSpacing: '.2em' }}>LIVE</em>
      </div>

      <Rule />

      <div style={{ ...cap, marginBottom: 12 }}>ONTOLOGY IN VIEW</div>
      <div style={{ font: '300 30px ui-monospace, monospace', color: '#d7f0fa', letterSpacing: '.16em', paddingLeft: '.16em', lineHeight: 1.1 }}>
        {title}
      </div>

      <Rule />

      <div style={{ ...cap, marginBottom: 16 }}>WHAT IT HOLDS</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
        {CENSUS_KINDS.map((k) => (
          <span key={k} style={{ ...row, gap: 15 }}>
            <MarkGlyph shape={KIND_STYLE[k].shape} color={KIND_STYLE[k].color} />
            <b style={{ font: '200 27px ui-monospace, monospace', color: '#eafcff', minWidth: 58, textAlign: 'right', lineHeight: 1 }}>{counts[k]}</b>
            <em style={{ font: '500 13px ui-monospace, monospace', fontStyle: 'normal', color: 'rgba(185,228,244,.76)', letterSpacing: '.1em', minWidth: 108, textAlign: 'left' }}>
              {KIND_STYLE[k].label}
            </em>
          </span>
        ))}
      </div>

      <div style={{ width: W, height: 1, background: 'rgba(150,215,235,.17)', margin: '18px 0 14px' }} />
      <div style={{ ...row, alignItems: 'baseline', gap: 12 }}>
        <b style={{ font: '200 27px ui-monospace, monospace', color: '#eafcff', lineHeight: 1 }}>{total}</b>
        <em style={{ ...cap, fontStyle: 'normal' }}>OBJECTS CLASSIFIED</em>
      </div>

      <Rule />

      <div style={{ ...cap, marginBottom: 14 }}>HOW IT KNOWS</div>
      <div style={{ display: 'flex', width: W, height: 6, gap: 3, marginBottom: 16 }}>
        {PROV.map(([label, pct, col]) => (
          <i key={label} style={{ flex: pct, background: col, display: 'block' }} />
        ))}
      </div>
      {/* rows, not a label strip under the bar: proportional columns let the
          11% band's word run into its neighbour's */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {PROV.map(([label, pct, col, gloss]) => (
          <span key={label} style={{ ...row, alignItems: 'baseline', gap: 13 }}>
            <i style={{ width: 9, height: 9, background: col, display: 'block', alignSelf: 'center', flexShrink: 0 }} />
            <b style={{ font: '600 16px ui-monospace, monospace', color: col, minWidth: 46, textAlign: 'right' }}>{pct}%</b>
            <em style={{ font: '700 11px ui-monospace, monospace', fontStyle: 'normal', color: 'rgba(215,240,250,.8)', letterSpacing: '.16em', minWidth: 92, textAlign: 'left' }}>{label}</em>
            <em style={{ font: '400 12px ui-monospace, monospace', fontStyle: 'normal', color: 'rgba(150,215,235,.46)', letterSpacing: '.04em', minWidth: 160, textAlign: 'left' }}>{gloss}</em>
          </span>
        ))}
      </div>
      <div style={{ ...cap, marginTop: 18, opacity: 0.62 }}>SIMULATED CENSUS</div>
    </div>
  )
}

/** The one patient the thread belongs to, set against the journey on the right. */
function JourneyCaption({ show }: { show: boolean }) {
  return (
    <div
      style={{
        position: 'fixed', right: 34, bottom: 34, zIndex: 40, pointerEvents: 'none',
        textAlign: 'right',
        opacity: show ? 1 : 0,
        transform: show ? 'translateY(0)' : 'translateY(6px)',
        transition: 'opacity .34s ease, transform .34s ease',
        textShadow: '0 1px 14px rgba(0,0,0,.9)',
      }}
    >
      <div style={{ font: '600 15px ui-monospace, monospace', color: '#ffd58a', letterSpacing: '.14em' }}>
        CHANDRABABU · SH-2891
      </div>
      <div style={{ font: '600 10px ui-monospace, monospace', color: 'rgba(255,213,138,.6)', letterSpacing: '.18em', marginTop: 8 }}>
        5 ROOMS · ONE THREAD
      </div>
    </div>
  )
}

export function OntologyTower({ journey = 0, focus, open = false, handedOff = false, tags = false, labels = true, arrived = true, onJourneySettled }: {
  journey?: number
  /** false while the patient has not reached this floor — see FloorExplode */
  arrived?: boolean
  /** the thread has stopped moving at its target stop */
  onJourneySettled?: () => void
  /** the floor (and the room on it) this view is aimed at: highlighted always,
   *  and resolved into its individual objects once `open` */
  focus?: { floorId: string; room?: string }
  /** the close-up hold — the focused floor individuates into care units. This
   *  is the near half of "aggregate far, individuate near", and it is only
   *  ever ONE floor: the whole point is that you earn detail by going closer. */
  open?: boolean
  /** the thread has delivered him and the bed has taken over — true from the
   *  hold onward, so the route fades out instead of hanging through the dive */
  handedOff?: boolean
  /** the building is STATIC and being read — drives the floor-tag leaders. The
   *  cards themselves live in the DOM (OntologyPanels); this only publishes the
   *  tier screen points they point at. */
  tags?: boolean
  labels?: boolean
}) {
  const ref = useRef<Group>(null)
  const focusVol = focus ? FLOOR_VOLS.find((v) => v.id === focus.floorId) : undefined
  const opened = open && !!focusVol
  return (
    <group ref={ref}>
      {FLOOR_VOLS.map((v) => (
        <FloorVolume key={v.id} v={v} hotRoom={focus?.room} open={opened} />
      ))}
      {/* mounted as soon as there's a focus, but collapsed and fully
          transparent until the hold — so the explode eases in rather than
          popping into existence the frame the camera arrives */}
      {focusVol && <FloorExplode v={focusVol} room={focus?.room} open={opened} arrived={arrived} />}
      {/* publishes each tier's screen point for the DOM floor-tag leaders — only
          while the building is being read, never during the orbit or the dive */}
      <LeaderProjector active={!!tags && !opened} />
      {journey > 0 && <JourneyThread upto={journey} labels={labels && !opened} handedOff={handedOff} onSettled={onJourneySettled} />}
    </group>
  )
}
