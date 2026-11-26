// =============================================================================
// THE REEF: ITS LIFE ON A WALK (milestone R1). What the Reef does each frame, all of it drawing and none of it a rule she can lose to:
//   * the LIGHT (world/reeflight.js: the fog, the shimmer ceiling, the shafts) and the KELP's sway (a time uniform; frozen under reduced motion);
//   * the AIR GAUGE (world/reefair.js is the rules): five bubbles in the corner, hidden the first 20 s of a first visit; at two a soft line;
//     at zero a warm bubble lifts her to the ladder (session.hopLift draws the rise, as the Market's shoo hop does; the lift only moves her
//     and never touches what she owns), the gauge is full again at once;
//   * the soft chime of that lift (the only sound).
// The float itself is the player's (src/player.js) and the camera's follow of it; nothing here reads the float height. Draws on no rng.
// =============================================================================

import * as THREE from 'three';
import { phrase } from '../clanphrases.js';
import { createReefLight } from './reeflight.js';
import { createAir, stepAir, bubblesLeft, airHidden, liftProgress, lifting, AIR } from './reefair.js';
import { LADDER_FOOT, reefY } from './reefplan.js';

export const LINE_SECONDS = 4.5; // how long a soft line stays up

// The lift's height at progress p (0 to 1): up on the first half, down on the second, eased.
export function liftHeight(p) {
  const k = Math.min(1, Math.max(0, p));
  return AIR.rise * Math.sin(Math.PI * k) ** 0.8;
}

function mountGauge(doc) {
  const root = doc?.getElementById?.('hud') ?? doc?.body;
  if (!root || !doc.createElement) return null;
  const wrap = doc.createElement('div');
  wrap.className = 'reef-air';
  wrap.setAttribute('aria-live', 'polite');
  wrap.style.cssText = 'position:absolute;top:10px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:none;z-index:5;font:600 13px system-ui,sans-serif;color:#eaffff;text-shadow:0 1px 2px rgba(0,40,60,.6)';
  const row = doc.createElement('div');
  row.style.cssText = 'display:flex;gap:5px';
  const dots = [];
  for (let i = 0; i < AIR.bubbles; i++) {
    const d = doc.createElement('span');
    d.style.cssText = 'width:14px;height:14px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff,#a8e6f4 55%,#59b7d6);box-shadow:0 0 4px rgba(255,255,255,.6);transition:opacity .3s,transform .3s';
    row.appendChild(d);
    dots.push(d);
  }
  const line = doc.createElement('div');
  line.style.cssText = 'min-height:1em;opacity:0;transition:opacity .4s;background:rgba(20,80,100,.55);padding:2px 10px;border-radius:10px';
  wrap.append(row, line);
  root.appendChild(wrap);
  return { wrap, dots, line };
}

// createReefLife(ctx) -> { update(dt, t, catPos, camera, session), dispose() }; ctx is walk.js's life context.
export function createReefLife({ scene, reducedMotion = false, tier, visits = 0, audio, player, doc = globalThis.document }) {
  const lowTier = !!tier && (tier.name === 'low' || tier.shadows === false || (tier.rung ?? 0) >= 3);
  const light = createReefLight({ scene, lowTier, reducedMotion });
  const kelp = scene.getObjectByName('reef:kelp');
  const kelpTime = kelp?.material?.userData?.kelpTime ?? null;
  const air = createAir({ firstVisit: !visits });
  const gauge = mountGauge(doc);
  let lineLeft = 0;
  let lifted = false; // the cat has been set down at the ladder in this lift
  let clock = 0;

  const say = (text) => {
    if (!gauge) return;
    gauge.line.textContent = text;
    gauge.line.style.opacity = '1';
    lineLeft = LINE_SECONDS;
  };

  function showGauge() {
    if (!gauge) return;
    const hide = airHidden(air);
    gauge.wrap.style.display = hide ? 'none' : 'flex';
    const n = bubblesLeft(air);
    gauge.dots.forEach((d, i) => {
      d.style.opacity = i < n ? '1' : '0.18';
      d.style.transform = i < n ? 'none' : 'scale(.7)';
    });
    // at two bubbles a ring round the pack (a soft glow on the row)
    gauge.dots.forEach((d) => { d.style.boxShadow = n <= AIR.softAt ? '0 0 8px 2px rgba(255,214,140,.9)' : '0 0 4px rgba(255,255,255,.6)'; });
  }

  // the warm bubble round her while a lift lasts
  const bubble = new THREE.Mesh(
    new THREE.SphereGeometry(0.95, 14, 10),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, forceSinglePass: true }),
  );
  bubble.name = 'reef:warmBubble';
  bubble.visible = false;
  bubble.userData.noCast = true;
  bubble.userData.noContactShadow = true;
  scene.add(bubble);

  showGauge();
  return {
    air,
    light,
    say, // (R2) the gauge's soft line: the story's air pockets use it
    update(dt, t, catPos, camera, session) {
      clock += Math.max(dt, 0);
      light.update(dt, t, camera);
      if (kelpTime) kelpTime.value = reducedMotion ? 0 : clock;

      const ev = stepAir(air, dt);
      if (ev === 'low') say(phrase('reef.air.low'));
      if (ev === 'lift') {
        say(phrase('reef.air.lift'));
        audio?.chime?.();
        lifted = false;
        if (player) { player.halt?.(); player.clearFloat?.(); }
      }
      if (ev === 'landed') { say(phrase('reef.air.full')); }

      if (lifting(air)) {
        const p = liftProgress(air);
        // halfway she is set down at the ladder's foot; the bubble then lets her down the rest of the way
        if (!lifted && (reducedMotion || p >= 0.5) && session?.cat) {
          lifted = true;
          session.cat.position.set(LADDER_FOOT.x, reefY(LADDER_FOOT.x, LADDER_FOOT.z), LADDER_FOOT.z);
          player?.halt?.();
          player?.clearFloat?.();
        }
        const h = reducedMotion ? 0 : liftHeight(p);
        if (session) session.hopLift = h;
        bubble.visible = !reducedMotion || p < 1;
        bubble.position.set(catPos.x, catPos.y + 0.35, catPos.z);
        bubble.material.opacity = 0.3 + 0.1 * Math.sin(clock * 3);
      } else {
        if (session && session.hopLift) session.hopLift = 0;
        bubble.visible = false;
      }

      if (lineLeft > 0) {
        lineLeft -= dt;
        if (lineLeft <= 0 && gauge) gauge.line.style.opacity = '0';
      }
      showGauge();
    },
    dispose() {
      light.dispose();
      scene.remove(bubble);
      bubble.geometry.dispose(); bubble.material.dispose();
      gauge?.wrap.remove();
    },
  };
}
