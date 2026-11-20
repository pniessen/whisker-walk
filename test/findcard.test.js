import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { createProgression } from '../src/progression.js';
import { pauseCardFor } from '../src/game/walk.js';
import { buildCat } from '../src/cat/model.js';
import { animateCat } from '../src/cat/animator.js';
import { LADDER } from '../src/render/quality.js';
import { createFindCard, redressSessionCat, shadowMinPartNow } from '../src/game/findcard.js';

// Found outfits step 1, Task 8: the find card. "You found something to
// wear!", the outfit on her cat, Wear it and Later. It pauses the walk as
// the crossing card does; Back, or taking the pointer again, is Later.

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
}

function setup({ catalog, own = ['acorncap'], equipCat = null, touch = false } = {}) {
  const progression = createProgression(fakeStorage());
  for (const id of own) progression.recordFoundWear(id);
  if (equipCat) progression.state.equipped.cat = equipCat;
  const overlay = { innerHTML: '' };
  const s = { started: true, welcome: null, areaId: 'park', carry: { mouth: { held: null } }, findCard: null };
  const calls = { release: 0, resume: 0, looks: 0 };
  const redress = vi.fn();
  const portrait = vi.fn(() => 'data:cat');
  const card = createFindCard({
    getSession: () => s,
    overlay,
    releaseControl: () => { calls.release += 1; },
    resumeWalk: () => { calls.resume += 1; },
    progression,
    getIsTouch: () => touch,
    onLookChanged: () => { calls.looks += 1; },
    portrait,
    redress,
    ...(catalog ? { catalog } : {}),
  });
  return { card, overlay, s, calls, progression, redress, portrait };
}

describe('the find card', () => {
  it('show pauses the walk with the card; Later puts the pause card back and walks on, not worn', () => {
    const { card, overlay, s, calls, progression, portrait } = setup();
    card.show(s, 'acorncap');
    expect(s.findCard).toEqual({ id: 'acorncap' });
    expect(overlay.innerHTML).toContain('You found something to wear! ✨');
    expect(overlay.innerHTML).toContain('Acorn Cap');
    expect(overlay.innerHTML).toContain('id="btn-find-wear"');
    expect(overlay.innerHTML).toContain('id="btn-find-later"');
    expect(overlay.innerHTML).toContain('src="data:cat"');
    expect(calls.release).toBe(1);
    // the portrait is her cat wearing it; her own look is untouched
    expect(portrait.mock.calls[0][0].equipped.head).toBe('acorncap');
    expect(progression.state.equipped.head).toBe(null);
    card.later();
    expect(s.findCard).toBe(null);
    expect(calls.resume).toBe(1);
    expect(overlay.innerHTML).toBe(pauseCardFor(s, false));
    expect(progression.state.equipped.head).toBe(null);
  });

  it('Wear it puts it on, dresses her cat in place, re-publishes the profile, then walks on', () => {
    const { card, overlay, s, calls, progression, redress } = setup();
    const order = [];
    redress.mockImplementation(() => order.push(['redress', progression.state.equipped.head]));
    card.show(s, 'acorncap');
    card.wear();
    expect(progression.state.equipped.head).toBe('acorncap');
    expect(redress).toHaveBeenCalledWith(s, progression);
    expect(order).toEqual([['redress', 'acorncap']]);
    expect(calls.looks).toBe(1);
    expect(calls.resume).toBe(1);
    expect(s.findCard).toBe(null);
    expect(overlay.innerHTML).toBe(pauseCardFor(s, false));
  });

  it('Wear it twice, or with no card, does nothing more', () => {
    const { card, s, calls, redress } = setup();
    card.wear();
    card.later();
    expect([redress.mock.calls.length, calls.looks, calls.resume]).toEqual([0, 0, 0]);
    card.show(s, 'acorncap');
    card.wear();
    card.wear();
    card.later();
    expect([redress.mock.calls.length, calls.looks, calls.resume]).toEqual([1, 1, 1]);
  });

  it('re-locking the pointer with the card up is Later', () => {
    const { card, overlay, s, calls, progression, redress } = setup({ touch: true });
    card.onLockChange(false);
    card.show(s, 'acorncap');
    card.onLockChange(false);
    expect(s.findCard).toEqual({ id: 'acorncap' });
    card.onLockChange(true);
    expect(s.findCard).toBe(null);
    expect(overlay.innerHTML).toBe(pauseCardFor(s, true));
    expect(progression.state.equipped.head).toBe(null);
    expect(redress).not.toHaveBeenCalled();
    // taking the pointer again is what walks on (as crossing.js): no second resume
    expect(calls.resume).toBe(0);
    card.onLockChange(true);
    card.wear();
    expect(progression.state.equipped.head).toBe(null);
  });

  it('Hagrid and a back item: no Wear it on the card', () => {
    const catalog = { accessories: { cape: { name: 'Leaf Cape', slot: 'back', emoji: '🍃', find: 'park', prize: true, price: 0 } } };
    const { card, overlay, s, redress, portrait } = setup({ catalog, own: [], equipCat: 'hagrid' });
    card.show(s, 'cape');
    expect(overlay.innerHTML).not.toContain('btn-find-wear');
    expect(overlay.innerHTML).toContain('Leaf Cape');
    expect(overlay.innerHTML).toContain('<span class="find-emoji">🍃</span>');
    expect(portrait).not.toHaveBeenCalled();
    expect(overlay.innerHTML).toContain('Hagrid can’t wear this one, but your other cats can.');
    expect(overlay.innerHTML).toContain('id="btn-find-later"');
    card.wear();
    expect(redress).not.toHaveBeenCalled();
    expect(s.findCard).toEqual({ id: 'cape' });
  });

  it('show with no walk, or an id that is not an outfit, does nothing', () => {
    const { card, s, calls } = setup();
    card.show(null, 'acorncap');
    card.show(s, 'nosuchthing');
    expect(s.findCard).toBe(null);
    expect(calls.release).toBe(0);
  });
});

