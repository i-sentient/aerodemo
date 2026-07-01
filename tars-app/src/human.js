import * as THREE from 'three';
import { glowTexture } from './xray.js';

// Smooth female figure assembled from blended primitives, opaque skin lit by
// image-based lighting (set via scene.environment) for a realistic render.
// Materialises with a CT-style clip plane and rotates on Y.
//
// NOTE: for true photorealism drop a rigged GLB at src/assets/anatomy.glb and
// load it via GLTFLoader in scene.js — this procedural figure is the fallback.
export function buildHuman() {
  const group = new THREE.Group();
  const yMin = 0, yMax = 1.72;
  const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), yMax + 0.2);
  const CP = [clip];

  const skin = new THREE.MeshPhysicalMaterial({ color: 0xe7b49a, roughness: 0.5, metalness: 0.0, clearcoat: 0.3, clearcoatRoughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color(0xffd9c2), envMapIntensity: 0.85, clippingPlanes: CP });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x2b1d16, roughness: 0.72, metalness: 0.05, envMapIntensity: 0.7, clippingPlanes: CP });

  const up = new THREE.Vector3(0, 1, 0);
  const v = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  function ball(mat, p, r, sx = 1, sy = 1, sz = 1) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 20), mat);
    m.position.set(p[0], p[1], p[2]); m.scale.set(sx, sy, sz); m.castShadow = true; m.receiveShadow = true; group.add(m); return m;
  }
  function seg(mat, a, b, rA, rB = rA) {
    const A = v(a), B = v(b), dir = new THREE.Vector3().subVectors(B, A), len = dir.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rB, rA, len, 20, 1), mat);
    m.position.copy(A).addScaledVector(dir, 0.5); m.quaternion.setFromUnitVectors(up, dir.clone().normalize());
    m.castShadow = true; group.add(m); return m;
  }

  // head + hair + neck
  ball(skin, [0, 1.57, 0], 0.108, 1, 1.18, 1.05);
  ball(hairMat, [0, 1.60, -0.025], 0.126, 1.06, 1.12, 1.02);   // hair cap
  ball(hairMat, [0, 1.45, -0.07], 0.12, 1.25, 1.05, 0.62);     // hair to shoulders
  seg(skin, [0, 1.45, 0], [0, 1.55, 0], 0.037);                // neck

  // torso (female silhouette)
  ball(skin, [0, 1.37, 0], 0.15, 1.04, 0.55, 0.7);             // shoulders
  ball(skin, [0, 1.25, 0.01], 0.15, 1.0, 0.82, 0.72);          // ribcage
  ball(skin, [-0.066, 1.22, 0.075], 0.06, 1, 1, 1.05);         // breast L
  ball(skin, [0.066, 1.22, 0.075], 0.06, 1, 1, 1.05);          // breast R
  ball(skin, [0, 1.06, 0], 0.112, 1.02, 0.72, 0.72);           // waist (narrow)
  ball(skin, [0, 0.93, 0], 0.145, 1.1, 0.72, 0.82);            // hips
  ball(skin, [0, 0.88, -0.065], 0.12, 1.05, 0.6, 0.8);         // glutes

  // arms at sides
  for (const s of [-1, 1]) {
    ball(skin, [s * 0.15, 1.37, 0], 0.052);                    // shoulder
    seg(skin, [s * 0.15, 1.37, 0], [s * 0.19, 1.12, 0.01], 0.05, 0.04);   // upper arm
    ball(skin, [s * 0.19, 1.12, 0.01], 0.041);                 // elbow
    seg(skin, [s * 0.19, 1.12, 0.01], [s * 0.215, 0.86, 0.02], 0.039, 0.03); // forearm
    ball(skin, [s * 0.228, 0.81, 0.03], 0.045, 0.8, 1.15, 0.55); // hand
  }
  // legs
  for (const s of [-1, 1]) {
    seg(skin, [s * 0.075, 0.9, 0], [s * 0.1, 0.47, 0.01], 0.083, 0.055);  // thigh
    ball(skin, [s * 0.1, 0.47, 0.01], 0.05);                   // knee
    seg(skin, [s * 0.1, 0.47, 0.01], [s * 0.11, 0.07, 0.0], 0.05, 0.034); // calf
    ball(skin, [s * 0.11, 0.035, 0.06], 0.045, 0.9, 0.5, 1.8); // foot
  }

  // cardiac scan-highlight (subtle, shown only for cardiac cases)
  const heart = new THREE.Mesh(new THREE.SphereGeometry(0.032, 14, 10), new THREE.MeshBasicMaterial({ color: 0xff5a52, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  heart.position.set(-0.045, 1.21, 0.11); group.add(heart);
  const heartGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff6a62, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  heartGlow.scale.set(0.28, 0.28, 1); heartGlow.position.copy(heart.position); group.add(heartGlow);
  let cardiac = false, spin = 0;

  return {
    group, bounds: { yMin, yMax }, heart, clip,
    setHeartColor(hex, isCardiac) { cardiac = !!isCardiac; heart.material.color.set(hex); heartGlow.material.color.set(hex); },
    setReveal(r) { clip.constant = THREE.MathUtils.lerp(yMin - 0.05, yMax + 0.2, r); },
    update(dt, { hr = 70, reveal = 1, spinSpeed = 0.32 } = {}) {
      spin += dt * spinSpeed; group.rotation.y = spin; this.setReveal(reveal);
      const time = performance.now() / 1000;
      const beat = 0.5 + 0.5 * Math.sin(time * (hr / 60) * Math.PI * 2);
      const k = cardiac ? reveal : 0;
      heart.material.opacity = (0.12 + beat * 0.22) * k;
      heartGlow.material.opacity = (0.07 + beat * 0.14) * k;
      heartGlow.scale.setScalar(0.26 + beat * 0.12);
    },
  };
}
