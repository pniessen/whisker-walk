import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

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

const { build: buildNeigh } = await import('../src/world/neighborhood.js');
const { build: buildPark } = await import('../src/world/park.js');
const { build: buildSea } = await import('../src/world/seaside.js');
const { build: buildDocks } = await import('../src/world/docks.js');
const { build: buildWoods } = await import('../src/world/woods.js');
const { build: buildRiver } = await import('../src/world/river.js');
const { build: buildMoor } = await import('../src/world/moor.js');
const { build: buildPines, TRUCE_PATH, BRIDGE_FOOT, PINES_ISLAND } = await import('../src/world/pines.js');
const { build: buildGorge } = await import('../src/world/gorge.js');
const { CAMP_DEN } = await import('../src/world/gorgeshape.js');
const { ISLAND_LAND, BRIDGE_DECK } = await import('../src/world/island.js');
const { isClanId } = await import('../src/clanhomes.js');
const { patrolPath, borderMarks, rivalFor, isTrespassing, DISCS } = await import('../src/rivalclans.js');
const { patrolAt, chaseOutcome, findLanding, PATROL_SPEED } = await import('../src/rivalcats.js');
const { isWalkableAt, CAT_RADIUS } = await import('../src/player.js');
const { waterClearance } = await import('../src/world/builder.js');
const { GOLD_MICE } = await import('../src/goldmice.js');
const { campLayout } = await import('../src/world/camp.js');
const { clanWalkableFor, clanGroundArea } = await import('../src/world/clanground.js');
const { castFor, roamHomes } = await import('../src/clancast.js');
const { keepOutPoint } = await import('../src/keepout.js');
const { INTRUDER_ROUTES, ROUTE_MAX, routeLength } = await import('../src/intruders.js');

// The rival's patrol, its marks and its chase against the REAL built areas:
// the pure tests in rivalcats.test.js cannot know where a container is.
const BUILD = { neighborhood: buildNeigh, park: buildPark, seaside: buildSea, docks: buildDocks, woods: buildWoods, river: buildRiver, moor: buildMoor, pines: buildPines, gorge: buildGorge };
const AREAS = Object.keys(BUILD);
const built = Object.fromEntries(AREAS.map((a) => [a, BUILD[a](new THREE.Scene())]));

describe('the patrol ring in the real areas', () => {
  it('every patrol and mark point clears every collider by the cat\'s radius', () => {
    for (const a of AREAS) {
      for (const p of [...patrolPath(a), ...borderMarks(a)]) {
        for (const c of built[a].colliders) {
          expect(Math.hypot(p.x - c.x, p.z - c.z), `${a} ${p.x},${p.z} vs ${c.x},${c.z}`).toBeGreaterThanOrEqual(c.r + CAT_RADIUS);
        }
      }
    }
  });

  it('the patrol cat itself never stands inside a collider or the water', () => {
    for (const a of AREAS) {
      for (let t = 0; t < 120; t += 0.37) {
        const p = patrolAt(a, t);
        expect(isWalkableAt(built[a], p.x, p.z), `${a} t=${t}`).toBe(true);
      }
    }
  });

  it('clears every collider by about 0.5m beyond the cat\'s radius on the whole ring', () => {
    // sampled finely, not just at the 16 vertices, since the cat walks the chords
    for (const a of AREAS) {
      const { cx, cz, r } = rivalFor(a);
      for (let i = 0; i < 720; i++) {
        const th = (i / 720) * Math.PI * 2;
        const x = cx + Math.cos(th) * r;
        const z = cz + Math.sin(th) * r;
        for (const c of built[a].colliders) {
          expect(Math.hypot(x - c.x, z - c.z)).toBeGreaterThanOrEqual(c.r + CAT_RADIUS + 0.4);
        }
      }
    }
  });

  it('nothing the player must reach is inside a territory', () => {
    for (const a of AREAS) {
      for (const m of GOLD_MICE[a]) expect(isTrespassing(a, m.x, m.z)).toBe(false);
      for (const p of built[a].pois) expect(isTrespassing(a, p.x, p.z)).toBe(false);
      for (const p of built[a].collectibles || []) expect(isTrespassing(a, p.x, p.z), `${a} collectible`).toBe(false);
      for (const p of built[a].scenics || []) expect(isTrespassing(a, p.x, p.z), `${a} scenic`).toBe(false);
    }
  });

  it('only unlabelled perches sit inside a camp', () => {
    for (const a of AREAS.filter(isClanId)) {
      for (const p of built[a].perches || []) {
        if (isTrespassing(a, p.x, p.z)) {
          expect(p.label, `${a} perch ${p.x},${p.z}`).toBeFalsy();
          expect(p.vantage, `${a} perch ${p.x},${p.z}`).toBeFalsy();
        }
      }
    }
  });
});

