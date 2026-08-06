// ===========================================================================
//  FLOOR EXPLODE — one tier's objects, grouped into CARE UNITS.
//
//  This is the near half of the ontology view's density rule. The tier stays
//  the transparent lattice it already was — a glass container, still the
//  building — and its census resolves inside it into one cluster per occupied
//  bed: the bed at the floor plane, its patient just above it, and that
//  patient's devices fanned into a cage around them, each on a leader line
//  back down to the bed it serves.
//
//  Why clusters and not class layers: "8 patients, 96 devices" is an abstract
//  ratio until you see it as eight people each inside a cage of twelve
//  machines. Devices are never a floor-wide stratum here, because a device is
//  never floor-wide — it belongs to somebody.
//
//  Motion carries the same grammar. Beds are fixed (structure), patients are
//  held (they are lying down), devices pulse (they are sampling), and staff are
//  the only things that actually travel — so the movement you see on the floor
//  is the movement that is really there.
// ===========================================================================
import { useMemo, useRef, type CSSProperties } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  MathUtils,
  Object3D,
  type InstancedMesh,
  type LineSegments,
  type Mesh,
} from 'three'
import { type FloorBlockVol, type FloorVol } from './BuildingStack'
import {
  KIND_STYLE, JOURNEY, CENSUS_KINDS, censusFor, isStaffKind,
  type CensusKind, type MarkShape,
} from '../ontology/census'
import { individuateFloor, tallyByKind, type FloorObject } from '../ontology/individuate'
import type { StateType } from '../ontology/types'

const GOLD = '#ffd58a'
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

// Provenance rides the mark's BRIGHTNESS, not its hue — hue is already spoken
// for by entity class, and two colour axes fight. A sensed object is fully
// present, an asserted one is a ghost. Same philosophy as provenance.ts, just
// expressed in a form an instanced mark can carry.
const PROV_MUL: Record<StateType, number> = { A: 1, B: 0.6, C: 0.26 }

/** the block's usable footprint, inset so marks never sit in the wall */
const extentOf = (b: FloorBlockVol) =>
  b.shape === 'drum' || b.shape === 'crown' || b.shape === 'hex'
    ? { rx: b.r * 0.94, rz: b.r * 0.94 }
    : { rx: b.halfW * 0.94, rz: b.halfD * 0.94 }

/**
 * The mark for each class. Small, and distinguished by SILHOUETTE as much as by
 * colour — at this size a hue shift between doctor and nurse would be a guess,
 * whereas a tall cone against a squat one survives being four pixels across.
 * The mapping lives in the class table (census.ts), so the legend and these
 * meshes are two readings of one source.
 */
function MarkGeometry({ shape }: { shape: MarkShape }) {
  switch (shape) {
    case 'plate': return <boxGeometry args={[0.26, 0.028, 0.15]} />
    case 'sphere': return <sphereGeometry args={[0.072, 14, 14]} />
    case 'cone': return <coneGeometry args={[0.055, 0.17, 8]} />
    case 'coneLow': return <coneGeometry args={[0.06, 0.095, 8]} />
    case 'cube': return <boxGeometry args={[0.075, 0.075, 0.075]} />
    case 'octa': return <octahedronGeometry args={[0.05]} />
  }
}

/** a point on the upper hemisphere — the device cage around a bed. Fibonacci
 *  spacing so twelve devices distribute evenly instead of clumping on a seam. */
function dome(i: number, n: number, radius: number): [number, number, number] {
  const t = n <= 1 ? 0.55 : i / (n - 1)
  const y = 0.2 + t * 0.78 // keep off the pole, so it reads as a cage not a spike
  const r = Math.sqrt(Math.max(0, 1 - y * y))
  const a = i * GOLDEN_ANGLE
  return [Math.cos(a) * r * radius, y * radius, Math.sin(a) * r * radius]
}

interface Placed {
  o: FloorObject
  /** collapsed — flat on the floor plate, where the object actually is */
  cx: number; cy: number; cz: number
  /** exploded — lifted into its care unit */
  ex: number; ey: number; ez: number
  /** the bed this hangs off, in world-local coords (for the leader line) */
  bx: number; bz: number
  tethered: boolean
  phase: number
  /** live position, written each frame so the leader line can follow the mark
   *  including its drift and breath rather than its idealised target */
  lx?: number; ly?: number; lz?: number
}

