// The home screen's "next thing" line (src/ui/nextthing.js): guided-first-walk
// design, section 6. One test per rule, one for the order, and Legacy Edition.
import { describe, it, expect } from 'vitest';
import { nextThing, nextThingHtml, NEXT_ATTR } from '../src/ui/nextthing.js';
import { createProgression, CATALOG } from '../src/progression.js';
import { PLACE_WORDS } from '../src/clanwords.js';

const KEY = 'whisker-walk-save';
function memStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}
// A cleaned save with these fields over a new one.
const save = (fields = {}) => createProgression(memStorage({ [KEY]: JSON.stringify({ version: 4, ...fields }) })).state;
const ME = '11111111-1111-4111-8111-111111111111';
// A colony cat (untamed unless `tamed`) and n feeds of it, as the save keeps them.
const cat = (name, area = 'neighborhood', tamed = false) => ({ name, finder: ME, area, x: 1, z: 1, wear: null, tamedBy: tamed ? ME : null, tamedWalk: tamed ? 'walk-900' : null });
const feeds = (name, n) => Array.from({ length: n }, (_, i) => ({ cat: name, by: ME, walk: `walk-${name.length}${i}`, head: 0 }));
// Past the first walks, with a home picked and walked, so rules 2 to 6 are quiet.
const HOME = { clanPick: { mine: 'woods' } };
const walked = (extra = {}) => ({ ...HOME, walks: { neighborhood: 3, woods: 1, ...extra } });
const allWear = Object.keys(CATALOG.accessories);
// A player with nothing left to be told: every thing to wear owned.
const settled = (fields = {}) => ({ ...walked({ park: 5 }), unlocked: { accessories: allWear, areas: ['neighborhood', 'woods'] }, lifetimePoints: 100, ...fields });

