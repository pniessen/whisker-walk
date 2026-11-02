import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCat } from '../src/cat/model.js';
import { animateCat } from '../src/cat/animator.js';
import { sinkTarget } from '../src/cat/waterlook.js';
import { HEN } from '../src/cat/hen.js';
import { CATALOG } from '../src/progression.js';
import { fingerprintCat, meshCount, triangles } from './helpers/catfingerprint.js';

// Hagrid rebuilt (body refinement, Task 8; R10-R12): a neck inside the head
// group, a hen's body with hackles and folded wings, a seven-feather tail, a
// joined two-half comb, two wattles, a hooked beak, feathery thighs with scaly
// shanks and chicken feet, at today's size, parts contract and mesh cap.

const BARE = { collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null };
const CAT_STATES = ['follow', 'nap', 'stretch', 'groom', 'requestPet', 'perch', 'sniff', 'stalk', 'pounce', 'scared', 'cross', 'land', 'wade', 'swim', 'shake', 'swipe', 'backUp'];
const FIGHT_SIX = ['arch', 'rearUp', 'flinch', 'pinned', 'pinning', 'roll'];

// Today's Hagrid mesh delta per item (Task 1, baseline.md), against bare 19.
const DELTA = {
  bell: 2, glow: 1, bandana: 1, booties: 0, backpack: 0, crown: 5, tophat: 2, beanie: 2, glasses: 3, sunglasses: 3,
  necktie: 2, bowtie: 3, scarf: 2, hoodie: 0, cape: 0, wings: 0, sneakers: 0, rainboots: 0, heart: 4, studded: 7,
  wizard: 3, monocle: 3, eyepatch: 2, raincoat: 0, sweater: 0, jetpack: 0, balloon: 0, socks: 0, partycrown: 11,
  confetticape: 0, starshades: 5, leafcrown: 9, balloonbunch: 0, sparklecollar: 12, warpaint: 6, candlehat: 4,
  streamerscarf: 6, goldbooties: 0,
};

const hen = (acc = BARE) => {
  const c = buildCat('hagrid', acc);
  animateCat(c, 'follow', 0, 0, false);
  c.updateMatrixWorld(true);
  return c;
};
const box = (o) => new THREE.Box3().setFromObject(o, true);
const hex = (o) => o.material?.color?.getHex?.();

// World-space triangles of a mesh (or meshes), as a flat array of 9-tuples.
function tris(meshes) {
  const out = [];
  const v = new THREE.Vector3();
  for (const m of [].concat(meshes)) {
    m.updateMatrixWorld(true);
    const g = m.geometry, p = g.attributes.position, idx = g.index;
    const n = idx ? idx.count : p.count;
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(p, idx ? idx.getX(i) : i).applyMatrix4(m.matrixWorld);
      out.push(v.x, v.y, v.z);
    }
  }
  return out;
}
// Distances along `dir` (unit) from `o` at which the ray crosses a triangle.
function hits(T, o, dir) {
  const res = [];
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), pv = new THREE.Vector3(), tv = new THREE.Vector3(), qv = new THREE.Vector3();
  const a = new THREE.Vector3();
  for (let i = 0; i < T.length; i += 9) {
    a.set(T[i], T[i + 1], T[i + 2]);
    e1.set(T[i + 3], T[i + 4], T[i + 5]).sub(a);
    e2.set(T[i + 6], T[i + 7], T[i + 8]).sub(a);
    pv.crossVectors(dir, e2);
    const det = e1.dot(pv);
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det;
    tv.subVectors(o, a);
    const u = tv.dot(pv) * inv;
    if (u < 0 || u > 1) continue;
    qv.crossVectors(tv, e1);
    const w = dir.dot(qv) * inv;
    if (w < 0 || u + w > 1) continue;
    const t = e2.dot(qv) * inv;
    if (t > 1e-7) res.push(t);
  }
  return res;
}
const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
const FWD = new THREE.Vector3(0, 0, -1), BACK = new THREE.Vector3(0, 0, 1);
const bracketed = (T, p, a, b) => hits(T, p, a).length > 0 && hits(T, p, b).length > 0;
// Inside a closed (possibly multi-part) mesh: hit both ways along y AND along z.
const inside = (T, p) => bracketed(T, p, UP, DOWN) && bracketed(T, p, FWD, BACK);

