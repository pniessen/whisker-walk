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
//   * The take-off glows (roofs.js's merged disc mesh, area.markGlow): their
//     material's opacity moves from userData.glowOpacity.sunset (strong, on
//     the sunlit felt) to .dusk (soft, a hint, not a puddle) by eveningAt,
//     every frame, on the walk's own copy of the material (beauty Task D).
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
//
// THE FLOCK (Rooftops step 3, world/roofsbirds.js): where the place has bird
// perches (area.birdPerches), the life makes the fourteen birds, hands them
// her spot and the camera every frame, and takes them away at the walk's end.
// It hands them the walk's critters (the birds are critters for tag; the
// flock flies them) and her walks here before this one, and the guide's
// memory: the context's `guideStore` where it has one (the picture pages'),
// else the device's (roofsbirds.js deviceGuideStore). update() runs after
// critters.update (main.js), so the flock's spots are the critters' this
// frame. A record without perches (older tests' fake areas) has no flock.
//
// THE WIND (Rooftops step 3, Task 5, world/roofsair.js): every frame the
// washing's clock (area.washSway's uWashT) is set to walk seconds, and its
// amplitude to WASH.amp, or 0 under reduced motion (a still downwind lean).
// Where the place has smoking pots (area.smokePots) the life makes the smoke,
// runs it on walk seconds (half speed under reduced motion: roofsair.js) and
// takes it away at the walk's end.
//
// THE SLEEPING CATS (Rooftops step 3, Task 6, S1): the two house cats on their
// sills (area.sleepers, roofs.js) breathe, every frame and under reduced
// motion too: scale.y = 1 + BREATH.amp * sin(BREATH.rate * t + i), t walk
// seconds, i the sleeper's place in the list. Nothing else reads them.
//
// THE SIX FINDS (Rooftops step 5, world/roofsmoments.js): where the place has
// its discoveries (area.anchors.discoveries) the life makes the moments with
// the walk's log and progression (walk.js's context; a picture page has
// none, and then nothing is noted), and hands them her spot, the camera and
// her session every frame, after the flock: update's fifth argument (main.js).
// An older caller's four arguments still work (no session: no perch).
//   * Their looks (Task 5): the warm chimney's smoke ring (one mesh, where
//     the place has its pots), the attic's pane under the skylight (one mesh,
//     where there is a page: the context's `doc`, else the game's document;
//     none headless), the moon over the screen from the telescope, and the
//     view from the vane, which leans the camera player.update placed (so the
//     moments run after it: main.js calls this after player.update).
//
// THE BIRDS' SOUNDS (Rooftops step 5, world/roofssound.js): where there is a
// flock and the context has the game's `audio`, the life hears it every
// frame after the flock (so a take-off or a landing is this frame's): the
// loft's cooing, pigeons, sparrows, gulls and wings, by her distance. Silent
// while the game is muted (audio.isMuted), and a picture page hands no audio.
// =============================================================================
import { skyBackground } from './render/sky.js';
import { BUS } from './world/roofsplan.js';
import { createRoofsBirds } from './world/roofsbirds.js';
import { WASH, createRoofsSmoke } from './world/roofsair.js';
import { createRoofsMoments } from './world/roofsmoments.js';
import { createRoofsSound } from './world/roofssound.js';

export const EVENING_RAMP = 240; // s, sunset to dusk
export const EVENING_STEPS = 6; // the sky's rebuilds on the way
export const SUNSET_SUN = 1.8; // x the dusk sun, at the start
export const SUNSET_FILL = 1.3; // x the dusk fill, at the start
// The lit windows, clock faces and garden bulbs: GLOW.sunset of their built
// brightness at sunset, all of it at dusk (by eveningAt); the bulbs breathe
// GLOW.breathe about it, a swell every 2pi / GLOW.rate s, still under reduced motion.
export const GLOW = Object.freeze({ sunset: 0.55, breathe: 0.06, rate: 1.1 });
export const BREATH = Object.freeze({ amp: 0.02, rate: 1.3 }); // the sleeping cats': under 3%, a breath every 4.8 s

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

