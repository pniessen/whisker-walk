import { describe, it, expect, vi } from 'vitest';
import { createProgression, JOURNAL_TYPES } from '../src/progression.js';
import { CRITTER_INFO, renderJournalHtml } from '../src/journal.js';
import { createDiscoveryLog, AWARDS } from '../src/discoveries.js';
import { bus } from '../src/events.js';
import { discoveryText } from '../src/ui/hud.js';
import { ROOFS_FIND_IDS, ROOFS_JOURNAL_TYPES, roofsPageId, ROOFS_PAGE_WORDS } from '../src/roofspages.js';
import { ROOFS_FIND_WORDS, roofsFindKey, noteRoofsFind } from '../src/world/roofsfinds.js';

const mem = (initial = {}) => {
  const map = new Map(Object.entries(initial));
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), map };
};

const PAGES = {
  garden: ['Rooftop Garden', 'High up, someone grows tomatoes.', 'A garden on the roof! Tomatoes and twinkly lights. 🍅', '🍅'],
  loft: ['Pigeon Loft', 'Where do the pigeons go home at night?', 'The pigeon loft! Coo, coo. One pigeon wants to come with you. 🕊️', '🕊️'],
  vane: ['Top of the Clock Tower', 'Climb as high as a cat can go.', 'The very top! You can see the whole town. 🌇', '🧭'],
  skylight: ['The Attic Window', 'One roof has a warm, glowing window in it.', 'A peek in the attic window. Someone is reading a bedtime story. 📖', '📖'],
  telescope: ['The Telescope', 'Someone looks at the sky from a roof.', 'You look through the telescope. Hello, moon! 🌕', '🌕'],
  chimney: ['Warm Chimney', 'Find a warm spot up high and sit a while.', 'A warm chimney! Puff, a smoke ring. What a cosy spot. 💨', '💨'],
};

describe('the Rooftops journal pages', () => {
  it('six pages after the Fairground\'s, each with its name and hint', () => {
    const ids = ['roofgarden', 'roofloft', 'roofvane', 'roofskylight', 'rooftelescope', 'roofchimney'];
    expect(ROOFS_FIND_IDS).toEqual(['garden', 'loft', 'vane', 'skylight', 'telescope', 'chimney']);
    expect(ROOFS_JOURNAL_TYPES).toEqual(ids);
    const at = JOURNAL_TYPES.indexOf(ids[0]); // by position of its first id, so later areas' pages (appended after) do not move it
    expect(JOURNAL_TYPES.slice(at, at + ids.length)).toEqual(ids);
    expect(ROOFS_FIND_IDS.map(roofsPageId)).toEqual(ids);
    for (const id of ROOFS_FIND_IDS) {
      const [name, hint, line, emoji] = PAGES[id];
      const row = CRITTER_INFO.find((c) => c.id === roofsPageId(id));
      expect(row.name).toBe(name);
      expect(row.hint).toBe(hint);
      expect(row.emoji).toBe(emoji);
      expect(ROOFS_PAGE_WORDS[roofsPageId(id)].name()).toBe(name);
      expect(ROOFS_FIND_WORDS[id]()).toBe(line);
    }
    const html = renderJournalHtml({}, 0, 39);
    for (const id of ROOFS_FIND_IDS) {
      expect(html).toContain(PAGES[id][1]);
      expect(html).not.toContain(PAGES[id][0]);
    }
  });

  it('the first find ever pays 12 and says its line once; a later walk counts the page and says nothing', () => {
    const progression = createProgression(mem());
    const log = createDiscoveryLog(progression);
    log.startWalk();
    const spy = vi.spyOn(bus, 'emit');
    expect(noteRoofsFind('loft', { log, progression })).toEqual({ fresh: true, first: true, points: 12 });
    expect(progression.state.journal.roofloft).toBe(1);
    const ev = spy.mock.calls.filter((c) => c[0] === 'discovery');
    expect(ev).toHaveLength(1);
    expect(ev[0][1].label).toBe(PAGES.loft[2]);
    expect(noteRoofsFind('loft', { log, progression }).fresh).toBe(false);
    expect(progression.state.journal.roofloft).toBe(1);
    expect(progression.state.points).toBe(12);
    log.startWalk();
    spy.mockClear();
    expect(noteRoofsFind('loft', { log, progression })).toEqual({ fresh: true, first: false, points: 0 });
    expect(progression.state.journal.roofloft).toBe(2);
    expect(progression.state.points).toBe(12);
    expect(spy.mock.calls.filter((c) => c[0] === 'discovery')).toHaveLength(0);
    expect(noteRoofsFind('nope', { log, progression }).fresh).toBe(false);
    expect(roofsFindKey('loft')).toBe('roofs-find-loft');
    spy.mockRestore();
  });

  it('an old save without the pages loads with each at 0', () => {
    const raw = JSON.stringify({ version: 1, points: 5, journal: { cardinal: 2, roofvane: '<script>' } });
    const p = createProgression(mem({ 'whisker-walk-save': raw }));
    for (const id of ROOFS_JOURNAL_TYPES) expect(p.state.journal[id] ?? 0).toBe(0);
    expect(p.state.journal.roofvane).toBeUndefined(); // the hostile value is dropped, not kept
    expect(renderJournalHtml(p.state.journal, 0, 39)).not.toContain('<script>');
  });

  it('pays what the Fairground\'s find pays, and the HUD shows its label', () => {
    expect(AWARDS.roofsfind).toBe(AWARDS.fairfind);
    expect(discoveryText({ type: 'roofsfind', label: 'X' })).toBe('X');
  });
});