describe('nextThing: one test per rule', () => {
  it('1. a present is waiting', () => {
    const t = nextThing(save(), { present: true });
    expect([t.rule, t.text, t.action]).toEqual([1, 'Tap the present! 🎁', 'present']);
  });

  it('2. no walk has ever been finished', () => {
    const t = nextThing(save());
    expect([t.rule, t.text, t.action]).toEqual([2, 'A friend is waiting outside. Tap Start!', 'start']);
  });

  it('3. the guided walk was left half done', () => {
    const s = save({ ...walked(), tutorial: { first: 'part' } });
    expect(nextThing(s, { guideName: 'Biscuit' })).toMatchObject({ rule: 3, text: 'Biscuit has more to show you. Tap Start!', action: 'start' });
    expect(nextThing(s)).toMatchObject({ rule: 3, text: 'Your friend has more to show you. Tap Start!', action: 'start' });
  });

  it('4. the pick is ready and not made', () => {
    const t = nextThing(save({ walks: { neighborhood: 2 } }));
    expect([t.rule, t.text, t.action]).toEqual([4, 'The wild cats have seen you. Pick your home!', 'pick']);
    // one walk: the pick is not ready
    expect(nextThing(save({ walks: { neighborhood: 1 } })).rule).not.toBe(4);
  });

  it('5. a home is picked, its land is open, and she has never walked there', () => {
    const s = save({ walks: { neighborhood: 2 }, clanPick: { mine: 'woods' }, unlocked: { areas: ['neighborhood', 'woods'] }, area: 'woods' });
    expect(nextThing(s)).toMatchObject({ rule: 5, text: 'Your new home is the Woods. Go and see your camp!', action: 'place', place: 'woods' });
    // every land, after the first pick has opened it
    for (const id of ['woods', 'river', 'moor', 'pines', 'gorge']) {
      const p = createProgression(memStorage({ [KEY]: JSON.stringify({ version: 4, walks: { neighborhood: 2 } }) }));
      p.pickHome(id);
      const t = nextThing(p.state);
      expect([t.rule, t.place], id).toEqual([5, id]);
      p.completeWalk(id);
      expect(nextThing(p.state).rule, id).not.toBe(5);
    }
  });

  it('6. a home is picked and its land is still locked: the nearest open land on the way', () => {
    // picked before picking opened the land (an older build's save)
    const gorge = save({ walks: { neighborhood: 2 }, clanPick: { mine: 'gorge' } });
    // the Gorge needs the Moor, the Moor needs the Woods, the Woods is open
    expect(nextThing(gorge)).toMatchObject({ rule: 6, text: 'The way to your home starts in the Woods.', action: 'place', place: 'woods' });
    const further = save({ walks: { neighborhood: 2, woods: 2 }, clanPick: { mine: 'gorge' }, unlocked: { areas: ['neighborhood', 'woods'] } });
    expect(nextThing(further)).toMatchObject({ rule: 6, text: 'The way to your home starts in the Moor.', place: 'moor' });
  });

  it('7. a new place opens after one more walk here', () => {
    const s = save({ walks: { neighborhood: 1 }, unlocked: { accessories: allWear } });
    expect(nextThing(s)).toMatchObject({ rule: 7, text: 'One more walk here and the Woods opens!', action: null });
    // not when today's walk is somewhere else
    const elsewhere = save({ walks: { neighborhood: 1, park: 0 }, unlocked: { accessories: allWear, areas: ['neighborhood', 'park'] }, area: 'park' });
    expect(nextThing(elsewhere).rule).not.toBe(7);
  });

  it('8. she can pay for something to wear she does not own, cheapest first', () => {
    const s = save({ ...walked(), points: 55 });
    expect(nextThing(s)).toMatchObject({ rule: 8, text: 'You have enough for the Cozy Beanie. Tap Dress up!', action: 'dressup', thing: 'beanie' });
    // owning the beanie: the next cheapest
    const owns = save({ ...walked(), points: 55, unlocked: { accessories: ['bell', 'bandana', 'beanie'] } });
    expect(nextThing(owns)).toMatchObject({ rule: 8, thing: 'socks' });
    // told on three visits already: the line moves on, except on the visit that counted the third
    const told = save({ ...walked(), points: 55, tutorial: { told: { thing: 'beanie', visits: 3 } } });
    expect(nextThing(told).rule).not.toBe(8);
    expect(nextThing(told, { toldNow: 'beanie' }).rule).toBe(8);
    expect(nextThing(save({ ...walked(), points: 55, tutorial: { told: { thing: 'beanie', visits: 2 } } })).rule).toBe(8);
    // a visit prize is never something to pay for
    const all = save({ ...walked(), points: 999, unlocked: { accessories: allWear.filter((id) => !CATALOG.accessories[id].prize) } });
    expect(nextThing(all).rule).not.toBe(8);
  });

  it('9. a cat has been fed 1 to 5 times: the fullest bar first', () => {
    const colony = { cats: [cat('Biscuit'), cat('Mochi', 'park')], feeds: [...feeds('Biscuit', 1), ...feeds('Mochi', 3)] };
    const s = save({ ...settled(), unlocked: { accessories: allWear, areas: ['neighborhood', 'woods', 'park'] }, colony });
    expect(nextThing(s)).toMatchObject({ rule: 9, text: 'Feed Mochi again: 3 of 6.', action: 'place', place: 'park' });
    const one = save({ ...settled(), colony: { cats: [cat('Biscuit')], feeds: feeds('Biscuit', 1) } });
    expect(nextThing(one)).toMatchObject({ rule: 9, text: 'Feed Biscuit again: 1 of 6.', place: 'neighborhood' });
    // fed somewhere she cannot walk today: the line stays, as plain text
    const away = save({ ...settled(), colony: { cats: [cat('Biscuit', 'docks')], feeds: feeds('Biscuit', 2) } });
    expect(nextThing(away)).toMatchObject({ rule: 9, action: null });
  });

  it('10. she is 15 points or fewer short of something to wear', () => {
    const s = save({ ...walked({ park: 5 }), points: 8, lifetimePoints: 100 });
    expect(nextThing(s)).toMatchObject({ rule: 10, text: '12 more 🐾 and the Cozy Beanie is yours.', action: null });
    expect(nextThing(save({ ...walked({ park: 5 }), points: 4, lifetimePoints: 100 })).rule).toBe(12); // 16 short
  });

  it('11. a cat lives in the den and has not been visited today', () => {
    const s = save({ ...settled(), colony: { cats: [cat('Biscuit', 'neighborhood', true)], feeds: feeds('Biscuit', 6) } });
    expect(nextThing(s)).toMatchObject({ rule: 11, text: 'Biscuit is waiting in your den.', action: 'den' });
    expect(nextThing(s, { denVisitedToday: true }).rule).toBe(12);
  });

  it('12. anything else: the next rank', () => {
    expect(nextThing(save(settled()))).toMatchObject({ rule: 12, text: '50 🐾 more to become a Yard Prowler.', action: null });
    // at the last rank there is nothing to count: still exactly one line
    expect(nextThing(save(settled({ lifetimePoints: 99999 })))).toMatchObject({ rule: 12, text: 'Your cat is ready for a walk.', action: null });
  });
});

