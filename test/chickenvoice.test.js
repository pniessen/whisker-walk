import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { callVoice, isChicken } from '../src/catvoice.js';
import { CROW_NOTES } from '../src/audio.js';

const fake = () => {
  const log = [];
  return { log, cluck: () => log.push('cluck'), crow: () => log.push('crow'), meow: () => log.push('meow') };
};

describe('a chicken never meows', () => {
  it('Hagrid alternates cluck and crow, and never meows', () => {
    const a = fake();
    for (let i = 0; i < 8; i++) callVoice(a, 'hagrid');
    expect(a.log).not.toContain('meow');
    expect(a.log).toContain('cluck');
    expect(a.log).toContain('crow');
  });
  it('other breeds still meow', () => {
    const a = fake();
    callVoice(a, 'siamese');
    expect(a.log).toEqual(['meow']);
  });
  it('the only meow call site in src is the breed router', () => {
    const hits = [];
    const walk = (d) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.js') && /\baudio\.meow\(/.test(readFileSync(p, 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n'))) hits.push(p);
      }
    };
    walk('src');
    expect(hits).toEqual([join('src', 'catvoice.js')]);
  });
  it('isChicken is just hagrid', () => {
    expect(isChicken('hagrid')).toBe(true);
    expect(isChicken('tabby')).toBe(false);
  });
});

describe('the crow', () => {
  it('is short and bounded', () => {
    const end = Math.max(...CROW_NOTES.map((n) => n[4] + n[5]));
    expect(end).toBeLessThanOrEqual(1.5);
    expect(CROW_NOTES.length).toBeLessThanOrEqual(6);
  });
});
