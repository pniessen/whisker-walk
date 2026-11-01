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
    update() {}, dispose() {},
  };
}

function harness({ clanHome = true, clanEdition = true, count = 2, strayAt = null, colony = false } = {}) {
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
  const toasts = []; const prompts = []; const sounds = [];
  const session = {
    areaId: 'woods', walkStamp: 'walk-1', colonyWalk: colony,
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

  it('the patrol offer is not produced yet', () => {
    const h = harness({ count: 1 });
    h.press(); h.press();
    h.scan();
    expect(h.kind()).not.toBe('clan-patrol');
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
    for (const bad of ['colony', 'recordGreet', 'Grudge', 'completeBoop', 'sendEvent']) {
      expect(slice).not.toContain(bad);
    }
  });
});
