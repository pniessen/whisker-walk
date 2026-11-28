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

// beauty pass 5 (2026-11-28): SOUND BEDS that cross-fade by room, and the front door's arrival. Each bed is a few quiet events on a fixed pattern of gaps (all through the game's audio object,
// by optional calls), its loudness the listener's smooth blend (bedWeight: 1 at the bed's heart, easing to 0 at its edge, on its own floor), so walking from one room to the next fades one
// out as the other comes in. The kitchen's kettle and wall clock, the parlour's hearth (the pops above, now scaled by the house's one rhythm), the attic's creak on the draught's gusts, and the
// garden through the front windows: birds by day, crickets at night, hushed in a strong gust and in rain. `rhythm` is houseglow.js's {day, lamp, fire}; `gust` the shared draught (0.2..1).
export const BEDS = Object.freeze([
  Object.freeze({ id: 'kitchen', x: 9, z: -3, y: 0, r: 7.5 }),
  Object.freeze({ id: 'parlour', x: 11, z: 7, y: 0, r: 7 }),
  Object.freeze({ id: 'attic', x: -19, z: -11, y: 4.2, r: 8 }),
  Object.freeze({ id: 'garden', x: 0, z: 12, y: 0, r: 8.5 }),
]);
export function bedWeight(bed, x, y, z) {
  if (Math.abs(y - bed.y) > 2.2) return 0;
  const u = Math.max(0, 1 - Math.hypot(x - bed.x, z - bed.z) / bed.r);
  return u * u * (3 - 2 * u);
}
const KETTLE = Object.freeze([[300, 0], [360, 0.07], [330, 0.14]].map(([freq, at]) => Object.freeze({ freq, at, dur: 0.07 })));
const WHISTLE = Object.freeze([[1320, 0], [1480, 0.25], [1400, 0.55]].map(([freq, at]) => Object.freeze({ freq, at, dur: 0.5 })));
const ATTIC_GAPS = Object.freeze([6.5, 9, 7.5]);
const BIRD_GAPS = Object.freeze([4.7, 6.1, 3.9, 8.3]);
const CRICKET_GAPS = Object.freeze([0.9, 0.2, 0.2, 1.1]);
export const ARRIVE_CREAK_AT = 0.15;
export const ARRIVE_CHIME_AT = 0.9; // the hall clock's ding, then its dong 0.7 s later