// createRoofsLife(area) -> (ctx) => { update(dt, t, catPos, camera, session), dispose() }.
// `area` is the built record (its skySunset, skyDusk, skyGlow, markGlow, bus,
// birdPerches, washSway, smokePots, sleepers and anchors); ctx is walk.js's life context ({ scene, sun, fill,
// critters, visits, reducedMotion, log, progression, viewYaw, ... }), or a picture
// page's (which may add a `guideStore`).
export function createRoofsLife(area) {
  return ({ scene, sun, fill, critters, visits, reducedMotion, guideStore, log, progression, doc, audio, viewYaw }) => {
    const from = area.skySunset;
    const to = area.skyDusk;
    const sunEnd = sun.intensity;
    const fillEnd = fill.intensity;
    const bus = area.bus ?? null;
    const glow = area.skyGlow ?? null;
    const glowFrom = glow?.userData.skyGlow.sunset;
    const glowTo = glow?.userData.skyGlow.dusk;
    const marks = area.markGlow ?? null;
    const marksFrom = marks?.userData.glowOpacity.sunset;
    const marksTo = marks?.userData.glowOpacity.dusk;
    const lights = area.eveningLights ?? null;
    const lit = lights ? Object.values(lights).filter(Boolean) : [];
    const bulbs = lights?.bulbs ?? null;
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
      if (lit.length) {
        const k = GLOW.sunset + (1 - GLOW.sunset) * e;
        for (let i = 0; i < lit.length; i++) {
          const m = lit[i];
          m.emissiveIntensity = m.userData.glowBase * (m === bulbs && !reducedMotion ? k * (1 + GLOW.breathe * Math.sin(GLOW.rate * walk)) : k);
        }
      }
      if (marks) marks.material.opacity = marksFrom + (marksTo - marksFrom) * e;
      if (bus) {
        busAt(walk, at);
        bus.position.x = at.x;
        bus.position.z = at.z;
        bus.visible = at.visible;
      }
    }

    const birds = area.birdPerches
      ? createRoofsBirds(area, { scene, critters: critters ?? null, visits: visits ?? 0, reducedMotion: reducedMotion ?? false, guideStore })
      : null;

    const wash = area.washSway ?? null;
    const washAmp = reducedMotion ? 0 : WASH.amp;
    const smoke = area.smokePots ? createRoofsSmoke(scene, area.smokePots, { reducedMotion: reducedMotion ?? false }) : null;
    function wind() {
      if (wash) {
        wash.uWashT.value = walk;
        wash.uWashAmp.value = washAmp;
      }
      smoke?.update(walk);
    }

    const sleepers = area.sleepers ?? [];
    function breathe() {
      for (let i = 0; i < sleepers.length; i++) sleepers[i].scale.y = 1 + BREATH.amp * Math.sin(BREATH.rate * walk + i);
    }

    // The page the moon and the attic's pane are made on: the context's (a
    // test's), else the game's own; headless there is none, and no pane.
    const page = doc !== undefined ? doc : (globalThis.document ?? null);
    const moments = area.anchors?.discoveries
      ? createRoofsMoments(area, { log, progression, birds, scene, reducedMotion: reducedMotion ?? false, doc: page, viewYaw })
      : null;

    // The birds' sounds (world/roofssound.js): where there is a flock and the
    // walk's audio; silent while the game is muted.
    const sound = birds && audio ? createRoofsSound(audio, { birds, loft: area.anchors?.discoveries?.loft ?? null }) : null;

    apply(); // the first frame is already sunset
    wind();
    breathe();
    return {
      update(dt, t, catPos = null, camera = null, session = null) {
        walk += dt;
        apply();
        wind();
        breathe();
        birds?.update(dt, catPos, camera);
        moments?.update(dt, catPos, camera, session);
        sound?.update(dt, catPos);
      },
      dispose() {
        sound?.dispose();
        moments?.dispose();
        birds?.dispose();
        smoke?.dispose();
        for (const s of sleepers) s.scale.y = 1;
        for (const m of lit) m.emissiveIntensity = m.userData.glowBase;
      },
    };
  };
}
