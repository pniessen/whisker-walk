import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { canvasStub } from './helpers/growriver.js';

// The headless document stub every world test uses (test/flattrace.test.js's):
// the build draws on canvases.
vi.stubGlobal('document', canvasStub);

const {
  HOUSE_GOLD_MICE, HOUSE_KNOCKABLES, HOUSE_HIDES, HOUSE_MICE, HOUSE_YARN_SPOTS, HOUSE_SCENICS, HOUSE_FINDS,
  HOUSE_GOAL_TYPES, HOUSE_MAP_GROUND, houseMapShapes, toyStop,
} = await import('../src/world/housethings.js');
const {
  HOUSE_ROOMS, HOUSE_STAIRS, HOUSE_DOORWAYS, HOUSE_LEDGES, HOUSE_BOUNDS, HOUSE_LEVELS, SECRET_BOOKCASE, HOUSE_FURNITURE, TALL_H, houseArea, houseSections, roomAt, stairAt,
} = await import('../src/world/houseplan.js');
const { houseMovesArea } = await import('../src/world/housemoves.js');
const { GOLD_MICE, GOLD_TOTAL } = await import('../src/goldmice.js');
const { isPropId, KNOCK_KINDS } = await import('../src/propsets.js');
const { createCritters, HIDE_REACH } = await import('../src/critters.js');
const { createToy } = await import('../src/toy.js');
const { isWalkableAt } = await import('../src/player.js');
const { BASE_ABILITIES } = await import('../src/traversal.js');
const { phrase } = await import('../src/clanphrases.js');
const { houseFlood } = await import('./helpers/houseflood.js');
const { floodTraversal } = await import('./helpers/traversalflood.js');
const { withOffWords } = await import('./helpers/offwords.js');
const { build } = await import('../src/world/house.js');

// =============================================================================
// The Old House, step 2, Task 4 (rulings D4-D6, D10-D14): the finds, placed as data.
// Golden mice, knock-overs, mice and their cover, the yarn ball's spots and walls,
// the special places, the six discoveries' spots, the goals and the corner map.
// =============================================================================

const area = houseMovesArea();
const flood = houseFlood(houseArea());
const tflood = floodTraversal(area, { abilities: BASE_ABILITIES });
const home = tflood.regionAt(area.spawn.x, area.spawn.z);
const reachable = tflood.reachable(home);
const scene = new THREE.Scene();
const record = build(scene);
scene.updateMatrixWorld(true);

const ledgeById = (id) => HOUSE_LEDGES.find((l) => l.id === id);
const inRect = (r, x, z) => x >= r.minX - 1e-9 && x <= r.maxX + 1e-9 && z >= r.minZ - 1e-9 && z <= r.maxZ + 1e-9;
const roomLevel = (id) => HOUSE_ROOMS.find((r) => r.id === id).level;
const levelY = (id) => HOUSE_LEVELS.find((l) => l.id === id).y;
const nearestPerch = (k) => [...record.perches].sort((a, b) => Math.hypot(a.x - k.x, a.z - k.z) - Math.hypot(b.x - k.x, b.z - k.z))[0];
const inEachWordSet = (fn) => [fn(), withOffWords(fn)];
// the ledge a spot is on: it lies in its footprint, and the ground there is its top
const onLedge = (l, x, z) => inRect(l, x, z) && Math.abs(area.ground.y(x, z) - l.y) < 1e-6;
// a ledge top she can get onto from the spawn, and back down from
const ledgeReached = (l) => {
  const r = tflood.regionAt((l.minX + l.maxX) / 2, (l.minZ + l.maxZ) / 2, l.y);
  return r >= 0 && reachable.has(r) && tflood.reachable(r).has(home);
};
// every place a move starts or ends on a ledge: where she stands up there
const moveEnds = () => [
  ...area.traversal.hops.flatMap((h) => [{ x: h.x0, z: h.z0 }, { x: h.x1, z: h.z1 }]),
  ...area.traversal.crossings.flatMap((c) => c.ends.map((e) => ({ x: e.x, z: e.z }))),
];
const ray = new THREE.Raycaster();
const meshes = [];
scene.traverse((o) => { if (o.isMesh && !o.userData.houseSimple) meshes.push(o); }); // the far levels' stand-ins are not the pieces
const topAt = (x, z, fromY) => {
  ray.set(new THREE.Vector3(x, fromY, z), new THREE.Vector3(0, -1, 0));
  ray.far = fromY + 5;
  return ray.intersectObjects(meshes, false)[0]?.point.y ?? null;
};

