import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  clanCast, castFor, clanCountFor, lonersFor, clanHomeFor, tagSubFor,
  CAST_RANKS, CAST_CORE, CAST_HIGH, INTRUDER_SLOTS, MIN_LONERS_HIGH, RAIDER_SLOTS, RANK_SCALE, CLAN_COLOURS, CLAN_COATS,
} from '../src/clancast.js';
import { CLAN_CAT_PREFIXES, RANK_KEYS, RANK_SUFFIX, RANK_WORDS, DENIED_NAMES } from '../src/clanwords.js';
import { clanName } from '../src/clanhomes.js';
import { isStrayName, STRAY_BREEDS } from '../src/straynames.js';

const CLANS = ['woods', 'moor', 'river', 'pines'];

test('each clan has sixteen cats, one per CAST_RANKS slot, named by rank', () => {
  for (const clan of CLANS) {
    const cast = clanCast(clan);
    expect(cast.map((m) => m.rank)).toEqual([...CAST_RANKS]);
    expect(new Set(cast.map((m) => m.name)).size).toBe(CAST_HIGH);
    for (const m of cast) {
      expect(m.id).toBe(`${clan}-${m.slot}`);
      expect(m.clan).toBe(clan);
      if (m.rank === RANK_KEYS.kit) expect(m.name.endsWith(RANK_SUFFIX.kit)).toBe(true);
      if (m.rank === RANK_KEYS.apprentice) expect(m.name.endsWith(RANK_SUFFIX.apprentice)).toBe(true);
      if (m.rank === RANK_KEYS.leader) expect(m.name.endsWith(RANK_SUFFIX.leader)).toBe(true);
      expect(isStrayName(m.name)).toBe(false);
      expect(CLAN_COATS[clan]).toContain(m.style);
      expect(m.breed).toBe(m.style.eyes);
      const word = CLAN_CAT_PREFIXES[clan][m.slot];
      expect(m.name.startsWith(word)).toBe(true);
      expect(m.name[word.length]).not.toBe(word.at(-1).toLowerCase());
      expect(DENIED_NAMES.has(m.name)).toBe(false);
    }
  }
});

test('the owner\'s words keep their places; only Root, Toad, Trout and Mint moved, to warrior slots', () => {
  const warriorSlots = (clan, w) => CAST_RANKS[CLAN_CAT_PREFIXES[clan].indexOf(w)] === RANK_KEYS.warrior;
  expect(warriorSlots('woods', 'Root')).toBe(true);
  expect(warriorSlots('pines', 'Toad')).toBe(true);
  expect(warriorSlots('river', 'Trout')).toBe(true);
  expect(warriorSlots('river', 'Mint')).toBe(true);
});

test('the first nine slots are the core clan, the same on every tier', () => {
  expect(CAST_RANKS.slice(0, CAST_CORE)).toEqual([RANK_KEYS.leader, RANK_KEYS.elder, RANK_KEYS.kit, RANK_KEYS.kit,
    RANK_KEYS.warrior, RANK_KEYS.warrior, RANK_KEYS.warrior, RANK_KEYS.apprentice, RANK_KEYS.apprentice]);
  for (const s of RAIDER_SLOTS) expect(s).toBeLessThan(CAST_CORE);
  expect(RAIDER_SLOTS.map((s) => CAST_RANKS[s])).toEqual([RANK_KEYS.warrior, RANK_KEYS.warrior, RANK_KEYS.warrior]);
  expect(CAST_RANKS.filter((r) => r === RANK_KEYS.deputy)).toHaveLength(1);
  expect(CAST_RANKS).toHaveLength(CAST_HIGH);
  expect(INTRUDER_SLOTS).toBe(1);
  expect(MIN_LONERS_HIGH).toBe(5);
});

test('rank scale and camp-marker colours are complete', () => {
  expect(RANK_SCALE).toEqual({ leader: 0.95, deputy: 0.9, elder: 0.85, warrior: 0.85, apprentice: 0.72, kit: 0.5 });
  expect(Object.isFrozen(RANK_SCALE)).toBe(true);
  expect(CLAN_COLOURS).toEqual({ woods: '#3f7d3a', moor: '#9a6aa8', river: '#2f7fa8', pines: '#35584a' });
  expect(Object.isFrozen(CLAN_COLOURS)).toBe(true);
});

const FLAGS = ['stripes', 'headStripes', 'patches', 'fluffy', 'whiteLegs', 'socks', 'chin'];
const dist = (a, b) => Math.hypot((a >> 16) - (b >> 16), ((a >> 8) & 255) - ((b >> 8) & 255), (a & 255) - (b & 255));
const mean = (rows) => rows.reduce((t, r) => [t[0] + (r.base >> 16), t[1] + ((r.base >> 8) & 255), t[2] + (r.base & 255)], [0, 0, 0]).map((v) => v / rows.length);

