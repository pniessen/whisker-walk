import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCat, coatColor } from '../src/cat/model.js';
import { DEFAULT_LOOK, PATTERNS, FURS, COATS, MARKS, EYES } from '../src/customcats.js';
import { fingerprintCat, meshCount, triangles, PRESETS } from './helpers/catfingerprint.js';

const looks = () => PATTERNS.flatMap(([pattern]) => FURS.map(([fur]) => ({ ...DEFAULT_LOOK, pattern, fur, size: 1.15 })));

describe('custom looks', () => {
  it('every pattern × fur stays under 31 meshes full and 25 simple, and under the triangle caps', () => {
    for (const look of looks()) for (const breed of ['tabby', 'mainecoon']) {
      expect(meshCount(buildCat(breed, undefined, { look })), JSON.stringify(look)).toBeLessThanOrEqual(31);
      expect(meshCount(buildCat(breed, undefined, { look, simple: true }))).toBeLessThanOrEqual(25);
      expect(triangles(buildCat(breed, undefined, { look }))).toBeLessThanOrEqual(9000); // R4: the smooth legs and the ruff need the 9,000 ceiling
      expect(triangles(buildCat(breed, undefined, { look, simple: true }))).toBeLessThanOrEqual(5500);
    }
  });
  it('a scarred look (two scars) stays under 32 meshes full and 26 simple, and under the triangle caps', () => {
    const scars = [{ site: 'face', stage: 'full', side: 'l' }, { site: 'hind', stage: 'half', side: 'r' }];
    for (const look of looks()) for (const breed of ['tabby', 'mainecoon']) {
      expect(meshCount(buildCat(breed, undefined, { look, scars })), JSON.stringify(look)).toBeLessThanOrEqual(32);
      expect(meshCount(buildCat(breed, undefined, { look, scars, simple: true }))).toBeLessThanOrEqual(26);
      expect(triangles(buildCat(breed, undefined, { look, scars }))).toBeLessThanOrEqual(9000); // R4: the smooth legs and the ruff need the 9,000 ceiling
      expect(triangles(buildCat(breed, undefined, { look, scars, simple: true }))).toBeLessThanOrEqual(5500);
    }
  });
  it('colours never change the mesh count', () => {
    const n = meshCount(buildCat('tabby', undefined, { look: DEFAULT_LOOK }));
    for (const coat of Object.keys(COATS)) for (const marks of Object.keys(MARKS)) {
      expect(meshCount(buildCat('tabby', undefined, { look: { ...DEFAULT_LOOK, coat, marks } }))).toBe(n);
    }
  });
  it('the same look builds byte-identically, full and simple', () => {
    for (const look of looks()) for (const simple of [false, true]) {
      expect(fingerprintCat(buildCat('calico', undefined, { look, simple }))).toEqual(fingerprintCat(buildCat('calico', undefined, { look, simple })));
    }
  });
  it('a look draws its eyes, and a preset keeps its own', () => {
    const eyeHex = (cat) => cat.userData.parts.head.children.find((m) => m.isMesh && m.geometry.parameters?.radius === 0.036).material.color.getHex();
    expect(eyeHex(buildCat('siamese', undefined, { look: { ...DEFAULT_LOOK, eyes: 'copper' } }))).toBe(EYES.copper.hex);
    expect(eyeHex(buildCat('siamese'))).toBe(0x68a8d8);
  });
  it('patches use the markings colour alone, head patch included', () => {
    const cat = buildCat('calico', undefined, { look: { ...DEFAULT_LOOK, pattern: 'patches', marks: 'grey' } });
    const skullMarks = [];
    cat.userData.parts.head.traverse((o) => { if (o.isMesh && o.parent?.isMesh) skullMarks.push(o.material.color.getHex()); });
    expect(skullMarks).toContain(MARKS.grey.hex);
    expect(skullMarks).not.toContain(0xd88030);
  });
  it('long-haired thickens the tail without adding meshes', () => {
    const r = (fur) => new THREE.Box3().setFromObject(buildCat('tabby', undefined, { look: { ...DEFAULT_LOOK, fur } }).userData.parts.tail).getSize(new THREE.Vector3()).x;
    expect(r('long')).toBeGreaterThan(r('short') * 1.2);
    expect(meshCount(buildCat('tabby', undefined, { look: { ...DEFAULT_LOOK, fur: 'long' } }).userData.parts.tail)).toBe(5);
  });
  it('size is the group scale', () => {
    expect(buildCat('tabby', undefined, { look: { ...DEFAULT_LOOK, size: 0.85 } }).scale.x).toBe(0.85);
  });
  it('coatColor reads the look', () => {
    expect(coatColor('tabby', { ...DEFAULT_LOOK, coat: 'apricot' })).toBe(COATS.apricot.hex);
    expect(coatColor('tabby')).toBe(0x9c7a4f);
  });
  it('a breed given with a look never reads its own row', () => {
    for (const b of PRESETS) expect(() => buildCat(b, undefined, { look: DEFAULT_LOOK })).not.toThrow();
  });
});
