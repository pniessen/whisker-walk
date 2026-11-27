// The Jungle lodge, milestone J7 (Replay): Mossy's errand of the day. The plan is a pure function of the room seed (identical for two co-walkers, never saved), once-a-walk pay, no failure,
// the leaf album's bits (OR on merge), every errand spot reachable on foot and clear of the finds, the mice and the story's places, carried things never saved, an errand done by anyone in
// the room credited through a `jl-job` event, the two journal pages (jw6, jw7; jw3 and jw4 stay free), both word sets. Modelled on test/treehousejob.test.js.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { stubCanvasDocument } from './helpers/canvas.js';
import { memoryStorage } from './helpers/storage.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { floodFrom } from './helpers/flood.js';

stubCanvasDocument();

const { createProgression, CATALOG, sanitizeSave } = await import('../src/progression.js');
const { mergeSaves, useSaveTools } = await import('../src/catmerge.js');
const { mergeColony } = await import('../src/colony.js');
const { mergeUsage } = await import('../src/usage.js');
const { sanitizeMarks, MARK_AREAS } = await import('../src/marks.js');
const { CUSTOM_IDS, CUSTOM_BASE, CUSTOM_MAX } = await import('../src/customcats.js');
const { OUTFIT_IDS, sameWear } = await import('../src/outfits.js');
const { AWARDS } = await import('../src/discoveries.js');
const { phrase } = await import('../src/clanphrases.js');
const { loadJungleStages, ST } = await import('../src/world/junglestages.js');
await loadJungleStages();
const { build } = await import('../src/world/jungle.js');
const E = await import('../src/world/junglejob.js');
const P = await import('../src/world/jungleplan.js');
const W = await import('../src/world/junglewingplan.js');
const Q = await import('../src/world/junglefindsplan.js');
const S = await import('../src/world/junglestory.js');
const { JUNGLE_JOB_LINES: LINES, HINTS } = await import('../src/world/junglejobwords.js');
const { createJungleErrandLive } = await import('../src/world/junglejoblive.js');
const { JUNGLE_HINTS, JUNGLE_JOB_PAGES } = await import('../src/junglepages.js');
const { renderJournalHtml } = await import('../src/journal.js');
const { setJungle } = await import('../src/jungleflag.js');
const { isWalkableAt } = await import('../src/player.js');

useSaveTools({ CATALOG, sanitizeSave, mergeColony, mergeUsage, sanitizeMarks, MARK_AREAS, CUSTOM_IDS, CUSTOM_BASE, CUSTOM_MAX, OUTFIT_IDS, sameWear });
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const B = P.JUNGLE_BOUNDS;

