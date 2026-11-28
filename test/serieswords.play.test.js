// The series-words snapshot, part 2: what a WALK says. The prompts and toasts
// for a group cat (touch noses, boop, patrol, goodbye) and for meeting a stray
// are written inside src/game/interactions.js's closure, so they are recorded
// here by driving the real createInteractions with a session stand-in (the
// one test/clanmates.test.js uses), in Clan Edition and in Legacy Edition.
//
// See test/serieswords.test.js for what the snapshot is for. Re-record ONLY
// when the owner or the older playtester has asked for a wording change in
// the "on" game:  UPDATE_SERIES_SNAPSHOT=1 npx vitest run test/serieswords
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createInteractions } from '../src/game/interactions.js';
import { createDiscoveryLog } from '../src/discoveries.js';
import { createProgression } from '../src/progression.js';
import { createEnemyWalkLog, rollHostile } from '../src/enemies.js';
import { clanCast } from '../src/clancast.js';
import { HOMES } from '../src/clanhomes.js';
import { RANK_KEYS } from '../src/wordids.js';
import { PATROL_MIN } from '../src/clancats.js';
import { CAT_NAMES, KITTYPET_NAMES, LEGENDARY_NAMES, isKittypetName } from '../src/straynames.js';
import { discoveryText } from '../src/ui/hud.js';
import { checkAgainstFixture } from './helpers/serieswords.js';
import { withStandInWords, leaksIn, standInCount } from './helpers/standinwords.js';
import { memoryStorage as memStorage } from './helpers/storage.js';

const FIXTURE = 'series-words-on-play.json';
const CLANS = Object.keys(HOMES);
const ME = 'player-me-000001';

// Group cats shaped like clancats.js's, standing in a row in front of her.
function fakeClanCats(members) {
  const list = members.map((m, i) => ({
    id: m.id, name: m.name, rank: m.rank, clan: m.clan,
    group: { position: new THREE.Vector3(0, 0, 1 + i * 0.1) },
    greeted: false, booped: false, patrolled: false, buddy: null,
  }));
  return {
    list,
    nearest(pos, maxDist, { where = null } = {}) {
      let best = null; let bestD = maxDist;
      for (const c of list) {
        const d = c.group.position.distanceTo(pos);
        if (d < bestD && (!where || where(c))) { bestD = d; best = c; }
      }
      return best;
    },
    greet(c) { c.greeted = true; },
    boop(c) { c.booped = true; },
    startBuddy(c, target) {
      if (c.buddy || ![RANK_KEYS.warrior, RANK_KEYS.apprentice].includes(c.rank)) return false;
      c.buddy = { target, seconds: 0 };
      return true;
    },
    endBuddy(c) { const seconds = c.buddy?.seconds ?? 0; c.buddy = null; return { seconds }; },
    markBeside() {}, update() {}, dispose() {},
  };
}

