// The Moon, milestone 8: the Lava Tube and the Deep Cell on a walk (world/moondeeplive.js, and the Deep Cell's carry in world/moonbaselive.js) on the real area, a real progression and
// a real discovery log. The zone, the outside left undrawn when she is deep inside, the Deep Cell picked up, carried through the whole tube and plugged into the Core's third socket,
// the Star Garden's bloom, Earth's finale (and its flash rule), co-walk credit, a walk that opens on a finished chapter, reduced motion, and the walk's end.
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import * as P from '../src/world/moonplan.js';
import * as L from '../src/world/moonlava.js';
import * as M from '../src/world/moonmission.js';
import { build } from '../src/world/moon.js';
import { createProgression } from '../src/progression.js';
import { createDiscoveryLog } from '../src/discoveries.js';
import { bus } from '../src/events.js';
import { phrase } from '../src/clanphrases.js';
import { mem } from './helpers/lighthouselife.js';
import { canvasDocument } from './helpers/canvas.js';
import { pushOut } from '../src/world/moonpip.js';
import { finaleLevel, FINALE, FINALE_LENGTH, BLOOM } from '../src/world/moondeeplive.js';
import { CAT_RADIUS } from '../src/player.js';

const gy = (x, z) => P.moonY(x, z);
afterEach(() => vi.unstubAllGlobals());

function rig({ moon = null, reducedMotion = false, storage = mem() } = {}) {
  vi.stubGlobal('document', canvasDocument());
  const progression = createProgression(storage);
  if (moon) progression.state.moon = { step: 0, cells: 0, stamp: -1, scope: 0, jump: {}, ...moon };
  const scene = new THREE.Scene();
  const area = build(scene);
  const log = createDiscoveryLog(progression);
  log.startWalk();
  const life = area.life({ scene, ground: area.ground, audio: null, log, progression, reducedMotion, tier: { name: 'high' } });
  const camera = new THREE.PerspectiveCamera();
  const session = { goals: null, pounceTime: 0, perched: null, fx: { burst: vi.fn() }, cat: { rotation: { y: 0 } }, collectibleMeshes: new Map(), goldMice: { list: [] } };
  const events = [];
  const off = bus.on('discovery', (e) => events.push(e));
  const cat = { x: 0, y: 0, z: 45 };
  let t = 0;
  const at = (x, z, y = gy(x, z)) => { cat.x = x; cat.y = y; cat.z = z; return cat; };
  const step = (secs, where) => { if (where) Object.assign(cat, where); for (let i = 0; i < Math.round(secs * 30); i++) { t += 1 / 30; life.update(1 / 30, t, cat, camera, session); } };
  const prompt = () => life.promptAt(cat);
  const lines = () => events.map((e) => e.label);
  return { scene, area, progression, log, life, session, events, off, cat, at, step, prompt, camera, lines, dispose() { off(); life.dispose(); } };
}
const named = (scene, n) => scene.getObjectByName(n);
const wayAt = (depth) => { const p = L.pathAt(L.S_MOUTH + depth); return { x: p.x, z: p.z }; };

// every Mesh, Points or InstancedMesh a frame would draw: visible and all its ancestors visible
function drawn(scene) {
  let n = 0;
  const walk = (o) => {
    if (!o.visible) return;
    if (o.isMesh || o.isPoints || o.isLine) n++;
    for (const c of o.children) walk(c);
  };
  walk(scene);
  return n;
}

