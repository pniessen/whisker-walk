import { describe, it, expect } from 'vitest';
import { cardHtml, createUnlockCelebration } from '../src/game/celebrate.js';
import { SKILLS, unlockedSkills } from '../src/skills.js';
import { createProgression } from '../src/progression.js';

// There is no jsdom in this project (see the plan's agent notes), so the DOM
// side is driven against a minimal element stand-in rather than a real
// document. That is enough to pin what actually matters here: the queue
// behaviour, and the fact that nothing reaches innerHTML unescaped.
function fakeMount() {
  const created = [];
  const doc = {
    createElement() {
      const el = {
        className: '', innerHTML: '', classes: [], removed: false,
        classList: { add: (c) => el.classes.push(c) },
        remove() { el.removed = true; mount.children = mount.children.filter((c) => c !== el); },
      };
      created.push(el);
      return el;
    },
  };
  const mount = {
    ownerDocument: doc,
    children: [],
    created,
    appendChild(el) { mount.children.push(el); },
  };
  return mount;
}

// Hand-rolled timer queue: run() fires everything due at or before `ms`.
function fakeTimers() {
  let now = 0;
  let nextId = 1;
  const pending = new Map();
  return {
    setTimer(fn, delay) {
      const id = nextId++;
      pending.set(id, { at: now + delay, fn });
      return id;
    },
    clearTimer(id) { pending.delete(id); },
    advance(ms) {
      now += ms;
      for (const [id, t] of [...pending].sort((a, b) => a[1].at - b[1].at)) {
        if (t.at <= now) {
          pending.delete(id);
          t.fn();
        }
      }
    },
    get count() { return pending.size; },
  };
}

const SKILL = SKILLS.find((s) => s.id === 'whisker-sense');

describe('cardHtml', () => {
  it('names the ability and shows its effect and completed feat', () => {
    const html = cardHtml(SKILL);
    expect(html).toContain(SKILL.name);
    expect(html).toContain(SKILL.effect);
    expect(html).toContain(SKILL.feat);
    expect(html).toContain('NEW ABILITY UNLOCKED');
  });

  it('renders every catalog entry without throwing', () => {
    for (const s of SKILLS) expect(cardHtml(s)).toContain(s.name);
  });

  it('escapes the name, effect and feat rather than interpolating them raw', () => {
    const html = cardHtml({
      name: '<img src=x onerror=alert(1)>',
      effect: '"quoted" & <b>bold</b>',
      feat: "it's <script>",
    });
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;img');
    expect(html).toContain('&amp;');
    expect(html).toContain('&#39;');
  });

  it('degrades to a generic name rather than printing undefined', () => {
    const html = cardHtml(null);
    expect(html).toContain('New ability');
    expect(html).not.toContain('undefined');
  });
});

describe('createUnlockCelebration', () => {
  it('mounts one card and tears it down again on its own', () => {
    const mount = fakeMount();
    const timers = fakeTimers();
    const c = createUnlockCelebration(mount, timers);
    c.show(SKILL);
    expect(mount.children).toHaveLength(1);
    expect(mount.children[0].className).toBe('skill-unlock');
    expect(mount.children[0].innerHTML).toContain(SKILL.name);
    timers.advance(3700);                 // hold elapsed → fade class
    expect(mount.created[0].classes).toContain('fade');
    timers.advance(1000);                 // fade elapsed → removed
    expect(mount.children).toHaveLength(0);
    expect(c.pending).toBe(0);
  });

  it('queues a second unlock instead of clobbering the first mid-read', () => {
    const mount = fakeMount();
    const timers = fakeTimers();
    const c = createUnlockCelebration(mount, timers);
    const [a, b] = SKILLS;
    c.show(a);
    c.show(b);
    expect(mount.children).toHaveLength(1);           // one at a time
    expect(mount.children[0].innerHTML).toContain(a.name);
    expect(c.pending).toBe(2);
    timers.advance(4400);
    expect(mount.children).toHaveLength(1);
    expect(mount.children[0].innerHTML).toContain(b.name);
    timers.advance(4400);
    expect(mount.children).toHaveLength(0);
  });

  it('ignores a null skill rather than mounting an empty card', () => {
    const mount = fakeMount();
    const c = createUnlockCelebration(mount, fakeTimers());
    c.show(null);
    c.show(undefined);
    expect(mount.children).toHaveLength(0);
    expect(c.pending).toBe(0);
  });

  it('dispose drops the queue, the card and every pending timer', () => {
    const mount = fakeMount();
    const timers = fakeTimers();
    const c = createUnlockCelebration(mount, timers);
    c.show(SKILLS[0]);
    c.show(SKILLS[1]);
    expect(timers.count).toBeGreaterThan(0);
    c.dispose();
    expect(mount.children).toHaveLength(0);
    expect(timers.count).toBe(0);
    expect(c.pending).toBe(0);
  });
});

