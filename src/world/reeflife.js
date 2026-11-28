// =============================================================================
// THE REEF: ITS LIFE ON A WALK (milestone R1). What the Reef does each frame, all of it drawing and none of it a rule she can lose to:
//   * the LIGHT (world/reeflight.js: the fog, the shimmer ceiling, the shafts) and the KELP's sway (a time uniform; frozen under reduced motion);
//   * the soft LINE at the top of the screen that every Reef life says its lines through (say).
// There is no air to run out of: she can stay under as long as she likes.
// The float itself is the player's (src/player.js) and the camera's follow of it; nothing here reads the float height. Draws on no rng.
// =============================================================================

import { createReefLight } from './reeflight.js';
import { createReefCritters } from './reefcritters.js';
import { createReefSound } from './reefsound.js';
import { createReefBeauty2 } from './reefbeauty2.js';
import { reefY } from './reefplan.js';

export const LINE_SECONDS = 4.5; // how long a soft line stays up

function mountLine(doc) {
  const root = doc?.getElementById?.('hud') ?? doc?.body;
  if (!root || !doc.createElement) return null;
  const wrap = doc.createElement('div');
  wrap.className = 'reef-line';
  wrap.setAttribute('aria-live', 'polite');
  wrap.style.cssText = 'position:absolute;top:10px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:none;z-index:5;font:600 13px system-ui,sans-serif;color:#eaffff;text-shadow:0 1px 2px rgba(0,40,60,.6)';
  const line = doc.createElement('div');
  line.style.cssText = 'min-height:1em;opacity:0;transition:opacity .4s;background:rgba(20,80,100,.55);padding:2px 10px;border-radius:10px';
  wrap.append(line);
  root.appendChild(wrap);
  return { wrap, line };
}

// createReefLife(ctx) -> { update(dt, t, catPos, camera, session), dispose() }; ctx is walk.js's life context.
export function createReefLife({ scene, reducedMotion = false, tier, audio, doc = globalThis.document }) {
  const lowTier = !!tier && (tier.name === 'low' || tier.shadows === false || (tier.rung ?? 0) >= 3);
  const light = createReefLight({ scene, lowTier, reducedMotion });
  const critters = createReefCritters({ scene, tier, reducedMotion }); // (R4) fish, Sela, crabs and bubbles
  const beauty = createReefBeauty2({ scene, reducedMotion, rung: critters.counts.rung }); // beauty pass 2: shoals that scatter, glow, her bubble trail, the depth tint
  const sound = createReefSound({ audio }); // (R4) the hum and the bubbles' blips; nothing asked of the context while muted
  const kelp = scene.getObjectByName('reef:kelp');
  const kelpTime = kelp?.material?.userData?.kelpTime ?? null;
  const causticTime = scene.getObjectByName('reef:ground')?.material?.userData?.causticTime ?? null;
  const tufts = scene.getObjectByName('reef:tufts'); // seabed decor: the lower rungs draw only the first half of everything
  const decor = scene.getObjectByName('reef:decor');
  if (lowTier && tufts) tufts.count = tufts.userData.baseCount;
  if (lowTier && decor) decor.geometry.setDrawRange(0, decor.userData.baseVerts);
  const gauge = mountLine(doc);
  let lineLeft = 0;
  let clock = 0;

  const say = (text) => {
    if (!gauge) return;
    gauge.line.textContent = text;
    gauge.line.style.opacity = '1';
    lineLeft = LINE_SECONDS;
  };

  return {
    light,
    critters,
    beauty,
    sound,
    say, // the soft line: the Deep, the Sealab, the rides and the wreck say theirs through it
    update(dt, t, catPos, camera) {
      clock += Math.max(dt, 0);
      light.update(dt, t, camera);
      critters.update(dt, reducedMotion ? null : catPos);
      beauty.update(dt, t, catPos, camera, !!catPos && catPos.y > reefY(catPos.x, catPos.z) + 0.4);
      sound.update(dt);
      if (kelpTime) kelpTime.value = reducedMotion ? 0 : clock;
      if (causticTime) causticTime.value = reducedMotion ? 1.7 : clock; // (frozen on a still net of light under reduced motion)
      if (kelpTime?.uCat && catPos && !reducedMotion) kelpTime.uCat.value.set(catPos.x, catPos.y, catPos.z);
      if (lineLeft > 0) {
        lineLeft -= dt;
        if (lineLeft <= 0 && gauge) gauge.line.style.opacity = '0';
      }
    },
    dispose() {
      light.dispose();
      critters.dispose();
      beauty.dispose();
      sound.dispose();
      gauge?.wrap.remove();
    },
  };
}