describe('the plan', () => {
  it('is deterministic from the seed, identical for two co-walkers, and covers all six errands', () => {
    for (const seed of [1, 77, 123456, 987654321]) expect(E.planJungleErrand(seed, 3)).toEqual(E.planJungleErrand(seed, 99));
    const kinds = new Set();
    for (let s = 1; s < 400; s++) { const p = E.planJungleErrand(s * 7919, 0); kinds.add(p.kind); expect(p.spot).toBeLessThan(6); }
    expect([...kinds].sort()).toEqual([...E.ERRAND_KINDS].sort());
    const solo = new Set();
    for (let v = 0; v < 40; v++) { const a = E.planJungleErrand(undefined, v); expect(a).toEqual(E.planJungleErrand(undefined, v)); solo.add(a.kind); }
    expect(solo.size).toBeGreaterThan(2);
    expect(E.planJungleErrand(NaN, NaN).kind).toBeTruthy();
    const spots = new Set();
    for (let s = 1; s < 400; s++) spots.add(E.planJungleErrand(s * 7919, 0).spot);
    expect(spots.size).toBe(6);
  });
  it('every spot is in bounds, clear of the colliders, the finds, the mice, the story and the lodge\'s table, and reachable on foot', () => {
    const area = build(new THREE.Scene());
    const flood = floodFrom(area, area.spawn, (x, z) => isWalkableAt(area, x, z));
    const avoid = [
      ...Object.values(Q.JUNGLE_FIND_ZONES).flat(), ...Q.JUNGLE_GOLD, ...Q.JUNGLE_COLLECTIBLES, P.JUNGLE_SPAWN, P.RING, S.MOSSY.start, S.TABLE, W.BANANA_PLANT, W.BRANCH, W.SLOTH, W.ORCHID,
    ];
    for (const s of [...E.FROG_SPOTS, ...E.SLIPPER_SPOTS, ...E.VINES, ...Object.values(E.CARRIES).map((c) => c.home)]) {
      expect(s.x > B.minX + 2 && s.x < B.maxX - 2 && s.z > B.minZ + 2 && s.z < B.maxZ - 2, JSON.stringify(s)).toBe(true);
      expect(flood.reachesWithin(s.x, s.z, 1), JSON.stringify(s)).toBe(true);
      for (const c of area.colliders) expect(Math.hypot(s.x - c.x, s.z - c.z) - c.r, JSON.stringify(s)).toBeGreaterThan(1.0);
      for (const a of avoid) expect(Math.hypot(s.x - a.x, s.z - a.z), `${JSON.stringify(s)} vs ${JSON.stringify(a)}`).toBeGreaterThan(2.2);
    }
    for (const c of Object.values(E.CARRIES)) {
      expect(flood.reachesWithin(c.dest.x, c.dest.z, 1.2), JSON.stringify(c.dest)).toBe(true);
      expect(c.dest.x > B.minX && c.dest.x < B.maxX && c.dest.z > B.minZ && c.dest.z < B.maxZ).toBe(true);
    }
    for (const c of Object.values(E.CARRIES)) expect(Math.hypot(c.home.x - c.dest.x, c.home.z - c.dest.z)).toBeGreaterThan(5); // a real errand, not next door
    expect(Math.abs(P.jungleY(E.CARRIES.rain.dest.x, E.CARRIES.rain.dest.z) - E.CARRIES.rain.dest.y)).toBeLessThan(0.1); // the veranda's deck height
    expect(Math.hypot(E.CARRIES.umbrella.dest.x - W.SLOTH.x, E.CARRIES.umbrella.dest.z - W.SLOTH.z)).toBeLessThan(3.5); // the sloth
    expect(P.riverDist(E.CARRIES.boat.dest.x, E.CARRIES.boat.dest.z)).toBeLessThan(2); // the river
  });
  it('the three vines are shaken in any order, each once, never a failure', () => {
    const V = E.VINES;
    expect(E.vineStep(0, { x: 99, z: 99 })).toBe(0);
    let m = E.vineStep(0, V[2]); expect(m).toBe(4);
    expect(E.vineStep(m, V[2])).toBe(4); // already shaken
    m = E.vineStep(m, V[0]); m = E.vineStep(m, V[1]);
    expect(m).toBe(7); expect(E.vineCount(m)).toBe(3);
    expect(E.vineStep(NaN, null)).toBe(0); expect(E.vineStep(99, { x: 99, z: 99 })).toBe(3); // a junk mask is masked to three bits
  });
});

describe('the album', () => {
  it('twelve pressings; the lowest unset bit is paid; a full album pays no more; junk is repaired', () => {
    expect(E.ALBUM).toHaveLength(12);
    let bits = 0;
    for (let i = 0; i < 12; i++) { expect(E.nextPressing(bits)).toBe(i); bits = E.withPressing(bits, i); }
    expect(bits).toBe(4095);
    expect(E.nextPressing(bits)).toBe(-1);
    expect(E.albumCount(bits)).toBe(12);
    expect(E.withPressing(5, 99)).toBe(5);
    expect(E.nextPressing(-3)).toBe(0); expect(E.albumCount(NaN)).toBe(0); expect(E.albumCount(1e12)).toBeLessThanOrEqual(12);
  });
  it('two devices OR their pressings and cannot lift the album past 12 bits', () => {
    const f = (jungle) => sanitizeSave({ version: 4, jungle });
    expect(mergeSaves({ local: f({ step: 7, fruit: 7, album: 5 }), cloud: f({ step: 7, fruit: 7, album: 10 }) }).save.jungle.album).toBe(15);
    expect(mergeSaves({ local: f({ step: 7, album: 3 }), cloud: { version: 4, jungle: { step: 7, album: 1e12 } } }).save.jungle.album).toBeLessThanOrEqual(4095);
  });
});

