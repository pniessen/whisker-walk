// THE OLD HOUSE'S AIR (Old House step 2, Task 7, ruling D16): by day every window but
// the cellar's throws one soft sunbeam slanting down into its room, with a few dust motes
// drifting in it. One merged beam mesh and one Points mesh per level, both additive,
// depthWrite off, noCast, noMerge and tagged houseDetail / houseLevel; update shows only
// the levels in full. At dusk nothing is made. Under reduced motion the motes hold still.
// Motes are seeded by hash01 and drift on sines of `t`: no random draws, and update
// allocates nothing.

import * as THREE from 'three';
import { hash01 } from './builder.js';

export const SUNBEAM = Object.freeze({ length: 3.2, drop: 1.6, width: 1.2, opacity: 0.3, motes: 22 });
const IN = 0.1; // the beam starts this far inside the wall
const AMP = 0.12; // a mote's drift, m
const SIDE = { n: [0, 1], s: [0, -1], w: [1, 0], e: [-1, 0] }; // inward (x, z)

export function createHouseAir(scene, { windows, rooms, levels, dusk = false, reducedMotion = false, mood = null }) {
  const beams = [];
  const layers = [];
  if (dusk) return { beams, update() {}, dispose() {} };

  const levelY = new Map(levels.map((l) => [l.id, l.y]));
  const byLevel = new Map();
  for (const w of windows) {
    const room = rooms.find((r) => r.id === w.room);
    if (!room || room.level === 'cellar') continue;
    const [ix, iz] = SIDE[w.side];
    const alongX = iz !== 0; // a north or south wall runs along x
    const edge = w.side === 'n' ? room.minZ : w.side === 's' ? room.maxZ : w.side === 'w' ? room.minX : room.maxX;
    const zone = room.zone ?? room.level; // the wing's rooms are drawn with their zone
    const ly = levelY.get(room.level);
    const y0 = ly + (w.sill + w.head) / 2;
    const y1 = Math.max(ly + 0.03, y0 - SUNBEAM.drop);
    const hw = Math.min(SUNBEAM.width, w.width) / 2;
    const a = IN; // near end, from the wall
    const b = IN + SUNBEAM.length;
    // a point of the beam: distance s from the wall, lateral v in [-1, 1]
    const at = (s, v) => {
      const k = (s - a) / (b - a);
      const along = w.at + v * hw;
      const into = edge + (alongX ? iz : ix) * s;
      return alongX ? [along, y0 + (y1 - y0) * k, into] : [into, y0 + (y1 - y0) * k, along];
    };
    const corners = [at(a, -1), at(a, 1), at(b, -1), at(b, 1)];
    const box = {
      level: zone, w, at,
      min: [0, 1, 2].map((i) => Math.min(...corners.map((c) => c[i]))),
      max: [0, 1, 2].map((i) => Math.max(...corners.map((c) => c[i]))),
    };
    beams.push(box);
    if (!byLevel.has(zone)) byLevel.set(zone, []);
    byLevel.get(zone).push(box);
  }

  const tag = (o, level) => {
    o.userData.noCast = true;
    o.userData.noMerge = true;
    o.userData.houseDetail = true;
    o.userData.houseLevel = level;
    o.frustumCulled = false;
    o.renderOrder = 2;
  };
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, vertexColors: true, transparent: true, opacity: SUNBEAM.opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  const moteMat = new THREE.PointsMaterial({
    color: 0xfff0c8, size: 0.075, sizeAttenuation: true, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });

  for (const [level, list] of byLevel) {
    // the beams: six corners each (a bright middle fading to the sides and the far end)
    const pos = new Float32Array(list.length * 18);
    const col = new Float32Array(list.length * 18);
    const idx = [];
    list.forEach((bx, i) => {
      const verts = [bx.at(IN, -1), bx.at(IN, 0), bx.at(IN, 1), bx.at(IN + SUNBEAM.length, -1), bx.at(IN + SUNBEAM.length, 0), bx.at(IN + SUNBEAM.length, 1)];
      const shade = [0.3, 1, 0.3, 0, 0, 0];
      verts.forEach((v, k) => {
        pos.set(v, i * 18 + k * 3);
        col.set([shade[k] * 1, shade[k] * 0.92, shade[k] * 0.7], i * 18 + k * 3);
      });
      const o = i * 6;
      idx.push(o, o + 1, o + 4, o, o + 4, o + 3, o + 1, o + 2, o + 5, o + 1, o + 5, o + 4);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    const mesh = new THREE.Mesh(g, beamMat);
    mesh.name = `house-beams-${level}`;
    tag(mesh, level);
    scene.add(mesh);

    // the motes: a base spot on the beam's middle line plus a slow drift of AMP on each axis
    const n = list.length * SUNBEAM.motes;
    const base = new Float32Array(n * 3);
    const phase = new Float32Array(n * 3);
    const rate = new Float32Array(n * 3);
    list.forEach((bx, i) => {
      for (let m = 0; m < SUNBEAM.motes; m++) {
        const j = i * SUNBEAM.motes + m;
        const sx = bx.w.at, sz = bx.min[0] + bx.min[2];
        const u = 0.08 + 0.84 * hash01(sx + m, sz, 1);
        const v = (hash01(sx, sz + m, 2) * 2 - 1) * 0.8;
        base.set(bx.at(IN + u * SUNBEAM.length, v), j * 3);
        for (let c = 0; c < 3; c++) {
          phase[j * 3 + c] = hash01(sx + m, sz + c, 3 + c) * Math.PI * 2;
          rate[j * 3 + c] = 0.25 + 0.45 * hash01(sz + m, sx + c, 7 + c);
        }
      }
    });
    const mp = new Float32Array(n * 3);
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
    const points = new THREE.Points(mg, moteMat);
    points.name = `house-motes-${level}`;
    tag(points, level);
    scene.add(points);
    const layer = { level, mesh, points, base, phase, rate, mp, n, placed: false };
    layers.push(layer);
  }

  // beauty pass 3: a mote near the cat is swept round her as she walks (cat { x, y, z }, energy 0..1; none when she is still or motion is reduced)
  let cx = 0, cy = 0, cz = 0, ce = 0, tone = 1, amp = AMP;
  function place(L, t) {
    const { base, phase, rate, mp, n } = L;
    for (let j = 0; j < n * 3; j++) mp[j] = base[j] + amp * Math.sin(t * rate[j] + phase[j]);
    if (ce > 0.02) {
      for (let m = 0; m < n; m++) {
        const o = m * 3;
        const dx = mp[o] - cx, dz = mp[o + 2] - cz, dy = mp[o + 1] - cy - 0.5;
        const d2 = dx * dx + dz * dz;
        if (d2 > 1.9 || dy > 1.4 || dy < -1.4) continue;
        const k = ce * (1 - d2 / 1.9);
        const a = t * 2.2 + m;
        mp[o] += -dz * 0.4 * k + Math.cos(a) * 0.1 * k;
        mp[o + 1] += 0.16 * k;
        mp[o + 2] += dx * 0.4 * k + Math.sin(a) * 0.1 * k;
      }
    }
    L.points.geometry.attributes.position.needsUpdate = true;
    L.placed = true;
  }

  // the Old House's solarium goes calm while she lies in a sunny slot: the motes drift at half speed (their clock loses half of dt)
  let calm = false;
  let lost = 0;
  return {
    beams,
    setCalm(on) { calm = !!on; },
    // the day's light (houseglow.js dayPart): the shafts and motes take its sun colour and strength
    setTone(rgb, k) { beamMat.color.setRGB(rgb[0], rgb[1], rgb[2]); moteMat.color.setRGB(1.0 * (0.4 + 0.6 * rgb[0]), 0.94 * (0.4 + 0.6 * rgb[1]), 0.78 * (0.4 + 0.6 * rgb[2])); tone = k; },
    update(dt, t0, full, cat = null, energy = 0) {
      if (cat) { cx = cat.x; cy = cat.y; cz = cat.z; ce = reducedMotion ? 0 : energy; } else ce = 0;
      if (calm && !reducedMotion) lost += dt * 0.5;
      const t = t0 - lost;
      // beauty pass 2: the shafts breathe a little, as a high cloud passes (still under reduced motion)
      beamMat.opacity = SUNBEAM.opacity * tone * (reducedMotion ? 1 : 1 + 0.18 * Math.sin(t * 0.45) * Math.sin(t * 0.17 + 1)) * (mood ? Math.min(2, mood.sun + mood.flash * 2) : 1);
      if (mood) { moteMat.size = 0.075 * mood.motes; amp = AMP * mood.motes; } // beauty pass 6: a sunny morning's motes are bigger and dance wider; a storm's flash lights the shafts
      for (let i = 0; i < layers.length; i++) {
        const L = layers[i];
        const show = full.has(L.level);
        L.mesh.visible = show;
        L.points.visible = show;
        if (show && (!L.placed || !reducedMotion)) place(L, reducedMotion ? 0 : t);
      }
    },
    dispose() {
      for (const L of layers) {
        scene.remove(L.mesh);
        scene.remove(L.points);
        L.mesh.geometry.dispose();
        L.points.geometry.dispose();
      }
      layers.length = 0;
      beamMat.dispose();
      moteMat.dispose();
    },
  };
}
