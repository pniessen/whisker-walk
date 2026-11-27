// =============================================================================
// THE REEF, THE GALLEON'S HUNT ON A WALK (milestone R17): the torn map on the cabin floor, the three clues in order, the X on the sand and the Captain's Chest.
// The rules are world/reefwreck.js's (pure); this carries them out. She finds each step by standing near its place (no button), in order; a step out of order
// is simply not there yet. Nothing here can fail her: the hunt is always on its next step, a resumed walk starts where the save is, and nothing is carried, so
// nothing is lost however a walk ends.
//   * THE MAP lies on the cabin floor (a parchment with a red X); it is gone once taken. THE X shows on the sand once the third clue is in: a red X with a
//     small pennant, one merged mesh, still. THE CHEST (one more mesh) lies open at the X once dug up, on this walk and every later one.
//   * THE CHEST pays once ever (the step 'chest' is taken once): AWARDS.reefwreck paws and the pirate bandana (a neckerchief, worn at once if her neck is bare).
//     It gives no golden mouse. The map and the chest each count on their journal page (rfmap, rfcaptchest) the step they are found.
// Draws no random number and reads no clock; no PointLight; nothing animates, so reduced motion and the lower rungs change nothing.
// createReefHuntLife({ scene, THREE, progression, log, audio, say }) -> { update(dt, t, catPos), credit(ev), dispose(), state }
// =============================================================================
import { phrase } from '../clanphrases.js';
import * as W from './reefwreckplan.js';
import * as H from './reefwreck.js';
import './reefhuntwords.js';

const LINE = Object.freeze({ map: () => phrase('reef.hunt.map'), 0: () => phrase('reef.hunt.clue0'), 1: () => phrase('reef.hunt.clue1'), 2: () => phrase('reef.hunt.clue2') });
const PAGE = Object.freeze({ map: 'rfmap', chest: 'rfcaptchest' });
const RED = 0xb02a24;

