// =============================================================================
// THE FAIRGROUND: BEAUTY PASS 3, THE FAIR REACTS AND LIVES. Three small pooled THREE.Points (no mesh, no triangle, no caster, no collider; Points are not meshes
// so rig.js's caster sweep never sees them) and nothing else drawn:
//   * KICKED BITS (normal blending): confetti and popcorn (on the midway and round the plaza) or a puff of dust (elsewhere) fly up from her paws as she runs;
//   * STEAM (additive): a few soft wisps climb from the candyfloss and popcorn stalls (pink sugar, warm butter), brighter at dusk;
//   * A FIREWORK now and then at dusk (additive): a rocket and a burst high over the fair, a pure function of the time of day, so every device sees the same one.
// Reduced motion: nothing is drawn. Lite: fewer. Hash of counters only; no Math.random. Nothing here is solid, a perch, a find or a rule.
// =============================================================================
import * as THREE from 'three';

export const ALIVE = Object.freeze({
  bits: 30, steam: 8, spark: 20, step: 0.55, life: 1.0, run: 3.2,
  steamLife: 5, steamHear: 30, fireEvery: 13, fireFrom: 0.8, rise: 0.8, burst: 1.9, fireR: 4.2,
  stalls: Object.freeze([Object.freeze({ x: -5.7, z: 40, rgb: [1, 0.55, 0.75] }), Object.freeze({ x: 5.7, z: 40, rgb: [1, 0.85, 0.5] })]),
  sky: Object.freeze([[-16, 17, -14], [15, 16, -20], [-6, 19, -34], [24, 17, -8], [-26, 18, -30]]),
  paper: Object.freeze([0xe8403a, 0xf7c93b, 0x3b8de0, 0x4cb860, 0xe86aa8, 0xffffff]),
});
const hash = (n, s) => { let h = (Math.imul(n | 0, 0x9e3779b1) ^ Math.imul(s | 0, 0x85ebca6b)) | 0; h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// whether a spot is on the midway or round the plaza (where the fair's confetti and popcorn lie)
export const littered = (x, z) => (Math.abs(x) < 8 && z > 8) || Math.hypot(x, z) < 14;

// Where the firework of cycle `n` goes off (a point in the sky), and how far along `T` is in its cycle.
export function fireAt(T) {
  const per = ALIVE.fireEvery;
  const n = Math.floor(T / per);
  const k = ALIVE.sky[Math.floor(hash(n, 5) * ALIVE.sky.length) % ALIVE.sky.length];
  return { n, local: T - n * per, x: k[0], y: k[1], z: k[2] };
}

let _dot = null;
function dot() {
  if (_dot) return _dot;
  const n = 16; const d = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const r = Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) / (n / 2);
    const k = (y * n + x) * 4; d[k] = d[k + 1] = d[k + 2] = 255; d[k + 3] = r >= 1 ? 0 : Math.round(255 * Math.min(1, (1 - r) * 2.2));
  }
  _dot = new THREE.DataTexture(d, n, n, THREE.RGBAFormat); _dot.needsUpdate = true;
  return _dot;
}
function makePoints(count, size, additive, name) {
  const pos = new Float32Array(count * 3).fill(-999);
  const col = new Float32Array(count * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    map: dot(), alphaTest: additive ? 0.02 : 0.4, size, sizeAttenuation: true, vertexColors: true, transparent: additive, opacity: 1,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !additive, fog: !additive,
  }));
  pts.name = name; pts.frustumCulled = false;
  Object.assign(pts.userData, { noCast: true, noContactShadow: true, noMerge: true });
  return { pts, geo, pos, col };
}

