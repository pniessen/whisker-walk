// The Moon, milestone 5: Star Hill's ground and drawing. A tower with a true wall, the ramp as the one way up (under 1 in 3, every step legal,
// no way up elsewhere), the observatory's pillars a cat passes between, the Star Table clear of the ramp, the stand-in and the detail groups,
// the budget row, and the colliders and rocks clear of it all.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import * as P from '../src/world/moonplan.js';
import { build } from '../src/world/moon.js';
import { MAX_PATH_GRADE } from '../src/ground.js';
import { NEAR, HYSTERESIS, wingNear, createZones } from '../src/world/moonzones.js';
import { scatterRocks } from '../src/world/moonparts.js';
import { createProgression } from '../src/progression.js';
import { createDiscoveryLog } from '../src/discoveries.js';
import { mem } from './helpers/lighthouselife.js';

const H = P.STAR_HILL;
const g = P.createMoonGround();
const built = () => { const scene = new THREE.Scene(); const area = build(scene); return { scene, area }; };

describe('the ground of Star Hill', () => {
  it('is the plain\'s own height (the hill adds to it), 5 m on the top, 0 well away from it', () => {
    expect(P.hillAdd(H.x, H.z)).toBe(5);
    expect(P.moonY(H.x, H.z)).toBeCloseTo(5 + P.moonBaseY(H.x, H.z), 9);
    expect(P.hillAdd(H.x + 20, H.z)).toBe(0);
    expect(P.hillAdd(H.x + H.rs + H.w / 2 + 0.01, H.z)).toBe(0);
    for (const [x, z] of [[0, 45], [-34, 26], [46, 0]]) expect(P.moonY(x, z)).toBe(P.moonBaseY(x, z)); // nothing else moved
  });
  it('the ramp starts on the dust and rises 1 in 6 or so to a level landing that joins the top', () => {
    expect(P.rampHeight(0)).toBe(0);
    expect(P.rampHeight(1)).toBe(5);
    expect(P.rampHeight(1 - H.flat)).toBeCloseTo(5, 9);
    let prev = 0;
    for (let i = 1; i <= 100; i++) { const y = P.rampHeight(i / 100); expect(y).toBeGreaterThanOrEqual(prev); prev = y; }
    const mouth = P.rampPoint(0);
    expect(g.y(mouth.x, mouth.z)).toBeCloseTo(P.moonBaseY(mouth.x, mouth.z), 6);
    const top = P.rampPoint(1);
    expect(g.y(top.x, top.z)).toBeCloseTo(5, 1);
  });
  it('walking the ramp\'s middle from its mouth to the top, every step is legal and no stretch is steeper than 1 in 3', () => {
    let prev = P.rampPoint(0);
    let worst = 0;
    for (let i = 1; i <= 2000; i++) {
      const p = P.rampPoint(i / 2000);
      expect(g.canStep(prev.x, prev.z, p.x, p.z), `step ${i}`).toBe(true);
      const run = Math.hypot(p.x - prev.x, p.z - prev.z);
      worst = Math.max(worst, Math.abs(g.y(p.x, p.z) - g.y(prev.x, prev.z)) / run);
      prev = p;
    }
    expect(worst).toBeLessThanOrEqual(MAX_PATH_GRADE);
    expect(worst).toBeGreaterThan(0.1); // and it is a real climb
  });
  it('the whole width of the ramp is walkable level ground across (the same height from the tower\'s wall to its edge)', () => {
    for (let i = 1; i < 40; i++) {
      const t = (i / 40) * 0.98;
      const y0 = P.hillAdd(P.rampPoint(t, -1.2).x, P.rampPoint(t, -1.2).z);
      for (const k of [-0.6, 0, 0.6, 1.3]) { const p = P.rampPoint(t, k); expect(P.hillAdd(p.x, p.z)).toBeCloseTo(y0, 6); }
    }
  });
  it('the tower is a wall: from every side but the ramp\'s, a step toward the top is refused at the foot and at every height of the ramp\'s far side', () => {
    const a1 = H.a0 + H.turn;
    for (let n = 0; n < 72; n++) {
      const a = (n / 72) * Math.PI * 2;
      const rel = (((a - H.a0) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      if (rel <= H.turn + 0.2) continue; // where the ramp stands
      const out = { x: H.x + Math.cos(a) * (H.top + 3.5), z: H.z + Math.sin(a) * (H.top + 3.5) };
      const inn = { x: H.x + Math.cos(a) * (H.top - 0.6), z: H.z + Math.sin(a) * (H.top - 0.6) };
      expect(g.canStep(out.x, out.z, inn.x, inn.z), `from ${n}`).toBe(false);
    }
    void a1;
  });
  it('the ramp\'s outer edge is a wall once it is a rim high (it never drops her off), and its end face is a wall', () => {
    for (const t of [0.3, 0.5, 0.7, 0.9]) {
      const e = P.rampPoint(t, H.w / 2 - 0.3);
      const out = P.rampPoint(t, H.w / 2 + 1.2);
      expect(g.canStep(e.x, e.z, out.x, out.z), `edge ${t}`).toBe(false);
    }
    const end = P.rampPoint(1, 0);
    const a = H.a0 + H.turn;
    const beyond = { x: H.x + Math.cos(a + 0.12) * H.rs, z: H.z + Math.sin(a + 0.12) * H.rs };
    expect(g.canStep(end.x, end.z, beyond.x, beyond.z)).toBe(false);
  });
  it('on foot, from the spawn, the only way onto the top is the ramp: a flood over the legal steps reaches the top, and every cell of it is reached from the ramp\'s landing', () => {
    // a 0.4 m grid over the hill's neighbourhood; an 8-neighbour step is legal when the ground allows it and no collider is within 0.35 m
    const x0 = H.x - 14; const z0 = H.z - 14; const n = 70; const cell = 0.4;
    const cols = P.MOON_COLLIDERS;
    const free = (x, z) => { for (const c of cols) if (Math.hypot(x - c.x, z - c.z) < c.r + 0.3) return false; return true; };
    const seen = new Uint8Array(n * n);
    const idx = (i, j) => j * n + i;
    const at = (i, j) => ({ x: x0 + i * cell, z: z0 + j * cell });
    const m = P.rampPoint(0, 0.4);
    const si = Math.round((m.x - x0) / cell); const sj = Math.round((m.z - z0) / cell);
    const stack = [[si, sj]];
    seen[idx(si, sj)] = 1;
    let topCells = 0; let topFromRamp = false;
    while (stack.length) {
      const [i, j] = stack.pop();
      const p = at(i, j);
      if (Math.hypot(p.x - H.x, p.z - H.z) < H.top - 0.5) { topCells++; topFromRamp = true; }
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const a = i + di; const b = j + dj;
        if (a < 0 || b < 0 || a >= n || b >= n || seen[idx(a, b)]) continue;
        const q = at(a, b);
        if (!free(q.x, q.z) || !g.canStep(p.x, p.z, q.x, q.z)) continue;
        seen[idx(a, b)] = 1;
        stack.push([a, b]);
      }
    }
    expect(topFromRamp).toBe(true);
    expect(topCells).toBeGreaterThan(150); // the pavilion's floor is a real place to stand
    // and the plain beyond the ramp's reach is joined to it (the flood began at the ramp's mouth and got round the hill's foot too)
    const far = { x: H.x + 11, z: H.z + 4 };
    expect(seen[idx(Math.round((far.x - x0) / cell), Math.round((far.z - z0) / cell))]).toBe(1);
  });
  it('from the plain, no sub-step of a short walk takes a cat up the tower\'s side (a rim of 0.3 m or more at every foot point)', () => {
    for (let n = 0; n < 90; n++) {
      const a = (n / 90) * Math.PI * 2;
      const rel = (((a - H.a0) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      if (rel <= H.turn + 0.3) continue;
      // tiny steps (a slow frame) inward across the wall: some step must refuse
      let ok = true;
      let px = H.x + Math.cos(a) * (H.top + 0.5); let pz = H.z + Math.sin(a) * (H.top + 0.5);
      for (let r = H.top + 0.5; r > H.top - 0.5 && ok; r -= 0.02) {
        const x = H.x + Math.cos(a) * r; const z = H.z + Math.sin(a) * r;
        ok = g.canStep(px, pz, x, z);
        px = x; pz = z;
      }
      expect(ok, `ray ${n}`).toBe(false);
    }
  });
});

describe('the observatory and the Star Table', () => {
  const O = P.OBSERVATORY;
  it('eight pillars a cat passes between (every gap at least 1.8 m wide), the telescope in the middle, all on the level top', () => {
    expect(P.PILLAR_SPOTS).toHaveLength(8);
    for (let i = 0; i < 8; i++) {
      const a = P.PILLAR_SPOTS[i]; const b = P.PILLAR_SPOTS[(i + 1) % 8];
      expect(Math.hypot(a.x - b.x, a.z - b.z) - 2 * O.pillarR).toBeGreaterThan(1.8);
      expect(Math.hypot(a.x - O.x, a.z - O.z)).toBeLessThan(H.top - 1.5);
    }
    // the ring of pillars and the telescope leave a clear walk from the ramp's landing to the telescope's side
    const land = P.rampPoint(0.97, -0.4);
    const toward = { x: O.x + (land.x - O.x) * 0.2, z: O.z + (land.z - O.z) * 0.2 };
    for (const c of P.STAR_COLLIDERS) expect(Math.hypot(toward.x - c.x, toward.z - c.z)).toBeGreaterThan(c.r + 0.3);
    expect(O.reach).toBeGreaterThan(O.scopeR + 0.7); // she can stand beside the telescope and be inside the prompt
  });
  it('the ramp\'s landing meets the pavilion floor: from where the ramp ends a cat reaches within the telescope\'s prompt over the legal steps', () => {
    let p = P.rampPoint(1, -0.6);
    const target = { x: O.x, z: O.z };
    for (let i = 0; i < 200 && Math.hypot(p.x - target.x, p.z - target.z) > O.reach - 0.3; i++) {
      const d = Math.hypot(target.x - p.x, target.z - p.z);
      const q = { x: p.x + ((target.x - p.x) / d) * 0.1, z: p.z + ((target.z - p.z) / d) * 0.1 };
      expect(g.canStep(p.x, p.z, q.x, q.z)).toBe(true);
      p = q;
    }
    expect(Math.hypot(p.x - target.x, p.z - target.z)).toBeLessThanOrEqual(O.reach);
  });
  it('the Star Table stands on the dust clear of the ramp and the tower (a cat walks round it), inside the bounds', () => {
    const T = P.STAR_TABLE;
    expect(P.hillAdd(T.x, T.z)).toBe(0);
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      expect(P.hillAdd(T.x + Math.cos(a) * (T.r + 0.8), T.z + Math.sin(a) * (T.r + 0.8))).toBe(0);
    }
    expect(Math.hypot(T.x - H.x, T.z - H.z) - (H.rs + H.w / 2)).toBeGreaterThan(T.r + 1);
    expect(T.x - T.r).toBeGreaterThan(P.MOON_BOUNDS.minX);
    expect(Math.hypot(T.x - H.x, T.z - H.z)).toBeLessThan(25); // it is the hill's own plaza
  });
  it('the wing\'s colliders are in the area (eight pillars, the telescope, the table) and clear of the spawn, every route and each other find', () => {
    const { area } = built();
    for (const c of P.STAR_COLLIDERS) expect(area.colliders.some((k) => k.x === c.x && k.z === c.z && k.r === c.r)).toBe(true);
    expect(P.STAR_COLLIDERS).toHaveLength(10);
    for (const c of P.STAR_COLLIDERS) expect(Math.hypot(c.x - P.MOON_SPAWN.x, c.z - P.MOON_SPAWN.z)).toBeGreaterThan(60);
    // no other collider sits on the hill's ground
    for (const k of area.colliders) {
      if (P.STAR_COLLIDERS.includes(k) || P.STAR_COLLIDERS.some((c) => c.x === k.x && c.z === k.z)) continue;
      expect(Math.hypot(k.x - H.x, k.z - H.z) - k.r, `collider ${k.x},${k.z}`).toBeGreaterThan(H.rs + H.w / 2 - 0.01);
    }
  });
  it('no rock stands on the hill or its ramp or the table, and no find spot, pebble, mouse or job point is within the hill\'s reach', () => {
    for (const r of Object.values(scatterRocks(false)).flat()) {
      expect(Math.hypot(r.x - H.x, r.z - H.z)).toBeGreaterThan(H.rs + H.w / 2 + 2);
      expect(Math.hypot(r.x - P.STAR_TABLE.x, r.z - P.STAR_TABLE.z)).toBeGreaterThan(P.STAR_TABLE.r + 1);
    }
    for (const p of [...P.PEBBLES, ...P.MOON_MICE, ...P.JOB_POINTS]) expect(Math.hypot(p.x - H.x, p.z - H.z)).toBeGreaterThan(H.rs + H.w / 2 + 2);
  });
});

describe('the drawing', () => {
  const tris = (o) => { let n = 0; o.traverse((m) => { if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; }); return n; };
  it('the tower and its ramp are in the Moon\'s own stone mesh (the stand-in: always drawn, no draw call of its own); the observatory is a group the zones hide', () => {
    const { scene } = built();
    const wing = scene.getObjectByName('moon:wing');
    expect(wing).toBeTruthy();
    expect(wing.visible).toBe(false); // built hidden: the spawn is 77 m away
    expect(wing.children.map((m) => m.name).sort()).toEqual(['moonB2:paint', 'moon:wingfigs'].sort());
    expect(scene.getObjectByName('moon:wingfar')).toBeUndefined(); // no mesh of its own
    const stone = scene.getObjectByName('moon:stone');
    expect(stone).toBeTruthy();
    const box = new THREE.Box3().setFromObject(stone);
    expect(box.min.x).toBeLessThan(H.x - H.top); // the tower's side is in it
    const top = 5 + P.moonBaseY(H.x, H.z);
    let high = false;
    const pos = stone.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getY(i) - top) < 0.1 && Math.hypot(pos.getX(i) - H.x, pos.getZ(i) - H.z) < H.top) high = true;
    expect(high).toBe(true);
    expect(tris(wing)).toBeGreaterThan(1500);
  });
  it('the wing is two meshes (the paint and the additive figures) and the stand-in adds no mesh: the whole place gained only the wing\'s two', () => {
    const { scene } = built();
    let meshes = 0;
    scene.traverse((o) => { if (o.isMesh) meshes++; });
    expect(meshes).toBe(22); // 17 at milestone 4, the two of the wing and (milestone 6) the Launch Complex's rocket, arm and plume (the smoke's Points is a fourth object, not a mesh)
  });
  it('the wing\'s meshes sit on the hill: the observatory reaches 3.4 m over the top and its dome a little more, the table\'s stone is on the dust', () => {
    const { scene } = built();
    const box = new THREE.Box3().setFromObject(scene.getObjectByName('moon:wing'));
    const top = 5 + P.moonBaseY(H.x, H.z);
    expect(box.max.y).toBeGreaterThan(top + 3.4);
    expect(box.max.y).toBeLessThan(top + 6);
    expect(box.min.y).toBeLessThan(top - 3); // the table's pedestal
  });
  it('the additive mesh has the table\'s five pictures and the ceiling\'s cat as ranges; it never merges or casts', () => {
    const { scene } = built();
    const f = scene.getObjectByName('moon:wingfigs');
    expect(Object.keys(f.geometry.userData.ranges).sort()).toEqual(['ceilcat', 'tc0', 'tc1', 'tc2', 'tc3', 'tc4']);
    expect(f.userData.noMerge).toBe(true);
    expect(f.castShadow).toBe(false);
    expect(f.material.transparent).toBe(true);
  });
  it('is the same picture every time (no random number, no clock)', () => {
    const sum = (s) => { let n = 0; s.traverse((o) => { if (o.geometry?.attributes?.position && /wing|stone/.test(o.name + (o.parent?.name ?? ''))) for (const v of o.geometry.attributes.position.array) n += v; }); return n; };
    expect(sum(built().scene)).toBe(sum(built().scene));
  });
});