describe('nextThing: the order', () => {
  it('the first rule that is true wins', () => {
    // Everything true at once, then each rule taken away in turn.
    const tame = cat('Biscuit', 'neighborhood', true);
    const colony = { cats: [tame, cat('Mochi')], feeds: [...feeds('Biscuit', 6), ...feeds('Mochi', 2)] };
    const pick = { clanPick: { mine: 'gorge' } };
    const busy = { walks: { neighborhood: 3, woods: 2, moor: 1 }, unlocked: { areas: ['neighborhood', 'woods', 'moor'] }, area: 'moor', points: 55, lifetimePoints: 100, colony };
    expect(nextThing(save({ colony }), { present: true }).rule).toBe(1);
    expect(nextThing(save({ colony, points: 55 })).rule).toBe(2);
    expect(nextThing(save({ ...busy, tutorial: { first: 'part' } })).rule).toBe(3);
    expect(nextThing(save(busy)).rule).toBe(4);
    expect(nextThing(save({ ...busy, ...pick, unlocked: { areas: ['neighborhood', 'woods', 'moor', 'gorge'] } })).rule).toBe(5);
    expect(nextThing(save({ ...busy, ...pick })).rule).toBe(6);
    const home = { ...busy, ...pick, walks: { ...busy.walks, gorge: 1 }, unlocked: { areas: ['neighborhood', 'woods', 'moor', 'gorge'] } };
    // one more walk on the Moor opens nothing (the Gorge is hers already); on the River the Pines would open
    const river = { ...home, walks: { ...home.walks, river: 1 }, unlocked: { areas: [...home.unlocked.areas, 'river'] }, area: 'river' };
    expect(nextThing(save(river)).rule).toBe(7);
    expect(nextThing(save(home)).rule).toBe(8);
    const dressed = { ...home, unlocked: { ...home.unlocked, accessories: allWear } };
    expect(nextThing(save(dressed)).rule).toBe(9);
    const fedUp = { ...dressed, colony: { cats: [tame], feeds: feeds('Biscuit', 6) } };
    expect(nextThing(save(fedUp)).rule).toBe(11);
    expect(nextThing(save(fedUp), { denVisitedToday: true }).rule).toBe(12);
    // 10 comes before 11
    const short = { ...fedUp, points: 8, unlocked: { ...home.unlocked, accessories: ['bell', 'bandana'] } };
    expect(nextThing(save(short)).rule).toBe(10);
  });

  it('there is always exactly one line', () => {
    for (const s of [save(), save(walked()), save(settled()), null, undefined, {}, { walks: 'x', unlocked: 7, colony: 'no' }]) {
      const t = nextThing(s);
      expect(typeof t.text === 'string' && t.text.length > 0).toBe(true);
      expect(t.rule).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('nextThing: Legacy Edition never shows rules 4 to 6', () => {
  it('7. places that all cost coins are all named: the Park opens the Farm, the Fairground and the Seaside', () => {
    for (const edition of ['canon', 'legacy']) {
      const s = save({ edition, walks: { neighborhood: 3, woods: 1, park: 1 }, unlocked: { accessories: allWear, areas: ['neighborhood', 'woods', 'park'] }, area: 'park', clanPick: { mine: 'woods' } });
      expect(nextThing(s), edition).toMatchObject({ rule: 7, id: 'home.opens-three', text: 'One more walk here opens Appletree Farm, the Fairground and Seaside!', action: null });
      // with the Farm hers already, the other two, in the two-place words
      const hasFarm = save({ edition, walks: { neighborhood: 3, woods: 1, park: 1 }, unlocked: { accessories: allWear, areas: ['neighborhood', 'woods', 'park', 'farm'] }, area: 'park', clanPick: { mine: 'woods' } });
      expect(nextThing(hasFarm), edition).toMatchObject({ rule: 7, id: 'home.opens-two', text: 'One more walk here opens the Fairground and Seaside!' });
      // with the Fairground hers already, the Farm and the Seaside as before
      const hasFair = save({ edition, walks: { neighborhood: 3, woods: 1, park: 1 }, unlocked: { accessories: allWear, areas: ['neighborhood', 'woods', 'park', 'fair'] }, area: 'park', clanPick: { mine: 'woods' } });
      expect(nextThing(hasFair), edition).toMatchObject({ rule: 7, id: 'home.opens-two', text: 'One more walk here opens Appletree Farm and Seaside!' });
      // with both hers, the Seaside alone, in the old words
      const hasBoth = save({ edition, walks: { neighborhood: 3, woods: 1, park: 1 }, unlocked: { accessories: allWear, areas: ['neighborhood', 'woods', 'park', 'farm', 'fair'] }, area: 'park', clanPick: { mine: 'woods' } });
      expect(nextThing(hasBoth), edition).toMatchObject({ rule: 7, id: 'home.opens', text: 'One more walk here and Seaside opens!' });
    }
  });

  it('no pick line, no camp line, no way line', () => {
    const ready = save({ walks: { neighborhood: 2 }, edition: 'legacy', unlocked: { accessories: allWear } });
    expect(nextThing(ready).rule).toBeGreaterThan(6);
    const picked = save({ walks: { neighborhood: 2 }, edition: 'legacy', clanPick: { mine: 'woods' }, unlocked: { accessories: allWear, areas: ['neighborhood', 'woods'] } });
    expect(nextThing(picked).rule).toBeGreaterThan(6);
    const locked = save({ walks: { neighborhood: 2 }, edition: 'legacy', clanPick: { mine: 'gorge' }, unlocked: { accessories: allWear } });
    expect(nextThing(locked).rule).toBeGreaterThan(6);
    // and rule 7 names a Legacy place by its Legacy name, never a hidden one
    const one = save({ walks: { neighborhood: 1 }, edition: 'legacy', unlocked: { accessories: allWear } });
    expect(nextThing(one)).toMatchObject({ rule: 7, text: 'One more walk here and City Park opens!' });
  });

  it('the place names follow the edition', () => {
    const s = (edition) => save({ walks: { neighborhood: 2, woods: 0 }, edition, clanPick: { mine: 'gorge' } });
    expect(nextThing(s('canon')).text).toBe('The way to your home starts in the Woods.');
    // the street's own name is the edition's too
    const street = (edition) => save({ walks: { neighborhood: 2, woods: 0 }, edition, clanPick: { mine: 'woods' }, area: 'neighborhood', unlocked: { accessories: allWear, areas: ['neighborhood', 'park'] } });
    expect(nextThing(street('canon')).text).toBe('Your new home is the Woods. Go and see your camp!');
    expect(PLACE_WORDS.town.length).toBeGreaterThan(0);
  });
});

describe('nextThingHtml', () => {
  it('a line that leads somewhere is a button; one that does not is plain text', () => {
    const tap = nextThingHtml({ rule: 5, pic: '🏡', text: 'Your new home is the Woods. Go and see your camp!', action: 'place', place: 'woods' });
    expect(tap).toContain(`<button type="button" id="hb-next" class="hb-next-line" ${NEXT_ATTR}="place" data-next-place="woods">`);
    expect(tap).toContain('aria-live="polite"');
    expect(tap).toContain('data-next-rule="5"');
    const plain = nextThingHtml({ rule: 12, pic: '🏆', text: '50 🐾 more to become a Yard Prowler.', action: null });
    expect(plain).toContain('<p id="hb-next" class="hb-next-line">');
    expect(plain).not.toContain('<button');
  });

  it('a name is escaped, never markup', () => {
    const out = nextThingHtml({ rule: 9, pic: '🐟', text: 'Feed <img src=x onerror=alert(1)> again: 1 of 6.', action: null });
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;');
    const evil = nextThingHtml({ rule: 5, pic: '"><b>', text: 'x', action: 'place"><script>', place: '"><i>' });
    expect(evil).not.toMatch(/<script|<i>|<b>/);
  });

  it('nothing to say draws nothing', () => {
    expect(nextThingHtml(null)).toBe('');
    expect(nextThingHtml({ text: '' })).toBe('');
  });
});