test('each clan wears its own palette, and the palettes tell clans apart at a glance', () => {
  expect(Object.isFrozen(CLAN_COATS)).toBe(true);
  for (const clan of CLANS) {
    expect(CLAN_COATS[clan]).toHaveLength(5);
    expect(Object.isFrozen(CLAN_COATS[clan])).toBe(true);
    for (const row of CLAN_COATS[clan]) {
      expect(Object.isFrozen(row)).toBe(true);
      for (const k of ['base', 'belly', 'accent']) expect(Number.isInteger(row[k])).toBe(true);
      if (row.patch2 !== undefined) expect(Number.isInteger(row.patch2)).toBe(true);
      expect(row.scale).toBe(1);
      expect(STRAY_BREEDS).toContain(row.eyes);
      for (const k of Object.keys(row)) {
        if (['eyes', 'base', 'belly', 'accent', 'patch2', 'scale'].includes(k)) continue;
        expect(FLAGS, k).toContain(k);
        expect(row[k]).toBe(true);
      }
    }
  }
  for (let i = 0; i < CLANS.length; i++) for (let j = i + 1; j < CLANS.length; j++) {
    const a = mean(CLAN_COATS[CLANS[i]]); const b = mean(CLAN_COATS[CLANS[j]]);
    expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeGreaterThanOrEqual(60);
    for (const ra of CLAN_COATS[CLANS[i]]) for (const rb of CLAN_COATS[CLANS[j]]) {
      expect(dist(ra.base, rb.base), `${CLANS[i]} vs ${CLANS[j]}`).toBeGreaterThanOrEqual(40);
    }
  }
});

test('the cast is fixed: the same every call', () => {
  expect(clanCast('woods')).toBe(clanCast('woods'));
  expect(Object.isFrozen(clanCast('woods'))).toBe(true);
  expect(Object.isFrozen(clanCast('woods')[0])).toBe(true);
  expect(Object.isFrozen(clanCast('woods')[0].style)).toBe(true);
  // a fresh compute (reloaded module) gives the same name and style per id
  return import('../src/clancast.js?fresh').then((fresh) => {
    for (const clan of CLANS) {
      const a = clanCast(clan); const b = fresh.clanCast(clan);
      expect(b).not.toBe(a);
      expect(b.map((m) => [m.id, m.name, m.breed, m.style])).toEqual(a.map((m) => [m.id, m.name, m.breed, m.style]));
    }
  });
});

test('no clan cat name is shared across clans', () => {
  const names = CLANS.flatMap((c) => clanCast(c).map((m) => m.name));
  expect(new Set(names).size).toBe(64);
});

test('clanCast gives nothing for a clan with no row or a non-id', () => {
  for (const a of ['gorge', 'island', 'den', '__proto__', 'constructor', undefined, 7, null]) expect(clanCast(a)).toEqual([]);
});

test('castFor needs a camp: woods, river, moor and pines have one; truce places and old areas none', () => {
  for (const a of ['woods', 'river', 'moor', 'pines']) expect(castFor(a).length).toBe(CAST_HIGH);
  for (const a of ['neighborhood', 'park', 'seaside', 'docks', 'den', 'island', 'gorge', '__proto__', 'constructor', undefined, 7]) expect(castFor(a)).toEqual([]);
});

test('unknown areas have no cast and keep today\'s strays', () => {
  for (const a of ['neighborhood', 'park', 'seaside', 'docks', 'den', 'island', '__proto__']) for (const n of [0, 14, 22]) for (const fed of [0, 9]) expect(lonersFor(a, n, fed)).toBe(n);
});

test('a territory with a camp trades strays for clan cats one for one', () => {
  expect(clanCountFor(22)).toBe(16);
  expect(lonersFor('woods', 22)).toBe(5);
  expect(clanCountFor(14)).toBe(9);
  expect(lonersFor('woods', 14)).toBe(4);
  expect(lonersFor('woods', 5)).toBe(0);
  for (const n of [14, 22]) for (const fed of [0, 3, 6, 12, 30]) {
    expect(lonersFor('river', n, fed) + clanCountFor(n, fed) + INTRUDER_SLOTS).toBe(n);
  }
});

test('fed cats beyond 5 take the extra clan slots, never the core', () => {
  expect(clanCountFor(22, 5)).toBe(16);
  expect(clanCountFor(22, 6)).toBe(15);
  expect(lonersFor('woods', 22, 8)).toBe(8);
  expect(clanCountFor(22, 12)).toBe(9);
  expect(clanCountFor(22, 40)).toBe(9);
  expect(clanCountFor(14, 12)).toBe(9);
  for (const bad of [NaN, -3, '7', undefined, Infinity]) expect(clanCountFor(22, bad)).toBe(16);
});

test('clanHomeFor: your pick or your sibling\'s, Clan Edition only', () => {
  expect(clanHomeFor('woods', 'canon', ['woods'])).toBe(true);
  expect(clanHomeFor('woods', 'canon', ['moor', 'woods'])).toBe(true);
  expect(clanHomeFor('woods', 'canon', [])).toBe(false);
  expect(clanHomeFor('woods', 'legacy', ['woods'])).toBe(false);
  expect(clanHomeFor('park', 'canon', ['woods'])).toBe(false);
  expect(clanHomeFor('woods', 'canon', 'woods')).toBe(false);
  expect(clanHomeFor('island', 'canon', ['island'])).toBe(false);
});

test('tagSubFor names the rank and the clan', () => {
  const cast = clanCast('woods');
  expect(tagSubFor(cast[0])).toBe(`${RANK_WORDS.leader} of ${clanName('woods')}`);
  expect(tagSubFor(cast[9])).toBe(`${RANK_WORDS.deputy} of ${clanName('woods')}`);
});

test('clancast.js stays pure', () => {
  const src = readFileSync(new URL('../src/clancast.js', import.meta.url), 'utf8');
  const specs = [...src.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
  expect(specs.length).toBeGreaterThan(0);
  const allowed = ['./clanhomes.js', './clanwords.js', './rivalclans.js', './rng.js', './straynames.js'];
  for (const s of specs) expect(allowed, s).toContain(s);
});
