// =============================================================================
// THE REEF'S WALK, WITH ITS STORY (milestone R2). world/reeflife.js is the place's drawing and its air gauge (it never touches the save or what she owns:
// a source scan says so); this wraps it and puts Marlo and chapter one on top (world/reefmarlo.js, the rules in src/reefmission.js). The two things the
// story needs from the rest of the place are handed over here and nowhere else:
//   * the float height (the player's), because the shell on the coral ledge is reached only by floating: it goes to Marlo's pick-up rule as a number;
//   * the gauge: an air pocket fills it (reefair's refill) and says its soft line through the gauge.
// A step is saved by Marlo's life through the walk's progression, once, when it happens; nothing here is saved by the frame.
// =============================================================================

import { phrase } from '../clanphrases.js';
import { createReefLife } from './reeflife.js';
import { createMarlo } from './reefmarlo.js';
import { createHousewarming } from './reefhouse.js';
import { refill, bubblesLeft, lifting, AIR } from './reefair.js';

// createReefStoryLife(ctx) -> the place's life, plus { marlo, promptAt, interact, credit }; ctx is walk.js's life context.
export function createReefStoryLife(ctx) {
  const life = createReefLife(ctx);
  const { audio, player, progression, scene, reducedMotion = false, log = null, tier = null } = ctx;
  let house = null; // chapters 2 and 3's lanterns and parade (milestone R5), made just after Marlo (he needs them to start it, they need him to apply a step)
  const air = life.air;
  const marlo = createMarlo({
    scene, reducedMotion, progression, audio,
    onParade: () => house?.start({ own: true }),
    paradeOn: () => !!house?.paradeOn(),
    pocket() {
      if (lifting(air) || air.used <= 0.5) return false; // nothing to fill (or a lift is on): the pocket keeps its air
      const was = bubblesLeft(air);
      refill(air);
      if (was < AIR.bubbles) life.say(phrase('reef.air.pocket'));
      audio?.chime?.();
      return true;
    },
  });
  house = createHousewarming({ scene, marlo, progression, log, audio, tier, reducedMotion, send: ctx.sendEvent });
  return {
    ...life,
    marlo,
    house,
    // the action button's offers (Marlo's hello, a shell to take or to give) and a step done by anyone in the room
    promptAt: (catPos) => marlo.promptAt(catPos, player?.floatY ?? 0),
    interact: () => marlo.interact(),
    // a parade begun by anyone in the room starts ours (the shared T0); every other step is Marlo's, credited in order
    credit: (ev) => (ev?.kind === 'parade' && Number.isFinite(ev.elapsed) ? house.credit(ev) : marlo.credit(ev)),
    update(dt, t, catPos, camera, session) {
      life.update(dt, t, catPos, camera, session);
      marlo.update(dt, t, catPos, camera, session, player?.floatY ?? 0);
      house.update(dt, t, catPos, camera, session);
    },
    dispose() {
      house.dispose();
      marlo.dispose();
      life.dispose();
    },
  };
}
