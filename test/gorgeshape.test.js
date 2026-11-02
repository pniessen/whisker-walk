import { describe, it, expect } from 'vitest';
import { createGround, validateGround, STEP_MAX } from '../src/ground.js';
import { cameraOffset } from '../src/catcam.js';
import { ZOOM_STEPS } from '../src/camzoom.js';
import { DEFAULT_PITCH } from '../src/player.js';
import {
  FLOOR, LOOKOUT, WIDE_LEDGE, CLIFFTOP, WEST_TOP, SHOULDER, RIM, SNUG_Y, LIP_H, LIP_W,
  rect, rampZ, toStrip, subtractRects,
  WALK_SHAPES, MASSES, GORGE_CAVES, GORGE_DENS, CEILINGS, STAND_ON, CAMP_DEN_RESERVE, WIDE_LEDGE_RECT,
  GORGE_GROUND_SPEC, gorgeGround, cY, mapShapes,
} from '../src/world/gorgeshape.js';
import { floodGorge, GORGE_BOUNDS, GORGE_SPAWN, FLOOD_STEP } from './helpers/gorgeflood.js';

const CAVE_RECTS = GORGE_CAVES.flatMap((c) => c.rects);
const OPENINGS = [...WALK_SHAPES, ...CAVE_RECTS, ...GORGE_DENS];
const ALL_SHAPES = [...OPENINGS, ...MASSES];
const inRect = (r, x, z) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
const inBox = ([minX, maxX, minZ, maxZ], x, z) => x >= minX && x <= maxX && z >= minZ && z <= maxZ;
const { minX: BX0, maxX: BX1, minZ: BZ0, maxZ: BZ1 } = GORGE_BOUNDS;
const inBounds = (x, z) => x >= BX0 && x <= BX1 && z >= BZ0 && z <= BZ1;

