// The Crystal Cave, beauty pass 8 (2026-11-28): PHOTOGENIC VISTAS. Five spots where the walk's own camera (4.5 m behind her, 2.2 m up) frames a picture: the camp looking into the cave, the Rose Hall
// with the cart wheel, the Blue Pool shore, the Gold Gallery with the moss bed and the Heart before its mural. Standing at one (the camera looking the way the picture wants) eases in:
//   * a warm grade, THREE BANDS OF HAZE (a near warm, a middle in the chamber's own colour, a far deep violet: the vista's colour triad), the frame's edges dimmed and cooled into a frame, and a soft key
//     of warm light on the focal point, all in ONE patch every lit and unlit cave material shares (fragment code added after the fog, a varying for the view position; no pass, no target, no texture);
//   * the dome's light shafts near the focal point a little stronger and the ones that cut across the middle of the picture softer (the decor's own vertex shader, a weight);
//   * a warm RIM on her fur: the cave's one light (made at intensity 0, driven by Lumi) is borrowed for the moment, behind her, whenever Lumi is not using it (late(), after Lumi's update);
//   * the GOLDEN MOMENT: stand still 3 s at a vista and a crystal CAMERA FLASH glints at the focal point, sparkles drift up round her toward it and a soft chime invites a photo, once per vista per visit.
// No mesh, no triangle, no light, no caster, no texture: one pooled Points and uniforms. Reduced motion: the look is held at once, no sparkles, no chime. LITE: no rim, a small pool. Muted: no sound.
// `pick` and `palette` are pure. Story-stage code (made by crystalmood.js).
import * as THREE from 'three';
import { dotTexture } from './crystalparts.js';

