// =============================================================================
// THE TREEHOUSE VILLAGE: THE TREE CATS (round two, the owner's backlog "other cats in the Treehouse"). Up to three friendly cats (a fourth, on the oak's limb, did not fit the Treehouse mesh row of 23) of their own, each in its own place (treehousecatparts.js): curled
// on a cushion on the Bakery deck, sitting on the far platform's rail, and peeking out of the hollow at the oak's foot. Each is ONE low-poly mesh (treehousecatmesh.js,
// about 450 triangles, one shared lit material), made at once when the life starts (nothing arrives late: the frame budget sees them). NO name tag, NO collider, NO perch, NO ground strip, no
// shadow: scenery with one small friend moment. Within AIM_R her cat is looked at (the cat turns, at most TURN_MAX either way, and eases back); within GREET_R it says its hello in the walk's own
// speech bubble (chatbubble.js) once, and not again for HELLO_EVERY seconds; the napper wakes (its curled mesh is swapped for the sitting one) while she is near. The cats breathe a little (the
// body's height); reduced motion holds them still (the turn is the greeting, so it stays). Cats beyond SHOW_R are hidden. Lower rungs keep fewer (two, then one). Draws no random number
// and reads no clock (the walk's seconds only). Freed with the life.
// =============================================================================
import * as THREE from 'three';
import { createChatBubbles } from '../chatbubble.js';
import { phrase } from '../clanphrases.js';
import { litMaterial } from '../render/materials.js';
import { isLowTier } from './treehouselight.js';
import { CATS } from './treehousecatparts.js';
import { catGeometry } from './treehousecatmesh.js';
import './treehousecatwords.js';

export const AIM_R = 7; // m: her cat is near enough to be looked at
export const GREET_R = 3.8; // m: near enough for the hello
export const WAKE_R = 4.5; // m: the napper sits up (and lies down again beyond WAKE_R + 2)
export const SHOW_R = 40; // m: beyond this a cat is hidden and left alone
export const TURN_MAX = 0.9; // rad: the most a cat turns from its resting way
export const HELLO_EVERY = 45; // walk seconds before the same cat says its hello again
export const catCount = (tier) => (tier && tier.shadows === false ? 1 : isLowTier(tier) ? 2 : 3);
const HELLO = Object.freeze({
  cushion: () => phrase('treehouse.cat.hello.cushion'), rail: () => phrase('treehouse.cat.hello.rail'),
  hollow: () => phrase('treehouse.cat.hello.hollow'),
});
// the lower rungs keep these first: the napper, then the rail cat
const KEEP_ORDER = Object.freeze(['cushion', 'rail', 'hollow']);
const TAU = Math.PI * 2;
const wrap = (a) => a - TAU * Math.round(a / TAU);

/** ctx { scene, tier, reducedMotion } -> { cats, update(dt, t, catPos), dispose() } */
export function createTreehouseCats(ctx) {
  if (!ctx?.scene) return null;
  const { scene, reducedMotion = false } = ctx;
  const keep = new Set(KEEP_ORDER.slice(0, catCount(ctx.tier)));
  let clockMs = 0;
  const bubbles = createChatBubbles(scene, { now: () => clockMs, ...(ctx.makeSprite ? { makeSprite: ctx.makeSprite } : {}) });
  let gone = false;
  const material = litMaterial(0xffffff, { vertexColors: true, roughness: 0.9 }); // one for all the cats
  const cats = CATS.filter((c) => keep.has(c.id)).map((c, i) => {
    const sit = catGeometry(c.look, 'sit');
    const nap = c.rest === 'nap' ? catGeometry(c.look, 'nap') : null;
    const mesh = new THREE.Mesh(nap ?? sit, material);
    mesh.name = `treehouse:cat:${c.id}`;
    mesh.castShadow = false; mesh.receiveShadow = true;
    Object.assign(mesh.userData, { noCast: true, noContactShadow: true, noMerge: true });
    mesh.position.set(c.x, c.y, c.z);
    mesh.rotation.y = c.yaw;
    mesh.scale.setScalar(c.scale);
    scene.add(mesh);
    return { id: c.id, rest: c.rest, pose: c.rest, mesh, sit, nap, scale: c.scale, yaw: c.yaw, aim: 0, turn: 0, phase: i * 1.7, said: -1e9, near: false, hello: HELLO[c.id] };
  });

  return {
    cats,
    update(dt, t, catPos) {
      if (gone) return;
      clockMs = t * 1000;
      for (const c of cats) {
        const m = c.mesh;
        const dx = catPos ? catPos.x - m.position.x : 1e3;
        const dz = catPos ? catPos.z - m.position.z : 1e3;
        const dy = catPos ? (catPos.y ?? 0) - m.position.y : 0;
        const d = Math.hypot(dx, dz, dy * 0.5);
        m.visible = d <= SHOW_R;
        if (!m.visible) continue;
        if (c.nap) { // the napper sits up while she is near and lies down again when she has gone
          const want = d <= WAKE_R ? 'sit' : d > WAKE_R + 2 ? 'nap' : c.pose;
          if (want !== c.pose) { c.pose = want; m.geometry = want === 'sit' ? c.sit : c.nap; }
        }
        // the turn toward her (the model faces -z: a turn to face (dx, dz) is atan2(-dx, -dz)), eased in and out
        const want = d <= AIM_R ? Math.max(-TURN_MAX, Math.min(TURN_MAX, wrap(Math.atan2(-dx, -dz) - c.yaw))) : 0;
        c.turn += (want - c.turn) * Math.min(1, 4 * Math.max(0, dt));
        m.rotation.y = c.yaw + c.turn;
        m.scale.y = c.scale * (reducedMotion ? 1 : 1 + (c.pose === 'nap' ? 0.035 : 0.012) * Math.sin(t * 1.8 + c.phase)); // breathing
        if (d <= GREET_R && !c.near) {
          c.near = true;
          if (t - c.said >= HELLO_EVERY) { c.said = t; try { bubbles.show(m, c.hello(), clockMs); } catch { /* a place that cannot draw a bubble (a headless check) is quiet */ } }
        } else if (d > GREET_R + 1) c.near = false;
      }
      bubbles.update(clockMs);
    },
    dispose() {
      if (gone) return;
      gone = true;
      bubbles.clear();
      for (const c of cats) { scene.remove(c.mesh); c.sit.dispose(); c.nap?.dispose(); }
      material.dispose();
    },
  };
}
