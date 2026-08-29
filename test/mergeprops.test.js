import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';

// The same headless canvas stub every world test uses — see the note in
// test/neighborhood.test.js for why a blanket Proxy is not enough.
vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') {
          return () => ({ addColorStop: () => {} });
        }
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const { mergeStaticProps, mergeKey, MERGED_FLAG } = await import('../src/render/mergeprops.js');
const { scanFootprints, createContactShadows } = await import('../src/render/contactshadows.js');
const { createWind } = await import('../src/render/wind.js');
const { buildCat } = await import('../src/cat/model.js');
const { litMaterial } = await import('../src/render/materials.js');

const { build: buildNeighborhood } = await import('../src/world/neighborhood.js');
const { build: buildPark } = await import('../src/world/park.js');
const { build: buildDocks } = await import('../src/world/docks.js');
const { build: buildSeaside } = await import('../src/world/seaside.js');
const { build: buildDen } = await import('../src/world/den.js');

// ---------------------------------------------------------------------------
// WAVE 3.1 — the invariants render/mergeprops.js's whole design rests on.
//
// The module merges a top-level scene child's leaf meshes into one mesh per
// material and never crosses a top-level child. Everything the merge could
// plausibly break is a consequence of that boundary holding, so this file
// checks the boundary itself first and then each consumer that depends on it:
//
//   * the contact-decal scan (one footprint per top-level child, counts pinned
//     at 61/42/67/26/20 by test/contactshadows.test.js and by this file);
//   * walk.js's caster trim (per-top-level-child height/span classification);
//   * the dusk userData.window material swap;
//   * the wind registry (rotates registered Groups);
//   * water meshes, which three world files require to be DIRECT children of
//     the scene;
//   * co-walker determinism.
//
// Plus the two failure modes found while building it, both of which were
// silent and neither of which any existing test would have caught: a merge key
// that rejected on `geometry.groups` (every THREE primitive has them, so
// nothing indexed merged at all) and a traversal that merged a Mesh parented
// to another Mesh (removing the parent took the child's second copy with it,
// losing 504 triangles from a cat).
// ---------------------------------------------------------------------------

const AREAS = [
  // name, builder, decal count (pinned, must not move), den?
  ['neighborhood', buildNeighborhood, 61, false],
  ['park', buildPark, 42, false],
  ['docks', buildDocks, 67, false],
  ['seaside', buildSeaside, 26, false],
  ['den', buildDen, 20, true],
];

function buildArea(builder, isDen) {
  const scene = new THREE.Scene();
  const wind = createWind({ reducedMotion: false });
  const registered = [];
  const add = wind.add;
  wind.add = (object3d, opts) => { registered.push(object3d); return add(object3d, opts); };
  const data = builder(scene, isDen
    ? { placed: [], wind }
    : { water: { quality: { name: 'high' }, reducedMotion: false }, wind });
  return { scene, data, wind, registered };
}

// walk.js's caster rule, per top-level child. Duplicated for the same reason
// test/budget.test.js duplicates it: walk.js's import graph pulls in the whole
// live game, and this needs the rule against a bare build.
const CAST_FLAT_HEIGHT = 0.12;
const CAST_TALL_HEIGHT = 1.3;
const CAST_WIDE_SPAN = 1.0;
const isTransparentMat = (m) => (Array.isArray(m) ? m.some(isTransparentMat) : !!m?.transparent);

function eligibility(scene) {
  const box = new THREE.Box3();
  return scene.children.map((child) => {
    box.setFromObject(child);
    if (box.isEmpty()) return false;
    const height = box.max.y - box.min.y;
    const span = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
    return height >= CAST_FLAT_HEIGHT && (height >= CAST_TALL_HEIGHT || span >= CAST_WIDE_SPAN);
  });
}

