import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import * as THREE from 'three';
import { buildCat, coatColor, catPivot } from '../src/cat/model.js';
import { placeFrame } from '../src/fightactions.js';
import { animateCat } from '../src/cat/animator.js';
import { setCatScars, fitScars } from '../src/cat/scarmesh.js';
import { DEFAULT_LOOK, PATTERNS, FURS, COATS } from '../src/customcats.js';
import { CLAN_COATS } from '../src/clancast.js';
import { fingerprintCat, meshCount, PRESETS, colourDistance } from './helpers/catfingerprint.js';

// The scar mesh (2026-11-01 fight moves and scars, Task 4): one fitted,
// vertex-coloured mesh of thin raised scratch strips, only on a scarred cat.

const TWO = [{ site: 'face', stage: 'full', side: 'l' }, { site: 'side', stage: 'half', side: 'r' }];
const SITES = ['face', 'shoulder', 'back', 'side', 'hind'];
const looks = () => PATTERNS.flatMap(([pattern]) => FURS.map(([fur]) => ({ ...DEFAULT_LOOK, pattern, fur, size: 1.15 })));
const clanRows = () => Object.values(CLAN_COATS).flat();
// Every animator state, the fight's new ones included.
const ALL_STATES = ['follow', 'nap', 'stretch', 'groom', 'requestPet', 'perch', 'sniff', 'stalk', 'pounce', 'scared', 'cross', 'land',
  'wade', 'swim', 'shake', 'swipe', 'backUp', 'arch', 'rearUp', 'flinch', 'pinned', 'pinning', 'roll'];
const STRIP_VERTS = 10; // 4 segments, two vertices a section

const skullOf = (cat) => cat.userData.parts.head.children.find((m) => m.isMesh && m.geometry.parameters?.radius === 0.21);
const scarsOf = (cat) => cat.userData.parts.scars;

// Each strip's centroid in world space, in build order.
function centroids(cat) {
  cat.updateMatrixWorld(true);
  const mesh = scarsOf(cat);
  const pos = mesh.geometry.attributes.position;
  const out = [];
  for (let s = 0; s < pos.count / STRIP_VERTS; s++) {
    const c = new THREE.Vector3();
    for (let i = 0; i < STRIP_VERTS; i++) c.add(new THREE.Vector3().fromBufferAttribute(pos, s * STRIP_VERTS + i));
    out.push(c.divideScalar(STRIP_VERTS).applyMatrix4(mesh.matrixWorld));
  }
  return out;
}

// Distance from `p` to the surface of `mesh` (not its children), cast from
// outside back toward the mesh's centre.
function surfaceDistance(mesh, p) {
  const centre = new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld);
  const dir = p.clone().sub(centre).normalize();
  const ray = new THREE.Raycaster(centre.clone().addScaledVector(dir, 3), dir.clone().negate(), 0, 10);
  const hit = ray.intersectObject(mesh, false)[0];
  return hit ? hit.point.distanceTo(p) : Infinity;
}

const colours = (cat) => {
  const col = scarsOf(cat).geometry.attributes.color;
  return Array.from({ length: col.count }, (_, i) => new THREE.Color(col.getX(i), col.getY(i), col.getZ(i)));
};

// Every coat a scar can land on: [label, build(scars), coat base hex].
function coats() {
  const out = [];
  for (const b of PRESETS) out.push([b, (scars) => buildCat(b, undefined, { scars }), coatColor(b)]);
  for (const k of Object.keys(COATS)) {
    for (const [pattern] of PATTERNS) {
      const look = { ...DEFAULT_LOOK, coat: k, pattern };
      out.push([`look ${k} ${pattern}`, (scars) => buildCat('tabby', undefined, { look, scars }), COATS[k].hex]);
    }
  }
  clanRows().forEach((row, i) => out.push([`clan ${i}`, (scars) => buildCat(row.eyes, undefined, { simple: true, style: row, scars }), row.base]));
  return out;
}

