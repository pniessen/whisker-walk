import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// =============================================================================
// WAVE 3.1 — STATIC PROP MERGING, done INSIDE each top-level scene child and
// never across two of them.
//
// -----------------------------------------------------------------------------
// THE CONSTRAINT THAT DECIDED THE DESIGN
// -----------------------------------------------------------------------------
//
// docs/VISUAL-PASS.md drafted 3.1 as "merge by (material, ~30m spatial cell)",
// deferred it twice, and was right to. There is a documented convention in this
// codebase — stated verbatim in world/park.js, world/docks.js, world/seaside.js
// and render/water.js — that certain meshes must be DIRECT children of the
// scene, never nested in a Group, because two systems derive per-object
// behaviour from `scene.children` and a nested mesh is invisible to them:
//
//   * render/contactshadows.js's static scan derives ONE ground decal per
//     top-level child via Box3.setFromObject. Merge forty props into one mesh
//     and you get one enormous footprint instead of forty correct ones — and
//     its MAX_SPAN of 6.5m would then reject that footprint outright, so the
//     forty decals would silently VANISH rather than look wrong.
//   * game/walk.js's caster trim (Wave 3.3) classifies per top-level child by
//     height and span. A merged cell has the bounding box of the whole cell, so
//     every prop in it would become a caster again — undoing Wave 3.3 entirely
//     and costing more shadow-pass draws than the merge saved in the main pass.
//
// Plus: the wind registry rotates registered Groups; the dusk pass swaps
// `userData.window` materials in place; tippables, climbables, collectibles,
// secrets and quest objects are looked up by object identity; and one merged
// mesh per cell is frustum-culled all-or-nothing.
//
// MEASURED, the cross-child half of that plan is worth very little. Grouping by
// (30m cell, material, caster-eligibility, transparency) over the four outdoor
// areas and the den saves 24.1% / 14.0% / 53.3% / 29.2% / 47.5% of meshes.
// Doing exactly the same merge but refusing to cross a top-level child boundary
// saves 20.7% / 14.0% / 40.0% / 26.2% / 44.4%. The whole hazard list above buys
// between 0.0 and 13.3 percentage points, and 0.0 of it in the park.
//
// So this module merges STRICTLY WITHIN one top-level child. That single
// restriction discharges the entire list by construction rather than by
// vigilance:
//
//   * scene.children is unchanged — same children, same count, same order.
//   * Every top-level child's world bounding box is unchanged to the float,
//     because merging bakes each leaf's own matrix and moves no vertex. So the
//     decal scan and the caster rule both see EXACTLY what they saw before.
//   * Caster eligibility is decided per top-level child, so every mesh inside
//     one is already homogeneous in it — the merge cannot make a caster out of
//     something that was not one. (Transparency is the one caster input that
//     varies per leaf, and it is part of the material key below, so a merged
//     mesh is homogeneous in that too.)
//   * The wind registry holds the top-level Group. It rotates the Group; what
//     hangs under it is none of its business, so a swaying tree keeps swaying.
//   * Tippables, climbables, collectibles, secrets, race rings and quest
//     objects are all created by walk.js AFTER the area build and are not in
//     the scene when this runs. Nothing this touches has ever been looked up
//     by identity.
//   * Per-object frustum culling gets strictly better, not worse: the unit of
//     culling is still the top-level prop, and that prop now costs fewer draws
//     when it IS visible.
//
// Two things are still excluded explicitly, because they are per-leaf state
// inside a group rather than per-group state:
//
//   * `userData.window` — walk.js's dusk pass replaces those materials in place
//     to make them glow. A window merged into its wall can never be recoloured.
//   * `userData.contactDecal` — the two InstancedMeshes are not merge input at
//     any price, and they are not in the scene yet anyway.
//
// -----------------------------------------------------------------------------
// WHY MERGING AND NOT INSTANCING (Wave 3.2)
// -----------------------------------------------------------------------------
//
// 3.2 proposed InstancedMesh for the repeated props — fence palings, kerb
// setts, bollards, books. Inside a group, an InstancedMesh and a merged mesh
// both cost exactly ONE draw call for N copies, so they are the same win; the
// difference is that instancing keeps N x 44 triangles down to 44 and merging
// pays them, while merging needs no per-leaf geometry identity and no second
// code path for the odd paling that is scaled or rotated differently.
//
// Section 0 of docs/VISUAL-PASS.md settles which of those matters: this scene
// is draw-call bound and nowhere near triangle bound. The measured merge cost
// is under 12k triangles added across all five areas against a ~106,700
// triangle frame, and every one of those triangles was already being drawn —
// merging changes how many draw calls carry them, not how many there are.
//
// Instancing ACROSS top-level children (eight mailboxes, one InstancedMesh)
// would be a real additional win, and it is exactly the change the hazard list
// forbids: one scene child for eight props is one decal for eight props. Not
// done, deliberately.
//
// -----------------------------------------------------------------------------
// DETERMINISM
// -----------------------------------------------------------------------------
//
// Co-walkers share a seed and must build identical worlds, so nothing here may
// depend on iteration order that varies between clients. It does not: the only
// iteration is over `root.children` and over each child's own traversal order,
// both of which are insertion order in the area builder, and the merge key is a
// pure function of material parameters and geometry layout. No Math.random, no
// walkRng, no Map keyed by anything a client could compute differently. Merge
// output is byte-identical between two clients that built the same world.
// =============================================================================