export function createHouseSound(audio, { clock, stairs, attic, fire = null, wood = null, rain = false, part = null, rhythm = null, gust = null }) {
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
  let bedIn = [0.5, 0, 6, 3], atticK = 0, birdK = 0, cricketK = 0, kettleN = 0, simmer = 1.2, clockIn = 1, door = null, arr = -1, arrStage = 0;

  // the beds' events, each on its own timer, scaled by how near she is to it (bedWeight), by the house's rhythm and by the draught
  function bedsUpdate(dt, x, y, z, calm) {
    const q = calm ? 0.5 : 1;
    const g = gust ? gust(t0) : 0.6;
    t0 += dt;
    const wK = bedWeight(BEDS[0], x, y, z), wA = bedWeight(BEDS[2], x, y, z), wG = bedWeight(BEDS[3], x, y, z);
    if (wK > 0.02) {
      clockIn -= dt;
      if (clockIn <= 0) { clockIn += 1; audio.tick?.(0.34 * wK * q); }
      simmer -= dt;
      if (simmer <= 0) {
        simmer += 3.1;
        audio.playTune?.(KETTLE, 0.7 * wK * q);
        if (++kettleN % 15 === 0 && rhythm.day < 0.95) audio.playTune?.(WHISTLE, 0.16 * wK * q); // now and then the kettle sings, in the morning and the evening
      }
    }
    if (wA > 0.02) { bedIn[2] -= dt; if (bedIn[2] <= 0) { bedIn[2] += ATTIC_GAPS[atticK++ % 3]; audio.creak?.(0.34 * wA * g * q); } }
    if (wG > 0.02 && !rain && g < 0.9) {
      bedIn[3] -= dt;
      if (bedIn[3] <= 0) {
        if (rhythm.day > 0.5) { bedIn[3] += BIRD_GAPS[birdK++ % 4]; audio.peep?.(0.55 * wG * rhythm.day * q); }
        else { bedIn[3] += CRICKET_GAPS[cricketK++ % 4]; if (!part || part.night) audio.tick?.(0.2 * wG * q); else bedIn[3] += 3; }
      }
    }
  }
  let t0 = 0;

  return {
    get burst() { return burst; },
    /** the front door's arrival, as she comes in: its creak, then the hall clock's chime (a few seconds of quiet events, from now). */
    arrive() { arr = 0; arrStage = 0; },
    update(dt, t, catPos, calm = false, doorOpen = null) {
      burst = Math.max(0, burst - dt * 2.8);
      if (!audio || !(dt > 0)) return;
      const x = catPos.x, z = catPos.z;
      const step = seen ? Math.hypot(x - px, z - pz) : 0;
      const moved = step < JUMP ? step : 0;
      seen = true;
      px = x;
      pz = z;

      if (arr >= 0) {
        arr += dt;
        if (arrStage === 0 && arr >= ARRIVE_CREAK_AT) { arrStage = 1; audio.creak?.(0.5); }
        if (arrStage === 1 && arr >= ARRIVE_CHIME_AT) { arrStage = 2; audio.chime?.(); }
        if (arrStage === 2 && arr >= ARRIVE_CHIME_AT + 0.7) { arr = -1; audio.chime?.(); }
      }
      if (doorOpen !== null) { if (door !== null && door !== doorOpen) audio.creak?.(0.32); door = doorOpen; } // the front door swings: it creaks each way
      if (rhythm) bedsUpdate(dt, x, catPos.y ?? 0, z, calm);
      const d = clock ? Math.hypot(x - clock.x, z - clock.z) : Infinity; // a plan without a clock never ticks
      if (d < TICK_R) {
        if (tickIn <= 0) { audio.tick?.(0.6 * (1 - d / TICK_R) * (calm ? 0.5 : 1)); tickIn += 1; }
        tickIn -= dt;
      } else tickIn = 0;

      if (fire) {
        const f = Math.hypot(x - fire.x, z - fire.z);
        if (f < POP_R) {
          popIn -= dt;
          if (popIn <= 0) { audio.tick?.(0.9 * (1 - f / POP_R) * (calm ? 0.5 : 1) * (rhythm ? rhythm.fire : 1)); popIn += POP_GAPS[popK++ % POP_GAPS.length]; burst = Math.max(burst, 1 - 0.7 * (f / POP_R)); }
        }
      }
      settleIn -= dt * (part?.night ? 2 : 1);
      if (settleIn <= 0) { audio.creak?.(0.22); settleIn += SETTLE_S; }
      if (wood) {
        let on = false;
        for (let i = 0; i < wood.length; i++) { const r = wood[i]; if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) { on = true; break; } }
        if (on) { woodM += moved; if (woodM >= WOOD_EVERY_M) { audio.creak?.(0.12); woodM -= WOOD_EVERY_M; } } else woodM = 0;
      }
      if (rain) {
        rainIn -= dt;
        while (rainIn <= 0) { audio.tick?.(attic && x >= attic.minX && x <= attic.maxX && z >= attic.minZ && z <= attic.maxZ ? 0.55 : 0.28); rainIn += RAIN_GAPS[rainK++ % RAIN_GAPS.length]; }
      }
      if (part && !part.night && part.lampK < 0.45 && part.sunK < 0.9 && !rain && audio.peep) {
        morningIn -= dt;
        if (morningIn <= 0) { audio.peep?.(0.25); morningIn += MORNING_S; }
      }

      let onStair = false;
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) { onStair = true; break; }
      }
      if (onStair) {
        stairM += moved;
        if (stairM >= CREAK_EVERY_M) { audio.creak?.(0.5); stairM -= CREAK_EVERY_M; }
      } else stairM = 0;

      if (attic && x >= attic.minX && x <= attic.maxX && z >= attic.minZ && z <= attic.maxZ) {
        if (moved / dt > WALKING) {
          atticS += dt;
          if (atticS >= ATTIC_CREAK_S) { audio.creak?.(0.35); atticS -= ATTIC_CREAK_S; }
        }
      } else atticS = 0;
    },
    dispose() {},
  };
}
