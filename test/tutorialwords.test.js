// The word table of the guided first walk, the hints, the goals' "how" lines
// and the home line (design: .claude/plans/guided-first-walk-design.md).
import { describe, it, expect } from 'vitest';
import { WORDS, SLOTS, line, bothForms, hasLine } from '../src/tutorialwords.js';
import { GOAL_POOL } from '../src/goals.js';
import { HINT_IDS } from '../src/hints.js';

const forms = Object.entries(WORDS).flatMap(([id, w]) => [[id, 'touch', w.touch], [id, 'keys', w.keys]]);
// Words that would only make sense with the book-series wording on.
const SERIES = ['clan', 'warrior', 'kit', 'apprentice', 'kittypet', 'twoleg', 'patrol', 'loner', 'rogue'];

describe('tutorialwords', () => {
  it('every line has a touch form and a keyboard form', () => {
    for (const [id, w] of Object.entries(WORDS)) {
      expect(Object.keys(w).sort(), id).toEqual(['keys', 'touch']);
      expect(typeof w.touch === 'string' && w.touch.length > 0, id).toBe(true);
      expect(typeof w.keys === 'string' && w.keys.length > 0, id).toBe(true);
    }
  });

  // The design asks for at most nine words. Several of its own lines are two
  // short sentences ("You can swim! Walk to the bank to climb out."), so the
  // nine is counted per sentence; the 60 letters are for the whole line.
  it('no sentence is over nine words and no line is over 60 letters', () => {
    for (const [id, form, text] of forms) {
      expect(text.length, `${id} (${form})`).toBeLessThanOrEqual(60);
      for (const sentence of text.split(/[.!?:]+/).map((s) => s.trim()).filter(Boolean)) {
        expect(sentence.split(/\s+/).length, `${id} (${form}): "${sentence}"`).toBeLessThanOrEqual(9);
      }
    }
  });

  it('no line uses a book-series word', () => {
    for (const [id, form, text] of forms) {
      const words = text.toLowerCase().split(/[^a-z]+/);
      for (const w of SERIES) expect(words.includes(w) || words.includes(`${w}s`), `${id} (${form}): ${w}`).toBe(false);
    }
  });

  it('no touch form says left or right, and none names a key', () => {
    for (const [id, w] of Object.entries(WORDS)) {
      expect(/\b(left|right)\b/i.test(w.touch), id).toBe(false);
      expect(/\b(left|right)\b/i.test(w.keys), id).toBe(false);
      expect(/\bPress\b|\bShift\b|\bSpace\b|\bEsc\b|\bEnter\b|\bthe mouse\b|\bClick\b/.test(w.touch), id).toBe(false);
    }
  });

  it('every {slot} is one the code fills', () => {
    for (const [id, form, text] of forms) {
      for (const m of text.matchAll(/\{(\w+)\}/g)) expect(SLOTS, `${id} (${form})`).toContain(m[1]);
    }
  });

  it('line() picks the form and fills the slots, as plain text', () => {
    expect(line('hint.jump', { touch: true })).toBe('Tap the paw to jump up.');
    expect(line('hint.jump', { touch: false })).toBe('Press Space to jump up.');
    expect(line('hint.creep', { touch: false, name: 'Biscuit' })).toBe('Biscuit is shy. Hold Shift to creep.');
    expect(line('home.feed', { name: 'Biscuit', n: 1 })).toBe('Feed Biscuit again: 1 of 6.');
    // a name is never markup here: the caller sets it as text
    expect(line('guide.go', { name: '<b>x</b>' })).toBe('Walk to <b>x</b>.');
    expect(line('nope')).toBe('');
    expect(line('__proto__')).toBe('');
    expect(hasLine('toString')).toBe(false);
    expect(bothForms('how.collect')).toEqual({ touch: 'Find something shiny. Tap the button.', keys: 'Find something shiny. Press E.' });
  });

  it('the yarn lines (controls review, 2026-11-19) name no button and no key', () => {
    expect(line('how.yarn-play', { touch: true, place: 'by the playground bench' })).toBe('The yarn ball is by the playground bench. Bat it 4 times.');
    expect(line('hint.yarn', { touch: true })).toBe('A yarn ball! Run into it to bat it.');
    expect(line('hint.yarn-carry', { touch: false })).toBe('Put it down to play.');
    expect(line('hint.tkey', { touch: false })).toBe('Yarn balls lie around now. Find one! 🧶');
    for (const id of ['how.yarn-play', 'hint.yarn', 'hint.bat', 'hint.yarn-carry', 'hint.tkey']) {
      for (const touch of [true, false]) expect(line(id, { touch })).not.toMatch(/🧶\.|Tap 🧶|Press T/);
    }
  });

  it('the start hint is the design\'s and says no side', () => {
    expect(line('start.touch', { touch: true })).toBe('Push the circle to walk. Drag to look around.');
  });

  it('every hint and every goal has its line', () => {
    for (const id of HINT_IDS) expect(hasLine(`hint.${id}`), id).toBe(true);
    for (const g of GOAL_POOL) {
      expect(g.how, g.id).toBe(`how.${g.id}`);
      expect(hasLine(g.how), g.id).toBe(true);
    }
  });

  // The design's rewritten-goals table (section 5), word for word.
  it('the goals have the design\'s titles and how lines', () => {
    const want = {
      'spot-critters': ['Spot 4 animals', 'Walk near a bird, a mouse or a squirrel.', 'Walk near a bird, a mouse or a squirrel.'],
      collect: ['Pick up 2 treasures', 'Find something shiny. Tap the button.', 'Find something shiny. Press E.'],
      'tip-things': ['Knock 3 things over', 'Walk up to a pot or a bin. Tap the button.', 'Walk up to a pot or a bin. Press E.'],
      'greet-cats': ['Say hello to 3 cats', 'Walk up to a cat. Tap the button.', 'Walk up to a cat. Press E.'],
      'take-photos': ['Take 2 photos', 'Tap 📷. Point at an animal. Tap the screen.', 'Press C. Point at an animal. Click.'],
      'get-scratches': ['Get a head scratch', 'Find a person. Tap the button.', 'Find a person. Press E.'],
      // controls review, 2026-11-19: the yarn lies around to find; {place} is the day's spot
      'yarn-play': ['Play with a yarn ball', 'The yarn ball is . Bat it 4 times.', 'The yarn ball is . Bat it 4 times.'],
      'dig-treasure': ['Dig up a treasure', 'Stand still to sniff. Follow the paw prints. Dig!', 'Stand still to sniff. Follow the paw prints. Dig!'],
      'box-sit': ['Sit in a box', 'Walk into a cardboard box and stop.', 'Walk into a cardboard box and stop.'],
      'scenic-spots': ['Visit 2 special places', 'Go to a ☆ on the map.', 'Go to a ☆ on the map.'],
      'pounce-play': ['Pounce on 2 animals', 'Creep close. Then tap the paw.', 'Hold Shift to creep close. Then press Space.'],
    };
    expect(GOAL_POOL.map((g) => g.id)).toEqual(Object.keys(want));
    for (const g of GOAL_POOL) {
      expect([g.text, line(g.how, { touch: true }), line(g.how, { touch: false })], g.id).toEqual(want[g.id]);
    }
  });

  it('the find, find-kept and map hints say the agreed words', () => {
    expect(line('hint.find')).toBe('Something is twinkling! Go and see. ✨');
    expect(line('hint.find-kept')).toBe('It\'s yours to keep! Change clothes in Dress up.');
    expect(line('hint.map', { touch: true })).toBe('Tap a place to see it. Pinch to zoom.');
    expect(line('hint.map')).toBe('Click a place to see it. Scroll to zoom.');
  });
});
