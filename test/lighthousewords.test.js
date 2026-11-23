import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const { LINES } = await import('../src/world/lighthousewords.js');
const { phrase, hasPhrase, PHRASE_IDS, LATER_PHRASE_IDS } = await import('../src/clanphrases.js');
const { words } = await import('../src/wordset.js');
const { build } = await import('../src/world/lighthouse.js');
const L = await import('../src/world/lighthouseplan.js');
const { withOffWords, bannedIn } = await import('./helpers/offwords.js');
const { LIGHTHOUSE_PAGE_WORDS } = await import('../src/lighthousepages.js');

// Lighthouse Point, milestone 3: every player-facing line, line by line, in both word sets. Two lines take a word
// from the set (the keeper's cat's house word, the people asleep in the window); every other line reads the same.

const TAKES = { 'lighthouse.kitten.offer': 'house', 'lighthouse.find.window': 'people' };
const IDS = Object.keys(LINES);
const read = (id) => (TAKES[id] ? phrase(id, words().OUTSIDE_WORDS[TAKES[id]]) : phrase(id));

describe('the place\'s words', () => {
  it('every line is in the table (the lazy file adds them), and none is empty', () => {
    expect(IDS.length).toBeGreaterThanOrEqual(30);
    for (const id of IDS) { expect(hasPhrase(id), id).toBe(true); expect(read(id), id).toMatch(/\S/); }
  });
  it('the lines the spec lists are all here, under the spec\'s ids', () => {
    for (const id of [
      'hint.lighthouse', 'lighthouse.scenic.gallery', 'lighthouse.scenic.cave', 'lighthouse.scenic.pools', 'lighthouse.scenic.cottage', 'lighthouse.scenic.gullrock',
      'lighthouse.perch.boat', 'lighthouse.perch.pool', 'lighthouse.collect.shell', 'lighthouse.collect.glass', 'lighthouse.collect.starfish', 'lighthouse.collect.button', 'lighthouse.collect.cork',
      'lighthouse.moment.crab', 'lighthouse.moment.chip', 'lighthouse.lever.prompt', 'lighthouse.lamp.lit', 'lighthouse.lamp.ship', 'lighthouse.bell.prompt',
      'lighthouse.kitten.offer', 'lighthouse.kitten.hear', 'lighthouse.kitten.found', 'lighthouse.kitten.prompt', 'lighthouse.kitten.home',
      'lighthouse.find.lamproom', 'lighthouse.find.pool', 'lighthouse.find.gull', 'lighthouse.find.echo', 'lighthouse.find.bell', 'lighthouse.find.window',
    ]) expect(Object.hasOwn(LINES, id), id).toBe(true);
    for (const id of ['lamproom', 'pool', 'gull', 'echo', 'bell', 'window']) {
      expect(hasPhrase(`lighthouse.page.${id}.name`)).toBe(true);
      expect(hasPhrase(`lighthouse.page.${id}.hint`)).toBe(true);
    }
  });
  it('each reads the same in the everyday set as in the family\'s, except the two that take a word from the set, which differ only in that word', () => {
    const clan = Object.fromEntries(IDS.map((id) => [id, read(id)]));
    let everyday;
    withOffWords(() => { everyday = Object.fromEntries(IDS.map((id) => [id, read(id)])); });
    for (const id of IDS) {
      if (!TAKES[id]) { expect(everyday[id], id).toBe(clan[id]); continue; }
      expect(everyday[id], id).not.toBe(clan[id]);
    }
    expect(clan['lighthouse.kitten.offer']).toBe('The cottage kittypet keeps looking down at the shore. Her kitten is missing! 🐾');
    expect(everyday['lighthouse.kitten.offer']).toBe('The cottage house cat keeps looking down at the shore. Her kitten is missing! 🐾');
    expect(clan['lighthouse.find.window']).toBe('A warm room, and one of the Twolegs asleep in a chair. A purr from somewhere. 🏮');
    expect(everyday['lighthouse.find.window']).toBe('A warm room, and one of the townspeople asleep in a chair. A purr from somewhere. 🏮');
  });
  it('the everyday set never shows a series word in any of them (the two with a set word included)', () => {
    withOffWords(() => { for (const id of IDS) expect(bannedIn(read(id)), id).toBeNull(); });
    withOffWords(() => { for (const p of Object.values(LIGHTHOUSE_PAGE_WORDS)) { expect(bannedIn(p.name())).toBeNull(); expect(bannedIn(p.hint())).toBeNull(); } });
  });
  it('the journal pages\' words are in the start-up table, the rest in the lazy file (none of the lazy ones in the start-up download)', () => {
    for (const id of ['lamproom', 'pool', 'gull', 'echo', 'bell', 'window', 'kitten', 'lamp']) {
      expect(LATER_PHRASE_IDS.includes(`lighthouse.page.${id}.name`) || PHRASE_IDS.includes(`lighthouse.page.${id}.name`), id).toBe(true);
    }
    for (const id of IDS) expect(LATER_PHRASE_IDS.includes(id) || PHRASE_IDS.includes(id), `${id} is in the start-up table`).toBe(false);
  });
  it('a line is one short line a nine-year-old reads in one go, and nothing scolds or scares', () => {
    for (const id of IDS) {
      const line = read(id);
      expect(line.length, id).toBeLessThanOrEqual(90);
      expect(line, id).not.toMatch(/\b(dark|scary|dead|die|hurt|danger|afraid|fall|lost forever|too late|hurry|quick!)\b/i);
    }
  });
});

