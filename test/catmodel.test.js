import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import * as THREE from 'three';
import { buildCat, coatColor, CAT_LOOK_Y } from '../src/cat/model.js';
import { samples, lum as lumC, meshCount, surfaceHit, PRESETS, triangles, colourDistance } from './helpers/catfingerprint.js';
import { animateCat } from '../src/cat/animator.js';
import { LEG_BLEND, CLAW_HEX } from '../src/cat/limbs.js';
import { CATALOG } from '../src/progression.js';
import { VISIT_PRIZES } from '../src/visits.js';
import { ruffGeometry, RUFF, jawFluffColour } from '../src/cat/ruff.js';
import { TORSO, CHEST } from '../src/cat/torso.js';
import { DEFAULT_LOOK, lookToStyle } from '../src/customcats.js';

// Wave 6 (docs/VISUAL-PASS.md) reshaped the cat. These are the properties that
// wave established and that a later edit could silently undo — none of them are
// visible to animator.test.js, which tests poses rather than the model.
//
// Everything here is measured off a really-built model. There are no fixtures:
// the whole point of the wave was that the numbers in the source did not match
// the numbers on screen, so a test that asserted against hand-copied numbers
// would reproduce exactly the bug it is meant to catch.

const BREEDS = ['tabby', 'siamese', 'persian', 'black', 'calico', 'mainecoon', 'zeetoo', 'robbie', 'd2', 'digit'];
const ALL = [...BREEDS, 'hagrid'];
const FEET = ['booties', 'sneakers', 'rainboots', 'socks'];
const STATES = ['follow', 'nap', 'stretch', 'groom', 'requestPet', 'perch', 'sniff', 'stalk', 'pounce', 'scared', 'cross', 'land'];

// The published shape of the cat rig: buildCat's radius and the scale it puts
// on the body/skull meshes. A marking generated on a sphere of THIS radius, and
// parented to THAT mesh, is deformed by the scene graph exactly as the surface
// under it — which is the whole mechanism. If the model's numbers move, the
// assertions below fail rather than quietly passing against stale ones.
const BODY_R = 0.32;
const SKULL_R = 0.21;
const PATCH_LIFT = 1.008;

const boxOf = (cat) => {
  cat.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(cat);
};

describe('cat model: the parts contract the animator depends on', () => {
  for (const breed of ALL) {
    it(`${breed} exposes every part animateCat reaches for`, () => {
      const cat = buildCat(breed);
      const p = cat.userData.parts;
      // Destructured verbatim by animateCat's first line.
      expect(p.body).toBeTruthy();
      expect(p.head).toBeTruthy();
      expect(p.tail).toBeTruthy();
      expect(p.earL).toBeTruthy();
      expect(p.earR).toBeTruthy();
      expect(p.legs).toHaveLength(4);       // indexed 0..3 by the 4-beat gait
      expect(p.tailPivots).toHaveLength(5); // iterated whole, and [0] indexed by 'perch'
      expect(Array.isArray(p.whiskers)).toBe(true);
      // Read as `cat.userData.base ?? CAT_BASE`, then destructured.
      expect(cat.userData.base.bodyScale).toHaveLength(3);
      expect(cat.userData.base.headPos).toHaveLength(3);
      expect(typeof cat.userData.base.bodyY).toBe('number');
      expect(typeof cat.userData.base.tailRotX).toBe('number');
    });

    it(`${breed} survives every pose, in both motion modes, dressed and bare`, () => {
      for (const acc of [{}, { collar: 'bell', head: 'tophat', face: 'glasses', neck: 'scarf', body: 'sweater', back: 'backpack', feet: 'sneakers' }]) {
        const cat = buildCat(breed, acc);
        for (const state of STATES) {
          expect(() => animateCat(cat, state, 1.3, 0, false)).not.toThrow();
          expect(() => animateCat(cat, state, 2.7, 2.0, true)).not.toThrow();
        }
      }
    });
  }

  it('pivot positions are never written by the animator', () => {
    // The tail's resting curl is a bend the animator applies each frame
    // (Task 5, R3), so the pivots carry no shape in their positions: pivot 0
    // sits at the tail's root, every other one at the end of the link before.
    const cat = buildCat('tabby'); const before = cat.userData.parts.tailPivots.map((p) => p.position.toArray());
    for (const s of STATES) animateCat(cat, s, 2.2, 1.5, false);
    expect(cat.userData.parts.tailPivots.map((p) => p.position.toArray())).toEqual(before);
    expect(before.slice(1).every(([x, y, z]) => x === 0 && y === 0 && z === 0.14)).toBe(true);
  });
});

