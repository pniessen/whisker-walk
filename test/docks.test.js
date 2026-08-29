import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { climbBudget } from '../src/climbing.js';
import { createProgression, CATALOG, JOURNAL_TYPES } from '../src/progression.js';
import { CRITTER_INFO } from '../src/journal.js';
import { labelFor } from '../src/game/labels.js';

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

const { build } = await import('../src/world/docks.js');
const { build: buildPark } = await import('../src/world/park.js');
const { build: buildNeighborhood } = await import('../src/world/neighborhood.js');
const { build: buildSeaside } = await import('../src/world/seaside.js');
const { GOLD_MICE, GOLD_TOTAL } = await import('../src/goldmice.js');
const { surfaceProps } = await import('../src/render/materials.js');
const { setTextureTier, getTextureTier } = await import('../src/render/textures.js');

const area = build(new THREE.Scene());
// The canal runs east-west at |z| <= CANAL_HALF. Kept as a literal here on
// purpose: if docks.js widens the canal without moving its content, this
// number stops matching and the Sea Legs block below stops proving anything,
// so it should be updated deliberately rather than imported and forgotten.
const CANAL_HALF = 3.5;

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
}

// Can the cat physically stand at (x, z)? player.update pushes a GROUNDED cat
// out to collider.r + CAT_RADIUS (0.35) and clamps it into bounds, so this is
// the same test the running game applies every frame.
const CAT_RADIUS = 0.35;
function standable(x, z) {
  if (x < area.bounds.minX || x > area.bounds.maxX) return false;
  if (z < area.bounds.minZ || z > area.bounds.maxZ) return false;
  return area.colliders.every((c) => Math.hypot(x - c.x, z - c.z) >= c.r + CAT_RADIUS);
}
// Is there anywhere within `range` of (x, z) the cat can actually stand?
function standableWithin(x, z, range) {
  for (let r = 0; r <= range; r += 0.05) {
    for (let t = 0; t < 64; t++) {
      const th = (t / 64) * Math.PI * 2;
      if (standable(x + Math.cos(th) * r, z + Math.sin(th) * r)) return true;
    }
  }
  return false;
}

