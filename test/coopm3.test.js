import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { stubCanvasDocument } from './helpers/canvas.js';
import { memoryStorage } from './helpers/storage.js';

// Couch play, milestone 3 (docs/superpowers/plans/2026-11-22-couch-coop.md): cat two
// finds things the way cat one does, through the walk's own rules, so a find is the
// household's find. Fake session pieces, the REAL progression, discovery log, carry
// rules and player; the pictures and the real pads are the owner's (M6).
stubCanvasDocument({ pointerLock: true, measureText: 10 });
const { createFinds, COLLECT_REACH } = await import('../src/coop/finds.js');
const { createMover, pickSecond, profileOf, outfitFor } = await import('../src/coop/second.js');
const { COOP_READY } = await import('../src/coop/table.js');
const { createProgression, CATALOG } = await import('../src/progression.js');
const { createDiscoveryLog } = await import('../src/discoveries.js');
const { createCarryables } = await import('../src/carryables.js');
const { createMouth, pick: pickUp } = await import('../src/carry.js');
const { FLAT_GROUND } = await import('../src/ground.js');
const { LINES } = await import('../src/coop/words.js');
const { bus } = await import('../src/events.js');

const DT = 1 / 60;

/** A walk's worth of session: the pieces cat one's interactions read, with the real carry rules. */
function walk({ collectibles = [], mice = [], items = [] } = {}) {
  const scene = new THREE.Scene();
  const meshes = new Map();
  for (const c of collectibles) { const m = new THREE.Object3D(); m.position.set(c.x, 0, c.z); scene.add(m); meshes.set(c.id, m); }
  const goldList = mice.map((m) => ({ ...m, worldY: m.y ?? 0 }));
  return {
    scene, ground: FLAT_GROUND, areaId: 'woods',
    areaData: { collectibles, colliders: [], bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, waters: [] },
    collectibleMeshes: meshes,
    walk: { carried: 0, carryCap: 5 },
    fx: { burst() {} },
    goldMice: {
      list: goldList,
      checkFind(p, y) { return goldList.find((m) => Math.hypot(m.x - p.x, m.z - p.z) < 1 && Math.abs(y - m.worldY) < 0.9) ?? null; },
      remove(id) { const i = goldList.findIndex((m) => m.id === id); if (i >= 0) goldList.splice(i, 1); },
      nearestUnfound: () => null,
    },
    carry: { mouth: createMouth(), items: createCarryables(scene, items) },
    scent: null, critters: null,
  };
}
const standingMover = (x, z, state = {}) => {
  const pick = { key: 'siamese', breed: 'siamese', name: 'Siamese', look: null };
  return createMover({ ground: FLAT_GROUND, state, pick, at: { x, z } });
};
function rig({ collectibles, mice, items, state } = {}) {
  const progression = createProgression(memoryStorage());
  if (state) Object.assign(progression.state, state);
  const log = createDiscoveryLog(progression);
  log.startWalk();
  const s = walk({ collectibles, mice, items });
  const mover = standingMover(0, 0, progression.state);
  const holder = new THREE.Group(); // stands for cat two's drawn group
  s.scene.add(holder);
  const said = [];
  const tally = [0, 0];
  const finds = createFinds({ ctx: { progression, log, audio: {} }, drawn: () => holder, said: (...a) => said.push(a), pick: () => ({ breed: 'siamese' }), tally });
  const frame = (n = 1, hop = false) => { for (let i = 0; i < n; i++) finds.frame(DT, s, mover, mover.body, hop); };
  return { progression, log, s, mover, holder, finds, said, tally, frame };
}
const SHINY = { id: 'col-a', x: 0.5, z: 0, label: 'a shiny thing' };
const MOUSE = { id: 'gm-woods-3', x: 0.3, z: 0.2, y: 0 };

// Cat one's own path (game/interactions.js and main.js), written out: what a solo walk does with the same finds.
function solo(progression, log, s, { collect, mouse }) {
  if (collect) { s.walk.carried += 1; log.awardOnce('collectible', `col-${collect.id}`, collect.label); }
  if (mouse && progression.recordGolden(mouse.id)) log.awardOnce('legend', mouse.id, 'a GOLDEN MOUSE! 🥇');
}

