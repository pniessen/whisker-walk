import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { DEN_ITEMS, DEN_SPOTS, DEN_CAMERA_WEDGE, clearsCamera } from '../src/den.js';
import {
  BASE_CLIMB_BUDGET, PERCH_KINDS, SURE_CLAWS_ID,
  canReach, perchKind, visiblePerches,
} from '../src/climbing.js';
import { createProgression } from '../src/progression.js';

// Same headless stub every world test uses (see test/docks.test.js): the only
// DOM the builders touch is document.createElement('canvas'), for the
// billboard texture the den never builds. Must be installed before the world
// module imports.
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

const { build, DEN_FIXTURES } = await import('../src/world/den.js');

// The six pieces and the six anchor ids v17 shipped. Spelled out as literals
// rather than sliced off the live tables: their job is to fail loudly if
// somebody renames or drops one, because every id here is persisted in a real
// save (state.den.owned / state.den.placed) and progression.js's sanitizeDen
// silently discards an id the catalog no longer knows.
const V17_ITEMS = {
  rug: { name: 'Sunbeam Rug', price: 30 },
  cattree: { name: 'Deluxe Cat Tree', price: 60 },
  fishtank: { name: 'Bubbling Fish Tank', price: 45 },
  bed: { name: 'Donut Bed', price: 25 },
  lamp: { name: 'Warm Lamp', price: 20 },
  scratcher: { name: 'Scratching Post', price: 20 },
};
const V17_SPOTS = ['rug-spot', 'corner-a', 'corner-b', 'window', 'shelf', 'center'];

const buildDen = (placed = {}) => build(new THREE.Scene(), { placed });

// The widest collider any catalog piece contributes. Used by the walkability
// proof below, which fills EVERY anchor spot with something this wide.
const WIDEST_R = 0.62;

describe('DEN_ITEMS', () => {
  it('still carries all six v17 pieces, unchanged — the catalog is append-only', () => {
    for (const [id, entry] of Object.entries(V17_ITEMS)) {
      expect(DEN_ITEMS[id], `v17 item ${id} was removed or renamed`).toEqual(entry);
    }
  });

  it('prices every piece on the shipped ladder (15-60 whisker points)', () => {
    for (const [id, item] of Object.entries(DEN_ITEMS)) {
      expect(typeof item.name, id).toBe('string');
      expect(item.name.length, id).toBeGreaterThan(0);
      expect(Number.isInteger(item.price), id).toBe(true);
      expect(item.price, id).toBeGreaterThanOrEqual(15);
      expect(item.price, id).toBeLessThanOrEqual(60);
    }
    // the cat tree stays the statement piece
    const dearest = Math.max(...Object.values(DEN_ITEMS).map((i) => i.price));
    expect(DEN_ITEMS.cattree.price).toBe(dearest);
  });

  it('stays inside progression.js DEN_OWNED_MAX (32) — a save can own the lot', () => {
    expect(Object.keys(DEN_ITEMS).length).toBeLessThanOrEqual(32);
  });

  it('is buyable end to end for every id, new ones included', () => {
    for (const [id, item] of Object.entries(DEN_ITEMS)) {
      const p = createProgression({ getItem: () => null, setItem: () => {} });
      p.state.points = item.price;
      expect(p.buyDenItem(id), id).toBe(true);
      expect(p.state.den.owned, id).toContain(id);
      expect(p.placeDenItem(DEN_SPOTS[0].id, id), id).toBe(true);
    }
  });
});

