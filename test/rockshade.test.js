import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { patchRockMaterial, ROCK_SHADE, TALUS_TINT, ROCK_FRAGMENT } from '../src/world/rockshade.js';

// A fresh copy of three's standard shader, as onBeforeCompile receives it.
const standard = () => ({
  vertexShader: THREE.ShaderLib.standard.vertexShader,
  fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  uniforms: {},
});

// The source after an anchor, up to the next #include.
const after = (src, anchor) => {
  const i = src.indexOf(anchor);
  if (i < 0) return '';
  const rest = src.slice(i + anchor.length);
  const j = rest.indexOf('#include');
  return j < 0 ? rest : rest.slice(0, j);
};

describe('rock shader patch', () => {
  it('every injection lands in three 0.185 standard shaders', () => {
    const mat = patchRockMaterial(new THREE.MeshStandardMaterial({ vertexColors: true }));
    const shader = standard();
    mat.onBeforeCompile(shader);
    const base = standard();
    expect(shader.vertexShader).not.toBe(base.vertexShader);
    expect(shader.fragmentShader).not.toBe(base.fragmentShader);
    // the vertex anchor gained the varyings' assignment
    const vAnchor = shader.vertexShader.includes('#include <worldpos_vertex>') ? '#include <worldpos_vertex>' : '#include <project_vertex>';
    expect(after(shader.vertexShader, vAnchor)).toContain('vRockW');
    expect(after(shader.vertexShader, vAnchor)).toContain('vRockN');
    // the colour and the normal anchors both gained code
    expect(after(shader.fragmentShader, '#include <color_fragment>')).not.toBe(after(base.fragmentShader, '#include <color_fragment>'));
    expect(after(shader.fragmentShader, '#include <normal_fragment_maps>')).not.toBe(after(base.fragmentShader, '#include <normal_fragment_maps>'));
    for (const src of [shader.vertexShader, shader.fragmentShader]) {
      expect(src).toContain('vRockW');
      expect(src).toContain('vRockN');
    }
    // every anchor is still there (the patch adds after them, never removes)
    for (const a of ['#include <worldpos_vertex>', '#include <common>']) expect(shader.vertexShader).toContain(a);
    for (const a of ['#include <color_fragment>', '#include <normal_fragment_maps>', '#include <common>']) {
      expect(shader.fragmentShader).toContain(a);
    }
  });

  it('chains a previous onBeforeCompile', () => {
    const mat = new THREE.MeshStandardMaterial();
    let called = 0;
    mat.onBeforeCompile = () => { called++; };
    patchRockMaterial(mat);
    mat.onBeforeCompile(standard());
    expect(called).toBe(1);
  });

  it('combines an earlier cache key set on the material', () => {
    const mat = new THREE.MeshStandardMaterial();
    mat.customProgramCacheKey = () => 'earlier-';
    expect(patchRockMaterial(mat).customProgramCacheKey()).toBe('earlier-gorge-rock-v3');
  });

  it('every derivative is taken outside any branch', () => {
    expect(ROCK_FRAGMENT).toMatch(/fwidth/);
    expect(ROCK_FRAGMENT).not.toMatch(/\bif\s*\(/);
  });

  it('the patch is shared and cheap', () => {
    const a = patchRockMaterial(new THREE.MeshStandardMaterial());
    const b = patchRockMaterial(new THREE.MeshStandardMaterial({ color: 0x123456 }));
    expect(a.customProgramCacheKey()).toBe('gorge-rock-v3');
    expect(b.customProgramCacheKey()).toBe(a.customProgramCacheKey());
    expect(patchRockMaterial(new THREE.MeshStandardMaterial(), { flutes: false }).customProgramCacheKey()).toBe('gorge-rock-v3-nf');
    // The injected fragment code: at most 3 noise calls (the definition aside), no loops, no sin hash.
    const calls = (ROCK_FRAGMENT.match(/\bvnoise\s*\(/g) ?? []).length - (ROCK_FRAGMENT.match(/float\s+vnoise\s*\(/g) ?? []).length;
    expect(calls).toBeGreaterThan(0);
    expect(calls).toBeLessThanOrEqual(3);
    expect(ROCK_FRAGMENT).not.toMatch(/\bfor\s*\(/);
    expect(ROCK_FRAGMENT).not.toMatch(/\bwhile\s*\(/);
    expect(ROCK_FRAGMENT).not.toMatch(/\bsin\s*\(/);
    expect(ROCK_FRAGMENT).not.toMatch(/texture/);
    expect(ROCK_FRAGMENT).toMatch(/highp/);
  });

  it('its numbers are frozen and the talus tint is a damp cool brown', () => {
    expect(Object.isFrozen(ROCK_SHADE)).toBe(true);
    expect(TALUS_TINT).toBe(0x6e6355); // the damp foot (polish-gorgewall)
  });
});
