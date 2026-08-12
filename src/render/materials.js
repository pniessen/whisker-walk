import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// Cozy low-poly art direction stays flat/matte: roughness 0.9, no metalness.
// `extra` carries per-call-site overrides (emissive, transparent, opacity, …)
// straight through from the old MeshLambertMaterial call sites.
export function litMaterial(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.0, ...extra });
}

// Bakes a RoomEnvironment IBL map once via PMREMGenerator — no network
// fetch, no HDRI asset, just an in-process procedural room. Callers keep the
// returned texture for the app's lifetime and reuse it across every walk;
// it is never disposed per-walk.
export function buildEnvMap(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return envTex;
}
