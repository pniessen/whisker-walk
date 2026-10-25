import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  SUN_COLOR, SUN_POSITION, SUN_INTENSITY, SUN_BIAS,
  HEMI_SKY, HEMI_INTENSITY, DEFAULT_GROUND_BOUNCE,
  CAST_FLAT_HEIGHT, CAST_TALL_HEIGHT, CAST_WIDE_SPAN,
  createSun, createFill, isTransparentMat, castsFromBox, assignShadowCasters,
} from '../src/render/rig.js';

// render/rig.js is the one lighting rig the game (game/walk.js), the budget
// test and the verify harnesses all build from. Like shadowfit.js it touches no
// DOM and no WebGL, so this file needs no canvas stub.

describe('the rig constants', () => {
  it('constants match the values walk.js shipped', () => {
    expect(SUN_COLOR).toBe(0xfff2d8);
    expect(SUN_POSITION).toEqual([-36, 15, -24]);
    expect(SUN_INTENSITY).toBe(3.0);
    expect(SUN_BIAS).toBe(-0.00015);
    expect(HEMI_SKY).toBe(0xbfd8ff);
    expect(HEMI_INTENSITY).toBe(0.45);
    expect(DEFAULT_GROUND_BOUNCE).toBe(0x9a9086);
    expect(CAST_FLAT_HEIGHT).toBe(0.12);
    expect(CAST_TALL_HEIGHT).toBe(1.3);
    expect(CAST_WIDE_SPAN).toBe(1.0);
  });
});

describe('the lights', () => {
  it('createSun builds the key light at its calibrated position, intensity and colour', () => {
    const sun = createSun();
    expect(sun).toBeInstanceOf(THREE.DirectionalLight);
    expect(sun.position.toArray()).toEqual(SUN_POSITION);
    expect(sun.intensity).toBe(SUN_INTENSITY);
    expect(sun.color.getHex()).toBe(SUN_COLOR);
  });

  it('createFill takes the area bounce, and falls back to DEFAULT_GROUND_BOUNCE', () => {
    const fill = createFill(undefined);
    expect(fill).toBeInstanceOf(THREE.HemisphereLight);
    expect(fill.color.getHex()).toBe(HEMI_SKY);
    expect(fill.groundColor.getHex()).toBe(DEFAULT_GROUND_BOUNCE);
    expect(fill.intensity).toBe(HEMI_INTENSITY);
    expect(createFill(0x557733).groundColor.getHex()).toBe(0x557733);
  });
});

const boxOf = (w, h, d) => new THREE.Box3(
  new THREE.Vector3(-w / 2, 0, -d / 2),
  new THREE.Vector3(w / 2, h, d / 2),
);

describe('castsFromBox — the caster eligibility rule', () => {
  it('a 0.10 m tall wide box is flat and does not cast', () => {
    expect(castsFromBox(boxOf(5, 0.10, 5))).toBe(false);
  });
  it('a 1.4 m tall thin box is tall and casts', () => {
    expect(castsFromBox(boxOf(0.2, 1.4, 0.2))).toBe(true);
  });
  it('a 0.5 m tall 1.2 m wide box is wide and casts', () => {
    expect(castsFromBox(boxOf(1.2, 0.5, 0.3))).toBe(true);
  });
  it('a 0.5 m tall 0.5 m wide box is neither and does not cast', () => {
    expect(castsFromBox(boxOf(0.5, 0.5, 0.5))).toBe(false);
  });
  it('an empty box does not cast', () => {
    expect(castsFromBox(new THREE.Box3())).toBe(false);
  });
});

describe('isTransparentMat', () => {
  it('is array-aware', () => {
    const opaque = new THREE.MeshStandardMaterial();
    const clear = new THREE.MeshStandardMaterial({ transparent: true });
    expect(isTransparentMat(opaque)).toBe(false);
    expect(isTransparentMat(clear)).toBe(true);
    expect(isTransparentMat([opaque, clear])).toBe(true);
    expect(isTransparentMat([opaque, opaque])).toBe(false);
    expect(isTransparentMat(undefined)).toBe(false);
  });
});

describe('assignShadowCasters', () => {
  it('casts from the tall opaque box only, receives everywhere, and leaves the decal alone', () => {
    const scene = new THREE.Scene();
    const mesh = (w, h, d, material = new THREE.MeshStandardMaterial()) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      m.position.y = h / 2;
      scene.add(m);
      return m;
    };
    const tall = mesh(0.3, 2, 0.3);
    const flat = mesh(4, 0.05, 4);
    const glass = mesh(0.3, 2, 0.3, new THREE.MeshStandardMaterial({ transparent: true }));
    const decal = mesh(3, 2, 3);
    decal.userData.contactDecal = true;
    decal.castShadow = false;
    decal.receiveShadow = false;
    scene.add(new THREE.DirectionalLight());

    const result = assignShadowCasters(scene);

    expect(result.casters).toBe(1);
    expect(result.meshes).toBe(3);
    expect(tall.castShadow).toBe(true);
    expect(flat.castShadow).toBe(false);
    expect(glass.castShadow).toBe(false);
    for (const m of [tall, flat, glass]) expect(m.receiveShadow).toBe(true);
    expect(decal.castShadow).toBe(false);
    expect(decal.receiveShadow).toBe(false);
  });
});

describe('walk.js builds from the rig', () => {
  const walkSrc = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');

  it("walk.js source no longer defines SUN_INTENSITY / CAST_FLAT_HEIGHT and imports from '../render/rig.js'", () => {
    expect(walkSrc).not.toMatch(/const SUN_INTENSITY\s*=/);
    expect(walkSrc).not.toMatch(/const CAST_FLAT_HEIGHT\s*=/);
    expect(walkSrc).toMatch(/^import \{[^}]*\} from '\.\.\/render\/rig\.js';$/m);
  });
});
