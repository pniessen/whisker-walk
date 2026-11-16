import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import fs from 'node:fs';
import * as THREE from 'three';
import { buildCat, catStyle } from '../src/cat/model.js';
import { animateCat, BLINK } from '../src/cat/animator.js';
import { FACE, FACE_OPTIONS, FACE_SEG, EYES, PROFILE, SHELL_EAR, faceWarp, skullFrontZ } from '../src/cat/face.js';
import { GLASSES } from '../src/cat/glasses.js';
import { SKULL } from '../src/cat/torso.js';
import { fingerprintCat, buildFor, goldenKeys, meshCount, triangles, PRESETS } from './helpers/catfingerprint.js';

// Cat realism round 3, the face (2026-11-15). Tier A is on every detailed cat;
// the Tier B shapes are options (face.js FACE) whose default is today's.
const PICKS = { ...FACE }; // the game's defaults, read before any test changes them
const TODAY = { eyes: 'today', profile: 'today', ears: 'today' };
const pick = (o) => Object.assign(FACE, TODAY, o);
afterEach(() => Object.assign(FACE, PICKS));
const EVERY = FACE_OPTIONS.eyes.flatMap((eyes) => FACE_OPTIONS.profile.flatMap((profile) => FACE_OPTIONS.ears.map((ears) => ({ eyes, profile, ears }))));
const name = (o) => `${o.eyes}/${o.profile}/${o.ears}`;
const draws = (cat) => { let n = 0; cat.traverse((o) => { if (o.isMesh || o.isLine) n++; }); return n; };
const randoms = (fn) => { const real = Math.random; let n = 0; Math.random = () => { n++; return real(); }; try { fn(); } finally { Math.random = real; } return n; };
const verts = (m) => { m.updateWorldMatrix(true, false); const p = m.geometry.attributes.position, out = []; for (let i = 0; i < p.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld)); return out; };
const headVerts = (cat, m) => { const inv = cat.userData.parts.head.matrixWorld.clone().invert(); return verts(m).map((v) => v.applyMatrix4(inv)); };
const noseOf = (cat) => { let n; cat.userData.parts.head.traverse((o) => { if (o.userData.nose) n = o; }); return n; };
const GOLDEN = JSON.parse(fs.readFileSync(new URL('./fixtures/catgolden.json', import.meta.url), 'utf8'));
const DRESSED = { collar: 'bell', head: 'tophat', face: 'glasses', neck: 'scarf', body: 'sweater', back: 'backpack', feet: 'sneakers' };

describe('the options default to today', () => {
  // 2026-11-15: the owner picked soft eyes and shell ears from the sheets and kept today's profile.
  it('FACE holds the owner\'s picks, and each option list starts with today', () => {
    expect(PICKS).toEqual({ eyes: 'soft', profile: 'today', ears: 'shell' });
    for (const k of Object.keys(TODAY)) expect(FACE_OPTIONS[k][0]).toBe('today');
  });

  // The picks against today's shapes: the same draw calls but for the two
  // inner-ear meshes a shell ear does not need; a crowd cat keeps its eyes.
  // (Before the fixtures were re-recorded for round 3, a test here held the
  // default cat to round 1's fingerprints apart from the Tier A parts.)
  it('the picked face draws two meshes fewer than today\'s, and no cat is over its cap', () => {
    for (const breed of PRESETS) {
      pick({});
      const today = { full: draws(buildCat(breed)), simple: draws(buildCat(breed, undefined, { simple: true })) };
      Object.assign(FACE, PICKS);
      const full = buildCat(breed), simple = buildCat(breed, undefined, { simple: true });
      expect(draws(full), breed).toBe(today.full - 2);
      expect(draws(simple), breed).toBe(today.simple);
      expect(triangles(full), breed).toBeLessThanOrEqual(10350);
      expect(triangles(simple), breed).toBeLessThanOrEqual(5500);
      expect(simple.userData.parts.head.children.find((c) => c.userData.eye).geometry.type, breed).toBe('SphereGeometry');
    }
  });
});

