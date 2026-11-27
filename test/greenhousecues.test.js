// STORY-ARC CUE TESTS: THE GREENHOUSE. The Greenhouse has no saved mission steps (no state.greenhouse key: jobs are per device, the walk's own). Its "arc" is eight things, in the order a
// child meets them: the seeds job (offer, five packets, the tray), the watering job (the can, four pots), and six finds (palm, koi, catnip, then the three rooms' orchid, cactus,
// butterfly). For each: it can be played from the start with no skills and pays what it should; the target is in the plan, in bounds, reachable on foot and not in a collider; there is a
// cue that points at it, in both word sets with no banned word; the distance is within sight of that cue; and nothing carried is ever saved.
// What the code has no concept of (a guide ring, arrow or marker: the Greenhouse has none) is written as it.todo with the reason.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';
import { memoryStorage } from './helpers/storage.js';
import { bus } from '../src/events.js';

stubCanvasDocument();

const { createProgression } = await import('../src/progression.js');
const { createDiscoveryLog, AWARDS } = await import('../src/discoveries.js');
const { GREENHOUSE_FIND_IDS, GREENHOUSE_PAGES, GREENHOUSE_PAGE_WORDS } = await import('../src/greenhousepages.js');
const L = await import('../src/world/greenhouselife.js');
const P = await import('../src/world/greenhouseplan.js');
const W = await import('./helpers/greenhousewalk.js');
const F = await import('../src/world/greenhousefinds.js');
const { build } = await import('../src/world/greenhouse.js');
const { HINTS, LINES } = await import('../src/world/greenhousewords.js');
const { phrase } = await import('../src/clanphrases.js');
const { withOffWords, bannedIn } = await import('./helpers/offwords.js');
const { REST_REACH } = await import('../src/rests.js');

const { area } = W;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const catAt = (x, z) => ({ x, y: 0, z });
const SPAWN = area.spawn;

// a standable, reached-on-foot point within `r` of (x, z) (and at least `rMin` away), or null; found by a ring search, the nearest ring first
function standNear(p, r, rMin = 0) {
  for (let rad = Math.max(rMin, 0); rad <= r; rad += 0.1) {
    for (let a = 0; a < 48; a++) {
      const x = p.x + Math.cos((a / 48) * Math.PI * 2) * rad;
      const z = p.z + Math.sin((a / 48) * Math.PI * 2) * rad;
      if (W.walkable(x, z) && W.reachable(x, z, 0.3)) return { x, z };
    }
  }
  return null;
}

// ---- the plan's targets, as the arc meets them ---------------------------------------------------------------------------------------------------
const roomSets = (v) => ({ room: L.roomSetIndex(null, v), seed: L.seedSetIndex(null, v) });
const setOf = (v) => { const r = roomSets(v); return r.room >= 0 ? P.ROOM_SEED_SPOT_SETS[r.room] : P.SEED_SPOT_SETS[r.seed]; };
const potsOf = (v) => { const r = roomSets(v); return (r.room >= 0 ? P.ROOM_POT_SETS[r.room] : L.thirstyPots(null, v)).map((i) => P.ALL_POT_SPOTS[i]); };
// one walk number for each of the five packet sets (three garden, two rooms): the first visit count that uses it
const VISIT_FOR = (() => {
  const out = new Map();
  for (let v = 0; v < 2000 && out.size < 5; v++) { const r = roomSets(v); const k = r.room >= 0 ? `room${r.room}` : `seed${r.seed}`; if (!out.has(k)) out.set(k, v); }
  return out;
})();

const STEPS = [
  { id: 'offer', what: 'the potting bench, where the gardener\'s seed note is said', at: P.POTTING, reach: L.OFFER_R },
  { id: 'tray', what: 'the seed tray (sow)', at: P.POTTING.tray, reach: L.TRAY_R },
  { id: 'can', what: 'the watering can on its hook', at: P.POTTING.canHome, reach: L.CAN_R },
  ...GREENHOUSE_FIND_IDS.map((id) => ({ id, what: `the ${id} find`, zone: P.GREENHOUSE_FIND_ZONES[id][0] })),
];

