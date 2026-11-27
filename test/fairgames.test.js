// The Fairground, step 3: the three midway games and the six things to find
// (src/fairgames.js), the visitors (src/fairvisitors.js), how they are drawn
// (src/fairshow.js), what they pay (src/game/fairplay.js), their words
// (src/fairwords.js), the three prizes and their place in the save. The
// design's anti-goals are each held here: no game has a timer or can be lost,
// nothing costs coins, nothing chases or frightens the cat, and a visitor is
// never where the cat is.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { stubCanvasDocument } from './helpers/canvas.js';
import { memoryStorage } from './helpers/storage.js';

stubCanvasDocument();

const { build } = await import('../src/world/fair.js');
const { createFairSim } = await import('../src/fairsim.js');
const { createFairGames, GAME, GAME_STATES, FAIR_GAME_IDS, FAIR_FIND_IDS } = await import('../src/fairgames.js');
const { createFairVisitors, VISITOR, PAIR, visitorCount, isChildSpot } = await import('../src/fairvisitors.js');
const { spotKind } = await import('../src/people/look.js');
const { createFairShow } = await import('../src/fairshow.js');
const { createPeopleKit, BUMP } = await import('../src/people/index.js');
const { createFairLive, NO_FAIR } = await import('../src/fairlive.js');
const { FAIR_PRIZES, FAIR_PRIZE_IDS, FAIR_JOURNAL_TYPES, gameJournalId, fairFindJournalId, fairPrizesWonBy } = await import('../src/fairprizes.js');
const {
  winFairGame, noteFairFind, fairPromptText, handleFairEvent, gameKey, fairFindKey, addBalloonRibbon, restoreFairGames, BALLOON_RIBBON_ID,
} = await import('../src/game/fairplay.js');
const { GAME_WORDS, FAIR_FIND_WORDS, FAIR_PAGE_WORDS, GAME_AGAIN, PRIZE_WEAR, VISITOR_HELLO } = await import('../src/fairwords.js');
const { phrase, hasPhrase, LATER_PHRASE_IDS, PHRASE_IDS } = await import('../src/clanphrases.js');
const { createProgression, JOURNAL_TYPES, CATALOG, isPrizeAccessory, isTradeableAccessory } = await import('../src/progression.js');
const { createDiscoveryLog, AWARDS } = await import('../src/discoveries.js');
const { CRITTER_INFO, renderJournalHtml } = await import('../src/journal.js');
const { discoveryText } = await import('../src/ui/hud.js');
const { isWalkableAt, CAT_RADIUS } = await import('../src/player.js');
const { CAT_WALK, clearance } = await import('../src/farmsim.js');
const { createCarryables } = await import('../src/carryables.js');
const { createMouth } = await import('../src/carry.js');
const { propsFor, frameColliders } = await import('../src/propsets.js');
const { castsFromBox, isTransparentMat } = await import('../src/render/rig.js');
const { mulberry32 } = await import('../src/rng.js');
const { offWords, withOffWords, bannedIn } = await import('./helpers/offwords.js');
const { createInteractions } = await import('../src/game/interactions.js');
const { VISIT_PRIZES } = await import('../src/visits.js');
const { renderDressingRoomHtml } = await import('../src/ui/dressingroom.js').catch(() => ({ renderDressingRoomHtml: null }));

const DT = 1 / 30;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
const code = (p) => read(p).split('\n').filter((l) => !l.trim().startsWith('//')).map((l) => l.replace(/\/\/.*$/, '')).join('\n');
const mem = (initial) => memoryStorage(initial, { expose: 'map' });

// One built Fairground as the walk has it (the flaps' frames are solid too).
function builtFair() {
  const scene = new THREE.Scene();
  const area = build(scene);
  for (const f of propsFor('fair').flaps) for (const c of frameColliders(f)) area.colliders.push({ ...c });
  scene.updateMatrixWorld(true);
  return { scene, area };
}
const { scene: SCENE, area: AREA } = builtFair();
const A = AREA.anchors;
const SIM = createFairSim(AREA);
SIM.setTime(1234);
const inPool = (x, z, m = 0) => Math.hypot(x - A.duckPool.x, z - A.duckPool.z) < A.duckPool.r + m;

// The games, and a cat that is only numbers.
function world(seed = 'test') {
  const games = createFairGames(AREA, { seed });
  const cat = { x: 0, z: 46, y: 0, perched: false, perch: null, inWater: false, speed: 0, pouncing: false, fx: 0, fz: -1, mouthFull: false };
  const events = [];
  const w = { games, cat, events, t: 0 };
  w.tick = (dt = DT) => {
    cat.inWater = !cat.perched && inPool(cat.x, cat.z);
    games.step(dt, cat);
    for (const e of games.takeEvents()) events.push(e);
    w.t += dt;
  };
  w.run = (seconds) => { for (let s = 0; s < seconds; s += DT) w.tick(); };
  w.put = (x, z) => { cat.x = x; cat.z = z; cat.perched = false; cat.perch = null; cat.y = 0; cat.speed = 0; w.tick(); };
  // Walks toward (x, z) in a straight line at `speed`, stopping `stop` short.
  w.walk = (x, z, { speed = CAT_WALK, stop = 0.05, until = () => false, max = 120 } = {}) => {
    const t0 = w.t;
    while (w.t - t0 < max && !until()) {
      const d = Math.hypot(x - cat.x, z - cat.z);
      if (d <= stop) break;
      const stepLen = Math.min(d - stop, speed * DT);
      cat.fx = (x - cat.x) / d; cat.fz = (z - cat.z) / d;
      cat.x += cat.fx * stepLen; cat.z += cat.fz * stepLen;
      cat.speed = speed;
      w.tick();
    }
    cat.speed = 0;
    return w.t - t0;
  };
  // A pounce from where she stands, towards (x, z): 0.3 s and about a metre and a half, as the game's is.
  w.pounce = (x, z) => {
    const d = Math.hypot(x - cat.x, z - cat.z) || 1;
    const fx = (x - cat.x) / d; const fz = (z - cat.z) / d;
    cat.pouncing = true;
    for (let i = 0; i < 9; i++) { cat.x += fx * Math.min(d, 1.5) / 9; cat.z += fz * Math.min(d, 1.5) / 9; cat.speed = 5; w.tick(); }
    cat.pouncing = false;
    cat.speed = 0;
    w.tick();
  };
  w.E = () => { const a = games.actionFor(cat); const did = a ? games.act(a, cat) : false; for (const e of games.takeEvents()) events.push(e); return did ? a : null; };
  w.onCounter = () => { cat.x = games.counter.x; cat.z = games.counter.z; cat.y = games.counter.y; cat.perched = true; cat.perch = games.counter; cat.speed = 0; w.tick(); };
  w.of = (type) => events.filter((e) => e.type === type);
  return w;
}
const SEEDS = Array.from({ length: 40 }, (_, i) => `seed-${i}`);

// =============================================================================
describe('the table of games: three states, no clock, no way to lose', () => {
  it('names three games and six finds, each with a journal page', () => {
    expect([...FAIR_GAME_IDS]).toEqual(['cans', 'ducks', 'bell']);
    expect([...FAIR_FIND_IDS]).toEqual(['fortune', 'musicbox', 'candyfloss', 'juggler', 'balloon', 'lookout']);
    expect(FAIR_JOURNAL_TYPES).toHaveLength(9);
    for (const id of FAIR_JOURNAL_TYPES) {
      expect(JOURNAL_TYPES, id).toContain(id);
      const page = CRITTER_INFO.find((c) => c.id === id);
      expect(page.name).toBe(FAIR_PAGE_WORDS[id].name());
      expect(page.hint).toBe(FAIR_PAGE_WORDS[id].hint());
      expect(page.emoji.length).toBeGreaterThan(0);
    }
    // the save's list holds exactly these, after the rides' five
    const games = JOURNAL_TYPES.indexOf('gamecans');
    expect(JOURNAL_TYPES.slice(games, games + 9)).toEqual([...FAIR_JOURNAL_TYPES]);
    expect(FAIR_GAME_IDS.map(gameJournalId)).toEqual(['gamecans', 'gameducks', 'gamebell']);
    expect(fairFindJournalId('lookout')).toBe('fairlookout');
  });

  it('every game is offered, played and won, and no state is a loss or a countdown', () => {
    expect(Object.keys(GAME_STATES)).toEqual([...FAIR_GAME_IDS]);
    for (const id of FAIR_GAME_IDS) {
      expect([...GAME_STATES[id]]).toEqual(['offer', 'playing', 'won']);
      for (const s of GAME_STATES[id]) expect(s).not.toMatch(/fail|lost|lose|late|timeout|expired|miss|over/);
    }
    const w = world();
    expect(w.games.state).toEqual({ cans: 'offer', ducks: 'offer', bell: 'offer' });
  });

  it('the module keeps no clock for a game: nothing in it counts down but a wisp of candyfloss', () => {
    const src = code('fairgames.js');
    expect(src).not.toMatch(/Date\.now|performance\.now|setTimeout|setInterval|deadline|timeLeft|countdown|expire/i);
    expect(src).not.toMatch(/'(failed|lost|late|missed|gameover)'/i);
    // nothing in the games' table is a number of seconds a player must beat
    for (const key of Object.keys(GAME)) expect(key, key).not.toMatch(/LIMIT|DEADLINE|TIMEOUT/);
    // the only thing that is subtracted from over time: the wisp (a look) and a dawdler's run-up
    const counted = [...src.matchAll(/(\w+\.\w+) = Math\.max\(0, [\w.]+ - [^;]*dt\)/g)].map((m) => m[1]).sort();
    expect(counted).toEqual(['bell.run', 'wisp.t']);
    // and nothing costs coins: the games never touch the save
    expect(src).not.toMatch(/points|price|coins|progression|localStorage/);
  });

  it('left alone for an hour in every state, a game is exactly where it was', () => {
    const snap = (w) => JSON.stringify([w.games.state, w.games.tins, w.games.duck.plain, w.games.bell.tries, w.games.ducks.map((d) => d.star)]);
    // nothing taken on
    const idle = world('idle');
    idle.put(30, 30);
    const s0 = snap(idle);
    idle.run(3600);
    expect(snap(idle)).toBe(s0);
    expect(idle.events.filter((e) => e.type !== 'find')).toEqual([]);
    // every game taken on, and half played; the cat sitting beside each for an hour
    const busy = world('busy');
    busy.put(A.tinCanPlay.x, A.tinCanPlay.z);
    expect(busy.E()).toEqual({ kind: 'play', game: 'cans', again: false });
    busy.onCounter();
    expect(busy.E().kind).toBe('bat');
    const left = busy.games.tinsLeft;
    busy.run(3600);
    expect(busy.games.state.cans).toBe('playing');
    expect(busy.games.tinsLeft).toBe(left);
    busy.put(A.duckPoolSide.x, A.duckPoolSide.z);
    expect(busy.E()).toEqual({ kind: 'play', game: 'ducks', again: false });
    const stars = busy.games.ducks.map((d) => d.star);
    busy.run(3600);
    expect(busy.games.state.ducks).toBe('playing');
    expect(busy.games.ducks.map((d) => d.star)).toEqual(stars);
    busy.put(A.bellPad.x - 2, A.bellPad.z);
    expect(busy.E()).toEqual({ kind: 'play', game: 'bell', again: false });
    busy.pounce(A.bellPad.x, A.bellPad.z);
    expect(busy.games.bell.tries).toBe(1);
    busy.run(3600);
    expect(busy.games.state.bell).toBe('playing');
    expect(busy.games.bell.tries).toBe(1);
    // nothing was won, lost or taken away meanwhile
    expect(busy.of('game-won')).toEqual([]);
  });

  it('a cat that wanders anywhere for ten minutes only ever starts, plays or wins a game', () => {
    for (const seed of ['wander-a', 'wander-b', 'wander-c']) {
      const w = world(seed);
      const rnd = mulberry32(seed.length * 977 + seed.charCodeAt(7));
      const spots = [A.tinCanPlay, A.duckPool, A.bellPad, A.fortuneSeat, A.musicBox, A.candyfloss, A.jugglerWatch, { x: -15, z: -22 }, { x: 0, z: 30 }];
      let prev = { ...w.games.state };
      // (a leg can hold a whole go: a run-up and a pounce on the pad is offer -> playing -> won)
      const legal = { offer: ['offer', 'playing', 'won'], playing: ['playing', 'won', 'offer'], won: ['won', 'offer', 'playing'] };
      for (let leg = 0; leg < 60; leg++) {
        const to = spots[Math.floor(rnd() * spots.length)];
        w.walk(to.x + rnd() * 2 - 1, to.z + rnd() * 2 - 1, { max: 12, until: () => rnd() < 0.002 });
        if (rnd() < 0.6) w.E();
        if (rnd() < 0.3) w.pounce(w.cat.x + rnd() - 0.5, w.cat.z + rnd() - 0.5);
        for (const id of FAIR_GAME_IDS) {
          expect(legal[prev[id]], `${id}: ${prev[id]} -> ${w.games.state[id]}`).toContain(w.games.state[id]);
          expect(GAME_STATES[id]).toContain(w.games.state[id]);
        }
        prev = { ...w.games.state };
      }
      for (const e of w.events) expect(e.type).not.toMatch(/fail|lost|lose|over/);
      // the balloon never left its field, whatever she did
      const f = A.balloonField;
      expect(w.games.balloon.x).toBeGreaterThan(f.minX);
      expect(w.games.balloon.x).toBeLessThan(f.maxX);
    }
  });
});

