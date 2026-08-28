import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { inWater, onDeck, waterGap, waterClearance, nearestDry } from '../src/world/builder.js';
import { clearSpot } from '../src/world/spots.js';
import { resolveGifts, GIFT_LEAVE_RANGE } from '../src/gifts.js';
import { GOLD_MICE } from '../src/goldmice.js';
import { mulberry32 } from '../src/rng.js';

// Same headless stub every world test uses: the only DOM the builders touch
// is document.createElement('canvas') for the billboard texture.
vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    // A blanket no-op Proxy is enough for the billboard's canvas, but not for
    // render/textures.js's surface tiles, which the world builders now ask
    // for. Two of their calls need a real answer rather than undefined:
    //   * createLinear/RadialGradient — the painters add colour stops to
    //     whatever comes back;
    //   * getImageData — every tile ends with a getImageData/putImageData
    //     readback (clampToFloor, the pass that GUARANTEES no texel falls
    //     below the luminance floor). clampToFloor does guard the headless
    //     path, but it guards it by asking whether getImageData is a
    //     function, which a blanket Proxy always answers yes to.
    // A zeroed buffer is the truthful answer here: nothing was ever actually
    // rasterised into this canvas.
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
const { createScent } = await import('../src/scent.js');

// ---------------------------------------------------------------------------
// v19 — MAKE WATER REAL, part one: the content pass.
//
// Water in this game has never carried a collider. The park pond, the seaside
// sea and the Docks canal are walk-over surfaces as shipped, which is why a
// POI could sit on the pond's exact centre for four waves without anything
// noticing. A later wave makes water solid and reinstates Sea Legs; this file
// is what makes that flip safe, by pinning — for EVERY area with water, not
// just the one that was authored carefully — the invariants test/docks.test.js
// has held over the canal since v18:
//
//   * nothing the player has to reach is in the water;
//   * the dry land is one connected piece, crossings included.
//
// The footprints come from each area's own `waters` declaration rather than
// from literals here, because that declaration is the artifact the collider
// wave will consume. If it ever stops describing the water actually drawn,
// "the footprint is drawn from the declaration" below is what fails.
// ---------------------------------------------------------------------------

const CAT_RADIUS = 0.35;

// Can the cat physically stand at (x, z)? player.update pushes a GROUNDED cat
// out to collider.r + CAT_RADIUS and clamps it into bounds — the same test the
// running game applies every frame. This is docks.test.js's standable(),
// lifted out so it can be pointed at any area.
function standable(area, x, z) {
  if (x < area.bounds.minX || x > area.bounds.maxX) return false;
  if (z < area.bounds.minZ || z > area.bounds.maxZ) return false;
  return area.colliders.every((c) => Math.hypot(x - c.x, z - c.z) >= c.r + CAT_RADIUS);
}

// ...and the same question asked of a cat that cannot swim: standable AND out
// of the water. This is the predicate the whole file is really about — it is
// what `standable` will MEAN once the collider wave lands.
function dry(area, x, z) {
  return standable(area, x, z) && !inWater(area.waters ?? [], x, z);
}

// Is there anywhere within `range` of (x, z) the cat can stand on dry land?
function dryWithin(area, x, z, range) {
  for (let r = 0; r <= range; r += 0.05) {
    for (let t = 0; t < 64; t++) {
      const th = (t / 64) * Math.PI * 2;
      if (dry(area, x + Math.cos(th) * r, z + Math.sin(th) * r)) return true;
    }
  }
  return false;
}

