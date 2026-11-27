// =============================================================================
// THE SEASIDE'S LIFE (areaData.life: walk.js makes it once per walk with its
// context, main.js calls update(dt, t, catPos, camera, session) every frame,
// endWalk calls dispose()). Part of the Seaside's chunk. Everything it adds is
// decoration at the plan's spots (seasideplan.js): the bathers and the two
// vendors (seasidefolk.js) and the gulls (seasidegulls.js). None of it is a find, a prompt, a
// perch or a word; nothing is networked (each screen draws the same plan on its
// own clock, which only matters to the eye); no real light is added.
//
// ctx: { scene, reducedMotion, tier, people (the pack's people factory),
// lodNear }. Without the people factory (the picture pages, the plain tests)
// there are no people; the gulls need only the scene.
// =============================================================================
import { createSeasideFolk, NO_FOLK } from './seasidefolk.js';
import { createSeasideGulls, NO_GULLS } from './seasidegulls.js';

export function createSeasideLife(ctx = {}) {
  const scene = ctx.scene ?? null;
  const rung = Number.isFinite(ctx.tier?.rung) ? ctx.tier.rung : 0;
  const reducedMotion = ctx.reducedMotion ?? false;
  const folk = scene && ctx.people ? createSeasideFolk({ people: ctx.people, lodNear: ctx.lodNear, reducedMotion, rung }) : NO_FOLK;
  const gulls = scene ? createSeasideGulls({ reducedMotion, rung }) : NO_GULLS;
  if (folk.group) scene.add(folk.group);
  if (gulls.mesh) scene.add(gulls.mesh);
  let gone = false;
  return {
    folk, gulls,
    update(dt, t, catPos) {
      if (gone || !catPos) return;
      folk.update(dt, t, catPos);
      gulls.update(dt, t, catPos);
    },
    dispose() {
      if (gone) return;
      gone = true;
      folk.dispose();
      gulls.dispose();
    },
  };
}