// =============================================================================
describe('game 1: tin-can alley', () => {
  it('is offered in front of the stall and on its counter, and nowhere else', () => {
    const w = world();
    w.put(A.tinCanPlay.x, A.tinCanPlay.z);
    expect(isWalkableAt(AREA, w.cat.x, w.cat.z)).toBe(true);
    expect(w.games.actionFor(w.cat)).toEqual({ kind: 'play', game: 'cans', again: false });
    expect(fairPromptText(w.games.actionFor(w.cat))).toBe('E — play Tin Can Alley');
    w.onCounter();
    expect(w.games.actionFor(w.cat)).toEqual({ kind: 'play', game: 'cans', again: false });
    w.put(A.tinCanPlay.x + GAME.OFFER_R + 0.6, A.tinCanPlay.z);
    expect(w.games.actionFor(w.cat)).toBe(null);
    // the counter is one of the area's own perches: the ordinary jump gets her onto it
    expect(AREA.perches).toContain(w.games.counter);
    expect(w.games.counter.y).toBe(A.tinCanCounter.y);
    // six tins, the six meshes world/fair.js stacked
    expect(w.games.tins).toHaveLength(6);
    expect(AREA.rides.tinCans).toHaveLength(6);
  });

  it('a calm player always wins: every bat brings one to three tins down, six bats at the very most', () => {
    const batsBySeed = [];
    for (const seed of SEEDS) {
      const w = world(seed);
      w.put(A.tinCanPlay.x, A.tinCanPlay.z);
      w.E();
      expect(w.games.state.cans).toBe('playing');
      // from the ground the tins are out of reach: no bat is offered
      expect(w.games.actionFor(w.cat)).toBe(null);
      w.onCounter();
      let bats = 0;
      while (w.games.state.cans === 'playing') {
        const before = w.games.tinsLeft;
        expect(fairPromptText(w.games.actionFor(w.cat))).toBe('E — bat the tins');
        expect(w.E()).toEqual({ kind: 'bat' });
        bats++;
        const down = before - w.games.tinsLeft;
        expect(down).toBeGreaterThanOrEqual(1);
        expect(down).toBeLessThanOrEqual(GAME.BAT_MAX);
        const e = w.of('tins-down').at(-1);
        expect(e.ids).toHaveLength(down);
        expect(e.left).toBe(w.games.tinsLeft);
        expect(bats).toBeLessThanOrEqual(6);
      }
      expect(w.games.state.cans).toBe('won');
      expect(w.games.tinsLeft).toBe(0);
      expect(w.of('game-won')).toEqual([{ type: 'game-won', game: 'cans' }]);
      // the top of the pyramid always goes first
      expect(w.of('tins-down')[0].ids[0]).toBe(5);
      batsBySeed.push(bats);
    }
    expect(Math.min(...batsBySeed)).toBeGreaterThanOrEqual(2);
    expect(Math.max(...batsBySeed)).toBeLessThanOrEqual(6);
    expect(new Set(batsBySeed).size).toBeGreaterThan(1); // a little luck in it
  });

  it('the tins are back on their shelf when she walks away, or plays again; nothing else is lost', () => {
    const w = world('restack');
    w.put(A.tinCanPlay.x, A.tinCanPlay.z);
    w.E();
    w.onCounter();
    w.E();
    expect(w.games.tinsLeft).toBeLessThan(6);
    // she hops down and wanders off mid-game: they are stacked again, the game still hers to play
    w.put(A.tinCanPlay.x + GAME.LEAVE_R + 1, A.tinCanPlay.z);
    expect(w.games.tinsLeft).toBe(6);
    expect(w.of('tins-restack')).toHaveLength(1);
    expect(w.games.state.cans).toBe('playing');
    w.onCounter();
    while (w.games.state.cans === 'playing') w.E();
    expect(w.games.state.cans).toBe('won');
    // won, and still on the counter: another go is offered at once, and stacks them
    expect(w.games.actionFor(w.cat)).toEqual({ kind: 'play', game: 'cans', again: true });
    expect(fairPromptText(w.games.actionFor(w.cat))).toBe('E — play Tin Can Alley again');
    w.E();
    expect(w.games.tinsLeft).toBe(6);
    expect(w.games.state.cans).toBe('playing');
    while (w.games.state.cans === 'playing') w.E();
    expect(w.of('game-won')).toHaveLength(2);
    // won and walked away: on offer afresh
    w.put(0, 20);
    expect(w.games.state.cans).toBe('offer');
    expect(w.games.tinsLeft).toBe(6);
  });
});

// =============================================================================
describe('game 2: hook-a-duck', () => {
  const plainDuck = (w) => w.games.ducks.find((d) => !d.star && !d.held);
  // wade to a duck, pick it up, carry it out over the edge
  function fetch(w, d) {
    w.put(A.duckPool.x + (d.x - A.duckPool.x) * 0.9, A.duckPool.z + (d.z - A.duckPool.z) * 0.9);
    expect(w.cat.inWater).toBe(true);
    const a = w.games.actionFor(w.cat);
    expect(a?.kind).toBe('pick');
    expect(fairPromptText(a)).toBe('E — pick up the duck');
    w.games.act({ kind: 'pick', duck: d.id }, { ...w.cat, x: d.x, z: d.z });
    for (const e of w.games.takeEvents()) w.events.push(e);
    if (!d.held) { w.put(d.x, d.z); w.E(); }
    expect(w.games.duck.held).toBeTruthy();
    const held = w.games.duck.held;
    w.walk(A.duckPoolSide.x, A.duckPoolSide.z, { speed: 1.6 });
    return held;
  }

  it('is offered at the pool, in it or beside it', () => {
    const w = world();
    w.put(A.duckPoolSide.x, A.duckPoolSide.z);
    expect(isWalkableAt(AREA, w.cat.x, w.cat.z)).toBe(true);
    expect(fairPromptText(w.games.actionFor(w.cat))).toBe('E — play Hook a Duck');
    w.put(A.duckPool.x, A.duckPool.z);
    expect(w.games.actionFor(w.cat)).toEqual({ kind: 'play', game: 'ducks', again: false });
    // no duck can be picked up before the game is taken on
    expect(w.games.ducks).toHaveLength(7);
    w.put(A.duckPool.x + A.duckPool.r + GAME.OFFER_R + 0.5, A.duckPool.z);
    expect(w.games.actionFor(w.cat)).toBe(null);
  });

  it('every go hides two stars afresh, and the ducks drift round inside the pool', () => {
    const layouts = new Set();
    const w = world('stars');
    for (let go = 0; go < 12; go++) {
      w.put(A.duckPoolSide.x, A.duckPoolSide.z);
      w.games.play('ducks');
      expect(w.games.ducks.filter((d) => d.star)).toHaveLength(GAME.DUCK_STARS);
      layouts.add(w.games.ducks.map((d) => (d.star ? '*' : '.')).join(''));
      w.games.state.ducks = 'won';
    }
    expect(layouts.size).toBeGreaterThan(3);
    const before = w.games.ducks.map((d) => [d.x, d.z]);
    w.run(20);
    w.games.ducks.forEach((d, i) => {
      expect(Math.hypot(d.x - A.duckPool.x, d.z - A.duckPool.z)).toBeLessThan(A.duckPool.r - 0.2);
      if (i > 0) expect(Math.hypot(d.x - before[i][0], d.z - before[i][1])).toBeGreaterThan(0.1);
    });
  });

  it('a plain duck swims back and she tries another; a star wins', () => {
    const w = world('plain');
    w.put(A.duckPoolSide.x, A.duckPoolSide.z);
    w.E();
    const d = plainDuck(w);
    const held = fetch(w, d);
    expect(held).toBe(d);
    expect(w.of('duck-plain')).toEqual([{ type: 'duck-plain', duck: d.id, n: 1 }]);
    expect(w.games.state.ducks).toBe('playing'); // not a loss: the same go carries on
    expect(d.held).toBe(false);
    w.run(1);
    expect(Math.hypot(d.x - A.duckPool.x, d.z - A.duckPool.z)).toBeLessThan(A.duckPool.r); // back in the water
    const star = w.games.ducks.find((q) => q.star);
    fetch(w, star);
    expect(w.of('duck-star')).toHaveLength(1);
    expect(w.games.state.ducks).toBe('won');
    expect(w.of('game-won')).toEqual([{ type: 'game-won', game: 'ducks' }]);
    expect(fairPromptText(w.games.actionFor(w.cat))).toBe('E — play Hook a Duck again');
  });

  it('a calm player always wins: after three plain ducks the next one has a star, whichever she picks', () => {
    for (const seed of SEEDS.slice(0, 16)) {
      const w = world(seed);
      w.put(A.duckPoolSide.x, A.duckPoolSide.z);
      w.E();
      let tries = 0;
      // the unluckiest player there could be: always a plain duck if there is one
      while (w.games.state.ducks === 'playing') {
        const d = plainDuck(w) ?? w.games.ducks[0];
        fetch(w, d);
        tries++;
        expect(tries).toBeLessThanOrEqual(GAME.DUCK_PLAIN_MAX + 1);
      }
      expect(tries).toBe(GAME.DUCK_PLAIN_MAX + 1);
      expect(w.of('duck-plain')).toHaveLength(3);
      expect(w.of('game-won')).toHaveLength(1);
    }
  });

  it('walking away in the middle loses nothing: her plain ducks still count when she comes back', () => {
    const w = world('away');
    w.put(A.duckPoolSide.x, A.duckPoolSide.z);
    w.E();
    fetch(w, plainDuck(w));
    fetch(w, plainDuck(w));
    w.walk(0, 30);
    w.run(600);
    expect(w.games.state.ducks).toBe('playing');
    expect(w.games.duck.plain).toBe(2);
    fetch(w, plainDuck(w));
    fetch(w, plainDuck(w) ?? w.games.ducks[0]);
    expect(w.games.state.ducks).toBe('won');
    // a duck is only picked up with an empty mouth, from in the pool
    const v = world('mouth');
    v.put(A.duckPoolSide.x, A.duckPoolSide.z);
    v.E();
    v.put(v.games.ducks[1].x, v.games.ducks[1].z);
    v.cat.mouthFull = true;
    expect(v.games.actionFor(v.cat)).toBe(null);
    v.cat.mouthFull = false;
    expect(v.games.actionFor(v.cat).kind).toBe('pick');
  });
});

// =============================================================================
describe('game 3: ring the bell', () => {
  const pad = A.bellPad;
  // a run-up of `metres` straight at the pad, then the pounce onto it
  function go(w, metres, speed = CAT_WALK) {
    w.put(pad.x - 1.4 - metres, pad.z);
    w.run(2); // standing still: no run-up behind her
    w.walk(pad.x - 1.4, pad.z, { speed, stop: 0 });
    w.cat.speed = speed;
    w.pounce(pad.x, pad.z);
    return w.of('bell-hit').at(-1);
  }

  it('is offered at the pad, on open ground the cat can run up across', () => {
    const w = world();
    w.put(pad.x - 1.2, pad.z);
    expect(isWalkableAt(AREA, w.cat.x, w.cat.z)).toBe(true);
    expect(fairPromptText(w.games.actionFor(w.cat))).toBe('E — play Ring the Bell');
    // seven metres of clear run-up to the west of it, across the midway
    for (let m = 1.4; m <= 8; m += 0.2) expect(isWalkableAt(AREA, pad.x - m, pad.z), `${m} m out`).toBe(true);
    expect(dist(pad, A.bellPole)).toBeGreaterThan(1);
  });

  it('the marker goes as high as her run-up was long, and a good run-up rings the bell first time', () => {
    const levels = [];
    for (const metres of [0, 1, 2, 3, 4, 5]) {
      const w = world(`run-${metres}`);
      const hit = go(w, metres);
      expect(hit.tries).toBe(1);
      levels.push(hit.level);
      expect(hit.ring).toBe(false);
      expect(hit.level).toBeGreaterThanOrEqual(GAME.FLOOR); // every pounce moves it
      expect(hit.level).toBeLessThanOrEqual(GAME.SHORT);    // and a miss visibly stops short of the bell
      expect(w.games.state.bell).toBe('playing');
    }
    for (let i = 1; i < levels.length; i++) expect(levels[i]).toBeGreaterThanOrEqual(levels[i - 1]);
    expect(levels[5]).toBeGreaterThan(levels[1] + 0.4);
    for (const metres of [5.6, 6, 8, 12]) {
      const w = world(`ring-${metres}`);
      const hit = go(w, metres);
      expect(hit).toEqual({ type: 'bell-hit', level: 1, ring: true, tries: 1 });
      expect(w.games.state.bell).toBe('won');
    }
    // nothing in it is quick fingers: a slow cat's run-up counts for as much as a fast one's
    const slow = go(world('slow'), 6, 2.2);
    const fast = go(world('fast'), 6, 6);
    expect(slow.ring).toBe(true);
    expect(fast.ring).toBe(true);
    expect(GAME.RUN_SPEED).toBeLessThan(2.2); // the slowest breed's walk (walk.js: 2.2 and up) is a run-up
  });

  it('a calm player always wins: the third pounce of a go rings the bell, however short her run-ups', () => {
    const w = world('third');
    w.put(pad.x - 1.3, pad.z);
    w.E();
    expect(w.of('game-start')).toEqual([{ type: 'game-start', game: 'bell' }]);
    const hits = [];
    for (let i = 0; i < 3; i++) {
      w.put(pad.x - 1.3, pad.z);
      w.run(1);
      w.pounce(pad.x, pad.z);
      hits.push(w.of('bell-hit').at(-1));
    }
    expect(hits.map((h) => h.ring)).toEqual([false, false, true]);
    expect(hits.map((h) => h.tries)).toEqual([1, 2, 3]);
    expect(hits[2].level).toBe(1);
    expect(w.games.state.bell).toBe('won');
    // a miss never ended anything: the state only ever went offer -> playing -> won
    expect(w.of('game-won')).toEqual([{ type: 'game-won', game: 'bell' }]);
    // walking away between tries loses none of them
    const v = world('patient');
    for (let i = 0; i < 2; i++) { v.put(pad.x - 1.3, pad.z); v.run(1); v.pounce(pad.x, pad.z); v.walk(0, 30); v.run(300); }
    expect(v.games.bell.tries).toBe(2);
    v.put(pad.x - 1.3, pad.z);
    v.run(1);
    v.pounce(pad.x, pad.z);
    expect(v.games.state.bell).toBe('won');
  });

  it('only a pounce onto the pad counts, once a pounce; a pounce on it is a go, asked for or not', () => {
    const w = world('pad');
    // walking over the pad, or pouncing somewhere else: nothing
    w.walk(pad.x, pad.z);
    w.put(pad.x - 6, pad.z + 6);
    w.pounce(pad.x - 7, pad.z + 7);
    expect(w.of('bell-hit')).toEqual([]);
    expect(w.games.state.bell).toBe('offer');
    // straight onto the pad without the prompt: the game is on, and says so quietly
    w.put(pad.x - 1.2, pad.z);
    w.run(4); // (the walk up to it is no longer a run-up)
    expect(w.games.bell.run).toBe(0);
    w.pounce(pad.x, pad.z);
    expect(w.of('bell-hit')).toHaveLength(1);
    expect(w.of('game-start')).toEqual([{ type: 'game-start', game: 'bell', auto: true }]);
    expect(w.games.state.bell).toBe('playing');
    // won, then pounced on again: a new go from its first try
    w.put(pad.x - 1.2, pad.z); w.pounce(pad.x, pad.z);
    w.put(pad.x - 1.2, pad.z); w.pounce(pad.x, pad.z);
    expect(w.games.state.bell).toBe('won');
    w.put(pad.x - 1.2, pad.z); w.run(1); w.pounce(pad.x, pad.z);
    expect(w.of('bell-hit').at(-1).tries).toBe(1);
    expect(w.games.state.bell).toBe('playing');
  });
});

