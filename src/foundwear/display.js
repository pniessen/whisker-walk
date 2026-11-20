// Found outfits: how a find looks where it lies (src/foundwear/live.js puts
// it there). The outfit itself, tipped by its spot's `look`, or the coin
// pouch when everything in the place is already hers; and over it a small
// warm-gold twinkle, the only bright part.
//
// It must never read as anything else lying about the walk. The found yarn
// ball (toy.js) is matte cornflower blue and never glows; the treasures
// (walk.js) are glowing pink spheres; a golden mouse is a gold mouse. A find
// is a small brown or tan thing with no glow of its own, under an upright
// four-point star in flat warm gold, which none of those has.
//
// Every mesh here casts no shadow (a tiny thing on the ground gains nothing
// from one, and it would cost a draw). Nothing is random or reads the clock.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildHat, lyingClip } from '../cat/hats.js';
import { buildCat } from '../cat/model.js';
import { buildFoldedJumper } from '../cat/foundbody.js';
import { STRAP_GREY } from '../cat/backitems.js';
import { animateCat } from '../cat/animator.js';
import { litMaterial } from '../render/materials.js';
import { foundRecord } from './index.js';

// How a find sits, by its spot's `look` (spots/park.js header): `tilt` is the
// display's rotation.z in radians, `lift` metres added to its height. On a
// post it sits upright; on a branch it hangs tipped; in grass it lies tipped
// and sunk 2 cm into the blades; afloat or on a perch, a little tipped.
export const LOOK_POSE = Object.freeze({
  post: Object.freeze({ tilt: 0, lift: 0 }),
  branch: Object.freeze({ tilt: 0.45, lift: 0 }),
  grass: Object.freeze({ tilt: 0.3, lift: -0.02 }),
  water: Object.freeze({ tilt: 0.15, lift: 0 }),
  perch: Object.freeze({ tilt: 0.1, lift: 0 }),
});

// isPieceOf(obj, id): true when `obj` is a mesh of outfit `id` as a cat
// wears it: tagged by model.js's found-outfit hooks (userData.foundWear), a
// hat (userData.hat, hats.js) or a pack (userData.backItem, backitems.js).
export function isPieceOf(obj, id) {
  if (!obj.isMesh || typeof id !== 'string') return false;
  const u = obj.userData;
  return u.foundWear === id || u.hat === id || u.backItem === id;
}

const BARE = Object.freeze({ collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null });

// wornPieces(id) -> THREE.Group named 'wear:<id>' holding the outfit's own
// meshes, as a simple tabby wears it, standing (so a cape's clasp and bands
// are laid), each where it sat on her; null for an id that is no record, or
// one she wears nothing of. Boots are the front pair only. The rest of the
// cat is dropped: it was never drawn.
export function wornPieces(id) {
  const rec = foundRecord(id);
  if (!rec) return null;
  const cat = buildCat('tabby', { ...BARE, [rec.slot]: id }, { simple: true });
  animateCat(cat, 'follow', 0, 0, false);
  cat.updateMatrixWorld(true);
  const roots = rec.slot === 'feet' ? cat.userData.parts.legs.slice(0, 2) : [cat];
  const meshes = [];
  for (const root of roots) root.traverse((o) => { if (isPieceOf(o, id)) meshes.push(o); });
  if (meshes.length === 0) return null;
  const group = new THREE.Group();
  group.name = `wear:${id}`;
  for (const m of meshes) group.attach(m);
  return group;
}

// The builder for each slot's outfits on the ground: (id) -> THREE.Object3D
// (one mesh or a group of them, built where the cat wears it), or null for an
// id it does not know (then the find shows as the pouch, and
// test/foundlive.test.js fails for that record). A hat is built on its own;
// every other slot is the pieces the cat wears (wornPieces).
export const DISPLAY_BY_SLOT = Object.freeze({
  head: (id) => buildHat(id, { simple: true }),
  face: wornPieces,
  neck: wornPieces,
  collar: wornPieces,
  body: wornPieces,
  back: wornPieces,
  feet: wornPieces,
});

