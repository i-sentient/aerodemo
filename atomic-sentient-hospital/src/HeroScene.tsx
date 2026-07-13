import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  ContactShadows,
  Environment,
  Grid,
  Lightformer,
  OrbitControls,
  useGLTF,
  useTexture,
} from '@react-three/drei'
import { useControls, Leva } from 'leva'
import * as THREE from 'three'

// ===========================================================================
//  HERO SCENE — Rodin structure, two looks via the scene.mode switch:
//    • studio    = brushed-aluminium maquette (strip-light rig, masked
//                  transmission-glass visors) — see notes below
//    • hologram  = additive cyan projection: fresnel rim, drifting scanlines,
//                  flicker, floor grid + emitter glow, dark backdrop
//  GLB is geometry-only; all looks are authored here.
//  PodComposer (the editor) still lives at /?view=composer.
// ===========================================================================

const ENV_PRESETS = ['strips', 'studio', 'city', 'dawn', 'sunset', 'warehouse'] as const

// composite horizontal brushed streaks into the ORM's G (roughness) channel;
// B (metalness) untouched. SUBTLE — chaotic atlas UVs turn strong variation
// into patchwork, not grain.
function brushORM(orm: THREE.Texture): THREE.Texture {
  try {
    const img = orm.image as HTMLImageElement | undefined
    if (!img || !img.width) return orm
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    const g = c.getContext('2d', { willReadFrequently: true })!
    g.drawImage(img, 0, 0)
    const data = g.getImageData(0, 0, c.width, c.height)
    const px = data.data
    const rows = new Float32Array(c.height)
    let v = 0.96
    for (let y = 0; y < c.height; y++) {
      v += (Math.random() - 0.5) * 0.06
      v = Math.min(1.0, Math.max(0.9, v))
      rows[y] = v
    }
    for (let y = 0; y < c.height; y++) {
      const f = rows[y]
      let i = y * c.width * 4
      for (let x = 0; x < c.width; x++, i += 4) {
        if (px[i + 2] > 128) px[i + 1] = Math.min(255, px[i + 1] * f)
      }
    }
    g.putImageData(data, 0, 0)
    const t = new THREE.CanvasTexture(c)
    t.flipY = false
    t.colorSpace = THREE.NoColorSpace
    t.anisotropy = 8
    t.needsUpdate = true
    return t
  } catch {
    return orm
  }
}

// Build a CLEAN metal/rough map straight from the (smooth) window mask, so the
// body/glass split no longer inherits the atlas soup that made the ORM patchy:
//   G (roughness) = brushed body (~0.30 with faint horizontal streaks) → shiny glass
//   B (metalness) = body 1.0 → glass 0.0 (dielectric, so transmission reads right)
function buildMetalRough(win: THREE.Texture): THREE.Texture | null {
  try {
    const img = win.image as HTMLImageElement | undefined
    if (!img || !img.width) return null
    const w = img.width
    const h = img.height
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const g = c.getContext('2d', { willReadFrequently: true })!
    g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, w, h)
    const px = d.data
    // per-row brushed streak profile for the body roughness
    const rows = new Float32Array(h)
    let v = 1
    for (let y = 0; y < h; y++) {
      v += (Math.sin(y * 0.7) + Math.sin(y * 3.13)) * 0.012
      rows[y] = Math.min(1.12, Math.max(0.88, v))
    }
    for (let y = 0; y < h; y++) {
      const streak = rows[y]
      let i = y * w * 4
      for (let x = 0; x < w; x++, i += 4) {
        const glass = px[i] / 255 // window mask: bright = glass
        const body = 1 - glass
        // FINAL roughness values (material scalar is 1.0 so the map isn't scaled):
        // satin-brushed body ~0.40, shiny glass ~0.08
        const rough = 0.08 * glass + Math.min(0.5, 0.4 * streak) * body
        px[i] = 0
        px[i + 1] = Math.round(rough * 255) // G = roughness
        px[i + 2] = Math.round(body * 255) // B = metalness
        px[i + 3] = 255
      }
    }
    g.putImageData(d, 0, 0)
    const t = new THREE.CanvasTexture(c)
    t.flipY = false
    t.colorSpace = THREE.NoColorSpace
    t.anisotropy = 8
    t.needsUpdate = true
    return t
  } catch {
    return null
  }
}

