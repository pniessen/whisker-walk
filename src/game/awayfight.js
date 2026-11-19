// Away fights with the home clan's roaming cats (2026-11-19; the rules and the
// numbers are in src/awayfights.js and the amendment of that date in
// docs/superpowers/specs/2026-10-31-clan-life-design.md). This widens the
// border patrol fight (borderfight.js): the offer, the rounds, the camera, the
// sheet, the award and the words are the patrol's, through the same
// createClanFight. Three pieces:
//
//   createAwayFoes  the roaming cats as the fight's `intruders` (one
//                   challenger at a time): it notices her, flips each cat's
//                   coin once (the ledger), shows a cat that lets her pass
//                   looking and turning away, walks a challenger up to her,
//                   stands it in the fight, and runs the chase-off.
//   createAwayFight the patrol's fight options over those foes.
//   joinFights      the patrol's fight and this one as the walk's one
//                   session.clanFight: only one of them is ever up.
//
// THE CHASE-OFF. A border patrol chases her out over its camp's ring. A
// roaming cat meets her out on the land, where there is no ring to cross, so
// its chase is the same scamper (same time, same gait, session.chasing) to a
// spot AWAY_CHASE_DIST metres away from the cat (awayfights.awayLanding).
// Like the patrol's it moves her cat and says one line; it takes nothing.
//
// NOTHING STORED, NOTHING ON THE WIRE. Like clanfight.js this is handed no
// progression: a win is reported through the fight's onWon (fightrecord.js).
// It sends no network event: a co-walker's screen is not told of the fight.
// The cats are moved through clancats.js's setLead, as the first camp walk's
// guide is, so a cat let go walks home by itself.
import { createClanFight } from './clanfight.js';
import { BORDER_CHALLENGE_WAIT, BORDER_ASK, borderWords } from './borderfight.js';
import { NOTICE_DIST, SCAMPER_TIME, SCAMPER_TIME_REDUCED } from '../rivalcats.js';
import { canChallengeRank, awayLanding } from '../awayfights.js';

// A roaming cat notices her this close (the border patrol's distance).
export const AWAY_NOTICE = NOTICE_DIST;
// The offer opens while she is within this of the challenger: a little more
// than the notice distance, so one step back does not lose it.
export const AWAY_ASK_RANGE = 6;
// The challenger walks up to this far from her, then stands.
export const AWAY_STAND = 2.2;
const APPROACH_SPEED = 2.5;  // m/s, its walk up to her
const DASH_SPEED = 7;        // m/s, its dash after her in the chase-off (the patrol's)
const DASH_STOP = 1.1;       // m short of her it stops
const UNANSWERED = 0.5;      // s with no offer showing before the challenger gives up
const GLANCE_LOOK = 0.9;     // s a cat that lets her pass looks at her
const GLANCE_TURN = 0.8;     // s it then turns (and, wary, steps) away
const WARY_SPEED = 1.2;      // m/s of a wary cat's steps back

const smooth = (u) => u * u * (3 - 2 * u);
const yawToward = (x, z, tx, tz) => Math.atan2(tx - x, tz - z) + Math.PI;