describe('cat model: markings lie ON the surface they mark', () => {
  // The Wave 6 headline. Before it, a marking was a separate squashed ellipsoid
  // parked near the body: a tabby's stripes stood 6cm proud of the flank, and
  // under Wave 1's 19.1-degree sun they caught a rim of light and cast their own
  // shadow onto the fur beneath — the "stegosaurus plates" read. The fix is
  // structural, and so is this test: a marking must be a patch of the host
  // sphere, parented to the host mesh.
  // Task 4 painted the body's coat into the torso's vertex colours, so the
  // markings left as meshes are the head's: the M, the blaze, the calico's
  // head patch (on the skull) and Digit's chin (on the muzzle).
  for (const breed of ['calico', 'robbie', 'd2', 'digit']) {
    it(`${breed}'s skull markings are children of the skull, at its own radius`, () => {
      const skull = buildCat(breed).userData.parts.head.children[0];
      expect(skull.children.length).toBeGreaterThan(0); // parented to the MESH...
      let checked = 0;
      for (const mark of skull.children) {
        const pos = mark.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          // ...and every vertex sits on that mesh's own sphere. Because the
          // host's non-uniform scale is applied by the scene graph and not by
          // the marking, this single property makes the patch follow the
          // surface in every pose, on every breed, for free.
          expect(Math.hypot(pos.getX(i), pos.getY(i), pos.getZ(i))).toBeCloseTo(SKULL_R * PATCH_LIFT, 5);
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(50);
    });
  }

  it('the lift is small enough that a marking can never cast onto its own host', () => {
    // sun.shadow.bias is -0.00015 over the fitted frustum — centimetres of depth
    // slack. The patch stands 0.8% of the sphere radius off the surface, i.e.
    // ~2.6mm on the body, an order of magnitude inside that. This is why the
    // hard self-shadow rim the old blobs had cannot come back.
    expect((PATCH_LIFT - 1) * BODY_R).toBeLessThan(0.005);
    expect((PATCH_LIFT - 1) * BODY_R).toBeGreaterThan(0.0005); // ...but not zero, or it z-fights
  });

  it('an unmarked breed has no markings at all', () => {
    for (const breed of ['siamese', 'persian', 'black', 'mainecoon']) {
      const cat = buildCat(breed);
      expect(cat.userData.parts.body.children).toEqual([cat.userData.parts.underside]);
    }
  });
});

describe("cat model: Robbie's real coat", () => {
  // Robbie was drawn as a white cat with black splashes — the reverse of the
  // real one, who is black on top (cap, ears, back) with a white blaze, white
  // muzzle and chest, white legs and paws, and big white patches on his flanks.
  // Luminance is read off the built material, so this checks what is drawn,
  // not what the STYLE table says.
  const lum = (m) => 0.2126 * m.color.r + 0.7152 * m.color.g + 0.0722 * m.color.b;

  it('is a dark cat with white legs, white paws and a white-marked painted body', () => {
    const cat = buildCat('robbie');
    const { legs } = cat.userData.parts;
    for (const leg of legs) {
      // The limb is vertex-coloured (body refinement Task 3): white below its
      // top blend, which meets his dark coat at the hip (R7).
      const limb = leg.children[0].geometry;
      const col = limb.attributes.color;
      limb.userData.t.forEach((t, i) => {
        if (t >= LEG_BLEND) expect(lumC(new THREE.Color(col.getX(i), col.getY(i), col.getZ(i)))).toBeGreaterThan(0.8);
      });
      // The paw is vertex-coloured too (Task 4): white but for its claw tips.
      const paw = leg.userData.paw.geometry.attributes.color;
      const claw = new THREE.Color(CLAW_HEX);
      for (let i = 0; i < paw.count; i++) {
        const c = new THREE.Color(paw.getX(i), paw.getY(i), paw.getZ(i));
        if (c.getHex() === claw.getHex()) continue;
        expect(lumC(c)).toBeGreaterThan(0.8);
      }
    }
    // The coat is painted (Task 4): read the torso's own vertex colours.
    const s = samples('robbie');
    const back = s.filter(({ u: [, y] }) => y > 0.9).map(({ c }) => lumC(c));
    expect(back.length).toBeGreaterThan(0);
    expect(Math.max(...back)).toBeLessThan(0.2); // black saddle
    expect(s.some(({ c }) => lumC(c) > 0.8)).toBe(true); // white flanks and bib
  });

  it('has a white bib on the front of his chest', () => {
    // The eye check against the photo: his chest was black.
    const front = samples('robbie').filter(({ u: [x, , z] }) => z < -0.9 && Math.abs(x) < 0.1);
    expect(front.length).toBeGreaterThan(0);
    for (const { c } of front) expect(lumC(c)).toBeGreaterThan(0.8);
  });
});

describe('cat model: D2 and Digit, from the photos', () => {
  // D2 is a big, fluffy grown-up; Digit is a slender young cat who is all legs
  // and ears. Both are measured off the built model, never off STYLE.
  const lengthOf = (cat) => { const b = boxOf(cat); return b.max.z - b.min.z; };
  const COLLAR = (o) => o.isMesh && o.geometry.type === 'TorusGeometry'
    && o.geometry.parameters.radius === 0.15 && o.geometry.parameters.tube === 0.028;

  it('digit is smaller than d2', () => {
    expect(lengthOf(buildCat('digit'))).toBeLessThan(lengthOf(buildCat('d2')));
  });

  it("digit's legs are longer for its body than a tabby's", () => {
    // Paw-to-belly height over body length, both in the cat's own frame, so
    // the breed scale cancels out.
    const legginess = (breed) => {
      const cat = buildCat(breed);
      animateCat(cat, 'follow', 0, 0, false);
      cat.updateMatrixWorld(true);
      const body = new THREE.Box3().setFromObject(cat.userData.parts.body);
      const paw = new THREE.Box3().setFromObject(cat.userData.parts.legs[0].userData.paw);
      return (body.min.y - paw.min.y) / (body.max.z - body.min.z);
    };
    expect(legginess('digit')).toBeGreaterThan(legginess('tabby') * 1.5);
  });

  it('digit rests at ground level in every pose, dressed and bare, like a tabby', () => {
    // Digit's longer legs raise its hips. A pose that folds the legs by
    // scaling them would leave its paws hovering if the model only fixed the
    // standing pose — so every state is checked against the tabby's own
    // resting height in that same state (normalised by breed scale), the
    // tabby wearing Digit's tag collar so both are dressed alike.
    //
    // The floor is "no deeper than the tabby", not a flat -0.001: a standard
    // cat already dips below y = 0 in some poses (the sit, -0.098; the
    // stretch, -0.027; a collar in the nap, -0.031). Those are the existing
    // rig's, and Digit is held to matching them, not to beating them.
    for (const acc of [{}, { body: 'sweater' }, { back: 'cape' }, { back: 'backpack' }]) {
      for (const state of STATES) {
        const lowest = (breed, outfit) => {
          const cat = buildCat(breed, outfit);
          animateCat(cat, state, 1.3, 0, false);
          return boxOf(cat).min.y / cat.scale.x;
        };
        const digit = lowest('digit', acc);
        const tabby = lowest('tabby', { collar: 'tag', ...acc });
        const label = `${state} ${JSON.stringify(acc)}`;
        expect(digit, label).toBeGreaterThanOrEqual(Math.min(-0.001, tabby - 0.001));
        expect(Math.abs(digit - tabby), label).toBeLessThan(0.01);
      }
    }
  });

  it('digit stays as grounded as a tabby through the walk cycle', () => {
    // The per-pose test above holds still (moveSpeed 0). Walking swings every
    // leg each frame, and fitLongLegs re-fits each swung leg to land its sole
    // where a standard leg's would — so over a stride's worth of frames, in
    // every state that falls through to the gait, Digit's lowest point tracks
    // the tabby's to within a centimetre (normalised by breed scale).
    for (const state of ['follow', 'stalk', 'sniff', 'cross']) {
      for (let t = 0; t <= 3; t += 0.25) {
        const lowest = (breed, outfit) => {
          const cat = buildCat(breed, outfit);
          animateCat(cat, state, t, 1.5, false);
          return boxOf(cat).min.y / cat.scale.x;
        };
        const digit = lowest('digit', {});
        const tabby = lowest('tabby', { collar: 'tag' });
        expect(Math.abs(digit - tabby), `${state} t=${t}`).toBeLessThan(0.01);
      }
    }
  });

  it('digit is narrower for its length than a tabby — slender, not a small stocky cat', () => {
    // Width over length of the torso as drawn after a pose, so it reads what
    // the animator actually wrote to body.scale (it rewrites it every frame
    // from userData.base.bodyScale), not what the model built.
    const slimness = (breed) => {
      const cat = buildCat(breed);
      animateCat(cat, 'follow', 0, 0, false);
      cat.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(cat.userData.parts.body);
      return (b.max.x - b.min.x) / (b.max.z - b.min.z);
    };
    expect(slimness('digit')).toBeLessThan(slimness('tabby') * 0.85);
  });

  it('digit wears its own tag collar, and exactly one collar when it buys a bell', () => {
    const count = (cat) => { let n = 0; cat.traverse((o) => { if (COLLAR(o)) n++; }); return n; };
    expect(count(buildCat('digit'))).toBe(1);
    expect(count(buildCat('digit', { collar: 'bell' }))).toBe(1);
    expect(count(buildCat('d2'))).toBe(0);
  });
});

describe('cat model: the cat stands on the ground', () => {
  // Every breed used to sink ~2cm into whatever it was standing on (measured
  // off the model's own bounding box: tabby -0.0196, maine coon -0.0255). With
  // Wave 2's contact decal drawn on the ground directly under the cat, a paw
  // that goes THROUGH the ground is the one place that grounding pass can be
  // caught lying.
  for (const breed of ALL) {
    it(`${breed} rests its feet at ground level, not through it`, () => {
      const cat = buildCat(breed);
      animateCat(cat, 'follow', 1.3, 0, false);
      const min = boxOf(cat).min.y;
      expect(min).toBeGreaterThanOrEqual(-0.001);
      expect(min).toBeLessThan(0.02); // and is actually touching, not hovering
    });
  }

  for (const feet of FEET) {
    it(`'${feet}' keeps the cat on the ground on the largest breed`, () => {
      // The maine coon is the 1.3x breed, so it magnifies any residual sink.
      const cat = buildCat('mainecoon', { feet });
      animateCat(cat, 'follow', 1.3, 0, false);
      // Boots and socks are bulkier than the paw they wrap; a couple of
      // millimetres of the sole inside the ground reads as a sole compressing.
      // Two CENTIMETRES, which is what every one of these used to do, reads as
      // a foot missing.
      expect(boxOf(cat).min.y).toBeGreaterThan(-0.02);
    });
  }
});

describe('cat model: budget and determinism', () => {
  // VISUAL-PASS.md section 0: draw calls are the budget, triangles are not. A
  // wave that adds meshes to the hero asset — which is on screen 100% of the
  // time, and is also cloned for every stray, ghost and co-walker — is spending
  // the scarce resource. Wave 6 spent triangles and RECLAIMED meshes.
  // The final ceilings (Global Constraints): the belly, chest and ruff are one mesh.
  const CEILING = { tabby: 30, siamese: 30, persian: 30, black: 30, calico: 31, mainecoon: 30, zeetoo: 30, robbie: 31, d2: 31, digit: 34, hagrid: 19 };
  const CEILING_SIMPLE = Object.fromEntries(Object.entries(CEILING).map(([b, n]) => [b, b === 'hagrid' ? 19 : n - 6]));

  for (const breed of ALL) {
    it(`${breed} draws no more meshes than its ceiling (${CEILING[breed]})`, () => {
      let meshes = 0;
      buildCat(breed).traverse((o) => { if (o.isMesh) meshes++; });
      expect(meshes).toBeLessThanOrEqual(CEILING[breed]);
    });
    it(`${breed} built { simple: true } draws no more meshes than ${CEILING_SIMPLE[breed]}`, () => {
      let meshes = 0;
      buildCat(breed, undefined, { simple: true }).traverse((o) => { if (o.isMesh) meshes++; });
      expect(meshes).toBeLessThanOrEqual(CEILING_SIMPLE[breed]);
    });
  }

  // A scarred cat (fight moves and scars, Task 4): one mesh more, never two.
  const SCARRED = [{ site: 'face', stage: 'full', side: 'l' }, { site: 'shoulder', stage: 'half', side: 'r' }];
  for (const breed of BREEDS) {
    it(`${breed} scarred draws no more than its ceiling + 1, full and simple, inside the triangle caps`, () => {
      expect(meshCount(buildCat(breed, undefined, { scars: SCARRED }))).toBeLessThanOrEqual(CEILING[breed] + 1);
      expect(meshCount(buildCat(breed, undefined, { scars: SCARRED, simple: true }))).toBeLessThanOrEqual(CEILING_SIMPLE[breed] + 1);
      expect(triangles(buildCat(breed, undefined, { scars: SCARRED }))).toBeLessThanOrEqual(9000); // R4: the smooth legs and the ruff need the 9,000 ceiling
      expect(triangles(buildCat(breed, undefined, { scars: SCARRED, simple: true }))).toBeLessThanOrEqual(5500);
    });
  }

  it('a stray built { simple: true } is cheaper than a full cat', () => {
    const count = (c) => { let n = 0; c.traverse((o) => { if (o.isMesh) n++; }); return n; };
    expect(count(buildCat('tabby', undefined, { simple: true }))).toBeLessThan(count(buildCat('tabby')));
  });

  it('is deterministic: the same breed builds byte-identical geometry every time', () => {
    // Co-walkers share a seed and see each other's cats, so a cat whose shape
    // differed between clients would be a desync of the visible world. Nothing
    // in the model may draw from Math.random() or walkRng; this is the assertion
    // that says so.
    const fingerprint = (breed) => {
      const parts = [];
      buildCat(breed).traverse((o) => {
        if (!o.isMesh) return;
        const p = o.geometry.attributes.position.array;
        let sum = 0;
        for (let i = 0; i < p.length; i++) sum += p[i] * (i % 7 + 1);
        parts.push(`${p.length}:${sum.toFixed(6)}:${o.position.toArray().join(',')}`);
      });
      return parts.join('|');
    };
    for (const breed of ALL) expect(fingerprint(breed)).toBe(fingerprint(breed));
  });
});

describe('visit prizes', () => {
  const meshCount = (c) => { let n = 0; c.traverse((o) => { if (o.isMesh) n++; }); return n; };
  const bareSet = { collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null };
  it.each(VISIT_PRIZES)('prize %s adds geometry to the cat', (id) => {
    const slot = CATALOG.accessories[id].slot;
    expect(meshCount(buildCat('tabby', { ...bareSet, [slot]: id }))).toBeGreaterThan(meshCount(buildCat('tabby', bareSet)));
  });
  it.each(VISIT_PRIZES.filter((id) => ['collar', 'head', 'face', 'neck'].includes(CATALOG.accessories[id].slot)))(
    'prize %s fits Hagrid', (id) => {
      const slot = CATALOG.accessories[id].slot;
      expect(meshCount(buildCat('hagrid', { ...bareSet, [slot]: id }))).toBeGreaterThan(meshCount(buildCat('hagrid', bareSet)));
    });
});

describe('visit prize placement', () => {
  const boxOfMesh = (c) => { c.updateMatrixWorld(true); return new THREE.Box3().setFromObject(c); };
  const bareSet = { collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null };
  it('balloon bunch stays inside the whole-cat thumbnail framing (top < 1.1)', () => {
    const bare = boxOfMesh(buildCat('tabby', bareSet));
    const worn = boxOfMesh(buildCat('tabby', { ...bareSet, back: 'balloonbunch' }));
    expect(worn.max.y).toBeLessThan(1.1);
    expect(worn.max.y).toBeGreaterThan(bare.max.y);
  });
  it('candle hat does not rise above the party crown', () => {
    const hat = boxOfMesh(buildCat('tabby', { ...bareSet, head: 'candlehat' }));
    const crown = boxOfMesh(buildCat('tabby', { ...bareSet, head: 'partycrown' }));
    expect(hat.max.y).toBeLessThanOrEqual(crown.max.y + 0.02);
  });
});

describe('Hagrid wears the ring-shaped head prizes on his head, not above it', () => {
  const bareSet = { collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null };
  const hex = (o) => o.material?.color?.getHex?.();
  // The skull is the head group's first child; the beak (the first orange
  // mesh, before the orange feet) finds the head.
  function skullAndItem(id, colours) {
    const c = buildCat('hagrid', { ...bareSet, head: id });
    c.updateMatrixWorld(true);
    let head = null;
    c.traverse((o) => { if (!head && o.isMesh && hex(o) === 0xf2a04e) head = o.parent; });
    const skull = new THREE.Box3().setFromObject(head.children[0]);
    const item = new THREE.Box3();
    head.traverse((o) => { if (o.isMesh && colours.includes(hex(o))) item.expandByObject(o); });
    const tophat = new THREE.Box3().setFromObject(buildCat('hagrid', { ...bareSet, head: 'tophat' }));
    return { skull, item, tophat };
  }
  it.each([
    ['partycrown', [0xf5c518]],
    ['leafcrown', [0x3f9e4d, 0x6cc070, 0x2f7d3e, 0x6b4a2a]],
  ])('%s starts below the top of his skull (round the comb) and stays under the top hat', (id, colours) => {
    const { skull, item, tophat } = skullAndItem(id, colours);
    expect(item.isEmpty()).toBe(false);
    expect(item.min.y).toBeLessThan(skull.max.y);
    expect(item.max.y).toBeLessThanOrEqual(tophat.max.y);
  });
});

// The corner map draws a remote sibling's dot in their cat's coat colour.
describe('coatColor', () => {
  it('is the breed base colour, and tabby for an unknown breed', () => {
    expect(coatColor('black')).toBe(0x2a2a30);
    expect(coatColor('nonsense')).toBe(0x9c7a4f);
  });

  // Hagrid is a chicken with no STYLE entry: his dot is his russet feathers,
  // not the tabby fallback.
  it('is Hagrid\'s feather colour for hagrid', () => {
    expect(coatColor('hagrid')).toBe(0xb06a30);
  });
});

describe('cat model: the Version 2 proportions', () => {
  it('stands on longer legs with air under the belly', () => {
    const cat = buildCat('tabby'); animateCat(cat, 'follow', 0, 0, false); cat.updateMatrixWorld(true);
    expect(new THREE.Box3().setFromObject(cat.userData.parts.body).min.y).toBeGreaterThan(0.18); // was 0.10
    expect(cat.userData.parts.head.position.toArray()).toEqual([0, 0.70, -0.40]);
    expect(cat.userData.parts.head.scale.x).toBe(1.06);
    expect(cat.userData.base.legLift).toBeCloseTo(0.09, 6);
    expect(cat.userData.base.hipY).toBeCloseTo(0.39, 6);
  });
  it.each(['tabby', 'digit'])('%s: feet items hang from the paw, not from the old leg', (breed) => {
    const paw = (leg) => leg.userData.paw.position.y;
    for (const leg of buildCat(breed, { feet: 'goldbooties' }).userData.parts.legs) {
      const cuff = leg.children.find((m) => m.geometry?.type === 'CylinderGeometry' && m.geometry.parameters.height === 0.035);
      expect(cuff.position.y - paw(leg)).toBeCloseTo(0.0385, 6);
    }
    for (const leg of buildCat(breed, { feet: 'sneakers' }).userData.parts.legs) {
      const stripe = leg.children.find((m) => m.geometry?.type === 'BoxGeometry');
      expect(stripe.position.y - paw(leg)).toBeCloseTo(-0.0115, 6);
    }
  });
  // R2 binds dressed cats too: no point of a cat more than 1 cm below y = 0, in every pose.
  it.each(['tabby', 'digit', 'mainecoon'])('%s: every feet item stays on the ground in every pose', (breed) => {
    for (const feet of ['booties', 'goldbooties', 'sneakers', 'rainboots', 'socks']) {
      for (const state of STATES) {
        const cat = buildCat(breed, { feet }); animateCat(cat, state, 1.3, 0, false);
        cat.updateMatrixWorld(true);
        expect(new THREE.Box3().setFromObject(cat, true).min.y / cat.scale.x, `${feet} ${state}`).toBeGreaterThanOrEqual(-0.01); // precise box
      }
    }
  });
});

describe('cat model: strong hind legs and a tail that grows out of the rump (Task 5)', () => {
  const W = (m) => { m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox; return b.max.x - b.min.x; };
  it('a hind leg has a thick thigh, a front leg a shoulder (one limb mesh + paw each)', () => {
    const { legs } = buildCat('tabby').userData.parts;
    expect(W(legs[2].children[0])).toBeGreaterThan(0.18);   // the thigh: 2 × 0.10
    const front = W(legs[0].children[0]);                     // the shoulder: 2 × 0.085
    expect(front).toBeGreaterThanOrEqual(0.15);
    expect(front).toBeLessThanOrEqual(0.19);
    for (const leg of legs) expect(meshCount(leg)).toBe(2);   // limb + paw
  });
  it('the tail is rooted at the rump surface, not deep inside (no dorsal fin)', () => {
    const cat = buildCat('tabby'); animateCat(cat, 'follow', 0, 0, false); cat.updateMatrixWorld(true);
    const { body, tail } = cat.userData.parts;
    const c = body.getWorldPosition(new THREE.Vector3()), r = tail.getWorldPosition(new THREE.Vector3());
    const hit = surfaceHit([body], c, r);
    expect(Math.abs(r.distanceTo(c) - hit.distanceTo(c))).toBeLessThan(0.03);
    expect(tail.scale.x).toBe(0.85);
  });
  it('the tail is still five meshes (root, joints and tip merged in)', () => {
    expect(meshCount(buildCat('tabby').userData.parts.tail)).toBe(5);
  });
});

describe('cat model: the chest, merged with the belly and ruff, kept under the head (Task 6)', () => {
  const box = (o) => { o.updateWorldMatrix(true, true); return new THREE.Box3().setFromObject(o); };
  it('the chest and belly are one mesh, a child of the torso', () => {
    for (const b of PRESETS) {
      const { body, underside } = buildCat(b).userData.parts;
      expect(underside.parent).toBe(body);
      expect(body.children).toEqual([underside]);
    }
  });
  it('the chest bridges the head and the body', () => {
    const cat = buildCat('tabby'); animateCat(cat, 'follow', 0, 0, false);
    const { underside, head, body } = cat.userData.parts;
    expect(box(underside).intersectsBox(box(head.children[0]))).toBe(true);
    expect(box(underside).intersectsBox(box(body))).toBe(true);
  });
  it('the underside moves with the body when it naps', () => {
    const at = (s) => { const c = buildCat('tabby'); animateCat(c, s, 1, 0, false); return box(c.userData.parts.underside).min.y; };
    expect(at('nap')).toBeLessThan(at('follow') - 0.05);
  });
  it('the chest stays under the head when the torso turns cross (R4), standing and walking', () => {
    for (const b of PRESETS) for (const [t, speed] of [[1.3, 0], [0.7, 1.5]]) {
      const cat = buildCat(b); animateCat(cat, 'cross', t, speed, false); cat.updateMatrixWorld(true);
      const { underside, head } = cat.userData.parts;
      const chest = new THREE.Vector3(...underside.userData.chestCentre).applyMatrix4(underside.matrixWorld);
      expect(Math.abs(chest.x - head.getWorldPosition(new THREE.Vector3()).x), `${b} speed ${speed}`).toBeLessThan(0.02);
    }
  });
  it('the counter-yaw leaves nothing behind once the torso faces forward again', () => {
    const cat = buildCat('tabby'); animateCat(cat, 'cross', 1.3, 0, false); animateCat(cat, 'follow', 1.3, 0, false);
    const { underside } = cat.userData.parts;
    expect(underside.rotation.y).toBe(0);
    expect(underside.position.toArray()).toEqual([0, 0, 0]);
    expect(Object.is(underside.rotation.y, -0)).toBe(false);
  });
  it("robbie's chest is white; a black cat's chest is its belly colour", () => {
    const chestColours = (b) => {
      const u = buildCat(b).userData.parts.underside, col = u.geometry.attributes.color, [a, z] = u.userData.ranges.chest;
      return Array.from({ length: z - a }, (_, i) => new THREE.Color(col.getX(a + i), col.getY(a + i), col.getZ(a + i)));
    };
    for (const c of chestColours('robbie')) expect(colourDistance(c, new THREE.Color(0xf5f5f5))).toBeLessThan(1e-6);
    for (const c of chestColours('black')) expect(colourDistance(c, new THREE.Color(0x3a3a42))).toBeLessThan(1e-6);
  });
  it('final mesh ceilings, fluffy cats included', () => {
    const FINAL = { tabby: 30, siamese: 30, persian: 30, black: 30, calico: 31, mainecoon: 30, zeetoo: 30, robbie: 31, d2: 31, digit: 34 };
    for (const [b, n] of Object.entries(FINAL)) {
      expect(meshCount(buildCat(b))).toBe(n);
      expect(meshCount(buildCat(b, undefined, { simple: true }))).toBe(n - 6);
    }
  });
  it('stays inside the triangle budget', () => {
    for (const b of PRESETS) {
      expect(triangles(buildCat(b))).toBeLessThanOrEqual(9000); // R4: the smooth legs and the ruff need the 9,000 ceiling
      expect(triangles(buildCat(b, undefined, { simple: true }))).toBeLessThanOrEqual(5500);
    }
  });
});

describe('cat model: shells take the new torso shape (Task 7)', () => {
  const shellOf = (cat, hex) => cat.userData.parts.body.children.find((m) => m !== cat.userData.parts.underside && (m.material.color.getHex() === hex || m.material.vertexColors));
  const SHELLS = [['hoodie', 0x6a4c93], ['raincoat', 0xf2c94e], ['sweater', null]];
  it.each(PRESETS.flatMap((b) => SHELLS.map((s) => [b, ...s])))('%s %s hugs the new torso: 5 mm-4 cm outside the fur (belly side: not inside)', (breed, id, hex) => {
    const cat = buildCat(breed, { body: id }); animateCat(cat, 'follow', 0, 0, false); cat.updateMatrixWorld(true);
    const { body } = cat.userData.parts, shell = shellOf(cat, hex), c = body.getWorldPosition(new THREE.Vector3());
    const torsoOnly = body.clone(false); torsoOnly.matrixWorld.copy(body.matrixWorld);
    const p = shell.geometry.attributes.position, unit = shell.geometry.userData.unit;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(shell.matrixWorld);
      const gap = v.distanceTo(c) - surfaceHit([torsoOnly], c, v).distanceTo(c);
      if (unit[i * 3 + 1] > -0.3) { expect(gap).toBeGreaterThanOrEqual(0.005); expect(gap).toBeLessThanOrEqual(0.04); }
      else expect(gap).toBeGreaterThanOrEqual(0);
    }
  });
  it('raincoat buttons ride the coat: within 1.5 cm outside the shell in every state', () => {
    for (const breed of ['tabby', 'digit']) for (const st of STATES) {
      const cat = buildCat(breed, { body: 'raincoat' }); animateCat(cat, st, 1.3, 0, false); cat.updateMatrixWorld(true);
      const { body } = cat.userData.parts, shell = shellOf(cat, 0xf2c94e), c = body.getWorldPosition(new THREE.Vector3());
      const buttons = body.children.filter((m) => m !== shell && m !== cat.userData.parts.underside);
      expect(buttons).toHaveLength(2);
      for (const b of buttons) {
        const bp = b.getWorldPosition(new THREE.Vector3());
        const off = bp.distanceTo(c) - surfaceHit([shell], c, bp).distanceTo(c);
        expect(off, `${breed} ${st}`).toBeGreaterThanOrEqual(-0.002); expect(off, `${breed} ${st}`).toBeLessThanOrEqual(0.015);
      }
    }
  });
  it('a sweater is one mesh now, not four', () => {
    expect(meshCount(buildCat('tabby', { body: 'sweater' })) - meshCount(buildCat('tabby'))).toBe(1);
  });
  it.each(['hoodie', 'raincoat'])('%s hood sits on the head where it did', (id) => {
    const cat = buildCat('tabby', { body: id });
    const hood = cat.children.find((m) => m.isMesh && m.geometry.type === 'SphereGeometry' && m.geometry.parameters.radius === 0.17);
    const h = cat.userData.parts.head.position;
    expect(hood.position.toArray().map((v, i) => (v - h.getComponent(i)) / 1.06)).toEqual([0, 0.08, 0.16].map((v) => expect.closeTo(v, 6)));
  });
});