describe('Tier A: nose, mouth, round parts, whiskers', () => {
  beforeEach(() => pick({})); // measured on today's shapes; the options have their own tests below
  it('the nose mesh is the leather and the mouth: the leather lies on the snout, the mouth under it', () => {
    for (const breed of PRESETS) {
      const cat = buildCat(breed); cat.updateMatrixWorld(true);
      const nose = noseOf(cat), L = nose.geometry.userData.leather, pts = headVerts(cat, nose);
      const leather = pts.slice(0, L.count), mouth = pts.slice(L.count);
      // a small shield: wider than tall, no deeper than its skirt, wide at the top and a point below
      const box = new THREE.Box3().setFromPoints(leather), size = box.getSize(new THREE.Vector3());
      expect(size.x, breed).toBeGreaterThan(size.y);
      expect(size.x, breed).toBeLessThan(0.06);
      const top = leather.filter((v) => v.y > box.max.y - 0.004), low = leather.filter((v) => v.y < box.min.y + 0.004);
      expect(Math.max(...top.map((v) => Math.abs(v.x))), breed).toBeGreaterThan(0.02);
      expect(Math.max(...low.map((v) => Math.abs(v.x))), breed).toBeLessThan(0.003);
      // the mouth: below the leather, on the muzzle's front, an arc out to each side
      expect(mouth.length, breed).toBeGreaterThan(20);
      for (const v of mouth) { expect(v.y, breed).toBeLessThan(box.min.y); expect(v.z, breed).toBeLessThan(-0.19); }
      expect(Math.max(...mouth.map((v) => v.x)), breed).toBeGreaterThan(0.035);
      expect(Math.min(...mouth.map((v) => v.x)), breed).toBeLessThan(-0.035);
      // not a frown: each arc's outer end is higher than its lowest point
      const right = mouth.filter((v) => v.x > 0.004), lowest = Math.min(...right.map((v) => v.y));
      const outer = right.reduce((a, v) => (v.x > a.x ? v : a));
      expect(outer.y, breed).toBeGreaterThan(lowest + 0.004);
      // the mouth is darker than the leather (vertex colour over the nose's material)
      const col = nose.geometry.attributes.color;
      const lumOf = (i) => { const c = nose.material.color; return 0.2126 * c.r * col.getX(i) + 0.7152 * c.g * col.getY(i) + 0.0722 * c.b * col.getZ(i); };
      expect([col.getX(0), col.getY(0), col.getZ(0)]).toEqual([1, 1, 1]);
      // it reads on the muzzle: at most half the pads' own luminance
      const pad = cat.userData.parts.head.children.find((c) => c.userData.cheek).material.color;
      expect(lumOf(L.count), breed).toBeLessThan((0.2126 * pad.r + 0.7152 * pad.g + 0.0722 * pad.b) * 0.5);
    }
  });

  it('the snout is the skull\'s own fur: appended to its sphere, proud of the ball only in front, under the leather', () => {
    const cat = buildCat('tabby'); cat.updateMatrixWorld(true);
    const skull = cat.userData.parts.head.children[0], sn = skull.geometry.userData.snout;
    expect(skull.geometry.type).toBe('SphereGeometry');
    expect(skull.geometry.parameters.radius).toBe(SKULL.R);
    const pts = headVerts(cat, skull).slice(sn.from, sn.from + sn.count);
    expect(pts.length).toBeGreaterThan(40);
    const leather = headVerts(cat, noseOf(cat)).slice(0, noseOf(cat).geometry.userData.leather.count);
    const tip = Math.min(...leather.map((v) => v.z));
    for (const v of pts) {
      expect(Math.abs(v.x)).toBeLessThanOrEqual(0.051);
      expect(v.y).toBeLessThanOrEqual(0.04);
      expect(v.z).toBeGreaterThan(tip); // never in front of the leather's point
    }
    // a crowd cat has no snout
    expect(buildCat('tabby', undefined, { simple: true }).userData.parts.head.children[0].geometry.userData.snout).toBeUndefined();
  });

  it('a Siamese nose shows on its mask: contrast 1.5 or more, and a little shine', () => {
    const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const nose = noseOf(buildCat('siamese')), mask = new THREE.Color(catStyle('siamese').accent);
    expect((lum(nose.material.color) + 0.05) / (lum(mask) + 0.05)).toBeGreaterThanOrEqual(1.5);
    expect(nose.material.roughness).toBeLessThan(0.9);
    expect(noseOf(buildCat('tabby')).material.roughness).toBe(0.9);
  });

  it('the detailed head is finer; a crowd cat\'s is as it was', () => {
    const seg = (m) => [m.geometry.parameters.widthSegments, m.geometry.parameters.heightSegments];
    const part = (cat, tag) => cat.userData.parts.head.children.find((c) => c.userData[tag]);
    const full = buildCat('tabby'), simple = buildCat('tabby', undefined, { simple: true });
    expect(seg(full.userData.parts.head.children[0])).toEqual(FACE_SEG.skull);
    expect(seg(part(full, 'cheek'))).toEqual(FACE_SEG.pad);
    expect(seg(part(full, 'eye'))).toEqual(FACE_SEG.eye);
    expect(seg(part(full, 'pupil'))).toEqual(FACE_SEG.pupil);
    expect(seg(simple.userData.parts.head.children[0])).toEqual([16, 12]);
    expect(seg(part(simple, 'eye'))).toEqual([8, 6]);
    expect(seg(part(simple, 'pupil'))).toEqual([6, 5]);
  });
});

