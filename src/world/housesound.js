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

export function createHouseSound(audio, { clock, stairs, attic }) {
  // each stair's footprint as numbers: x and z ranges
  const rects = stairs.map((s) => {
    const hw = s.width / 2;
    const alongZ = Math.abs(s.z1 - s.z0) >= Math.abs(s.x1 - s.x0);
    return alongZ
      ? { x0: s.x0 - hw, x1: s.x0 + hw, z0: Math.min(s.z0, s.z1), z1: Math.max(s.z0, s.z1) }
      : { x0: Math.min(s.x0, s.x1), x1: Math.max(s.x0, s.x1), z0: s.z0 - hw, z1: s.z0 + hw };
  });
  let seen = false, px = 0, pz = 0;
  let tickIn = 0, stairM = 0, atticS = 0;

  return {
    update(dt, t, catPos) {
      if (!audio || !(dt > 0)) return;
      const x = catPos.x, z = catPos.z;
      const step = seen ? Math.hypot(x - px, z - pz) : 0;
      const moved = step < JUMP ? step : 0;
      seen = true;
      px = x;
      pz = z;

      const d = clock ? Math.hypot(x - clock.x, z - clock.z) : Infinity; // a plan without a clock never ticks
      if (d < TICK_R) {
        if (tickIn <= 0) { audio.tick(0.6 * (1 - d / TICK_R)); tickIn += 1; }
        tickIn -= dt;
      } else tickIn = 0;

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
