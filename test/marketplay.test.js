// The Market Square's words (Task 10): each treat has its name and its prompt,
// and every line says the same in both word sets and holds no series word.
import { describe, it, expect, vi } from 'vitest';
import * as on from '../src/clanwords.js';
import * as off from '../src/offclanwords.js';
import { inEachWordSet, seriesModes } from '../src/wordset.js';
import { TREAT_WORDS, MARKET_LINES } from '../src/marketwords.js';
import * as THREE from 'three';
import { withStandInWords } from './helpers/standinwords.js';
import { withOffWords } from './helpers/offwords.js';
import { seriesFilter, stringsIn } from './helpers/serieswords.js';

// The same headless canvas stub every world test uses (test/roofs.test.js):
// the ground's and the lamp posts' tiles paint on a canvas.
vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') {
          return () => ({ addColorStop: () => {} });
        }
        if (key === 'measureText') return () => ({ width: 10 });
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const { build } = await import('../src/world/market.js');
const area = build(new THREE.Scene());

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
    const texts = [...stringsIn(everyLine()), ...area.collectibles.map((c) => c.label), ...area.scenics.map((c) => c.label)];
    expect(texts.length).toBeGreaterThan(10);
    for (const t of texts) expect(found(t), t).toBe(false);
    expect(area.scenics.length).toBeGreaterThan(0);
    expect(area.collectibles.length).toBeGreaterThan(0);
  });
});
