import { test, expect } from 'vitest';
import { CATALOG } from '../src/progression.js';
import { CLAN_SUFFIX, PLACE_WORDS } from '../src/clanwords.js';
import { rivalFor } from '../src/rivalclans.js';
import { TRUCE_AREAS } from '../src/clanhomes.js';
import { ISLAND_LAND, BRIDGE_DECK } from '../src/world/island.js';
import { EDITIONS, DEFAULT_EDITION, sanitizeEdition, isClanEdition, editionTitle, gameTitle, areaInEdition, placeName, effectiveArea, rivalForWalk, accessoryName, roomAreaMove } from '../src/edition.js';

const CAT = { areas: { neighborhood: {}, park: {}, woods: { edition: 'canon' } } };

test('the edition list and default', () => {
  expect(Object.isFrozen(EDITIONS)).toBe(true);
  expect(EDITIONS).toEqual(['canon', 'legacy']);
  expect(DEFAULT_EDITION).toBe('canon');
});
test('sanitizeEdition keeps the two editions and turns anything else into canon', () => {
  expect(sanitizeEdition('legacy')).toBe('legacy');
  expect(sanitizeEdition('canon')).toBe('canon');
  for (const v of [undefined, null, 'Legacy', 'clan', 42, {}]) expect(sanitizeEdition(v)).toBe('canon');
});
test('isClanEdition is false only for legacy', () => {
  expect(isClanEdition({ edition: 'legacy' })).toBe(false);
  for (const s of [{ edition: 'canon' }, {}, null]) expect(isClanEdition(s)).toBe(true);
});
test('editionTitle names both editions', () => {
  expect(editionTitle('canon')).toBe(`${CLAN_SUFFIX} Edition`);
  expect(editionTitle('legacy')).toBe('Legacy Edition');
});
test('gameTitle is the page title for each edition', () => {
  expect(gameTitle('canon')).toBe(`Whisker Walk 2: ${CLAN_SUFFIX} Edition`);
  expect(gameTitle('legacy')).toBe('Whisker Walk 2: Legacy Edition');
});
test('areaInEdition hides canon-only places in Legacy only', () => {
  expect(areaInEdition({ edition: 'canon' }, 'legacy')).toBe(false);
  expect(areaInEdition({ edition: 'canon' }, 'canon')).toBe(true);
  expect(areaInEdition({}, 'legacy')).toBe(true);
});
test('placeName calls the Neighborhood Twolegplace in Clan Edition only', () => {
  expect(placeName('neighborhood', 'canon', CATALOG)).toBe(PLACE_WORDS.town);
  expect(placeName('neighborhood', 'legacy', CATALOG)).toBe('Cozy Neighborhood');
  expect(placeName('park', 'canon', CATALOG)).toBe('City Park');
  expect(placeName('__proto__', 'canon', CATALOG)).toBe('');
});
test('effectiveArea sends a Legacy walk to the Neighborhood without writing', () => {
  const s = { edition: 'legacy', area: 'woods' };
  expect(effectiveArea(s, CAT)).toBe('neighborhood');
  expect(s).toEqual({ edition: 'legacy', area: 'woods' });
  expect(effectiveArea({ edition: 'canon', area: 'woods' }, CAT)).toBe('woods');
  expect(effectiveArea({ edition: 'legacy', area: 'park' }, CAT)).toBe('park');
});
test('rivalForWalk: none in Legacy, the usual one in Clan Edition', () => {
  expect(rivalForWalk('park', 'legacy')).toBeNull();
  expect(rivalForWalk('park', 'canon')).toEqual(rivalFor('park'));
  expect(rivalForWalk('woods', 'canon').clan).toBe('woods');
});
test('accessoryName drops the clan word in Legacy only', () => {
  const paint = { name: `${CLAN_SUFFIX} War Paint`, legacyName: 'War Paint' };
  expect(accessoryName(paint, 'legacy')).toBe('War Paint');
  expect(accessoryName(paint, 'canon')).toBe(`${CLAN_SUFFIX} War Paint`);
  expect(accessoryName({ name: 'Bow' }, 'legacy')).toBe('Bow');
});
test('roomAreaMove never moves a Legacy kid off a canon-only place', () => {
  expect(roomAreaMove({ edition: 'legacy', area: 'woods' }, CATALOG, 'neighborhood')).toBe('override');
  expect(roomAreaMove({ edition: 'legacy', area: 'park' }, CATALOG, 'seaside')).toBe('set');
  expect(roomAreaMove({ edition: 'canon', area: 'woods' }, CATALOG, 'park')).toBe('set');
});
test('roomAreaMove never makes a canon-only place a Legacy kid\'s own', () => {
  // setArea refuses it in Legacy, so a room walk there must be an override.
  expect(roomAreaMove({ edition: 'legacy', area: 'park' }, CATALOG, 'woods')).toBe('override');
  expect(roomAreaMove({ edition: 'canon', area: 'park' }, CATALOG, 'woods')).toBe('set');
});
test('the shipped Legacy guards cover the Moor', () => {
  expect(effectiveArea({ edition: 'legacy', area: 'moor' }, CATALOG)).toBe('neighborhood');
  expect(effectiveArea({ edition: 'canon', area: 'moor' }, CATALOG)).toBe('moor');
  expect(roomAreaMove({ edition: 'legacy', area: 'moor' }, CATALOG, 'park')).toBe('override');
  expect(rivalForWalk('moor', 'legacy')).toBeNull();
  expect(rivalForWalk('moor', 'canon').clan).toBe('moor');
  expect(rivalForWalk('moor', 'canon', ['moor']).clan).not.toBe('moor');
  expect(areaInEdition(CATALOG.areas.moor, 'legacy')).toBe(false);
});
test('the shipped Legacy guards cover the Pines, and no patrol walks the truce', () => {
  expect(effectiveArea({ edition: 'legacy', area: 'pines' }, CATALOG)).toBe('neighborhood');
  expect(effectiveArea({ edition: 'canon', area: 'pines' }, CATALOG)).toBe('pines');
  expect(roomAreaMove({ edition: 'legacy', area: 'pines' }, CATALOG, 'park')).toBe('override');
  expect(rivalForWalk('pines', 'legacy')).toBeNull();
  expect(rivalForWalk('pines', 'canon').clan).toBe('pines');
  expect(rivalForWalk('pines', 'canon', ['pines']).clan).not.toBe('pines');
  expect(areaInEdition(CATALOG.areas.pines, 'legacy')).toBe(false);
});
test('the shipped Legacy guards cover the Gorge, and CliffClan patrols its camp', () => {
  expect(effectiveArea({ edition: 'legacy', area: 'gorge' }, CATALOG)).toBe('neighborhood');
  expect(effectiveArea({ edition: 'canon', area: 'gorge' }, CATALOG)).toBe('gorge');
  expect(roomAreaMove({ edition: 'legacy', area: 'gorge' }, CATALOG, 'park')).toBe('override');
  expect(rivalForWalk('gorge', 'legacy')).toBeNull();
  const cliff = { name: 'CliffClan', clan: 'gorge', cx: 12, cz: 41.5, r: 5.2 };
  expect(rivalForWalk('gorge', 'canon')).toEqual(cliff);
  expect(rivalForWalk('gorge', 'canon', ['moor'])).toEqual(cliff);
  expect(areaInEdition(CATALOG.areas.gorge, 'legacy')).toBe(false);
});
test('the shipped Legacy guards cover the River', () => {
  expect(effectiveArea({ edition: 'legacy', area: 'river' }, CATALOG)).toBe('neighborhood');
  expect(roomAreaMove({ edition: 'legacy', area: 'river' }, CATALOG, 'park')).toBe('override');
  expect(rivalForWalk('river', 'legacy')).toBeNull();
  expect(rivalForWalk('river', 'canon').clan).toBe('river');
});

