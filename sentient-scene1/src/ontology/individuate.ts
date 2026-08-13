// ============================================================================
//  INDIVIDUATION — resolving a floor's census COUNTS into the objects themselves.
//
//  The ontology view's density rule is the one games use: aggregate far,
//  individuate near. The whole building shows per-floor counts; the floor you
//  are about to enter shows every object it holds. This file is the near half.
//
//  Two rules keep it honest:
//   1. The number of marks EQUALS the number in the floor's tag. Nothing here
//      invents an object the census didn't already claim — it only resolves a
//      count into instances, and the provenance mix per floor is preserved
//      exactly, so the tag's A/B/C bar IS the fill state of the marks.
//   2. The layout is structural, not confetti. Beds line the floor, patients
//      lie in the occupied ones, devices cluster at those bedsides (which is
//      where they physically are), staff stand in the circulation space. So the
//      constellation reads as a floorplan, and when it explodes you see 96
//      devices hanging off the 8 beds they monitor rather than a starfield.
//
//  Positions are NORMALISED to the block (unit disc or unit square) and carry
//  no world coordinates — same discipline as the rest of the ontology, where
//  objects hold logical locations and the scene layer maps them. That also
//  keeps this file free of three.js and independently testable.
//
//  Deterministic by construction: a seeded PRNG, never Math.random, so a floor
//  individuates identically on every render, every remount and across HMR.
// ============================================================================
import type { StateType } from './types'
import { CENSUS_KINDS, STAFF_KINDS, censusFor, type CensusKind } from './census'

/** How a block's footprint is shaped, for layout only. 'round' covers the ER
 *  and ICU drums, the command crown and the hex procedure suites; 'rect' the
 *  squircle slabs and twin half-slabs. */
export type Footprint = 'round' | 'rect'

export interface FloorObject {
  id: string
  kind: CensusKind
  /** index into the tier's blocks — twin tiers hold two masses */
  block: number
  /** footprint position normalised to the block: unit disc for 'round', unit
   *  square for 'rect'. The renderer scales by the block's real extent. */
  u: number
  v: number
  stateType: StateType
  /** for a patient or a device: the index (into this array) of the bed it
   *  belongs to. This is what makes the explode legible — every object is
   *  tethered to the bed it serves, so a care unit stays one readable cluster
   *  instead of dissolving into a floor-wide layer of anonymous marks. */
  bedOf?: number
  /** for a device: its slot in its bed's fan, and how many share that bed — so
   *  the cluster opens evenly around its patient rather than clumping */
  slot?: number
  slotCount?: number
  /** the journey's own bed, its occupant, and the devices on it */
  hero?: boolean
}

export interface BlockSpec {
  room: string
  footprint: Footprint
}

