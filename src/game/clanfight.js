// The clan fight in the walk (Clan Life Part 2): joins the pure fight
// (fight.js) to the intruder (intruders.js) and the screen (ui/fightui.js).
//
// WHY THERE IS NO PROGRESSION HERE. Losing a fight must change nothing: no
// points, cats, unlocks, marks, walks, taming, grudges or feats. The surest
// way to keep that true is that this controller is never handed progression
// (the save) at all and imports nothing that stores anything. Its one way to pay is the
// discovery log's awardOnce, on the WIN path only; the lose path (marked
// LOST / END LOST below, and pinned by test/clanfight.test.js) lets the
// intruder walk on, locks the challenge for RECHALLENGE_DELAY, says so in one
// toast and clears the fight. Nothing else.
//
// The flow: the challenge pill shows when a hostile intruder walks within
// CHALLENGE_RANGE of my cat (never in the water or off clan ground, ruling
// R3) and stays up to CHALLENGE_KEEP. "Fight!" holds the intruder, hisses,
// starts a fight with its own rng (seeded from the walk, the visit and how
// many fights this device has started on it, so a re-challenge reads a new
// sequence), walks my cat over to it, then runs the rounds, writing my cat's
// spot and pose each frame after player.update. "Back off" hides the pill
// until the cat has been beyond CHALLENGE_KEEP once.
//
// On the network (Task 5): startFight sends one 'intruder-fight' and the end
// of that fight (won, lost, aborted, or ended by a sibling's win) sends one
// 'intruder-done'. Nothing is sent solo. See netevents.js for the receiving side.
import { createFight, edgeFor, CLUES, MOVES, NEUTRAL_POSE, TIMING } from '../fight.js';
import { ACTION_KINDS, actionFrame, beatFrame, preludeFrame, placeFrame, makeFrame, makeActionFrames } from '../fightactions.js';
import { isHostile, CHALLENGE_RANGE, CHALLENGE_KEEP, RECHALLENGE_DELAY } from '../intruders.js';
import { FIGHT_LINES } from '../ui/fightui.js';
import { clanName } from '../clanhomes.js';
import { mulberry32, seedFromCode } from '../rng.js';

export const FIGHT_GAP = 1.6;      // m between the two cats
export const WALKOVER_MAX = 3;     // s at most of walking over
export const BACKUP_EASE = 0.6;    // m the intruder eases back for a charge
export const SIDE_STEP = 0.8;      // m of a dodge
export const LOSER_STEP = 0.4;     // m the round's loser steps back
export const LOSER_TIME = 0.4;     // s it takes, in 'scared'
const ANSWER_TIME = 0.35;          // s of the answer pose before the tumble
const ANSWER_TIME_REDUCED = 0.2;
const BACKUP_TIME = 0.5;           // s the charge's ease-back takes
const CIRCLE_SLACK = 0.05;         // m over FIGHT_GAP the tumble still circles
const POUNCE_HOP = 0.25;           // m
const TUMBLE_HOP = 0.12;           // m
const DUST = 0xcbb8a0;

// The inert stand-in: away from home, in Legacy, the den and the old areas.
export const NO_CLAN_FIGHT = Object.freeze({
  uiShowing: null,
  update() {},
  key: () => false,
  startFight() {},
  backOff() {},
  hideChallengeFor: () => false,
  engagedVisit: null,
  chasedOffTogether: () => false,
  answer() {},
  abort() {},
  cameraSubject: null,
});

const TUMBLE_SPOTS = 16; // points round the tumble's circle: 0.31 m apart at the fight's gap

