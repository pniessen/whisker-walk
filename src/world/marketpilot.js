// The Market's autopilot (step 2, Task 14): drives a tour of marketplan.js's
// MARKET_TOURS, one call a frame BEFORE the frame, through a small driver.
// verify-market.html (the owner's film) and test/marketlive.test.js (the
// headless check that both tours finish and pay what the film shows) hand it
// their own driver; the pilot is the same code for both. Not part of the
// game's build: no three.js, nothing drawn, no rng.
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
import { stallById } from './marketplan.js';

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
