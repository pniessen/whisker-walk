import { describe, test, expect, vi } from 'vitest';
import * as THREE from 'three';

// Same headless stub every world test uses (copied from test/rivalworld.test.js):
// the only DOM the builders touch is document.createElement('canvas').
vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') {
          return () => ({ addColorStop: () => {} });
        }
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const { build: buildNeigh } = await import('../src/world/neighborhood.js');
const { build: buildPark } = await import('../src/world/park.js');
const { build: buildSea } = await import('../src/world/seaside.js');
const { build: buildDocks } = await import('../src/world/docks.js');
const { build: buildDen, DEN_FIXTURES } = await import('../src/world/den.js');
const { DEN_SPOTS } = await import('../src/den.js');
const { DISCS, patrolPath, borderMarks } = await import('../src/rivalclans.js');
const { isWalkableAt, CAT_RADIUS } = await import('../src/player.js');
const { GOLD_MICE } = await import('../src/goldmice.js');
const { createKnockables } = await import('../src/knockables.js');
const {
  PROP_ID, isPropId, CARRY_KINDS, KNOCK_KINDS, REST_KINDS,
  propsFor, frameColliders, allPropIds,
} = await import('../src/propsets.js');

// Every placement rule below is checked against the REAL built areas: the
// module itself imports nothing, so this file is the only thing that knows
// where a house or a pond actually is.
const BUILD = { neighborhood: buildNeigh, park: buildPark, seaside: buildSea, docks: buildDocks };
const AREAS = Object.keys(BUILD);
const scenes = Object.fromEntries(AREAS.map((a) => [a, new THREE.Scene()]));
const built = Object.fromEntries(AREAS.map((a) => [a, BUILD[a](scenes[a])]));
const den = buildDen(new THREE.Scene(), { placed: {} });

const MARGIN = 0.3;     // the brief's extra clearance for anything a cat walks up to
const CROWD = 2;        // no prop within this of a spawn, gold mouse, collectible, scenic or POI
const MARK_REACH = 1.2; // Task 11's mark prompt reach
const PROMPT_GAP = 2.5; // two walk-up props this far apart never share a prompt (reaches are <= 1.2)
// The contest-band markable never stands on one of the rival's own border
// marks. (It cannot be a full 2.2 m — both prompts' reaches — from all of
// them: the twelve marks are only 2.6 m apart on the docks' 5 m ring.)
const BORDER_GAP = 1.0;

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clearOf = (colliders, p, extra = MARGIN) => colliders.every((c) => dist(p, c) >= c.r + CAT_RADIUS + extra);
const standable = (area, p) => isWalkableAt(area, p.x, p.z) && clearOf(area.colliders, p);
const LISTS = ['carryables', 'knockables', 'markables', 'flaps', 'rests'];
const idsOf = (set) => LISTS.flatMap((k) => set[k].map((p) => p.id));

// Where the cat stands to scratch a markable. A markable's (x, z) is the face
// of the post or trunk the claws reach. A post with no collider is walked
// right up to; a markable inside a collider (a tree trunk) is approached from
// the side it faces — outward from that collider's centre through (x, z) — at
// the brief's clearance. null means there is no honest side to stand on.
function approachOf(area, m) {
  const holding = area.colliders.filter((c) => dist(m, c) < c.r + CAT_RADIUS + MARGIN);
  if (holding.length === 0) return { x: m.x, z: m.z };
  if (holding.length > 1) return null;
  const [c] = holding;
  const d = dist(m, c);
  if (d < 1e-6) return null;
  const out = c.r + CAT_RADIUS + MARGIN + 0.01;
  return { x: c.x + ((m.x - c.x) / d) * out, z: c.z + ((m.z - c.z) / d) * out };
}

// Everything in an area's set that has a position on the floor plan.
function propPoints(set) {
  return [
    ...set.carryables, ...set.knockables, ...set.markables, ...set.rests, ...set.hides,
    ...set.flaps, ...set.flaps.flatMap((f) => frameColliders(f)),
    ...(set.dogYard ? [set.dogYard.kennel] : []),
  ];
}

