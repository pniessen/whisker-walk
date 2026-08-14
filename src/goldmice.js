import * as THREE from 'three';
import { litMaterial } from './render/materials.js';

// Nine hidden golden mice, three per area, placed at parkour destinations
// using the perch coordinates that actually ship in src/world/*.js (see
// task-4.2-report.md for the chain math) rather than the v11 spec's
// original coordinates, which Task 4.2 moved. Per area: two mice sit on
// real perch chain steps (reachable only by climbing), one sits hidden at
// ground level among props, off the main paths.
export const GOLD_MICE = {
  neighborhood: [
    // top of the rooftop chain — "king of the roof" ridge perch
    { id: 'gm-neigh-1', x: -11.5, z: 15.5, y: 4.1 },
    // top of the billboard crate-stack chain — "billboard lookout"
    { id: 'gm-neigh-2', x: 7, z: -14, y: 3.3 },
    // hidden at ground level behind the cardboard box at (-18, 8)
    { id: 'gm-neigh-3', x: -18.5, z: 8.4, y: 0 },
  ],
  park: [
    // first step of the oak chain — the bench
    { id: 'gm-park-1', x: 3, z: 26, y: 0.58 },
    // top of the oak chain — "oak branch lookout"
    { id: 'gm-park-2', x: 4.5, z: 27.3, y: 2.1 },
    // hidden at ground level among the bushes at (-35, -20)
    { id: 'gm-park-3', x: -35.3, z: -20.4, y: 0 },
  ],
  seaside: [
    // first step of the dune chain — "overlook boulder"
    { id: 'gm-sea-1', x: -28, z: 18, y: 0.72 },
    // top of the dune chain — "dune ledge"
    { id: 'gm-sea-2', x: -29, z: 19, y: 1.9 },
    // hidden at ground level among the rocks at (-32, -10)
    { id: 'gm-sea-3', x: -32.3, z: -10.4, y: 0 },
  ],
};

export const KNOWN_GOLD = new Set(Object.values(GOLD_MICE).flat().map((m) => m.id));
export const GOLD_TOTAL = KNOWN_GOLD.size; // 9

function buildMouse() {
  const g = new THREE.Group();
  const mat = litMaterial(0xf2c14e, { emissive: 0x9a7a20 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), mat);
  g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 6), mat);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, -0.01, 0.14);
  g.add(nose);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.22), mat);
  tail.position.set(0, -0.02, -0.17);
  g.add(tail);
  return g;
}

// createGoldMice(scene, areaId, foundIds) — spawns every GOLD_MICE[areaId]
// mouse whose id isn't already in foundIds (a Set, e.g.
// new Set(progression.state.golden)). An unknown areaId (or one with no
// entry) spawns nothing rather than throwing, so a den/future area is safe
// to call this with before it gets its own golden mice.
export function createGoldMice(scene, areaId, foundIds) {
  const list = [];
  for (const m of GOLD_MICE[areaId] ?? []) {
    if (foundIds.has(m.id)) continue;
    const group = buildMouse();
    group.position.set(m.x, m.y, m.z);
    scene.add(group);
    list.push({ id: m.id, x: m.x, y: m.y, z: m.z, group, phase: Math.random() * Math.PI * 2 });
  }

  function remove(id) {
    const idx = list.findIndex((mo) => mo.id === id);
    if (idx === -1) return;
    scene.remove(list[idx].group);
    list.splice(idx, 1);
  }

  return {
    list,
    update(t) {
      for (const mo of list) {
        mo.group.position.y = mo.y + Math.sin(t * 2 + mo.phase) * 0.05;
      }
    },
    // checkFind(catPos, perchY) → the mouse within 1.0 horizontally and
    // 0.9 vertically of (catPos, perchY), or null. perchY is compared
    // against the mouse's resting y (not its bobbing mesh y) so the gate
    // stays stable frame to frame; ground mice sit at y 0, which matches
    // player.perchY's default (grounded, unperched) value.
    checkFind(catPos, perchY) {
      for (const mo of list) {
        const h = Math.hypot(mo.x - catPos.x, mo.z - catPos.z);
        if (h < 1.0 && Math.abs(perchY - mo.y) < 0.9) return mo;
      }
      return null;
    },
    remove,
    dispose() {
      for (const mo of [...list]) remove(mo.id);
    },
  };
}
