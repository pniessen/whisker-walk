import { describe, it, expect, afterEach } from 'vitest';
import {
  BDAY_EVENT, BDAY_AREA, BDAY_START, BRIDGE_FOOT, BRIDGE_ISLAND_END, bdayEndsAt, birthdayActive, setBdaySwitch,
  candlesBlownToday, noteCandlesBlown, birthdayDue, speakerClan, speakerFor, birthdayCatName, bdayCountsWalk, localDay,
} from '../src/birthday.js';
import { createProgression } from '../src/progression.js';
import { nextThing, nextThingHtml } from '../src/ui/nextthing.js';
import { withOffWords } from './helpers/offwords.js';
import { memStorage } from './helpers/walkharness.js';
import { bridgeEnds } from '../src/world/lake.js';
import { phrase } from '../src/clanphrases.js';

// Her birthday (2026-11-21): the start-up half of the Gathering. The event is
// on from the gift code (progression.hasEvent, the birthday-ui branch) or the
// ?bday=1 dev switch, until the end of 2026-11-22 local time; the candles go
// out once a day; the home line points at it.

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h, 0, 0).getTime();
const withEvent = (on = true) => ({ hasEvent: (id) => on && id === BDAY_EVENT });

afterEach(() => setBdaySwitch(null));

describe('the event window', () => {
  it('is on with the gift code until the end of 2026-11-22, local time', () => {
    expect(birthdayActive(withEvent(), at(2026, 11, 21, 15))).toBe(true);
    expect(birthdayActive(withEvent(), at(2026, 11, 22, 23))).toBe(true);
    expect(birthdayActive(withEvent(), new Date(2026, 10, 22, 23, 59, 59).getTime())).toBe(true);
    expect(birthdayActive(withEvent(), bdayEndsAt())).toBe(false);
    expect(birthdayActive(withEvent(), at(2026, 11, 23, 9))).toBe(false);
  });

  it('is off without the code, and with a save that has no hasEvent yet', () => {
    expect(birthdayActive(withEvent(false), at(2026, 11, 21))).toBe(false);
    expect(birthdayActive({}, at(2026, 11, 21))).toBe(false);
    expect(birthdayActive(null, at(2026, 11, 21))).toBe(false);
    expect(birthdayActive({ hasEvent: () => { throw new Error('x'); } }, at(2026, 11, 21))).toBe(false);
  });

  it('the dev switch turns it on without the code, inside the window only', () => {
    setBdaySwitch(true);
    expect(birthdayActive({}, at(2026, 11, 21))).toBe(true);
    expect(birthdayActive({}, at(2026, 11, 23))).toBe(false);
  });
});

describe('the candles, once a day', () => {
  it('a day whose candles are out is not due; the next day is', () => {
    const store = memStorage();
    const p = withEvent();
    expect(birthdayDue(p, { store, now: at(2026, 11, 21, 15) })).toBe(true);
    noteCandlesBlown({ store, now: at(2026, 11, 21, 15) });
    expect(candlesBlownToday({ store, now: at(2026, 11, 21, 20) })).toBe(true);
    expect(birthdayDue(p, { store, now: at(2026, 11, 21, 20) })).toBe(false);
    expect(birthdayDue(p, { store, now: at(2026, 11, 22, 9) })).toBe(true);
    expect(localDay(at(2026, 11, 21, 23))).toBe('2026-11-21');
  });

  it('a store that throws never stops the day', () => {
    const store = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } };
    expect(() => noteCandlesBlown({ store })).not.toThrow();
    expect(birthdayDue(withEvent(), { store, now: at(2026, 11, 21) })).toBe(true);
  });
});

describe('the home line', () => {
  const home = () => {
    const p = createProgression(memStorage());
    p.setTutorialFirst('done');
    p.state.walks.neighborhood = 3;
    return p.state;
  };

  it('says the clans are gathering, and a tap is Explore', () => {
    const t = nextThing(home(), { birthday: true });
    expect(t).toMatchObject({ id: 'bday.home', action: 'start', text: 'The clans are gathering for your birthday! 🎂' });
    expect(nextThingHtml(t)).toContain('data-next="start"');
  });

  it('in plain words in the everyday set', () => {
    withOffWords(() => {
      const t = nextThing(home(), { birthday: true });
      expect(t.text).toBe('Everyone is coming to the island for your birthday! 🎂');
      expect(t.text.toLowerCase()).not.toContain('clan');
    });
  });

  it('is not there without the birthday, and a present still comes first', () => {
    expect(nextThing(home(), {}).id).not.toBe('bday.home');
    expect(nextThing(home(), { birthday: true, present: true }).id).toBe('home.present');
  });
});

describe('who and where', () => {
  it('her own clan speaks; with no clan, the first clan does', () => {
    expect(speakerClan({ clanPick: { mine: 'river' } })).toBe('river');
    expect(speakerFor({ clanPick: { mine: 'river' } })).toMatchObject({ clan: 'river', rank: 'leader' });
    expect(speakerClan({})).toBe('woods');
  });

  it("names the cat she is playing as, never anything else", () => {
    const p = createProgression(memStorage());
    p.state.petName = 'Moonpaw';
    expect(birthdayCatName(p.state)).toBe('Moonpaw');
    p.state.petName = null;
    expect(birthdayCatName(p.state)).toBe('Tabby');
  });

  it('the announcement says her cat’s name in both word sets', () => {
    expect(phrase('bday.announce', 'Moonpaw')).toBe("Cats of all the clans, gather! Today is Moonpaw's birthday!");
    withOffWords(() => {
      const line = phrase('bday.announce', 'Moonpaw');
      expect(line).toContain("Moonpaw's birthday");
      expect(line.toLowerCase()).not.toContain('clan');
    });
  });

  it('starts at the foot of the Pines’ island bridge, on land, facing along it', () => {
    expect(BDAY_AREA).toBe('pines');
    const [islandEnd, foot] = bridgeEnds('pines');
    expect(BRIDGE_FOOT.x).toBeCloseTo(foot.x, 6);
    expect(BRIDGE_FOOT.z).toBeCloseTo(foot.z, 6);
    expect(BRIDGE_ISLAND_END.x).toBeCloseTo(islandEnd.x, 6);
    expect(BRIDGE_ISLAND_END.z).toBeCloseTo(islandEnd.z, 6);
    expect(Math.hypot(BDAY_START.x - foot.x, BDAY_START.z - foot.z)).toBeCloseTo(1.5, 1);
  });

  it('a visit counts as a Pines walk only when the Pines are hers', () => {
    const p = createProgression(memStorage());
    expect(bdayCountsWalk(p.state, 'pines')).toBe(false);
    const before = p.state.walks.pines;
    p.completeWalk('pines', { countArea: false });
    expect(p.state.walks.pines).toBe(before);
    expect(p.state.unlocked.areas).not.toContain('pines');
    p.state.unlocked.areas.push('pines');
    expect(bdayCountsWalk(p.state, 'pines')).toBe(true);
  });
});