describe('cat model: back items, neck items and collars on the new body (Task 8)', () => {
  const ACCESSORY_DELTA = JSON.parse(fs.readFileSync(new URL('./fixtures/accessory-mesh-delta.json', import.meta.url), 'utf8'));
  const COLOURS = {
    backpack: [0x3a6ea5], jetpack: [0xb8bcc4, 0xf2822e], wings: [0xf29a8a, 0x9fc9a0], cape: [0xd8303c, 0xf2c14e], confetticape: [0x5b3fa8, 0xf5c518],
    bandana: [0x3a6ea5], necktie: [0x7a2436], bowtie: [0x2c3e6b], scarf: [0xd6602f], streamerscarf: [0xe0405a, 0xf2c14e, 0x4ec9d4, 0x8a6cf2],
    bell: [0xf2c14e], heart: [0xe0447a],
  };
  const itemMeshes = (cat, hexes) => { const out = []; cat.traverse((o) => { if (o.isMesh && !o.material.vertexColors && hexes.includes(o.material.color.getHex())) out.push(o); }); return out; };
  const posed = (acc, breed = 'tabby') => { const c = buildCat(breed, acc); animateCat(c, 'follow', 0, 0, false); c.updateMatrixWorld(true); return c; };
  // Each back item's main piece (its largest mesh: the pack, each tank, each
  // wing, the cape) rests on the fur: centre outside it, touching within 2 cm.
  // Its small parts (nozzles, clasps) move rigidly with it: each keeps its old
  // authored offset from the main piece it hangs on (cat-group frame).
  const SUB_OFFSET = { jetpack: [0, -0.12, 0.025], cape: [0, 0.2, -0.17], confetticape: [0, 0.2, -0.17] };
  const vol = (m) => { const s = new THREE.Box3().setFromBufferAttribute(m.geometry.attributes.position).getSize(new THREE.Vector3()); return s.x * s.y * s.z; };
  it.each(['backpack', 'jetpack', 'wings', 'cape', 'confetticape'])('%s rests on the back: main piece touching, not sinking; small parts ride it', (id) => {
    const slot = CATALOG.accessories[id].slot, cat = posed({ [slot]: id }), { body } = cat.userData.parts;
    const c = body.getWorldPosition(new THREE.Vector3());
    const meshes = itemMeshes(cat, COLOURS[id]);
    const big = Math.max(...meshes.map(vol));
    const mains = meshes.filter((m) => vol(m) > big * 0.999), subs = meshes.filter((m) => !mains.includes(m));
    expect(mains.length).toBeGreaterThan(0);
    for (const m of mains) {
      const b = new THREE.Box3().setFromObject(m), mid = b.getCenter(new THREE.Vector3());
      const hit = surfaceHit([body], c, mid);
      expect(mid.distanceTo(c)).toBeGreaterThan(hit.distanceTo(c));      // centre outside the fur
      expect(b.distanceToPoint(hit)).toBeLessThanOrEqual(0.02);            // and touching it
    }
    expect(subs.length).toBe(SUB_OFFSET[id] ? mains.length : 0);
    const inCat = (m) => cat.worldToLocal(m.getWorldPosition(new THREE.Vector3()));
    for (const sub of subs) {
      const p = inCat(sub);
      const main = mains.map(inCat).sort((a, b) => a.distanceTo(p) - b.distanceTo(p))[0];
      expect(p.sub(main).toArray()).toEqual(SUB_OFFSET[id].map((v) => expect.closeTo(v, 6)));
    }
  });
  const onChest = (cat, meshes) => {
    const { body } = cat.userData.parts;
    const zs = meshes.map((m) => new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3()).z);
    const ringZ = zs.reduce((a, z) => a + z, 0) / zs.length;   // a one-mesh item is never skipped
    expect(meshes.length).toBeGreaterThan(0);
    for (const m of meshes) {
      const b = new THREE.Box3().setFromObject(m), mid = b.getCenter(new THREE.Vector3());
      const hits = new THREE.Raycaster(new THREE.Vector3(mid.x, mid.y, -2), new THREE.Vector3(0, 0, 1)).intersectObjects([body], true);
      if (mid.z > ringZ + 1e-9) continue;        // a ring's far half, behind the neck, is never in front of the chest
      if (hits.length) expect(b.min.z).toBeLessThanOrEqual(hits[0].point.z - 0.005);
    }
  };
  // Tabby, and the fluffy cats (NECK_FLUFFY).
  const CHEST_BREEDS = ['tabby', 'persian', 'mainecoon', 'd2'];
  it.each(CHEST_BREEDS.flatMap((b) => ['bandana', 'necktie', 'bowtie', 'scarf', 'streamerscarf', 'bell', 'heart'].map((id) => [b, id])))('%s: %s lies on the chest, not inside it', (breed, id) => {
    const slot = CATALOG.accessories[id].slot, cat = posed({ [slot]: id }, breed);
    onChest(cat, itemMeshes(cat, COLOURS[id]));
  });
  it.each(CHEST_BREEDS)('%s: the sparkle collar: its charm and front beads lie on the chest', (breed) => {
    const cat = posed({ [CATALOG.accessories.sparklecollar.slot]: 'sparklecollar' }, breed);
    onChest(cat, itemMeshes(cat, [0xf5c518]));     // beads behind the neck are skipped by onChest
  });
  // ...and stays under the chin, not across the face (fluffy cats, Task 10 fix):
  // every mesh the item adds to the head tops out below the mouth — taken as the
  // bottom of the nose, where a cat's mouth begins — and is behind the nose tip.
  // On a fluffy cat the items rest on the small bib, at a tabby's spot
  // (NECK_FLUFFY, body refinement Task 7); moving them out past the old torus
  // once put the scarf across the mouth.
  const sig = (m) => [m.geometry.type, m.material.color?.getHex(), ...m.position.toArray().map((v) => v.toFixed(5))].join();
  const addedToHead = (cat, bare) => {
    const have = new Set(); bare.userData.parts.head.traverse((o) => { if (o.isMesh) have.add(sig(o)); });
    const out = []; cat.userData.parts.head.traverse((o) => { if (o.isMesh && !have.has(sig(o))) out.push(o); });
    return out;
  };
  // The nose is tagged in model.js (userData.nose), so the lookup does not hang
  // on the head's child order.
  const noseBox = (cat) => {
    const noses = []; cat.userData.parts.head.traverse((o) => { if (o.isMesh && o.userData.nose) noses.push(o); });
    expect(noses).toHaveLength(1);
    return new THREE.Box3().setFromObject(noses[0]);
  };
  const underChin = (bare, meshes) => {
    const nose = noseBox(bare);
    expect(meshes.length).toBeGreaterThan(0);
    for (const m of meshes) {
      const b = new THREE.Box3().setFromObject(m);
      expect(b.max.y).toBeLessThan(nose.min.y);       // below the mouth
      expect(b.min.z).toBeGreaterThan(nose.min.z);    // behind the nose tip (front is -z)
    }
  };
  it.each(CHEST_BREEDS.flatMap((b) => ['bandana', 'necktie', 'bowtie', 'scarf', 'streamerscarf', 'bell', 'heart', 'sparklecollar'].map((id) => [b, id])))('%s: %s stays under the chin, below the mouth and behind the nose', (breed, id) => {
    const bare = posed({}, breed), cat = posed({ [CATALOG.accessories[id].slot]: id }, breed);
    underChin(bare, addedToHead(cat, bare));
  });
  // The hood bunched at the neck (under a hat) sits at its old head-relative
  // spot, mostly hidden in the neck fur, never across the face: every vertex of
  // the roll is below the mouth and behind the nose tip.
  it.each(['tabby', 'digit', 'persian', 'mainecoon'].flatMap((b) => [['hoodie', 0x6a4c93], ['raincoat', 0xf2c94e]].map(([id, hex]) => [b, id, hex])))('%s: the %s bunched at the neck stays below the mouth and behind the nose', (breed, id, hex) => {
    const nose = noseBox(posed({}, breed)), cat = posed({ body: id, head: 'tophat' }, breed);
    const bunch = itemMeshes(cat, [hex]).filter((m) => m.geometry.type === 'TorusGeometry');
    expect(bunch).toHaveLength(1);
    const p = bunch[0].geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(bunch[0].matrixWorld);
      expect(v.y).toBeLessThan(nose.min.y);
      expect(v.z).toBeGreaterThan(nose.min.z);
    }
  });

  // Body refinement, Task 7: on a fluffy cat the neck items rest on the new
  // small bib (NECK_FLUFFY), not floating out where the torus used to be. For
  // each item mesh in front of the ring's centre (as onChest), a ray from the
  // front at its centre hits the fur at h: its front stands out of the fur
  // (min.z <= h - 0.005) and its rear comes within 2.5 cm of it, or (charms and
  // streamers hang free by design, so a tabby's own float 2-13 cm) no further
  // out than the same mesh on a tabby, whose fit was signed off (R5). Gaps are
  // compared in the cat's own units (divided by its scale).
  const fitOf = (cat, meshes) => {
    const { body } = cat.userData.parts, k = cat.scale.x;
    const zs = meshes.map((m) => new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3()).z);
    const ringZ = zs.reduce((a, z) => a + z, 0) / zs.length;
    expect(meshes.length).toBeGreaterThan(0);
    const out = [];
    for (const m of meshes) {
      const b = new THREE.Box3().setFromObject(m), mid = b.getCenter(new THREE.Vector3());
      if (mid.z > ringZ + 1e-9) continue;        // a ring's far half, as onChest
      const hits = new THREE.Raycaster(new THREE.Vector3(mid.x, mid.y, -2), new THREE.Vector3(0, 0, 1)).intersectObjects([body], true);
      expect(hits.length).toBeGreaterThan(0);
      const h = hits[0].point.z;
      out.push({ rear: (h - b.max.z) / k, front: h - b.min.z });
    }
    expect(out.length).toBeGreaterThan(0);
    return out;
  };
  const NECK_ITEMS = ['bandana', 'necktie', 'bowtie', 'scarf', 'streamerscarf', 'bell', 'heart', 'sparklecollar'];
  const itemHexes = (id) => (id === 'sparklecollar' ? [0xf5c518] : COLOURS[id]);
  const dressed = (breed, id, o = {}) => { const c = buildCat(breed, { [CATALOG.accessories[id].slot]: id }, o); animateCat(c, 'follow', 0, 0, false); c.updateMatrixWorld(true); return c; };
  const FLUFFY_NECK = [['persian'], ['mainecoon'], ['d2'], ['custom fluffy', { look: { ...DEFAULT_LOOK, fur: 'fluffy' } }]];
  it.each(FLUFFY_NECK.flatMap(([b, o]) => NECK_ITEMS.map((id) => [b, id, o])))('%s: %s rests on the bib, not floating in front of it', (label, id, o) => {
    const ref = dressed('tabby', id), tabby = fitOf(ref, itemMeshes(ref, itemHexes(id)));
    const cat = o ? dressed('tabby', id, o) : dressed(label, id), fit = fitOf(cat, itemMeshes(cat, itemHexes(id)));
    expect(fit).toHaveLength(tabby.length);
    fit.forEach(({ rear, front }, i) => {
      // (+1e-9: a streamer tail hangs clear of the bib, exactly as on a tabby)
      expect(rear, `mesh ${i}: rear floats off the fur`).toBeLessThanOrEqual(Math.max(0.025, tabby[i].rear) + 1e-9);
      expect(front, `mesh ${i}: front sunk in the fur`).toBeGreaterThanOrEqual(0.005);
    });
  });
  it("Digit's built-in tag collar: the tag lies on the chest", () => {
    const cat = buildCat('digit'); animateCat(cat, 'follow', 0, 0, false); cat.updateMatrixWorld(true);
    onChest(cat, itemMeshes(cat, [0xc8ccd4]));     // TAG_SILVER in model.js
  });
  it.each(Object.keys(ACCESSORY_DELTA))('%s adds no more meshes than before the reshape', (id) => {
    const slot = CATALOG.accessories[id].slot;
    expect(meshCount(buildCat('tabby', { [slot]: id })) - meshCount(buildCat('tabby'))).toBeLessThanOrEqual(ACCESSORY_DELTA[id]);
  });
  // kept elsewhere in this file: balloon bunch top < 1.1 and above the bare cat;
  // candle hat <= party crown + 0.02; Digit wears exactly one collar.
});