// A merged mesh is only worth making out of at least this many source meshes.
// 2 is the honest floor — two meshes become one, which is one draw call saved
// for one merged geometry allocated. There is no fixed overhead per merged mesh
// beyond the geometry itself, so there is no reason to demand 3.
export const MIN_MERGE = 2;

// Marks a merged mesh, for tests and for anything that later wants to tell an
// authored mesh from a derived one. Also carries the source count.
export const MERGED_FLAG = 'mergedProps';

/**
 * mergeKey(mesh) — the equivalence class a mesh can be merged within, or null
 * if it must not be merged at all.
 *
 * Structural rather than by material identity, and that distinction is the
 * whole reason this works. world/builder.js's `mat()` and `litMaterial()`
 * allocate a FRESH MeshStandardMaterial per call, so ninety identical fence
 * palings hold ninety distinct material objects that are equal in every
 * parameter. Keying on `material.uuid` finds zero merges anywhere in the game
 * (measured); keying on the parameters finds all of them.
 *
 * The key covers every material parameter that can differ between two of this
 * game's materials AND change a pixel, plus the two geometry-layout facts
 * mergeGeometries itself requires to be uniform (the attribute set, and whether
 * the geometry is indexed).
 */
export function mergeKey(mesh) {
  if (!mesh?.isMesh) return null;
  // InstancedMesh / SkinnedMesh / BatchedMesh: not merge input. Nothing in the
  // world builders produces one today; the guard is so that a future one is
  // skipped rather than silently flattened to its first instance.
  if (mesh.isInstancedMesh || mesh.isSkinnedMesh || mesh.isBatchedMesh) return null;
  // Per-leaf state that outlives the build, and the reason each is here is in
  // the header: the dusk glow swap needs its own material object, and the
  // contact decals are InstancedMeshes that must never be touched.
  if (mesh.userData.window || mesh.userData.contactDecal || mesh.userData.noMerge) return null;
  // A hidden mesh merged into a visible one becomes visible. Nothing in the
  // builders ships one, but the failure mode is a wrong image rather than a
  // wrong count, so it is checked rather than assumed.
  if (mesh.visible === false) return null;
  // LEAVES ONLY, and this one is not a nicety — it is a data-loss bug caught
  // in the pixel A/B. A Mesh can parent another Mesh (cat/model.js hangs each
  // paw off its leg), and traverse() finds both. Merge them and then
  // removeFromParent() the leg, and the PAW goes with it — its geometry is
  // sitting in the merged mesh, but so is a second copy of it that nothing
  // draws, and the mesh count and triangle count both come out short. Caught
  // as 504 triangles missing from a cat; it would be silent on a prop.
  //
  // A leaf whose PARENT is a mesh is still fine to merge: the parent stays put
  // because it has a child, and detaching the leaf takes nothing with it.
  if (mesh.children.length > 0) return null;

  const material = mesh.material;
  // Multi-material meshes draw once per geometry group anyway, and merging them
  // needs the useGroups path with its own re-indexing. Out of scope, and there
  // are none in the world builders.
  if (!material || Array.isArray(material)) return null;

  const geometry = mesh.geometry;
  if (!geometry?.attributes?.position) return null;
  // NOT a groups check. Every THREE primitive constructor emits geometry
  // groups — BoxGeometry has six, one per face, CylinderGeometry two or three
  // — purely so a multi-material array COULD be attached later, and
  // WebGLRenderer only ever consults them when `object.material` is an array
  // (projectObject: `if (Array.isArray(material)) { ...groups... } else push
  // one item`). With a single material a six-group box is one draw call and
  // its groups are dead data, so rejecting on groups would have excluded very
  // nearly every indexed primitive in the game. It did, in the first draft of
  // this file: 55 merges lost in the den, 26 at the Docks, 12 at the seaside.
  //
  // drawRange IS load-bearing, because mergeGeometries ignores it and would
  // silently make a trimmed geometry whole again. Nothing sets one today.
  if (geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity) return null;
  // Morph targets do not survive a merge in any useful form.
  if (geometry.morphAttributes && Object.keys(geometry.morphAttributes).length > 0) return null;

  // mergeGeometries requires every input to carry the same attribute names and
  // to agree about being indexed, and returns null (with a console warning)
  // otherwise. Putting both in the key means it never sees a mismatched batch.
  const attrs = Object.keys(geometry.attributes).sort().join('+');
  const indexed = geometry.index ? 'i' : 'n';

  return [
    material.type,
    material.color?.getHexString() ?? '-',
    material.roughness,
    material.metalness,
    material.transparent,
    material.opacity,
    material.emissive?.getHexString() ?? '-',
    material.emissiveIntensity,
    material.side,
    material.flatShading,
    material.depthWrite,
    material.depthTest,
    material.vertexColors,
    material.wireframe,
    material.toneMapped,
    material.fog,
    material.blending,
    material.alphaTest,
    // Textures are shared objects (render/textures.js memoises per density), so
    // identity is the right comparison here and not a parameter dump: two
    // materials pointing at the same clone tile at the same density, and two
    // pointing at different clones do not.
    material.map?.uuid ?? '-',
    material.normalMap?.uuid ?? '-',
    material.normalScale ? `${material.normalScale.x},${material.normalScale.y}` : '-',
    material.roughnessMap?.uuid ?? '-',
    material.aoMap?.uuid ?? '-',
    material.alphaMap?.uuid ?? '-',
    attrs,
    indexed,
  ].join('|');
}