function rig({ step = 7, album = 0, seed, visits = 0, kind, paid = 0 } = {}) {
  const progression = createProgression(memoryStorage());
  progression.state.jungle = { step, fruit: 7, album };
  progression.addPoints(0);
  const scene = new THREE.Scene();
  const awards = [];
  const sent = [];
  const log = { awardOnce: (type, key, text) => { if (log.seen.has(key)) return 0; log.seen.add(key); awards.push({ type, key, text }); return AWARDS[type]; }, count: (k) => (log.seen.has(k) ? 1 : 0), mark() {}, seen: new Set(paid ? ['jungle-errand'] : []) };
  let s = seed;
  if (kind) { for (s = 1; E.planJungleErrand(s * 31, 0).kind !== kind; s++); s *= 31; }
  const live = createJungleErrandLive({ scene, progression, log, roomSeed: s, visits, send: (ev) => sent.push(ev) });
  const session = { cat: { rotation: { y: 0 } } };
  const tick = (cat, n = 1, dt = 0.05) => { for (let i = 0; i < n; i++) live.update(dt, i * dt, cat, null, session); };
  const at = (x, z, y = 0) => ({ x, z, y });
  return { progression, scene, awards, sent, log, live, tick, at };
}
const press = (r, cat) => { r.tick(cat, 1); const line = r.live.promptAt(cat); return { line, k: line ? r.live.interact() : null }; };
const atP = (r, p, dx = 0) => r.at(p.x + dx, p.z, p.y);