describe('every option builds, on every cat', () => {
  it.each(EVERY.map((o) => [name(o), o]))('%s: builds full and simple, no new draw call, inside the caps, no extra random number', (_, o) => {
    for (const breed of PRESETS) {
      pick({});
      const base = { full: draws(buildCat(breed)), simple: draws(buildCat(breed, undefined, { simple: true })) };
      const rnd = { full: randoms(() => buildCat(breed)), simple: randoms(() => buildCat(breed, undefined, { simple: true })), dressed: randoms(() => buildCat(breed, DRESSED)) };
      pick(o);
      const full = buildCat(breed), simple = buildCat(breed, undefined, { simple: true });
      expect(draws(full), breed).toBe(base.full - (o.ears === 'shell' ? 2 : 0)); // a shell ear has no inner-ear mesh
      expect(draws(simple), breed).toBe(base.simple);
      expect(triangles(full), breed).toBeLessThanOrEqual(10350);
      expect(triangles(simple), breed).toBeLessThanOrEqual(5500);
      // the seeded worlds run through the cat builds: the same random draws as today
      expect(randoms(() => buildCat(breed)), breed).toBe(rnd.full);
      expect(randoms(() => buildCat(breed, undefined, { simple: true })), breed).toBe(rnd.simple);
      expect(randoms(() => buildCat(breed, DRESSED)), breed).toBe(rnd.dressed);
      // every pose still runs
      for (const state of ['follow', 'nap', 'perch', 'scared', 'cross', 'stalk', 'groom']) animateCat(full, state, 1.3, 0, false);
      for (const m of [full, simple]) m.traverse((c) => { if (c.isMesh) { const p = c.geometry.attributes.position.array; for (let i = 0; i < p.length; i++) if (!Number.isFinite(p[i])) throw new Error(`${breed} ${name(o)}: a vertex is not a number`); } });
    }
  });

  it('a kitten and a builder cat build in every option', async () => {
    const { kittenProportions } = await import('../src/kitten.js');
    for (const o of EVERY) {
      pick(o);
      const kitten = kittenProportions(buildCat('calico'));
      animateCat(kitten, 'perch', 0.6, 0, false);
      const custom = buildCat('tabby', undefined, { look: { pattern: 'stripes', fur: 'fluffy', coat: 'ginger', marks: 'chocolate', eyes: 'green', size: 1 } });
      animateCat(custom, 'nap', 1.3, 0, false);
      expect(custom.userData.parts.head.userData.eyes.eyes).toHaveLength(2);
    }
  });
});

