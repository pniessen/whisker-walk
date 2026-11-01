import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createInteractions } from '../src/game/interactions.js';
import { createDiscoveryLog } from '../src/discoveries.js';
import { createProgression } from '../src/progression.js';
import { createStrayCats } from '../src/straycats.js';
import { createEnemyWalkLog } from '../src/enemies.js';
import { mulberry32 } from '../src/rng.js';
import { clanCast } from '../src/clancast.js';
import { RANK_KEYS } from '../src/clanwords.js';
import { PATROL_MIN } from '../src/clancats.js';

// Task 5 (Clan Life Part 1): touch noses and boop with clan cats. The fake
// session mirrors the colony feed harness in interactions.test.js; the clan
// cats are fakes shaped like clancats.js's ClanCat.

const scene = { add() {}, remove() {} };
const AREA = { bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 } };
function fakeStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}

function fakeClanCats(members, at) {
  const list = members.map((m, i) => ({
    id: m.id, name: m.name, rank: m.rank, clan: m.clan,
    group: { position: new THREE.Vector3(at[i]?.[0] ?? 0, 0, at[i]?.[1] ?? 1) },
    greeted: false, booped: false, patrolled: false, buddy: null,
  }));
  const calls = [];
  return {
    list, calls,
    nearest(pos, maxDist, { where = null } = {}) {
      let best = null; let bestD = maxDist;
      for (const c of list) {
        const d = c.group.position.distanceTo(pos);
        if (d < bestD && (!where || where(c))) { bestD = d; best = c; }
      }
      return best;
    },
    greet(c) { c.greeted = true; calls.push(['greet', c.id]); },
    boop(c) { c.booped = true; calls.push(['boop', c.id]); },
    // Task 6: shaped like clancats.js's buddy API (only warriors and
    // apprentices; one buddy at a time per cat).
    startBuddy(c, target, opts) {
      calls.push(['startBuddy', c.id, target, opts]);
      if (c.buddy || ![RANK_KEYS.warrior, RANK_KEYS.apprentice].includes(c.rank)) return false;
      c.buddy = { target, seconds: 0 };
      return true;
    },
    endBuddy(c) {
      calls.push(['endBuddy', c.id]);
      const seconds = c.buddy?.seconds ?? 0;
      c.buddy = null;
      return { seconds };
    },
    markBeside(c) { calls.push(['markBeside', c.id]); },
    update() {}, dispose() {},
  };
}

function harness({ clanHome = true, clanEdition = true, count = 2, strayAt = null, colony = false, net = true } = {}) {
  const progression = createProgression(fakeStorage());
  const log = createDiscoveryLog(progression);
  log.startWalk();
  const awards = [];
  const realOnce = log.awardOnce.bind(log);
  log.awardOnce = (type, key, label) => {
    const pts = realOnce(type, key, label);
    awards.push([type, key, pts]);
    return pts;
  };
  const members = clanCast('woods').slice(0, count);
  const clanCats = fakeClanCats(members, members.map((_, i) => [0, 1 + i * 0.1]));
  const strayCats = createStrayCats(scene, AREA, strayAt ? 1 : 0, mulberry32(11), {
    colonyCats: strayAt ? [{ name: 'Pickles', x: strayAt[0], z: strayAt[1], wear: null }] : [],
  });
  const toasts = []; const prompts = []; const sounds = []; const sent = [];
  const session = {
    areaId: 'woods', walkStamp: 'walk-1', colonyWalk: colony,
    playerId: 'player-me-000001',
    net: net ? { sendEvent: (e) => sent.push(e) } : null,
    cat: { position: new THREE.Vector3(0, 0, 0), userData: { breed: 'tabby' } },
    areaData: { collectibles: [], scenics: [] },
    collectibleMeshes: new Map(),
    critters: { list: [], dismayNear() {} },
    strayCats, enemies: createEnemyWalkLog(),
    ghosts: { list: [], nearest: () => null },
    remotes: { nearest: () => null }, secrets: { list: [] },
    tippables: { nearest: () => null, list: [] },
    scent: { nearestMound: () => null }, goldMice: null,
    race: { promptAt: () => null }, kittenEnc: null,
    quest: null, questGiver: null, questObject: null, gifts: null, perched: null,
    freezeTime: 0, catsGreeted: 0, walk: { carried: 0, carryCap: 2 },
    fx: { burst() {} }, prompt: null, lastPromptKind: null,
    clanCats, clanHome, clanEdition, clanPaid: { friend: 0, boop: 0, patrol: 0 },
  };
  const api = createInteractions({
    MP: 1, pid: 'player-me-000001', getCloud: () => null, getPsecret: () => null,
    getSession: () => session, getIsTouch: () => false,
    player: { forward: () => new THREE.Vector3(0, 0, -1), perchY: 0, halt() {} },
    progression, log,
    hud: { toast: (t) => toasts.push(t), setPrompt: (t) => prompts.push(t), setPoints() {} },
    audio: {
      trill: () => sounds.push('trill'), purr: () => sounds.push('purr'), meow() {}, hiss() {}, fanfare() {},
    },
    catVoice() {}, snapPhoto() {}, petNameFor: () => 'x', completeBoop() {},
  });
  return {
    api, progression, sent,
    session, clanCats, awards, toasts, prompts, sounds, strayCats,
    scan: () => api.updateInteractions(session),
    pressE: () => api.handleInteract(session),
    press: () => { api.updateInteractions(session); api.handleInteract(session); },
    kind: () => session.prompt?.kind ?? null,
    paid: (type) => awards.filter((a) => a[0] === type && a[2] > 0).length,
  };
}

