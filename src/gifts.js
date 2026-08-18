import * as THREE from 'three';
import { litMaterial } from './render/materials.js';

// v18 Task 3.2 — Gift Paws.
//
// "Leave a gift at a scenic spot; ghosts and co-walkers can find it."
//
// SCOPE RULING (recorded here because the spec sentence is what is wrong,
// not the code). The wave's non-goals forbid any new broadcast kind or wire
// format change — abilities are strictly local. Real-time discovery by a
// LIVE co-walker cannot be built without the wire, so it is not built here.
// What ships instead, and what the spec should be corrected to say:
//
//   * a gift is left at a scenic spot and PERSISTED in the save
//     (state.gifts, an additive v4 field — see progression.js);
//   * it is still there on later walks, rendered at the spot, across
//     sessions and across areas;
//   * it is FOUND on a subsequent walk by a visitor who is already local:
//     a ghost (a befriended cross-walk pet, src/ghosts.js) when one visits,
//     and otherwise a wandering stray cat.
//
// Nothing here sends or reads a network event. A co-walker in the same room
// walk sees their own gifts and none of yours, which is exactly the same
// "abilities are local" property Far Call, Whisker Sense and Big Swat have.
//
// This module owns only the WORLD half — resolving saved gifts against the
// area's scenic spots, the prop, and the proximity queries. Every write to
// the save goes through progression.leaveGift / claimGift; nothing in here
// touches state.

// How close the cat has to be to a scenic spot to stash something there.
// Deliberately inside updateInteractions' own 4m "you have visited this
// scenic spot" radius, so the award for arriving has already fired by the
// time the prompt offers to leave a gift — the two never race.
export const GIFT_LEAVE_RANGE = 3.0;

// A small wrapped present: a box with a ribbon cross on top. One shared
// material per gift (like goldmice.js's mouse) so dispose is exact rather
// than a traverse-and-guess.
function buildGift() {
  const g = new THREE.Group();
  const box = litMaterial(0xe05a7a, { emissive: 0x4a1020 });
  const ribbon = litMaterial(0xf2e2b8, { emissive: 0x6a6048 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.28, 0.34), box);
  body.position.y = 0.14;
  g.add(body);
  const bandA = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.3, 0.36), ribbon);
  bandA.position.y = 0.14;
  g.add(bandA);
  const bandB = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.3, 0.07), ribbon);
  bandB.position.y = 0.14;
  g.add(bandB);
  const bow = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), ribbon);
  bow.position.y = 0.3;
  g.add(bow);
  return { group: g, materials: [box, ribbon] };
}

function disposeGift(entry) {
  for (const child of entry.group.children) child.geometry?.dispose();
  for (const m of entry.materials) m.dispose();
}

/**
 * resolveGifts(saved, scenics) -> [{ area, spot, label, x, z }]
 *
 * Joins the save's { area, spot } records onto the area's own scenic array,
 * which is the only place the coordinates live. A saved spot id that no
 * longer exists in the area — a renamed scenic, a hostile payload's
 * '__proto__', a gift left in an area whose builder has since changed — is
 * SKIPPED rather than defaulted to the origin: the alternative is a present
 * sitting in the middle of a road.
 *
 * Pure and DOM-free, so the whole join is unit-testable without a scene.
 */
export function resolveGifts(saved, scenics) {
  if (!Array.isArray(saved) || !Array.isArray(scenics)) return [];
  const byId = new Map();
  for (const sc of scenics) {
    if (sc && typeof sc.id === 'string' && !byId.has(sc.id)) byId.set(sc.id, sc);
  }
  const out = [];
  const seen = new Set();
  for (const g of saved) {
    if (!g || typeof g.spot !== 'string' || seen.has(g.spot)) continue;
    const sc = byId.get(g.spot);
    if (!sc) continue;
    seen.add(g.spot);
    out.push({ area: g.area, spot: sc.id, label: sc.label ?? sc.id, x: sc.x, z: sc.z });
  }
  return out;
}

/**
 * openScenics(scenics, saved) -> scenic spots with no gift stashed on them.
 *
 * What the "E — leave a gift here" prompt scans. One gift per spot keeps the
 * list bounded by the world rather than by the player's patience, and stops
 * a player parking on the fountain and stacking presents.
 */
export function openScenics(scenics, saved) {
  const taken = new Set(
    (Array.isArray(saved) ? saved : []).map((g) => (typeof g?.spot === 'string' ? g.spot : null)),
  );
  return (Array.isArray(scenics) ? scenics : []).filter((sc) => sc && !taken.has(sc.id));
}

/**
 * createGifts(scene, scenics, saved) -> gifts
 *
 * Renders one present per resolved gift and hands back the small API the
 * walk needs: `list` for the finder pick, `add` for a gift left mid-walk,
 * `remove` when one is found, and `dispose` at end of walk.
 *
 * `scene` may be a bare { add, remove } stub (that is all this uses), which
 * is what lets the whole module be driven in tests.
 */
export function createGifts(scene, scenics, saved) {
  const entries = [];

  function place(resolved) {
    const { group, materials } = buildGift();
    group.position.set(resolved.x, 0, resolved.z);
    scene.add(group);
    const entry = { ...resolved, group, materials };
    entries.push(entry);
    return entry;
  }

  for (const resolved of resolveGifts(saved, scenics)) place(resolved);

  return {
    get list() {
      return entries;
    },
    // add(area, scenic) — a gift left during THIS walk shows up immediately,
    // so the player sees what they just did rather than having to come back
    // next walk to find out it worked.
    add(area, scenic) {
      if (!scenic || typeof scenic.id !== 'string') return null;
      if (entries.some((e) => e.spot === scenic.id)) return null;
      return place({
        area, spot: scenic.id, label: scenic.label ?? scenic.id, x: scenic.x, z: scenic.z,
      });
    },
    remove(entry) {
      const i = entries.indexOf(entry);
      if (i < 0) return false;
      entries.splice(i, 1);
      scene.remove(entry.group);
      disposeGift(entry);
      return true;
    },
    dispose() {
      for (const e of entries) {
        scene.remove(e.group);
        disposeGift(e);
      }
      entries.length = 0;
    },
  };
}

// An inert stand-in for walks that have no gift layer at all (the den). Same
// pattern as walk.js's NO_GHOSTS: the render loop and endWalk call the API
// unconditionally, so the stub is what keeps those calls safe.
export const NO_GIFTS = Object.freeze({
  list: [], add: () => null, remove: () => false, dispose() {},
});

/**
 * pickFoundGift(rng, gifts) -> one gift, or null.
 *
 * Which stashed gift gets found on this walk. AT MOST ONE per walk, on
 * purpose: the find is the payoff, and eight of them in one walk would make
 * it wallpaper. Seeded through the injected rng — never a bare Math.random()
 * — so a room walk's two clients agree on the draw even though the gift
 * itself is local to whoever left it.
 */
export function pickFoundGift(rng, gifts) {
  const list = Array.isArray(gifts) ? gifts.filter(Boolean) : [];
  if (!list.length) return null;
  const r = typeof rng === 'function' ? rng() : 0;
  const i = Math.floor((Number.isFinite(r) && r >= 0 && r < 1 ? r : 0) * list.length);
  return list[Math.min(i, list.length - 1)];
}