// ===========================================================================
// v18 Task 2.7 — the single-fire contract.
//
// walk.js's celebrateNewSkills cannot be imported (walk.js pulls in THREE and
// all four world builders), but its one interesting line can be, and that
// line IS the whole mechanism: it celebrates exactly what
// progression.recordSkillUnlocks(unlockedSkills(state)) returns. So that
// expression is driven here against the real progression and skills modules,
// with the card queue hung off it — as close to the running game as this
// suite can get without a browser.
// ===========================================================================
describe('unlock celebration single-fire contract', () => {
  function fakeStorage() {
    const map = new Map();
    return {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, String(v)),
    };
  }

  // Exactly walk.js's celebrateNewSkills body, minus the fx burst and the
  // fanfare (neither of which can double-fire independently of `added`).
  function celebrate(progression, cards) {
    const added = progression.recordSkillUnlocks(unlockedSkills(progression.state));
    for (const id of added) cards.push(id);
    return added;
  }

  it('fires once for an ability, and not again on any later check that walk', () => {
    const progression = createProgression(fakeStorage());
    const cards = [];
    // Whisker Sense: find 3 golden mice. Two in, nothing yet.
    progression.recordGolden('gm-park-1');
    progression.recordGolden('gm-park-2');
    expect(celebrate(progression, cards)).toEqual([]);
    // The third completes the feat.
    progression.recordGolden('gm-park-3');
    expect(celebrate(progression, cards)).toContain('whisker-sense');
    expect(cards).toEqual(['whisker-sense']);
    // Every subsequent discovery this walk re-checks. None may re-fire.
    for (let i = 0; i < 10; i++) expect(celebrate(progression, cards)).toEqual([]);
    expect(cards).toEqual(['whisker-sense']);
  });

  it('endWalk\'s own check cannot double-fire what already celebrated mid-walk', () => {
    const progression = createProgression(fakeStorage());
    const cards = [];
    for (const id of ['gm-park-1', 'gm-park-2', 'gm-park-3']) progression.recordGolden(id);
    celebrate(progression, cards);          // mid-walk, off the discovery bus
    celebrate(progression, cards);          // endWalk, same helper
    expect(cards).toEqual(['whisker-sense']);
  });

  it('persists exactly once, and never celebrates again on the next walk', () => {
    const storage = fakeStorage();
    const cards = [];
    const first = createProgression(storage);
    for (const id of ['gm-park-1', 'gm-park-2', 'gm-park-3']) first.recordGolden(id);
    celebrate(first, cards);
    expect(first.state.skills).toContain('whisker-sense');
    // A fresh session loading the same save: the ability is already earned,
    // so the very first check of the next walk must stay silent.
    const next = createProgression(storage);
    expect(next.state.skills).toContain('whisker-sense');
    expect(celebrate(next, cards)).toEqual([]);
    expect(cards).toEqual(['whisker-sense']);
  });

  it('fires once per ability when two complete on the same check', () => {
    const progression = createProgression(fakeStorage());
    const cards = [];
    // Sure Claws at 25 tip-overs and Big Swat at 40 both read feats.mischief;
    // jumping the tally past both lands them together.
    for (let i = 0; i < 40; i++) progression.recordFeat('mischief');
    const added = celebrate(progression, cards);
    expect(added).toContain('sure-claws');
    expect(added).toContain('big-swat');
    expect(cards).toHaveLength(new Set(cards).size); // no duplicates
    expect(celebrate(progression, cards)).toEqual([]);
  });

  it('queues one card per newly unlocked ability, in order, one at a time', () => {
    const progression = createProgression(fakeStorage());
    const mount = fakeMount();
    const timers = fakeTimers();
    const c = createUnlockCelebration(mount, timers);
    for (let i = 0; i < 40; i++) progression.recordFeat('mischief');
    const byId = new Map(SKILLS.map((s) => [s.id, s]));
    const added = progression.recordSkillUnlocks(unlockedSkills(progression.state));
    for (const id of added) c.show(byId.get(id));
    expect(added.length).toBeGreaterThanOrEqual(2);
    expect(c.pending).toBe(added.length);
    expect(mount.children).toHaveLength(1);
    expect(mount.children[0].innerHTML).toContain(byId.get(added[0]).name);
    timers.advance(4400);
    expect(mount.children[0].innerHTML).toContain(byId.get(added[1]).name);
  });

  it('a save that has earned nothing produces no card at all', () => {
    const progression = createProgression(fakeStorage());
    const cards = [];
    for (let i = 0; i < 20; i++) expect(celebrate(progression, cards)).toEqual([]);
    expect(cards).toEqual([]);
    expect(progression.state.skills).toEqual([]);
  });
});
