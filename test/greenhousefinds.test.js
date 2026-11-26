import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';
import { memoryStorage } from './helpers/storage.js';

stubCanvasDocument();

const { createProgression, JOURNAL_TYPES } = await import('../src/progression.js');
const { createDiscoveryLog } = await import('../src/discoveries.js');
const { bus } = await import('../src/events.js');
const { GREENHOUSE_FIND_IDS, GREENHOUSE_JOURNAL_TYPES } = await import('../src/greenhousepages.js');
const { build } = await import('../src/world/greenhouse.js');
const F = await import('../src/world/greenhousefinds.js');
const P = await import('../src/world/greenhouseplan.js');
const { phrase } = await import('../src/clanphrases.js');
const { REST_REACH } = await import('../src/rests.js');
const { withOffWords } = await import('./helpers/offwords.js');

// The Greenhouse, milestone G3: the three finds stage A can make (palm, koi, catnip). Where each is found, what each pays and says, and
// what the life does when she is there. The other three ids are reserved (their rooms come in G6) and find nothing yet.

const Z = P.GREENHOUSE_FIND_ZONES;
const BLANK = Object.freeze({ x: 0, y: 0, z: 30, still: 0, rest: null });
const spot = (o) => ({ ...BLANK, ...o });
const ring = (id) => Z[id][0];
const on = (id) => ({ x: ring(id).x + (ring(id).rMin ?? 0) + 0.5, z: ring(id).z });

describe('each find is found by its rule and not by anything near it', () => {
  it('the palm: standing still 2 s in the ring round the fern island, not on the island, not beyond the palms, not moving', () => {
    const at = on('palm');
    expect(F.findAt(spot({ ...at, still: 2 }))).toBe('palm');
    expect(F.findAt(spot({ ...at, still: 1.9 }))).toBe(null);
    expect(F.findAt(spot({ x: P.ISLAND.x + 0.6, z: P.ISLAND.z, still: 5 }))).toBe(null);
    expect(F.findAt(spot({ x: P.ISLAND.x + 4.5, z: P.ISLAND.z, still: 5 }))).toBe(null);
    expect(F.findAt(spot({ ...at, y: 1.5, still: 5 }))).toBe(null);
  });
  it('the koi: still 3 s at the pond\'s north rim; not by the pond\'s other side', () => {
    const z = ring('koi');
    expect(F.findAt(spot({ x: z.x, z: z.z, still: 3 }))).toBe('koi');
    expect(F.findAt(spot({ x: z.x, z: z.z, still: 2.9 }))).toBe(null);
    expect(F.findAt(spot({ x: P.POND.x, z: P.POND.z + P.POND.r + 1, still: 9 }))).toBe(null);
  });
  it('the catnip: beginning to nibble (an eat rest) at either bed, and not a nap or a drink there, nor a nibble elsewhere', () => {
    for (const bed of P.CATNIP_BEDS) {
      expect(F.findAt(spot({ x: bed.x + 0.5, z: bed.z, rest: { kind: 'eat', t: 0 } }))).toBe('catnip');
      expect(F.findAt(spot({ x: bed.x, z: bed.z, rest: { kind: 'nap', t: 9 } }))).toBe(null);
      expect(F.findAt(spot({ x: bed.x, z: bed.z, still: 9 }))).toBe(null);
    }
    expect(F.findAt(spot({ x: 0, z: 22, rest: { kind: 'eat', t: 0 } }))).toBe(null);
    expect(Z.catnip.every((c) => c.r <= REST_REACH)).toBe(true);
  });
  it('one spot never finds two: no zone of one find overlaps another\'s', () => {
    const ids = GREENHOUSE_FIND_IDS;
    for (const a of ids) for (const b of ids) {
      if (a >= b) continue;
      for (const za of Z[a]) for (const zb of Z[b]) {
        const d = Math.hypot(za.x - zb.x, za.z - zb.z);
        expect(d >= za.r + zb.r || (za.rMin && d + zb.r <= za.rMin), `${a}/${b}`).toBe(true);
      }
    }
  });
  it('the orchid: still 2 s beside the shy blue orchid on the first bench; not on the other bench, not moving', () => {
    const z = ring('orchid');
    expect(F.findAt(spot({ x: z.x, z: z.z + 1.0, still: 2 }))).toBe('orchid');
    expect(F.findAt(spot({ x: z.x, z: z.z + 1.0, still: 1.9 }))).toBe(null);
    expect(F.findAt(spot({ x: -20.5, z: -12.6, still: 9 }))).toBe(null);
    expect(F.findAt(spot({ x: z.x, z: z.z + 1.0, y: 1.4, still: 9 }))).toBe(null);
  });
  it('the cactus: still 2 s beside the flowering cactus; not beside the others', () => {
    const z = ring('cactus');
    expect(F.findAt(spot({ x: z.x, z: z.z + 1.2, still: 2 }))).toBe('cactus');
    expect(F.findAt(spot({ x: z.x, z: z.z + 1.2, still: 1.9 }))).toBe(null);
    expect(F.findAt(spot({ x: 20.8, z: -10.9, still: 9 }))).toBe(null);
  });
  it('the butterfly: still 3 s in the Butterfly Room\'s middle; not at its door', () => {
    const z = ring('butterfly');
    expect(F.findAt(spot({ x: z.x, z: z.z, still: 3 }))).toBe('butterfly');
    expect(F.findAt(spot({ x: z.x, z: z.z, still: 2.9 }))).toBe(null);
    expect(F.findAt(spot({ x: 0, z: -21.5, still: 9 }))).toBe(null);
  });
  it('the three room finds pay and count as the others do, and the ids are reserved in the journal', () => {
    for (const id of ['orchid', 'cactus', 'butterfly']) {
      const progression = createProgression(memoryStorage());
      const log = createDiscoveryLog(progression);
      log.startWalk();
      expect(F.noteGreenhouseFind(id, { log, progression })).toEqual({ fresh: true, first: true, points: 12 });
      expect(progression.state.journal[`gh${id}`]).toBe(1);
      expect(F.noteGreenhouseFind(id, { log, progression }).fresh).toBe(false);
      expect(withOffWords(() => F.GREENHOUSE_FIND_WORDS[id]())).toBe(F.GREENHOUSE_FIND_WORDS[id]());
    }
    expect(GREENHOUSE_FIND_IDS).toEqual(['palm', 'koi', 'catnip', 'orchid', 'cactus', 'butterfly']);
    expect(JOURNAL_TYPES.filter((t) => GREENHOUSE_JOURNAL_TYPES.includes(t))).toEqual(GREENHOUSE_JOURNAL_TYPES);
  });
  it('every zone is on open ground and the catnip beds are the rests', () => {
    const rests = P.GREENHOUSE_RESTS.filter((r) => r.kind === 'eat');
    expect(Z.catnip.map((z) => [z.x, z.z])).toEqual(rests.map((r) => [r.x, r.z]));
  });
});

