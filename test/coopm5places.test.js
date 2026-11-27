import { describe, it, expect, afterEach } from 'vitest';
import { coop, joined, pad, set, reset, newSession, PAD_BUTTONS, FLAT_GROUND, THREE } from './helpers/couchrig.js';
import { stubCanvasDocument } from './helpers/canvas.js';

// Couch play M5(a): the places M3 opened (Woods, River, Moor, Pines, Docks, Den) checked again now that the M4 verbs
// exist: a place change brings cat two in on clear ground of the REAL place, it can walk off (no boxed-in spawn), the
// two groom and play tag there, and the walk goes on from place to place with both cats. Real areas; fake pads.
stubCanvasDocument({ pointerLock: true, measureText: 10 });
const { build: buildWoods } = await import('../src/world/woods.js');
const { build: buildRiver } = await import('../src/world/river.js');
const { build: buildMoor } = await import('../src/world/moor.js');
const { build: buildPines } = await import('../src/world/pines.js');
const { build: buildDocks } = await import('../src/world/docks.js');
const { build: buildDen } = await import('../src/world/den.js');
const { isWalkableAt } = await import('../src/player.js');
const { COOP_READY } = await import('../src/coop/table.js');

const { A } = PAD_BUTTONS;
const DPAD_LEFT = 14;
const PLACES = [['woods', buildWoods], ['river', buildRiver], ['moor', buildMoor], ['pines', buildPines], ['docks', buildDocks], ['den', buildDen]];
afterEach(reset);

function realSession(id, build) {
  const s = newSession(id);
  const area = build(s.scene);
  s.areaData = { collectibles: [], waters: [], perches: [], ...area };
  s.cat.position.set(area.spawn.x, 0, area.spawn.z);
  return s;
}
const standStill = (r, n = 90) => { set(r, pad(0), pad(1)); r.tick(n); };

describe('couch play M5(a): the open places, again, with the M4 verbs', () => {
  for (const [id, build] of PLACES) {
    describe(id, () => {
      it('is ready, and a place change brings cat two in beside cat one on clear ground', () => {
        expect(COOP_READY[id]).toBe(true);
        const r = joined();
        const s = realSession(id, build);
        r.setSession(s); r.tick(2);
        expect(r.h.state.joined).toBe(true);
        const g = r.two().group.position;
        expect(isWalkableAt(s.areaData, g.x, g.z)).toBe(true);
        expect(Math.hypot(g.x - s.cat.position.x, g.z - s.cat.position.z)).toBeLessThan(3.5);
      });

      it('cat two can walk away from where it stands (not boxed in), and stays on walkable ground', () => {
        const r = joined();
        const s = realSession(id, build);
        r.setSession(s); r.tick(2);
        const start = r.two().group.position.clone();
        let far = 0;
        for (const axes of [[1, 0, 0, 0], [-1, 0, 0, 0], [0, 1, 0, 0], [0, -1, 0, 0]]) {
          set(r, pad(0), pad(1, [], axes)); r.tick(45);
          const g = r.two().group.position;
          far = Math.max(far, Math.hypot(g.x - start.x, g.z - start.z));
          expect(isWalkableAt(s.areaData, g.x, g.z), `${id}: cat two ended inside something`).toBe(true);
        }
        expect(far).toBeGreaterThan(1.5);
      });

      it('the two groom here (D-pad Left, close and still), once, and say so', () => {
        const r = joined();
        const s = realSession(id, build);
        r.setSession(s); r.tick(2);
        s.idleTime = 3;
        standStill(r, 100);
        set(r, pad(0), pad(1, [DPAD_LEFT])); r.tick(2);
        set(r, pad(0), pad(1)); r.tick(20);
        expect(r.two().pose).toBe('groom');
        r.tick(220); r.tick(300);
        expect(r.toasts.some((t) => /groom each other/.test(t))).toBe(true);
      });

      it('the place carries on to the next one with both cats (no press)', () => {
        const r = joined();
        const next = PLACES[(PLACES.findIndex(([n]) => n === id) + 1) % PLACES.length];
        r.setSession(realSession(id, build)); r.tick(2);
        const s2 = realSession(next[0], next[1]);
        r.setSession(s2); r.tick(2);
        expect(r.h.state.joined).toBe(true);
        expect(s2.remotes.list).toHaveLength(1);
      });
    });
  }

  it('a landing beside the friend is a tag in a real place too (the Woods)', async () => {
    const { pounceArc } = await import('../src/player.js');
    const r = joined();
    const s = realSession('woods', buildWoods);
    r.setSession(s); r.tick(2);
    set(r, pad(0), pad(1, [], [-1, 0, 0, 0])); r.tick(14);
    set(r, pad(0), pad(1)); r.tick(30);
    expect(r.h.state.apart).toBeLessThan(1.3);
    set(r, pad(0), pad(1, [A])); r.tick(3);
    set(r, pad(0), pad(1)); r.tick(60); r.tick(200); r.tick(300);
    expect(r.toasts.some((t) => /tagged/.test(t))).toBe(true);
    expect(pounceArc).toBeTypeOf('function');
    expect(coop.poll).toBeTypeOf('function');
    expect(FLAT_GROUND).toBeTruthy();
    expect(THREE).toBeTruthy();
  });
});