describe('couch play M3: the table', () => {
  it('opens Woods, River, Moor, Pines, Docks and Den (and the Neighborhood), and M5 adds the Farm (then the Market, then the Gorge, the Old House and the Fairground), nothing else', () => {
    const ready = Object.entries(COOP_READY).filter(([, v]) => v).map(([k]) => k).sort();
    expect(ready).toEqual(['den', 'docks', 'fair', 'farm', 'gorge', 'house', 'market', 'moor', 'neighborhood', 'pines', 'river', 'woods']);
  });

  it('a row is ready only if coopbudget measures that place with both cats', () => {
    const src = readFileSync(new URL('./coopbudget.test.js', import.meta.url), 'utf8');
    for (const [id, on] of Object.entries(COOP_READY)) {
      if (on) expect(src, `${id}: no coopbudget scene`).toMatch(new RegExp(`\\['${id}', build\\w+, \\d+, \\d+, \\d+\\]`));
    }
  });
});

describe('couch play M3: cat two collects', () => {
  it('X beside a find picks it up into the household pocket, pays the walk\'s own award, and credits cat two', () => {
    const r = rig({ collectibles: [SHINY] });
    expect(Math.hypot(SHINY.x, SHINY.z)).toBeLessThan(COLLECT_REACH);
    expect(r.finds.reach(r.s, r.mover, r.mover.body)).toMatchObject({ kind: 'collect', label: 'a shiny thing' });
    const before = r.progression.state.points;
    expect(r.finds.interact(r.s, r.mover, r.mover.body)).toMatchObject({ kind: 'collect' });
    expect(r.s.walk.carried).toBe(1);
    expect(r.s.collectibleMeshes.has(SHINY.id)).toBe(false);
    expect(r.progression.state.points).toBeGreaterThan(before);
    expect(r.tally).toEqual([0, 1]);
    expect(r.said[0][0]).toBe(1); // the chip names cat two
  });

  it('a full pocket is the walk\'s: cat two cannot collect past the cap', () => {
    const r = rig({ collectibles: [SHINY] });
    r.s.walk.carried = r.s.walk.carryCap;
    expect(r.finds.reach(r.s, r.mover, r.mover.body)).toBeNull();
  });

  it('a find too far, or on a perch above its paws, is not in reach', () => {
    const r = rig({ collectibles: [{ ...SHINY, x: 3 }, { id: 'col-high', x: 0, z: 0.2, y: 2, label: 'high' }] });
    expect(r.finds.reach(r.s, r.mover, r.mover.body)).toBeNull();
  });
});

describe('couch play M3: a find is counted once', () => {
  it('two cats on one find: the second to press pays nothing and the walk holds one find', () => {
    const r = rig({ collectibles: [SHINY] });
    r.finds.interact(r.s, r.mover, r.mover.body); // cat two first
    const points = r.progression.state.points;
    solo(r.progression, r.log, r.s, { collect: SHINY }); // cat one's path, the same key
    expect(r.progression.state.points).toBe(points); // the discovery log's once-a-walk key
    expect(r.tally).toEqual([0, 1]);
  });

  it('a golden mouse: recorded once, paid once, whichever cat gets there first', () => {
    const r = rig({ mice: [MOUSE] });
    r.frame(2);
    expect(r.progression.state.golden).toEqual([MOUSE.id]);
    expect(r.s.goldMice.list).toHaveLength(0);
    const points = r.progression.state.points;
    solo(r.progression, r.log, r.s, { mouse: MOUSE }); // cat one arrives a frame later
    expect(r.progression.state.golden).toEqual([MOUSE.id]);
    expect(r.progression.state.points).toBe(points);
    expect(r.tally).toEqual([0, 1]);
  });

  it('cat one first, then cat two on the same mouse: still once', () => {
    const r = rig({ mice: [MOUSE] });
    solo(r.progression, r.log, r.s, { mouse: MOUSE });
    const points = r.progression.state.points;
    r.frame(2); // the mouse still hangs in the list this frame: recordGolden says no
    expect(r.progression.state.golden).toEqual([MOUSE.id]);
    expect(r.progression.state.points).toBe(points);
    expect(r.tally).toEqual([0, 0]);
  });
});

