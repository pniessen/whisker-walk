// The Reef's finds, drawn (milestone R3): the three live discoveries' markers (the Pearl Oyster, the Kelp Garden seahorse, the Treasure Chest) in ONE merged
// vertex-coloured mesh, the two golden mice's bubble columns in ONE more (a stack of small translucent bubbles), and the one shared glow the life shows for
// a moment when a find is made. Draws on no rng and reads no clock. The Boat, Anchor and Cave are drawn in milestone R8.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as K from './reefparts.js';
import { REEF_FIND_MARKS, BUBBLE_COLUMNS } from './reeffindsplan.js';

const SHELL = 0xe9b7c4;
const SHELL_DARK = 0xc98ba0;
const PEARL = 0xfaf6ee;
const WOOD = 0x8a5a32;
const WOOD_DARK = 0x6a4224;
const GOLD = 0xf2c14e;
const SEAHORSE = 0xf2a65a;

export const CHEST_YAW = 0.35;
export function drawFindMarks() {
  const kit = K.createKit('reef-find');
  const M = K.reefMaterials();
  const put = (geo, hex) => kit.put('paint', M.paint, K.paint(geo, hex), { noCast: true });
  const sph = (r, ws = 8, hs = 6) => new THREE.SphereGeometry(r, ws, hs);

  // the Pearl Oyster: two scalloped halves, the upper one tipped open, and the pearl between them
  {
    const { x, z } = REEF_FIND_MARKS.oyster;
    put(K.at(new THREE.SphereGeometry(0.5, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.45, 0.85), x, z, 0.02), SHELL_DARK);
    put(K.at(new THREE.SphereGeometry(0.5, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.4, 0.85).rotateX(-0.9), x, z - 0.18, 0.3), SHELL);
    put(K.at(sph(0.16), x, z, 0.2), PEARL);
  }
  // the seahorse: a curled body of three beads, a head and a snout, a fin, held upright in the kelp
  {
    const { x, z } = REEF_FIND_MARKS.seahorse;
    for (const [dy, r, dx] of [[0.25, 0.12, 0.05], [0.5, 0.13, 0], [0.75, 0.11, -0.03], [1.0, 0.1, -0.06]]) put(K.at(sph(r), x + dx, z, dy), SEAHORSE);
    put(K.at(sph(0.12), x - 0.1, z, 1.2), SEAHORSE);
    put(K.at(new THREE.CylinderGeometry(0.03, 0.05, 0.2, 5).rotateZ(Math.PI / 2), x - 0.26, z, 1.18), SEAHORSE);
    put(K.at(new THREE.ConeGeometry(0.09, 0.2, 4).rotateZ(-Math.PI / 2), x + 0.2, z, 0.6), 0xf8d09a);
  }
  // the Treasure Chest: a wooden box, two gold bands and a gold clasp (the lid is the life's, so it can open)
  {
    const { x, z } = REEF_FIND_MARKS.chest;
    put(K.at(new THREE.BoxGeometry(0.9, 0.42, 0.55), x, z, 0.21, 0.35), WOOD);
    // (the rounded lid is the chest life's own hinged mesh: world/reefchestlive.js lifts it when she opens the chest)
    for (const dx of [-0.28, 0.28]) put(K.at(new THREE.BoxGeometry(0.07, 0.48, 0.58), x + dx * Math.cos(0.35), z - dx * Math.sin(0.35), 0.22, 0.35), GOLD);
    put(K.at(new THREE.BoxGeometry(0.1, 0.12, 0.04), x + Math.sin(0.35) * 0.29, z + Math.cos(0.35) * 0.29, 0.38, 0.35), GOLD);
  }
  return kit.meshes();
}

// The two bubble columns: small bubbles, a little wider near the top, in one translucent mesh. Static (the life never moves it).
export function drawBubbleColumns() {
  const geos = [];
  for (const col of BUBBLE_COLUMNS) {
    for (let i = 0; i < col.n; i++) {
      const t = i / (col.n - 1);
      const r = 0.06 + 0.07 * t * ((i * 7) % 3 === 0 ? 0.6 : 1);
      const dx = Math.sin(i * 2.1) * 0.14;
      const dz = Math.cos(i * 1.7) * 0.14;
      geos.push(K.paint(K.at(new THREE.SphereGeometry(r, 6, 4), col.x + dx, col.z + dz, 0.2 + t * (col.top - 0.2)), 0xd8f6ff));
    }
  }
  const mesh = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.45, depthWrite: false }));
  mesh.name = 'reef:columns';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  Object.assign(mesh.userData, { noCast: true, noContactShadow: true, noMerge: true });
  return mesh;
}

// The shared glow of a find: a warm ring of light, moved to wherever a find is made and shown for a moment.
export function createFindGlow() {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xfff1c4, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, forceSinglePass: true }),
  );
  mesh.name = 'reef:findGlow';
  mesh.visible = false;
  mesh.castShadow = false;
  Object.assign(mesh.userData, { noCast: true, noContactShadow: true, noMerge: true });
  return mesh;
}
