import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { DUSK, duskLook, applyDusk, duskEnv, addCollarGlow, duskLawnColor, tintDuskLawn, LAMP_LOOK, createLampPools } from '../src/render/dusk.js';
import {
  createSun, createFill, SUN_COLOR, SUN_INTENSITY, HEMI_SKY, HEMI_INTENSITY,
} from '../src/render/rig.js';

const area = { skyDusk: { top: 0x26344f, horizon: 0x5f5a72 }, groundBounce: 0x6a8a4a };
const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

describe('duskLook', () => {
  it('defaults to DUSK and merges per-area overrides', () => {
    expect(duskLook({})).toEqual(DUSK);
    const l = duskLook({ duskLight: { sunColor: 1 } });
    expect(l.sunColor).toBe(1);
    expect(l.sunIntensity).toBe(DUSK.sunIntensity);
    expect(Object.isFrozen(l)).toBe(true);
    expect(Object.isFrozen(DUSK)).toBe(true);
  });
});

describe('applyDusk', () => {
  it('warms and dims the sun, cools the fill, dims the ground bounce, sets fog', () => {
    const scene = new THREE.Scene();
    const sun = createSun();
    const fill = createFill(area.groundBounce);
    applyDusk({ scene, sun, fill, areaData: area });
    expect(sun.intensity).toBe(0.8);
    expect(sun.intensity).toBeLessThan(SUN_INTENSITY);
    const day = new THREE.Color(SUN_COLOR);
    expect(sun.color.g / sun.color.r).toBeLessThan(day.g / day.r);
    expect(sun.color.b / sun.color.r).toBeLessThan(day.b / day.r);
    expect(fill.color.b).toBeGreaterThan(fill.color.r);
    expect(lum(fill.color)).toBeLessThan(lum(new THREE.Color(HEMI_SKY)));
    const g = new THREE.Color(area.groundBounce);
    expect(fill.groundColor.r).toBeCloseTo(g.r * 0.55, 6);
    expect(fill.groundColor.g).toBeCloseTo(g.g * 0.55, 6);
    expect(fill.groundColor.b).toBeCloseTo(g.b * 0.55, 6);
    expect(fill.intensity).toBe(DUSK.hemiIntensity);
    expect(scene.fog.color.getHex()).toBe(area.skyDusk.horizon);
    expect(scene.fog.near).toBe(30);
    expect(scene.fog.far).toBe(110);
    expect(scene.background).toBeTruthy();
  });

  it('leaves nothing global behind', () => {
    applyDusk({ scene: new THREE.Scene(), sun: createSun(), fill: createFill(), areaData: area });
    const sun = createSun();
    const fill = createFill();
    expect(sun.color.getHex()).toBe(SUN_COLOR);
    expect(sun.intensity).toBe(SUN_INTENSITY);
    expect(fill.color.getHex()).toBe(HEMI_SKY);
    expect(fill.intensity).toBe(HEMI_INTENSITY);
  });
});

describe('duskEnv / addCollarGlow', () => {
  it('scales image light', () => {
    expect(duskEnv(1.0, DUSK)).toBe(0.45);
  });
  it('adds a shadowless PointLight to the cat', () => {
    const group = new THREE.Group();
    const l = addCollarGlow(group, DUSK);
    expect(group.getObjectByName('collarGlow')).toBe(l);
    expect(l.isPointLight).toBe(true);
    expect(l.castShadow).toBe(false);
    expect(l.color.getHex()).toBe(0x7ef2c0);
    expect(l.position.y).toBe(0.45);
    expect(l.intensity).toBe(1.6);
    expect(l.distance).toBe(4);
    expect(l.decay).toBe(2);
  });
});