describe('clanmates: touch noses and boop (Clan Life Task 5)', () => {
  it('away from home, a clanmate offers touch noses only', () => {
    const h = harness({ clanHome: false, count: 1 });
    h.scan();
    expect(h.kind()).toBe('clan-greet');
    expect(h.prompts.at(-1)).toBe(`E — touch noses with ${h.clanCats.list[0].name}`);
    h.pressE();
    expect(h.clanCats.list[0].greeted).toBe(true);
    h.scan();
    expect(h.kind()).toBe(null);
  });

  it('at home: touch noses, then boop, each paying once per cat per walk', () => {
    const h = harness({ count: 1 });
    const cat = h.clanCats.list[0];
    h.press();
    expect(h.paid('friend')).toBe(1);
    expect(h.awards[0][1]).toBe(`clan-friend-${cat.id}`);
    h.scan();
    expect(h.kind()).toBe('clan-boop');
    expect(h.prompts.at(-1)).toBe(`E — boop ${cat.name} 💕`);
    h.pressE();
    expect(h.paid('boop')).toBe(1);
    expect(h.awards.at(-1)[1]).toBe(`clan-boop-${cat.id}`);
    expect(h.sounds).toContain('purr');
    h.session.prompt = { kind: 'clan-boop', data: cat };
    h.pressE();
    expect(h.paid('boop')).toBe(1);
    expect(h.paid('friend')).toBe(1);
  });


  it('touch noses and boop pay for the first 4 cats a walk, then keep working without pay', () => {
    const h = harness({ count: 6 });
    for (const cat of h.clanCats.list) {
      h.session.prompt = { kind: 'clan-greet', data: cat };
      h.pressE();
      h.session.prompt = { kind: 'clan-boop', data: cat };
      h.pressE();
    }
    expect(h.paid('friend')).toBe(4);
    expect(h.paid('boop')).toBe(4);
    expect(h.session.clanPaid).toMatchObject({ friend: 4, boop: 4 });
    // the fifth and sixth still happened
    expect(h.clanCats.list.slice(4).every((c) => c.greeted && c.booped)).toBe(true);
    expect(h.sounds.filter((s) => s === 'purr').length).toBe(6);
    expect(h.sounds.filter((s) => s === 'trill').length).toBe(6);
  });

  it('Legacy: no clanmate prompt at all', () => {
    const h = harness({ clanEdition: false });
    h.scan();
    expect(h.kind()).toBe(null);
  });

  it('a clan cat never gets the feed prompt', () => {
    const h = harness({ count: 1, colony: true });
    h.press();
    h.scan();
    expect(['stray-feed', 'stray-wait']).not.toContain(h.kind());
  });

  it('a stray standing nearer still gets its greet first', () => {
    const h = harness({ count: 1, strayAt: [0, 0.5] });
    h.scan();
    expect(h.kind()).toBe('stray');
  });

  it('the clan branches touch no colony, recordGreet or grudge', () => {
    const src = readFileSync(new URL('../src/game/interactions.js', import.meta.url), 'utf8');
    const a = src.indexOf("s.prompt.kind === 'clan-greet'");
    expect(a).toBeGreaterThan(0);
    const clanFamily = (k) => /^clan-/.test(k);
    let end = a;
    const re = /\} else if \(s\.prompt\.kind === '([^']+)'/g;
    re.lastIndex = a + 10;
    let m;
    while ((m = re.exec(src))) {
      if (!clanFamily(m[1])) { end = m.index; break; }
    }
    expect(end).toBeGreaterThan(a);
    const slice = src.slice(a, end).replace(/\/\/.*$/gm, '');
    for (const bad of ['colony', 'recordGreet', 'Grudge', 'completeBoop']) {
      expect(slice).not.toContain(bad);
    }
    // Task 6: the only thing a clan branch sends is the patrol's clan-buddy.
    const sends = [...slice.matchAll(/sendEvent\(\{[^}]*type: '([^']+)'/g)].map((m) => m[1]);
    expect(slice.split('sendEvent').length - 1).toBe(sends.length);
    for (const t of sends) expect(t).toBe('clan-buddy');
  });
});