describe('the zone and the inside', () => {
  it('the floor, crystals and pedestal are drawn only near the tube (26 m, held to 32 m), the shell and the massif are always there', () => {
    const r = rig();
    const fill = named(r.scene, 'moon:cavefill');
    r.step(0.2, r.at(0, 45));
    expect(fill.visible).toBe(false);
    expect(named(r.scene, 'moon:massif').visible).toBe(true);
    expect(named(r.scene, 'moon:cave').visible).toBe(true);
    r.step(0.2, r.at(-34, 0));
    expect(fill.visible).toBe(true);
    r.step(0.2, r.at(-34, 26)); // the dome: 24 m from the tube's middle, held on by the 6 m of hysteresis from where she came
    expect(fill.visible).toBe(true);
    r.step(0.2, r.at(-10, 20));
    expect(fill.visible).toBe(false);
    r.dispose();
  });
  it('past the mouth the massif is hidden (the lens is in the rock); deep inside, the ground, the rocks, the base and the wings are not drawn; out again, all is as it was', () => {
    const r = rig();
    const plain = ['moonPlace', 'moon:ground', 'moon:rocks-small', 'moon:rocks-big', 'moon:wing', 'moon:wingC'];
    const was = plain.map((n) => named(r.scene, n)?.visible);
    r.step(0.3, r.at(-37, 0));
    expect(named(r.scene, 'moon:massif').visible).toBe(true);
    expect(r.life.deep.mouthIn).toBe(false);
    const w1 = wayAt(1.5);
    r.step(0.3, r.at(w1.x, w1.z));
    expect(r.life.deep.mouthIn).toBe(true);
    expect(named(r.scene, 'moon:massif').visible).toBe(false);
    expect(r.life.deep.inside).toBe(false);
    expect(named(r.scene, 'moon:ground').visible).toBe(true);
    const w2 = wayAt(8);
    const outside = drawn(r.scene);
    r.step(0.3, r.at(w2.x, w2.z));
    expect(r.life.deep.inside).toBe(true);
    for (const n of plain) { const o = named(r.scene, n); if (o) expect(o.visible, n).toBe(false); }
    const inTube = drawn(r.scene);
    expect(inTube).toBeLessThan(outside);
    expect(inTube).toBeLessThanOrEqual(14); // the shell, the floor and crystals, the sky (stars, Earth, clouds), Pip, the cells and the rings: a handful of draws
    // the way out: it is all put back
    r.step(0.3, r.at(-37, 0));
    expect(r.life.deep.inside).toBe(false);
    plain.forEach((n, i) => { const o = named(r.scene, n); if (o && !n.startsWith('moon:wing')) expect(o.visible, n).toBe(was[i] ?? true); }); // (the wings' own lives say whether they are near, each frame)
    expect(named(r.scene, 'moon:massif').visible).toBe(true);
    r.dispose();
  });
  it('the walk\'s pebbles and golden mice are not drawn deep inside (their cull reaches 0 m), and are again outside', () => {
    const r = rig();
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1));
    m.position.set(-45, 0.2, 2);
    r.session.collectibleMeshes.set('p', m);
    const w = wayAt(10);
    r.step(0.3, r.at(w.x, w.z));
    expect(m.visible).toBe(false);
    r.step(0.3, r.at(-38, 0));
    expect(m.visible).toBe(true);
    r.dispose();
  });
  it('the walk\'s end puts everything back, even from deep in the tube', () => {
    const r = rig();
    const w = wayAt(14);
    r.step(0.3, r.at(w.x, w.z));
    expect(named(r.scene, 'moon:ground').visible).toBe(false);
    r.life.dispose();
    for (const n of ['moon:ground', 'moonPlace', 'moon:massif']) expect(named(r.scene, n).visible, n).toBe(true);
    r.off();
  });
  it('no draw call count outside the tube moves: a frame at the spawn draws the same meshes as before the tube, plus the massif and the shell (three), and the fill only near', () => {
    const r = rig();
    r.step(0.3, r.at(0, 45));
    const far = drawn(r.scene);
    r.step(0.3, r.at(-34, 0));
    const near = drawn(r.scene);
    expect(near - far).toBeLessThanOrEqual(2); // the fill (one) and a pebble or two coming into the 50 m range
    r.dispose();
  });
});