describe('the golden mice (D5)', () => {
  it("the house's golden mice are GOLD_MICE.house", () => {
    expect(GOLD_MICE.house).toEqual(HOUSE_GOLD_MICE);
  });

  it('three golden mice, two up a climb and one tucked away in the cellar', () => {
    expect(HOUSE_GOLD_MICE.map((m) => m.id)).toEqual(['gm-house-1', 'gm-house-2', 'gm-house-3']);
    for (const m of HOUSE_GOLD_MICE) {
      expect(m.id).toMatch(/^gm-[a-z]{1,24}-[1-9]$/);
      expect(m.y, m.id).toBe(0);
    }
    expect(GOLD_TOTAL).toBe(54); // 42 until the Old House's three joined the count
    const [one, two, three] = HOUSE_GOLD_MICE;
    for (const [m, id] of [[one, 'library-books-w'], [two, 'bedroom-wardrobe']]) {
      const l = ledgeById(id);
      expect(onLedge(l, m.x, m.z), m.id).toBe(true);
      expect(ledgeReached(l), m.id).toBe(true);
      // she stands within checkFind's 1.0 m of it up there: a move lands her or takes off near it
      const near = moveEnds().filter((e) => onLedge(l, e.x, e.z)).map((e) => Math.hypot(e.x - m.x, e.z - m.z));
      expect(Math.min(...near), m.id).toBeLessThanOrEqual(1.0);
    }
    expect(roomAt(three.x, three.z)).toBe('cellar');
    expect(flood.reachesWithin(three.x, three.z, 0.9)).toBe(true);
    // between the barrels and the crates, on the floor
    expect(area.ground.y(three.x, three.z)).toBe(levelY('cellar'));
  });
});

describe('the knock-overs (D4)', () => {
  it('every knockable stands on a perch at its height and falls onto its own room\'s floor', () => {
    // six, and the east wing's four: a cup on the coffee table, a book on the kids' desk, a cup on the basin, a can on the cistern
    expect(HOUSE_KNOCKABLES.map((k) => k.kind).sort()).toEqual(['book', 'book', 'book', 'can', 'can', 'cup', 'cup', 'cup', 'cup', 'flowerpot']);
    expect(new Set(HOUSE_KNOCKABLES.map((k) => k.id)).size).toBe(10);
    for (const k of HOUSE_KNOCKABLES) {
      expect(isPropId(k.id) && KNOCK_KINDS.includes(k.kind), k.id).toBe(true);
      expect(k.id).toMatch(new RegExp(`^house-${k.kind}-[1-9]$`));
      const p = nearestPerch(k);
      expect(Math.abs(p.y - k.y), k.id).toBeLessThan(0.01);
      const d = Math.hypot(p.x - k.x, p.z - k.z);
      expect(d, k.id).toBeGreaterThanOrEqual(0.35);
      expect(d, k.id).toBeLessThanOrEqual(0.6);
      expect(roomAt(k.fallTo.x, k.fallTo.z), k.id).toBe(roomAt(k.x, k.z));
      expect(isWalkableAt(area, k.fallTo.x, k.fallTo.z), k.id).toBe(true);
      const drop = Math.hypot(k.fallTo.x - k.x, k.fallTo.z - k.z);
      expect(drop, k.id).toBeGreaterThanOrEqual(0.6);
      expect(drop, k.id).toBeLessThanOrEqual(1.6);
      // standing on the piece's real top as drawn, and landing on the real floor
      const floorY = levelY(roomLevel(roomAt(k.x, k.z)));
      expect(topAt(k.x, k.z, floorY + k.y + 0.4), k.id).toBeCloseTo(floorY + k.y, 2);
      expect(topAt(k.fallTo.x, k.fallTo.z, floorY + 0.5), k.id).toBeCloseTo(floorY, 1);
    }
    for (let i = 0; i < HOUSE_KNOCKABLES.length; i++) {
      for (let j = i + 1; j < HOUSE_KNOCKABLES.length; j++) {
        const a = HOUSE_KNOCKABLES[i].fallTo;
        const b = HOUSE_KNOCKABLES[j].fallTo;
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(0.5);
      }
    }
  });
});