describe('the Gorge shape', () => {
  it('the heights and the building blocks', () => {
    expect([FLOOR, LOOKOUT, WIDE_LEDGE, CLIFFTOP, WEST_TOP, SHOULDER, RIM]).toEqual([0, 4, 8, 12, 9, 14, 20]);
    expect([LIP_H, LIP_W]).toEqual([0.35, 0.4]);
    expect(SNUG_Y).toBeCloseTo(8.944, 12);
    expect(SNUG_Y).toBe(cY(20.2));
    expect([cY(32), cY(-18)]).toEqual([8, 12]);
    const r = rect(1, 3, -2, 4, 5, 'r');
    expect(r).toEqual({ minX: 1, maxX: 3, minZ: -2, maxZ: 4, y0: 5, y1: 5, along: null, tag: 'r', kind: 'walk' });
    expect(toStrip(r)).toEqual({ x0: 1, z0: 1, x1: 3, z1: 1, width: 6, y0: 5, y1: 5 });
    const ramp = rampZ(2, 4, 10, 1, -2, 3, 'ramp');
    expect(ramp).toMatchObject({ minZ: -2, maxZ: 10, y0: 3, y1: 1, along: 'z' });
    expect(toStrip(ramp)).toEqual({ x0: 3, z0: -2, x1: 3, z1: 10, width: 2, y0: 3, y1: 1 });
    const pieces = subtractRects(rect(0, 10, 0, 10, 2, 'm', 'rock'), [rect(2, 4, 2, 4, 0, 'h'), rect(10, 12, 0, 10, 0, 'touch')]);
    expect(pieces.reduce((a, p) => a + (p.maxX - p.minX) * (p.maxZ - p.minZ), 0)).toBe(96);
    expect(pieces.every((p) => p.kind === 'rock' && p.tag === 'm' && p.y0 === 2)).toBe(true);
  });

  it('every record is frozen', () => {
    for (const list of [WALK_SHAPES, MASSES, GORGE_CAVES, GORGE_DENS, CEILINGS, STAND_ON, GORGE_GROUND_SPEC.strips, GORGE_GROUND_SPEC.ceilings]) {
      expect(Object.isFrozen(list)).toBe(true);
      for (const item of list) expect(Object.isFrozen(item)).toBe(true);
    }
    expect(Object.isFrozen(GORGE_GROUND_SPEC)).toBe(true);
    expect(Object.isFrozen(CAMP_DEN_RESERVE) && Object.isFrozen(WIDE_LEDGE_RECT)).toBe(true);
  });

  it("the Gorge's ground is valid", () => {
    expect(validateGround(GORGE_GROUND_SPEC)).toEqual([]);
    expect(GORGE_GROUND_SPEC.base).toBe(0);
    expect(GORGE_GROUND_SPEC.discs).toEqual([]);
  });

  it('masses are cut round every opening', () => {
    const bad = [];
    for (const m of MASSES) {
      expect(m.kind).toBe('rock');
      for (const o of OPENINGS) {
        const ox = Math.min(m.maxX, o.maxX) - Math.max(m.minX, o.minX);
        const oz = Math.min(m.maxZ, o.maxZ) - Math.max(m.minZ, o.minZ);
        if (ox > 1e-9 && oz > 1e-9) bad.push(`${m.tag} over ${o.tag}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('every place the shape opens is reached from the spawn', () => {
    const { reached } = floodGorge();
    const centre = (r) => [(r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2];
    const targets = {
      'leg A foot': [3.9, 36],
      'the Lookout': [5.6, -5],
      'the Wide Ledge': centre(WIDE_LEDGE_RECT),
      'the clifftop': [18.2, -29],
      'the Snug Cave stop': centre(WALK_SHAPES.find((s) => s.tag === 'snugStop')),
      'the floor, north end': [-8, -49],
      'the floor, south end': [-8, 49],
      "the Narrows' west end": [-49.5, -11],
    };
    for (const c of GORGE_CAVES) targets[`${c.id} chamber`] = c.path[c.path.length - 1];
    for (const d of GORGE_DENS) targets[d.id] = centre(d);
    expect(GORGE_DENS).toHaveLength(5);
    const missed = Object.entries(targets).filter(([, [x, z]]) => !reached(x, z)).map(([k]) => k);
    expect(missed).toEqual([]);
    expect(reached(GORGE_SPAWN.x, GORGE_SPAWN.z)).toBe(true);
  });

  it('no gaps between masses', () => {
    const { ground, forEachCell } = floodGorge();
    const gaps = [];
    forEachCell((x, z, hit) => {
      if (!hit && ground.y(x, z) === 0) gaps.push([x, z]);
    });
    expect(gaps.slice(0, 10)).toEqual([]);
  });

  it('nothing reached stands on rock', () => {
    const { forEachReached } = floodGorge();
    // "Contains" as the ground itself decides it: each shape alone over a
    // bottomless base. (Right on a shared edge, float rounding in the strip
    // test can put a cell on either side; the ground's answer is the one the
    // cat stands on.)
    const NONE = -1e9;
    const alone = ALL_SHAPES.map((s) => ({ s, g: createGround({ base: NONE, strips: [toStrip(s)] }) }));
    const bad = [];
    forEachReached((x, z) => {
      let top = null;
      let best = -Infinity;
      for (const { s, g } of alone) {
        const h = g.y(x, z);
        if (h === NONE) continue;
        if (h > best || (h === best && s.kind === 'rock')) {
          best = h;
          top = s;
        }
      }
      if (top?.kind === 'rock') bad.push([x, z, top.tag]);
    });
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it('every walkable cell beside a drop of 1.5 m or more has a lip first', () => {
    const { ground, forEachReached } = floodGorge();
    const bad = [];
    forEachReached((x, z) => {
      const y = ground.y(x, z);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx * FLOOD_STEP;
        const nz = z + dz * FLOOD_STEP;
        if (inBounds(nx, nz) && y - ground.y(nx, nz) >= 1.5) bad.push([x, z, nx, nz]);
      }
    });
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it('the legs only meet at their hairpins', () => {
    const LOOKOUT_BOX = [2.4, 8.8, -8, -2];
    const TURN_BOX = [5.8, 20, 32, 35.5];
    const { reached } = floodGorge({ blocked: (x, z) => inBox(LOOKOUT_BOX, x, z) || inBox(TURN_BOX, x, z) });
    const legB = WALK_SHAPES.find((s) => s.tag === 'legB');
    const legC = WALK_SHAPES.find((s) => s.tag === 'legC');
    for (const leg of [legB, legC]) {
      const x = (leg.minX + leg.maxX) / 2;
      for (let z = leg.minZ + 0.5; z < leg.maxZ; z += 1) expect(reached(x, z), `${leg.tag} at z ${z}`).toBe(false);
    }
    expect(reached(18.2, -29)).toBe(false); // the clifftop is only up leg C
    expect(reached(-8, 0)).toBe(true);
    expect(reached(-8, -49)).toBe(true);
    expect(reached(3.9, 10)).toBe(true); // leg A itself
  });

  it('the rims block the ordinary view from the clifftop', () => {
    const camY = cameraOffset(0, DEFAULT_PITCH, ZOOM_STEPS[1].dist, ZOOM_STEPS[1].height).y;
    const need = CLIFFTOP + camY + 1;
    const touches = (m) => {
      const spansX = m.minX <= BX1 && m.maxX >= BX0;
      const spansZ = m.minZ <= BZ1 && m.maxZ >= BZ0;
      const onX = (m.minX <= BX0 && m.maxX >= BX0) || (m.minX <= BX1 && m.maxX >= BX1);
      const onZ = (m.minZ <= BZ0 && m.maxZ >= BZ0) || (m.minZ <= BZ1 && m.maxZ >= BZ1);
      return (onX && spansZ) || (onZ && spansX);
    };
    const atEdge = MASSES.filter(touches);
    // The gorge's own west wall runs off the map north and south with the
    // floor beside it, at WEST_TOP, under the clifftop by design (G6): the
    // view goes over it to the 20 m west rim. Every other mass at the edge
    // is a rim.
    const westWall = atEdge.filter((m) => m.tag === 'westTopN' || m.tag === 'westTopS');
    expect(westWall.every((m) => m.y0 === WEST_TOP)).toBe(true);
    const rims = atEdge.filter((m) => !westWall.includes(m));
    expect(rims.length).toBeGreaterThan(0);
    expect(rims.filter((m) => !(m.y0 > need)).map((m) => m.tag)).toEqual([]);
  });

  it('caves and dens have a ceiling at the right height and rock round them', () => {
    const ground = gorgeGround();
    const rooms = [
      ...GORGE_CAVES.flatMap((c) => c.rects.map((r) => ({
        r, siblings: c.rects, mouth: r === c.rects[0] ? c.mouth : null,
        headroom: r.tag.endsWith('-chamber') ? 3.0 : 2.6,
      }))),
      ...GORGE_DENS.map((d) => ({ r: d, siblings: [d], mouth: d.mouth, headroom: 1.8 })),
    ];
    expect(rooms).toHaveLength(14);
    const badCeil = [];
    const badRock = [];
    const masses = MASSES.filter((m) => m.kind === 'rock');
    for (const { r, siblings, mouth, headroom } of rooms) {
      const want = r.y0 + headroom;
      expect(CEILINGS.some((c) => c.minX === r.minX && c.maxX === r.maxX && c.minZ === r.minZ && c.maxZ === r.maxZ && c.y0 === want)).toBe(true);
      for (let x = r.minX + 0.05; x <= r.maxX - 0.05 + 1e-9; x += (r.maxX - r.minX - 0.1) / 6) {
        for (let z = r.minZ + 0.05; z <= r.maxZ - 0.05 + 1e-9; z += (r.maxZ - r.minZ - 0.1) / 6) {
          if (Math.abs(ground.ceil(x, z) - want) > 1e-9) badCeil.push([r.tag, x, z, ground.ceil(x, z)]);
        }
      }
      const edges = [
        { name: 'minX', at: (t) => [r.minX - 0.3, t], line: (p) => p.x === r.minX, span: [r.minZ, r.maxZ] },
        { name: 'maxX', at: (t) => [r.maxX + 0.3, t], line: (p) => p.x === r.maxX, span: [r.minZ, r.maxZ] },
        { name: 'minZ', at: (t) => [t, r.minZ - 0.3], line: (p) => p.z === r.minZ, span: [r.minX, r.maxX] },
        { name: 'maxZ', at: (t) => [t, r.maxZ + 0.3], line: (p) => p.z === r.maxZ, span: [r.minX, r.maxX] },
      ];
      for (const e of edges) {
        if (mouth && e.line(mouth)) continue; // the mouth opens
        for (let t = e.span[0]; t <= e.span[1] + 1e-9; t += 0.25) {
          const [x, z] = e.at(Math.min(t, e.span[1]));
          if (siblings.some((s) => s !== r && inRect(s, x, z))) continue; // joins its own cave
          if (!masses.some((m) => inRect(m, x, z))) badRock.push([r.tag, e.name, x, z]);
        }
      }
    }
    expect(badCeil.slice(0, 10)).toEqual([]);
    expect(badRock.slice(0, 10)).toEqual([]);
  });

  it('the Snug Cave stop meets leg C within a step', () => {
    for (let z = 18.7; z <= 21.7 + 1e-9; z += 0.05) {
      expect(Math.abs(cY(z) - SNUG_Y)).toBeLessThanOrEqual(STEP_MAX + 1e-9);
    }
    expect(Math.abs(cY(21.7) - SNUG_Y)).toBeCloseTo(0.12, 9);
    const stop = WALK_SHAPES.find((s) => s.tag === 'snugStop');
    expect([stop.minX, stop.maxX, stop.minZ, stop.maxZ, stop.y0]).toEqual([12.2, 15, 18.7, 21.7, SNUG_Y]);
  });

  it('the reserved wide ledge and den are left for part 4', () => {
    expect(WIDE_LEDGE_RECT.reserved).toBe('part 4');
    expect(CAMP_DEN_RESERVE.reserved).toBe('part 4');
    expect(CAMP_DEN_RESERVE.kind).toBe('rock');
    expect(MASSES).toContain(CAMP_DEN_RESERVE);
    expect([WIDE_LEDGE_RECT.minX, WIDE_LEDGE_RECT.maxX, WIDE_LEDGE_RECT.minZ, WIDE_LEDGE_RECT.maxZ]).toEqual([5.8, 20, 35.5, 48]);
    expect([CAMP_DEN_RESERVE.minX, CAMP_DEN_RESERVE.maxX, CAMP_DEN_RESERVE.minZ, CAMP_DEN_RESERVE.maxZ]).toEqual([20, 26, 37, 43]);
    const TURN_BOX = [5.8, 20, 32, 35.5];
    expect(TURN_BOX[3] <= WIDE_LEDGE_RECT.minZ).toBe(true); // the B -> C turn is outside it
    expect(floodGorge().reached(13, 33.75)).toBe(true);
  });

  it('built the same every time', () => {
    const a = gorgeGround();
    const b = gorgeGround();
    const bad = [];
    for (let x = -62; x <= 62; x += 0.5) {
      for (let z = -62; z <= 62; z += 0.5) {
        if (!Object.is(a.y(x, z), b.y(x, z)) || !Object.is(a.ceil(x, z), b.ceil(x, z))) bad.push([x, z]);
      }
    }
    expect(bad).toEqual([]);
  });

  it('STAND_ON and the corner map shapes', () => {
    expect(STAND_ON.map((r) => [r.minX, r.maxX, r.minZ, r.maxZ])).toEqual([
      [-18, 2, -50, 50], [2, 5.4, 34, 50], [-50, -18, -16, -6], [2.4, 34, -40, -18],
    ]); // no Snug Cave (ruling F35): part 3 gives its homed cat its own rectangle
    const shapes = mapShapes();
    expect(shapes.every((s) => s.tone === 'rock' || s.tone === 'ledge')).toBe(true);
    expect(shapes.filter((s) => s.tone === 'rock').length).toBeGreaterThanOrEqual(MASSES.length);
    expect(shapes.some((s) => s.tone === 'ledge' && s.minX === 2.4 && s.maxZ === -18)).toBe(true); // the clifftop
  });
});
