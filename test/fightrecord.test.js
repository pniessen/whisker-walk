import { describe, it, expect, vi } from 'vitest';
import { createFightRecord } from '../src/game/fightrecord.js';
import { createProgression } from '../src/progression.js';
import { castFor } from '../src/clancast.js';
import { unlockToast } from '../src/fightmoves.js';

// Fight moves and scars (Task 8): the only fight code that holds progression.
// It turns the clan fight's onWon / onLost into exactly the allowed save
// writes, and nothing else.

function fakeStorage() {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
}

// The whole save, as JSON, whatever key it lives under.
const saved = (storage) => Object.fromEntries([...storage.map].map(([k, v]) => [k, JSON.parse(v)]));

// The top-level save fields that differ between two snapshots.
function changedFields(a, b) {
  const out = new Set();
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[key] ?? {};
    const y = b[key] ?? {};
    for (const f of new Set([...Object.keys(x), ...Object.keys(y)])) {
      if (JSON.stringify(x[f]) !== JSON.stringify(y[f])) out.add(f);
    }
  }
  return [...out].sort();
}

const CAST_ID = castFor('woods')[0].id;

function setup({ scarKey = 'tabby' } = {}) {
  const storage = fakeStorage();
  const progression = createProgression(storage);
  progression.setPetName('Mittens'); // writes the save once, so a snapshot exists
  const toasts = [];
  const hud = { toast: (t) => toasts.push(t) };
  const setMyScars = vi.fn();
  const setIntruderScars = vi.fn();
  const onScarsChanged = vi.fn();
  const record = createFightRecord({ progression, hud, scarKey, setMyScars, setIntruderScars, onScarsChanged });
  return { storage, progression, toasts, setMyScars, setIntruderScars, onScarsChanged, record };
}

describe('createFightRecord', () => {
  it("losing writes exactly one field: her cat's scars", () => {
    const t = setup();
    const before = saved(t.storage);
    t.record.onLost({ site: 'face' });
    expect(changedFields(before, saved(t.storage))).toEqual(['scars']);
    const scars = t.progression.catScars('tabby');
    expect(scars).toEqual([{ site: 'face', stage: 'full', side: scars[0].side }]);
    expect(t.setMyScars).toHaveBeenCalledTimes(1);
    expect(t.setMyScars).toHaveBeenCalledWith(scars);
    expect(t.onScarsChanged).toHaveBeenCalledTimes(1);
    expect(t.toasts).toEqual([]);
    expect(t.setIntruderScars).not.toHaveBeenCalled();
  });

  it('winning writes exactly fightsWon, fightMoves and scarredIntruders', () => {
    const t = setup();
    t.progression.state.fightsWon = 2; // the next win teaches Rear-up Swat
    const before = saved(t.storage);
    before[Object.keys(before)[0]].fightsWon = 2;
    t.record.onWon({ visit: 7, castId: CAST_ID, site: 'side', together: false });
    expect(changedFields(before, saved(t.storage))).toEqual(['fightMoves', 'fightsWon', 'scarredIntruders']);
    expect(t.progression.state.fightsWon).toBe(3);
    expect(t.setIntruderScars).toHaveBeenCalledTimes(1);
    expect(t.setIntruderScars).toHaveBeenCalledWith(7, t.progression.intruderScars(CAST_ID));
    expect(t.progression.intruderScars(CAST_ID)).toHaveLength(1);
    expect(t.setMyScars).not.toHaveBeenCalled();
    expect(t.onScarsChanged).not.toHaveBeenCalled();
  });

  it('a win with nothing to unlock writes fightsWon (and the scar) only', () => {
    const t = setup();
    const before = saved(t.storage);
    t.record.onWon({ visit: 1, castId: CAST_ID, site: 'hind', together: true });
    expect(changedFields(before, saved(t.storage))).toEqual(['fightsWon', 'scarredIntruders']);
    expect(t.toasts).toEqual([]);
  });

  it('Hagrid or a null site: losing writes nothing', () => {
    for (const [scarKey, site] of [[null, 'face'], ['tabby', null], [null, null]]) {
      const t = setup({ scarKey });
      const before = saved(t.storage);
      t.record.onLost({ site });
      expect(saved(t.storage)).toEqual(before);
      expect(t.setMyScars).not.toHaveBeenCalled();
      expect(t.onScarsChanged).not.toHaveBeenCalled();
    }
  });

  it("Hagrid's win (site null) counts the fight and scars nobody (R6)", () => {
    const t = setup({ scarKey: null });
    const before = saved(t.storage);
    t.record.onWon({ visit: 3, castId: CAST_ID, site: null, together: false });
    expect(changedFields(before, saved(t.storage))).toEqual(['fightsWon']);
    expect(t.setIntruderScars).not.toHaveBeenCalled();
  });

  it('an unlock toasts once with the R5 copy', () => {
    const t = setup();
    t.progression.state.fightsWon = 2;
    t.record.onWon({ visit: 1, castId: CAST_ID, site: 'face', together: false });
    expect(t.toasts).toEqual(['New move: Rear-up Swat! Use it when they raise a paw.']);
    expect(t.toasts[0]).toBe(unlockToast('rearUpSwat'));
    t.record.onWon({ visit: 2, castId: CAST_ID, site: 'face', together: false });
    expect(t.toasts).toHaveLength(1);
  });

  it('a bad cast id scars nothing', () => {
    for (const castId of ['nobody-1', null, 7, '', 'woods-999']) {
      const t = setup();
      const before = saved(t.storage);
      t.record.onWon({ visit: 1, castId, site: 'face', together: false });
      expect(changedFields(before, saved(t.storage))).toEqual(['fightsWon']);
      expect(t.setIntruderScars).not.toHaveBeenCalled();
    }
  });

  it('never throws on a missing payload', () => {
    const t = setup();
    expect(() => t.record.onLost()).not.toThrow();
    expect(() => t.record.onWon()).not.toThrow();
  });
});
