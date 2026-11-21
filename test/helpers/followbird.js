// Following a bird by the moves alone (Rooftops step 3): the stick and the
// jump button a child would use to go after a bird, for the tests that show
// the guide pigeon leads her up (test/roofsbirds.test.js). Called every frame,
// BEFORE the walk's frame, on test/helpers/traversalwalk.js's yardWalk.
//
// The bird's perch is where it sits, or where it is flying to. Then:
//   * the bird on her level, or she on a crossing: push toward the bird;
//   * the bird at a crossing's end whose other end is on her level: walk to
//     that end, then push toward the bird (she gets on and walks it);
//   * otherwise, take the climb or leap (no skill needed) whose take-off is on
//     her level and whose landing is nearest the bird: walk to its take-off;
//     within NEAR, face along it and press jump (at most every JUMP_EVERY s).
// A held stick is turned by the view's yaw of the frame it was first pushed
// under, kept while she is on a crossing and after she steps off one with it
// still held, as the game turns it (createYardPilot does the same).
import { facingYaw, stickToWorld } from '../../src/traversal.js';
import { perchIndex } from '../../src/world/roofsflock.js';

export const NEAR = 0.45; // m from a take-off to jump
export const JUMP_EVERY = 0.5; // s between presses
const LEVEL = 0.3; // m: on her level
const AT_END = 0.4; // m from a crossing's end to turn along it

const states = new WeakMap();

function stateOf(w, area) {
  let st = states.get(w);
  if (!st) {
    st = { index: perchIndex(area.birdPerches), since: Infinity, holding: false, frozen: false, holdYaw: 0, stick: { x: 0, z: 0 }, touch: { x: 0, z: 0, mag: 1 } };
    states.set(w, st);
  }
  return st;
}

function release(w, st) {
  w.player.setTouchMove(null);
  st.holding = false;
  st.frozen = false;
}

function push(w, st, tx, tz) {
  const p = w.cat.position;
  const dx = tx - p.x;
  const dz = tz - p.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) return release(w, st);
  if (w.live.crossing) st.frozen = true;
  if (!st.holding || !st.frozen) st.holdYaw = w.player.viewYaw();
  st.holding = true;
  stickToWorld(dx / d, dz / d, -st.holdYaw, st.stick);
  st.touch.x = st.stick.x;
  st.touch.z = st.stick.z;
  w.player.setTouchMove(st.touch);
}

// followBird(w, getBird, area, dt): `getBird()` gives the bird's live state
// (roofsbirds.js: { at, flying, to }); `area` the built Rooftops.
export function followBird(w, getBird, area, dt = 1 / 30) {
  const st = stateOf(w, area);
  st.since += dt;
  if (w.live.hop || w.live.looking) return release(w, st);
  const b = getBird();
  const bird = st.index.get(b.flying ? b.to : b.at);
  const g = area.ground;
  const p = w.cat.position;
  const mine = g.y(p.x, p.z);
  const birdGround = g.y(bird.x, bird.z);
  const onMyLevel = (y) => Math.abs(y - mine) <= LEVEL;
  if (w.live.crossing || (Math.abs(bird.y - birdGround) <= LEVEL && onMyLevel(birdGround))) return push(w, st, bird.x, bird.z);

  for (const c of area.traversal.crossings) {
    const k = c.ends.findIndex((e) => Math.hypot(e.x - bird.x, e.z - bird.z) < 0.5 && Math.abs(e.y - bird.y) <= LEVEL);
    if (k < 0) continue;
    const e = c.ends[1 - k];
    if (!onMyLevel(e.y)) continue;
    if (Math.hypot(e.x - p.x, e.z - p.z) > AT_END) return push(w, st, e.x, e.z);
    return push(w, st, bird.x, bird.z);
  }

  let best = null;
  let bestD = Infinity;
  for (const h of area.traversal.hops) {
    if ((h.kind !== 'climb' && h.kind !== 'leap') || h.requires || !onMyLevel(h.y0)) continue;
    const d = Math.hypot(h.x1 - bird.x, h.y1 - bird.y, h.z1 - bird.z);
    if (d < bestD) { best = h; bestD = d; }
  }
  if (!best) return push(w, st, bird.x, bird.z);
  if (Math.hypot(best.x0 - p.x, best.z0 - p.z) > NEAR) return push(w, st, best.x0, best.z0);
  release(w, st);
  w.cat.rotation.y = facingYaw(best.x1 - best.x0, best.z1 - best.z0);
  if (st.since >= JUMP_EVERY) {
    w.jump();
    st.since = 0;
  }
}