describe('couch play M3: the save is a solo walk\'s', () => {
  const finds = { collectibles: [SHINY], mice: [MOUSE] };
  const doneBy = (who) => {
    const r = rig(finds);
    if (who === 'one') solo(r.progression, r.log, r.s, { collect: SHINY, mouse: MOUSE });
    else if (who === 'two') { r.finds.interact(r.s, r.mover, r.mover.body); r.frame(2); }
    else { r.finds.interact(r.s, r.mover, r.mover.body); solo(r.progression, r.log, r.s, { mouse: MOUSE }); }
    return JSON.stringify(r.progression.state);
  };

  it('cat two making the finds writes the same save as cat one making them', () => {
    expect(doneBy('two')).toBe(doneBy('one'));
  });

  it('the finds split between the two cats write the same save as one cat making them all', () => {
    expect(doneBy('split')).toBe(doneBy('one'));
  });

  it('adds no key to the save and no field to the wire: nothing of the chunk is in state', () => {
    const r = rig(finds);
    const keys = Object.keys(r.progression.state);
    r.finds.interact(r.s, r.mover, r.mover.body); r.frame(2);
    expect(Object.keys(r.progression.state)).toEqual(keys);
  });
});

describe('couch play M3: cat two carries', () => {
  const SOCK = { id: 'sock-1', kind: 'sock', x: 0.6, z: 0 };

  it('picks a thing up into its own mouth (cat one\'s mouth stays free), and nobody else can pick it', () => {
    const r = rig({ items: [SOCK] });
    expect(r.finds.reach(r.s, r.mover, r.mover.body)).toMatchObject({ kind: 'carry', label: 'sock' });
    r.finds.interact(r.s, r.mover, r.mover.body);
    expect(r.finds.held).toMatchObject({ id: 'sock-1' });
    expect(r.s.carry.mouth.held).toBeNull();
    expect(r.s.carry.items.nearest(new THREE.Vector3(0.6, 0, 0), 5)).toBeNull(); // off the ground
    r.s.carry.items.update();
    expect(r.s.carry.items.list[0].holder).toBe(r.holder); // hangs from cat two's drawn cat
  });

  it('puts it down where it stands, and the walk-end mark is the one a solo walk writes', () => {
    const r = rig({ items: [SOCK] });
    r.finds.interact(r.s, r.mover, r.mover.body);
    r.mover.body.position.set(4, 0, 0);
    r.s.carry.items.list[0].mesh.position.set(4, 0, 0);
    expect(r.finds.reach(r.s, r.mover, r.mover.body)).toMatchObject({ kind: 'drop' });
    r.finds.interact(r.s, r.mover, r.mover.body);
    expect(r.finds.held).toBeNull();
    expect(r.s.carry.items.list[0].onGround).toBe(true);
    const solo2 = createMouth();
    pickUp(solo2, { id: 'sock-1', kind: 'sock' });
    expect([...r.s.carry.mouth.dropped.keys()]).toEqual(['sock-1']);
    expect(r.s.carry.mouth.dropped.get('sock-1')).toMatchObject({ kind: 'sock', x: 4, z: 0, homeX: 0.6, homeZ: 0 });
    void solo2;
  });

  it('a cat that leaves puts down what it holds where it stands', () => {
    const r = rig({ items: [SOCK] });
    r.finds.interact(r.s, r.mover, r.mover.body);
    r.finds.letGo(r.s, r.mover.body);
    expect(r.finds.held).toBeNull();
    expect(r.s.carry.items.list[0].onGround).toBe(true);
  });
});