function stats(scene) {
  const elig = eligibility(scene);
  let meshes = 0, casters = 0, triangles = 0;
  scene.children.forEach((child, i) => {
    child.traverse((obj) => {
      if (!obj.isMesh) return;
      meshes++;
      const geo = obj.geometry;
      triangles += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
      if (elig[i] && !isTransparentMat(obj.material)) casters++;
    });
  });
  return { meshes, casters, triangles: Math.round(triangles), elig };
}

describe('Wave 3.1 — mergeStaticProps', () => {
  describe('the top-level boundary', () => {
    for (const [name, builder, , isDen] of AREAS) {
      it(`${name}: leaves scene.children count, order and identity untouched`, () => {
        const { scene } = buildArea(builder, isDen);
        const before = [...scene.children];
        mergeStaticProps(scene);
        expect(scene.children).toHaveLength(before.length);
        for (let i = 0; i < before.length; i++) expect(scene.children[i]).toBe(before[i]);
      });

      it(`${name}: never puts a merged mesh at the top level`, () => {
        const { scene } = buildArea(builder, isDen);
        mergeStaticProps(scene);
        for (const child of scene.children) expect(child.userData[MERGED_FLAG]).toBeUndefined();
      });
    }
  });

  describe('it actually merges', () => {
    for (const [name, builder, , isDen] of AREAS) {
      it(`${name}: cuts the mesh count without changing a single triangle`, () => {
        const a = buildArea(builder, isDen);
        const b = buildArea(builder, isDen);
        const before = stats(a.scene);
        const result = mergeStaticProps(b.scene);
        const after = stats(b.scene);

        expect(result.merged).toBeGreaterThan(0);
        expect(result.removed).toBeGreaterThan(result.merged);
        expect(after.meshes).toBe(before.meshes - (result.removed - result.merged));
        expect(after.meshes).toBeLessThan(before.meshes);
        // THE TRIANGLE INVARIANT. Merging re-parents existing geometry; it
        // does not duplicate or drop any. A mismatch here means either a
        // source mesh was removed without its geometry reaching the merged
        // mesh (the Mesh-parented-to-Mesh bug) or a geometry was counted
        // twice. It is the cheapest possible detector for both.
        expect(after.triangles).toBe(before.triangles);
      });
    }
  });

  describe('the contact-decal scan (Wave 2.1) is untouched', () => {
    for (const [name, builder, decals, isDen] of AREAS) {
      it(`${name}: scanned in walk.js's order the ${decals} footprints are byte-identical`, () => {
        // walk.js's order: createContactShadows(scene) THEN mergeStaticProps
        // (scene). Scanning first is what makes this exact rather than merely
        // correct, and the assertion below on walk.js's source text is what
        // keeps the two calls in that order.
        const a = buildArea(builder, isDen);
        const b = buildArea(builder, isDen);
        const before = scanFootprints(a.scene);
        const after = scanFootprints(b.scene);
        mergeStaticProps(b.scene);
        expect(before).toHaveLength(decals);
        expect(after).toEqual(before);
      });

      it(`${name}: scanned AFTER the merge it would still be ${decals} footprints`, () => {
        // The count is the invariant that actually matters, and it holds in
        // either order: merging never crosses a top-level child, so it can
        // neither create a footprint nor push one past MAX_SPAN and delete it.
        //
        // The POSITIONS do drift in this order, by two mechanisms, and both
        // are why walk.js scans first rather than reasons to worry:
        //   * ~1e-6m of float32 noise, because baking a matrix into vertices
        //     is exact in real arithmetic and not in float32; and
        //   * up to ~2mm on a top-level child that is itself ROTATED (the den
        //     has several), because the merged mesh's box is the AABB of an
        //     AABB — one conservative widening step more than Box3
        //     .setFromObject took before. It can only grow, never shrink,
        //     which is the direction the caster rule is safe in.
        // contactshadows.js's per-prop size jitter is a sin() hash of the
        // footprint centre, and a sin hash turns either of those into up to 8%
        // of decal size. Invisible in a frame, but free to avoid entirely.
        const TOLERANCE = 0.005;
        const a = buildArea(builder, isDen);
        const b = buildArea(builder, isDen);
        const before = scanFootprints(a.scene);
        mergeStaticProps(b.scene);
        const after = scanFootprints(b.scene);
        expect(before).toHaveLength(decals);
        expect(after).toHaveLength(decals);
        for (let i = 0; i < decals; i++) {
          expect(Math.abs(after[i].x - before[i].x)).toBeLessThan(TOLERANCE);
          expect(Math.abs(after[i].z - before[i].z)).toBeLessThan(TOLERANCE);
        }
      });
    }

    it('walk.js scans the footprints BEFORE it merges', () => {
      // Read as source text rather than imported, the same convention
      // test/shadowfit.test.js and test/contactshadows.test.js already use for
      // pinning something inside walk.js: its import graph pulls in the chat
      // UI, audio and the rest of the live game.
      const source = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');
      const scan = source.indexOf('createContactShadows(scene)');
      const merge = source.indexOf('mergeStaticProps(scene)');
      expect(scan).toBeGreaterThan(-1);
      expect(merge).toBeGreaterThan(-1);
      expect(merge).toBeGreaterThan(scan);
      // And both must sit before the cat joins the scene, or the merge would
      // weld the hero's legs to its body and the scan would stamp a permanent
      // decal on the spawn point.
      const cat = source.indexOf('scene.add(cat)');
      expect(cat).toBeGreaterThan(merge);
    });

    it("the rig's own InstancedMeshes are never merge input", () => {
      const { scene } = buildArea(buildNeighborhood, false);
      const rig = createContactShadows(scene);
      const decalMeshes = scene.children.filter((c) => c.userData.contactDecal);
      expect(decalMeshes.length).toBe(2);
      mergeStaticProps(scene);
      expect(scene.children.filter((c) => c.userData.contactDecal)).toHaveLength(2);
      for (const mesh of decalMeshes) expect(mesh.parent).toBe(scene);
      rig.dispose();
    });
  });

  describe("walk.js's caster trim (Wave 3.3) reaches the same verdict", () => {
    for (const [name, builder, , isDen] of AREAS) {
      it(`${name}: no top-level child changes caster eligibility, and the count only falls`, () => {
        const a = buildArea(builder, isDen);
        const b = buildArea(builder, isDen);
        const before = stats(a.scene);
        mergeStaticProps(b.scene);
        const after = stats(b.scene);
        // Per-child, not just in aggregate: an added caster and a removed one
        // would cancel out in a total.
        expect(after.elig).toEqual(before.elig);
        expect(after.casters).toBeLessThan(before.casters);
      });

      it(`${name}: every merged mesh is homogeneous in what the caster rule reads`, () => {
        const { scene } = buildArea(builder, isDen);
        const elig = eligibility(scene);
        mergeStaticProps(scene);
        scene.children.forEach((child, i) => {
          child.traverse((obj) => {
            if (!obj.userData[MERGED_FLAG]) return;
            // Homogeneity in ELIGIBILITY is structural: a merged mesh lives
            // inside exactly one top-level child, and eligibility is decided
            // per top-level child. Assert the structure rather than the
            // consequence — that the merged mesh really is under child i.
            let ancestor = obj;
            while (ancestor.parent && ancestor.parent !== scene) ancestor = ancestor.parent;
            expect(ancestor).toBe(scene.children[i]);
            expect(elig[i]).toBe(eligibility(scene)[i]);
            // Homogeneity in TRANSPARENCY is by merge key, and it is the one
            // caster input that varies leaf by leaf inside a group (a car's
            // glass cabin, a fountain's water).
            expect(Array.isArray(obj.material)).toBe(false);
          });
        });
      });
    }
  });

  describe('the dusk window swap survives', () => {
    for (const [name, builder, , isDen] of [AREAS[0], AREAS[2], AREAS[4]]) {
      it(`${name}: every userData.window mesh is still its own recolourable mesh`, () => {
        const a = buildArea(builder, isDen);
        const b = buildArea(builder, isDen);
        const count = (scene) => { let n = 0; scene.traverse((o) => { if (o.userData?.window) n++; }); return n; };
        const before = count(a.scene);
        expect(before).toBeGreaterThan(0);
        mergeStaticProps(b.scene);
        expect(count(b.scene)).toBe(before);
        // walk.js's dusk traversal, verbatim in shape: swap each window's
        // material for a warm glow and check every one of them took it.
        const swapped = [];
        b.scene.traverse((o) => {
          if (!o.userData?.window) return;
          const old = o.material;
          o.material = litMaterial(0xffe0a0, { emissive: 0x8a6a20 });
          old.dispose();
          swapped.push(o);
        });
        expect(swapped).toHaveLength(before);
        for (const win of swapped) expect(win.material.emissive.getHex()).toBe(0x8a6a20);
        // And no NON-window mesh was dragged along with them, which is what a
        // window merged into its wall panel would have caused.
        let glowing = 0;
        b.scene.traverse((o) => { if (o.isMesh && o.material?.emissive?.getHex() === 0x8a6a20) glowing++; });
        expect(glowing).toBe(before);
      });
    }
  });

  describe('the wind registry still sways what it registered', () => {
    for (const [name, builder, , isDen] of [AREAS[0], AREAS[1], AREAS[3], AREAS[4]]) {
      it(`${name}: registered groups still rotate after the merge`, () => {
        const { scene, wind, registered } = buildArea(builder, isDen);
        expect(registered.length).toBeGreaterThan(0);
        mergeStaticProps(scene);
        // Every registered object must still be in the scene graph — a wind
        // entry pointing at a detached object is a tree that has stopped
        // swaying and nothing would say so.
        for (const object of registered) {
          let root = object;
          while (root.parent) root = root.parent;
          expect(root).toBe(scene);
        }
        wind.update(3.7);
        const moved = registered.filter((o) => o.rotation.z !== 0 || o.rotation.x !== 0);
        expect(moved.length).toBe(registered.length);
        wind.dispose();
        for (const object of registered) {
          expect(object.rotation.z).toBe(0);
          expect(object.rotation.x).toBe(0);
        }
      });
    }
  });

  describe('water stays a direct child of the scene', () => {
    for (const [name, builder] of [AREAS[1], AREAS[2], AREAS[3]]) {
      it(`${name}: the water plane is still findable in scene.children`, () => {
        const { scene, data } = buildArea(builder, false);
        const before = scene.children.filter((c) => c.isMesh && /^water:/.test(c.name));
        expect(before.length).toBe(1);
        mergeStaticProps(scene);
        const after = scene.children.filter((c) => c.isMesh && /^water:/.test(c.name));
        expect(after.length).toBe(1);
        expect(after[0]).toBe(before[0]);
        expect(after[0].geometry).toBe(before[0].geometry);
        // And the blocking footprint the collision system reads is untouched.
        expect(data.waters.length).toBeGreaterThan(0);
      });
    }
  });

  describe('determinism (co-walkers must build identical worlds)', () => {
    for (const [name, builder, , isDen] of AREAS) {
      it(`${name}: two builds merge to byte-identical geometry`, () => {
        const dump = (scene) => {
          const out = [];
          scene.traverse((o) => {
            if (!o.userData[MERGED_FLAG]) return;
            const p = o.geometry.attributes.position.array;
            out.push([o.userData[MERGED_FLAG], p.length, p[0], p[1], p[p.length - 1]].join(','));
          });
          return out;
        };
        const a = buildArea(builder, isDen); mergeStaticProps(a.scene);
        const b = buildArea(builder, isDen); mergeStaticProps(b.scene);
        const da = dump(a.scene);
        expect(da.length).toBeGreaterThan(0);
        expect(dump(b.scene)).toEqual(da);
      });
    }
  });

  describe('what must never be merged', () => {
    it('the cat is opted out whole, so animator.js keeps its part references', () => {
      const scene = new THREE.Scene();
      const cat = buildCat('tabby');
      scene.add(cat);
      const count = (s) => { let m = 0, t = 0; s.traverse((o) => { if (o.isMesh) { m++; const g = o.geometry; t += (g.index ? g.index.count : g.attributes.position.count) / 3; } }); return [m, Math.round(t)]; };
      const before = count(scene);
      expect(cat.userData.noMerge).toBe(true);
      const result = mergeStaticProps(scene);
      expect(result).toEqual({ merged: 0, removed: 0, groups: 0 });
      expect(count(scene)).toEqual(before);
      // Every part animator.js drives is still in the scene graph.
      const parts = cat.userData.parts;
      for (const part of [parts.body, parts.head, parts.tail, ...parts.legs]) {
        let root = part;
        while (root.parent) root = root.parent;
        expect(root).toBe(scene);
      }
    });

    it('a Mesh that parents another Mesh is not merge input', () => {
      // The 504-triangle bug: traverse() finds parent and child, merging both,
      // and then removeFromParent() on the parent silently takes the child's
      // still-referenced copy out of the scene with it.
      const scene = new THREE.Scene();
      const group = new THREE.Group();
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      const parent = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x808080 }));
      const nested = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x808080 }));
      nested.position.set(0, 1, 0);
      parent.add(nested);
      const sibling = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x808080 }));
      sibling.position.set(2, 0, 0);
      group.add(parent, sibling);
      scene.add(group);

      expect(mergeKey(parent)).toBeNull();   // has a child
      expect(mergeKey(nested)).not.toBeNull();
      expect(mergeKey(sibling)).not.toBeNull();

      let triangles = 0;
      scene.traverse((o) => { if (o.isMesh) triangles += o.geometry.index.count / 3; });
      mergeStaticProps(scene);
      let after = 0;
      scene.traverse((o) => { if (o.isMesh) after += o.geometry.index.count / 3; });
      expect(after).toBe(triangles);
      expect(parent.parent).toBe(group); // still there, with its child intact
      expect(nested.parent).toBe(null);  // merged with the sibling instead
    });

    it('rejects windows, decals, opted-out meshes, multi-material and invisible meshes', () => {
      const material = new THREE.MeshStandardMaterial({ color: 0x808080 });
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      const make = (mutate) => { const m = new THREE.Mesh(geometry, material); mutate(m); return m; };
      expect(mergeKey(make((m) => { m.userData.window = true; }))).toBeNull();
      expect(mergeKey(make((m) => { m.userData.contactDecal = true; }))).toBeNull();
      expect(mergeKey(make((m) => { m.userData.noMerge = true; }))).toBeNull();
      expect(mergeKey(make((m) => { m.visible = false; }))).toBeNull();
      expect(mergeKey(make((m) => { m.material = [material, material]; }))).toBeNull();
      expect(mergeKey(make((m) => { m.geometry = geometry.clone(); m.geometry.setDrawRange(0, 12); }))).toBeNull();
      expect(mergeKey(new THREE.InstancedMesh(geometry, material, 4))).toBeNull();
      expect(mergeKey(new THREE.Group())).toBeNull();
      // ...and accepts a plain leaf.
      expect(mergeKey(make(() => {}))).toBeTypeOf('string');
    });

    it('geometry groups do NOT block a merge (every THREE primitive has them)', () => {
      // The first draft rejected on geometry.groups.length > 1 and therefore
      // merged almost nothing indexed. WebGLRenderer only consults groups when
      // object.material is an array, so a six-group box with one material is
      // one draw call and merges fine.
      const box = new THREE.BoxGeometry(1, 1, 1);
      expect(box.groups.length).toBe(6);
      expect(mergeKey(new THREE.Mesh(box, new THREE.MeshStandardMaterial()))).toBeTypeOf('string');
    });

    it('keys on material PARAMETERS, not material identity', () => {
      // world/builder.js allocates a fresh material per call, so ninety
      // identical palings hold ninety distinct material objects. Keying on
      // uuid finds zero merges anywhere in the game.
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      const a = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x336699, roughness: 0.9 }));
      const b = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x336699, roughness: 0.9 }));
      const c = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x336699, roughness: 0.5 }));
      const d = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x336699, roughness: 0.9, transparent: true }));
      expect(a.material.uuid).not.toBe(b.material.uuid);
      expect(mergeKey(a)).toBe(mergeKey(b));
      expect(mergeKey(a)).not.toBe(mergeKey(c));
      expect(mergeKey(a)).not.toBe(mergeKey(d)); // transparency splits — the caster rule reads it
    });
  });

  describe('geometry hygiene', () => {
    it('never mutates the shared, app-lifetime geometry cache', () => {
      // world/builder.js memoises roundedBox() by dimension for the lifetime
      // of the app. Applying a matrix to one of those in place would corrupt
      // every prop in every LATER walk, and nothing would fail until then.
      const scene = new THREE.Scene();
      const group = new THREE.Group();
      const shared = new THREE.BoxGeometry(1, 1, 1);
      const snapshot = Float32Array.from(shared.attributes.position.array);
      for (const x of [0, 3, 6]) {
        const mesh = new THREE.Mesh(shared, new THREE.MeshStandardMaterial({ color: 0x808080 }));
        mesh.position.set(x, 0, 0);
        group.add(mesh);
      }
      scene.add(group);
      mergeStaticProps(scene);
      expect(Float32Array.from(shared.attributes.position.array)).toEqual(snapshot);
    });

    it('bakes each leaf transform, so the merged mesh needs none of its own', () => {
      const scene = new THREE.Scene();
      const group = new THREE.Group();
      group.position.set(5, 0, -2);
      group.rotation.y = 0.7;
      group.scale.setScalar(1.3);
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      const material = () => new THREE.MeshStandardMaterial({ color: 0x808080 });
      const a = new THREE.Mesh(geometry, material());
      a.position.set(0, 0.5, 0);
      const b = new THREE.Mesh(geometry, material());
      b.position.set(0, 2, 0);
      b.rotation.z = 0.4;
      group.add(a, b);
      scene.add(group);
      const before = new THREE.Box3().setFromObject(group);
      mergeStaticProps(scene);
      const merged = group.children.find((c) => c.userData[MERGED_FLAG]);
      expect(merged.userData[MERGED_FLAG]).toBe(2);
      expect(merged.position.lengthSq()).toBe(0);
      expect(merged.scale.x).toBe(1);
      const after = new THREE.Box3().setFromObject(group);
      for (const axis of ['x', 'y', 'z']) {
        expect(after.min[axis]).toBeCloseTo(before.min[axis], 5);
        expect(after.max[axis]).toBeCloseTo(before.max[axis], 5);
      }
    });

    it("a merged mesh's bounding box can never be smaller than its sources' was", () => {
      // Box3.setFromObject takes the AABB of each leaf's ROTATED box, which is
      // conservative; bounds recomputed from merged vertices are tight. A
      // shrink is how a merge could drop a prop below the caster rule's
      // height/span thresholds and silently take its shadow away.
      const scene = new THREE.Scene();
      const group = new THREE.Group();
      const material = () => new THREE.MeshStandardMaterial({ color: 0x808080 });
      for (const angle of [0.6, -0.9]) {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2, 12), material());
        mesh.rotation.z = angle;
        mesh.position.set(angle, 1, 0);
        group.add(mesh);
      }
      scene.add(group);
      const before = new THREE.Box3().setFromObject(group);
      mergeStaticProps(scene);
      const after = new THREE.Box3().setFromObject(group);
      expect(after.min.x).toBeLessThanOrEqual(before.min.x + 1e-6);
      expect(after.min.y).toBeLessThanOrEqual(before.min.y + 1e-6);
      expect(after.max.x).toBeGreaterThanOrEqual(before.max.x - 1e-6);
      expect(after.max.y).toBeGreaterThanOrEqual(before.max.y - 1e-6);
    });
  });
});