describe('on a walk: each errand, once, with no way to fail', () => {
  it('is offered only from the walk after the story', () => {
    const r = rig({ step: 6, kind: 'frog' });
    const g = E.FROG_SPOTS[r.live.plan.spot];
    r.tick(r.at(0, 25), 100);
    expect(r.live.state.eligible).toBe(false);
    expect(r.live.promptAt(r.at(g.x, g.z))).toBeNull();
    expect(r.live.credit(E.JOB_WIRE)).toBeNull();
    expect(r.awards).toEqual([]);
    expect(r.live.props).toEqual([]);
  });
  for (const [kind, table] of [['frog', E.FROG_SPOTS], ['slipper', E.SLIPPER_SPOTS]]) {
    it(`${kind}: the seed's place, Interact beside it`, () => {
      const r = rig({ kind });
      const g = table[r.live.plan.spot];
      expect(press(r, r.at(g.x + 8, g.z)).line).toBeNull();
      expect(r.live.props).toHaveLength(1);
      expect(press(r, r.at(g.x + 1, g.z)).k).toBe('seek');
      expect(r.awards).toHaveLength(1);
      expect(r.awards[0]).toMatchObject({ type: 'junglejob', key: 'jungle-errand' });
      expect(r.progression.state.jungle.album).toBe(1);
      expect(r.progression.state.jungle.step).toBe(7); // nothing else in the story record moved
      expect(r.progression.state.jungle.fruit).toBe(7);
      expect(r.sent).toEqual([{ kind: 'jl-job' }]);
    });
  }
  it('vines: three shakes in any order, then paid; the third pays, a vine out of reach does nothing', () => {
    const r = rig({ kind: 'vines' });
    expect(r.live.props).toHaveLength(3);
    expect(press(r, r.at(0, 25)).line).toBeNull();
    for (const i of [2, 0]) { expect(press(r, atP(r, E.VINES[i], 0.5)).k).toBe('vine'); expect(r.awards).toEqual([]); }
    expect(press(r, atP(r, E.VINES[2], 0.5)).line).toBeNull(); // shaken already
    expect(press(r, atP(r, E.VINES[1], 0.5)).k).toBe('vine');
    expect(r.awards).toHaveLength(1);
    expect(r.live.state.shaken).toBe(7);
    expect(r.progression.state.jungle.album).toBe(1);
  });
  for (const kind of ['umbrella', 'boat', 'rain']) {
    it(`${kind}: picked up where it lies, given where it goes, and a carried thing is not kept past the walk`, () => {
      const C = E.CARRIES[kind];
      const r = rig({ kind });
      expect(press(r, atP(r, C.dest)).line).toBeNull(); // nothing to give yet
      expect(press(r, atP(r, C.home, 0.5)).k).toBe('pick');
      expect(r.live.state.item).toBe('carried');
      expect(JSON.stringify(r.progression.state)).not.toMatch(/umbrella|carried|boat|cup/);
      if (C.dest.minY !== undefined) expect(press(r, r.at(C.dest.x, C.dest.z, 0)).line).toBeNull(); // the ground under the deck is not the deck
      expect(press(r, atP(r, C.dest, 0.5)).k).toBe('give');
      expect(r.awards).toHaveLength(1);
      expect(r.live.state.item).toBe('given');
      const c = rig({ kind });
      press(c, atP(c, C.home));
      c.live.dispose(); // the walk ends carrying it
      expect(c.progression.state.jungle.album).toBe(0);
      expect(rig({ kind }).live.state.item).toBe('home');
    });
  }
  it('pays 25 paws once a walk, and a resumed walk that already paid offers nothing and pays nothing', () => {
    expect(AWARDS.junglejob).toBe(25);
    const C = E.CARRIES.umbrella;
    const r = rig({ kind: 'umbrella' });
    for (let i = 0; i < 2; i++) { press(r, atP(r, C.home)); press(r, atP(r, C.dest)); }
    expect(r.awards).toHaveLength(1);
    const p = rig({ kind: 'umbrella', paid: 1 });
    expect(p.live.state.done).toBe(true);
    expect(press(p, atP(p, C.home)).line).toBeNull();
    expect(p.awards).toEqual([]);
    expect(p.progression.state.jungle.album).toBe(0);
  });
  it('the album gains the lowest free pressing each errand, and a full album still pays the paws', () => {
    const C = E.CARRIES.umbrella;
    const r = rig({ kind: 'umbrella', album: 0b101 });
    press(r, atP(r, C.home)); press(r, atP(r, C.dest));
    expect(r.progression.state.jungle.album).toBe(0b111);
    const f = rig({ kind: 'umbrella', album: 4095 });
    press(f, atP(f, C.home)); press(f, atP(f, C.dest));
    expect(f.awards).toHaveLength(1);
    expect(f.progression.state.jungle.album).toBe(4095);
  });
  it('a partner\'s errand is credited to ours once (a jl-job event), pays our own save and is not sent back', () => {
    const r = rig({ kind: 'vines' });
    expect(r.live.credit({ kind: 'jl-supper', elapsed: 0 })).toBeNull();
    expect(r.live.credit(E.JOB_WIRE)).toBe('job');
    expect(r.awards).toHaveLength(1);
    expect(r.progression.state.jungle.album).toBe(1);
    expect(r.sent).toEqual([]);
    expect(r.live.credit(E.JOB_WIRE)).toBeNull();
    expect(r.awards).toHaveLength(1);
  });
  it('the life hands the room\'s events to the errand first, stage b fills the slot and stage c stays empty', () => {
    expect(typeof ST.b.errand).toBe('function');
    expect(read('src/world/jungle.js')).toMatch(/errand\?\.credit\(ev\) \?\? wing\?\.credit\(ev\) \?\? mossy\.credit\(ev\)/);
    expect(read('src/world/junglestagec.js')).not.toMatch(/job/); // nothing went into the empty stage
    expect(read('src/world/junglestageb.js')).toMatch(/junglejoblive/);
  });
  it('the same room seed gives two partners the same errand and the same spot; the errand itself is never saved', () => {
    const a = rig({ seed: 424242 }); const b = rig({ seed: 424242 });
    expect(a.live.plan).toEqual(b.live.plan);
    expect(Object.keys(a.progression.state.jungle).sort()).toEqual(['album', 'fruit', 'step']);
    const src = read('src/world/junglejoblive.js').replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/Math\.random|Date\.now|performance\.now|PointLight/);
    expect(read('src/world/junglejob.js').replace(/\/\/.*$/gm, '')).not.toMatch(/Math\.random|Date\.now|performance\.now/);
  });
  it('disposes everything it made', () => {
    for (const kind of E.ERRAND_KINDS) {
      const r = rig({ kind });
      expect(r.scene.children.length).toBeGreaterThan(0);
      r.live.dispose();
      expect(r.scene.children.length).toBe(0);
    }
  });
  it('reduced motion holds every prop still', () => {
    const progression = createProgression(memoryStorage());
    progression.state.jungle = { step: 7, fruit: 7, album: 0 };
    const scene = new THREE.Scene();
    let s = 1; for (; E.planJungleErrand(s * 31, 0).kind !== 'frog'; s++);
    const live = createJungleErrandLive({ scene, progression, reducedMotion: true, roomSeed: s * 31, visits: 0 });
    const y = () => scene.children[0].position.y;
    live.update(0.1, 0, { x: 0, z: 0, y: 0 }, null, null); const y0 = y();
    live.update(3, 3, { x: 0, z: 0, y: 0 }, null, null);
    expect(y()).toBe(y0);
  });
});

