// Snowville, milestone V7 (Replay): Tilly's errand of the day. The plan is a pure function of the room seed (identical for two co-walkers, never saved), once-a-walk pay, no failure,
// the postcard album's bits (OR on merge), every errand spot reachable on foot from the spawn and clear of the finds, the mice and the story's places, carried things never saved, an
// errand done by anyone in the room credited through an `sv-job` event, the two journal pages, both word sets.
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
const { loadSnowvilleStages, ST } = await import('../src/world/snowvillestages.js');
await loadSnowvilleStages();
const { build } = await import('../src/world/snowville.js');
const E = await import('../src/world/snowvillejob.js');
const P = await import('../src/world/snowvilleplan.js');
const W = await import('../src/world/snowvillewingplan.js');
const Q = await import('../src/world/snowvillefindsplan.js');
const { SNOWVILLE_JOB_LINES: LINES, HINTS } = await import('../src/world/snowvillejobwords.js');
const { createSnowErrandLive } = await import('../src/world/snowvillejoblive.js');
const { SNOWVILLE_HINTS, SNOWVILLE_JOB_PAGES } = await import('../src/snowvillepages.js');
const { renderJournalHtml } = await import('../src/journal.js');
const { setSnowville } = await import('../src/snowvilleflag.js');
const { isWalkableAt } = await import('../src/player.js');

useSaveTools({ CATALOG, sanitizeSave, mergeColony, mergeUsage, sanitizeMarks, MARK_AREAS, CUSTOM_IDS, CUSTOM_BASE, CUSTOM_MAX, OUTFIT_IDS, sameWear });
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const B = P.SNOWVILLE_BOUNDS;

describe('the plan', () => {
  it('is deterministic from the seed, identical for two co-walkers, and covers all five errands', () => {
    for (const seed of [1, 77, 123456, 987654321]) expect(E.planSnowErrand(seed, 3)).toEqual(E.planSnowErrand(seed, 99));
    const kinds = new Set();
    for (let s = 1; s < 400; s++) { const p = E.planSnowErrand(s * 7919, 0); kinds.add(p.kind); expect(p.spot).toBeLessThan(6); }
    expect([...kinds].sort()).toEqual([...E.ERRAND_KINDS].sort());
    const solo = new Set();
    for (let v = 0; v < 40; v++) { const a = E.planSnowErrand(undefined, v); expect(a).toEqual(E.planSnowErrand(undefined, v)); solo.add(a.kind); }
    expect(solo.size).toBeGreaterThan(2);
    expect(E.planSnowErrand(NaN, NaN).kind).toBeTruthy();
  });
  it('the constants copy the plan\'s own: the cones, the hill lantern, the snowman', () => {
    expect([...E.CONE_IDS]).toEqual(Q.SNOWVILLE_COLLECTIBLES.filter((c) => c.kind === 'cone').map((c) => c.id));
    expect(E.CONES_NEEDED).toBeLessThanOrEqual(E.CONE_IDS.length);
    expect({ x: E.HILL_LANTERN.x, z: E.HILL_LANTERN.z }).toEqual({ x: W.HILL_LANTERN.x, z: W.HILL_LANTERN.z });
    expect({ x: E.SNOWMAN.x, z: E.SNOWMAN.z }).toEqual({ x: P.SNOWMAN.x, z: P.SNOWMAN.z });
  });
  it('every spot is in bounds, clear of every collider, the finds, the mice and the story\'s places, and reachable on foot from the spawn', () => {
    const area = build(new THREE.Scene());
    const flood = floodFrom(area, area.spawn, (x, z) => isWalkableAt(area, x, z));
    const avoid = [
      ...Object.values(Q.SNOWVILLE_FIND_ZONES).flat(), ...Q.SNOWVILLE_GOLD, ...W.CANDLES_B, ...W.LANTERNS_B, P.SNOWVILLE_SPAWN, P.HEARTH, P.BRAZIER,
    ];
    const own = new Set([E.SNOWMAN, E.CUP, E.ROBIN, E.STRING, E.HILL_LANTERN]); // places of the story's own scenery: only their reach matters
    for (const s of E.ALL_SPOTS) {
      expect(s.x > B.minX + 2 && s.x < B.maxX - 2 && s.z > B.minZ + 2 && s.z < B.maxZ - 2, JSON.stringify(s)).toBe(true);
      expect(flood.reachesWithin(s.x, s.z, own.has(s) ? (s.reach ?? 2) + 1 : 1), JSON.stringify(s)).toBe(true);
      if (own.has(s)) continue;
      for (const c of area.colliders) expect(Math.hypot(s.x - c.x, s.z - c.z) - c.r, JSON.stringify(s)).toBeGreaterThan(1.2);
      for (const a of avoid) expect(Math.hypot(s.x - a.x, s.z - a.z), `${JSON.stringify(s)} vs ${JSON.stringify(a)}`).toBeGreaterThan(2.4);
    }
    // the things carried can be picked up and set down on foot: each pick-up place and its goal is in reach of the flood
    for (const s of [E.CUP, E.STRING]) expect(flood.reachesWithin(s.x, s.z, 1.0)).toBe(true);
    // the glint's line is a straight walk across open snow she can follow
    for (let t = 0; t <= 1; t += 0.05) { const a = E.glintAt(t); for (const c of area.colliders) expect(Math.hypot(a.x - c.x, a.z - c.z)).toBeGreaterThan(c.r + 0.5); }
  });
  it('the glint waits for her and never fails; the rule is monotone', () => {
    let p = 0;
    for (let i = 0; i < 40; i++) p = E.glintStep(p, 99, 0.1);
    expect(p).toBe(0);
    for (let i = 0; i < 2000; i++) { const n = E.glintStep(p, 3, 0.1); expect(n).toBeGreaterThanOrEqual(p); p = n; }
    expect(p).toBe(1);
  });
});

