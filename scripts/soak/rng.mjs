// A small seeded PRNG (mulberry32) for the soak bot. The same function is
// copied into the in-page bot (pagebot.js); a test pins that both give the
// same numbers for the same seed, so a crash's seed replays the same inputs.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
