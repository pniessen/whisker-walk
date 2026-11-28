import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as on from '../src/clanwords.js';
import * as off from '../src/offclanwords.js';
import { scanText, scanDir, bundleDenyList, ORDINARY_DENIED } from '../scripts/bundlewords.mjs';

describe('scanText', () => {
  it('flags what only the family set says', () => {
    for (const bad of [
      'MossClan', 'Firestar', 'Twolegplace', 'Or pick a star name', 'the medicine cat', 'a sun-warmed pebble',
      on.EMBLEMS.woods, 'see the Gathering', 'join a Clan', 'Rolling Tumble', 'a kittypet', 'Warrior Cats', 'Erin Hunter',
    ]) expect(scanText(`x ${bad} y`).length, bad).toBeGreaterThan(0);
  });

  it('flags a composed name from any family list, and every denied name', () => {
    expect(scanText('Mosspaw').length).toBe(1);
    expect(scanText('StormClan').length).toBeGreaterThan(0);
    for (const n of on.DENIED_NAMES) if (!ORDINARY_DENIED.includes(n)) expect(scanText(n), n).not.toEqual([]);
  });

  it('passes ids, ordinary words and the everyday set', () => {
    for (const ok of ['setClanPick', 'clanRoles', 'Midnight', 'warrior', 'truce-3', 'meeting-ring', 'a gathering of friends', 'Barley']) {
      expect(scanText(`x ${ok} y`), ok).toEqual([]);
    }
    // every string of the everyday set, its lines called with sample words
    const text = JSON.stringify(off, (_k, v) => (typeof v === 'function' ? v('Ada', 'Bo', 'Cy', 'Di') : v instanceof Set ? [...v] : v));
    expect(scanText(text)).toEqual([]);
  });

  it('pins the ordinary names', () => {
    expect(ORDINARY_DENIED).toEqual(['Barley', 'Boulder', 'Midnight', 'Princess', 'Smudge', 'Sol']);
    for (const n of ORDINARY_DENIED) expect(on.DENIED_NAMES.has(n), n).toBe(true);
  });

  it('knows the family set it is made from (a list for an empty set is empty of names)', () => {
    const names = bundleDenyList({ ...on, DENIED_NAMES: new Set(), PHRASES: {}, EMBLEMS: {} })[0][1];
    expect(names.has('Mosspaw')).toBe(true);
    expect(names.has('Firestar')).toBe(false);
  });
});

describe('scanDir', () => {
  it('lists an offence with its file, and a source map is one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ww-scan-'));
    try {
      mkdirSync(join(dir, 'assets'));
      writeFileSync(join(dir, 'index.html'), '<p>fine</p>');
      expect(scanDir(dir)).toEqual([]);
      writeFileSync(join(dir, 'assets', 'a.js'), 'const x = "MossClan";');
      writeFileSync(join(dir, 'assets', 'a.js.map'), '{}');
      writeFileSync(join(dir, 'assets', 'logo.png'), 'Firestar');
      const found = scanDir(dir);
      expect(found.some((f) => f.includes('a.js:') && f.includes('MossClan'))).toBe(true);
      expect(found.some((f) => f.includes('a.js.map') && f.includes('source map'))).toBe(true);
      expect(found.some((f) => f.includes('logo.png'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
