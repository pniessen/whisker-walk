// The Market's autopilot (step 2, Task 14): drives a tour of MARKET_TOURS
// (below), one call a frame BEFORE the frame, through a small driver.
// verify-market.html (the owner's film) and test/marketlive.test.js (the
// headless check that both tours finish and pay what the film shows) hand it
// their own driver; the pilot is the same code for both. Not part of the
// game's build: no three.js, nothing drawn, no rng. The tours live here too
// (film-only data, English captions), so the game's Market chunk never ships
// them.
//
// createMarketPilot(tour) → { step(dt, driver) → { done, failed, caption, tally, view } }
//   tour     { start, steps, partner? }: MARKET_TOURS[name]. `partner` is a
//            second cat's own script ({ id, name, start, steps }), stepped
//            beside hers every frame; the tour is done when hers is.
//   driver   what the pilot reads and pushes:
//     pos(who)                        { x, z } of her cat ('me') or the partner (its id)
//     move(who, dx, dz, speed, crouch) that cat walks along (dx, dz) at `speed` m/s
//                                     from this frame on (speed 0: she stands), crouched or not
//     stall(id)                       that stall's StallLive (marketlive.js)
//     reach()                         the stall whose treat her cat could grab now (the
//                                     prompt's: live.actionFor), or null
//     press()                         the action button on that grab: act's answer
//     events                          her device's events so far, in order (read only)
//   failed   null, or the index (in her script, or 'partner:<i>') of a step that
//            ran past STEP_LIMIT or got stuck (a walk that stopped getting
//            anywhere for STUCK_S); done is then true and both cats stand.
//   view     the latest { view } step's value (the page's camera; the pilot
//            does nothing with it).
//
// A STEP is one of
//   { say: 'caption', tally }          the page's caption from here on (page-only English);
//                                      tally: true, the page adds her treats tally to it
//   { view: ... }                      a camera hint for the page
//   { walk: [x, z], pace, stopOn }     walk at PACE[pace] (default 'walk'; 'creep' is
//                                      crouched) until she is there; stopOn: 'shoo' also
//                                      ends it at her cat's next shoo
//   { until: { stall, phase, bubble, watching, cooing } }   stand until that stall
//                                      shows every one given (cooing: a cat's id)
//   { wait: s }                        stand s seconds
//   { grab: stallId, pace }            walk at that stall's treat until it is in
//                                      reach, then press once: done when the press
//                                      is taken, failed when it is refused (a shoo)
import { stallById, fromStall, MARKET_SPAWN } from './marketplan.js';

const freeze = Object.freeze;

export const PACE = Object.freeze({ walk: 2.4, creep: 0.9, dash: 3.4 }); // m/s
export const ARRIVE_R = 0.05; // m
export const STEP_LIMIT = 20; // s: a step that takes longer fails the tour
export const STUCK_S = 1.5; // s: a walk that has not got 5 cm nearer in this long is stuck
const EPS = 1e-9;

function lane(steps, who) {
  return { steps, who, index: 0, time: 0, best: Infinity, bestT: 0, shoos: -1, done: false, failed: null };
}

const matches = (st, want) => !!st
  && (want.phase === undefined || st.phase === want.phase)
  && (want.bubble === undefined || st.bubble === want.bubble)
  && (want.watching === undefined || st.watching === want.watching)
  && (want.cooing === undefined || (st.cooing?.who ?? null) === want.cooing);

const shoosOf = (events) => {
  let n = 0;
  for (const e of events) if (e.type === 'shoo' && e.who === 'me') n++;
  return n;
};

