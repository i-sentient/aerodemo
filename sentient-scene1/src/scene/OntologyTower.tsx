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
import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import {
  AdditiveBlending,
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  DoubleSide,
  EdgesGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  MeshBasicMaterial,
  TubeGeometry,
  Vector3,
  type Group,
  type Mesh,
} from 'three'
import {
  FLOORS, FLOOR_VOLS, squircleShape, twinShape, hexOutline, roomVol, BRIDGE_W,
  type FloorVol, type FloorBlockVol,
} from './BuildingStack'
import { CENSUS_KINDS, KIND_STYLE, censusFor, TOTALS, TOTAL_PROVENANCE, JOURNEY, type CensusKind } from '../ontology/census'

const HOLO = '#5fd0e6'
const HOLO_DIM = 'rgba(95,208,230,0.42)'

// The hologram sits at the building's OWN tier spacing. Exploding the stack was
// tried and reverted: it stopped being the building and became a diagram of it.
const Y0 = FLOOR_VOLS[0].y
const yOf = (v: FloorVol) => v.y

// ---------------------------------------------------------------------------
//  Lattice material. Same triplanar cell shader as the ICU body twin, retuned
//  for BUILDING scale: the body wants ~44 cells/unit over 1.8 m, a tower wants
//  ~2 cells/unit so the grid reads as half-metre panels rather than fabric.
// ---------------------------------------------------------------------------
function makeLattice(color: string, density = 2.1, opacity = 0.5) {
  const m = new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: DoubleSide, toneMapped: false })
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uDensity = { value: density }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGP;\nvarying vec3 vGN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vGP = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vGN = normalize(mat3(modelMatrix) * normal);`)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uDensity; varying vec3 vGP; varying vec3 vGN;
        float lattice(vec2 p){ vec2 c = p * uDensity; vec2 d = abs(fract(c - 0.5) - 0.5) / max(fwidth(c), 1e-5); return 1.0 - min(min(d.x, d.y), 1.0); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 bw = pow(abs(normalize(vGN)), vec3(4.0));
        bw /= max(bw.x + bw.y + bw.z, 1e-5);
        float line = lattice(vGP.zy) * bw.x + lattice(vGP.xz) * bw.y + lattice(vGP.xy) * bw.z;
        diffuseColor.a *= clamp(line, 0.0, 1.0) * 0.9 + 0.06;   // faint fill keeps the volume readable
        if (diffuseColor.a < 0.012) discard;`)
  }
  return m
}

const latticeMat = makeLattice(HOLO, 2.1, 0.95)
const latticeHot = makeLattice('#7dffd0', 2.1, 1.0)
const edgeMat = new MeshBasicMaterial({ color: HOLO, transparent: true, opacity: 0.85, toneMapped: false })

// ---------------------------------------------------------------------------
//  Per-tier volume — traced from the building's OWN silhouette constants, so
//  the hologram lands exactly where the solid tier was.
// ---------------------------------------------------------------------------
function blockGeometry(b: FloorBlockVol, h: number): BufferGeometry {
  if (b.shape === 'drum') return new CylinderGeometry(b.r, b.r, h, 72, 1, true)
  if (b.shape === 'crown') return new CylinderGeometry(b.r, b.r * 0.8, h, 72, 1, true)
  // hex tiers carry a stretched forward vertex; twin slabs are half-width
  // squircles. Both are traced from the building's own outline functions so the
  // hologram can't drift from the solid tier it replaces.
  const shape = b.shape === 'hex' ? hexOutline() : b.shape === 'twin' ? twinShape() : squircleShape(b.halfW, b.halfD)
  const g = new ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 72, steps: 1 })
  g.center()
  g.rotateX(-Math.PI / 2)
  return g
}

function BlockVolume({ b, h, hot }: { b: FloorBlockVol; h: number; hot: boolean }) {
  const geo = useMemo(() => blockGeometry(b, h), [b, h])
  const edges = useMemo(() => new EdgesGeometry(geo, 25), [geo])
  return (
    <group position={[b.x, 0, 0]}>
      <mesh geometry={geo} material={hot ? latticeHot : latticeMat} renderOrder={2} />
      <lineSegments geometry={edges} renderOrder={3}>
        <lineBasicMaterial color={hot ? '#9dffe0' : '#8fe6f5'} transparent opacity={hot ? 1 : 0.9} toneMapped={false} />
      </lineSegments>
    </group>
  )
}