describe('DEN_SPOTS', () => {
  it('still carries all six v17 anchor ids — placed keys are persisted too', () => {
    const ids = DEN_SPOTS.map((s) => s.id);
    for (const id of V17_SPOTS) expect(ids, `v17 spot ${id} was removed`).toContain(id);
    expect(new Set(ids).size).toBe(DEN_SPOTS.length);
  });

  it('has an anchor for every catalog piece, so nothing is unplaceable', () => {
    expect(DEN_SPOTS.length).toBeGreaterThanOrEqual(Object.keys(DEN_ITEMS).length);
  });

  it('every spot has a numeric position inside the 16x16 room (bounds ±8)', () => {
    for (const spot of DEN_SPOTS) {
      expect(typeof spot.x).toBe('number');
      expect(typeof spot.z).toBe('number');
      expect(Math.abs(spot.x)).toBeLessThanOrEqual(8);
      expect(Math.abs(spot.z)).toBeLessThanOrEqual(8);
    }
  });

  it('every spot is at least 1.5 units clear of the walls', () => {
    for (const spot of DEN_SPOTS) {
      expect(8 - Math.abs(spot.x)).toBeGreaterThanOrEqual(1.5);
      expect(8 - Math.abs(spot.z)).toBeGreaterThanOrEqual(1.5);
    }
  });

  it('every pair of spots is at least 2 units apart', () => {
    for (let i = 0; i < DEN_SPOTS.length; i++) {
      for (let j = i + 1; j < DEN_SPOTS.length; j++) {
        const a = DEN_SPOTS[i];
        const b2 = DEN_SPOTS[j];
        expect(Math.hypot(a.x - b2.x, a.z - b2.z)).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// THE OPEN FOURTH WALL.
//
// The den's south side is a knee-high rail so the follow camera can see in,
// and the volume in front of it has to stay clear for the same reason (see
// DEN_CAMERA_WEDGE). These are the tests that stop a future prop from
// re-closing it: a tall thing in the wedge is exactly as fatal as a wall.
// ---------------------------------------------------------------------------
describe('the camera wedge', () => {
  it('clearsCamera lets anything short through and stops anything tall in the wedge', () => {
    expect(clearsCamera(0, 8, 0.5, 0.4)).toBe(true);   // a rug at the open wall
    expect(clearsCamera(0, 8, 0.5, 1.6)).toBe(false);  // a cat tree there
    expect(clearsCamera(-6, 8.7, 1.1, 1.9)).toBe(true); // the fireplace, off to one side
    expect(clearsCamera(0, 2, 0.5, 1.6)).toBe(true);   // in front of the cat, not behind it
  });

  it('no anchor spot could hold a tall piece inside the wedge', () => {
    const tallest = 1.6; // the cat tree, and any spot may hold it
    for (const spot of DEN_SPOTS) {
      expect(clearsCamera(spot.x, spot.z, WIDEST_R, tallest), spot.id).toBe(true);
    }
  });

  it('no fixed furnishing stands inside the wedge', () => {
    for (const f of DEN_FIXTURES) {
      const r = Math.max(0, ...f.colliders.map((c) => c.r));
      expect(clearsCamera(f.x, f.z, r, f.h), f.id).toBe(true);
    }
  });

  it('leaves the spawn and the camera behind it in the clear', () => {
    const area = buildDen(fullHouse());
    expect(area.spawn).toEqual({ x: 0, z: 4 });
    // the camera lands ~4.4 further +z than the cat (catcam.cameraOffset):
    // that point must still be inside the room's own footprint, not past it
    expect(area.spawn.z + 4.4).toBeLessThan(9);
  });
});

// ---------------------------------------------------------------------------
// SAVES. state.den.placed is live player data: a save written before this
// change must still place its furniture, and an id from a future build must
// not take the room down with it.
// ---------------------------------------------------------------------------
describe('the den world — saves', () => {
  it('builds an empty den (nothing bought yet)', () => {
    const area = buildDen();
    expect(area.name).toBe('Your Den');
    expect(area.bounds).toEqual({ minX: -8, maxX: 8, minZ: -8, maxZ: 8 });
    expect(Array.isArray(area.perches)).toBe(true);
  });

  it('places a v17-only save exactly as it did before: same spots, same colliders', () => {
    const legacy = {
      'rug-spot': 'rug', 'corner-a': 'cattree', 'corner-b': 'fishtank',
      window: 'bed', shelf: 'lamp', center: 'scratcher',
    };
    const area = buildDen(legacy);
    // the three v17 pieces that carry colliders, at their own anchor spots
    for (const [spotId, r] of [['corner-a', 0.5], ['corner-b', 0.5], ['center', 0.3]]) {
      const spot = DEN_SPOTS.find((s) => s.id === spotId);
      expect(
        area.colliders.some((c) => c.x === spot.x && c.z === spot.z && c.r === r),
        spotId,
      ).toBe(true);
    }
    // and the cat tree perch v17 shipped, unchanged
    const tree = DEN_SPOTS.find((s) => s.id === 'corner-a');
    expect(area.perches).toContainEqual({
      x: tree.x, z: tree.z, y: 1.6, kind: 'furniture',
      label: 'top of the cat tree', vantage: true,
    });
  });

  it('drops an id the catalog does not know and builds the rest of the room', () => {
    const empty = buildDen();
    const withGhostId = buildDen({ 'rug-spot': 'jetpack', center: 'cattree' });
    // the unknown id contributed nothing...
    expect(withGhostId.colliders).toHaveLength(empty.colliders.length + 1);
    // ...and the known one beside it still built
    expect(withGhostId.perches.some((p) => p.label === 'top of the cat tree')).toBe(true);
  });

  it('survives a placed record holding a spot id that no longer exists', () => {
    expect(() => buildDen({ 'a-spot-from-the-future': 'rug' })).not.toThrow();
  });

  it('builds every catalog id without throwing, at every anchor spot', () => {
    for (const id of Object.keys(DEN_ITEMS)) {
      for (const spot of DEN_SPOTS) {
        expect(() => buildDen({ [spot.id]: id }), `${id} @ ${spot.id}`).not.toThrow();
      }
    }
  });

  it('is deterministic — two builds of the same save agree on every number', () => {
    const placed = fullHouse();
    const a = buildDen(placed);
    const c = buildDen(placed);
    expect(a.colliders).toEqual(c.colliders);
    expect(a.perches).toEqual(c.perches);
    expect(a.boxes).toEqual(c.boxes);
    expect(a.tippables).toEqual(c.tippables);
  });
});

// One of everything, spread over the anchors, plus the widest piece in every
// leftover spot — the worst case the room ever has to survive.
function fullHouse() {
  const ids = Object.keys(DEN_ITEMS);
  const placed = {};
  DEN_SPOTS.forEach((spot, i) => { placed[spot.id] = ids[i % ids.length]; });
  return placed;
}

describe('the den world — the room', () => {
  const area = buildDen(fullHouse());

  it('declares no water of any kind', () => {
    expect(area.puddles).toEqual([]);
    expect(area.waters).toBeUndefined();
  });

  // v1.2: the hemisphere fill's ground term (game/walk.js). Indoors it is
  // doing something slightly different from the outdoor areas — there is no
  // sky over the den — so what it really buys is warm timber light under the
  // furniture, which is most of what makes a room read as a room. The den is
  // also the one area walk.js builds down a different code path, so a missing
  // bounce here would fall through to the default and go unnoticed.
  it('bounces its own floorboards', () => {
    expect(area.groundBounce).toBe(0x9a7048);
  });

  it('has no POIs, collectibles or scenics — the den is not a walk area', () => {
    expect(area.pois).toEqual([]);
    expect(area.collectibles).toEqual([]);
    expect(area.scenics).toEqual([]);
    expect(area.critterSpawns).toEqual([]);
  });

  it('ships tippables, all indoor kinds and all clear of the anchor spots', () => {
    expect(area.tippables.length).toBeGreaterThanOrEqual(3);
    for (const t of area.tippables) {
      expect(['bin', 'pot', 'can']).toContain(t.kind);
      expect(Math.abs(t.x)).toBeLessThanOrEqual(8);
      expect(Math.abs(t.z)).toBeLessThanOrEqual(8);
      for (const spot of DEN_SPOTS) {
        expect(Math.hypot(t.x - spot.x, t.z - spot.z), `${t.kind} vs ${spot.id}`)
          .toBeGreaterThanOrEqual(1.5);
      }
    }
  });

  it('ships more than one hide spot, and a bought tunnel adds another', () => {
    const base = buildDen();
    expect(base.boxes.length).toBeGreaterThanOrEqual(2);
    // avatar.js keys "if I fits, I sits" on the boxes ARRAY INDEX, so the
    // fixed ones must stay first and in order when a tunnel is bought
    const withTunnel = buildDen({ center: 'tunnel' });
    expect(withTunnel.boxes.slice(0, base.boxes.length)).toEqual(base.boxes);
    expect(withTunnel.boxes).toContainEqual({ x: 0, z: 0 });
  });

  it('gives every collider a finite centre and a positive radius', () => {
    for (const c of area.colliders) {
      expect(Number.isFinite(c.x) && Number.isFinite(c.z)).toBe(true);
      expect(c.r).toBeGreaterThan(0);
      expect(c.r).toBeLessThanOrEqual(WIDEST_R);
    }
  });
});

// ---------------------------------------------------------------------------
// PERCHES.
// ---------------------------------------------------------------------------
describe('the den world — perches', () => {
  const area = buildDen(fullHouse());
  const withClaws = { skills: [SURE_CLAWS_ID] };

  it('gives every perch a kind from the closed vocabulary and a sane height', () => {
    for (const p of area.perches) {
      expect(PERCH_KINDS, `${p.label ?? p.y}`).toContain(p.kind);
      expect(perchKind(p)).toBe(p.kind); // i.e. none of them normalise to 'prop'
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThanOrEqual(2.0);
    }
  });

  it('keeps every perch inside bounds — a perched cat is clamped like any other', () => {
    // player.js clamps x/z to bounds AFTER interactions.js writes the perch
    // position, so a perch outside the box leaves the cat hovering beside it.
    for (const p of area.perches) {
      expect(Math.abs(p.x), `perch ${p.label ?? p.y}`).toBeLessThanOrEqual(8);
      expect(Math.abs(p.z), `perch ${p.label ?? p.y}`).toBeLessThanOrEqual(8);
    }
  });

  it('labels every vantage perch and leaves every gated one unlabelled', () => {
    for (const p of area.perches) {
      if (p.vantage) {
        expect(typeof p.label, 'a vantage perch needs a label to log').toBe('string');
        expect(p.requires, 'a gated perch must never be a vantage').toBeUndefined();
      }
      if (p.requires) {
        expect(p.requires).toBe(SURE_CLAWS_ID);
        expect(p.label).toBeUndefined();
        expect(p.vantage).toBeUndefined();
      }
    }
    const labels = area.perches.filter((p) => p.label).map((p) => p.label);
    expect(new Set(labels).size, 'vantage labels are award keys — keep them unique')
      .toBe(labels.length);
  });

  it('hides every gated perch from a cat without Sure Claws, and shows them with it', () => {
    const gated = area.perches.filter((p) => p.requires);
    expect(gated.length).toBeGreaterThan(0);
    const without = visiblePerches(area.perches, null);
    expect(without).toHaveLength(area.perches.length - gated.length);
    for (const p of gated) expect(without).not.toContain(p);
    expect(visiblePerches(area.perches, withClaws)).toHaveLength(area.perches.length);
  });

  it('ships the fixed perches an empty den has, gated ones included', () => {
    const empty = buildDen();
    const labels = empty.perches.filter((p) => p.label).map((p) => p.label).sort();
    expect(labels).toEqual(['sunny windowsill', 'top of the bookcase']);
    expect(empty.perches.filter((p) => p.requires)).toHaveLength(1); // the mantel
  });

  // The chain: the bookcase top is deliberately above the 1.6 climb budget,
  // so it is only reachable via the wall ledge. If either height moves this
  // fails, which is the point.
  it('puts the bookcase top out of reach from the floor and in reach from the ledge', () => {
    const empty = buildDen();
    const ledge = empty.perches.find((p) => p.y === 1.1 && !p.label);
    const top = empty.perches.find((p) => p.label === 'top of the bookcase');
    expect(ledge && top).toBeTruthy();
    // standing on the floor right under the bookcase: the top is not reachable
    expect(canReach(top, { x: top.x + 0.5, z: top.z }, 0, BASE_CLIMB_BUDGET)).toBe(false);
    // the ledge is
    expect(canReach(ledge, { x: ledge.x + 0.4, z: ledge.z + 0.3 }, 0, BASE_CLIMB_BUDGET)).toBe(true);
    // and from the ledge, so is the top
    expect(canReach(top, { x: ledge.x, z: ledge.z }, ledge.y, BASE_CLIMB_BUDGET)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// WALKABILITY.
//
// The den is 16x16 with up to twelve pieces of furniture in it — far tighter
// than any outdoor area — so reachability is proved by flood fill from the
// spawn rather than by a ring scan, which happily reports a spot as reachable
// while it sits behind a wall of colliders. Same shape as the flood fill in
// test/water.test.js, at a finer step for a much smaller room.
// ---------------------------------------------------------------------------
const CAT_RADIUS = 0.35;
const STEP = 0.25;

function standable(area, x, z) {
  if (x < area.bounds.minX || x > area.bounds.maxX) return false;
  if (z < area.bounds.minZ || z > area.bounds.maxZ) return false;
  return area.colliders.every((c) => Math.hypot(x - c.x, z - c.z) >= c.r + CAT_RADIUS);
}

function walkable(area) {
  const { minX, maxX, minZ, maxZ } = area.bounds;
  const nx = Math.round((maxX - minX) / STEP) + 1;
  const nz = Math.round((maxZ - minZ) / STEP) + 1;
  const at = (i, j) => i * nz + j;
  const open = new Uint8Array(nx * nz);
  const seen = new Uint8Array(nx * nz);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      open[at(i, j)] = standable(area, minX + i * STEP, minZ + j * STEP) ? 1 : 0;
    }
  }
  const stack = [];
  const si = Math.round((area.spawn.x - minX) / STEP);
  const sj = Math.round((area.spawn.z - minZ) / STEP);
  if (open[at(si, sj)]) { seen[at(si, sj)] = 1; stack.push([si, sj]); }
  while (stack.length) {
    const [i, j] = stack.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, c = j + dj;
      if (a < 0 || c < 0 || a >= nx || c >= nz) continue;
      if (open[at(a, c)] && !seen[at(a, c)]) { seen[at(a, c)] = 1; stack.push([a, c]); }
    }
  }
  return {
    spawnOpen: open[at(si, sj)] === 1,
    open: open.reduce((s, v) => s + v, 0),
    joined: seen.reduce((s, v) => s + v, 0),
    // is anywhere within `range` of (x, z) both standable and joined to spawn?
    reaches(x, z, range) {
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

describe('the den world — the cat can still walk around it', () => {
  for (const [name, placed] of [
    ['empty', {}],
    ['a v17 save', { 'corner-a': 'cattree', 'corner-b': 'fishtank', center: 'scratcher' }],
    ['every anchor filled', fullHouse()],
    ['every anchor holding the widest piece there is', Object.fromEntries(
      DEN_SPOTS.map((s) => [s.id, 'dresser']),
    )],
  ]) {
    describe(name, () => {
      const area = buildDen(placed);
      const nav = walkable(area);

      it('has a standable spawn', () => {
        expect(nav.spawnOpen).toBe(true);
      });

      it('leaves the floor one connected piece — no walled-off pockets of note', () => {
        // a few cells can legitimately be stranded in a corner behind a prop;
        // losing a tenth of the room to them would not be legitimate.
        expect(nav.joined / nav.open).toBeGreaterThan(0.9);
      });

      it('leaves every anchor spot approachable from the spawn', () => {
        for (const spot of DEN_SPOTS) {
          // 1.4 = the widest collider (0.62) + the cat's radius (0.35) with
          // room to spare: the cat has to be able to get NEXT TO its furniture
          expect(nav.reaches(spot.x, spot.z, 1.4), `${name}: ${spot.id}`).toBe(true);
        }
      });

      it('leaves every tippable and every hide spot approachable', () => {
        for (const t of area.tippables) {
          expect(nav.reaches(t.x, t.z, 1.3), `${name}: tippable ${t.kind}`).toBe(true);
        }
        for (const bx of area.boxes) {
          expect(nav.reaches(bx.x, bx.z, 0.3), `${name}: box ${bx.x},${bx.z}`).toBe(true);
        }
      });

      it('leaves every visible perch climbable from somewhere the cat can stand', () => {
        for (const p of visiblePerches(area.perches, { skills: [SURE_CLAWS_ID] })) {
          // reachLow/reachHigh from climbing.js: a perch has to be within
          // reach of a standable cell, OR of another perch that is (the
          // bookcase top is the one chain in the room).
          const reach = p.y > 1 ? BASE_CLIMB_BUDGET.reachHigh : BASE_CLIMB_BUDGET.reachLow;
          const direct = p.y <= BASE_CLIMB_BUDGET.climb && nav.reaches(p.x, p.z, reach - 0.05);
          const viaChain = area.perches.some((q) => q !== p
            && q.y < p.y
            && p.y - q.y <= BASE_CLIMB_BUDGET.climb
            && Math.hypot(p.x - q.x, p.z - q.z) < reach
            && nav.reaches(q.x, q.z, (q.y > 1 ? BASE_CLIMB_BUDGET.reachHigh : BASE_CLIMB_BUDGET.reachLow) - 0.05));
          expect(direct || viaChain, `${name}: perch ${p.label ?? `${p.x},${p.z},${p.y}`}`).toBe(true);
        }
      });
    });
  }
});
