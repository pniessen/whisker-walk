// =============================================================================
// The Fairground's three games and six things to find: the pure half (design:
// docs/superpowers/specs/2026-11-18-fairground-design.md, step 3).
//
// Plain numbers. No THREE, no DOM, no sound, no save: src/fairshow.js draws
// what is here, game/fairplay.js pays for it and says the lines
// (src/fairwords.js).
//
// THE RULES (the design's anti-goals; test/fairgames.test.js holds each):
//   * A game is one of three states, 'offer' -> 'playing' -> 'won', and from
//     'won' back to 'offer' for another go. That is the whole table
//     (GAME_STATES). There is NO state for losing, because nothing can be
//     lost: a miss is a line that says how to do better, and the same go
//     carries on.
//   * NO game state has a clock. A game waits for the cat for as long as she
//     likes; walking away takes nothing she has won and nothing she owns.
//   * EVERY game has a quiet helping hand, so a calm player always wins:
//       tin-can alley   every bat brings at least one tin down: six bats at most
//       hook-a-duck     after three plain ducks the next one has a star
//       ring the bell   the third pounce of a go always rings it
//   * Nothing costs coins. Nothing chases or frightens the cat. The runaway
//     balloon only ever drifts AWAY from her, slower than any cat walks, never
//     leaves its field, and goes with a soft "pff", never a bang.
//
// PER DEVICE, like the rides' riders and the Farm's animals: nothing here is
// sent to a co-walker.
// =============================================================================
import { mulberry32, seedFromCode } from './rng.js';
import { clearance, pushOut, inRect } from './farmsim.js';
import { FAIR_GAME_IDS, FAIR_FIND_IDS } from './fairprizes.js';

export { FAIR_GAME_IDS, FAIR_FIND_IDS };

// Every state a game has. 'won' leads back to 'offer' (another go); nothing else leads back.
export const GAME_STATES = Object.freeze({
  cans: Object.freeze(['offer', 'playing', 'won']),
  ducks: Object.freeze(['offer', 'playing', 'won']),
  bell: Object.freeze(['offer', 'playing', 'won']),
});

export const GAME = Object.freeze({
  OFFER_R: 2.4,        // a game is offered this near its spot
  LEAVE_R: 8,          // a won game is on offer afresh once she is this far away (and the tins are back on their shelf)
  // tin-can alley
  TINS: 6,
  BAT_MAX: 3,          // one bat brings down one to three tins
  // hook-a-duck
  DUCK_PICK_R: 0.8,
  DUCK_STARS: 2,       // of the seven, reshuffled every go
  DUCK_PLAIN_MAX: 3,   // after this many plain ducks the next one has a star
  DUCK_TURN: 0.16,     // radians a second: how fast the ducks drift round the pool
  POOL_OUT: 0.25,      // carried this far past the pool's edge, a duck is turned over
  // ring the bell
  PAD_R: 1.0,          // a pounce that brings her this near the pad's middle has hit it
  RUN_SPEED: 1.4,      // metres a second: moving at least this fast is a run-up (any cat's walk is)
  RUN_FULL: 6,         // metres of run-up that send the marker all the way
  RUN_FADE: 5,         // metres of run-up lost for each second she dawdles
  RING: 0.9,           // the marker rings the bell from this high (so 5.4 m of run-up)
  SHORT: 0.86,         // a marker that does not ring is never shown higher than this
  FLOOR: 0.18,         // nor lower than this: every pounce moves it
  BELL_TRIES: 3,       // the third pounce of a go always rings
  // the finds
  FORTUNE_R: 1.15,
  MUSIC_R: 2.0,
  FLOSS_R: 1.25,
  WISP_TIME: 60,       // seconds the wisp of candyfloss stays on her whiskers (a look, not a game's clock)
  WATCH_R: 1.6,
  JUGGLER_FAR: 9,      // the juggler has picked his ball up again once she is this far away
  BALL_R: 0.09,
  BALL_BAT: 0.5,
  BALL_ROLL: 2.8,
  BALLOON_SHY: 3.2,    // the balloon drifts away from a cat this near
  BALLOON_FLEE: 1.5,   // metres a second: slower than any cat walks
  BALLOON_DRIFT: 0.45,
  BALLOON_CATCH: 1.3,  // a pounce this near catches it
  BALLOON_INSET: 1.2,  // it stays this far inside its field
});

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const TAU = Math.PI * 2;

function inWater(waters, x, z, margin = 0) {
  for (const w of waters ?? []) {
    if (w.kind === 'circle' && Math.hypot(x - w.x, z - w.z) < w.r + margin) return true;
  }
  return false;
}

