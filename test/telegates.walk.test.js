import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { walkHarness, areas, fakeDocument } from './helpers/walkharness.js';
import { GATE_MOMENT_MS } from '../src/gatecross.js';
import { setTele } from '../src/teleflag.js';
import { setGreenhouse } from '../src/greenhouseflag.js';
import { teleLoad, tele } from '../src/telehook.js';
import { diagnostics } from '../src/diagnostics.js';
import { mulberry32 } from '../src/rng.js';
import { CATALOG } from '../src/progression.js';
import { phrase } from '../src/clanphrases.js';
import { createCrossing } from '../src/game/crossing.js';
import { snapshotWalk, writeResume, readResume } from '../src/game/walkresume.js';
import { resumableAreaIds } from '../src/roofsflag.js';

// Teleport gates, milestone 0: the whole walk through the gate and back (src/game/walk.js walkOn), headless, on a fixed
// day, with the timers faked so the swirl can be run on. The pure parts (the table, the prompt, the words) are
// test/teleport.test.js.

const WALK_MS = 90_000;
const PG = 'park-greenhouse';
const GP = 'greenhouse-park';

beforeAll(async () => {
  setTele(true);
  setGreenhouse(true);
  await teleLoad();
  await areas.ensureAll(['park', 'greenhouse']);
});

beforeEach(() => {
  setTele(true);
  setGreenhouse(true);
  globalThis.document = fakeDocument();
  diagnostics.clear();
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: new Date('2026-11-23T15:00:00Z') });
  const stream = mulberry32(20261123);
  vi.spyOn(Math, 'random').mockImplementation(() => stream());
});
afterEach(() => {
  delete globalThis.document;
  diagnostics.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
  setTele(null);
  setGreenhouse(null);
});

// Clan Edition, in the Park, which she owns, wearing a collar.
function parkSave(p) {
  p.setTutorialFirst('done');
  p.state.unlocked.areas.push('park');
  p.state.walks.park = 2;
  p.setArea('park');
  p.state.unlocked.accessories.push('raincoat');
  p.state.equipped.body = 'raincoat';
  p.addPoints(100);
}
const legacyParkSave = (p) => { parkSave(p); p.setEdition('legacy'); };

const gateMeshes = (s) => { const out = []; s.scene.traverse((o) => { if (o.name === 'teleDisc') out.push(o); }); return out; };

describe('the gates in a walk', () => {
  it('the Park draws its gate (flag on), the Greenhouse its own, either edition; nothing without the flag', () => {
    for (const save of [parkSave, legacyParkSave]) {
      const h = walkHarness({ save });
      h.w.startWalk({});
      expect(gateMeshes(h.getSession()), save.name).toHaveLength(2); // the spike gate and the Moon gate (dormant)
      expect(h.getSession().areaId).toBe('park');
    }
    const g = walkHarness({ save: parkSave });
    g.w.startWalk({ areaOverride: 'greenhouse' });
    expect(g.getSession().areaId).toBe('greenhouse');
    expect(gateMeshes(g.getSession())).toHaveLength(1);
    setTele(false);
    const off = walkHarness({ save: parkSave });
    off.w.startWalk({});
    expect(gateMeshes(off.getSession())).toHaveLength(0);
  }, WALK_MS);

  it('the stones are solid, the middle is not: two pillar colliders join the walk\'s live list, an area\'s own stays as built', () => {
    setTele(false);
    const bare = walkHarness({ save: parkSave });
    bare.w.startWalk({});
    const n = bare.getSession().areaData.colliders.length;
    setTele(true);
    const h = walkHarness({ save: parkSave });
    h.w.startWalk({});
    const cs = h.getSession().areaData.colliders;
    expect(cs.length).toBe(n + 4); // two pillars for each of the Park's two gates
    expect(cs.filter((c) => c.x === -10 && (c.z === 42.7 || c.z === 45.3))).toHaveLength(2);
  }, WALK_MS);
});