describe('the names the place shows come from the table', () => {
  it('the record\'s scenic, collectible, perch and moment labels are the table\'s lines, and the plan\'s own literals match them', () => {
    const area = build(new THREE.Scene());
    const SCENIC = { 'lighthouse-gallery': 'gallery', 'lighthouse-cave': 'cave', 'lighthouse-pools': 'pools', 'lighthouse-cottage': 'cottage', 'lighthouse-gullrock': 'gullrock' };
    for (const s of area.scenics) expect(s.label, s.id).toBe(phrase(`lighthouse.scenic.${SCENIC[s.id]}`));
    const COLLECT = ['shell', 'glass', 'starfish', 'button', 'cork'];
    area.collectibles.forEach((c, i) => expect(c.label, c.id).toBe(phrase(`lighthouse.collect.${COLLECT[i]}`)));
    expect(area.perches.find((p) => p.label === 'the upturned boat')?.label).toBe(phrase('lighthouse.perch.boat'));
    expect(area.perches.find((p) => p.label === 'the high pool ledge')?.label).toBe(phrase('lighthouse.perch.pool'));
    expect(area.moments.map((m) => m.label)).toEqual([phrase('lighthouse.moment.crab'), phrase('lighthouse.moment.chip')]);
    // the plan\'s literals (pure data) are the same words
    for (const s of L.LIGHTHOUSE_SCENICS) expect(s.label, s.id).toBe(phrase(`lighthouse.scenic.${SCENIC[s.id]}`));
    L.LIGHTHOUSE_COLLECTIBLES.forEach((c, i) => expect(c.label).toBe(phrase(`lighthouse.collect.${COLLECT[i]}`)));
    // both sets
    withOffWords(() => {
      for (const s of area.scenics) expect(phrase(`lighthouse.scenic.${SCENIC[s.id]}`)).toBe(s.label);
    });
  });
  it('the lever\'s and the bell\'s prompts are the table\'s', () => {
    const area = build(new THREE.Scene());
    expect(area.tippables.find((t) => t.kind === 'lever').prompt).toBe(phrase('lighthouse.lever.prompt'));
    expect(area.tippables.find((t) => t.kind === 'bell').prompt).toBe(phrase('lighthouse.bell.prompt'));
  });
});