// opts:
//   clanCats      the walk's clan cats (clancats.js): list, setLead.
//   ledger        awayfights.createAwayLedger.
//   canStart(s)   may a cat notice or challenge her now? (walk.js: on clan
//                 ground outside the camp, nothing else going on.)
//   canChase(s)   may she be chased now? (rivalcats.chaseAllowed.)
//   engaged()     is this fight's offer or fight showing?
//   landingOk(from, x, z)  may the chase-off set her down at (x, z)?
//   terrain       the walk's ground (src/ground.js), or null.
//   onDecide(cat, decision, wins)  a cat has just decided ('fight' | 'pass').
//   onChase(name) / onSettled()    the chase-off starts / ends.
//   measure(group) / setScars(group, scars)  the THREE-side helpers.
export function createAwayFoes({
  clanCats, ledger,
  canStart = () => true, canChase = () => true, engaged = () => false,
  landingOk = () => true, terrain = null, reducedMotion = false,
  onDecide = () => {}, onChase = () => {}, onSettled = () => {},
  measure = () => null, setScars = () => {},
}) {
  const T = terrain && !terrain.flat ? terrain : null;
  const groundY = (x, z) => (typeof terrain?.y === 'function' ? terrain.y(x, z) : 0);
  let active = null;        // the challenger, or null
  let mode = 'idle';        // 'idle' | 'ask' | 'fight' | 'after' | 'scamper'
  let face = null;          // who a fighting cat faces
  let stage = null;         // the fight's staging of it
  let pendingChase = false; // chaseNow(): the chase-off on the next update
  let idleT = 0;            // s the challenger has stood with no offer up
  let sc = null;            // the scamper
  let lastCat = null;
  const glances = new Map(); // cat -> { t, wary, done }
  const out = { pose: 'follow', speed: 0, lift: 0, staged: false };
  const spot = { x: 0, z: 0 };
  const byId = (id) => clanCats.list.find((c) => c.id === id) ?? null;

  // A led cat's step toward (or, sign -1, away from) a point, on clan ground.
  function stepBy(c, holdStep, ux, uz, len) {
    const p = c.group.position;
    spot.x = p.x + ux * len;
    spot.z = p.z + uz * len;
    holdStep(c, spot, p.x, p.z);
    const moved = Math.hypot(spot.x - p.x, spot.z - p.z);
    p.x = spot.x;
    p.z = spot.z;
    return moved;
  }

  // The challenger, each frame (clancats.js calls this for a led cat).
  function lead(c, dt, catPos, holdStep) {
    const g = c.group;
    const p = g.position;
    if (mode === 'fight') {
      g.rotation.order = 'YXZ';
      if (stage) {
        p.x = stage.x;
        p.z = stage.z;
        g.rotation.x = stage.pitch;
        g.rotation.z = stage.roll;
      } else {
        g.rotation.x = 0;
        g.rotation.z = 0;
      }
      if (face && Math.hypot(face.x - p.x, face.z - p.z) > 1e-3) g.rotation.y = yawToward(p.x, p.z, face.x, face.z);
      out.pose = stage ? stage.pose : 'cross';
      out.speed = 0;
      out.lift = stage ? stage.y : 0;
      out.staged = true;
      return out;
    }
    out.lift = 0;
    out.staged = false;
    out.pose = 'cross';
    out.speed = 0;
    const to = catPos ?? lastCat;
    if (!to) return out;
    const dx = to.x - p.x;
    const dz = to.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > 1e-3) g.rotation.y = yawToward(p.x, p.z, to.x, to.z);
    const stop = mode === 'scamper' ? DASH_STOP : AWAY_STAND;
    const v = mode === 'scamper' ? (reducedMotion ? 0 : DASH_SPEED) : mode === 'ask' ? APPROACH_SPEED : 0;
    if (v > 0 && d > stop && dt > 0) {
      const moved = stepBy(c, holdStep, dx / d, dz / d, Math.min(v * dt, d - stop));
      if (moved > 1e-6) { out.pose = 'follow'; out.speed = v; }
    }
    return out;
  }

  // A cat that lets her pass: it looks at her, then turns away (a wary one,
  // after she has won a fight, flinches and steps back), and walks home.
  function startGlance(c, wary) {
    const gl = { t: 0, wary, done: false };
    const res = { pose: 'follow', speed: 0, lift: 0, staged: false };
    const fn = (cat, dt, catPos, holdStep) => {
      if (dt > 0) gl.t += dt;
      const g = cat.group;
      const p = g.position;
      const to = catPos ?? lastCat;
      res.pose = 'follow';
      res.speed = 0;
      if (!to || gl.t >= GLANCE_LOOK + GLANCE_TURN) { gl.done = true; return res; }
      const dx = to.x - p.x;
      const dz = to.z - p.z;
      const d = Math.hypot(dx, dz);
      if (gl.t < GLANCE_LOOK) {
        if (d > 1e-3) g.rotation.y = yawToward(p.x, p.z, to.x, to.z);
        if (gl.wary) res.pose = 'scared';
        return res;
      }
      if (d > 1e-3) g.rotation.y = yawToward(p.x, p.z, to.x, to.z) + Math.PI;
      if (gl.wary && !reducedMotion && d > 1e-3 && dt > 0) {
        if (stepBy(cat, holdStep, -dx / d, -dz / d, WARY_SPEED * dt) > 1e-6) res.speed = WARY_SPEED;
      }
      return res;
    };
    if (clanCats.setLead(c, fn)) glances.set(c, gl);
  }

  function level(c) {
    c.group.rotation.x = 0;
    c.group.rotation.z = 0;
  }

  // The challenge is over, however it went: the cat goes home, and no cat
  // challenges for the cooldown. One she has not beaten waits its own while.
  function end() {
    const c = active;
    active = null;
    mode = 'idle';
    stage = null;
    face = null;
    sc = null;
    pendingChase = false;
    if (!c) return;
    level(c);
    clanCats.setLead(c, null);
    if (!ledger.isBeaten(c.id)) ledger.rest(c.id);
    ledger.startCooldown();
  }

  function startScamper(s) {
    const p = s.cat.position;
    const fp = active.group.position;
    const land = awayLanding(p, fp, (x, z) => landingOk(p, x, z) === true);
    if (!land) return false;
    mode = 'scamper';
    sc = { fx: p.x, fz: p.z, tx: land.x, tz: land.z, t: 0, dur: reducedMotion ? SCAMPER_TIME_REDUCED : SCAMPER_TIME };
    onChase(active.name);
    return true;
  }

  // The patrol's scamper (rivalcats.js), to this chase's own landing.
  function runScamper(dt, s) {
    const p = s.cat.position;
    sc.t += dt;
    const u = Math.min(1, sc.t / sc.dur);
    const e = smooth(u);
    p.x = sc.fx + (sc.tx - sc.fx) * e;
    p.z = sc.fz + (sc.tz - sc.fz) * e;
    p.y = groundY(p.x, p.z) + (reducedMotion ? 0 : Math.sin(u * Math.PI) * 0.18);
    if (s.cat.rotation) s.cat.rotation.y = yawToward(sc.fx, sc.fz, sc.tx, sc.tz);
    if (u < 1) return;
    p.x = sc.tx;
    p.z = sc.tz;
    p.y = groundY(sc.tx, sc.tz);
    const fp = active.group.position;
    if (s.cat.rotation) s.cat.rotation.y = yawToward(p.x, p.z, fp.x, fp.z); // she looks back at it
    onSettled();
    end();
  }

  function update(dt, s) {
    if (!s?.cat || !(dt >= 0)) return;
    ledger.tick(dt);
    lastCat = s.cat.position;
    for (const [c, gl] of glances) {
      if (!gl.done) continue;
      glances.delete(c);
      clanCats.setLead(c, null);
    }
    if (mode === 'scamper') { runScamper(dt, s); return; }
    if (mode === 'fight') return;
    if (mode === 'after' || (mode === 'ask' && pendingChase)) {
      if (s.fight != null) return; // the fight is still clearing
      const chase = pendingChase;
      pendingChase = false;
      if (chase && canChase(s) === true && startScamper(s)) return;
      end();
      return;
    }
    if (mode === 'ask') {
      // The offer never opened, or she walked away from it: no chase.
      if (engaged() === true) idleT = 0;
      else if ((idleT += dt) > UNANSWERED) end();
      return;
    }
    // Idle: who notices her?
    if (canStart(s) !== true) return;
    const cat = s.cat.position;
    let best = null;
    let bestD = AWAY_NOTICE;
    for (const c of clanCats.list) {
      if (!canChallengeRank(c.rank) || c.buddy || c.lead || c.state === 'greet') continue;
      const p = c.group.position;
      const d = Math.hypot(cat.x - p.x, cat.z - p.z);
      if (d > AWAY_NOTICE) continue;
      if (T && !T.sameLevel(cat.x, cat.z, p.x, p.z)) continue;
      const first = ledger.decisionOf(c.id) === null;
      const wary = ledger.wins > 0;
      const dec = ledger.decide(c.id);
      if (first) {
        if (dec === 'pass') startGlance(c, wary);
        onDecide(c, dec, ledger.wins);
      }
      if (dec === 'fight' && ledger.canChallenge(c.id) && d <= bestD) { best = c; bestD = d; }
    }
    if (best && clanCats.setLead(best, lead)) {
      active = best;
      mode = 'ask';
      idleT = 0;
      pendingChase = false;
      stage = null;
      face = null;
    }
  }

  // The fight's `intruders` interface (game/clanfight.js). A visit is the
  // challenger's cast id. current() is one snapshot object, rewritten.
  const snap = { visit: null, clan: null, member: { id: null, name: '' }, pos: { x: 0, z: 0 }, state: 'resting' };
  const mine = (v) => active !== null && v === active.id;
  const foe = {
    current() {
      if (!active) return null;
      const p = active.group.position;
      snap.visit = active.id;
      snap.clan = active.clan;
      snap.member.id = active.id;
      snap.member.name = active.name;
      snap.pos.x = p.x;
      snap.pos.z = p.z;
      snap.state = mode === 'fight' ? 'held' : mode === 'ask' && !pendingChase ? 'walking' : 'resting';
      return snap;
    },
    hold(v, holderId, facePos) {
      if (!mine(v) || (mode !== 'ask' && mode !== 'fight')) return;
      mode = 'fight';
      if (facePos && Number.isFinite(facePos.x) && Number.isFinite(facePos.z)) face = { x: facePos.x, z: facePos.z };
    },
    release(v) {
      if (!mine(v) || mode !== 'fight') return;
      mode = 'after';
      stage = null;
      level(active);
    },
    dropHolder() {},
    holders(v) { return mine(v) && mode === 'fight' ? ['me'] : []; },
    stage(v, st) {
      if (!mine(v) || mode !== 'fight') return;
      if (st === null) { stage = null; return; }
      if (!st || typeof st.pose !== 'string' || !Number.isFinite(st.x) || !Number.isFinite(st.z)) return;
      const fin = (n) => (Number.isFinite(n) ? n : 0);
      const to = stage ??= { pose: 'cross', x: 0, z: 0, y: 0, pitch: 0, roll: 0 };
      to.pose = st.pose; to.x = st.x; to.z = st.z; to.y = fin(st.y); to.pitch = fin(st.pitch); to.roll = fin(st.roll);
      if (st.face && Number.isFinite(st.face.x) && Number.isFinite(st.face.z)) {
        if (face) { face.x = st.face.x; face.z = st.face.z; } else face = { x: st.face.x, z: st.face.z };
      }
    },
    measure(v) {
      const c = byId(v);
      return c ? measure(c.group) : null;
    },
    setScars(v, scars) {
      const c = byId(v);
      if (c) setScars(c.group, Array.isArray(scars) ? scars : []);
    },
    // A win: it backs down and leaves her alone for the rest of the walk.
    flee(v) {
      if (!mine(v)) return;
      ledger.addWin(v);
      end();
    },
    isFled(v) { return ledger.isBeaten(v); },
  };

  return {
    update,
    foe,
    // Run, a lost fight or no answer: the chase-off on the next update.
    chaseNow() { if (active && mode !== 'scamper') pendingChase = true; },
    get busy() { return mode !== 'idle'; },
    get mode() { return mode; },
    get activeId() { return active?.id ?? null; },
  };
}