describe('through and back', () => {
  it('Park to Greenhouse: banked quietly, the swirl for 1.2 s, then her at the Greenhouse\'s gate home, the same cat in the same clothes', async () => {
    const walked = [];
    const h = walkHarness({ save: parkSave, onWalkedOn: (l) => walked.push(l) });
    h.w.startWalk({});
    const before = h.getSession();
    const cat = before.cat.userData.breed;
    const equipped = JSON.stringify(h.progression.state.equipped);
    const area = h.progression.state.area;
    const unlockedBefore = JSON.stringify(h.progression.state.unlocked);
    const going = h.w.walkOn({ via: PG });
    expect(h.getSession()).toBeNull(); // banked and freed: the pack is here
    expect(await going).toBe('walked');
    expect(h.overlay.innerHTML).toContain('class="tele-swirl"');
    expect(h.overlay.innerHTML).toContain('Off to the Greenhouse!');
    expect(h.overlay.innerHTML).not.toContain('Home again!');
    expect(h.overlay.classList.contains('hidden')).toBe(false);
    expect(h.progression.state.walks.park).toBe(3); // the walk banked as every walk-on's does
    expect(await h.w.walkOn({ via: PG })).toBe('refused'); // a second tap during the swirl
    expect(GATE_MOMENT_MS).toBe(1200);
    vi.advanceTimersByTime(1199);
    expect(h.getSession()).toBeNull();
    vi.advanceTimersByTime(1);
    const s = h.getSession();
    expect(s.areaId).toBe('greenhouse');
    expect(s.cat.position.x).toBeCloseTo(-6.4, 9);
    expect(s.cat.position.z).toBeCloseTo(29, 9);
    expect(s.cat.rotation.y).toBeCloseTo(Math.PI / 2, 9);
    expect(s.arrivedVia).toBe(GP);
    // the same cat, the same clothes, nothing bought or unlocked, her place unchanged
    expect(s.cat.userData.breed).toBe(cat);
    expect(JSON.stringify(h.progression.state.equipped)).toBe(equipped);
    expect(JSON.stringify(h.progression.state.unlocked)).toBe(unlockedBefore);
    expect(h.progression.state.area).toBe(area);
    expect(h.progression.state.walks.greenhouse ?? 0).toBe(0);
    // the arrival line says how to go home
    expect(walked).toHaveLength(1);
    expect(walked[0].concat(s.startLines ?? [])).toContain(phrase('tele.home', 'stonering'));
    expect(gateMeshes(s)).toHaveLength(1); // the way home
  }, WALK_MS);

  it('and back: Greenhouse to Park, at the Park\'s gate, the walk banked, her place the Park', async () => {
    const h = walkHarness({ save: parkSave });
    h.w.startWalk({});
    await h.w.walkOn({ via: PG });
    vi.advanceTimersByTime(GATE_MOMENT_MS);
    expect(h.getSession().areaId).toBe('greenhouse');
    const equipped = JSON.stringify(h.progression.state.equipped);
    expect(await h.w.walkOn({ via: GP })).toBe('walked');
    expect(h.progression.state.walks.greenhouse).toBe(1);
    expect(h.overlay.innerHTML).toContain(`Off to ${CATALOG.areas.park.name}!`);
    vi.advanceTimersByTime(GATE_MOMENT_MS);
    const s = h.getSession();
    expect(s.areaId).toBe('park');
    expect(s.cat.position.x).toBeCloseTo(-6.4, 9);
    expect(s.cat.position.z).toBeCloseTo(44, 9);
    expect(s.cat.rotation.y).toBeCloseTo(Math.PI / 2, 9);
    expect(s.arrivedVia).toBe(PG);
    expect(h.progression.state.area).toBe('park');
    expect(JSON.stringify(h.progression.state.equipped)).toBe(equipped);
  }, WALK_MS);

  it('closing the app on the far side starts there: the walk note names the Greenhouse and a launch picks it up; her saved place stays the Park', async () => {
    const h = walkHarness({ save: parkSave });
    h.w.startWalk({});
    await h.w.walkOn({ via: PG });
    vi.advanceTimersByTime(GATE_MOMENT_MS);
    const s = h.getSession();
    expect(s.areaId).toBe('greenhouse');
    expect(h.progression.state.area).toBe('park'); // the Greenhouse is walked as an override, never her saved place
    // what main.js writes as the game is put away, and reads back at the next launch
    const note = snapshotWalk(s, { yaw: 0, now: Date.now() });
    expect(note).not.toBeNull();
    expect(note.areaId).toBe('greenhouse');
    const store = new Map();
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
    writeResume(storage, note);
    const left = readResume(storage, { now: Date.now(), areaIds: resumableAreaIds(h.progression.state.walks) });
    expect(left.kind).toBe('resume');
    expect(left.data.areaId).toBe('greenhouse');
    expect(left.data.x).toBeCloseTo(-6.4, 9);
    expect(left.data.z).toBeCloseTo(29, 9);
    // the launch: a walk started again in the Greenhouse from the note, her place unchanged
    const again = walkHarness({ save: parkSave });
    again.w.startWalk({ areaOverride: 'greenhouse', resume: left.data, duskMode: left.data.dusk });
    expect(again.getSession().areaId).toBe('greenhouse');
    expect(again.progression.state.area).toBe('park');
  }, WALK_MS);

  it('reduced motion: the same walk-on, a 0.4 s fade instead of the swirl', async () => {
    const h = walkHarness({ save: parkSave, settingsValues: { reducedMotion: true } });
    h.w.startWalk({});
    expect(await h.w.walkOn({ via: PG })).toBe('walked');
    expect(h.overlay.innerHTML).toContain('class="tele-swirl calm"');
    vi.advanceTimersByTime(399);
    expect(h.getSession()).toBeNull();
    vi.advanceTimersByTime(1);
    expect(h.getSession().areaId).toBe('greenhouse');
    expect(h.getSession().cat.position.x).toBeCloseTo(-6.4, 9);
  }, WALK_MS);

  it('a place that is slow: the swirl keeps on, "Nearly there!" after 1.5 s, then she goes through once it comes', async () => {
    const slowLoader = { loaded: (id) => (id === 'greenhouse' && !here ? null : areas.loaded(id)), prefetch() {}, ensure: (id) => (id === 'greenhouse' ? new Promise((r) => setTimeout(() => { here = true; r(areas.loaded('greenhouse')); }, 2000)) : areas.ensure(id)) };
    let here = false;
    const lines = [];
    const h = walkHarness({ save: parkSave, areas: slowLoader });
    const root = { querySelector: (q) => (q === '.tele-line' ? { set textContent(v) { lines.push(v); } } : null) };
    Object.defineProperty(h.overlay, 'querySelector', { value: root.querySelector });
    h.w.startWalk({});
    const going = h.w.walkOn({ via: PG });
    expect(h.getSession()).not.toBeNull(); // still in her walk, paused, under the swirl
    expect(h.overlay.innerHTML).toContain('class="tele-swirl"');
    vi.advanceTimersByTime(1499);
    expect(lines).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(lines).toEqual(['Nearly there!']);
    vi.advanceTimersByTime(500);
    expect(await going).toBe('walked');
    vi.advanceTimersByTime(GATE_MOMENT_MS);
    expect(h.getSession().areaId).toBe('greenhouse');
  }, WALK_MS);

  it('a failed load returns her to her walk with the one line, as at any gate; the swirl is gone', async () => {
    const failing = { loaded: (id) => (id === 'greenhouse' ? null : areas.loaded(id)), prefetch() {}, ensure: (id) => (id === 'greenhouse' ? Promise.reject(Object.assign(new Error('x'), { kind: 'failed' })) : areas.ensure(id)) };
    const h = walkHarness({ save: parkSave, areas: failing });
    h.w.startWalk({});
    expect(await h.w.walkOn({ via: PG })).toBe('failed');
    expect(h.getSession().areaId).toBe('park');
    expect(h.overlay.innerHTML).not.toContain('tele-swirl');
    expect(h.toasts).toContain(phrase('start.notReady'));
  }, WALK_MS);

  it('a gate the walk does not have, or from the wrong place, is refused', async () => {
    const h = walkHarness({ save: parkSave });
    h.w.startWalk({});
    expect(await h.w.walkOn({ via: GP })).toBe('refused'); // the Greenhouse\'s end, from the Park
    expect(await h.w.walkOn({ via: 'nope' })).toBe('refused');
    expect(h.getSession().areaId).toBe('park');
  }, WALK_MS);

  it('without ?gates=1 the kit is not asked and the gate is not there to walk through', async () => {
    setTele(false);
    const h = walkHarness({ save: parkSave });
    h.w.startWalk({});
    // tele.kit stays set from this file's load (one page, one load), but a flagless walk draws nothing and its prompt is null
    expect(tele.kit).not.toBeNull();
    expect(gateMeshes(h.getSession())).toHaveLength(0);
    expect(CATALOG.areas.greenhouse).toBeUndefined();
  }, WALK_MS);
});

