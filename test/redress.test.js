import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCat } from '../src/cat/model.js';
import { animateCat } from '../src/cat/animator.js';
import { redressCat } from '../src/cat/redress.js';
import { CATALOG } from '../src/progression.js';
import { DEFAULT_LOOK } from '../src/customcats.js';
import { fingerprintCat } from './helpers/catfingerprint.js';

// Found outfits step 1, Task 7: putting on a find mid-walk. Her own cat is
// rebuilt INSIDE the same object, so every reference the walk holds to it
// (session.cat, the carryables' holder, the camera's target) stays good.

const BARE = { collar: 'bell', head: null, face: null, neck: null, body: null, back: null, feet: null };
const posed = (c) => { animateCat(c, 'follow', 0, 0, false); c.updateMatrixWorld(true); return c; };

describe('redressCat', () => {
  it('dresses the same cat object: new hat on, her tag, bubble and glow kept, where she stood', () => {
    const cat = buildCat('tabby', BARE); cat.position.set(3, 0, 4); cat.rotation.y = 1.2;
    const tag = new THREE.Sprite(); cat.add(tag); cat.userData.ownTag = tag;
    const glow = new THREE.PointLight(); glow.name = 'collarGlow'; cat.add(glow);
    const out = redressCat(cat, 'tabby', { ...BARE, head: 'acorncap' });
    expect(out).toBe(cat);
    expect(cat.userData.parts.head.children.some((o) => o.userData.hat === 'acorncap')).toBe(true);
    expect(cat.children).toContain(tag); expect(cat.children).toContain(glow); expect(cat.userData.ownTag).toBe(tag);
    expect([cat.position.toArray(), cat.rotation.y]).toEqual([[3, 0, 4], 1.2]);
    let inside = false; cat.traverse((o) => { if (o === cat.userData.parts.head) inside = true; }); expect(inside).toBe(true);
  });

  it('puts the new parts first, in build order, then the kept ones', () => {
    const cat = buildCat('tabby', BARE);
    const bubble = new THREE.Sprite(); cat.add(bubble);
    redressCat(cat, 'tabby', { ...BARE, head: 'acorncap' });
    const fresh = buildCat('tabby', { ...BARE, head: 'acorncap' });
    expect(cat.children.length).toBe(fresh.children.length + 1);
    expect(cat.children.at(-1)).toBe(bubble);
    expect(cat.children.slice(0, -1).map((o) => o.type)).toEqual(fresh.children.map((o) => o.type));
    for (const o of cat.children) expect(o.parent).toBe(cat);
  });

  it('throws away the old build: its geometries are disposed and none is left on the cat', () => {
    const cat = buildCat('tabby', BARE); const old = []; cat.traverse((o) => { if (o.isMesh) old.push(o); });
    let disposed = 0; for (const m of old) m.geometry.addEventListener('dispose', () => { disposed += 1; });
    redressCat(cat, 'tabby', { ...BARE, head: 'acorncap' });
    expect(disposed).toBe(old.length);
    const now = new Set(); cat.traverse((o) => now.add(o)); for (const m of old) expect(now.has(m)).toBe(false);
  });

  it('frees the old materials but never a shared surface: map, and never what it keeps', () => {
    const cat = buildCat('tabby', BARE);
    const surface = new THREE.Texture(); surface.name = 'surface:contact-shadow';
    const own = new THREE.Texture();
    const extra = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ map: surface }));
    const extra2 = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ map: own }));
    cat.add(extra, extra2);
    const tagMat = new THREE.SpriteMaterial({ map: new THREE.Texture() });
    const tag = new THREE.Sprite(tagMat); cat.add(tag);
    const freed = new Set();
    for (const t of [surface, own, tagMat.map]) t.addEventListener('dispose', () => freed.add(t));
    let matFreed = 0; extra.material.addEventListener('dispose', () => { matFreed += 1; });
    let tagMatFreed = 0; tagMat.addEventListener('dispose', () => { tagMatFreed += 1; });
    redressCat(cat, 'tabby', BARE);
    expect(matFreed).toBe(1);
    expect(freed.has(own)).toBe(true);
    expect(freed.has(surface)).toBe(false);
    expect(freed.has(tagMat.map)).toBe(false);
    expect(tagMatFreed).toBe(0);
  });

  it('poses like a fresh build afterwards', () => {
    const a = redressCat(buildCat('persian', BARE), 'persian', { ...BARE, head: 'acorncap' });
    const b = buildCat('persian', { ...BARE, head: 'acorncap' });
    for (const c of [a, b]) { animateCat(c, 'follow', 0, 0, false); c.updateMatrixWorld(true); }
    expect(fingerprintCat(a)).toEqual(fingerprintCat(b));
  });

  it('poses like a fresh build even after the old one walked a while', () => {
    const a = buildCat('mainecoon', BARE);
    for (const st of ['follow', 'perch', 'nap', 'follow']) animateCat(a, st, 1.3, 2, false);
    redressCat(a, 'mainecoon', { ...BARE, head: 'acorncap', neck: 'scarf' });
    const b = buildCat('mainecoon', { ...BARE, head: 'acorncap', neck: 'scarf' });
    expect(fingerprintCat(posed(a))).toEqual(fingerprintCat(posed(b)));
  });

  it('new parts win in userData, her own runtime keys stay', () => {
    const cat = buildCat('tabby', BARE);
    const oldParts = cat.userData.parts;
    const tag = new THREE.Sprite(); cat.add(tag);
    Object.assign(cat.userData, { ownTag: tag, custom: 'mine1', customName: 'Moss' });
    redressCat(cat, 'tabby', { ...BARE, head: 'acorncap' });
    expect(cat.userData.parts).not.toBe(oldParts);
    expect(cat.userData.breed).toBe('tabby');
    expect([cat.userData.ownTag, cat.userData.custom, cat.userData.customName]).toEqual([tag, 'mine1', 'Moss']);
  });

  it('takes the new build\'s scale, keeps position and rotation', () => {
    const cat = buildCat('tabby', BARE);
    cat.position.set(-2, 0.4, 7); cat.rotation.y = -2.5;
    cat.scale.set(0.5, 0.5, 0.5);
    redressCat(cat, 'tabby', BARE);
    expect(cat.scale.toArray()).toEqual(buildCat('tabby', BARE).scale.toArray());
    expect([cat.position.toArray(), cat.rotation.y]).toEqual([[-2, 0.4, 7], -2.5]);
  });

  it('works for Hagrid and a builder cat', () => {
    // Hagrid keeps his own body: the Acorn Cap's two meshes sit on his head.
    const hen = redressCat(buildCat('hagrid', BARE), 'hagrid', { ...BARE, head: 'acorncap' });
    const cap = hen.userData.parts.head.children.filter((o) => o.isMesh && [0x8a5a2b, 0x5a3a1c].includes(o.material?.color?.getHex?.()));
    expect(cap).toHaveLength(2);
    expect(hen.userData.breed).toBe('hagrid');
    expect(fingerprintCat(posed(hen))).toEqual(fingerprintCat(posed(buildCat('hagrid', { ...BARE, head: 'acorncap' }))));
    // A custom look keeps its coat.
    const look = { ...DEFAULT_LOOK, coat: 'silver', pattern: 'patches', fur: 'fluffy', size: 1.15 };
    const mine = redressCat(buildCat('tabby', BARE, { look }), 'tabby', { ...BARE, head: 'acorncap' }, { look });
    expect(fingerprintCat(posed(mine))).toEqual(fingerprintCat(posed(buildCat('tabby', { ...BARE, head: 'acorncap' }, { look }))));
    expect(fingerprintCat(posed(mine))).not.toEqual(fingerprintCat(posed(buildCat('tabby', { ...BARE, head: 'acorncap' }))));
  });

  it('forgets the old build\'s caches (a fight rig, the swim measure), so they are made again for the new one', () => {
    const cat = buildCat('hagrid', BARE);
    cat.userData.henRig = { bodyGeo: new THREE.BufferGeometry(), winglessGeo: new THREE.BufferGeometry(), wings: [] };
    cat.userData.waterFit = { torsoMin: 0, torsoH: 1 };
    let spare = 0; cat.userData.henRig.winglessGeo.addEventListener('dispose', () => { spare += 1; });
    redressCat(cat, 'hagrid', { ...BARE, head: 'acorncap' });
    expect(cat.userData.henRig).toBeUndefined();
    expect(cat.userData.waterFit).toBeUndefined();
    expect(spare).toBe(1);
  });

  it.each([...Object.keys(CATALOG.cats)])('buildCat makes no Sprite or Light for %s, so the keep rule is safe', (breed) => {
    const c = buildCat(breed, BARE); c.traverse((o) => { expect(o.isSprite || o.isLight).toBeFalsy(); });
  });
});
