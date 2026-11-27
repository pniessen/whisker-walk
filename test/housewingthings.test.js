import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { canvasStub } from './helpers/growriver.js';

vi.stubGlobal('document', canvasStub);

const T = await import('../src/world/housewingthings.js');
const { HOUSE_YARN_SPOTS, HOUSE_GOLD_MICE } = await import('../src/world/housethings.js');
const { HOUSE_FURNITURE, HOUSE_LEDGES, HOUSE_DOORWAYS, HOUSE_STAIRS, houseArea, roomAt } = await import('../src/world/houseplan.js');
const { houseMovesArea } = await import('../src/world/housemoves.js');
const { houseFlood } = await import('./helpers/houseflood.js');
const { floodTraversal } = await import('./helpers/traversalflood.js');
const { BASE_ABILITIES } = await import('../src/traversal.js');
const { createRests } = await import('../src/rests.js');
const { LINES } = await import('../src/world/housewingwords.js');
await (await import('../src/world/housestages.js')).loadHouseStages(); // the wing's lazy stage (housestagewing.js) fills the house's wing slots
const { build } = await import('../src/world/house.js');

// The Old House's east wing, milestone 2: its data. Slots, rests, finds, hints, nooks.

const area = houseMovesArea();
const flood = houseFlood(houseArea());
const tflood = floodTraversal(area, { abilities: BASE_ABILITIES });
const home = tflood.regionAt(area.spawn.x, area.spawn.z);
const reachable = tflood.reachable(home);
const record = build(new THREE.Scene());

describe('the solarium\'s four sunny slots', () => {
  it('four, 1.2 m across, inside the solarium, on clear floor, none under or against a piece, none in a doorway or at the stair', () => {
    expect(T.HOUSE_WING_SLOTS.length).toBe(4);
    expect(T.SLOT_SIZE).toBe(1.2);
    for (const s of T.HOUSE_WING_SLOTS) {
      expect(roomAt(s.x, s.z), s.id).toBe('solarium');
      expect(flood.reachesWithin(s.x, s.z, 0.3), s.id).toBe(true);
      expect(area.ground.y(s.x, s.z), s.id).toBe(0);
      for (const f of HOUSE_FURNITURE.filter((q) => q.room === 'solarium' && q.r > 0)) {
        expect(Math.hypot(s.x - f.x, s.z - f.z) - f.r, `${s.id} ${f.id}`).toBeGreaterThan(0.6 + 0.3);
      }
      for (const d of HOUSE_DOORWAYS) expect(Math.hypot(s.x - d.x, s.z - d.z), `${s.id} ${d.id}`).toBeGreaterThan(2);
      const st = HOUSE_STAIRS.find((q) => q.id === 'wing');
      expect(Math.hypot(s.x - st.x0, s.z - st.z0), s.id).toBeGreaterThan(2);
    }
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
      const a = T.HOUSE_WING_SLOTS[i], b = T.HOUSE_WING_SLOTS[j];
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(T.SLOT_SIZE * 2);
    }
  });

  it('each is a nap spot with no mesh of its own, and the sofa\'s seat is one only to paws on the seat', () => {
    const rests = T.HOUSE_WING_RESTS;
    expect(rests.every((r) => r.kind === 'nap' && r.mesh === false)).toBe(true);
    expect(rests.map((r) => r.id)).toEqual(['house-nap-sofa', ...T.HOUSE_WING_SLOTS.map((s) => `house-nap-${s.id}`)]);
    expect(record.rests).toBe(rests);
    const made = createRests(new THREE.Scene(), rests);
    const sofa = rests[0];
    expect(made.nearest({ x: sofa.x, y: 0, z: sofa.z + 1.0 }, 1.2)).toBeNull(); // the floor in front
    expect(made.nearest({ x: sofa.x, y: 0.55, z: sofa.z }, 1.2).id).toBe('house-nap-sofa');
    const s = T.HOUSE_WING_SLOTS[1];
    expect(made.nearest({ x: s.x + 0.3, y: 0, z: s.z }, 1.2).id).toBe('house-nap-slot-2');
    made.dispose();
  });

  it('a rest with no `y` is offered as it always was, to a position with no height too', () => {
    const made = createRests(new THREE.Scene(), [{ id: 'a', kind: 'nap', x: 0, z: 0, mesh: false }]);
    expect(made.nearest({ x: 0.5, z: 0 }, 1.2).id).toBe('a');
    expect(made.nearest({ x: 0.5, y: -3, z: 0 }, 1.2).id).toBe('a');
    made.dispose();
  });
});

describe('the finds, the mice, the yarn, the hints and the nooks', () => {
  it('every find is in its room on ground she can reach; arrive finds name a real ledge she can climb to', () => {
    for (const f of T.HOUSE_WING_FINDS) {
      if (f.trigger === 'slot' || f.trigger === 'slots') continue;
      expect(roomAt(f.x, f.z), f.id).toBe(f.room);
      if (f.ledge) {
        const l = HOUSE_LEDGES.find((q) => q.id === f.ledge);
        expect(l, f.id).toBeTruthy();
        const r = tflood.regionAt((l.minX + l.maxX) / 2, (l.minZ + l.maxZ) / 2, l.y);
        expect(reachable.has(r), f.id).toBe(true);
        expect(tflood.reachable(r).has(home), f.id).toBe(true); // and back down
      } else expect(flood.reachesWithin(f.x, f.z, f.r), f.id).toBe(true);
    }
    expect(record.house.wingFinds).toBe(T.HOUSE_WING_FINDS);
  });

  it('the top bunk\'s golden mouse is 2 m from the other collectibles and 3 m from every yarn spot', () => {
    const m = T.HOUSE_WING_GOLD[0];
    expect(HOUSE_GOLD_MICE).toContain(m);
    for (const o of HOUSE_GOLD_MICE) if (o !== m) expect(Math.hypot(o.x - m.x, o.z - m.z)).toBeGreaterThan(2);
    for (const y of HOUSE_YARN_SPOTS) expect(Math.hypot(y.x - m.x, y.z - m.z)).toBeGreaterThan(3);
  });

  it('every hint names a real wing room, a find in that room, and a line in the table', () => {
    for (const h of T.HOUSE_WING_HINTS) {
      const f = T.HOUSE_WING_FINDS.find((q) => q.id === h.find);
      expect(f, h.find).toBeTruthy();
      expect(f.room).toBe(h.room);
      expect(Object.hasOwn(LINES, h.words), h.words).toBe(true);
    }
    expect(new Set(T.HOUSE_WING_HINTS.map((h) => h.room))).toEqual(new Set(['livingroom', 'solarium', 'kids', 'bath']));
  });

  it('three outfit nooks, data only: each reachable, in its room, 3 m from yarn spots and 2 m from golden mice', () => {
    expect(T.HOUSE_WING_NOOKS.length).toBe(3);
    for (const n of T.HOUSE_WING_NOOKS) {
      expect(roomAt(n.x, n.z), n.id).toBe(n.room);
      const r = tflood.regionAt(n.x, n.z, area.ground.y(n.x, n.z)); // her feet, on the ground there (a ledge's top included)
      expect(reachable.has(r), n.id).toBe(true);
      for (const y of HOUSE_YARN_SPOTS) expect(Math.hypot(y.x - n.x, y.z - n.z), n.id).toBeGreaterThanOrEqual(3);
      for (const g of HOUSE_GOLD_MICE) expect(Math.hypot(g.x - n.x, g.z - n.z), n.id).toBeGreaterThanOrEqual(1.9);
    }
  });
});