export function FloorExplode({
  v,
  room,
  open,
}: {
  v: FloorVol
  /** the room the journey passes through — its frontmost bed becomes the hero */
  room?: string
  open: boolean
}) {
  const { placed, byKind, tally, heroBed, journey } = useMemo(() => {
    const blocks = v.blocks.map((b) => ({
      room: b.room,
      footprint: (b.shape === 'drum' || b.shape === 'crown' || b.shape === 'hex' ? 'round' : 'rect') as 'round' | 'rect',
    }))
    const objects = individuateFloor(v.id, blocks, room ? { room } : undefined)
    const floorY = -v.h / 2 + 0.09
    const patientLift = v.h * 0.26
    const deviceBase = v.h * 0.4
    const cageR = Math.min(0.5, v.h * 0.3)
    const staffLift = v.h * 0.14

    const world = (o: FloorObject) => {
      const b = v.blocks[o.block]
      const e = extentOf(b)
      return { x: b.x + o.u * e.rx, z: o.v * e.rz }
    }

    const placed: Placed[] = objects.map((o, i) => {
      const w = world(o)
      const bed = o.bedOf != null ? world(objects[o.bedOf]) : w
      let ex = w.x
      let ey = floorY
      let ez = w.z
      if (o.kind === 'patient') {
        // the patient lifts off their OWN bed, not off the floor at large
        ex = bed.x; ez = bed.z; ey = floorY + patientLift
      } else if (o.kind === 'device' && o.bedOf != null) {
        const [dx, dy, dz] = dome(o.slot ?? i, o.slotCount ?? 1, cageR)
        ex = bed.x + dx; ez = bed.z + dz; ey = floorY + deviceBase + dy
      } else if (isStaffKind(o.kind)) {
        ey = floorY + staffLift
      }
      return {
        o,
        cx: w.x, cy: floorY, cz: w.z,
        ex, ey, ez,
        bx: bed.x, bz: bed.z,
        tethered: o.bedOf != null,
        phase: (i % 37) * 0.61,
      }
    })

    const byKind = Object.fromEntries(CENSUS_KINDS.map((k) => [k, [] as Placed[]])) as Record<CensusKind, Placed[]>
    for (const p of placed) byKind[p.o.kind].push(p)
    const heroBed = placed.find((p) => p.o.hero && p.o.kind === 'bed')
    const journey = JOURNEY.find((j) => j.floorId === v.id && j.room === room)
    return { placed, byKind, tally: tallyByKind(objects), heroBed, journey }
  }, [v, room])

  // --- instanced marks, one draw call per class ----------------------------
  // One bag of callback refs rather than a useRef per class: the class list is
  // data now (six, and it can change), and hooks cannot be called in a loop.
  const refs = useRef<Partial<Record<CensusKind, InstancedMesh | null>>>({})
  const dummy = useMemo(() => new Object3D(), [])
  const tetherRef = useRef<LineSegments>(null)
  const heroRef = useRef<Mesh>(null)
  const beamRef = useRef<Mesh>(null)
  const calloutRef = useRef<HTMLDivElement>(null)
  const censusRef = useRef<HTMLDivElement>(null)
  const tRef = useRef(0)

  // leader lines — one segment per tethered object, rebuilt each frame from the
  // marks' live positions so the sheaf follows the explode exactly
  const tethers = useMemo(() => placed.filter((p) => p.tethered), [placed])
  const tetherGeo = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(Math.max(1, tethers.length) * 6), 3))
    return g
  }, [tethers])

  // Instance colours are static — class hue scaled by the object's provenance.
  // Painted on the first frame after the meshes mount rather than in a memo:
  // a ref's .current is not a reactive dependency, so a memo keyed on it would
  // run while every ref was still null and never run again.
  const painted = useRef<Record<CensusKind, Placed[]> | null>(null)
  const paintColours = () => {
    if (painted.current === byKind) return
    const c = new Color()
    let all = true
    for (const k of CENSUS_KINDS) {
      const mesh = refs.current[k]
      if (!byKind[k].length) continue
      if (!mesh) { all = false; continue }
      byKind[k].forEach((p, i) => {
        c.set(KIND_STYLE[k].color).multiplyScalar(PROV_MUL[p.o.stateType] * (p.o.hero ? 1.75 : 1))
        mesh.setColorAt(i, c)
      })
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
    if (all) painted.current = byKind
  }

  useFrame(({ clock }, dt) => {
    paintColours()
    const t = (tRef.current = MathUtils.damp(tRef.current, open ? 1 : 0, 2.6, dt))
    const e = t * t * (3 - 2 * t) // smoothstep — settles rather than snaps
    const appear = MathUtils.clamp(t / 0.16, 0, 1)
    const time = clock.elapsedTime

    for (const k of CENSUS_KINDS) {
      const mesh = refs.current[k]
      if (!mesh) continue
      const mat = mesh.material as any
      mat.opacity = appear * (k === 'device' ? 0.9 : 0.96)
      const staff = isStaffKind(k)
      byKind[k].forEach((p, i) => {
        let x = p.cx + (p.ex - p.cx) * e
        let y = p.cy + (p.ey - p.cy) * e
        let z = p.cz + (p.ez - p.cz) * e
        let s = 1
        if (k === 'device') {
          // sampling — a small breath, so the cage feels awake
          s = 1 + 0.22 * Math.sin(time * 3.1 + p.phase) * e
        } else if (staff) {
          // the only things on the floor that actually travel. Ops range wider
          // than clinical staff — porters cross a floor, nurses work a bay.
          const reach = k === 'ops' ? 0.62 : k === 'nurse' ? 0.44 : 0.34
          x += Math.sin(time * 0.32 + p.phase) * reach * e
          z += Math.cos(time * 0.27 + p.phase * 1.3) * reach * e
        } else if (k === 'patient' && p.o.hero) {
          s = 1 + 0.1 * Math.sin(time * 1.6)
        }
        dummy.position.set(x, y, z)
        dummy.scale.setScalar(s)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
        if (k === 'device' || k === 'patient') {
          // stash the live position for the leader line
          p.lx = x; p.ly = y; p.lz = z
        }
      })
      mesh.instanceMatrix.needsUpdate = true
    }

    // leader lines: bed → object, so every device visibly belongs to a patient
    const line = tetherRef.current
    if (line) {
      const arr = (line.geometry.getAttribute('position') as BufferAttribute).array as Float32Array
      tethers.forEach((p, i) => {
        const o = i * 6
        arr[o] = p.bx; arr[o + 1] = p.cy; arr[o + 2] = p.bz
        arr[o + 3] = p.lx ?? p.cx; arr[o + 4] = p.ly ?? p.cy; arr[o + 5] = p.lz ?? p.cz
      })
      ;(line.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true
      ;(line.material as any).opacity = 0.3 * e
      line.visible = e > 0.02 && tethers.length > 0
    }
    // The hero marker and its tag ride the explode rather than existing
    // independently — they were staying lit through the reticle lock and the
    // plunge, where they read as leftover artifacts hanging in the shot.
    // Lagged slightly behind `e` so the tag lands AFTER the cluster has opened,
    // and is gone again by the time the dive is underway.
    const heroFade = MathUtils.clamp((e - 0.12) / 0.5, 0, 1)
    if (heroRef.current) {
      heroRef.current.rotation.z = time * 0.4
      ;(heroRef.current.material as any).opacity = 0.85 * heroFade
    }
    if (beamRef.current) (beamRef.current.material as any).opacity = 0.5 * heroFade
    // driven straight on the node — a per-frame React re-render for an opacity
    // ramp would be absurd, and mounting on `open` cannot animate out at all
    for (const el of [calloutRef.current, censusRef.current]) {
      if (!el) continue
      el.style.opacity = String(heroFade)
      el.style.visibility = heroFade > 0.02 ? 'visible' : 'hidden'
    }
  })

  if (!placed.length) return null
  const heroLift = v.h * 0.4 + Math.min(0.5, v.h * 0.3)

  return (
    <group position={[0, v.y, 0]}>
      {/* One draw call per class, generated from the class table so the marks
          and the legend can never disagree about what a shape means. A class
          with no objects on this floor renders nothing at all — an
          instancedMesh sized to a floor of zero beds would still draw one
          identity-matrix mark sitting at the origin. */}
      {CENSUS_KINDS.map((k) =>
        byKind[k].length > 0 ? (
          <instancedMesh
            key={k}
            ref={(el) => { refs.current[k] = el }}
            args={[null!, null!, byKind[k].length]}
            renderOrder={k === 'bed' ? 9 : 10}
          >
            <MarkGeometry shape={KIND_STYLE[k].shape} />
            <meshBasicMaterial transparent depthWrite={false} toneMapped={false} />
          </instancedMesh>
        ) : null,
      )}

      <lineSegments ref={tetherRef} geometry={tetherGeo} renderOrder={8}>
        <lineBasicMaterial color="#7fdcef" transparent opacity={0.3} depthWrite={false} toneMapped={false} />
      </lineSegments>

      {/* the hero care unit — the bed the camera is about to dive into, in the
          journey thread's own gold so the two layers are visibly the same story */}
      {heroBed && (
        <group position={[heroBed.bx, -v.h / 2 + 0.1, heroBed.bz]}>
          <mesh ref={heroRef} rotation-x={-Math.PI / 2} renderOrder={9}>
            <ringGeometry args={[0.58, 0.63, 48, 1, 0, Math.PI * 1.45]} />
            <meshBasicMaterial color={GOLD} transparent opacity={0.85} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
          </mesh>
          <mesh ref={beamRef} position={[0, heroLift / 2, 0]} renderOrder={8}>
            <cylinderGeometry args={[0.012, 0.012, heroLift, 6]} />
            <meshBasicMaterial color={GOLD} transparent opacity={0.5} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
          </mesh>
          {/* kept mounted and faded by opacity rather than mounted on `open`:
              unmounting cannot animate, so the tag popped out of existence */}
          {journey && (
            <Html position={[0, heroLift + 0.28, 0]} distanceFactor={9} zIndexRange={[11, 0]}>
              <div ref={calloutRef} style={{ ...callout, opacity: 0, visibility: 'hidden' }}>
                <div style={{ font: '700 12px ui-monospace, monospace', color: '#ffe9b8', letterSpacing: '.1em' }}>
                  {journey.label}
                </div>
                <div style={{ font: '600 8.5px ui-monospace, monospace', color: 'rgba(255,220,160,.7)', marginTop: 3 }}>
                  {journey.scene}
                </div>
                <div style={{ font: '600 8.5px ui-monospace, monospace', color: 'rgba(150,215,235,.8)', marginTop: 5, letterSpacing: '.05em' }}>
                  1 BED · 1 PATIENT ·{' '}
                  {placed.filter((p) => p.o.hero && p.o.kind === 'device').length} DEVICES
                </div>
              </div>
            </Html>
          )}
        </group>
      )}

      {/* the census, re-stated at close range — the floor tags are dropped
          during the hold because at dive distance they scale up and swamp the
          shot, but the counts are the whole claim, so they come back here */}
      {(
        <Html position={[-(v.reach + 0.9), 0, 0]} distanceFactor={9} zIndexRange={[10, 0]}>
          <div ref={censusRef} style={{ ...callout, transform: 'translate(-100%, -50%)', borderLeft: 'none', borderRight: `2px solid #5fd0e6`, opacity: 0, visibility: 'hidden' }}>
            <div style={{ font: '700 11px ui-monospace, monospace', color: '#dffaff', letterSpacing: '.12em' }}>INDIVIDUATED</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 5 }}>
              {CENSUS_KINDS.map((k) =>
                tally[k] ? (
                  <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <i style={{ width: 5, height: 5, borderRadius: 1, background: KIND_STYLE[k].color, display: 'inline-block' }} />
                    <b style={{ font: '700 10px ui-monospace, monospace', color: '#eafcff' }}>{tally[k]}</b>
                    <em style={{ font: '600 7.5px ui-monospace, monospace', fontStyle: 'normal', color: 'rgba(150,215,235,.6)' }}>{KIND_STYLE[k].label}</em>
                  </span>
                ) : null,
              )}
            </div>
            <div style={{ font: '600 7.5px ui-monospace, monospace', color: 'rgba(150,215,235,.55)', marginTop: 4, letterSpacing: '.05em' }}>
              {tally.patient ? `${Math.round(tally.device / Math.max(1, tally.patient))} DEVICES PER PATIENT · ` : ''}
              {censusFor(v.id)?.provenance.A}% SENSED
            </div>
          </div>
        </Html>
      )}
    </group>
  )
}

const callout: CSSProperties = {
  pointerEvents: 'none',
  whiteSpace: 'nowrap',
  transform: 'translate(-50%, -100%)',
  background: 'rgba(6,14,20,0.8)',
  border: '1px solid rgba(255,213,138,.4)',
  borderLeft: '2px solid #ffd58a',
  borderRadius: 3,
  padding: '6px 10px',
  backdropFilter: 'blur(8px)',
  fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
}