describe('scar mesh', () => {
  it('an unscarred cat has no scar mesh and builds byte-identically', () => {
    for (const b of PRESETS) for (const simple of [false, true]) {
      const plain = buildCat(b, undefined, { simple });
      const empty = buildCat(b, undefined, { simple, scars: [] });
      expect(fingerprintCat(empty)).toEqual(fingerprintCat(plain));
      expect(Object.keys(empty.userData.parts)).toEqual(Object.keys(plain.userData.parts));
      expect('scars' in empty.userData.parts).toBe(false);
      expect(empty.getObjectByName('scars')).toBeUndefined();
    }
  });

  it('one mesh for two scars at a face and a body site', () => {
    for (const simple of [false, true]) {
      for (const b of PRESETS) {
        expect(meshCount(buildCat(b, undefined, { simple, scars: TWO })), `${b} ${simple}`).toBe(meshCount(buildCat(b, undefined, { simple })) + 1);
      }
      for (const look of looks()) {
        expect(meshCount(buildCat('tabby', undefined, { look, simple, scars: TWO }))).toBe(meshCount(buildCat('tabby', undefined, { look, simple })) + 1);
      }
    }
    const mesh = scarsOf(buildCat('tabby', undefined, { scars: TWO }));
    expect(mesh.isMesh).toBe(true);
    expect(mesh.name).toBe('scars');
    expect(mesh.parent).toBeTruthy();
    expect(mesh.geometry.attributes.position.count).toBeLessThanOrEqual(60);
    expect(mesh.position.toArray()).toEqual([0, 0, 0]);
    expect(mesh.scale.toArray()).toEqual([1, 1, 1]);
    expect(mesh.quaternion.toArray()).toEqual([0, 0, 0, 1]);
    expect(mesh.material.vertexColors).toBe(true);
    expect(mesh.material.type).toBe(buildCat('tabby').userData.parts.body.material.type);
  });

  it('every site builds three strips, at most 60 vertices for two scars', () => {
    for (const site of SITES) for (const side of ['l', 'r']) {
      const mesh = scarsOf(buildCat('tabby', undefined, { scars: [{ site, stage: 'full', side }] }));
      expect(mesh.geometry.attributes.position.count).toBe(3 * STRIP_VERTS);
    }
    for (let i = 0; i < SITES.length; i++) for (let j = i + 1; j < SITES.length; j++) {
      const scars = [{ site: SITES[i], stage: 'full', side: 'l' }, { site: SITES[j], stage: 'faint', side: 'r' }];
      for (const simple of [false, true]) {
        expect(scarsOf(buildCat('d2', undefined, { simple, scars })).geometry.attributes.position.count).toBe(60);
      }
    }
  });

  it('the face scar rides the head and a body scar the torso through every pose', () => {
    for (const site of SITES.slice(1)) for (const b of ['tabby', 'digit', 'mainecoon']) for (const simple of [false, true]) {
      const cat = buildCat(b, undefined, { simple, scars: [{ site: 'face', stage: 'full', side: 'r' }, { site, stage: 'full', side: 'l' }] });
      const skull = skullOf(cat);
      const { body } = cat.userData.parts;
      for (const state of ALL_STATES) {
        animateCat(cat, state, 1.3, 0.5);
        const c = centroids(cat);
        expect(c.length).toBe(6);
        for (let s = 0; s < 6; s++) {
          const d = surfaceDistance(s < 3 ? skull : body, c[s]);
          expect(d, `${b} ${simple} ${site} ${state} strip ${s}`).toBeLessThanOrEqual(0.012);
        }
      }
    }
  });

  it('a face scar sits over the eye, a body scar on its site', () => {
    const cat = buildCat('tabby', undefined, { scars: [{ site: 'face', stage: 'full', side: 'r' }] });
    const { head } = cat.userData.parts;
    cat.updateMatrixWorld(true);
    const eye = head.children.find((m) => m.isMesh && m.geometry.parameters?.radius === 0.036 && m.position.x > 0);
    const c = centroids(cat).map((p) => head.worldToLocal(p.clone()));
    const mid = c[1];
    // Above the eye's centre, within an eye's width of it, on the front of the face.
    expect(mid.y).toBeGreaterThan(eye.position.y);
    expect(Math.abs(mid.x - eye.position.x)).toBeLessThan(0.06);
    expect(mid.z).toBeLessThan(-0.1);
    const where = (site) => {
      const k = buildCat('tabby', undefined, { scars: [{ site, stage: 'full', side: 'r' }] });
      k.updateMatrixWorld(true);
      const p = centroids(k)[1];
      return k.userData.parts.body.worldToLocal(p);
    };
    const back = where('back'), shoulder = where('shoulder'), side = where('side'), hind = where('hind');
    expect(back.y).toBeGreaterThan(Math.abs(back.x));          // on top
    expect(shoulder.z).toBeLessThan(side.z);                   // front of the flank
    expect(hind.z).toBeGreaterThan(side.z);                    // over the hip
    expect(side.x).toBeGreaterThan(side.y);                    // mid flank
  });

  it('side is honoured', () => {
    for (const site of SITES) {
      const x = (side) => {
        const cat = buildCat('calico', undefined, { scars: [{ site, stage: 'full', side }] });
        const owner = site === 'face' ? cat.userData.parts.head : cat.userData.parts.body;
        cat.updateMatrixWorld(true);
        const c = centroids(cat);
        return c.reduce((s, p) => s + owner.worldToLocal(p.clone()).x, 0) / c.length;
      };
      expect(x('l'), site).toBeLessThan(0);
      expect(x('r'), site).toBeGreaterThan(0);
    }
  });

  it('every stage reads on every coat', () => {
    for (const [label, build, baseHex] of coats()) {
      const base = new THREE.Color(baseHex);
      const at = (stage) => build([{ site: 'face', stage, side: 'l' }, { site: 'side', stage, side: 'r' }]);
      const full = at('full'), half = at('half'), faint = at('faint');
      for (const c of colours(full)) expect(colourDistance(c, base), label).toBeGreaterThanOrEqual(0.25);
      // Each vertex fades toward the coat under it (userData.under).
      const under = scarsOf(full).userData.under;
      const [cf, ch, ct] = [colours(full), colours(half), colours(faint)];
      for (let i = 0; i < cf.length; i++) {
        const u = new THREE.Color(under[i * 3], under[i * 3 + 1], under[i * 3 + 2]);
        expect(colourDistance(ct[i], u), label).toBeLessThan(colourDistance(ch[i], u));
        expect(colourDistance(ch[i], u), label).toBeLessThan(colourDistance(cf[i], u));
      }
    }
  });

  it('full is the soft red, or a pale pink on a reddish coat; the coat under a plain cat is its base', () => {
    const red = new THREE.Color(0xd04a5a), pale = new THREE.Color(0xf2a6ae);
    const black = buildCat('black', undefined, { scars: [{ site: 'side', stage: 'full', side: 'l' }] });
    for (const c of colours(black)) expect(colourDistance(c, red)).toBeLessThan(1e-6);
    const under = scarsOf(black).userData.under;
    const base = new THREE.Color(coatColor('black'));
    for (let i = 0; i < under.length; i += 3) expect(colourDistance(new THREE.Color(under[i], under[i + 1], under[i + 2]), base)).toBeLessThan(1e-6);
    const ginger = buildCat('tabby', undefined, { look: { ...DEFAULT_LOOK, coat: 'ginger', pattern: 'solid' }, scars: [{ site: 'face', stage: 'full', side: 'l' }] });
    for (const c of colours(ginger)) expect(colourDistance(c, pale)).toBeLessThan(1e-6);
  });

  it('Hagrid never gets one', () => {
    const plain = buildCat('hagrid');
    const h = buildCat('hagrid', undefined, { scars: TWO });
    expect(fingerprintCat(h)).toEqual(fingerprintCat(plain));
    expect('scars' in h.userData.parts).toBe(false);
    setCatScars(h, TWO);
    expect('scars' in h.userData.parts).toBe(false);
    expect(meshCount(h)).toBe(meshCount(plain));
    expect(() => fitScars(h)).not.toThrow();
  });

  it('setCatScars([]) removes and disposes it', () => {
    const cat = buildCat('tabby', undefined, { scars: TWO });
    const mesh = scarsOf(cat);
    const g = vi.spyOn(mesh.geometry, 'dispose');
    const m = vi.spyOn(mesh.material, 'dispose');
    setCatScars(cat, []);
    expect(g).toHaveBeenCalled();
    expect(m).toHaveBeenCalled();
    expect(mesh.parent).toBeNull();
    expect('scars' in cat.userData.parts).toBe(false);
    expect(fingerprintCat(cat)).toEqual(fingerprintCat(buildCat('tabby')));
    // Replacing swaps it, never stacks a second one.
    setCatScars(cat, TWO);
    const first = scarsOf(cat);
    setCatScars(cat, [{ site: 'back', stage: 'faint', side: 'l' }]);
    expect(first.parent).toBeNull();
    expect(meshCount(cat)).toBe(meshCount(buildCat('tabby')) + 1);
    expect(() => setCatScars(cat, null)).not.toThrow();
    expect('scars' in cat.userData.parts).toBe(false);
    expect(() => fitScars(cat)).not.toThrow();
  });

  it('a torso the ray misses skips that scar instead of throwing (final review 4)', () => {
    // A torso geometry that is one small triangle off to the side: no ray from
    // the centre toward a body site meets it.
    const miss = () => {
      const cat = buildCat('tabby');
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([5, 5, 5, 5.1, 5, 5, 5, 5.1, 5]), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array([1, 1, 1, 1, 1, 1, 1, 1, 1]), 3));
      cat.userData.parts.body.geometry = g;
      return cat;
    };
    // Only a body scar: nothing is left, so no mesh at all.
    const a = miss();
    const before = meshCount(a);
    expect(() => setCatScars(a, [{ site: 'side', stage: 'full', side: 'r' }])).not.toThrow();
    expect('scars' in a.userData.parts).toBe(false);
    expect(meshCount(a)).toBe(before);
    expect(() => fitScars(a)).not.toThrow();
    // A face scar and a body scar: the face scar is still drawn, on the head.
    const b = miss();
    expect(() => setCatScars(b, TWO)).not.toThrow();
    const mesh = scarsOf(b);
    expect(mesh.geometry.attributes.position.count).toBe(3 * STRIP_VERTS);
    expect(mesh.userData.split).toBe(3 * STRIP_VERTS);
    expect(meshCount(b)).toBe(before + 1);
  });

  it('a scarred cat built later matches one scarred at build', () => {
    const a = buildCat('persian', undefined, { scars: TWO });
    const b = buildCat('persian');
    setCatScars(b, TWO);
    expect(fingerprintCat(b)).toEqual(fingerprintCat(a));
  });

  it('never casts a shadow, but receives one (final review 3: rig.js skips a noCast mesh, so the flag is set on the mesh)', () => {
    const mesh = scarsOf(buildCat('tabby', undefined, { scars: TWO }));
    expect(mesh.castShadow).toBe(false);
    expect(mesh.receiveShadow).toBe(true);
    expect(mesh.userData.noCast).toBe(true);
    expect(mesh.frustumCulled).toBe(false);
  });

  it('fitScars allocates nothing', () => {
    const src = fs.readFileSync(new URL('../src/cat/scarmesh.js', import.meta.url), 'utf8');
    const start = src.indexOf('export function fitScars');
    expect(start).toBeGreaterThan(-1);
    let depth = 0, end = src.indexOf('{', start);
    for (let i = end; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}' && --depth === 0) { end = i; break; }
    }
    const body = src.slice(start, end + 1).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(body).not.toMatch(/\bnew /);
    const cat = buildCat('tabby', undefined, { scars: TWO });
    const arr = scarsOf(cat).geometry.attributes.position.array;
    const nArr = scarsOf(cat).geometry.attributes.normal.array;
    for (let i = 0; i < 100; i++) animateCat(cat, 'follow', i * 0.05, 1);
    expect(scarsOf(cat).geometry.attributes.position.array).toBe(arr);
    expect(scarsOf(cat).geometry.attributes.normal.array).toBe(nArr);
  });

  it('animateCat re-fits it every frame', () => {
    const cat = buildCat('tabby', undefined, { scars: [{ site: 'face', stage: 'full', side: 'l' }] });
    animateCat(cat, 'follow', 0, 0);
    const a = Array.from(scarsOf(cat).geometry.attributes.position.array);
    const v = scarsOf(cat).geometry.attributes.position.version;
    animateCat(cat, 'nap', 1, 0);
    expect(scarsOf(cat).geometry.attributes.position.version).toBeGreaterThan(v);
    expect(Array.from(scarsOf(cat).geometry.attributes.position.array)).not.toEqual(a);
  });

  // ---- Body refinement Task 9: the scars on the new legs and folded poses ----

  const BODY_SITES = ['shoulder', 'hind', 'back', 'side'];
  const customLook = { ...DEFAULT_LOOK, fur: 'fluffy', size: 1.15 };
  const scarCats = (scars, simple = false) => [
    ['tabby', buildCat('tabby', undefined, { simple, scars })],
    ['persian', buildCat('persian', undefined, { simple, scars })],
    ['digit', buildCat('digit', undefined, { simple, scars })],
    ['custom', buildCat('tabby', undefined, { simple, look: customLook, scars })],
  ];

  // Each limb as a polyline of ring centres with a radius per ring, in world
  // space, read from the limb's own rings (the folded geometry included).
  function limbCurves(cat) {
    cat.updateMatrixWorld(true);
    const sc = cat.getWorldScale(new THREE.Vector3()).x;
    return cat.userData.parts.legs.map((leg) => {
      const limb = leg.children[0];
      const { sides, rings } = limb.geometry.userData;
      const pos = limb.geometry.attributes.position;
      const pts = [], rad = [];
      for (let i = 0; i <= rings; i++) {
        const c = new THREE.Vector3();
        const vs = [];
        for (let j = 0; j < sides; j++) vs.push(new THREE.Vector3().fromBufferAttribute(pos, i * sides + j).applyMatrix4(limb.matrixWorld));
        vs.forEach((v) => c.add(v));
        c.divideScalar(sides);
        pts.push(c);
        rad.push(vs.reduce((m, v) => m + v.distanceTo(c), 0) / sides);
      }
      return { pts, rad, sc };
    });
  }
  // Clearance of `p` from a limb's tube: distance to the curve minus the
  // radius there (interpolated along the nearest segment).
  function clearance(curve, p) {
    let best = Infinity;
    const seg = new THREE.Line3(), q = new THREE.Vector3();
    for (let i = 0; i < curve.pts.length - 1; i++) {
      seg.set(curve.pts[i], curve.pts[i + 1]);
      const t = seg.closestPointToPointParameter(p, true);
      seg.at(t, q);
      const d = q.distanceTo(p) - (curve.rad[i] * (1 - t) + curve.rad[i + 1] * t);
      if (d < best) best = d;
    }
    return best;
  }

  it('shoulder and hind scars stay visible beside the new legs', () => {
    for (const simple of [false, true]) for (const site of BODY_SITES) for (const side of ['l', 'r']) {
      for (const [name, cat] of scarCats([{ site, stage: 'full', side }], simple)) {
        animateCat(cat, 'follow', 1.3, 0, false);
        const curves = limbCurves(cat);
        centroids(cat).forEach((c, s) => {
          curves.forEach((curve, li) => {
            expect(clearance(curve, c), `${name} ${simple} ${site} ${side} strip ${s} leg ${li}`).toBeGreaterThan(0.005 * curve.sc);
          });
        });
      }
    }
  });

  it('scars ride the new surfaces in the new poses', () => {
    for (const state of ['nap', 'requestPet', 'stalk', 'pinned', 'roll']) for (const simple of [false, true]) {
      for (const site of SITES.slice(1)) {
        for (const [name, cat] of scarCats([{ site: 'face', stage: 'full', side: 'r' }, { site, stage: 'full', side: 'l' }], simple)) {
          const skull = skullOf(cat);
          const { body } = cat.userData.parts;
          animateCat(cat, state, 1.3, 0.5);
          const c = centroids(cat);
          for (let s = 0; s < 6; s++) {
            expect(surfaceDistance(s < 3 ? skull : body, c[s]), `${name} ${simple} ${site} ${state} strip ${s}`).toBeLessThanOrEqual(0.012);
          }
        }
      }
    }
  });

  it('scars stay out of the folded legs too', () => {
    for (const state of ['nap', 'requestPet', 'stalk', 'pinned', 'roll']) for (const site of ['shoulder', 'hind']) for (const side of ['l', 'r']) {
      for (const [name, cat] of scarCats([{ site, stage: 'full', side }])) {
        animateCat(cat, state, 1.3, 0.5);
        const curves = limbCurves(cat);
        centroids(cat).forEach((c, s) => curves.forEach((curve, li) => {
          // A folded leg tucks against the body, so only demand the strip is not buried deep inside a tube.
          expect(clearance(curve, c), `${name} ${state} ${site} ${side} strip ${s} leg ${li}`).toBeGreaterThan(-0.01 * curve.sc);
        }));
      }
    }
  });

  it('Digit and tabby rear up on their new hind legs', () => {
    const down = new THREE.Vector3(0, -1, 0), ray = new THREE.Raycaster(), v = new THREE.Vector3(), o = new THREE.Vector3();
    for (const name of ['digit', 'tabby']) for (const simple of [false, true]) {
      const cat = buildCat(name, undefined, { simple });
      const dims = catPivot(cat);
      const frame = { pitch: 0.9, roll: 0, along: 0, side: 0, lift: 0, pose: 'rearUp' };
      const p = placeFrame(frame, dims);
      animateCat(cat, 'rearUp', 0.7, 0, false);
      cat.rotation.order = 'YXZ';
      cat.rotation.set(frame.pitch, 0, frame.roll);
      cat.position.set(p.dSide, p.y, -p.dAlong);
      cat.updateMatrixWorld(true);
      const { legs } = cat.userData.parts;
      let low = Infinity;
      for (const leg of legs.slice(2)) low = Math.min(low, new THREE.Box3().setFromObject(leg.userData.paw, true).min.y);
      expect(Math.abs(low), `${name} ${simple} hind paw`).toBeLessThanOrEqual(0.03);
      for (const leg of legs) expect(new THREE.Box3().setFromObject(leg.children[0], true).min.y, `${name} ${simple} limb`).toBeGreaterThanOrEqual(-0.03);
      // Nothing pokes out of the back (Task 5's measure, in the cat's own frame).
      const flat = buildCat(name, undefined, { simple });
      flat.scale.setScalar(1);
      animateCat(flat, 'rearUp', 0.7, 0, false);
      flat.updateMatrixWorld(true);
      const body = flat.userData.parts.body;
      const torso = new THREE.Box3().setFromObject(body, true);
      let worst = -Infinity;
      flat.userData.parts.legs.forEach((leg) => {
        const limb = leg.children[0], hipX = Math.abs(leg.position.x), pos = limb.geometry.attributes.position;
        for (let k = 0; k < pos.count; k++) {
          v.fromBufferAttribute(pos, k).applyMatrix4(limb.matrixWorld);
          if (Math.abs(v.x) > hipX + 1e-9 || v.y < torso.min.y || v.z < torso.min.z || v.z > torso.max.z) continue;
          ray.set(o.set(v.x, 5, v.z), down);
          const hit = ray.intersectObject(body, false)[0];
          if (hit) worst = Math.max(worst, v.y - hit.point.y);
        }
      });
      // Task 1's rearUp baseline (-0.0001 tabby, 0.0031 digit) + 0.002, floor 0.005.
      expect(worst, `${name} ${simple} back`).toBeLessThanOrEqual(0.005);
    }
  });

  it('a scarred cat stays within caps', () => {
    const scars = [{ site: 'face', stage: 'full', side: 'l' }, { site: 'shoulder', stage: 'half', side: 'r' }];
    const tris = (cat) => { let n = 0; cat.traverse((m) => { if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; }); return n; };
    // Each breed's own mesh ceiling (catmodel.test.js CEILING, simple = full - 6) and the customs' 31 / 25, plus the one scar mesh.
    const CEIL = { calico: 31, robbie: 31, d2: 31, digit: 34 };
    const cap = (simple, name) => {
      const full = name.startsWith('custom') ? 31 : (CEIL[name] ?? 30);
      return { meshes: (simple ? full - 6 : full) + 1, tris: simple ? 5500 : 9000 };
    };
    const casts = [...PRESETS.map((b) => [b, (o) => buildCat(b, undefined, o)]),
      ['custom', (o) => buildCat('tabby', undefined, { ...o, look: { ...DEFAULT_LOOK, pattern: 'stripes', fur: 'fluffy', size: 1.15 } })],
      ['custom long', (o) => buildCat('tabby', undefined, { ...o, look: { ...DEFAULT_LOOK, pattern: 'stripes', fur: 'long', size: 1.15 } })]];
    for (const simple of [false, true]) for (const [name, make] of casts) {
      const cat = make({ simple, scars });
      const plain = make({ simple });
      expect(meshCount(cat), `${name} ${simple}`).toBe(meshCount(plain) + 1);
      expect(meshCount(cat), `${name} ${simple} meshes`).toBeLessThanOrEqual(cap(simple, name).meshes);
      expect(tris(cat), `${name} ${simple} tris`).toBeLessThanOrEqual(cap(simple, name).tris);
    }
  });
});