const HOLO_VERT = /* glsl */ `
  varying vec3 vN;
  varying vec3 vW;
  void main() {
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`
const HOLO_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uScan;
  uniform float uSpeed;
  uniform float uGridStrength; // world-space grid overlay (rings + meridians)
  uniform float uGridSpace;    // vertical ring spacing (world units)
  uniform float uMeridians;    // radial line count around the Y axis
  varying vec3 vN;
  varying vec3 vW;
  void main() {
    vec3 n = normalize(vN);
    vec3 v = normalize(cameraPosition - vW);
    float fres = pow(1.0 - abs(dot(n, v)), 1.8);
    float scan = 0.62 + 0.38 * sin(vW.y * uScan - uTime * uSpeed);          // broad drifting band
    float lines = 0.85 + 0.15 * sin(vW.y * uScan * 9.0 + uTime * 2.0);     // fine scanlines
    float flick = 0.94 + 0.06 * sin(uTime * 37.0) * sin(uTime * 13.7);     // projector flicker
    // world grid: horizontal contour rings + vertical meridians
    float dy = abs(fract(vW.y / uGridSpace + 0.5) - 0.5) * uGridSpace;
    float ring = 1.0 - smoothstep(0.0, 0.30, dy);
    float ang = atan(vW.z, vW.x);
    float arc = abs(fract(ang * uMeridians / 6.2831853 + 0.5) - 0.5) * (6.2831853 / uMeridians) * length(vW.xz);
    float mer = 1.0 - smoothstep(0.0, 0.35, arc);
    float grid = max(ring, mer) * uGridStrength;
    float base = 0.10 + 0.90 * fres;
    float a = (base + grid) * scan * lines * flick * uIntensity;
    gl_FragColor = vec4(uColor * a, a);
  }
