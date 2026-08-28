import * as THREE from 'three';
import { litMaterial } from './render/materials.js';

// Twelve hidden golden mice, three per area, placed at parkour destinations
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
  // v18 Task 2.6 — The Old Docks. Same discipline the note at the top of this
  // file records: these three were placed AFTER src/world/docks.js's perch
  // array existed, by reading the shipped coordinates off it, not authored
  // from a sketch and fixed up later. Every number below appears verbatim in
  // that file's `perches`, and test/climbing.test.js BFSes the real array to
  // prove the hop counts.
  //
  // None of the three is in or across the canal: the Docks stays fully
  // playable WITHOUT Sea Legs (see docks.js's header). Sea Legs shipped in the
  // v19 collider wave, but the invariant is unchanged and still load-bearing —
  // the ability is a shortcut, never a key, so no golden mouse may sit behind
  // water.
  docks: [
    // top of the warehouse roof chain — "the high roof tank", y 6.2, the
    // highest standable point in the game and five hops from the ground
    // (crate -> crate top -> fire-escape landing -> parapet -> tank).
    { id: 'gm-docks-1', x: 18.6, z: 13.6, y: 6.2 },
    // top of the dock crane chain — "crane cab", four hops
    // (crate -> container -> crane deck -> cab roof).
    { id: 'gm-docks-2', x: -17.0, z: -13.0, y: 5.4 },
    // hidden at ground level in the dark alley between the two west
    // warehouses, among the barrels and the crate at (-15.6, 16.6). Nothing
    // there carries a collider, so the cat can walk right up to it.
    { id: 'gm-docks-3', x: -16.4, z: 17.6, y: 0 },
  ],
};

export const KNOWN_GOLD = new Set(Object.values(GOLD_MICE).flat().map((m) => m.id));
export const GOLD_TOTAL = KNOWN_GOLD.size; // 12 (four areas x three)

// Returns { group, material } rather than just the group: all 3 child
// meshes share this single litMaterial instance, so disposeMouse below
// needs a direct handle on it (not a traverse-and-guess) to dispose it
// exactly once per mouse, matching the fx.js/skylife.js dispose pattern
// instead of leaking it on removal.
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
  return { group: g, material: mat };
}

// disposeMouse(mo) — disposes every child mesh's own geometry (the body
// sphere, nose cone, and tail box are each unique) plus the one shared
// material, exactly once. Called only after the group has already been
// removed from the scene (both by remove() below and, at end-of-walk, by
// endWalk's own scene-wide traversal running before session.goldMice.dispose()),
// so nothing here risks a double-dispose of a still-rendered mesh.
function disposeMouse(mo) {
  for (const child of mo.group.children) {
    child.geometry?.dispose();
  }
  mo.material.dispose();
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
    const { group, material } = buildMouse();
    group.position.set(m.x, m.y, m.z);
    scene.add(group);
    list.push({ id: m.id, x: m.x, y: m.y, z: m.z, group, material, phase: Math.random() * Math.PI * 2 });
  }

  // remove(id) — despawns one mouse: pulls it out of the scene, disposes
  // its geometry/material via disposeMouse (the single shared helper —
  // dispose() below routes through this same function per-mouse rather
  // than duplicating the cleanup), then drops it from list.
  function remove(id) {
    const idx = list.findIndex((mo) => mo.id === id);
    if (idx === -1) return;
    scene.remove(list[idx].group);
    disposeMouse(list[idx]);
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
    // v18 Whisker Sense ('whisker-sense') — the nearest mouse the player has
    // NOT found yet, within maxDist horizontally, as { mouse, dist }, or null.
    //
    // `foundIds` is the LIVE found set (new Set(progression.state.golden)),
    // re-read by the caller each ping rather than captured here. Belt and
    // braces on purpose: createGoldMice already declines to spawn a found
    // mouse and remove() pulls one the moment it is caught, so `list` is
    // unfound-only by construction — but "already-found mice never ping" is
    // the ability's one hard rule, and a rule that holds only because two
    // other code paths happen to be correct is a rule waiting to break. A
    // mouse recorded as found by any route (this walk's catch, a save
    // restored mid-session, a future remote find) is skipped here on its own
    // account.
    //
    // Distance is horizontal only — the same measure checkFind uses — so a
    // mouse on a rooftop still pings from the pavement below it, which is
    // precisely the hint the player needs to know there is something up there.
    nearestUnfound(pos, maxDist, foundIds) {
      let best = null;
      let bestD = maxDist;
      for (const mo of list) {
        if (foundIds && typeof foundIds.has === 'function' && foundIds.has(mo.id)) continue;
        const d = Math.hypot(mo.x - pos.x, mo.z - pos.z);
        if (d < bestD) {
          bestD = d;
          best = mo;
        }
      }
      return best ? { mouse: best, dist: bestD } : null;
    },
    remove,
    dispose() {
      for (const mo of [...list]) remove(mo.id);
    },
  };
}