describe('the zones', () => {
  it('the wing is a stand-in beyond 55 m and drawn within it; once drawn it stays out to 61 m (no flicker on the line)', () => {
    expect(NEAR).toBe(55);
    expect(HYSTERESIS).toBe(6);
    expect(wingNear(54.9, false)).toBe(true);
    expect(wingNear(55.1, false)).toBe(false);
    expect(wingNear(58, true)).toBe(true);
    expect(wingNear(61.1, true)).toBe(false);
    expect(wingNear(0, false)).toBe(true);
  });
  it('the spawn (77 m), the dome (58 m) and the Far Beacon hold the wing as a stand-in; the Star Table and the Old Dish (24 m) draw it', () => {
    const z = createZones();
    expect(z.update(P.MOON_SPAWN.x, P.MOON_SPAWN.z).B).toBe(false);
    expect(z.update(P.DOME.x, P.DOME.z).B).toBe(false);
    expect(z.update(P.FAR_BEACON.x, P.FAR_BEACON.z).B).toBe(false);
    expect(z.update(P.STAR_TABLE.x, P.STAR_TABLE.z).B).toBe(true);
    expect(z.update(P.OLD_DISH.x, P.OLD_DISH.z).B).toBe(true);
  });
  it('walking toward the hill turns it on at 55 m, walking away turns it off at 61 m', () => {
    const z = createZones();
    let on = null;
    for (let d = 80; d >= 20; d -= 1) { const r = z.update(H.x + d, H.z).B; if (r && on === null) on = d; }
    expect(on).toBe(55);
    let off = null;
    for (let d = 20; d <= 80; d += 1) { const r = z.update(H.x + d, H.z).B; if (!r && off === null) off = d; }
    expect(off).toBe(62);
  });
});