function FloorVolume({ v, hotRoom }: { v: FloorVol; hotRoom?: string }) {
  return (
    <group position={[0, yOf(v), 0]}>
      {v.blocks.map((b, i) => (
        <BlockVolume key={i} b={b} h={v.h} hot={b.room === hotRoom} />
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
//  Floor tag — the aggregate read. This is the "far" LOD: you never label a
//  thousand objects, you label the container and let the numbers do the work.
// ---------------------------------------------------------------------------
function FloorTag({ v, floorLabel, sub }: { v: FloorVol; floorLabel: string; sub: string }) {
  const c = censusFor(v.id)
  if (!c) return null
  const total = CENSUS_KINDS.reduce((s, k) => s + c.counts[k], 0)
  // ALL census tags live on the left. Two information layers that must never be
  // confused: the building's contents on one side, the patient's route on the
  // other. Alternating sides made them collide and read as one soup.
  return (
    <Html position={[-(v.reach + 1.4), yOf(v), 0]} distanceFactor={30} zIndexRange={[8, 0]}>
      <div
        style={{
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          transform: 'translate(-100%, -50%)',
          background: 'rgba(6,14,20,0.72)',
          border: `1px solid ${HOLO_DIM}`,
          borderRight: `2px solid ${HOLO}`,
          borderRadius: 3,
          padding: '7px 11px',
          backdropFilter: 'blur(8px)',
          fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ font: '700 13px ui-monospace, monospace', color: '#dffaff', letterSpacing: '.1em', textTransform: 'uppercase' }}>{floorLabel}</span>
          <span style={{ font: '500 9.5px ui-monospace, monospace', color: 'rgba(150,215,235,.65)' }}>{sub}</span>
        </div>
        <div style={{ display: 'flex', gap: 9, marginTop: 5 }}>
          {CENSUS_KINDS.map((k) =>
            c.counts[k] ? (
              <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <i style={{ width: 6, height: 6, borderRadius: 1, background: KIND_STYLE[k].color, display: 'inline-block' }} />
                <b style={{ font: '700 11px ui-monospace, monospace', color: '#eafcff' }}>{c.counts[k]}</b>
                <em style={{ font: '600 8px ui-monospace, monospace', fontStyle: 'normal', color: 'rgba(150,215,235,.6)' }}>{KIND_STYLE[k].tag}</em>
              </span>
            ) : null,
          )}
        </div>
        {/* provenance bar — how much of this floor is measured vs claimed */}
        <div style={{ display: 'flex', height: 3, marginTop: 6, borderRadius: 2, overflow: 'hidden', width: 128 }}>
          <i style={{ width: `${c.provenance.A}%`, background: '#4fdf8f' }} />
          <i style={{ width: `${c.provenance.B}%`, background: '#e0b34c' }} />
          <i style={{ width: `${c.provenance.C}%`, background: 'rgba(200,225,235,.35)' }} />
        </div>
        <div style={{ font: '600 7.5px ui-monospace, monospace', color: 'rgba(150,215,235,.5)', marginTop: 3, letterSpacing: '.06em' }}>
          {c.provenance.A}% SENSED · {c.provenance.B}% INFERRED · {c.provenance.C}% ASSERTED · {total} OBJECTS
        </div>
      </div>
    </Html>
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
function JourneyThread({ upto, labels = true }: { upto: number; labels?: boolean }) {
  const { curve, geo, stops, uAt } = useMemo(() => {
    // route through the ACTUAL room mass on each tier — the +x hex for Cath,
    // the −x slab for OR-1 — so the thread crosses the building as he does
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
  }, [])

  const headRef = useRef<Mesh>(null)
  const tubeRef = useRef<Mesh>(null)
  const uRef = useRef(0)              // where the drawn thread currently ends
  const [reached, setReached] = useState(0)
  const reachedRef = useRef(0)
  const idxCount = geo.index ? geo.index.count : 0

  useFrame(({ clock }, dt) => {
    // ease toward the caller's stop — the leg animates when he moves, then stops
    const target = uAt[Math.max(0, Math.min(TOTAL, upto))]
    const u = (uRef.current += (target - uRef.current) * Math.min(1, dt * 1.7))
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
  })

  return (
    <group>
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
            {/* the route reads down the RIGHT — opposite the census, never mixed */}
            {labels && (
            <Html position={[8.4 - p.x, 0, -p.z]} distanceFactor={30} zIndexRange={[9, 0]}>
              <div
                style={{
                  pointerEvents: 'none', whiteSpace: 'nowrap', transform: 'translateY(-50%)',
                  background: on ? 'rgba(48,33,9,.88)' : 'rgba(20,20,18,.6)',
                  border: `1px solid ${on ? 'rgba(255,213,138,.55)' : 'rgba(140,135,120,.3)'}`,
                  borderLeft: `2px solid ${on ? '#ffd58a' : 'rgba(140,135,120,.4)'}`,
                  borderRadius: 3, padding: '5px 9px', transition: 'all .35s ease',
                  opacity: on ? 1 : 0.45,
                }}
              >
                <span style={{ font: '700 11px ui-monospace, monospace', color: on ? '#ffe9b8' : '#8b8676', letterSpacing: '.08em' }}>{i + 1}. {JOURNEY[i].label}</span>
                <span style={{ font: '500 8.5px ui-monospace, monospace', color: on ? 'rgba(255,220,160,.72)' : 'rgba(139,134,118,.6)', marginLeft: 7 }}>{JOURNEY[i].scene}</span>
              </div>
            </Html>
            )}
          </group>
        )
      })}
    </group>
  )
}

// ---------------------------------------------------------------------------
//  Building-level readout + legend, anchored at the base.
// ---------------------------------------------------------------------------
function BuildingReadout({ showJourney }: { showJourney: boolean }) {
  const total = CENSUS_KINDS.reduce((s, k) => s + TOTALS[k], 0)
  return (
    <Html position={[0, Y0 - 3.4, 0]} distanceFactor={30} zIndexRange={[8, 0]}>
      <div
        style={{
          pointerEvents: 'none',
          transform: 'translateX(-50%)',
          whiteSpace: 'nowrap',
          background: 'rgba(6,14,20,0.76)',
          border: `1px solid ${HOLO_DIM}`,
          borderRadius: 4,
          padding: '9px 14px',
          backdropFilter: 'blur(8px)',
          textAlign: 'center',
        }}
      >
        <div style={{ font: '700 11px ui-monospace, monospace', color: '#dffaff', letterSpacing: '.24em' }}>CLINICAL ONTOLOGY · LIVE</div>
        <div style={{ display: 'flex', gap: 14, marginTop: 7, justifyContent: 'center' }}>
          {CENSUS_KINDS.map((k) => (
            <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <i style={{ width: 7, height: 7, borderRadius: 1, background: KIND_STYLE[k].color, display: 'inline-block' }} />
              <b style={{ font: '700 14px ui-monospace, monospace', color: '#eafcff' }}>{TOTALS[k]}</b>
              <em style={{ font: '600 8.5px ui-monospace, monospace', fontStyle: 'normal', color: 'rgba(150,215,235,.62)' }}>{KIND_STYLE[k].plural}</em>
            </span>
          ))}
        </div>
        <div style={{ font: '600 8px ui-monospace, monospace', color: 'rgba(150,215,235,.55)', marginTop: 7, letterSpacing: '.07em' }}>
          {total} CLASSIFIED OBJECTS · {TOTAL_PROVENANCE.A}% SENSED / {TOTAL_PROVENANCE.B}% INFERRED / {TOTAL_PROVENANCE.C}% ASSERTED · SIMULATED CENSUS
        </div>
        {showJourney && (
          <div style={{ font: '700 8.5px ui-monospace, monospace', color: '#ffd58a', marginTop: 6, letterSpacing: '.1em' }}>
            ── CHANDRABABU · SH-2891 · 5 ROOMS, ONE THREAD ──
          </div>
        )}
      </div>
    </Html>
  )
}

// ---------------------------------------------------------------------------
//  A slow scan plane climbing the tower — the "it is reading the building" tell.
// ---------------------------------------------------------------------------
function ScanSweep({ top }: { top: number }) {
  const ref = useRef<Mesh>(null)
  useFrame(({ clock }) => {
    if (ref.current) ref.current.position.y = ((clock.elapsedTime * 1.5) % (top + 3)) - 1
  })
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} renderOrder={5}>
      <ringGeometry args={[0.2, 12.5, 96]} />
      <meshBasicMaterial color={HOLO} transparent opacity={0.07} side={DoubleSide} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
    </mesh>
  )
}

/**
 * `journey` = how many stops Chandrababu has reached (0 = he hasn't moved, so no
 * thread at all). The inter-scene transitions drive it: 1 on arrival in the ER,
 * 2 when he lands in the ICU, and so on. It is deliberately NOT self-animating.
 */
export function OntologyTower({ journey = 0, focusFloor, labels = true }: { journey?: number; focusFloor?: string; labels?: boolean }) {
  const ref = useRef<Group>(null)
  const top = yOf(FLOOR_VOLS[FLOOR_VOLS.length - 1]) + 2
  return (
    <group ref={ref}>
      {FLOOR_VOLS.map((v) => (
        <FloorVolume key={v.id} v={v} hotRoom={focusFloor} />
      ))}
      {/* labels are dropped during the plunge — at dive range they'd scale up
          and swamp the shot; the lattice and the thread carry it instead */}
      {labels && FLOORS.map((f, i) => (
        <FloorTag key={f.id} v={FLOOR_VOLS[i]} floorLabel={f.twin ? `${f.label} / ${f.twin.label}` : f.label} sub={f.sub} />
      ))}
      <ScanSweep top={top} />
      {journey > 0 && <JourneyThread upto={journey} labels={labels} />}
      {labels && <BuildingReadout showJourney={journey > 0} />}
    </group>
  )
}