describe('B4, the eyes', () => {
  const eyesOf = (cat) => cat.userData.parts.head.userData.eyes;
  it.each(['today', 'soft', 'cat'])('%s: the blink, the slow blink, the nap and the mood pupils work', (eyes) => {
    pick({ eyes });
    for (const breed of ['tabby', 'black', 'siamese', 'digit']) {
      const cat = buildCat(breed), set = eyesOf(cat);
      const yOf = (m) => m.scale.y, xOf = (m) => m.scale.x;
      animateCat(cat, 'follow', 1.3, 1.5, false);
      const open = { eye: yOf(set.eyes[0]), pupilY: yOf(set.pupils[0]), pupilX: xOf(set.pupils[0]), shine: set.shines[0].scale.x };
      // nap: shut to a line, the catchlight out
      animateCat(cat, 'nap', 1.3, 0, false);
      for (const e of set.eyes) expect(yOf(e) / open.eye, breed).toBeCloseTo(BLINK.shut, 6);
      for (const p of set.pupils) expect(xOf(p) / open.pupilX, breed).toBeCloseTo(BLINK.lineWide, 6);
      for (const sh of set.shines) expect(sh.scale.x, breed).toBeLessThan(open.shine * 1e-3);
      // the quick blink, mid-way: t = BLINK.quick / 2 into the cycle
      animateCat(cat, 'follow', BLINK.every + BLINK.quick / 2, 1.5, false);
      expect(yOf(set.eyes[0]) / open.eye, breed).toBeCloseTo(BLINK.shut, 6);
      // the slow blink, held half shut
      animateCat(cat, 'perch', BLINK.slowEvery + BLINK.slow / 2, 0, false);
      expect(yOf(set.eyes[0]) / open.eye, breed).toBeCloseTo(BLINK.slowLow, 6);
      // moods: wide when scared, a slit when cross; open again after
      animateCat(cat, 'scared', 1.3, 0, false);
      expect(xOf(set.pupils[0]) / open.pupilX, breed).toBeCloseTo(BLINK.pupil.scared, 6);
      animateCat(cat, 'cross', 1.3, 0, false);
      expect(xOf(set.pupils[0]) / open.pupilX, breed).toBeCloseTo(BLINK.pupil.cross, 6);
      animateCat(cat, 'follow', 1.3, 1.5, false);
      expect(yOf(set.eyes[0]), breed).toBeCloseTo(open.eye, 9);
      expect(set.shines[0].scale.x, breed).toBeCloseTo(open.shine, 9);
    }
  });

  it.each(['soft', 'cat'])('%s: an almond lens lying on the face, a dark rim round a two-tone iris, the outer corner raised', (eyes) => {
    for (const profile of FACE_OPTIONS.profile) {
      pick({ eyes, profile });
      const cat = buildCat('tabby'); cat.updateMatrixWorld(true);
      const set = eyesOf(cat), o = EYES[eyes];
      for (const eye of set.eyes) {
        const side = Math.sign(eye.position.x), pts = headVerts(cat, eye), col = eye.geometry.attributes.color;
        // one mesh with the rim in it: dark vertices at the edge, a lighter iris inside
        const lum = pts.map((_, i) => col.getX(i) + col.getY(i) + col.getZ(i));
        expect(Math.max(...lum)).toBeGreaterThan(3);   // the light iris (over the eye's own colour)
        expect(Math.min(...lum)).toBeLessThan(0.6);    // the rim
        expect(lum[0]).toBeGreaterThan(3);             // its centre is iris
        // lying on the face: no vertex more than 6 mm proud of it (today's ball stood 10 mm out), none floating off its edge
        for (const v of pts) {
          const proud = skullFrontZ(v.x, v.y) - v.z;
          expect(proud, `${eyes} ${profile}`).toBeLessThanOrEqual(0.006);
          expect(proud, `${eyes} ${profile}`).toBeGreaterThanOrEqual(-0.008);
        }
        // wider than tall, and no bigger than today's eye is tall
        const box = new THREE.Box3().setFromPoints(pts), size = box.getSize(new THREE.Vector3());
        expect(size.x).toBeGreaterThan(size.y * 0.95);
        expect(size.y).toBeLessThanOrEqual(0.036 * 1.15 * 2 + 0.004);
        // the outer corner is higher than the inner one
        const outer = pts.reduce((a, v) => (v.x * side > a.x * side ? v : a)), inner = pts.reduce((a, v) => (v.x * side < a.x * side ? v : a));
        expect(outer.y - inner.y).toBeGreaterThan(o.slant * o.a);
      }
      // the pupil and the catchlight sit on the lens, in front of it
      for (let i = 0; i < 2; i++) {
        // out of the face along the eye's own facing (its local -z), from the eye's centre
        const out = new THREE.Vector3(0, 0, -1).applyQuaternion(set.eyes[i].quaternion), c = set.eyes[i].position;
        const front = (m) => Math.max(...headVerts(cat, m).map((v) => v.sub(c).dot(out)));
        expect(front(set.pupils[i])).toBeGreaterThan(front(set.eyes[i]) + 0.001);
        expect(front(set.pupils[i])).toBeLessThan(0.012);
        expect(front(set.shines[i])).toBeGreaterThan(front(set.eyes[i]));
        expect(set.pupils[i].position.distanceTo(set.eyes[i].position)).toBeLessThan(0.006);
        expect(set.shines[i].position.distanceTo(set.eyes[i].position)).toBeLessThan(o.a);
      }
    }
  });

  it('a lens eye on a black cat still glows, but its rim does not', () => {
    pick({ eyes: 'soft' });
    const set = eyesOf(buildCat('black'));
    for (const e of set.eyes) {
      expect(e.material.emissiveIntensity).toBeGreaterThan(0);
      expect(e.material.customProgramCacheKey()).toBe('cat-lens-glow');
    }
    pick({});
    expect(eyesOf(buildCat('black')).eyes[0].material.onBeforeCompile.toString()).not.toContain('totalEmissiveRadiance');
  });

  // The glasses' own test (glasses.test.js), for each eye option: along each
  // rim's facing, the lens is beyond the eye's front, pupil and shine included.
  it.each(EVERY.map((o) => [name(o), o]))('%s: glasses clear the eyes', (_, o) => {
    pick(o);
    for (const breed of PRESETS) for (const kind of ['glasses']) { // as glasses.test.js: the clear lens
      const cat = buildCat(breed, { face: kind }); cat.updateMatrixWorld(true);
      const head = cat.userData.parts.head, set = eyesOf(cat), yaw = GLASSES.cat.yaw;
      const lenses = head.children.filter((m) => m.userData.glassesPart === 'lenses');
      expect(lenses.length).toBeGreaterThan(0);
      for (const side of [-1, 1]) {
        const c = new THREE.Vector3(side * 0.083, 0.03, -0.17), n = new THREE.Vector3(side * Math.sin(yaw), 0, -Math.cos(yaw));
        const parts = [set.eyes, set.pupils, set.shines].map((list) => list.find((m) => Math.sign(m.position.x) === side));
        const eyeFront = Math.max(...parts.flatMap((m) => headVerts(cat, m).map((v) => v.sub(c).dot(n))));
        const lensBack = Math.min(...lenses.flatMap((m) => headVerts(cat, m)).filter((v) => Math.sign(v.x) === side).map((v) => v.sub(c).dot(n)));
        expect(lensBack, `${breed} ${kind}`).toBeGreaterThan(eyeFront);
      }
    }
  });

  // catmodel.test.js "the far eye stays inside the head outline", for the lens eyes.
  it.each(['soft', 'cat'])('%s: from the side the far eye stays inside the head outline', (eyes) => {
    pick({ eyes });
    for (const breed of ['tabby', 'digit']) for (const state of ['follow', 'stalk']) {
      const cat = buildCat(breed); animateCat(cat, state, 1.3, 0, false); cat.updateMatrixWorld(true);
      const head = cat.userData.parts.head, skull = head.children[0], set = eyesOf(cat);
      const inv = skull.matrixWorld.clone().invert();
      for (const yaw of [0, 10, 20, 30]) for (const up of [0, 0.12]) {
        const a = (yaw * Math.PI) / 180, dir = new THREE.Vector3(Math.cos(a), up, Math.sin(a));
        const e = dir.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(inv)).divideScalar(SKULL.R).normalize();
        for (const m of [set.eyes, set.pupils, set.shines].map((l) => l.find((x) => x.position.x < 0))) {
          let worst = -Infinity;
          for (const w of verts(m)) { const v = w.applyMatrix4(inv).divideScalar(SKULL.R); worst = Math.max(worst, v.addScaledVector(e, -v.dot(e)).length() - 1); }
          expect(worst * SKULL.R, `${breed} ${state} yaw ${yaw}`).toBeLessThanOrEqual(0.001);
        }
      }
    }
  });
});

