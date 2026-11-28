// The Treehouse, beauty pass 7 (2026-11-28): PHOTOGENIC VISTAS. Five spots where the walk's own camera (behind her, 7 m back at the second zoom step) frames a picture: the Bakery landing looking up the big oak,
// the high bridge with its flags and kite, the Bakery deck at golden hour, the stairs to the Crown, and the Bell Tower's base. Standing at one (and the camera looking the way the picture wants) eases in:
//   * a warm grade, three bands of haze (warm near, green between, blue far), the frame's edges dimmed with the leaves there gone deeper green, and a warm key on the focal point (treehouseglow.js, one uniform set);
//   * a warm rim on her fur: the village's one real light (made at intensity 0) is borrowed for the moment, behind her, whenever nobody else is using it;
//   * the shafts a little warmer and softer (a hard white wedge across the picture was the loudest thing in it; they are not re-aimed);
//   * the GOLDEN MOMENT: stand still 3 s at a vista and fireflies and leaf-sparkles rise round her with a soft chime, once per vista per visit.
// No mesh, no triangle, no light, no caster, no texture: one pooled Points (not a mesh), uniforms and the existing light. Reduced motion: the look is held at once, nothing rises, no chime. LITE: no rim, no focal
// glow and a small pool. `shape` and `pick` are pure. Stage chunk code (made by treehousecritters.js).
import * as THREE from 'three';

const sm = (u) => { const t = Math.min(1, Math.max(0, u)); return t * t * (3 - 2 * t); };
const fr = (v) => v - Math.floor(v);
// A vista: where she stands, how far it reaches, the way the picture faces (unit, on the ground), the focal point and how strongly each part of the look comes in.
const V = (id, x, y, z, r, dx, dz, fx, fy, fz, glow, haze) => Object.freeze({ id, x, y, z, r, dx, dz, f: Object.freeze({ x: fx, y: fy, z: fz }), glow, haze });
export const VISTAS = Object.freeze([
  V('oak', -5.0, 2.8, 8.1, 3.4, 0.34, -0.94, 0.0, 5.2, -3.2, 1.1, 1.0), // the first landing, looking up the big oak: the oak's face is the focal
  V('bridge', 4.4, 4.2, -8.6, 3.2, -0.55, -0.85, 5.4, 7.7, -10.0, 1.0, 1.0), // the high bridge: the kite
  V('bakery', -8.6, 1.4, 12.4, 3.4, 0.8, -0.6, -9.6, 2.9, 9.6, 1.2, 1.0), // the Bakery deck: the hut's front, richest at golden hour
  V('stairs', 2.5, 4.9, -10.8, 3.0, -0.58, -0.82, 0.0, 9.3, -16.0, 0.9, 1.15), // the flight to the Crown, half way up: the bell above, a deeper blue behind
  V('bell', -0.6, 5.6, -14.0, 3.4, 0.1, -1.0, 0.0, 9.3, -16.0, 1.2, 0.9), // the Bell Tower's base: the bell
]);
export const GOLDEN = Object.freeze({ still: 3, life: 5.2, move: 0.5 }); // seconds standing still, seconds the sparkles rise, metres she may drift and still be standing still
export const POOL = Object.freeze({ high: 28, low: 18, lite: 8 });

/** The vista she stands in and how fully (0..1): pure. cat { x, y, z }; look: the camera's unit direction on the ground (the way she faces), or null for "any way". -> { v, k }. */
export function pick(cat, look = null) {
  let best = null; let bk = 0;
  if (!cat || !Number.isFinite(cat.y)) return { v: null, k: 0 };
  for (const v of VISTAS) {
    if (Math.abs(cat.y - v.y) > 1.8) continue;
    const d = Math.hypot(cat.x - v.x, cat.z - v.z); if (d >= v.r) continue;
    let k = sm(1.6 * (1 - d / v.r)); if (look) k *= sm((look.x * v.dx + look.z * v.dz + 0.25) / 0.8);
    if (k > bk) { bk = k; best = v; }
  }
  return { v: best, k: bk };
}