// =============================================================================
describe('the six things to find', () => {
  it('none is pointed at: no prompt is ever offered for one', () => {
    const w = world('finds');
    for (const spot of [A.fortuneSeat, A.musicBox, A.candyfloss, A.jugglerWatch, { x: -15, z: -22 }, A.fortuneDoor]) {
      w.put(spot.x, spot.z);
      expect(w.games.actionFor(w.cat), `${spot.x},${spot.z}`).toBe(null);
    }
    expect(fairPromptText(null)).toBe(null);
    expect(fairPromptText({ kind: 'play', game: 'nope' })).toBe(null);
    expect(fairPromptText({ kind: 'find', id: 'fortune' })).toBe(null);
  });

  it('the crystal ball: found by going up to it in the fortune teller’s tent, and it shows her while she is there', () => {
    const w = world();
    expect(isWalkableAt(AREA, A.fortuneSeat.x, A.fortuneSeat.z)).toBe(true);
    expect(dist(A.fortuneSeat, A.fortuneBall)).toBeLessThan(1.6);
    w.put(A.fortuneDoor.x, A.fortuneDoor.z);
    expect(w.of('find')).toEqual([]);
    expect(w.games.fortune.showing).toBe(false);
    w.walk(A.fortuneSeat.x, A.fortuneSeat.z);
    expect(w.of('find')).toEqual([{ type: 'find', id: 'fortune' }]);
    expect(w.games.fortune.showing).toBe(true);
    w.run(30);
    expect(w.of('find')).toHaveLength(1); // once for each time she comes
    w.walk(A.fortuneDoor.x - 2, A.fortuneDoor.z);
    expect(w.games.fortune.showing).toBe(false);
    w.walk(A.fortuneSeat.x, A.fortuneSeat.z);
    expect(w.of('find')).toHaveLength(2);
  });

  it('the music box: found by going round the back of the merry-go-round', () => {
    const w = world();
    // in front of the ride it is not found
    w.put(A.merryGoRoundBoard.x, A.merryGoRoundBoard.z);
    w.run(5);
    expect(w.of('find')).toEqual([]);
    expect(isWalkableAt(AREA, A.musicBox.x, A.musicBox.z)).toBe(true);
    expect(A.musicBox.z).toBeLessThan(A.merryGoRound.z - A.merryGoRound.r); // behind it, as seen from the gate
    w.put(A.musicBox.x + 4, A.musicBox.z);
    w.walk(A.musicBox.x, A.musicBox.z);
    expect(w.of('find')).toEqual([{ type: 'find', id: 'musicbox' }]);
  });

  it('the candyfloss: a wisp sticks to her whiskers at the stall, for a minute', () => {
    const w = world();
    expect(isWalkableAt(AREA, A.candyfloss.x, A.candyfloss.z)).toBe(true);
    w.put(A.candyfloss.x + 3, A.candyfloss.z);
    expect(w.games.wisp.t).toBe(0);
    w.walk(A.candyfloss.x, A.candyfloss.z);
    expect(w.of('find')).toEqual([{ type: 'find', id: 'candyfloss' }]);
    expect(w.of('wisp')).toHaveLength(1);
    expect(w.games.wisp.t).toBeGreaterThan(GAME.WISP_TIME - 1);
    const stuck = w.t;
    w.walk(0, 20);
    w.run(GAME.WISP_TIME - 8 - (w.t - stuck));
    expect(w.games.wisp.t).toBeGreaterThan(0);
    w.run(12);
    expect(w.games.wisp.t).toBe(0);
    // it sticks again the next time
    w.walk(A.candyfloss.x, A.candyfloss.z);
    expect(w.games.wisp.t).toBeGreaterThan(GAME.WISP_TIME - 1);
  });

  it('the juggler: he drops a ball when she comes to watch, and it can be batted about like a windfall apple', () => {
    const w = world();
    expect(isWalkableAt(AREA, A.jugglerWatch.x, A.jugglerWatch.z)).toBe(true);
    w.put(A.jugglerWatch.x, A.jugglerWatch.z + 5);
    expect(w.games.ball.out).toBe(false);
    w.walk(A.jugglerWatch.x, A.jugglerWatch.z);
    expect(w.of('juggler-drop')).toHaveLength(1);
    expect(w.of('find')).toEqual([{ type: 'find', id: 'juggler' }]);
    expect(w.games.ball.out).toBe(true);
    w.run(2);
    expect(w.of('ball-thud')).toHaveLength(1);
    const ball = w.games.ball;
    expect(ball.y).toBe(GAME.BALL_R);
    expect(dist(ball, A.juggler)).toBeLessThan(1.2); // it lands at his feet, not on her
    expect(dist(ball, w.cat)).toBeGreaterThan(GAME.BALL_BAT);
    // she stays and watches: he does not drop another
    w.run(60);
    expect(w.of('juggler-drop')).toHaveLength(1);
    // batted: it rolls away from her, slows and stops, on ground inside the fair
    for (let i = 0; i < 12; i++) {
      w.walk(ball.x, ball.z, { until: () => Math.hypot(ball.vx, ball.vz) > 0.5, stop: 0.1 });
      const from = { x: ball.x, z: ball.z };
      w.run(4);
      expect(Math.hypot(ball.vx, ball.vz)).toBe(0);
      expect(dist(ball, from)).toBeLessThan(3);
      expect(ball.x).toBeGreaterThan(AREA.bounds.minX);
      expect(ball.x).toBeLessThan(AREA.bounds.maxX);
      expect(clearance(AREA.colliders, ball.x, ball.z)).toBeGreaterThanOrEqual(0);
      expect(inPool(ball.x, ball.z)).toBe(false);
    }
    expect(w.of('ball-bat').length).toBeGreaterThan(5);
    // she goes right away: he has picked it up, and drops it again on her next visit
    w.walk(0, 0);
    expect(w.games.ball.out).toBe(false);
    w.walk(A.jugglerWatch.x, A.jugglerWatch.z);
    expect(w.of('juggler-drop')).toHaveLength(2);
    expect(w.of('find').filter((e) => e.id === 'juggler')).toHaveLength(2);
  });

  it('the runaway balloon: it drifts away from her, slower than any cat walks, and never leaves its field', () => {
    const f = A.balloonField;
    const w = world('balloon');
    const b = w.games.balloon;
    const inField = () => b.x > f.minX + 1 && b.x < f.maxX - 1 && b.z > f.minZ + 1 && b.z < f.maxZ - 1;
    expect(inField()).toBe(true);
    // left alone it wanders
    const start = { x: b.x, z: b.z };
    w.put(0, 40);
    w.run(40);
    expect(dist(b, start)).toBeGreaterThan(1);
    expect(inField()).toBe(true);
    // she walks at it (never pouncing): it goes away from her, never towards, and she always gains on it
    w.put(b.x + 9, b.z);
    let prevGap = dist(w.cat, b);
    let fled = 0;
    for (let i = 0; i < 30 * 30; i++) {
      const before = { x: b.x, z: b.z };
      const d = dist(w.cat, b);
      if (d > 0.6) { w.cat.fx = (b.x - w.cat.x) / d; w.cat.fz = (b.z - w.cat.z) / d; w.cat.x += w.cat.fx * 2.2 * DT; w.cat.z += w.cat.fz * 2.2 * DT; w.cat.speed = 2.2; }
      w.tick();
      const moved = dist(b, before);
      expect(moved / DT).toBeLessThanOrEqual(GAME.BALLOON_FLEE + 1e-6);
      if (moved > 1e-6 && d < GAME.BALLOON_SHY) {
        fled++;
        // away: not a centimetre nearer to where she was
        expect(dist(b, { x: w.cat.x, z: w.cat.z })).toBeGreaterThanOrEqual(Math.min(prevGap, dist(before, w.cat)) - 0.08);
      }
      expect(inField()).toBe(true);
      expect(isWalkableAt(AREA, b.x, b.z)).toBe(true);
      prevGap = dist(w.cat, b);
    }
    expect(fled).toBeGreaterThan(30);
    expect(GAME.BALLOON_FLEE).toBeLessThan(2.2); // the slowest cat's walk
    expect(b.state).toBe('free'); // walking into it catches nothing
    expect(dist(w.cat, b)).toBeLessThan(GAME.BALLOON_CATCH); // ...but she is on it: it could not get away
  });

  it('the runaway balloon: a pounce catches it, with a soft pff and a ribbon to keep; there is no bang', () => {
    const w = world('catch');
    const b = w.games.balloon;
    w.put(b.x + 6, b.z);
    for (let i = 0; i < 600 && dist(w.cat, b) > 1.1; i++) {
      const d = dist(w.cat, b);
      w.cat.x += ((b.x - w.cat.x) / d) * 3.2 * DT; w.cat.z += ((b.z - w.cat.z) / d) * 3.2 * DT; w.cat.speed = 3.2;
      w.tick();
    }
    expect(dist(w.cat, b)).toBeLessThanOrEqual(1.1); // she caught up with it at a walk
    w.pounce(b.x, b.z);
    expect(b.state).toBe('caught');
    expect(w.of('balloon-caught')).toHaveLength(1);
    expect(w.of('find')).toEqual([{ type: 'find', id: 'balloon' }]);
    const at = w.of('balloon-caught')[0];
    expect(isWalkableAt(AREA, at.x, at.z)).toBe(true);
    // once a walk: it is gone, and nothing more happens there
    w.run(60);
    w.pounce(w.cat.x + 1, w.cat.z);
    expect(w.of('balloon-caught')).toHaveLength(1);
    // what the catch does in the walk: a whoosh of air (no bark, no hiss, no bang) and the ribbon laid where it was
    const calls = [];
    const audio = new Proxy({}, { get: (_t, name) => (...a) => calls.push([name, ...a]) });
    const placed = [];
    const p = createProgression(mem());
    const log = createDiscoveryLog(p);
    log.startWalk();
    const ctx = { audio, hud: { toast() {} }, log, progression: p, session: { cat: { position: { x: 0, y: 0, z: 0 } }, fx: { burst() {} }, carry: { items: { placeAt: (...a) => placed.push(a) } } } };
    handleFairEvent(at, ctx);
    expect(calls.map((c) => c[0])).toEqual(['pounceWhoosh']);
    expect(placed).toEqual([[BALLOON_RIBBON_ID, at.x, at.z]]);
    expect(code('game/fairplay.js')).not.toMatch(/bang|pop\(|hiss|bark|scare/i);
    // the ribbon is an ordinary thing to carry, made with the walk and out of sight until then
    const carry = { mouth: createMouth(), items: createCarryables(new THREE.Scene(), []) };
    const ribbon = addBalloonRibbon(carry, AREA);
    expect(ribbon.mesh.visible).toBe(false);
    expect(ribbon.onGround).toBe(false);
    carry.items.placeAt(BALLOON_RIBBON_ID, at.x, at.z);
    expect(ribbon.mesh.visible).toBe(true);
    expect(carry.items.nearest({ x: at.x, z: at.z }, 1)).toBe(ribbon);
    // a walk picked up again after the catch: no second balloon
    const again = world('again');
    restoreFairGames({ games: again.games }, { log });
    expect(again.games.balloon.state).toBe('free');
    log.mark(fairFindKey('balloon'));
    restoreFairGames({ games: again.games }, { log });
    expect(again.games.balloon.state).toBe('caught');
    restoreFairGames(NO_FAIR, { log });
  });

  it('the lookout at the top of the big wheel: the rides’ own event is the find', () => {
    const p = createProgression(mem());
    const log = createDiscoveryLog(p);
    log.startWalk();
    const toasts = [];
    const ctx = { audio: {}, hud: { toast: (t) => toasts.push(t) }, log, progression: p, session: null };
    const points = p.state.points;
    handleFairEvent({ type: 'lookout' }, ctx);
    expect(p.state.journal.fairlookout).toBe(1);
    expect(p.state.points).toBe(points + AWARDS.fairfind);
    handleFairEvent({ type: 'lookout' }, ctx); // back onto it on the same walk
    expect(p.state.journal.fairlookout).toBe(1);
    expect(p.state.points).toBe(points + AWARDS.fairfind);
    log.startWalk();
    handleFairEvent({ type: 'lookout' }, ctx);
    expect(p.state.journal.fairlookout).toBe(2);
    expect(toasts).toEqual([FAIR_FIND_WORDS.lookout.again()]);
    // and the rides do raise it (src/fairlive.js), with something now listening
    expect(code('fairlive.js')).toMatch(/onEvent\(\{ type: 'lookout' \}\)/);
  });
});

// =============================================================================
describe('what they pay, and what the save keeps', () => {
  const fresh = (initial) => {
    const storage = mem(initial);
    const progression = createProgression(storage);
    const log = createDiscoveryLog(progression);
    log.startWalk();
    const toasts = [];
    return { storage, progression, log, toasts, hud: { toast: (t) => toasts.push(t) } };
  };

  it('the three prizes are things to wear that are won, never bought, traded or given by a code', () => {
    expect(FAIR_PRIZES).toEqual({ cans: 'papercrown', ducks: 'prizerosette', bell: 'tailballoon' });
    expect(CATALOG.accessories.papercrown).toEqual({ name: 'Paper Crown', slot: 'head', price: 0, prize: true, fair: 'cans' });
    expect(CATALOG.accessories.prizerosette).toEqual({ name: 'Prize Rosette', slot: 'neck', price: 0, prize: true, fair: 'ducks' });
    // (there is no slot for a tail: the balloon is a back item, its string tied on where the tail begins)
    expect(CATALOG.accessories.tailballoon).toEqual({ name: 'Tail Balloon', slot: 'back', price: 0, prize: true, fair: 'bell' });
    const p = createProgression(mem());
    p.addPoints(5000);
    for (const id of FAIR_PRIZE_IDS) {
      expect(isPrizeAccessory(id)).toBe(true);
      expect(isTradeableAccessory(id)).toBe(false);
      expect(VISIT_PRIZES).not.toContain(id);
      expect(p.isUnlocked('accessories', id)).toBe(false);
      expect(p.canBuy('accessories', id)).toBe(false);
      expect(p.buy('accessories', id)).toBe(false); // not for sale at any price
      expect(p.isUnlocked('accessories', id)).toBe(false);
    }
    expect(p.state.points).toBe(5000);
    // every prize flagged `fair` is one of these three
    expect(Object.keys(CATALOG.accessories).filter((id) => CATALOG.accessories[id].fair).sort()).toEqual([...FAIR_PRIZE_IDS].sort());
  });

  it('the first win ever at each game gives its prize, once, and no coins; it is put on if she wears nothing there', () => {
    const { progression, log, toasts, hud, storage } = fresh();
    progression.equipAccessory('bandana'); // her neck is taken
    expect(progression.state.equipped.neck).toBe('bandana');
    const points = progression.state.points;
    const got = {};
    for (const game of FAIR_GAME_IDS) {
      got[game] = winFairGame(game, { log, progression, hud });
      expect(got[game]).toEqual({ fresh: true, first: true, prize: FAIR_PRIZES[game], points: 0 });
      expect(progression.isUnlocked('accessories', FAIR_PRIZES[game])).toBe(true);
      expect(progression.state.journal[gameJournalId(game)]).toBe(1);
    }
    expect(progression.state.points).toBe(points);
    expect(toasts).toEqual([
      'All six tins down! You won a Paper Crown to wear! 👑', PRIZE_WEAR(),
      'A star under the duck! You won a Prize Rosette to wear! ⭐', PRIZE_WEAR(),
      'DING! You rang the bell and won a Tail Balloon to wear! 🎈', PRIZE_WEAR(),
    ]);
    // worn where she wore nothing; what she chose to wear is never taken off
    expect(progression.state.equipped.head).toBe('papercrown');
    expect(progression.state.equipped.back).toBe('tailballoon');
    expect(progression.state.equipped.neck).toBe('bandana');
    // won again on the same walk: a cheer, and nothing else
    toasts.length = 0;
    expect(winFairGame('cans', { log, progression, hud })).toEqual({ fresh: false, first: false, prize: null, points: 0 });
    expect(toasts).toEqual([GAME_AGAIN()]);
    expect(progression.state.journal.gamecans).toBe(1);
    expect(progression.state.unlocked.accessories.filter((id) => id === 'papercrown')).toHaveLength(1);
    expect(winFairGame('nope', { log, progression, hud })).toEqual({ fresh: false, first: false, prize: null, points: 0 });
    // saved at once
    const saved = JSON.parse(storage.getItem('whisker-walk-save'));
    for (const id of FAIR_PRIZE_IDS) expect(saved.unlocked.accessories).toContain(id);
  });

  it('a later walk’s win pays a few coins, once a walk for each game, and gives no second prize', () => {
    expect(AWARDS.fairgame).toBe(15);
    expect(AWARDS.fairgame).toBeLessThan(AWARDS.farmjob); // "a few coins": less than a Farm job, more than a find
    expect(AWARDS.fairgame).toBeGreaterThan(AWARDS.fairfind);
    const { progression, log, toasts, hud } = fresh();
    for (const game of FAIR_GAME_IDS) winFairGame(game, { log, progression, hud });
    progression.unequip('head');
    for (let walk = 2; walk <= 4; walk++) {
      log.startWalk();
      const points = progression.state.points;
      toasts.length = 0;
      for (const game of FAIR_GAME_IDS) {
        expect(winFairGame(game, { log, progression, hud })).toEqual({ fresh: true, first: false, prize: null, points: AWARDS.fairgame });
        expect(winFairGame(game, { log, progression, hud }).points).toBe(0);
        expect(progression.state.journal[gameJournalId(game)]).toBe(walk);
      }
      expect(progression.state.points).toBe(points + 3 * AWARDS.fairgame);
      expect(toasts).toEqual([GAME_AGAIN(), GAME_AGAIN(), GAME_AGAIN()]); // the win's own line is the award's
    }
    expect(progression.state.feats.fairgame).toBe(9);
    expect(progression.state.equipped.head).toBe(null); // taken off, it is not put back on by a later win
    expect(progression.state.unlocked.accessories.filter((id) => FAIR_PRIZE_IDS.includes(id))).toHaveLength(3);
    expect(discoveryText({ type: 'fairgame', label: GAME_WORDS.bell.won() })).toBe('DING! You rang the bell! You win! 🔔');
  });

  it('a find pays the first time ever and never again; every walk it is found on counts once', () => {
    const { progression, log } = fresh();
    for (const id of FAIR_FIND_IDS) {
      expect(noteFairFind(id, { log, progression })).toEqual({ fresh: true, first: true, points: AWARDS.fairfind });
      expect(noteFairFind(id, { log, progression })).toEqual({ fresh: false, first: false, points: 0 });
      expect(progression.state.journal[fairFindJournalId(id)]).toBe(1);
    }
    expect(AWARDS.fairfind).toBe(AWARDS.farmfind);
    expect(progression.state.points).toBe(6 * AWARDS.fairfind);
    expect(progression.state.feats.fairfind).toBe(6);
    for (let walk = 2; walk <= 4; walk++) {
      log.startWalk();
      for (const id of FAIR_FIND_IDS) {
        expect(noteFairFind(id, { log, progression })).toEqual({ fresh: true, first: false, points: 0 });
        expect(noteFairFind(id, { log, progression })).toEqual({ fresh: false, first: false, points: 0 });
        expect(progression.state.journal[fairFindJournalId(id)]).toBe(walk);
      }
    }
    expect(progression.state.points).toBe(6 * AWARDS.fairfind);
    expect(noteFairFind('nope', { log, progression })).toEqual({ fresh: false, first: false, points: 0 });
    expect(discoveryText({ type: 'fairfind', label: FAIR_FIND_WORDS.fortune.first() })).toBe('The crystal ball shows... you! 🔮');
  });

  it('a find’s events: paid and said the first time ever, a quiet line once on a later walk, silence after that', () => {
    const { progression, log, toasts, hud } = fresh();
    const ctx = { audio: {}, hud, log, progression, session: null };
    const points = progression.state.points;
    for (let visit = 0; visit < 3; visit++) handleFairEvent({ type: 'find', id: 'musicbox' }, ctx);
    expect(progression.state.points).toBe(points + AWARDS.fairfind);
    expect(toasts).toEqual([]); // the first find's line is the award's own
    log.startWalk();
    for (let visit = 0; visit < 3; visit++) handleFairEvent({ type: 'find', id: 'musicbox' }, ctx);
    expect(toasts).toEqual(['The music box is still turning. 🎶']);
    expect(progression.state.points).toBe(points + AWARDS.fairfind);
    expect(progression.state.journal.fairmusicbox).toBe(2);
  });

  it('a walk picked up again neither pays, gives nor says anything twice (the note carries the log’s keys)', () => {
    const { progression, log, hud } = fresh();
    winFairGame('bell', { log, progression, hud });
    noteFairFind('fortune', { log, progression });
    log.startWalk();
    winFairGame('bell', { log, progression, hud });
    noteFairFind('fortune', { log, progression });
    const paid = log.entries();
    expect(paid.map(([k]) => k).sort()).toEqual([fairFindKey('fortune'), gameKey('bell')].sort());
    const again = createDiscoveryLog(progression);
    again.startWalk();
    again.restore(JSON.parse(JSON.stringify(paid)));
    const points = progression.state.points;
    expect(winFairGame('bell', { log: again, progression, hud }).fresh).toBe(false);
    expect(noteFairFind('fortune', { log: again, progression }).fresh).toBe(false);
    expect(progression.state.points).toBe(points);
    expect(progression.state.journal.gamebell).toBe(2);
    expect(progression.state.journal.fairfortune).toBe(2);
  });

  it('an old save has none of this and reads as nothing won, nothing found; nothing shows as NaN or undefined', () => {
    const raw = JSON.parse(JSON.stringify(createProgression(mem()).state));
    for (const id of FAIR_JOURNAL_TYPES) delete raw.journal[id];
    delete raw.feats.fairgame; delete raw.feats.fairfind;
    raw.journal.mouse = 3;
    raw.equipped.head = 'papercrown'; // (a save cannot wear what it has not won)
    const p = createProgression(mem({ 'whisker-walk-save': JSON.stringify(raw) }));
    for (const id of FAIR_JOURNAL_TYPES) expect(p.state.journal[id]).toBe(undefined);
    for (const id of FAIR_PRIZE_IDS) expect(p.isUnlocked('accessories', id)).toBe(false);
    expect(p.state.equipped.head).toBe(null);
    const html = renderJournalHtml(p.state.journal, 0, 36);
    expect(html).not.toMatch(/NaN|undefined|null/);
    for (const id of FAIR_JOURNAL_TYPES) expect(html).toContain(FAIR_PAGE_WORDS[id].hint());
    // and the first win on that save is the first ever
    const log = createDiscoveryLog(p);
    log.startWalk();
    expect(winFairGame('ducks', { log, progression: p, hud: { toast() {} } }).first).toBe(true);
    expect(noteFairFind('juggler', { log, progression: p }).first).toBe(true);
    const after = renderJournalHtml(p.state.journal, 0, 36);
    expect(after).toContain(FAIR_PAGE_WORDS.gameducks.name());
    expect(after).toContain(FAIR_PAGE_WORDS.fairjuggler.name());
    expect(after).not.toMatch(/NaN|undefined/);
  });

  it('rubbish in those fields is dropped on load, never shown, never counted and never a prize', () => {
    const raw = JSON.parse(JSON.stringify(createProgression(mem()).state));
    Object.assign(raw.journal, { gamecans: 'lots', gameducks: -4, gamebell: NaN, fairfortune: 2.5, fairmusicbox: '<b>', fairballoon: 3, gamenope: 9, fairjuggler: null });
    const p = createProgression(mem({ 'whisker-walk-save': JSON.stringify(raw) }));
    const j = p.state.journal;
    for (const [key, value] of Object.entries(j)) expect(Number.isInteger(value) && value >= 0, `${key}: ${value}`).toBe(true);
    expect(j.fairballoon).toBe(3);
    expect(j.gamenope).toBe(undefined);
    for (const key of ['gamecans', 'gameducks', 'gamebell', 'fairmusicbox', 'fairjuggler']) expect(j[key] ?? 0, key).toBe(0);
    for (const id of FAIR_PRIZE_IDS) expect(p.isUnlocked('accessories', id)).toBe(false);
    expect(renderJournalHtml(j, 0, 36)).not.toMatch(/NaN|undefined|<b>/);
    expect(fairPrizesWonBy(null)).toEqual([]);
    expect(fairPrizesWonBy({ gamecans: '3', gameducks: 0, gamebell: 2 })).toEqual(['tailballoon']);
  });

  it('wins, prizes and finds survive saving, a reload, and the trip to the cloud and back as plain JSON', () => {
    const { storage, progression, log, hud } = fresh();
    winFairGame('cans', { log, progression, hud });
    winFairGame('bell', { log, progression, hud });
    for (const id of FAIR_FIND_IDS) noteFairFind(id, { log, progression });
    const saved = JSON.parse(storage.getItem('whisker-walk-save'));
    const reloaded = createProgression(storage).state;
    const elsewhere = createProgression(mem({ 'whisker-walk-save': JSON.stringify(JSON.parse(JSON.stringify(saved))) })).state;
    for (const state of [reloaded, elsewhere]) {
      expect(state.journal.gamecans).toBe(1);
      expect(state.journal.gamebell).toBe(1);
      expect(state.journal.gameducks ?? 0).toBe(0);
      for (const id of FAIR_FIND_IDS) expect(state.journal[fairFindJournalId(id)]).toBe(1);
      expect(state.unlocked.accessories).toContain('papercrown');
      expect(state.unlocked.accessories).toContain('tailballoon');
      expect(state.unlocked.accessories).not.toContain('prizerosette');
      expect(state.equipped.head).toBe('papercrown');
      expect(state.equipped.back).toBe('tailballoon');
      expect(JSON.stringify(state)).not.toMatch(/NaN|undefined/);
    }
    // a prize is never lost: a payload whose list has dropped it gets it back from the game's page
    const lossy = JSON.parse(JSON.stringify(saved));
    lossy.unlocked.accessories = lossy.unlocked.accessories.filter((id) => !FAIR_PRIZE_IDS.includes(id));
    const mended = createProgression(mem({ 'whisker-walk-save': JSON.stringify(lossy) })).state;
    expect(mended.unlocked.accessories).toContain('papercrown');
    expect(mended.unlocked.accessories).toContain('tailballoon');
    expect(mended.equipped.head).toBe('papercrown'); // and still worn
    // nothing else in the save is new: the same top-level fields as before step 3
    expect(Object.keys(saved).sort()).toEqual(Object.keys(JSON.parse(JSON.stringify(createProgression(mem()).state))).sort());
  });

  it('the dress-up shows an unwon prize as something to win at the Fairground, and a won one like any item', () => {
    if (!renderDressingRoomHtml) return;
    const p = createProgression(mem());
    const html = (state) => renderDressingRoomHtml(state, CATALOG, { thumbs: null, tab: 'head', slot: 'head' });
    let out;
    try { out = html(p.state); } catch { return; } // (the dressing room's own tests hold its renderer; this only reads it when it can)
    if (typeof out !== 'string' || !out.includes('prize-surprise')) return;
    expect(out).toContain('A prize to win at the Fairground');
    expect(out).not.toMatch(/A surprise at visit (NaN|undefined|Infinity|-1)/);
  });
});

// =============================================================================
describe('the visitors', () => {
  const visitors = (count = 8, seed = 'people') => createFairVisitors(AREA, { count, seed, swept: SIM.swept });
  const far = { x: 40, z: -40, y: 0, speed: 0 };
  const pairs = (v) => v.list.filter((p) => p.pair);
  const childAt = (p) => ({ x: p.childX, z: p.childZ });
  // A pair's child holds every rule a visitor does: on free ground (inside
  // the bounds, clear of everything solid by its own radius, out of the pool,
  // off every ride). Away from her, as a child can: it never steps towards
  // her within arm's length (`moves`), and steps away at its grown-up's pace;
  // but its grown-up may be holding still for a hello or walking round her
  // (ruling R41), so a cat who walks after it can come within KEEP of it. In
  // the walk its soft bump stops her at its reach (BUMP.CHILD + CAT_RADIUS,
  // test/fairshow.people.test.js); here, with no bump, a cat who comes no
  // faster than the grown-ups step aside (`slow`) still never gets that near.
  // (A cat who runs at it faster can: then only the bump stops her, Task 14.)
  const CHILD_REACH = BUMP.CHILD + CAT_RADIUS;
  const childRules = (p, cat, t, area = AREA, slow = true) => {
    const c = childAt(p);
    const at = `${p.id}'s child at ${t.toFixed(1)} s`;
    expect(Number.isFinite(c.x) && Number.isFinite(c.z) && Number.isFinite(p.childYaw), at).toBe(true);
    expect(clearance(area.colliders, c.x, c.z), `${at} in something solid`).toBeGreaterThanOrEqual(PAIR.CHILD_R);
    expect(SIM.swept(c.x, c.z), `${at} on a ride`).toBe(false);
    expect(inPool(c.x, c.z, PAIR.CHILD_R), `${at} in the pool`).toBe(false);
    expect(c.x > AREA.bounds.minX && c.x < AREA.bounds.maxX && c.z > AREA.bounds.minZ && c.z < AREA.bounds.maxZ, at).toBe(true);
    if (cat && slow) expect(dist(c, cat), at).toBeGreaterThanOrEqual(CHILD_REACH);
    // and it is with its grown-up: never wandered off, never through it (it
    // never steps nearer it than APART, see `moves`; its grown-up, walking
    // round a cat, may come up against it)
    expect(dist(c, p), at).toBeLessThanOrEqual(PAIR.TRAIL + 1e-9);
    // (and even then their two soft bumps, 0.22 + 0.18, never overlap: measured 0.41 m)
    expect(dist(c, p), at).toBeGreaterThanOrEqual(0.22 + PAIR.CHILD_R);
  };
  // How far each child moved this step, against its grown-up: a child never
  // moves further in a step than its grown-up did and the grown-ups' own
  // SIDE_SPEED (never a hop); and, with a cat within arm's length, never a
  // step towards her.
  const moves = (v, cat = null) => {
    const last = new Map(pairs(v).map((p) => [p, { x: p.x, z: p.z, cx: p.childX, cz: p.childZ }]));
    let worst = -Infinity;
    let towards = 0;
    let through = 0;
    return {
      check(dt) {
        for (const [p, o] of last) {
          // never a step nearer its grown-up (where it now is) within APART
          const near = Math.hypot(p.childX - p.x, p.childZ - p.z);
          if (near < PAIR.APART - 1e-9 && near < Math.hypot(o.cx - p.x, o.cz - p.z) - 1e-9) through++;
          const over = Math.hypot(p.childX - o.cx, p.childZ - o.cz) - Math.hypot(p.x - o.x, p.z - o.z) - VISITOR.SIDE_SPEED * dt;
          worst = Math.max(worst, over);
          if (cat) {
            const gap = Math.hypot(o.cx - cat.x, o.cz - cat.z); // she has moved, it has not yet
            if (gap < VISITOR.NEAR && Math.hypot(p.childX - cat.x, p.childZ - cat.z) < gap - 1e-6) towards++;
          }
          o.x = p.x; o.z = p.z; o.cx = p.childX; o.cz = p.childZ;
        }
      },
      get worst() { return worst; },
      get towards() { return towards; },
      get through() { return through; },
    };
  };

  // KEEP, as a grown-up keeps it (ruling R41: the lifelike people). It never
  // steps to within KEEP of her middle, nor nearer her once she is there: a
  // visitor walking round her, or holding still for its hello, may have her
  // come within KEEP of it, by her doing (her soft bump stops her in the walk,
  // src/fairshow.js), never by its own. Checked against where each one stood
  // before its step, and where she is now (she has moved, it has not yet).
  const keeps = (v) => {
    const last = v.list.map((p) => ({ x: p.x, z: p.z }));
    let inside = 0;
    return {
      check(cat, t) {
        v.list.forEach((p, k) => {
          const d = dist(p, cat);
          if (d < VISITOR.KEEP - 1e-6) {
            inside++;
            expect(d, `${p.id} stepped nearer her within KEEP at ${t.toFixed(1)} s`).toBeGreaterThanOrEqual(dist(last[k], cat) - 1e-9);
          }
          last[k].x = p.x;
          last[k].z = p.z;
        });
      },
      get inside() { return inside; },
    };
  };

  it('are a grown-up with a child where the look spot says child: three of the eight, the same three every walk', () => {
    const v = visitors(8);
    expect(PAIR.R).toBe(0.65);
    expect(v.list).toHaveLength(8); // one visitor drawn as two: the count is unchanged
    expect(pairs(v).map((p) => p.id)).toEqual(['fair-visitor-4', 'fair-visitor-5', 'fair-visitor-8']);
    for (const p of v.list) expect(p.pair, p.id).toBe(spotKind(p.look) === 'child');
    // which they are comes from the spot, never the seed
    expect(pairs(visitors(8, 'another seed')).map((p) => p.id)).toEqual(['fair-visitor-4', 'fair-visitor-5', 'fair-visitor-8']);
    for (const p of v.list) {
      if (p.pair) {
        childRules(p, null, 0);
        expect(['beside', 'behind', 'back']).toContain(p.childAt);
      } else expect(p.childX).toBe(null);
    }
    // the simulation's own child-spot test is look.js's, spot for spot
    for (let i = 0; i < 400; i++) {
      const x = -60 + ((i * 37) % 120) + i * 0.013;
      const z = 140 + ((i * 53) % 150) - i * 0.017;
      expect(isChildSpot(x, z), `${x}, ${z}`).toBe(spotKind({ x, z }) === 'child');
    }
  });

  it('every child starts on free ground by its grown-up, whatever the seed', () => {
    for (let i = 0; i < 60; i++) for (const p of pairs(visitors(8, `start ${i}`))) childRules(p, null, 0);
  });

  it('are a handful: eight on the high tier, fewer on the lower ones, never none', () => {
    expect(VISITOR.MAX).toBe(8);
    expect([22, 14, 8, 4, 0].map(visitorCount)).toEqual([8, 5, 3, 2, 2]);
    expect(visitorCount(undefined)).toBe(8);
    expect(visitorCount(1000)).toBe(8);
    expect(visitors(8).list).toHaveLength(8);
    expect(visitors(3).list).toHaveLength(3);
    expect(visitors(99).list).toHaveLength(8);
  });

  it('are the same strollers for the same seed, and not for another', () => {
    const run = (seed) => { const v = visitors(8, seed); for (let i = 0; i < 900; i++) v.step(DT, far); return v.list.map((p) => [p.x, p.z, p.mode]); };
    expect(run('a')).toEqual(run('a'));
    expect(run('a')).not.toEqual(run('b'));
    expect(code('fairvisitors.js')).not.toMatch(/Math\.random|Date\.now/);
  });

  it('can get to every watch spot by a clear straight walk off the loop, and each spot looks at something', () => {
    const v = visitors();
    expect(v.spots).toHaveLength(A.visitorWatch.length);
    for (const s of v.spots) {
      expect(v.free(s.x, s.z)).toBe(true);
      expect(v.free(s.exit.x, s.exit.z)).toBe(true);
      for (let k = 0; k <= 1; k += 0.02) {
        const x = s.exit.x + (s.x - s.exit.x) * k;
        const z = s.exit.z + (s.z - s.exit.z) * k;
        expect(clearance(AREA.colliders, x, z), `spot ${s.id}`).toBeGreaterThanOrEqual(VISITOR.R);
        expect(SIM.swept(x, z)).toBe(false);
        expect(inPool(x, z, 0.3)).toBe(false);
      }
      expect(Math.hypot(s.look.x - s.x, s.look.z - s.z)).toBeLessThan(16);
    }
  });

  it('left to themselves for half an hour they stroll the loop, stop to watch the rides, and only ever stand on free ground', () => {
    const v = visitors();
    const watched = new Set();
    const placed = new Set();
    const mv = moves(v);
    let strolled = 0;
    for (let i = 0; i < 30 * 60 * 15; i++) {
      v.step(1 / 15, far);
      mv.check(1 / 15);
      for (const p of pairs(v)) {
        childRules(p, null, i / 15);
        placed.add(p.childAt);
        // side by side only where the way is clear for the two of them: the
        // pair's own radius round its middle, and the way PAIR.CLEAR wide
        if (p.childAt === 'beside') {
          const mx = p.x + Math.cos(p.yaw) * p.childSide * PAIR.BESIDE / 2;
          const mz = p.z - Math.sin(p.yaw) * p.childSide * PAIR.BESIDE / 2;
          expect(clearance(AREA.colliders, mx, mz)).toBeGreaterThanOrEqual(PAIR.CLEAR / 2 - 1e-9);
          expect(clearance(AREA.colliders, mx, mz)).toBeGreaterThan(PAIR.R);
          expect(inPool(mx, mz, PAIR.R)).toBe(false);
        }
      }
      for (const p of v.list) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.yaw)).toBe(true);
        expect(clearance(AREA.colliders, p.x, p.z), `${p.id} in something solid`).toBeGreaterThanOrEqual(VISITOR.R);
        expect(SIM.swept(p.x, p.z), `${p.id} on a ride`).toBe(false);
        expect(inPool(p.x, p.z, VISITOR.R), `${p.id} in the pool`).toBe(false);
        expect(p.x > AREA.bounds.minX && p.x < AREA.bounds.maxX && p.z > AREA.bounds.minZ && p.z < AREA.bounds.maxZ).toBe(true);
        if (p.mode === 'watch') watched.add(p.spot.id);
        if (p.mode === 'stroll' && p.moving) strolled++;
      }
    }
    expect(watched.size).toBeGreaterThanOrEqual(5); // they get about
    expect(strolled).toBeGreaterThan(30 * 60 * 15 * 8 * 0.4);
    // nobody hurries: a stroll
    expect(Math.max(...v.list.map((p) => p.pace))).toBeLessThan(1.4);
    // every one went a long way: nobody got stuck
    for (const p of v.list) expect(p.walked, p.id).toBeGreaterThan(400);
    // and they keep apart on the loop
    for (const p of v.list) for (const q of v.list) if (p !== q && p.mode === 'stroll' && q.mode === 'stroll') expect(dist(p, q)).toBeGreaterThan(0.6);
    // the children walk beside their grown-ups, a step behind on the narrow
    // ways (and see the fenced midway below), and never jump
    expect(placed.has('beside')).toBe(true);
    expect(placed.has('behind')).toBe(true);
    expect(mv.worst).toBeLessThanOrEqual(1e-9);
    expect(mv.through).toBe(0);
  }, 90_000);

  // The cats that try them: sitting in the way, crossing, running straight at
  // one after another, and chasing one wherever it goes.
  const CATS = {
    'sitting in the middle of the midway': (cat) => { cat.x = 1.5; cat.z = 30; cat.speed = 0; },
    'sitting on the plaza’s ring': (cat) => { cat.x = 6.1; cat.z = 6.1; cat.speed = 0; },
    'pacing across the midway': (cat, t) => { cat.x = Math.sin(t * 0.6) * 2.4; cat.z = 25 + Math.sin(t * 0.13) * 14; cat.speed = 1.6; },
    'running up and down the midway': (cat, t) => { const z = 27 + Math.sin(t * 0.35) * 15; cat.speed = Math.abs(z - cat.z) / (1 / 15); cat.x = 1.5 * Math.sign(Math.cos(t * 0.35)); cat.z = z; },
    'running round the plaza the wrong way': (cat, t) => { const a = -t * 0.7; cat.x = Math.sin(a) * 8.6; cat.z = Math.cos(a) * 8.6; cat.speed = 6; },
  };
  it.each(Object.keys(CATS))('are never where the cat is, and never off free ground: a cat %s', (name) => {
    const v = visitors(8, name);
    const cat = { x: 0, z: 30, y: 0, speed: 0 };
    let nearest = Infinity;
    let stopped = 0;
    CATS[name](cat, 0);
    const mv = moves(v, cat);
    const kp = keeps(v);
    for (let i = 0; i < 15 * 60 * 12; i++) {
      const t = i / 15;
      CATS[name](cat, t);
      v.step(1 / 15, cat);
      mv.check(1 / 15);
      kp.check(cat, t);
      for (const p of pairs(v)) {
        childRules(p, cat, t, AREA, !name.startsWith('running')); // (a running cat can reach a child: see the hunts below)
        nearest = Math.min(nearest, dist(childAt(p), cat));
      }
      for (const p of v.list) {
        nearest = Math.min(nearest, dist(p, cat));
        expect(clearance(AREA.colliders, p.x, p.z), `${p.id} in something solid`).toBeGreaterThanOrEqual(VISITOR.R);
        expect(SIM.swept(p.x, p.z), `${p.id} on a ride`).toBe(false);
        expect(inPool(p.x, p.z, VISITOR.R)).toBe(false);
        if (p.waiting) stopped++;
      }
    }
    expect(nearest).toBeLessThan(2.5); // they did meet
    expect(stopped).toBeGreaterThan(0); // and somebody gave way
    if (name.startsWith('sitting')) expect(kp.inside).toBe(0); // a cat who sits is never within anyone's KEEP
    // nobody is stuck for good behind a cat who sits: every one still gets round
    for (const p of v.list) expect(p.walked, p.id).toBeGreaterThan(name.startsWith('sitting') ? 250 : 60);
    expect(mv.worst).toBeLessThanOrEqual(1e-9); // a child steps out of her way smoothly too
    expect(mv.through).toBe(0);
    expect(mv.towards).toBe(0);
  }, 90_000);

  it('a cat who chases one visitor for five minutes: it never comes after her, never a step nearer her', () => {
    const v = visitors(8, 'chased');
    const target = v.list[2];
    const cat = { x: 0, z: 20, y: 0, speed: 0 };
    let approached = 0;
    const kp = keeps(v);
    for (let i = 0; i < 30 * 300; i++) {
      const d = dist(cat, target);
      if (d > 0.3) {
        const stepLen = Math.min(d, 4 * DT);
        const nx = cat.x + ((target.x - cat.x) / d) * stepLen;
        const nz = cat.z + ((target.z - cat.z) / d) * stepLen;
        if (isWalkableAt(AREA, nx, nz)) { cat.x = nx; cat.z = nz; cat.speed = 4; } else cat.speed = 0;
      }
      const gap = dist(target, cat); // once she has moved, before it does
      v.step(DT, cat);
      kp.check(cat, i * DT);
      for (const p of pairs(v)) childRules(p, cat, i * DT, AREA, false); // (she runs: see the hunts below)
      expect(v.free(target.x, target.z)).toBe(true);
      // with her within arm's length and coming on, it never takes a step towards her
      if (gap < VISITOR.NEAR && gap >= VISITOR.KEEP && dist(target, cat) < gap - 1e-6) approached++;
    }
    expect(approached).toBe(0);
  });

  // A cat who hunts a child, at a walk and at a run.
  function hunt(speed, seed) {
    const v = visitors(8, seed);
    const pair = v.list[3];
    expect(pair.pair).toBe(true);
    const cat = { x: 0, z: 20, y: 0, speed: 0 };
    let nearest = Infinity;
    const mv = moves(v, cat);
    const kp = keeps(v);
    for (let i = 0; i < 30 * 300; i++) {
      const kid = childAt(pair);
      const d = dist(cat, kid);
      if (d > 0.3) {
        const stepLen = Math.min(d, speed * DT);
        const nx = cat.x + ((kid.x - cat.x) / d) * stepLen;
        const nz = cat.z + ((kid.z - cat.z) / d) * stepLen;
        if (isWalkableAt(AREA, nx, nz)) { cat.x = nx; cat.z = nz; cat.speed = speed; } else cat.speed = 0;
      }
      v.step(DT, cat);
      mv.check(DT);
      nearest = Math.min(nearest, dist(childAt(pair), cat));
      kp.check(cat, i * DT);
      for (const p of pairs(v)) childRules(p, cat, i * DT, AREA, speed <= VISITOR.SIDE_SPEED);
    }
    // it never hops, and never steps towards her
    expect(mv.worst).toBeLessThanOrEqual(1e-9);
    expect(mv.through).toBe(0);
    expect(mv.towards).toBe(0);
    return nearest;
  }

  it('a cat who walks after a child for five minutes never comes within its soft bump\'s reach: it steps away', () => {
    const nearest = hunt(1, 'walked after');
    expect(nearest).toBeGreaterThanOrEqual(CHILD_REACH);
    expect(nearest).toBeLessThan(1.2); // she did come up to it
  }, 90_000);

  it('a cat who runs at a child for five minutes: it steps away at its grown-up’s pace, never towards her, never a hop', () => {
    // she is faster, so she can reach it: then the child's soft bump stops her (Task 14)
    expect(hunt(4, 'chased child')).toBeLessThan(VISITOR.KEEP);
  }, 90_000);

  // A stretch of the midway fenced in to a narrow way (posts either side, a
  // test's own copy of the place): too narrow for the two side by side, wide
  // enough for the pair one behind the other. The posts stand either side of
  // the way they walk: the loop with its corners rounded (closedLine's
  // `round`), so a fence at a corner does not stand across it.
  function fenced() {
    const v0 = visitors();
    const P = { x: 0, z: 0, hx: 0, hz: 1 };
    const clearAround = (s) => {
      for (let d = -3; d <= 3; d += 0.25) {
        v0.loop.at(s + d, P, true);
        if (clearance(AREA.colliders, P.x, P.z) < 2.6 || SIM.swept(P.x, P.z)) return false;
      }
      return true;
    };
    let at = 0;
    while (!clearAround(at)) at += 0.5;
    const posts = [];
    for (let d = -1.5; d <= 1.5; d += 0.5) {
      v0.loop.at(at + d, P, true);
      for (const side of [1, -1]) posts.push({ x: P.x + P.hz * side * 1.05, z: P.z - P.hx * side * 1.05, r: 0.2 });
    }
    v0.loop.at(at, P, true);
    return { area: { ...AREA, colliders: [...AREA.colliders, ...posts] }, mid: { x: P.x, z: P.z } };
  }

  it('a child steps behind its grown-up where the way is narrow, and back beside after, smoothly', () => {
    const { area, mid } = fenced();
    const v = createFairVisitors(area, { count: 8, seed: 'fenced', swept: SIM.swept });
    const mv = moves(v);
    const inside = new Map(pairs(v).map((p) => [p, false]));
    let through = 0;
    let besideIn = 0;
    const seen = new Set();
    for (let i = 0; i < 15 * 60 * 10; i++) {
      v.step(1 / 15, far);
      mv.check(1 / 15);
      for (const p of pairs(v)) {
        childRules(p, null, i / 15, area);
        expect(clearance(area.colliders, p.x, p.z)).toBeGreaterThanOrEqual(VISITOR.R);
        const now = dist(p, mid) < 1.2;
        if (now) {
          seen.add(p.childAt);
          if (p.childAt === 'beside') besideIn++;
        }
        if (inside.get(p) && !now) through++;
        inside.set(p, now);
      }
    }
    expect(through).toBeGreaterThan(3); // pairs went through, more than once
    expect(besideIn).toBe(0); // never side by side between the fences
    expect(seen.has('behind')).toBe(true);
    expect(mv.worst).toBeLessThanOrEqual(1e-9); // and the child moved there and back without a jump
    expect(mv.through).toBe(0);
  }, 90_000);

  it('take no notice of a cat up on a counter or a horse, and walk past underneath', () => {
    const v = visitors(8, 'high');
    const cat = { x: 1.5, z: 30, y: VISITOR.CAT_HIGH + 0.2, speed: 0 };
    let nearest = Infinity;
    for (let i = 0; i < 15 * 240; i++) {
      v.step(1 / 15, cat);
      for (const p of v.list) nearest = Math.min(nearest, dist(p, cat));
    }
    expect(nearest).toBeLessThan(0.5);
    expect(v.list.every((p) => Math.abs(p.side) < 1e-9)).toBe(true);
  });

  it('say hello to a meow: the near ones stop, turn to her, and wave or crouch; the far ones stroll on', () => {
    const v = visitors(8, 'hello');
    for (let i = 0; i < 300; i++) v.step(DT, far);
    const first = v.list[0];
    const pos = { x: first.x + 1.6, z: first.z + 0.4, y: 0, speed: 0 };
    const said = v.meow(pos);
    expect(said).toBeGreaterThanOrEqual(1);
    expect(v.takeEvents()).toEqual([{ type: 'visitor-hello', n: said }]);
    const near = v.list.filter((p) => p.hello > 0);
    expect(near).toHaveLength(said);
    expect(near).toContain(first);
    for (const p of v.list) expect(p.hello > 0).toBe(dist(p, pos) <= VISITOR.HELLO_R + 1e-9);
    expect(new Set(v.list.map((p) => p.helloKind))).toEqual(new Set(['wave', 'crouch']));
    const at = { x: first.x, z: first.z };
    for (let i = 0; i < 30; i++) v.step(DT, pos);
    expect(dist(first, at)).toBeLessThan(0.05); // it has stopped for her
    const facing = Math.atan2(pos.x - first.x, pos.z - first.z);
    expect(Math.abs(Math.atan2(Math.sin(first.yaw - facing), Math.cos(first.yaw - facing)))).toBeLessThan(0.3);
    for (let i = 0; i < 30 * 3; i++) v.step(DT, far);
    expect(first.hello).toBe(0); // and then strolls on
    expect(dist(first, at)).toBeGreaterThan(0.5);
    // a meow with nobody about is nothing
    expect(v.meow({ x: 40, z: -40 })).toBe(0);
    expect(v.takeEvents()).toEqual([]);
  });

  // With the lifelike people (ruling R41) a visitor saying hello
  // holds still for the hello and the kneel's way up. If she is still close
  // then (she sits 0.5 to 0.8 m off, in front of it, beside it, behind it),
  // it walks round her calmly and on its way: it never froze there for good
  // (final review: 0 m in a minute, four strollers queued behind it), never
  // jumps (aside()'s step), and never steps towards her within arm's length.
  it('with the people, a hello to a cat who then sits by it: it holds, then walks round her and on, calmly', () => {
    const cases = [[0, 0.8], [0, 0.5], [0.6, 0.7], [Math.PI / 2, 0.7], [-Math.PI / 2, 0.6], [Math.PI, 0.7]];
    let ran = 0;
    // (strolling and going out to watch, alone and with a child, and one at a corner of the loop)
    for (const who of [0, 1, 3, 4, 6]) {
      for (const [ang, r] of cases) {
        const v = createFairVisitors(AREA, { count: 8, seed: 'people', swept: SIM.swept });
        for (let i = 0; i < 300 + who * 37; i++) v.step(DT, far);
        const held = v.list[who];
        const cat = { x: held.x + Math.sin(held.yaw + ang) * r, z: held.z + Math.cos(held.yaw + ang) * r, y: 0, speed: 0 };
        if (!v.free(cat.x, cat.z)) continue;
        ran++;
        const at = `${held.id}, her ${r} m off at ${ang.toFixed(2)} rad`;
        expect(v.meow(cat), at).toBeGreaterThanOrEqual(1);
        const w0 = held.walked;
        const last = v.list.map((p) => ({ x: p.x, z: p.z }));
        const waited = v.list.map(() => 0);
        let longest = 0;
        let jumps = 0;
        let towards = 0;
        let movedHolding = 0;
        const mv = moves(v, cat);
        for (let i = 0; i < 30 * 60; i++) {
          const gaps = v.list.map((p) => dist(p, cat));
          const holding = v.list.map((p) => p.holdT > 0);
          v.step(DT, cat);
          mv.check(DT);
          v.list.forEach((p, k) => {
            const s = Math.hypot(p.x - last[k].x, p.z - last[k].z);
            if (s > (p.pace + VISITOR.SIDE_SPEED) * DT + 1e-9) jumps++;
            if (holding[k] && p.holdT > 0 && s > 0) movedHolding++;
            if (gaps[k] < VISITOR.NEAR && dist(p, cat) < gaps[k] - 1e-9) towards++;
            last[k] = { x: p.x, z: p.z };
            waited[k] = p !== held && p.waiting ? waited[k] + DT : 0;
            longest = Math.max(longest, waited[k]);
          });
          for (const p of pairs(v)) childRules(p, cat, i * DT, AREA, false);
        }
        expect(movedHolding, `${at}: still while it holds`).toBe(0);
        expect(held.walked - w0, `${at}: it walks on`).toBeGreaterThanOrEqual(20);
        expect(held.walked - w0, `${at}: at a walk (no dithering)`).toBeLessThanOrEqual(held.pace * 60 + 0.5);
        expect(longest, `${at}: nobody waits long behind it`).toBeLessThanOrEqual(4);
        expect(jumps, `${at}: no visitor ever jumps`).toBe(0);
        expect(towards, `${at}: never a step towards her within arm's length`).toBe(0);
        expect(mv.worst, `${at}: no child hops`).toBeLessThanOrEqual(1e-9);
        expect(mv.towards, `${at}: no child steps towards her`).toBe(0);
      }
    }
    expect(ran).toBeGreaterThanOrEqual(25);
  }, 90_000);

  it('are not animals: nothing at the fair can stalk, pounce on or spot one, and the file never shoos or follows', () => {
    expect(AREA.critterSpawns.some((c) => c.type === 'villager')).toBe(false);
    const src = code('fairvisitors.js');
    expect(src).not.toMatch(/critters|pounce|stalk|recordSighting|award|shoo|chase/i);
    expect(code('fairshow.js')).not.toMatch(/createCritters|critters\.list|spottable/);
    // no visitor has a collider: nobody can pen her in or push her
    const v = visitors();
    for (const p of v.list) expect(AREA.colliders.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < c.r)).toBe(false);
    expect(src).not.toMatch(/colliders\.push/);
  });
});