// Which tins a bat brings down: from the top of what is still standing.
// (world/fairparts.js TINS.places: 0-2 the bottom row, 3-4 the middle, 5 the top.)
const TIN_ORDER = Object.freeze([5, 4, 3, 2, 1, 0]);

// =============================================================================
// createFairGames(area, { seed }) → the games and finds of one walk.
//   area   world/fair.js's record (anchors, rides, colliders, bounds, waters, perches)
//
// step(dt, cat) moves everything one frame on.
//   cat   { x, z, y, perched, perch, inWater, speed, pouncing, fx, fz }
//           y         how high she stands (a perch's height, else 0)
//           perch     the perch record she is on, or null
//           speed     metres a second over the ground
//           pouncing  true for the frames of a pounce
// takeEvents() hands over what has happened since it was last asked, oldest first:
//   { type: 'game-start', game }  { type: 'game-won', game }
//   { type: 'tins-down', ids, left }  { type: 'tins-restack' }
//   { type: 'duck-pick', duck }  { type: 'duck-plain', duck, n }  { type: 'duck-star', duck }
//   { type: 'bell-hit', level, ring, tries }
//   { type: 'find', id }                the cat is at a discovery (every visit; the caller pays once)
//   { type: 'wisp' }  { type: 'juggler-drop' }  { type: 'ball-thud' }  { type: 'ball-bat' }
//   { type: 'balloon-caught', x, z }
// =============================================================================
export function createFairGames(area, { seed = 'fair-games' } = {}) {
  const rng = mulberry32(seedFromCode(String(seed)));
  const A = area.anchors;
  const colliders = area.colliders ?? [];
  const bounds = area.bounds;
  const waters = area.waters ?? [];
  const events = [];
  const state = { cans: 'offer', ducks: 'offer', bell: 'offer' };

  const to = (game, next) => {
    if (state[game] === next) return false;
    state[game] = next;
    if (next === 'playing') events.push({ type: 'game-start', game });
    if (next === 'won') events.push({ type: 'game-won', game });
    return true;
  };

  // ---- 1. tin-can alley ----------------------------------------------------------
  const counter = (area.perches ?? []).find((p) => Math.abs(p.x - A.tinCanCounter.x) < 1e-6 && Math.abs(p.z - A.tinCanCounter.z) < 1e-6 && Math.abs(p.y - A.tinCanCounter.y) < 1e-6) ?? null;
  const tins = Array.from({ length: GAME.TINS }, (_, i) => ({ id: i, down: false }));
  const tinsLeft = () => tins.reduce((n, t) => n + (t.down ? 0 : 1), 0);
  const onCounter = (cat) => !!cat.perched && (counter ? cat.perch === counter : dist(cat, A.tinCanCounter) < 0.2);
  function restack() {
    if (tinsLeft() === GAME.TINS) return;
    for (const t of tins) t.down = false;
    events.push({ type: 'tins-restack' });
  }
  function bat() {
    const n = Math.min(tinsLeft(), 1 + Math.floor(rng() * GAME.BAT_MAX));
    const ids = [];
    for (const i of TIN_ORDER) {
      if (ids.length >= n) break;
      if (!tins[i].down) { tins[i].down = true; ids.push(i); }
    }
    events.push({ type: 'tins-down', ids, left: tinsLeft() });
    if (tinsLeft() === 0) to('cans', 'won');
    return ids.length > 0;
  }

  // ---- 2. hook-a-duck ------------------------------------------------------------
  const pool = A.duckPool;
  const ducks = (area.rides?.ducks ?? []).map((m, i) => {
    const dx = m.position.x - pool.x;
    const dz = m.position.z - pool.z;
    return { id: i, a: Math.atan2(dz, dx), r: Math.hypot(dx, dz), x: m.position.x, z: m.position.z, yaw: m.rotation.y, star: false, held: false, turn: i % 2 ? 1 : 0.7 };
  });
  const duck = { held: null, plain: 0 };
  function shuffleStars() {
    for (const d of ducks) d.star = false;
    const pick = ducks.map((d) => d.id);
    for (let n = 0; n < Math.min(GAME.DUCK_STARS, ducks.length); n++) {
      const k = Math.floor(rng() * pick.length);
      ducks[pick[k]].star = true;
      pick.splice(k, 1);
    }
    duck.plain = 0;
  }
  function stepDucks(dt, cat) {
    for (const d of ducks) {
      if (d.held) { d.x = cat.x; d.z = cat.z; continue; }
      d.a += GAME.DUCK_TURN * d.turn * dt;
      if (d.a > Math.PI) d.a -= TAU;
      d.x = pool.x + Math.cos(d.a) * d.r;
      d.z = pool.z + Math.sin(d.a) * d.r;
      d.yaw = -d.a; // nose along the way it drifts
    }
    const held = duck.held;
    if (!held) return;
    // carried out over the pool's edge: turned over to look
    if (cat.inWater || dist(cat, pool) < pool.r + GAME.POOL_OUT) return;
    held.held = false;
    duck.held = null;
    if (held.star) {
      events.push({ type: 'duck-star', duck: held.id });
      to('ducks', 'won');
    } else {
      duck.plain += 1;
      events.push({ type: 'duck-plain', duck: held.id, n: duck.plain });
    }
  }
  const duckInReach = (cat) => {
    if (cat.perched || dist(cat, pool) > pool.r + 0.1) return null;
    let best = null;
    let bestD = GAME.DUCK_PICK_R;
    for (const d of ducks) {
      const q = dist(cat, d);
      if (!d.held && q < bestD) { best = d; bestD = q; }
    }
    return best;
  };

  // ---- 3. ring the bell ----------------------------------------------------------
  const pad = A.bellPad;
  const bell = {
    run: 0,        // metres of run-up she has behind her now
    primed: 0,     // the run-up she had as this pounce began
    tries: 0,      // pounces on the pad this go
    level: 0,      // 0..1: how far up the last pounce sent the marker
    rung: false,
    hits: 0,       // every pounce that has hit the pad on this walk (the picture's cue)
  };
  let wasPouncing = false;
  let hitThisPounce = false;
  function stepBell(dt, cat) {
    const pouncing = !!cat.pouncing;
    if (pouncing && !wasPouncing) { bell.primed = bell.run; hitThisPounce = false; }
    if (!pouncing) {
      // a run-up is ground covered without dawdling
      const moving = !cat.perched && !cat.inWater && (cat.speed ?? 0) >= GAME.RUN_SPEED;
      if (moving) bell.run = Math.min(GAME.RUN_FULL * 1.25, bell.run + cat.speed * dt);
      else bell.run = Math.max(0, bell.run - GAME.RUN_FADE * dt);
    }
    if (pouncing && !hitThisPounce && !cat.perched && dist(cat, pad) < GAME.PAD_R) {
      hitThisPounce = true;
      // (a pounce on the pad is a go at the game, taken on by its prompt or not)
      if (state.bell !== 'playing') { bell.tries = 0; state.bell = 'playing'; events.push({ type: 'game-start', game: 'bell', auto: true }); }
      bell.tries += 1;
      bell.hits += 1;
      const strength = clamp(bell.primed / GAME.RUN_FULL, 0, 1);
      const ring = strength >= GAME.RING || bell.tries >= GAME.BELL_TRIES;
      bell.level = ring ? 1 : clamp(strength, GAME.FLOOR, GAME.SHORT);
      bell.rung = ring;
      bell.run = 0;
      events.push({ type: 'bell-hit', level: bell.level, ring, tries: bell.tries });
      if (ring) { bell.tries = 0; to('bell', 'won'); }
    }
    wasPouncing = pouncing;
  }

  // ---- the finds -------------------------------------------------------------------
  const at = { fortune: false, musicbox: false, candyfloss: false, juggler: false };
  const find = (id) => events.push({ type: 'find', id });
  const edge = (id, now) => { const fresh = now && !at[id]; if (fresh) find(id); at[id] = now; return fresh; };
  const fortune = { showing: false };
  const wisp = { t: 0 };
  // the juggler's dropped ball
  const ball = { out: false, x: A.juggler.x, y: 0, z: A.juggler.z, vx: 0, vy: 0, vz: 0, down: false, spin: 0 };
  // the runaway balloon: 'free' | 'caught'
  const field = A.balloonField;
  const mid = { x: (field.minX + field.maxX) / 2, z: (field.minZ + field.maxZ) / 2 };
  const balloon = { state: 'free', x: mid.x, z: mid.z, phase: rng() * TAU, shy: false };
  const keepInField = (p) => {
    p.x = clamp(p.x, field.minX + GAME.BALLOON_INSET, field.maxX - GAME.BALLOON_INSET);
    p.z = clamp(p.z, field.minZ + GAME.BALLOON_INSET, field.maxZ - GAME.BALLOON_INSET);
    const q = pushOut(p, colliders, 0.6);
    p.x = clamp(q.x, field.minX + GAME.BALLOON_INSET, field.maxX - GAME.BALLOON_INSET);
    p.z = clamp(q.z, field.minZ + GAME.BALLOON_INSET, field.maxZ - GAME.BALLOON_INSET);
  };
  keepInField(balloon);

  function dropBall(cat) {
    const d = dist(cat, A.juggler) || 1;
    const nx = (cat.x - A.juggler.x) / d;
    const nz = (cat.z - A.juggler.z) / d;
    ball.out = true;
    ball.down = false;
    ball.x = A.juggler.x + nx * 0.45;
    ball.z = A.juggler.z + nz * 0.45;
    ball.y = 1.45;
    ball.vy = 0;
    // it lands and rolls a little way towards her, never as far as she stands
    ball.vx = nx * 1.1;
    ball.vz = nz * 1.1;
    events.push({ type: 'juggler-drop' });
  }
  function stepBall(dt, cat) {
    if (!ball.out) return;
    if (!ball.down) {
      ball.vy -= 9.8 * dt;
      ball.y += ball.vy * dt;
      ball.x += ball.vx * dt * 0.3;
      ball.z += ball.vz * dt * 0.3;
      if (ball.y <= GAME.BALL_R) { ball.y = GAME.BALL_R; ball.down = true; events.push({ type: 'ball-thud' }); }
      return;
    }
    const d = dist(cat, ball);
    if (!cat.perched && !cat.inWater && d < GAME.BALL_BAT && Math.hypot(ball.vx, ball.vz) < 0.4) {
      const nx = d > 1e-3 ? (ball.x - cat.x) / d : cat.fx ?? 0;
      const nz = d > 1e-3 ? (ball.z - cat.z) / d : cat.fz ?? 1;
      ball.vx = nx * GAME.BALL_ROLL;
      ball.vz = nz * GAME.BALL_ROLL;
      events.push({ type: 'ball-bat' });
    }
    const v = Math.hypot(ball.vx, ball.vz);
    if (v < 0.02) { ball.vx = 0; ball.vz = 0; }
    else {
      const nx = ball.x + ball.vx * dt;
      const nz = ball.z + ball.vz * dt;
      // it stops at anything solid, at the edge of the fair and at the water
      if (!inRect(bounds, nx, nz, 0.3) || clearance(colliders, nx, nz) < GAME.BALL_R || inWater(waters, nx, nz, 0.2)) {
        ball.vx = 0; ball.vz = 0;
      } else {
        ball.x = nx; ball.z = nz;
        ball.spin += (v * dt) / GAME.BALL_R;
        const slow = Math.max(0, v - 2.2 * dt) / v;
        ball.vx *= slow; ball.vz *= slow;
      }
    }
    // she has gone: he picks it up, and juggles three again
    if (dist(cat, A.juggler) > GAME.JUGGLER_FAR) { ball.out = false; ball.down = false; ball.vx = 0; ball.vz = 0; }
  }
  function stepBalloon(dt, cat) {
    if (balloon.state !== 'free') return;
    const d = dist(cat, balloon);
    if (cat.pouncing && !cat.perched && d < GAME.BALLOON_CATCH) {
      balloon.state = 'caught';
      events.push({ type: 'balloon-caught', x: balloon.x, z: balloon.z });
      find('balloon');
      return;
    }
    balloon.shy = d < GAME.BALLOON_SHY;
    if (balloon.shy) {
      // away from her, never towards
      const nx = d > 1e-3 ? (balloon.x - cat.x) / d : 0;
      const nz = d > 1e-3 ? (balloon.z - cat.z) / d : 1;
      balloon.x += nx * GAME.BALLOON_FLEE * dt;
      balloon.z += nz * GAME.BALLOON_FLEE * dt;
    } else {
      // left alone it wanders its field: a slow loop about the middle
      balloon.phase += dt * 0.11;
      if (balloon.phase > TAU * 3) balloon.phase -= TAU * 3;
      const tx = mid.x + Math.sin(balloon.phase) * (field.maxX - field.minX) * 0.32;
      const tz = mid.z + Math.sin(balloon.phase * 2 / 3 + 1) * (field.maxZ - field.minZ) * 0.32;
      const q = Math.hypot(tx - balloon.x, tz - balloon.z);
      const stepLen = Math.min(q, GAME.BALLOON_DRIFT * dt);
      // (never drifting to within reach of her on its own)
      const nx = q > 1e-6 ? balloon.x + ((tx - balloon.x) / q) * stepLen : balloon.x;
      const nz = q > 1e-6 ? balloon.z + ((tz - balloon.z) / q) * stepLen : balloon.z;
      if (Math.hypot(nx - cat.x, nz - cat.z) >= GAME.BALLOON_SHY) { balloon.x = nx; balloon.z = nz; }
    }
    keepInField(balloon);
  }
  function stepFinds(dt, cat) {
    const ground = !cat.perched && !cat.inWater;
    fortune.showing = ground && dist(cat, A.fortuneSeat) < GAME.FORTUNE_R + 0.5;
    edge('fortune', ground && dist(cat, A.fortuneSeat) < GAME.FORTUNE_R);
    edge('musicbox', ground && dist(cat, A.musicBox) < GAME.MUSIC_R);
    if (edge('candyfloss', ground && dist(cat, A.candyfloss) < GAME.FLOSS_R)) { wisp.t = GAME.WISP_TIME; events.push({ type: 'wisp' }); }
    if (wisp.t > 0) wisp.t = Math.max(0, wisp.t - dt);
    const watching = ground && dist(cat, A.jugglerWatch) < GAME.WATCH_R;
    if (watching && !at.juggler && !ball.out) { dropBall(cat); find('juggler'); }
    at.juggler = watching;
    stepBall(dt, cat);
    stepBalloon(dt, cat);
  }

  // A won game is on offer afresh, and the tins are back on their shelf, once
  // she has walked away. (Distance, not time: she can sit beside it all day.)
  function stepLeaving(cat) {
    if (dist(cat, A.tinCanPlay) > GAME.LEAVE_R) {
      restack();
      if (state.cans === 'won') to('cans', 'offer');
    }
    if (state.ducks === 'won' && dist(cat, pool) > GAME.LEAVE_R) to('ducks', 'offer');
    if (state.bell === 'won' && dist(cat, pad) > GAME.LEAVE_R) { to('bell', 'offer'); bell.level = 0; bell.rung = false; }
  }

  const games = {
    state, events, tins, ducks, duck, bell, fortune, wisp, ball, balloon, counter,
    get tinsLeft() { return tinsLeft(); },

    takeEvents() { return events.splice(0, events.length); },

    step(dt, cat) {
      if (!(dt > 0)) return;
      const step = Math.min(dt, 0.1);
      stepDucks(step, cat);
      stepBell(step, cat);
      stepFinds(step, cat);
      stepLeaving(cat);
    },

    // What E would do here, or null:
    //   { kind: 'play', game, again }   take a game on (again: it has just been won)
    //   { kind: 'bat' }                 on the counter, the tins in front of her
    //   { kind: 'pick', duck }          in the pool, a duck in reach, her mouth free
    actionFor(cat) {
      if (state.cans === 'playing' && onCounter(cat) && tinsLeft() > 0) return { kind: 'bat' };
      if (state.ducks === 'playing' && !duck.held && !cat.mouthFull) {
        const d = duckInReach(cat);
        if (d) return { kind: 'pick', duck: d.id };
      }
      const play = (game) => ({ kind: 'play', game, again: state[game] === 'won' });
      if (state.cans !== 'playing' && (onCounter(cat) || (!cat.perched && dist(cat, A.tinCanPlay) < GAME.OFFER_R))) return play('cans');
      if (cat.perched) return null;
      if (state.ducks !== 'playing' && dist(cat, pool) < pool.r + GAME.OFFER_R) return play('ducks');
      if (state.bell !== 'playing' && !cat.inWater && dist(cat, pad) < GAME.OFFER_R) return play('bell');
      return null;
    },

    // Does what actionFor offered. Returns whether anything happened.
    act(action, cat) {
      const now = games.actionFor(cat);
      if (!action || !now || now.kind !== action.kind || now.game !== action.game) return false;
      if (now.kind === 'play') return games.play(now.game);
      if (now.kind === 'bat') return bat();
      if (now.kind === 'pick') {
        const d = ducks[now.duck];
        // the helping hand: after three plain ducks, this one has a star
        if (duck.plain >= GAME.DUCK_PLAIN_MAX) d.star = true;
        d.held = true;
        duck.held = d;
        events.push({ type: 'duck-pick', duck: d.id });
        return true;
      }
      return false;
    },

    // Take a game on, or have another go at one just won.
    play(game) {
      if (!FAIR_GAME_IDS.includes(game) || state[game] === 'playing') return false;
      if (game === 'cans') restack();
      else if (game === 'ducks') shuffleStars();
      else { bell.tries = 0; bell.level = 0; bell.rung = false; }
      if (state[game] === 'won') state[game] = 'offer';
      return to(game, 'playing');
    },

    // A walk picked up again that had already caught the balloon: it is gone.
    markBalloonCaught() { balloon.state = 'caught'; },
  };
  return games;
}
