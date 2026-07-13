import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, TransformControls, useGLTF, Grid } from '@react-three/drei'
import * as THREE from 'three'

// ===========================================================================
//  POD COMPOSER  —  atomic-sentient-hospital
//  Editor preserved: click a piece (list or 3D) to select, W/E/R gizmos,
//  orbit anywhere else, "Dump transforms" prints every piece's transform.
//
//  PHASE 1 (structural blockout)  = <Blockout/>  — clean NAMED primitives
//    (green in the list): the drum + fat central spine.
//  PHASE 2 (pod integration)      = <ObsPods/>   — the imported Plastic Beach
//    rooms, each geometry.center()'d so it is INDEPENDENT, then docked radially
//    into the spine at staggered heights (cyan in the list). This fixes the
//    "frozen lump / detached / floating" problems from the raw import.
//  "Show import" overlays the untouched original GLB for comparison.
// ===========================================================================

const URL = '/atomic-sentient-hospital-v2.glb'

type Mode = 'translate' | 'rotate' | 'scale'

// --- central spine geometry (shared by the Spine piece + the docking math) ---
// cylinder args = [radiusTop, radiusBottom, height, radialSegments]
const SPINE = { rTop: 5.5, rBot: 8, h: 46, yc: 34 } // center y=34 => spans y 11..57
const DRUM_TOP = 11 // SickBayDrum sits on the water (y 0..11); pods seat above it
const spineBottom = SPINE.yc - SPINE.h / 2
// spine radius at a given height (for docking pods so they overlap, no gap)
function spineR(y: number) {
  const t = THREE.MathUtils.clamp((y - spineBottom) / SPINE.h, 0, 1)
  return SPINE.rBot + (SPINE.rTop - SPINE.rBot) * t
}

// --- PHASE 1 blockout pieces --------------------------------------------------
interface Piece {
  name: string
  args: [number, number, number, number]
  pos: [number, number, number]
  color: string
}
const PIECES: Piece[] = [
  // wide glazed "EMERGENCY SICK BAY" ring, sitting on the waterline
  { name: 'SickBayDrum', args: [20, 20, DRUM_TOP, 48], pos: [0, DRUM_TOP / 2, 0], color: '#c6ced7' },
  // ONE fat, gently tapered central spine — floors/pods protrude from this
  { name: 'Spine', args: [SPINE.rTop, SPINE.rBot, SPINE.h, 40], pos: [0, SPINE.yc, 0], color: '#ced6df' },
]
const isBlockName = (n: string) => PIECES.some((p) => p.name === n)

// --- PHASE 2 pod layout -------------------------------------------------------
// az = azimuth around the spine (deg); lift = extra height above the drum top.
// Each pod is seated just above the drum (y = DRUM_TOP + its half-height + lift)
// and pushed out until it overlaps the spine. First-pass placement — nudge/dump.
interface PodCfg {
  name: string
  az: number
  lift: number
  scale: number
}
const POD_LAYOUT: PodCfg[] = [
  { name: 'BigFrontRoom', az: 0, lift: 0, scale: 4 },
  { name: 'BigBackRoom', az: 155, lift: 6, scale: 4 },
  { name: 'FrontRoom', az: 70, lift: 12, scale: 4 },
  { name: 'BackRoom', az: 210, lift: 2, scale: 4 },
  { name: 'CliffRoom', az: 290, lift: 16, scale: 4 },
  { name: 'ExtraCliff_1', az: 115, lift: 22, scale: 3 },
  { name: 'ExtraCliff_2', az: 325, lift: 28, scale: 3 },
]
const isPodName = (n: string) => POD_LAYOUT.some((p) => p.name === n)

// azimuth(deg)/elevation(deg)/distance around a target -> camera xyz
function sph(azDeg: number, elDeg: number, dist: number, t: [number, number, number]): [number, number, number] {
  const az = (azDeg * Math.PI) / 180
  const el = (elDeg * Math.PI) / 180
  return [
    t[0] + dist * Math.cos(el) * Math.sin(az),
    t[1] + dist * Math.sin(el),
    t[2] + dist * Math.cos(el) * Math.cos(az),
  ]
}