// Every spot either cat can stand on in a fight with my cat at `spot` and the
// intruder held at `foeAt`, for the fight camera (src/fightcam.js), which
// keeps its lines to all of them clear of the trees: the two anchors, my
// dodge, the charge's ease-back, each loser's step back and the tumble's
// circle round their middle, each sampled finely enough that every spot
// between is within 0.2 m of one (test/clanfight.test.js). stagePoses below
// puts the cats nowhere else, and never on a spot that is not clan ground
// (R3), so `ok` (clan ground) drops those; the two anchors always stay.
//
// With `actions` (fight moves and scars, Task 5) the rounds play as leaps,
// rear-ups, pins and rolls instead of the tumble, so there is no circle; each
// cat's spots are today's (less the circle), its line toward the other every
// <= 0.2 m (from its flinch spot 0.5 m behind it out to the far anchor), the
// meeting point in the middle, the stare's step-in, the beats' sidesteps and
// my dodge, both ways (whichever way the stager turns a side). With a
// `reachY` (reachYFor below) each spot also carries `y`: the most the cat's
// top rises there, above its own standing top, in any action, beat or answer
// (fightcam.js keeps that top in frame too). Without `actions` the result is
// exactly today's, `reachY` or not.
export function fightReach(spot, foeAt, ok = () => true, { actions = false, reachY = null } = {}) {
  let nx = spot.x - foeAt.x;
  let nz = spot.z - foeAt.z;
  const gap = Math.hypot(nx, nz);
  if (gap < 1e-6) { nx = 1; nz = 0; } else { nx /= gap; nz /= gap; }
  const sx = -nz, sz = nx;
  const mid = { x: (spot.x + foeAt.x) / 2, z: (spot.z + foeAt.z) / 2 };
  if (actions) {
    const keep = (p, i) => i === 0 || ok(p.x, p.z) === true;
    return {
      mid, axis: { x: nx, z: nz },
      me: actionSpots(spot, -nx, -nz, gap, [LOSER_STEP], [BEAT_SIDE, SIDE_STEP / 2, SIDE_STEP], reachY?.me).filter(keep),
      it: actionSpots(foeAt, nx, nz, gap, [BACKUP_EASE / 2, BACKUP_EASE, LOSER_STEP], [BEAT_SIDE], reachY?.it).filter(keep),
    };
  }
  const me = [
    { x: spot.x, z: spot.z },
    { x: spot.x + sx * SIDE_STEP / 2, z: spot.z + sz * SIDE_STEP / 2 },
    { x: spot.x + sx * SIDE_STEP, z: spot.z + sz * SIDE_STEP },
    { x: spot.x + nx * LOSER_STEP, z: spot.z + nz * LOSER_STEP },
  ];
  const it = [
    { x: foeAt.x, z: foeAt.z },
    { x: foeAt.x - nx * BACKUP_EASE / 2, z: foeAt.z - nz * BACKUP_EASE / 2 },
    { x: foeAt.x - nx * BACKUP_EASE, z: foeAt.z - nz * BACKUP_EASE },
    { x: foeAt.x - nx * LOSER_STEP, z: foeAt.z - nz * LOSER_STEP },
  ];
  if (gap <= FIGHT_GAP + CIRCLE_SLACK) {
    for (let k = 0; k < TUMBLE_SPOTS; k++) {
      const a = (k / TUMBLE_SPOTS) * Math.PI * 2;
      me.push({ x: mid.x + Math.cos(a) * gap / 2, z: mid.z + Math.sin(a) * gap / 2 });
    }
  }
  const keep = (p, i) => i === 0 || ok(p.x, p.z) === true;
  return { mid, axis: { x: nx, z: nz }, me: me.filter(keep), it: it.filter(keep) };
}

const REACH_STEP = 0.2;   // m at most between two spots of a line
const FLINCH_BACK = 0.5;  // m behind its anchor a loser flinches to (the big rear-up's)
const BEAT_SIDE = 0.3;    // m of a beat's sidestep (fightactions.js beatFrame)
const STEP_IN = 0.15;     // m of the stare beat's step in

