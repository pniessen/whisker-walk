// =============================================================================
// The Fairground's rides in the walk: what each event of src/fairlive.js says
// and sounds like.
//
// The five rides pay nothing and cost nothing; the Viking boat pays AWARDS.boatride
// for a swing ridden to the end (noteBoatLap). The first time on each ride on a
// walk fills its journal page (its count is the walks she has ridden it on);
// the first time EVER also shows one friendly line. Like every once-a-walk
// thing it is kept in the discovery log, so a walk picked up again does not
// count the ride twice.
// =============================================================================
import { RIDE_PAGE, RIDE_TOASTS, BOAT_PAID, GAME_WORDS, GAME_AGAIN, PRIZE_WEAR, VISITOR_HELLO, FAIR_FIND_WORDS } from '../fairwords.js';
import { crumb } from '../diagnostics.js';
import { FAIR_GAME_IDS, gameJournalId, fairFindJournalId } from '../fairprizes.js';

export const rideKey = (ride) => `fair-ride-${ride}`;

// noteRide(ride, { log, progression, hud }) → { fresh, first }.
//   fresh   the first time on this ride on this walk
//   first   and the first time ever
export function noteRide(ride, { log, progression, hud }) {
  const page = RIDE_PAGE[ride];
  const key = rideKey(ride);
  if (!page || log.count(key) > 0) return { fresh: false, first: false };
  const seen = progression.state?.journal?.[page];
  const first = !(Number.isFinite(seen) && seen > 0);
  log.mark(key);
  progression.recordSighting(page);
  if (first) hud.toast(RIDE_TOASTS[ride]());
  return { fresh: true, first };
}

// noteBoatLap({ log }) → paws paid. A whole swing ridden with her cat aboard pays
// AWARDS.boatride, the first BOAT_PAY_CAP rides of a walk (keys in the discovery
// log, so a walk picked up again does not pay them twice); later swings pay nothing.
// It runs on each rider's own device for her own cat, so a partner is paid by hers.
export const BOAT_PAY_CAP = 2;
export const boatRideKey = (n) => `fair-boat-ride-${n}`;
export function noteBoatLap({ log }) {
  for (let n = 1; n <= BOAT_PAY_CAP; n++) {
    if (log.count(boatRideKey(n)) === 0) return log.awardOnce('boatride', boatRideKey(n), BOAT_PAID());
  }
  return 0;
}

// ---- step 3: the three games and the six finds --------------------------------
// WHAT IS PAID
//   * A game won: the FIRST win ever gives its prize to wear (progression.js
//     winFairGame: owned from then on, and put on if that slot is bare) and no
//     coins. A win on any later walk pays AWARDS.fairgame, once a walk for
//     each game. Its journal page counts the walks it was won on.
//   * A find: AWARDS.fairfind coins the FIRST TIME EVER, and nothing after
//     that. Every walk it is found on counts on its page, once, and gets its
//     quiet line, once.
// Both go by the discovery log's keys, which a walk picked up again carries
// (walkresume.js `paid`): nothing is paid, given or said twice.
export const gameKey = (id) => `fair-game-${id}`;
export const fairFindKey = (id) => `fair-find-${id}`;
// The runaway balloon's ribbon: something to carry, out of sight until she catches the balloon.
export const BALLOON_RIBBON_ID = 'fair-balloon-ribbon';

// winFairGame(game, { log, progression, hud }) → { fresh, first, prize, points }.
//   fresh   the first win at this game on this walk
//   first   and the first ever: `prize` is what she won to wear
export function winFairGame(game, { log, progression, hud }) {
  const words = GAME_WORDS[game];
  if (!words || !FAIR_GAME_IDS.includes(game)) return { fresh: false, first: false, prize: null, points: 0 };
  const key = gameKey(game);
  if (log.count(key) > 0) {
    hud.toast(GAME_AGAIN());
    return { fresh: false, first: false, prize: null, points: 0 };
  }
  const seen = progression.state?.journal?.[gameJournalId(game)];
  const first = !(Number.isFinite(seen) && seen > 0);
  let points = 0;
  if (first) {
    log.mark(key);
    hud.toast(words.first());
    hud.toast(PRIZE_WEAR());
  } else {
    points = log.awardOnce('fairgame', key, words.won());
  }
  const won = progression.winFairGame(game);
  return { fresh: true, first, prize: won?.prize ?? null, points };
}

// noteFairFind(id, { log, progression }) → { fresh, first, points }.
export function noteFairFind(id, { log, progression }) {
  const words = FAIR_FIND_WORDS[id];
  const key = fairFindKey(id);
  if (!words || log.count(key) > 0) return { fresh: false, first: false, points: 0 };
  const page = fairFindJournalId(id);
  const seen = progression.state?.journal?.[page];
  const first = !(Number.isFinite(seen) && seen > 0);
  const points = first ? log.awardOnce('fairfind', key, words.first()) : 0;
  if (!first) log.mark(key);
  progression.recordSighting(page);
  return { fresh: true, first, points };
}

// The prompt for what E would do (fairgames.js actionFor).
export function fairPromptText(action) {
  if (!action) return null;
  if (action.kind === 'play') return (action.again ? GAME_WORDS[action.game]?.again() : GAME_WORDS[action.game]?.prompt()) ?? null;
  if (action.kind === 'bat') return GAME_WORDS.cans.batPrompt();
  if (action.kind === 'pick') return GAME_WORDS.ducks.pickPrompt();
  return null;
}