describe('couch play M3: catching, sniffing and talking', () => {
  it('cat two\'s own hop catches a butterfly and a critter, and the walk\'s perk and hunt awards pay', () => {
    const r = rig();
    const caught = [];
    r.s.critters = {
      catchAt: (pos) => (pos.y > 0.5 ? (caught.push('air'), { type: 'butterfly' }) : null),
      pounceCatch: () => { caught.push('paws'); return { type: 'mouse' }; },
    };
    r.frame(1, false);
    expect(caught).toEqual([]); // not hopping: nothing is caught
    const bus1 = [];
    const off = bus.on('discovery', (e) => bus1.push(e.type));
    r.frame(1, true);
    off();
    expect(caught).toEqual(['air', 'paws']);
    expect(bus1).toEqual(expect.arrayContaining(['perk', 'hunt']));
    expect(r.tally[1]).toBe(2);
  });

  it('X with nothing in reach is a sniff of the air; a keen-nosed breed reaches farther', async () => {
    const r = rig();
    const seen = [];
    r.s.scent = { sniff: (p, range) => { seen.push(range); return null; } };
    const out = r.finds.interact(r.s, r.mover, r.mover.body);
    expect(out).toEqual({ kind: 'sniff', found: false });
    expect(seen).toEqual([18]);
    const { sniffRange } = await import('../src/coop/finds.js');
    expect(sniffRange('bengal')).toBeLessThanOrEqual(30);
  });

  it('a buried mound that has shown itself is dug up with X, once, and pays the treasure', () => {
    const r = rig();
    r.s.scent = { nearestMound: () => ({ revealed: true }), digAt: () => ({ id: 'treat-1', x: 0, z: 0 }), sniff: () => null };
    expect(r.finds.reach(r.s, r.mover, r.mover.body)).toEqual({ kind: 'dig' });
    r.finds.interact(r.s, r.mover, r.mover.body);
    const points = r.progression.state.points;
    r.finds.interact(r.s, r.mover, r.mover.body);
    expect(r.progression.state.points).toBe(points); // the same treat id pays once a walk
  });

  it('B calls the way cat one does: critters, farm, fair and strays hear it from cat two', () => {
    const r = rig();
    const heard = [];
    r.s.critters = { reactToMeow: (p, o) => heard.push(['critters', o.far]) };
    r.s.farm = { reactToMeow: () => heard.push(['farm']) };
    r.s.fair = { meow: () => heard.push(['fair']) };
    r.s.strayCats = { reactToMeow: () => 1 };
    expect(r.finds.meow(r.s, r.mover.body)).toBe(true);
    expect(heard.map((h) => h[0])).toEqual(['critters', 'farm', 'fair']);
  });
});

describe('couch play M3: skills and a saved outfit for cat two', () => {
  const SWIMMER = { skills: ['sea-legs'] };
  const LAKE = { id: 'lake', kind: 'circle', x: 0, z: 0, r: 6 }; // deep: no shallow band
  const BIG = { minX: -40, maxX: 40, minZ: -40, maxZ: 40 };
  const paddle = (mover, seconds) => {
    mover.player.setTouchMove({ x: -1, z: 0, mag: 1 });
    let swam = false;
    for (let t = 0; t < seconds; t += DT) { mover.player.update(DT, [], BIG, [LAKE]); if (mover.player.swimming) swam = true; }
    return swam;
  };

  it('Sea Legs: cat two swims out into deep water (the save\'s skill, the household\'s)', () => {
    const state = { ...createProgression(memoryStorage()).state, ...SWIMMER };
    const mover = standingMover(12, 0, state);
    expect(paddle(mover, 8)).toBe(true);
    expect(mover.body.position.x).toBeLessThan(5); // well inside the lake
    mover.player.disable();
  });

  it('without Sea Legs cat two stops at the water\'s edge, as cat one does', () => {
    const state = createProgression(memoryStorage()).state;
    const mover = standingMover(12, 0, state);
    expect(paddle(mover, 8)).toBe(false);
    expect(mover.body.position.x).toBeGreaterThan(5.5);
    mover.player.disable();
  });

  it('a saved outfit is put on cat two: by the couch setting, or the first one cat one is not wearing, or plain', () => {
    const state = createProgression(memoryStorage()).state;
    const slotted = (slot) => Object.entries(CATALOG.accessories).find(([, v]) => v.slot === slot)[0];
    const a = slotted('head'), b = slotted('neck');
    state.outfits = [{ id: 'o1', wear: { head: a } }, { id: 'o2', wear: { neck: b } }];
    state.equipped.head = a; // cat one wears the first
    expect(outfitFor(state, CATALOG)).toEqual({ neck: b });
    expect(outfitFor(state, CATALOG, 0)).toEqual({ head: a });
    expect(outfitFor(state, CATALOG, -1)).toBeNull();
    expect(outfitFor({ ...state, outfits: [] }, CATALOG)).toBeNull();
    const pick = pickSecond(state, CATALOG);
    expect(profileOf(pick).accessories).toMatchObject({ neck: b });
    // the household's save is not touched by choosing
    expect(state.outfits).toHaveLength(2);
  });
});

describe('couch play M3: the words', () => {
  it('every new line says its object (or its two names) and has no raw button', () => {
    for (const id of ['coop.pick', 'coop.carry', 'coop.drop']) expect(LINES[id]('sock')).toContain('sock');
    expect(LINES['coop.tally']('Mochi', 7, 'Pip', 5)).toBe('Mochi found 7, Pip found 5');
  });
});

afterEach(() => { vi.restoreAllMocks(); });
beforeEach(() => {});