const anchorsOf = (a) => [
  built[a].spawn, ...GOLD_MICE[a], ...built[a].collectibles, ...built[a].scenics, ...built[a].pois,
];

function expectOutdoorCounts(a) {
  const s = propsFor(a);
  expect(s.carryables).toHaveLength(4);
  expect(s.knockables).toHaveLength(3);
  expect(s.markables).toHaveLength(3);
  expect(s.markables.filter((m) => m.nearBorder === true)).toHaveLength(1);
  expect(s.markables.every((m) => typeof m.nearBorder === 'boolean')).toBe(true);
  expect(s.flaps.map((f) => f.kind).sort()).toEqual(['flap', 'gap']);
  expect(s.rests.map((r) => r.kind).sort()).toEqual([...REST_KINDS].sort());
  expect(s.rests.every((r) => r.mesh === true)).toBe(true);
  expect(s.hides).toHaveLength(3);
  expect(s.dogYard).not.toBeNull();
  expect(s.keepSlots).toEqual([]);
  for (const c of s.carryables) expect(CARRY_KINDS).toContain(c.kind);
  for (const k of s.knockables) expect(KNOCK_KINDS).toContain(k.kind);
  for (const m of s.markables) expect(['post', 'tree', 'bollard']).toContain(m.kind);
  for (const f of s.flaps) expect(f.width).toBeGreaterThan(0);
  return s;
}

describe('the neighborhood', () => {
  test('has the curated counts, with socks and toy mice to carry', () => {
    const s = expectOutdoorCounts('neighborhood');
    const kinds = s.carryables.map((c) => c.kind);
    expect(kinds).toContain('sock');
    expect(kinds).toContain('toymouse');
  });
  test('its dog lives in the dog-yard fence that is already there', () => {
    const y = propsFor('neighborhood').dogYard;
    expect({ x: y.x, z: y.z, r: y.r }).toEqual({ x: 22, z: -24, r: 4 });
    // The fence runs x 18..26, z -28..-20: the kennel is inside it.
    expect(y.kennel.x).toBeGreaterThan(18);
    expect(y.kennel.x).toBeLessThan(26);
    expect(y.kennel.z).toBeGreaterThan(-28);
    expect(y.kennel.z).toBeLessThan(-20);
  });
});

describe('the park', () => {
  test('has the curated counts, with sticks and pinecones to carry', () => {
    const s = expectOutdoorCounts('park');
    const kinds = s.carryables.map((c) => c.kind);
    expect(kinds).toContain('stick');
    expect(kinds).toContain('pinecone');
  });
});

describe('the seaside', () => {
  test('has the curated counts, with shells and driftwood to carry', () => {
    const s = expectOutdoorCounts('seaside');
    const kinds = s.carryables.map((c) => c.kind);
    expect(kinds).toContain('shell');
    expect(kinds).toContain('driftwood');
  });
});

describe('the docks', () => {
  test('has the curated counts, with rope and caps to carry', () => {
    const s = expectOutdoorCounts('docks');
    const kinds = s.carryables.map((c) => c.kind);
    expect(kinds).toContain('rope');
    expect(kinds).toContain('cap');
  });
  test('its dog is where the critter dog has always been', () => {
    const y = propsFor('docks').dogYard;
    expect({ x: y.x, z: y.z }).toEqual({ x: 30, z: 20 });
  });
});