// One cat's action spots, from its anchor `at` with (fx, fz) toward the other
// cat, in its own along/side coordinates first (side: to its right); `backs`
// are today's spots behind it (a loser's step back, the charge's ease-back)
// and `sides` its sidesteps beside its anchor, each taken both ways.
// Each of
// `samples` (reachYFor's, for this cat) lifts the spot nearest it, and the one
// nearest its mirror image (whichever way a sidestep goes): a spot's y is the
// most of the samples it is nearest to. Only the nearest, so a leap's height
// is never put on a spot nearer a tree than the leap is.
function actionSpots(at, fx, fz, gap, backs, sides, samples) {
  const local = [{ a: 0, s: 0 }, ...backs.map((b) => ({ a: -b, s: 0 }))];
  const from = -FLINCH_BACK, to = Math.max(gap, 0);
  const n = Math.max(1, Math.ceil((to - from) / REACH_STEP));
  for (let i = 0; i <= n; i++) local.push({ a: from + ((to - from) * i) / n, s: 0 });
  local.push({ a: gap / 2, s: 0 }, { a: STEP_IN, s: 0 });
  for (const s of sides) local.push({ a: 0, s }, { a: 0, s: -s });
  const spots = [];
  for (const p of local) {
    if (!spots.some((q) => Math.abs(q.a - p.a) < 1e-9 && Math.abs(q.s - p.s) < 1e-9)) spots.push({ a: p.a, s: p.s, y: 0 });
  }
  if (Array.isArray(samples)) {
    const nearest = (a, s) => {
      let best = spots[0], bd = Infinity;
      for (const q of spots) {
        const d = (q.a - a) ** 2 + (q.s - s) ** 2;
        if (d < bd) { bd = d; best = q; }
      }
      return best;
    };
    for (const q of samples) {
      if (!(q.y > 0)) continue;
      for (const sp of [nearest(q.along, q.side), nearest(q.along, -q.side)]) if (q.y > sp.y) sp.y = q.y;
    }
  }
  const rx = -fz, rz = fx;
  return spots.map(({ a, s, y }) => {
    const p = { x: at.x + fx * a + rx * s, z: at.z + fz * a + rz * s };
    if (y > 0) p.y = y;
    return p;
  });
}

// How much higher than its standing top each pose puts a cat's top, beyond
// placeFrame's y without the roll's term (its lift plus the pitch about its
// hind heels; a roll turns the curled cat about its torso centre, which stays
// at its lift), as a fraction of that top. Measured over every preset and an
// intruder, over every action, beat and prelude frame and its tail's swing
// (most of it is the tail: 0.147 in 'cross' and 'arch', 0.165 reared, 0.077
// in the leap's pitched 'pounce'; a curled roll, a flattened pin or a flinch
// never rises above its lift), each with 0.03 to spare; a pose not listed
// takes the most.
const POSE_TOP = Object.freeze({
  cross: 0.18, arch: 0.18, rearUp: 0.2, swipe: 0.2, stalk: 0.2,
  pounce: 0.11, pinning: 0.07, land: 0.03, follow: 0.03, flinch: 0.03, scared: 0.03,
  pinned: 0, roll: 0,
});
const POSE_TOP_MAX = 0.2;
// Samples over each action, beat and prelude: the pin's flight, the fastest
// move, covers 0.03 m between two.
const REACH_US = 240;
const REACH_CELL = 0.01; // m: samples are kept as the most per cell

