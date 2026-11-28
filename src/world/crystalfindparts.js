// The Crystal Cave's finds, drawn (milestone C3): small markers for the Echo Wall (a standing slab with a pale ring), the Crystal Garden (a handful of tiny
// crystals) and the Gold Vein (golden streaks on a low rock), in ONE merged vertex-coloured mesh that casts nothing; and the one shared glow the life shows
// for a moment when a find is made. The Rose Crystal is the great crystal itself; the pool and the Heart are dressed in milestone C5. No rng, no clock.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { crystalY } from './crystalplan.js';
import { CRYSTAL_FIND_MARKS } from './crystalfindsplan.js';

const paint = (geo, hex) => {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex);
  const col = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < col.length; i += 3) { col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
};
const at = (geo, x, z, dy = 0, yaw = 0) => geo.rotateY(yaw).translate(x, crystalY(x, z) + dy, z);

export function drawFindMarks() {
  const geos = [];
  { // the Echo Wall: a tall slab of rock with a pale ring set in it
    const { x, z } = CRYSTAL_FIND_MARKS.echo;
    geos.push(paint(at(new THREE.BoxGeometry(1.7, 1.5, 0.45), x - 1.4, z - 0.4, 0.75, 0.5), 0x4a3c58)); // (pass 8: a deep plum, a smaller deep-plum slab; it was a big pale grey one that hid the camp)
    geos.push(paint(at(new THREE.TorusGeometry(0.36, 0.06, 5, 12).rotateY(0.5), x - 1.1, z - 0.15, 0.9, 0), 0xb89ad0));
  }
  { // the Crystal Garden: tiny crystals of every hue, sprouting like flowers
    const { x, z } = CRYSTAL_FIND_MARKS.garden;
    [[0, 0, 0xff6fa8, 0.5], [0.5, 0.3, 0x62b8ff, 0.4], [-0.45, 0.35, 0xffc65a, 0.45], [0.2, -0.5, 0xffa8f0, 0.38], [-0.3, -0.35, 0x62b8ff, 0.33]]
      .forEach(([dx, dz, hex, h], i) => geos.push(paint(at(new THREE.ConeGeometry(0.09, h, 5), x + dx, z + dz, h / 2, i), hex)));
  }
  { // the Gold Vein: a low rock with three golden streaks
    const { x, z } = CRYSTAL_FIND_MARKS.gold;
    geos.push(paint(at(new THREE.DodecahedronGeometry(0.9, 0).scale(1.3, 0.8, 0.9), x - 1.2, z - 0.9, 0.5, 0.3), 0x7a6a82));
    [[-0.3, 0.2], [0, 0.35], [0.3, 0.1]].forEach(([dx, dy]) => geos.push(paint(at(new THREE.BoxGeometry(0.1, 0.7, 0.08), x - 1.2 + dx, z - 0.2, 0.5 + dy, 0.3), 0xffc65a)));
  }
  const mesh = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshBasicMaterial({ vertexColors: true }));
  mesh.name = 'crystal:findmarks';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  Object.assign(mesh.userData, { noCast: true, noContactShadow: true, noMerge: true });
  return mesh;
}

// The shared glow of a find: a warm ring of light, moved to wherever a find is made and shown for a moment.
export function createFindGlow() {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffe4f4, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, forceSinglePass: true }),
  );
  mesh.name = 'crystal:findGlow';
  mesh.visible = false;
  mesh.castShadow = false;
  Object.assign(mesh.userData, { noCast: true, noContactShadow: true, noMerge: true });
  return mesh;
}