describe('The Old Docks — the area contract', () => {
  it('returns every field park.js returns, with the same types', () => {
    const park = buildPark(new THREE.Scene());
    for (const key of Object.keys(park)) {
      expect(area, `missing contract field ${key}`).toHaveProperty(key);
      expect(typeof area[key], `${key} type`).toBe(typeof park[key]);
      if (Array.isArray(park[key])) expect(Array.isArray(area[key]), `${key} is an array`).toBe(true);
    }
  });

  it('is named for the catalog entry', () => {
    expect(area.name).toBe('The Old Docks');
    expect(area.name).toBe(CATALOG.areas.docks.name);
  });

  it('has well-formed bounds, a standable spawn inside them, and colliders', () => {
    expect(area.bounds.maxX).toBeGreaterThan(area.bounds.minX);
    expect(area.bounds.maxZ).toBeGreaterThan(area.bounds.minZ);
    expect(standable(area.spawn.x, area.spawn.z)).toBe(true);
    expect(area.colliders.length).toBeGreaterThan(0);
    for (const c of area.colliders) {
      expect(Number.isFinite(c.x) && Number.isFinite(c.z) && c.r > 0).toBe(true);
    }
  });

  it('has the >= 8 POIs race.js needs, each reachable once cleared', () => {
    // raceCourse picks five waypoints out of pois; secrets.js indexes into it
    // too. Fewer than eight and the daily race starts repeating waypoints.
    expect(area.pois.length).toBeGreaterThanOrEqual(8);
    for (const p of area.pois) expect(standableWithin(p.x, p.z, 1.0), `poi ${p.x},${p.z}`).toBe(true);
  });

  it('ships five collectibles, all with unique ids and reachable positions', () => {
    expect(area.collectibles).toHaveLength(5);
    expect(new Set(area.collectibles.map((c) => c.id)).size).toBe(5);
    for (const c of area.collectibles) {
      expect(typeof c.label).toBe('string');
      if (c.y) {
        // elevated: it must sit on a real perch, since the pickup gate is
        // 1.6 horizontal AND 0.9 vertical of the cat's current perch height
        const stand = area.perches.find(
          (p) => Math.hypot(p.x - c.x, p.z - c.z) < 1.6 && Math.abs(p.y - c.y) < 0.9,
        );
        expect(stand, `${c.id} has no perch to be picked up from`).toBeTruthy();
      } else {
        expect(standableWithin(c.x, c.z, 1.5), c.id).toBe(true);
      }
    }
  });

  it('ships three scenics the cat can get within the 4m award range of', () => {
    expect(area.scenics).toHaveLength(3);
    for (const s of area.scenics) expect(standableWithin(s.x, s.z, 3.9), s.id).toBe(true);
  });

  it('is the densest tippable field in the game, and every one is swattable', () => {
    const others = [buildNeighborhood(new THREE.Scene()), buildPark(new THREE.Scene()), buildSeaside(new THREE.Scene())];
    for (const o of others) expect(area.tippables.length).toBeGreaterThan(o.tippables.length);
    for (const t of area.tippables) {
      expect(['pot', 'can', 'bin']).toContain(t.kind);
      expect(standableWithin(t.x, t.z, 1.0), `tippable ${t.x},${t.z}`).toBe(true);
    }
  });

  it('is the most compact area, which is what makes the stray colony dense', () => {
    const size = (a) => (a.bounds.maxX - a.bounds.minX) * (a.bounds.maxZ - a.bounds.minZ);
    for (const o of [buildNeighborhood(new THREE.Scene()), buildPark(new THREE.Scene()), buildSeaside(new THREE.Scene())]) {
      expect(size(area)).toBeLessThan(size(o));
    }
  });

  it('has the darkest dusk sky of any area — the Night Eyes showcase', () => {
    const lum = (hex) => ((hex >> 16) & 255) * 0.299 + ((hex >> 8) & 255) * 0.587 + (hex & 255) * 0.114;
    for (const o of [buildNeighborhood(new THREE.Scene()), buildPark(new THREE.Scene()), buildSeaside(new THREE.Scene())]) {
      expect(lum(area.skyDusk.top)).toBeLessThan(lum(o.skyDusk.top));
    }
  });

  // v1.2: the hemisphere fill's ground term (game/walk.js). Every area returns
  // its own, taken from its own b.ground() hex, and the ordering is the whole
  // reason it is per-area rather than one global constant: the Docks bounce the
  // least light back up of anywhere in the game, Seaside the most.
  it('has the darkest ground bounce of any area, and Seaside the brightest', () => {
    const lum = (hex) => ((hex >> 16) & 255) * 0.299 + ((hex >> 8) & 255) * 0.587 + (hex & 255) * 0.114;
    const others = [buildNeighborhood(new THREE.Scene()), buildPark(new THREE.Scene()), buildSeaside(new THREE.Scene())];
    for (const o of others) {
      expect(o.groundBounce, 'every area must return a groundBounce').toEqual(expect.any(Number));
      expect(lum(area.groundBounce)).toBeLessThan(lum(o.groundBounce));
    }
    const seaside = buildSeaside(new THREE.Scene());
    for (const o of [area, ...others.slice(0, 2)]) expect(lum(seaside.groundBounce)).toBeGreaterThan(lum(o.groundBounce));
  });

  it('bounces its own wet stone — the hex b.ground() lays the quay in', () => {
    expect(area.groundBounce).toBe(0x4e4e58);
  });

  it('spawns the new rat critter, and every critter type it spawns is a known one', () => {
    const types = new Set(area.critterSpawns.map((c) => c.type));
    expect(types.has('rat')).toBe(true);
    for (const t of types) expect(JOURNAL_TYPES).toContain(t);
    // the largest rat population anywhere — this is the rat's home area
    expect(area.critterSpawns.filter((c) => c.type === 'rat').length).toBeGreaterThanOrEqual(4);
  });

  it('gives both moments a critter type that exists in the district', () => {
    expect(area.moments).toHaveLength(2);
    for (const m of area.moments) {
      expect(m.from).toBeTruthy();
      // critters.playMoment defaults to a squirrel; there are none at the
      // docks, so each moment must name its own runner
      expect(m.type).toBe('rat');
    }
  });
});