test.each(AREAS)('%s: every id is unique, well-formed and namespaced by area', (a) => {
  const s = propsFor(a);
  const all = allPropIds();
  for (const list of LISTS) {
    const byKind = {};
    for (const p of s[list]) {
      expect(isPropId(p.id), p.id).toBe(true);
      expect(p.id.startsWith(`${a}-`), p.id).toBe(true);
      const [, kind, n] = p.id.split('-');
      expect(kind, p.id).toBe(p.kind);
      (byKind[kind] ??= []).push(Number(n));
      expect(all.has(p.id), p.id).toBe(true);
    }
    // Numbered from 1 with no holes, per kind, so the next prop of a kind has
    // an obvious id and none is ever reused.
    for (const ns of Object.values(byKind)) {
      expect([...ns].sort((x, y) => x - y)).toEqual(ns.map((_, i) => i + 1));
    }
  }
  // No repeats anywhere: across lists, areas and the den.
  const everywhere = [...AREAS, 'den'].flatMap((x) => idsOf(propsFor(x)));
  expect(new Set(everywhere).size).toBe(everywhere.length);
  expect([...all].sort()).toEqual([...everywhere].sort());
});

test.each(AREAS)('%s: walk-up props stand on walkable ground clear of colliders and water', (a) => {
  const area = built[a];
  const s = propsFor(a);
  const walkUps = [
    ...s.carryables.map((p) => ({ what: p.id, p })),
    ...s.rests.filter((r) => r.mesh).map((p) => ({ what: p.id, p })),
    ...s.hides.map((p, i) => ({ what: `hide ${i}`, p })),
    ...s.markables.map((m) => ({ what: m.id, p: approachOf(area, m), m })),
    { what: 'kennel', p: s.dogYard.kennel },
  ];
  for (const { what, p, m } of walkUps) {
    expect(p, `${what} has no side to stand on`).not.toBeNull();
    expect(standable(area, p), `${what} at ${p.x},${p.z}`).toBe(true);
    if (m) expect(dist(p, m), `${what} approach reach`).toBeLessThanOrEqual(MARK_REACH);
  }
  // Nothing a cat walks up to shares a prompt with anything else it walks up to.
  const prompts = walkUps.filter((w) => !w.what.startsWith('hide'));
  for (let i = 0; i < prompts.length; i++) {
    for (let j = i + 1; j < prompts.length; j++) {
      expect(dist(prompts[i].p, prompts[j].p), `${prompts[i].what} vs ${prompts[j].what}`)
        .toBeGreaterThanOrEqual(PROMPT_GAP);
    }
  }
});

test.each(AREAS)('%s: no prop crowds the spawn, a gold mouse, a collectible, a scenic or a POI', (a) => {
  const anchors = anchorsOf(a);
  for (const p of propPoints(propsFor(a))) {
    for (const q of anchors) {
      expect(dist(p, q), `${p.id ?? 'prop'} at ${p.x},${p.z} vs ${q.id ?? 'anchor'} at ${q.x},${q.z}`)
        .toBeGreaterThanOrEqual(CROWD);
    }
  }
});

test.each(AREAS)('%s: nothing but the nearBorder markable is inside or on a rival disc', (a) => {
  const d = { x: DISCS[a].cx, z: DISCS[a].cz, r: DISCS[a].r };
  const s = propsFor(a);
  const [border] = s.markables.filter((m) => m.nearBorder);
  const others = [
    ...propPoints(s).filter((p) => p !== border),
    ...s.knockables.map((k) => k.fallTo),
  ];
  for (const p of others) {
    expect(dist(p, d) - (p.r ?? 0), `${p.id ?? 'prop'} at ${p.x},${p.z}`).toBeGreaterThan(d.r);
  }
  // The contest band (Task 12's CONTEST_REACH), on ground the patrol cat and
  // the player can both stand on...
  expect(Math.abs(dist(border, d) - d.r)).toBeLessThanOrEqual(1.5);
  expect(isWalkableAt(built[a], border.x, border.z)).toBe(true);
  // ...and not on top of one of the rival's own border marks.
  for (const bm of borderMarks(a)) expect(dist(border, bm)).toBeGreaterThanOrEqual(BORDER_GAP);
});

