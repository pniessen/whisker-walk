// The passport page and the Back button (interconnectivity milestone I4).
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { walkHarness, areas, fakeDocument } from './helpers/walkharness.js';
import { CATALOG } from '../src/progression.js';
import { placeName } from '../src/edition.js';
import { escapeHtml } from '../src/escapehtml.js';
import { ICON, STREET_ICON } from '../src/ui/territorymap.js';
import { REGIONS } from '../src/regions.js';
import { renderPassportHtml, stampedIds } from '../src/passport.js';
import { createCrossing } from '../src/game/crossing.js';
import { pauseCardFor, pauseCardHtml } from '../src/game/walk.js';
import { GATE_MOMENT_MS } from '../src/gatecross.js';
import { phrase } from '../src/clanphrases.js';
import { mulberry32 } from '../src/rng.js';
import { withOffWords } from './helpers/offwords.js';

const kitFor = (state) => ({ icons: { ...ICON, ...STREET_ICON }, name: (id) => placeName(id, state.edition, CATALOG), esc: escapeHtml });
const page = (state) => renderPassportHtml(state, kitFor(state));

describe('the passport page', () => {
  it('has a stamp for each place with walks of 1 or more, grouped by region, and nothing for the rest', () => {
    const state = { edition: 'canon', walks: { neighborhood: 3, park: 1, farm: 0, docks: 2, woods: 1, moon: 1, reef: 0 } };
    const html = page(state);
    for (const [name, region] of [['Town', 'Urban'], ['City Park', 'Urban'], ['Docks', 'Shore'], ['Clan lands', 'Clan lands'], ['Other worlds', 'Other worlds']]) {
      expect(html, `${name}/${region}`).toContain(region);
    }
    expect(html.match(/passport-stamp/g)).toHaveLength(5);
    expect(html).not.toContain('Appletree Farm');
    expect(html).not.toContain('Suburban and rural'); // no stamp there, so no heading
    expect(html).not.toMatch(/missing|locked|🔒|\?/);
    expect(html.indexOf('Urban')).toBeLessThan(html.indexOf('Shore'));
  });

  it('with no stamp it says one soft line', () => {
    const html = page({ edition: 'canon', walks: { park: 0 } });
    expect(html).toContain(phrase('passport.empty'));
    expect(html).not.toContain('passport-stamp');
  });

  it('reads both word sets', () => {
    const state = { edition: 'canon', walks: { woods: 2, neighborhood: 1 } };
    expect(page(state)).toContain('Clan lands');
    withOffWords(() => {
      const html = page(state);
      expect(html).toContain('Wild lands');
      expect(html).not.toContain('Clan');
    });
  });

  it('is worked out from walks alone: hostile saves read as unvisited and nothing is written', () => {
    const hostile = { edition: 'canon', walks: { park: '<script>', farm: NaN, fair: -3, docks: Infinity, woods: 'x', river: [], moor: {}, pines: null, seaside: 0.5, __proto__: { gorge: 9 } } };
    const html = page(hostile);
    expect(html).not.toContain('<script>');
    expect(stampedIds(hostile.walks)).toEqual([]);
    for (const bad of [null, undefined, 7, 'x', []]) expect(stampedIds(bad)).toEqual([]);
    expect(page({ edition: 'canon', walks: null })).toContain(phrase('passport.empty'));
    const frozen = JSON.stringify({ edition: 'canon', walks: { park: 1 } });
    const state = JSON.parse(frozen);
    Object.freeze(state.walks); Object.freeze(state);
    expect(() => page(state)).not.toThrow();
    expect(JSON.stringify(state)).toBe(frozen);
  });

  it('every region member has an icon, and walks of 1 alone make every place a stamp', () => {
    const all = Object.fromEntries(REGIONS.flatMap((r) => r.members).map((id) => [id, 1]));
    const html = page({ edition: 'canon', walks: all });
    expect(html.match(/passport-stamp/g)).toHaveLength(Object.keys(all).length);
    expect(html).not.toContain('🐾');
  });
});