// ---------------------------------------------------------------------------
// THE SEA LEGS PIN.
//
// Sea Legs (swimming) is a Stage 3 descope candidate and may never ship. The
// Docks must be completely playable without it. Water carries no colliders in
// this game today, so the canal blocks nothing as shipped — but if a future
// Sea Legs task adds water volumes, everything below still has to hold, which
// is why the invariant is "no required content is IN the canal" and "the two
// banks are joined by dry crossings", not merely "the cat can walk on water".
// ---------------------------------------------------------------------------
describe('The Old Docks — nothing requires Sea Legs', () => {
  const inCanal = (o) => Math.abs(o.z) <= CANAL_HALF;

  it('puts no collectible, golden mouse, scenic, POI, tippable or perch in the canal', () => {
    const lists = {
      collectibles: area.collectibles,
      'golden mice': GOLD_MICE.docks,
      scenics: area.scenics,
      // pois covers the daily race's five waypoints and the quest target,
      // both of which are derived from this array and nothing else
      pois: area.pois,
      tippables: area.tippables,
      perches: area.perches,
      boxes: area.boxes,
      puddles: area.puddles,
    };
    for (const [name, list] of Object.entries(lists)) {
      expect(list.filter(inCanal), `${name} in the canal`).toEqual([]);
    }
    expect(inCanal(area.spawn)).toBe(false);
  });

  it('spawns the player on one bank and puts POIs on both, so the crossing is used', () => {
    const north = area.pois.filter((p) => p.z > CANAL_HALF);
    const south = area.pois.filter((p) => p.z < -CANAL_HALF);
    expect(north.length).toBeGreaterThanOrEqual(3);
    expect(south.length).toBeGreaterThanOrEqual(3);
  });

  it('leaves a walkable dry corridor across the canal at both bridges', () => {
    // The bridges are at x 0 and x -24. Walk a line straight across the canal
    // at each and confirm every step is standable — no collider was ever
    // added to a railing, quay edge or barge that would close the crossing.
    for (const bridgeX of [0, -24]) {
      for (let z = -6; z <= 6; z += 0.25) {
        expect(standable(bridgeX, z), `bridge at x=${bridgeX} blocked at z=${z}`).toBe(true);
      }
    }
  });

  it('keeps every perch clear of the water, so no chain steps into the canal', () => {
    for (const p of area.perches) {
      expect(Math.abs(p.z), `perch at ${p.x},${p.z}`).toBeGreaterThan(CANAL_HALF);
    }
  });

  it('holds the same line for the SKILL-GATED perches (v18 CF-9b)', () => {
    // The loop above already walks the whole array, gated records included —
    // this names them so the coverage cannot go vacuous. Sure Claws' "props
    // that were scenery become climbable" added ten perches to this area (the
    // eight market awnings and the two quay benches); a water-collider wave
    // will not ask whether a perch was gated before it drowns the cat
    // standing on it, so the canal rule binds them exactly as hard.
    const gated = area.perches.filter((p) => p.requires);
    expect(gated.length).toBe(10);
    for (const p of gated) {
      expect(p.requires).toBe('sure-claws');
      expect(Math.abs(p.z), `gated perch at ${p.x},${p.z}`).toBeGreaterThan(CANAL_HALF);
      // and each is takeable from dry land the cat can actually stand on
      const reach = (p.y > 1 ? 2.6 : 1.2) - 0.05;
      expect(standableWithin(p.x, p.z, reach), `gated perch at ${p.x},${p.z}`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Perch chains. The hop counts themselves are pinned in test/climbing.test.js,
// which BFSes the real shipped arrays for every area at once; what is checked
// here is the thing a BFS over perch coordinates cannot see — that the FIRST
// step of every chain has somewhere on the ground the cat can stand to take it.
// ---------------------------------------------------------------------------
describe('The Old Docks — perch chains', () => {
  const budget = climbBudget({});

  it('every chain’s first step can be taken from a spot the cat can stand on', () => {
    const firstSteps = area.perches.filter((p) => p.y <= budget.climb);
    expect(firstSteps.length).toBeGreaterThan(0);
    for (const p of firstSteps) {
      const reach = p.y > 1 ? budget.reachHigh : budget.reachLow;
      expect(standableWithin(p.x, p.z, reach - 0.05), `perch y${p.y} at ${p.x},${p.z}`).toBe(true);
    }
  });

  it('reaches higher than any other area — the tallest perch in the game', () => {
    const top = Math.max(...area.perches.map((p) => p.y));
    for (const o of [buildNeighborhood(new THREE.Scene()), buildPark(new THREE.Scene()), buildSeaside(new THREE.Scene())]) {
      expect(top).toBeGreaterThan(Math.max(...o.perches.map((p) => p.y)));
    }
    expect(top).toBe(6.2);
  });

  it('carries the most vantage perches, so the perch-count feats are finishable', () => {
    // Spring Paws wants 10 vantage perches and Fence Runner 25; the three
    // original areas hold eight between them, so without the Docks the first
    // of those feats needs three full re-walks and the second nine.
    const vantages = area.perches.filter((p) => p.vantage);
    expect(vantages.length).toBeGreaterThanOrEqual(6);
    for (const v of vantages) expect(typeof v.label).toBe('string');
    const others = [buildNeighborhood(new THREE.Scene()), buildPark(new THREE.Scene()), buildSeaside(new THREE.Scene())];
    for (const o of others) {
      expect(vantages.length).toBeGreaterThan(o.perches.filter((p) => p.vantage).length);
    }
  });
});

describe('The Old Docks — golden mice', () => {
  it('adds three, keeping the three-per-area shape, and lifts the total to 12', () => {
    expect(GOLD_MICE.docks).toHaveLength(3);
    expect(GOLD_TOTAL).toBe(12);
  });

  it('sits two on real shipped perch coordinates and hides one at ground level', () => {
    // The trap this pins: a previous task authored a whole set of mouse
    // coordinates before the perches existed and had to relocate all of them.
    // Every elevated mouse here must match a perch EXACTLY.
    const elevated = GOLD_MICE.docks.filter((m) => m.y > 0);
    const ground = GOLD_MICE.docks.filter((m) => m.y === 0);
    expect(elevated).toHaveLength(2);
    expect(ground).toHaveLength(1);
    for (const m of elevated) {
      const perch = area.perches.find((p) => p.x === m.x && p.z === m.z && p.y === m.y);
      expect(perch, `${m.id} is not on a shipped perch`).toBeTruthy();
    }
    expect(standableWithin(ground[0].x, ground[0].z, 1.0), ground[0].id).toBe(true);
  });

  it('places the ground mouse off the paths but walkable-to, and out of the canal', () => {
    const ground = GOLD_MICE.docks.find((m) => m.y === 0);
    expect(Math.abs(ground.z)).toBeGreaterThan(CANAL_HALF);
    // findable by walking: checkFind's window is 1.0 horizontal / 0.9 vertical
    expect(standableWithin(ground.x, ground.z, 0.95)).toBe(true);
  });
});

describe('The Old Docks — catalog, unlock gating and walk counting', () => {
  it('is priced at 200 and gated behind 2 seaside walks', () => {
    expect(CATALOG.areas.docks).toEqual({
      name: 'The Old Docks', price: 200, requires: { area: 'seaside', walks: 2 },
    });
  });

  it('cannot be bought with the points alone — the seaside walks are required', () => {
    const p = createProgression(fakeStorage());
    p.addPoints(9999);
    expect(p.canBuy('areas', 'docks')).toBe(false);
    p.completeWalk('seaside');
    expect(p.canBuy('areas', 'docks')).toBe(false); // one walk is not two
    p.completeWalk('seaside');
    expect(p.canBuy('areas', 'docks')).toBe(true);
  });

  it('cannot be bought without the points either', () => {
    const p = createProgression(fakeStorage());
    p.completeWalk('seaside');
    p.completeWalk('seaside');
    p.addPoints(199);
    expect(p.canBuy('areas', 'docks')).toBe(false);
    p.addPoints(1);
    expect(p.canBuy('areas', 'docks')).toBe(true);
    expect(p.buy('areas', 'docks')).toBe(true);
    expect(p.isUnlocked('areas', 'docks')).toBe(true);
    expect(p.state.points).toBe(0);
  });

  it('can then be equipped as the walk area and persists', () => {
    const storage = fakeStorage();
    const p = createProgression(storage);
    p.addPoints(200);
    p.completeWalk('seaside');
    p.completeWalk('seaside');
    p.buy('areas', 'docks');
    p.setArea('docks');
    expect(p.state.area).toBe('docks');
    expect(createProgression(storage).state.area).toBe('docks');
  });

  // THE trap. completeWalk does `state.walks[areaId] += 1` with no guard, so a
  // missing key computes undefined + 1 = NaN and stays NaN forever.
  it('defaults state.walks.docks to 0 and increments it as a real number', () => {
    const p = createProgression(fakeStorage());
    expect(p.state.walks.docks).toBe(0);
    p.completeWalk('docks');
    expect(p.state.walks.docks).toBe(1);
    p.completeWalk('docks');
    expect(p.state.walks.docks).toBe(2);
    expect(Number.isNaN(p.state.walks.docks)).toBe(false);
  });

  it('recovers the docks key on a save written before the area existed', () => {
    // A v17 save has no walks.docks at all. sanitizeState iterates the
    // DEFAULT walks keys, so the key comes back with a 0 — the alternative
    // (iterating the save's keys) is what would have made it NaN forever.
    const storage = fakeStorage({
      'whisker-walk-save': JSON.stringify({
        version: 4, points: 0,
        walks: { neighborhood: 5, park: 3, seaside: 2, den: 1 },
        unlocked: { cats: ['tabby'], accessories: ['bell'], areas: ['neighborhood'] },
      }),
    });
    const p = createProgression(storage);
    expect(p.state.walks.docks).toBe(0);
    p.completeWalk('docks');
    expect(p.state.walks.docks).toBe(1);
  });
});

describe('The Old Docks — the eleventh journal critter', () => {
  it('adds rat to the journal vocabulary and the catalog together', () => {
    expect(JOURNAL_TYPES).toContain('rat');
    expect(JOURNAL_TYPES).toHaveLength(11);
    expect(CRITTER_INFO).toHaveLength(11);
    const rat = CRITTER_INFO.find((c) => c.id === 'rat');
    expect(rat).toBeTruthy();
    expect(rat.emoji).toBeTruthy();
    expect(rat.name).toBeTruthy();
    expect(rat.hint).toBeTruthy();
    // hint style matches the ten before it: one short pointer, ends in a stop
    expect(rat.hint.length).toBeLessThan(60);
    expect(rat.hint.endsWith('.') || rat.hint.endsWith('!')).toBe(true);
  });

  it('records rat sightings in the journal like any other critter', () => {
    const p = createProgression(fakeStorage());
    p.recordSighting('rat');
    p.recordSighting('rat');
    expect(p.state.journal.rat).toBe(2);
  });

  it('gives the rat a display name rather than the fallback', () => {
    expect(labelFor('rat')).not.toBe(labelFor('nonsense-type'));
    expect(labelFor('rat')).toContain('rat');
  });
});

// ---------------------------------------------------------------------------
// This wave's characteristic failure has been a fully-built thing that nothing
// calls. The catalog entry alone is not enough: startWalk indexes an AREAS map
// in src/game/walk.js, and an area missing from it throws the moment the
// player presses Walk. walk.js cannot be imported here (it pulls in the whole
// render stack), so the registration is asserted against the source text.
// ---------------------------------------------------------------------------
describe('The Old Docks — actually registered', () => {
  const walkSrc = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');

  it('is imported and present in walk.js’s AREAS map', () => {
    expect(walkSrc).toMatch(/import \* as docks from '\.\.\/world\/docks\.js';/);
    const map = walkSrc.match(/const AREAS = \{([^}]*)\}/);
    expect(map).toBeTruthy();
    expect(map[1]).toContain('docks');
  });

  it('has an AREAS entry for every buyable area in the catalog', () => {
    const map = walkSrc.match(/const AREAS = \{([^}]*)\}/)[1];
    for (const id of Object.keys(CATALOG.areas)) {
      expect(map, `area '${id}' is in the catalog but not in walk.js's AREAS`).toContain(id);
    }
  });
});

// ---------------------------------------------------------------------------
// v20 — the surface/water/wind pilot.
//
// The Docks went first because it had the strongest case: its ground is
// literally commented "wet cobbles" and it has a canal. These cases pin the
// two things that can silently go wrong in a materials pass and look like an
// art decision rather than a bug:
//
//   * TILE DENSITY. repeatFor() used to live in textures.js keyed on TEXTURE
//     names, so repeatFor('wetStone', w, h) fell through to a plausible
//     [1, 1] and rendered cobbles at three times their intended size, with no
//     error. The repeat below is asserted as a NUMBER OF TILES against the
//     surface's own tile size, which is the only form of that assertion the
//     bug could not have passed.
//   * TIER AND REDUCED MOTION. Both are threaded from walk.js through
//     build(scene, opts) and both have to survive the trip: on the low tier
//     the tiles are never built at all and the water drops to its baked ramp,
//     and reduced motion has to freeze the water independently of the tier.
// ---------------------------------------------------------------------------
describe('The Old Docks — surfaces', () => {
  const groundOf = (scene) => scene.children.find(
    (o) => o.isMesh && o.geometry?.type === 'PlaneGeometry' && o.geometry.parameters.width === 120,
  );

  it('lays the ground in wet cobbles — the sheen preset, not the dry one', () => {
    const scene = new THREE.Scene();
    build(scene);
    const g = groundOf(scene);
    expect(g).toBeTruthy();
    // 'wetStone' and 'cobble' share one tile and differ ONLY in roughness, so
    // roughness is the whole assertion: 0.42 is the damp read the area is
    // named for, 0.8 would be a dry street.
    expect(g.material.roughness).toBe(surfaceProps('wetStone').roughness);
    expect(g.material.metalness).toBe(0);
    expect(g.material.map?.name).toBe('surface:cobble');
  });

  it('derives the ground repeat from the plane’s real size, so setts are 0.3m', () => {
    const scene = new THREE.Scene();
    build(scene);
    const map = groundOf(scene).material.map;
    // 120m of ground at the cobble tile's 1.2m => 100 tiles, i.e. 4x4 setts of
    // 0.3m each. A hand-picked repeat is what this number exists to forbid.
    expect([map.repeat.x, map.repeat.y]).toEqual([100, 100]);
  });

  it('names its shared tiles so endWalk’s teardown leaves them alone', () => {
    // render/textures.js memoises its tiles for the app's lifetime, while
    // endWalk traverses the scene disposing every material's `.map`. walk.js
    // tells the two apart by the 'surface:' name the painter sets — if that
    // prefix ever changes, the shared tiles start being freed once per walk
    // and this is the case that says so.
    const scene = new THREE.Scene();
    build(scene);
    expect(groundOf(scene).material.map.name.startsWith('surface:')).toBe(true);
  });

  it('builds no tiles at all on the low tier, keeping the light response', () => {
    const before = getTextureTier();
    try {
      setTextureTier('low');
      const scene = new THREE.Scene();
      build(scene);
      const g = groundOf(scene);
      expect(g.material.map).toBeNull();          // zero texture bytes on a phone
      expect(g.material.roughness).toBe(surfaceProps('wetStone').roughness); // two floats are free
    } finally {
      setTextureTier(before);
    }
  });
});

describe('The Old Docks — the canal is a water surface', () => {
  it('hands back one water handle for the one declared footprint', () => {
    const scene = new THREE.Scene();
    const area = build(scene);
    expect(area.waterFx).toHaveLength(1);
    expect(area.waterFx.length).toBe(area.waters.length);
    expect(area.waterFx[0].mesh.name).toBe('water:canal');
    expect(area.waterFx[0].mesh.position.y).toBe(0.04); // the plane's shipped height
  });

  it('adds the mesh straight to the scene, never inside a Group', () => {
    // test/water.test.js's "draws that footprint from the declaration" case
    // matches against scene.children; a nested water mesh is invisible to it
    // and that case fails with "no mesh matches the declared footprint".
    const scene = new THREE.Scene();
    const area = build(scene);
    expect(scene.children).toContain(area.waterFx[0].mesh);
  });

  it('threads the quality tier through, so a phone gets the baked ramp only', () => {
    const scene = new THREE.Scene();
    const area = build(scene, { water: { quality: 'low' } });
    const w = area.waterFx[0];
    expect(w.tier).toBe('low');
    expect(w.animated).toBe(false);        // update() is a no-op: no per-frame cost
    expect(w.textures.normal).toBeNull();
    expect(w.textures.roughness).toBeNull();
    expect(w.textures.color).toBeTruthy(); // the half of the effect that is free
  });

  it('threads reducedMotion through independently of the tier', () => {
    const scene = new THREE.Scene();
    const area = build(scene, { water: { quality: 'high', reducedMotion: true } });
    const w = area.waterFx[0];
    expect(w.tier).toBe('high');   // still the full surface...
    expect(w.animated).toBe(false); // ...but it does not move
  });

  it('still builds at the high tier when nothing is passed', () => {
    const area = build(new THREE.Scene());
    expect(area.waterFx[0].tier).toBe('high');
    expect(area.waterFx[0].animated).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ...and the same "a fully-built thing that nothing calls" guard the block
// above applies to the area itself, applied to the four render modules this
// wave wired in. walk.js and main.js cannot be imported here (they pull in the
// whole render stack), so it is asserted against the source text — the same
// technique, for the same reason.
// ---------------------------------------------------------------------------
describe('the surface wave is actually wired up', () => {
  const walkSrc = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');
  const mainSrc = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

  it('sets the texture tier before any world geometry is built', () => {
    const setTier = walkSrc.indexOf('setTextureTier(');
    const buildArea = walkSrc.indexOf('.build(scene');
    expect(setTier).toBeGreaterThan(-1);
    expect(buildArea).toBeGreaterThan(-1);
    // The tiles are memoised for the app's lifetime, so whatever tier is in
    // force when the FIRST one is built is the tier every later walk inherits.
    expect(setTier).toBeLessThan(buildArea);
  });

  it('threads the tier and reducedMotion into the area builders', () => {
    expect(walkSrc).toMatch(/build\(scene, \{ water: \{ quality: tier, reducedMotion \}, wind \}\)/);
  });

  it('drives the water and the wind on REAL time, never the slow-mo clock', () => {
    // `wdt` slows critters for a pounce beat. Slowing the canal or the trees
    // with them reads as the whole world lurching, which is why skyLife and
    // weather sit on real dt too.
    expect(mainSrc).toContain('session.water.update(dt)');
    expect(mainSrc).not.toContain('session.water.update(wdt)');
    // Wind takes ABSOLUTE elapsed time, not a delta, and takes its intensity
    // as a hint from weather rather than importing weather itself.
    expect(mainSrc).toMatch(/session\.wind\.update\(t, session\.weather\.condition === 'rain' \? 1\.7 : 1\)/);
  });

  it('disposes both alongside the other per-walk systems', () => {
    expect(walkSrc).toContain('session.water.dispose()');
    expect(walkSrc).toContain('session.wind.dispose()');
  });

  it('keeps the app-lifetime surface tiles out of endWalk’s texture sweep', () => {
    expect(walkSrc).toMatch(/if \(m\.map && !m\.map\.name\?\.startsWith\('surface:'\)\) m\.map\.dispose\(\);/);
  });
});
