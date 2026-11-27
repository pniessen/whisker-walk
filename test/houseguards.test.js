import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { canvasStub } from './helpers/growriver.js';

// The headless document stub every world test uses (test/flattrace.test.js's):
// createPlayer listens on it, and the cats draw on canvases.
vi.stubGlobal('document', canvasStub);

const {
  HOUSE_LEDGES, HOUSE_FURNITURE, HOUSE_LEVELS, HOUSE_SPAWN, TALL_H, LEDGE_STANDOFF, LEDGE_RIM, GUARD_BODY, LEDGE_ON,
  HEAD_REACH, BODY_REACH, HEAD_CLEAR, CAT_SCALE_MAX, ledgeStandoff, houseArea, houseFloorGround, houseLedgeGuards, roomAt,
} = await import('../src/world/houseplan.js');
await (await import('../src/world/housestages.js')).loadHouseStages(); // the wing's lazy stage (housestagewing.js) fills the house's wing slots
const { pianoKeyAt } = await import('../src/world/houseparts.js');
const { HOUSE_MOVES } = await import('../src/world/housemoves.js');
const { HOUSE_FINDS } = await import('../src/world/housethings.js');
const { createLedgeGuards, catScale } = await import('../src/world/houseguards.js');
const { CAT_RADIUS, isWalkableAt } = await import('../src/player.js');
const { createHouseWalk } = await import('./helpers/housewalk.js');
const { houseFlood } = await import('./helpers/houseflood.js');
const { behindYaw } = await import('../src/traversal.js');
const { buildCat } = await import('../src/cat/model.js');
const { animateCat } = await import('../src/cat/animator.js');
const { catVolumes } = await import('../src/people/reach.js');

// =============================================================================
// The Old House: rough edges 1 and 2 (owner, after step 2). Ledge pieces have no
// colliders (D1), so walking into the piano keys or the bedroom chest from the floor
// her head and shoulders sank into the piece, and on a bookcase top her body hung
// over its front. The guards (houseplan.js houseLedgeGuards, houseguards.js) hold her
// off every ledge piece on the floor and inside a tall top's edges on it.
// =============================================================================

const DT = 1 / 60;
const levelY = (id) => HOUSE_LEVELS.find((l) => l.id === id).y;
const piece = (id) => HOUSE_FURNITURE.find((f) => f.id === id);
const tall = HOUSE_LEDGES.filter((l) => piece(l.id).h >= TALL_H);
const area = houseArea();
const guards = houseLedgeGuards();
const big = houseLedgeGuards(CAT_SCALE_MAX); // a Maine Coon's: the largest
// every cat she can walk as (cat/model.js), and the hen
const BREEDS = ['tabby', 'siamese', 'persian', 'black', 'calico', 'mainecoon', 'zeetoo', 'robbie', 'd2', 'ribbonkit', 'digit', 'hagrid'];
// the low tops beside a taller piece, and the way from one to the other (the review of the rough edges)
const PAIRS = [['parlour-keys', 'parlour-piano', 0, 1], ['library-steps', 'library-books-n2', 0, -1], ['bedroom-chest', 'bedroom-shelf', 0, -1], ['library-bigbooks', 'library-books-w', 0, -1]];
const ledgeOf = (id) => HOUSE_LEDGES.find((l) => l.id === id);
const reaches = (set, x, z) => set.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + GUARD_BODY - 1e-6);
const distToRect = (l, x, z) => Math.hypot(Math.max(l.minX - x, 0, x - l.maxX), Math.max(l.minZ - z, 0, z - l.maxZ));
const onAnyLedge = (x, z, level) => HOUSE_LEDGES.some((q) => q.level === level && x >= q.minX && x <= q.maxX && z >= q.minZ && z <= q.maxZ);
// the floor spots she can stand on by the plan's colliders (the walls, the other furniture)
const standable = (x, z) => isWalkableAt(area, x, z);
// a tall top's edges the wall does not hold (a back within 0.15 m of its room's wall line does)
function openEdges(l) {
  const r = { ...area.rooms.find((q) => q.id === l.room) };
  const out = [];
  if (Math.abs(l.minX - r.minX) > 0.15) out.push(['w', l.minX]);
  if (Math.abs(l.maxX - r.maxX) > 0.15) out.push(['e', l.maxX]);
  if (Math.abs(l.minZ - r.minZ) > 0.15) out.push(['n', l.minZ]);
  if (Math.abs(l.maxZ - r.maxZ) > 0.15) out.push(['s', l.maxZ]);
  return out;
}
const inFromEdge = ([side, at], x, z) => (side === 'w' ? x - at : side === 'e' ? at - x : side === 'n' ? z - at : at - z);

