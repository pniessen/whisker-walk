import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import { buildCat, darkFace, catStyle } from '../src/cat/model.js';
import { RIM, addCatRim, setCatRimLight, catRimState } from '../src/cat/rimlight.js';

// polish-catlight (Pass 10): a sky rim on the walking cats' fur.
const rimOf = (m) => m?.material?.userData?.catRim?.value;

function compile(material) {
  const shader = {
    uniforms: {},
    vertexShader: '',
    fragmentShader: '#include <common>\nvoid main() {\n#include <opaque_fragment>\n}',
  };
  material.onBeforeCompile(shader, null);
  return shader;
}

describe('cat rim light', () => {
  afterEach(() => setCatRimLight({ dusk: false }));

  it('gives the fur the rim: light strength on a tabby, dark strength on the black cat', () => {
    expect(darkFace(catStyle('black'))).toBe(true);
    for (const [breed, want] of [['tabby', RIM.light], ['black', RIM.dark], ['siamese', RIM.light], ['zeetoo', RIM.light]]) {
      const cat = buildCat(breed);
      const { body, underside, head, legs, tailPivots, earL, earR } = cat.userData.parts;
      const fur = [body, underside, earL, earR, ...legs.flatMap((l) => l.children.slice(0, 2))];
      for (const p of tailPivots) expect(rimOf(p.children.find((c) => c.isMesh))).toBeCloseTo(want * RIM.tail, 10);
      const skull = head.children[0], muzzle = head.children[1];
      fur.push(skull, muzzle);
      for (const m of fur) expect(rimOf(m), `${breed} ${m.name}`).toBe(want);
      // head markings (the tabby M) ride the skull and get it too
      for (const c of skull.children) if (c.isMesh) expect(rimOf(c)).toBe(want);
    }
  });

  it('leaves the eyes, nose, inner ears, whiskers and accessories alone', () => {
    const cat = buildCat('black', { head: 'crown', collar: 'bell' });
    const { head, whiskers } = cat.userData.parts;
    const nose = head.children.find((c) => c.userData.nose);
    expect(rimOf(nose)).toBeUndefined();
    const eyes = head.children.filter((m) => m.isMesh && m.geometry.parameters?.radius === 0.036);
    expect(eyes).toHaveLength(2);
    for (const e of eyes) expect(rimOf(e)).toBeUndefined();
    for (const w of whiskers) expect(w.material.userData.catRim).toBeUndefined();
    const hat = [];
    cat.traverse((o) => { if (o.userData.hat) hat.push(o); });
    expect(hat).toHaveLength(1);
    expect(rimOf(hat[0])).toBeUndefined();
  });

  it('Hagrid gets the light rim on his painted feathers', () => {
    const hen = buildCat('hagrid');
    expect(rimOf(hen.userData.parts.body)).toBe(RIM.light);
  });

  it('reads the scene hemisphere sky, so a scene with no hemisphere light (the stage) gets no rim', () => {
    const m = new THREE.MeshStandardMaterial();
    addCatRim([m], { dark: true });
    const s = compile(m);
    expect(s.fragmentShader).toContain('#if NUM_HEMI_LIGHTS > 0');
    expect(s.fragmentShader).toContain('hemisphereLights[ 0 ].skyColor');
    expect(s.fragmentShader).toContain('#include <opaque_fragment>');
    // screened, capped: never pushes a channel over 1
    expect(s.fragmentShader).toContain('1.0 - outgoingLight');
    expect(RIM.max).toBeLessThan(1);
    expect(s.uniforms.catRimStrength.value).toBe(RIM.dark);
    // every rim material shares one program
    const n = new THREE.MeshStandardMaterial({ vertexColors: true });
    addCatRim([n]);
    expect(n.customProgramCacheKey()).toBe(m.customProgramCacheKey());
  });

  it('is idempotent and skips non-standard materials', () => {
    const m = new THREE.MeshStandardMaterial();
    addCatRim([m], { dark: true });
    const f = m.onBeforeCompile;
    addCatRim([m]);
    expect(m.onBeforeCompile).toBe(f);
    expect(m.userData.catRim.value).toBe(RIM.dark);
    const line = new THREE.LineBasicMaterial();
    addCatRim([line]);
    expect(line.userData.catRim).toBeUndefined();
  });

  it('dusk makes the rim weaker and cooler, and a day walk resets it', () => {
    const m = new THREE.MeshStandardMaterial();
    addCatRim([m]);
    const s = compile(m);
    setCatRimLight({ dusk: true });
    expect(s.uniforms.catRimGain.value).toBe(RIM.dusk);
    expect(s.uniforms.catRimGain.value).toBeLessThan(1);
    expect(s.uniforms.catRimCool.value).toBeGreaterThan(0);
    setCatRimLight({ dusk: false });
    expect(catRimState()).toEqual({ gain: 1, cool: 0 });
  });
});
