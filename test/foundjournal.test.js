import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CATALOG } from '../src/progression.js';
import { renderThingsToWearHtml } from '../src/foundwear/journal.js';
import { foundWearIn } from '../src/foundwear/index.js';
import { FIND_SPOTS } from '../src/foundwear/spots/index.js';

// A stand-in catalog with a Clan-only place's outfit beside the Park's cap.
const withMoss = {
  ...CATALOG,
  accessories: { ...CATALOG.accessories, mosscap: { name: 'Moss Cap', slot: 'head', price: 0, prize: true, find: 'woods', emoji: '🌿' } },
};

describe('Things to wear in the Journal', () => {
  it('a section of its own, the Park\'s cap as a silhouette until found', () => {
    const html = renderThingsToWearHtml({ unlocked: { accessories: [] } }, CATALOG);
    expect(html).toContain('<section class="wear-section">'); expect(html).toContain('Things to wear');
    expect(html).toContain('City Park'); expect(html).toContain('journal-card unspotted'); expect(html).toContain('Found in City Park');
    expect(html).toContain('journal-emoji silhouette');
    expect(html).not.toContain('Acorn Cap');
    expect(html).not.toMatch(/\d+\s*(of|\/)\s*\d+/);
  });
  it('found, it shows its name', () => {
    // every outfit hidden in the Park and the Neighborhood is found, so no card in either stays a silhouette
    const found = Object.keys(FIND_SPOTS).flatMap(foundWearIn).map((r) => r.id);
    const html = renderThingsToWearHtml({ unlocked: { accessories: found } }, CATALOG);
    expect(html).toContain('journal-card spotted'); expect(html).toContain('Acorn Cap'); expect(html).toContain('🌰');
    expect(html).not.toContain('journal-card unspotted');
    expect(html).not.toContain('silhouette');
  });
  it('each area its own group, in CATALOG.areas order', () => {
    const html = renderThingsToWearHtml({ unlocked: { accessories: [] } }, withMoss);
    const heads = [...html.matchAll(/<h4>([^<]*)<\/h4>/g)].map((m) => m[1]);
    // the street areas have their groups too as their spots land; the Park comes before the Woods
    expect(heads.filter((h) => h === 'City Park' || h === 'The Woods')).toEqual(['City Park', 'The Woods']);
    expect(html).toContain('Found in the Woods');
  });
  it('Legacy leaves out a Clan-only place unless she found something there', () => {
    const legacy = renderThingsToWearHtml({ edition: 'legacy', unlocked: { accessories: [] } }, withMoss);
    expect(legacy).not.toContain('The Woods'); expect(legacy).not.toContain('🌿');
    expect(legacy).toContain('City Park');
    const found = renderThingsToWearHtml({ edition: 'legacy', unlocked: { accessories: ['mosscap'] } }, withMoss);
    expect(found).toContain('<h4>The Woods</h4>'); expect(found).toContain('Moss Cap');
    expect(found).not.toContain('Found in the Woods');
  });
  it('a find-only outfit from a place with no find spots stays out of sight until found', () => {
    const hats = { ...CATALOG, accessories: {
      parkhat: { name: 'Park Hat', slot: 'head', price: 0, prize: true, find: 'park', emoji: '🌰' },
      riverhat: { name: 'River Hat', slot: 'head', price: 0, prize: true, find: 'river', emoji: '🐟' },
    } };
    const html = renderThingsToWearHtml({ edition: 'canon', unlocked: { accessories: [] } }, hats);
    expect(html).toContain('Found in City Park');
    expect(html).not.toContain('River'); expect(html).not.toContain('🐟');
  });
  it('once owned it shows, spots or not', () => {
    const hats = { ...CATALOG, accessories: {
      riverhat: { name: 'River Hat', slot: 'head', price: 0, prize: true, find: 'river', emoji: '🐟' },
    } };
    const html = renderThingsToWearHtml({ edition: 'canon', unlocked: { accessories: ['riverhat'] } }, hats);
    expect(html).toContain('journal-card spotted'); expect(html).toContain('River Hat'); expect(html).toContain('🐟');
  });
  it('nothing to list: nothing drawn', () => {
    const none = { ...CATALOG, accessories: Object.fromEntries(Object.entries(CATALOG.accessories).filter(([, a]) => !a.find)) };
    expect(renderThingsToWearHtml({ unlocked: { accessories: [] } }, none)).toBe('');
    expect(renderThingsToWearHtml(undefined, none)).toBe('');
  });
  it('a hostile save draws nothing it should not', () => {
    const html = renderThingsToWearHtml({ unlocked: { accessories: '<script>' } }, CATALOG);
    expect(html).toContain('journal-card unspotted');
    expect(html).not.toContain('<script>');
  });
  it('the home Journal sheet shows it', () => {
    const src = readFileSync(new URL('../src/ui/homebase.js', import.meta.url), 'utf8');
    expect(src).toContain('renderThingsToWearHtml(s, CATALOG)');
  });
  it('the silhouette, the section and the find card have their styles', () => {
    const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.dr-pick\.found-silhouette \.found-shape\s*\{\s*font-size: 30px; filter: brightness\(0\); opacity: 0\.55;\s*\}/);
    expect(css).toMatch(/\.wear-section h3\s*\{/);
    expect(css).toMatch(/\.wear-area h4\s*\{/);
    expect(css).toMatch(/\.find-card \.find-portrait\s*\{\s*width: 160px; height: 160px;\s*\}/);
    expect(css).toMatch(/\.find-card \.find-emoji\s*\{[^}]*font-size: 64px/);
  });
});