// createFairAlive({ scene, reducedMotion, scale }) -> { update(dt, T, catPos, lit, speed), counts, dispose() }
// scale: the quality tier's ambientScale (1, 0.5, 0.25): the pools shrink with it.
export function createFairAlive({ scene, reducedMotion = false, scale = 1 }) {
  const k = Math.max(0.25, Math.min(1, Number.isFinite(scale) ? scale : 1));
  const nBits = reducedMotion ? 0 : Math.max(4, Math.round(ALIVE.bits * k));
  const nSteam = reducedMotion ? 0 : Math.max(2, Math.round(ALIVE.steam * k));
  const nSpark = reducedMotion || k < 0.5 ? 0 : ALIVE.spark;
  const bits = makePoints(Math.max(1, nBits), 0.2, false, 'fair:bits');
  const glow = makePoints(Math.max(1, nSteam), 0.34, true, 'fair:glow');
  const fire = makePoints(Math.max(1, nSpark), 1.5, true, 'fair:fire'); // far off in the sky, so each spark is a big point
  bits.pts.visible = glow.pts.visible = fire.pts.visible = false;
  if (!reducedMotion) scene.add(bits.pts, glow.pts, fire.pts);
  const kick = Array.from({ length: nBits }, () => ({ age: 99, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1 }));
  let slot = 0; let n = 0; let walked = 0; let last = null;
  const tint = new THREE.Color();

  function spawn(x, z, speed, yaw) {
    const s = kick[slot]; slot = (slot + 1) % kick.length; n++;
    const paper = littered(x, z);
    if (paper) { tint.setHex(hash(n, 9) < 0.3 ? 0xfff0c8 : ALIVE.paper[Math.floor(hash(n, 8) * ALIVE.paper.length) % ALIVE.paper.length]); }
    else tint.setRGB(0.68, 0.58, 0.44);
    s.age = 0; s.r = tint.r; s.g = tint.g; s.b = tint.b;
    const out = 0.6 + speed * 0.12;
    // up and out, a little back from her heading
    s.x = x + (hash(n, 1) - 0.5) * 0.3; s.z = z + (hash(n, 2) - 0.5) * 0.3; s.y = 0.1;
    s.vx = (hash(n, 3) - 0.5) * out * 2.2 - Math.sin(yaw) * 0.7; s.vz = (hash(n, 4) - 0.5) * out * 2.2 - Math.cos(yaw) * 0.7; // out to the sides and on ahead of her (she faces -z at yaw 0)
    s.vy = 1.9 + hash(n, 6) * (paper ? 1.8 : 1.0);
  }

  return {
    counts: { bits: nBits, steam: nSteam, spark: nSpark },
    // update(dt, T, catPos {x, z}, lit 0..1 (the fair's lights), speed m/s, yaw)
    update(dt, T, catPos, lit = 0, speed = 0, yaw = 0) {
      if (reducedMotion) return;
      dt = Math.max(0, Math.min(dt, 0.25)) || 0;
      bits.pts.visible = glow.pts.visible = true;
      if (catPos) {
        if (last && dt > 0) {
          const d = Math.min(2, Math.hypot(catPos.x - last.x, catPos.z - last.z));
          walked += d;
          const step = speed > ALIVE.run ? ALIVE.step * 0.5 : ALIVE.step;
          if (walked >= step) { walked = 0; if (nBits) spawn(catPos.x, catPos.z, speed, yaw); }
        }
        last = { x: catPos.x, z: catPos.z };
      }
      const dim = 1 - 0.55 * lit; // unlit bits go dusky at dusk
      for (let i = 0; i < nBits; i++) {
        const s = kick[i]; s.age += dt;
        const u = s.age / ALIVE.life;
        if (u >= 1 || s.y < -0.01 && s.age > 0.1) { bits.pos[i * 3 + 1] = -999; continue; }
        s.vy -= 6 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
        if (s.y < 0.08) { s.y = 0.08; s.vy = 0; s.vx *= 0.4; s.vz *= 0.4; }
        bits.pos[i * 3] = s.x; bits.pos[i * 3 + 1] = s.y; bits.pos[i * 3 + 2] = s.z;
        bits.col[i * 3] = s.r * dim; bits.col[i * 3 + 1] = s.g * dim; bits.col[i * 3 + 2] = s.b * dim;
      }
      // steam: stateless, a pure function of T, near enough to be seen
      for (let i = 0; i < nSteam; i++) {
        const st = ALIVE.stalls[i % ALIVE.stalls.length];
        const near = catPos ? 1 - smooth(ALIVE.steamHear * 0.6, ALIVE.steamHear, Math.hypot(catPos.x - st.x, catPos.z - st.z)) : 0;
        const u = (T / ALIVE.steamLife + i / nSteam + hash(i, 3)) % 1;
        const f = Math.sin(Math.PI * u) * near * (0.55 + 0.4 * lit);
        const o = i * 3;
        glow.pos[o] = st.x + Math.sin(T * 0.7 + i * 2.1) * 0.25 * u + u * 0.5 * (st.x < 0 ? 1 : -1);
        glow.pos[o + 1] = 1.9 + u * 1.6; glow.pos[o + 2] = st.z + Math.cos(T * 0.5 + i) * 0.2 * u;
        glow.col[o] = st.rgb[0] * f; glow.col[o + 1] = st.rgb[1] * f; glow.col[o + 2] = st.rgb[2] * f;
      }
      // a firework: only once the lights are up; a rocket, then a burst that droops and fades
      const fw = fireAt(T);
      const on = lit > 0.85 && nSpark > 0;
      for (let j = 0; j < nSpark; j++) {
        const o = j * 3;
        let f = 0; let x = 0; let y = -999; let z = 0;
        if (on) {
          if (j === 0 && fw.local < ALIVE.rise) { const u = fw.local / ALIVE.rise; x = fw.x; z = fw.z; y = 2 + (fw.y - 2) * (1 - (1 - u) * (1 - u)); f = 0.9; }
          else if (j > 0 && fw.local >= ALIVE.rise && fw.local < ALIVE.rise + ALIVE.burst) {
            const u = (fw.local - ALIVE.rise) / ALIVE.burst;
            const a = (j / (nSpark - 1)) * Math.PI * 2 * 3.1 + hash(fw.n, 2); const el = (hash(j, fw.n) - 0.5) * 2.2; // a ball of sparks
            const r = ALIVE.fireR * (1 - (1 - u) * (1 - u));
            x = fw.x + Math.cos(a) * Math.cos(el) * r; z = fw.z + Math.sin(a) * Math.cos(el) * r; y = fw.y + Math.sin(el) * r - 2.2 * u * u;
            f = (1 - u) * (1 - u) * 1.3;
          }
        }
        fire.pos[o] = x; fire.pos[o + 1] = y; fire.pos[o + 2] = z;
        const hue = hash(fw.n, 4); tint.setHSL(hue, 0.9, 0.62);
        fire.col[o] = tint.r * f; fire.col[o + 1] = tint.g * f; fire.col[o + 2] = tint.b * f;
      }
      bits.geo.attributes.position.needsUpdate = bits.geo.attributes.color.needsUpdate = true;
      glow.geo.attributes.position.needsUpdate = glow.geo.attributes.color.needsUpdate = true;
      fire.pts.visible = on; fire.geo.attributes.position.needsUpdate = fire.geo.attributes.color.needsUpdate = true;
    },
    dispose() {
      scene.remove(bits.pts, glow.pts, fire.pts);
      bits.geo.dispose(); glow.geo.dispose(); fire.geo.dispose(); bits.pts.material.dispose(); glow.pts.material.dispose(); fire.pts.material.dispose();
    },
  };
}