// =============================================================================
describe('the words', () => {
  const STEP3 = LATER_PHRASE_IDS.filter((id) => /^fair\.(cans|ducks|bell|game|prize|find|visitor)\./.test(id)
    || /^fair\.page\.(cans|ducks|bell|fortune|musicbox|candyfloss|juggler|balloon|lookout)\./.test(id));
  const lines = () => STEP3.map((id) => phrase(id, 2));

  it('every line of the games, the finds and their pages is in the phrase table, in the later table', () => {
    expect(STEP3).toHaveLength(55);
    expect(PHRASE_IDS.filter((id) => id.startsWith('fair.'))).toEqual([]);
    for (const id of STEP3) {
      expect(hasPhrase(id)).toBe(true);
      expect(id).toMatch(/^[a-z]+(\.[A-Za-z]+)+$/);
      expect(typeof phrase(id, 2)).toBe('string');
      expect(phrase(id, 2).length).toBeGreaterThan(5);
      expect(phrase(id, 2)).not.toMatch(/undefined|NaN/);
    }
    for (const id of FAIR_GAME_IDS) for (const key of ['prompt', 'again', 'start', 'first', 'won']) expect(GAME_WORDS[id][key]().length, `${id}.${key}`).toBeGreaterThan(8);
    for (const id of FAIR_FIND_IDS) { expect(FAIR_FIND_WORDS[id].first().length, id).toBeGreaterThan(8); expect(FAIR_FIND_WORDS[id].again().length, id).toBeGreaterThan(8); }
    for (const id of FAIR_JOURNAL_TYPES) { expect(FAIR_PAGE_WORDS[id].name()).toBeTruthy(); expect(FAIR_PAGE_WORDS[id].hint()).toBeTruthy(); }
    // a prompt is a prompt
    for (const id of STEP3.filter((i) => /([pP]rompt|\.again)$/.test(i) && !i.startsWith('fair.find.') && i !== 'fair.game.again')) expect(phrase(id)).toMatch(/^E — /);
    expect(phrase('fair.cans.hit', 1)).toBe('Clatter! One tin to go 🥫');
    expect(phrase('fair.cans.hit', 4)).toBe('Clatter! 4 tins to go 🥫');
    expect(VISITOR_HELLO()).toBe('A visitor says hello to you! 👋');
    // each first win names its own prize, as the catalog names it
    for (const id of FAIR_GAME_IDS) expect(GAME_WORDS[id].first()).toContain(CATALOG.accessories[FAIR_PRIZES[id]].name);
    // a miss is never called one: no line tells her she lost, failed or ran out of anything
    for (const text of lines()) expect(text).not.toMatch(/\b(lose|lost|fail|failed|wrong|too slow|too late|out of time|game over|missed)\b/i);
  });

  it('says the same in both sets of words, and borrows no word from the book series in either', () => {
    const on = lines();
    expect(bannedIn(on.join('\n'))).toBe(null);
    withOffWords(() => {
      expect(lines()).toEqual(on);
      for (const id of STEP3) expect(hasPhrase(id)).toBe(true);
      expect(Object.keys(offWords.PHRASES ?? {}).filter((id) => id.startsWith('fair.'))).toEqual([]);
      expect(renderJournalHtml({ gamebell: 2, fairjuggler: 1 }, 0, 36)).toContain(FAIR_PAGE_WORDS.gamebell.name());
      for (const id of FAIR_PRIZE_IDS) expect(bannedIn(CATALOG.accessories[id].name)).toBe(null);
    });
    // written for a nine-year-old: short sentences, no long words
    for (const text of on) {
      for (const sentence of text.split(/[.!?…]+/)) expect(sentence.trim().split(/\s+/).length, sentence).toBeLessThanOrEqual(17);
      for (const word of text.split(/[^A-Za-z’']+/)) expect(word.length, word).toBeLessThanOrEqual(11);
    }
  });

  it('none of these lines is typed outside the table', () => {
    for (const file of ['game/walk.js', 'game/fairplay.js', 'game/interactions.js', 'fairgames.js', 'fairshow.js', 'fairvisitors.js', 'fairlive.js']) {
      expect(code(file), file).not.toMatch(/Tin Can Alley|Hook a Duck|Ring the Bell|crystal ball shows|run-up|candyfloss is stuck|juggler dropped|runaway balloon!|says hello|🥫|🔔|🔮|🤹/);
    }
  });
});

// =============================================================================
describe('in the walk: the real pieces, the real prompt and E, a real save', () => {
  // The rides and the show as walk.js makes them, a stand-in cat and player,
  // and game/interactions.js's own prompt and E.
  function walk({ strays = 22, seed = 'walk' } = {}) {
    const made = builtFair();
    const clock = { T: 5000 };
    const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 300);
    const storage = mem();
    const progression = createProgression(storage);
    const log = createDiscoveryLog(progression);
    log.startWalk();
    const toasts = [];
    const prompts = [];
    const hud = new Proxy({ toast: (t) => toasts.push(t), setPrompt: (t) => prompts.push(t) }, { get: (t, k) => t[k] ?? (() => {}) });
    const audio = new Proxy({}, { get: () => () => {} });
    const cat = new THREE.Group();
    const head = new THREE.Group();
    cat.add(head);
    cat.userData.parts = { head };
    made.scene.add(cat);
    const player = { perchY: 0, inputActive: false, yaw: 0, speed: 0, inWater: false, engaged: true, halt() {}, setViewYaw() {}, inputDirection() { return new THREE.Vector3(); } };
    const carry = { mouth: createMouth(), items: createCarryables(made.scene, []) };
    const session = { perched: null, cat, pounceTime: 0, carry, fx: { burst() {} }, areaData: made.area };
    const events = [];
    const once = new Set();
    const ctx = { hud, audio, log, progression, session, once: (key, text) => { if (!once.has(key)) { once.add(key); hud.toast(text); } } };
    const onEvent = (e) => { events.push({ ...e }); handleFairEvent(e, ctx); };
    const live = createFairLive(made.scene, made.area, { camera, now: () => clock.T, onEvent });
    const before = { n: 0 };
    made.scene.traverse(() => before.n++);
    const show = createFairShow(made.scene, made.area, { swept: live.sim.swept, strays, camera, seed, onEvent, portrait: () => null });
    live.attach(show);
    addBalloonRibbon(carry, made.area);
    session.fair = live;
    const frame = (dt = DT) => {
      clock.T += dt;
      player.inWater = !session.perched && inPool(cat.position.x, cat.position.z);
      camera.position.set(cat.position.x, cat.position.y + 3, cat.position.z + 5);
      live.update(dt, clock.T, { cat, player, session });
      live.late(dt, clock.T, { cat, player, session });
      if (session.pounceTime > 0) session.pounceTime = Math.max(0, session.pounceTime - dt);
    };
    const w = { ...made, live, show, games: show.games, cat, player, session, progression, log, toasts, events, carry, storage, frame, clock };
    w.run = (seconds) => { for (let i = 0; i < Math.round(seconds / DT); i++) frame(); };
    w.put = (x, z) => { session.perched = null; player.perchY = 0; player.speed = 0; cat.position.set(x, 0, z); frame(); };
    w.walkTo = (x, z, speed = 3.2) => {
      for (let i = 0; i < 3000; i++) {
        const d = Math.hypot(x - cat.position.x, z - cat.position.z);
        if (d < 0.05) break;
        const s = Math.min(d, speed * DT);
        cat.position.x += ((x - cat.position.x) / d) * s; cat.position.z += ((z - cat.position.z) / d) * s;
        cat.rotation.y = Math.atan2(-(x - cat.position.x), -(z - cat.position.z));
        player.speed = speed;
        frame();
      }
      player.speed = 0;
    };
    w.pounce = (x, z) => {
      session.pounceTime = 0.3;
      const d = Math.hypot(x - cat.position.x, z - cat.position.z) || 1;
      for (let i = 0; i < 9; i++) { cat.position.x += ((x - cat.position.x) / d) * Math.min(d, 1.5) / 9; cat.position.z += ((z - cat.position.z) / d) * Math.min(d, 1.5) / 9; frame(); }
      w.run(0.2);
    };
    w.onCounter = () => { const c = w.games.counter; session.perched = c; player.perchY = c.y; cat.position.set(c.x, c.y, c.z); frame(); };
    w.prompt = () => fairPromptText(live.actionFor());
    w.E = () => { const a = live.actionFor(); return a ? live.act(a) : false; };
    w.added = () => { let n = 0; made.scene.traverse(() => n++); return n - before.n; };
    return w;
  }

  it('plays all three games to a win by prompt and E: each gives its prize once, fills its page, and misses along the way cost nothing', () => {
    const w = walk();
    const A2 = w.area.anchors;
    const points = w.progression.state.points;
    // ---- tin-can alley ----
    w.put(A2.tinCanPlay.x, A2.tinCanPlay.z);
    expect(w.prompt()).toBe('E — play Tin Can Alley');
    expect(w.E()).toBe(true);
    expect(w.toasts.at(-1)).toBe('Hop up onto the counter, then bat the tins down! 🥫');
    w.onCounter();
    const tins = w.area.rides.tinCans;
    const homes = tins.map((m) => m.position.clone());
    let bats = 0;
    while (w.games.state.cans === 'playing') { expect(w.prompt()).toBe('E — bat the tins'); expect(w.E()).toBe(true); bats++; w.run(0.8); }
    expect(bats).toBeLessThanOrEqual(6);
    // every tin is off the pyramid, lying on the shelf, none in the air or through the floor
    tins.forEach((m, i) => {
      expect(m.position.distanceTo(homes[i]), `tin ${i}`).toBeGreaterThan(0.05);
      expect(m.position.y).toBeGreaterThan(0.9);
      expect(m.position.y).toBeLessThan(1.1);
    });
    expect(w.progression.isUnlocked('accessories', 'papercrown')).toBe(true);
    expect(w.progression.state.journal.gamecans).toBe(1);
    expect(w.toasts).toContain('All six tins down! You won a Paper Crown to wear! 👑');
    // she hops down and walks off: the tins are back exactly where they were built
    w.put(0, 20);
    w.run(1);
    tins.forEach((m, i) => expect(m.position.distanceTo(homes[i])).toBeLessThan(1e-6));
    // ---- hook-a-duck: the unluckiest go there is ----
    w.put(A2.duckPoolSide.x, A2.duckPoolSide.z);
    expect(w.prompt()).toBe('E — play Hook a Duck');
    w.E();
    let tries = 0;
    while (w.games.state.ducks === 'playing') {
      const d = w.games.ducks.find((q) => !q.star) ?? w.games.ducks[0];
      w.put(d.x, d.z);
      w.put(w.games.ducks[d.id].x, w.games.ducks[d.id].z);
      expect(w.prompt()).toBe('E — pick up the duck');
      w.E();
      w.frame();
      const held = w.games.duck.held;
      expect(held).toBeTruthy();
      // in her mouth: the duck's own mesh goes where she goes
      const mesh = w.area.rides.ducks[held.id];
      expect(Math.hypot(mesh.position.x - w.cat.position.x, mesh.position.z - w.cat.position.z)).toBeLessThan(0.5);
      w.walkTo(A2.duckPoolSide.x, A2.duckPoolSide.z, 1.6);
      tries++;
      expect(tries).toBeLessThanOrEqual(4);
      w.run(0.2);
      // put down: the duck is back in the water
      expect(Math.hypot(mesh.position.x - A2.duckPool.x, mesh.position.z - A2.duckPool.z)).toBeLessThan(A2.duckPool.r);
    }
    expect(tries).toBe(4);
    expect(w.toasts.filter((t) => t === 'No star under this one. Back it swims. Try another duck! 🦆')).toHaveLength(3);
    expect(w.progression.isUnlocked('accessories', 'prizerosette')).toBe(true);
    // ---- ring the bell: two short pounces, then the third ----
    const pad = A2.bellPad;
    const marker = w.area.rides.bell.marker;
    const bell = w.area.rides.bell;
    w.put(pad.x - 1.3, pad.z);
    expect(w.prompt()).toBe('E — play Ring the Bell');
    w.E();
    const heights = [];
    for (let i = 0; i < 3; i++) {
      w.put(pad.x - 1.3, pad.z);
      w.run(1.5);
      w.pounce(pad.x, pad.z);
      let top = 0;
      for (let k = 0; k < 40; k++) { w.frame(); top = Math.max(top, marker.position.y); }
      heights.push(top);
      w.run(4);
      expect(marker.position.y).toBeCloseTo(bell.from, 5); // and slides back down
    }
    expect(heights[0]).toBeGreaterThan(bell.from + 0.3);          // a miss still shows how far it got
    expect(heights[0]).toBeLessThan(bell.from + (bell.to - bell.from) * 0.9);
    expect(heights[2]).toBeCloseTo(bell.to, 2);                    // the third rings
    expect(w.toasts.filter((t) => t === 'Not quite to the top. Take a longer run-up and pounce again! 🔔')).toHaveLength(2);
    expect(w.progression.isUnlocked('accessories', 'tailballoon')).toBe(true);
    expect(w.games.state).toEqual({ cans: 'offer', ducks: 'offer', bell: 'won' }); // (she has walked away from the first two: on offer again)
    // nothing was paid and nothing was charged: prizes only
    expect(w.progression.state.points).toBe(points);
    expect(w.events.filter((e) => e.type === 'game-won').map((e) => e.game)).toEqual(['cans', 'ducks', 'bell']);
    expect(Object.fromEntries(FAIR_GAME_IDS.map((g) => [g, w.progression.state.journal[gameJournalId(g)]]))).toEqual({ cans: 1, ducks: 1, bell: 1 });
  });

  it('a long run-up rings the bell first time in the walk too', () => {
    const w = walk();
    const pad = w.area.anchors.bellPad;
    w.put(pad.x - 8, pad.z);
    w.run(1);
    w.walkTo(pad.x - 1.3, pad.z, 3.2);
    w.player.speed = 3.2;
    w.pounce(pad.x, pad.z);
    expect(w.events.filter((e) => e.type === 'bell-hit')).toEqual([{ type: 'bell-hit', level: 1, ring: true, tries: 1 }]);
    expect(w.progression.state.journal.gamebell).toBe(1);
  });

  it('meets the finds by being there: the picture in the ball, the wisp on her whiskers, the juggler’s ball, the balloon’s ribbon', () => {
    const w = walk();
    const A2 = w.area.anchors;
    const face = w.scene.getObjectByName('fair-crystal-face');
    const wisp = () => w.cat.userData.parts.head.getObjectByName('fair-candyfloss-wisp');
    expect(face.visible).toBe(false);
    expect(wisp()).toBe(undefined);
    w.put(A2.fortuneSeat.x, A2.fortuneSeat.z);
    w.run(1.5);
    expect(face.visible).toBe(true);
    expect(face.material.opacity).toBeGreaterThan(0.5);
    // it hangs on the ball's near side
    const ball = w.area.rides.crystalBall.getWorldPosition(new THREE.Vector3());
    expect(face.position.distanceTo(ball)).toBeLessThan(0.3);
    w.put(0, 20);
    w.run(2);
    expect(face.visible).toBe(false);
    w.put(A2.candyfloss.x, A2.candyfloss.z);
    w.run(0.2);
    expect(wisp().visible).toBe(true);
    w.put(A2.jugglerWatch.x, A2.jugglerWatch.z);
    w.run(2);
    const dropped = w.scene.getObjectByName('fair-juggle-ball-2');
    expect(dropped.position.y).toBeCloseTo(GAME.BALL_R, 3);
    expect(Math.hypot(dropped.position.x - w.games.ball.x, dropped.position.z - w.games.ball.z)).toBeLessThan(1e-6);
    // the other two are still in the air over his hands
    for (const i of [0, 1]) expect(w.scene.getObjectByName(`fair-juggle-ball-${i}`).position.y).toBeGreaterThan(1.1);
    // the balloon
    const b = w.games.balloon;
    const mesh = w.scene.getObjectByName('fair-runaway-balloon');
    w.put(b.x + 1.2, b.z);
    expect(Math.hypot(mesh.position.x - b.x, mesh.position.z - b.z)).toBeLessThan(1e-6);
    expect(mesh.position.y).toBeGreaterThan(1.0);
    w.pounce(b.x, b.z);
    expect(b.state).toBe('caught');
    w.run(1.5);
    expect(mesh.visible).toBe(false);
    const ribbon = w.carry.items.list.find((it) => it.id === BALLOON_RIBBON_ID);
    expect(ribbon.mesh.visible).toBe(true);
    expect(ribbon.onGround).toBe(true);
    w.put(A2.musicBox.x, A2.musicBox.z);
    // five finds met on foot, each paid once; the sixth is up the big wheel
    const found = w.events.filter((e) => e.type === 'find').map((e) => e.id);
    expect(new Set(found)).toEqual(new Set(['fortune', 'candyfloss', 'juggler', 'balloon', 'musicbox']));
    expect(w.progression.state.points).toBe(5 * AWARDS.fairfind);
    for (const id of ['fortune', 'candyfloss', 'juggler', 'balloon', 'musicbox']) expect(w.progression.state.journal[fairFindJournalId(id)]).toBe(1);
    expect(w.progression.state.journal.fairlookout).toBe(undefined);
  });

  it('a meow among the visitors gets a hello, said once a walk', () => {
    const w = walk();
    const v = w.show.visitors.list[0];
    w.put(v.x + 1.5, v.z);
    expect(w.live.meow(w.cat.position)).toBeGreaterThanOrEqual(1);
    expect(w.live.meow(w.cat.position)).toBeGreaterThanOrEqual(1);
    expect(w.toasts.filter((t) => t === 'A visitor says hello to you! 👋')).toHaveLength(1);
    w.run(0.5);
    // the person turned to her and is saying hello (a wave, a kneel on one knee, or a bow)
    const person = w.show.people.find((f) => f.v === v && !f.child);
    expect(['wave', 'kneel', 'bow']).toContain(person.mode);
    expect(person.group).toBe(w.scene.getObjectByName(v.id));
    // it pays nothing and fills no page: a visitor is not an animal to spot
    expect(w.progression.state.points).toBe(0);
    expect(w.progression.state.journal.villager ?? 0).toBe(0);
  });

  it('offers nothing while she is on a ride, and nothing at all anywhere but the Fairground', () => {
    const w = walk();
    const A2 = w.area.anchors;
    w.put(A2.tinCanPlay.x, A2.tinCanPlay.z);
    expect(w.live.actionFor()).toBeTruthy();
    expect(NO_FAIR.games).toBe(null);
    expect(NO_FAIR.actionFor()).toBe(null);
    expect(NO_FAIR.act({ kind: 'play', game: 'cans' })).toBe(false);
    expect(NO_FAIR.meow({ x: 0, z: 0 })).toBe(0);
    // the rides alone (a test, or step 2's walk) still work with no show attached
    const bare = createFairLive(new THREE.Scene(), w.area, { now: () => 1 });
    expect(bare.games).toBe(null);
    expect(bare.actionFor()).toBe(null);
    expect(bare.meow({ x: 0, z: 0 })).toBe(0);
  });

  it('is wired into the walk: the show, the prompt, E, the meow, the ribbon and a walk picked up again', () => {
    const walkSrc = code('game/walk.js');
    expect(walkSrc).toMatch(/createFairShow\(scene, areaData, \{/);
    expect(walkSrc).toMatch(/fairLive\.attach\(fairShow\)/);
    expect(walkSrc).toMatch(/strays: tier\.strays/);
    expect(walkSrc).toMatch(/addBalloonRibbon\(carry, areaData\)/);
    expect(walkSrc).toMatch(/restoreFairGames\(fairLive, \{ log \}\)/);
    expect(walkSrc).toMatch(/for \(const g of fairShow\.groups\) decals\.follow\(g\)/);
    const inter = code('game/interactions.js');
    expect(inter).toMatch(/s\.prompt = \{ kind: 'fair', data: action \}/);
    expect(inter).toMatch(/s\.prompt\.kind === 'fair'[\s\S]{0,300}s\.fair\.act\(s\.prompt\.data\)/);
    expect(inter).toMatch(/session\.fair\?\.meow\?\.\(session\.cat\.position\)/);
    expect(typeof createInteractions).toBe('function');
    // the show's dice are its own: never the walk's
    expect(code('fairshow.js')).not.toMatch(/walkRng|Math\.random/);
    expect(code('fairgames.js')).not.toMatch(/Math\.random/);
  });
});

// =============================================================================
describe('what it costs to draw', () => {
  function stats(objects) {
    let meshes = 0;
    let casters = 0;
    let triangles = 0;
    const box = new THREE.Box3();
    for (const child of objects) {
      box.setFromObject(child);
      const eligible = castsFromBox(box);
      child.traverse((obj) => {
        if (!obj.isMesh) return;
        meshes++;
        const geo = obj.geometry;
        triangles += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
        if (eligible && !isTransparentMat(obj.material) && !obj.userData.noCast) casters++;
      });
    }
    return { meshes, casters, triangles: Math.round(triangles) };
  }
  const showFor = (strays) => {
    const made = builtFair();
    const show = createFairShow(made.scene, made.area, { strays, seed: 'budget', people: createPeopleKit });
    return { ...made, show };
  };

  it('drawn as lifelike people: one mesh a person (a pair is two), built far, MEASURED_PEOPLE on each tier, nothing that casts a shadow, under the show\'s cap', () => {
    // Measured 2026-11-21. Eight visitors (three of them pairs: 11 people) and
    // the juggler, each one skinned mesh at the far geometry (the kit's LOD
    // swaps near within 12 m), the juggler's three balls and the balloon; the
    // wisp is on her head only once it sticks; the ball's picture is a sprite.
    // The show's own cap rose to 8,000 with the lifelike people's pairs (spec,
    // "The Fairground's test pins").
    const high = stats(showFor(22).show.meshes);
    const mid = stats(showFor(14).show.meshes);
    const low = stats(showFor(8).show.meshes);
    expect(high).toEqual({ meshes: 16, casters: 0, triangles: MEASURED_PEOPLE.high });
    expect(mid).toEqual({ meshes: 12, casters: 0, triangles: MEASURED_PEOPLE.mid }); // five visitors, two of them pairs
    expect(low).toEqual({ meshes: 8, casters: 0, triangles: MEASURED_PEOPLE.low }); // three visitors, no pair
    expect(high.triangles).toBeLessThanOrEqual(SHOW_CAP);
  });

  it('as lifelike people with the place itself, stays inside the owner\'s 80,000 on the high tier (raised from 75,000 on 2026-11-28), and under 79,500 (ruling R21)', () => {
    const { scene, show } = showFor(22);
    const all = stats(scene.children);
    const added = stats(show.meshes);
    expect(all.triangles).toBeLessThanOrEqual(80000);
    expect(all.triangles).toBeLessThanOrEqual(79500); // room left for the Fairground's other builders
    expect(all.meshes).toBeLessThanOrEqual(260);
    expect(all.casters).toBe(109); // the people cast none
    // the place alone (test/fair.test.js pins it) is what is left
    expect(all.meshes - added.meshes).toBe(175);
    expect(all.triangles - added.triangles).toBe(68572);
  });

  it('adds every mesh when the walk begins and none after: a frame of play adds nothing, and the show clears up after itself', () => {
    const made = builtFair();
    const count = () => { let n = 0; made.scene.traverse(() => n++); return n; };
    const before = count();
    const show = createFairShow(made.scene, made.area, { strays: 22, seed: 'tidy' });
    const withShow = count();
    expect(withShow).toBeGreaterThan(before);
    const cat = new THREE.Group();
    const head = new THREE.Group();
    cat.add(head);
    cat.userData.parts = { head };
    const session = { perched: null, pounceTime: 0 };
    const player = { speed: 0, inWater: false };
    const A2 = made.area.anchors;
    for (const spot of [A2.tinCanPlay, A2.candyfloss, A2.fortuneSeat, A2.jugglerWatch, A2.bellPad]) {
      cat.position.set(spot.x, 0, spot.z);
      for (let i = 0; i < 30; i++) show.update(DT, i * DT, { cat, player, session });
    }
    expect(count()).toBe(withShow);
    expect(head.children).toHaveLength(1); // the wisp, on her whiskers
    show.dispose();
    expect(count()).toBe(before);
    expect(head.children).toHaveLength(0);
  });

  it('gives every person a villager’s look from their spot, varied, and no shadow but the contact shadow the walk lays under them', () => {
    const { show } = showFor(22);
    // eight visitors (three with a child, each in a group of its own) and the juggler
    expect(show.groups).toHaveLength(12);
    expect(show.people).toHaveLength(12);
    const HEIGHTS = { child: [1.16, 1.42], older: [1.55, 1.78], adult: [1.6, 1.85] };
    const tops = new Set();
    const again = createPeopleKit(); // the same spot through another kit: the same person
    for (const f of show.people) {
      expect(show.groups).toContain(f.group);
      const meshes = [];
      f.group.traverse((m) => { if (m.isMesh) meshes.push(m); });
      expect(meshes).toEqual([f.person.mesh]); // one mesh a person: the town's people, no model of the show's own
      for (const m of meshes) { expect(m.castShadow).toBe(false); expect(m.userData.noCast).toBe(true); }
      // the look is the spot's (the juggler is dressed by hand, at 1.76 m)
      if (f.juggler) expect(f.person.look.height).toBe(1.76);
      else expect(f.person.look).toEqual(again.buildSpot(f.v.look).people[f.child ? 1 : 0].look);
      expect(f.person.look.kind === 'child').toBe(f.child);
      // a person's height, for their kind
      const [lo, hi] = HEIGHTS[f.person.look.kind];
      expect(f.person.look.height).toBeGreaterThanOrEqual(lo);
      expect(f.person.look.height).toBeLessThanOrEqual(hi);
      tops.add(`${f.person.look.top.kind} ${f.person.look.top.color}`);
    }
    expect(tops.size).toBeGreaterThanOrEqual(3);
  });
});

const MEASURED_PEOPLE = { high: 5706, mid: 3934, low: 2130 };
const SHOW_CAP = 8000;
