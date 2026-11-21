import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCat, catStyle } from '../src/cat/model.js';
import { animateCat } from '../src/cat/animator.js';
import { TUFT, tuftPlan, tuftSeed, furKind, lobeReach } from '../src/cat/tufts.js';
import { TORSO, torsoSurface } from '../src/cat/torso.js';
import { SCAR_LAYOUT } from '../src/cat/scarmesh.js';
import { mulberry32 } from '../src/rng.js';
import { PRESETS, meshCount, triangles } from './helpers/catfingerprint.js';

// Cat realism round 2, B7 (2026-11-15): fur tufts (src/cat/tufts.js). Locks and
// lobed bands of fur written into meshes the cat already has.
const BARE = { collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null };
const LOOK = (fur, pattern = 'stripes') => ({ coat: 'ginger', marks: 'chocolate', pattern, fur, eyes: 'green', size: 1 });
const SHORT = ['tabby', 'siamese', 'black', 'calico', 'zeetoo', 'robbie', 'digit'];
const LONG = ['persian', 'mainecoon'];

// Every mesh of the cat that carries tufts: [mesh, { start, count, index }].
const tufted = (cat) => {
  const out = [];
  cat.traverse((o) => { if (o.isMesh && o.geometry.userData.tufts) out.push([o, o.geometry.userData.tufts]); });
  return out;
};
const tuftTris = (mesh) => (mesh.geometry.userData.tufts?.indices ?? 0) / 3;
const allTuftTris = (cat) => tufted(cat).reduce((n, [m]) => n + tuftTris(m), 0);
const tuftArrays = (cat) => tufted(cat).map(([m, t]) => Array.from(m.geometry.attributes.position.array.slice(t.start * 3, (t.start + t.count) * 3)));
const draws = (fn) => { const real = Math.random; let n = 0; Math.random = () => { n++; return real(); }; try { fn(); } finally { Math.random = real; } return n; };
// The ruff's fringe is tuft geometry too, though it lives in ruff.js: 5 locks.
const FRINGE_TRIS = 50;