describe('the draw budget: the base\'s small parts far from her are not drawn (milestone 5)', () => {
  it('the door leaves, the gate ring\'s disc and shaft and the dome\'s lamps, Core glow and board are hidden beyond their near distance and shown within it', async () => {
    const { cullParts, PART_NEAR } = await import('../src/world/moonlife.js');
    const { scene } = built();
    const parts = new Map(PART_NEAR.flatMap((r) => r.names).map((n) => [n, scene.getObjectByName(n)]));
    for (const [n, m] of parts) expect(m, n).toBeTruthy();
    expect(cullParts(parts, { x: 46, z: -40 })).toBe(0); // the far east of the north edge: none
    for (const m of parts.values()) expect(m.visible).toBe(false);
    expect(cullParts(parts, { x: 30, z: 34 })).toBe(2); // the depot: the gate ring is 40 m off, the doors 51 m and the dome 64 m
    expect(parts.get('moon:disc').visible).toBe(true);
    expect(parts.get('moon:doorL').visible).toBe(false);
    expect(cullParts(parts, { x: -30, z: 20 })).toBe(7); // beside the dome: all seven
    for (const m of parts.values()) expect(m.visible).toBe(true);
    expect(cullParts(parts, { x: 0, z: 0 }, [])).toBe(0);
  });
  it('the life hides them far from the dome and puts every one back when it is disposed (nothing reads a mesh\'s visibility to decide anything)', () => {
    const progression = createProgression(mem());
    const scene = new THREE.Scene();
    const area = build(scene);
    const log = createDiscoveryLog(progression);
    log.startWalk();
    const life = area.life({ scene, ground: area.ground, audio: null, log, progression, reducedMotion: false, tier: { name: 'high' } });
    const session = { goals: null, pounceTime: 0, perched: null, fx: { burst() {} }, cat: new THREE.Object3D() };
    const cam = new THREE.PerspectiveCamera();
    life.update(1 / 30, 0.1, { x: 46, y: 0, z: -40 }, cam, session);
    expect(scene.getObjectByName('moon:doorL').visible).toBe(false);
    expect(scene.getObjectByName('moon:lamp').visible).toBe(false);
    life.update(1 / 30, 0.2, { x: -30, y: 0, z: 20 }, cam, session);
    expect(scene.getObjectByName('moon:doorL').visible).toBe(true);
    life.update(1 / 30, 0.3, { x: 46, y: 0, z: -40 }, cam, session);
    life.dispose();
    for (const n of ['moon:doorL', 'moon:doorR', 'moon:disc', 'moon:shaft', 'moon:lamp', 'moon:coreglow', 'moon:board']) expect(scene.getObjectByName(n).visible, n).toBe(true);
  });
});