describe('the guards\' circles', () => {
  it('are the player\'s body, tagged, on their ledge\'s level', () => {
    expect(GUARD_BODY).toBe(CAT_RADIUS);
    expect(guards.feet.length).toBeGreaterThan(100);
    // a set on every tall top (its rim) and every low top beside a taller piece
    expect(Object.keys(guards.tops).sort()).toEqual([...tall.map((l) => l.id), ...PAIRS.map((q) => q[0])].sort());
    for (const c of [...guards.feet, ...Object.values(guards.tops).flat(), ...big.feet, ...Object.values(big.tops).flat()]) {
      expect(c.guard).toBe(true);
      expect(c.r).toBeGreaterThan(0);
      expect(Object.isFrozen(c)).toBe(true);
    }
    // none in the plan's own colliders: they stand only while house life holds them
    expect(area.colliders.some((c) => c.guard)).toBe(false);
  });

  it('feet: every floor spot nearer a ledge piece than the standoff is in their reach, for a small and the largest cat', () => {
    const bad = [];
    let n = 0;
    for (const [g, scale] of [[guards, 1], [big, CAT_SCALE_MAX]]) for (const l of HOUSE_LEDGES) {
      const LEDGE_STANDOFF = ledgeStandoff(scale);
      const y = levelY(l.level);
      for (let x = l.minX - LEDGE_STANDOFF; x <= l.maxX + LEDGE_STANDOFF + 1e-9; x += 0.05) {
        for (let z = l.minZ - LEDGE_STANDOFF; z <= l.maxZ + LEDGE_STANDOFF + 1e-9; z += 0.05) {
          const d = distToRect(l, x, z);
          if (d <= 0 || d > LEDGE_STANDOFF - 0.005) continue;
          if (roomAt(x, z) !== l.room || onAnyLedge(x, z, l.level) || Math.abs(area.ground.y(x, z) - y) > 1e-6 || !standable(x, z)) continue;
          n++;
          if (!reaches(g.feet, x, z)) bad.push(`${scale} ${l.id} ${x.toFixed(2)},${z.toFixed(2)} (${d.toFixed(3)} m off it)`);
        }
      }
    }
    expect(n).toBeGreaterThan(2000);
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('rims: on a tall top she stands only where her body is over it, and there is room for her', () => {
    for (const l of tall) {
      const edges = openEdges(l);
      expect(edges.length, l.id).toBeGreaterThan(0);
      let free = 0;
      const bad = [];
      for (let x = l.minX; x <= l.maxX + 1e-9; x += 0.02) {
        for (let z = l.minZ; z <= l.maxZ + 1e-9; z += 0.02) {
          if (!standable(x, z)) continue; // the wall's own reach, behind
          const inside = Math.min(...edges.map((e) => inFromEdge(e, x, z)));
          const held = reaches(guards.tops[l.id], x, z);
          if (inside < LEDGE_RIM - 0.005 && !held) bad.push(`${x.toFixed(2)},${z.toFixed(2)} ${inside.toFixed(3)} m in, not held`);
          if (inside > LEDGE_RIM + 0.005 && held) bad.push(`${x.toFixed(2)},${z.toFixed(2)} ${inside.toFixed(3)} m in, held`);
          if (!held) free++;
        }
      }
      expect(bad.slice(0, 5), l.id).toEqual([]);
      expect(free, l.id).toBeGreaterThan(20);
    }
  });

  it('every move takes off and lands clear of them, for every cat, so a hop never lands her in their reach', () => {
    const floor = houseFloorGround();
    const bad = [];
    const spots = [];
    for (const list of [HOUSE_MOVES.climbs, HOUSE_MOVES.drops, HOUSE_MOVES.gaps]) for (const h of list) spots.push([h.id, h.from], [h.id, h.to]);
    for (const c of HOUSE_MOVES.crossings) for (const p of [c.points[0], c.points[c.points.length - 1]]) spots.push([c.id, p]);
    for (const [id, p] of spots) {
      const g = area.ground.y(p.x, p.z);
      const top = HOUSE_LEDGES.find((l) => p.x >= l.minX && p.x <= l.maxX && p.z >= l.minZ && p.z <= l.maxZ && Math.abs(g - l.y) < 1e-6);
      if (!top) {
        expect(g, id).toBeCloseTo(floor.y(p.x, p.z), 9);
        // on the floor: 0.1 m clear of the feet
        for (const l of HOUSE_LEDGES) {
          if (Math.abs(levelY(l.level) - g) < 1e-6 && distToRect(l, p.x, p.z) < ledgeStandoff(CAT_SCALE_MAX) + 0.05) bad.push(`${id} ${p.x},${p.z} near ${l.id}`);
        }
        for (const set of [guards, big]) if (reaches(set.feet, p.x, p.z)) bad.push(`${id} ${p.x},${p.z} in the feet`);
      } else {
        for (const set of [guards, big]) if (set.tops[top.id] && reaches(set.tops[top.id], p.x, p.z)) bad.push(`${id} ${p.x},${p.z} in ${top.id}'s guards (${set.scale})`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('at run time', () => {
  it('stands the feet on the floor, a top\'s rim on it, none in the air, and swaps in place', () => {
    const live = [...area.colliders];
    const n = live.length;
    const g = createLedgeGuards(live, houseFloorGround());
    const at = (x, y, z) => { g.update({ x, y, z }); return g.on; };
    expect(at(0, 0, 9.5)).toBe('floor');
    expect(live.length).toBe(n + guards.feet.length);
    expect(live.filter((c) => c.guard)).toEqual([...guards.feet]);
    const n2 = HOUSE_LEDGES.find((l) => l.id === 'library-books-n2');
    expect(at(-9.3, n2.y, 2.6)).toBe('library-books-n2');
    expect(live.filter((c) => c.guard)).toEqual([...guards.tops['library-books-n2']]);
    expect(at(-9.3, n2.y + 0.5, 2.6)).toBe(null); // in the air
    expect(live.length).toBe(n);
    const keys = HOUSE_LEDGES.find((l) => l.id === 'parlour-keys');
    expect(at(8.7, keys.y, 10.74)).toBe('parlour-keys'); // her body held off the piano
    expect(at(0, 0, 9.5)).toBe('floor');
    expect(at(8.7, keys.y, 11.25)).toBe(null); // within its reach (a spot from before): it waits
    const seat = HOUSE_LEDGES.find((l) => l.id === 'attic-seat');
    expect(at(-23.6, seat.y, -11)).toBe(null); // a low top with nothing beside it has none
    expect(at(0, 0, 9.5)).toBe('floor');
    // sized for a Maine Coon: her own sets, none standing until the next update
    g.scale(1.3);
    expect(g.on).toBe(null);
    expect(live.length).toBe(n);
    expect(at(0, 0, 9.5)).toBe('floor');
    expect(live.filter((c) => c.guard)).toEqual([...big.feet]);
    g.dispose();
    expect(live).toEqual(area.colliders);
  });

  it('never traps her: a set stands only once she is clear of it (a walk picked up in a gap)', () => {
    // between bookcases n1 and n2, on the floor: a spot from before the guards, inside the feet
    const w = createHouseWalk();
    w.place(-10.85, 2.7, behindYaw(0, 1), 1);
    expect(reaches(guards.feet, -10.85, 2.7)).toBe(true);
    expect(w.guards.on).toBe(null);
    w.push(0, 1);
    for (let i = 0; i < 90; i++) w.frame(DT);
    expect(w.cat.position.z).toBeGreaterThan(2.7 + 1.0); // she walked out
    expect(w.guards.on).toBe('floor');
    w.release();
  });

  it('cuts no floor off: every floor spot clear of the feet is reached from the spawn, with every find and take-off', () => {
    const fenced = { ...area, colliders: [...area.colliders, ...big.feet] }; // the largest cat's
    // 0.125 m: the library's lamp stands 0.6 m off n1's front, and the way past it, between its
    // reach and the armchair's, is 0.27 m wide
    const before = houseFlood(area, HOUSE_SPAWN, 0.125);
    const after = houseFlood(fenced, HOUSE_SPAWN, 0.125);
    const floor = houseFloorGround();
    const key = (c) => `${c.x.toFixed(3)},${c.z.toFixed(3)}`;
    const got = new Set(after.cells.map(key));
    const lost = before.cells.filter((c) => Math.abs(area.ground.y(c.x, c.z) - floor.y(c.x, c.z)) < 1e-6
      && isWalkableAt(fenced, c.x, c.z) && !got.has(key(c)));
    expect(lost.map(key)).toEqual([]);
    for (const h of HOUSE_MOVES.climbs) {
      if (Math.abs(area.ground.y(h.from.x, h.from.z) - floor.y(h.from.x, h.from.z)) > 1e-6) continue;
      expect(after.reachesWithin(h.from.x, h.from.z, 0.2), h.id).toBe(true);
    }
    for (const f of HOUSE_FINDS.filter((q) => !q.ledge)) expect(after.reachesWithin(f.x, f.z, f.r), f.id).toBe(true);
  }, 60_000);
});

// Her head and her body (people/reach.js catVolumes: a head sphere and a body capsule) as a
// cat of that breed walking (animateCat 'follow'), at the helper's cat's spot and heading.
function bodyOf(model, cat, t) {
  model.position.copy(cat.position);
  model.rotation.set(0, cat.rotation.y, 0);
  animateCat(model, 'follow', t, 1, false);
  model.updateMatrixWorld(true);
  return catVolumes(model);
}
// How far a sphere (c, r) goes into a box (negative: clear of it).
function into(box, c, r) {
  const dx = Math.max(box.minX - c.x, 0, c.x - box.maxX);
  const dy = Math.max(box.minY - c.y, 0, c.y - box.maxY);
  const dz = Math.max(box.minZ - c.z, 0, c.z - box.maxZ);
  return r - Math.hypot(dx, dy, dz);
}
function intrusion(box, v) {
  let worst = into(box, v.head.center, v.head.radius);
  const p = new THREE.Vector3();
  for (let i = 0; i <= 10; i++) {
    p.lerpVectors(v.body.a, v.body.b, i / 10);
    worst = Math.max(worst, into(box, p, v.body.r));
  }
  return worst;
}

describe('rough edge 1: from the floor her body never enters a ledge piece', () => {
  // she walks into every side of every ledge piece she can reach from the floor, straight
  // and slantwise: a scale-1 tabby, the Persian, D2 (the family's own cat, 1.15) and the
  // Maine Coon (1.3), each with the guards for her size
  for (const breed of ['tabby', 'persian', 'd2', 'mainecoon']) {
    it(`walking into every ledge piece, a ${breed}: her head and body stay out of it, and the camera never jumps`, () => {
      const model = buildCat(breed);
      const w = createHouseWalk({ reducedMotion: false, moves: true, catScale: model.scale.x });
      const feet = houseLedgeGuards(model.scale.x).feet;
      const bad = [];
      let walks = 0;
      let worstJump = 0;
      for (const l of HOUSE_LEDGES) {
        const y0 = levelY(l.level);
        const box = { minX: l.minX, maxX: l.maxX, minY: y0, maxY: l.y, minZ: l.minZ, maxZ: l.maxZ };
        const sides = [
          [(l.minX + l.maxX) / 2, l.minZ, 0, -1], [(l.minX + l.maxX) / 2, l.maxZ, 0, 1],
          [l.minX, (l.minZ + l.maxZ) / 2, -1, 0], [l.maxX, (l.minZ + l.maxZ) / 2, 1, 0],
        ];
        for (const [ex, ez, nx, nz] of sides) {
          for (const slant of [0, 0.6, -0.6]) {
            // 1.4 m out from the middle of the side, on her floor, where she can stand
            const sx = ex + nx * 1.4;
            const sz = ez + nz * 1.4;
            if (roomAt(sx, sz) !== l.room || !isWalkableAt(area, sx, sz) || Math.abs(area.ground.y(sx, sz) - y0) > 1e-6 || reaches(feet, sx, sz)) continue;
            const dx = -nx + slant * nz;
            const dz = -nz - slant * nx;
            w.place(sx, sz, behindYaw(dx, dz), 1);
            w.push(dx, dz);
            walks++;
            const prev = w.camera.position.clone();
            let t = 0;
            for (let i = 0; i < 90; i++) {
              w.frame(DT);
              t += DT;
              worstJump = Math.max(worstJump, w.camera.position.distanceTo(prev));
              prev.copy(w.camera.position);
              const d = intrusion(box, bodyOf(model, w.cat, t));
              if (d > 0.005) { bad.push(`${l.id} from ${sx.toFixed(2)},${sz.toFixed(2)} slant ${slant}: ${d.toFixed(3)} m in at frame ${i}`); break; }
            }
            w.release();
          }
        }
      }
      expect(walks).toBeGreaterThan(30);
      expect(bad).toEqual([]);
      expect(worstJump).toBeLessThan(0.25);
    }, 90_000);
  }
});

describe('rough edge 2: on a tall top her body stays over it', () => {
  it('pushed every way from every spot of its band, her body (CAT_RADIUS) never hangs over an edge', () => {
    const w = createHouseWalk({ moves: true });
    const bad = [];
    let pushes = 0;
    for (const l of tall) {
      const spots = [];
      for (let x = l.minX + LEDGE_RIM; x <= l.maxX - LEDGE_RIM + 1e-9; x += 0.15) {
        for (let z = l.minZ + LEDGE_RIM; z <= l.maxZ - LEDGE_RIM + 1e-9; z += 0.03) {
          if (standable(x, z) && !reaches(guards.tops[l.id], x, z)) spots.push([x, z]);
        }
      }
      expect(spots.length, l.id).toBeGreaterThan(2);
      for (const [x, z] of spots) {
        for (let k = 0; k < 16; k++) {
          const a = (k * Math.PI) / 8;
          w.placeOnLedge(l.id, x, z, behindYaw(Math.sin(a), Math.cos(a)), 1);
          w.push(Math.sin(a), Math.cos(a));
          pushes++;
          for (let i = 0; i < 60; i++) {
            w.frame(DT);
            if (w.traversal.crossing || w.traversal.busy) break; // onto the plank: its move, not her edge
            const p = w.cat.position;
            const over = Math.max(l.minX - (p.x - CAT_RADIUS), (p.x + CAT_RADIUS) - l.maxX, l.minZ - (p.z - CAT_RADIUS), (p.z + CAT_RADIUS) - l.maxZ);
            if (Math.abs(p.y - l.y) > 1e-6) { bad.push(`${l.id} ${x.toFixed(2)},${z.toFixed(2)} dir ${k}: off the top`); break; }
            if (over > 0.005) { bad.push(`${l.id} ${x.toFixed(2)},${z.toFixed(2)} dir ${k}: ${over.toFixed(3)} m over`); break; }
          }
          w.release();
        }
      }
    }
    expect(pushes).toBeGreaterThan(200);
    expect(bad.slice(0, 8)).toEqual([]);
  }, 90_000);
});

// =============================================================================
// The review of the rough edges: the guards for her cat's size, and her head into a taller
// piece from a low top beside it (keys to the piano's case, steps to n2, chest to the
// bedroom shelf, the big books to the west bookcase).
// =============================================================================
describe('for her cat\'s size', () => {
  it('her reach ahead as she walks is within HEAD_REACH and BODY_REACH of her size, and her head passes HEAD_CLEAR, every breed', () => {
    const bad = [];
    for (const breed of BREEDS) {
      const cat = buildCat(breed);
      const s = Math.max(cat.scale.x, cat.scale.y, cat.scale.z);
      expect(s, breed).toBeLessThanOrEqual(CAT_SCALE_MAX);
      for (let i = 0; i < 120; i++) {
        animateCat(cat, 'follow', i / 60, 1, false);
        cat.updateMatrixWorld(true);
        const v = catVolumes(cat);
        const head = -v.head.center.z + v.head.radius;
        const body = Math.max(-v.body.a.z, -v.body.b.z) + v.body.r;
        const low = v.head.center.y - v.head.radius;
        if (head > HEAD_REACH * s) bad.push(`${breed} head ${head.toFixed(3)}`);
        if (body > BODY_REACH * s) bad.push(`${breed} body ${body.toFixed(3)}`);
        if (low <= HEAD_CLEAR) bad.push(`${breed} head low ${low.toFixed(3)}`);
      }
    }
    expect([...new Set(bad)].slice(0, 6)).toEqual([]);
  });

  it('house life finds her cat in the scene (the object at her position) and builds the guards for it', () => {
    const scene = new THREE.Scene();
    const cat = buildCat('mainecoon');
    scene.add(new THREE.Group(), cat);
    expect(catScale(scene, cat.position)).toBeCloseTo(1.3, 9);
    expect(catScale(scene, new THREE.Vector3())).toBe(1);
    expect(houseLedgeGuards(1.3)).toBe(big);
    expect(houseLedgeGuards(1.26)).toBe(big); // rounded up to the next 0.05
    expect(houseLedgeGuards(2)).toBe(big); // no cat is larger
    expect(houseLedgeGuards(0.74)).not.toBe(guards);
    expect(ledgeStandoff(1)).toBe(LEDGE_STANDOFF);
  });

  it('a low top beside a taller piece holds her back from it, with room to stand for the largest cat', () => {
    for (const [lowId, tallId] of PAIRS) {
      const l = ledgeOf(lowId);
      const set = big.tops[lowId];
      let free = 0;
      for (let x = l.minX; x <= l.maxX + 1e-9; x += 0.02) for (let z = l.minZ; z <= l.maxZ + 1e-9; z += 0.01) if (standable(x, z) && !reaches(set, x, z)) free++;
      expect(free, lowId).toBeGreaterThan(10);
      expect(ledgeOf(tallId).y - l.y, tallId).toBeGreaterThan(0.3);
    }
  });
});

describe('the review of the rough edges: from a low top her body never enters the taller piece beside it', () => {
  for (const breed of ['tabby', 'persian', 'd2', 'mainecoon']) {
    it(`a ${breed}, from every low top toward the taller piece, and along the piano keys`, () => {
      const model = buildCat(breed);
      const s = model.scale.x;
      const w = createHouseWalk({ reducedMotion: false, moves: true, catScale: s });
      const bad = [];
      for (const [lowId, tallId, dx, dz] of PAIRS) {
        const l = ledgeOf(lowId);
        const tl = ledgeOf(tallId);
        const box = { minX: tl.minX, maxX: tl.maxX, minY: levelY(tl.level), maxY: tl.y, minZ: tl.minZ, maxZ: tl.maxZ };
        // from where the moves stand her on it
        const spots = [];
        for (const list of [HOUSE_MOVES.climbs, HOUSE_MOVES.drops, HOUSE_MOVES.gaps]) for (const h of list) for (const p of [h.from, h.to]) {
          if (p.x >= l.minX && p.x <= l.maxX && p.z >= l.minZ && p.z <= l.maxZ && Math.abs(area.ground.y(p.x, p.z) - l.y) < 1e-6) spots.push(p);
        }
        expect(spots.length, lowId).toBeGreaterThan(0);
        for (const p of spots) for (const slant of [0, 0.6, -0.6]) {
          const fx = dx + slant * dz;
          const fz = dz - slant * dx;
          w.placeOnLedge(lowId, p.x, p.z, behindYaw(fx, fz), 1);
          w.push(fx, fz);
          let t = 0;
          for (let i = 0; i < 60; i++) {
            w.frame(DT);
            t += DT;
            if (Math.abs(w.cat.position.y - l.y) > 1e-6) break; // stepped off its side: the floor's guards
            const d = intrusion(box, bodyOf(model, w.cat, t));
            if (d > 0.005) { bad.push(`${lowId} -> ${tallId} slant ${slant}: ${d.toFixed(3)} m in at frame ${i}`); break; }
          }
          w.release();
        }
      }
      // along the keys, west then east: every key, each note of the tune
      const k = ledgeOf('parlour-keys');
      const played = new Set();
      w.placeOnLedge('parlour-keys', 8.7, 10.74, behindYaw(-1, 0), 1);
      for (const dir of [-1, 1]) {
        w.push(dir, 0);
        for (let i = 0; i < 70; i++) {
          w.frame(DT);
          const p = w.cat.position;
          expect(p.y, 'on the keys').toBeCloseTo(k.y, 6);
          played.add(pianoKeyAt(k.minX, k.maxX, p.x));
        }
        w.release();
      }
      expect(played.size).toBe(8);
      expect(bad).toEqual([]);
    }, 90_000);
  }
});