test.each(AREAS)('%s: each knockable sits on a real perch and falls onto walkable ground', (a) => {
  const area = built[a];
  const s = propsFor(a);
  for (const k of s.knockables) {
    // A perch every cat can climb: an ability-gated perch would hide the
    // knock behind Sure Claws.
    // Never ON the perch point either: a perched cat snaps to that point, so
    // a thing nearer than 0.35 m stands inside the cat (Task 10 review).
    // Perch heights are authored roughly (a bench's sits 4 cm above its seat,
    // the car roof's 7.5 cm below the cabin top), so the height match is
    // loose; the raycast test below pins the thing to the real top face.
    const perch = area.perches.find((p) => !p.requires && dist(p, k) >= 0.35 && dist(p, k) <= 0.6 && Math.abs(p.y - k.y) < 0.1);
    expect(perch, `${k.id} has no perch under it`).toBeDefined();
    for (const p of area.perches) {
      if (Math.abs(p.y - k.y) < 0.3) expect(dist(p, k), `${k.id} stands on a perch point`).toBeGreaterThanOrEqual(0.35);
    }
    expect(k.y).toBeGreaterThan(0);
    expect(isWalkableAt(area, k.fallTo.x, k.fallTo.z), `${k.id} falls onto ${k.fallTo.x},${k.fallTo.z}`).toBe(true);
    const drop = dist(k, k.fallTo);
    expect(drop, k.id).toBeGreaterThanOrEqual(0.6);
    expect(drop, k.id).toBeLessThanOrEqual(1.6);
  }
  // Two things knocked off the same ledge never land in the same spot.
  for (let i = 0; i < s.knockables.length; i++) {
    for (let j = i + 1; j < s.knockables.length; j++) {
      expect(dist(s.knockables[i].fallTo, s.knockables[j].fallTo)).toBeGreaterThanOrEqual(0.5);
    }
  }
});

// Task 10 review: a knockable is the real mesh (knockables.js), so it is
// checked against the real built area by raycasting straight down across its
// whole footprint. Standing, every ray from half a metre above meets the
// ledge's top face exactly at y, and a ray up from it meets nothing: nothing
// hangs in the air, sinks into the ledge, or has something stacked over it. Landed, every ray meets the ground
// exactly at fallTo.y (0 unless the thing lands on a deck or kerb), so the
// landed thing neither floats nor sinks.
test.each(AREAS)('%s: each knockable stands on its ledge\'s real top face and lands on the real ground', (a) => {
  const scene = scenes[a];
  scene.updateMatrixWorld(true);
  const meshes = [];
  scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const rc = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const topAt = (x, z, fromY) => {
    rc.set(new THREE.Vector3(x, fromY, z), down);
    rc.far = fromY + 1;
    return rc.intersectObjects(meshes, false)[0]?.point.y ?? null;
  };
  // Points inside the thing's own (oriented) bounding box, seen from above —
  // not its world-axis box, whose corners overhang a thing turned on a
  // rotated bench.
  const footprint = (group) => {
    group.updateMatrixWorld(true);
    const toLocal = group.matrixWorld.clone().invert();
    const b = new THREE.Box3();
    group.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.computeBoundingBox();
      b.union(o.geometry.boundingBox.clone().applyMatrix4(toLocal.clone().multiply(o.matrixWorld)));
    });
    const pts = [];
    const f = [0.1, 0.5, 0.9];
    for (const fx of f) for (const fy of f) for (const fz of f) {
      const p = new THREE.Vector3(
        b.min.x + (b.max.x - b.min.x) * fx, b.min.y + (b.max.y - b.min.y) * fy, b.min.z + (b.max.z - b.min.z) * fz,
      ).applyMatrix4(group.matrixWorld);
      pts.push([p.x, p.z]);
    }
    return pts;
  };
  const spots = propsFor(a).knockables;
  const ks = createKnockables(new THREE.Scene(), spots);
  for (const e of ks.list) {
    const k = spots.find((s) => s.id === e.id);
    for (const [x, z] of footprint(e.group)) {
      expect(topAt(x, z, k.y + 0.5), `${k.id} standing, at ${x.toFixed(2)},${z.toFixed(2)}`).toBeCloseTo(k.y, 2);
      // ...and nothing over it (a ray that starts inside a stacked crate
      // passes out through its top, so look up from the ledge as well)
      rc.set(new THREE.Vector3(x, k.y + 0.005, z), new THREE.Vector3(0, 1, 0));
      rc.far = 0.5;
      expect(rc.intersectObjects(meshes, false), `${k.id}: something over ${x.toFixed(2)},${z.toFixed(2)}`).toEqual([]);
    }
    ks.knock(e);
    ks.update(5);
    for (const [x, z] of footprint(e.group)) {
      expect(topAt(x, z, 3), `${k.id} landed, at ${x.toFixed(2)},${z.toFixed(2)}`).toBeCloseTo(k.fallTo.y ?? 0, 2);
    }
  }
  ks.dispose();
});