// Body refinement, Task 6 (R9): the fluffy cat's ruff is a small bib tucked
// under the chin with a little jaw fluff and a five-point fringe, inside the
// merged underside geometry, not the old torus ("a life preserver").
describe('cat model: the ruff is a small bib (body refinement, Task 6)', () => {
  // [label, buildCat args, the style's base and belly]
  const FLUFFY_LOOK = { ...DEFAULT_LOOK, fur: 'fluffy' }, LONG_LOOK = { ...DEFAULT_LOOK, fur: 'long', coat: 'black' };
  const FLUFFY = [
    ['persian', ['persian'], { base: 0xcfcfd4, belly: 0xe8e8ec }],
    ['mainecoon', ['mainecoon'], { base: 0x7a5b3a, belly: 0xb99a72 }],
    ['d2', ['d2'], { base: 0x5a4a3a, belly: 0xf5f5f2 }],
    ['custom fluffy', ['tabby', undefined, { look: FLUFFY_LOOK }], lookToStyle(FLUFFY_LOOK)],
    ['custom long', ['tabby', undefined, { look: LONG_LOOK }], lookToStyle(LONG_LOOK)],
  ];
  const CASES = FLUFFY.flatMap(([label, args, s]) => [false, true].map((simple) => [`${label}${simple ? ' (simple)' : ''}`, args, s, simple]));
  const build = (args, simple) => buildCat(args[0], args[1], { ...(args[2] ?? {}), simple });
  // The ruff's vertices of a really-built cat, in the cat's frame (before g.scale).
  const ruffVerts = (cat) => {
    cat.updateMatrixWorld(true);
    const u = cat.userData.parts.underside, [a, z] = u.userData.ranges.ruff;
    const m = cat.matrixWorld.clone().invert().multiply(u.matrixWorld), p = u.geometry.attributes.position;
    return Array.from({ length: z - a }, (_, i) => new THREE.Vector3().fromBufferAttribute(p, a + i).applyMatrix4(m));
  };
  const volume = (b) => { const s = b.getSize(new THREE.Vector3()); return s.x * s.y * s.z; };
  // Today's torus, turned and placed as undersideGeometry placed it (cat frame).
  const torusBox = new THREE.Box3().setFromBufferAttribute(new THREE.TorusGeometry(0.19, 0.075, 6, 12).rotateX(Math.PI / 2 - 0.35)
    .translate(0, 0.70 - 0.12, -0.40 + 0.10).attributes.position);

  it.each(CASES)('%s: a small bib, not a life preserver', (_, args, s, simple) => {
    const vs = ruffVerts(build(args, simple));
    expect(vs.length).toBeGreaterThan(0);
    const box = new THREE.Box3().setFromPoints(vs);
    expect(box.max.z).toBeLessThanOrEqual(-0.24);                    // nothing behind the neck
    expect(box.max.x - box.min.x).toBeLessThanOrEqual(0.30);
    expect(volume(box)).toBeLessThanOrEqual(0.4 * volume(torusBox));
    const g = ruffGeometry(s, simple);
    expect(g.index.count / 3).toBeLessThanOrEqual(simple ? 210 : 360);
    expect(g.attributes.uv).toBeUndefined();
  });
  // Connected pieces of a vertex range: triangles joined by shared indices or
  // by coincident positions (a cone's seam and tip are split vertices).
  const pieces = (g, [a, z]) => {
    const p = g.attributes.position, idx = g.index.array, parent = new Map();
    const find = (i) => { while (parent.get(i) !== i) i = parent.get(i); return i; };
    const join = (i, j) => { parent.set(find(i), find(j)); };
    const key = (i) => [p.getX(i), p.getY(i), p.getZ(i)].map((v) => v.toFixed(5)).join();
    const byPos = new Map();
    for (let i = a; i < z; i++) {
      parent.set(i, i);
      const k = key(i);
      if (byPos.has(k)) join(i, byPos.get(k)); else byPos.set(k, i);
    }
    for (let t = 0; t < idx.length; t += 3) {
      if (idx[t] < a || idx[t] >= z) continue;
      join(idx[t], idx[t + 1]); join(idx[t], idx[t + 2]);
    }
    return new Set([...parent.keys()].map(find)).size;
  };
  // The jaw fluff blends the base coat into the bib (R9: lerp(base, belly,
  // JAW_MIX)), kept within JAW_CAP of the belly in linear RGB.
  const dist = (a, b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
  it.each(CASES)('%s: the bib is the belly colour, the jaw fluff the coat blended into it, capped', (label, args, s, simple) => {
    const g = ruffGeometry(s, simple), { bib, jaw, fringe } = g.userData.parts;
    const col = g.attributes.color;
    const colour = (i) => new THREE.Color(col.getX(i), col.getY(i), col.getZ(i));
    const belly = new THREE.Color(s.belly), base = new THREE.Color(s.base);
    expect(RUFF.JAW_MIX).toBe(0.35);
    expect(RUFF.JAW_CAP).toBe(0.25);
    const half = (jaw[0] + jaw[1]) / 2;
    for (const [[a, z], want] of [[bib, belly], [fringe, belly], [[jaw[0], half], jawFluffColour(s)], [[half, jaw[1]], jawFluffColour(s)]]) {
      expect(z).toBeGreaterThan(a);
      for (let i = a; i < z; i++) expect(colourDistance(colour(i), want)).toBeLessThan(1e-6);
    }
    const j = jawFluffColour(s), raw = base.clone().lerp(belly, RUFF.JAW_MIX);
    expect(dist(j, belly), label).toBeLessThanOrEqual(RUFF.JAW_CAP + 1e-6);
    // inside the cap it is exactly the lerp; outside, it is on the cap toward it
    if (dist(raw, belly) <= RUFF.JAW_CAP) expect(colourDistance(j, raw)).toBeLessThan(1e-6);
    else expect(dist(j, belly)).toBeCloseTo(RUFF.JAW_CAP, 6);
    // it is not just the belly: the coat shows in it (unless the coat is the belly)
    if (dist(base, belly) > 1e-3) expect(dist(j, belly), label).toBeGreaterThan(0.01);
    // the reviewer's values
    const hex = (c) => `#${c.getHexString()}`;
    const want = { persian: '#d8d8dd', mainecoon: '#947653', d2: '#e4e3df' }[label.replace(' (simple)', '')];
    // (the mainecoon's lerp sits 0.25008 from its bib: the cap trims 8e-5, under a hex step)
    if (want === '#d8d8dd' || want === '#947653') expect(colourDistance(j, raw)).toBeLessThan(2e-4);
    if (want) expect(hex(j), label).toBe(want);
    // D2: white chest, dark coat; the fluff is near-white, not grey on white
    if (label.startsWith('d2')) expect(Math.min(j.r, j.g, j.b)).toBeGreaterThan(0.7);
    expect(pieces(g, fringe)).toBe(5);
    expect(pieces(g, jaw)).toBe(2);
    // and the built cat's ruff is exactly that geometry's colours
    const u = build(args, simple).userData.parts.underside, [ra, rz] = u.userData.ranges.ruff, uc = u.geometry.attributes.color;
    expect(rz - ra).toBe(col.count);
    for (let i = 0; i < col.count; i++) expect([uc.getX(ra + i), uc.getY(ra + i), uc.getZ(ra + i)]).toEqual([col.getX(i), col.getY(i), col.getZ(i)]);
  });
  // A head dropping to sniff or nap passes over the bib: no ruff vertex that is
  // outside the skull stands above the mouth line in front of the skull centre
  // (the chin always overlaps the bib, as it overlapped the torus).
  it.each(CASES.flatMap(([label, ...rest]) => ['sniff', 'nap'].map((st) => [label, st, ...rest])))('%s: a dropping head passes over it (%s)', (label, st, args, s, simple) => {
    for (const t of [0, 0.6, 1.3, 2.2, 3.7]) {
      const cat = build(args, simple); animateCat(cat, st, t, 0, false); cat.updateMatrixWorld(true);
      const { head, underside } = cat.userData.parts, skull = head.children[0];
      let nose; head.traverse((o) => { if (o.userData.nose) nose = o; });
      nose.geometry.computeBoundingBox();
      const mouthY = nose.position.y + nose.geometry.boundingBox.min.y * nose.scale.y;   // head-local
      const toSkull = skull.matrixWorld.clone().invert(), toHead = head.matrixWorld.clone().invert();
      const [a, z] = underside.userData.ranges.ruff, p = underside.geometry.attributes.position;
      for (let i = a; i < z; i++) {
        const w = new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(underside.matrixWorld);
        if (w.clone().applyMatrix4(toSkull).length() <= SKULL_R) continue;
        const h = w.applyMatrix4(toHead);
        expect(h.z < 0 && h.y > mouthY, `${label} ${st} t ${t}: vertex ${i} at head-local ${h.toArray().map((v) => v.toFixed(3))}`).toBe(false);
      }
    }
  });
  // ...and it shows: per part, vertices outside both the chest's and the
  // skull's ellipsoids (a ruff hidden inside the chest reads as no ruff at all,
  // as R9's z -0.30 did), with the bib's front no more than 1.5 cm proud of the
  // chest (a modest bib, not a gigantic chest). The chest's ellipsoid is read
  // off the built chest's own vertices (its box: the ball's poles and equator
  // are vertices), in the underside's frame, where it is axis-aligned.
  const VISIBLE = { bib: 4, jaw: 4, fringe: 10 };
  it.each(CASES)('%s: it shows outside the chest and the skull', (label, args, s, simple) => {
    const cat = build(args, simple); animateCat(cat, 'follow', 0, 0, false); cat.updateMatrixWorld(true);
    const { underside, head } = cat.userData.parts, skull = head.children[0];
    const p = underside.geometry.attributes.position, [ra] = underside.userData.ranges.ruff, [ca, cz] = underside.userData.ranges.chest;
    const chestBox = new THREE.Box3();
    for (let i = ca; i < cz; i++) chestBox.expandByPoint(new THREE.Vector3().fromBufferAttribute(p, i));
    const c = chestBox.getCenter(new THREE.Vector3()), r = chestBox.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    const inChest = (v) => ((v.x - c.x) / r.x) ** 2 + ((v.y - c.y) / r.y) ** 2 + ((v.z - c.z) / r.z) ** 2 <= 1;
    const toSkull = skull.matrixWorld.clone().invert().multiply(underside.matrixWorld);
    const toCat = cat.matrixWorld.clone().invert().multiply(underside.matrixWorld);
    const { parts } = ruffGeometry(s, simple).userData;
    for (const [k, [a, z]] of Object.entries(parts)) {
      let shown = 0, proud = 0;
      for (let i = ra + a; i < ra + z; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(p, i);
        if (inChest(v) || v.clone().applyMatrix4(toSkull).length() <= SKULL_R) continue;
        shown++;
        const q = 1 - ((v.x - c.x) / r.x) ** 2 - ((v.y - c.y) / r.y) ** 2;
        if (k === 'bib' && q > 0 && v.z < c.z) {
          const front = new THREE.Vector3(v.x, v.y, c.z - r.z * Math.sqrt(q)).applyMatrix4(toCat);
          proud = Math.max(proud, front.distanceTo(v.clone().applyMatrix4(toCat)));
        }
      }
      expect(shown, `${label}: ${k} vertices outside the chest and skull`).toBeGreaterThanOrEqual(VISIBLE[k]);
      if (k === 'bib') expect(proud, `${label}: the bib stands out of the chest`).toBeLessThanOrEqual(0.015);
    }
  });
  // Task 10 fix: the fringe's five points are soft and blunt, their open bases
  // buried in the bib (or the chest or belly) and their tips below the bib's
  // edge. "Buried" is tested against the real merged underside mesh: a base
  // vertex must lie inside one of its faceted solids (belly, chest, bib) by a
  // ray cast against that solid's triangles (an odd number of crossings), not
  // inside an analytic ellipsoid, which the bib's flat facets sag inside.
  const RAY = new THREE.Vector3(0.5774, 0.5, 0.6446).normalize();
  const rayHits = (o, pos, idx, tris) => {
    let n = 0;
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), pv = new THREE.Vector3(), tv = new THREE.Vector3(), qv = new THREE.Vector3();
    const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
    for (const t of tris) {
      A.fromBufferAttribute(pos, idx[t]); B.fromBufferAttribute(pos, idx[t + 1]); C.fromBufferAttribute(pos, idx[t + 2]);
      e1.subVectors(B, A); e2.subVectors(C, A);
      pv.crossVectors(RAY, e2);
      const det = e1.dot(pv);
      if (Math.abs(det) < 1e-14) continue;
      tv.subVectors(o, A);
      const u = tv.dot(pv) / det;
      if (u < 0 || u > 1) continue;
      qv.crossVectors(tv, e1);
      const v = RAY.dot(qv) / det;
      if (v < 0 || u + v > 1) continue;
      if (e2.dot(qv) / det > 0) n++;
    }
    return n;
  };
  it.each(CASES)('%s: five soft points along the bib\'s edge, their bases buried', (label, args, s, simple) => {
    const g = ruffGeometry(s, simple), p = g.attributes.position;
    const { BIB, AT, FRINGE } = RUFF;
    const bc = BIB.OFF.map((o, i) => AT[i] + o), br = BIB.SCALE.map((k) => k * BIB.R);
    expect(g.userData.fringeBases).toHaveLength(5);
    // the real merged underside: each solid's own triangles (a solid's triangles
    // only join its own vertex range)
    const u = build(args, simple).userData.parts.underside, up = u.geometry.attributes.position, idx = u.geometry.index.array;
    const { ranges } = u.userData, [ra] = ranges.ruff;
    const bibRange = [ra + g.userData.parts.bib[0], ra + g.userData.parts.bib[1]];
    const solids = [ranges.belly, ranges.chest, bibRange].map(([a, z]) => {
      const tris = [];
      for (let t = 0; t < idx.length; t += 3) if (idx[t] >= a && idx[t] < z) tris.push(t);
      return tris;
    });
    expect(solids.every((s2) => s2.length > 0)).toBe(true);
    const [fa, fz] = g.userData.parts.fringe, per = (fz - fa) / 5;
    const o = new THREE.Vector3();
    for (const [k, [from, n]] of g.userData.fringeBases.entries()) {
      for (let i = from; i < from + n; i++) {
        o.fromBufferAttribute(up, ra + i);
        const inside = solids.some((tris) => rayHits(o, up, idx, tris) % 2 === 1);
        expect(inside, `${label}: point ${k} base vertex ${i} is outside every solid`).toBe(true);
      }
      // the tip: 5 mm or more below the bib's lower edge at its x, and blunt:
      // the ring next to it is at least half the point's width
      let tip = null;
      for (let i = fa + k * per; i < fa + (k + 1) * per; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(p, i);
        if (!tip || v.y < tip.y) tip = v;
      }
      const dx = (tip.x - bc[0]) / br[0];
      expect(bc[1] - br[1] * Math.sqrt(Math.max(0, 1 - dx * dx)) - tip.y, `${label}: point ${k} shows below the bib`).toBeGreaterThanOrEqual(0.005);
    }
    expect(FRINGE.KNEE[1]).toBeGreaterThanOrEqual(0.5);
  });
  it('short-haired cats have none', () => {
    for (const cat of [buildCat('tabby'), buildCat('robbie'), buildCat('digit'), buildCat('tabby', undefined, { look: DEFAULT_LOOK })]) {
      expect(cat.userData.parts.underside.userData.ranges.ruff).toBeUndefined();
    }
  });
});

