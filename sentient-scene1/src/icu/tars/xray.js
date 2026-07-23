import * as THREE from 'three';

// Holographic "X-ray" material: fresnel edge-glow + travelling scan band +
// bottom→top materialise reveal. Additive so everything reads translucent.
export function makeXrayMaterial({
  color = 0x5fd8ff, intensity = 0.6, power = 2.6, opacity = 0.6,
  yMin = 0, yMax = 2, scanSpeed = 0.12,
} = {}) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: intensity },
      uPower: { value: power },
      uOpacity: { value: opacity },
      uTime: { value: 0 },
      uReveal: { value: 1 },
      uYMin: { value: yMin },
      uYMax: { value: yMax },
      uScanSpeed: { value: scanSpeed },
    },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vV; varying float vWY;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        vWY = wp.y;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uIntensity; uniform float uPower; uniform float uOpacity;
      uniform float uTime; uniform float uReveal; uniform float uYMin; uniform float uYMax; uniform float uScanSpeed;
      varying vec3 vN; varying vec3 vV; varying float vWY;
      void main(){
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPower);
        float span = max(0.0001, uYMax - uYMin);
        float scanY = uYMin + span * fract(uTime * uScanSpeed);
        float band = exp(-pow((vWY - scanY) / (span * 0.06), 2.0));
        float core = fres * uIntensity + band * 0.5;
        // materialise from the feet up
        float revLine = mix(uYMin - 0.05, uYMax + 0.25, uReveal);
        float above = smoothstep(revLine - 0.12, revLine, vWY);
        float edge = smoothstep(revLine - 0.05, revLine, vWY) * (1.0 - smoothstep(revLine, revLine + 0.07, vWY));
        float a = core * uOpacity * (1.0 - above) + edge * 0.9;
        if (a < 0.003) discard;
        vec3 col = uColor * (1.0 + band * 1.6) + vec3(edge);
        gl_FragColor = vec4(col, a);
      }`,
  });
}

// Hologram scan material for a loaded mesh (skeleton-skinned safe): fresnel
// edge-glow + travelling scanlines injected into a lit material via onBeforeCompile.
// Works with SkinnedMesh (skinning chunks preserved) and supports a clip plane.
export function makeHologramMaterial(clip, color = 0x49e0ff) {
  const m = new THREE.MeshStandardMaterial({
    color: 0x0b333f, emissive: new THREE.Color(color), emissiveIntensity: 0.45,
    roughness: 0.4, metalness: 0.0, transparent: true, opacity: 0.5, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, clippingPlanes: clip ? [clip] : null,
  });
  m.userData.uTime = { value: 0 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = m.userData.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvHPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vHPos;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float fres = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.3);
        float scan = 0.5 + 0.5 * sin(vHPos.y * 60.0 - uTime * 3.0);
        float band = smoothstep(0.0, 1.0, sin(vHPos.y * 3.0 + uTime * 0.8));
        totalEmissiveRadiance += emissive * (fres * 2.4 + scan * 0.12 + band * 0.08 + 0.04);`);
  };
  return m;
}

// Translucent "clinical X-ray" material for a LIGHT background (reference look):
// unlit teal whose alpha rises at grazing angles, so silhouettes/edges read dense
// and flat faces stay see-through. Normal blending + no depth-write => overlapping
// systems accumulate into an X-ray-on-light scan. Supports a materialise clip plane.
export function makeClinicalXrayMaterial(clip, color = 0x2f8d8e) {
  const m = new THREE.MeshStandardMaterial({
    color, roughness: 0.58, metalness: 0.0,
    transparent: false, depthWrite: true, depthTest: true,
    side: THREE.DoubleSide, clippingPlanes: clip ? [clip] : null,
  });
  m.userData.uTime = { value: 0 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = m.userData.uTime;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float fr = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 1.7);
        diffuseColor.rgb *= mix(1.0, 0.38, fr);                 // silhouette darkening -> volume
        totalEmissiveRadiance += vec3(0.05, 0.27, 0.28) * fr;   // faint teal edge`);
  };
  return m;
}

// "Grid" material: the wireframe-lattice scan look, drawn PROCEDURALLY on a solid body mesh
// (body.glb) rather than read off baked wire geometry. The old grid.glb welded each wire into
// a solid tube, so both cell count and line weight were fixed at authoring time — this makes
// them uniforms instead: `density` = lattice lines per world unit, `width` = line weight in
// PIXELS (constant on screen at any zoom, so it stays hairline when the camera pushes in).
//
// The lattice is triplanar: three axis-aligned grids blended by the surface normal, so limbs
// get rings around them plus lines running along them, and the projection never smears on
// steep faces the way a single plane would. Coordinates are OBJECT space × the model scale —
// object space so the lattice is welded to the body and doesn't swim as the figure spins,
// × scale so `density` stays in world units whatever the GLB was authored in (~mm here).
export function makeGridMaterial(clip, color = 0x2fd0e0, { density = 44, width = 1.0 } = {}) {
  const m = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 1.0, depthWrite: false,
    side: THREE.DoubleSide, clippingPlanes: clip ? [clip] : null,
  });
  m.userData.uTime = { value: 0 };
  m.userData.uDensity = { value: density };
  m.userData.uWidth = { value: width };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uDensity = m.userData.uDensity;
    sh.uniforms.uWidth = m.userData.uWidth;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGP;\nvarying vec3 vGN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float gScale = length(modelMatrix[1].xyz);   // uniform scale → density in world units
        vGP = transformed * gScale;                  // object space: lattice rides with the body
        vGN = normalize(normal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uDensity; uniform float uWidth;
        varying vec3 vGP; varying vec3 vGN;
        // distance to the nearest cell edge, divided by the screen-space derivative so the
        // line lands at a constant pixel width and antialiases instead of shimmering
        float lattice(vec2 p) {
          vec2 c = p * uDensity;
          vec2 d = abs(fract(c - 0.5) - 0.5) / max(fwidth(c), 1e-5);
          return 1.0 - min(min(d.x, d.y) / uWidth, 1.0);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 bw = pow(abs(normalize(vGN)), vec3(4.0));      // sharp triplanar blend
        bw /= max(bw.x + bw.y + bw.z, 1e-5);
        float line = lattice(vGP.zy) * bw.x + lattice(vGP.xz) * bw.y + lattice(vGP.xy) * bw.z;
        diffuseColor.a *= clamp(line, 0.0, 1.0);
        if (diffuseColor.a < 0.01) discard;                 // keep the cells fully see-through`);
  };
  return m;
}