describe('B5, the profile', () => {
  it('the ball stays under hats and the neck: nothing moves on the crown or behind', () => {
    pick({ profile: 'profile' });
    const p = new THREE.Vector3();
    for (const [x, y, z] of [[0, 0.193, 0], [0.1, 0.16, 0.02], [0, 0.15, -0.12], [0.2, 0, 0.05], [0, -0.1, 0.17], [0, 0, 0.2], [0.12, 0.15, 0.04]]) {
      p.set(x, y, z); const before = p.clone();
      expect(faceWarp(p).distanceTo(before), `${x},${y},${z}`).toBeLessThan(0.0012);
    }
    // the brow and the cheeks do come forward
    expect(skullFrontZ(0, PROFILE.browY)).toBeLessThan(-0.185);
    pick({});
    const flat = skullFrontZ(0.15, PROFILE.cheekY);
    pick({ profile: 'profile' });
    expect(flat - skullFrontZ(0.15, PROFILE.cheekY)).toBeGreaterThan(0.008);
  });

  // How far a head-space point stands out of the shaped face, along the line from the head's centre.
  const [SA, SB, SC] = SKULL.SCALE.map((k) => k * SKULL.R);
  const proudOf = (v) => { const on = faceWarp(v.clone().multiplyScalar(1 / Math.hypot(v.x / SA, v.y / SB, v.z / SC))); return v.length() - on.length(); };
  it('the skull\'s markings and the face scars lie on the shaped face', () => {
    pick({ profile: 'profile' });
    for (const breed of ['tabby', 'robbie', 'calico', 'd2']) {
      const cat = buildCat(breed, undefined, { scars: [{ site: 'face', stage: 'full', side: 'l' }, { site: 'face', stage: 'full', side: 'r' }] });
      animateCat(cat, 'follow', 1.3, 0, false); cat.updateMatrixWorld(true);
      const head = cat.userData.parts.head, skull = head.children[0];
      // every marking vertex on the face's front is within 3 mm of the shaped skull
      for (const mark of skull.children.filter((c) => c.isMesh)) {
        for (const v of headVerts(cat, mark)) expect(Math.abs(proudOf(v)), breed).toBeLessThan(0.005);
      }
      // the face scars: every strip vertex on the head sits just proud of the shaped face, never under it
      const scars = cat.userData.parts.scars, inv = head.matrixWorld.clone().invert();
      const p = scars.geometry.attributes.position, split = scars.userData.split ?? 0;
      let seen = 0;
      for (let i = 0; i < p.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(scars.matrixWorld).applyMatrix4(inv);
        if (v.z > -0.1 || v.y < 0.03 || Math.abs(v.x) > 0.16 || v.y > 0.17) continue; // the face strips only
        seen++;
        const proud = proudOf(v);
        expect(proud, breed).toBeGreaterThan(0);
        expect(proud, breed).toBeLessThan(0.008);
      }
      expect(seen, breed).toBeGreaterThan(20);
    }
  });
});

