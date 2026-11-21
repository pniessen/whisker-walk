// The Market Square's words (Task 10): each treat has its name and its prompt,
// and every line says the same in both word sets and holds no series word.
import { describe, it, expect } from 'vitest';
import * as on from '../src/clanwords.js';
import * as off from '../src/offclanwords.js';
import { inEachWordSet, seriesModes, words } from '../src/wordset.js';
import { TREAT_WORDS, MARKET_LINES } from '../src/marketwords.js';
import { MARKET_COLLECTIBLES } from '../src/world/marketplan.js';
import { withStandInWords } from './helpers/standinwords.js';
import { withOffWords } from './helpers/offwords.js';
import { seriesFilter, stringsIn } from './helpers/serieswords.js';

const KINDS = ['fishhead', 'sausageroll', 'cheddar', 'cream', 'crumbs'];

const everyLine = () => ({
  treats: Object.fromEntries(KINDS.map((k) => [k, TREAT_WORDS[k] && { name: TREAT_WORDS[k].name, prompt: TREAT_WORDS[k].prompt }])),
  lines: {
    eatFirst: MARKET_LINES.eatFirst('a fish head'),
    eatAgain: MARKET_LINES.eatAgain('a fish head'),
    shoo: MARKET_LINES.shoo(),
    laugh: MARKET_LINES.laugh(),
    coo: MARKET_LINES.coo(),
    teamEater: MARKET_LINES.teamEater('Robin'),
    teamDistracter: MARKET_LINES.teamDistracter('Robin'),
    summaryTreats: MARKET_LINES.summaryTreats(),
  },
});

describe('the market words', () => {
  it('every treat has its name and its prompt, and every prompt names its treat', () => {
    expect(Object.keys(TREAT_WORDS).sort()).toEqual([...KINDS].sort());
    const nouns = { fishhead: 'fish head', sausageroll: 'sausage roll', cheddar: 'cheddar', cream: 'cream', crumbs: 'crumbs' };
    for (const k of KINDS) {
      const { name, prompt } = TREAT_WORDS[k];
      expect(typeof name, k).toBe('string');
      expect(name.length, k).toBeGreaterThan(0);
      expect(prompt, k).toMatch(/^E — /);
      expect(prompt.toLowerCase(), k).toContain(nouns[k]);
      expect(name.toLowerCase(), k).toContain(nouns[k].split(' ').pop().replace(/s$/, ''));
    }
    expect(TREAT_WORDS.fishhead.prompt).toBe('E — grab the fish head');
    expect(TREAT_WORDS.cream.prompt).toBe('E — lap up the cream');
    expect(MARKET_LINES.eatFirst('a fish head')).toBe('Yum! You grabbed a fish head! 😋');
    expect(MARKET_LINES.teamDistracter('Robin')).toBe('Teamwork! You kept them busy while Robin grabbed a treat 🐾');
  });

  it('the market\'s lines say the same in both word sets and hold no series word', () => {
    const plain = JSON.stringify(everyLine());
    const perSet = inEachWordSet(() => JSON.stringify(everyLine()));
    expect(perSet.length).toBe(seriesModes().length);
    for (const s of perSet) expect(s).toBe(plain);
    expect(withOffWords(() => JSON.stringify(everyLine()))).toBe(plain);
    expect(withStandInWords(() => JSON.stringify(everyLine()))).toBe(plain);

    // the words of both sets, as the screens' filter knows them
    const tableWords = [...new Set([...on.PREFIXES, ...off.PREFIXES, on.CLAN_SUFFIX, off.CLAN_SUFFIX,
      ...Object.values(on.RANK_WORDS), ...Object.values(off.RANK_WORDS)])].filter((w) => w && w.length > 2);
    const found = seriesFilter(tableWords);
    const texts = [...stringsIn(everyLine()), ...MARKET_COLLECTIBLES.map((c) => c.label)];
    expect(texts.length).toBeGreaterThan(10);
    for (const t of texts) expect(found(t), t).toBe(false);
    expect(typeof words()).toBe('object');
  });
});