test.each(AREAS)('%s: a flap opening is walkable and its frame is not', (a) => {
  const area = built[a];
  const d = { x: DISCS[a].cx, z: DISCS[a].cz, r: DISCS[a].r };
  const ring = patrolPath(a);
  for (const f of propsFor(a).flaps) {
    const frame = frameColliders(f);
    expect(frame.length, f.id).toBeGreaterThan(0);
    const withFrame = { ...area, colliders: [...area.colliders, ...frame] };
    expect(isWalkableAt(withFrame, f.x, f.z), `${f.id} opening`).toBe(true);
    // ...from both sides: a metre either way across the frame's line.
    const nx = Math.sin(f.rotY);
    const nz = Math.cos(f.rotY);
    for (const side of [-1, 1]) {
      expect(isWalkableAt(withFrame, f.x + nx * side, f.z + nz * side), `${f.id} side ${side}`).toBe(true);
    }
    for (const c of frame) {
      // The frame itself blocks...
      expect(isWalkableAt(withFrame, c.x, c.z)).toBe(false);
      // ...without touching anything already built, the rival's land or its patrol.
      for (const o of area.colliders) {
        expect(dist(c, o), `${f.id} frame overlaps a collider at ${o.x},${o.z}`).toBeGreaterThanOrEqual(c.r + o.r);
      }
      expect(dist(c, d) - c.r, `${f.id} frame crosses the rival disc`).toBeGreaterThan(d.r);
      for (const p of ring) expect(dist(c, p), `${f.id} frame on the patrol ring`).toBeGreaterThanOrEqual(c.r + CAT_RADIUS);
    }
  }
});

// Task 14: a flap's frame (the gate or hedge, end to end, and the opening in
// it) keeps a clear metre from everything a cat walks up to, so no carryable,
// rest, scratch post, landed knockable or prey cover is crowded against or
// inside the gate. Measured from the frame's whole line, out to the end of its
// colliders (width / 2 + 1.5), less the colliders' 0.3 m half-depth.
const FLAP_CLEAR = 1;
test.each(AREAS)('%s: every flap frame keeps a clear metre from the props around it', (a) => {
  const s = propsFor(a);
  const others = [
    ...s.carryables, ...s.rests, ...s.markables,
    ...s.knockables.map((k) => ({ ...k.fallTo, id: `${k.id} (landed)` })),
    ...s.hides.map((h, i) => ({ ...h, id: `hide ${i}` })),
  ];
  for (const f of s.flaps) {
    const ax = Math.cos(f.rotY);
    const az = -Math.sin(f.rotY);
    const reach = f.width / 2 + 1.5;
    for (const p of others) {
      const dx = p.x - f.x;
      const dz = p.z - f.z;
      const along = Math.max(-reach, Math.min(reach, dx * ax + dz * az));
      const gap = Math.hypot(dx - along * ax, dz - along * az) - 0.3;
      expect(gap, `${p.id} at ${p.x},${p.z} crowds ${f.id}`).toBeGreaterThanOrEqual(FLAP_CLEAR);
    }
  }
});