describe('the mice (D10)', () => {
  it('four mice, two in the kitchen and two in the cellar, each with cover in its room and none nearer elsewhere', () => {
    expect(HOUSE_MICE.map((m) => m.room)).toEqual(['kitchen', 'kitchen', 'cellar', 'cellar']);
    expect(HOUSE_HIDES.map((h) => h.room)).toEqual(['kitchen', 'kitchen', 'cellar', 'cellar']);
    for (const h of HOUSE_HIDES) {
      expect(roomAt(h.x, h.z)).toBe(h.room);
      expect(flood.reachesWithin(h.x, h.z, 1.0), `${h.x},${h.z}`).toBe(true);
    }
    for (const m of HOUSE_MICE) {
      expect(m.type).toBe('mouse');
      for (const [x, z] of [[m.x, m.z], [m.x2, m.z2]]) {
        expect(roomAt(x, z), `${x},${z}`).toBe(m.room);
        expect(flood.reachesWithin(x, z, 0.5), `${x},${z}`).toBe(true);
        const level = HOUSE_HIDES.filter((h) => area.ground.sameLevel(x, z, h.x, h.z));
        const nearest = level.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0];
        expect(nearest.room).toBe(m.room);
      }
    }
    expect(record.critterSpawns).toEqual(HOUSE_MICE.map(({ room, ...rest }) => rest)); // eslint-disable-line no-unused-vars
    expect(record.hides).toBe(HOUSE_HIDES);
  });

  it('the mice keep to their rooms: chased from every side, none crosses a wall, each ends hidden in its room', () => {
    const dt = 1 / 60;
    const cat = new THREE.Vector3();
    const to = new THREE.Vector3();
    let runs = 0;
    for (const m of HOUSE_MICE) {
      for (let a = 0; a < 8; a++) {
        const s = new THREE.Scene();
        const { room, ...def } = m;
        const critters = createCritters(s, [def], { ground: area.ground, hides: HOUSE_HIDES, rng: () => 0.5, motionRng: () => 0.5 });
        const mouse = critters.list[0];
        const ang = (a * Math.PI) / 4;
        cat.set(m.x + 5 * Math.cos(ang), 0, m.z + 5 * Math.sin(ang));
        let t = 0;
        for (let i = 0; i < 600; i++) {
          t += dt;
          to.copy(mouse.group.position).sub(cat).setY(0);
          if (to.length() > 0.3) cat.addScaledVector(to.normalize(), Math.min(3.5 * dt, to.length()));
          cat.y = area.ground.y(cat.x, cat.z);
          critters.update(dt, t, cat, cat);
          const p = mouse.group.position;
          expect(roomAt(p.x, p.z), `${room} mouse from ${a} at frame ${i}`).toBe(room);
        }
        expect(mouse.hidden, `${room} mouse from ${a}`).toBe(true);
        const p = mouse.group.position;
        const cover = HOUSE_HIDES.filter((h) => Math.hypot(h.x - p.x, h.z - p.z) <= HIDE_REACH + 1e-6);
        expect(cover.map((h) => h.room), `${room} mouse from ${a}`).toEqual([room]);
        critters.dispose();
        runs++;
      }
    }
    expect(runs).toBe(32);
  }, 60_000);
});