`

// radial-gradient disc under the hologram (the "projector" pool of light)
function useEmitterTexture(hex: string) {
  return useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 256
    const g = c.getContext('2d')!
    const grad = g.createRadialGradient(128, 128, 4, 128, 128, 128)
    grad.addColorStop(0, '#ffffff')
    grad.addColorStop(0.25, hex)
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 256, 256)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [hex])
}

function Structure({ mode }: { mode: string }) {
  const { scene } = useGLTF('/models/structure.glb')
  const [winMask, ormRaw, colorMask] = useTexture([
    '/models/winmask.png',
    '/models/orm.png',
    '/models/colormask.png',
  ])

  const ctl = useControls('material (studio)', {
    bodyColor: '#c6cace',
    metalness: { value: 1, min: 0, max: 1, step: 0.01 },
    roughness: { value: 1.0, min: 0, max: 1, step: 0.01 },
    anisotropy: { value: 0.5, min: 0, max: 1, step: 0.01 },
    transmission: { value: 0.16, min: 0, max: 1, step: 0.01 },
    thickness: { value: 4.0, min: 0, max: 6, step: 0.05 },
    glassTint: '#1e2830',
    attenDist: { value: 11, min: 2, max: 60, step: 1 },
    glassCoat: { value: 0.95, min: 0, max: 1, step: 0.01 },
    emissiveColor: '#9fd0e0',
    emissiveIntensity: { value: 0.14, min: 0, max: 5, step: 0.05 },
    envIntensity: { value: 1.25, min: 0, max: 3, step: 0.05 },
  })

  const holo = useControls('hologram', {
    holoColor: '#37c8ff',
    fillIntensity: { value: 0.5, min: 0, max: 4, step: 0.05 },
    wireIntensity: { value: 0.95, min: 0, max: 4, step: 0.05 },
    gridStrength: { value: 0.85, min: 0, max: 3, step: 0.05 },
    gridSpacing: { value: 7, min: 1, max: 30, step: 0.5 },
    meridians: { value: 28, min: 4, max: 96, step: 1 },
    scanDensity: { value: 0.9, min: 0.05, max: 4, step: 0.05 },
    scanSpeed: { value: 2.2, min: 0, max: 10, step: 0.1 },
  })

  useMemo(() => {
    for (const t of [winMask, ormRaw, colorMask]) {
      t.flipY = false
      t.colorSpace = THREE.NoColorSpace
      t.anisotropy = 8
      t.needsUpdate = true
    }
  }, [winMask, ormRaw, colorMask])

  // clean procedural metal/rough map (falls back to the brushed ORM if the
  // mask image isn't decoded yet on the first pass)
  const orm = useMemo(() => buildMetalRough(winMask) ?? brushORM(ormRaw), [winMask, ormRaw])

  const studioMat = useMemo(() => {
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(ctl.bodyColor),
      map: colorMask,
      metalness: ctl.metalness,
      roughness: ctl.roughness,
      metalnessMap: orm,
      roughnessMap: orm,
      anisotropy: ctl.anisotropy,
      transmission: ctl.transmission,
      transmissionMap: winMask,
      thickness: ctl.thickness,
      ior: 1.45,
      attenuationColor: new THREE.Color(ctl.glassTint),
      attenuationDistance: ctl.attenDist,
      clearcoat: ctl.glassCoat,
      clearcoatMap: winMask,
      clearcoatRoughness: 0.08,
      emissive: new THREE.Color(ctl.emissiveColor),
      emissiveMap: winMask,
      emissiveIntensity: ctl.emissiveIntensity,
      envMapIntensity: ctl.envIntensity,
    })
  }, [ctl, winMask, orm, colorMask])

  const makeHoloMat = (wireframe: boolean) =>
    new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(holo.holoColor) },
        uIntensity: { value: 1 },
        uScan: { value: holo.scanDensity },
        uSpeed: { value: holo.scanSpeed },
        uGridStrength: { value: 0 },
        uGridSpace: { value: holo.gridSpacing },
        uMeridians: { value: holo.meridians },
      },
      vertexShader: HOLO_VERT,
      fragmentShader: HOLO_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      wireframe,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const holoFill = useMemo(() => makeHoloMat(false), [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const holoWire = useMemo(() => makeHoloMat(true), [])

  // live-update holo uniforms without rebuilding the shaders
  useEffect(() => {
    for (const m of [holoFill, holoWire]) {
      m.uniforms.uColor.value.set(holo.holoColor)
      m.uniforms.uScan.value = holo.scanDensity
      m.uniforms.uSpeed.value = holo.scanSpeed
      m.uniforms.uGridSpace.value = holo.gridSpacing
      m.uniforms.uMeridians.value = holo.meridians
    }
    holoFill.uniforms.uIntensity.value = holo.fillIntensity
    holoFill.uniforms.uGridStrength.value = holo.gridStrength // grid lives on the fill layer
    holoWire.uniforms.uIntensity.value = holo.wireIntensity
  }, [holo, holoFill, holoWire])

  useFrame((s) => {
    holoFill.uniforms.uTime.value = s.clock.elapsedTime
    holoWire.uniforms.uTime.value = s.clock.elapsedTime
  })

  // second copy of the scene graph for the wireframe pass (geometry is shared)
  const wireScene = useMemo(() => scene.clone(true), [scene])

  useMemo(() => {
    const mat = mode === 'hologram' ? holoFill : studioMat
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) {
        mesh.material = mat
        mesh.castShadow = mesh.receiveShadow = mode !== 'hologram'
      }
    })
    wireScene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) {
        mesh.material = holoWire
        mesh.castShadow = mesh.receiveShadow = false
        mesh.renderOrder = 2 // wires draw over the ghost fill
      }
    })
  }, [scene, wireScene, studioMat, holoFill, holoWire, mode])

  return (
    <>
      <primitive object={scene} />
      {mode === 'hologram' && <primitive object={wireScene} />}
    </>
  )
}
useGLTF.preload('/models/structure.glb')

// car-studio strip rig: bright THIN bands over a dim surround => the streaked
// brushed-aluminium highlights read only when the gaps between strips stay dark.
function StripEnvironment() {
  return (
    <Environment resolution={512} frames={1}>
      {/* dim cool surround — keeps reflections dark between the strips (= contrast) */}
      <Lightformer form="rect" intensity={0.32} position={[0, 40, -400]} scale={[900, 900, 1]} color="#9aa4ad" />
      <Lightformer form="rect" intensity={0.3} position={[0, 40, 400]} rotation-y={Math.PI} scale={[900, 900, 1]} color="#98a2ab" />
      {/* broad soft top key — sheen across the upper curves */}
      <Lightformer form="rect" intensity={1.5} position={[0, 320, 40]} rotation-x={Math.PI / 2} scale={[520, 520, 1]} color="#ffffff" />
      {/* stacked horizontal strips down each flank => brushed streak highlights */}
      <Lightformer form="rect" intensity={3.4} position={[-350, 215, 90]} rotation-y={Math.PI / 2} scale={[840, 13, 1]} color="#ffffff" />
      <Lightformer form="rect" intensity={2.6} position={[-350, 120, 90]} rotation-y={Math.PI / 2} scale={[840, 9, 1]} color="#e9f1fb" />
      <Lightformer form="rect" intensity={3.0} position={[365, 180, 70]} rotation-y={-Math.PI / 2} scale={[840, 12, 1]} color="#ffffff" />
      <Lightformer form="rect" intensity={2.2} position={[365, 90, 70]} rotation-y={-Math.PI / 2} scale={[840, 8, 1]} color="#eef4fb" />
      {/* low warm kicker — a touch of temperature against all the cool */}
      <Lightformer form="rect" intensity={1.2} position={[0, 55, 360]} scale={[720, 16, 1]} color="#fff0d8" />
    </Environment>
  )
}

function HoloStage({ color }: { color: string }) {
  const emitter = useEmitterTexture(color)
  return (
    <>
      <Grid
        position={[0, 0.1, 0]}
        args={[1200, 1200]}
        cellSize={20}
        cellColor="#0d3444"
        sectionSize={100}
        sectionColor="#14556e"
        fadeDistance={900}
        infiniteGrid
      />
      <mesh position={[0, 0.6, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[260, 260]} />
        <meshBasicMaterial
          map={emitter}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          opacity={0.55}
        />
      </mesh>
    </>
  )
}

// URL overrides for headless screenshots / deep-linking:
//   ?mode=studio|hologram  ·  ?a=<az°>&e=<el°>&d=<dist>&ty=<targetY>
const P = new URLSearchParams(window.location.search)
const numP = (k: string, d: number) => {
  const v = parseFloat(P.get(k) ?? '')
  return Number.isFinite(v) ? v : d
}
const CAM_TARGET: [number, number, number] = [0, numP('ty', 72), 0]
const CAM_POS: [number, number, number] = (() => {
  if (!P.has('a') && !P.has('e') && !P.has('d')) return [200, 135, 290]
  const az = (numP('a', 55) * Math.PI) / 180
  const el = (numP('e', 10) * Math.PI) / 180
  const d = numP('d', 360)
  return [
    d * Math.cos(el) * Math.sin(az),
    CAM_TARGET[1] + d * Math.sin(el),
    d * Math.cos(el) * Math.cos(az),
  ]
})()
const URL_MODE = P.get('mode')

// ── Emergency Sick Bay drum — the flyby target. World coords come from the
//    structure bbox (center [0,75.5,5.3], size [104,149,113.3], y∈[1,150]);
//    the wide base drum is the low, widest tier. Tune these to frame it.
export type Flight = 'none' | 'in' | 'out'
const DRUM_CENTER: [number, number, number] = [0, 34, 5]
const DRUM_RADIUS = 50
const DRUM_HEIGHT = 18
const CAM_DRUM_END: [number, number, number] = [0, 40, 78] // camera end of the fly-in (just outside the front rim, low)
const DRUM_LOOK: [number, number, number] = [0, 30, 5] // what the camera looks at at the end of the fly-in

const V = (a: [number, number, number]) => new THREE.Vector3(...a)
const END_IN_POS = V(CAM_DRUM_END)
const DRUM_LOOK_V = V(DRUM_LOOK)
const OVERVIEW_POS = V(CAM_POS)
const OVERVIEW_LOOK = V(CAM_TARGET)
const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2)

// Drives the camera into the drum ('in') or back out to the overview ('out'),
// firing onArrived / onReturned when a leg completes. OrbitControls is disabled
// (via `enabled`) whenever flight !== 'none', so they never fight.
function FlyController({ flight, onProgress, onArrived, onReturned }: {
  flight: Flight
  onProgress?: (t: number) => void
  onArrived?: () => void
  onReturned?: () => void
}) {
  const camera = useThree((s) => s.camera)
  const t = useRef(0)
  const from = useRef(new THREE.Vector3())
  const fromLook = useRef(new THREE.Vector3())
  const tmp = useRef(new THREE.Vector3())
  const leg = useRef<Flight>('none')

  useEffect(() => {
    if (flight === 'in') {
      from.current.copy(camera.position)
      fromLook.current.copy(OVERVIEW_LOOK)
      t.current = 0
      leg.current = 'in'
    } else if (flight === 'out') {
      camera.position.copy(END_IN_POS)
      camera.lookAt(DRUM_LOOK_V)
      from.current.copy(END_IN_POS)
      fromLook.current.copy(DRUM_LOOK_V)
      t.current = 0
      leg.current = 'out'
    } else {
      leg.current = 'none'
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight])

  useFrame((_, dt) => {
    if (leg.current === 'none') return
    const DUR = leg.current === 'in' ? 2.6 : 2.2
    t.current = Math.min(1, t.current + dt / DUR)
    const e = easeInOut(t.current)
    if (leg.current === 'in') {
      camera.position.lerpVectors(from.current, END_IN_POS, e)
      tmp.current.lerpVectors(fromLook.current, DRUM_LOOK_V, e)
    } else {
      camera.position.lerpVectors(from.current, OVERVIEW_POS, e)
      tmp.current.lerpVectors(fromLook.current, OVERVIEW_LOOK, e)
    }
    camera.lookAt(tmp.current)
    onProgress?.(t.current)
    if (t.current >= 1) {
      const done = leg.current
      leg.current = 'none'
      if (done === 'in') onArrived?.()
      else onReturned?.()
    }
  })
  return null
}

// A faint cyan halo + rim rings around the emergency drum that brighten on
// hover — marks the "selected block" and triggers the fly-in on click.
function DrumHotspot({ onClick }: { onClick?: () => void }) {
  const [hover, setHover] = useState(false)
  useEffect(() => {
    document.body.style.cursor = hover ? 'pointer' : 'auto'
    return () => { document.body.style.cursor = 'auto' }
  }, [hover])
  const ring = (y: number) => (
    <mesh position={[0, y, 0]} rotation-x={Math.PI / 2}>
      <torusGeometry args={[DRUM_RADIUS + 1.5, hover ? 0.8 : 0.4, 8, 96]} />
      <meshBasicMaterial color="#8fe6ff" transparent opacity={hover ? 0.95 : 0.5} depthWrite={false} toneMapped={false} />
    </mesh>
  )
  return (
    <group position={DRUM_CENTER}>
      <mesh
        onPointerOver={(e) => { e.stopPropagation(); setHover(true) }}
        onPointerOut={() => setHover(false)}
        onClick={(e) => { e.stopPropagation(); onClick?.() }}
      >
        <cylinderGeometry args={[DRUM_RADIUS + 1.5, DRUM_RADIUS + 1.5, DRUM_HEIGHT, 64, 1, true]} />
        <meshBasicMaterial color="#37c8ff" transparent opacity={hover ? 0.16 : 0.05} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
      {ring(DRUM_HEIGHT / 2)}
      {ring(-DRUM_HEIGHT / 2)}
    </group>
  )
}

export function HeroScene({ flight = 'none', initialMode, onDrumClick, onFlyProgress, onArrived, onReturned }: {
  flight?: Flight
  initialMode?: 'studio' | 'hologram'
  onDrumClick?: () => void
  onFlyProgress?: (t: number) => void
  onArrived?: () => void
  onReturned?: () => void
} = {}) {
  const { mode, envPreset, background } = useControls('scene', {
    mode: {
      value:
        URL_MODE === 'studio' || URL_MODE === 'hologram'
          ? URL_MODE
          : initialMode ?? 'hologram',
      options: ['hologram', 'studio'],
    },
    envPreset: { value: 'strips', options: [...ENV_PRESETS] },
    background: '#d7dce1',
  })
  const isHolo = mode === 'hologram'
  // soft neutral studio gradient behind the alpha canvas (matches the ref backdrop)
  const studioBg = `linear-gradient(165deg, #eef0f2 0%, ${background} 52%, #c9cdd1 100%)`

  return (
    <div style={{ position: 'fixed', inset: 0, background: isHolo ? '#05080d' : studioBg }}>
      <Leva hidden={P.has('bare')} collapsed />
      <Canvas
        shadows
        camera={{ position: CAM_POS, fov: 35, near: 1, far: 4000 }}
        gl={{ antialias: true, alpha: !isHolo }}
      >
        {isHolo && <color attach="background" args={['#05080d']} />}
        <Suspense fallback={null}>
          <Structure mode={mode} />
          {flight === 'none' && <DrumHotspot onClick={onDrumClick} />}
          {!isHolo &&
            (envPreset === 'strips' ? (
              <StripEnvironment />
            ) : (
              <Environment preset={envPreset as Exclude<(typeof ENV_PRESETS)[number], 'strips'>} />
            ))}
        </Suspense>
        {isHolo ? (
          <HoloStage color="#37c8ff" />
        ) : (
          <ContactShadows position={[0, 0.4, 0]} opacity={0.45} scale={420} blur={2.2} far={170} resolution={512} />
        )}
        <FlyController flight={flight} onProgress={onFlyProgress} onArrived={onArrived} onReturned={onReturned} />
        <OrbitControls makeDefault enabled={flight === 'none'} target={[0, 72, 0]} maxPolarAngle={Math.PI * 0.55} />
      </Canvas>
      {flight === 'none' && (
        <button
          onClick={onDrumClick}
          style={{
            position: 'absolute',
            bottom: 22,
            left: '50%',
            transform: 'translateX(-50%)',
            font: '700 13px ui-sans-serif, system-ui, sans-serif',
            letterSpacing: 0.5,
            color: '#0b2f3a',
            background: 'rgba(180,232,255,0.82)',
            border: '1px solid rgba(80,180,220,0.7)',
            borderRadius: 11,
            padding: '9px 16px',
            cursor: 'pointer',
            boxShadow: '0 4px 18px rgba(40,120,160,0.28)',
            backdropFilter: 'blur(8px)',
          }}
        >
          ▶ Enter Emergency Sick Bay
        </button>
      )}
    </div>
  )
}