// Flood-fill the dry standable ground on a 0.5m lattice from the area's spawn
// point, and hand back "is any dry cell within `range` of here joined to the
// spawn by walking?". A ring scan like dryWithin above cannot see this: it
// happily reports a spot as reachable while it sits on an island, which is
// exactly the failure a solid canal, a solid sea or a fenced-off pond would
// introduce. 0.5m resolves every crossing in the game — the narrowest is the
// Docks' plank bridge at 2.2m, five lattice columns across.
const STEP = 0.5;
function dryLand(area) {
  const { minX, maxX, minZ, maxZ } = area.bounds;
  const nx = Math.round((maxX - minX) / STEP) + 1;
  const nz = Math.round((maxZ - minZ) / STEP) + 1;
  const at = (i, j) => i * nz + j;
  const open = new Uint8Array(nx * nz);
  const seen = new Uint8Array(nx * nz);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      open[at(i, j)] = dry(area, minX + i * STEP, minZ + j * STEP) ? 1 : 0;
    }
  }
  const si = Math.round((area.spawn.x - minX) / STEP);
  const sj = Math.round((area.spawn.z - minZ) / STEP);
  const stack = [];
  if (open[at(si, sj)]) {
    seen[at(si, sj)] = 1;
    stack.push([si, sj]);
  }
  while (stack.length) {
    const [i, j] = stack.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
      if (open[at(a, b)] && !seen[at(a, b)]) {
        seen[at(a, b)] = 1;
        stack.push([a, b]);
      }
    }
  }
  return {
    spawnIsDry: open[at(si, sj)] === 1,
    openCells: open.reduce((s, v) => s + v, 0),
    joinedCells: seen.reduce((s, v) => s + v, 0),
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

function buildWith(build) {
  const scene = new THREE.Scene();
  return { scene, area: build(scene) };
}

const WATERED = {
  park: buildWith(buildPark),
  seaside: buildWith(buildSeaside),
  docks: buildWith(buildDocks),
};

// The proximity gate each kind of content is actually consumed through, so a
// relocation is measured against the rule that would have stranded it rather
// than against a number invented here.
//   collectible  1.6  game/interactions.js pickup
//   scenic       3.0  Gift Paws' leave range (tighter than the 4m visit award)
//   POI          1.2  race.js CROSS_DIST, the tightest of the three consumers
//                     (quest completion is 2.0, ring-cross 1.2)
//   tippable     1.0  swat range
//   box          0.35 avatar.js's "if I fits, I sits" — the cat stands ON it
const GATES = { collectible: 1.6, scenic: GIFT_LEAVE_RANGE, poi: 1.2, tippable: 1.0, box: 0.35 };

for (const [name, { scene, area }] of Object.entries(WATERED)) {
  describe(`${name} — nothing the player must reach is in the water`, () => {
    const waters = area.waters ?? [];
    const land = dryLand(area);

    it('declares at least one well-formed water footprint', () => {
      expect(waters.length).toBeGreaterThan(0);
      expect(new Set(waters.map((w) => w.id)).size).toBe(waters.length);
      for (const w of waters) {
        expect(typeof w.id).toBe('string');
        expect(['circle', 'rect']).toContain(w.kind);
        if (w.kind === 'circle') {
          expect(Number.isFinite(w.x) && Number.isFinite(w.z) && w.r > 0).toBe(true);
        } else {
          expect(w.maxX).toBeGreaterThan(w.minX);
          expect(w.maxZ).toBeGreaterThan(w.minZ);
        }
        for (const d of w.decks ?? []) {
          expect(d.maxX).toBeGreaterThan(d.minX);
          expect(d.maxZ).toBeGreaterThan(d.minZ);
        }
      }
    });

    it('draws that footprint from the declaration, so mesh and data cannot drift', () => {
      // The whole point of `waters` is that the collider wave stops reading
      // geometry literals. That only holds while the literals are gone: each
      // builder now derives its water mesh FROM the record, and this is the
      // test that notices if someone puts a hand-typed size back.
      const meshes = scene.children.filter((o) => o.isMesh && o.geometry?.parameters);
      for (const w of waters) {
        const match = meshes.find((m) => {
          const p = m.geometry.parameters;
          if (w.kind === 'circle') {
            return m.geometry.type === 'CircleGeometry' && Math.abs(p.radius - w.r) < 1e-6
              && Math.abs(m.position.x - w.x) < 1e-6 && Math.abs(m.position.z - w.z) < 1e-6;
          }
          if (m.geometry.type !== 'PlaneGeometry') return false;
          const drawn = [p.width, p.height].sort((a, b) => a - b);
          const want = [w.maxX - w.minX, w.maxZ - w.minZ].sort((a, b) => a - b);
          return Math.abs(drawn[0] - want[0]) < 1e-6 && Math.abs(drawn[1] - want[1]) < 1e-6
            && Math.abs(m.position.x - (w.minX + w.maxX) / 2) < 1e-6
            && Math.abs(m.position.z - (w.minZ + w.maxZ) / 2) < 1e-6;
        });
        expect(match, `no mesh matches the declared footprint '${w.id}'`).toBeTruthy();
      }
    });

    it('puts no collectible, golden mouse, scenic, POI, tippable, perch, box, puddle or spawn in it', () => {
      const lists = {
        collectibles: area.collectibles,
        'golden mice': GOLD_MICE[name],
        scenics: area.scenics,
        // pois covers the daily race's five waypoints AND the quest target,
        // both derived from this array and nothing else
        pois: area.pois,
        tippables: area.tippables,
        perches: area.perches,
        boxes: area.boxes,
        puddles: area.puddles,
        spawn: [area.spawn],
      };
      for (const [label, list] of Object.entries(lists)) {
        const wet = (list ?? []).filter((o) => inWater(waters, o.x, o.z));
        expect(wet, `${label} in the water`).toEqual([]);
      }
    });

    it('lands every moment on dry ground, even when the critter comes out of the water', () => {
      // A moment's `from` is a critter's starting point — the park's ducklings
      // paddle out of the pond and the seaside's gull comes in off the sea, so
      // `from` is deliberately allowed to be wet. `x, z` is where the cat is
      // asked to go and watch, and that is not.
      for (const m of area.moments) {
        expect(inWater(waters, m.x, m.z), `moment ${m.id} destination`).toBe(false);
      }
    });

    it('leaves every POI reachable from dry land once cleared', () => {
      // walk.js runs every POI through clearSpot before the race and the
      // quest see it, so that is the position to test.
      for (const poi of area.pois) {
        const p = clearSpot(poi, area.colliders, area.bounds);
        expect(inWater(waters, p.x, p.z), `poi (${poi.x},${poi.z})`).toBe(false);
        expect(dryWithin(area, p.x, p.z, GATES.poi), `poi (${poi.x},${poi.z})`).toBe(true);
      }
    });

    it('leaves every scenic, ground collectible, tippable and box reachable from dry land', () => {
      for (const s of area.scenics) {
        expect(dryWithin(area, s.x, s.z, GATES.scenic), `scenic ${s.id}`).toBe(true);
      }
      for (const c of area.collectibles.filter((c) => !c.y)) {
        expect(dryWithin(area, c.x, c.z, GATES.collectible), `collectible ${c.id}`).toBe(true);
      }
      for (const t of area.tippables) {
        expect(dryWithin(area, t.x, t.z, GATES.tippable), `tippable ${t.x},${t.z}`).toBe(true);
      }
      for (const bx of area.boxes) {
        expect(dryWithin(area, bx.x, bx.z, GATES.box), `box ${bx.x},${bx.z}`).toBe(true);
      }
    });

    it('keeps every climbable first step takeable from dry land', () => {
      // Elevated collectibles and two golden mice a side sit on perches, so a
      // perch stranded across the water strands them with it. Only the steps a
      // GROUNDED cat takes matter here (climbing.test.js BFSes the rest);
      // 1.6 is the baseline climb budget, 1.2 / 2.6 the two reach radii.
      for (const p of area.perches.filter((p) => p.y <= 1.6)) {
        const reach = (p.y > 1 ? 2.6 : 1.2) - 0.05;
        expect(dryWithin(area, p.x, p.z, reach), `perch y${p.y} at ${p.x},${p.z}`).toBe(true);
      }
    });

    it('keeps the dry land in ONE piece, with everything joined to the spawn on foot', () => {
      expect(land.spawnIsDry).toBe(true);
      // no orphaned dry island anywhere on the map
      expect(land.joinedCells).toBe(land.openCells);
      const targets = [
        ...area.pois.map((p) => [clearSpot(p, area.colliders, area.bounds), GATES.poi]),
        ...area.scenics.map((s) => [s, GATES.scenic]),
        ...area.collectibles.filter((c) => !c.y).map((c) => [c, GATES.collectible]),
        ...area.tippables.map((t) => [t, GATES.tippable]),
        ...area.boxes.map((b) => [b, GATES.box]),
      ];
      for (const [o, range] of targets) {
        expect(land.walkableTo(o.x, o.z, range), `(${o.x},${o.z}) is cut off`).toBe(true);
      }
    });

    it('never buries a scent treat in the water', () => {
      // rollTreats scatters +/-4 in x and z independently around two of the
      // area's RAW pois — a radius of up to 5.66, which reaches water from
      // several POIs in every one of these areas. scent.js's keepReachable is
      // what pulls those back onto dry ground.
      const scene2 = { add() {}, remove() {} };
      for (let seed = 0; seed < 200; seed++) {
        for (const tr of createScent(scene2, area, mulberry32(seed)).treats) {
          expect(inWater(waters, tr.x, tr.z), `seed ${seed}: treat at ${tr.x},${tr.z}`).toBe(false);
          expect(standable(area, tr.x, tr.z), `seed ${seed}: treat at ${tr.x},${tr.z}`).toBe(true);
        }
      }
    });
  });
}

// ---------------------------------------------------------------------------
// The two areas the v19 content pass actually moved things in.
// ---------------------------------------------------------------------------
describe('the park pond', () => {
  const { area } = WATERED.park;
  const pond = area.waters.find((w) => w.id === 'pond');

  it('is the 7m circle at (-14, 2) the ducks swim in', () => {
    expect(pond).toEqual({ id: 'pond', kind: 'circle', x: -14, z: 2, r: 7 });
    expect(area.critterSpawns.filter((c) => c.type === 'duck').length).toBeGreaterThan(0);
    for (const d of area.critterSpawns.filter((c) => c.type === 'duck')) {
      expect(inWater(area.waters, d.x, d.z)).toBe(true);
    }
  });

  it('no longer has a POI on its centre — the bug this whole pass exists for', () => {
    // The old (-14, 2) was the pond's exact centre. race.js picks five of
    // these eight and checks ONLY the current ring, with no skip and no
    // timeout, so a ring out in the water stalls the entire daily race.
    expect(area.pois).not.toContainEqual({ x: -14, z: 2 });
    const shore = area.pois.find((p) => p.x === -14);
    expect(shore).toEqual({ x: -14, z: 11 });
    // 2.0 clear of the water, which covers the ring-cross (1.2), quest
    // completion (2.0) and secrets.js's gnome, which hides at a random POI
    // offset by up to +/-1.5 and would otherwise still land in the pond.
    expect(waterGap(pond, shore.x, shore.z)).toBeCloseTo(2.0, 6);
    for (const p of area.pois) {
      expect(waterClearance(area.waters, p.x, p.z)).toBeGreaterThanOrEqual(1.5);
    }
  });

  it('is an island of water, not a wall — the shore is walkable all the way round', () => {
    for (let t = 0; t < 72; t++) {
      const th = (t / 72) * Math.PI * 2;
      const x = pond.x + Math.cos(th) * (pond.r + 0.5);
      const z = pond.z + Math.sin(th) * (pond.r + 0.5);
      expect(dry(area, x, z), `pond shore blocked at ${x.toFixed(1)},${z.toFixed(1)}`).toBe(true);
    }
  });

  it('leaves the fountain alone — its water disc is inside its own collider', () => {
    // The fountain basin is a r-3 collider at (0, 20) and its water cylinder
    // is r 2.2, so the cat has never been able to reach that water. It is
    // deliberately NOT a `waters` entry; adding one would only make the
    // fountain scenic and POI look like they were in the drink.
    expect(area.waters.map((w) => w.id)).toEqual(['pond']);
    expect(area.colliders).toContainEqual({ x: 0, z: 20, r: 3 });
  });
});

describe('the seaside sea, and the pier that crosses it', () => {
  const { area } = WATERED.seaside;
  const sea = area.waters.find((w) => w.id === 'sea');
  const pier = sea.decks[0];

  it('reaches 11m inside the walkable bounds, which is why the pier matters', () => {
    expect(sea.minX).toBe(25);
    expect(area.bounds.maxX).toBe(36);
    expect(area.bounds.maxX - sea.minX).toBe(11);
  });

  it('carries the pier as its one dry deck', () => {
    expect(sea.decks).toHaveLength(1);
    expect(pier).toEqual({ minX: 22, maxX: 46, minZ: -11.5, maxZ: -8.5 });
    // it starts on the sand and ends past the walkable edge, so it is a real
    // crossing rather than a platform marooned in the water
    expect(pier.minX).toBeLessThan(sea.minX);
    expect(pier.maxX).toBeGreaterThan(area.bounds.maxX);
  });

  it('is walkable end to end, from the sand to the far edge of the bounds', () => {
    // The seaside's equivalent of docks.test.js's "dry corridor across the
    // canal at both bridges". Every step of the centreline, and both rails of
    // it, has to be dry standable ground.
    for (let x = 20; x <= area.bounds.maxX; x += 0.25) {
      for (const z of [-10, -9.2, -10.8]) {
        expect(dry(area, x, z), `pier blocked at ${x},${z}`).toBe(true);
      }
    }
    // ...and one step off either rail is open water once it clears the sand
    expect(inWater(area.waters, 30, -8)).toBe(true);
    expect(inWater(area.waters, 30, -12)).toBe(true);
  });

  it('moved fish-1 out of open water onto the deck, keeping its id', () => {
    const fish = area.collectibles.find((c) => c.id === 'fish-1');
    expect(fish).toMatchObject({ x: 33, z: -10.6 });
    expect(onDeck(sea, fish.x, fish.z)).toBe(true);
    // the pickup gate is 1.6 horizontal, and the cat stands right on it
    expect(dry(area, fish.x, fish.z)).toBe(true);
  });

  it('moved the third cardboard box onto the sand, where a cat can sit in it', () => {
    // avatar.js's "if I fits, I sits" needs the cat within 0.35 of the box —
    // i.e. standing on it. The old (30, -6) was five metres out to sea and
    // NOT on the pier, so the award was unwinnable the moment water is solid.
    expect(area.boxes).not.toContainEqual({ x: 30, z: -6 });
    expect(area.boxes).toContainEqual({ x: 23, z: -6 });
    expect(dry(area, 23, -6)).toBe(true);
    expect(waterGap(sea, 23, -6)).toBeCloseTo(2.0, 6);
  });

  it('lets the gulls keep the sea — spawns and moment origins may be wet', () => {
    expect(area.critterSpawns.some((c) => inWater(area.waters, c.x, c.z))).toBe(true);
    const heist = area.moments.find((m) => m.id === 'gull-heist');
    expect(inWater(area.waters, heist.from.x, heist.from.z)).toBe(true);
    expect(inWater(area.waters, heist.x, heist.z)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// THE SAVE-DATA PIN.
//
// state.gifts persists { area, spot } where `spot` is a scenic's id, and
// gifts.js joins those records back onto the area's scenics at the start of
// every walk, SKIPPING any id it cannot resolve. So moving `pier-end` was only
// safe because the id did not move with it: every gift already stashed at the
// old, unreachable spot now resolves to the new one. Renaming or dropping the
// id instead would have deleted those gifts silently.
// ---------------------------------------------------------------------------
describe('pier-end keeps its id, so gifts already stashed there survive the move', () => {
  const { area } = WATERED.seaside;

  it('still ships the id under the same label', () => {
    const s = area.scenics.find((sc) => sc.id === 'pier-end');
    expect(s).toBeTruthy();
    expect(s.label).toBe('the end of the pier');
  });

  it('resolves a save written before the move to the new, reachable position', () => {
    // exactly the shape progression.leaveGift wrote in v18
    const saved = [{ area: 'seaside', spot: 'pier-end' }];
    const [gift] = resolveGifts(saved, area.scenics);
    expect(gift).toBeTruthy();
    expect(gift.spot).toBe('pier-end');
    expect(gift.x).toBe(35.5);
    expect(gift.z).toBe(-10);
    // and the cat can walk to it and pick it up
    expect(dryWithin(area, gift.x, gift.z, GIFT_LEAVE_RANGE)).toBe(true);
    expect(inWater(area.waters, gift.x, gift.z)).toBe(false);
  });

  it('would have thrown the gift away had the id changed', () => {
    // the counterfactual, so the reason the id is load-bearing is written
    // down as a passing test rather than only as a comment
    expect(resolveGifts([{ area: 'seaside', spot: 'pier-tip' }], area.scenics)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The geometry itself.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Paths must not run through water.
//
// Paths carry no collider and are not content, so nothing here ever checked
// where they ran — and the park's winding walk had its bend three metres
// INSIDE the duck pond from the day it was authored. That was invisible for
// as long as water was a walk-over surface, and became a gravel path running
// into a lake the moment the v19 collider wave made water solid.
//
// Found by looking at it, not by this suite, which is why the suite now looks.
//
// It samples the built MESHES rather than a list of vertices the world files
// would have to publish, so it covers every area and every future path with
// no per-area bookkeeping: builder.path tags each one `name === 'path'`, and
// a grid over the mesh's own local bounds, pushed through its world matrix,
// is the actual quad on the ground.
// ---------------------------------------------------------------------------
describe('no path runs through water', () => {
  for (const [name, { scene, area }] of Object.entries(WATERED)) {
    const waters = area.waters ?? [];

    it(`${name} keeps every path clear of every water body`, () => {
      const paths = [];
      scene.traverse((o) => { if (o.name === 'path') paths.push(o); });
      // NOT asserted per-area: the seaside builds its pier and boardwalk
      // locally rather than through b.path, so it legitimately has none. The
      // guard-on-the-guard that stops this suite passing vacuously if
      // builder.path ever drops its tag lives in its own test below.
      expect(waters.length, `${name} declares no water`).toBeGreaterThan(0);

      const wet = [];
      for (const m of paths) {
        m.updateMatrixWorld(true);
        m.geometry.computeBoundingBox();
        const bb = m.geometry.boundingBox;
        const N = 24; // ~12cm along a 3m width, finer than any waterline detail
        for (let i = 0; i <= N; i++) {
          for (let j = 0; j <= N; j++) {
            const p = new THREE.Vector3(
              bb.min.x + (bb.max.x - bb.min.x) * (i / N),
              bb.min.y + (bb.max.y - bb.min.y) * (j / N),
              0,
            ).applyMatrix4(m.matrixWorld);
            if (inWater(waters, p.x, p.z) && !waters.some((w) => onDeck(w, p.x, p.z))) {
              // Name the mesh, not just the point: a bare coordinate leaves
              // the next reader hunting for which call site put it there.
              wet.push(`path@(${m.position.x.toFixed(1)},${m.position.z.toFixed(1)}) wet at (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
            }
          }
        }
      }
      expect(wet.slice(0, 8), `${name} path samples in open water`).toEqual([]);
    });
  }

  // The guard on the guard, once rather than per-area: if builder.path stops
  // tagging its mesh, every sweep above silently finds nothing to check.
  it('builder.path tags its mesh, or the sweep above is vacuous', () => {
    const tagged = [];
    WATERED.park.scene.traverse((o) => { if (o.name === 'path') tagged.push(o); });
    expect(tagged.length).toBeGreaterThan(0);
  });

  // The specific regression, stated as itself so a future reader sees the
  // number rather than inferring it from a generic sweep.
  it('the park bend is east of the pond, not inside it', () => {
    const pond = (WATERED.park.area.waters ?? []).find((w) => w.id === 'pond');
    expect(pond).toBeTruthy();
    const dist = Math.hypot(-4 - pond.x, 4 - pond.z);
    expect(dist).toBeGreaterThan(pond.r + 1.5); // pond edge + half the 3m path
    // and the vertex it replaced would fail that, by a wide margin
    expect(Math.hypot(-14 - pond.x, 6 - pond.z)).toBeLessThan(pond.r);
  });
});

describe('water footprint geometry', () => {
  const circle = { id: 'c', kind: 'circle', x: 0, z: 0, r: 5 };
  const band = {
    id: 'b', kind: 'rect', minX: -20, maxX: 20, minZ: -3, maxZ: 3,
    decks: [{ minX: -1, maxX: 1, minZ: -6, maxZ: 6 }],
  };

  it('measures a circle from its edge, signed', () => {
    expect(waterGap(circle, 0, 0)).toBe(-5);
    expect(waterGap(circle, 7, 0)).toBe(2);
    expect(waterGap(circle, 5, 0)).toBe(0);
  });

  it('measures a rect from its nearest edge, and reports the shallowest way out', () => {
    expect(waterGap(band, 0, 0)).toBe(-3); // the short axis, not the long one
    expect(waterGap(band, 0, 5)).toBe(2);
    expect(waterGap(band, 24, 0)).toBe(4);
    expect(waterGap(band, 23, 7)).toBeCloseTo(5, 6); // diagonal, outside both
  });

  it('treats a deck as dry land', () => {
    expect(inWater([band], 0, 0)).toBe(false); // on the bridge
    expect(inWater([band], 5, 0)).toBe(true);
    expect(onDeck(band, 0, 0)).toBe(true);
    expect(waterClearance([band], 0, 0)).toBe(Infinity);
  });

  it('reports Infinity where there is no water at all', () => {
    expect(waterClearance([], 3, 4)).toBe(Infinity);
    expect(inWater(undefined, 3, 4)).toBe(false);
  });

  it('pushes a point straight out of a circle, and out of a dead centre deterministically', () => {
    const a = nearestDry([circle], 0, 0, 0.6);
    expect(a).toEqual(nearestDry([circle], 0, 0, 0.6));
    expect(a.x).toBeCloseTo(5.6, 6);
    expect(a.z).toBeCloseTo(0, 6);
    const b = nearestDry([circle], 0, 2, 0.6);
    expect(Math.hypot(b.x, b.z)).toBeCloseTo(5.6, 6);
    expect(b.x).toBeCloseTo(0, 6);
  });

  it('takes the deck when the deck is nearer than the shore', () => {
    // 18m along a 20m band: the east end of the water is 2 away, the near
    // bank 3, and the bridge at x 0 all of 18. The shore wins.
    const out = nearestDry([band], 18, 0, 0.6);
    expect(out.x).toBeCloseTo(20.6, 6);
    expect(out.z).toBe(0);
    // 0.5m off the bridge, deep inside the band: the bridge wins by miles.
    const onto = nearestDry([band], 1.5, 0, 0.4);
    expect(onto.x).toBeCloseTo(0.6, 6);
    expect(onto.z).toBe(0);
  });

  it('leaves an already-dry point exactly where it is', () => {
    expect(nearestDry([circle, band], 30, 30, 0.6)).toEqual({ x: 30, z: 30 });
  });
});