describe('the album', () => {
  it('twelve postcards; the lowest unset bit is paid; a full album pays no more; junk is repaired', () => {
    expect(E.ALBUM).toHaveLength(12);
    let bits = 0;
    for (let i = 0; i < 12; i++) { expect(E.nextPostcard(bits)).toBe(i); bits = E.withPostcard(bits, i); }
    expect(bits).toBe(4095);
    expect(E.nextPostcard(bits)).toBe(-1);
    expect(E.albumCount(bits)).toBe(12);
    expect(E.withPostcard(5, 99)).toBe(5);
    expect(E.nextPostcard(-3)).toBe(0); expect(E.albumCount(NaN)).toBe(0); expect(E.albumCount(1e12)).toBeLessThanOrEqual(12);
  });
  it('two devices OR their postcards and cannot lift the album past 12 bits', () => {
    const f = (snowville) => sanitizeSave({ version: 4, snowville });
    expect(mergeSaves({ local: f({ step: 7, candles: 7, album: 5 }), cloud: f({ step: 7, candles: 7, album: 10 }) }).save.snowville.album).toBe(15);
    expect(mergeSaves({ local: f({ step: 7, album: 3 }), cloud: { version: 4, snowville: { step: 7, album: 1e12 } } }).save.snowville.album).toBeLessThanOrEqual(4095);
  });
});