describe('what a find pays and says', () => {
  const rig = () => {
    const progression = createProgression(memoryStorage());
    const log = createDiscoveryLog(progression);
    log.startWalk();
    return { progression, log };
  };
  it('the first time ever pays 12 and says its line; later walks count once and say nothing', () => {
    const { progression, log } = rig();
    const spy = vi.spyOn(bus, 'emit');
    expect(F.noteGreenhouseFind('palm', { log, progression })).toEqual({ fresh: true, first: true, points: 12 });
    const ev = spy.mock.calls.filter((c) => c[0] === 'discovery');
    expect(ev).toHaveLength(1);
    expect(ev[0][1]).toMatchObject({ type: 'greenhousefind', label: phrase('greenhouse.find.palm'), points: 12, key: 'greenhouse-find-palm' });
    expect(F.noteGreenhouseFind('palm', { log, progression }).fresh).toBe(false);
    expect(progression.state.journal.ghpalm).toBe(1);
    expect(progression.state.points).toBe(12);
    // a later walk at the same find pays nothing more and counts on its page
    log.startWalk();
    spy.mockClear();
    expect(F.noteGreenhouseFind('palm', { log, progression })).toEqual({ fresh: true, first: false, points: 0 });
    expect(progression.state.journal.ghpalm).toBe(2);
    expect(progression.state.points).toBe(12);
    expect(spy.mock.calls.filter((c) => c[0] === 'discovery')).toHaveLength(0);
    expect(F.noteGreenhouseFind('nope', { log, progression }).fresh).toBe(false);
    expect(F.greenhouseFindKey('koi')).toBe('greenhouse-find-koi');
    spy.mockRestore();
  });
  it('a resumed walk pays and counts nothing twice', () => {
    const { progression, log } = rig();
    F.noteGreenhouseFind('koi', { log, progression });
    const entries = log.entries();
    const log2 = createDiscoveryLog(progression);
    log2.startWalk();
    log2.restore(entries);
    expect(F.noteGreenhouseFind('koi', { log: log2, progression }).fresh).toBe(false);
    expect(progression.state.journal.ghkoi).toBe(1);
    expect(progression.state.points).toBe(12);
  });
  it('two players each find it on their own save', () => {
    const a = rig(); const b = rig();
    expect(F.noteGreenhouseFind('catnip', a).points).toBe(12);
    expect(F.noteGreenhouseFind('catnip', b).points).toBe(12);
    expect(a.progression.state.journal.ghcatnip).toBe(1);
    expect(b.progression.state.journal.ghcatnip).toBe(1);
  });
  it('the lines read the same in both word sets except the catnip\'s, which names its plant', () => {
    for (const id of ['palm', 'koi', 'orchid', 'cactus', 'butterfly']) expect(withOffWords(() => F.GREENHOUSE_FIND_WORDS[id]())).toBe(F.GREENHOUSE_FIND_WORDS[id]());
    expect(F.GREENHOUSE_FIND_WORDS.catnip()).toMatch(/^Catmint|^Catnip/);
    expect(withOffWords(() => F.GREENHOUSE_FIND_WORDS.catnip())).toBe('Catnip! Mmmm, it smells so good. 🌿');
    expect(phrase('greenhouse.catnip.purr')).toMatch(/Purr/);
    expect(withOffWords(() => phrase('greenhouse.catnip.purr'))).toBe('Purrrr… so happy. 🌿');
  });
});

