import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCat } from '../src/cat/model.js';
import { animateCat } from '../src/cat/animator.js';

// Wave 6 (docs/VISUAL-PASS.md) reshaped the cat. These are the properties that
// wave established and that a later edit could silently undo — none of them are
// visible to animator.test.js, which tests poses rather than the model.
//
// Everything here is measured off a really-built model. There are no fixtures:
// the whole point of the wave was that the numbers in the source did not match
// the numbers on screen, so a test that asserted against hand-copied numbers
// would reproduce exactly the bug it is meant to catch.

const BREEDS = ['tabby', 'siamese', 'persian', 'black', 'calico', 'mainecoon', 'zeetoo', 'rosa', 'robbie'];
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

  it('the tail chain carries its shape in POSITIONS, which the animator never writes', () => {
    // Wave 6 gave the tail an upward arc. That arc is expressed as pivot
    // positions precisely because animateCat resets every pivot's ROTATION to
    // zero on every frame — a curve stored in rotations would be wiped. This
    // pins the division of ownership from the model's side.
    const cat = buildCat('tabby');
    const before = cat.userData.parts.tailPivots.map((p) => p.position.toArray());
    for (const state of STATES) animateCat(cat, state, 2.2, 1.5, false);
    const after = cat.userData.parts.tailPivots.map((p) => p.position.toArray());
    expect(after).toEqual(before);
    // ...and it really is a curve, not a straight chain.
    const lifted = after.filter(([, y]) => y > 0.001);
    expect(lifted.length).toBeGreaterThanOrEqual(3);
  });
});

describe('cat model: markings lie ON the surface they mark', () => {
  // The Wave 6 headline. Before it, a marking was a separate squashed ellipsoid
  // parked near the body: a tabby's stripes stood 6cm proud of the flank, and
  // under Wave 1's 19.1-degree sun they caught a rim of light and cast their own
  // shadow onto the fur beneath — the "stegosaurus plates" read. The fix is
  // structural, and so is this test: a marking must be a patch of the host
  // sphere, parented to the host mesh.
  const marked = { tabby: 'body', zeetoo: 'body', calico: 'both', robbie: 'both' };

  for (const [breed, where] of Object.entries(marked)) {
    it(`${breed}'s markings are children of the mesh they mark, at its own radius`, () => {
      const cat = buildCat(breed);
      const body = cat.userData.parts.body;
      const skull = cat.userData.parts.head.children[0];
      const hosts = [];
      if (where === 'body' || where === 'both') hosts.push([body, BODY_R]);
      if (where === 'both') hosts.push([skull, SKULL_R]);

      let checked = 0;
      for (const [host, r] of hosts) {
        expect(host.children.length).toBeGreaterThan(0); // parented to the MESH...
        for (const mark of host.children) {
          const pos = mark.geometry.attributes.position;
          for (let i = 0; i < pos.count; i++) {
            // ...and every vertex sits on that mesh's own sphere. Because the
            // host's non-uniform scale is applied by the scene graph and not by
            // the marking, this single property makes the patch follow the
            // surface in every pose, including the animator's squash and
            // stretch, on every breed, for free.
            const d = Math.hypot(pos.getX(i), pos.getY(i), pos.getZ(i));
            expect(d).toBeCloseTo(r * PATCH_LIFT, 5);
            checked++;
          }
        }
      }
      expect(checked).toBeGreaterThan(100);
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
    for (const breed of ['siamese', 'persian', 'black', 'rosa', 'mainecoon']) {
      const cat = buildCat(breed);
      expect(cat.userData.parts.body.children).toHaveLength(0);
    }
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
  const CEILING = { tabby: 31, siamese: 30, persian: 31, black: 30, calico: 33, mainecoon: 31, zeetoo: 31, rosa: 30, robbie: 32, hagrid: 19 };

  for (const breed of ALL) {
    it(`${breed} draws no more meshes than its ceiling (${CEILING[breed]})`, () => {
      let meshes = 0;
      buildCat(breed).traverse((o) => { if (o.isMesh) meshes++; });
      expect(meshes).toBeLessThanOrEqual(CEILING[breed]);
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