// The `reachY` option of fightReach, from the two cats measured at fight start
// (src/cat/model.js catDims: { top, backY, pinnedBackY, hindZ, pivotY }) and
// the gap between their anchors: for each cat, where every action (either cat
// winning, big or not), beat and answer prelude puts it, relative to its own
// anchor (`along` toward the other cat, `side` to its right; for the roll the
// torso centre it turns about), and `y`, how far its top rises there above its
// standing top: placeFrame's y (without the roll's term) plus its pose's
// POSE_TOP of its top. Pure: no THREE.
export function reachYFor(meDims, itDims, gap) {
  const dims = { me: cleanDims(meDims), it: cleanDims(itDims) };
  const g = Number.isFinite(gap) && gap > 0 ? gap : FIGHT_GAP;
  const cells = { me: new Map(), it: new Map() };
  const placed = { dAlong: 0, dSide: 0, y: 0 };
  const add = (who, f) => {
    const d = dims[who];
    placeFrame(f, d, placed);
    const along = placed.dAlong;
    const side = placed.dSide - d.pivotY * Math.sin(f.roll || 0);
    const y = placed.y - d.pivotY * (1 - Math.cos(f.roll || 0))
      + (Object.hasOwn(POSE_TOP, f.pose) ? POSE_TOP[f.pose] : POSE_TOP_MAX) * d.top;
    if (!(y > 0)) return;
    const key = `${Math.round(along / REACH_CELL)},${Math.round(side / REACH_CELL)}`;
    const c = cells[who].get(key);
    if (!c || y > c.y) cells[who].set(key, { along: Math.round(along / REACH_CELL) * REACH_CELL, side: Math.round(side / REACH_CELL) * REACH_CELL, y });
  };
  const fr = makeActionFrames();
  const f = makeFrame();
  for (let i = 0; i <= REACH_US; i++) {
    const u = i / REACH_US;
    for (const kind of ACTION_KINDS) {
      for (const big of kind === 'roll' ? [true] : [false, true]) {
        for (const by of ['me', 'it']) {
          const other = by === 'me' ? 'it' : 'me';
          actionFrame(kind, big, u, { gap: g, winBackY: dims[by].backY, loseBackY: dims[other].pinnedBackY }, fr);
          add(by, fr.win);
          add(other, fr.lose);
        }
      }
    }
    for (const beat of [0, 1, 2]) {
      beatFrame(beat, u, f);
      add('me', f);
      add('it', f);
    }
    for (const answer of ['pounce', 'swipe', 'dodge']) add('me', preludeFrame({ answer }, 'me', u, f));
    for (const move of MOVES) add('it', preludeFrame({ move }, 'it', u, f));
  }
  const list = (m) => [...m.values()].map((c) => ({ along: c.along + 0, side: c.side + 0, y: c.y }));
  return { me: list(cells.me), it: list(cells.it) };
}

function cleanDims(d) {
  const n = (v) => (Number.isFinite(v) && v > 0 ? v : 0);
  return { top: n(d?.top), backY: n(d?.backY), pinnedBackY: n(d?.pinnedBackY), hindZ: n(d?.hindZ), pivotY: n(d?.pivotY) };
}


const smooth = (u) => u * u * (3 - 2 * u);
const clamp01 = (u) => Math.max(0, Math.min(1, u));
const yawToward = (x, z, tx, tz) => Math.atan2(tx - x, tz - z) + Math.PI;