function harness({ edition = 'canon', clanHome = true, members = [] } = {}) {
  const progression = createProgression(memStorage());
  if (edition !== 'canon') progression.setEdition(edition);
  const log = createDiscoveryLog(progression);
  log.startWalk();
  const said = [];
  const awardOnce = log.awardOnce.bind(log);
  log.awardOnce = (type, key, label) => {
    const pts = awardOnce(type, key, label);
    if (pts > 0) said.push(`award: ${discoveryText({ type, label, repeat: false })}`);
    return pts;
  };
  const award = log.award.bind(log);
  log.award = (type, key, label) => {
    said.push(`award: ${discoveryText({ type, label, repeat: false })}`);
    return award(type, key, label);
  };
  const clanCats = fakeClanCats(members);
  const strays = [];
  const session = {
    areaId: 'woods', walkStamp: 'walk-1', colonyWalk: false, playerId: ME, net: null,
    cat: { position: new THREE.Vector3(0, 0, 0), userData: { breed: 'tabby' } },
    areaData: { collectibles: [], scenics: [] }, collectibleMeshes: new Map(),
    critters: { list: [], dismayNear() {} },
    strayCats: { strays, list: strays, nearest: () => null, greet(s) { s.greeted = true; }, turnHostile(s) { s.greeted = true; s.cross = true; } },
    enemies: createEnemyWalkLog(),
    ghosts: { list: [], nearest: () => null }, remotes: { nearest: () => null }, secrets: { list: [] },
    tippables: { nearest: () => null, list: [] }, scent: { nearestMound: () => null }, goldMice: null,
    race: { promptAt: () => null }, kittenEnc: null, quest: null, questGiver: null, questObject: null,
    gifts: null, perched: null, freezeTime: 0, catsGreeted: 0, walk: { carried: 0, carryCap: 2 },
    fx: { burst() {} }, prompt: null, lastPromptKind: null,
    clanCats, clanHome, clanEdition: edition === 'canon', clanPaid: { friend: 0, boop: 0, patrol: 0 },
  };
  const api = createInteractions({
    MP: 1, pid: ME, getCloud: () => null, getPsecret: () => null, getSession: () => session, getIsTouch: () => false,
    player: { forward: () => new THREE.Vector3(0, 0, -1), perchY: 0, halt() {} },
    progression, log,
    hud: { toast: (t) => said.push(`toast: ${t}`), setPrompt: (t) => { if (t) said.push(`prompt: ${t}`); }, setPoints() {} },
    audio: { trill() {}, purr() {}, meow() {}, hiss() {}, fanfare() {} },
    catVoice() {}, snapPhoto() {}, petNameFor: () => 'x', completeBoop() {},
  });
  return { api, session, said, progression, strays, clanCats };
}

// One group cat at home: everything it offers, in the order a child meets it.
function clanmate(member, edition = 'canon') {
  const h = harness({ edition, members: [member] });
  const cat = h.clanCats.list[0];
  const step = () => { h.api.updateInteractions(h.session); if (h.session.prompt) h.api.handleInteract(h.session); };
  step(); // touch noses
  step(); // boop
  step(); // patrol (a warrior or an apprentice), nothing for the others
  if (h.session.clanBuddy === cat) {
    h.api.updateInteractions(h.session); // the goodbye prompt
    cat.buddy.seconds = PATROL_MIN;
    h.api.handleInteract(h.session);
  }
  return h.said;
}

// How a patrol with her buddy can end.
function patrolEndings(member) {
  const out = {};
  for (const [key, reason, seconds] of [['tooShort', 'time', PATROL_MIN - 1], ['longEnough', 'camp', PATROL_MIN], ['outran', 'far', PATROL_MIN]]) {
    const h = harness({ members: [member] });
    const cat = h.clanCats.list[0];
    h.session.clanBuddy = cat;
    h.api.endClanPatrol(h.session, cat, reason, seconds);
    out[key] = h.said;
  }
  return out;
}

// Away from home a group cat only touches noses.
function awayFromHome(member) {
  const h = harness({ clanHome: false, members: [member] });
  h.api.updateInteractions(h.session);
  h.api.handleInteract(h.session);
  h.api.updateInteractions(h.session);
  return h.said;
}

// Greeting one stray on six walks: met, friend, best friend. The walk stamps
// are the first ones on which the game's own roll keeps the cat friendly.
function strayLadder(name, edition = 'canon') {
  const h = harness({ edition });
  const stray = { name, breed: 'tabby', greeted: false, group: { position: new THREE.Vector3(0, 0, 1) } };
  h.strays.push(stray);
  let n = 0;
  for (let w = 1; n < 6 && w < 400; w++) {
    const stamp = `walk-${w}`;
    if (rollHostile(stamp, name, { charmer: false })) continue;
    h.session.walkStamp = stamp;
    stray.greeted = false;
    h.api.awardStrayGreet(h.session, stray);
    n++;
  }
  return h.said.filter((t) => t.startsWith('toast:') || /legend/i.test(t));
}