const BARE = { collar: 'bell', head: null, face: null, neck: null, body: null, back: null, feet: null };

describe('redressSessionCat', () => {
  function walkCat(progression) {
    const cat = buildCat('tabby', BARE);
    animateCat(cat, 'follow', 0, 0, false);
    const scene = new THREE.Scene();
    scene.add(cat);
    return { cat, scene, s: { cat, scene } };
  }

  it('dresses her cat in what she has on, in place, and its parts cast as the walk\'s sweep says', () => {
    const progression = createProgression(fakeStorage());
    progression.state.equipped.collar = 'bell';
    progression.recordFoundWear('acorncap');
    progression.equipAccessory('acorncap');
    const { cat, s } = walkCat(progression);
    redressSessionCat(s, progression);
    expect(s.cat).toBe(cat);
    expect(cat.userData.parts.head.children.some((o) => o.userData.hat === 'acorncap')).toBe(true);
    let casters = 0;
    cat.traverse((o) => { if (o.isMesh && o.castShadow) casters += 1; });
    expect(casters).toBeGreaterThan(10);
  });

  it('on the shadow-light rung the small parts stop casting again', () => {
    const progression = createProgression(fakeStorage());
    progression.recordFoundWear('acorncap');
    progression.equipAccessory('acorncap');
    const { cat, s } = walkCat(progression);
    redressSessionCat(s, progression, { minPart: 0.3 });
    let casters = 0, meshes = 0;
    cat.traverse((o) => { if (o.isMesh) { meshes += 1; if (o.castShadow) casters += 1; } });
    expect(casters).toBeLessThan(meshes);
    expect(casters).toBeLessThanOrEqual(12);
  });

  it('a borrowed hat (the scarecrow\'s) stays on her new head and is never freed', () => {
    const progression = createProgression(fakeStorage());
    progression.recordFoundWear('acorncap');
    progression.equipAccessory('acorncap');
    const { cat, s } = walkCat(progression);
    const geo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    const mat = new THREE.MeshBasicMaterial();
    const borrowed = new THREE.Mesh(geo, mat);
    borrowed.userData.borrowed = true;
    borrowed.position.set(0, 0.115, 0.015);
    const oldHead = cat.userData.parts.head;
    oldHead.add(borrowed);
    const freedGeo = vi.spyOn(geo, 'dispose');
    const freedMat = vi.spyOn(mat, 'dispose');
    redressSessionCat(s, progression);
    expect(cat.userData.parts.head).not.toBe(oldHead);
    expect(borrowed.parent).toBe(cat.userData.parts.head);
    expect(borrowed.position.toArray()).toEqual([0, 0.115, 0.015]);
    expect(freedGeo).not.toHaveBeenCalled();
    expect(freedMat).not.toHaveBeenCalled();
  });

  it('the Farm scarecrow\'s hat is flagged as borrowed where it is made', () => {
    const src = readFileSync(new URL('../src/farmanimals.js', import.meta.url), 'utf8');
    expect(src).toMatch(/catHat\.name = 'farm-scarecrow-hat';\s*\n(?:\s*\/\/[^\n]*\n)*\s*catHat\.userData\.borrowed = true;/);
  });

  it('shadowMinPartNow: the walk\'s tier, or the rung the walk has stepped down to since', () => {
    expect(shadowMinPartNow({ shadowMinPart: 0 }, null)).toBe(0);
    expect(shadowMinPartNow({ shadowMinPart: 0 }, 0)).toBe(0);
    expect(shadowMinPartNow({ shadowMinPart: 0 }, 4)).toBe(LADDER[4].shadowMinPart);
    expect(shadowMinPartNow({ shadowMinPart: 0.3 }, null)).toBe(0.3);
    expect(shadowMinPartNow(null, 99)).toBe(LADDER[LADDER.length - 1].shadowMinPart);
    expect(shadowMinPartNow(undefined, undefined)).toBe(0);
  });
});