// One outfit's own ground look, in place of its slot's (its id: (id) ->
// THREE.Object3D): for a thing that lies on the ground otherwise than it is
// worn (a jumper folded). buildFindDisplay looks here first.
// The Hay-bale Backpack lying on the grass: the bale and its twine, without
// the two straps, which worn arch over a body that is not there and would
// hold the bale up in the air. The pack's one merged mesh is cut back to the
// triangles that are not strap-coloured (STRAP_GREY, backitems.js).
export function buildLyingHayBale(id = 'haybalepack') {
  const group = wornPieces(id);
  if (!group) return null;
  const strap = new THREE.Color(STRAP_GREY);
  for (const m of group.children) {
    if (!m.isMesh) continue;
    const src = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
    const names = Object.keys(src.attributes);
    const col = src.attributes.color;
    const keep = [];
    for (let t = 0; t < col.count; t += 3) {
      const isStrap = [0, 1, 2].every((k) => Math.abs(col.getX(t + k) - strap.r) + Math.abs(col.getY(t + k) - strap.g) + Math.abs(col.getZ(t + k) - strap.b) < 0.02);
      if (!isStrap) keep.push(t);
    }
    const geo = new THREE.BufferGeometry();
    for (const n of names) {
      const a = src.attributes[n], out = new Float32Array(keep.length * 3 * a.itemSize);
      keep.forEach((t, i) => { for (let k = 0; k < 3; k++) for (let c = 0; c < a.itemSize; c++) out[(i * 3 + k) * a.itemSize + c] = a.array[(t + k) * a.itemSize + c]; });
      geo.setAttribute(n, new THREE.BufferAttribute(out, a.itemSize));
    }
    m.geometry = geo;
  }
  return group;
}

export const DISPLAY_BY_ID = Object.freeze({
  fishermansjumper: buildFoldedJumper,
  haybalepack: buildLyingHayBale,
  // the two clips lie face up, as dropped (a hat stands on its brim)
  starfishclip: lyingClip,
  featherplume: lyingClip,
});

function noShadow(obj) {
  obj.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return obj;
}

// seatDisplay(obj) -> obj on the ground. An outfit is built where the cat
// wears it: a hat round the head's centre, a collar round the neck, a cape on
// the back, often well off its own origin. On the ground the middle of its
// footprint goes over its origin and its lowest point to it, so it rests on
// the spot and tips and turns (live.js sets rotation.z and .y) about its own
// middle, never swinging round some far-off point.
//   * one mesh at its own origin, unturned and unscaled: its geometry (this
//     find's own: the builders make a fresh one each call) is moved, and the
//     mesh itself is returned;
//   * anything else (a group, a mesh with children, a mesh placed, turned or
//     scaled where the cat wears it): it is moved inside a new holder group
//     named as it is, and the holder is returned, so the turn and tilt go on
//     the holder and its own placing stays inside.
const atOrigin = (o) => o.position.lengthSq() === 0 && o.rotation.x === 0 && o.rotation.y === 0 && o.rotation.z === 0
  && o.scale.x === 1 && o.scale.y === 1 && o.scale.z === 1;
export function seatDisplay(obj) {
  const box = new THREE.Box3();
  if (obj.isMesh && obj.children.length === 0 && atOrigin(obj)) {
    obj.geometry.computeBoundingBox();
    box.copy(obj.geometry.boundingBox);
    obj.geometry.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    obj.geometry.computeBoundingBox();
    return obj;
  }
  obj.updateMatrixWorld(true);
  box.setFromObject(obj);
  if (box.isEmpty()) return obj;
  obj.position.x -= (box.min.x + box.max.x) / 2;
  obj.position.y -= box.min.y;
  obj.position.z -= (box.min.z + box.max.z) / 2;
  const holder = new THREE.Group();
  holder.name = obj.name;
  holder.add(obj);
  return holder;
}

