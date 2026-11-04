import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { PAW } from '../src/ui/pawicon.js';
import { visitBadgeHtml } from '../src/ui/homebase.js';

describe('paw icon', () => {
  test('is a decorative span that keeps the emoji as its fallback text', () => {
    expect(PAW).toContain('class="paw"');
    expect(PAW).toContain('aria-hidden="true"');
    expect(PAW).toContain('🐾');
  });
  test('the pounce button keeps its accessible name; the visit chip keeps its words', () => {
    const src = readFileSync(new URL('../src/ui/touchui.js', import.meta.url), 'utf8');
    expect(src).toContain('aria-label="Pounce or climb">${PAW}</button>');
    expect(visitBadgeHtml(3)).toMatch(/class="paw"[^>]*>🐾<\/span> Visit 3/);
  });
  test('style.css draws it with a mask and keeps an emoji halo fallback', () => {
    const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
    expect(css).toMatch(/@supports \(\(-webkit-mask-image/);
    expect(css).toMatch(/\.paw \{[^}]*drop-shadow/);
  });
  test('the remaining surfaces draw the light paw, never a bare emoji', async () => {
    const { summaryStatsHtml } = await import('../src/ui/screencards.js');
    const { renderDenShopHtml } = await import('../src/ui/denshop.js');
    const { cardHtml } = await import('../src/game/celebrate.js');
    const { renderChallengeHtml, renderFightHtml } = await import('../src/ui/fightui.js');
    const bare = (h) => h.replaceAll(PAW, '').includes('🐾');
    expect(bare(summaryStatsHtml({ earned: 5, discoveries: 1, friendsGreeted: 1, goalsDone: 1, hasGoals: true }))).toBe(false);
    expect(bare(cardHtml({ name: 'Quiet', effect: 'x', feat: 'y' }))).toBe(false);
    expect(bare(renderChallengeHtml({ name: 'Tom', clan: 'moor' }))).toBe(false);
    expect(bare(renderFightHtml({ phase: 'beat', clue: null, round: 2, wins: 2, losses: 1, line: 'Nice one! 🐾' }))).toBe(false);
    expect(bare(renderDenShopHtml({ points: 50, den: { owned: [], placed: {} } }))).toBe(false);
  });
});