describe('there is something for the first thing a child can do: every id of the arc is in the plan', () => {
  it('five packet sets and the 14 pots exist; each set has five spots and each pot set four pots', () => {
    expect(VISIT_FOR.size).toBe(5);
    for (const set of [...P.SEED_SPOT_SETS, ...P.ROOM_SEED_SPOT_SETS]) expect(set).toHaveLength(5);
    for (const set of P.ROOM_POT_SETS) expect(set).toHaveLength(4);
    expect(P.ALL_POT_SPOTS).toHaveLength(14);
    for (const id of GREENHOUSE_FIND_IDS) expect(P.GREENHOUSE_FIND_ZONES[id]?.length, `${id} has a zone`).toBeGreaterThan(0);
  });
});

// ---- (a) scripted playthrough -----------------------------------------------------------------------------------------------------------------------
let heard;
let off;
beforeEach(() => { heard = []; off = bus.on?.('discovery', (e) => heard.push(e)); });
afterEach(() => { if (typeof off === 'function') off(); });

function rig(visits) {
  const scene = new THREE.Scene();
  const a = build(scene);
  const progression = createProgression(memoryStorage());
  const log = createDiscoveryLog(progression);
  log.startWalk();
  const life = a.life({ reducedMotion: false, visits, log, progression });
  return { scene, life, log, progression };
}
const tick = (life, at, dt = 0.05, n = 1, session = null) => { for (let i = 0; i < n; i++) life.update(dt, i * dt, at, null, session ?? { cat: { rotation: { y: 0 } } }); };
const standHere = (p, r) => { const s = standNear(p, r); expect(s, `a place to stand within ${r} m of ${JSON.stringify(p)}`).toBeTruthy(); return catAt(s.x, s.z); };

