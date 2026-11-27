// =============================================================================
// THE ECHO DEEP: TINK, THE LOST BABY CHIME-BAT (second story, C1). Pure data and pure moves (no THREE, no clock, no random number). A shy follower copied from crystalstory.js lumiStep (that
// tested file stays as it is) with his own distances. He stays on the floor plane in the plan (the drawing bobs him a little over it); he is never lost: next walk he is at his nest (found not
// yet, or found but not home) or at his nook (home). Nothing about him is saved while he follows. The numbers marked "start" are tuned from pictures; C2"s hall must keep the nest clear.
// =============================================================================
// (it imports nothing: the deep stage then shares no chunk with stage A. The caller passes the colliders: crystalstory.js storyColliders().)

export const NEST = Object.freeze({ x: -28, z: -29.4, reach: 2.4 }); // start: on the nest ledge at the back of the Deep Hall (hall middle (-28, -27), radius 4.5)
export const NOOK = Object.freeze({ x: -16, z: 4, reach: 2.6 }); // start: the hanging-crystal nook on the entry-hall side of the Rose hall; he is walked here
export const TINK = Object.freeze({
  radius: 0.22,
  reach: 2.6, // she can greet him (Interact) from this far
  speed: 1.9, // m/s fluttering along
  maxSpeed: 4.6,
  far: 5.2, // farther than this and he hurries after her
  near: 3, // he stops when this close (shy)
  shy: 1.6, // closer than this and he backs off a little
});
export const HOME_REACH = 2.6; // she is "at the nook" within this of it, with Tink beside her

/** Where he is when a walk begins: the nest until he is home, the nook after. `bits` is state.crystal.deep. */
export const startSpot = (bits) => ((bits | 0) & 8 ? NOOK : NEST);
/** He is "home" when he stands within HOME_REACH of the nook. */
export const atNook = (m) => Math.hypot(m.x - NOOK.x, m.z - NOOK.z) <= HOME_REACH;

export const BOUNDS = Object.freeze({ minX: -36, maxX: 36, minZ: -32, maxZ: 32 }); // the cave bounds (crystalplan.js CRYSTAL_BOUNDS; the test holds them equal)
/** Push a point out of the colliders and in from the walk edge (the same rule as crystalstory.js pushOut). */
function pushOut(p, colliders, pad) {
  for (let pass = 0; pass < 2; pass++) {
    for (const c of colliders) {
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      const need = c.r + pad;
      const d2 = dx * dx + dz * dz;
      if (d2 >= need * need) continue;
      const d = Math.sqrt(d2);
      p.x = c.x + (d > 1e-9 ? dx / d : 1) * need;
      p.z = c.z + (d > 1e-9 ? dz / d : 0) * need;
    }
  }
  p.x = Math.min(BOUNDS.maxX - 0.5, Math.max(BOUNDS.minX + 0.5, p.x));
  p.z = Math.min(BOUNDS.maxZ - 0.5, Math.max(BOUNDS.minZ + 0.5, p.z));
}

/** One step of Tink, in place: m = { x, z, yaw, moving }. `follow` false: he stays where he is. Shy, never rushed, never past the floor. */
export function tinkStep(m, cat, dt, { follow = true, colliders = [] } = {}) {
  const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
  m.moving = false;
  if (!follow || !cat || step === 0) return m;
  const dx = cat.x - m.x;
  const dz = cat.z - m.z;
  const d = Math.hypot(dx, dz);
  let dir = 0;
  let speed = TINK.speed;
  if (d > TINK.far || (m.chasing && d > TINK.near)) {
    dir = 1;
    m.chasing = true;
    speed = Math.min(TINK.maxSpeed, TINK.speed + Math.max(0, d - TINK.far) * 0.5);
  } else if (d < TINK.shy) {
    dir = -1;
    speed = 1.2;
    m.chasing = false;
  } else m.chasing = false;
  if (dir === 0 || d < 1e-6) return m;
  m.yaw = Math.atan2(dx * dir, dz * dir);
  m.x += (dx / d) * dir * speed * step;
  m.z += (dz / d) * dir * speed * step;
  pushOut(m, colliders, TINK.radius);
  m.moving = true;
  return m;
}

// A flutter in place for the drawing: a height over the floor in metres (still under reduced motion).
export const bob = (t, still = false) => (still ? 0.55 : 0.55 + 0.08 * Math.sin(t * 2.1));
