// =============================================================================
// THE ROOFTOPS' EVENING (Rooftops step 2). An area life (areaData.life, as the
// Gorge's): walk.js calls it once per walk, main.js calls update() every
// frame, endWalk calls dispose().
//
// ALWAYS EVENING. The Rooftops has its own evening sky, so a walk there
// always has the dusk look (walk.js's eveningLook): render/dusk.js's lights,
// the lamps lit, the stars and the moon. This file deepens it over the walk:
// the sky starts at the place's sunset (area.skySunset) and reaches its dusk
// (area.skyDusk) by EVENING_RAMP walk seconds, eased (eveningAt).
//   * The sky is a canvas gradient (render/sky.js), so it is rebuilt only when
//     the step floor(eveningAt(t) * EVENING_STEPS) changes: once at the start
//     and six times on the way. The old texture is disposed each time (sky.js
//     memoises them, and a disposed texture is uploaded again if it is used
//     again).
//   * The fog colour (the sky's horizon, which fog must agree with) and the
//     sun's and the fill's intensities follow every frame, set on the objects
//     the walk already has: nothing is allocated between steps.
//   * The sun and the fill start brighter, by SUNSET_SUN and SUNSET_FILL, and
//     end at what applyDusk set (read once, when the life is made).
//   * The sky glow (roofs.js's additive band low round the horizon,
//     area.skyGlow) is coloured every frame, its material's colour moved
//     channel by channel from its userData.skyGlow.sunset to .dusk by
//     eveningAt: warm and strong at sunset, rose and weaker at dusk. It is set
//     in place, like the fog.
//
// THE BUS (busAt) runs along the street below, x from BUS.x0 to BUS.x1 over
// BUS.run seconds, once every BUS.every; between runs, and while it is inside
// the arches at either end of the street (BUS.seen), it is hidden.
//
// WALK TIME. The evening and the bus are functions of the walk's own seconds:
// the sum of the dt each update is given. main.js's second argument is its
// app clock (it runs on from walk to walk, and through a pause), so it is not
// read: every walk starts at sunset, and a pause holds the evening still.
// Nothing here draws on a random stream or the network.
// =============================================================================
import { skyBackground } from './render/sky.js';
import { BUS } from './world/roofsplan.js';

export const EVENING_RAMP = 240; // s, sunset to dusk
export const EVENING_STEPS = 6; // the sky's rebuilds on the way
export const SUNSET_SUN = 1.8; // x the dusk sun, at the start
export const SUNSET_FILL = 1.3; // x the dusk fill, at the start

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// How far into the evening walk second `t` is: 0 at sunset, 1 at dusk.
export function eveningAt(t) {
  return smoothstep(0, EVENING_RAMP, t);
}

// Two sRGB hex colours mixed channel by channel (k 0: a, 1: b), as a hex.
export function mixHex(a, b, k) {
  const ch = (s) => {
    const p = (a >> s) & 255;
    const q = (b >> s) & 255;
    return Math.round(p + (q - p) * k);
  };
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

// Where the bus is at walk second `t`: out.x, out.z, out.visible. Pure.
export function busAt(t, out = {}) {
  const phase = ((t % BUS.every) + BUS.every) % BUS.every;
  const running = phase < BUS.run;
  out.x = running ? BUS.x0 + ((BUS.x1 - BUS.x0) * phase) / BUS.run : BUS.x0;
  out.z = BUS.z;
  out.visible = running && out.x >= BUS.seen[0] && out.x <= BUS.seen[1];
  return out;
}

// createRoofsLife(area) -> (ctx) => { update(dt, t), dispose() }. `area` is
// the built record (its skySunset, skyDusk, skyGlow and bus); ctx is walk.js's life
// context ({ scene, sun, fill, ... }).
export function createRoofsLife(area) {
  return ({ scene, sun, fill }) => {
    const from = area.skySunset;
    const to = area.skyDusk;
    const sunEnd = sun.intensity;
    const fillEnd = fill.intensity;
    const bus = area.bus ?? null;
    const glow = area.skyGlow ?? null;
    const glowFrom = glow?.userData.skyGlow.sunset;
    const glowTo = glow?.userData.skyGlow.dusk;
    const at = { x: 0, z: 0, visible: false };
    let walk = 0;
    let step = -1;

    function sky(k) {
      const old = scene.background;
      const e = k / EVENING_STEPS;
      scene.background = skyBackground(mixHex(from.top, to.top, e), mixHex(from.horizon, to.horizon, e));
      if (old && old !== scene.background && old.isTexture) old.dispose();
    }

    function apply() {
      const e = eveningAt(walk);
      const k = Math.floor(e * EVENING_STEPS);
      if (k !== step) {
        step = k;
        sky(k);
      }
      scene.fog?.color.setHex(mixHex(from.horizon, to.horizon, e));
      sun.intensity = sunEnd * (SUNSET_SUN + (1 - SUNSET_SUN) * e);
      fill.intensity = fillEnd * (SUNSET_FILL + (1 - SUNSET_FILL) * e);
      if (glow) {
        glow.material.color.setRGB(
          glowFrom[0] + (glowTo[0] - glowFrom[0]) * e,
          glowFrom[1] + (glowTo[1] - glowFrom[1]) * e,
          glowFrom[2] + (glowTo[2] - glowFrom[2]) * e,
        );
      }
      if (bus) {
        busAt(walk, at);
        bus.position.x = at.x;
        bus.position.z = at.z;
        bus.visible = at.visible;
      }
    }

    apply(); // the first frame is already sunset
    return {
      update(dt) {
        walk += dt;
        apply();
      },
      dispose() {},
    };
  };
}