describe('B6, the shell ears', () => {
  it('each ear is one mesh with the pink in its hollow, lower, further out and tipped forward; breeds keep their sizes', () => {
    const tall = {};
    for (const breed of ['tabby', 'persian', 'siamese', 'mainecoon', 'digit']) {
      pick({});
      const was = buildCat(breed); was.updateMatrixWorld(true);
      pick({ ears: 'shell' });
      const cat = buildCat(breed); cat.updateMatrixWorld(true);
      for (const key of ['earL', 'earR']) {
        const ear = cat.userData.parts[key], old = was.userData.parts[key], side = Math.sign(ear.position.x);
        expect(ear.children).toHaveLength(0);
        expect(old.children).toHaveLength(1);
        expect(Math.abs(ear.position.x)).toBeGreaterThan(Math.abs(old.position.x));
        expect(ear.position.y).toBeLessThan(old.position.y);
        expect(ear.rotation.x).toBeLessThan(0);
        expect(ear.rotation.z).toBeCloseTo(old.rotation.z, 9); // the animator's lean, as built
        const pts = headVerts(cat, ear), oldPts = headVerts(was, old);
        const w = (list) => Math.max(...list.map((v) => v.x * side)) - Math.min(...list.map((v) => v.x * side));
        expect(w(pts), breed).toBeGreaterThan(w(oldPts)); // a wider base
        // a hollow: pink vertices on the front, none on the back
        const col = ear.geometry.attributes.color, nor = ear.geometry.attributes.normal;
        const base = ear.material.color;
        let pinkFront = 0;
        for (let i = 0; i < col.count; i++) {
          const pink = col.getX(i) * base.r > base.r * 1.05 || Math.abs(col.getX(i) - col.getY(i)) > 0.05;
          if (pink) { pinkFront++; expect(nor.getZ(i), breed).toBeLessThan(0); }
        }
        if (breed !== 'siamese') expect(pinkFront, breed).toBeGreaterThan(4);
        tall[breed] = Math.max(...pts.map((v) => v.y)) - Math.min(...pts.map((v) => v.y));
      }
      // the twitch and the pin still turn it
      animateCat(cat, 'cross', 1.3, 0, false);
      expect(cat.userData.parts.earL.rotation.x).toBeCloseTo(-SHELL_EAR.tip, 9);
      expect(Math.abs(cat.userData.parts.earL.rotation.z)).toBeGreaterThan(0.22);
    }
    expect(tall.persian).toBeLessThan(tall.tabby);
    expect(tall.siamese).toBeGreaterThan(tall.tabby);
    expect(tall.mainecoon).toBeGreaterThan(tall.tabby); // its tufts
  });

  it('a face scar still nicks the ear: two strokes on the shell\'s back, riding the ear when it is pinned', () => {
    pick({ ears: 'shell' });
    for (const [side, key] of [['l', 'earL'], ['r', 'earR']]) {
      const cat = buildCat('tabby', undefined, { scars: [{ site: 'face', stage: 'full', side }] });
      const scars = cat.userData.parts.scars;
      expect(scars.userData.earKey).toBe(key);
      const { split, earSplit } = scars.userData;
      expect(earSplit - split).toBe(12); // the nick's two strokes (SCAR_NICK)
      for (const state of ['follow', 'cross']) {
        animateCat(cat, state, 1.3, 0, false); cat.updateMatrixWorld(true);
        const ear = cat.userData.parts[key], inv = ear.matrixWorld.clone().invert();
        const p = scars.geometry.attributes.position, backAt = ear.geometry.userData.backAt, sx = side === 'l' ? -1 : 1;
        for (let i = split; i < earSplit; i++) {
          const v = new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(scars.matrixWorld).applyMatrix4(inv);
          // on the outer half of the ear's back, a hair proud of it: nearer than 4 mm to the back sheet somewhere
          expect(v.x * sx, state).toBeGreaterThan(0);
          let near = Infinity;
          for (let a = 0; a <= 30; a++) for (let b = 6; b <= 27; b++) near = Math.min(near, backAt(a / 30, b / 30, sx).point.distanceTo(v));
          expect(near, state).toBeLessThan(0.006);
        }
      }
    }
  });

  it.each(['crown', 'tophat', 'beanie', 'wizard', 'partycrown', 'leafcrown', 'candlehat'])('%s still sits between the ears: the shell ear tips stand clear of it on each side', (hat) => {
    pick({ ears: 'shell' });
    for (const breed of ['tabby', 'persian']) {
      const bare = buildCat(breed), cat = buildCat(breed, { head: hat }); cat.updateMatrixWorld(true); bare.updateMatrixWorld(true);
      const head = cat.userData.parts.head;
      const have = new Set(bare.userData.parts.head.children.map((c) => c.geometry?.attributes.position.count + ':' + c.position.toArray().join()));
      const hats = head.children.filter((c) => c.isMesh && !have.has(c.geometry.attributes.position.count + ':' + c.position.toArray().join()));
      expect(hats.length).toBeGreaterThan(0);
      for (const key of ['earL', 'earR']) {
        const ear = cat.userData.parts[key], side = Math.sign(ear.position.x);
        const tip = headVerts(cat, ear).reduce((a, v) => (v.y > a.y ? v : a));
        // the ear's tip is not buried in the hat's middle: it is out to the side of the head's midline
        expect(tip.x * side, `${breed} ${hat}`).toBeGreaterThan(0.1);
      }
    }
  });
});
