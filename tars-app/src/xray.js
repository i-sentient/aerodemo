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