describe('the yarn ball (D14)', () => {
  it('the yarn ball\'s spots are clear floor, and say where in words in both sets', () => {
    expect(HOUSE_YARN_SPOTS.map((s) => s.words)).toEqual(['house.yarn.hall', 'house.yarn.kitchen']);
    expect(HOUSE_YARN_SPOTS.map((s) => roomAt(s.x, s.z))).toEqual(['hall', 'kitchen']);
    for (const s of HOUSE_YARN_SPOTS) {
      expect(flood.reachesWithin(s.x, s.z, 0.3), s.words).toBe(true);
      for (const c of area.colliders) {
        if (Math.abs(levelY(c.level) - area.ground.y(s.x, s.z)) > 0.5) continue;
        expect(Math.hypot(c.x - s.x, c.z - s.z) - c.r, s.words).toBeGreaterThanOrEqual(0.6);
      }
      // on the floor, not a ledge
      expect(area.ground.y(s.x, s.z)).toBe(levelY('ground'));
      for (const w of inEachWordSet(() => phrase(s.words))) {
        expect(typeof w).toBe('string');
        expect(w.length).toBeGreaterThan(0);
      }
    }
    expect(record.yarnSpots).toEqual(HOUSE_YARN_SPOTS.map((s) => ({ x: s.x, z: s.z, where: phrase(s.words) })));
  });

  it('toyStop: nothing within a room or through a doorway or stair mouth; a wall stops the ball 0.3 m inside', () => {
    expect(toyStop(-9, 6, -8, 7)).toBe(null); // inside the library
    expect(toyStop(-3, 7, -5, 7)).toBe(null); // the hall to the library, through the doorway
    expect(toyStop(0, 2.5, 0, 1.5)).toBe(null); // the hall onto the main stair
    expect(toyStop(14.5, -5, 13.5, -5)).toBe(null); // off the cellar stair into the kitchen
    const s = toyStop(-3, 4, -5, 4); // the hall into the library through the wall
    expect(s.x).toBeCloseTo(-3.7, 6);
    expect(s.z).toBeCloseTo(4, 6);
    // the shut bookcase is a wall; open, its mouth lets the ball through
    const shut = toyStop(-6, 2.2, -6, 1.8);
    expect(shut.z).toBeCloseTo(2.3, 6);
    expect(toyStop(-6, 2.2, -6, 1.8, { secretOpen: true })).toBe(null);
  });

  it('a ball batted at any wall stops at it; through a doorway it rolls on', () => {
    const dt = 1 / 60;
    const s = new THREE.Scene();
    const toy = createToy(s, { ground: area.ground, rng: () => 0.5 });
    const dir = new THREE.Vector3();
    const from = new THREE.Vector3();
    // bat the ball from (x, z) toward (dx, dz) at 6 m/s for 3 s; returns the rooms it was in
    const bat = (x, z, dx, dz, opts) => {
      toy.retrieve();
      from.set(x, area.ground.y(x, z) + 0.13, z);
      dir.set(dx, 0, dz).normalize();
      toy.throwFrom(from, dir, 6);
      const seen = [];
      for (let i = 0; i < 180; i++) {
        const px = toy.mesh.position.x;
        const pz = toy.mesh.position.z;
        toy.update(dt, HOUSE_BOUNDS);
        const stop = toyStop(px, pz, toy.mesh.position.x, toy.mesh.position.z, opts);
        if (stop) {
          toy.mesh.position.x = stop.x;
          toy.mesh.position.z = stop.z;
        }
        const r = roomAt(toy.mesh.position.x, toy.mesh.position.z) ?? stairAt(toy.mesh.position.x, toy.mesh.position.z);
        if (seen[seen.length - 1] !== r) seen.push(r);
      }
      return seen;
    };
    let walls = 0;
    for (const sec of houseSections()) {
      if (sec.kind !== 'wall') continue;
      const mx = (sec.x0 + sec.x1) / 2;
      const mz = (sec.z0 + sec.z1) / 2;
      const alongX = Math.abs(sec.z1 - sec.z0) < 1e-9;
      for (const side of [-1, 1]) {
        const x = alongX ? mx : mx + side;
        const z = alongX ? mz + side : mz;
        const room = roomAt(x, z);
        if (!room) continue;
        expect(bat(x, z, mx - x, mz - z), `${sec.id} from ${room}`).toEqual([room]);
        walls++;
      }
    }
    expect(walls).toBeGreaterThan(70);
    for (const r of HOUSE_ROOMS) {
      for (const [cx, cz, sx, sz] of [[r.minX, r.minZ, 1, 1], [r.maxX, r.minZ, -1, 1], [r.minX, r.maxZ, 1, -1], [r.maxX, r.maxZ, -1, -1]]) {
        expect(bat(cx + sx, cz + sz, -sx, -sz), `${r.id} corner ${cx},${cz}`).toEqual([r.id]);
      }
    }
    for (const d of HOUSE_DOORWAYS) {
      const [a, b] = d.rooms;
      for (const [one, two] of [[a, b], [b, a]]) {
        // a point 1.5 m into `one` from the doorway, batted straight through it
        const n = d.axis === 'x' ? [1, 0] : [0, 1];
        const sign = roomAt(d.x + n[0] * 1.5, d.z + n[1] * 1.5) === one ? 1 : -1;
        const seen = bat(d.x + sign * n[0] * 1.5, d.z + sign * n[1] * 1.5, -sign * n[0], -sign * n[1]);
        expect(seen, `${d.id} from ${one}`).toEqual([one, two]);
      }
    }
    // the shut bookcase: batted at it from the library, the ball stays in the library
    expect(bat(SECRET_BOOKCASE.x, SECRET_BOOKCASE.z + 1.5, 0, -1)).toEqual(['library']);
    // open, the same bat sends it into the mouth of the secret stair
    expect(bat(SECRET_BOOKCASE.x, SECRET_BOOKCASE.z + 1.5, 0, -1, { secretOpen: true })[1]).toBe('secret');
  }, 60_000);
});