describe('the life notes a find, purrs at the bed, and keeps the rain out under the glass', () => {
  let r;
  afterEach(() => { r?.off(); r = null; });
  const make = (extra = {}) => {
    const scene = new THREE.Scene();
    const placed = build(scene);
    const progression = createProgression(memoryStorage());
    const log = createDiscoveryLog(progression);
    log.startWalk();
    const weather = { calls: [], setSheltered(on) { this.calls.push(on); } };
    const life = placed.life({ scene, log, progression, weather, reducedMotion: false, visits: 0, ...extra });
    const heard = [];
    const off = bus.on('discovery', (e) => heard.push(e));
    const at = { x: 0, y: 0, z: 30 };
    const camera = new THREE.PerspectiveCamera();
    const step = (seconds, cat = null, session = null) => { if (cat) Object.assign(at, cat); for (let i = 0; i < Math.round(seconds * 30); i++) life.update(1 / 30, 0, at, camera, session ?? { cat: { rotation: { y: 0 } } }); };
    return { life, progression, log, weather, heard, step, camera, at, off: () => { off(); life.dispose(); } };
  };
  it('standing still in the palm ring finds it once, pays 12, and not before two seconds', () => {
    r = make();
    const at = on('palm');
    r.step(1.5, at);
    expect(r.progression.state.journal.ghpalm ?? 0).toBe(0);
    r.step(1, at);
    expect(r.progression.state.journal.ghpalm).toBe(1);
    expect(r.progression.state.points).toBe(12);
    r.step(5, at);
    expect(r.progression.state.journal.ghpalm).toBe(1); // once a walk
    expect(r.heard.filter((e) => e.type === 'greenhousefind')).toHaveLength(1);
  });
  it('walking through the ring finds nothing (the stillness starts again whenever she moves)', () => {
    r = make();
    for (let i = 0; i < 60; i++) r.step(1 / 30, { x: -3 + i * 0.1, y: 0, z: P.ISLAND.z + 2.4 });
    expect(r.progression.state.journal.ghpalm ?? 0).toBe(0);
  });
  it('a nibble at a catnip bed finds the catnip and purrs once; at a hall rest it does neither', () => {
    r = make();
    const bed = P.CATNIP_BEDS[1];
    r.step(0.2, { x: bed.x + 0.4, y: 0, z: bed.z });
    r.step(0.2, null, { rest: { kind: 'eat', t: 0 } });
    r.step(1, null, { rest: { kind: 'eat', t: 1 } });
    expect(r.progression.state.journal.ghcatnip).toBe(1);
    expect(r.heard.filter((e) => e.label === phrase('greenhouse.catnip.purr'))).toHaveLength(1);
  });
  it('the shelter flips on a camera inside the Palm House and back off outside, and a dispose puts the rain back', () => {
    r = make();
    r.camera.position.set(0, 4, -9);
    r.step(0.1);
    r.camera.position.set(0, 4, 20);
    r.step(0.1);
    r.camera.position.set(3, 6, -6);
    r.step(0.1);
    expect(r.weather.calls).toEqual([true, false, true]);
    r.life.dispose();
    expect(r.weather.calls).toEqual([true, false, true, false]);
  });
});