describe('patrol together (Clan Life Task 6)', () => {
  const K = RANK_KEYS;
  // Everyone else steps out of range, so the prompt is about this cat only.
  function only(h, cat) {
    for (const c of h.clanCats.list) {
      if (c !== cat) c.group.position.set(100, 0, 100);
    }
    cat.group.position.set(0, 0, 1);
    cat.greeted = true;
    cat.booped = true;
  }
  const byRank = (h, rank, i = 0) => h.clanCats.list.filter((c) => c.rank === rank)[i];

  it('at home after a boop: a warrior or apprentice offers a patrol; the camp keepers do not', () => {
    const h = harness({ count: 16 });
    const warrior = byRank(h, K.warrior);
    only(h, warrior);
    h.scan();
    expect(h.kind()).toBe('clan-patrol');
    expect(h.prompts.at(-1)).toBe(`E — patrol with ${warrior.name}`);
    const apprentice = byRank(h, K.apprentice);
    only(h, apprentice);
    h.scan();
    expect(h.kind()).toBe('clan-patrol');
    for (const rank of [K.kit, K.elder, K.deputy, K.leader]) {
      const c = byRank(h, rank);
      expect(c, rank).toBeTruthy();
      only(h, c);
      h.scan();
      expect(h.kind(), rank).toBe(null);
    }
  });

  it('a warrior offers no patrol before the boop, nor away from home', () => {
    const h = harness({ count: 16 });
    const warrior = byRank(h, K.warrior);
    only(h, warrior);
    warrior.booped = false;
    h.scan();
    expect(h.kind()).toBe('clan-boop');
    const away = harness({ count: 16, clanHome: false });
    const w2 = byRank(away, K.warrior);
    only(away, w2);
    away.scan();
    expect(away.kind()).toBe(null);
  });

  it('E starts the patrol: it follows my cat, says so once, and sends one clan-buddy on', () => {
    const h = harness({ count: 16 });
    const warrior = byRank(h, K.warrior);
    only(h, warrior);
    h.press();
    expect(warrior.buddy).not.toBe(null);
    expect(warrior.buddy.target).toBe(h.session.cat);
    expect(warrior.patrolled).toBe(true);
    expect(h.toasts.at(-1)).toBe(`${warrior.name} walks the border with you 🐾`);
    expect(h.sent).toEqual([{ v: 1, id: 'player-me-000001', type: 'clan-buddy', catId: warrior.id, on: true }]);
    expect(h.awards).toEqual([]);
    // while it walks with me, the slot offers goodbye
    h.scan();
    expect(h.kind()).toBe('clan-bye');
    expect(h.prompts.at(-1)).toBe(`E — say goodbye to ${warrior.name}`);
  });

  it('an end after 35 s pays the patrol once; the same cat is not offered again this walk', () => {
    const h = harness({ count: 16 });
    const warrior = byRank(h, K.warrior);
    only(h, warrior);
    h.press();
    warrior.buddy.seconds = 35;
    h.api.endClanPatrol(h.session, warrior, 'time', 35);
    expect(h.paid('patrol')).toBe(1);
    expect(h.awards.at(-1)[1]).toBe(`patrol-${warrior.id}`);
    expect(h.toasts.at(-1)).toBe(`${warrior.name} heads back to camp. Good patrol!`);
    expect(h.sent.at(-1)).toEqual({ v: 1, id: 'player-me-000001', type: 'clan-buddy', catId: warrior.id, on: false });
    // a second end for the same patrol is a no-op
    h.api.endClanPatrol(h.session, warrior, 'time', 35);
    expect(h.paid('patrol')).toBe(1);
    expect(h.sent.filter((e) => e.on === false)).toHaveLength(1);
    h.scan();
    expect(h.kind()).toBe(null);
  });

  it('an end after 10 s pays nothing; far says it could not keep up', () => {
    const h = harness({ count: 16 });
    const warrior = byRank(h, K.warrior);
    only(h, warrior);
    h.press();
    h.api.endClanPatrol(h.session, warrior, 'far', 10);
    expect(h.paid('patrol')).toBe(0);
    expect(h.toasts.at(-1)).toBe(`${warrior.name} couldn't keep up!`);
    expect(PATROL_MIN).toBe(30);
  });

  it('say goodbye ends it through endBuddy and pays when long enough', () => {
    const h = harness({ count: 16 });
    const warrior = byRank(h, K.warrior);
    only(h, warrior);
    h.press();
    warrior.buddy.seconds = 31;
    h.press(); // clan-bye
    expect(h.clanCats.calls.some((c) => c[0] === 'endBuddy' && c[1] === warrior.id)).toBe(true);
    expect(warrior.buddy).toBe(null);
    expect(h.paid('patrol')).toBe(1);
    expect(h.toasts.at(-1)).toBe(`${warrior.name} heads back to camp. Good patrol!`);
  });

  it('a third full patrol with another cat pays nothing (cap 2), but still happens', () => {
    const h = harness({ count: 16 });
    const roamers = h.clanCats.list.filter((c) => c.rank === K.warrior || c.rank === K.apprentice);
    for (const cat of roamers.slice(0, 3)) {
      only(h, cat);
      h.press();
      expect(cat.buddy).not.toBe(null);
      h.api.endClanPatrol(h.session, cat, 'time', 60);
    }
    expect(h.paid('patrol')).toBe(2);
    expect(h.session.clanPaid.patrol).toBe(2);
    expect(h.sent.filter((e) => e.on === true)).toHaveLength(3);
  });

  it('only one patrol at a time: another warrior offers none while a buddy walks with me', () => {
    const h = harness({ count: 16 });
    const [w1, w2] = h.clanCats.list.filter((c) => c.rank === K.warrior);
    only(h, w1);
    h.press();
    w2.greeted = true; w2.booped = true;
    w1.group.position.set(100, 0, 100);
    w2.group.position.set(0, 0, 1);
    h.scan();
    expect(h.kind()).toBe(null);
  });

  it("an end for a cat that isn't my buddy (a co-walker's) pays and sends nothing", () => {
    const h = harness({ count: 16 });
    const warrior = byRank(h, K.warrior);
    h.api.endClanPatrol(h.session, warrior, 'time', 60);
    expect(h.awards).toEqual([]);
    expect(h.sent).toEqual([]);
    expect(h.toasts).toEqual([]);
  });

  it('scratching a mark with a buddy: the echo, and no progression call beyond the mark', () => {
    const h = harness({ count: 16 });
    const warrior = byRank(h, K.warrior);
    only(h, warrior);
    h.press();
    const used = [];
    for (const k of Object.keys(h.progression)) {
      const f = h.progression[k];
      if (typeof f !== 'function') continue;
      h.progression[k] = (...args) => { used.push(k); return f(...args); };
    }
    const awardsBefore = h.awards.length;
    h.session.prompt = { kind: 'mark', data: { id: 'woods-post-1', x: 3, z: 3 } };
    h.pressE();
    expect(h.toasts.at(-1)).toBe(`${warrior.name} marks it too 🐾`);
    expect(h.clanCats.calls.some((c) => c[0] === 'markBeside' && c[1] === warrior.id)).toBe(true);
    expect(new Set(used)).toEqual(new Set(['marksIn', 'addMark']));
    expect(h.awards.length).toBe(awardsBefore);
  });

  it('createInteractions returns endClanPatrol, and walk.js wires the buddy end to it', () => {
    const h = harness();
    expect(typeof h.api.endClanPatrol).toBe('function');
    const walk = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');
    expect(walk).toMatch(/onClanBuddyEnd = \(cat, reason, secs\) => endClanPatrol\(session, cat, reason, secs\);/);
    // the clan cats know their territory, so a patrol can end at its camp
    const call = walk.slice(walk.indexOf('createClanCats(scene'), walk.indexOf('NO_CLAN_CATS;'));
    expect(call).toMatch(/^\s*areaId,$/m);
    const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    expect(main).toMatch(/endClanPatrol,/);
  });

  it('walk end pays nothing for an unfinished patrol (no award call in the release)', () => {
    const walk = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');
    const a = walk.indexOf('// Patrol together: a walk-along still going');
    expect(a).toBeGreaterThan(0);
    const slice = walk.slice(a, walk.indexOf('\n\n', a));
    expect(slice).toContain("type: 'clan-buddy'");
    expect(slice).not.toMatch(/award|endClanPatrol/);
  });
});