/** createVista(ctx, env) -> { update(t, catPos, camera), k, dispose() }. env: { rung, reducedMotion, hash01, dotTexture, chime(i) }. */
export function createVista(ctx, env) {
  const { scene } = ctx; const { rung, reducedMotion: still, hash01 } = env; const lite = rung === 'lite'; const low = rung !== 'high';
  const sky = scene.getObjectByName('treehouse:leaves')?.material?.userData?.sky ?? null;
  const shafts = scene.getObjectByName('treehouse:shafts') ?? null;
  const lamp = scene.getObjectByName('treehouse:light') ?? null; const lampCol = lamp ? lamp.color.getHex() : 0xffc890;
  const N = still ? 0 : POOL[rung] ?? POOL.high;
  const pos = new Float32Array(N * 3); const col = new Float32Array(N * 3);
  let pts = null;
  if (N) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    pts = new THREE.Points(g, new THREE.PointsMaterial({ map: env.dotTexture(), alphaTest: 0.05, size: 0.4, sizeAttenuation: true, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }));
    pts.frustumCulled = false; pts.castShadow = pts.receiveShadow = false; pts.visible = false; pts.name = 'treehouse:vista';
    Object.assign(pts.userData, { noMerge: true, noCast: true, noContactShadow: true }); scene.add(pts);
    for (let i = 0; i < N; i++) pos[i * 3 + 1] = -200;
  }
  const done = new Set(); // the vistas whose golden moment has played this visit
  let k = 0; let cur = null; let lastT = -1; let ax = 0; let az = 0; let still0 = -1; let burstAt = -99; let bx = 0; let by = 0; let bz = 0; let set = 0; let shown = false; let have = false;
  const dir = { x: 0, z: -1 };
  function apply(v, kk, gold) {
    if (!sky) return;
    const f = v ? v.f : { x: 0, y: -50, z: 0 };
    sky.setVista(f.x, f.y, f.z, kk * (v ? v.haze : 1) * (1 + 0.25 * gold), kk, lite ? 0 : kk * (v ? v.glow : 0) * (1 + 0.7 * gold));
    if (shafts?.material) { shafts.material.opacity *= 1 - 0.3 * kk; if (shafts.material.color) shafts.material.color.setRGB(1, 1 - 0.1 * kk, 1 - 0.32 * kk); }
  }
  function rim(catPos, camera, kk, gold) { // a warm rim on her fur: the borrowed light sits behind her, up, towards the focal point's side
    if (!lamp || low) return;
    const theirs = lamp.intensity > 0.02 && Math.abs(lamp.intensity - set) > 1e-6; // someone else (the lit window, the supper) is using it
    if (theirs) { set = 0; return; }
    if (kk < 0.02) { if (set !== 0) { lamp.intensity = 0; lamp.color.setHex(lampCol); set = 0; } return; }
    const cx = catPos.x - (camera?.position?.x ?? catPos.x); const cz = catPos.z - (camera?.position?.z ?? catPos.z - 1); const d = Math.hypot(cx, cz) || 1;
    lamp.position.set(catPos.x + (cx / d) * 1.3, catPos.y + 1.5, catPos.z + (cz / d) * 1.3); lamp.color.setHex(0xffae62);
    set = (2.6 + 1.6 * gold) * kk; lamp.intensity = set;
  }
  return {
    get k() { return k; },
    update(t, catPos, camera) {
      const dt = lastT < 0 ? 1 : Math.min(0.5, Math.max(0, t - lastT)); lastT = t;
      let target = 0; let v = null;
      if (catPos && Number.isFinite(catPos.y)) {
        const cx = camera?.position ? catPos.x - camera.position.x : 0; const cz = camera?.position ? catPos.z - camera.position.z : 0; const d = Math.hypot(cx, cz);
        const look = camera?.position && d > 0.5 ? (dir.x = cx / d, dir.z = cz / d, dir) : null;
        const p = pick(catPos, look); v = p.v; target = p.k;
      }
      if (v) cur = v;
      k = still ? target : k + (target - k) * Math.min(1, dt * 1.6); if (k < 0.002 && !target) { k = 0; if (!v) cur = null; }
      // the golden moment: still for 3 s at a vista (not asked of reduced motion), once per vista per visit
      let gold = 0;
      if (!still && catPos && v && target > 0.55) {
        if (!have || Math.hypot(catPos.x - ax, catPos.z - az) > GOLDEN.move) { ax = catPos.x; az = catPos.z; still0 = t; }
        have = true;
        if (t - still0 >= GOLDEN.still && !done.has(v.id) && t - burstAt > GOLDEN.life) {
          done.add(v.id); burstAt = t; bx = catPos.x; by = catPos.y; bz = catPos.z; env.chime?.(done.size);
        }
      } else { have = false; still0 = -1; }
      const age = t - burstAt; if (age >= 0 && age <= GOLDEN.life) gold = sm(age / 0.8) * (1 - sm((age - 3.2) / 2));
      apply(cur, k, gold); rim(catPos ?? { x: 0, y: -50, z: 0 }, camera, cur ? k : 0, gold);
      if (!pts) return;
      if (age < 0 || age > GOLDEN.life) { if (shown) { for (let i = 0; i < N; i++) pos[i * 3 + 1] = -200; pts.geometry.attributes.position.needsUpdate = true; pts.visible = false; shown = false; } return; }
      shown = true; pts.visible = true;
      for (let i = 0; i < N; i++) { // fireflies (gold) and leaf-sparkles (green and white-gold) rise from round her, sway, and fade; each on its own beat
        const u = fr(age / 3.6 * (0.6 + 0.5 * hash01(i, 801)) + hash01(i, 802) * 0.0) ; const a = Math.min(1, age / 0.6) * Math.min(1, (GOLDEN.life - age) / 1.4) * (1 - u * 0.35);
        const ang = hash01(i, 803) * 6.283 + age * (0.4 + 0.3 * hash01(i, 804)); const rr = 0.4 + 1.5 * hash01(i, 805);
        pos[i * 3] = bx + Math.cos(ang) * rr; pos[i * 3 + 1] = by + 0.3 + u * (1.4 + 2.4 * hash01(i, 806)) * Math.min(1, age / 1.4); pos[i * 3 + 2] = bz + Math.sin(ang) * rr;
        const g = hash01(i, 807) > 0.45; const tw = a * (0.6 + 0.4 * Math.sin(age * 5 + i * 2.1));
        col[i * 3] = (g ? 0.7 : 1.2) * tw; col[i * 3 + 1] = (g ? 1.1 : 0.95) * tw; col[i * 3 + 2] = (g ? 0.45 : 0.4) * tw;
      }
      pts.geometry.attributes.position.needsUpdate = true; pts.geometry.attributes.color.needsUpdate = true;
    },
    dispose() {
      sky?.setVista(0, -50, 0, 0, 0, 0);
      if (lamp && set !== 0) { lamp.intensity = 0; lamp.color.setHex(lampCol); }
      if (pts) { scene.remove(pts); pts.geometry.dispose(); pts.material.dispose(); }
    },
  };
}