// Connected components of a geometry, welding vertices by position.
function components(geo, filter = () => true) {
  const p = geo.attributes.position, idx = geo.index;
  const key = (i) => `${p.getX(i).toFixed(5)},${p.getY(i).toFixed(5)},${p.getZ(i).toFixed(5)}`;
  const parent = new Map();
  const find = (k) => { while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k); } return k; };
  const add = (k) => { if (!parent.has(k)) parent.set(k, k); };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  const n = idx ? idx.count : p.count;
  for (let i = 0; i < n; i += 3) {
    const vs = [0, 1, 2].map((j) => (idx ? idx.getX(i + j) : i + j));
    if (!vs.every(filter)) continue;
    const ks = vs.map(key);
    ks.forEach(add);
    union(ks[0], ks[1]); union(ks[1], ks[2]);
  }
  const groups = new Map();
  for (let i = 0; i < p.count; i++) {
    if (!filter(i)) continue;
    const k = key(i);
    if (!parent.has(k)) continue;
    const r = find(k);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(new THREE.Vector3().fromBufferAttribute(p, i));
  }
  return [...groups.values()];
}
const colourAt = (geo, i) => new THREE.Color(geo.attributes.color.getX(i), geo.attributes.color.getY(i), geo.attributes.color.getZ(i));
const isColour = (geo, i, h) => {
  const c = colourAt(geo, i), t = new THREE.Color(h);
  return Math.abs(c.r - t.r) + Math.abs(c.g - t.g) + Math.abs(c.b - t.b) < 1e-4;
};
// Every vertex of a mesh in `frame`'s local space.
function pointsIn(mesh, frame) {
  mesh.updateMatrixWorld(true);
  frame.updateMatrixWorld(true);
  const m = new THREE.Matrix4().copy(frame.matrixWorld).invert().multiply(mesh.matrixWorld);
  const p = mesh.geometry.attributes.position;
  const out = [];
  for (let i = 0; i < p.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(m));
  return out;
}
const boxOf = (pts) => new THREE.Box3().setFromPoints(pts);
const combColoured = (mesh) => {
  const g = mesh.geometry;
  if (!g.attributes.color) return hex(mesh) === HEN.COMB;
  for (let i = 0; i < g.attributes.position.count; i++) if (!isColour(g, i, HEN.COMB)) return false;
  return true;
};