describe('the Deep Cell: from the pedestal, through the whole tube, into the Core', () => {
  const awake = { step: 4, cells: 3 };
  it('waits on its pedestal; before the base is awake she cannot take it, after, E picks it up (one in her mouth at a time) and a line says so; it is never saved while carried', () => {
    const r = rig({ moon: { step: 3, cells: 3 } });
    r.step(0.3, r.at(L.PEDESTAL.x + 1.3, L.PEDESTAL.z));
    expect(r.prompt()).toBe(null);
    r.dispose();
    const a = rig({ moon: awake });
    a.step(0.3, a.at(L.PEDESTAL.x + 1.3, L.PEDESTAL.z));
    expect(a.prompt()).toBe(phrase('moon.cell.prompt'));
    expect(a.life.base.state.cellMode).toEqual(['plugged', 'plugged', 'home']);
    expect(a.life.interact()).toBe('pick');
    expect(a.life.base.state.carrying).toBe(2);
    expect(a.life.base.state.cellMode[2]).toBe('carried');
    expect(a.lines()).toContain(phrase('moon.deep.got'));
    expect(a.progression.state.moon).toMatchObject({ step: 4, cells: 3 }); // nothing saved
    a.dispose();
    // the next walk finds it on its pedestal again
    const b = rig({ moon: awake });
    expect(b.life.base.state.cellMode[2]).toBe('home');
    expect(b.life.base.cells[2].visible).toBe(true);
    b.dispose();
  });
  it('the gold ring and the board point at the cave once the story is told, and at the Core while she carries it', () => {
    const r = rig({ moon: { step: 8, cells: 3, stamp: 0, scope: 3 } });
    r.life.job.credit({ kind: 'job', job: r.life.job.plan.kind }); // (milestone 9) today's errand is done: the board and the ring show the cave again, not the errand
    r.step(0.3, r.at(P.BOARD.x + 1.5, P.BOARD.z));
    expect(r.prompt()).toBe(phrase('moon.board.prompt'));
    r.life.interact();
    expect(r.lines()).toContain(phrase('moon.goal.cave'));
    r.step(0.3);
    const ring = named(r.scene, 'moon:goalring');
    expect(ring.visible).toBe(true);
    expect(Math.hypot(ring.position.x - P.MOUTH_FRONT.x, ring.position.z - P.MOUTH_FRONT.z)).toBeLessThan(0.1);
    r.dispose();
    expect(M.nextGoal({ step: 4, cells: 3 }, 2)).toEqual({ kind: 'core', cell: 2 });
    expect(M.nextGoal({ step: 4, cells: 3 }, null).kind).toBe('scope'); // the story comes first: the bonus is never the goal before it
    expect(M.nextGoal({ step: 8, cells: 7 }, null).kind).toBe('done');
  });
  it('a hint when she nears the mouth with the base awake, once a walk', () => {
    const r = rig({ moon: awake });
    r.step(1, r.at(-30, 0));
    expect(r.lines().filter((l) => l === phrase('moon.deep.hint'))).toHaveLength(1);
    r.step(1, r.at(-36, 0));
    expect(r.lines().filter((l) => l === phrase('moon.deep.hint'))).toHaveLength(1);
    r.dispose();
    const asleep = rig({ moon: { step: 1, cells: 0 } });
    asleep.step(1, asleep.at(-36, 0));
    expect(asleep.lines()).not.toContain(phrase('moon.deep.hint'));
    asleep.dispose();
  });
  it('carry through the tube: from the pedestal out to the mouth along the way, pushed by the real walls (she wanders 0.8 m either side), the cell stays in front of her mouth and is never lost or saved, all the way', () => {
    const r = rig({ moon: awake });
    r.step(0.3, r.at(L.PEDESTAL.x + 1.3, L.PEDESTAL.z));
    r.prompt();
    r.life.interact();
    expect(r.life.base.state.carrying).toBe(2);
    const cols = r.area.colliders;
    const pts = [...L.wayPoints(0.5).reverse(), ...[0.5, 1, 1.5, 2, 2.5, 3].map((d) => ({ ...L.pathAt(L.S_MOUTH - d), s: -d }))];
    const pos = { x: cat0(r).x, z: cat0(r).z };
    let total = 0;
    let k = 0;
    for (const p of pts) {
      k++;
      const nrm = L.pathAt(p.s + L.S_MOUTH);
      const wob = 0.8 * Math.sin(k * 0.7);
      const target = { x: p.x - nrm.tz * wob, z: p.z + nrm.tx * wob };
      let guard = 0;
      while (Math.hypot(target.x - pos.x, target.z - pos.z) > 0.15 && guard++ < 80) {
        const d = Math.hypot(target.x - pos.x, target.z - pos.z);
        const stepLen = Math.min(d, 3.5 / 30);
        pos.x += ((target.x - pos.x) / d) * stepLen;
        pos.z += ((target.z - pos.z) / d) * stepLen;
        pushOut(pos, cols, CAT_RADIUS);
        total += stepLen;
        r.session.cat.rotation.y = Math.atan2(target.x - pos.x, target.z - pos.z);
        r.step(1 / 30, r.at(pos.x, pos.z));
        expect(r.life.base.state.carrying).toBe(2);
        const cell = r.life.base.cells[2];
        expect(Math.hypot(cell.position.x - pos.x, cell.position.z - pos.z)).toBeLessThan(0.7);
        expect(cell.visible).toBe(true);
      }
      expect(guard, `stuck at ${p.s.toFixed(1)} m`).toBeLessThan(80);
      expect(Math.hypot(pos.x - target.x, pos.z - target.z), `reached ${p.s.toFixed(1)} m`).toBeLessThan(0.3);
    }
    expect(total).toBeGreaterThan(L.CAVE_REACH);
    // out on the plain
    expect(L.inCave(pos.x, pos.z, 1)).toBe(false);
    expect(r.life.base.state.carrying).toBe(2);
    expect(r.progression.state.moon).toMatchObject({ step: 4, cells: 3 });
    r.dispose();
  });
  it('at the Core she plugs it into the third socket: saved (cells 7, step unchanged), the Star Garden blooms, a line, and the other two cells are as they were', () => {
    const r = rig({ moon: awake });
    r.step(0.3, r.at(L.PEDESTAL.x + 1.3, L.PEDESTAL.z));
    r.prompt();
    r.life.interact();
    r.step(0.3, r.at(P.CORE.x + 1.8, P.CORE.z));
    expect(r.prompt()).toBe(phrase('moon.core.prompt'));
    expect(r.life.interact()).toBe('plug');
    expect(r.progression.state.moon).toMatchObject({ step: 4, cells: 7 });
    expect(r.life.base.state.cellMode).toEqual(['plugged', 'plugged', 'plugged']);
    expect(r.life.base.state.carrying).toBe(null);
    r.step(0.1);
    const c2 = r.life.base.cells[2];
    expect(c2.position.x).toBeCloseTo(P.DEEP_SOCKET.x, 5);
    expect(c2.position.z).toBeCloseTo(P.DEEP_SOCKET.z, 5);
    r.step(0.2);
    expect(r.life.deep.flowers.visible).toBe(true);
    expect(r.life.deep.state.bloom).toBeLessThan(0.5);
    r.step(BLOOM.grow + 0.3);
    expect(r.life.deep.state.bloom).toBe(1);
    expect(r.lines()).toContain(phrase('moon.deep.bloom'));
    expect(r.lines()).not.toContain(phrase('moon.deep.finale')); // the story is not told yet: Earth's finale waits for its answer
    expect(r.life.deep.state.shimmer).toBe(0);
    r.dispose();
  });
  it('the third socket takes only the Deep Cell, once, and only a woken base: a hostile or early credit does nothing', () => {
    expect(M.apply({ step: 3, cells: 3 }, { kind: 'plug', cell: 2 }).changed).toBe(false);
    expect(M.apply({ step: 0, cells: 0 }, { kind: 'plug', cell: 2 }).changed).toBe(false);
    const a = M.apply({ step: 4, cells: 3 }, { kind: 'plug', cell: 2 });
    expect(a.changed).toBe(true);
    expect(a.effect).toBe('deep');
    expect(a.moon).toMatchObject({ step: 4, cells: 7 });
    expect(M.apply(a.moon, { kind: 'plug', cell: 2 }).changed).toBe(false);
    for (const cell of [3, -1, 1.5, '2', null, undefined, NaN]) expect(M.credit({ step: 4, cells: 3 }, { kind: 'plug', cell }).changed).toBe(false);
    expect(M.credit({ step: 4, cells: 3 }, { kind: 'plug', cell: 2 }).changed).toBe(true);
    expect(M.deepIn({ step: 4, cells: 7 })).toBe(true);
    expect(M.deepIn({ step: 4, cells: 3 })).toBe(false);
  });
  it('PROPERTY: any order of any events, the Deep Cell\'s included, never lowers a step or a cell bit and always leaves a next goal', () => {
    let seed = 7;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const evs = [{ kind: 'wake' }, { kind: 'plug', cell: 0 }, { kind: 'plug', cell: 1 }, { kind: 'plug', cell: 2 }, { kind: 'beat' }, { kind: 'trace', id: 0 }, { kind: 'trace', id: 1 }, { kind: 'aim' },
      { kind: 'stamp', id: 1 }, { kind: 'load' }, { kind: 'launch' }, { kind: 'reply' }, { kind: 'zzz' }, null];
    for (let run = 0; run < 400; run++) {
      let m = { step: Math.floor(rnd() * 9), cells: Math.floor(rnd() * 8), stamp: -1, scope: 0, jump: {} };
      for (let i = 0; i < 30; i++) {
        const before = M.normalize(m);
        const r = M.apply(m, evs[Math.floor(rnd() * evs.length)]);
        const after = M.normalize(r.moon);
        expect(after.step).toBeGreaterThanOrEqual(before.step);
        expect(after.cells & before.cells).toBe(before.cells);
        expect(['pip', 'cell', 'core', 'scope', 'desk', 'rocket', 'button', 'reply', 'cave', 'done']).toContain(M.nextGoal(r.moon, rnd() < 0.3 ? 2 : null, rnd() < 0.5).kind);
        m = r.moon;
      }
    }
  });
  it('co-walk: a friend\'s plug of the Deep Cell is credited the same way (life.credit), shown and saved here too; an early one is ignored', () => {
    const r = rig({ moon: awake });
    expect(r.life.credit({ kind: 'plug', cell: 2 })).toBe('deep');
    expect(r.progression.state.moon).toMatchObject({ step: 4, cells: 7 });
    expect(r.life.base.state.cellMode[2]).toBe('plugged');
    r.step(0.3);
    expect(r.life.deep.flowers.visible).toBe(true);
    r.dispose();
    const early = rig({ moon: { step: 3, cells: 3 } });
    expect(early.life.credit({ kind: 'plug', cell: 2 })).toBe(null);
    early.dispose();
  });
  it('someone else plugged the cell she is carrying: it is in the Core now, and her mouth is empty', () => {
    const r = rig({ moon: awake });
    r.step(0.3, r.at(L.PEDESTAL.x + 1.3, L.PEDESTAL.z));
    r.prompt();
    r.life.interact();
    expect(r.life.base.state.carrying).toBe(2);
    r.life.credit({ kind: 'plug', cell: 2 });
    expect(r.life.base.state.carrying).toBe(null);
    expect(r.life.base.state.cellMode[2]).toBe('plugged');
    r.dispose();
  });
});
const cat0 = (r) => ({ x: r.cat.x, z: r.cat.z });