// ---- the walk -------------------------------------------------------------------------------------------------------------------------
function rig({ step = 7, album = 0, seed, visits = 0, kind, paid = 0 } = {}) {
  const progression = createProgression(memoryStorage());
  progression.state.snowville = { step, candles: 7, album };
  progression.addPoints(0);
  const scene = new THREE.Scene();
  const awards = [];
  const sent = [];
  const log = { awardOnce: (type, key, text) => { if (log.seen.has(key)) return 0; log.seen.add(key); awards.push({ type, key, text }); return AWARDS[type]; }, count: (k) => (log.seen.has(k) ? 1 : 0), mark() {}, seen: new Set(paid ? ['snowville-errand'] : []) };
  const meshes = new Map(Q.SNOWVILLE_COLLECTIBLES.map((c) => [c.id, {}]));
  const session = { cat: { rotation: { y: 0 } }, collectibleMeshes: meshes };
  const tilly = { tilly: { x: 0, z: 22 } };
  let s = seed;
  if (kind) { for (s = 1; E.planSnowErrand(s * 31, 0).kind !== kind; s++); s *= 31; }
  const live = createSnowErrandLive({ scene, progression, log, roomSeed: s, visits, tilly, send: (ev) => sent.push(ev) });
  const tick = (cat, n = 1, dt = 0.05) => { for (let i = 0; i < n; i++) live.update(dt, i * dt, cat, null, session); };
  const at = (x, z) => ({ x, z, y: P.snowY(x, z) });
  return { progression, scene, awards, sent, log, meshes, session, tilly, live, tick, at };
}
const press = (r, cat) => { r.tick(cat, 1); const line = r.live.promptAt(cat); return { line, k: line ? r.live.interact() : null }; };
const nearTilly = (r) => r.at(r.tilly.tilly.x + 1, r.tilly.tilly.z);

