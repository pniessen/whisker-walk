import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { VALUES } from '../src/profilevalues.js';

const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const tvCss = readFileSync(new URL('../src/tv/tv.css', import.meta.url), 'utf8');
const names = { map: '--pv-map', toasts: '--pv-toasts', cap: '--pv-cap' };

describe('the design-values table', () => {
  it('has the four profiles, each with every value', () => {
    expect(Object.keys(VALUES)).toEqual(['phone', 'tablet', 'laptop', 'tv']);
    for (const v of Object.values(VALUES)) expect(Object.keys(v)).toEqual(Object.keys(names));
  });
  it('M2 changed the phone only: map 88 and one message at a time; tablet map 110 and laptop 150 (style.css), two messages (hud.js), pixel cap 1.5 touch / 2 otherwise (main.js)', () => {
    expect(VALUES.phone).toEqual({ map: 88, toasts: 1, cap: 1.5 });
    expect(VALUES.tablet).toEqual({ map: 110, toasts: 2, cap: 1.5 });
    expect(VALUES.laptop).toEqual({ map: 150, toasts: 2, cap: 2 });
    expect(VALUES.tv.toasts).toBe(1);
  });
  it('equals the custom properties on html.<profile> (style.css; tv in tv/tv.css)', () => {
    for (const [p, v] of Object.entries(VALUES)) {
      const block = (p === 'tv' ? tvCss : css).match(new RegExp(`html\\.${p}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
      for (const [k, name] of Object.entries(names)) {
        const m = block.match(new RegExp(`${name}:\\s*([0-9.]+)`));
        expect(m && Number(m[1]), `${p} ${name}`).toBe(v[k]);
      }
    }
  });
  it('the map sizes agree with the rules the game uses', () => {
    expect(css).toMatch(/:root\s*\{\s*--map-size:\s*150px/);
    expect(css).toMatch(/body\.touch-mode\s*\{\s*--map-size:\s*110px/);
    expect(css).toMatch(/html\.phone body\.touch-mode\s*\{\s*--map-size:\s*88px/);
  });
});