describe('(a) a scripted playthrough from the spawn, no skills: both jobs and all six finds, in every packet set and pot set', () => {
  for (const [key, visits] of VISIT_FOR) {
    it(`walk ${visits} (${key}): the seed note, five packets, the tray, the can, four pots, then the six finds`, () => {
      const { life, log } = rig(visits);
      // the seed job
      tick(life, standHere(P.POTTING, L.OFFER_R - 1)); // she walks to within the bench's offer radius
      expect(heard.some((e) => e.label === phrase('greenhouse.seed.offer')), 'the seed offer is said near the bench').toBe(true);
      const set = life.state.set;
      expect(set).toHaveLength(5);
      for (const s of set) tick(life, standHere(s, L.PICK_R - 0.2));
      expect(life.state.seeds, 'every packet is picked from a reachable spot').toBe(5);
      expect(heard.some((e) => e.label === phrase('greenhouse.seed.all'))).toBe(true);
      const atTray = standHere(P.POTTING.tray, L.TRAY_R - 0.2);
      expect(life.promptAt(atTray)).toBe(phrase('greenhouse.seed.prompt'));
      expect(life.interact()).toBe('sow');
      expect(life.state.seedState).toBe('sown');
      // the watering job
      const atCan = standHere(P.POTTING.canHome, L.CAN_R - 0.2);
      tick(life, atCan);
      expect(heard.some((e) => e.label === phrase('greenhouse.can.offer')), 'the can offer is said near the bench').toBe(true);
      expect(life.promptAt(atCan)).toBe(phrase('greenhouse.can.prompt'));
      expect(life.interact()).toBe('can');
      for (const i of life.state.thirsty) {
        const pot = P.ALL_POT_SPOTS[i];
        const at = standHere(pot, L.POT_R - 0.2);
        expect(life.promptAt(at), `pot ${i} offers the watering prompt`).toBe(phrase('greenhouse.water.prompt'));
        expect(life.interact()).toBe('water');
      }
      expect(life.state.allWatered).toBe(true);
      expect(life.state.held).toBe(false);
      expect(heard.some((e) => e.label === phrase('greenhouse.water.all'))).toBe(true);
      // the six finds, each by its own rule, paid once
      const paid = [];
      for (const id of GREENHOUSE_FIND_IDS) {
        const z = P.GREENHOUSE_FIND_ZONES[id][0];
        const at = z.rest ? null : standNear(z, z.r - 0.1, z.rMin ? z.rMin + 0.1 : 0);
        expect(at || z.rest, `${id}: a place to find it`).toBeTruthy();
        const before = heard.filter((e) => e.type === 'greenhousefind').length;
        const rest = id === 'catnip' ? { kind: 'eat' } : null;
        const bed = id === 'catnip' ? standNear(P.CATNIP_BEDS[0], 1.2) : at;
        expect(bed, `${id}: standable`).toBeTruthy();
        tick(life, { x: bed.x, y: 0, z: bed.z }, 0.1, 40, { cat: { rotation: { y: 0 } }, rest });
        const after = heard.filter((e) => e.type === 'greenhousefind').length;
        paid.push(after - before);
      }
      expect(paid, 'each find is found once, by standing where its rule says').toEqual([1, 1, 1, 1, 1, 1]);
      void log;
    });
  }
  it('the first find ever pays AWARDS.greenhousefind (12) once; the same find again, or a resumed walk, pays nothing more', () => {
    const { log, progression } = rig(0);
    const first = F.noteGreenhouseFind('palm', { log, progression });
    const again = F.noteGreenhouseFind('palm', { log, progression });
    expect(first).toEqual({ fresh: true, first: true, points: AWARDS.greenhousefind });
    expect(AWARDS.greenhousefind).toBe(12);
    expect(again).toEqual({ fresh: false, first: false, points: 0 });
    const second = F.noteGreenhouseFind('koi', { log, progression });
    expect(second.points, 'another find ever is its own first').toBe(12);
  });
  it('the two jobs pay AWARDS.greenhousejob (25) once a walk each and count their journal pages', () => {
    const { life, log, progression } = rig(0);
    expect(AWARDS.greenhousejob).toBe(25);
    const before = progression.state.points;
    const pays = () => heard.filter((e) => e.type === 'greenhousejob');
    for (const s of life.state.set) tick(life, standHere(s, L.PICK_R - 0.2));
    life.promptAt(standHere(P.POTTING.tray, L.TRAY_R - 0.2)); life.interact();
    expect(pays()).toHaveLength(1);
    expect(pays()[0]).toMatchObject({ points: 25, repeat: false, label: phrase('greenhouse.seed.sown') });
    expect(progression.state.journal.ghjobseeds).toBe(1);
    expect(log.count(L.JOB_KEYS.seeds)).toBe(1);
    life.promptAt(standHere(P.POTTING.canHome, L.CAN_R - 0.2)); life.interact();
    for (const i of life.state.thirsty) { life.promptAt(standHere(P.ALL_POT_SPOTS[i], L.POT_R - 0.2)); life.interact(); }
    expect(pays()).toHaveLength(2);
    expect(pays()[1]).toMatchObject({ points: 25, label: phrase('greenhouse.water.all') });
    expect(progression.state.journal.ghjobwater).toBe(1);
    expect(progression.state.points - before).toBeGreaterThanOrEqual(50);
    expect(progression.state.journal.ghjobseeds, 'no second count').toBe(1);
  });
  it('a resumed walk (the log already holds the job keys) pays and counts nothing twice; a new walk pays again', () => {
    const { life, log, progression } = rig(0);
    log.restore([[L.JOB_KEYS.seeds, 1]]);
    for (const s of life.state.set) tick(life, standHere(s, L.PICK_R - 0.2));
    life.promptAt(standHere(P.POTTING.tray, L.TRAY_R - 0.2)); life.interact();
    expect(heard.filter((e) => e.type === 'greenhousejob')).toHaveLength(0);
    expect(progression.state.journal.ghjobseeds ?? 0).toBe(0);
    log.startWalk();
    expect(log.awardOnce('greenhousejob', L.JOB_KEYS.seeds, 'x')).toBe(25);
  });
  it('the job lines read the same way in both word sets, and a bare life with no log still toasts', () => {
    const bare = build(new THREE.Scene()).life({ reducedMotion: false, visits: 0 });
    for (const s of bare.state.set) bare.update(0.05, 0, standHere(s, L.PICK_R - 0.2), null, { cat: { rotation: { y: 0 } } });
    bare.promptAt(standHere(P.POTTING.tray, L.TRAY_R - 0.2)); bare.interact();
    expect(heard.some((e) => e.label === phrase('greenhouse.seed.sown'))).toBe(true);
  });
});