describe('the card and its two buttons (game/crossing.js)', () => {
  const crossing = (s, overrides = {}) => {
    const overlay = { innerHTML: '', classList: { add() {}, remove() {}, contains: () => false }, querySelector: () => null };
    const calls = { walkOn: [], released: 0, resumed: 0, prefetched: [] };
    const c = createCrossing({
      getSession: () => s, overlay, hud: { toast() {} }, releaseControl: () => { calls.released += 1; }, resumeWalk: () => { calls.resumed += 1; },
      endWalk() {}, getIsTouch: () => false, getEdition: () => 'canon', prefetchArea: (id) => calls.prefetched.push(id),
      walkOn: (a) => { calls.walkOn.push(a); return Promise.resolve('walked'); }, ...overrides,
    });
    return { c, overlay, calls };
  };
  const dataFor = async () => {
    const kit = await teleLoad();
    const end = kit.TELE_ENDS.park[0];
    const p = kit.prompt({ areaId: 'park' }, { x: end.x + 1, z: end.z }, { edition: 'canon', walks: {} }, false, () => {}, true);
    return p.prompt.data;
  };

  it('a gate she can go through puts up "Go through to the Greenhouse?"; the yes walks on through that gate, the no puts the walk back', async () => {
    const s = { areaId: 'park', net: null };
    const { c, overlay, calls } = crossing(s);
    c.askGate(s, await dataFor());
    expect(overlay.innerHTML).toContain('Go through to the Greenhouse?');
    expect(overlay.innerHTML).toContain('btn-cross-yes');
    expect(overlay.innerHTML).not.toContain("Yes, let's go");
    expect(s.crossing).toMatchObject({ via: PG, to: 'greenhouse', kind: 'gate' });
    expect(calls.prefetched).toEqual(['greenhouse']);
    c.confirm();
    expect(calls.walkOn).toEqual([{ via: PG }]);
    // and the no
    const s2 = { areaId: 'park', net: null };
    const b = crossing(s2);
    b.c.askGate(s2, await dataFor());
    b.c.cancel();
    expect(s2.crossing).toBeNull();
    expect(b.calls.resumed).toBe(1);
    expect(b.calls.walkOn).toEqual([]);
  });

  it('a map gate\'s card is the one it always was', () => {
    const s = { areaId: 'park', net: null };
    const { c, overlay } = crossing(s);
    c.askGate(s, { end: { id: 'park-farm' }, status: { kind: 'go', to: 'farm', name: 'Appletree Farm' } });
    expect(overlay.innerHTML).toContain("Yes, let's go!");
    expect(overlay.innerHTML).not.toContain('Go through');
  });

  it('a room\'s guest cannot open it: only a solo cat or the host asks', async () => {
    const s = { areaId: 'park', net: { isHost: () => false } };
    const { c, overlay } = crossing(s);
    c.askGate(s, await dataFor());
    expect(overlay.innerHTML).toBe('');
  });
});