test.each(AREAS)('%s: the dog yard holds no other prop, POI, collectible, scenic, gold mouse or spawn, and is clear of the rival disc by 2 m', (a) => {
  const s = propsFor(a);
  const y = s.dogYard;
  expect(y.r).toBeGreaterThan(0);
  expect(dist(y.kennel, y), 'the kennel is in the yard').toBeLessThan(y.r);
  const others = [
    ...propPoints(s).filter((p) => p !== y.kennel),
    ...s.knockables.map((k) => k.fallTo),
    ...anchorsOf(a),
  ];
  for (const p of others) {
    expect(dist(p, y) - (p.r ?? 0), `${p.id ?? 'prop'} at ${p.x},${p.z}`).toBeGreaterThanOrEqual(y.r);
  }
  const d = DISCS[a];
  expect(Math.hypot(y.x - d.cx, y.z - d.cz)).toBeGreaterThanOrEqual(y.r + d.r + 2);
  // Most of the ring a chased cat is put down on (Task 16: r + 1.5) is ground.
  const landings = Array.from({ length: 16 }, (_, i) => {
    const t = (i / 16) * Math.PI * 2;
    return { x: y.x + Math.cos(t) * (y.r + 1.5), z: y.z + Math.sin(t) * (y.r + 1.5) };
  });
  expect(landings.filter((p) => isWalkableAt(built[a], p.x, p.z)).length).toBeGreaterThanOrEqual(12);
});

test('the den: three rests (drink, eat at the bowls), eight keep slots, nothing else', () => {
  const s = propsFor('den');
  for (const k of ['carryables', 'knockables', 'markables', 'flaps', 'hides']) expect(s[k]).toEqual([]);
  expect(s.dogYard).toBeNull();

  expect(s.rests.map((r) => r.kind).sort()).toEqual([...REST_KINDS].sort());
  for (const r of s.rests) {
    expect(r.id).toBe(`den-${r.kind}-1`);
    expect(r.mesh).toBe(false);
    expect(isWalkableAt(den, r.x, r.z), r.id).toBe(true);
  }
  const bowls = { x: 4.6, z: 6.6 };
  for (const kind of ['drink', 'eat']) {
    expect(dist(s.rests.find((r) => r.kind === kind), bowls)).toBeLessThanOrEqual(0.3);
  }
  // The nap is by a fixture the room already has, which is what mesh:false means.
  const nap = s.rests.find((r) => r.kind === 'nap');
  expect(DEN_FIXTURES.some((f) => dist(nap, f) <= 2.5)).toBe(true);

  expect(s.keepSlots).toHaveLength(8);
  const hearth = DEN_FIXTURES.find((f) => f.id === 'fireplace');
  for (const k of s.keepSlots) {
    expect(Math.abs(k.x)).toBeLessThanOrEqual(8);
    expect(Math.abs(k.z)).toBeLessThanOrEqual(8);
    expect(k.y).toBeGreaterThanOrEqual(0);
    expect(k.y).toBeLessThan(0.05); // on the floor (or the hearthstone on it)
    expect(dist(k, hearth), `${k.x},${k.z} near the hearth`).toBeLessThanOrEqual(3);
    for (const c of den.colliders) expect(dist(k, c)).toBeGreaterThanOrEqual(c.r + 0.15);
    // Clear of every furniture anchor, so nothing the player places buries one.
    for (const spot of DEN_SPOTS) expect(dist(k, spot), spot.id).toBeGreaterThanOrEqual(1.5);
  }
  for (let i = 0; i < 8; i++) {
    for (let j = i + 1; j < 8; j++) expect(dist(s.keepSlots[i], s.keepSlots[j])).toBeGreaterThanOrEqual(0.55);
  }
});