test('the island is inside the Pines, so Legacy never walks it and no patrol is there', () => {
  expect(effectiveArea({ edition: 'legacy', area: 'pines' }, CATALOG)).toBe('neighborhood');
  expect(Object.hasOwn(CATALOG.areas, 'island')).toBe(false);
  expect(TRUCE_AREAS).toContain('island');
  // The island is walked as part of the Pines, so "no patrol there" is
  // geometry: the Pines' camp, whoever patrols it, stays well off the island
  // and the bridge (test/rivalworld.test.js checks the truce path too).
  expect(rivalForWalk('pines', 'canon', [])).not.toBeNull();
  for (const picks of [[], ['pines'], ['pines', 'river']]) {
    const camp = rivalForWalk('pines', 'canon', picks);
    // Every pick set has a camp in the Pines: a missing one fails here rather
    // than skipping the distance checks below.
    expect(camp, `picks ${JSON.stringify(picks)}`).toBeTruthy();
    expect(Number.isFinite(camp.cx) && Number.isFinite(camp.cz) && Number.isFinite(camp.r), `picks ${JSON.stringify(picks)}`).toBe(true);
    expect(Math.hypot(camp.cx - ISLAND_LAND.x, camp.cz - ISLAND_LAND.z) - ISLAND_LAND.r - camp.r).toBeGreaterThanOrEqual(3);
    for (const [x, z] of [[BRIDGE_DECK.x1, BRIDGE_DECK.z1], [BRIDGE_DECK.x2, BRIDGE_DECK.z2]]) {
      expect(Math.hypot(camp.cx - x, camp.cz - z) - camp.r).toBeGreaterThanOrEqual(3);
    }
  }
});

test('rivalForWalk: Legacy never, Clan Edition follows the picks', () => {
  expect(rivalForWalk('woods', 'legacy', [])).toBeNull();
  expect(rivalForWalk('woods', 'canon', []).clan).toBe('woods');
  expect(rivalForWalk('woods', 'canon', ['woods']).clan).not.toBe('woods');
  expect(rivalForWalk('island', 'canon', [])).toBeNull();
});