describe('fur tufts (cat realism B7)', () => {
  it('a cat always grows the same fur; a different cat grows different fur', () => {
    for (const b of PRESETS) {
      expect(tuftArrays(buildCat(b)), b).toEqual(tuftArrays(buildCat(b)));
      expect(tuftArrays(buildCat(b, undefined, { simple: true })), b).toEqual(tuftArrays(buildCat(b, undefined, { simple: true })));
    }
    expect(tuftArrays(buildCat('tabby'))).not.toEqual(tuftArrays(buildCat('black')));
    expect(tuftSeed(catStyle('tabby'))).not.toBe(tuftSeed(catStyle('zeetoo')));
    expect(tuftArrays(buildCat('tabby', undefined, { look: LOOK('long') }))).not.toEqual(tuftArrays(buildCat('tabby', undefined, { look: LOOK('long', 'points') })));
  });

  // Building a cat makes three.js objects, each of which draws its uuid from
  // Math.random, and every seeded stream that follows a cat's build depends on
  // how many (flattrace.test.js). These are the counts measured on main before
  // the tufts (929e024): the tufts add no object and draw nothing.
  const DRAWS = { 'tabby|0': 516, 'tabby|1': 392, 'siamese|0': 532, 'siamese|1': 408, 'persian|0': 552, 'persian|1': 428, 'black|0': 516, 'black|1': 392, 'calico|0': 528, 'calico|1': 404, 'mainecoon|0': 552, 'mainecoon|1': 428, 'zeetoo|0': 516, 'zeetoo|1': 392, 'robbie|0': 528, 'robbie|1': 404, 'd2|0': 576, 'd2|1': 452, 'digit|0': 596, 'digit|1': 472 };
  const KIT = { collar: 'bell', head: 'beanie', face: 'glasses', neck: 'scarf', body: 'cape', back: 'backpack', feet: 'booties' };
  it('building a cat draws exactly the random numbers it drew before the tufts', () => {
    for (const b of PRESETS) for (const simple of [false, true]) expect(draws(() => buildCat(b, undefined, { simple })), `${b} simple ${simple}`).toBe(DRAWS[`${b}|${+simple}`]);
    expect(draws(() => buildCat('tabby', { ...KIT }))).toBe(768);
    expect(draws(() => buildCat('persian', { ...KIT }))).toBe(804);
    for (const fur of ['short', 'fluffy', 'long']) for (const pattern of ['solid', 'stripes', 'points']) {
      expect(draws(() => buildCat('tabby', undefined, { look: LOOK(fur, pattern) })), `${pattern} ${fur}`).toBe(fur === 'short' ? 516 : 552);
    }
    // and a kitten's fuzz draws nothing more than the calico she is built from
    expect(draws(() => buildCat('calico', undefined, { kitten: true }))).toBe(DRAWS['calico|0']);
  });

  it('adds no mesh: the tufts are in the torso, the underside, the skull and the tail links', () => {
    for (const b of PRESETS) {
      const cat = buildCat(b), { body, underside, head, tailPivots } = cat.userData.parts;
      const hosts = new Set([body, underside, head.children[0], ...tailPivots.map((p) => p.children[0])]);
      for (const [mesh] of tufted(cat)) expect(hosts.has(mesh), `${b}: ${mesh.name || mesh.uuid}`).toBe(true);
      expect(body.geometry.userData.tufts, b).toBeTruthy();
      expect(head.children[0].geometry.userData.tufts, b).toBeTruthy();
    }
    // the same meshes as a cat has always had (the golden fingerprints pin the counts too)
    expect(meshCount(buildCat('persian'))).toBe(meshCount(buildCat('persian', { ...BARE })));
  });

  // The budget: about +150 triangles on a short-haired cat and +400 on a
  // long-haired one (the plan), and a lighter set on the crowd's simple cats.
  it('stays inside its triangle budget', () => {
    for (const b of SHORT) {
      const full = allTuftTris(buildCat(b)), simple = allTuftTris(buildCat(b, undefined, { simple: true }));
      expect(full, b).toBeGreaterThanOrEqual(100);
      expect(full, b).toBeLessThanOrEqual(180);
      expect(simple, `${b} simple`).toBeGreaterThan(0);
      expect(simple, `${b} simple`).toBeLessThanOrEqual(96);
    }
    for (const b of [...LONG, 'd2']) {
      // the fringe's five locks replace the old points (90 triangles full, 60 simple)
      const full = allTuftTris(buildCat(b)) + FRINGE_TRIS - 90, simple = allTuftTris(buildCat(b, undefined, { simple: true })) + FRINGE_TRIS - 60;
      expect(full, b).toBeGreaterThanOrEqual(250);
      expect(full, b).toBeLessThanOrEqual(450);
      expect(simple, `${b} simple`).toBeLessThanOrEqual(250);
    }
    expect(allTuftTris(buildCat('calico', undefined, { kitten: true }))).toBeLessThanOrEqual(200);
  });

  // The merged cat (realism 2's fur on realism 3's face): the detailed cat's cap
  // is 10,350, the owner's whole +15% over 9,000, and may not rise again; the
  // crowd's stays 5,500. The worst cases wear two scars: D2 among the presets
  // (9,988), a striped long-haired builder cat over all (10,328); Digit's simple
  // build is the crowd's (5,480).
  it('every cat with two scars fits under the triangle caps: 10,350 detailed, 5,500 simple', () => {
    const scars = [{ site: 'face', stage: 'full', side: 'l' }, { site: 'shoulder', stage: 'full', side: 'r' }];
    let worst = 0, worstSimple = 0;
    const check = (label, breed, opts) => {
      const full = triangles(buildCat(breed, undefined, { ...opts, scars })), simple = triangles(buildCat(breed, undefined, { ...opts, scars, simple: true }));
      expect(full, label).toBeLessThanOrEqual(10350);
      expect(simple, `${label} simple`).toBeLessThanOrEqual(5500);
      worst = Math.max(worst, full); worstSimple = Math.max(worstSimple, simple);
    };
    for (const b of PRESETS) check(b, b, {});
    for (const fur of ['short', 'fluffy', 'long']) for (const pattern of ['solid', 'stripes', 'points', 'patches', 'socks']) check(`${pattern} ${fur}`, 'tabby', { look: LOOK(fur, pattern) });
    expect(triangles(buildCat('d2', undefined, { scars }))).toBeLessThanOrEqual(10000);
    expect(worst).toBe(triangles(buildCat('tabby', undefined, { look: LOOK('long', 'stripes'), scars })));
    expect(worstSimple).toBeLessThanOrEqual(5480);
  });

  it('long fur is longer than fluffy fur, and that longer than short; a kitten has her own', () => {
    expect(furKind(catStyle('tabby'))).toBe('short');
    expect(furKind(catStyle('persian'))).toBe('long');
    expect(furKind(catStyle('mainecoon'))).toBe('long');
    expect(furKind(catStyle('d2'))).toBe('fluffy'); // her tail is drawn from photos: no plume
    expect(furKind(catStyle('tabby'), true)).toBe('kitten');
    expect(TUFT.long.len).toBeGreaterThan(TUFT.fluffy.len);
    expect(TUFT.fluffy.len).toBeGreaterThan(TUFT.short.len);
    expect(allTuftTris(buildCat('persian'))).toBeGreaterThan(allTuftTris(buildCat('tabby')) * 1.5);
    expect(tuftArrays(buildCat('calico', undefined, { kitten: true }))).not.toEqual(tuftArrays(buildCat('calico')));
  });

  it('a band\'s edge is uneven lobes: no two alike, the ends run into the coat', () => {
    const { r, k } = lobeReach(mulberry32(7), 4, 3);
    expect(r).toHaveLength(13);
    expect(r[0]).toBeLessThan(0.3);
    expect(r[12]).toBeLessThan(0.3);
    expect(k[0]).toBe(0);
    expect(k[12]).toBeCloseTo(1, 12);
    for (let j = 1; j < k.length; j++) expect(k[j]).toBeGreaterThan(k[j - 1]);
    const tips = [1, 4, 7, 10].map((j) => Math.max(r[j], r[j + 1]));
    expect(new Set(tips.map((v) => v.toFixed(3))).size).toBe(4);
    for (const j of [3, 6, 9]) expect(r[j]).toBeLessThan(Math.min(r[j - 1], r[j + 1])); // a notch between lobes
  });

  // What a cat wears decides where fur grows (tufts.js tuftPlan).
  describe('under an outfit', () => {
    const tris = (cat, part) => tuftTris(part === 'skull' ? cat.userData.parts.head.children[0] : cat.userData.parts[part]);
    const tailTris = (cat) => cat.userData.parts.tailPivots.reduce((n, p) => n + tuftTris(p.children[0]), 0);
    it.each(['sweater', 'hoodie', 'raincoat'])('a %s covers the torso: no fur on the torso or the chest', (bodyItem) => {
      for (const b of ['tabby', 'persian', 'mainecoon', 'd2', 'digit']) {
        const cat = buildCat(b, { ...BARE, body: bodyItem });
        expect(tris(cat, 'body'), b).toBe(0);
        expect(cat.userData.parts.underside.userData.ranges.tufts, b).toBeUndefined();
        expect(tris(cat, 'skull'), b).toBeGreaterThan(0); // the cheeks are bare of cloth
        expect(tailTris(cat), b).toBeGreaterThan(0);
      }
    });
    it.each(['cape', 'confetticape'])('a %s covers the shoulders and the rump: no mane, no trousers, no chest fur; the belly skirt stays', (cape) => {
      for (const b of ['tabby', 'persian', 'mainecoon']) {
        const plan = tuftPlan(catStyle(b), { ...BARE, body: cape });
        expect([plan.mane, plan.trousers, plan.chest, plan.skirt]).toEqual([false, false, false, true]);
        const cat = buildCat(b, { ...BARE, body: cape }), bare = buildCat(b, { ...BARE });
        expect(tris(cat, 'body'), b).toBeGreaterThan(0);
        expect(tris(cat, 'body'), b).toBeLessThan(tris(bare, 'body'));
        expect(cat.userData.parts.underside.userData.ranges.tufts, b).toBeUndefined();
        // every torso tuft left is the skirt: low on the flanks, under the cape's hem
        const { body } = cat.userData.parts, t = body.geometry.userData.tufts, p = body.geometry.attributes.position;
        for (let i = t.start; i < t.start + t.count; i++) expect(p.getY(i), `${b} vertex ${i}`).toBeLessThan(-0.5 * TORSO.R);
      }
      // a plumed tail's fur starts past the hem
      const caped = buildCat('persian', { ...BARE, body: cape }).userData.parts.tailPivots;
      expect(tuftTris(caped[0].children[0]) + tuftTris(caped[1].children[0])).toBe(0);
      expect(tuftTris(caped[3].children[0])).toBeGreaterThan(0);
    });
    it('a found cape or the jumper is a cover', () => {
      for (const b of ['tabby', 'persian', 'mainecoon']) {
        expect(tuftPlan(catStyle(b), { ...BARE, body: 'doormatcape' }), b).toEqual(tuftPlan(catStyle(b), { ...BARE, body: 'cape' }));
        expect(tuftPlan(catStyle(b), { ...BARE, body: 'beachtowelcape' }), b).toEqual(tuftPlan(catStyle(b), { ...BARE, body: 'cape' }));
        expect(tuftPlan(catStyle(b), { ...BARE, body: 'fishermansjumper' }), b).toEqual(tuftPlan(catStyle(b), { ...BARE, body: 'sweater' }));
      }
    });
    it.each(['backpack', 'jetpack', 'wings'])('%s straps lie where the mane would: no mane, the rest stays', (back) => {
      for (const b of LONG) {
        const cat = buildCat(b, { ...BARE, back }), bare = buildCat(b, { ...BARE });
        expect(tuftPlan(catStyle(b), { ...BARE, back }).mane).toBe(false);
        expect(tris(cat, 'body'), b).toBeLessThan(tris(bare, 'body'));
        // nothing forward of the belly skirt and trousers: no torso tuft above the middle of the flank at the shoulders
        const { body } = cat.userData.parts, t = body.geometry.userData.tufts, p = body.geometry.attributes.position;
        for (let i = t.start; i < t.start + t.count; i++) if (p.getZ(i) < -0.1 * TORSO.R) expect(p.getY(i), `${b} vertex ${i}`).toBeLessThan(-0.4 * TORSO.R);
      }
    });
    it('a collar, a scarf, a tie or a bandana keeps a long-haired cat\'s cheek ruff short, above it', () => {
      const low = (cat) => {
        const skull = cat.userData.parts.head.children[0], t = skull.geometry.userData.tufts, p = skull.geometry.attributes.position;
        let y = Infinity;
        for (let i = t.start; i < t.start + t.count; i++) y = Math.min(y, p.getY(i) * skull.scale.y);
        return y;
      };
      for (const b of LONG) {
        const bare = low(buildCat(b, { ...BARE }));
        for (const acc of [{ collar: 'bell' }, { neck: 'scarf' }, { neck: 'necktie' }, { neck: 'bandana' }, { collar: 'tag' }]) {
          const worn = low(buildCat(b, { ...BARE, ...acc }));
          expect(worn, `${b} ${JSON.stringify(acc)}`).toBeGreaterThan(bare + 0.01);
          // the collar's ring sits 0.14 under the head's centre, 0.028 thick: the ruff ends above its top
          expect(worn, `${b} ${JSON.stringify(acc)}`).toBeGreaterThan(-0.14);
        }
      }
      // Digit wears his own collar always: his plan knows
      expect(tuftPlan(catStyle('digit'), { ...BARE }).cheekShort).toBe(true);
    });
    it('something round the neck lies on the chest: no chest fur under it', () => {
      for (const neck of ['scarf', 'necktie', 'bowtie', 'bandana']) {
        expect(buildCat('tabby', { ...BARE, neck }).userData.parts.underside.userData.ranges.tufts, neck).toBeUndefined();
      }
      expect(buildCat('tabby', { ...BARE }).userData.parts.underside.userData.ranges.tufts).toBeDefined();
      expect(buildCat('tabby', { ...BARE, collar: 'bell' }).userData.parts.underside.userData.ranges.tufts).toBeDefined();
    });
    it('a hat covers the ear tips: a Maine Coon\'s ear tufts (face.js, built into the ear) are left out under one', () => {
      // the ear's height: a tufted ear stands taller by its tip
      const top = (cat) => { const g = cat.userData.parts.earL.geometry; g.computeBoundingBox(); return g.boundingBox.max.y; };
      expect(tuftPlan(catStyle('mainecoon'), { ...BARE }).ears).toBe(true);
      expect(tuftPlan(catStyle('mainecoon'), { ...BARE, head: 'beanie' }).ears).toBe(false);
      expect(tuftPlan(catStyle('persian'), { ...BARE }).ears).toBe(false); // no `tufts` on her row
      expect(top(buildCat('mainecoon', { ...BARE }))).toBeGreaterThan(top(buildCat('mainecoon', { ...BARE, head: 'beanie' })) + 0.005);
      // one set of ear tips only: nothing of tufts.js is on an ear
      for (const b of PRESETS) for (const ear of ['earL', 'earR']) expect(buildCat(b).userData.parts[ear].geometry.userData.tufts, b).toBeUndefined();
    });
    it('boots, socks and glasses change nothing: no fur grows on a paw or at the eyes', () => {
      for (const acc of [{ feet: 'rainboots' }, { feet: 'socks' }, { face: 'glasses' }]) {
        expect(tuftArrays(buildCat('persian', { ...BARE, ...acc }))).toEqual(tuftArrays(buildCat('persian', { ...BARE })));
      }
      const { legs } = buildCat('persian').userData.parts;
      for (const leg of legs) for (const part of leg.children) expect(part.geometry.userData.tufts).toBeUndefined();
    });
  });

  // Scars are laid on the torso's own facets (scarmesh.js torsoHit) and must
  // stay readable: no fur over a scar's site, and no scar laid on a lock.
  describe('scars', () => {
    const SITES = ['shoulder', 'back', 'side', 'hind'];
    it('no torso fur lies over a body scar\'s place, on any cat, either side', () => {
      for (const b of PRESETS) {
        const cat = buildCat(b), { body } = cat.userData.parts, t = body.geometry.userData.tufts, p = body.geometry.attributes.position;
        const bs = body.scale, v = new THREE.Vector3();
        for (const site of SITES) for (const sx of [1, -1]) {
          const d = SCAR_LAYOUT[site].dir;
          // the scar's middle on the torso (metres, torso frame), as scarmesh.js aims it
          const mid = torsoSurface([d[0] * sx / bs.x, d[1] / bs.y, d[2] / bs.z]).multiply(bs);
          let nearest = Infinity;
          for (let i = t.start; i < t.start + t.count; i++) nearest = Math.min(nearest, v.fromBufferAttribute(p, i).multiply(bs).distanceTo(mid));
          // a scar's three lines reach 5 to 6 cm from its middle
          expect(nearest, `${b} ${site} ${sx}`).toBeGreaterThan(0.06);
        }
      }
    });
    it('a scar lies on the coat exactly where it lay without fur', () => {
      const scars = [{ site: 'shoulder', stage: 'full', side: 'l' }, { site: 'hind', stage: 'full', side: 'r' }];
      for (const b of ['persian', 'mainecoon', 'tabby']) {
        const cat = buildCat(b, undefined, { scars });
        const { body } = cat.userData.parts, bs = body.scale;
        const mesh = cat.children.find((c) => c.userData.scars || c.name === 'scars') ?? cat.children[cat.children.length - 1];
        const p = mesh.geometry.attributes.position, v = new THREE.Vector3();
        expect(p.count).toBeGreaterThan(0);
        for (let i = 0; i < p.count; i++) {
          // into the torso mesh's frame, then against the torso's own surface along that direction
          v.fromBufferAttribute(p, i).sub(body.position);
          const on = torsoSurface([v.x / bs.x, v.y / bs.y, v.z / bs.z]).multiply(bs);
          expect(v.length() - on.length(), `${b} vertex ${i}`).toBeLessThan(0.012); // the strip's 4 mm lift, and the facets' sag
          expect(v.length() - on.length(), `${b} vertex ${i}`).toBeGreaterThan(-0.012);
        }
      }
    });
  });

  // On realism 3's face: the cheek ruff keeps to the side of the head, behind
  // the eyes and the whiskers' roots (both at head z -0.16 and further forward).
  it('the cheek ruff stays clear of the eyes and the whiskers\' roots', () => {
    const v = new THREE.Vector3();
    for (const b of PRESETS) for (const acc of [{}, { collar: 'bell' }]) {
      const cat = buildCat(b, { ...BARE, ...acc }), { head } = cat.userData.parts, skull = head.children[0];
      const t = skull.geometry.userData.tufts, p = skull.geometry.attributes.position;
      const eyes = head.userData.eyes.eyes.map((e) => e.position);
      expect(eyes).toHaveLength(2);
      for (let i = t.start; i < t.start + t.count; i++) {
        v.fromBufferAttribute(p, i).multiply(skull.scale); // head frame
        expect(v.z, `${b} vertex ${i}`).toBeGreaterThan(-0.12);
        for (const e of eyes) expect(v.distanceTo(e), `${b} vertex ${i}`).toBeGreaterThan(0.07); // an eye is under 0.045 from its centre to its rim
        expect(Math.abs(v.x), `${b} vertex ${i}`).toBeGreaterThan(0.1); // the whiskers leave the pads at |x| 0.07
      }
    }
  });

  it('hanging fur stays off the ground where the body rests on it, and a lying tail\'s fur off the ground too', () => {
    const v = new THREE.Vector3();
    for (const b of PRESETS) for (const simple of [false, true]) {
      const cat = buildCat(b, undefined, { simple });
      for (const state of ['follow', 'perch', 'requestPet', 'nap', 'stalk']) {
        animateCat(cat, state, 1.3, 0, false);
        cat.updateMatrixWorld(true);
        for (const [mesh, t] of tufted(cat)) {
          const p = mesh.geometry.attributes.position;
          for (let i = t.start; i < t.start + t.count; i++) {
            expect(v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld).y / cat.scale.x, `${b} simple ${simple} ${state}`).toBeGreaterThanOrEqual(-0.005);
          }
        }
      }
    }
  });

  it('the fur wears the coat: a black cat\'s is black, Robbie\'s white flanks carry onto his, a tabby\'s is striped', () => {
    const colours = (cat) => {
      const { body } = cat.userData.parts, t = body.geometry.userData.tufts, c = body.geometry.attributes.color, out = [];
      for (let i = t.start; i < t.start + t.count; i++) out.push(new THREE.Color(c.getX(i), c.getY(i), c.getZ(i)));
      return out;
    };
    const base = new THREE.Color(0x2a2a30);
    for (const c of colours(buildCat('black'))) {
      // the base under the coat's baked shade (never under 0.7) and the lobe edge's
      expect(c.r).toBeLessThanOrEqual(base.r + 1e-6);
      expect(c.r).toBeGreaterThanOrEqual(base.r * 0.7 * TUFT.edgeShade - 1e-6);
    }
    const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const robbie = colours(buildCat('robbie')).map(lum);
    expect(Math.max(...robbie)).toBeGreaterThan(0.5); // white, from his flanks and bib
    const tabby = colours(buildCat('tabby', undefined, { look: LOOK('long') })).map(lum);
    expect(Math.max(...tabby) - Math.min(...tabby)).toBeGreaterThan(0.08); // stripes cross the mane and the trousers
    // a pointed cat's cheek ruff wears her mask's colours
    const skull = buildCat('siamese').userData.parts.head.children[0], t = skull.geometry.userData.tufts, sc = skull.geometry.attributes.color;
    expect(sc.count).toBe(skull.geometry.attributes.position.count);
    for (let i = t.start; i < t.start + t.count; i++) expect(sc.getX(i)).toBeLessThan(0.5); // the dark mask, not the cream body
  });

  it('the taste call scales the fur and never the object or draw counts', () => {
    const was = TUFT.amount;
    try {
      const extent = (cat) => { const b = new THREE.Box3(); for (const a of tuftArrays(cat)) b.union(new THREE.Box3().setFromArray(a)); return b.getSize(new THREE.Vector3()).length(); };
      const normal = buildCat('persian');
      TUFT.amount = 0.6;
      const less = buildCat('persian');
      TUFT.amount = 1.4;
      const more = buildCat('persian');
      expect(meshCount(less)).toBe(meshCount(normal));
      expect(meshCount(more)).toBe(meshCount(normal));
      expect(allTuftTris(less)).toBeLessThanOrEqual(allTuftTris(normal));
      expect(allTuftTris(more)).toBe(allTuftTris(normal));
      expect(extent(more)).toBeGreaterThan(extent(normal));
    } finally {
      TUFT.amount = was;
    }
  });
});