describe('on a walk: each errand, once, with no way to fail', () => {
  it('is offered only from the walk after the story', () => {
    const r = rig({ step: 6, kind: 'button' });
    const g = E.SPOTS[r.live.plan.spot];
    r.tick(r.at(0, 28), 100);
    expect(r.live.state.eligible).toBe(false);
    expect(r.live.promptAt(r.at(g.x, g.z))).toBeNull();
    expect(r.live.credit(E.JOB_WIRE)).toBeNull();
    expect(r.awards).toEqual([]);
    expect(r.live.props).toEqual([]);
  });
  it('cones: three of the four, then Interact beside Tilly (a short hand makes no offer, never scolds)', () => {
    const r = rig({ kind: 'cones' });
    const cat = nearTilly(r);
    r.tick(cat, 2);
    expect(press(r, cat).line).toBeNull();
    r.meshes.delete('snow-1'); r.meshes.delete('snow-3');
    expect(press(r, cat).line).toBeNull(); expect(r.awards).toEqual([]);
    r.meshes.delete('snow-4');
    expect(press(r, r.at(30, -20)).line).toBeNull(); // far from Tilly there is no offer
    expect(press(r, cat).k).toBe('cones');
    expect(r.awards).toHaveLength(1);
    expect(r.awards[0]).toMatchObject({ type: 'snowjob', key: 'snowville-errand' });
    expect(r.progression.state.snowville.album).toBe(1);
    expect(r.progression.state.snowville.step).toBe(7); // nothing else in the story record moved
    expect(r.progression.state.snowville.candles).toBe(7);
    expect(r.sent).toEqual([{ kind: 'sv-job' }]);
  });
  it('otter: the glint moves on while she is near and she goes into the ring', () => {
    const r = rig({ kind: 'otter' });
    r.tick(r.at(-20, 20), 3);
    expect(r.live.state.glintP).toBe(0);
    for (let i = 0; i < 600 && !r.awards.length; i++) {
      const a = E.glintAt(r.live.state.glintP);
      r.tick(r.at(a.x + 1, a.z + 2), 1);
    }
    expect(r.live.state.glintP).toBe(1);
    expect(r.awards).toEqual([]);
    r.tick(r.at(E.GLINT.ring.x, E.GLINT.ring.z), 2);
    expect(r.awards).toHaveLength(1);
  });
  it('button: at the seed\'s spot, carried to the snowman, and a carried button is not kept past the walk', () => {
    const r = rig({ kind: 'button' });
    const g = E.SPOTS[r.live.plan.spot];
    expect(press(r, r.at(E.SNOWMAN.x, E.SNOWMAN.z + 1)).line).toBeNull(); // nothing to give yet
    expect(press(r, r.at(g.x, g.z)).k).toBe('pick');
    expect(r.live.state.item).toBe('carried');
    expect(JSON.stringify(r.progression.state)).not.toMatch(/button|carried/);
    expect(press(r, r.at(E.SNOWMAN.x, E.SNOWMAN.z + 1.5)).k).toBe('give');
    expect(r.awards).toHaveLength(1);
    expect(r.live.state.item).toBe('given');
    const c = rig({ kind: 'button' });
    press(c, c.at(g.x, g.z));
    c.live.dispose(); // the walk ends carrying it
    expect(c.progression.state.snowville.album).toBe(0);
    expect(rig({ kind: 'button' }).live.state.item).toBe('home'); // the next walk finds it at its place
  });
  it('cup: from the cocoa stall to the robin\'s lamps; lights: from the hearth to the hill lantern', () => {
    const c = rig({ kind: 'cup' });
    expect(press(c, c.at(E.ROBIN.x, E.ROBIN.z)).line).toBeNull();
    expect(press(c, c.at(E.CUP.x + 0.5, E.CUP.z)).k).toBe('pick');
    expect(press(c, c.at(E.ROBIN.x + 1, E.ROBIN.z)).k).toBe('give');
    expect(c.awards).toHaveLength(1);
    const l = rig({ kind: 'lights' });
    expect(press(l, l.at(E.STRING.x, E.STRING.z)).k).toBe('pick');
    expect(press(l, l.at(E.HILL_LANTERN.x - 1, E.HILL_LANTERN.z)).k).toBe('give');
    expect(l.awards).toHaveLength(1);
    expect(l.progression.state.snowville.album).toBe(1);
  });
  it('pays 25 paws once a walk, and a resumed walk that already paid offers nothing and pays nothing', () => {
    expect(AWARDS.snowjob).toBe(25);
    const r = rig({ kind: 'button' });
    const g = E.SPOTS[r.live.plan.spot];
    press(r, r.at(g.x, g.z)); press(r, r.at(E.SNOWMAN.x, E.SNOWMAN.z + 1.5));
    press(r, r.at(g.x, g.z)); press(r, r.at(E.SNOWMAN.x, E.SNOWMAN.z + 1.5)); // again
    expect(r.awards).toHaveLength(1);
    const p = rig({ kind: 'button', paid: 1 });
    expect(p.live.state.done).toBe(true);
    expect(press(p, p.at(g.x, g.z)).line).toBeNull();
    expect(p.awards).toEqual([]);
    expect(p.progression.state.snowville.album).toBe(0);
  });
  it('the album gains the lowest free postcard each errand, and a full album still pays the paws', () => {
    const r = rig({ kind: 'button', album: 0b101 });
    const g = E.SPOTS[r.live.plan.spot];
    press(r, r.at(g.x, g.z)); press(r, r.at(E.SNOWMAN.x, E.SNOWMAN.z + 1.5));
    expect(r.progression.state.snowville.album).toBe(0b111);
    const f = rig({ kind: 'button', album: 4095 });
    press(f, f.at(g.x, g.z)); press(f, f.at(E.SNOWMAN.x, E.SNOWMAN.z + 1.5));
    expect(f.awards).toHaveLength(1);
    expect(f.progression.state.snowville.album).toBe(4095);
  });
  it('a partner\'s errand is credited to ours once (an sv-job event), pays our own save and is not sent back', () => {
    const r = rig({ kind: 'lights' });
    expect(r.live.credit({ kind: 'sv-meet' })).toBeNull();
    expect(r.live.credit(E.JOB_WIRE)).toBe('job');
    expect(r.awards).toHaveLength(1);
    expect(r.progression.state.snowville.album).toBe(1);
    expect(r.sent).toEqual([]);
    expect(r.live.credit(E.JOB_WIRE)).toBeNull();
    expect(r.awards).toHaveLength(1);
  });
  it('the life hands the room\'s events to the errand first and stage b fills the slot', () => {
    expect(typeof ST.b.errand).toBe('function');
    const src = read('src/world/snowville.js');
    expect(src).toMatch(/errand\?\.credit\(ev\) \?\? wing\?\.credit\(ev\) \?\? tilly\.credit\(ev\)/);
  });
  it('the same room seed gives two partners the same errand and the same spot; the errand itself is never saved', () => {
    const a = rig({ seed: 424242 }); const b = rig({ seed: 424242 });
    expect(a.live.plan).toEqual(b.live.plan);
    expect(Object.keys(a.progression.state.snowville).sort()).toEqual(['album', 'candles', 'step']);
    const src = read('src/world/snowvillejoblive.js').replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/Math\.random|Date\.now|performance\.now|PointLight/);
    expect(read('src/world/snowvillejob.js').replace(/\/\/.*$/gm, '')).not.toMatch(/Math\.random|Date\.now|performance\.now/);
  });
  it('disposes everything it made', () => {
    const r = rig({ kind: 'otter' });
    expect(r.scene.children.length).toBeGreaterThan(0);
    r.live.dispose();
    expect(r.scene.children.length).toBe(0);
  });
});

