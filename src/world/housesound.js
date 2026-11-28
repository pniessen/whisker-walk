// THE OLD HOUSE'S QUIET SOUND (Old House step 2, Task 7, ruling D15): the grandfather
// clock's tick while she is within TICK_R of it, a creak every CREAK_EVERY_M she climbs
// or goes down any stair, and a creak every ATTIC_CREAK_S of walking in the attic. All
// quiet, all through audio.tick / audio.creak (so the game's mute silences them), all on
// fixed schedules: no random draws. update allocates nothing. `audio` may be null.

export const TICK_R = 7;
export const CREAK_EVERY_M = 1.4;
export const ATTIC_CREAK_S = 11;
const WALKING = 0.25; // m/s: slower than this is standing
const JUMP = 3; // m in one frame: a placement, not a step

// beauty pass 2 (2026-11-28): the hearth pops now and then within POP_R of the fire (a fixed pattern of gaps, quiet, through audio.tick), and the old
// boards settle with a creak every SETTLE_S while she is in the house (a fixed schedule, not a random draw).
export const POP_R = 6;
export const POP_GAPS = Object.freeze([0.8, 2.1, 0.5, 3.0, 1.3, 0.6, 2.6]);
export const SETTLE_S = 41;

// beauty pass 3 (2026-11-28): the boards creak softly under her paws every WOOD_EVERY_M she walks on a wooden room's floor (`wood`: rects, none by default); rain pattering on the
// glass (`rain`: tiny ticks at fixed gaps, louder in the attic under the roof); by morning a small bird's peep every MORNING_S, and at night the old boards settle twice as often.
// The hearth's pops raise `burst` (1, falling away in about 0.35 s) so the firelight brightens with the crackle (houseglow.js uBurst).
export const WOOD_EVERY_M = 2.3;
export const RAIN_GAPS = Object.freeze([0.11, 0.07, 0.19, 0.09, 0.14, 0.06, 0.17]);
export const MORNING_S = 17;

export function createHouseSound(audio, { clock, stairs, attic, fire = null, wood = null, rain = false, part = null }) {
  // each stair's footprint as numbers: x and z ranges
  const rects = stairs.map((s) => {
    const hw = s.width / 2;
    const alongZ = Math.abs(s.z1 - s.z0) >= Math.abs(s.x1 - s.x0);
    return alongZ
      ? { x0: s.x0 - hw, x1: s.x0 + hw, z0: Math.min(s.z0, s.z1), z1: Math.max(s.z0, s.z1) }
      : { x0: Math.min(s.x0, s.x1), x1: Math.max(s.x0, s.x1), z0: s.z0 - hw, z1: s.z0 + hw };
  });
  let seen = false, px = 0, pz = 0;
  let burst = 0, woodM = 0, rainIn = 0.3, rainK = 0, morningIn = 6;
  let tickIn = 0, stairM = 0, atticS = 0, popIn = 1, popK = 0, settleIn = SETTLE_S;

  return {
    get burst() { return burst; },
    update(dt, t, catPos, calm = false) {
      burst = Math.max(0, burst - dt * 2.8);
      if (!audio || !(dt > 0)) return;
      const x = catPos.x, z = catPos.z;
      const step = seen ? Math.hypot(x - px, z - pz) : 0;
      const moved = step < JUMP ? step : 0;
      seen = true;
      px = x;
      pz = z;

      const d = clock ? Math.hypot(x - clock.x, z - clock.z) : Infinity; // a plan without a clock never ticks
      if (d < TICK_R) {
        if (tickIn <= 0) { audio.tick(0.6 * (1 - d / TICK_R) * (calm ? 0.5 : 1)); tickIn += 1; }
        tickIn -= dt;
      } else tickIn = 0;

      if (fire) {
        const f = Math.hypot(x - fire.x, z - fire.z);
        if (f < POP_R) {
          popIn -= dt;
          if (popIn <= 0) { audio.tick(0.9 * (1 - f / POP_R) * (calm ? 0.5 : 1)); popIn += POP_GAPS[popK++ % POP_GAPS.length]; burst = Math.max(burst, 1 - 0.7 * (f / POP_R)); }
        }
      }
      settleIn -= dt * (part?.night ? 2 : 1);
      if (settleIn <= 0) { audio.creak(0.22); settleIn += SETTLE_S; }
      if (wood) {
        let on = false;
        for (let i = 0; i < wood.length; i++) { const r = wood[i]; if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) { on = true; break; } }
        if (on) { woodM += moved; if (woodM >= WOOD_EVERY_M) { audio.creak(0.12); woodM -= WOOD_EVERY_M; } } else woodM = 0;
      }
      if (rain) {
        rainIn -= dt;
        while (rainIn <= 0) { audio.tick(attic && x >= attic.minX && x <= attic.maxX && z >= attic.minZ && z <= attic.maxZ ? 0.55 : 0.28); rainIn += RAIN_GAPS[rainK++ % RAIN_GAPS.length]; }
      }
      if (part && !part.night && part.lampK < 0.45 && part.sunK < 0.9 && !rain && audio.peep) {
        morningIn -= dt;
        if (morningIn <= 0) { audio.peep(0.25); morningIn += MORNING_S; }
      }

      let onStair = false;
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) { onStair = true; break; }
      }
      if (onStair) {
        stairM += moved;
        if (stairM >= CREAK_EVERY_M) { audio.creak(0.5); stairM -= CREAK_EVERY_M; }
      } else stairM = 0;

      if (attic && x >= attic.minX && x <= attic.maxX && z >= attic.minZ && z <= attic.maxZ) {
        if (moved / dt > WALKING) {
          atticS += dt;
          if (atticS >= ATTIC_CREAK_S) { audio.creak(0.35); atticS -= ATTIC_CREAK_S; }
        }
      } else atticS = 0;
    },
    dispose() {},
  };
}
