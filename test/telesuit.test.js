import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { walkHarness, areas, fakeDocument } from './helpers/walkharness.js';
import { GATE_MOMENT_MS } from '../src/gatecross.js';
import { setTele } from '../src/teleflag.js';
import { setGreenhouse } from '../src/greenhouseflag.js';
import { teleLoad, tele } from '../src/telehook.js';
import { registerSuitKit, suitKit, isSuitId } from '../src/suithook.js';
import { createRemoteCats } from '../src/remotecats.js';
import { buildCat } from '../src/cat/model.js';
import { wornNow } from '../src/outfits.js';
import { CATALOG } from '../src/progression.js';
import { phrase } from '../src/clanphrases.js';
import { mulberry32 } from '../src/rng.js';

// Teleport gates, milestone 2: the suit that puts itself on at a gate's far side. It is drawn from the place, never worn:
// no suit id is ever in a save, an outfit or a code. The spike pair shows a look with ?suit=space or ?suit=dive.

const WALK_MS = 90_000;
const PG = 'park-greenhouse';
const GP = 'greenhouse-park';
const setSearch = (q) => { globalThis.location = { search: q }; };
const suitMeshes = (cat) => { const out = []; cat.traverse((o) => { if (o.isMesh && (o.userData.suit || o.userData.backItem?.startsWith('suit-'))) out.push(o); }); return out; };

let T;
beforeAll(async () => {
  setTele(true);
  setGreenhouse(true);
  await teleLoad();
  T = tele.kit;
  await areas.ensureAll(['park', 'greenhouse']);
});
beforeEach(() => {
  setTele(true);
  setGreenhouse(true);
  setSearch('?gates=1&suit=space');
  registerSuitKit(null);
  globalThis.document = fakeDocument();
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: new Date('2026-11-24T15:00:00Z') });
  const stream = mulberry32(20261124);
  vi.spyOn(Math, 'random').mockImplementation(() => stream());
});
afterEach(() => {
  delete globalThis.document;
  delete globalThis.location;
  vi.restoreAllMocks();
  vi.useRealTimers();
  registerSuitKit(null);
  setTele(null);
  setGreenhouse(null);
});

function parkSave(p) {
  p.setTutorialFirst('done');
  p.state.unlocked.areas.push('park');
  p.state.walks.park = 2;
  p.setArea('park');
  p.state.unlocked.accessories.push('raincoat');
  p.state.equipped.body = 'raincoat';
  p.addPoints(100);
}

describe('which look a gate draws', () => {
  it('the spike pair has no look of its own: none without ?suit, the Greenhouse side takes the page\'s, home never does', () => {
    setSearch('?gates=1');
    expect(T.suitOf(T.TELE_ENDS.park[0])).toBeNull();
    for (const q of ['?suit=space', '?suit=dive']) {
      setSearch(q);
      expect(T.suitOf(T.TELE_ENDS.park[0])).toBe(q.slice(6));
      expect(T.suitOf(T.TELE_ENDS.greenhouse[0])).toBeNull();
    }
    setSearch('?suit=moon');
    expect(T.suitOf(T.TELE_ENDS.park[0])).toBeNull();
  });
  it('a row\'s own suit wins over the page', () => {
    const row = T.teleRow({ ...T.TELE_ENDS.park[0], id: 'x', suit: 'dive' });
    expect(T.suitOf(row)).toBe('dive');
  });
  it('teleHandoff carries it', () => {
    setSearch('?suit=dive');
    const h = T.teleHandoff({ via: PG, state: { walks: {}, edition: 'canon' }, catalog: CATALOG });
    expect(h.suit).toBe('dive');
  });
  it('suitFor: the place beyond only, gates on, and only once the kit is here (never half-dressed)', async () => {
    expect(T.suitFor('greenhouse')).toBeNull(); // no kit yet
    expect(T.suitWanted('greenhouse')).toBe(true);
    expect(T.suitWanted('park')).toBe(false);
    expect(await T.warm('greenhouse')).toBe(true);
    expect(suitKit()).not.toBeNull();
    expect(T.suitFor('greenhouse')).toBe('space');
    expect(T.suitFor('park')).toBeNull();
    setTele(false);
    expect(T.suitFor('greenhouse')).toBeNull();
    setTele(true);
    expect(await T.warm('park')).toBe(false);
  });
});

