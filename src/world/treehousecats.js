// =============================================================================
// THE TREEHOUSE VILLAGE: THE TREE CATS (round two, the owner's backlog "other cats in the Treehouse"). Up to four friendly cats of their own, each in its own place (treehousecatparts.js): curled
// on a cushion on the Bakery deck, sitting on the far platform's rail watching the village, on a limb of the great oak, and peeking out of the hollow at the oak's foot. They are the game's own
// cat model (cat/model.js, a simple build, no scars) and its own poses (cat/animator.js: the slow blink and the tail's flick come with the sit; the napper breathes). They have NO name tag, NO
// collider, NO perch and NO ground strip: scenery with one small friend moment. When her cat comes within AIM_R the cat's head turns to her (cat/headaim.js); within GREET_R it says its hello
// in the walk's own speech bubble (chatbubble.js) once, and not again for HELLO_EVERY seconds; the napper wakes and sits up while she is near and curls back down when she leaves. No fight,
// no prompt, no need: nothing here is a rule. Cats beyond SHOW_R are hidden and not animated. They cast no shadow (noCast). The lower rungs keep fewer (three, then two). Reduced motion holds
// the poses still (the head still turns: it is the greeting). Made once when the life starts and freed with it. Draws no random number and reads no clock (the walk's seconds only).
// A lazy file (treehousestagebranches.js reaches it by import() when the life starts): its words (treehousecatwords.js) and the cat model never join the start-up download.
// =============================================================================
import { buildCat, catStyle } from '../cat/model.js';
import { animateCat } from '../cat/animator.js';
import { aimHead } from '../cat/headaim.js';
import { createChatBubbles } from '../chatbubble.js';
import { phrase } from '../clanphrases.js';
import { withLocalUuids } from './localuuids.js';
import { isLowTier } from './treehouselight.js';
import { CATS } from './treehousecatparts.js';
import './treehousecatwords.js';

export const AIM_R = 7; // m: her cat is near enough for the head to turn to her
export const GREET_R = 3.8; // m: near enough for the hello
export const WAKE_R = 4.5; // m: the napper sits up (and lies down again beyond WAKE_R + 2)
export const SHOW_R = 40; // m: beyond this a cat is hidden and left alone
export const HELLO_EVERY = 45; // walk seconds before the same cat says its hello again
export const catCount = (tier) => (tier && tier.shadows === false ? 2 : isLowTier(tier) ? 3 : 4);
const HELLO = Object.freeze({
  cushion: () => phrase('treehouse.cat.hello.cushion'), rail: () => phrase('treehouse.cat.hello.rail'),
  limb: () => phrase('treehouse.cat.hello.limb'), hollow: () => phrase('treehouse.cat.hello.hollow'),
});
// the lower rungs keep these (in the order of CATS, the last dropped first): the napper and the rail cat first
const KEEP_ORDER = Object.freeze(['cushion', 'rail', 'hollow', 'limb']);

/** ctx { scene, tier, reducedMotion } -> { cats, update(dt, t, catPos), dispose() } */
export function createTreehouseCats(ctx) {
  if (!ctx?.scene) return null;
  const { scene, reducedMotion = false } = ctx;
  const keep = new Set(KEEP_ORDER.slice(0, catCount(ctx.tier)));
  let clockMs = 0;
  const bubbles = createChatBubbles(scene, { now: () => clockMs, ...(ctx.makeSprite ? { makeSprite: ctx.makeSprite } : {}) });
  let gone = false;
  const cats = CATS.filter((c) => keep.has(c.id)).map((c, i) => {
    const group = withLocalUuids(`treehouse-cat-${c.id}`, () => {
      const g = buildCat(c.breed, undefined, { simple: true, scars: [], ...(c.coat ? { style: Object.freeze({ ...catStyle(c.breed), ...c.coat }) } : {}) });
      g.name = `treehouse:cat:${c.id}`;
      g.userData.blinkSeed = (i * 0.29 + 0.11) % 1;
      g.scale.multiplyScalar(c.scale);
      g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; o.userData.noCast = true; } });
      return g;
    });
    group.position.set(c.x, c.y, c.z);
    group.rotation.y = c.yaw;
    scene.add(group);
    return { id: c.id, rest: c.rest, pose: c.rest, group, phase: i * 1.7, said: -1e9, near: false, hello: HELLO[c.id] };
  });

  const target = { x: 0, y: 0, z: 0 };
  return {
    cats,
    update(dt, t, catPos) {
      if (gone) return;
      clockMs = t * 1000;
      for (const c of cats) {
        const g = c.group;
        const dx = catPos ? catPos.x - g.position.x : 1e3;
        const dz = catPos ? catPos.z - g.position.z : 1e3;
        const dy = catPos ? (catPos.y ?? 0) - g.position.y : 0;
        const d = Math.hypot(dx, dz, dy * 0.5);
        g.visible = d <= SHOW_R;
        if (!g.visible) continue;
        // the napper sits up while she is near and lies down again when she has gone
        if (c.rest === 'nap') c.pose = d <= WAKE_R ? 'requestPet' : d > WAKE_R + 2 ? 'nap' : c.pose;
        animateCat(g, c.pose, t + c.phase, 0, reducedMotion);
        if (d <= AIM_R) { target.x = catPos.x; target.y = (catPos.y ?? 0) + 0.4; target.z = catPos.z; aimHead(g, target, dt, c.pose, 0); } else aimHead(g, null, dt, c.pose, 0); // the head turns to her, and eases back
        if (d <= GREET_R && !c.near) {
          c.near = true;
          if (t - c.said >= HELLO_EVERY) { c.said = t; try { bubbles.show(g, c.hello(), clockMs); } catch { /* a place that cannot draw a bubble (a headless check) is quiet */ } }
        } else if (d > GREET_R + 1) c.near = false;
      }
      bubbles.update(clockMs);
    },
    dispose() {
      if (gone) return;
      gone = true;
      bubbles.clear();
      for (const c of cats) {
        scene.remove(c.group);
        c.group.traverse((o) => { o.geometry?.dispose(); for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) { m.map?.dispose(); m.dispose(); } });
      }
    },
  };
}