describe('the special places and the discoveries (D6, D13)', () => {
  it('three special places, named in both word sets, and the east wing\'s two, in plain words', () => {
    expect(HOUSE_SCENICS.map((s) => s.id)).toEqual(['clock', 'fireside', 'attic-window', 'sunroom', 'bunks']);
    expect(HOUSE_SCENICS.map((s) => roomAt(s.x, s.z))).toEqual(['hall', 'parlour', 'attic', 'solarium', 'kids']);
    for (const s of HOUSE_SCENICS.slice(0, 3)) {
      expect(s.words).toBe(`house.scenic.${s.id}`);
      for (const w of inEachWordSet(() => phrase(s.words))) expect(w.length).toBeGreaterThan(0);
    }
    for (const s of HOUSE_SCENICS.slice(3)) {
      expect(s.words).toBeUndefined(); // no line in the phrase table: the start-up chunk is not touched
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.label).not.toMatch(/twoleg|clan|thunder|shadow|river|wind|star|warrior|kittypet/i);
    }
    expect(record.scenics).toEqual(HOUSE_SCENICS.map((s) => ({ id: s.id, x: s.x, z: s.z, label: s.label ?? phrase(s.words) })));
  });

  it('every special place and find is on ground she can reach in its room', () => {
    for (const s of HOUSE_SCENICS) expect(flood.reachesWithin(s.x, s.z, 0.5), s.id).toBe(true);
    expect(HOUSE_FINDS.map((f) => [f.id, f.room, f.trigger])).toEqual([
      ['clock', 'hall', 'stay'], ['piano', 'parlour', 'along'], ['window', 'attic', 'arrive'],
      ['bookcase', 'library', 'secret'], ['cushion', 'parlour', 'still'], ['toys', 'attic', 'stay'],
    ]);
    const byId = Object.fromEntries(HOUSE_FINDS.map((f) => [f.id, f]));
    expect([byId.clock.r, byId.clock.holdS]).toEqual([1.2, 1.0]);
    expect([byId.bookcase.r, byId.bookcase.holdS]).toEqual([SECRET_BOOKCASE.reach, SECRET_BOOKCASE.holdS]);
    expect([byId.bookcase.r, byId.bookcase.holdS]).toEqual([1.1, 0.6]);
    expect([byId.cushion.r, byId.cushion.holdS]).toEqual([0.35, 1.5]);
    expect([byId.toys.r, byId.toys.holdS]).toEqual([1.0, 0.5]);
    expect(byId.piano.ledge).toBe('parlour-keys');
    expect(byId.window.ledge).toBe('attic-seat');
    for (const f of HOUSE_FINDS) {
      expect(roomAt(f.x, f.z), f.id).toBe(f.room);
      expect(f.r, f.id).toBeGreaterThan(0);
      expect(f.holdS, f.id).toBeGreaterThanOrEqual(0);
      if (f.ledge) {
        const l = ledgeById(f.ledge);
        expect(onLedge(l, f.x, f.z), f.id).toBe(true);
        expect(ledgeReached(l), f.id).toBe(true);
      } else {
        expect(flood.reachesWithin(f.x, f.z, f.r), f.id).toBe(true);
      }
    }
    expect(record.house.finds).toBe(HOUSE_FINDS);
  });

  it('the new pieces stand where the finds need them: the pantry and its sacks, the toy box, the cushion', () => {
    const piece = (id) => HOUSE_FURNITURE.find((f) => f.id === id);
    const pantry = piece('kitchen-pantry');
    expect([pantry.room, pantry.h, pantry.ledge ?? false]).toEqual(['kitchen', 2.0, false]);
    expect(pantry.h).toBeGreaterThanOrEqual(TALL_H); // tall: it fades
    expect(pantry.x + pantry.d / 2).toBeCloseTo(14 - 0.1, 6); // its back on the east wall's face
    expect([pantry.w, pantry.d]).toEqual([1.2, 0.5]);
    expect(piece('kitchen-sacks').room).toBe('kitchen');
    const box = piece('attic-toybox');
    expect([box.room, box.w, box.d, box.h]).toEqual(['attic', 0.8, 0.5, 0.5]);
    const cushion = piece('parlour-cushion');
    expect([cushion.room, cushion.w, cushion.d, cushion.r]).toEqual(['parlour', 0.7, 0.7, 0]);
    const byId = Object.fromEntries(HOUSE_FINDS.map((f) => [f.id, f]));
    expect(Math.hypot(cushion.x - byId.cushion.x, cushion.z - byId.cushion.z)).toBeLessThan(0.05);
    expect(Math.hypot(box.x - byId.toys.x, box.z - byId.toys.z)).toBeLessThanOrEqual(byId.toys.r + 0.5);
    // the pantry's cover is under it
    expect(HOUSE_HIDES.some((h) => Math.abs(h.x - pantry.x) <= pantry.d / 2 && Math.abs(h.z - pantry.z) <= pantry.w / 2)).toBe(true);
  });
});