// set a mesh's initial transform exactly ONCE so React re-renders (selection,
// mode, name polling) never stomp what the gizmo has changed.
function initOnce(
  r: THREE.Object3D | null,
  pos: THREE.Vector3 | [number, number, number],
  rotY = 0,
  scl?: number | THREE.Vector3,
  quat?: THREE.Quaternion,
) {
  if (r && !r.userData._init) {
    if (Array.isArray(pos)) r.position.set(pos[0], pos[1], pos[2])
    else r.position.copy(pos)
    if (quat) r.quaternion.copy(quat)
    else r.rotation.y = rotY
    if (typeof scl === 'number') r.scale.setScalar(scl)
    else if (scl) r.scale.copy(scl)
    r.userData._init = true
  }
}

// ---- PHASE 1 structural blockout (clean parametric primitives) --------------
function Blockout({ onSelect }: { onSelect: (o: THREE.Object3D) => void }) {
  return (
    <>
      {PIECES.map((p) => (
        <mesh
          key={p.name}
          name={p.name}
          castShadow
          receiveShadow
          onClick={(e) => {
            e.stopPropagation()
            onSelect(e.object)
          }}
          ref={(r) => initOnce(r, p.pos)}
        >
          <cylinderGeometry args={p.args} />
          <meshStandardMaterial color={p.color} metalness={0.15} roughness={0.55} />
        </mesh>
      ))}
    </>
  )
}

interface PodPlaced {
  name: string
  geometry: THREE.BufferGeometry
  material: THREE.Material | THREE.Material[]
  pos: [number, number, number]
  yaw: number
  scale: number
}

// ---- PHASE 2: imported rooms, recentered + docked into the spine -------------
function ObsPods({ onSelect }: { onSelect: (o: THREE.Object3D) => void }) {
  const { scene } = useGLTF(URL) as unknown as { scene: THREE.Group }

  const pods = useMemo<PodPlaced[]>(() => {
    const byName: Record<string, THREE.Mesh> = {}
    scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) byName[m.name] = m
    })
    const out: PodPlaced[] = []
    for (const cfg of POD_LAYOUT) {
      const src = byName[cfg.name]
      if (!src) continue
      // clone + recenter so the pod's origin is its own centroid (independent!)
      const geometry = src.geometry.clone()
      geometry.center()
      geometry.computeBoundingBox()
      const bb = geometry.boundingBox!
      const dx = bb.max.x - bb.min.x
      const dz = bb.max.z - bb.min.z
      const dy = bb.max.y - bb.min.y
      // a room shell is thinnest across its window wall -> that thin axis is the
      // outward normal. Orient it radially so the broad glazed face looks OUT.
      const thinIsX = dx <= dz
      const radialHalf = ((thinIsX ? dx : dz) / 2) * cfg.scale
      const halfH = (dy / 2) * cfg.scale
      const y = DRUM_TOP + halfH + cfg.lift // seat above the drum, staggered
      const az = (cfg.az * Math.PI) / 180
      const yaw = thinIsX ? az - Math.PI / 2 : az
      const r = spineR(y) + radialHalf - 1.5 // overlap into the spine, no gap
      out.push({
        name: cfg.name,
        geometry,
        material: src.material,
        pos: [Math.sin(az) * r, y, Math.cos(az) * r],
        yaw,
        scale: cfg.scale,
      })
    }
    return out
  }, [scene])

  return (
    <>
      {pods.map((p) => (
        <mesh
          key={p.name}
          name={p.name}
          geometry={p.geometry}
          material={p.material}
          castShadow
          receiveShadow
          onClick={(e) => {
            e.stopPropagation()
            onSelect(e.object)
          }}
          ref={(r) => initOnce(r, p.pos, p.yaw, p.scale)}
        />
      ))}
    </>
  )
}

interface PodInit {
  name: string
  geometry: THREE.BufferGeometry
  material: THREE.Material | THREE.Material[]
  pos: THREE.Vector3
  quat: THREE.Quaternion
  scl: THREE.Vector3
}

// ---- the untouched imported mesh, at its original baked transforms (compare) -
function Pods({ onSelect }: { onSelect: (o: THREE.Object3D) => void }) {
  const { scene } = useGLTF(URL) as unknown as { scene: THREE.Group }
  const pods = useMemo<PodInit[]>(() => {
    scene.updateMatrixWorld(true)
    const out: PodInit[] = []
    scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        const pos = new THREE.Vector3()
        const quat = new THREE.Quaternion()
        const scl = new THREE.Vector3()
        m.matrixWorld.decompose(pos, quat, scl)
        out.push({ name: m.name, geometry: m.geometry, material: m.material, pos, quat, scl })
      }
    })
    return out
  }, [scene])

  return (
    <>
      {pods.map((p) => (
        <mesh
          key={'imp_' + p.name}
          name={p.name}
          geometry={p.geometry}
          material={p.material}
          onClick={(e) => {
            e.stopPropagation()
            onSelect(e.object)
          }}
          ref={(r) => initOnce(r, p.pos, 0, p.scl, p.quat)}
        />
      ))}
    </>
  )
}
useGLTF.preload(URL)