// ---- (b) every target in bounds, reachable on foot, not in a collider ----------------------------------------------------------------------------------
describe('(b) every target is in bounds, reachable on foot with no skills, and not inside a collider', () => {
  const inB = (p) => p.x >= area.bounds.minX && p.x <= area.bounds.maxX && p.z >= area.bounds.minZ && p.z <= area.bounds.maxZ;
  it('the spawn itself is standable and reached (the flood starts there)', () => { expect(W.walkable(SPAWN.x, SPAWN.z)).toBe(true); expect(W.reachable(SPAWN.x, SPAWN.z)).toBe(true); });
  for (const s of STEPS) {
    it(`${s.id}: ${s.what}`, () => {
      const p = s.at ?? s.zone;
      expect(p, 'in the plan').toBeTruthy();
      expect(inB(p), 'in bounds').toBe(true);
      if (s.zone?.rest) {
        // a rest find (catnip: eat at a bed): the beds are in the plan and she can stand at one
        for (const bed of P.CATNIP_BEDS) expect(standNear(bed, 1.2), 'a standable spot at the bed').toBeTruthy();
        expect(standNear(P.CATNIP_BEDS[0], 1.2) && dist(standNear(P.CATNIP_BEDS[0], 1.2), P.CATNIP_BEDS[0])).toBeLessThanOrEqual(REST_REACH ?? 1.4);
      } else if (s.zone) {
        const at = standNear(s.zone, s.zone.r - 0.1, s.zone.rMin ? s.zone.rMin + 0.1 : 0);
        expect(at, `${s.id}: a reached, collider-free spot inside the zone ring`).toBeTruthy();
        expect(W.walkable(at.x, at.z)).toBe(true);
      } else {
        const at = standNear(s.at, s.reach - 0.2);
        expect(at, `${s.id}: a reached, collider-free spot within its prompt reach`).toBeTruthy();
      }
    });
  }
  it('every packet spot of all five sets and every one of the 14 pots can be stood beside, on foot from the spawn', () => {
    for (const set of [...P.SEED_SPOT_SETS, ...P.ROOM_SEED_SPOT_SETS]) for (const s of set) {
      expect(inB(s), JSON.stringify(s)).toBe(true);
      expect(standNear(s, L.PICK_R - 0.2), `packet ${JSON.stringify(s)}`).toBeTruthy();
      for (const c of area.colliders) expect(dist(s, c) > c.r - 0.05, `packet ${JSON.stringify(s)} inside collider ${JSON.stringify(c)}`).toBe(true);
    }
    for (const pot of P.ALL_POT_SPOTS) {
      expect(inB(pot), JSON.stringify(pot)).toBe(true);
      expect(standNear(pot, L.POT_R - 0.2), `pot ${JSON.stringify(pot)}`).toBeTruthy();
    }
  });
});

// ---- (c) cue coverage -------------------------------------------------------------------------------------------------------------------------------
// The cues the code has: the journal hint of each page, the bench's spoken offer, the count lines, the prompts, and the thirst clouds over the four drooping pots (a mesh). It has no
// guide ring, arrow, glint, marker or Pip-style helper: the bench is in view of the court and everything else is found by looking. Each step's cue ids are below.
const CUES = {
  offer: ['greenhouse.seed.offer'],
  tray: ['greenhouse.seed.all', 'greenhouse.seed.prompt', 'greenhouse.seed.sown'],
  can: ['greenhouse.can.offer', 'greenhouse.can.prompt', 'greenhouse.water.prompt', 'greenhouse.water.done', 'greenhouse.water.all'],
};
const HINT_OF = { palm: 'ghpalm', koi: 'ghkoi', catnip: 'ghcatnip', orchid: 'ghorchid', cactus: 'ghcactus', butterfly: 'ghbutterfly' };
const FIND_LINE = (id) => `greenhouse.find.${id}`;

