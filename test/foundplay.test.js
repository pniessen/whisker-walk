import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createProgression } from '../src/progression.js';
import { createDiscoveryLog } from '../src/discoveries.js';
import { bus } from '../src/events.js';
import { phrase } from '../src/clanphrases.js';
import { FIND_LOG_KEY } from '../src/foundwear/rules.js';
import { grantFind, restoreFind, findBusy, handleFindArrival, findCardHtml } from '../src/foundwear/play.js';

// Found outfits step 1, Task 8: giving the find. Once a walk; an outfit she
// does not own yet is hers (owned, not worn), and anything else is the pouch
// of 5 🐾. A partner's arrival gives her the same thing, with a toast instead
// of the card.

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
}

const findOf = (item) => ({ item, taken: false, take: vi.fn(function () { this.taken = true; }) });

describe('found outfits: giving the find', () => {
  let progression, log, events, off;
  beforeEach(() => {
    progression = createProgression(fakeStorage());
    log = createDiscoveryLog(progression);
    log.startWalk();
    events = [];
    off = bus.on('discovery', (e) => events.push(e));
  });
  afterEach(() => { if (typeof off === 'function') off(); });

  it('her own find of a new outfit: owned, not worn, marked, the find taken', () => {
    const f = findOf({ kind: 'wear', id: 'acorncap' });
    const g = grantFind(f, { by: 'me' }, { progression, log });
    expect(g).toEqual({ kind: 'wear', id: 'acorncap', by: 'me', petName: undefined });
    expect(progression.state.foundWear).toEqual(['acorncap']);
    expect(progression.state.unlocked.accessories).toContain('acorncap');
    expect(progression.state.equipped.head).toBe(null);
    expect(log.count(FIND_LOG_KEY)).toBe(1);
    expect(f.take).toHaveBeenCalledTimes(1);
    expect(progression.state.points).toBe(0);
    expect(events).toEqual([]);
  });

  it('never twice in one walk', () => {
    grantFind(findOf({ kind: 'wear', id: 'acorncap' }), { by: 'me' }, { progression, log });
    const before = JSON.stringify(progression.state);
    const again = findOf({ kind: 'pouch' });
    expect(grantFind(again, { by: 'me' }, { progression, log })).toBe(null);
    expect(grantFind(again, { by: 'partner', petName: 'Robin' }, { progression, log })).toBe(null);
    expect(again.take).not.toHaveBeenCalled();
    expect(JSON.stringify(progression.state)).toBe(before);
    expect(log.count(FIND_LOG_KEY)).toBe(1);
    expect(events).toEqual([]);
  });

  it('the pouch pays 5 🐾 once, in her words or her partner\'s', () => {
    const f = findOf({ kind: 'pouch' });
    const g = grantFind(f, { by: 'partner', petName: 'Robin' }, { progression, log });
    expect(g).toEqual({ kind: 'pouch', points: 5, by: 'partner', petName: 'Robin' });
    expect(progression.state.points).toBe(5);
    expect(f.take).toHaveBeenCalledTimes(1);
    expect(events).toEqual([{ type: 'pouch', key: FIND_LOG_KEY, label: phrase('wear.pouch.partner', 'Robin'), points: 5, repeat: false }]);
    expect(grantFind(findOf({ kind: 'pouch' }), { by: 'me' }, { progression, log })).toBe(null);
    expect(progression.state.points).toBe(5);

    const p2 = createProgression(fakeStorage());
    const log2 = createDiscoveryLog(p2);
    log2.startWalk();
    events.length = 0;
    expect(grantFind(findOf({ kind: 'pouch' }), { by: 'me' }, { progression: p2, log: log2 }))
      .toEqual({ kind: 'pouch', points: 5, by: 'me', petName: undefined });
    expect(events.map((e) => e.label)).toEqual([phrase('wear.pouch.found')]);
  });

  it('an outfit she already owns turns into the pouch', () => {
    expect(progression.recordFoundWear('acorncap')).toBe(true);
    const f = findOf({ kind: 'wear', id: 'acorncap' });
    const g = grantFind(f, { by: 'me' }, { progression, log });
    expect(g).toEqual({ kind: 'pouch', points: 5, by: 'me', petName: undefined });
    expect(progression.state.points).toBe(5);
    expect(progression.state.foundWear).toEqual(['acorncap']);
    expect(f.take).toHaveBeenCalledTimes(1);
    expect(log.count(FIND_LOG_KEY)).toBe(1);
  });

  it('restoreFind takes the find when the log already holds it', () => {
    log.restore([[FIND_LOG_KEY, 1]]);
    const f = findOf({ kind: 'pouch' });
    restoreFind(f, { log });
    expect(f.take).toHaveBeenCalled();
    const log2 = createDiscoveryLog(progression);
    log2.startWalk();
    const g = findOf({ kind: 'pouch' });
    restoreFind(g, { log: log2 });
    expect(g.take).not.toHaveBeenCalled();
  });

  it('findBusy', () => {
    expect(findBusy({ started: true })).toBe(false);
    expect(findBusy({ started: true, fight: null, crossing: null, clanFight: { uiShowing: null }, findCard: null })).toBe(false);
    for (const s of [{ started: false }, { started: true, fight: {} }, { started: true, crossing: {} },
      { started: true, clanFight: { uiShowing: 'challenge' } }, { started: true, findCard: { id: 'x' } }]) {
      expect(findBusy(s)).toBe(true);
    }
  });

  it('a find taken, noted at once and picked up again after the page is closed, gives nothing more', () => {
    // main.js notes the walk (log.entries() into the resume note) right after
    // a non-null handleFindArrival; the resumed walk restores those entries
    // and restoreFind takes the new find off the ground.
    const s = { cat: { position: { x: 0, y: 0, z: 0 } }, fx: { burst: vi.fn() }, find: findOf({ kind: 'pouch' }) };
    const deps = { progression, log, hud: { toast: vi.fn() }, audio: {}, card: { show: vi.fn() } };
    expect(handleFindArrival(s, { by: 'me' }, deps)).not.toBe(null);
    const note = log.entries();
    expect(note).toContainEqual([FIND_LOG_KEY, 1]);
    const resumed = createDiscoveryLog(progression);
    resumed.startWalk();
    resumed.restore(note);
    const again = findOf({ kind: 'pouch' });
    restoreFind(again, { log: resumed });
    expect(again.taken).toBe(true);
    const points = progression.state.points;
    expect(handleFindArrival({ ...s, find: again }, { by: 'me' }, { ...deps, log: resumed })).toBe(null);
    expect(progression.state.points).toBe(points);
  });

  it('handleFindArrival: her outfit opens the card, a partner\'s gives a toast', () => {
    const s = { cat: { position: { x: 1, y: 0, z: 2 } }, fx: { burst: vi.fn() }, find: findOf({ kind: 'wear', id: 'acorncap' }) };
    const hud = { toast: vi.fn() };
    const audio = { fanfare: vi.fn() };
    const card = { show: vi.fn() };
    const g = handleFindArrival(s, { by: 'me', playerId: null, petName: null }, { progression, log, hud, audio, card });
    expect(g.kind).toBe('wear');
    expect(card.show).toHaveBeenCalledWith(s, 'acorncap');
    expect(audio.fanfare).toHaveBeenCalledTimes(1);
    expect(s.fx.burst).toHaveBeenCalledWith(s.cat.position, 0xf2c14e, 14);
    expect(hud.toast).not.toHaveBeenCalled();

    const p2 = createProgression(fakeStorage());
    const log2 = createDiscoveryLog(p2);
    log2.startWalk();
    const card2 = { show: vi.fn() };
    const hud2 = { toast: vi.fn() };
    const audio2 = { fanfare: vi.fn() };
    s.find = findOf({ kind: 'wear', id: 'acorncap' });
    const g2 = handleFindArrival(s, { by: 'partner', playerId: 'p2', petName: 'Robin' }, { progression: p2, log: log2, hud: hud2, audio: audio2, card: card2 });
    expect(g2).toEqual({ kind: 'wear', id: 'acorncap', by: 'partner', petName: 'Robin' });
    expect(card2.show).not.toHaveBeenCalled();
    expect(hud2.toast).toHaveBeenCalledWith('Robin found it, and there was one for you too: Acorn Cap! It’s in the dress-up at home. 🎁');
    expect(audio2.fanfare).toHaveBeenCalledTimes(1);
    expect(p2.state.equipped.head).toBe(null);
  });

  it('handleFindArrival reads the walk\'s own find, and does nothing once it has been given', () => {
    const find = findOf({ kind: 'pouch' });
    const s = { cat: { position: { x: 0, y: 0, z: 0 } }, fx: { burst: vi.fn() }, find };
    const hud = { toast: vi.fn() };
    const audio = { fanfare: vi.fn() };
    const card = { show: vi.fn() };
    const g = handleFindArrival(s, { by: 'me' }, { progression, log, hud, audio, card });
    expect(g).toEqual({ kind: 'pouch', points: 5, by: 'me', petName: undefined });
    expect(find.take).toHaveBeenCalledTimes(1);
    // the pouch's sound, floater and toast come from the discovery event
    expect(audio.fanfare).not.toHaveBeenCalled();
    expect(hud.toast).not.toHaveBeenCalled();
    expect(card.show).not.toHaveBeenCalled();
    expect(s.fx.burst).toHaveBeenCalledTimes(1);
    expect(handleFindArrival(s, { by: 'me' }, { progression, log, hud, audio, card })).toBe(null);
    expect(s.fx.burst).toHaveBeenCalledTimes(1);
  });

  it('the card\'s words, with and without Wear it, escaped', () => {
    const html = findCardHtml({ title: 'T', name: '<b>Cap</b>', portrait: null, emoji: '🌰', canWear: false, catName: 'Hagrid' });
    expect(html).toContain('&lt;b&gt;Cap&lt;/b&gt;');
    expect(html).not.toContain('<b>');
    expect(html).not.toContain('btn-find-wear');
    expect(html).toContain('Hagrid can’t wear this one');
    expect(html).toContain('<span class="find-emoji">🌰</span>');
    expect(html).toContain(phrase('wear.card.kept'));
    expect(html).toContain('<button id="btn-find-later" class="btn secondary">Later</button>');
    expect(html.startsWith('<div class="pause-card find-card">')).toBe(true);
    const yes = findCardHtml({ title: 'T', name: 'Cap', portrait: 'data:x', emoji: '🌰', canWear: true });
    expect(yes).toContain('<button id="btn-find-wear" class="btn primary">Wear it</button>');
    expect(yes).toContain('<img class="find-portrait" src="data:x" alt="">');
    expect(yes).not.toContain('find-emoji');
    expect(findCardHtml({ title: '"><script>', name: 'Cap', portrait: '"onerror="x', emoji: '<i>', canWear: false, catName: '<u>' }))
      .not.toMatch(/<script>|"onerror|<i>|<u>/);
  });
});