export function createMarketPilot(tour) {
  const result = { done: false, failed: null, caption: null, tally: false, view: null };
  const lanes = [lane(tour.steps, 'me')];
  if (tour.partner) lanes.push(lane(tour.partner.steps, tour.partner.id));

  const stand = (L, driver) => driver.move(L.who, 0, 0, 0, false);
  function next(L) {
    L.index++;
    L.time = 0;
    L.best = Infinity;
    L.bestT = 0;
    L.shoos = -1;
  }
  const failName = (L) => (L.who === 'me' ? L.index : `partner:${L.index}`);
  function fail(L, driver) {
    result.failed = failName(L);
    result.done = true;
    for (const l of lanes) stand(l, driver);
  }

  // Push toward (tx, tz) at `speed`, never past it. True once there. A walk
  // that has stopped getting nearer for STUCK_S fails the tour.
  function walkTo(L, tx, tz, speed, crouch, dt, driver, reach = ARRIVE_R) {
    const p = driver.pos(L.who);
    const dx = tx - p.x, dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    if (d <= reach + EPS) {
      stand(L, driver);
      return true;
    }
    if (d < L.best - 0.05) { L.best = d; L.bestT = L.time; }
    else if (L.time - L.bestT > STUCK_S) { L.stuck = true; return false; }
    driver.move(L.who, dx / d, dz / d, Math.min(speed, (d - reach * 0.5) / Math.max(dt, EPS)), crouch);
    return false;
  }

  function stepLane(L, dt, driver) {
    if (L.done) return;
    // the instant steps: a caption, a camera hint
    while (L.index < L.steps.length && (L.steps[L.index].say !== undefined || L.steps[L.index].view !== undefined)) {
      const s = L.steps[L.index];
      if (L.who === 'me') {
        if (s.say !== undefined) { result.caption = s.say; result.tally = s.tally === true; }
        if (s.view !== undefined) result.view = s.view;
      }
      next(L);
    }
    if (L.index >= L.steps.length) {
      L.done = true;
      stand(L, driver);
      return;
    }
    L.time += dt > 0 ? dt : 0;
    if (L.time > STEP_LIMIT) { fail(L, driver); return; }
    const s = L.steps[L.index];
    let over = false;
    L.stuck = false;
    if (s.walk) {
      if (L.shoos < 0) L.shoos = shoosOf(driver.events);
      if (s.stopOn === 'shoo' && shoosOf(driver.events) > L.shoos) { stand(L, driver); over = true; }
      else {
        const pace = s.pace ?? 'walk';
        over = walkTo(L, s.walk[0], s.walk[1], PACE[pace], pace === 'creep', dt, driver);
      }
    } else if (s.grab) {
      if (driver.reach() === s.grab) {
        stand(L, driver);
        const took = driver.press();
        if (took !== true) { fail(L, driver); return; }
        over = true;
      } else {
        const t = stallById(s.grab).treat;
        const pace = s.pace ?? 'walk';
        // on toward the treat; its stand stops her short of it, so 'there' is never asked
        walkTo(L, t.x, t.z, PACE[pace], pace === 'creep', dt, driver, 0);
      }
    } else if (s.until) {
      stand(L, driver);
      over = matches(driver.stall(s.until.stall), s.until);
    } else if (s.wait !== undefined) {
      stand(L, driver);
      over = L.time >= s.wait - EPS;
    } else throw new Error(`a Market tour step the pilot does not know: ${JSON.stringify(s)}`);
    if (L.stuck) { fail(L, driver); return; }
    if (over) next(L);
  }

  return {
    step(dt, driver) {
      if (result.done) return result;
      for (const L of lanes) {
        stepLane(L, dt, driver);
        if (result.done) return result;
      }
      if (lanes[0].done) {
        result.done = true;
        for (const L of lanes) stand(L, driver);
      }
      return result;
    },
  };
}