describe('Hagrid rebuilt (Task 8)', () => {
  it('the same size', () => {
    const c = hen();
    const all = box(c);
    expect(all.min.x).toBeGreaterThanOrEqual(-0.36);
    expect(all.max.x).toBeLessThanOrEqual(0.36);
    expect(all.min.y).toBeGreaterThanOrEqual(0);
    expect(all.max.y).toBeLessThanOrEqual(1.0);
    expect(all.min.z).toBeGreaterThanOrEqual(-0.53);
    expect(all.max.z).toBeLessThanOrEqual(0.62);
    const { body, head } = c.userData.parts;
    const b = box(body);
    const today = [-0.336, 0.131, -0.374, 0.336, 0.709, 0.374];
    [...b.min.toArray(), ...b.max.toArray()].forEach((v, i) => expect(Math.abs(v - today[i])).toBeLessThanOrEqual(0.03));
    const [s, n] = body.geometry.userData.ranges.hackles;
    const p = body.geometry.attributes.position;
    let top = -Infinity;
    for (let i = s; i < s + n; i++) top = Math.max(top, new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(body.matrixWorld).y);
    expect(top).toBeLessThanOrEqual(0.74);
    expect(head.position.toArray()).toEqual([0, 0.78, -0.28]);
    expect(Math.abs(box(head.children[0]).max.y - 0.916)).toBeLessThanOrEqual(0.01);
  });

  it('within his caps', () => {
    const bare = buildCat('hagrid', BARE);
    const n = meshCount(bare);
    expect(n).toBeLessThanOrEqual(15);
    for (const [id, d] of Object.entries(DELTA)) {
      const slot = CATALOG.accessories[id].slot;
      expect([id, meshCount(buildCat('hagrid', { ...BARE, [slot]: id })) - n]).toEqual([id, d]);
    }
    expect(triangles(bare)).toBeLessThanOrEqual(4500);
    expect(fingerprintCat(buildCat('hagrid', undefined, { simple: true }))).toEqual(fingerprintCat(buildCat('hagrid')));
  });

  it('the rig contract', () => {
    const c = buildCat('hagrid');
    const { parts, base } = c.userData;
    expect(Object.keys(parts).sort()).toEqual(['body', 'earL', 'earR', 'head', 'legs', 'tail', 'tailPivots', 'whiskers']);
    expect(parts.tailPivots).toHaveLength(5);
    expect(parts.legs).toHaveLength(4);
    for (const i of [2, 3]) {
      expect(parts.legs[i].isGroup).toBe(true);
      expect(parts.legs[i].children).toHaveLength(0);
    }
    for (const i of [0, 1]) {
      const leg = parts.legs[i];
      expect(leg.children[0].isMesh).toBe(true);
      expect(leg.userData.paw.isMesh).toBe(true);
      expect(leg.userData.paw).not.toBe(leg.children[0]);
      expect(leg.userData.paw.parent).toBe(leg);
    }
    expect(parts.earL.isMesh && parts.earR.isMesh).toBe(true);
    expect(parts.whiskers).toEqual([]);
    expect(c.userData.noMerge).toBe(true);
    expect(base).toEqual({ bodyY: 0.42, bodyScale: [0.9, 0.85, 1.1], headPos: [0, 0.78, -0.28], tailRotX: -0.6, combGive: 0.25 });
    expect(parts.head.children[0].isMesh).toBe(true);
    expect(parts.head.userData.neckBase).toEqual(parts.head.children[0].geometry.userData.neckBase);
    for (const i of [1, 2, 3, 4]) expect(parts.tailPivots[i].children.filter((o) => o.isMesh)).toHaveLength(0);
  });

  it('a neck with no gap, in every state he plays', () => {
    const misses = [];
    for (const state of CAT_STATES) {
      for (const speed of [0, 1.5]) {
        for (const t of [0.3, 1.3]) {
          const c = buildCat('hagrid');
          animateCat(c, state, t, speed, false, 1);
          c.updateMatrixWorld(true);
          const { head, body } = c.userData.parts;
          const p = new THREE.Vector3().fromArray(head.userData.neckBase).applyMatrix4(head.matrixWorld);
          if (!bracketed(tris(body), p, UP, DOWN)) misses.push(`${state}/${speed}/${t}`);
        }
      }
    }
    expect(misses).toEqual([]);
    for (const state of FIGHT_SIX) {
      for (const t of [0.3, 1.3]) expect(() => animateCat(buildCat('hagrid'), state, t, 0, false)).not.toThrow();
    }
  });

  it('the neck reaches 8 cm into the body at rest', () => {
    const c = hen();
    const { head, body } = c.userData.parts;
    const p = new THREE.Vector3().fromArray(head.userData.neckBase).applyMatrix4(head.matrixWorld);
    const up = hits(tris(body), p, UP);
    expect(Math.min(...up)).toBeGreaterThanOrEqual(0.08);
  });

  it('a joined comb that stays joined', () => {
    const c = hen();
    const { head, earL, earR } = c.userData.parts;
    expect(combColoured(earL)).toBe(true);
    expect(combColoured(earR)).toBe(true);
    expect(earL.rotation.z).toBe(0.22);
    expect(earR.rotation.z).toBe(-0.22);
    const f = boxOf(pointsIn(earL, head)), b = boxOf(pointsIn(earR, head));
    // front then back along z, overlapping or touching
    expect(f.min.z).toBeLessThan(b.min.z);
    expect(b.min.z - f.max.z).toBeLessThanOrEqual(0.005);
    for (const bx of [f, b]) expect(Math.abs((bx.min.x + bx.max.x) / 2)).toBeLessThanOrEqual(0.01);
    const both = f.clone().union(b);
    expect(both.max.y).toBeLessThanOrEqual(0.178);
    expect(Math.max(-both.min.z, both.max.z)).toBeLessThanOrEqual(0.10);
    for (const state of ['cross', 'pinned']) {
      const p = buildCat('hagrid');
      animateCat(p, state, 1.3, 0, false);
      const top = (m) => pointsIn(m, p.userData.parts.head).reduce((a, v) => (v.y > a.y ? v : a));
      expect(Math.abs(top(p.userData.parts.earL).x - top(p.userData.parts.earR).x)).toBeLessThanOrEqual(0.03);
    }
  });

  it('wattles, a hooked beak, seven tail feathers, wings, chicken feet', () => {
    const c = hen();
    const { head, body, tailPivots, legs } = c.userData.parts;
    const beak = head.children.find((o) => o.isMesh && hex(o) === HEN.BEAK && !o.geometry.attributes.color);
    expect(beak).toBeTruthy();
    expect(components(beak.geometry)).toHaveLength(2);
    const beakBox = boxOf(pointsIn(beak, head));
    // the upper beak's tip hooks below the line of its base
    const upper = components(beak.geometry).map((pts) => pts.map((v) => v.clone().applyMatrix4(beak.matrix))).sort((a, b) => boxOf(b).max.y - boxOf(a).max.y)[0];
    const tip = upper.reduce((a, v) => (v.z < a.z ? v : a));
    expect(tip.y).toBeLessThan(boxOf(upper).getCenter(new THREE.Vector3()).y);

    const wattles = head.children.find((o) => o.isMesh && o.name === 'wattles');
    expect(wattles).toBeTruthy();
    const lobes = components(wattles.geometry);
    expect(lobes).toHaveLength(2);
    for (const pts of lobes) {
      const centre = boxOf(pts.map((v) => v.clone().applyMatrix4(wattles.matrix))).getCenter(new THREE.Vector3());
      expect(centre.y).toBeLessThan(beakBox.min.y);
    }

    const tails = tailPivots[0].children.filter((o) => o.isMesh);
    expect(tails).toHaveLength(3);
    const feathers = tails.flatMap((m) => components(m.geometry).map((pts) => ({ m, pts })));
    expect(feathers).toHaveLength(7);
    const len = ({ pts }) => Math.max(...pts.map((v) => v.length()));
    const midX = (f) => Math.abs(boxOf(f.pts).getCenter(new THREE.Vector3()).x);
    const mid = feathers.filter((f) => f.m === tails[0]).sort((a, b) => midX(a) - midX(b))[0];
    for (const f of feathers) if (f !== mid) expect(len(mid)).toBeGreaterThan(len(f));
    let green = 0;
    for (const m of tails) {
      const col = m.geometry.attributes.color;
      for (let i = 0; i < col.count; i++) if (col.getY(i) > col.getX(i)) green++;
    }
    expect(green).toBeGreaterThan(0);

    for (const w of ['wingL', 'wingR']) {
      const [s, n] = body.geometry.userData.ranges[w];
      const pts = [];
      for (let i = s; i < s + n; i++) pts.push(new THREE.Vector3().fromBufferAttribute(body.geometry.attributes.position, i).applyMatrix4(body.matrixWorld));
      const wb = boxOf(pts);
      expect(wb.max.z - wb.min.z).toBeGreaterThan(wb.max.y - wb.min.y);
    }

    for (const leg of legs.slice(0, 2)) {
      const foot = leg.userData.paw, g = foot.geometry;
      const claws = components(g, (i) => isColour(g, i, HEN.CLAW));
      expect(claws).toHaveLength(4);
      const zs = claws.map((pts) => boxOf(pts).getCenter(new THREE.Vector3()).z);
      expect(zs.filter((z) => z < -0.05)).toHaveLength(3);
      expect(zs.filter((z) => z > 0.03)).toHaveLength(1);
      // the toes end in the claws: the foot's front-most and back-most points are claw
      const p = g.attributes.position;
      let iMin = 0, iMax = 0;
      for (let i = 0; i < p.count; i++) {
        if (p.getZ(i) < p.getZ(iMin)) iMin = i;
        if (p.getZ(i) > p.getZ(iMax)) iMax = i;
      }
      expect(isColour(g, iMin, HEN.CLAW) && isColour(g, iMax, HEN.CLAW)).toBe(true);
      const sole = box(foot).min.y;
      expect(sole).toBeGreaterThanOrEqual(-0.005);
      expect(sole).toBeLessThanOrEqual(0.01);
    }
  });

  describe('his items still fit', () => {
    const comb = () => {
      const c = hen();
      const { head, earL, earR } = c.userData.parts;
      return { c, head, pts: [...pointsIn(earL, head), ...pointsIn(earR, head)] };
    };

    it('hat brims clear the comb', () => {
      const top = Math.max(...comb().pts.map((v) => v.y));
      for (const id of ['tophat', 'wizard']) {
        const c = hen({ ...BARE, head: id });
        const brim = c.userData.parts.head.children.find((o) => o.geometry?.type === 'CylinderGeometry' && o.geometry.parameters.height === 0.015);
        expect(boxOf(pointsIn(brim, c.userData.parts.head)).min.y).toBeGreaterThanOrEqual(top + 0.003);
      }
    });

    it('the beanie covers the comb', () => {
      const c = hen({ ...BARE, head: 'beanie' });
      const { head, earL, earR } = c.userData.parts;
      const cap = head.children.find((o) => o.isMesh && hex(o) === 0xd6602f);
      const r = cap.geometry.parameters.radius;
      const [ax, ay, az] = cap.scale.toArray().map((s) => s * r);
      const skull = head.children[0].geometry.userData.skull; // [rx, ry, rz] at the head origin
      const exposed = [...pointsIn(earL, head), ...pointsIn(earR, head)].filter((v) => {
        const inCap = ((v.x - cap.position.x) / ax) ** 2 + ((v.y - cap.position.y) / ay) ** 2 + ((v.z - cap.position.z) / az) ** 2 <= 1;
        const inSkull = (v.x / skull[0]) ** 2 + (v.y / skull[1]) ** 2 + (v.z / skull[2]) ** 2 <= 1;
        return !inCap && !inSkull;
      });
      expect(exposed.map((v) => v.toArray().map((n) => +n.toFixed(4)))).toEqual([]);
    });

    it('face items keep today\'s positions', () => {
      const today = {
        glasses: [[-0.09, 0.03, -0.1], [0.09, 0.03, -0.1], [0, 0.03, -0.1]],
        sunglasses: [[-0.09, 0.03, -0.1], [0.09, 0.03, -0.1], [0, 0.03, -0.1]],
        monocle: [[0.09, 0.03, -0.1], [0.105, 0, -0.09], [0.115, -0.024, -0.09]],
        eyepatch: [[0.09, 0.03, -0.105], [0, 0.05, 0]],
      };
      const bare = buildCat('hagrid').userData.parts.head.children.length;
      for (const [id, want] of Object.entries(today)) {
        const head = buildCat('hagrid', { ...BARE, face: id }).userData.parts.head;
        const got = head.children.slice(bare).map((o) => o.position.toArray().map((n) => +n.toFixed(4)));
        expect([id, got]).toEqual([id, want]);
      }
    });

    it('the collar ring goes round the neck', () => {
      const c = hen({ ...BARE, collar: 'bell' });
      const { head } = c.userData.parts;
      const skullNeck = head.children[0];
      const { P0, P1, P2 } = skullNeck.geometry.userData.neck;
      const ring = head.children.find((o) => o.isGroup && o.children[0]?.geometry?.type === 'TorusGeometry').children[0];
      const centre = new THREE.Vector3().setFromMatrixPosition(ring.matrixWorld).applyMatrix4(new THREE.Matrix4().copy(head.matrixWorld).invert());
      // nearest point on the neck's centreline (a quadratic Bezier)
      const curve = new THREE.QuadraticBezierCurve3(...[P0, P1, P2].map((a) => new THREE.Vector3().fromArray(a)));
      let best = { d: Infinity, u: 0 };
      for (let u = 0; u <= 1; u += 0.002) {
        const d = curve.getPoint(u).distanceTo(centre);
        if (d < best.d) best = { d, u };
      }
      expect(best.d).toBeLessThanOrEqual(0.02);
      // the neck's radius at that point, measured off its vertices
      const at = curve.getPoint(best.u), tan = curve.getTangent(best.u);
      const [s, n] = skullNeck.geometry.userData.ranges.neck;
      const p = skullNeck.geometry.attributes.position;
      let neckR = 0;
      for (let i = s; i < s + n; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(p, i).sub(at);
        if (Math.abs(v.dot(tan)) > 0.035) continue; // the neck has a ring every ~6 cm
        neckR = Math.max(neckR, v.clone().addScaledVector(tan, -v.dot(tan)).length());
      }
      expect(neckR).toBeGreaterThan(0.05);
      expect(ring.geometry.parameters.radius).toBeGreaterThan(neckR + 0.01);
    });

    it.each(['bandana', 'necktie', 'bowtie', 'scarf'])('%s sits on the neck, outside it', (id) => {
      const c = hen({ ...BARE, neck: id });
      const bareKids = buildCat('hagrid').userData.parts.head.children.length;
      const { head } = c.userData.parts;
      const T = tris(head.children[0]);
      // the front surface an item rests on: the neck, or below it the breast
      const front = tris([head.children[0], c.userData.parts.body]);
      const items = head.children.slice(bareKids).flatMap((o) => (o.isMesh ? [o] : o.children.filter((k) => k.isMesh)));
      expect(items.length).toBeGreaterThan(0);
      let gaps = 0;
      for (const m of items) {
        const p = m.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const v = new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
          expect(inside(T, v)).toBe(false);
        }
        const b = box(m);
        const o = b.getCenter(new THREE.Vector3());
        o.z = -2;
        const h = hits(front, o, BACK);
        if (!h.length) continue;
        expect(-2 + Math.min(...h) - b.max.z).toBeLessThanOrEqual(0.03);
        gaps++;
      }
      expect(gaps).toBeGreaterThan(0);
    });
  });

  it('his swim waterline barely moves', () => {
    const c = buildCat('hagrid');
    expect(Math.abs(sinkTarget(c, 'swim') - 0.38)).toBeLessThanOrEqual(0.03);
    expect(Math.abs(sinkTarget(c, 'wade') - 0.235)).toBeLessThanOrEqual(0.03);
  });

  it('his comb twitches a little', () => {
    const rest = buildCat('hagrid');
    animateCat(rest, 'follow', 1.3, 0, false);
    expect(rest.userData.parts.earL.rotation.z).toBe(0.22);
    expect(rest.userData.parts.earR.rotation.z).toBe(-0.22);
    for (const state of [...CAT_STATES, ...FIGHT_SIX]) {
      for (const t of [0.3, 1.3, 2.9]) {
        const a = buildCat('hagrid');
        const b = buildCat('hagrid');
        b.userData.base.combGive = 1;
        animateCat(a, state, t, 0, false, 1);
        animateCat(b, state, t, 0, false, 1);
        const pa = a.userData.parts, pb = b.userData.parts;
        expect(pa.earL.rotation.z - 0.22).toBeCloseTo(0.25 * (pb.earL.rotation.z - 0.22), 12);
        expect(pa.earR.rotation.z + 0.22).toBeCloseTo(0.25 * (pb.earR.rotation.z + 0.22), 12);
      }
    }
  });
});
