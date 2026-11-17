import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fingerprintCat, buildFor, goldenKeys, hagridKeys } from './helpers/catfingerprint.js';

// Pins today's cat model. Regenerate deliberately: UPDATE_GOLDEN=1 npx vitest run test/catgolden.test.js
// hagrid-golden.json is write-once. The chicken changed once, on purpose, in the
// 2026-11-01 body refinement (regenerated 2026-11-02 with the owner's
// sign-off); it is write-once again from here (written only if missing).
// 2026-11-02, polish 1a Task 5 (the cat from behind): catgolden.json regenerated
// once for shorter, forward-swept, fainter whiskers; darker ear backs (vertex
// colour); the pupil and eye shine tucked onto the eye; an evenly tapered tail
// with a rounded tip, dark over its last third only; the "M" stripes run on
// over the crown (headStripes cats). Hagrid is unchanged (his golden still passes).
// 2026-11-02, polish-catlooks: both goldens regenerated once: the underside's vertex colours (chest and belly ease into the coat; every cat key's underside line, colour only), the glasses rebuilt as thick frames, tinted lens and glint (dressed keys' three glasses lines, +180 tris), Hagrid's body with the layered feather wing (every hagrid:* key's body line, -16 tris, box 1.6 cm narrower each side). hagrid-golden.json was rewritten once on purpose (its wing and glasses) and is write-once again from here. Sit, stalk, walking-tail and scar changes have no golden key (cat goldens are unposed and undressed of scars; Hagrid's poses moved only by the wing).
// 2026-11-02, polish-sit: catgolden.json regenerated once: the chest bib re-aimed for the upright sit (coat.js UNDER_FRONT.chest, UNDER_BLEND), so all 30 cat keys' underside line moved in its vertex colours only (no geometry, tris, boxes or other lines). Hagrid unchanged.
// 2026-11-03, polish-accessories Task 5: catgolden.json regenerated once for the accessories rebuild: the 10 *:dressed keys (tophat, backpack, scarf, collar and bell re-modelled and re-seated) plus digit:full and digit:simple (his built-in tag collar re-seated); no other key moved. hagrid-golden.json unchanged.
// 2026-11-03, polish-tails: catgolden.json regenerated once for the plume tails (torso.js PLUME): the 6 persian:* and mainecoon:* keys (tail links fuller, tris and boxes with them); no other key moved. The stalk carriage has no golden key. hagrid-golden.json unchanged.
// 2026-11-11, cat-beauty Tier A (owner's sign-off by picture): catgolden.json regenerated once. Every key: the torso, underside and limb vertex colours (A4 baked fur shade, colour only); every full and dressed key: the inner ears re-parented onto their ears (A6, same place at rest), so the head's later children re-index. tabby full/dressed: the mascara and cheek bar in the M mesh and ringed tail links 1-2 (+216 tris), brick nose; siamese: the vertex-painted point mask on the skull, point-coloured muzzle and cheeks, seal nose, the tail point colour all along (-48 tris); calico: the bigger patches. No key's meshes or box moved. hagrid-golden.json unchanged.
// 2026-11-15, cat-beauty Tier B (owner's approval after the contact sheets): catgolden.json regenerated once for the four shape changes: B1 thin cupped ears (every key's ears and inner ears), B2 the two-pad muzzle and shield nose (full and dressed keys), B3 kitten proportions (no cat key: the kitten is built in kitten.js), B4 the slim Siamese and the small-eared Persian (their keys' boxes and limbs). hagrid-golden.json unchanged.
// 2026-11-15, cat realism round 1 (owner's approval from the before/after sheets): catgolden.json regenerated once. Every key: the rump drawn out round the tail root and over the thigh tops (B2, torso shape), the head 8% smaller with everything worn on it (B3, PROPORTION.head 0.92); full and dressed keys: the neck skin in the underside's mesh (B1, +96 tris). A4's blended normals and the fur grain (B8, shader only) are not in any fingerprint. hagrid-golden.json unchanged.
// 2026-11-15, cat realism round 3, the face (owner's approval from the option sheets; picks: soft eyes, shell ears, today's profile): catgolden.json regenerated once. Full and dressed keys: the finer skull with the snout in it, finer pads, the leather-and-mouth nose, lens eyes with pupil and catchlight on them, one whisker line set for six (the head's later children move up), +~990 tris. Every key, simple too: the shell ears in place of the cones, and no inner-ear meshes on full builds (2 meshes fewer). siamese keys: the lighter nose. hagrid-golden.json unchanged.
// 2026-11-15, cat realism round 2, fur tufts (owner's approval from the before/after sheets), merged onto round 3's face: catgolden.json regenerated once. Every key: fur written into the torso's, the underside's, the skull's and the tail links' own meshes (triangle counts and those meshes' lines; no mesh added). Fluffy cats' ruff: five locks for the five points. Hagrid is unchanged.
// 2026-11-15, cat pose and coat fixes (owner's approval from the before/after sheets): catgolden.json regenerated once. The six non-family presets, all three builds: vertex colour sums only (the darker back line, the paler underside, barred legs and necklace on striped coats, the rump colour at the tail root); positions, meshes and triangles unchanged. Family cats' keys and hagrid-golden.json unchanged.
// 2026-11-16, cat realism round B11 (owner's approval from the before/after sheets): catgolden.json regenerated once. Every key: the underside mesh (the chest's rim drawn onto the torso). Some simple keys: the tail root link's colours (rump colour on crowd cats). tabby full/dressed and mainecoon: tail-fur lines re-laid for the loaf's tail curve. Meshes and triangles unchanged in every key. hagrid-golden.json unchanged.
// 2026-11-17, cat leftovers (owner's approval from the before/after sheets): catgolden.json regenerated once. Only siamese, zeetoo, robbie, d2 and digit (full, simple, dressed) move: the first tail link now leaves the rump in the rump's painted colour. Meshes and triangles unchanged in every key. hagrid-golden.json unchanged.
const GOLDEN_FILE =new URL('./fixtures/catgolden.json', import.meta.url);
const HAGRID_FILE = new URL('./fixtures/hagrid-golden.json', import.meta.url);

const collect = (keys) => Object.fromEntries(keys.map((k) => [k, fingerprintCat(buildFor(k))]));
if (process.env.UPDATE_GOLDEN) {
  fs.writeFileSync(GOLDEN_FILE, JSON.stringify(collect(goldenKeys())));
  if (!fs.existsSync(HAGRID_FILE)) fs.writeFileSync(HAGRID_FILE, JSON.stringify(collect(hagridKeys())));
}
const GOLDEN = JSON.parse(fs.readFileSync(GOLDEN_FILE, 'utf8'));
const HAGRID = JSON.parse(fs.readFileSync(HAGRID_FILE, 'utf8'));

describe('cat golden fingerprints', () => {
  it.each(goldenKeys())('%s matches its golden fingerprint', (key) => {
    expect(fingerprintCat(buildFor(key))).toEqual(GOLDEN[key]);
  });
  it.each(hagridKeys())('%s matches its golden (write-once since the 2026-11-01 body refinement; built and animated)', (key) => {
    expect(fingerprintCat(buildFor(key))).toEqual(HAGRID[key]);
  });
  it('every key builds byte-identically twice', () => {
    for (const key of [...goldenKeys(), ...hagridKeys()]) {
      expect(fingerprintCat(buildFor(key))).toEqual(fingerprintCat(buildFor(key)));
    }
  });
});