// The patrol's fight over the roaming cats: same offer (Fight! / Run), same
// wait, same award (the walk's one `border` award, shared with the patrol by
// its key), same won and lost lines. No wire events.
export function createAwayFight({ foes, areaId, onLost = () => {}, ...rest }) {
  return createClanFight({
    ...rest,
    areaId,
    intruders: foes.foe,
    clanHome: false,
    hostileTo: () => true, // the foes offer a cat only where a challenge is allowed
    challengeRange: AWAY_ASK_RANGE,
    challengeWait: BORDER_CHALLENGE_WAIT,
    onBackOff: () => foes.chaseNow(),
    backOffFor: 0,
    challengeWords: BORDER_ASK,
    words: borderWords(areaId),
    sendEvent: () => {},
    onLost: (r) => { onLost(r); foes.chaseNow(); },
  });
}

// The walk's one fight controller in another clan's territory: the border
// patrol's fight and the roaming cats', never both up. Frame order: the foes
// (notice, approach, chase-off), then whichever fight is up, else both (the
// patrol's first; while a roaming cat is busy the patrol's offer waits).
export function joinFights(border, away, foes) {
  const on = () => (away.uiShowing !== null ? away : border);
  return {
    get uiShowing() { return away.uiShowing ?? border.uiShowing; },
    key: (k) => on().key(k),
    startFight: () => on().startFight(),
    backOff: () => on().backOff(),
    answer: (m) => on().answer(m),
    update(dt, s) {
      foes.update(dt, s);
      if (border.uiShowing !== null) { border.update(dt, s); return; }
      away.update(dt, s);
      if (away.uiShowing === null && !foes.busy) border.update(dt, s);
    },
    hideChallengeFor: (v) => border.hideChallengeFor(v) || away.hideChallengeFor(v),
    wouldChallenge: (s) => !foes.busy && border.wouldChallenge(s),
    get engagedVisit() { return on().engagedVisit; },
    chasedOffTogether: (v, petName) => border.chasedOffTogether(v, petName),
    abort() { border.abort(); away.abort(); },
    get cameraSubject() { return on().cameraSubject; },
  };
}