describe('the new stamp line and the Back button', () => {
  beforeAll(() => areas.ensureAll(['neighborhood', 'park', 'farm']));
  beforeEach(() => {
    globalThis.document = fakeDocument();
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: new Date('2026-11-21T15:00:00Z') });
    const stream = mulberry32(20261121);
    vi.spyOn(Math, 'random').mockImplementation(() => stream());
  });
  afterEach(() => { delete globalThis.document; vi.restoreAllMocks(); vi.useRealTimers(); });

  function parkSave(p) {
    p.setTutorialFirst('done');
    p.state.unlocked.areas.push('park', 'farm');
    p.state.walks.park = 2;
    p.setArea('park');
    p.addPoints(100);
  }
  const stampLine = (name) => phrase('passport.stamp', name);

  it('says a new stamp once, the walk a place first counts, and never again', () => {
    const h = walkHarness({ save: (p) => { p.setTutorialFirst('done'); p.state.unlocked.areas.push('park'); p.setArea('park'); } });
    h.w.startWalk({});
    h.w.endWalk();
    expect(h.progression.state.walks.park).toBe(1);
    expect(h.overlay.innerHTML).toContain(stampLine('City Park'));
    h.w.startWalk({});
    h.w.endWalk();
    expect(h.progression.state.walks.park).toBe(2);
    expect(h.overlay.innerHTML).not.toContain('A new stamp');
    // nothing about it is in the save
    expect(JSON.stringify(h.progression.state)).not.toMatch(/passport/i);
    expect(Object.keys(h.progression.state)).not.toContain('stamps');
  });

  it('a walk-on toasts it for the place left, once', async () => {
    const walked = [];
    const h = walkHarness({ save: (p) => { parkSave(p); p.state.walks.park = 0; }, onWalkedOn: (l) => walked.push(l) });
    h.w.startWalk({});
    await h.w.walkOn({ via: 'park-farm' });
    vi.advanceTimersByTime(GATE_MOMENT_MS);
    const lines = [...walked.flat(), ...(h.getSession().startLines ?? [])];
    expect(lines.filter((l) => l === stampLine('City Park'))).toHaveLength(1);
  });

  it('the Back button shows only after a gate, on the started pause card, for solo or the host', async () => {
    const h = walkHarness({ save: parkSave });
    h.w.startWalk({});
    const park = h.getSession();
    park.started = true;
    expect(park.cameFrom).toBeNull();
    expect(pauseCardFor(park, false, null)).not.toContain('btn-back'); // a fresh start or the map's Go there
    await h.w.walkOn({ via: 'park-farm' });
    vi.advanceTimersByTime(GATE_MOMENT_MS);
    const farm = h.getSession();
    expect(farm.cameFrom).toBe('park');
    expect(pauseCardFor(farm, false, null)).not.toContain('btn-back'); // Ready? card: the walk has not begun
    farm.started = true;
    const card = pauseCardFor(farm, false, null);
    expect(card).toContain(`<button id="btn-back" class="secondary">${phrase('walk.back', 'City Park')}</button>`);
    // the same two doors in a reading order: keep exploring, back, (the Farm's story card, 2026-11-28), head home
    expect([...card.matchAll(/<button id="(btn-[a-z]+)"/g)].map((m) => m[1])).toEqual(['btn-resume', 'btn-back', 'btn-story', 'btn-end']);
    farm.net = { isHost: () => true };
    expect(pauseCardFor(farm, false, null)).toContain('btn-back');
    farm.net = { isHost: () => false };
    expect(pauseCardFor(farm, false, null)).not.toContain('btn-back');
    farm.net = null;
    farm.arrivedVia = null; // arrived some other way
    expect(pauseCardFor(farm, false, null)).not.toContain('btn-back');
    expect(pauseCardHtml({ welcome: null, touch: false, mode: 'paused' })).not.toContain('btn-back');
  }, 90_000);

  it('Back walks through the same crossing: banked, the moment, and the place she came from', async () => {
    const h = walkHarness({ save: parkSave });
    const crossing = createCrossing({
      getSession: h.getSession, overlay: h.overlay, hud: { toast() {} },
      releaseControl() {}, resumeWalk() {}, endWalk: (o) => h.w.endWalk(o), getIsTouch: () => false,
      getEdition: () => h.progression.state.edition, catalog: CATALOG,
      walkOn: (o) => h.w.walkOn(o), progression: h.progression,
    });
    h.w.startWalk({});
    crossing.back(); // nothing to go back to yet
    expect(h.getSession().areaId).toBe('park');
    await h.w.walkOn({ via: 'park-farm' });
    vi.advanceTimersByTime(GATE_MOMENT_MS);
    expect(h.getSession().areaId).toBe('farm');
    const farmWalks = h.progression.state.walks.farm ?? 0;
    crossing.back();
    await Promise.resolve();
    expect(h.getSession()).toBeNull();
    expect(h.overlay.innerHTML).toContain('Off to City Park!');
    expect(h.progression.state.walks.farm).toBe(farmWalks + 1);
    vi.advanceTimersByTime(GATE_MOMENT_MS);
    const back = h.getSession();
    expect(back.areaId).toBe('park');
    expect(back.arrivedVia).toBe('park-farm');
    expect(back.cameFrom).toBe('farm');
  }, 90_000);

  it('a guest in a room has no Back crossing', async () => {
    const h = walkHarness({ save: parkSave });
    const crossing = createCrossing({
      getSession: h.getSession, overlay: h.overlay, hud: { toast() {} },
      releaseControl() {}, resumeWalk() {}, endWalk() {}, getIsTouch: () => false,
      getEdition: () => 'canon', catalog: CATALOG, walkOn: (o) => h.w.walkOn(o), progression: h.progression,
    });
    h.w.startWalk({});
    await h.w.walkOn({ via: 'park-farm' });
    vi.advanceTimersByTime(GATE_MOMENT_MS);
    const farm = h.getSession();
    farm.net = { isHost: () => false };
    crossing.back();
    expect(h.getSession()).toBe(farm);
    expect(farm.crossing).toBeFalsy();
  }, 90_000);
});