// buildFindDisplay(item) -> the outfit's own look for a wear item with a
// builder (its own in DISPLAY_BY_ID, else its slot's), seated (seatDisplay);
// the pouch otherwise (the pouch itself, an unknown id, no builder).
export function buildFindDisplay(item) {
  const rec = item?.kind === 'wear' ? foundRecord(item.id) : null;
  const make = !rec ? null
    : Object.hasOwn(DISPLAY_BY_ID, rec.id) ? DISPLAY_BY_ID[rec.id]
      : Object.hasOwn(DISPLAY_BY_SLOT, rec.slot) ? DISPLAY_BY_SLOT[rec.slot] : null;
  const obj = make ? make(rec.id) : null;
  return noShadow(obj ? seatDisplay(obj) : buildPouch());
}

const POUCH_CLOTH = 0xc9a46a, POUCH_TIE = 0x8a5a2b, POUCH_COIN = 0xf2c14e;

function coloured(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// buildPouch() -> one vertex-coloured mesh, 152 triangles: a squashed cloth
// bag about 14 cm across resting on the ground (its base 2 mm in), its neck
// gathered by a dark tie with the cloth flaring above it, and a gold paw-coin
// peeping out of the mouth, standing up and tipped.
export function buildPouch() {
  const bag = new THREE.SphereGeometry(0.07, 8, 6); // 80
  bag.scale(1, 0.75, 1);
  bag.translate(0, 0.05, 0);
  const tie = new THREE.CylinderGeometry(0.021, 0.021, 0.012, 8, 1, true); // 16
  tie.translate(0, 0.106, 0);
  const tuft = new THREE.CylinderGeometry(0.034, 0.018, 0.03, 8, 1, true); // 16
  tuft.translate(0, 0.125, 0);
  const coin = new THREE.CylinderGeometry(0.024, 0.024, 0.005, 10); // 40
  coin.rotateX(Math.PI / 2); // its face toward +z: standing up
  coin.rotateZ(-0.35);
  coin.translate(0.014, 0.142, 0.004);
  const geo = mergeGeometries([
    coloured(bag, POUCH_CLOTH), coloured(tie, POUCH_TIE), coloured(tuft, POUCH_CLOTH), coloured(coin, POUCH_COIN),
  ]);
  const mesh = new THREE.Mesh(geo, litMaterial(0xffffff, { vertexColors: true }));
  mesh.name = 'find:pouch';
  mesh.castShadow = false;
  return mesh;
}

// The twinkle's star: long points TWINKLE_R out, the waist TWINKLE_WAIST.
const TWINKLE_R = 0.16, TWINKLE_WAIST = 0.04;

// The twinkle's colour: a warm gold, deeper than the old pale one so it
// stands out against a bright sky or sunlit grass (additive pale gold all but
// vanished there).
export const TWINKLE_GOLD = 0xffb53d;

// buildTwinkle() -> a flat four-point star in the z = 0 plane, facing +z
// (live.js turns it to the camera), 8 triangles round its centre. Ordinary
// (normal) blending in warm gold, so it shows on a light sky as well as a dark
// wood. It writes no depth, so it never cuts a hole in what is behind it, but
// it is depth-tested: a wall or a trunk in front still hides it (it is a
// glint in the world, not a marker drawn over everything).
export function buildTwinkle() {
  const pos = [0, 0, 0];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 2; // a point straight up first
    const r = k % 2 ? TWINKLE_WAIST : TWINKLE_R;
    pos.push(Math.cos(a) * r, Math.sin(a) * r, 0);
  }
  const index = [];
  for (let k = 0; k < 8; k++) index.push(0, 1 + k, 1 + ((k + 1) % 8));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(index);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: TWINKLE_GOLD, transparent: true, depthWrite: false, depthTest: true, blending: THREE.NormalBlending,
  }));
  mesh.name = 'find:twinkle';
  mesh.castShadow = false;
  return mesh;
}