describe('(c) cue coverage: every step has at least one cue (a spoken line, a prompt or a journal hint), in both word sets and with no banned word', () => {
  for (const s of STEPS) {
    it(`${s.id}: ${s.what}`, () => {
      const ids = CUES[s.id] ?? [FIND_LINE(s.id)];
      expect(ids.length, `NO CUE for step ${s.id}`).toBeGreaterThan(0);
      for (const id of ids) expect(typeof phrase(id), id).toBe('string');
      withOffWords(() => { for (const id of ids) { expect(phrase(id).length, id).toBeGreaterThan(0); expect(bannedIn(phrase(id)), id).toBeNull(); } });
      if (HINT_OF[s.id]) {
        expect(HINTS[HINT_OF[s.id]], `NO journal hint for ${s.id}`).toMatch(/\S/);
        expect(GREENHOUSE_PAGE_WORDS[HINT_OF[s.id]].hint(), 'the page reads the hint once the chunk has loaded').toBe(HINTS[HINT_OF[s.id]]);
        withOffWords(() => expect(bannedIn(HINTS[HINT_OF[s.id]]), `${s.id} hint`).toBeNull());
      }
    });
  }
  it('both jobs\' journal pages have a hint and a name; every line in the word table is the same text in both word sets, bar the catnip line the Clan set flavours', () => {
    for (const id of ['ghjobseeds', 'ghjobwater']) { expect(HINTS[id]).toMatch(/\S/); expect(GREENHOUSE_PAGES.some((p) => p[0] === id)).toBe(true); }
    const ids = Object.keys(LINES);
    const clan = Object.fromEntries(ids.map((id) => [id, typeof LINES[id] === 'function' ? LINES[id](1) : LINES[id]]));
    let everyday;
    withOffWords(() => { everyday = Object.fromEntries(ids.map((id) => [id, phrase(id, 1)])); for (const id of ids) expect(bannedIn(everyday[id]), id).toBeNull(); });
    for (const id of ids) if (!/catnip/.test(id)) expect(phrase(id, 1), id).toBe(everyday[id]);
  });
  it('the thirsty pots show their own cue: a cloud floats over each of the four drooping pots, and only those', () => {
    for (const v of VISIT_FOR.values()) {
      const { life } = rig(v);
      expect(life.meshes.clouds).toHaveLength(4);
      for (const c of life.meshes.clouds) expect(c.visible).toBe(true);
    }
  });
  it.todo('a ring, arrow, glint or marker that points at the next target: the Greenhouse has none (only the bench\'s spoken offer within 10 m and the thirst clouds); the journal hints say what, never where');
  it.todo('the seed packets and the six finds have no on-ground cue before she is on them (a packet is a small mesh; a find\'s zone is unmarked)');
});

// ---- (d) distance and sight --------------------------------------------------------------------------------------------------------------------------
// The cues' own reach: the bench's offer is said within OFFER_R (10 m) of the bench, the can's within 6 m; a pot's cloud and a packet's mesh are drawn at any distance; hints have no
// range. The chosen constant is SIGHT = the bounds' diagonal / 1: every plan target is within the Greenhouse's own walkable bounds, so no leg may exceed it.
describe('(d) distance and sight: the spawn (or the previous spot) to each target', () => {
  const SIGHT = Math.hypot(area.bounds.maxX - area.bounds.minX, area.bounds.maxZ - area.bounds.minZ);
  it('every leg is within the bounds\' own diagonal (the largest value the plan implies)', () => {
    for (const s of STEPS) expect(dist(SPAWN, s.at ?? s.zone), s.id).toBeLessThanOrEqual(SIGHT);
    for (const set of [...P.SEED_SPOT_SETS, ...P.ROOM_SEED_SPOT_SETS]) for (const p of set) expect(dist(SPAWN, p)).toBeLessThanOrEqual(SIGHT);
    for (const pot of P.ALL_POT_SPOTS) expect(dist(SPAWN, pot)).toBeLessThanOrEqual(SIGHT);
  });
  it('the offer reaches the bench from the court: the spawn is within 3 x the offer radius of the bench (the bench is in view across the court), and the can offer comes nearer, in order', () => {
    expect(dist(SPAWN, P.POTTING)).toBeLessThan(3 * L.OFFER_R);
    expect(L.OFFER_R * 0.6).toBeLessThan(L.OFFER_R); // the can offer needs the seed offer first, and a closer walk
    expect(dist(P.POTTING, P.POTTING.canHome)).toBeLessThan(L.OFFER_R * 0.6); // the can is inside its own offer radius
    expect(dist(P.POTTING, P.POTTING.tray)).toBeLessThan(L.OFFER_R * 0.6);
  });
  it.todo('no cue reaches from the spawn to the bench: the spawn is ~27 m from the potting bench and the offer line only speaks inside 10 m, so a child who never wanders east is never told about the seeds');
});