// The first walk on which the same roll makes the cat cross.
function strayTurnsCross(name, edition = 'canon') {
  const h = harness({ edition });
  const stray = { name, breed: 'tabby', greeted: false, group: { position: new THREE.Vector3(0, 0, 1) } };
  h.strays.push(stray);
  for (let w = 1; w < 2000; w++) {
    const stamp = `walk-${w}`;
    if (!rollHostile(stamp, name, { charmer: false })) continue;
    h.session.walkStamp = stamp;
    h.api.awardStrayGreet(h.session, stray);
    break;
  }
  return h.said.filter((t) => t.startsWith('toast:'));
}

function snapshot() {
  const woods = clanCast('woods');
  const byRank = {};
  for (const m of woods) byRank[m.rank] ??= m; // the first seat of each rank
  const stray = CAT_NAMES.find((n) => !isKittypetName(n));
  const pet = KITTYPET_NAMES[0];
  const legend = LEGENDARY_NAMES.find((n) => !isKittypetName(n));
  return {
    about: 'What a walk says about group cats and strays. Recorded by test/serieswords.play.test.js; see test/serieswords.test.js before re-recording.',
    clanEdition: {
      clanmateAtHome: Object.fromEntries(Object.keys(byRank).map((rank) => [rank, clanmate(byRank[rank])])),
      // one roaming cat of every group, so every group's names pass through the lines
      patrolWith: Object.fromEntries(CLANS.map((id) => [id, clanmate(clanCast(id)[4])])),
      patrolEnds: patrolEndings(woods[4]),
      clanmateAwayFromHome: awayFromHome(woods[4]),
      stray: { [stray]: strayLadder(stray), [pet]: strayLadder(pet), [legend]: strayLadder(legend) },
      strayTurnsCross: { [stray]: strayTurnsCross(stray), [pet]: strayTurnsCross(pet) },
    },
    legacyEdition: {
      clanmateAtHome: clanmate(woods[4], 'legacy'),
      stray: { [stray]: strayLadder(stray, 'legacy'), [pet]: strayLadder(pet, 'legacy') },
      strayTurnsCross: { [stray]: strayTurnsCross(stray, 'legacy') },
    },
  };
}

describe('series words on a walk, pinned', () => {
  it('the prompts and toasts for group cats and strays are exactly the recorded ones', () => {
    checkAgainstFixture(FIXTURE, snapshot());
  });

  it('builds the same snapshot twice in a row', () => {
    expect(JSON.stringify(snapshot())).toBe(JSON.stringify(snapshot()));
  });

  // 2026-11-17. The same walk, with a stand-in word set in use
  // (test/helpers/standinwords.js: nonsense words, NOT the plain game's).
  it('with a stand-in word set in use, no word of the "on" set is left in a prompt or a toast', () => {
    const snap = withStandInWords(() => snapshot());
    expect(leaksIn(snap)).toEqual([]);
    expect(standInCount(snap)).toBeGreaterThan(20);
    checkAgainstFixture(FIXTURE, snapshot());
  });
});

// ---- the everyday words ('off'), added 2026-11-18 ------------------------------
// The same snapshot, built by the same code, with the everyday word set in
// use (src/offclanwords.js), recorded in its own fixture. Those words are the
// older playtester's picks; re-record with
//   UPDATE_OFF_SNAPSHOT=1 npx vitest run test/serieswords
// when she or the owner changes one, and read the diff line by line.
import { withOffWords, bannedLeaks, offWordCount } from './helpers/offwords.js';
import { UPDATING_OFF } from './helpers/serieswords.js';

const OFF_FIXTURE = 'series-words-off-play.json';
const OFF_IGNORE = [];
describe('everyday words: a walk', () => {
  it('shows exactly the recorded everyday words', () => {
    checkAgainstFixture(OFF_FIXTURE, withOffWords(() => snapshot()), UPDATING_OFF);
  });

  it('shows no word of the family\'s set, and plenty of the everyday ones', () => {
    const snap = withOffWords(() => snapshot());
    expect(bannedLeaks(snap, OFF_IGNORE)).toEqual([]);
    expect(offWordCount(snap)).toBeGreaterThan(20);
  });

  it('and the family\'s words are back afterwards', () => {
    withOffWords(() => snapshot());
    checkAgainstFixture(FIXTURE, snapshot());
  });
});