test('propsFor is total and returns fresh copies', () => {
  const KEYS = ['carryables', 'dogYard', 'flaps', 'hides', 'keepSlots', 'knockables', 'markables', 'rests'];
  for (const bad of ['__proto__', 42, null, 'future-area', undefined, 'constructor', {}, 'toString']) {
    const s = propsFor(bad);
    expect(Object.keys(s).sort()).toEqual(KEYS);
    for (const k of KEYS) if (k !== 'dogYard') expect(s[k]).toEqual([]);
    expect(s.dogYard).toBeNull();
  }
  const a = propsFor('park');
  const before = JSON.stringify(a);
  a.carryables[0].x = 999;
  a.carryables.push({ id: 'park-stick-9' });
  a.knockables[0].fallTo.x = 999;
  a.dogYard.kennel.x = 999;
  a.flaps.length = 0;
  expect(JSON.stringify(propsFor('park'))).toBe(before);
  expect(propsFor('park')).not.toBe(propsFor('park'));
  expect(Object.keys(propsFor('park')).sort()).toEqual(KEYS);

  expect(allPropIds()).not.toBe(allPropIds());
  const ids = allPropIds();
  ids.add('park-stick-9');
  expect(allPropIds().has('park-stick-9')).toBe(false);
});

test('the kind lists and the id pattern are the shipped ones, and frozen', () => {
  expect(CARRY_KINDS).toEqual(['sock', 'toymouse', 'leaf', 'stick', 'pinecone', 'acorn', 'shell', 'driftwood', 'cap', 'rope', 'glove', 'ribbon']);
  expect(KNOCK_KINDS).toEqual(['cup', 'flowerpot', 'can', 'book', 'bucket']);
  expect(REST_KINDS).toEqual(['drink', 'eat', 'nap']);
  for (const v of [CARRY_KINDS, KNOCK_KINDS, REST_KINDS, PROP_ID]) expect(Object.isFrozen(v)).toBe(true);
  expect(PROP_ID.source).toBe('^[a-z]{2,12}-[a-z]{2,12}-\\d{1,2}$');
  for (const ok of ['park-stick-1', 'docks-flap-1', 'den-nap-1', 'neighborhood-toymouse-12']) expect(isPropId(ok), ok).toBe(true);
  for (const bad of ['Park-stick-1', 'park-stick', 'park-stick-123', 'p-stick-1', 'park_stick_1', '__proto__', 42, null, undefined, {}, ['park-stick-1']]) {
    expect(isPropId(bad), String(bad)).toBe(false);
  }
});

test('frameColliders leaves the opening clear', () => {
  for (const flap of [
    { x: 0, z: 0, rotY: 0, width: 1 },
    { x: 3, z: -2, rotY: Math.PI / 2, width: 1.2 },
    { x: -5, z: 7, rotY: 0.7, width: 0.8 },
  ]) {
    const frame = frameColliders(flap);
    const ax = Math.cos(flap.rotY);
    const az = -Math.sin(flap.rotY);
    const along = frame.map((c) => (c.x - flap.x) * ax + (c.z - flap.z) * az);
    frame.forEach((c, i) => {
      expect(c.r).toBe(0.3);
      // on the frame's line...
      expect(Math.abs((c.x - flap.x) * az - (c.z - flap.z) * ax)).toBeLessThan(1e-9);
      // ...and no circle reaches into the opening.
      expect(Math.abs(along[i]) - c.r).toBeGreaterThanOrEqual(flap.width / 2 - 1e-9);
    });
    // Both posts, spaced 0.45, out to the frame's ends (total length width + 2.4).
    for (const sign of [-1, 1]) {
      const side = along.filter((s) => Math.sign(s) === sign).map(Math.abs).sort((p, q) => p - q);
      expect(side.length).toBeGreaterThan(1);
      for (let i = 1; i < side.length; i++) expect(side[i] - side[i - 1]).toBeCloseTo(0.45, 9);
      expect(side[side.length - 1] + 0.3).toBeGreaterThanOrEqual((flap.width + 2.4) / 2);
    }
    // The cat fits through the middle.
    expect(isWalkableAt({ colliders: frame }, flap.x, flap.z)).toBe(true);
  }
  for (const bad of [null, undefined, {}, { x: 0, z: 0, rotY: 0 }, { x: NaN, z: 0, rotY: 0, width: 1 }, { x: 0, z: 0, rotY: 0, width: -1 }]) {
    expect(frameColliders(bad)).toEqual([]);
  }
});