// One mesh from several coloured boxes: each is { w, h, d, x, y, z, ry, rx, rz, hex } (the middle of the box, turned about y, then x, then z).
function boxesMesh(THREE, parts, name) {
  const pos = []; const nor = []; const col = [];
  for (const p of parts) {
    const g = new THREE.BoxGeometry(p.w, p.h, p.d).toNonIndexed();
    g.rotateY(p.ry ?? 0); g.rotateX(p.rx ?? 0); g.rotateZ(p.rz ?? 0); g.translate(p.x, p.y, p.z);
    const r = ((p.hex >> 16) & 255) / 255; const gr = ((p.hex >> 8) & 255) / 255; const b = (p.hex & 255) / 255;
    const a = g.attributes.position; const n = g.attributes.normal;
    for (let i = 0; i < a.count; i++) { pos.push(a.getX(i), a.getY(i), a.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); col.push(r, gr, b); }
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  const m = new THREE.Mesh(geo, mat);
  m.name = name;
  m.castShadow = false; m.receiveShadow = false;
  Object.assign(m.userData, { noMerge: true, noCast: true, noContactShadow: true });
  m.visible = false;
  return m;
}

export const mapParts = () => [
  { w: 0.52, h: 0.03, d: 0.38, x: 0, y: 0.02, z: 0, ry: 0.45, hex: 0xe8d9a8 },
  { w: 0.22, h: 0.012, d: 0.035, x: 0, y: 0.044, z: 0, ry: 0.45 + Math.PI / 4, hex: RED },
  { w: 0.22, h: 0.012, d: 0.035, x: 0, y: 0.044, z: 0, ry: 0.45 - Math.PI / 4, hex: RED },
];
export const markParts = () => [
  { w: 2.0, h: 0.06, d: 0.26, x: 0, y: 0.04, z: 0, ry: Math.PI / 4, hex: RED },
  { w: 2.0, h: 0.06, d: 0.26, x: 0, y: 0.04, z: 0, ry: -Math.PI / 4, hex: RED },
  { w: 0.08, h: 1.8, d: 0.08, x: 0.9, y: 0.9, z: 0.9, hex: 0xe8d9a8 },
  { w: 0.5, h: 0.32, d: 0.03, x: 1.15, y: 1.55, z: 0.9, hex: RED },
];
export const chestParts = () => [
  { w: 0.9, h: 0.46, d: 0.6, x: 0, y: 0.23, z: 0, hex: 0x8a5a2e },
  { w: 0.94, h: 0.1, d: 0.64, x: 0, y: 0.3, z: 0, hex: 0xe0b441 },
  { w: 0.9, h: 0.1, d: 0.6, x: 0, y: 0.7, z: -0.38, rx: -1.0, hex: 0x9a6a38 },
  { w: 0.12, h: 0.14, d: 0.04, x: 0, y: 0.45, z: 0.31, hex: 0xe0b441 },
  { w: 0.7, h: 0.1, d: 0.42, x: 0, y: 0.5, z: 0, hex: 0xe0b441 },
  { w: 1.5, h: 0.14, d: 1.1, x: 0, y: 0.04, z: 0, ry: 0.3, hex: 0xd7c08a },
];

export function createReefHuntLife({ scene, THREE, progression = null, log = null, audio = null, say = null }) {
  const at = (m, x, z) => { m.position.set(x, W.topY(x, z), z); scene.add(m); return m; };
  const mapMesh = at(boxesMesh(THREE, mapParts(), 'reef:torn-map'), W.MAP_SPOT.x, W.MAP_SPOT.z);
  const markMesh = at(boxesMesh(THREE, markParts(), 'reef:x-mark'), W.CHEST_SPOT.x, W.CHEST_SPOT.z);
  const chestMesh = at(boxesMesh(THREE, chestParts(), 'reef:captain-chest'), W.CHEST_SPOT.x, W.CHEST_SPOT.z);
  const meshes = [mapMesh, markMesh, chestMesh];
  const rec = () => progression?.state?.reef;
  let seen = -1;

  function show() {
    const r = rec();
    const w = H.normalize(r);
    if (w === seen) return;
    seen = w;
    mapMesh.visible = !H.hasMap(r);
    markMesh.visible = H.xShown(r);
    chestMesh.visible = H.chestFound(r);
  }
  function commit(next) {
    const pr = progression;
    if (!pr?.state) return;
    pr.state.reef = { ...(pr.state.reef ?? {}), wreck: next.wreck };
    pr.addPoints?.(0); // the save's own "persist now": it adds nothing
  }
  // The pirate bandana: owned for good, and worn if her neck is bare. Nothing else of hers is touched.
  function giveBandana() {
    const st = progression?.state;
    if (st?.unlocked?.accessories && !st.unlocked.accessories.includes(H.BANDANA_ID)) st.unlocked.accessories.push(H.BANDANA_ID);
    if (st?.equipped && st.equipped.neck == null) { st.equipped.neck = H.BANDANA_ID; return true; }
    return false;
  }
  function perform(ev, { remote = false } = {}) {
    const r = remote ? H.credit(rec(), ev) : H.apply(rec(), ev);
    if (!r.changed) return null;
    commit(r.reef);
    const page = PAGE[r.effect];
    if (page) { try { progression?.recordSighting?.(page); } catch { /* a stand-in save */ } }
    audio?.chime?.();
    if (r.effect === 'chest') {
      const worn = giveBandana();
      if (!remote && log) log.awardOnce('reefwreck', 'reef-wreck-chest', phrase('reef.hunt.chest')); // the paws, once ever (the step is taken once), with the line as the toast
      else say?.(phrase('reef.hunt.chest'));
      if (worn) say?.(phrase('reef.hunt.chest.on'));
    } else say?.(LINE[r.effect === 'map' ? 'map' : r.clue]());
    show();
    return r.effect;
  }
  show();
  return {
    get state() { return { wreck: H.normalize(rec()), goal: H.nextGoal(rec()) }; },
    meshes,
    update(dt, t, catPos) {
      if (catPos) {
        const ev = H.eventAt(rec(), catPos.x, catPos.z);
        if (ev) perform(ev);
      }
      show();
      void dt; void t;
    },
    credit: (ev) => perform(ev, { remote: true }),
    dispose() {
      for (const m of meshes) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
    },
  };
}
