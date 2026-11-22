// toast-verbs (2026-11-22): a discovery toast leads with words that fit the
// event ("You pulled off a gravity check"), not "You spotted" for everything.
// The leads are plain words, the same in both editions; the clan flavour
// comes only from the label a caller builds with phrase().
import { describe, it, expect } from 'vitest';
import { discoveryText } from '../src/ui/hud.js';
import { phrase } from '../src/clanphrases.js';
import { withOffWords } from './helpers/offwords.js';

const say = (type, label, repeat = false) => discoveryText({ type, label, repeat });

const FIRST = [
  ['mischief', 'a gravity check 🐾', 'You pulled off a gravity check 🐾'],
  ['mischief', 'the cup go over the edge 😼', 'You made the cup go over the edge 😼'],
  ['mischief', 'a gnome bowled over 🧙', 'A gnome bowled over 🧙'],
  ['sits', 'a perfect box fit 📦', 'You nailed a perfect box fit 📦'],
  ['groom', 'mutual grooming with Mochi 🫧', 'You shared mutual grooming with Mochi 🫧'],
  ['duet', 'a harmonized duet with Mochi 🎶', 'You sang a harmonized duet with Mochi 🎶'],
  ['perk', 'a joyful puddle splash', 'You had a joyful puddle splash'],
  ['perk', 'a mid-air catch!', 'You made a mid-air catch!'],
  ['rainbow', 'a rainbow after the rain! 🌈', 'You saw a rainbow after the rain! 🌈'],
  ['legend', 'a GOLDEN MOUSE! 🥇', 'You found a GOLDEN MOUSE! 🥇'],
  ['legend', 'a REAL unicorn?!', 'You spotted a REAL unicorn?!'],
  ['friend', 'a new cat friend', 'You made a new cat friend'],
  ['friend', 'Mochi 👻 visited', 'Mochi 👻 visited'],
  ['boop', 'a nose boop with Mochi 💕', 'You shared a nose boop with Mochi 💕'],
  ['tag', 'tag with Mochi! 🏃', 'You played tag with Mochi! 🏃'],
  ['rally', 'yarn rally x3! 🧶', 'Yarn rally x3! 🧶'],
  ['nappile', 'nap pile of 3! 😴', 'Nap pile of 3! 😴'],
  ['pet', 'a nuzzle from Mochi', 'You got a nuzzle from Mochi'],
  ['gift', 'Mochi brought you a gift! 🎁', 'Mochi brought you a gift! 🎁'],
  ['gift', 'a gift tucked away at the fountain', 'You left a gift tucked away at the fountain'],
  ['photo', 'your first photo of a daisy', 'You took your first photo of a daisy'],
  ['play', 'a very good play session', 'You had a very good play session'],
  ['treasure', 'a buried treasure!', 'You found a buried treasure!'],
  ['collectible', 'a speckled feather', null],
  ['scenic', 'the fountain', null],
  ['critter', 'a songbird', 'You spotted a songbird'],
  ['moment', 'a squirrel running off with an apple!', 'You spotted a squirrel running off with an apple!'],
  ['secret', 'a sneaky garden gnome', 'You spotted a sneaky garden gnome'],
];

describe('discovery leads fit the event', () => {
  for (const [type, label, want] of FIRST) {
    it(`${type}: ${label}`, () => {
      const got = say(type, label);
      if (want) expect(got).toBe(want);
      expect(got).toContain(label.slice(1));
      expect(say(type, label)).toBe(got); // stable, no randomness
    });
  }
  it('collectibles and views rotate between two leads by label, stably', () => {
    expect(say('collectible', 'a speckled feather')).toMatch(/^You (found|came across) a speckled feather$/);
    expect(say('scenic', 'the fountain')).toMatch(/^(You found a view|Nice view): the fountain$/);
    const leads = new Set(['a lucky horseshoe', 'a little brass bell', 'a red clown nose', 'a silver whistle'].map((l) => say('collectible', l).slice(0, 8)));
    expect(leads.size).toBe(2);
  });
  it('no event but a real sighting says "spotted" for the old catch-alls', () => {
    for (const [type, label] of FIRST.filter(([t]) => ['mischief', 'sits', 'groom', 'duet', 'rainbow', 'friend', 'boop', 'tag'].includes(t))) {
      expect(say(type, label)).not.toMatch(/^You spotted/);
    }
  });
  it('repeats still read "Again — <label>" for every type', () => {
    for (const [type, label] of FIRST) expect(say(type, label, true)).toBe(`Again — ${label}`);
  });
});

describe('both editions', () => {
  const touch = (name) => `a nose touch with ${name}`;
  it('the clan labels take the same leads', () => {
    expect(say('patrol', phrase('patrol.award', 'Conkerbelly'))).toBe('You went on a patrol with Conkerbelly');
    expect(say('friend', touch('Conkerbelly'))).toBe('You shared a nose touch with Conkerbelly');
  });
  it('the everyday labels take them too', () => {
    withOffWords(() => {
      const label = phrase('patrol.award', 'Conker');
      expect(say('patrol', label)).toBe(`You went on ${label}`);
      expect(say('patrol', label, true)).toBe(`Again — ${label}`);
    });
  });
});
