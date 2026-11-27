// =============================================================================
// THE SEASIDE'S LIFE (areaData.life: walk.js makes it once per walk with its
// context, main.js calls update(dt, t, catPos, camera, session) every frame,
// endWalk calls dispose()). Part of the Seaside's chunk. Everything it adds is
// decoration at the plan's spots (seasideplan.js): the bathers (seasidefolk.js)
// and, beside them, the gulls and the vendors. None of it is a find, a prompt, a
// perch or a word; nothing is networked (each screen draws the same plan on its
// own clock, which only matters to the eye); no real light is added.
//
// ctx: { scene, reducedMotion, tier, people (the pack's people factory),
// lodNear }. Without a scene or the people factory (the picture pages, the
// plain tests) there are no people, and the update does nothing for them.
// =============================================================================
import { createSeasideFolk, NO_FOLK } from './seasidefolk.js';

export function createSeasideLife(ctx = {}) {
  const scene = ctx.scene ?? null;
  const rung = Number.isFinite(ctx.tier?.rung) ? ctx.tier.rung : 0;
  const reducedMotion = ctx.reducedMotion ?? false;
  const folk = scene && ctx.people ? createSeasideFolk({ people: ctx.people, lodNear: ctx.lodNear, reducedMotion, rung }) : NO_FOLK;
  if (folk.group) scene.add(folk.group);
  let gone = false;
  return {
    folk,
    update(dt, t, catPos) {
      if (gone || !catPos) return;
      folk.update(dt, t, catPos);
    },
    dispose() {
      if (gone) return;
      gone = true;
      folk.dispose();
    },
  };
}
