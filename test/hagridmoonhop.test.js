import { describe, it, expect } from 'vitest';
import { placeArc, gentleHop, GENTLE_HOP } from '../src/placephysics.js';
import { climbArc } from '../src/climbarc.js';

const arc = { height: 0.35, time: 0.3 };

describe('Hagrid hops gentler on the Moon, and only there', () => {
  it('scales the moon arc height for hagrid, nothing else', () => {
    const cat = placeArc(arc, 'moon', 'tabby');
    const hag = placeArc(arc, 'moon', 'hagrid');
    expect(hag.height).toBeCloseTo(cat.height * GENTLE_HOP.height, 10);
    expect(hag.time).toBe(cat.time); // the pounce window (and the bound's distance) is untouched
    expect(placeArc(arc, 'moon')).toEqual(cat);
  });
  it('is the same arc on Earth and the Reef, for every breed', () => {
    expect(placeArc(arc, 'park', 'hagrid')).toBe(arc);
    expect(placeArc(arc, 'reef', 'hagrid')).toEqual(placeArc(arc, 'reef', 'tabby'));
    expect(gentleHop('park', 'hagrid')).toBeNull();
    expect(gentleHop('moon', 'tabby')).toBeNull();
  });
  it('draws a perch hop lower and shorter for hagrid, and the same for a cat', () => {
    const from = { x: 0, y: 0, z: 0 }; const to = { x: 4, y: 3, z: 0 };
    const base = placeArc(arc, 'moon', 'tabby');
    const cat = climbArc(from, to, base);
    const hagBase = placeArc(arc, 'moon', 'hagrid');
    const g = gentleHop('moon', 'hagrid');
    const hag = climbArc(from, to, { ...hagBase, apexMul: g.height, durMul: g.hang });
    expect(hag.apex).toBeCloseTo(cat.apex * 0.6, 10);
    expect(hag.dur).toBeLessThan(cat.dur);
    expect(climbArc(from, to, base)).toEqual(cat);
  });
});