describe('the goals and the corner map (D11, D12)', () => {
  it('each goal type has something to finish in the house', () => {
    expect(HOUSE_GOAL_TYPES).toEqual(['mischief', 'photo', 'play', 'sits', 'scenic']); // `sits`: the wing's blanket fort and laundry basket
    expect(Object.isFrozen(HOUSE_GOAL_TYPES)).toBe(true);
    expect(HOUSE_KNOCKABLES.length).toBeGreaterThanOrEqual(3);
    expect(HOUSE_SCENICS.length).toBeGreaterThanOrEqual(2);
    expect(HOUSE_YARN_SPOTS.length).toBe(2);
    expect(record.goalTypes).toBe(HOUSE_GOAL_TYPES);
    expect(record.knockables).toBe(HOUSE_KNOCKABLES);
    expect(record.goldMice).toBeUndefined(); // the walk lays them from GOLD_MICE.house
  });

  it('the corner map\'s shapes are the rooms, the stairs and the walls, with the doorways open', () => {
    const shapes = houseMapShapes();
    expect(record.mapShapes).toEqual(shapes);
    expect(record.mapGround).toBe(HOUSE_MAP_GROUND);
    expect(HOUSE_MAP_GROUND).toBe(0x6f9a52);
    for (const s of shapes) expect(['ledge', 'rock']).toContain(s.tone);
    const ledges = shapes.filter((s) => s.tone === 'ledge');
    for (const r of HOUSE_ROOMS) {
      expect(ledges.some((s) => s.minX === r.minX && s.maxX === r.maxX && s.minZ === r.minZ && s.maxZ === r.maxZ), r.id).toBe(true);
    }
    // every stair is drawn, the secret one too (ruling S2-7)
    for (const st of HOUSE_STAIRS) {
      const mx = (st.x0 + st.x1) / 2;
      const mz = (st.z0 + st.z1) / 2;
      expect(ledges.some((s) => inRect(s, mx, mz)), st.id).toBe(true);
    }
    // the walls are 0.5 m strips, ledges first so the walls lie over them
    const rocks = shapes.filter((s) => s.tone === 'rock');
    expect(rocks.length).toBeGreaterThan(80);
    for (const s of rocks) expect(Math.min(s.maxX - s.minX, s.maxZ - s.minZ)).toBeCloseTo(0.5, 6);
    expect(shapes.findIndex((s) => s.tone === 'rock')).toBeGreaterThan(shapes.findLastIndex((s) => s.tone === 'ledge'));
    const strictlyIn = (s, x, z) => x > s.minX + 1e-9 && x < s.maxX - 1e-9 && z > s.minZ + 1e-9 && z < s.maxZ - 1e-9;
    for (const d of HOUSE_DOORWAYS) expect(rocks.some((s) => strictlyIn(s, d.x, d.z)), d.id).toBe(false);
    // the stairs' mouths are open, but for the secret stair's in the library: the
    // shut bookcase's line (z = 2, x -7.2..-4.8) is wall, so the bookcase stays a
    // surprise; its bedroom end is a real way down and stays open (ruling S2-7)
    const lib = { x: SECRET_BOOKCASE.x, z: SECRET_BOOKCASE.z };
    for (const st of HOUSE_STAIRS) {
      for (const [x, z] of [[st.x0, st.z0], [st.x1, st.z1]]) {
        const shut = st.id === 'secret' && x === lib.x && z === lib.z;
        expect(rocks.some((s) => strictlyIn(s, x, z)), `${st.id} ${x},${z}`).toBe(shut);
      }
    }
    const shutStrip = rocks.filter((s) => strictlyIn(s, lib.x, lib.z));
    expect(shutStrip).toHaveLength(1);
    expect(shutStrip[0].minX).toBeCloseTo(SECRET_BOOKCASE.x - SECRET_BOOKCASE.w / 2, 6);
    expect(shutStrip[0].maxX).toBeCloseTo(SECRET_BOOKCASE.x + SECRET_BOOKCASE.w / 2, 6);
    expect([shutStrip[0].minZ, shutStrip[0].maxZ]).toEqual([SECRET_BOOKCASE.z - 0.25, SECRET_BOOKCASE.z + 0.25]);
    // every wall section's middle is under a strip, the secret stair's sides too
    for (const q of houseSections()) {
      if (q.kind === 'lintel') continue;
      expect(rocks.some((s) => inRect(s, (q.x0 + q.x1) / 2, (q.z0 + q.z1) / 2)), q.id).toBe(true);
    }
  });
});
