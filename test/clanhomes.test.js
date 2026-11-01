import { test, expect } from 'vitest';
import { HOMES, TRUCE_AREAS, isClanId, pickableClans, clanName, patrolClanFor, picksOf, ownClanTitle, alliesName, homeWelcome } from '../src/clanhomes.js';
import { CLAN_SUFFIX, HOMAGE_PREFIXES } from '../src/clanwords.js';

const IDS = Object.keys(HOMES);
const PICKS = [null, ...IDS];

test('every clan has a homage name and its neighbours are clans', () => {
  for (const id of IDS) {
    expect(clanName(id)).toBe(HOMAGE_PREFIXES[id] + CLAN_SUFFIX);
    for (const n of HOMES[id].neighbours) expect(isClanId(n)).toBe(true);
  }
});

test('the four first-release clans can be picked; the gorge cannot yet', () => {
  for (const id of ['woods', 'moor', 'river', 'pines']) expect(pickableClans()).toContain(id);
  expect(pickableClans()).not.toContain('gorge');
});

test('ALLIES: a patrol is never a kid\'s clan, for every territory and every pair of picks', () => {
  for (const area of IDS) for (const a of PICKS) for (const b of PICKS) {
    const picks = [a, b].filter(Boolean);
    const clan = patrolClanFor(area, picks);
    if (clan !== null) expect(picks).not.toContain(clan);
    expect(patrolClanFor(area, [b, a].filter(Boolean))).toBe(clan); // both devices agree
  }
});

test("a territory's own clan patrols it unless a kid picked it (your clan's home)", () => {
  expect(patrolClanFor('woods', [])).toBe('woods');
  expect(patrolClanFor('woods', ['river'])).toBe('woods');
  expect(patrolClanFor('woods', ['woods'])).toBe('moor');
  expect(patrolClanFor('woods', ['woods', 'moor'])).toBe('river');
  expect(patrolClanFor('river', ['river', 'river'])).toBe('pines');
});

test('the island is a truce place, and an unknown area has no patrol', () => {
  expect(TRUCE_AREAS).toContain('island');
  for (const picks of [[], ['woods'], ['pines', 'moor']]) expect(patrolClanFor('island', picks)).toBeNull();
  for (const bad of ['park', '__proto__', 'constructor', undefined, 7]) expect(patrolClanFor(bad, [])).toBeNull();
});

test('junk in picks is ignored, never thrown on', () => {
  expect(patrolClanFor('woods', ['__proto__', 5, null, 'woods'])).toBe('moor');
  expect(patrolClanFor('woods', 'woods')).toBe('woods'); // not an array: no picks
});

test('picksOf counts the partner only while they are still the partner', () => {
  const st = (pick, partnerNow) => ({ edition: 'canon', clanPick: pick, colony: { partner: partnerNow ? { playerId: partnerNow } : null } });
  expect(picksOf(st({ mine: 'woods', partner: 'moor', partnerId: 'p2' }, 'p2'))).toEqual(['woods', 'moor']);
  expect(picksOf(st({ mine: 'woods', partner: 'moor', partnerId: 'p2' }, 'p3'))).toEqual(['woods']);
  expect(picksOf(st({ mine: null, partner: null, partnerId: null }, null))).toEqual([]);
  for (const junk of [null, undefined, {}, { clanPick: 'x' }, { clanPick: { mine: '__proto__' } }]) expect(picksOf(junk)).toEqual([]);
});

test('names on screen: own title, allies, the home toast; Legacy says none', () => {
  const s = { edition: 'canon', clan: { name: 'MossClan' }, clanPick: { mine: null, partner: 'moor', partnerId: 'p2' }, colony: { partner: { playerId: 'p2' } } };
  expect(ownClanTitle(s)).toBe('MossClan');
  expect(alliesName(s)).toBe(''); // no "· allies" until I have picked
  s.clanPick = { mine: 'woods', partner: 'moor', partnerId: 'p2' };
  expect(ownClanTitle(s)).toBe(clanName('woods'));
  expect(alliesName(s)).toBe(clanName('moor'));
  expect(homeWelcome('woods', s)).toContain(clanName('woods'));
  expect(homeWelcome('river', s)).toBeNull();
  s.clanPick.partner = 'woods';
  expect(alliesName(s)).toBe(''); // same clan: no separate ally
  s.edition = 'legacy';
  expect([ownClanTitle(s), alliesName(s), homeWelcome('woods', s)]).toEqual(['', '', null]);
});
