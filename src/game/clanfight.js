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
// This task sends nothing on the network (Task 5 adds that).
import { createFight, edgeFor, CLUES, NEUTRAL_POSE, TIMING } from '../fight.js';
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
const BACKUP_TIME = 0.5;
const CIRCLE_SLACK = 0.05;         // m over FIGHT_GAP the tumble still circles           // s the charge's ease-back takes
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
  answer() {},
  abort() {},
});

const smooth = (u) => u * u * (3 - 2 * u);
const clamp01 = (u) => Math.max(0, Math.min(1, u));
const yawToward = (x, z, tx, tz) => Math.atan2(tx - x, tz - z) + Math.PI;

// areaId is taken now for Task 5's co-walk events; nothing here reads it yet.
export function createClanFight({
  intruders, ui, audio, fx, hud, log,
  areaId: _areaId, walkStamp, playerId, playerSpecial, reducedMotion = false,
  now = () => Date.now() / 1000,
  isGround = () => true,
  player = null,
  runSpeed = 3,
  clanHome = false,
  picks = [],
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
      // Reads after the discovery toast's "You spotted …".
      log.awardOnce('intruder', `intruder-${v}`, `${name} running home 🛡️`);
      hud.toast(`${name} ran back to ${clanName(clan)}'s land! 🏃`);
      endFight();
      return;
    }
    // LOST: the intruder walks on, the challenge waits, one toast. Nothing else.
    intruders.release(v, playerId);
    locks.set(v, { away: false, until: now() + RECHALLENGE_DELAY });
    hud.toast(`${name} shook it off and walked on. Try again soon!`);
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
    // The walk ended (or the page went away) mid-fight: let go, pay nothing.
    abort() {
      if (mode === 'walkover' || mode === 'fight') {
        intruders.release(visit, playerId);
        endFight();
      } else if (mode === 'challenge') {
        hideChallenge();
      }
    },
  };
}
