import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import { buildCat, darkFace, catStyle } from '../src/cat/model.js';
import { RIM, FUR, addCatRim, setCatRimLight, catRimState, catFurState } from '../src/cat/rimlight.js';
import { setTextureTier } from '../src/render/textures.js';

// polish-catlight (Pass 10): a sky rim on the walking cats' fur.
const rimOf = (m) => m?.material?.userData?.catRim?.value;

function compile(material) {
  const shader = {
    uniforms: {},
    vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\n}',
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

// cat realism B8: fur grain and sheen, in the same shader add-on.
describe('cat fur grain and sheen', () => {
  afterEach(() => { setTextureTier('high'); setCatRimLight({ dusk: false }); });

  // draw a built cat's fur once, the way the renderer would
  const frame = (cat) => {
    cat.traverse((o) => { if (o.isMesh && o.material.userData?.catFur) o.material.onBeforeRender(null, null, null, o.geometry, o, null); });
    return cat;
  };
  const furOf = (mesh) => mesh.material.userData.catFur;

  it('is worked out in the shader: no picture, no extra attribute, and it sits before the rim', () => {
    const m = new THREE.MeshStandardMaterial();
    addCatRim([m]);
    const s = compile(m);
    expect(s.fragmentShader).not.toMatch(/texture2D|texture\(|sampler2D/);
    expect(s.vertexShader).not.toMatch(/attribute|\bin\s+vec/);
    expect(s.vertexShader).toContain('vCatFur = ');
    expect(s.vertexShader).toContain('position - catFurA.xyz');
    expect(s.fragmentShader.indexOf('furFade')).toBeGreaterThan(0);
    expect(s.fragmentShader.indexOf('furFade')).toBeLessThan(s.fragmentShader.indexOf('rimSky'));
    expect(s.fragmentShader.match(/#include <opaque_fragment>/g)).toHaveLength(1);
    // zero-mean grain on the lit colour; the sheen screened on and capped
    expect(s.fragmentShader).toContain('outgoingLight *= 1.0 + ');
    expect(s.fragmentShader).toContain('furSheen * max( vec3( 0.0 ), 1.0 - outgoingLight )');
    expect(FUR.sheenMax).toBeLessThan(1);
    expect(FUR.grain).toBeLessThan(0.2);
  });

  it('fades by how many pixels a line covers, and keeps derivatives out of per-pixel branches', () => {
    const m = new THREE.MeshStandardMaterial();
    addCatRim([m]);
    const frag = compile(m).fragmentShader;
    expect(frag.match(/fwidth|dFdx|dFdy/g)).toEqual(['fwidth']);
    // the one fwidth comes after the tier gate (a uniform, so the same for
    // every pixel) and before the per-pixel fade branch
    const gate = frag.indexOf('if ( catFurOn * catFurC.x > 0.0 )');
    const fw = frag.indexOf('fwidth( vCatFur )');
    const branch = frag.indexOf('if ( furFade > 0.0 )');
    expect(gate).toBeGreaterThan(0);
    expect(fw).toBeGreaterThan(gate);
    expect(branch).toBeGreaterThan(fw);
    expect(FUR.fadeHi).toBeLessThanOrEqual(1); // gone by the time a line is one pixel wide
    expect(FUR.fadeLo).toBeLessThan(FUR.fadeHi);
  });

  it('is off on a walk at the low tier and on at the others; a scene with no hemisphere light always shows it', () => {
    const m = new THREE.MeshStandardMaterial();
    addCatRim([m]);
    const s = compile(m);
    expect(catFurState().on).toBe(true);
    setTextureTier('low');
    setCatRimLight({ dusk: false });
    expect(s.uniforms.catFurOn.value).toBe(0);
    expect(catFurState().on).toBe(false);
    setCatRimLight({ dusk: true, fur: true });
    expect(s.uniforms.catFurOn.value).toBe(1);
    setTextureTier('high');
    setCatRimLight({ dusk: true });
    expect(s.uniforms.catFurOn.value).toBe(1);
    setCatRimLight({ fur: false });
    expect(s.uniforms.catFurOn.value).toBe(0);
    expect(s.fragmentShader).toMatch(/#if NUM_HEMI_LIGHTS > 0\s+if \( catFurOn \* catFurC\.x > 0\.0 \)\s+#else\s+if \( catFurC\.x > 0\.0 \)\s+#endif/);
  });

  it('one shared program and one shared tier switch for every fur material, whatever the tier', () => {
    const a = new THREE.MeshStandardMaterial(), b = new THREE.MeshStandardMaterial({ vertexColors: true });
    addCatRim([a]);
    setTextureTier('low');
    setCatRimLight();
    addCatRim([b], { dark: true });
    const sa = compile(a), sb = compile(b);
    expect(a.customProgramCacheKey()).toBe(b.customProgramCacheKey());
    expect(sa.fragmentShader).toBe(sb.fragmentShader);
    expect(sa.vertexShader).toBe(sb.vertexShader);
    expect(sa.uniforms.catFurOn).toBe(sb.uniforms.catFurOn);
    expect(a.defines ?? {}).toEqual(b.defines ?? {});
    // the frame is per part
    expect(sa.uniforms.catFurC).not.toBe(sb.uniforms.catFurC);
  });

  it('measures each part once, on its first draw, then runs nothing per frame', () => {
    const cat = buildCat('tabby');
    const { body, legs } = cat.userData.parts;
    const m = body.material;
    expect(furOf(body).c.value.x).toBe(0); // no fur until it is drawn
    expect(Object.hasOwn(m, 'onBeforeRender')).toBe(true);
    frame(cat);
    expect(m.onBeforeRender).toBe(THREE.Material.prototype.onBeforeRender);
    const before = furOf(body).c.value.clone();
    expect(before.x).toBeGreaterThan(100);
    m.onBeforeRender(null, null, null, body.geometry, legs[0].children[0], null);
    expect(furOf(body).c.value.equals(before)).toBe(true);
  });

  it('runs the lines along each part: z on the body, head, tail and paws, y down the legs and up the ears', () => {
    const cat = frame(buildCat('tabby'));
    const { body, underside, head, legs, tailPivots, earL, earR } = cat.userData.parts;
    const alongY = (mesh) => furOf(mesh).a.value.w;
    for (const m of [body, underside, head.children[0], head.children[1]]) expect(alongY(m)).toBe(0);
    for (const p of tailPivots) expect(alongY(p.children.find((c) => c.isMesh))).toBe(0);
    for (const leg of legs) {
      expect(alongY(leg.children[0])).toBe(1);
      expect(alongY(leg.userData.paw)).toBe(0);
    }
    for (const e of [earL, earR]) expect(alongY(e)).toBe(1);
    // a line is about FUR.width wide on every part, thick or thin
    for (const mesh of [body, legs[0].children[0], tailPivots[2].children.find((c) => c.isMesh)]) {
      const c = furOf(mesh).c.value;
      expect((2 * Math.PI * c.y) / c.x).toBeCloseTo(FUR.width, 3);
      expect(Number.isInteger(c.x)).toBe(true);
    }
  });

  it('a long-haired coat gets wider, longer lines; a kitten-sized or simple cat is framed the same way', () => {
    const tabby = frame(buildCat('tabby')), persian = frame(buildCat('persian')), coon = frame(buildCat('mainecoon'));
    const lines = (cat) => furOf(cat.userData.parts.body).c.value.x;
    const freq = (cat) => furOf(cat.userData.parts.body).b.value.w;
    expect(freq(tabby)).toBeCloseTo(1 / FUR.length, 6);
    for (const long of [persian, coon]) {
      expect(freq(long)).toBeCloseTo(1 / (FUR.length * FUR.longLength), 6);
      expect(lines(long)).toBeLessThan(lines(tabby));
    }
    const simple = frame(buildCat('tabby', undefined, { simple: true }));
    expect(lines(simple)).toBe(lines(tabby));
  });

  it('Hagrid keeps his rim but gets no fur; a material outside a cat gets none either', () => {
    const hen = frame(buildCat('hagrid'));
    expect(rimOf(hen.userData.parts.body)).toBe(RIM.light);
    expect(furOf(hen.userData.parts.body).c.value.x).toBe(0);
    const loose = new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshStandardMaterial());
    addCatRim([loose.material]);
    loose.material.onBeforeRender(null, null, null, loose.geometry, loose, null);
    expect(furOf(loose).c.value.x).toBe(0);
  });

  it('the family cats, the black cat and a builder coat take the fur without a change to their colours', () => {
    for (const breed of ['robbie', 'zeetoo', 'd2', 'digit', 'black', 'siamese', 'calico']) {
      const bare = buildCat(breed);
      const colours = [];
      bare.traverse((o) => { if (o.isMesh) colours.push(o.material.color.getHex()); });
      const cat = frame(buildCat(breed));
      const after = [];
      cat.traverse((o) => { if (o.isMesh) after.push(o.material.color.getHex()); });
      expect(after).toEqual(colours);
      expect(furOf(cat.userData.parts.body).c.value.x).toBeGreaterThan(100);
    }
  });
});
