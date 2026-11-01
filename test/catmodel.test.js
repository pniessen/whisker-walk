import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCat, coatColor } from '../src/cat/model.js';
import { samples, lum as lumC, meshCount, surfaceHit, PRESETS, triangles, colourDistance } from './helpers/catfingerprint.js';
import { animateCat } from '../src/cat/animator.js';
import { CATALOG } from '../src/progression.js';
import { VISIT_PRIZES } from '../src/visits.js';

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
      expect(lum(leg.children[0].material)).toBeGreaterThan(0.8); // the limb
      expect(lum(leg.userData.paw.material)).toBeGreaterThan(0.8);
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
  it('a hind leg is one mesh with a thick thigh; a front leg is a plain limb', () => {
    const { legs } = buildCat('tabby').userData.parts;
    expect(W(legs[2].children[0])).toBeGreaterThan(0.18);   // 0.11 × 0.85 × 2 = 0.187
    expect(W(legs[0].children[0])).toBeLessThan(0.12);       // 2 × 0.058
    expect(meshCount(legs[2])).toBe(2);                       // limb + paw
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
      expect(triangles(buildCat(b))).toBeLessThanOrEqual(8000);
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