describe('dusk lawns', () => {
  const sat = (c) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
  it('duskLawnColor is darker, less saturated and cooler', () => {
    const c = new THREE.Color(0.3, 0.6, 0.2);
    const d = duskLawnColor(c, duskLook({}));
    expect(d).not.toBe(c);
    expect(d.r).toBeLessThanOrEqual(c.r);
    expect(d.g).toBeLessThanOrEqual(c.g);
    expect(sat(d)).toBeLessThan(sat(c));
    expect(d.b / d.g).toBeGreaterThan(c.b / c.g);
  });
  const mk = () => {
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.3, 0.6, 0.2) });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    return { mat, mesh };
  };
  it('swaps in a tinted clone, tints grass in place, and restores exactly once', () => {
    const { mat, mesh } = mk();
    const before = mat.color.toArray();
    const grass = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.25, 0.55, 0.15) });
    const grassBefore = grass.color.toArray();
    const look = duskLook({});
    const h = tintDuskLawn({ ground: [mesh], grass, look });
    const clone = mesh.material;
    expect(clone).not.toBe(mat);
    expect(clone.color.toArray()).toEqual(duskLawnColor(new THREE.Color(...before), look).toArray());
    expect(mat.color.toArray()).toEqual(before);
    expect(grass.color.toArray()).not.toEqual(grassBefore);
    let n = 0;
    const orig = clone.dispose.bind(clone);
    clone.dispose = () => { n++; orig(); };
    h.dispose();
    expect(mesh.material).toBe(mat);
    expect(n).toBe(1);
    expect(grass.color.toArray()).toEqual(grassBefore);
    h.dispose();
    expect(n).toBe(1);
    expect(grass.color.toArray()).toEqual(grassBefore);
  });
  it('a vertex-coloured mesh is desaturated per vertex and its colour attribute restored', () => {
    const geo = new THREE.PlaneGeometry(1, 1);
    const n = geo.attributes.position.count;
    const cols = new Float32Array(n * 3);
    for (let v = 0; v < n; v++) cols.set([0.2 + 0.1 * v, 0.7 - 0.05 * v, 0.1 + 0.03 * v], v * 3);
    const attr = new THREE.BufferAttribute(cols, 3);
    geo.setAttribute('color', attr);
    const before = Array.from(cols);
    for (const matColor of [0xffffff, 0x88cc66]) {
      const mat = new THREE.MeshStandardMaterial({ color: matColor, vertexColors: true });
      const mesh = new THREE.Mesh(geo, mat);
      const look = duskLook({});
      const h = tintDuskLawn({ ground: [mesh], grass: null, look });
      expect(mesh.geometry).toBe(geo);
      const tc = geo.getAttribute('color');
      expect(tc).not.toBe(attr);
      const m = mat.color; const t = mesh.material.color;
      for (let v = 0; v < n; v++) {
        const eff = new THREE.Color(m.r * attr.getX(v), m.g * attr.getY(v), m.b * attr.getZ(v));
        const want = duskLawnColor(eff, look);
        expect(Math.abs(t.r * tc.getX(v) - want.r)).toBeLessThan(1e-6);
        expect(Math.abs(t.g * tc.getY(v) - want.g)).toBeLessThan(1e-6);
        expect(Math.abs(t.b * tc.getZ(v) - want.b)).toBeLessThan(1e-6);
      }
      // really desaturated: the vertex green/red ratio drops, not just scales
      expect((t.g * tc.getY(0)) / (t.r * tc.getX(0))).toBeLessThan((m.g * attr.getY(0)) / (m.r * attr.getX(0)));
      h.dispose();
      expect(geo.getAttribute('color')).toBe(attr);
      expect(Array.from(attr.array)).toEqual(before);
      expect(mesh.material).toBe(mat);
      h.dispose();
      expect(geo.getAttribute('color')).toBe(attr);
    }
  });
  it('a ground mesh\'s duskTint descendants (the horizon band\'s edge) are tinted per vertex with it, and restored', () => {
    const vc = (n, f) => {
      const a = new Float32Array(n * 3);
      for (let v = 0; v < n; v++) a.set(f(v), v * 3);
      return new THREE.BufferAttribute(a, 3);
    };
    const bandGeo = new THREE.PlaneGeometry(1, 1);
    bandGeo.setAttribute('color', vc(bandGeo.attributes.position.count, (v) => [0.3, 0.6 - 0.05 * v, 0.2]));
    const bandMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true });
    const band = new THREE.Mesh(bandGeo, bandMat);
    const edgeGeo = new THREE.BoxGeometry(1, 1, 1);
    const n = edgeGeo.attributes.position.count;
    const edgeAttr = vc(n, (v) => [0.25 + 0.01 * v, 0.55, 0.15]);
    edgeGeo.setAttribute('color', edgeAttr);
    const edgeBefore = Array.from(edgeAttr.array);
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true });
    const edge = new THREE.Mesh(edgeGeo, edgeMat);
    edge.userData.duskTint = true;
    // A child without the flag is not the lawn's business.
    const otherMat = new THREE.MeshStandardMaterial({ color: 0x88cc66 });
    const other = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), otherMat);
    band.add(edge, other);
    const look = duskLook({});
    const h = tintDuskLawn({ ground: [band], grass: null, look });
    expect(other.material).toBe(otherMat);
    expect(edge.material).not.toBe(edgeMat);
    expect(edge.geometry).toBe(edgeGeo);
    const tc = edgeGeo.getAttribute('color');
    expect(tc).not.toBe(edgeAttr);
    const t = edge.material.color;
    for (let v = 0; v < n; v++) {
      const want = duskLawnColor(new THREE.Color(edgeAttr.getX(v), edgeAttr.getY(v), edgeAttr.getZ(v)), look);
      expect(Math.abs(t.r * tc.getX(v) - want.r)).toBeLessThan(1e-6);
      expect(Math.abs(t.g * tc.getY(v) - want.g)).toBeLessThan(1e-6);
      expect(Math.abs(t.b * tc.getZ(v) - want.b)).toBeLessThan(1e-6);
    }
    // Passing the edge too (as well as the band) tints it once, not twice.
    h.dispose();
    const h2 = tintDuskLawn({ ground: [band, edge], grass: null, look });
    const tc2 = edgeGeo.getAttribute('color');
    const want0 = duskLawnColor(new THREE.Color(edgeAttr.getX(0), edgeAttr.getY(0), edgeAttr.getZ(0)), look);
    expect(Math.abs(edge.material.color.g * tc2.getY(0) - want0.g)).toBeLessThan(1e-6);
    h2.dispose();
    expect(edge.material).toBe(edgeMat);
    expect(band.material).toBe(bandMat);
    expect(edgeGeo.getAttribute('color')).toBe(edgeAttr);
    expect(Array.from(edgeAttr.array)).toEqual(edgeBefore);
    h2.dispose();
    expect(edgeGeo.getAttribute('color')).toBe(edgeAttr);
  });
  it('skips array materials and materials without a colour', () => {
    const a = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), [new THREE.MeshStandardMaterial()]);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial());
    const am = a.material; const bm = b.material;
    const h = tintDuskLawn({ ground: [a, b], grass: null, look: duskLook({}) });
    expect(a.material).toBe(am);
    expect(b.material).toBe(bm);
    h.dispose();
  });
  it('an area lawnTint override reaches the tint', () => {
    const c = new THREE.Color(0.3, 0.6, 0.2);
    const look = duskLook({ duskLight: { lawnTint: { desat: 0, dark: 0.5, cool: [1, 1, 1] } } });
    expect(duskLawnColor(c, look).g).toBeCloseTo(0.3, 6);
  });
  it('a partial lawnTint override keeps the other defaults', () => {
    const look = duskLook({ duskLight: { lawnTint: { dark: 0.6 } } });
    expect(look.lawnTint.dark).toBe(0.6);
    expect(look.lawnTint.desat).toBe(DUSK.lawnTint.desat);
    expect(look.lawnTint.cool).toEqual(DUSK.lawnTint.cool);
    expect(Object.isFrozen(look.lawnTint)).toBe(true);
    const c = duskLawnColor(new THREE.Color(0.3, 0.6, 0.2), look);
    expect([c.r, c.g, c.b].every(Number.isFinite)).toBe(true);
  });
  it('walk.js wires the tint and its disposal', () => {
    const src = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');
    expect(src).toContain('tintDuskLawn(');
    expect(src).toContain('duskLawn.dispose()');
  });
});

