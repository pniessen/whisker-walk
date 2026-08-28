import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { createPlayer, canSwim, SWIM_SPEED } from '../src/player.js';
import { inWater, onDeck, waterClearance, nearestDry } from '../src/world/builder.js';
import { clearSpot } from '../src/world/spots.js';

// ---------------------------------------------------------------------------
// v20 — WATER IS SOLID.
//
// v18's CF-12 descoped Sea Legs because "water becomes traversable at reduced
// speed" described traversal the player already had: no water in this game
// carried a collider, so the ability would have been a pure downgrade. v19
// declared every water body as data (`waters`) and moved the content that sat
// in the drink. This wave makes the water block, so the ability has something
// to open — and this file pins the mechanism.
//
// The two things it has to prove, in order of how badly they hurt when wrong:
//   1. THE CAT NEVER GETS STUCK. Wherever it starts, however it got there, a
//      grounded cat ends its frame on dry land.
//   2. THE CROSSINGS STILL WORK. The seaside pier and the Docks' two bridges
//      are `decks` — dry holes in the water — and the real player must walk
//      them end to end, not just the geometry helpers.
// ---------------------------------------------------------------------------

// One stub serving both halves: createPlayer registers pointer-lock/key
// listeners on `document` at construction (same shape as pounce.test.js's
// withFakeDocument), and the world builders ask it for a canvas (same shape as
// water.test.js's).
vi.stubGlobal('document', {
  addEventListener() {},
  pointerLockElement: null,
  exitPointerLock() {},
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

const { build: buildPark } = await import('../src/world/park.js');
const { build: buildSeaside } = await import('../src/world/seaside.js');
const { build: buildDocks } = await import('../src/world/docks.js');

const AREAS = {
  park: buildPark(new THREE.Scene()),
  seaside: buildSeaside(new THREE.Scene()),
  docks: buildDocks(new THREE.Scene()),
};

const CAT_RADIUS = 0.35;
const PACE = 3.5;
const FRAME = 1 / 60;

// A pond with nothing else near it, so the behavioural tests below measure the
// water pass and not some park collider that happens to be on the same bank.
const POND = { id: 'pond', kind: 'circle', x: 0, z: 0, r: 5 };
const BIG = { minX: -40, maxX: 40, minZ: -40, maxZ: 40 };

function harness() {
  const player = createPlayer(new THREE.PerspectiveCamera(), { addEventListener() {} });
  const cat = new THREE.Object3D();
  player.setAvatar(cat, PACE);
  player.enable();
  return { player, cat };
}

// Drive the cat with the touch stick — the one input path a headless test can
// push without synthesizing key events. A unit vector is full pace, exactly as
// a held arrow key is.
function drive(player, cat, dir, seconds, opts = {}) {
  const { colliders = [], bounds = BIG, waters = [POND], onFrame } = opts;
  player.setTouchMove({ x: dir.x, z: dir.z, mag: 1 });
  for (let t = 0; t < seconds; t += FRAME) {
    player.update(FRAME, colliders, bounds, waters);
    if (onFrame) onFrame(cat.position);
  }
}

// ---------------------------------------------------------------------------
// 1. Blocking
// ---------------------------------------------------------------------------

describe('a cat that cannot swim is stopped at the waterline', () => {
  let player, cat;
  beforeEach(() => { ({ player, cat } = harness()); });
  afterEach(() => player.disable());

  it('walks up to the pond and no further, on every frame of the approach', () => {
    cat.position.set(12, 0, 0);
    const gaps = [];
    drive(player, cat, { x: -1, z: 0 }, 6, { onFrame: (p) => gaps.push(waterClearance([POND], p.x, p.z)) });
    // never wet, not for one frame: the push runs inside the same update that
    // moved the cat, so there is no frame on which it is rendered in the water
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(0);
    // ...and it is held at the edge by exactly CAT_RADIUS, the same margin the
    // collider push holds it off a wall by
    expect(cat.position.x).toBeCloseTo(POND.r + CAT_RADIUS, 6);
    expect(cat.position.z).toBeCloseTo(0, 6);
  });

  it('stands still at the edge instead of buzzing in and out of the shallows', () => {
    // The stand-off is what buys this: eject-on-penetration would leave the
    // cat oscillating 0.35m at the waterline for as long as the key is held.
    cat.position.set(9, 0, 0);
    drive(player, cat, { x: -1, z: 0 }, 3);
    const settled = cat.position.x;
    const xs = [];
    drive(player, cat, { x: -1, z: 0 }, 1, { onFrame: (p) => xs.push(p.x) });
    for (const x of xs) expect(x).toBeCloseTo(settled, 9);
  });

  it('cannot get in by charging it — a zooming cat is stopped in the same place', () => {
    cat.position.set(30, 0, 0);
    drive(player, cat, { x: -1, z: 0 }, 12); // well past the 1.5s zoomies charge
    expect(player.zooming).toBe(true);
    expect(inWater([POND], cat.position.x, cat.position.z)).toBe(false);
    expect(cat.position.x).toBeCloseTo(POND.r + CAT_RADIUS, 6);
  });

  it('cannot pounce into the pond either — the hop is a render offset, not flight', () => {
    cat.position.set(6, 0, 0);
    player.setTouchMove({ x: -1, z: 0, mag: 1 });
    player.update(FRAME, [], BIG, [POND]);
    player.pounce();
    for (let i = 0; i < 40; i++) {
      player.update(FRAME, [], BIG, [POND]);
      expect(inWater([POND], cat.position.x, cat.position.z)).toBe(false);
    }
    expect(player.hopY).toBe(0); // the arc ran and finished
    // pressed against the rim at the stand-off, wherever the lunge carried it
    expect(waterClearance([POND], cat.position.x, cat.position.z)).toBeCloseTo(CAT_RADIUS, 6);
  });

  it('slides along the bank when it walks in at an angle, instead of sticking', () => {
    cat.position.set(9, 0, 0.5);
    drive(player, cat, { x: -0.9, z: 0.44 }, 6);
    expect(inWater([POND], cat.position.x, cat.position.z)).toBe(false);
    // it kept moving around the rim rather than jamming at the point of contact
    expect(cat.position.z).toBeGreaterThan(2);
  });

  it('leaves an area with no water exactly as it was before v20', () => {
    cat.position.set(12, 0, 0);
    drive(player, cat, { x: -1, z: 0 }, 6, { waters: [] });
    expect(cat.position.x).toBeLessThan(-10); // walked clean through where the pond was
    const { player: p2, cat: c2 } = harness();
    c2.position.set(12, 0, 0);
    p2.setTouchMove({ x: -1, z: 0, mag: 1 });
    for (let t = 0; t < 6; t += FRAME) p2.update(FRAME, [], BIG); // the 3-arg call
    expect(c2.position.x).toBeCloseTo(cat.position.x, 6);
    p2.disable();
  });
});

// ---------------------------------------------------------------------------
// 2. The stuck-cat cases. Every one of these is "the cat is ALREADY wet" —
//    which the block above can never produce, but a teleport, a save, a
//    collider shove or a future author can.
// ---------------------------------------------------------------------------

describe('a cat that is already in the water gets out', () => {
  let player, cat;
  beforeEach(() => { ({ player, cat } = harness()); });
  afterEach(() => player.disable());

  it('is on dry land after ONE frame from the dead centre of the pond', () => {
    cat.position.set(0, 0, 0); // dead centre — nearestDry's degenerate case
    player.update(FRAME, [], BIG, [POND]);
    expect(inWater([POND], cat.position.x, cat.position.z)).toBe(false);
    expect(waterClearance([POND], cat.position.x, cat.position.z)).toBeCloseTo(CAT_RADIUS, 6);
  });

  it('gets out with no input at all — the player never has to know what to press', () => {
    cat.position.set(1, 0, 2);
    player.update(0, [], BIG, [POND]); // dt 0: nothing but the pushes run
    expect(inWater([POND], cat.position.x, cat.position.z)).toBe(false);
  });

  it('stays out — the push is a fixed point, not an oscillation', () => {
    cat.position.set(0, 0, 0);
    player.update(FRAME, [], BIG, [POND]);
    const landed = cat.position.clone();
    for (let i = 0; i < 120; i++) player.update(FRAME, [], BIG, [POND]);
    expect(cat.position.x).toBeCloseTo(landed.x, 6);
    expect(cat.position.z).toBeCloseTo(landed.z, 6);
  });

  it('is pulled back out on the same frame a collider shoves it in', () => {
    // A crate on the bank whose push-out direction points at the pond: the
    // collider pass runs first, the water pass second, so the cat never ends a
    // frame wet even though it was mid-frame.
    const crate = { x: 7, z: 0, r: 2 };
    cat.position.set(6.2, 0, 0);
    player.update(0, [crate], BIG, [POND]);
    expect(inWater([POND], cat.position.x, cat.position.z)).toBe(false);
  });

  it('climbs out on the frame it lands, when it hops down off a perch into water', () => {
    // Perched cats are exempt (see below), so the pond only claims the cat
    // once its paws are down — which is the frame perchY goes back to 0.
    cat.position.set(0, 0, 0);
    player.perchY = 1.35;
    player.update(FRAME, [], BIG, [POND]);
    expect(inWater([POND], cat.position.x, cat.position.z)).toBe(true); // still up there
    player.perchY = 0;
    player.update(FRAME, [], BIG, [POND]);
    expect(inWater([POND], cat.position.x, cat.position.z)).toBe(false);
  });

  it('is never left outside the map by its own escape, even with water on the edge', () => {
    // A footprint that covers a whole corner of the bounds: the escape wants
    // to go east, the clamp drags it back west, and the second pass is what
    // stops the two from handing the cat to each other forever.
    const edge = { id: 'edge', kind: 'rect', minX: -40, maxX: -20, minZ: -40, maxZ: 40 };
    const bounds = { minX: -40, maxX: 40, minZ: -40, maxZ: 40 };
    cat.position.set(-38, 0, 0);
    player.update(FRAME, [], bounds, [edge]);
    expect(inWater([edge], cat.position.x, cat.position.z)).toBe(false);
    expect(cat.position.x).toBeGreaterThanOrEqual(bounds.minX);
    expect(cat.position.x).toBeLessThanOrEqual(bounds.maxX);
  });
});

// ---------------------------------------------------------------------------
// 3. Perched cats
// ---------------------------------------------------------------------------

describe('a perched cat is exempt, exactly as it is from the collider push', () => {
  let player, cat;
  beforeEach(() => { ({ player, cat } = harness()); });
  afterEach(() => player.disable());

  it('is not pushed while perchY > 0', () => {
    cat.position.set(0, 0, 0);
    player.perchY = 2.4;
    for (let i = 0; i < 30; i++) player.update(FRAME, [], BIG, [POND]);
    expect(cat.position.x).toBe(0);
    expect(cat.position.z).toBe(0);
  });

  it('is safe because no perch in the game stands in water', () => {
    // The exemption can only strand a cat if an area puts a perch in the
    // drink. water.test.js pins that for the whole perch list; this restates
    // it here so the reason the exemption is safe lives next to the exemption.
    for (const [name, area] of Object.entries(AREAS)) {
      for (const p of area.perches) {
        expect(inWater(area.waters, p.x, p.z), `${name} perch ${p.label ?? ''} at ${p.x},${p.z}`).toBe(false);
      }
    }
  });

  it('still swims/blocks normally once it is back down', () => {
    cat.position.set(0, 0, 0);
    player.perchY = 2.4;
    player.update(FRAME, [], BIG, [POND]);
    player.perchY = 0;
    player.update(FRAME, [], BIG, [POND]);
    expect(inWater([POND], cat.position.x, cat.position.z)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. The Sea Legs capability — wired live, dormant until the catalog has it.
// ---------------------------------------------------------------------------

describe('the swim capability', () => {
  let player, cat;
  beforeEach(() => { ({ player, cat } = harness()); });
  afterEach(() => player.disable());

  it('reads the sea-legs ability off the save, and is off without it', () => {
    // Updated at the v20 reinstatement. This case used to assert the
    // opposite — that even a save NAMING sea-legs could not swim, because
    // the catalog had no such id after the CF-12 descope. The catalog has it
    // now, so both halves of hasSkill's union answer here: the persisted id
    // and the earned feat (5 seaside walks).
    expect(canSwim({ skills: ['sea-legs'] })).toBe(true);
    expect(canSwim({ walks: { seaside: 5 } })).toBe(true);
    // Everything without it still gets solid water, including junk.
    expect(canSwim({ skills: [] })).toBe(false);
    expect(canSwim({ skills: ['big-swat'] })).toBe(false);
    expect(canSwim({ walks: { seaside: 4, park: 99 } })).toBe(false);
    expect(canSwim(null)).toBe(false);
    expect(canSwim(undefined)).toBe(false);
  });

  it('lets a swimming cat cross water the blocked cat bounces off', () => {
    player.setSwim(true);
    cat.position.set(12, 0, 0);
    drive(player, cat, { x: -1, z: 0 }, 12);
    expect(cat.position.x).toBeLessThan(-POND.r); // came out the far side
    expect(inWater([POND], cat.position.x, cat.position.z)).toBe(false);
  });

  it('crosses at SWIM_SPEED, and reports it', () => {
    player.setSwim(true);
    cat.position.set(0, 0, 0);
    drive(player, cat, { x: 0, z: 1 }, 1); // 1s of paddling, still well inside the pond
    expect(player.swimming).toBe(true);
    expect(inWater([POND], cat.position.x, cat.position.z)).toBe(true);
    expect(player.speed).toBeCloseTo(PACE * SWIM_SPEED, 2);
    // and the flag comes back off on dry land, where the cat is quick again
    // (quicker than PACE, in fact: 6s of running is long enough to zoom)
    drive(player, cat, { x: 0, z: 1 }, 6);
    expect(player.swimming).toBe(false);
    expect(player.speed).toBeGreaterThan(PACE);
  });

  it('never lets the cat zoom while swimming — the charge cannot reach full pace', () => {
    player.setSwim(true);
    cat.position.set(0, 0, 0);
    for (let t = 0; t < 8; t += FRAME) {
      // paddle in a circle so it stays in the pond rather than crossing it
      player.setTouchMove({ x: Math.cos(t * 3), z: Math.sin(t * 3), mag: 1 });
      player.update(FRAME, [], BIG, [POND]);
      expect(player.zooming).toBe(false);
    }
  });

  it('is a buff, never a downgrade — swimming the pond beats walking round it', () => {
    // CF-12's rule, measured. Straight across a 10m pond at 0.55 pace costs
    // 18.2 pace-metres; the way round the rim is pi*5 = 15.7m ON TOP of the
    // same 10m of approach, and that is the friendliest possible detour (a
    // circular pond in open ground, no colliders, no fence).
    const across = (POND.r * 2) / SWIM_SPEED;
    const around = POND.r * 2 + Math.PI * POND.r;
    expect(across).toBeLessThan(around);
  });
});

// ---------------------------------------------------------------------------
// 5. The crossings, walked by the real player
// ---------------------------------------------------------------------------

// Place the cat and run one no-time frame: dt 0 moves nothing by velocity, so
// what comes back is the pass's verdict on that exact position.
function settle(player, cat, area, x, z) {
  cat.position.set(x, 0, z);
  player.update(0, area.colliders, area.bounds, area.waters);
  return cat.position;
}

describe('the decks stay walkable end to end', () => {
  let player, cat;
  beforeEach(() => { ({ player, cat } = harness()); });
  afterEach(() => player.disable());

  it('holds the cat on the seaside pier for its whole length', () => {
    const area = AREAS.seaside;
    for (let x = 20; x <= area.bounds.maxX; x += 0.25) {
      for (const z of [-10, -9.2, -10.8]) {
        const p = settle(player, cat, area, x, z);
        expect([p.x, p.z], `pier moved the cat at ${x},${z}`).toEqual([x, z]);
      }
    }
  });

  it('holds the cat on both Docks bridges for their whole length', () => {
    const area = AREAS.docks;
    const lanes = [[0, -1.5, 1.5], [-24, -24.5, -23.5]];
    for (const xs of lanes) {
      for (let z = -8; z <= 8; z += 0.25) {
        for (const x of xs) {
          const p = settle(player, cat, area, x, z);
          expect([p.x, p.z], `bridge moved the cat at ${x},${z}`).toEqual([x, z]);
        }
      }
    }
  });

  it('walks the cat across the Docks canal on the main bridge under real input', () => {
    const area = AREAS.docks;
    cat.position.set(0, 0, -9);
    player.setTouchMove({ x: 0, z: 1, mag: 1 });
    for (let t = 0; t < 8; t += FRAME) {
      player.update(FRAME, area.colliders, area.bounds, area.waters);
      expect(inWater(area.waters, cat.position.x, cat.position.z)).toBe(false);
    }
    expect(cat.position.z).toBeGreaterThan(6.5); // north bank, past the deck
  });

  it('steps a cat that walks off a deck back onto it, not eleven metres to the shore', () => {
    // nearestDry prefers the nearer of "straight out of the footprint" and
    // "onto a deck", which is the whole reason a pier in the middle of the sea
    // is survivable: fall off at x 34 and you are back on the planks, not on
    // the sand at x 24.
    const area = AREAS.seaside;
    const p = settle(player, cat, area, 34, -8.2);
    expect(onDeck(area.waters[0], p.x, p.z)).toBe(true);
    expect(p.x).toBe(34);
  });
});

// ---------------------------------------------------------------------------
// 6. The whole-map sweep. This is the real "never gets stuck" proof: every
//    standable cell of every watered area, run through the actual update.
// ---------------------------------------------------------------------------

describe('every square metre of every watered area', () => {
  let player, cat;
  beforeEach(() => { ({ player, cat } = harness()); });
  afterEach(() => player.disable());

  const STEP = 0.5;

  for (const [name, area] of Object.entries(AREAS)) {
    it(`${name}: a grounded cat never ends a frame in the water, wherever it starts`, () => {
      const b = area.bounds;
      const wet = [];
      for (let x = b.minX; x <= b.maxX; x += STEP) {
        for (let z = b.minZ; z <= b.maxZ; z += STEP) {
          const p = settle(player, cat, area, x, z);
          if (inWater(area.waters, p.x, p.z)) wet.push(`${x},${z} -> ${p.x},${p.z}`);
        }
      }
      expect(wet.slice(0, 5)).toEqual([]);
    });

    it(`${name}: the water pass never pushes the cat deeper into a collider`, () => {
      // The one way this change could make things worse without ever leaving
      // the cat wet: a shoreline push that jams it into a wall. Measured as
      // the worst penetration over the whole map, with the water pass and
      // without — the two must be identical.
      const b = area.bounds;
      const worst = (waters) => {
        let w = 0;
        for (let x = b.minX; x <= b.maxX; x += STEP) {
          for (let z = b.minZ; z <= b.maxZ; z += STEP) {
            cat.position.set(x, 0, z);
            player.update(0, area.colliders, area.bounds, waters);
            for (const c of area.colliders) {
              w = Math.max(w, c.r + CAT_RADIUS - Math.hypot(cat.position.x - c.x, cat.position.z - c.z));
            }
          }
        }
        return w;
      };
      expect(worst(area.waters)).toBeCloseTo(worst([]), 9);
    });
  }
});

// ---------------------------------------------------------------------------
// 6b. Reachability at the margin the GAME enforces.
//
// test/water.test.js proves the dry land is one connected piece and everything
// is reachable, but it asks at the waterline (clearance >= 0). The player is
// actually held 0.35 back from it, so the walkable set is slightly smaller
// than the one that file flood-fills. This re-runs its two load-bearing
// invariants against the stricter predicate, which is the version the running
// game applies — if a future shoreline is ever pinched to under 0.7m, or a
// collectible pushed to within 0.35 of the surf, this is what says so.
// ---------------------------------------------------------------------------

describe('the dry land the player can actually stand on', () => {
  const STEP = 0.5;
  // The three tightest consumers, from water.test.js's GATES table.
  const GATES = { collectible: 1.6, scenic: 3.0, poi: 1.2, tippable: 1.0, box: 0.35 };

  function standableLand(area) {
    const { minX, maxX, minZ, maxZ } = area.bounds;
    const nx = Math.round((maxX - minX) / STEP) + 1;
    const nz = Math.round((maxZ - minZ) / STEP) + 1;
    const at = (i, j) => i * nz + j;
    const open = new Uint8Array(nx * nz);
    const seen = new Uint8Array(nx * nz);
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const x = minX + i * STEP, z = minZ + j * STEP;
        const clear = area.colliders.every((c) => Math.hypot(x - c.x, z - c.z) >= c.r + CAT_RADIUS);
        open[at(i, j)] = clear && waterClearance(area.waters, x, z) >= CAT_RADIUS ? 1 : 0;
      }
    }
    const stack = [];
    const si = Math.round((area.spawn.x - minX) / STEP);
    const sj = Math.round((area.spawn.z - minZ) / STEP);
    if (open[at(si, sj)]) { seen[at(si, sj)] = 1; stack.push([si, sj]); }
    while (stack.length) {
      const [i, j] = stack.pop();
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
        if (open[at(a, b)] && !seen[at(a, b)]) { seen[at(a, b)] = 1; stack.push([a, b]); }
      }
    }
    return {
      spawnIsDry: open[at(si, sj)] === 1,
      orphans: open.reduce((s, v) => s + v, 0) - seen.reduce((s, v) => s + v, 0),
      walkableTo(x, z, range) {
        const span = Math.ceil(range / STEP);
        const ci = Math.round((x - minX) / STEP);
        const cj = Math.round((z - minZ) / STEP);
        for (let i = ci - span; i <= ci + span; i++) {
          for (let j = cj - span; j <= cj + span; j++) {
            if (i < 0 || j < 0 || i >= nx || j >= nz || !seen[at(i, j)]) continue;
            if (Math.hypot(minX + i * STEP - x, minZ + j * STEP - z) <= range) return true;
          }
        }
        return false;
      },
    };
  }

  for (const [name, area] of Object.entries(AREAS)) {
    it(`${name}: is still one piece, and still joins the spawn to everything`, () => {
      const land = standableLand(area);
      expect(land.spawnIsDry).toBe(true);
      expect(land.orphans).toBe(0);
      const targets = [
        ...area.pois.map((p) => [clearSpot(p, area.colliders, area.bounds, area.waters), GATES.poi]),
        ...area.collectibles.filter((c) => !c.y).map((c) => [c, GATES.collectible]),
        ...area.scenics.map((s) => [s, GATES.scenic]),
        ...area.tippables.map((t) => [t, GATES.tippable]),
        ...area.boxes.map((b) => [b, GATES.box]),
        // the ground-tier perches, whose first step a GROUNDED cat takes:
        // stranding one strands the elevated collectibles and golden mice on
        // top of it too (climbing.test.js BFSes the rest of each chain)
        ...area.perches.filter((p) => p.y <= 1.6).map((p) => [p, (p.y > 1 ? 2.6 : 1.2) - 0.05]),
      ];
      for (const [o, range] of targets) {
        expect(land.walkableTo(o.x, o.z, range), `(${o.x},${o.z}) is cut off`).toBe(true);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 7. clearSpot's water pass — the guard rail on POI-derived race and quest
//    targets. v19 relocated the content that needed it; this stops a future
//    author from putting it back.
// ---------------------------------------------------------------------------

describe('clearSpot understands water', () => {
  const pond = { id: 'p', kind: 'circle', x: 0, z: 0, r: 5 };
  const band = {
    id: 'b', kind: 'rect', minX: -20, maxX: 20, minZ: -3, maxZ: 3,
    decks: [{ minX: -1, maxX: 1, minZ: -6, maxZ: 6 }],
  };

  it('pushes a spot out of a pond by the full ring clearance', () => {
    const p = clearSpot({ x: 1, z: 0 }, [], null, [pond]);
    expect(waterClearance([pond], p.x, p.z)).toBeCloseTo(1.6, 6);
  });

  it('prefers a deck when the deck is nearer, like nearestDry does', () => {
    const p = clearSpot({ x: 1.4, z: 0 }, [], null, [band]);
    expect(onDeck(band, p.x, p.z)).toBe(true);
  });

  it('leaves a spot already on a deck exactly where it is', () => {
    expect(clearSpot({ x: 0, z: 0, label: 'bridge' }, [], null, [band]))
      .toEqual({ x: 0, z: 0, label: 'bridge' });
  });

  it('relaxes water against colliders instead of picking one and stopping', () => {
    // A collider sitting on the near bank: the water push wants east, the
    // collider push wants away from it, and the answer has to satisfy both.
    const wall = { x: 6.5, z: 0, r: 2 };
    const p = clearSpot({ x: 2, z: 0 }, [wall], null, [pond]);
    expect(inWater([pond], p.x, p.z)).toBe(false);
    expect(Math.hypot(p.x - wall.x, p.z - wall.z)).toBeGreaterThanOrEqual(wall.r + 1.6 - 1e-9);
  });

  it('is still pure and deterministic with water in play', () => {
    const a = clearSpot({ x: 0, z: 0 }, [], null, [pond]);
    const b = clearSpot({ x: 0, z: 0 }, [], null, [pond]);
    expect(a).toEqual(b);
  });

  it('is a no-op for every area that has no water, and for a missing list', () => {
    const walls = [{ x: 0, z: 0, r: 2 }];
    expect(clearSpot({ x: 1, z: 0 }, walls, null, [])).toEqual(clearSpot({ x: 1, z: 0 }, walls));
    expect(clearSpot({ x: 1, z: 0 }, walls, null, undefined)).toEqual(clearSpot({ x: 1, z: 0 }, walls));
  });

  it('moves not one shipped POI — v19 already relocated the only one it would have', () => {
    for (const [name, area] of Object.entries(AREAS)) {
      for (const poi of area.pois) {
        const before = clearSpot(poi, area.colliders, area.bounds);
        const after = clearSpot(poi, area.colliders, area.bounds, area.waters);
        expect(after, `${name} poi ${poi.x},${poi.z}`).toEqual(before);
        expect(inWater(area.waters, after.x, after.z)).toBe(false);
      }
    }
  });

  it('would have saved the v19 pond-centre POI, had it still been there', () => {
    // The counterfactual, as a passing test: the bug CF-12 called out was a
    // race ring on the exact centre of the park pond.
    const area = AREAS.park;
    const p = clearSpot({ x: -14, z: 2 }, area.colliders, area.bounds, area.waters);
    expect(inWater(area.waters, p.x, p.z)).toBe(false);
    expect(waterClearance(area.waters, p.x, p.z)).toBeGreaterThanOrEqual(1.6 - 1e-9);
  });
});

// ---------------------------------------------------------------------------
// 8. The seaside's in-sea strip — the one place the map visibly loses ground.
// ---------------------------------------------------------------------------

describe("the seaside's eleven metres of walkable sea", () => {
  let player, cat;
  beforeEach(() => { ({ player, cat } = harness()); });
  afterEach(() => player.disable());

  const area = AREAS.seaside;

  it('was walkable only because water was not solid, and is now the pier or nothing', () => {
    // bounds.maxX is 36 and the sea starts at x 25, so 11m of the walkable
    // rectangle is open water. Nothing the player must reach was ever out
    // there (water.test.js pins that for every list), and the pier crosses the
    // whole strip — so what is lost is empty sea the cat could stand on.
    expect(area.bounds.maxX - area.waters[0].minX).toBe(11);
    const p = settle(player, cat, area, 30, 0);
    expect(p.x).toBeCloseTo(25 - CAT_RADIUS, 6); // put back on the sand
    expect(settle(player, cat, area, 30, -10).x).toBe(30); // unless it is on the pier
  });

  it('still reaches the far bounds edge, along the pier', () => {
    cat.position.set(20, 0, -10);
    player.setTouchMove({ x: 1, z: 0, mag: 1 });
    for (let t = 0; t < 12; t += FRAME) {
      player.update(FRAME, area.colliders, area.bounds, area.waters);
      expect(inWater(area.waters, cat.position.x, cat.position.z)).toBe(false);
    }
    expect(cat.position.x).toBeCloseTo(area.bounds.maxX, 6);
  });
});

// ---------------------------------------------------------------------------
// 9. What the Sea Legs agent inherits.
// ---------------------------------------------------------------------------

describe('the wiring the Sea Legs catalog entry activates', () => {
  // v20 UPDATE: the catalog entry now EXISTS, so these no longer simulate
  // what hasSkill "will" return — they drive the real save→canSwim→setSwim
  // →update path with real save objects. This is the CF-10 guard for the
  // wave: the swim branch was fully built and had never once been exercised
  // through the ability that gates it.
  //
  // NON_SWIMMER / SWIMMER are ordinary save shapes, not stubs. The swimmer
  // earns it the retroactive way (a lifetime walks.seaside tally), which is
  // the path an existing player actually arrives on.
  const NON_SWIMMER = { walks: { neighborhood: 20, park: 9, seaside: 4, den: 2 } };
  const SWIMMER = { walks: { neighborhood: 20, park: 9, seaside: 5, den: 2 } };

  it('turns on from the save alone, with no further edit to the movement code', () => {
    const { player, cat } = harness();
    // One more seaside walk is the entire difference between these two saves.
    expect(canSwim(NON_SWIMMER)).toBe(false);
    expect(canSwim(SWIMMER)).toBe(true);

    player.setSwim(canSwim(NON_SWIMMER));
    cat.position.set(6, 0, 0);
    player.update(0, [], BIG, [POND]);
    expect(cat.position.x).toBe(6);        // dry land: untouched either way
    cat.position.set(1, 0, 0);
    player.update(0, [], BIG, [POND]);
    expect(cat.position.x).toBeCloseTo(POND.r + CAT_RADIUS, 6); // blocked: pushed out

    player.setSwim(canSwim(SWIMMER));      // the ability, read off a real save
    cat.position.set(1, 0, 0);
    player.update(0, [], BIG, [POND]);
    expect(cat.position.x).toBe(1);        // and the water lets go
    player.disable();
  });

  it('crosses the pond at swim pace for a save that earned it, and bounces for one that did not', () => {
    // End to end, the way walk.js drives it: player.setSwim(canSwim(state))
    // once at walk start, then ordinary movement. Same start, same input,
    // same water — only the save differs.
    const swim = harness();
    swim.player.setSwim(canSwim(SWIMMER));
    swim.cat.position.set(0, 0, 0);
    drive(swim.player, swim.cat, { x: 0, z: 1 }, 1);
    expect(swim.player.swimming).toBe(true);
    expect(inWater([POND], swim.cat.position.x, swim.cat.position.z)).toBe(true);
    expect(swim.player.speed).toBeCloseTo(PACE * SWIM_SPEED, 2);
    // ...and all the way out the far side.
    drive(swim.player, swim.cat, { x: -1, z: 0 }, 12);
    expect(swim.cat.position.x).toBeLessThan(-POND.r);
    swim.player.disable();

    const dry = harness();
    dry.player.setSwim(canSwim(NON_SWIMMER));
    dry.cat.position.set(0, 0, 0);
    drive(dry.player, dry.cat, { x: 0, z: 1 }, 1);
    expect(dry.player.swimming).toBe(false);
    expect(inWater([POND], dry.cat.position.x, dry.cat.position.z)).toBe(false);
    dry.player.disable();
  });

  it('holds in all three watered areas, from the areas real saves walk', () => {
    // Not just the synthetic POND: the park pond, the seaside sea and the
    // Docks canal each let a Sea Legs cat in and each hold a non-swimmer out.
    for (const [name, area] of Object.entries(AREAS)) {
      const wet = area.waters;
      expect(wet.length, `${name} has water`).toBeGreaterThan(0);
      // A point that is genuinely in the drink, found off the area's own map.
      let target = null;
      for (let x = area.bounds.minX; x <= area.bounds.maxX && !target; x += 1) {
        for (let z = area.bounds.minZ; z <= area.bounds.maxZ && !target; z += 1) {
          if (inWater(wet, x, z) && !onDeck(wet, x, z)) target = { x, z };
        }
      }
      expect(target, `${name} has a wet, un-decked cell`).not.toBe(null);

      const swim = harness();
      swim.player.setSwim(canSwim(SWIMMER));
      swim.cat.position.set(target.x, 0, target.z);
      swim.player.update(FRAME, area.colliders, area.bounds, wet);
      expect(inWater(wet, swim.cat.position.x, swim.cat.position.z), `${name} lets a swimmer stay in`).toBe(true);
      swim.player.disable();

      const dry = harness();
      dry.player.setSwim(canSwim(NON_SWIMMER));
      dry.cat.position.set(target.x, 0, target.z);
      dry.player.update(FRAME, area.colliders, area.bounds, wet);
      expect(inWater(wet, dry.cat.position.x, dry.cat.position.z), `${name} ejects a non-swimmer`).toBe(false);
      dry.player.disable();
    }
  });

  it('keeps water bounds-only for everything that is not the player', () => {
    // The ducks paddle in the pond on purpose and the gulls sit on the sea.
    // If this ever fails, water blocking has leaked out of player.update.
    const wetSpawns = Object.entries(AREAS).flatMap(([name, area]) =>
      area.critterSpawns.filter((c) => inWater(area.waters, c.x, c.z)).map((c) => `${name}:${c.type}`));
    expect(wetSpawns.length).toBeGreaterThan(0);
  });
});

// A last sanity check on the helper this whole file leans on, at the exact
// margin the player uses: the escape is never itself wet.
describe('nearestDry at the cat radius', () => {
  it('lands clear of every footprint in every area', () => {
    for (const [name, area] of Object.entries(AREAS)) {
      const b = area.bounds;
      for (let x = b.minX; x <= b.maxX; x += 1) {
        for (let z = b.minZ; z <= b.maxZ; z += 1) {
          if (!inWater(area.waters, x, z)) continue;
          const d = nearestDry(area.waters, x, z, CAT_RADIUS);
          expect(inWater(area.waters, d.x, d.z), `${name} ${x},${z}`).toBe(false);
        }
      }
    }
  });
});