// --- deterministic randomness ----------------------------------------------
const hashStr = (s: string) => {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** mulberry32 — small, fast, good enough, and above all reproducible. */
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** split a floor total across its blocks, remainder to the earlier blocks, so
 *  the per-block counts always sum back to the census figure */
const share = (total: number, i: number, n: number) =>
  Math.floor(total / n) + (i < total % n ? 1 : 0)

// --- bed layout -------------------------------------------------------------
/** Beds line the floor the way a real unit does: round floors get concentric
 *  rings (the ICU drum is literally built this way in the ward scene), slab
 *  floors get a grid. Everything else on the floor hangs off these positions. */
function layoutBeds(n: number, fp: Footprint, rand: () => number): [number, number][] {
  const out: [number, number][] = []
  if (n <= 0) return out
  if (fp === 'round') {
    // one ring while it stays legible, two once the floor gets crowded
    const rings: [number, number][] = n <= 12 ? [[n, 0.74]] : [[Math.ceil(n * 0.62), 0.82], [n - Math.ceil(n * 0.62), 0.45]]
    for (const [count, radius] of rings) {
      // offset each ring so the two don't line up spoke-on-spoke
      const phase = radius > 0.6 ? 0 : Math.PI / count
      for (let i = 0; i < count; i++) {
        const a = phase + (i / count) * Math.PI * 2
        out.push([Math.cos(a) * radius, Math.sin(a) * radius])
      }
    }
  } else {
    // a grid, proportioned to the slab so cells stay roughly square. The slab
    // is ~1.6 : 1, so the column count leads.
    const cols = Math.max(1, Math.round(Math.sqrt(n * 1.6)))
    const rows = Math.ceil(n / cols)
    for (let i = 0; i < n; i++) {
      const c = i % cols
      const r = Math.floor(i / cols)
      const x = cols === 1 ? 0 : (c / (cols - 1)) * 2 - 1
      const y = rows === 1 ? 0 : (r / (rows - 1)) * 2 - 1
      out.push([x * 0.78, y * 0.7])
    }
  }
  // a whisker of jitter so a ward never looks machine-stamped
  return out.map(([x, y]) => [x + (rand() - 0.5) * 0.03, y + (rand() - 0.5) * 0.03])
}

/** a point in the circulation space — inside the bed ring, where staff stand */
function circulation(fp: Footprint, rand: () => number): [number, number] {
  if (fp === 'round') {
    const a = rand() * Math.PI * 2
    const r = 0.12 + Math.sqrt(rand()) * 0.42
    return [Math.cos(a) * r, Math.sin(a) * r]
  }
  return [(rand() - 0.5) * 1.5, (rand() - 0.5) * 1.2]
}

// --- provenance -------------------------------------------------------------
// Devices report themselves, so they are the sensed end of the axis; a bed's
// status and a patient's asserted details are where the ghosts live. We bias
// the ORDER of assignment by kind but still hand out exactly the floor's A/B/C
// counts, so the mix stays true to the census while landing where it belongs.
const SENSED_FIRST: Record<CensusKind, number> = {
  device: 0,   // devices report themselves — the sensed end of the axis
  patient: 1,
  bed: 2,
  doctor: 3,   // a person's presence on a floor is mostly asserted, not measured
  nurse: 3,
  ops: 4,
}

function assignProvenance(objects: FloorObject[], mix: Record<StateType, number>, rand: () => number) {
  const n = objects.length
  if (!n) return
  const nA = Math.round((mix.A / 100) * n)
  const nB = Math.round((mix.B / 100) * n)
  const order = objects
    .map((o, i) => ({ i, k: SENSED_FIRST[o.kind] + rand() * 0.9 }))
    .sort((a, b) => a.k - b.k)
  order.forEach(({ i }, rank) => {
    objects[i].stateType = rank < nA ? 'A' : rank < nA + nB ? 'B' : 'C'
  })
}

// --- the entry point --------------------------------------------------------
/**
 * Resolve one floor's census into its objects.
 *
 * `blocks` describes the tier's masses (a twin tier has two); counts are split
 * across them. `hero` names the room the journey passes through — its
 * frontmost bed, that bed's patient and that bed's devices are flagged so the
 * view can pick out the one bed the camera is about to dive into.
 */
export function individuateFloor(
  floorId: string,
  blocks: BlockSpec[],
  hero?: { room: string; arrived?: boolean },
): FloorObject[] {
  const c = censusFor(floorId)
  if (!c || !blocks.length) return []
  const rand = rng(hashStr(floorId))
  const out: FloorObject[] = []
  // default true so every caller that never mentions the patient keeps the
  // behaviour it always had — only the ER's own plot, before he is wheeled in,
  // asks for the hole
  const arrived = hero?.arrived !== false
  let heroBedIdx = -1

  blocks.forEach((blk, bi) => {
    const nBeds = share(c.counts.bed, bi, blocks.length)
    const nPatients = share(c.counts.patient, bi, blocks.length)
    const nDevices = share(c.counts.device, bi, blocks.length)

    // 1. beds — the floor's fixed structure
    const bedPos = layoutBeds(nBeds, blk.footprint, rand)
    const bedIdx: number[] = []
    bedPos.forEach(([u, v], i) => {
      bedIdx.push(out.length)
      out.push({ id: `${floorId}-${bi}-bed-${i}`, kind: 'bed', block: bi, u, v, stateType: 'A' })
    })

    // 1b. WHICH bed the journey lands on — decided here, before the deal,
    //     rather than after it. Step 5 used to pick it by geometry once the
    //     patients were already dealt to the first N beds, and those two never
    //     spoke: the bed the whole story is about got a patient, while some
    //     unrelated bed stood empty. Choosing it first lets the vacancy land
    //     where the story needs it.
    let heroLocal = -1
    if (hero && blk.room === hero.room) {
      bedPos.forEach(([, vv], i) => { if (heroLocal < 0 || vv > bedPos[heroLocal][1]) heroLocal = i })
      if (heroLocal >= 0) heroBedIdx = bedIdx[heroLocal]
    }

    // 2. patients — one per occupied bed. The census always states these two in
    //    agreement (patients === occupancy[0]), so occupancy needs no separate
    //    handling; a patient simply IS an occupied bed.
    //    BEFORE HE ARRIVES the journey's bed is skipped, so the floor reads
    //    15-in-16 with the hole exactly where he is about to land. The census
    //    is untouched — the same fifteen patients, dealt one bed further along.
    const deal = arrived || heroLocal < 0 ? bedIdx : bedIdx.filter((_, i) => i !== heroLocal)
    const occupied = deal.slice(0, Math.min(nPatients, deal.length))
    occupied.forEach((bed, i) => {
      out.push({
        id: `${floorId}-${bi}-pt-${i}`, kind: 'patient', block: bi,
        u: out[bed].u, v: out[bed].v, stateType: 'B', bedOf: bed,
      })
    })
    // a floor can hold more patients than it has beds laid out (a corridor
    // trolley is still a patient) — put the overflow in the circulation space
    for (let i = occupied.length; i < nPatients; i++) {
      const [u, v] = circulation(blk.footprint, rand)
      out.push({ id: `${floorId}-${bi}-pt-${i}`, kind: 'patient', block: bi, u, v, stateType: 'C' })
    }

    // 3. devices — round-robin onto the occupied beds, because that is where
    //    they hang. The ICU's 96 devices over 8 beds is the whole point of the
    //    view: twelve instrumented things per patient, none of them visible to
    //    the people in the room.
    for (let i = 0; i < nDevices; i++) {
      if (occupied.length) {
        const bedSlot = i % occupied.length
        const bed = occupied[bedSlot]
        // even round-robin, so slot/slotCount describe this bed's own fan
        const slot = Math.floor(i / occupied.length)
        const slotCount = Math.ceil((nDevices - bedSlot) / occupied.length)
        const a = rand() * Math.PI * 2
        const r = 0.055 + rand() * 0.085
        out.push({
          id: `${floorId}-${bi}-dev-${i}`, kind: 'device', block: bi,
          u: out[bed].u + Math.cos(a) * r, v: out[bed].v + Math.sin(a) * r,
          stateType: 'A', bedOf: bed, slot, slotCount,
        })
      } else {
        const [u, v] = circulation(blk.footprint, rand)
        out.push({ id: `${floorId}-${bi}-dev-${i}`, kind: 'device', block: bi, u, v, stateType: 'A' })
      }
    }

    // 4. staff — in the circulation space, not on the beds. Each role is its
    //    own class now, so a floor shows the shape of its team rather than one
    //    undifferentiated headcount: nurses outnumber doctors everywhere, and
    //    Command is nothing but ops.
    for (const role of STAFF_KINDS) {
      const n = share(c.counts[role], bi, blocks.length)
      for (let i = 0; i < n; i++) {
        const [u, v] = circulation(blk.footprint, rand)
        out.push({ id: `${floorId}-${bi}-${role}-${i}`, kind: role, block: bi, u, v, stateType: 'B' })
      }
    }
  })

  assignProvenance(out, c.provenance, rand)

  // 5. the hero bed — marked only once he is actually IN it. Everything the
  //    marking drives (the ring, the leader, the callout that names him) is
  //    downstream of this flag, so leaving it unset before he arrives empties
  //    the bed and clears its furniture in one move — no second switch to
  //    fall out of step with.
  if (hero && arrived && heroBedIdx >= 0) {
    out[heroBedIdx].hero = true
    for (const o of out) if (o.bedOf === heroBedIdx) o.hero = true
  }

  return out
}

/** Count objects by kind — used to label the strata, and as the check that
 *  individuation produced exactly what the census promised. */
export function tallyByKind(objects: FloorObject[]): Record<CensusKind, number> {
  const t = Object.fromEntries(CENSUS_KINDS.map((k) => [k, 0])) as Record<CensusKind, number>
  for (const o of objects) t[o.kind]++
  return t
}