export function createClanFight({
  intruders, ui, audio, fx, hud, log,
  areaId, walkStamp, playerId, playerSpecial, reducedMotion = false,
  now = () => Date.now() / 1000,
  isGround = () => true,
  player = null,
  runSpeed = 3,
  clanHome = false,
  picks = [],
  sendEvent = () => {},
}) {
  let mode = 'idle'; // 'idle' | 'challenge' | 'walkover' | 'fight'
  let sess = null;
  let visit = null;
  let foe = null;      // { name, clan } of this fight's intruder
  let fight = null;
  let spot = null;     // my cat's spot for the rounds
  let foeAt = null;    // where the intruder is held
  let walkT = 0;
  let arrived = false;
  let act = null;      // the beat being played: { kind, t, ... }
  let line = null;
  let sheetKey = null;
  let sentVisit = null; // the visit whose 'intruder-fight' I sent and not yet closed
  let camSubject = null; // the fight camera's subject (cameraSubject below)
  const attempts = new Map(); // visit -> fights this device started on it
  const locks = new Map();    // visit -> { away, until }

  const ground = (x, z) => isGround(x, z) === true;
  const answerTime = reducedMotion ? ANSWER_TIME_REDUCED : ANSWER_TIME;
  const tumbleTime = reducedMotion ? TIMING.tumbleReduced : TIMING.tumble;

  function lockedNow(v, d) {
    const L = locks.get(v);
    if (!L) return false;
    if (L.away && d > CHALLENGE_KEEP) L.away = false;
    return L.away || now() < L.until;
  }

  function canStand(s) {
    const p = s.cat.position;
    return !player?.inWater && !s.perched && !s.chasing && !s.cameraMode && ground(p.x, p.z);
  }

  // Tells the co-walker how my fight ended; once per fight, only if I told
  // her it began.
  function sendDone(fled) {
    if (sentVisit === null) return;
    const v = sentVisit;
    sentVisit = null;
    sendEvent({ v: 1, id: playerId, type: 'intruder-done', area: areaId, visit: v, fled });
  }

  function hideChallenge() {
    if (mode !== 'challenge') return;
    mode = 'idle';
    visit = null;
    ui.hide();
  }

  function showSheet() {
    const phase = mode === 'walkover' ? 'squareOff' : fight.phase;
    const key = `${phase}|${fight.round}|${fight.wins}|${fight.losses}|${line}|${phase === 'clue' ? fight.move : ''}`;
    if (key === sheetKey) return;
    sheetKey = key;
    ui.showFight({
      phase,
      clue: phase === 'clue' ? CLUES[fight.move] : null,
      round: fight.round,
      wins: fight.wins,
      losses: fight.losses,
      line,
    });
  }

  // Clears the fight from the session and the screen. Pays nothing.
  function endFight() {
    if (sess) {
      sess.fight = null;
      sess.fightPose = null;
      sess.fightLift = 0;
      sess.fightGait = 0;
    }
    fight = null;
    mode = 'idle';
    visit = null;
    foe = null;
    camSubject = null;
    act = null;
    line = null;
    sheetKey = null;
    ui.hide();
  }

  function startFight() {
    const s = sess;
    if (mode !== 'challenge' || !s) return;
    const cur = intruders.current();
    if (!cur || cur.visit !== visit || cur.state !== 'walking') { hideChallenge(); return; }
    const attempt = attempts.get(visit) ?? 0;
    attempts.set(visit, attempt + 1);
    foe = { name: cur.member.name, clan: cur.clan };
    const cat = s.cat.position;
    intruders.hold(visit, playerId, { x: cat.x, z: cat.z }, { local: true });
    audio.hiss();
    sentVisit = visit;
    sendEvent({ v: 1, id: playerId, type: 'intruder-fight', area: areaId, visit });
    fight = createFight({
      rng: mulberry32(seedFromCode(`${walkStamp}|${visit}|${attempt}`)),
      edge: edgeFor(playerSpecial),
      reducedMotion,
    });
    s.fight = fight;
    s.fightPose = NEUTRAL_POSE;
    s.fightLift = 0;
    s.fightGait = 0;
    player?.halt?.();
    foeAt = { x: cur.pos.x, z: cur.pos.z };
    camSubject = walkoverSubject(cat);
    mode = 'walkover';
    walkT = 0;
    arrived = false;
    line = null;
    sheetKey = null;
    showSheet();
  }

  function backOff() {
    if (mode !== 'challenge') return;
    locks.set(visit, { away: true, until: 0 });
    hideChallenge();
  }

  // The spot FIGHT_GAP from the intruder on the line toward my cat.
  function gapSpot(p) {
    let dx = p.x - foeAt.x;
    let dz = p.z - foeAt.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-6) { dx = 1; dz = 0; } else { dx /= d; dz /= d; }
    return { x: foeAt.x + dx * FIGHT_GAP, z: foeAt.z + dz * FIGHT_GAP };
  }

  // The walk-over for the fight camera: the fight round the spot my cat is
  // running to, and the run itself (every 0.3 m of it, up to where it would
  // leave clan ground, where walkOver stops it).
  function walkoverSubject(from) {
    const to = gapSpot(from);
    const sub = fightReach(to, foeAt, ground);
    const d = Math.hypot(to.x - from.x, to.z - from.z);
    const n = Math.max(1, Math.ceil(d / 0.3));
    sub.path = [{ x: from.x, z: from.z }];
    for (let j = 1; j <= n; j++) {
      const p = { x: from.x + ((to.x - from.x) * j) / n, z: from.z + ((to.z - from.z) * j) / n };
      if (!ground(p.x, p.z)) break;
      sub.path.push(p);
    }
    return sub;
  }

  // "Fight!": my cat runs over to the held intruder (it is already held, so
  // this never becomes a chase), stepping only onto clan ground (R3).
  function walkOver(dt, s) {
    const cat = s.cat.position;
    s.cat.rotation.y = yawToward(cat.x, cat.z, foeAt.x, foeAt.z);
    if (arrived) { beginRounds(s); return; }
    walkT += dt;
    const target = gapSpot(cat);
    const dx = target.x - cat.x;
    const dz = target.z - cat.z;
    const d = Math.hypot(dx, dz);
    const step = runSpeed * dt;
    s.fightPose = 'follow';
    if (d <= step) {
      // The fight's spot, written only when it is clan ground (R3).
      if (ground(target.x, target.z)) { cat.x = target.x; cat.z = target.z; }
      s.fightGait = d > 1e-6 ? runSpeed : 0;
      arrived = true;
      return;
    }
    const nx = cat.x + (dx / d) * step;
    const nz = cat.z + (dz / d) * step;
    if (walkT >= WALKOVER_MAX || !ground(nx, nz)) { s.fightGait = 0; beginRounds(s); return; }
    cat.x = nx;
    cat.z = nz;
    s.fightGait = runSpeed;
  }

  function beginRounds(s) {
    const cat = s.cat.position;
    spot = { x: cat.x, z: cat.z };
    s.fightGait = 0;
    intruders.hold(visit, playerId, spot, { local: true }); // face me where I stand
    camSubject = { ...fightReach(spot, foeAt, ground), path: [] };
    mode = 'fight';
    act = { kind: 'squareOff', t: 0 };
    stagePoses(s);
    showSheet();
  }

  function answer(move) {
    if (mode !== 'fight' || !fight) return;
    handle(fight.answer(move));
  }

  function handle(events) {
    for (const e of events) {
      if (mode !== 'fight') return;
      if (e.type === 'clue') {
        line = null;
        act = { kind: 'clue', t: 0, move: e.move };
      } else if (e.type === 'secondLook') {
        line = FIGHT_LINES.secondLook;
      } else if (e.type === 'round') {
        line = e.won ? FIGHT_LINES.won : FIGHT_LINES.lost;
        act = { kind: 'round', t: 0, move: e.move, answer: e.answer, won: e.won, bursts: 0, landed: false };
        if (e.answer) audio.pounceWhoosh();
      } else if (e.type === 'over') {
        finish(e.won);
        return;
      }
    }
    if (mode === 'fight') showSheet();
  }

  function finish(won) {
    const v = visit;
    const { name, clan } = foe;
    if (won) {
      intruders.flee(v);
      // The HUD shows an 'intruder' label as it is, with no "You spotted"
      // lead (ui/hud.js); the second toast says where it ran.
      log.awardOnce('intruder', `intruder-${v}`, `You chased off ${name}! 🛡️`);
      hud.toast(`${name} ran back to ${clanName(clan)}'s land! 🏃`);
      sendDone(true);
      endFight();
      return;
    }
    // LOST: the intruder walks on, the challenge waits, one toast. Nothing else.
    intruders.release(v, playerId);
    locks.set(v, { away: false, until: now() + RECHALLENGE_DELAY });
    hud.toast(`${name} shook it off and walked on. Try again soon!`);
    sendDone(false);
    endFight();
    // END LOST
  }

  // Where both cats stand and how they look this frame.
  function stagePoses(s) {
    const cat = s.cat.position;
    let nx = spot.x - foeAt.x;
    let nz = spot.z - foeAt.z;
    const gap = Math.hypot(nx, nz);
    if (gap < 1e-6) { nx = 1; nz = 0; } else { nx /= gap; nz /= gap; }
    const sx = -nz, sz = nx; // to my cat's side
    let me = { x: spot.x, z: spot.z };
    let it = { x: foeAt.x, z: foeAt.z };
    let myPose = NEUTRAL_POSE;
    let itPose = NEUTRAL_POSE;
    let myLift = 0;
    let itLift = 0;
    const ph = fight.phase;
    if (ph === 'squareOff') {
      myPose = 'cross';
      itPose = 'cross';
    } else if (ph === 'clue') {
      itPose = CLUES[fight.move].pose;
      if (fight.move === 'charge') {
        const k = smooth(clamp01(act.t / BACKUP_TIME)) * BACKUP_EASE;
        it = { x: foeAt.x - nx * k, z: foeAt.z - nz * k };
      }
    } else if (act?.kind === 'round') {
      const r = act;
      const tt = r.t;
      const loserAt = tumbleTime - LOSER_TIME;
      if (ph === 'tumble' && tt < answerTime) {
        const u = clamp01(tt / answerTime);
        if (r.answer === 'pounce') { myPose = 'pounce'; myLift = POUNCE_HOP * Math.sin(Math.PI * u); }
        else if (r.answer === 'swipe') myPose = 'swipe';
        else if (r.answer === 'dodge') {
          myPose = 'land';
          const k = smooth(u) * SIDE_STEP;
          me = { x: spot.x + sx * k, z: spot.z + sz * k };
        } else myPose = 'cross';
        // its move lands
        if (r.move === 'pounce') { itPose = 'pounce'; itLift = POUNCE_HOP * Math.sin(Math.PI * u); }
        else if (r.move === 'swipe') itPose = 'swipe';
        else {
          itPose = 'follow';
          const k = (1 - smooth(u)) * BACKUP_EASE;
          it = { x: foeAt.x - nx * k, z: foeAt.z - nz * k };
        }
      } else if (!reducedMotion && ph === 'tumble' && tt < loserAt) {
        // The tumble: round their midpoint once, with small hops. Never with
        // reduced motion, and only at the fight's own gap: a walk-over that
        // stopped short (R3) leaves them where they stand, hopping.
        const u = clamp01((tt - answerTime) / (loserAt - answerTime));
        const mx = (spot.x + foeAt.x) / 2;
        const mz = (spot.z + foeAt.z) / 2;
        if (gap <= FIGHT_GAP + CIRCLE_SLACK) {
          const rad = gap / 2;
          const a = Math.atan2(spot.z - mz, spot.x - mx) + Math.PI * 2 * u;
          me = { x: mx + Math.cos(a) * rad, z: mz + Math.sin(a) * rad };
          it = { x: mx - Math.cos(a) * rad, z: mz - Math.sin(a) * rad };
        }
        myPose = 'pounce';
        itPose = 'pounce';
        myLift = TUMBLE_HOP * Math.abs(Math.sin(Math.PI * 3 * u));
        itLift = TUMBLE_HOP * Math.abs(Math.sin(Math.PI * 3 * u + 1));
        if (r.bursts === 0 || (r.bursts === 1 && u >= 0.5)) {
          r.bursts += 1;
          fx.burst({ x: mx, y: 0.2, z: mz }, DUST, 14);
        }
      } else {
        // The round's loser steps back in 'scared', then both settle.
        if (!r.landed) {
          r.landed = true;
          if (reducedMotion) fx.burst({ x: (spot.x + foeAt.x) / 2, y: 0.2, z: (spot.z + foeAt.z) / 2 }, DUST, 8);
          audio.landThump();
        }
        const back = ph === 'tumble'
          ? smooth(clamp01((tt - loserAt) / LOSER_TIME))
          : 1 - smooth(clamp01((tt - tumbleTime) / TIMING.beat));
        // The round that wins the fight: the intruder steps back and in again
        // before it flees, so it sets off from its held spot with no jump.
        const decisive = r.won && fight.wins >= 2;
        const k = (decisive && ph === 'tumble'
          ? Math.sin(Math.PI * clamp01((tt - loserAt) / (LOSER_TIME * 0.75))) // home a frame or more before `over`
          : back) * LOSER_STEP;
        if (r.won) it = { x: foeAt.x - nx * k, z: foeAt.z - nz * k };
        else me = { x: spot.x + nx * k, z: spot.z + nz * k };
        if (ph === 'tumble') {
          myPose = r.won ? 'cross' : 'scared';
          itPose = r.won ? 'scared' : 'cross';
        }
      }
    }
    // R3: a staged spot that is not clan ground (water, a bog, the truce
    // buffer, a collider) is never stood on; that cat keeps its own spot.
    if (!ground(me.x, me.z)) me = { x: spot.x, z: spot.z };
    if (!ground(it.x, it.z)) it = { x: foeAt.x, z: foeAt.z };
    cat.x = me.x;
    cat.z = me.z;
    s.cat.rotation.y = yawToward(me.x, me.z, it.x, it.z);
    s.fightPose = myPose;
    s.fightLift = myLift;
    intruders.stage(visit, { pose: itPose, x: it.x, z: it.z, y: itLift, face: me });
  }

  return {
    get uiShowing() {
      return mode === 'challenge' ? 'challenge' : mode === 'idle' ? null : 'fight';
    },
    key(k) {
      if (mode === 'idle') return false;
      return ui.key(k);
    },
    startFight,
    backOff,
    answer,
    update(dt, s) {
      if (!s?.cat) return;
      sess = s;
      if (mode === 'walkover' || mode === 'fight') {
        const cur = intruders.current();
        if (!cur || cur.visit !== visit) {
          // It is gone from under the fight (it cannot be, per R9): let go quietly.
          intruders.release(visit, playerId);
          sendDone(false);
          endFight();
          return;
        }
        if (mode === 'walkover') { walkOver(dt, s); return; }
        if (act) act.t += dt;
        handle(fight.step(dt));
        if (mode === 'fight') stagePoses(s);
        return;
      }
      const cur = intruders.current();
      const hostile = !!cur && cur.state === 'walking' && isHostile(cur, { clanHome, picks });
      if (!hostile) { hideChallenge(); return; }
      const cat = s.cat.position;
      const d = Math.hypot(cat.x - cur.pos.x, cat.z - cur.pos.z);
      const locked = lockedNow(cur.visit, d);
      const standing = canStand(s);
      if (mode === 'challenge') {
        if (cur.visit !== visit || d > CHALLENGE_KEEP || locked || !standing) hideChallenge();
        return;
      }
      if (d <= CHALLENGE_RANGE && !locked && standing) {
        mode = 'challenge';
        visit = cur.visit;
        ui.showChallenge({ name: cur.member.name, clan: cur.clan });
      }
    },
    // A co-walker's fight on this visit (netevents): my pill goes away.
    // True when it was up for that visit.
    hideChallengeFor(v) {
      if (mode !== 'challenge' || visit !== v) return false;
      hideChallenge();
      return true;
    },
    // What the fight camera keeps in view: null unless a fight is on (the
    // walk-over included); the same object for a whole phase.
    get cameraSubject() { return mode === 'walkover' || mode === 'fight' ? camSubject : null; },
    // The intruder this device is facing right now (pill or fight), or null.
    get engagedVisit() { return mode === 'idle' ? null : visit; },
    // A co-walker chased it off while I was mid-fight on the same visit: my
    // fight ends and I am paid too (once, by the per-visit key). Anyone not
    // fighting that visit gets nothing.
    chasedOffTogether(v, petName) {
      if ((mode !== 'walkover' && mode !== 'fight') || visit !== v) return false;
      const { name } = foe;
      log.awardOnce('intruder', `intruder-${v}`, `You chased off ${name}! 🛡️`);
      hud.toast(`You and ${petName} chased ${name} off together! 🏃`);
      sendDone(true);
      endFight();
      return true;
    },
    // The walk ended (or the page went away) mid-fight: let go, pay nothing.
    abort() {
      if (mode === 'walkover' || mode === 'fight') {
        intruders.release(visit, playerId);
        sendDone(false);
        endFight();
      } else if (mode === 'challenge') {
        hideChallenge();
      }
    },
  };
}