// ---- Task 4: where the six are found (R3) ----
const { FIND_RULES, findAt } = await import('../src/world/roofsfinds.js');
const { ROOFS_DISCOVERIES, ROOFS_PERCHES, TELESCOPE_CRATE, GARDEN, LEVELS, VANE, ROOFS_GROUND } = await import('../src/world/roofsplan.js');
const { createGround } = await import('../src/ground.js');
describe('where the Rooftops\' six are found', () => {
  const A = ROOFS_DISCOVERIES;
  const crate = ROOFS_PERCHES.find((p) => p.x === TELESCOPE_CRATE.x && p.z === TELESCOPE_CRATE.z);
  const bench = ROOFS_PERCHES.find((p) => p.x === GARDEN.bench.x && p.z === GARDEN.bench.z);
  const ground = createGround(ROOFS_GROUND);
  // where her paws are at each one: on the crate for the telescope (its
  // ground plus the perch's height, as player.js puts a perched cat), and
  // still 2 s at the warm stack
  const at = (id, over = {}) => {
    const a = A[id];
    if (id === 'telescope') return { x: crate.x, y: ground.y(crate.x, crate.z) + crate.y, z: crate.z, perched: crate, still: 0, ...over };
    return { x: a.x, y: a.y, z: a.z, perched: null, still: id === 'chimney' ? 2 : 0, ...over };
  };

  it('the rules are R3\'s table, frozen, one for each find', () => {
    expect(Object.isFrozen(FIND_RULES)).toBe(true);
    expect(Object.keys(FIND_RULES)).toEqual(ROOFS_FIND_IDS);
    expect(FIND_RULES.garden).toMatchObject({ r: 2.6, dy: 0.4 });
    expect(FIND_RULES.loft).toMatchObject({ r: 3.2, dy: 0.4 });
    expect(FIND_RULES.vane).toMatchObject({ r: 1.1, dy: 0.4 });
    expect(FIND_RULES.skylight).toMatchObject({ r: 1.0, dy: 0.3 });
    expect(FIND_RULES.telescope).toMatchObject({ near: 0.05 });
    expect(FIND_RULES.chimney).toMatchObject({ r: 1.0, dy: 0.4, still: 1.5 });
    expect(crate).toBeTruthy();
    expect(ground.y(crate.x, crate.z)).toBeCloseTo(A.telescope.y, 5); // the crate stands on the shop's roof
  });

  it('each discovery is found at its own spot and on its own level, and only there', () => {
    for (const id of ROOFS_FIND_IDS) {
      const s = at(id);
      expect(findAt(A, s), id).toBe(id);
      expect(findAt(A, { ...s, y: s.y - 1 }), `${id} 1 m lower`).toBeNull();
      expect(findAt(A, { ...s, x: s.x + 4, perched: null }), `${id} 4 m away`).toBeNull();
      expect(findAt(A, { ...s, z: s.z - 4, perched: null }), `${id} 4 m away`).toBeNull();
    }
  });

  it('the telescope is found from its crate, not beside it', () => {
    const a = A.telescope;
    expect(findAt(A, { x: a.x, y: a.y, z: a.z, perched: null, still: 5 })).toBeNull();
    expect(findAt(A, at('telescope', { perched: null }))).toBeNull();
    expect(findAt(A, { x: bench.x, y: A.garden.y + bench.y, z: bench.z, perched: bench, still: 0 })).not.toBe('telescope');
    // a stand-in perch at the crate's spot (another session's copy) still counts
    expect(findAt(A, at('telescope', { perched: { ...crate, x: crate.x + 0.04 } }))).toBe('telescope');
    expect(findAt(A, at('telescope', { perched: { ...crate, x: crate.x + 0.06 } }))).toBeNull();
  });

  it('the warm chimney wants her still for 1.5 s', () => {
    expect(findAt(A, at('chimney', { still: 1.4 }))).toBeNull();
    expect(findAt(A, at('chimney', { still: 1.5 }))).toBe('chimney');
    expect(findAt(A, at('chimney', { still: 0 }))).toBeNull();
  });

  it('the vane only on the tower top', () => {
    const a = A.vane;
    const d = Math.hypot(a.x - VANE.x, a.z - VANE.z);
    expect(d).toBeLessThan(1.1);
    expect(findAt(A, { x: VANE.x + 1.2, y: LEVELS.LANTERN, z: VANE.z, perched: null, still: 3 })).toBeNull();
    expect(findAt(A, { x: VANE.x, y: LEVELS.LANTERN, z: VANE.z + 1.2, perched: null, still: 3 })).toBeNull();
  });

  it('the first rule that matches wins, and nothing is found without a spot', () => {
    expect(findAt(A, null)).toBeNull();
    expect(findAt(null, at('loft'))).toBeNull();
    // each find is its own place: no spot gives another's
    for (const id of ROOFS_FIND_IDS) {
      for (const other of ROOFS_FIND_IDS) if (other !== id) expect(findAt(A, at(id))).not.toBe(other);
    }
  });
});
