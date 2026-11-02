// Waymark posts and the town's footpath: the Clan Edition's border dressing.
//
// WHY THIS IS CALLED FROM walk.js AND NOT FROM THE WORLD FILES (R13). The
// world builders read no edition: what co-walkers share (the clan's frozen map
// copy, the scent, the points of interest, strays, ghosts, the race) must never
// depend on how the game is being played. The posts and the footpath are local
// scenery, drawn and collided with only on a Clan Edition screen, so walk.js
// adds them right after the area build (they merge and get contact shadows like
// any static prop) and pushes the returned colliders onto the live list that
// only my own cat, my grass mask and my landings read.
//
// Look (R7): a stout weathered post 1.15 m tall, an arrow-shaped board at
// 0.95 m pointing out over the border, a band of cloth under the board in the
// neighbour's map colour, and two small stones at the foot. No words.
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { litMaterial, surfaceProps } from '../render/materials.js';
import { path } from './builder.js';
import { postsFor, POST_R, TOWN_FOOTPATH, FOOTPATH_W } from '../borderposts.js';
import { LAND } from '../territories.js';

const FACING = {
  west: [-1, 0],
  east: [1, 0],
  north: [0, -1],
  south: [0, 1],
};

// The home-screen map's key for a neighbour: the Neighborhood is 'town' there.
export const clothKey = (to) => (to === 'neighborhood' ? 'town' : to);

function buildPost(p) {
  const g = new THREE.Group();
  g.name = 'borderPost';
  g.userData.postId = p.id;
  g.position.set(p.x, 0, p.z);

  const [dx, dz] = FACING[p.faces] ?? FACING.north;
  const wood = litMaterial(0x8a6a48, surfaceProps('bark'));
  const stone = litMaterial(0x8e8c88, surfaceProps('cobble'));
  const cloth = litMaterial(LAND[clothKey(p.to)] ?? LAND.gorge);

  const mesh = (geo, mat, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    g.add(m);
    return m;
  };

  mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.15, 7), wood, 0, 0.575, 0);
  // The board runs along the facing direction; the tip's apex points the same way.
  mesh(new THREE.BoxGeometry(0.5, 0.14, 0.04), wood, dx * 0.22, 0.95, dz * 0.22, Math.atan2(-dz, dx));
  // The tip is a flat triangle in the board's own vertical plane (same 0.04 m
  // thickness, about 1.6x its height), so board + tip read as a signpost arrow.
  const tip = new THREE.Shape();
  tip.moveTo(0, -0.112);
  tip.lineTo(0, 0.112);
  tip.lineTo(0.2, 0);
  tip.closePath();
  // Indexed like the post's other parts, so the static merge can fold it in.
  const tipGeo = mergeVertices(new THREE.ExtrudeGeometry(tip, { depth: 0.04, bevelEnabled: false }));
  tipGeo.translate(0, 0, -0.02);
  mesh(tipGeo, wood, dx * 0.47, 0.95, dz * 0.47, Math.atan2(-dz, dx)).name = 'arrowTip';
  mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.12, 8), cloth, 0, 0.78, 0);
  // Two small stones at the foot, to either side of the facing direction.
  mesh(new THREE.DodecahedronGeometry(0.12, 0), stone, -dz * 0.16 - dx * 0.05, 0.08, dx * 0.16 - dz * 0.05);
  mesh(new THREE.DodecahedronGeometry(0.12, 0), stone, dz * 0.14 + dx * 0.1, 0.08, -dx * 0.14 + dz * 0.1);
  return g;
}

// Adds the area's posts (and, for the Neighborhood, the footpath) to `scene`.
// Returns the posts' colliders for walk.js to push; never touches area.colliders.
export function addBorderDressing(scene, areaId) {
  const list = postsFor(areaId);
  if (list.length === 0) return { colliders: [] };
  if (areaId === 'neighborhood') {
    // The roads' own gravel at a narrower width; a top-level child so the grass
    // mask and the corner map (flatFootprints) see it.
    for (const s of TOWN_FOOTPATH) scene.add(path(...s, FOOTPATH_W, { surface: 'gravel' }));
  }
  const colliders = [];
  for (const p of list) {
    scene.add(buildPost(p));
    colliders.push({ x: p.x, z: p.z, r: POST_R });
  }
  return { colliders };
}
