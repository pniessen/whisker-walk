import * as THREE from 'three';
import { litMaterial } from '../render/materials.js';
import { withLocalUuids } from './localuuids.js';

// =============================================================================
// THE FINDS' LOOKS (milestone 3). Two small visitors made once a walk by world/lighthouselife.js, hidden until
// called: a GULL that lands beside her on the gallery or Gull Rock, sits and chats, and flies off; and a CRAB that
// pops up at a rock pool's rim, waves a claw and goes back down. Part of the place's chunk. Both run on the
// walk seconds the life gives them (no clock, no random number), are hidden in between, never merged, never cast a
// shadow, and are built from a handful of primitives (6 meshes and about 130 triangles, 5 and about 110).
//
// The gull's visit: flies in over IN s on an arc from 3 m up and 5 m away, sits SIT s (its head bobbing), flies
// off over OUT s up and away. A visit already on does not start again. The crab's: up over UP s, waves WAVE s,
// down over DOWN s.
// =============================================================================

export const GULL_VISIT = Object.freeze({ in: 0.9, sit: 14, out: 1.3, dist: 1.1, fromDist: 5, fromUp: 3 });
export const CRAB_POP = Object.freeze({ up: 0.5, wave: 4, down: 0.5, out: 0.35 });
const ease = (k) => { const t = Math.min(1, Math.max(0, k)); return t * t * (3 - 2 * t); };
const mat = (hex) => litMaterial(hex, { roughness: 0.8 });

function buildGull() {
  const g = new THREE.Group();
  g.name = 'lighthouse:gull';
  g.scale.setScalar(1.3); // a herring gull is a big bird, and the camera is a long way back
  const add = (geo, hex, x, y, z, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geo, mat(hex)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); g.add(m); return m; };
  add(new THREE.SphereGeometry(0.16, 8, 6), 0xf2f2ee, 0, 0.22, 0, 0.9, 0.8, 1.5); // body
  const head = add(new THREE.SphereGeometry(0.075, 6, 5), 0xf6f6f2, 0, 0.38, -0.2); // head
  head.name = 'head';
  add(new THREE.ConeGeometry(0.03, 0.12, 4), 0xf2a04e, 0, 0.37, -0.31).rotation.x = -Math.PI / 2; // beak
  for (const s of [-1, 1]) { // wings, folded: a flat grey-tipped slab each side
    const w = add(new THREE.BoxGeometry(0.03, 0.1, 0.42), 0xb6bcc4, s * 0.16, 0.23, 0.06);
    w.name = s < 0 ? 'wingL' : 'wingR';
  }
  add(new THREE.BoxGeometry(0.1, 0.03, 0.2), 0xe8e8e4, 0, 0.2, 0.32); // tail
  for (const m of g.children) { m.castShadow = false; m.receiveShadow = false; m.userData.noMerge = true; m.userData.noCast = true; }
  g.visible = false;
  return g;
}

function buildCrab() {
  const g = new THREE.Group();
  g.name = 'lighthouse:crab';
  const add = (geo, hex, x, y, z) => { const m = new THREE.Mesh(geo, mat(hex)); m.position.set(x, y, z); g.add(m); return m; };
  add(new THREE.BoxGeometry(0.3, 0.1, 0.22), 0xe06848, 0, 0.07, 0);
  const claws = [-1, 1].map((s) => {
    const c = add(new THREE.BoxGeometry(0.09, 0.07, 0.12), 0xe87a58, s * 0.2, 0.12, -0.12);
    c.name = s < 0 ? 'clawL' : 'clawR';
    return c;
  });
  void claws;
  for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.025, 5, 4), 0x2a2a2a, s * 0.06, 0.15, -0.09);
  for (const m of g.children) { m.castShadow = false; m.receiveShadow = false; m.userData.noMerge = true; m.userData.noCast = true; }
  g.visible = false;
  return g;
}

// createFindLooks({ scene, ground, reducedMotion }) → { gull(x, y, z, awayX, awayZ), crab(x, y, z, yaw), update(dt), dispose, gullGroup, crabGroup, state }.
export function createFindLooks({ scene, ground, reducedMotion = false }) {
  const [gull, crab] = withLocalUuids('lighthouse-looks', () => [buildGull(), buildCrab()]);
  scene?.add(gull, crab);
  let g = null; // { x, y, z, ax, az, t }
  let c = null; // { x, y, z, yaw, t }

  return {
    gullGroup: gull,
    crabGroup: crab,
    get state() { return { gull: g ? g.t : null, crab: c ? c.t : null }; },
    // a gull lands at (x, y, z), having come from (x - ax * fromDist, ...): `ax, az` the unit way it faces on landing
    gull(x, y, z, ax = 1, az = 0) {
      if (g) return false;
      g = { x, y, z, ax, az, t: 0 };
      return true;
    },
    crab(x, y, z, yaw = 0) {
      if (c) return false;
      c = { x, y, z, yaw, t: 0 };
      return true;
    },
    update(dt) {
      const d = dt > 0 ? dt : 0;
      if (g) {
        g.t += d;
        const { in: tin, sit, out, dist, fromDist, fromUp } = GULL_VISIT;
        const total = tin + sit + out;
        if (g.t >= total) { g = null; gull.visible = false; } else {
          gull.visible = true;
          let px; let py; let pz;
          if (g.t < tin) {
            const k = ease(g.t / tin);
            px = g.x - g.ax * fromDist * (1 - k); pz = g.z - g.az * fromDist * (1 - k);
            py = g.y + fromUp * (1 - k) * (1 - k);
          } else if (g.t < tin + sit) {
            px = g.x; pz = g.z; py = g.y;
          } else {
            const k = ease((g.t - tin - sit) / out);
            px = g.x + g.ax * fromDist * k; pz = g.z + g.az * fromDist * k;
            py = g.y + fromUp * k * k * 1.5;
          }
          gull.position.set(px, py, pz);
          gull.rotation.y = Math.atan2(g.ax, g.az) + Math.PI;
          const sitting = g.t >= tin && g.t < tin + sit;
          const bob = sitting && !reducedMotion ? Math.sin(g.t * 5) * 0.12 : 0;
          gull.getObjectByName('head').rotation.x = bob;
          const flap = !sitting && !reducedMotion ? Math.sin(g.t * 22) * 0.9 : 0;
          gull.getObjectByName('wingL').rotation.z = -flap;
          gull.getObjectByName('wingR').rotation.z = flap;
        }
        void dist;
      }
      if (c) {
        c.t += d;
        const { up, wave, down } = CRAB_POP;
        const total = up + wave + down;
        if (c.t >= total) { c = null; crab.visible = false; } else {
          crab.visible = true;
          const rise = c.t < up ? ease(c.t / up) : c.t < up + wave ? 1 : 1 - ease((c.t - up - wave) / down);
          crab.position.set(c.x, c.y - 0.25 * (1 - rise), c.z);
          crab.rotation.y = c.yaw;
          const w = c.t >= up && c.t < up + wave && !reducedMotion ? Math.sin(c.t * 9) * 0.6 : 0;
          crab.getObjectByName('clawL').rotation.z = 0.5 + w;
          crab.getObjectByName('clawR').rotation.z = -0.5 - w * 0.4;
        }
      }
    },
    dispose() {
      scene?.remove(gull, crab);
      for (const grp of [gull, crab]) for (const m of grp.children) { m.geometry.dispose(); m.material.dispose(); }
    },
  };
}