// The balloon's ribbon as something to carry: made with the walk, out of sight.
export function addBalloonRibbon(carry, area) {
  const f = area.anchors.balloonField;
  return carry.items.addHidden({ id: BALLOON_RIBBON_ID, kind: 'ribbon', x: (f.minX + f.maxX) / 2, z: (f.minZ + f.maxZ) / 2 });
}

// A walk picked up again: a balloon it had already caught is not there to catch twice.
export function restoreFairGames(fair, { log }) {
  if (fair?.games && log.count(fairFindKey('balloon')) > 0) fair.games.markBalloonCaught();
}

// handleFairEvent(e, ctx): one event of the rides, the games, the finds or the visitors.
//   ctx   { hud, audio, log, progression, session, once }
//           once(key, text)   a toast shown once a walk
export function handleFairEvent(e, ctx) {
  const { audio, session, hud, log, progression } = ctx;
  const once = ctx.once ?? ((_key, text) => hud.toast(text));
  const find = (id) => {
    const got = noteFairFind(id, { log, progression });
    if (got.fresh && !got.first) hud.toast(FAIR_FIND_WORDS[id].again());
    return got;
  };
  switch (e.type) {
    case 'note': audio.musicBoxNote?.(e.freq, e.volume); break;
    case 'calliope': audio.calliope?.(e.freq, e.chord, e.volume); break;
    case 'murmur': audio.crowdMurmur?.(e.volume); break;
    case 'bell': audio.rideBell?.(e.volume); break;
    case 'firework-pop': audio.firework?.(e.volume); break; // a soft far-off pop (the sound switch holds it)
    case 'arrive': audio.rideBell?.(0.9); break; // the ticket-bell as she walks in under the gate (the confetti puff is the fair's own)
    case 'bed': { // the sound beds of the places she walks through: the hawkers' murmur, a sizzle by the food stalls, birds, the farm beyond the hedge
      const v = e.volume;
      if (e.bed === 'hawkers') audio.crowdMurmur?.(v);
      else if (e.bed === 'sizzle') audio.crowdMurmur?.(v * 0.6); // (no sizzle sound of its own yet: the same soft noise, a little quieter)
      else if (e.bed === 'birds') audio.peep?.(v * 0.5);
      else if (e.bed === 'drum') audio.crowdMurmur?.(v * 0.6); // rain drumming on the canvas (the same soft noise)
      else if (e.bed === 'thunder') audio.landThump?.(); // thunder, far away
      else if (e.bed === 'gust') audio.pounceWhoosh?.(); // a gust whooshes over the fair
      else if (e.bed === 'farm') { if ((e.n ?? 0) % 2) audio.cluck?.(v * 0.5); else audio.moo?.(v * 0.45); }
      break;
    }
    case 'lucky': audio.findChime?.(); audio.chime?.(); break; // the lucky bulb turns gold
    case 'ride-whoosh': audio.crowdMurmur?.(e.volume * 0.7); break; // the air of a ride going by: the same soft noise swell
    case 'ride':
      crumb(`ride:${e.ride}`);
      if (e.ride === 'boat') once('fair-boat', RIDE_TOASTS.boat());
      else noteRide(e.ride, ctx);
      break;
    case 'boat-lap': noteBoatLap(ctx); break;
    case 'slide': audio.pounceWhoosh?.(); break;
    case 'boat-whoosh': audio.pounceWhoosh?.(); break;
    case 'boat-creak': audio.creak?.(e.volume); break;
    case 'slide-end': audio.landThump?.(); break;
    case 'dismount': crumb('dismount'); session?.fx?.burst(session.cat.position, 0xcbb8a0, 8); break;
    // ---- the games ----
    case 'game-start': if (!e.auto) hud.toast(GAME_WORDS[e.game].start()); break;
    case 'tins-down':
      audio.landThump?.();
      audio.musicBoxNote?.(1319, 0.5); // a tinny clatter
      if (e.left > 0) hud.toast(GAME_WORDS.cans.hit(e.left));
      break;
    case 'duck-pick': audio.peep?.(0.5); break;
    case 'duck-plain': hud.toast(GAME_WORDS.ducks.plain()); break;
    case 'duck-star': session?.fx?.burst(session.cat.position, 0xf7c93b, 12); break;
    case 'bell-hit':
      audio.landThump?.();
      if (e.ring) { audio.bell?.(); session?.fx?.burst(session.cat.position, 0xf7c93b, 10); }
      else hud.toast(e.level >= 0.6 ? GAME_WORDS.bell.close() : GAME_WORDS.bell.low());
      break;
    case 'game-won': {
      const got = winFairGame(e.game, { log, progression, hud });
      if (got.first) audio.fanfare?.();
      break;
    }
    // ---- the finds ----
    case 'find': find(e.id); break;
    case 'lookout': find('lookout'); break;
    case 'ball-thud': audio.landThump?.(); break;
    case 'balloon-caught':
      // a soft pff, never a bang; its ribbon is left where it was
      audio.pounceWhoosh?.();
      session?.carry?.items.placeAt(BALLOON_RIBBON_ID, e.x, e.z);
      break;
    // ---- the visitors ----
    case 'visitor-hello': once(e.type, VISITOR_HELLO()); break;
    default: break;
  }
}
