// =============================================================================
// THE CRYSTAL CAVE: ITS SMALL LIFE (milestone C4). Three cheap things, each a pure function of the walk's clock (no random number, no clock of its own):
//   * GLOW-BUGS: tiny glowing motes that drift slow loops over the floor, one Points (one draw). 40 on HIGH, 20 on LOW, 14 on LITE.
//   * DUST MOTES in the light: a few pale specks hanging by the entry arch and the great Rose crystal, one Points. 24 on HIGH, 12 on LOW and LITE.
//   * DRIPS: three places (two on the Blue Pool, one in the Rose hall) where now and then a small ring spreads on the floor: one InstancedMesh (one draw).
// Reduced motion keeps everything but holds it still at its pose for time zero (the drips show one faint ring, still). The drip timing is exported so the
// sound (crystalsound.js) plinks on the very same moments. The cave's one real light is not touched here. Every number is this file's.
// =============================================================================

import * as THREE from 'three';
import * as P from './crystalplan.js';

export const SALTS = Object.freeze({ bug: 0x62756778, dust: 0x64757374, drip: 0x64726970, when: 0x7768656e });
export function hash01(n, salt) {
  let h = (Math.imul(n | 0, 0x9e3779b1) ^ Math.imul((salt | 0) + 0x7f4a7c15, 0x85ebca6b)) | 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12; h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
// 'high' | 'low' | 'lite' (as the Reef reads the quality tier)
export function lifeTier(tier) {
  if (tier && tier.shadows === false) return 'lite';
  if (tier && (tier.name === 'low' || (tier.rung ?? 0) >= 3)) return 'low';
  return 'high';
}
export const BUG_COUNT = Object.freeze({ high: 40, low: 20, lite: 14 });
export const DUST_COUNT = Object.freeze({ high: 24, low: 12, lite: 12 });

// where the bugs live: round each chamber's middle (x, z, radius, how many of the high count)
const HOMES = Object.freeze([[-18, 4, 11, 14], [14, -4, 10, 10], [-6, -22, 9, 8], [22, -22, 9, 8]].map((h) => Object.freeze(h)));
const HOME_TOTAL = HOMES.reduce((s, h) => s + h[3], 0); // 40
// a pure function of the bug's index
export function bugPos(i, t, out = {}) {
  let k = i % HOME_TOTAL; let home = HOMES[0];
  for (const h of HOMES) { if (k < h[3]) { home = h; break; } k -= h[3]; }
  const a0 = hash01(i, SALTS.bug) * Math.PI * 2;
  const r0 = 2 + hash01(i + 100, SALTS.bug) * (home[2] - 2);
  const w = 0.08 + 0.1 * hash01(i + 200, SALTS.bug); // radians a second along its slow loop
  const a = a0 + t * w;
  out.x = home[0] + Math.cos(a) * r0 + Math.sin(t * 0.37 + i) * 0.6;
  out.z = home[1] + Math.sin(a) * r0 * 0.8 + Math.cos(t * 0.31 + i * 1.3) * 0.6;
  out.y = P.crystalY(out.x, out.z) + 0.9 + hash01(i + 300, SALTS.bug) * 1.6 + Math.sin(t * 0.6 + i * 2.1) * 0.25;
  out.glow = 0.55 + 0.45 * Math.sin(t * (0.7 + hash01(i + 400, SALTS.bug)) + i * 1.7);
  return out;
}
const DUST_AT = Object.freeze([[0, 21, 4], [-20, 2, 6]].map((d) => Object.freeze(d)));
export function dustPos(i, t, out = {}) {
  const d = DUST_AT[i % DUST_AT.length];
  const a = hash01(i, SALTS.dust) * Math.PI * 2; const r = hash01(i + 50, SALTS.dust) * d[2];
  const x = d[0] + Math.cos(a) * r; const z = d[1] + Math.sin(a) * r;
  out.x = x + Math.sin(t * 0.21 + i * 1.9) * 0.4;
  out.z = z + Math.cos(t * 0.17 + i * 2.3) * 0.4;
  out.y = P.crystalY(x, z) + 0.8 + hash01(i + 90, SALTS.dust) * 2.6 + Math.sin(t * 0.25 + i) * 0.3;
  return out;
}

// ---- the drips ----------------------------------------------------------------------------------------------------------------
export const DRIP_SITES = Object.freeze([[12.6, -3.2], [15.6, -5.2], [-15.5, 7]].map(([x, z], i) => Object.freeze({ x, z, id: i })));
export const DRIP = Object.freeze({ slot: 3.4, chance: 0.7, life: 1.5, radius: 0.9 }); // seconds in a slot; a ring lasts `life` and grows to `radius` metres
// The moment (seconds) a site's drip falls in slot n, or null when the slot is quiet. A pure function of (site, n).
export function dripIn(site, n) {
  const key = n * 7 + site;
  if (hash01(key, SALTS.drip) >= DRIP.chance) return null;
  return n * DRIP.slot + hash01(key, SALTS.when) * (DRIP.slot - DRIP.life);
}
// how far (0..1) a site's ring has spread at time t, or -1 when none shows
export function ringAt(site, t) {
  const n = Math.floor(t / DRIP.slot);
  const at = dripIn(site, n);
  if (at === null || t < at || t > at + DRIP.life) return -1;
  return (t - at) / DRIP.life;
}

function softDisc() {
  const cv = globalThis.document?.createElement?.('canvas');
  const g = cv?.getContext?.('2d');
  if (!g) return null;
  cv.width = cv.height = 32;
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const mark = (o, name) => { o.name = name; o.frustumCulled = false; Object.assign(o.userData, { noCast: true, noContactShadow: true, noMerge: true }); return o; };

function makePoints(scene, name, n, size, hex, opacity, place, map) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  const mat = new THREE.PointsMaterial({ map, alphaTest: 0.02, size, sizeAttenuation: true, color: hex, vertexColors: true, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
  const pts = mark(new THREE.Points(geo, mat), name);
  scene.add(pts);
  const pos = geo.attributes.position; const col = geo.attributes.color; const p = {};
  return {
    pts, count: n,
    update(t) {
      for (let i = 0; i < n; i++) {
        place(i, t, p); pos.setXYZ(i, p.x, p.y, p.z);
        const g = p.glow ?? 1; col.setXYZ(i, g, g, g);
      }
      pos.needsUpdate = true; col.needsUpdate = true;
    },
    dispose() { scene.remove(pts); geo.dispose(); mat.dispose(); },
  };
}

function makeDrips(scene, reducedMotion) {
  const sites = DRIP_SITES.length;
  const n = sites * 2; // two rings a site, the second a little behind
  const geo = new THREE.RingGeometry(0.82, 1, 20);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
  const mesh = mark(new THREE.InstancedMesh(geo, mat, n), 'crystal:drips');
  mesh.setColorAt(0, new THREE.Color(0, 0, 0));
  scene.add(mesh);
  const m = new THREE.Matrix4(); const c = new THREE.Color(); const q = new THREE.Quaternion(); const s = new THREE.Vector3(); const v = new THREE.Vector3();
  const tint = [new THREE.Color(0x9fdcff), new THREE.Color(0x9fdcff), new THREE.Color(0xffb0d0)];
  return {
    mesh, count: n,
    update(t) {
      for (let k = 0; k < sites; k++) {
        const st = DRIP_SITES[k];
        for (let j = 0; j < 2; j++) {
          // still: one faint half-spread ring at each site's first ring
          const f = reducedMotion ? (j === 0 ? 0.5 : -1) : ringAt(st.id, t - j * 0.35);
          const i = k * 2 + j;
          if (f < 0) { s.set(0.0001, 0.0001, 0.0001); c.setRGB(0, 0, 0); } else { const r = 0.08 + DRIP.radius * f * (1 - 0.3 * j); s.set(r, 1, r); c.copy(tint[k]).multiplyScalar((1 - f) * (reducedMotion ? 0.35 : 0.9)); }
          v.set(st.x, P.crystalY(st.x, st.z) + 0.1, st.z);
          m.compose(v, q, s); mesh.setMatrixAt(i, m); mesh.setColorAt(i, c);
        }
      }
      mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
    },
    dispose() { scene.remove(mesh); geo.dispose(); mat.dispose(); mesh.dispose?.(); },
  };
}

// createCrystalCritters({ scene, tier, reducedMotion }) -> { counts, update(dt), dispose() }
export function createCrystalCritters({ scene, tier = null, reducedMotion = false }) {
  const rung = lifeTier(tier);
  const map = softDisc();
  const bugs = makePoints(scene, 'crystal:bugs', BUG_COUNT[rung], 0.2, 0xd8ff9a, 0.9, bugPos, map);
  const dust = makePoints(scene, 'crystal:dust', DUST_COUNT[rung], 0.07, 0xffe8d8, 0.5, dustPos, map);
  const drips = makeDrips(scene, reducedMotion);
  let clock = 0;
  let frozen = false;
  const draw = () => { bugs.update(clock); dust.update(clock); drips.update(clock); };
  return {
    counts: { rung, bugs: bugs.count, dust: dust.count, drips: drips.count, draws: 3 },
    bugs, dust, drips,
    update(dt) {
      if (reducedMotion) { if (!frozen) { frozen = true; draw(); } return; }
      clock += Math.max(0, Math.min(dt, 1)) || 0;
      draw();
    },
    get clock() { return clock; },
    dispose() { bugs.dispose(); dust.dispose(); drips.dispose(); map?.dispose?.(); },
  };
}
