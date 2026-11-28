// =============================================================================
// THE CRYSTAL CAVE: IT REACTS AND LIVES (beauty round 3). One pooled Points (no mesh, no light, no collider) and the decor shader's two uniforms:
//   * the CAT'S GLOW: every glowing thing within a few metres of her brightens as she passes and fades back as she leaves (uCat in crystaldecorparts.js);
//   * FOOTSTEP SPARKLES: a few soft sparks rise from her paws as she walks, coloured by the chamber she is in; in the Blue Pool her paws also make spreading rings (uRip);
//   * GLOW CREATURES: tiny lights that drift and gather round the hero crystals, brighter when she is near;
//   * a rare SHOOTING SPARKLE that streaks across the view from the dome side.
// Reduced motion: only the brightening near her stays (nothing moves); no sparks, creatures, rings or meteor. LOW/LITE: fewer sparks and creatures, no meteor.
// Draws no Math.random (hash of the counters only). Nothing here is solid, a find or a rule.
// =============================================================================

import * as THREE from 'three';
import { dotTexture } from './crystalparts.js';
import { planCreatures, hueNear, ZONE_RGB } from './crystaldecor.js';
import * as W from './crystalwingplan.js';
import * as P from './crystalplan.js';
import { WORMS, talesRung, eyeSpots, STATUE } from './crystaltalesplan.js';
import { planBeauty2 } from './crystaldecor.js';

