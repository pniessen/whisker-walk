import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CRITTER_INFO, renderJournalHtml } from '../src/journal.js';
import { JOURNAL_TYPES } from '../src/progression.js';

// the pages a child sees today: the Moon's twelve are drawn only behind ?moon=1 (src/moonpages.js)
const SHOWN = CRITTER_INFO.filter((c) => !c.moon && !c.greenhouse && !c.reef && !c.crystal);

describe('CRITTER_INFO', () => {
  it('has all 146 journal pages with kid-friendly entries', () => {
    expect(CRITTER_INFO).toHaveLength(146); // (the Moon's six robot-and-light pages on top) (the Crystal Cave's seven life pages on top) (the Reef's ten sea-life pages on top) 14 critters, Appletree Farm's six animals, its four jobs and six finds, the Fairground's five rides, three games and six finds, the Rooftops' six finds, the Market Square's six finds, and Lighthouse Point's six finds and two jobs, the Moon's twelve, the Greenhouse's eight and the Reef's twelve (the last three only behind their flags; the Lighthouse's shown only behind ?lighthouse=1 or once one has a count)
    for (const entry of CRITTER_INFO) {
      expect(typeof entry.id).toBe('string');
      expect(typeof entry.emoji).toBe('string');
      expect(typeof entry.name).toBe('string');
      expect(typeof entry.hint).toBe('string');
    }
  });

  it('every journal type has an entry, and the rabbit\'s is the Moor Rabbit', () => {
    for (const id of JOURNAL_TYPES) expect(CRITTER_INFO.find((c) => c.id === id)).toBeTruthy();
    expect(CRITTER_INFO.find((c) => c.id === 'rabbit')).toEqual(
      { id: 'rabbit', emoji: '🐇', name: 'Moor Rabbit', hint: 'Watch it bolt for its burrow!' });
  });

  it('the frog\'s entry is the Bog Frog', () => {
    expect(CRITTER_INFO.find((c) => c.id === 'frog')).toEqual(
      { id: 'frog', emoji: '🐸', name: 'Bog Frog', hint: 'Creep up softly, or it plops into the bog!' });
  });

  it('the goat\'s entry is the Mountain Goat', () => {
    expect(CRITTER_INFO.find((c) => c.id === 'goat')).toEqual(
      { id: 'goat', emoji: '🐐', name: 'Mountain Goat', hint: 'It never lets you close — watch it leap along the rim!' });
  });

  it('ids exactly match progression.js JOURNAL_TYPES (no typo drift)', () => {
    expect(CRITTER_INFO.map((c) => c.id).sort()).toEqual([...JOURNAL_TYPES].sort());
  });
});

describe('renderJournalHtml', () => {
  it('renders a spotted entry as emoji + name + count', () => {
    const mouse = CRITTER_INFO.find((c) => c.id === 'mouse');
    const html = renderJournalHtml({ mouse: 3 }, 0, 9);
    expect(html).toContain(mouse.emoji);
    expect(html).toContain(mouse.name);
    expect(html).toContain('×3');
  });

  it('renders an unspotted entry as its own dark silhouette + hint, not its name', () => {
    const bird = CRITTER_INFO.find((c) => c.id === 'bird');
    const html = renderJournalHtml({}, 0, 9);
    expect(html).not.toContain('❓');
    expect(html).toContain(`<span class="journal-emoji silhouette" aria-hidden="true">${bird.emoji}</span>`);
    expect(html).toContain('aria-label="Not found yet"');
    expect(html).toContain(bird.hint);
    expect(html).not.toContain(bird.name);
    // every one of the unspotted cards gets a silhouette, none a name
    expect(html.match(/journal-emoji silhouette/g)).toHaveLength(SHOWN.length); // Lighthouse Point's eight are in the game since milestone 4; the Moon's twelve only behind ?moon=1
    for (const c of SHOWN) expect(html).not.toContain(c.name);
  });

  it('a spotted entry is never a silhouette', () => {
    const html = renderJournalHtml({ bird: 2 }, 0, 9);
    const bird = CRITTER_INFO.find((c) => c.id === 'bird');
    expect(html).toContain(`<span class="journal-emoji">${bird.emoji}</span>`);
    expect(html.match(/journal-emoji silhouette/g)).toHaveLength(SHOWN.length - 1);
  });

  it('Lighthouse Point\'s eight pages are in the journal like any place\'s, flag or none (milestone 4)', async () => {
    const { setLighthouse } = await import('../src/lighthouseflag.js');
    const ids = CRITTER_INFO.filter((c) => c.lighthouse).map((c) => c.id);
    expect(ids).toEqual(['lhlamproom', 'lhpool', 'lhgull', 'lhecho', 'lhbell', 'lhwindow', 'lhjobkitten', 'lhjoblamp']);
    try {
      for (const flag of [false, true]) {
        setLighthouse(flag);
        const html = renderJournalHtml({}, 0, 9);
        for (const id of ids) expect(html).toContain(CRITTER_INFO.find((c) => c.id === id).hint);
        expect(html.match(/journal-emoji silhouette/g)).toHaveLength(SHOWN.length);
      }
      setLighthouse(false);
      expect(renderJournalHtml({ lhbell: 1 }, 0, 9)).toContain('The Fog Bell');
    } finally {
      setLighthouse(null);
    }
  });

  it('the Moon\'s twelve pages are drawn only behind ?moon=1, and are journal types either way', async () => {
    const { setMoon } = await import('../src/moonflag.js');
    const { JOURNAL_TYPES } = await import('../src/progression.js');
    const moon = CRITTER_INFO.filter((c) => c.moon);
    expect(moon.map((c) => c.id)).toEqual(['mnflag', 'mnecho', 'mndust', 'mncheese', 'mndish', 'mngarden', 'mnstory', 'mnrover', 'mnlaunch', 'mnscope', 'mnjump', 'mnjob', 'mldrone', 'mlcleaner', 'mlconvoy', 'mlmoth', 'mlpixel', 'mlmoonling']);
    for (const c of moon) expect(JOURNAL_TYPES).toContain(c.id);
    try {
      setMoon(false);
      expect(renderJournalHtml({ mnstory: 1 }, 0, 9)).not.toContain('Hello, Earth!');
      setMoon(true);
      expect(renderJournalHtml({ mnstory: 1 }, 0, 9)).toContain('Hello, Earth!');
      expect(renderJournalHtml({}, 0, 9).match(/journal-emoji silhouette/g)).toHaveLength(CRITTER_INFO.filter((c) => !c.greenhouse && !c.reef && !c.crystal).length);
    } finally {
      setMoon(null);
    }
  });

  it('renders the golden mice footer as found/total', () => {
    const html = renderJournalHtml({}, 2, 9);
    expect(html).toContain('🥇');
    expect(html).toContain('2/9');
  });

  it('treats a hostile non-numeric count as unspotted (coerced to 0)', () => {
    const bird = CRITTER_INFO.find((c) => c.id === 'bird');
    const html = renderJournalHtml({ bird: '<script>' }, 0, 9);
    expect(html).toContain(`<span class="journal-emoji silhouette" aria-hidden="true">${bird.emoji}</span>`);
    expect(html).toContain(bird.hint);
    expect(html).not.toContain(bird.name);
    expect(html).not.toContain('<script>');
  });
});