// live bounding-box outline around the currently-selected piece (panel -> 3D feedback)
function SelectionBox({ object }: { object: THREE.Object3D }) {
  const box = useMemo(() => new THREE.Box3(), [])
  const helper = useMemo(() => {
    const h = new THREE.Box3Helper(box, new THREE.Color('#ffd23f'))
    ;(h.material as THREE.LineBasicMaterial).depthTest = false
    h.renderOrder = 999
    return h
  }, [box])
  useFrame(() => {
    box.setFromObject(object)
    helper.updateMatrixWorld(true)
  })
  return <primitive object={helper} />
}

export function PodComposer() {
  const groupRef = useRef<THREE.Group | null>(null)
  const [selected, setSelected] = useState<THREE.Object3D | null>(null)
  const [mode, setMode] = useState<Mode>('translate')
  const [dump, setDump] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  const [names, setNames] = useState<string[]>([])
  const [showImport, setShowImport] = useState(false)
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // camera from URL (?a=azimuth&e=elevation&d=distance&ty=targetHeight) for
  // repeatable headless screenshots; falls back to a default 3/4 view.
  const cam = useMemo(() => {
    const q = new URLSearchParams(window.location.search)
    const a = parseFloat(q.get('a') ?? '')
    const e = parseFloat(q.get('e') ?? '')
    const d = parseFloat(q.get('d') ?? '')
    const ty = parseFloat(q.get('ty') ?? '')
    const target: [number, number, number] = [0, isNaN(ty) ? 30 : ty, 0]
    const has = !isNaN(a) && !isNaN(e) && !isNaN(d)
    const position: [number, number, number] = has ? sph(a, e, d, target) : [95, 55, 100]
    return { position, target }
  }, [])

  // 3D selection -> scroll the matching panel row into view so its highlight is visible
  useEffect(() => {
    if (selected) itemRefs.current[selected.name]?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  // keep the name list in sync with whatever is in the group (updates when the
  // import toggle flips, without stomping gizmo state)
  useEffect(() => {
    const tick = () => {
      const g = groupRef.current
      if (!g) return
      const ns = Array.from(new Set(g.children.map((c) => c.name).filter(Boolean))).sort()
      setNames((prev) => (prev.join('|') === ns.join('|') ? prev : ns))
    }
    const id = setInterval(tick, 400)
    tick()
    return () => clearInterval(id)
  }, [showImport])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'w') setMode('translate')
      if (e.key === 'e') setMode('rotate')
      if (e.key === 'r') setMode('scale')
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const selectByName = (n: string) => {
    // the import ghost is nested in its own wrapper, so this only ever finds the
    // editable Phase 1/2 piece
    const obj = groupRef.current?.children.find((c) => c.name === n)
    if (obj) setSelected(obj)
  }

  const dumpTransforms = () => {
    const out: Record<string, { position: number[]; rotation: number[]; scale: number[] }> = {}
    const r3 = (v: number) => +v.toFixed(3)
    groupRef.current?.children.forEach((c) => {
      if (!c.name) return // skip the import wrapper group
      out[c.name] = {
        position: c.position.toArray().map(r3),
        rotation: [c.rotation.x, c.rotation.y, c.rotation.z].map(r3),
        scale: c.scale.toArray().map(r3),
      }
    })
    const text = JSON.stringify(out, null, 2)
    // eslint-disable-next-line no-console
    console.log('POD TRANSFORMS\n' + text)
    setDump(text)
  }

  const btn = (active: boolean): CSSProperties => ({
    padding: '6px 10px',
    borderRadius: 8,
    border: '1px solid #3a4657',
    background: active ? '#2b6cff' : '#141b26',
    color: '#e7eef7',
    cursor: 'pointer',
    font: '600 12px system-ui, sans-serif',
  })

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0b0f14' }}>
      <Canvas
        shadows
        camera={{ position: cam.position, fov: 40, near: 0.5, far: 2000 }}
        onPointerMissed={() => setSelected(null)}
      >
        <hemisphereLight args={['#dfeaff', '#26303c', 1.1]} />
        <directionalLight position={[60, 90, 40]} intensity={2.2} castShadow />
        <directionalLight position={[-50, 40, -30]} intensity={0.7} />
        <Grid
          args={[400, 400]}
          cellSize={5}
          cellColor="#2a3442"
          sectionSize={25}
          sectionColor="#3d4b5e"
          infiniteGrid
          fadeDistance={400}
        />
        <group ref={groupRef}>
          <Blockout onSelect={setSelected} />
          <ObsPods onSelect={setSelected} />
          {showImport && (
            <group userData={{ _importWrap: true }}>
              <Pods onSelect={setSelected} />
            </group>
          )}
        </group>
        {selected && <SelectionBox object={selected} />}
        {selected && <TransformControls object={selected} mode={mode} />}
        <OrbitControls makeDefault target={cam.target} />
      </Canvas>

      {/* ---- overlay UI ---- */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          width: collapsed ? 'auto' : 236,
          maxHeight: 'calc(100vh - 24px)',
          overflow: 'auto',
          padding: 12,
          borderRadius: 12,
          background: 'rgba(10,15,22,0.86)',
          border: '1px solid #24303f',
          backdropFilter: 'blur(8px)',
          color: '#cdd8e6',
          font: '500 12px system-ui, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            marginBottom: collapsed ? 0 : 8,
          }}
        >
          <span style={{ fontWeight: 700, color: '#fff' }}>Pod Composer · Phase 2</span>
          <button
            onClick={() => setCollapsed((c) => !c)}
            style={{ ...btn(false), padding: '2px 9px' }}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? '▸' : '▾'}
          </button>
        </div>
        {!collapsed && (
          <>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <button style={btn(mode === 'translate')} onClick={() => setMode('translate')}>Move (W)</button>
              <button style={btn(mode === 'rotate')} onClick={() => setMode('rotate')}>Rot (E)</button>
              <button style={btn(mode === 'scale')} onClick={() => setMode('scale')}>Scale (R)</button>
            </div>
            <div
              style={{
                marginBottom: 8,
                padding: '6px 8px',
                borderRadius: 8,
                background: selected ? '#20375a' : '#141b26',
                border: '1px solid ' + (selected ? '#ffd23f' : '#24303f'),
                color: '#8fa3ba',
                fontSize: 11,
              }}
            >
              Selected: <b style={{ color: selected ? '#ffd23f' : '#5b6b7d' }}>{selected?.name ?? 'none'}</b>
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <button style={btn(false)} onClick={dumpTransforms}>Dump transforms</button>
              <button style={btn(false)} onClick={() => setSelected(null)}>Deselect</button>
            </div>
            <label
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                marginBottom: 8,
                padding: '6px 8px',
                borderRadius: 8,
                background: '#141b26',
                border: '1px solid #24303f',
                cursor: 'pointer',
                color: '#a9b7c8',
                fontSize: 11,
              }}
            >
              <input type="checkbox" checked={showImport} onChange={(e) => setShowImport(e.target.checked)} />
              Show import (original positions)
            </label>
            <div style={{ display: 'flex', gap: 12, marginBottom: 6, fontSize: 10, color: '#6b7a8c' }}>
              <span style={{ color: '#7fd7a5' }}>■ blockout</span>
              <span style={{ color: '#5fd1e6' }}>■ pods</span>
            </div>
            <div style={{ borderTop: '1px solid #24303f', paddingTop: 8 }}>
              {names.map((n) => {
                const active = selected?.name === n
                const tone = isBlockName(n) ? '#7fd7a5' : isPodName(n) ? '#5fd1e6' : '#7a8798'
                return (
                  <div
                    key={n}
                    ref={(el) => {
                      itemRefs.current[n] = el
                    }}
                    onClick={() => selectByName(n)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      borderLeft: active ? '3px solid #ffd23f' : '3px solid transparent',
                      background: active ? '#20375a' : 'transparent',
                      color: active ? '#ffffff' : tone,
                      fontWeight: active ? 700 : 600,
                    }}
                  >
                    {n}
                  </div>
                )
              })}
            </div>
            {dump && (
              <pre
                style={{
                  marginTop: 8,
                  padding: 8,
                  maxHeight: 220,
                  overflow: 'auto',
                  background: '#080c11',
                  borderRadius: 8,
                  color: '#7fd7a5',
                  font: '500 10px ui-monospace, monospace',
                  whiteSpace: 'pre',
                }}
              >
                {dump}
              </pre>
            )}
          </>
        )}
      </div>
    </div>
  )
}
