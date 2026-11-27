// Regions (interconnectivity milestone I0): the owner's five groupings of every place, as data.
import { describe, it, expect } from 'vitest';
import { CATALOG } from '../src/progression.js';
import { TELE_ENDS } from '../src/teleport.js';
import { REGIONS, REGION_LINES, regionOf, regionName } from '../src/regions.js';
import { withOffWords } from './helpers/offwords.js';

describe('regions', () => {
  it('five regions, the owner\'s, each with members', () => {
    expect(REGIONS.map((r) => r.id)).toEqual(['urban', 'suburban', 'shore', 'wild', 'other']);
    for (const r of REGIONS) expect(r.members.length, r.id).toBeGreaterThan(0);
    expect(Object.isFrozen(REGIONS) && REGIONS.every((r) => Object.isFrozen(r) && Object.isFrozen(r.members))).toBe(true);
  });

  it('every catalog place has a region', () => {
    for (const id of Object.keys(CATALOG.areas)) expect(regionOf(id), id).not.toBeNull();
  });

  it('every teleport place (hosts and destinations) has a region', () => {
    const places = new Set(Object.keys(TELE_ENDS));
    for (const ends of Object.values(TELE_ENDS)) for (const e of ends) places.add(e.to);
    for (const id of places) expect(regionOf(id), id).not.toBeNull();
  });

  it('every member is a real place, and no place is in two regions', () => {
    const known = new Set([...Object.keys(CATALOG.areas), ...Object.keys(TELE_ENDS)]);
    const seen = new Set();
    for (const r of REGIONS) {
      for (const id of r.members) {
        expect(known.has(id), id).toBe(true);
        expect(seen.has(id), `${id} twice`).toBe(false);
        seen.add(id);
      }
    }
  });

  it('the owner\'s grouping', () => {
    expect(regionOf('neighborhood')).toBe('urban');
    expect(regionOf('greenhouse')).toBe('urban');
    expect(regionOf('house')).toBe('suburban');
    expect(regionOf('lighthouse')).toBe('shore');
    expect(regionOf('gorge')).toBe('wild');
    for (const id of ['moon', 'reef', 'crystal']) expect(regionOf(id), id).toBe('other');
    expect(regionOf('__proto__')).toBeNull();
    expect(regionOf(undefined)).toBeNull();
  });

  it('names read in both word sets; only the Clan lands differ, and the everyday words carry no series word', () => {
    expect(REGIONS.map((r) => regionName(r.id))).toEqual(['Urban', 'Suburban and rural', 'Shore', 'Clan lands', 'Other worlds']);
    withOffWords(() => {
      expect(REGIONS.map((r) => regionName(r.id))).toEqual(['Urban', 'Suburban and rural', 'Shore', 'Wild lands', 'Other worlds']);
      for (const r of REGIONS) expect(regionName(r.id)).not.toMatch(/clan/i);
    });
    expect(regionName('nope')).toBe('');
    expect(Object.keys(REGION_LINES)).toHaveLength(5);
  });
});