it('the camera looks inside the head: between its centre and its top (tabby, follow, world)', () => {
  const cat = buildCat('tabby');
  animateCat(cat, 'follow', 1.3, 0, false);
  cat.updateMatrixWorld(true);
  const head = new THREE.Box3().setFromObject(cat.userData.parts.head, true);
  const centre = (head.min.y + head.max.y) / 2;
  expect(CAT_LOOK_Y * cat.scale.y).toBeGreaterThanOrEqual(centre);
  expect(CAT_LOOK_Y * cat.scale.y).toBeLessThanOrEqual(head.max.y);
});

// Clan Life Part 1, Task 3: buildCat takes a whole STYLE row (opts.style), so a
// clan cat wears its clan's palette while its breed only picks the eyes.
describe('buildCat with opts.style (a clan coat)', () => {
  const meshesOf = (c) => { let n = 0; c.traverse((o) => { if (o.isMesh) n++; }); return n; };
  const torsoColours = (cat) => {
    const col = cat.userData.parts.body.geometry.attributes.color;
    const out = [];
    for (let i = 0; i < col.count; i++) out.push(new THREE.Color(col.getX(i), col.getY(i), col.getZ(i)));
    return out;
  };

  it('paints the torso from the row, not from the breed', async () => {
    const { CLAN_COATS } = await import('../src/clancast.js');
    const row = CLAN_COATS.river[0];
    const want = new THREE.Color(row.base);
    const clan = torsoColours(buildCat('tabby', undefined, { simple: true, style: row }));
    for (const c of clan) expect(colourDistance(c, want)).toBeLessThan(1e-6);
    const tabby = torsoColours(buildCat('tabby', undefined, { simple: true }));
    expect(tabby.some((c) => colourDistance(c, want) > 0.01)).toBe(true);
  });

  it('never reads the breed\'s own row when a style is given', async () => {
    const { CLAN_COATS } = await import('../src/clancast.js');
    expect(() => buildCat('not-a-breed', undefined, { simple: true })).toThrow();
    const cat = buildCat('not-a-breed', undefined, { simple: true, style: CLAN_COATS.woods[0] });
    expect(cat.userData.parts.body).toBeTruthy();
  });

  it('every clan coat builds, simple and full, at no more meshes than a stray', async () => {
    const { CLAN_COATS } = await import('../src/clancast.js');
    for (const [clan, rows] of Object.entries(CLAN_COATS)) {
      for (const [i, row] of rows.entries()) {
        expect(() => buildCat(row.eyes, undefined, { style: row }), `${clan}[${i}] full`).not.toThrow();
        const simple = buildCat(row.eyes, undefined, { simple: true, style: row });
        // 25 is the calico's simple count (tabby, persian and black are 24).
        expect(meshesOf(simple), `${clan}[${i}] simple`).toBeLessThanOrEqual(25);
      }
    }
  });

  it('with no style the group carries exactly today\'s userData keys', () => {
    expect(Object.keys(buildCat('tabby', undefined, { simple: true }).userData).sort())
      .toEqual(['base', 'breed', 'noMerge', 'parts']);
    expect(Object.keys(buildCat('calico').userData).sort()).toEqual(['base', 'breed', 'noMerge', 'parts']);
  });
});