describe('the words and the journal, in both sets', () => {
  it('every line exists, is short and kind, and reads without a series word in the everyday set', () => {
    const ids = Object.keys(LINES);
    expect(ids.length).toBeGreaterThanOrEqual(14);
    const scary = /\b(dark\w*|lost forever|trapped|stuck|collapse\w*|scary|scared|afraid|danger\w*|drown\w*|die|dies|dead|hurt|fail\w*|wrong|kit)\b/i;
    for (const id of ids) {
      const s = phrase(id);
      expect(s, id).toMatch(/\S/); expect(s.length, id).toBeLessThanOrEqual(90); expect(s, id).not.toMatch(scary);
      withOffWords(() => { expect(bannedIn(phrase(id)), id).toBeNull(); expect(phrase(id).length).toBeLessThanOrEqual(90); expect(phrase(id), id).not.toMatch(scary); });
    }
    for (const h of Object.values(HINTS)) { expect(h).not.toMatch(scary); withOffWords(() => expect(bannedIn(h)).toBeNull()); }
  });
  it('every phrase(...) call in the errand file has a literal id in the table, and every line of the table is used', () => {
    const src = read('src/world/snowvillejoblive.js').replace(/\/\/.*$/gm, '');
    const used = new Set();
    for (const m of src.matchAll(/\bphrase\(([^)]*)\)/g)) {
      expect(m[1], `phrase(${m[1]})`).toMatch(/^'[a-z0-9.]+'$/);
      expect(Object.keys(LINES)).toContain(m[1].slice(1, -1));
      used.add(m[1].slice(1, -1));
    }
    expect([...used].sort()).toEqual(Object.keys(LINES).sort());
    for (const k of E.ERRAND_KINDS) expect(Object.keys(LINES)).toContain(`snowville.job.${k}`);
  });
  it('the journal has the errand and postcard pages live, with hints, and they count', () => {
    expect(SNOWVILLE_JOB_PAGES.map((p) => p[0])).toEqual(['sw4', 'sw5']);
    for (const [id] of SNOWVILLE_JOB_PAGES) { expect(HINTS[id]).toMatch(/\S/); expect(SNOWVILLE_HINTS[id]).toBe(HINTS[id]); }
    try {
      setSnowville(false); expect(renderJournalHtml({ sw4: 2, sw5: 1 }, 0, 18)).not.toContain('Snow-Globe Postcards');
      setSnowville(true);
      const html = renderJournalHtml({ sw4: 2, sw5: 1 }, 0, 18);
      expect(html).toContain('Tilly’s Errand');
      expect(html).toContain('Snow-Globe Postcards');
    } finally { setSnowville(null); }
    const r = rig({ kind: 'lights' });
    r.live.credit(E.JOB_WIRE);
    expect(r.progression.state.journal.sw4).toBe(1);
    expect(r.progression.state.journal.sw5).toBe(1);
  });
});
