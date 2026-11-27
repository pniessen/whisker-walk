import { bus } from './events.js';

export const AWARDS = {
  critter: 5, collectible: 10, pet: 4, scenic: 8, moment: 12, perk: 3, friend: 6,
  play: 5, quest: 25, photo: 8, secret: 12, legend: 50, rainbow: 15,
  mischief: 4, sits: 8, treasure: 12,
  goal: 15, jackpot: 40, gift: 10,
  rally: 6, nappile: 10, duet: 5, boop: 5,
  hunt: 12,
  tag: 8, groom: 6, duogoal: 20,
  // Clan Life Part 1, Task 6: a patrol with a clanmate (once per cat per walk,
  // the first 2 a walk: interactions.js CLAN_PAY_CAP).
  patrol: 8,
  // Clan Life Part 2, Task 4: an intruder chased off your land (once per
  // visit, wins only). Its feat tally is the journal's "chased off" count.
  intruder: 12,
  // Border patrol fight (2026-11-04, B7): another clan's border patrol warrior
  // faced down on its own land (once a walk, wins only). Its own feat tally,
  // so the journal's "chased off" count stays intruders only.
  border: 12,
  // Appletree Farm (2026-11-18): a job finished (once a walk for each of the
  // four; what a neighbour's quest pays), and one of its six finds, paid the
  // first time ever. Their feat tallies are the lifetime counts of both.
  farmjob: 25,
  farmfind: 12,
  // The Old House (step 2, D6): one of its six finds, once a walk.
  housefind: 12,
  // The Fairground (2026-11-18): one of its three games won on a later walk
  // than its first win ever (that one gives a prize to wear instead), once a
  // walk for each game; and one of its six finds, paid the first time ever.
  fairgame: 15,
  fairfind: 12,
  // The Rooftops (2026-11-21): one of its six finds, paid the first time ever.
  roofsfind: 12,
  // The Market Square (2026-11-21): one of its six finds, paid the first time
  // ever (world/marketfinds.js noteMarketFind).
  marketfind: 12,
  // Lighthouse Point (2026-11-22): the lamp lit, once a walk (world/lighthouselife.js; what the Farm's jobs pay).
  lighthousejob: 25,
  // ...and one of its six finds, paid the first time ever (world/lighthousefinds.js noteLighthouseFind).
  lighthousefind: 12,
  // The Moon (2026-11-23, ids reserved in milestone 0): one of its six finds, paid the first time ever; Pip's postcard of the
  // day, once a walk; and the story's end (the reply from Earth), once ever.
  moonfind: 12,
  moonjob: 25,
  moonstory: 40,
  moonrelay: 40, // the far station answered and the Signal Tag is hers, once ever (wing E, M3)
  // The Reef (2026-11-26, ids reserved in milestone R0): one of its six finds, paid the first time ever; Marlo's errand of the day,
  // once a walk; and the story's end (the housewarming), once ever.
  reeffind: 12,
  reefstory: 40,
  reeflab: 40, // the Sealab dome show, once (R15; nothing pays it yet)
  reefwreck: 40, // the Captain's Chest, once (R17; nothing pays it yet)
  reefjob: 25,
  // The Crystal Cave (2026-11-26, ids reserved in milestone C0): one of its six finds, paid the first time ever; Lumi's glow errand of the
  // day, once a walk; and the story's end (the Heart Crystal wakes), once ever.
  cavefind: 12,
  crystalstory: 40,
  crystalforge: 40, // the Crystal Circlet made at the forge, once ever (wing C, C3)
  cavejob: 25,
  // The Greenhouse (ids reserved in milestone G2): one of its six finds, paid the first time ever; a job done (seeds sown, plants
  // watered), once a walk.
  greenhousefind: 12,
  greenhousejob: 25,
  // Snowville (2026-11-27): one of its six finds, paid the first time ever (world/snowvillefinds.js).
  snowfind: 12,
  // The Treehouse village (2026-11-27): one of its six finds, paid the first time ever (world/treehousefinds.js).
  treefind: 12,
  // Found outfits (2026-11-19): the walk's find when everything hidden in the
  // place is already hers, the spec's "a small coin pouch instead (Claude's
  // call: 5 coins)" (the coins are 🐾). Once a walk (foundwear/play.js), and
  // the same number as foundwear/rules.js POUCH_COINS.
  pouch: 5,
  // The Market Square (step 2, M9): a treat eaten, once per stall per walk
  // (game/marketplay.js, key 'market-treat-<stall>'), and teamwork, paid on
  // the distracter's own device when her partner grabs the treat at the stall
  // cooing at her (once per stall per walk, 'market-team-<stall>').
  treat: 6,
  teamtreat: 6,
};

export function createDiscoveryLog(progression) {
  let seen = new Map();

  function pay(type, key, label, points, repeat) {
    progression.addPoints(points);
    // v18 Cat Skills: the SINGLE hook point that feeds state.feats' lifetime
    // per-type tallies, which is what the skill feat predicates in
    // src/skills.js read. Every award() / awardOnce() in the game funnels
    // through pay(), so tallying here (rather than at the ~45 individual
    // award call sites) means no call site can forget, and a future award
    // type becomes a lifetime counter for free.
    //
    // Optional-called because createDiscoveryLog is handed a stand-in
    // progression in unit tests (a bare { addPoints } is enough to exercise
    // the repeat/awardOnce rules) — a missing recordFeat must not turn those
    // into crashes.
    progression.recordFeat?.(type);
    bus.emit('discovery', { type, key, label, points, repeat });
    return points;
  }

  return {
    startWalk() {
      seen = new Map();
    },
    // Mid-walk resume (game/walkresume.js): what this walk has already paid
    // for, as [key, count] pairs, and putting it back after startWalk() on a
    // walk picked up again. Without it, closing and reopening the game would
    // pay every once-per-walk award a second time.
    entries() {
      return [...seen];
    },
    restore(entries) {
      for (const [key, n] of entries) seen.set(key, n);
    },
    count(key) {
      return seen.get(key) || 0;
    },
    // Seen on this walk, and paid nothing (the Farm's finds after the first
    // time ever: game/farmplay.js). A later awardOnce for the key pays nothing.
    mark(key) {
      if (!seen.has(key)) seen.set(key, 1);
    },
    award(type, key, label) {
      const n = seen.get(key) || 0;
      seen.set(key, n + 1);
      const base = AWARDS[type];
      const points = n === 0 ? base : Math.max(1, Math.round(base / 2));
      return pay(type, key, label, points, n > 0);
    },
    awardOnce(type, key, label) {
      if (seen.has(key)) return 0;
      seen.set(key, 1);
      return pay(type, key, label, AWARDS[type], false);
    },
  };
}