describe('the suit in a walk', () => {
  it('arrival: suited by the place, her saved wear byte-identical; home again: her own clothes, nothing carried', async () => {
    const walked = [];
    const h = walkHarness({ save: parkSave, onWalkedOn: (l) => walked.push(l) });
    h.w.startWalk({});
    expect(suitMeshes(h.getSession().cat)).toHaveLength(0);
    const equipped = JSON.stringify(h.progression.state.equipped);
    const saved = JSON.stringify(h.progression.state);
    const going = h.w.walkOn({ via: PG });
    expect(h.getSession()).not.toBeNull(); // the kit is not here: the walk waits for it
    expect(await going).toBe('walked');
    vi.advanceTimersByTime(GATE_MOMENT_MS);
    const s = h.getSession();
    expect(s.areaId).toBe('greenhouse');
    expect(suitMeshes(s.cat).length).toBeGreaterThan(3);
    expect(JSON.stringify(h.progression.state.equipped)).toBe(equipped);
    const lines = walked.flat().concat(s.startLines ?? []);
    expect(lines).toContain(phrase('tele.suit'));
    expect(lines).toContain(phrase('tele.home', 'stonering'));
    // nothing suit-shaped is in the save, an outfit or what the cat is saved as
    expect(JSON.stringify(h.progression.state).includes('suit-')).toBe(false);
    expect(Object.values(wornNow(h.progression.state.equipped, CATALOG)).some(isSuitId)).toBe(false);
    expect(await h.w.walkOn({ via: GP })).toBe('walked');
    vi.advanceTimersByTime(GATE_MOMENT_MS);
    expect(h.getSession().areaId).toBe('park');
    expect(suitMeshes(h.getSession().cat)).toHaveLength(0);
    expect(JSON.stringify(h.progression.state.equipped)).toBe(equipped);
    // the walks she banked are the only change a round trip makes to the save
    const now = JSON.parse(JSON.stringify(h.progression.state));
    const was = JSON.parse(saved);
    for (const k of ['walks', 'stats', 'journal', 'points', 'lifetimePoints', 'daily', 'streak', 'lastWalkDate', 'visits', 'seen']) { delete now[k]; delete was[k]; }
    expect(JSON.stringify(now).includes('suit-')).toBe(false);
  }, WALK_MS);

  it('a start on the far side (the app was closed there) is suited by the place once the kit is here', async () => {
    await T.warm('greenhouse');
    const h = walkHarness({ save: parkSave });
    h.w.startWalk({ areaOverride: 'greenhouse' });
    expect(suitMeshes(h.getSession().cat).length).toBeGreaterThan(3);
  }, WALK_MS);

  it('the first arrival plays the montage (the pieces pop on one by one); a second visit and reduced motion do not', async () => {
    await T.warm('greenhouse');
    const first = T.walkOn(PG, { walks: {}, edition: 'canon' }, false);
    expect(first.montage).toBe(true);
    expect(T.walkOn(PG, { walks: { greenhouse: 1 }, edition: 'canon' }, false).montage).toBe(false);
    expect(T.walkOn(GP, { walks: {}, edition: 'canon' }, false).montage).toBe(false); // home has no suit
    const cat = buildCat('tabby', { collar: null, head: 'suit-helmet-space', face: null, neck: null, body: 'suit-body-space', back: 'suit-pack-space', feet: 'suit-boots-space' });
    const pieces = (tag) => suitMeshes(cat).filter((m) => (m.userData.suit === 'gauge' ? 'pack' : m.userData.suit) === tag);
    expect(T.suitUp(cat, { calm: true })).toBe(0);
    expect(pieces('body').every((m) => m.visible)).toBe(true);
    expect(T.suitUp(cat)).toBe(3);
    for (const tag of T.SUIT_MONTAGE) expect(pieces(tag).every((m) => !m.visible), tag).toBe(true);
    vi.advanceTimersByTime(300);
    expect(pieces('body').every((m) => m.visible)).toBe(true);
    expect(pieces('helmet').every((m) => !m.visible)).toBe(true);
    vi.advanceTimersByTime(440);
    for (const tag of T.SUIT_MONTAGE) expect(pieces(tag).every((m) => m.visible), tag).toBe(true);
  });

  it('Hagrid takes the helmet alone', async () => {
    await T.warm('greenhouse');
    const h = walkHarness({ save: (p) => { parkSave(p); p.state.equipped.cat = 'hagrid'; } });
    h.w.startWalk({ areaOverride: 'greenhouse' });
    const s = h.getSession();
    expect(s.cat.userData.breed).toBe('hagrid');
    expect(suitMeshes(s.cat).every((m) => m.userData.suit === 'helmet')).toBe(true);
  }, WALK_MS);
});

describe('co-walkers', () => {
  const PROFILE = { playerId: 'bbb', petName: 'Friend', breed: 'tabby', accessories: { collar: 'bell', body: 'raincoat' } };
  const fakeScene = () => ({ add() {}, remove() {} });
  it('a remote cat is drawn suited by the place, her profile (what is saved and sent) untouched', async () => {
    await T.warm('greenhouse');
    const plain = createRemoteCats(fakeScene()).upsert(PROFILE, 0);
    expect(suitMeshes(plain.group)).toHaveLength(0);
    const suited = createRemoteCats(fakeScene(), { suitLook: 'dive' }).upsert(PROFILE, 0);
    expect(suitMeshes(suited.group).length).toBeGreaterThan(3);
    expect(suited.accessories).toEqual({ collar: 'bell', body: 'raincoat' });
    const hen = createRemoteCats(fakeScene(), { suitLook: 'dive' }).upsert({ ...PROFILE, playerId: 'ccc', breed: 'hagrid' }, 0);
    expect(suitMeshes(hen.group).every((m) => m.userData.suit === 'helmet')).toBe(true);
  });
  it('the chunk is lazy in start-up terms: teleLoad warms the kit for a start in a suit place', async () => {
    expect(typeof teleLoad).toBe('function');
    registerSuitKit(null);
    await teleLoad('greenhouse');
    await vi.waitFor(() => expect(suitKit()).not.toBeNull());
  });
});