describe('the intruders line (Clan Life Part 2)', () => {
  it('shows with a finite chasedOff, and not without', () => {
    expect(renderJournalHtml({}, 1, 3, { chasedOff: 3 })).toContain('🛡️ Intruders chased off: 3');
    expect(renderJournalHtml({}, 1, 3)).not.toContain('Intruders chased off');
    expect(renderJournalHtml({}, 1, 3, {})).not.toContain('Intruders chased off');
  });
  it('a hostile value renders 0', () => {
    expect(renderJournalHtml({}, 1, 3, { chasedOff: '<b>9</b>' })).not.toContain('<b>');
    expect(renderJournalHtml({}, 1, 3, { chasedOff: NaN })).toContain('🛡️ Intruders chased off: 0');
    expect(renderJournalHtml({}, 1, 3, { chasedOff: -4 })).toContain('🛡️ Intruders chased off: 0');
    expect(renderJournalHtml({}, 1, 3, { chasedOff: Infinity })).toContain('🛡️ Intruders chased off: 0');
    expect(renderJournalHtml({}, 1, 3, { chasedOff: '<b>9</b>' })).toContain('🛡️ Intruders chased off: 0');
    expect(renderJournalHtml({}, 1, 3, { chasedOff: 2.7 })).toContain('🛡️ Intruders chased off: 2');
  });
  it('homebase passes the feat tally, in Clan Edition only', () => {
    const src = readFileSync(new URL('../src/ui/homebase.js', import.meta.url), 'utf8');
    expect(src).toContain('isClanEdition(progression.state) ? { chasedOff: s.feats?.intruder ?? 0 } : {}');
  });
});

describe('the villager card art', () => {
  const art = () => CRITTER_INFO.find((c) => c.id === 'villager').art;

  it('the villager is drawn as a Twoleg', () => {
    expect(art().startsWith('<svg')).toBe(true);
    expect(art()).toContain('viewBox');
    expect(art()).toContain('aria-hidden="true"');
    expect(art().match(/<(path|rect|circle|ellipse|polygon)\b/g).length).toBeGreaterThanOrEqual(7);
    expect(art()).not.toMatch(/<script|<text|\bid=|href/);
  });

  it('the villager card renders the art, spotted and not', () => {
    const cold = renderJournalHtml({ villager: 0 }, 0, 9);
    expect(cold).toContain(`<span class="journal-emoji silhouette" aria-hidden="true">${art()}</span>`);
    expect(cold).not.toContain('🧑');
    const warm = renderJournalHtml({ villager: 2 }, 0, 9);
    expect(warm).toContain(`<span class="journal-emoji">${art()}</span>`);
    expect(warm).toContain('×2');
    expect(warm).not.toContain('🧑');
  });
});
