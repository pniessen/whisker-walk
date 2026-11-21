import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createMoonOverlay, createRoofsMoments, MOON_VIEW } from '../src/world/roofsmoments.js';
import { ROOFS_DISCOVERIES, ROOFS_PERCHES, TELESCOPE_CRATE, ROOFS_GROUND } from '../src/world/roofsplan.js';
import { createGround } from '../src/ground.js';
import { fakePage } from './helpers/fakepage.js';

// The telescope's moon (Rooftops step 5, Task 5, R7): a picture over the
// screen, made by chunk code. This project has no jsdom, so the page is
// test/helpers/fakepage.js's stand-in: an element keeps its style and its
// parent, which is all the overlay uses.
const area = { anchors: { discoveries: ROOFS_DISCOVERIES } };
const crate = ROOFS_PERCHES.find((p) => p.x === TELESCOPE_CRATE.x && p.z === TELESCOPE_CRATE.z);
const onCrate = new THREE.Vector3(crate.x, createGround(ROOFS_GROUND).y(crate.x, crate.z) + crate.y, crate.z);
const beside = new THREE.Vector3(ROOFS_DISCOVERIES.telescope.x, ROOFS_DISCOVERIES.telescope.y, ROOFS_DISCOVERIES.telescope.z);
const perched = () => ({ perched: crate, rest: null, traversal: { busy: false } });
const ground = () => ({ perched: null, rest: null, traversal: { busy: false } });
const frames = (m, pos, s, n) => { for (let i = 0; i < n; i++) m.update(1 / 30, pos, null, s); };

describe('the moon picture is on top of the game, under the HUD, and never catches a tap', () => {
  it('a fixed, full-screen element with pointer-events none and z-index 1; dispose removes it', () => {
    const page = fakePage();
    const moon = createMoonOverlay(page);
    const el = moon.el;
    expect(el.parentNode).not.toBeNull();
    expect(el.style.position).toBe('fixed');
    expect([el.style.top, el.style.left, el.style.width, el.style.height]).toEqual(['0', '0', '100%', '100%']);
    expect(el.style.pointerEvents).toBe('none');
    expect(String(el.style.zIndex)).toBe('1');
    // never black: the eyepiece's edge is a deep blue, the moon pale; no image, no words
    expect(el.style.background).toContain('rgba(12, 18, 44, 0.88)');
    expect(el.style.background).not.toMatch(/url\(/);
    expect(el.textContent ?? '').toBe('');
    const disc = el.children[0];
    expect(disc.style.width).toBe('70vmin');
    expect(disc.style.height).toBe('70vmin');
    expect((disc.style.background.match(/radial-gradient/g) ?? []).length).toBeGreaterThanOrEqual(6); // five craters and the face
    expect(disc.style.background).not.toMatch(/url\(/);
    // hidden until shown
    expect(el.style.display).toBe('none');
    moon.show();
    moon.update(0.4);
    expect(el.style.display).toBe('block');
    expect(Number(el.style.opacity)).toBeCloseTo(0.5, 6);
    moon.hide();
    moon.update(0.4);
    expect(Number(el.style.opacity)).toBeCloseTo(0.25, 6);
    moon.update(0.5);
    expect(el.style.display).toBe('none');
    const parent = el.parentNode;
    moon.dispose();
    expect(parent.children).not.toContain(el);
    expect(el.parentNode).toBeNull();
  });

  it('it goes just over the game\'s canvas, so the HUD after it stays on top', () => {
    const page = fakePage();
    const app = page.createElement('div');
    const canvas = page.createElement('canvas');
    const hud = page.createElement('div');
    app.appendChild(canvas);
    app.appendChild(hud);
    page.getElementById = (id) => (id === 'game' ? canvas : null);
    const moon = createMoonOverlay(page);
    expect(app.children).toEqual([canvas, moon.el, hud]);
    moon.dispose();
    expect(app.children).toEqual([canvas, hud]);
  });

  it('createMoonOverlay(undefined) is null and the moments run without it', () => {
    expect(createMoonOverlay(undefined)).toBeNull();
    expect(createMoonOverlay(null)).toBeNull();
    const m = createRoofsMoments(area, {});
    expect(() => frames(m, onCrate, perched(), 60)).not.toThrow();
    m.dispose();
  });

  it('it fills in on the crate, holds, goes, and goes at once when she hops down; every time she perches', () => {
    const page = fakePage();
    const m = createRoofsMoments(area, { doc: page });
    const el = page.body.children[0];
    expect(el.style.display).toBe('none');
    frames(m, beside, ground(), 30); // beside the crate, not on it
    expect(el.style.display).toBe('none');
    frames(m, onCrate, perched(), 12); // 0.4 s
    expect(Number(el.style.opacity)).toBeGreaterThan(0.3);
    expect(Number(el.style.opacity)).toBeLessThan(0.7);
    frames(m, onCrate, perched(), 30); // 1.4 s
    expect(Number(el.style.opacity)).toBe(1);
    frames(m, onCrate, perched(), 180); // 7.4 s: held at most 6 s, then gone
    expect(el.style.display).toBe('none');
    // down and up again: it shows again (the page and the award come once, the moon every time)
    frames(m, beside, ground(), 10);
    frames(m, onCrate, perched(), 45);
    expect(Number(el.style.opacity)).toBe(1);
    // she hops down: out over 0.8 s, from at once
    frames(m, beside, ground(), 12);
    expect(Number(el.style.opacity)).toBeLessThan(0.65);
    frames(m, beside, ground(), 15);
    expect(el.style.display).toBe('none');
    m.dispose();
    expect(page.body.children).toEqual([]);
  });

  it('Review Focus 3: under reduced motion the moon only fades, it never grows', () => {
    const page = fakePage();
    const m = createRoofsMoments(area, { doc: page, reducedMotion: true });
    const disc = page.body.children[0].children[0];
    const seen = new Set();
    for (let i = 0; i < 30; i++) { m.update(1 / 30, onCrate, null, perched()); seen.add(disc.style.transform); }
    expect([...seen]).toEqual(['translate(-50%, -50%) scale(1)']);
    m.dispose();
    // and without it, it grows from 0.92 to 1 as it fades in
    const page2 = fakePage();
    const m2 = createRoofsMoments(area, { doc: page2 });
    const disc2 = page2.body.children[0].children[0];
    m2.update(1 / 30, onCrate, null, perched());
    const k0 = Number(/scale\(([\d.]+)\)/.exec(disc2.style.transform)[1]);
    expect(k0).toBeGreaterThanOrEqual(0.92);
    expect(k0).toBeLessThan(0.95);
    for (let i = 0; i < MOON_VIEW.fadeIn * 30 + 2; i++) m2.update(1 / 30, onCrate, null, perched());
    expect(disc2.style.transform).toBe('translate(-50%, -50%) scale(1)');
    m2.dispose();
  });
});