// Crossing Pines land to the island never starts a chase (decision 8): the
// island is walked inside the Pines, so its truce is kept by distance.
describe('the Pines\' camp keeps clear of the truce', () => {
  const { cx, cz, r } = rivalFor('pines');
  const segDist = (x1, z1, x2, z2) => {
    const dx = x2 - x1, dz = z2 - z1;
    const t = Math.max(0, Math.min(1, ((cx - x1) * dx + (cz - z1) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(cx - (x1 + t * dx), cz - (z1 + t * dz));
  };

  it('stays 3m or more from every segment of the truce path', () => {
    expect(TRUCE_PATH.length).toBeGreaterThan(0);
    for (const s of TRUCE_PATH) expect(segDist(...s) - r, s.join(',')).toBeGreaterThanOrEqual(3);
  });

  it('stays 3m or more from the bridge foot and the whole bridge deck', () => {
    expect(Math.hypot(cx - BRIDGE_FOOT.x, cz - BRIDGE_FOOT.z) - r).toBeGreaterThanOrEqual(3);
    const D = BRIDGE_DECK;
    expect(segDist(D.x1, D.z1, D.x2, D.z2) - D.halfW - r).toBeGreaterThanOrEqual(3);
  });

  it('stays 3m or more from the island\'s land', () => {
    for (const I of [ISLAND_LAND, PINES_ISLAND]) {
      expect(Math.hypot(cx - I.x, cz - I.z) - I.r - r).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('isWalkableAt', () => {
  it('judges bounds, colliders and water the way player.update pushes them', () => {
    const area = { bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 }, colliders: [{ x: 0, z: 0, r: 1 }], waters: [{ id: 'p', kind: 'circle', x: 6, z: 0, r: 2 }] };
    expect(isWalkableAt(area, 3, 3)).toBe(true);
    expect(isWalkableAt(area, 11, 0)).toBe(false);          // out of bounds
    expect(isWalkableAt(area, 0, 1 + CAT_RADIUS - 0.01)).toBe(false); // inside a collider's stand-off
    expect(isWalkableAt(area, 0, 1 + CAT_RADIUS + 0.01)).toBe(true);
    expect(isWalkableAt(area, 6, 0)).toBe(false);           // in the water
    expect(isWalkableAt(area, 6, 2 + CAT_RADIUS - 0.01)).toBe(false); // too near the waterline
    expect(isWalkableAt(area, 6, 2 + CAT_RADIUS + 0.01)).toBe(true);
    expect(isWalkableAt(area, NaN, 0)).toBe(false);
    expect(isWalkableAt({}, 1, 1)).toBe(true);
  });

  it('agrees with the water helper on the real areas', () => {
    for (const a of ['park', 'seaside', 'docks']) {
      const area = built[a];
      for (let x = area.bounds.minX; x <= area.bounds.maxX; x += 3) {
        for (let z = area.bounds.minZ; z <= area.bounds.maxZ; z += 3) {
          if (isWalkableAt(area, x, z)) expect(waterClearance(area.waters, x, z)).toBeGreaterThanOrEqual(CAT_RADIUS);
        }
      }
    }
  });
});

describe('a chase in the real areas', () => {
  it('always lands somewhere walkable and outside the disc', () => {
    for (const a of AREAS) {
      const area = built[a];
      const { cx, cz, r } = rivalFor(a);
      const walk = (x, z) => isWalkableAt(area, x, z);
      let n = 0;
      for (let gx = -r; gx <= r; gx += 0.5) {
        for (let gz = -r; gz <= r; gz += 0.5) {
          const cat = { x: cx + gx, z: cz + gz };
          if (!isTrespassing(a, cat.x, cat.z) || !walk(cat.x, cat.z)) continue;
          const out = chaseOutcome(a, cat, { x: cat.x, z: cat.z });
          const land = findLanding(a, out.to, walk);
          expect(land, `${a} ${cat.x},${cat.z}`).not.toBeNull();
          expect(walk(land.x, land.z)).toBe(true);
          expect(isTrespassing(a, land.x, land.z)).toBe(false);
          n++;
        }
      }
      expect(n).toBeGreaterThan(20);
    }
  });
});

// The camp (den and leader's rock) and every spot the clan stands on, against
// the REAL built territories. The clan's ground is clanWalkableFor: walkable,
// out of the keep-out, and in the Pines clear of the truce path and the bridge.
describe('the camp and the clan in the real territories', () => {
  const CAMPED = AREAS.filter((a) => castFor(a).length > 0);
  const circle = (x, z, rad, n) => Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    return { x: x + Math.cos(t) * rad, z: z + Math.sin(t) * rad };
  });
  const homesOf = (a) => roamHomes(a, built[a], clanWalkableFor(built[a], a));
  const seatsOf = (L) => [L.seats.deputy, ...L.seats.elders, ...L.seats.kits];
  const segDist = (x, z, [x1, z1, x2, z2]) => {
    const dx = x2 - x1, dz = z2 - z1;
    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(x - (x1 + t * dx), z - (z1 + t * dz));
  };

  it('covers every territory with a camp, the Pines included', () => {
    for (const a of ['woods', 'river', 'moor', 'pines']) expect(CAMPED).toContain(a);
    expect(CAMPED).not.toContain('park');
  });

  it('the den and the rock are colliders, clear of every other collider by 0.4m', () => {
    for (const a of CAMPED) {
      const L = campLayout(a);
      const cs = built[a].colliders;
      // a cave den (the Gorge's) is cut into the rock: no collider, the rock alone
      const mine = (L.den.cave ? [L.rock] : [L.den, L.rock]).map((p) => cs.find((c) => c.x === p.x && c.z === p.z && c.r === p.r));
      for (const c of mine) expect(c, a).toBeTruthy();
      for (const c of mine) {
        for (const o of cs) {
          if (mine.includes(o)) continue;
          expect(Math.hypot(c.x - o.x, c.z - o.z), `${a} camp ${c.x},${c.z} vs ${o.x},${o.z}`).toBeGreaterThanOrEqual(c.r + o.r + 0.4);
        }
      }
    }
  });

  it('every ground seat is clan ground', () => {
    for (const a of CAMPED) {
      const ok = clanWalkableFor(built[a], a);
      for (const s of seatsOf(campLayout(a))) expect(ok(s.x, s.z), `${a} seat ${s.x},${s.z}`).toBe(true);
    }
  });

  it('eight roaming homes, each with its 2m circle on clan ground, outside the camp, 7m apart', () => {
    for (const a of CAMPED) {
      const ok = clanWalkableFor(built[a], a);
      const { cx, cz, r } = DISCS[a];
      const homes = homesOf(a);
      expect(homes, a).toHaveLength(8);
      for (const h of homes) {
        expect(ok(h.x, h.z), `${a} home ${h.x},${h.z}`).toBe(true);
        for (const p of circle(h.x, h.z, 2, 8)) expect(ok(p.x, p.z), `${a} home ring ${p.x},${p.z}`).toBe(true);
        expect(Math.hypot(h.x - cx, h.z - cz)).toBeGreaterThanOrEqual(r + 3);
      }
      for (let i = 0; i < homes.length; i++) {
        for (let j = i + 1; j < homes.length; j++) {
          expect(Math.hypot(homes[i].x - homes[j].x, homes[i].z - homes[j].z), `${a} ${i}/${j}`).toBeGreaterThanOrEqual(7);
        }
      }
    }
  });

  it('every roaming circle (6m, 16 samples) is at least 12/16 clan ground', () => {
    for (const a of CAMPED) {
      const ok = clanWalkableFor(built[a], a);
      for (const h of homesOf(a)) {
        const n = circle(h.x, h.z, 6, 16).filter((p) => ok(p.x, p.z)).length;
        expect(n, `${a} home ${h.x.toFixed(1)},${h.z.toFixed(1)}`).toBeGreaterThanOrEqual(12);
      }
    }
  });

  it('no seat or roaming home is in water or a wade band, a keep-out, or on the Pines\' truce ground', () => {
    for (const a of CAMPED) {
      const area = built[a];
      const L = campLayout(a);
      const spots = [...seatsOf(L), ...homesOf(a).flatMap((h) => [h, ...circle(h.x, h.z, 2, 8)])];
      for (const s of spots) {
        expect(waterClearance(area.waters, s.x, s.z), `${a} ${s.x},${s.z}`).toBeGreaterThanOrEqual(CAT_RADIUS);
        expect(keepOutPoint(clanGroundArea(area), s.x, s.z), `${a} keep-out ${s.x},${s.z}`).toEqual({ x: s.x, z: s.z });
        if (a === 'pines') {
          for (const seg of TRUCE_PATH) expect(segDist(s.x, s.z, seg) - 1.5, `truce ${s.x},${s.z}`).toBeGreaterThanOrEqual(3);
          expect(Math.hypot(s.x - BRIDGE_FOOT.x, s.z - BRIDGE_FOOT.z)).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it('clanWalkableFor refuses water, the island and the truce path, and accepts open ground', () => {
    const ok = clanWalkableFor(built.pines, 'pines');
    const [x1, z1] = TRUCE_PATH[1];
    expect(ok(x1, z1)).toBe(false); // on the truce path
    expect(ok(BRIDGE_FOOT.x, BRIDGE_FOOT.z)).toBe(false);
    expect(ok(PINES_ISLAND.x, PINES_ISLAND.z)).toBe(false);
    const pond = built.woods.waters.find((w) => w.id === 'pond');
    expect(clanWalkableFor(built.woods, 'woods')(pond.x, pond.z)).toBe(false);
    expect(clanWalkableFor(built.woods, 'woods')(pond.x, pond.z + pond.r - 0.2)).toBe(false); // the wade band
    const L = campLayout('woods');
    expect(clanWalkableFor(built.woods, 'woods')(L.seats.deputy.x, L.seats.deputy.z)).toBe(true);
    // an area with no keep-out passes on walkability alone
    expect(clanWalkableFor({}, 'park')(1, 1)).toBe(true);
  });

  it('nothing the player must reach sits inside the den or the rock', () => {
    for (const a of CAMPED) {
      const L = campLayout(a);
      const things = [
        ...(built[a].collectibles || []), ...(built[a].scenics || []), ...GOLD_MICE[a],
        ...(built[a].perches || []).filter((p) => p.label),
      ];
      for (const t of things) {
        // a den with r 0 is a cave den (the Gorge's): no dome to be inside
        for (const p of [L.den, L.rock].filter((q) => q.r > 0)) expect(Math.hypot(t.x - p.x, t.z - p.z), `${a} ${t.x},${t.z}`).toBeGreaterThan(p.r);
      }
    }
  });
});

// Review Focus 1: a kid who isn't CliffClan climbing past the camp. The real
// patrol, the real ground, walk.js's own walkability.
describe('the Gorge\'s camp on its ledge', () => {
  it('the chase in the Gorge lands on the ledge, outside the camp, never over the lip', () => {
    const area = built.gorge;
    const { ground } = area;
    const isWalkable = (x, z) => isWalkableAt(area, x, z);
    const clanGround = clanWalkableFor(area, 'gorge');
    const pts = patrolPath('gorge');
    const lap = pts.reduce((t, p, i) => {
      const q = pts[(i + 1) % pts.length];
      return t + Math.hypot(q.x - p.x, q.z - p.z);
    }, 0) / PATROL_SPEED;
    const patrol = [];
    for (let t = 0; t <= lap; t += 0.25) patrol.push(patrolAt('gorge', t));
    const { cx, cz, r } = DISCS.gorge;
    const cells = [];
    const grid = (x0, x1, z0, z1) => {
      for (let x = Math.floor(x0 / 0.5) * 0.5 + 0.25; x < x1; x += 0.5) {
        for (let z = Math.floor(z0 / 0.5) * 0.5 + 0.25; z < z1; z += 0.5) cells.push({ x, z });
      }
    };
    grid(cx - r, cx + r, cz - r, cz + r);
    grid(CAMP_DEN.minX, CAMP_DEN.maxX, CAMP_DEN.minZ, CAMP_DEN.maxZ);
    const inDen = (p) => p.x >= CAMP_DEN.minX && p.x <= CAMP_DEN.maxX && p.z >= CAMP_DEN.minZ && p.z <= CAMP_DEN.maxZ;
    let n = 0;
    let denFront = 0;
    for (const cat of cells) {
      if (!isTrespassing('gorge', cat.x, cat.z) || !clanGround(cat.x, cat.z)) continue;
      const out = patrol.map((p) => chaseOutcome('gorge', cat, p)).find((o) => o.chased);
      if (!out) continue;
      const at = `${cat.x},${cat.z}`;
      expect(inDen(cat) && cat.x > 22, `den back chased at ${at}`).toBe(false);
      if (inDen(cat) && cat.x < 21.5) denFront++;
      const land = findLanding('gorge', out.to, isWalkable, { ground, from: cat });
      expect(land, at).not.toBeNull();
      expect(isTrespassing('gorge', land.x, land.z), at).toBe(false);
      expect(ground.y(land.x, land.z), `${at} -> ${land.x},${land.z}`).toBe(8);
      expect(ground.canStep(cat.x, cat.z, land.x, land.z), at).toBe(true);
      n++;
    }
    expect(n).toBeGreaterThanOrEqual(40);
    expect(denFront).toBeGreaterThan(0);
  });
});

// Every intruder route against the REAL built territories (Clan Life Part 2,
// ruling R1). The flee runs back along the route, so these checks cover it too.
describe('intruder routes in the real territories', () => {
  // Which edge of each territory faces which neighbour, from each map's
  // "WHERE ITS EDGES FACE" note (x east, z south, so north is -z).
  const FACING = {
    woods: { moor: 'north', river: 'west' },
    river: { pines: 'north', woods: 'east' },
    moor: { woods: 'south', pines: 'west', gorge: 'east' },
    pines: { river: 'south', moor: 'east' },
    gorge: { moor: 'west' },
  };
  const edgeGaps = (b, p) => ({ north: p.z - b.minZ, south: b.maxZ - p.z, west: p.x - b.minX, east: b.maxX - p.x });
  const nearestEdge = (b, p) => Object.entries(edgeGaps(b, p)).sort((m, n) => m[1] - n[1])[0];
  const routes = () => Object.entries(INTRUDER_ROUTES).flatMap(([a, byClan]) => Object.entries(byClan).map(([clan, route]) => ({ a, clan, route })));
  const samples = (route) => {
    const out = [];
    for (let i = 0; i + 1 < route.length; i++) {
      const p = route[i], q = route[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) / 0.5));
      for (let j = 0; j <= n; j++) out.push({ x: p.x + ((q.x - p.x) * j) / n, z: p.z + ((q.z - p.z) * j) / n });
    }
    return out;
  };

  it('covers every territory with a camp, with a route for each neighbour', () => {
    expect(routes()).toHaveLength(10);
    for (const a of ['woods', 'river', 'moor', 'pines', 'gorge']) expect(Object.keys(INTRUDER_ROUTES[a]).sort()).toEqual(Object.keys(FACING[a]).sort());
  });

  it('starts on the edge facing its clan and ends on an edge', () => {
    for (const { a, clan, route } of routes()) {
      const b = built[a].bounds;
      const [edge, gap] = nearestEdge(b, route[0]);
      expect(edge, `${a}.${clan} enters`).toBe(FACING[a][clan]);
      expect(gap, `${a}.${clan} enters`).toBeLessThanOrEqual(1.5);
      expect(nearestEdge(b, route[route.length - 1])[1], `${a}.${clan} leaves`).toBeLessThanOrEqual(1.5);
    }
  });

  it('every point every 0.5m is clan ground and clears every collider by the cat\'s radius', () => {
    for (const { a, clan, route } of routes()) {
      const area = built[a];
      const ok = clanWalkableFor(area, a);
      for (const p of samples(route)) {
        const at = `${a}.${clan} ${p.x.toFixed(2)},${p.z.toFixed(2)}`;
        expect(isWalkableAt(area, p.x, p.z), at).toBe(true);
        expect(ok(p.x, p.z), at).toBe(true);
        for (const c of area.colliders) expect(Math.hypot(p.x - c.x, p.z - c.z), at).toBeGreaterThanOrEqual(c.r + CAT_RADIUS);
      }
    }
  });

  it('never crosses water, not even on a deck, so the intruder always walks on the ground', () => {
    for (const { a, clan, route } of routes()) {
      const undecked = built[a].waters.map((w) => ({ ...w, decks: [] }));
      for (const p of samples(route)) {
        expect(waterClearance(undecked, p.x, p.z), `${a}.${clan} ${p.x.toFixed(2)},${p.z.toFixed(2)}`).toBeGreaterThanOrEqual(CAT_RADIUS);
      }
    }
  });

  it('keeps 3m beyond the camp\'s edge, and off the Pines\' truce ground and the island', () => {
    const segDist = (x, z, [x1, z1, x2, z2]) => {
      const dx = x2 - x1, dz = z2 - z1;
      const t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz)));
      return Math.hypot(x - (x1 + t * dx), z - (z1 + t * dz));
    };
    for (const { a, clan, route } of routes()) {
      const { cx, cz, r } = DISCS[a];
      for (const p of samples(route)) {
        const at = `${a}.${clan} ${p.x.toFixed(2)},${p.z.toFixed(2)}`;
        expect(Math.hypot(p.x - cx, p.z - cz), at).toBeGreaterThanOrEqual(r + 3);
        expect(keepOutPoint(built[a], p.x, p.z), at).toEqual({ x: p.x, z: p.z });
        if (a === 'pines') {
          for (const seg of TRUCE_PATH) expect(segDist(p.x, p.z, seg) - 1.5, at).toBeGreaterThanOrEqual(3);
          expect(Math.hypot(p.x - BRIDGE_FOOT.x, p.z - BRIDGE_FOOT.z), at).toBeGreaterThanOrEqual(3);
          expect(Math.hypot(p.x - PINES_ISLAND.x, p.z - PINES_ISLAND.z), at).toBeGreaterThan(PINES_ISLAND.r);
        }
      }
    }
  });

  it('is no longer than ROUTE_MAX', () => {
    for (const { a, clan, route } of routes()) expect(routeLength(route), `${a}.${clan}`).toBeLessThanOrEqual(ROUTE_MAX);
  });
});