export const ALIVE = Object.freeze({ sparks: 18, creatures: 14, trail: 12, step: 0.55, sparkLife: 1.1, meteorEvery: 24, meteorAt: 5, meteorLen: 1.5, ringLife: 1.7, ringStep: 0.5, glowIn: 2.5, arrive: 3 });
// beauty round 4: two RARE surprise moments, both pure functions of the walk's clock (no random number):
//   * the PRISMATIC BLOOM: a band of rainbow light rolls out from the cave's middle (the decor shader's uBloom), every crystal flares as it passes, a rainbow shows in the
//     Blue Pool's mist, and the crystals sing a rising chord (the cue the sound plays);
//   * the FALLING STAR: a bright crystal drops from the dome a few metres ahead of her, lands with a ring of sparkle and a gentle chime, and glows where it fell for a while.
// Reduced motion draws neither (the points are hidden); LOW/LITE keep both with fewer dots.
export const EVENTS = Object.freeze({ bloomFirst: 100, bloomEvery: 230, bloomLen: 9, bloomReach: 80, rainbowIn: 2.5, rainbowOut: 11, rainbowGone: 17, starFirst: 175, starEvery: 310, starFall: 2.4, starRing: 1.8, starRest: 9, starAhead: 2.5 });
const smooth = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
// bloom at clock t: { s (seconds into this bloom, -1 before the first), cyc, x (the front, metres), env (0..1), rainbow (0..1) }
export function bloomAt(t) {
  const E = EVENTS; if (t < E.bloomFirst) return { s: -1, cyc: -1, x: -99, env: 0, rainbow: 0 };
  const cyc = Math.floor((t - E.bloomFirst) / E.bloomEvery); const s = t - E.bloomFirst - cyc * E.bloomEvery;
  const on = s < E.bloomLen;
  return { s, cyc, x: on ? (s / E.bloomLen) * E.bloomReach : -99, env: on ? smooth(0, 0.8, s) * (1 - smooth(E.bloomLen * 0.55, E.bloomLen, s)) : 0, rainbow: smooth(E.rainbowIn, E.rainbowIn + 2, s) * (1 - smooth(E.rainbowOut, E.rainbowGone, s)) };
}
// star at clock t: { cyc, s }, s = seconds into this star's cycle (-1 before the first)
export function starAt(t) { const E = EVENTS; if (t < E.starFirst) return { cyc: -1, s: -1 }; const cyc = Math.floor((t - E.starFirst) / E.starEvery); return { cyc, s: t - E.starFirst - cyc * E.starEvery }; }
// beauty pass 5: LIVING CREATURES, all pooled points (no mesh, no light, no collider, nothing to stand on or catch), each a pure function of the clock and where she is:
//   * GLOW-MOTHS circle a crystal cluster, then settle on it for a while (dim, wings still) and take off again;
//   * CAVE FISH school in the Blue Pool and scatter away from her paws when she wades;
//   * CRYSTAL-SPRITES peek out from the side of a formation, and slip back behind it when she looks their way;
//   * the sleeping STONE CAT's two eyes glow gold as she passes (the stone itself is the tales' drawing).
export const BEINGS = Object.freeze({ moths: 8, fish: 10, sprites: 6, mothLap: 15, mothSettle: 5, fishFright: 3.4, lookCos: 0.93, peekFrom: 11, peekTo: 3, eyeReach: 7 });
export const mothSites = () => planBeauty2('high').hero.slice(0, BEINGS.moths); // (the hero crystals, the four greats included: planned so a prefix has every colour)
export const spriteSites = () => { // a formation of each colour in turn, spread at least 9 m apart
  const by = {}; for (const k of P.scatterClusters().filter((q) => q.s >= 1.0 && !q.great).sort((a, b) => b.s - a.s || a.x - b.x)) (by[k.hue] ??= []).push(k);
  const out = []; for (let r = 0; out.length < BEINGS.sprites && r < 6; r++) for (const h of P.HUES) { const k = (by[h] ?? []).filter((q) => out.every((o) => Math.hypot(o.x - q.x, o.z - q.z) > 9))[0]; if (k && out.length < BEINGS.sprites) { out.push(k); by[h] = by[h].filter((q) => q !== k); } }
  return out;
};
export function mothAt(i, t, site) { // { x, y, z, rest (0..1, 1 = settled) }
  const lap = BEINGS.mothLap; const per = lap + BEINGS.mothSettle; const ph = (i * 4.7) % per; const u = ((t + ph) % per);
  const settled = u > lap; const e = settled ? Math.min(1, (u - lap) / 0.8) * (1 - Math.min(1, Math.max(0, (u - per + 0.8) / 0.8))) : 0;
  const a = (t + ph) * (0.7 + 0.12 * (i % 3)) + i * 1.9; const rad = site.s * 0.7 + 0.5 + 0.25 * Math.sin(t * 1.9 + i);
  const ox = Math.cos(a) * rad; const oz = Math.sin(a) * rad; const oy = 1.5 + 1.1 * (0.5 + 0.5 * Math.sin(a * 0.6 + i)) + 0.12 * Math.sin(t * 7 + i * 2);
  const sr = site.s * 0.2 + 0.12; const sx = Math.cos(i) * sr; const sz = Math.sin(i) * sr; const sy = 0.9 + 0.2 * (i % 3);
  return { x: site.x + ox + (sx - ox) * e, y: oy + (sy - oy) * e, z: site.z + oz + (sz - oz) * e, rest: e };
}
// the school's heart wanders the pool; each fish keeps its own spot about it; she pushes them away when near (and the push is clamped inside the water)
export function fishAt(i, t, cat, pool) {
  const cx = pool.x + Math.cos(t * 0.13) * pool.r * 0.35; const cz = pool.z + Math.sin(t * 0.17) * pool.r * 0.3;
  const a = i * 2.4 + t * (0.5 + 0.05 * (i % 4)); const rr = 0.9 + 0.3 * (i % 5);
  let x = cx + Math.cos(a) * rr * 1.6; let z = cz + Math.sin(a) * rr; let fright = 0;
  if (cat) { const dx = x - cat.x; const dz = z - cat.z; const d = Math.hypot(dx, dz) || 0.01; if (d < BEINGS.fishFright) { fright = 1 - d / BEINGS.fishFright; const push = fright * fright * 3.2; x += dx / d * push; z += dz / d * push; } }
  const off = Math.hypot(x - pool.x, z - pool.z); const lim = pool.r * 0.88; if (off > lim) { x = pool.x + (x - pool.x) / off * lim; z = pool.z + (z - pool.z) / off * lim; }
  return { x, z, fright, hx: -Math.sin(a), hz: Math.cos(a) };
}
// 0..1: how much the sleeping cat's eyes glow with her at (x, z)
export const eyeGlow = (x, z) => { const k = Math.min(1, Math.max(0, 1 - (Math.hypot(x - STATUE.x, z - STATUE.z) - 1.5) / BEINGS.eyeReach)); return k * k * (3 - 2 * k); };
let _crisp = null; // a firm round dot with a soft rim, so a moth or a fish keeps its colour (the sparks' dot is all glow)
function crispDot() {
  if (_crisp) return _crisp;
  const n = 32; const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const r = Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) / (n / 2); const k = (y * n + x) * 4; data[k] = data[k + 1] = data[k + 2] = 255; data[k + 3] = r >= 1 ? 0 : Math.round(255 * Math.min(1, (1 - r) * 3.2)); }
  _crisp = new THREE.DataTexture(data, n, n, THREE.RGBAFormat); _crisp.needsUpdate = true; return _crisp;
}
const hash = (n, s) => { let h = (Math.imul(n | 0, 0x9e3779b1) ^ Math.imul(s | 0, 0x85ebca6b)) | 0; h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
const lowTier = (tier) => !!tier && (tier.name === 'low' || tier.shadows === false || (tier.rung ?? 0) >= 3);

// createCrystalAlive({ scene, decor, tier, reducedMotion }) -> { points, update(dt, t, catPos, camera), meteorNow(t), counts, dispose() }
export function createCrystalAlive({ scene, decor, tier = null, reducedMotion = false }) {
  const low = lowTier(tier);
  const nSp = low ? 9 : ALIVE.sparks; const nCr = low ? 7 : ALIVE.creatures; const nTr = low || reducedMotion ? 0 : ALIVE.trail;
  const nEv = 14; const R4 = talesRung(low ? 'low' : 'high'); const nWorm = R4.worms;
  const nMoth = low ? 4 : BEINGS.moths; const nFish = low ? 5 : BEINGS.fish; const nSpr = low ? 3 : BEINGS.sprites; const nBeing = nWorm + nMoth * 2 + nFish * 3 + nSpr * 2 + 2;
  const total = nSp + nCr + nEv + nWorm;
  const pos = new Float32Array(total * 3).fill(-999);
  const col = new Float32Array(total * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    map: dotTexture(), alphaTest: 0.02, size: 0.2, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
  }));
  points.name = 'crystal:alive';
  points.frustumCulled = false;
  Object.assign(points.userData, { noCast: true, noContactShadow: true, noMerge: true });
  scene.add(points);

  // beauty pass 5: the creatures are their own Points too (bigger dots, so a moth or a fish reads from the play camera); one more draw, not a mesh and no light
  const bPos = new Float32Array(nBeing * 3).fill(-999); const bCol = new Float32Array(nBeing * 4);
  const bGeo = new THREE.BufferGeometry(); bGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3)); bGeo.setAttribute('color', new THREE.BufferAttribute(bCol, 4));
  const beings = new THREE.Points(bGeo, new THREE.PointsMaterial({ map: crispDot(), alphaTest: 0.02, size: 0.72, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 1, blending: THREE.NormalBlending, depthWrite: false, fog: true }));
  beings.name = 'crystal:beings'; beings.frustumCulled = false; beings.renderOrder = 5; /* after the additive light meshes, so their wash never covers a moth */ Object.assign(beings.userData, { noCast: true, noContactShadow: true, noMerge: true }); scene.add(beings);
  const putB = (i, x, y, z, r, g, b, a = 1) => { bPos[i * 3] = x; bPos[i * 3 + 1] = y; bPos[i * 3 + 2] = z; bCol[i * 4] = r; bCol[i * 4 + 1] = g; bCol[i * 4 + 2] = b; bCol[i * 4 + 3] = a; }; // (normal blending with an alpha: a moth or a fish stays visible on the brightest pink or cyan, where additive dots wash out)
  // the shooting sparkle is its own little Points (bigger dots; hidden unless a streak is on)
  const mPos = new Float32Array(Math.max(1, nTr) * 3).fill(-999); const mCol = new Float32Array(Math.max(1, nTr) * 3);
  const mGeo = new THREE.BufferGeometry();
  mGeo.setAttribute('position', new THREE.BufferAttribute(mPos, 3)); mGeo.setAttribute('color', new THREE.BufferAttribute(mCol, 3));
  const meteor = new THREE.Points(mGeo, new THREE.PointsMaterial({ map: dotTexture(), alphaTest: 0.02, size: 0.9, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  meteor.name = 'crystal:meteor'; meteor.frustumCulled = false; meteor.visible = false;
  Object.assign(meteor.userData, { noCast: true, noContactShadow: true, noMerge: true });
  if (nTr) scene.add(meteor);
  const creatures = planCreatures(ALIVE.creatures).slice(0, nCr);
  const moths = mothSites(); const sprites = spriteSites().slice(0, nSpr); const eyes = eyeSpots(); const spriteVis = new Array(6).fill(0); const fishHue = [0.3, 0.8, 1];
  const sparks = Array.from({ length: nSp }, () => ({ age: 99, x: 0, y: 0, z: 0, rgb: [1, 1, 1] }));
  let slot = 0; let walked = 0; let ringWalked = 0; let ringSlot = 0; let n = 0;
  let lastBloom = -2; let last = null; let glow = reducedMotion ? 1 : 0;
  const ringAge = [9, 9, 9]; let lastLanded = -2;
  let meteorShift = 0;
  // beauty round 4: the bloom's flare on the crystals, the fog's tint by chamber, the star's landing spot, the cues the sound listens to
  const pulsing = []; scene.traverse((o) => { if (o.isMesh && o.userData?.pulse) pulsing.push(o.material); });
  const fogBase = new THREE.Color(P.CAVE_LOOK.fog); const fogNow = fogBase.clone(); const fogTo = new THREE.Color(); const zc = new THREE.Color();
  const spot = { x: 0, z: 0, cyc: -2 }; let flared = false;
  const cues = { bloom: 0, star: 0, enter: 0 };
  let arrive = 0; let zoneNow = null; // beauty pass 5: the arrival bloom (1 as she enters a chamber, easing out over ARRIVE seconds)
  const U = decor?.uniforms;
  const tmp = new THREE.Vector3(); const right = new THREE.Vector3(); const up = new THREE.Vector3(0, 1, 0);

  const put = (i, x, y, z, r, g, b) => { pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b; };

  function spawnSpark(x, y, z, rgb) {
    const s = sparks[slot]; slot = (slot + 1) % sparks.length; n++;
    s.age = 0; s.x = x + (hash(n, 1) - 0.5) * 0.5; s.z = z + (hash(n, 2) - 0.5) * 0.5; s.y = y + 0.05; s.rgb = rgb; s.dx = (hash(n, 3) - 0.5) * 0.5; s.dz = (hash(n, 4) - 0.5) * 0.5;
  }

  return {
    points,
    counts: { sparks: nSp, creatures: nCr, trail: nTr, worms: nWorm, moths: nMoth, fish: nFish, sprites: nSpr },
    cues,
    meteorNow(t) { meteorShift = ALIVE.meteorEvery - ((t - ALIVE.meteorAt) % ALIVE.meteorEvery + ALIVE.meteorEvery) % ALIVE.meteorEvery; },
    update(dt, t, catPos, camera) {
      dt = Math.max(0, Math.min(dt, 0.25)) || 0;
      glow = reducedMotion ? 1 : Math.min(1, glow + dt / ALIVE.glowIn * 1.5);
      if (U && catPos) { U.cat.value.set(catPos.x, catPos.y ?? 0, catPos.z, glow); U.catL.value.set(catPos.x, catPos.y ?? 0, catPos.z, glow * 0.4); } // (the additive floor light gets less, so it never blows out)
      // the cave's colour grade: the fog leans a little toward the chamber she is in, and settles back between them (also with reduced motion: it is only a colour)
      if (scene.fog && catPos) {
        let w = 0; let hue = 'rose';
        for (const z of P.ZONES) { const k = Math.min(1, Math.max(0, 1 - (Math.hypot(catPos.x - z.x, catPos.z - z.z) - z.r * 0.4) / (z.r * 1.1))); if (k > w) { w = k; hue = P.ZONES.indexOf(z) < 2 ? 'amber' : P.HUES[P.ZONES.indexOf(z) - 2]; } }
        const zr = ZONE_RGB[hue]; zc.setRGB(zr[0] * 0.5 + 0.1, zr[1] * 0.5 + 0.1, zr[2] * 0.5 + 0.1);
        fogTo.copy(fogBase).lerp(zc, (0.22 + 0.1 * arrive) * w * w * (3 - 2 * w));
        fogNow.lerp(fogTo, reducedMotion ? 1 : 1 - Math.exp(-dt * 1.4)); scene.fog.color.copy(fogNow);
      }
      // the arrival bloom: stepping into another chamber lights the things round her up for a moment (a pure function of where she is and the time since)
      if (catPos) { const zid = P.zoneAt(catPos.x, catPos.z); const zk = zid === 'court' ? 'entry' : zid; if (zk && zk !== zoneNow) { arrive = reducedMotion ? 0 : 1; zoneNow = zk; cues.enter++; if (!reducedMotion) { const rgb = ZONE_RGB[zk === 'entry' ? 'amber' : P.HUES[P.ZONES.findIndex((q) => q.id === zk) - 2]] ?? [1, 1, 1]; for (let q = 0; q < 6; q++) spawnSpark(catPos.x, catPos.y ?? 0, catPos.z, rgb); } } }
      arrive = Math.max(0, arrive - dt / ALIVE.arrive);
      if (U) U.bloom.value.w = arrive * arrive * (3 - 2 * arrive);
      if (reducedMotion) { points.visible = false; meteor.visible = false; beings.visible = false; return; }
      // the prismatic bloom: the front and the rainbow into the decor shader, the flare onto the crystal meshes, the chord's cue
      const bl = bloomAt(t);
      if (U) U.bloom.value.set(bl.x, bl.env, bl.rainbow, U.bloom.value.w);
      if (bl.cyc !== lastBloom) { lastBloom = bl.cyc; if (bl.cyc >= 0) cues.bloom++; }
      if (bl.env > 0.001 || flared) {
        flared = bl.env > 0.001;
        for (const m of pulsing) { if (low) m.color.setScalar(1 + 0.4 * bl.env); else m.color.multiplyScalar(1 + 0.4 * bl.env); }
      }
      points.visible = true; beings.visible = true;
      // footsteps: a spark every ALIVE.step metres of walking; rings in the Blue Pool
      if (catPos) {
        if (last && dt > 0) {
          const d = Math.min(2, Math.hypot(catPos.x - last.x, catPos.z - last.z));
          walked += d; ringWalked += d;
          if (walked >= ALIVE.step) { walked = 0; spawnSpark(catPos.x, catPos.y ?? 0, catPos.z, ZONE_RGB[hueNear(catPos.x, catPos.z)]); }
          const inPool = Math.hypot(catPos.x - W.POOL.x, catPos.z - W.POOL.z) < W.POOL.r + 0.6;
          if (inPool && ringWalked >= ALIVE.ringStep && U) { ringWalked = 0; U.rip.value[ringSlot].set(catPos.x, catPos.z, 0.0001, 0); ringAge[ringSlot] = 0; ringSlot = (ringSlot + 1) % 3; spawnSpark(catPos.x, catPos.y ?? 0, catPos.z, [0.5, 0.9, 1]); }
        }
        last = { x: catPos.x, z: catPos.z };
      }
      if (U) for (let k = 0; k < 3; k++) { if (ringAge[k] < 1) { ringAge[k] = Math.min(1, ringAge[k] + dt / ALIVE.ringLife); U.rip.value[k].z = ringAge[k] >= 1 ? 9 : ringAge[k]; } }
      sparks.forEach((s, i) => {
        s.age += dt;
        const k = s.age / ALIVE.sparkLife;
        if (k >= 1) { put(i, 0, -999, 0, 0, 0, 0); return; }
        const f = (1 - k) * (1 - k);
        put(i, s.x + s.dx * k, s.y + 0.15 + k * 0.7, s.z + s.dz * k, s.rgb[0] * f + 0.25 * f, s.rgb[1] * f + 0.25 * f, s.rgb[2] * f + 0.25 * f);
      });
      // the glow creatures: slow loops round their crystal, brighter as she comes near
      creatures.forEach((c, j) => {
        const a = c.ph + t * c.rate;
        const x = c.x + Math.cos(a) * c.rad; const z = c.z + Math.sin(a * 0.83) * c.rad; const y = c.y + 0.35 * Math.sin(a * 1.7);
        const near = catPos ? Math.max(0, 1 - Math.hypot(catPos.x - x, catPos.z - z) / 8) : 0;
        const f = (0.45 + 0.35 * Math.sin(t * 1.3 + c.ph * 3)) * (0.6 + 0.9 * near);
        put(nSp + j, x, y + Math.max(0, 0), z, (c.rgb[0] * 0.7 + 0.3) * f, (c.rgb[1] * 0.7 + 0.3) * f, (c.rgb[2] * 0.7 + 0.3) * f);
      });
      // the falling star: a bright crystal drops from the dome ahead of her, lands in a ring of sparkle and glows a while where it fell
      const st = starAt(t); const E = EVENTS; const o0 = nSp + nCr;
      if (st.cyc !== spot.cyc && st.cyc >= 0) {
        spot.cyc = st.cyc;
        const base = camera ?? null; if (base) base.getWorldDirection(tmp); else tmp.set(0, 0, -1); tmp.y = 0; if (tmp.lengthSq() < 1e-4) tmp.set(0, 0, -1); tmp.normalize();
        right.crossVectors(tmp, up).normalize();
        const side = (hash(st.cyc, 21) - 0.5) * 5; const ox = camera ? camera.position.x : (catPos?.x ?? 0); const oz = camera ? camera.position.z : (catPos?.z ?? 0);
        const B = P.CRYSTAL_BOUNDS; const ahead = (catPos && camera) ? Math.hypot(catPos.x - ox, catPos.z - oz) + E.starAhead : E.starAhead;
        spot.x = Math.min(B.maxX - 3, Math.max(B.minX + 3, ox + tmp.x * ahead + right.x * side)); spot.z = Math.min(B.maxZ - 3, Math.max(B.minZ + 3, oz + tmp.z * ahead + right.z * side));
      }
      const fy = P.crystalY(spot.x, spot.z);
      for (let i = 0; i < nEv; i++) put(o0 + i, 0, -999, 0, 0, 0, 0);
      let starTrail = false;
      if (st.s >= 0 && st.s < E.starFall) { // falling
        const u = st.s / E.starFall; const e = u * u;
        put(o0, spot.x - (1 - e) * 4, fy + 0.2 + (1 - e) * 13, spot.z - (1 - e) * 2.5, 1.6, 1.5, 1.2); starTrail = true;
        if (nTr) { for (let i = 0; i < nTr; i++) { const uu = Math.max(0, e - i * 0.018); const f = (1 - i / nTr) * 1.3; mPos.set([spot.x - (1 - uu) * 4, fy + 0.2 + (1 - uu) * 13, spot.z - (1 - uu) * 2.5], i * 3); mCol.set([1.0 * f, 0.9 * f, 0.7 * f], i * 3); } }
      } else if (st.s >= E.starFall && st.s < E.starFall + E.starRest) {
        const sl = st.s - E.starFall; const rk = sl / E.starRing;
        if (lastLanded !== st.cyc) { lastLanded = st.cyc; cues.star++; }
        const pulse = 0.65 + 0.35 * Math.sin(t * 2.1); const fade = 1 - smooth(E.starRest * 0.55, E.starRest, sl);
        put(o0 + 1, spot.x, fy + 0.2, spot.z, 1.3 * fade * pulse, 1.2 * fade * pulse, 1.0 * fade * pulse);
        if (nTr) { starTrail = true; mPos.fill(-999); mCol.fill(0); mPos.set([spot.x, fy + 0.35, spot.z], 0); const g = 1.3 * fade * pulse; mCol.set([1.0 * g, 0.92 * g, 0.75 * g], 0); }
        if (rk < 1) { const nr = low ? 8 : 12; for (let i = 0; i < nr; i++) { const a = (i / nr) * 6.2832; const r = 0.2 + rk * 3.4; const f = (1 - rk) * (1 - rk) * 2.0; put(o0 + 2 + i, spot.x + Math.cos(a) * r, fy + 0.12 + 0.3 * rk, spot.z + Math.sin(a) * r, 0.9 * f, 0.95 * f, 1.0 * f); } }
      }
      if (starTrail && nTr) { meteor.visible = true; mGeo.attributes.position.needsUpdate = true; mGeo.attributes.color.needsUpdate = true; }
      // the glow-worms round the moss bed: slow soft pulses in green and teal
      const w0 = nSp + nCr + nEv;
      // beauty pass 5: the living creatures
      let bi = 0; const camFade = (x, y, z) => (camera ? smooth(0.9, 2.8, Math.hypot(x - camera.position.x, y - camera.position.y, z - camera.position.z)) : 1); // (a dot right at the lens would be a big blob)
      for (let i = 0; i < nWorm; i++) { const wm = WORMS[i]; const g = 0.55 + 0.45 * Math.sin(t * 0.9 + wm.ph * 1.4); const wy = P.crystalY(wm.x, wm.z) + wm.y; putB(bi++, wm.x, wy, wm.z, 0.3, 1, 0.5, 0.4 + 0.5 * g * (i % 2 ? 1 : 0.8)); } // (the glow-worms round the moss bed, now firm dots that show on the golden floor)
      for (let i = 0; i < nMoth; i++) { const site = moths[i % moths.length]; const m = mothAt(i, t, site); const flit = 0.78 + 0.22 * Math.sin(t * 9 + i * 2.1); const my = P.crystalY(m.x, m.z) + m.y; const ca = camFade(m.x, my, m.z); putB(bi++, m.x, my, m.z, 1, 0.58, 0.14, flit * (1 - 0.35 * m.rest) * ca); putB(bi++, m.x + 0.07, my + 0.05, m.z, 1, 0.9, 0.5, 0.8 * flit * (1 - m.rest) * ca); }
      for (let i = 0; i < nFish; i++) { // warm gold against the cold water: a bright head and a tail that thins out
        const fh = fishAt(i, t, catPos, W.POOL); const y = P.crystalY(W.POOL.x, W.POOL.z) + 0.2 + 0.03 * Math.sin(t * 2 + i); const sc = 0.85 + 0.15 * fh.fright;
        const cf = camFade(fh.x, y, fh.z); putB(bi++, fh.x, y, fh.z, 1, 0.78 * sc, 0.28, cf);
        putB(bi++, fh.x - fh.hx * 0.24, y, fh.z - fh.hz * 0.24, 1, 0.55, 0.2, 0.9 * cf); putB(bi++, fh.x - fh.hx * 0.46, y, fh.z - fh.hz * 0.46, 1, 0.42, 0.18, 0.6 * cf);
      }
      for (let i = 0; i < nSpr; i++) {
        const k = sprites[i]; const rgb = ZONE_RGB[k.hue]; let want = 0; let dx = 0; let dz = 0;
        if (catPos && camera) {
          const dist = Math.hypot(catPos.x - k.x, catPos.z - k.z); camera.getWorldDirection(tmp);
          dx = k.x - camera.position.x; dz = k.z - camera.position.z; const dl = Math.hypot(dx, dz) || 1; const cosA = (tmp.x * dx + tmp.z * dz) / (Math.hypot(tmp.x, tmp.z) * dl || 1);
          const near = smooth(BEINGS.peekFrom, BEINGS.peekTo, dist); want = near * (cosA > BEINGS.lookCos ? 0 : 1);
        }
        spriteVis[i] += (want - spriteVis[i]) * (1 - Math.exp(-dt * (want < spriteVis[i] ? 6 : 1.6)));
        const v = spriteVis[i]; const dl2 = Math.hypot(dx, dz) || 1; const side = (i % 2 ? 1 : -1) * (k.s * 0.6 + 0.3); const hx = k.x + (-dz / dl2) * side; const hz = k.z + (dx / dl2) * side;
        const px = k.x + (hx - k.x) * v; const pz = k.z + (hz - k.z) * v; const py = P.crystalY(px, pz) + 0.15 + 0.35 * v + 0.05 * Math.sin(t * 3 + i);
        const f = v * (0.8 + 0.2 * Math.sin(t * 5 + i)); putB(bi++, px, py, pz, rgb[0] * 0.5 + 0.5, rgb[1] * 0.5 + 0.5, rgb[2] * 0.5 + 0.5, Math.min(1, f * 1.2)); putB(bi++, px, py + 0.13, pz, 1, 1, 0.9, Math.min(1, f * 1.2));
      }
      { const g = catPos ? eyeGlow(catPos.x, catPos.z) : 0; for (const e of eyes) putB(bi++, e.x, P.crystalY(e.x, e.z) + e.y, e.z, 1, 0.72, 0.2, Math.min(1, 0.25 + 0.9 * g) * (0.9 + 0.1 * Math.sin(t * 1.2))); }
      // the shooting sparkle: every ALIVE.meteorEvery seconds, a streak across the upper view (placed from the camera so it is seen, not hidden behind the dome)
      if (nTr && camera && !starTrail) {
        const tt = t + meteorShift; const cyc = Math.floor((tt - ALIVE.meteorAt) / ALIVE.meteorEvery); const loc = tt - ALIVE.meteorAt - cyc * ALIVE.meteorEvery;
        const on = cyc >= 0 && loc < ALIVE.meteorLen;
        camera.getWorldDirection(tmp); tmp.y = 0; if (tmp.lengthSq() < 1e-4) tmp.set(0, 0, -1); tmp.normalize();
        right.crossVectors(tmp, up).normalize();
        const side = hash(cyc, 11) < 0.5 ? -1 : 1; const hgt = 5.5 + hash(cyc, 12) * 2; const dist = 16 + hash(cyc, 13) * 4;
        for (let i = 0; i < nTr; i++) {
          const u = Math.max(0, loc / ALIVE.meteorLen - i * 0.02);
          if (!on || u <= 0 || u >= 1) { mPos.set([0, -999, 0], i * 3); mCol.set([0, 0, 0], i * 3); continue; }
          const sx = side * (14 - u * 28); const f = (1 - i / nTr) * Math.sin(u * 3.14159) * 1.3;
          mPos.set([camera.position.x + tmp.x * dist + right.x * sx, hgt - u * 2.5, camera.position.z + tmp.z * dist + right.z * sx], i * 3); mCol.set([1.0 * f, 0.95 * f, 0.8 * f], i * 3);
        }
        meteor.visible = on; mGeo.attributes.position.needsUpdate = true; mGeo.attributes.color.needsUpdate = true;
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true; bGeo.attributes.position.needsUpdate = true; bGeo.attributes.color.needsUpdate = true;
    },
    dispose() { scene.remove(points, meteor, beings); bGeo.dispose(); beings.material.dispose(); geo.dispose(); points.material.dispose(); mGeo.dispose(); meteor.material.dispose(); },
  };
}