describe('dusk lamps', () => {
  // The real builder.lampPost, under the headless canvas stub every world test
  // uses (surface painters need getImageData and gradients to answer).
  const loadBuilder = async () => {
    vi.stubGlobal('document', {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => new Proxy({}, {
          get: (_t, key) => {
            if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
            if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: () => {} });
            return () => {};
          },
          set: () => true,
        }),
      }),
    });
    return import('../src/world/builder.js');
  };

  it('lampPost stays two meshes, globe flagged lampGlobe + noMerge, pole unflagged', async () => {
    const b = await loadBuilder();
    const g = b.lampPost(1, 2);
    const meshes = [];
    g.traverse((o) => { if (o.isMesh) meshes.push(o); });
    expect(meshes).toHaveLength(2);
    const globe = meshes.find((m) => m.geometry.type === 'SphereGeometry');
    const pole = meshes.find((m) => m.geometry.type === 'CylinderGeometry');
    expect(globe.userData.lampGlobe).toBe(true);
    expect(globe.userData.noMerge).toBe(true);
    expect(pole.userData.lampGlobe).toBeUndefined();
    expect(g.userData.lampGlobeY).toBe(3.3);
  });

  it('applyDusk lights the globe and leaves the pole alone', async () => {
    const b = await loadBuilder();
    const scene = new THREE.Scene();
    const g = b.lampPost(0, 0);
    scene.add(g);
    const globe = g.children.find((m) => m.userData.lampGlobe);
    const pole = g.children.find((m) => !m.userData.lampGlobe);
    const oldGlobe = globe.material;
    const poleMat = pole.material;
    let disposed = false;
    oldGlobe.addEventListener('dispose', () => { disposed = true; });
    applyDusk({ scene, sun: createSun(), fill: createFill(), areaData: area });
    expect(globe.material).not.toBe(oldGlobe);
    expect(disposed).toBe(true);
    expect(globe.material.color.getHex()).toBe(LAMP_LOOK.globe);
    expect(globe.material.emissive.getHex()).toBe(LAMP_LOOK.emissive);
    expect(globe.material.emissiveIntensity).toBe(2.4);
    expect(pole.material).toBe(poleMat);
  });

  it('createLampPools: one additive mesh, a 3-ring fan per lamp, on the ground under each lamp', async () => {
    const b = await loadBuilder();
    const scene = new THREE.Scene();
    const spots = [[0, 0], [10, -4], [-6, 8], [3, 20]];
    for (const [x, z] of spots) scene.add(b.lampPost(x, z));
    const before = scene.children.length;
    const mesh = createLampPools(scene);
    expect(scene.children.length).toBe(before + 1);
    expect(mesh.parent).toBe(scene);
    expect(mesh.name).toBe('lampPools');
    expect(mesh.userData.noCast).toBe(true);
    expect(mesh.userData.dressing).toBe(true);
    expect(mesh.castShadow).toBe(false);
    expect(mesh.receiveShadow).toBe(false);
    const S = LAMP_LOOK.poolSegments;
    const geo = mesh.geometry;
    // centre fan + inner→rim annulus (2 triangles per segment) = 3 × S
    expect(geo.index.count / 3).toBe(spots.length * 3 * S);
    const pos = geo.getAttribute('position');
    const col = geo.getAttribute('color');
    expect(pos.count).toBe(spots.length * (1 + 2 * S));
    const per = 1 + 2 * S;
    const centre = new THREE.Color(LAMP_LOOK.poolColor).multiplyScalar(LAMP_LOOK.poolStrength);
    spots.forEach(([x, z], i) => {
      const c = i * per;
      expect(pos.getX(c)).toBeCloseTo(x, 6);
      expect(pos.getZ(c)).toBeCloseTo(z, 6);
      expect(pos.getY(c)).toBeCloseTo(LAMP_LOOK.poolLift, 6);
      expect(col.getX(c)).toBeCloseTo(centre.r, 6);
      expect(col.getY(c)).toBeCloseTo(centre.g, 6);
      expect(col.getZ(c)).toBeCloseTo(centre.b, 6);
      // inner ring at half radius, 0.45 of the centre
      const r1 = Math.hypot(pos.getX(c + 1) - x, pos.getZ(c + 1) - z);
      expect(r1).toBeCloseTo(LAMP_LOOK.poolRadius * 0.5, 6);
      expect(col.getX(c + 1)).toBeCloseTo(centre.r * 0.45, 6);
      // rim at full radius, black (additive: no light)
      const r2 = Math.hypot(pos.getX(c + 1 + S) - x, pos.getZ(c + 1 + S) - z);
      expect(r2).toBeCloseTo(LAMP_LOOK.poolRadius, 6);
      expect([col.getX(c + 1 + S), col.getY(c + 1 + S), col.getZ(c + 1 + S)]).toEqual([0, 0, 0]);
    });
    // every triangle faces up (the material is front-sided)
    const ix = geo.index;
    const t = new THREE.Triangle();
    const n = new THREE.Vector3();
    const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    for (let k = 0; k < ix.count; k += 3) {
      for (let j = 0; j < 3; j++) v[j].fromBufferAttribute(pos, ix.getX(k + j));
      t.set(v[0], v[1], v[2]).getNormal(n);
      expect(n.y).toBeGreaterThan(0.99);
    }
    const m = mesh.material;
    expect(m.isMeshBasicMaterial).toBe(true);
    expect(m.vertexColors).toBe(true);
    expect(m.transparent).toBe(true);
    expect(m.blending).toBe(THREE.AdditiveBlending);
    expect(m.depthWrite).toBe(false);
    expect(m.fog).toBe(false);
    expect(m.polygonOffset).toBe(true);
    expect(geo.boundingSphere).toBeTruthy();
  });

  it('createLampPools sits on a raised lamp\'s own ground', async () => {
    const b = await loadBuilder();
    const scene = new THREE.Scene();
    const g = b.lampPost(2, 3);
    g.position.y = 1.5;
    scene.add(g);
    const mesh = createLampPools(scene);
    expect(mesh.geometry.getAttribute('position').getY(0)).toBeCloseTo(1.5 + LAMP_LOOK.poolLift, 6);
  });

  it('createLampPools on a scene with no lamps adds nothing and returns null', () => {
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    expect(createLampPools(scene)).toBeNull();
    expect(scene.children).toHaveLength(1);
  });

  it('walk.js lays the pools on dusk walks outside the den', () => {
    const src = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');
    expect(src).toContain('if (duskLookNow && !isDen) createLampPools(scene);');
  });
});
