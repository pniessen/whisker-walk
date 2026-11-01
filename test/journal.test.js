import { describe, it, expect } from 'vitest';
import { CRITTER_INFO, renderJournalHtml } from '../src/journal.js';
import { JOURNAL_TYPES } from '../src/progression.js';

describe('CRITTER_INFO', () => {
  it('has all 13 journal critter types with kid-friendly entries', () => {
    expect(CRITTER_INFO).toHaveLength(13);
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

  it('renders an unspotted entry as ❓ + hint, not its name', () => {
    const bird = CRITTER_INFO.find((c) => c.id === 'bird');
    const html = renderJournalHtml({}, 0, 9);
    expect(html).toContain('❓');
    expect(html).toContain(bird.hint);
    expect(html).not.toContain(bird.name);
  });

  it('renders the golden mice footer as found/total', () => {
    const html = renderJournalHtml({}, 2, 9);
    expect(html).toContain('🥇');
    expect(html).toContain('2/9');
  });

  it('treats a hostile non-numeric count as unspotted (coerced to 0)', () => {
    const bird = CRITTER_INFO.find((c) => c.id === 'bird');
    const html = renderJournalHtml({ bird: '<script>' }, 0, 9);
    expect(html).toContain('❓');
    expect(html).toContain(bird.hint);
    expect(html).not.toContain(bird.name);
    expect(html).not.toContain('<script>');
  });
});