// THE TOURS (Task 14): the owner's two films, driven by createMarketPilot
// (above) on verify-market.html (?live=1&drive=1, __tour(name)) and,
// headless, by test/marketlive.test.js through the rig with the same pilot.
// Every point comes from a stall's own frame (fromStall), so a tour follows a
// stall that moves. Each tour has its seed and its start clock (the time of
// day the rhythm reads), so the film and the test see the same stallholders.
// The step kinds are the pilot's (above); `view` is the page's camera ('follow',
// behind her; { stall }, her and that stallholder in one frame; { stall, wide },
// a still camera out in front of that stall, the hide's side).
const at = (id, lx, lz) => {
  const p = fromStall(stallById(id), lx, lz);
  return freeze([+p.x.toFixed(3), +p.z.toFixed(3)]);
};
// a stall's hide, and the creep in from it: out past the corner post, then at the treat
const hideOf = (id) => freeze([stallById(id).hide.x, stallById(id).hide.z]);
const creepIn = (id) => { const s = stallById(id); return at(id, s.w / 2 + 0.5, s.d / 2 + 0.6); };
// where she takes a treat to munch it: out past the hide's side of the zone, toward the camera
const munchSpot = (id) => { const s = stallById(id); return at(id, s.w / 2 + 1.3, s.d / 2 + 1.8); };
const steps = (list) => freeze(list.map(freeze));
const BAKER = stallById('baker');
// the baker's view: from out in front, a little off the middle on the side
// she walks in from, her walk in, the counter and her dash to the hide in one
// frame (the north-west lamp post, MARKET_LAMPS, off to the right, not in the way)
const BAKER_VIEW = freeze({ stall: 'baker', eye: freeze([-1.0, BAKER.d / 2 + 7.5, 2.6]), at: freeze([-0.4, BAKER.d / 2 + 0.4]) });
const CHEESE = stallById('cheese');
export const MARKET_TOURS = freeze({
  // From the spawn the café crumbs; the fishmonger's hide, the bubble, the creep
  // in, the grab and the munch; then the baker walked straight into while
  // watched (the shoo, the broom, the hop back), a dash under the trestle, the
  // wait, the grab. Ends with 3 treats and one shoo.
  sneak: freeze({
    seed: 7,
    clock: 36000,
    start: freeze({ x: MARKET_SPAWN.x, z: MARKET_SPAWN.z, face: freeze([0, -1]) }),
    steps: steps([
      { view: 'follow' }, { say: 'The café crumbs first: nobody minds those' }, { grab: 'cafe' }, { wait: 2.2 },
      { say: 'Now the fish stall: under the trestle to hide' }, { view: { stall: 'fish' } }, { walk: hideOf('fish') },
      { say: 'Watch the fishmonger…' }, { until: { stall: 'fish', phase: 'serve' } }, { until: { stall: 'fish', bubble: true } },
      { say: 'The busy bubble! They are about to turn round' }, { until: { stall: 'fish', watching: false } },
      { say: 'Turned away: creep in and grab it!' }, { walk: creepIn('fish'), pace: 'creep' }, { grab: 'fish', pace: 'creep' },
      { say: 'Got it! Munch, munch' }, { walk: munchSpot('fish') }, { wait: 1.6 },
      { say: 'Over to the baker' }, { walk: at('fish', 1.6, 5.2) }, { view: 'follow' }, { walk: [-4, -4] }, { walk: at('baker', -3.0, BAKER.d / 2 + 3.4) },
      { view: BAKER_VIEW },
      { say: 'What if she just walks straight in?' }, { until: { stall: 'baker', phase: 'serve' } },
      { walk: [BAKER.treat.x, BAKER.treat.z], stopOn: 'shoo' }, { say: 'Spotted!' }, { wait: 1.0 },
      { say: 'Dash under the trestle!' }, { walk: at('baker', BAKER.w / 2 + 1.3, BAKER.d / 2 + 3.2), pace: 'dash' }, { walk: hideOf('baker'), pace: 'dash' },
      { say: 'Wait for the bubble…' }, { until: { stall: 'baker', bubble: true } }, { until: { stall: 'baker', watching: false } },
      { say: 'Now!' }, { walk: creepIn('baker'), pace: 'creep' }, { grab: 'baker', pace: 'creep' },
      { say: 'A sausage roll!' }, { walk: munchSpot('baker') }, { wait: 1.6 },
      { say: 'Treats this walk:', tally: true }, { wait: 2.0 },
    ]),
  }),
  // A partner cat walks along the cheese stall's front and stops there: the
  // stallholder turns to her and coos, and while it does, her cat comes round
  // to the hide and creeps in for the cheddar. Her device pays her the treat
  // (and says who kept them busy); the partner's pays the teamwork.
  team: freeze({
    seed: 7,
    clock: 36004,
    start: freeze({ x: at('cheese', 1.5, 6.4)[0], z: at('cheese', 1.5, 6.4)[1], face: freeze([CHEESE.face.x * -1, CHEESE.face.z * -1]) }),
    me: freeze({ id: 'mittens', name: 'Mittens' }), // her cat, as the partner's device knows her
    partner: freeze({
      id: 'biscuit',
      name: 'Biscuit',
      start: freeze({ x: at('cheese', -0.6, 6.9)[0], z: at('cheese', -0.6, 6.9)[1] }),
      steps: steps([
        { wait: 0.8 }, { walk: at('cheese', -CHEESE.w / 2 - 2.6, CHEESE.d / 2 + 4.6) }, { walk: at('cheese', -CHEESE.w / 2 - 2.2, CHEESE.d / 2 + 1.1) },
        { walk: at('cheese', -CHEESE.w / 2 - 0.8, CHEESE.d / 2 + 1.1) }, { wait: 12 },
      ]),
    }),
    steps: steps([
      { view: { stall: 'cheese', wide: true, eye: [CHEESE.w / 2 + 1.8, CHEESE.d / 2 + 4.8, 2.3] } }, { say: 'Teamwork at the cheese stall' },
      { walk: at('cheese', CHEESE.w / 2 + 2.5, CHEESE.d / 2 + 4.1) }, { walk: hideOf('cheese') },
      { say: 'Biscuit stops right in front…' }, { until: { stall: 'cheese', cooing: 'biscuit' } },
      { say: '…and while they coo at her, round the side!' }, { walk: creepIn('cheese'), pace: 'creep' }, { grab: 'cheese', pace: 'creep' },
      { say: 'The cheddar! Teamwork!' }, { walk: munchSpot('cheese') }, { wait: 4.5 },
    ]),
  }),
});