describe('Earth\'s finale: the bigger shimmer', () => {
  const told = { step: 8, cells: 3, stamp: 1, scope: 3 };
  it('plugging the Deep Cell AFTER the story is told: the bloom, the line and Earth\'s swells, then a faint halo that stays', () => {
    const r = rig({ moon: told });
    expect(r.life.sky.shimmer).toBe(0);
    r.step(0.3, r.at(L.PEDESTAL.x + 1.3, L.PEDESTAL.z));
    r.prompt();
    r.life.interact();
    r.step(0.3, r.at(P.CORE.x + 1.8, P.CORE.z));
    r.prompt();
    r.life.interact();
    expect(r.progression.state.moon.cells).toBe(7);
    let peak = 0;
    for (let i = 0; i < Math.round(FINALE_LENGTH * 30) + 60; i++) { r.step(1 / 30); peak = Math.max(peak, r.life.sky.shimmer); }
    expect(peak).toBeGreaterThan(0.9);
    expect(r.lines()).toContain(phrase('moon.deep.finale'));
    expect(r.life.sky.shimmer).toBeCloseTo(FINALE.rest, 5);
    expect(r.life.sky.halo).toBeTruthy();
    expect(r.life.sky.halo.name).toBe('moon:earthglow');
    r.dispose();
  });
  it('a walk that opens on a finished chapter: the bloom is in full from the first frame, no beat, no line, and Earth carries the faint halo', () => {
    const r = rig({ moon: { ...told, cells: 7 } });
    r.step(0.5, r.at(-30, 26));
    expect(r.life.deep.state.bloom).toBe(1);
    expect(r.life.deep.flowers.visible).toBe(true);
    expect(r.lines()).not.toContain(phrase('moon.deep.bloom'));
    expect(r.lines()).not.toContain(phrase('moon.deep.finale'));
    expect(r.life.sky.shimmer).toBeCloseTo(FINALE.rest, 5);
    r.dispose();
    const none = rig({ moon: told });
    none.step(0.5, none.at(-30, 26));
    expect(none.life.sky.shimmer).toBe(0);
    expect(none.life.deep.flowers.visible).toBe(false);
    expect(none.life.sky.halo).toBeNull(); // never made on a walk that does not need it: no draw
    none.dispose();
  });
  it('the flash rule: the shimmer never moves by a tenth between frames at 60 Hz, never swells more than once every 1.3 s, and rests at its floor', () => {
    let prev = finaleLevel(0);
    let peaks = 0;
    let rising = false;
    for (let i = 1; i <= Math.ceil(FINALE_LENGTH * 60); i++) {
      const v = finaleLevel(i / 60);
      expect(Math.abs(v - prev), `frame ${i}`).toBeLessThan(0.1);
      if (v > prev) rising = true;
      else if (rising && v < prev) { peaks++; rising = false; }
      prev = v;
    }
    expect(peaks).toBeLessThanOrEqual(FINALE.swells + 1);
    expect(FINALE.swell).toBeGreaterThanOrEqual(1.0); // under three swells a second, by a wide margin
    expect(finaleLevel(FINALE_LENGTH + 5)).toBeCloseTo(FINALE.rest, 5);
    expect(finaleLevel(-1)).toBe(FINALE.rest);
  });
  it('reduced motion: the bloom is whole at once and the finale is one steady glow, never a swell', () => {
    const r = rig({ moon: told, reducedMotion: true });
    r.step(0.3, r.at(L.PEDESTAL.x + 1.3, L.PEDESTAL.z));
    r.prompt();
    r.life.interact();
    r.step(0.3, r.at(P.CORE.x + 1.8, P.CORE.z));
    r.prompt();
    r.life.interact();
    r.step(0.1);
    expect(r.life.deep.state.bloom).toBe(1);
    const seen = new Set();
    for (let i = 0; i < 5 * 30; i++) { r.step(1 / 30); seen.add(Math.round(r.life.sky.shimmer * 100)); }
    expect(seen.size).toBe(1);
    expect(finaleLevel(2, true)).toBeCloseTo(0.9, 5);
    r.dispose();
  });
});

describe('the Old Dish\'s ledge', () => {
  it('is a perch of 1.1 m the Moon\'s hop takes from the dust, with a collider of its own and a lamp, and the Dish\'s find still reads her standing on it', () => {
    expect(P.MOON_PERCHES.some((p) => p.x === P.DISH_LEDGE.x && p.z === P.DISH_LEDGE.z && p.y === 1.1)).toBe(true);
    expect(P.MOON_COLLIDERS.some((c) => c.x === P.DISH_LEDGE.x && c.z === P.DISH_LEDGE.z)).toBe(true);
    expect(Math.hypot(P.DISH_LEDGE.x - P.OLD_DISH.x, P.DISH_LEDGE.z - P.OLD_DISH.z)).toBeLessThan(3); // under the bowl: the find's 3 m
  });
});