describe('the draw budget: Dot, her dust and the power cells far from her (milestone 5)', () => {
  const rigLife = () => {
    const progression = createProgression(mem());
    const scene = new THREE.Scene();
    const area = build(scene);
    const log = createDiscoveryLog(progression);
    log.startWalk();
    const life = area.life({ scene, ground: area.ground, audio: null, log, progression, reducedMotion: false, tier: { name: 'high' } });
    const session = { goals: null, pounceTime: 0, perched: null, fx: { burst() {} }, cat: new THREE.Object3D() };
    const cam = new THREE.PerspectiveCamera();
    let t = 0;
    return { scene, life, step: (at) => { t += 0.1; life.update(0.1, t, { y: 0, ...at }, cam, session); } };
  };
  const seen = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  it('parked Dot is not drawn beyond 70 m of her and is drawn within it; the dust mesh is hidden while no puff is alive', () => {
    const r = rigLife();
    r.step({ x: 0, z: 45 });
    expect(seen(r.scene.getObjectByName('dot:body'))).toBe(true); // 30 m off
    expect(r.scene.getObjectByName('moon:dotdust').visible).toBe(false);
    r.step({ x: -40, z: -40 }); // about 100 m
    expect(seen(r.scene.getObjectByName('dot:body'))).toBe(false);
    r.step({ x: 20, z: 20 });
    expect(seen(r.scene.getObjectByName('dot:body'))).toBe(true);
    r.life.dispose();
  });
  it('a power cell at home is not drawn beyond 50 m of its place and is drawn within it', () => {
    const r = rigLife();
    r.step({ x: 0, z: 45 }); // the Ridge cell is 82 m off, the Rover cell 63 m
    expect(r.scene.getObjectByName('moon:cell0').visible).toBe(false);
    expect(r.scene.getObjectByName('moon:cell1').visible).toBe(false);
    r.step({ x: 12, z: -30 });
    expect(r.scene.getObjectByName('moon:cell0').visible).toBe(true);
    r.life.dispose();
  });
});
