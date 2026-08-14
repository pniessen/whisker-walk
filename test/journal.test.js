import { describe, it, expect } from 'vitest';
import { CRITTER_INFO, renderJournalHtml } from '../src/journal.js';

describe('CRITTER_INFO', () => {
  it('has all 10 journal critter types with kid-friendly entries', () => {
    expect(CRITTER_INFO).toHaveLength(10);
    for (const entry of CRITTER_INFO) {
      expect(typeof entry.id).toBe('string');
      expect(typeof entry.emoji).toBe('string');
      expect(typeof entry.name).toBe('string');
      expect(typeof entry.hint).toBe('string');
    }
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
