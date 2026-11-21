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
    expect(JOURNAL_TYPES.slice(-6)).toEqual(ids);
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