/**
 * mergeStaticProps(root) — merge every top-level child of `root` in place.
 *
 * Returns { merged, removed, groups } — how many merged meshes were created,
 * how many source meshes they replaced, and how many top-level children were
 * touched. `removed - merged` is the net mesh (and therefore draw-call)
 * reduction.
 *
 * Call it on the scene immediately after the area build and BEFORE anything
 * that is not area geometry has been added. It is idempotent in the sense that
 * a second call finds nothing left to merge, but there is no reason to make
 * one.
 */
export function mergeStaticProps(root) {
  let merged = 0;
  let removed = 0;
  let groups = 0;

  // World matrices are needed to compute each leaf's transform relative to its
  // top-level child, and a freshly built scene has never been rendered, so
  // nothing has updated them. Box3.setFromObject does this itself, which is why
  // contactshadows.js gets away without it; this does not.
  root.updateMatrixWorld(true);

  const inverse = new THREE.Matrix4();
  const relative = new THREE.Matrix4();
  const sourceBox = new THREE.Box3();
  const expected = new THREE.Box3();

  for (const child of root.children) {
    // A top-level Mesh is already one draw call — the water planes, the ground,
    // the paths, the horizon band. Nothing to do, and (see the header) these
    // are precisely the meshes that must stay exactly where they are.
    if (!child.isObject3D || child.isMesh) continue;
    // The whole-rig opt-out, for anything whose SUB-OBJECTS are moved by name
    // after the build. walk.js calls this before the cat, the strays, the
    // ghosts, the critters or anything else animated is in the scene, so it
    // never fires in the game — it is here so that calling this at the wrong
    // moment (a harness, a future caller) degrades to "no merge" instead of to
    // a cat whose legs are welded to its body. cat/model.js sets it.
    if (child.userData.noMerge) continue;

    // Bucket this child's leaves by merge key, in traversal order.
    const buckets = new Map();
    child.traverse((obj) => {
      const key = mergeKey(obj);
      if (key === null) return;
      let bucket = buckets.get(key);
      if (!bucket) buckets.set(key, bucket = []);
      bucket.push(obj);
    });

    let touched = false;
    for (const bucket of buckets.values()) {
      if (bucket.length < MIN_MERGE) continue;

      inverse.copy(child.matrixWorld).invert();
      expected.makeEmpty();
      const geometries = [];
      for (const mesh of bucket) {
        // The box Box3.setFromObject WOULD have produced for this leaf, in the
        // parent's frame — see the boundingBox union below for why it is
        // gathered here rather than derived from the merged vertices.
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        sourceBox.copy(mesh.geometry.boundingBox);
        relative.multiplyMatrices(inverse, mesh.matrixWorld);
        expected.union(sourceBox.applyMatrix4(relative));
      }
      for (const mesh of bucket) {
        // clone() so the SHARED, app-lifetime memoised geometry from
        // builder.js's roundedBox cache is never mutated — ninety palings point
        // at one BufferGeometry, and applying a matrix to it in place would
        // corrupt every other prop in the game for the rest of the session.
        const geometry = mesh.geometry.clone();
        relative.multiplyMatrices(inverse, mesh.matrixWorld);
        // applyMatrix4 transforms position by the matrix and normal/tangent by
        // the normal matrix, so non-uniform scale and rotation both survive.
        geometry.applyMatrix4(relative);
        geometries.push(geometry);
      }

      const combined = mergeGeometries(geometries, false);
      // Free the clones immediately: they never reached the GPU, and holding
      // them would double this pass's transient memory for no reason. The
      // ORIGINALS are not touched — they are the memoised cache.
      for (const geometry of geometries) geometry.dispose();
      if (!combined) continue; // mergeGeometries warns and returns null

      combined.computeBoundingBox();
      // THE CASTER INVARIANT, made provable rather than measured.
      //
      // walk.js's caster trim reads Box3.setFromObject(topLevelChild), and
      // Box3.expandByObject takes each leaf's GEOMETRY bounding box and applies
      // that leaf's world matrix — i.e. the axis-aligned box OF A ROTATED BOX,
      // which is conservative. Recomputing bounds from the merged vertices
      // instead gives the TIGHT box, which for a rotated cylinder or cone can
      // be strictly smaller. Smaller is how a merge could silently drop a prop
      // below CAST_TALL_HEIGHT or CAST_WIDE_SPAN and take its shadow away.
      //
      // Unioning with the box the old path would have produced makes that
      // impossible by construction: the merged mesh can never report a smaller
      // extent than its sources did. (Measured, nothing shipped is affected —
      // the largest top-level bbox delta across all five areas is under 1e-6m,
      // which is float noise from the matrix round trip, not a shrink. The
      // union is here so a future rotated prop cannot change that quietly.)
      combined.boundingBox.union(expected);
      combined.computeBoundingSphere();

      // The first source mesh donates its material, its layers and its render
      // order. Every other source material is simply dropped: they are per-mesh
      // allocations that have never been rendered, so they hold no GPU resource
      // to release, and calling dispose() on them would be actively unsafe if a
      // builder ever shared one object between two meshes.
      const donor = bucket[0];
      const mesh = new THREE.Mesh(combined, donor.material);
      mesh.name = donor.name || 'merged';
      mesh.castShadow = donor.castShadow;
      mesh.receiveShadow = donor.receiveShadow;
      mesh.renderOrder = donor.renderOrder;
      mesh.layers.mask = donor.layers.mask;
      mesh.frustumCulled = donor.frustumCulled;
      mesh.userData[MERGED_FLAG] = bucket.length;

      for (const source of bucket) source.removeFromParent();
      child.add(mesh);

      merged += 1;
      removed += bucket.length;
      touched = true;
    }
    if (touched) groups += 1;
  }

  // The merged meshes were added with an identity local matrix and the parents'
  // world matrices are now stale for anything that was reparented, so refresh
  // once. Cheap, and it means the caller (walk.js) and the contact-decal scan
  // that follows it see a consistent scene.
  root.updateMatrixWorld(true);

  return { merged, removed, groups };
}