// Body "hologram" material for a LIGHT background: a translucent figure whose faces
// are see-through and whose silhouette/edges glow bright blue (fresnel rim) — the
// hologram-with-outline look. Faint travelling scanline for life. Supports the clip plane.
// The body GLB is a clean single-shell voxel remesh (no inner surfaces), so DoubleSide
// gives clean see-through hologram depth without fake internal anatomy.
export function makeBodyHologramMaterial(clip, color = 0x3f8fe0) {
  const m = new THREE.MeshStandardMaterial({
    color, roughness: 0.5, metalness: 0.0,
    transparent: true, opacity: 1.0, depthWrite: false,
    side: THREE.DoubleSide, clippingPlanes: clip ? [clip] : null,
  });
  m.userData.uTime = { value: 0 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = m.userData.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vWP;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float fr = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.2);
        float scan = 0.5 + 0.5 * sin(vWP.y * 16.0 - uTime * 2.0);
        diffuseColor.a = mix(0.10, 0.96, pow(fr, 1.1)) + scan * 0.03;   // see-through faces, dense glowing rim
        totalEmissiveRadiance += vec3(0.30, 0.62, 1.0) * (fr * 1.7 + scan * 0.05);  // bright blue outline glow`);
  };
  return m;
}

// Arteriovenous vascular material: the circulatory GLB is a single merged tree
// (arteries + veins are NOT separate meshes), so we split colour in-shader — a smooth
// spatial mask interweaves oxygenated ARTERIAL red with deoxygenated VENOUS blue,
// biased red toward the central/upper trunk (aorta/arch) and blue at the periphery.
// The heart mesh gets a deep cardiac-muscle red. Keeps the clinical fresnel volume look.
export function makeVascularMaterial(clip, { heart = false } = {}) {
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.5, metalness: 0.0,
    transparent: false, depthWrite: true, depthTest: true,
    side: THREE.DoubleSide, clippingPlanes: clip ? [clip] : null,
  });
  m.userData.uTime = { value: 0 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = m.userData.uTime;
    sh.uniforms.uArt = { value: new THREE.Color(0xd23a3a) };   // oxygenated arterial red
    sh.uniforms.uVen = { value: new THREE.Color(0x3f74d6) };   // deoxygenated venous blue
    sh.uniforms.uCard = { value: new THREE.Color(0xb92c38) };  // cardiac muscle
    sh.uniforms.uHeart = { value: heart ? 1.0 : 0.0 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec3 uArt; uniform vec3 uVen; uniform vec3 uCard; uniform float uHeart; varying vec3 vWPos;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // interwoven arteriovenous mask (smooth, so red & blue vessels alternate)
        float mask = sin(vWPos.x*10.0)*0.5 + sin(vWPos.y*6.0 + vWPos.z*4.0)*0.5 + sin(vWPos.z*12.0)*0.4;
        float split = smoothstep(-0.25, 0.25, mask);
        float trunk = 1.0 - smoothstep(0.0, 0.40, length(vec2(vWPos.x, vWPos.z*1.1)));  // near central axis → arterial
        float av = clamp(split*0.68 + trunk*0.62, 0.0, 1.0);
        vec3 base = mix(uVen, uArt, av);
        base = mix(base, uCard, uHeart);
        // faint pulse travelling up the tree, like a pressure wave
        float pulse = 0.5 + 0.5*sin(vWPos.y*7.0 - uTime*3.0);
        diffuseColor.rgb = base * (0.92 + pulse*0.12);
        float fr = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 1.7);
        diffuseColor.rgb *= mix(1.0, 0.44, fr);                 // silhouette darkening -> volume
        totalEmissiveRadiance += base * fr * 0.55;              // coloured edge glow`);
  };
  return m;
}

// Clean clinical material for a LIGHT background (Rise-UI look): matte teal with
// silhouette darkening for volume depth + a faint teal rim. No additive glow.
export function makeClinicalMaterial(color = 0x2f8d8e) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05, envMapIntensity: 0.5 });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float fr = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.0);
      diffuseColor.rgb *= mix(1.0, 0.5, fr);
      totalEmissiveRadiance += vec3(0.04, 0.20, 0.21) * fr;`);
  };
  return m;
}

// soft radial sprite used for glow pools / heart halo
export function glowTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const x = cv.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