describe('the words and the journal, in both sets', () => {
  it('every line exists, is short and kind, and reads without a series word in the everyday set', () => {
    const ids = Object.keys(LINES);
    expect(ids.length).toBeGreaterThanOrEqual(18);
    const scary = /\b(dark\w*|lost forever|trapped|stuck|collapse\w*|scary|scared|afraid|danger\w*|drown\w*|die|dies|dead|hurt|fail\w*|wrong|kit)\b/i;
    for (const id of ids) {
      const s = phrase(id);
      expect(s, id).toMatch(/\S/); expect(s.length, id).toBeLessThanOrEqual(100); expect(s, id).not.toMatch(scary); expect(s, id).not.toMatch(/\bClan\b/); expect(s, id).not.toMatch(/\blost\b/i);
      withOffWords(() => { expect(bannedIn(phrase(id)), id).toBeNull(); expect(phrase(id).length).toBeLessThanOrEqual(100); expect(phrase(id), id).not.toMatch(scary); });
    }
    for (const h of Object.values(HINTS)) { expect(h).not.toMatch(scary); withOffWords(() => expect(bannedIn(h)).toBeNull()); }
  });
  it('every phrase(...) call in the errand file has a literal id in the table, and every line of the table is used', () => {
    const src = read('src/world/junglejoblive.js').replace(/\/\/.*$/gm, '');
    const used = new Set();
    for (const m of src.matchAll(/\bphrase\(([^)]*)\)/g)) {
      expect(m[1], `phrase(${m[1]})`).toMatch(/^'[a-z0-9.]+'$/);
      expect(Object.keys(LINES)).toContain(m[1].slice(1, -1));
      used.add(m[1].slice(1, -1));
    }
    expect([...used].sort()).toEqual(Object.keys(LINES).sort());
    for (const k of E.ERRAND_KINDS) expect(Object.keys(LINES)).toContain(`jungle.job.${k}`);
  });
  it('the journal has the errand and album pages live behind the flag, with hints, jw3 and jw4 stay free, and they count', () => {
    expect(JUNGLE_JOB_PAGES.map((p) => p[0])).toEqual(['jw6', 'jw7']);
    for (const [id] of JUNGLE_JOB_PAGES) { expect(HINTS[id]).toMatch(/\S/); expect(JUNGLE_HINTS[id]).toBe(HINTS[id]); }
    try {
      setJungle(false); expect(renderJournalHtml({ jw6: 2, jw7: 1 }, 0, 18)).not.toContain('The Leaf Album');
      setJungle(true);
      const html = renderJournalHtml({ jw6: 2, jw7: 1 }, 0, 18);
      expect(html).toContain('The Daily Errand');
      expect(html).toContain('The Leaf Album');
      expect(html).not.toMatch(/Jungle page/); // placeholders stay hidden (jw3, jw4 included)
    } finally { setJungle(null); }
    const r = rig({ kind: 'vines' });
    r.live.credit(E.JOB_WIRE);
    expect(r.progression.state.journal.jw6).toBe(1);
    expect(r.progression.state.journal.jw7).toBe(1);
  });
});