const sm = (u) => { const t = Math.min(1, Math.max(0, u)); return t * t * (3 - 2 * t); };
const fr = (v) => v - Math.floor(v);
const hash = (n, s) => { let h = (Math.imul(n | 0, 0x9e3779b1) ^ Math.imul(s | 0, 0x85ebca6b)) | 0; h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
// A vista: where she stands, how far it reaches, the way the picture faces (unit, on the ground), the focal point, its colour triad [near, middle, far, key] and the great crystal whose note the chime borrows.
const V = (id, x, z, r, dx, dz, fx, fy, fz, near, mid, far, key, stone, warm = 1) => Object.freeze({ id, x, z, r, dx: dx / Math.hypot(dx, dz), dz: dz / Math.hypot(dx, dz), warm, f: Object.freeze({ x: fx, y: fy, z: fz }), c: Object.freeze({ near, mid, far, key }), stone });
export const VISTAS = Object.freeze([
  V('camp', -13, 16.5, 3.0, 0.6, -0.8, -7.6, 1.3, 9.3, [1.0, 0.72, 0.42], [0.95, 0.5, 0.72], [0.42, 0.34, 0.74], [1.0, 0.66, 0.3], 0), // the entry hall: the lantern, then the rose chambers
  V('rose', -14, 5, 3.0, -1, 0.1, -29.4, 1.1, 9.6, [1.0, 0.75, 0.5], [1.0, 0.42, 0.66], [0.4, 0.3, 0.7], [1.0, 0.7, 0.36], 0), // the Rose Hall: the cart wheel
  V('pool', 10, 1, 3.0, 1, -0.2, 14, 1.2, -4, [0.74, 0.93, 1.0], [0.36, 0.76, 0.95], [0.38, 0.3, 0.74], [0.6, 0.9, 1.0], 1, 0.25), // the Blue Pool shore: the water and the rainbow's place
  V('gold', -9, -21, 3.0, -1, -0.5, -15, 0.5, -24, [1.0, 0.78, 0.42], [0.62, 0.86, 0.56], [0.46, 0.3, 0.62], [1.0, 0.8, 0.4], 2), // the Gold Gallery: the great gold crystal framing the left, the moss bed ahead
  V('heart', 16, -15, 3.0, 1, -0.7, 22, 2.6, -22, [1.0, 0.76, 0.58], [0.9, 0.5, 0.95], [0.4, 0.3, 0.76], [1.0, 0.7, 0.8], 2), // the Heart: the great crystal and the mural
]);
export const GOLDEN = Object.freeze({ still: 3, life: 5.2, move: 0.5 }); // seconds still, seconds the glints last, metres she may drift and still be still
export const POOL = Object.freeze({ high: 26, low: 16, lite: 8 });

/** The vista she stands in and how fully (0..1): pure. cat { x, z }; look: the camera's unit direction on the ground (the way she faces), or null for "any way". -> { v, k }. */
export function pick(cat, look = null) {
  let best = null; let bk = 0;
  if (!cat || !Number.isFinite(cat.x) || !Number.isFinite(cat.z)) return { v: null, k: 0 };
  for (const v of VISTAS) {
    const d = Math.hypot(cat.x - v.x, cat.z - v.z); if (d >= v.r) continue;
    let k = sm(1.6 * (1 - d / v.r)); if (look) k *= sm((look.x * v.dx + look.z * v.dz + 0.25) / 0.8);
    if (k > bk) { bk = k; best = v; }
  }
  return { v: best, k: bk };
}

const mix3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
/** The vista's colours under the mood weights w = [calm, resonance, aurora, dream]: pure. -> { near, mid, far, key, edge, haze }. */
export function palette(v, w = [1, 0, 0, 0]) {
  const c = v.c;
  return {
    near: mix3(c.near, [1.0, 0.6, 0.8], 0.25 * w[1]), mid: mix3(mix3(c.mid, [0.38, 0.9, 0.78], 0.4 * w[2]), [0.55, 0.34, 0.9], 0.4 * w[1]),
    far: mix3(mix3(c.far, [0.3, 0.2, 0.6], 0.5 * w[3]), [0.2, 0.5, 0.7], 0.3 * w[2]), key: c.key, edge: 1 + 0.35 * w[3], haze: 1 - 0.25 * w[3] + 0.2 * w[1],
  };
}

// ---- the shared patch: the vertex shader hands the view position on; the fragment grades, hazes, frames and keys. Uniforms shared by every material (one object, read live).
const VERT_HEAD = 'varying vec3 vVz;\n';
const VERT_LIGHT = 'uniform vec4 uVa;\nuniform vec4 uVp;\nuniform vec4 uVw;\n'; // the decor's shafts (kind 2)
const FRAG_HEAD = 'uniform vec4 uVa;\nuniform vec4 uVb;\nuniform vec4 uVp;\nuniform vec3 uHn;\nuniform vec3 uHm;\nuniform vec3 uHf;\nuniform vec3 uKy;\nuniform vec3 uGr;\nvarying vec3 vVz;\n';
const fragGrade = (haze) => `#include <fog_fragment>
  if (uVa.x > 0.001) {
    vec3 vc = gl_FragColor.rgb; float vl = dot(vc, vec3(0.3, 0.59, 0.11)); float dv = length(vVz);
    vc *= mix(vec3(1.0), uGr, uVa.x);
    ${haze ? `vc = mix(vc, uHn * (0.3 + vl), 0.27 * uVa.x * smoothstep(3.0, 8.0, dv) * (1.0 - smoothstep(10.0, 16.0, dv)));
    vc = mix(vc, uHm * (0.3 + vl), 0.32 * uVa.x * smoothstep(10.0, 17.0, dv) * (1.0 - smoothstep(22.0, 30.0, dv)));
    vc = mix(vc, uHf * (0.3 + vl), 0.36 * uVa.x * smoothstep(22.0, 33.0, dv));
    vec3 fd = vVz - uVb.xyz; float fa = clamp(1.0 - dot(fd, fd) / uVb.w, 0.0, 1.0); float fk = fa * fa * uVa.z; vc = vc * (1.0 + 0.45 * uKy * fk) + uKy * 0.05 * fk;` : ''}
    vec2 nd = vec2(vVz.x * uVp.x, vVz.y * uVp.y) / max(-vVz.z, 0.01); float ed = smoothstep(0.55, 1.2, length(nd)) * uVa.y;
    vc *= 1.0 - 0.5 * ed; ${haze ? 'vc = mix(vc, vc * (0.55 + uHf), 0.45 * ed);' : ''}
    gl_FragColor.rgb = vc;
  }`;
const vertShafts = `#include <project_vertex>
  vVz = mvPosition.xyz;
  if (uVa.x > 0.001 && aMove.x > 1.5 && aMove.x < 2.5) { float sk = 1.0 + 0.3 * smoothstep(9.0, 2.0, distance(position.xz, uVw.xz)) * uVa.w; vec2 sn = vec2(mvPosition.x * uVp.x, mvPosition.y * uVp.y) / max(-mvPosition.z, 0.01); sk *= 1.0 - 0.45 * uVa.w * smoothstep(0.45, 0.1, abs(sn.x)) * smoothstep(14.0, 5.0, -mvPosition.z); vKk *= sk; }`;

/** createVista(ctx) -> { update(dt, t, catPos, camera, w), late(catPos, camera), k, points, dispose() }. ctx: { scene, reducedMotion, tier, chime(v, i), mood }. */
export function createVista(ctx) {
  const { scene, reducedMotion: still, tier } = ctx;
  const low = !!tier && (tier.name === 'low' || tier.shadows === false || (tier.rung ?? 0) >= 3); const lite = !!tier && (tier.rung ?? 0) >= 5;
  const U = {
    uVa: { value: new THREE.Vector4() }, uVb: { value: new THREE.Vector4(0, -100, 0, 10) }, uVp: { value: new THREE.Vector4(0.73, 1.3, 0, 0) }, uVw: { value: new THREE.Vector4(0, -100, 0, 0) },
    uHn: { value: new THREE.Vector3(1, 0.7, 0.4) }, uHm: { value: new THREE.Vector3(0.9, 0.5, 0.7) }, uHf: { value: new THREE.Vector3(0.4, 0.3, 0.7) }, uKy: { value: new THREE.Vector3(1, 0.66, 0.3) }, uGr: { value: new THREE.Vector3(1, 1, 1) },
  };
  const hooked = []; const seen = new WeakSet();
  const hook = (mat, { haze, shafts }) => {
    const prev = mat.onBeforeCompile; const prevKey = mat.customProgramCacheKey; const flags = `|vista8${haze ? 'h' : ''}${shafts ? 's' : ''}`;
    mat.onBeforeCompile = (sh, r) => {
      prev?.call(mat, sh, r);
      Object.assign(sh.uniforms, U);
      sh.vertexShader = `${VERT_HEAD}${shafts ? VERT_LIGHT : ''}${sh.vertexShader}`.replace('#include <project_vertex>', shafts ? vertShafts : '#include <project_vertex>\n  vVz = mvPosition.xyz;');
      sh.fragmentShader = `${FRAG_HEAD}${sh.fragmentShader}`.replace('#include <fog_fragment>', fragGrade(haze));
    };
    mat.customProgramCacheKey = () => (prevKey ? prevKey.call(mat) : '') + flags;
    mat.needsUpdate = true; hooked.push([mat, prev, prevKey]);
  };
  function scan() { // every lit and unlit cave surface, once (the places made after this still get it on the next scan)
    scene.traverse((o) => {
      const m = o.material; if (!o.isMesh || !m || Array.isArray(m) || seen.has(m) || m.fog === false || m.userData?.noVista) return;
      seen.add(m); if (!(m.isMeshBasicMaterial || m.isMeshStandardMaterial || m.isMeshLambertMaterial)) return;
      const add = m.blending === THREE.AdditiveBlending; const dome = o.name === 'crystal:dome';
      hook(m, { haze: !add && !dome, shafts: !!o.geometry?.attributes?.aMove && add });
    });
  }
  const N = still ? 0 : (lite ? POOL.lite : low ? POOL.low : POOL.high);
  const FL = Math.min(8, N >> 1);
  const pos = new Float32Array(N * 3); const col = new Float32Array(N * 3);
  let pts = null;
  if (N) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    pts = new THREE.Points(g, new THREE.PointsMaterial({ map: dotTexture(), alphaTest: 0.03, size: 0.5, sizeAttenuation: true, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }));
    pts.frustumCulled = false; pts.castShadow = pts.receiveShadow = false; pts.visible = false; pts.name = 'crystal:vista';
    Object.assign(pts.userData, { noMerge: true, noCast: true, noContactShadow: true }); scene.add(pts);
    for (let i = 0; i < N; i++) pos[i * 3 + 1] = -200;
  }
  const fog = scene.fog; const light = scene.getObjectByName('crystal:light') ?? null;
  const done = new Set(); const _f = new THREE.Vector3(); const _c = new THREE.Color();
  let k = 0; let cur = null; let lastT = -1; let ax = 0; let az = 0; let still0 = -1; let burstAt = -99; let bx = 0; let by = 0; let bz = 0; let shown = false; let have = false; let gold = 0; let scanned = -99; let kk = 0;
  const dir = { x: 0, z: -1 };
  function setLook(v, kv, w, camera) {
    const p = v ? palette(v, w) : palette(VISTAS[0], w); const f = v ? v.f : { x: 0, y: -100, z: 0 };
    U.uVa.value.set(kv * p.haze, kv * p.edge, lite ? 0 : kv * (1 + 0.8 * gold), kv); U.uHn.value.set(...p.near); U.uHm.value.set(...p.mid); U.uHf.value.set(...p.far); U.uKy.value.set(...p.key); U.uGr.value.set(1 + 0.1 * (v?.warm ?? 1), 1, 1 - 0.15 * (v?.warm ?? 1));
    U.uVw.value.set(f.x, f.y, f.z, 0);
    if (camera?.projectionMatrix) { const e = camera.projectionMatrix.elements; U.uVp.value.set(e[0], e[5], 0, 0); _f.set(f.x, f.y, f.z).applyMatrix4(camera.matrixWorldInverse); U.uVb.value.set(_f.x, _f.y, _f.z, 11); }
    if (fog && v && kv > 0.01) fog.color.lerp(_c.setRGB(p.mid[0] * 0.6, p.mid[1] * 0.5, p.mid[2] * 0.7), 0.16 * kv); // the haze's middle colour tints the fog a little (alive.js sets the colour afresh every frame, so nothing builds up)
  }
  return {
    get k() { return k; },
    get gold() { return gold; },
    points: pts,
    update(dt, t, catPos, camera, w = [1, 0, 0, 0]) {
      if (t - scanned > 4) { scanned = t; scan(); }
      const d = lastT < 0 ? 1 : Math.min(0.5, Math.max(0, t - lastT)); lastT = t;
      let target = 0; let v = null;
      if (catPos && Number.isFinite(catPos.x)) {
        const cx = camera?.position ? catPos.x - camera.position.x : 0; const cz = camera?.position ? catPos.z - camera.position.z : 0; const dd = Math.hypot(cx, cz);
        const look = camera?.position && dd > 0.5 ? (dir.x = cx / dd, dir.z = cz / dd, dir) : null;
        const p = pick(catPos, look); v = p.v; target = p.k;
      }
      if (v) cur = v;
      k = still ? target : k + (target - k) * Math.min(1, d * 1.6); if (k < 0.002 && !target) { k = 0; if (!v) cur = null; }
      // the golden moment: still for 3 s at a vista, once per vista per visit (not asked of reduced motion)
      if (!still && catPos && v && target > 0.55) {
        if (!have || Math.hypot(catPos.x - ax, catPos.z - az) > GOLDEN.move) { ax = catPos.x; az = catPos.z; still0 = t; }
        have = true;
        if (t - still0 >= GOLDEN.still && !done.has(v.id) && t - burstAt > GOLDEN.life) { done.add(v.id); burstAt = t; bx = catPos.x; by = catPos.y ?? 0; bz = catPos.z; ctx.chime?.(v, done.size); }
      } else { have = false; still0 = -1; }
      const age = t - burstAt; gold = age >= 0 && age <= GOLDEN.life ? sm(age / 0.5) * (1 - sm((age - 1.2) / 2.4)) : 0;
      kk = cur ? k : 0; setLook(cur, kk, w, camera);
      if (!pts) return;
      if (age < 0 || age > GOLDEN.life) { if (shown) { for (let i = 0; i < N; i++) pos[i * 3 + 1] = -200; pts.geometry.attributes.position.needsUpdate = true; pts.visible = false; shown = false; } return; }
      shown = true; pts.visible = true;
      const f = cur?.f ?? { x: bx, y: by + 1, z: bz }; const c = cur?.c.key ?? [1, 0.8, 0.5];
      for (let i = 0; i < N; i++) {
        if (i < FL) { // the camera flash: a burst of warm-white points round the focal point that fades in a second
          const u = Math.min(1, age / 1.1); const a = (1 - u) ** 1.5 * Math.min(1, age / 0.06);
          pos[i * 3] = f.x + (hash(i, 811) - 0.5) * 1.8; pos[i * 3 + 1] = f.y + 0.5 + hash(i, 812) * 1.2; pos[i * 3 + 2] = f.z + (hash(i, 813) - 0.5) * 1.8;
          col[i * 3] = 2.2 * a; col[i * 3 + 1] = 2.0 * a; col[i * 3 + 2] = 1.7 * a; continue;
        }
        // sparkles: rise from round her, sway, and drift a little toward the focal point (the way the picture wants), each on its own beat
        const u = fr(age / 3.4 * (0.6 + 0.5 * hash(i, 801))); const a = Math.min(1, age / 0.6) * Math.min(1, (GOLDEN.life - age) / 1.4) * (1 - u * 0.35);
        const ang = hash(i, 803) * 6.283 + age * (0.4 + 0.3 * hash(i, 804)); const rr = 0.4 + 1.4 * hash(i, 805); const toF = 0.12 * u * (hash(i, 808) + 0.4);
        pos[i * 3] = bx + Math.cos(ang) * rr + (f.x - bx) * toF; pos[i * 3 + 1] = by + 0.3 + u * (1.2 + 2.2 * hash(i, 806)) * Math.min(1, age / 1.4); pos[i * 3 + 2] = bz + Math.sin(ang) * rr + (f.z - bz) * toF;
        const tw = a * (0.6 + 0.4 * Math.sin(age * 5 + i * 2.1)); const tint = hash(i, 807) > 0.5;
        col[i * 3] = (tint ? c[0] : 1.0) * 0.95 * tw; col[i * 3 + 1] = (tint ? c[1] : 0.95) * 0.95 * tw; col[i * 3 + 2] = (tint ? c[2] : 0.9) * 0.95 * tw;
      }
      pts.geometry.attributes.position.needsUpdate = true; pts.geometry.attributes.color.needsUpdate = true;
    },
    // after Lumi's update (she drives the cave's one light every frame): a warm rim on her fur, behind her, when Lumi is not using the light
    late(catPos, camera) {
      if (!light || lite || low || !catPos || kk < 0.02 || light.intensity > 0.02) return;
      const cx = catPos.x - (camera?.position?.x ?? catPos.x); const cz = catPos.z - (camera?.position?.z ?? catPos.z - 1); const d = Math.hypot(cx, cz) || 1;
      light.position.set(catPos.x + (cx / d) * 1.3, (catPos.y ?? 0) + 1.9, catPos.z + (cz / d) * 1.3); light.color.setRGB(...(cur?.c.key ?? [1, 0.7, 0.4])); light.intensity = (4.5 + 2.5 * gold) * kk;
    },
    dispose() {
      U.uVa.value.set(0, 0, 0, 0);
      for (const [m, prev, prevKey] of hooked) { m.onBeforeCompile = prev ?? (() => {}); if (prevKey) m.customProgramCacheKey = prevKey; else delete m.customProgramCacheKey; m.needsUpdate = true; }
      if (pts) { scene.remove(pts); pts.geometry.dispose(); pts.material.dispose(); }
    },
  };
}