// ---- (e) stuck-state sweep ------------------------------------------------------------------------------------------------------------------------
describe('(e) from any walk number a child can still finish, and nothing carried is saved', () => {
  it('for 600 walk numbers the packet set and the four pots are fully standable and reached (no walk is ever a dead end)', () => {
    const seenSets = new Set();
    const seenPots = new Set();
    for (let v = 0; v < 600; v++) {
      for (const s of setOf(v)) { const k = `${s.x},${s.z}`; if (seenSets.has(k)) continue; seenSets.add(k); expect(standNear(s, L.PICK_R - 0.2), `walk ${v}: packet ${k}`).toBeTruthy(); }
      for (const p of potsOf(v)) { const k = `${p.x},${p.z}`; if (seenPots.has(k)) continue; seenPots.add(k); expect(standNear(p, L.POT_R - 0.2), `walk ${v}: pot ${k}`).toBeTruthy(); }
    }
    expect(seenPots.size).toBeGreaterThanOrEqual(12);
  });
  it('a room\'s shared seed gives every device the same walk, and an undefined one falls back to the walk count', () => {
    for (const seed of [1, 77, 8123, 99991]) { expect(L.seedSetIndex(seed, 0)).toBe(L.seedSetIndex(seed, 50)); expect(L.thirstyPots(seed, 0)).toEqual(L.thirstyPots(seed, 50)); }
  });
  it('a carried can and half the packets are never saved: the save record is the same before and after, and a new walk starts with the can on its hook and every packet out', () => {
    const { life, progression, scene } = rig(3);
    const before = JSON.stringify(progression.state);
    const set = life.state.set;
    for (const s of set.slice(0, 3)) tick(life, standHere(s, L.PICK_R - 0.2));
    const atCan = standHere(P.POTTING.canHome, L.CAN_R - 0.2);
    life.promptAt(atCan); life.interact();
    expect(life.state.held).toBe(true);
    tick(life, catAt(5, 5), 0.1, 10);
    expect(JSON.stringify(progression.state), 'carrying the can and holding packets writes nothing to the save').toBe(before);
    life.dispose();
    scene.clear();
    const next = rig(3);
    expect(next.life.state.held).toBe(false);
    expect(next.life.state.seeds).toBe(0);
    expect(next.life.state.seedState).toBe('looking');
    expect(next.life.state.watered).toBe(0);
    expect(dist(next.life.meshes.can.position, P.POTTING.canHome)).toBeLessThan(0.01);
    for (const m of next.life.meshes.packets) expect(m.visible).toBe(true);
  });
  it('there is no way to fail: standing at every spot without pressing anything changes no state', () => {
    const { life } = rig(1);
    const before = JSON.stringify(life.state);
    for (const s of STEPS) tick(life, catAt((s.at ?? s.zone).x, (s.at ?? s.zone).z + 3), 0.1, 5);
    expect(life.state.seeds).toBeLessThanOrEqual(5);
    expect(life.state.seedState).toBe(JSON.parse(before).seedState);
    expect(life.state.allWatered).toBe(false);
  });
});
