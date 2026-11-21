// The Market Square's words (Task 10): each treat has its name and its prompt,
// and every line says the same in both word sets and holds no series word.
import { describe, it, expect, vi } from 'vitest';
import * as on from '../src/clanwords.js';
import * as off from '../src/offclanwords.js';
import { inEachWordSet, seriesModes } from '../src/wordset.js';
import { TREAT_WORDS, MARKET_LINES } from '../src/marketwords.js';
import * as THREE from 'three';
import { withStandInWords } from './helpers/standinwords.js';
import { withOffWords } from './helpers/offwords.js';
import { seriesFilter, stringsIn } from './helpers/serieswords.js';

// The same headless canvas stub every world test uses (test/roofs.test.js):
// the ground's and the lamp posts' tiles paint on a canvas.
vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') {
          return () => ({ addColorStop: () => {} });
        }
        if (key === 'measureText') return () => ({ width: 10 });
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const { build } = await import('../src/world/market.js');
const area = build(new THREE.Scene());

const KINDS = ['fishhead', 'sausageroll', 'cheddar', 'cream', 'crumbs'];

const everyLine = () => ({
  treats: Object.fromEntries(KINDS.map((k) => [k, TREAT_WORDS[k] && { name: TREAT_WORDS[k].name, prompt: TREAT_WORDS[k].prompt }])),
  lines: {
    eatFirst: MARKET_LINES.eatFirst('a fish head'),
    eatAgain: MARKET_LINES.eatAgain('a fish head'),
    shoo: MARKET_LINES.shoo(),
    laugh: MARKET_LINES.laugh(),
    coo: MARKET_LINES.coo(),
    teamEater: MARKET_LINES.teamEater('Robin'),
    teamDistracter: MARKET_LINES.teamDistracter('Robin'),
    summaryTreats: MARKET_LINES.summaryTreats(),
  },
});

describe('the market words', () => {
  it('every treat has its name and its prompt, and every prompt names its treat', () => {
    expect(Object.keys(TREAT_WORDS).sort()).toEqual([...KINDS].sort());
    const nouns = { fishhead: 'fish head', sausageroll: 'sausage roll', cheddar: 'cheddar', cream: 'cream', crumbs: 'crumbs' };
    for (const k of KINDS) {
      const { name, prompt } = TREAT_WORDS[k];
      expect(typeof name, k).toBe('string');
      expect(name.length, k).toBeGreaterThan(0);
      expect(prompt, k).toMatch(/^E — /);
      expect(prompt.toLowerCase(), k).toContain(nouns[k]);
      expect(name.toLowerCase(), k).toContain(nouns[k].split(' ').pop().replace(/s$/, ''));
    }
    expect(TREAT_WORDS.fishhead.prompt).toBe('E — grab the fish head');
    expect(TREAT_WORDS.cream.prompt).toBe('E — lap up the cream');
    expect(MARKET_LINES.eatFirst('a fish head')).toBe('Yum! You grabbed a fish head! 😋');
    expect(MARKET_LINES.teamDistracter('Robin')).toBe('Teamwork! You kept them busy while Robin grabbed a treat 🐾');
  });

  it('the market\'s lines say the same in both word sets and hold no series word', () => {
    const plain = JSON.stringify(everyLine());
    const perSet = inEachWordSet(() => JSON.stringify(everyLine()));
    expect(perSet.length).toBe(seriesModes().length);
    for (const s of perSet) expect(s).toBe(plain);
    expect(withOffWords(() => JSON.stringify(everyLine()))).toBe(plain);
    expect(withStandInWords(() => JSON.stringify(everyLine()))).toBe(plain);

    // the words of both sets, as the screens' filter knows them
    const tableWords = [...new Set([...on.PREFIXES, ...off.PREFIXES, on.CLAN_SUFFIX, off.CLAN_SUFFIX,
      ...Object.values(on.RANK_WORDS), ...Object.values(off.RANK_WORDS)])].filter((w) => w && w.length > 2);
    const found = seriesFilter(tableWords);
    const texts = [...stringsIn(everyLine()), ...area.collectibles.map((c) => c.label), ...area.scenics.map((c) => c.label)];
    expect(texts.length).toBeGreaterThan(10);
    for (const t of texts) expect(found(t), t).toBe(false);
    expect(area.scenics.length).toBeGreaterThan(0);
    expect(area.collectibles.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// In the walk (Task 13): the treat prompt and E, the pay (once per stall per
// walk), the tally on the summary, and teamwork pay on each child's own
// device, over the existing carry-pick and nothing new (M6-M9).
// =============================================================================
const { marketRig } = await import('./helpers/marketrig.js');
const { lifecycle, fakeEl, memStorage } = await import('./helpers/walklife.js');
const { handleMarketEvent, restoreMarket, createMarketToasts } = await import('../src/game/marketplay.js');
const { createInteractions } = await import('../src/game/interactions.js');
const { createNetEvents } = await import('../src/game/netevents.js');
const { createDiscoveryLog, AWARDS } = await import('../src/discoveries.js');
const { createProgression } = await import('../src/progression.js');
const { createCarryables } = await import('../src/carryables.js');
const { pick } = await import('../src/carry.js');
const { createToy } = await import('../src/toy.js');
const { NO_MARKET, treatItemId, SHOO_TOAST_GAP } = await import('../src/marketnone.js');
const { MARKET } = await import('../src/marketrules.js');
const { stallById, fromStall, MARKET_SPAWN } = await import('../src/world/marketplan.js');
const { isWalkableAt } = await import('../src/player.js');
const { summaryStatsHtml } = await import('../src/ui/screencards.js');
const { setMarket } = await import('../src/marketflag.js');
const { createAreaLoader } = await import('../src/game/areaload.js');
const { snapshotWalk, writeResume, readResume } = await import('../src/game/walkresume.js');
const { mulberry32 } = await import('../src/rng.js');

const DT = 1 / 30;
const S = (id) => stallById(id);
// in reach of a stall's treat, straight out in front of it (as test/marketlive.test.js)
const reachSpot = (id) => fromStall(S(id), S(id).w / 2 - 0.3, S(id).d / 2 + 0.95);
// in reach of the café's crumbs, on the way from the spawn
function cafeSpot() {
  const C = S('cafe').treat;
  const dx = MARKET_SPAWN.x - C.x;
  const dz = MARKET_SPAWN.z - C.z;
  const d = Math.hypot(dx, dz);
  return { x: C.x + (dx / d) * 0.6, z: C.z + (dz / d) * 0.6 };
}
const SOCK = { id: 'market-test-sock', kind: 'sock', x: MARKET_SPAWN.x + 1.5, z: MARKET_SPAWN.z };
const nameOfKind = (kind) => TREAT_WORDS[kind].name;

// A Market walk on one device: the real square and its life (the rig), the
// real prompt ladder and E (game/interactions.js), a real save and discovery
// log, and the walk's handleMarketEvent on every event. `me` is this device's
// player id; a partner is added with g.partner(id, name, x, z).
function game({ seed = 7, clock = 1e9, me = 'me', isFree } = {}) {
  const progression = createProgression(memStorage());
  const log = createDiscoveryLog(progression);
  log.startWalk();
  // every award the walk asks for, and what it paid
  const awards = [];
  const awardOnce = log.awardOnce;
  log.awardOnce = (type, key, label) => {
    const points = awardOnce(type, key, label);
    awards.push({ type, key, label, points });
    return points;
  };
  const toasts = [];
  const prompts = [];
  const sounds = [];
  const hud = new Proxy({ toast: (t) => toasts.push(t), setPrompt: (t) => prompts.push(t) }, { get: (t, k) => t[k] ?? (() => {}) });
  const audio = new Proxy({}, { get: (_t, k) => (...args) => { sounds.push([k, ...args]); } });
  let r = null;
  const marketToasts = createMarketToasts({ hud, now: () => r.t });
  r = marketRig({
    seed, clock, ...(isFree ? { isFree } : {}),
    onEvent: (e) => handleMarketEvent(e, { hud, audio, log, session: r.session, ...marketToasts }),
  });
  const s = r.session;
  r.cat.userData.breed = 'tabby';
  Object.assign(r.player, {
    zooming: false, inWater: false, swimming: false, engaged: true, yaw: 0,
    forward: () => new THREE.Vector3(0, 0, -1), halt() {}, setViewYaw() {}, inputDirection: () => new THREE.Vector3(),
  });
  Object.assign(s, {
    playerId: me, areaId: 'market', walkStamp: 'walk-0', scene: r.scene, areaData: r.area,
    collectibleMeshes: new Map(),
    critters: { list: [], dismayNear() {}, reactToMeow() {} },
    strayCats: { strays: [], nearest: () => null, reactToMeow: () => 0 },
    ghosts: { list: [], nearest: () => null },
    secrets: { list: [] },
    tippables: { nearest: () => null, list: [] },
    scent: { nearestMound: () => null },
    goldMice: null, race: { promptAt: () => null }, kittenEnc: null,
    quest: null, questGiver: null, questObject: null, gifts: null,
    pounceTime: 0, freezeTime: 0, catsGreeted: 0, walk: { carried: 0, carryCap: 2 },
    fx: { burst() {} }, prompt: null, lastPromptKind: null,
    market: r.live,
  });
  s.remotes.nearest = () => null;
  s.carry.items = createCarryables(r.scene, [SOCK]);
  s.carry.onDeck = () => false;
  s.toy = createToy(r.scene, { rng: mulberry32(3) });
  const api = createInteractions({
    MP: 1, pid: me, getCloud: () => null, getPsecret: () => null,
    getSession: () => s, getIsTouch: () => false,
    player: r.player, progression, log, hud, audio,
    catVoice() {}, snapPhoto() {}, petNameFor: () => 'x', completeBoop() {},
  });
  const g = { r, s, api, progression, log, awards, toasts, prompts, sounds, hud, audio };
  g.frame = (n = 1) => {
    for (let i = 0; i < n; i++) {
      r.step(DT);
      s.carry.items.update(0);
      api.updateInteractions(s);
    }
    return g;
  };
  g.run = (seconds) => g.frame(Math.round(seconds / DT));
  g.put = (p) => { r.place(p.x, p.z); return g.frame(); };
  // the prompt now, and the action button on it
  g.promptKind = () => { api.updateInteractions(s); return s.prompt?.kind ?? null; };
  g.E = () => { api.updateInteractions(s); api.handleInteract(s); return g; };
  g.sent = () => s.net.sendEvent.mock.calls.map((c) => c[0]);
  g.points = () => progression.state.points;
  g.partner = (id, petName, x, z) => {
    const e = r.addRemote(id, x, z);
    e.petName = petName;
    return e;
  };
  return g;
}
const ofType = (list, type) => list.filter((e) => e.type === type);

describe('in the walk (Task 13)', () => {
  it('eating pays a treat once per stall per walk, and the tally counts every treat', () => {
    expect(AWARDS.treat).toBe(6);
    expect(AWARDS.teamtreat).toBe(6);
    const g = game();
    const crumbs = nameOfKind('crumbs');
    const p0 = g.points();
    // the café's crumbs (never watched): the prompt, E, the munch, the pay
    g.put(cafeSpot());
    expect(g.promptKind()).toBe('market');
    expect(g.prompts.at(-1)).toBe(TREAT_WORDS.crumbs.prompt);
    g.E();
    expect(g.s.carry.mouth.held).toEqual({ id: treatItemId('cafe'), kind: 'crumbs', treat: true });
    expect(g.awards).toEqual([]); // paid when eaten, not when grabbed
    g.run(MARKET.HOLD_S + MARKET.MUNCH_S + 0.2);
    expect(g.awards).toEqual([{ type: 'treat', key: 'market-treat-cafe', label: MARKET_LINES.eatFirst(crumbs), points: AWARDS.treat }]);
    expect(g.points() - p0).toBe(AWARDS.treat);
    expect(g.sounds).toContainEqual(['trill', 0.8]);
    expect(g.r.live.treats).toBe(1);
    // laid out again: eaten again, the tally counts it, but it pays nothing more
    g.run(MARKET.REFILL_S + 0.5);
    g.E();
    g.run(MARKET.HOLD_S + MARKET.MUNCH_S + 0.2);
    expect(g.awards.at(-1)).toEqual({ type: 'treat', key: 'market-treat-cafe', label: MARKET_LINES.eatFirst(crumbs), points: 0 });
    expect(g.toasts).toContain(MARKET_LINES.eatAgain(crumbs));
    expect(g.points() - p0).toBe(AWARDS.treat);
    expect(g.r.live.treats).toBe(2);
    // another stall pays again: the fish head, with the fishmonger turned away
    g.r.setPhase('fish', 'away', 0.2);
    g.put(reachSpot('fish'));
    expect(g.promptKind()).toBe('market');
    g.E();
    g.run(MARKET.HOLD_S + MARKET.MUNCH_S + 0.2);
    expect(g.awards.at(-1)).toEqual({ type: 'treat', key: 'market-treat-fish', label: MARKET_LINES.eatFirst(nameOfKind('fishhead')), points: AWARDS.treat });
    expect(g.points() - p0).toBe(2 * AWARDS.treat);
    expect(g.r.live.treats).toBe(3);
    expect(g.awards.filter((a) => a.type === 'teamtreat')).toEqual([]);
    g.r.live.dispose();
  }, 90_000);

  it('teamwork: the eater and the distracter are both paid, each on her own device', () => {
    const id = 'baker';
    const s = S(id);
    // Ana's device and Ben's: one seed, one clock
    const A = game({ me: 'ana' });
    const B = game({ me: 'ben' });
    for (const g of [A, B]) g.r.setPhase(id, 'serve', 0);
    const still = A.r.local(id, 0, s.d / 2 + 1.5);
    const benStart = { x: MARKET_SPAWN.x + 1, z: MARKET_SPAWN.z };
    // Ana stands still in front of the baker; each device sees the other as a partner
    A.r.place(still.x, still.z);
    const benOnA = A.partner('ben', 'Ben', benStart.x, benStart.z);
    B.r.place(benStart.x, benStart.z);
    B.partner('ana', 'Ana', still.x, still.z);
    const both = (n) => { for (let i = 0; i < n; i++) { A.frame(); B.frame(); } };
    both(Math.round((MARKET.STILL_S + 0.3) / DT));
    expect(A.r.stall(id).cooing?.who).toBe('me');
    expect(B.r.stall(id).cooing?.who).toBe('ana');
    expect(A.toasts).toContain(MARKET_LINES.coo()); // the coo is hers
    expect(B.toasts).not.toContain(MARKET_LINES.coo());
    // Ben slips up to the counter while the baker coos at Ana, and grabs the sausage roll
    const reach = reachSpot(id);
    B.r.place(reach.x, reach.z);
    A.r.placeRemote(benOnA, reach.x, reach.z);
    both(1);
    expect(B.promptKind()).toBe('market');
    B.E();
    expect(B.s.carry.mouth.held).toEqual({ id: treatItemId(id), kind: 'sausageroll', treat: true });
    const sent = B.sent();
    expect(sent).toEqual([{ v: 1, id: 'ben', type: 'carry-pick', itemId: treatItemId(id) }]);
    // the pick reaches Ana's device through its own net events
    const { applyRemoteEvent } = createNetEvents({
      MP: 1, getCloud: () => null, getPsecret: () => null, log: A.log, hud: A.hud, audio: A.audio,
      samples: { has: () => false }, catVoice() {}, applyGoalResult() {}, getPartner: () => null,
    });
    applyRemoteEvent(A.s, sent[0]);
    expect(A.awards).toEqual([{ type: 'teamtreat', key: `market-team-${id}`, label: MARKET_LINES.teamDistracter('Ben'), points: AWARDS.teamtreat }]);
    expect(A.s.carry.mouth.held).toBe(null);
    expect(A.r.stall(id).treatOut).toBe(true); // her own sausage roll is still out for her
    both(Math.round((MARKET.HOLD_S + MARKET.MUNCH_S + 0.2) / DT));
    // Ben's device pays Ben his ordinary treat and says who kept them busy
    expect(B.awards).toEqual([{ type: 'treat', key: `market-treat-${id}`, label: MARKET_LINES.eatFirst(nameOfKind('sausageroll')), points: AWARDS.treat }]);
    expect(B.toasts).toContain(MARKET_LINES.teamEater('Ana'));
    expect(B.r.live.treats).toBe(1);
    // and Ana's pays nothing else: no treat, no tally
    expect(A.awards).toHaveLength(1);
    expect(A.r.live.treats).toBe(0);
    expect(A.sent()).toEqual([]);
    A.r.live.dispose();
    B.r.live.dispose();
  }, 90_000);

  it('teamwork pays once per stall per walk', () => {
    const g = game({ me: 'ana' });
    const p0 = g.points();
    const ben = g.partner('ben', 'Ben', MARKET_SPAWN.x + 1, MARKET_SPAWN.z);
    const cooAt = (id) => {
      g.r.setPhase(id, 'serve', 0);
      const p = g.r.local(id, 0, S(id).d / 2 + 1.5);
      g.r.place(p.x, p.z);
      for (let i = 0; i < 90 && !g.r.stall(id).cooing; i++) g.frame();
      expect(g.r.stall(id).cooing?.who, id).toBe('me');
    };
    cooAt('baker');
    expect(g.r.live.remotePick(ben, treatItemId('baker'))).toBe(true);
    expect(g.r.live.remotePick(ben, treatItemId('baker'))).toBe(true);
    const team = () => g.awards.filter((a) => a.type === 'teamtreat');
    expect(team().map((a) => a.points)).toEqual([AWARDS.teamtreat, 0]);
    // she moves on, stops again and is cooed at again: the baker still pays once
    g.r.walk(S('baker').face.x, S('baker').face.z, 1.0);
    g.frame(12);
    cooAt('baker');
    g.r.live.remotePick(ben, treatItemId('baker'));
    expect(team().map((a) => a.points)).toEqual([AWARDS.teamtreat, 0, 0]);
    // another stall is another teamwork
    cooAt('fish');
    g.r.live.remotePick(ben, treatItemId('fish'));
    expect(team().filter((a) => a.points > 0).map((a) => a.key)).toEqual(['market-team-baker', 'market-team-fish']);
    expect(g.points() - p0).toBe(2 * AWARDS.teamtreat);
    // a partner's pick is never her own treat, nor her tally
    expect(g.awards.filter((a) => a.type === 'treat')).toEqual([]);
    expect(g.r.live.treats).toBe(0);
    g.r.live.dispose();
  }, 60_000);

  it('a resumed walk keeps its paid treats and their count', async () => {
    // the life and the walk's log: the tally starts at the treats already paid
    {
      const g = game();
      g.log.restore([['market-treat-fish', 1], ['market-treat-cafe', 1], ['market-team-baker', 1], ['col-x', 1]]);
      restoreMarket(g.r.live, g.log);
      expect(g.r.live.treats).toBe(2);
      g.put(cafeSpot());
      g.E();
      g.run(MARKET.HOLD_S + MARKET.MUNCH_S + 0.2);
      expect(g.awards).toEqual([{ type: 'treat', key: 'market-treat-cafe', label: MARKET_LINES.eatFirst(nameOfKind('crumbs')), points: 0 }]);
      expect(g.toasts).toContain(MARKET_LINES.eatAgain(nameOfKind('crumbs')));
      expect(g.r.live.treats).toBe(3);
      g.r.live.dispose();
    }
    // a whole walk, closed mid-munch and picked up again
    await inAWalk(async ({ l }) => {
      setMarket(true);
      await l.w.beginWalkFromHomebase({ duskMode: false });
      const s = l.getSession();
      expect(s.areaId).toBe('market');
      expect(s.market).not.toBe(NO_MARKET);
      expect(s.market.treats).toBe(0);
      const player = { speed: 0, stalking: false, perchY: 0, swimming: false, inputActive: false };
      let t = 0;
      const run = (seconds) => { for (let i = 0; i < Math.round(seconds / DT); i++) { t += DT; s.market.update(DT, t, { cat: s.cat, player, session: s }); } };
      const spot = cafeSpot();
      s.cat.position.set(spot.x, 0, spot.z);
      run(DT);
      const grab = () => s.market.act(s.market.actionFor(s), s, { dropHeld: () => {} });
      expect(grab()).toBe(true);
      run(MARKET.HOLD_S + MARKET.MUNCH_S + 0.2);
      // eaten and paid, by the walk's own handler and log
      expect(l.log.count('market-treat-cafe')).toBe(1);
      expect(s.market.treats).toBe(1);
      // laid out again; she grabs it, and the game is closed mid-munch
      run(MARKET.REFILL_S + 0.5);
      expect(grab()).toBe(true);
      run(MARKET.HOLD_S / 2);
      expect(s.carry.mouth.held?.treat).toBe(true);
      const storage = memStorage();
      writeResume(storage, snapshotWalk(s, { yaw: 0, now: Date.now(), paid: l.log.entries() }));
      l.w.endWalk();
      // the treat in her mouth was not kept: no den keepsake, no mark of any kind
      expect(JSON.stringify(l.progression.state)).not.toMatch(/market-treat/);
      expect(l.overlay.innerHTML).toContain(tileOf('😋', 1, 'treats'));
      // picked up again
      const note = readResume(storage, { now: Date.now() + 60_000, areaIds: ['market'] });
      expect(note?.kind).toBe('resume');
      expect(await l.w.startWalkWhenReady({ areaOverride: 'market', resume: note.data })).toBe('started');
      const s2 = l.getSession();
      expect(s2.market.treats).toBe(1);
      expect(l.log.count('market-treat-cafe')).toBe(1);
      // the half-eaten crumbs are simply gone: nothing in her mouth, the café's laid out afresh
      expect(s2.carry.mouth.held).toBe(null);
      expect(s2.market.stalls.find((st) => st.id === 'cafe').treatOut).toBe(true);
      s2.cat.position.set(spot.x, 0, spot.z);
      const run2 = (seconds) => { for (let i = 0; i < Math.round(seconds / DT); i++) { t += DT; s2.market.update(DT, t, { cat: s2.cat, player, session: s2 }); } };
      run2(DT);
      const points = l.progression.state.points;
      expect(s2.market.act(s2.market.actionFor(s2), s2, { dropHeld: () => {} })).toBe(true);
      run2(MARKET.HOLD_S + MARKET.MUNCH_S + 0.2);
      expect(l.progression.state.points).toBe(points); // not paid twice
      expect(s2.market.treats).toBe(2);
      l.w.endWalk();
      expect(l.overlay.innerHTML).toContain(tileOf('😋', 2, 'treats'));
    });
  }, 90_000);

  it('the shoo line shows at most once every SHOO_TOAST_GAP seconds', () => {
    // the walk's handler on its own, on a clock the test holds
    let clock = 0;
    const toasts = [];
    const sounds = [];
    const hud = { toast: (t) => toasts.push(t) };
    const audio = { landThump: () => sounds.push('thump'), trill: () => sounds.push('trill') };
    const log = createDiscoveryLog({ addPoints() {} });
    const ctx = { hud, audio, log, session: { remotes: { list: [] } }, ...createMarketToasts({ hud, now: () => clock }) };
    const shoo = (at, o = {}) => { clock = at; handleMarketEvent({ type: 'shoo', stall: 'fish', who: 'me', laugh: false, hopped: true, ...o }, ctx); };
    shoo(0);
    shoo(1, { hopped: false }); // a second press mid-shoo
    shoo(3);
    shoo(5.9, { laugh: true, hopped: false });
    shoo(6.0, { laugh: true, hopped: false });
    shoo(7);
    shoo(8, { who: 'ben' }); // a partner's shoo: nothing at all
    shoo(12.1, { stall: 'milk' });
    expect(toasts).toEqual([MARKET_LINES.shoo(), MARKET_LINES.laugh(), MARKET_LINES.shoo()]);
    expect(SHOO_TOAST_GAP).toBe(6);
    expect(MARKET.SHOO_TOAST_GAP).toBe(SHOO_TOAST_GAP); // one gap, read from the main graph
    // a thump for every hop that began, and only for those
    expect(sounds).toEqual(['thump', 'thump', 'thump', 'thump']);

    // and in the square: pressed again a frame into her hop (still in reach), one line and one thump
    const g = game();
    g.r.setPhase('fish', 'serve', 0.3);
    g.put(reachSpot('fish'));
    g.E();
    g.frame(1);
    expect(g.promptKind()).toBe('market');
    g.E();
    const shoos = ofType(g.r.events, 'shoo');
    expect(shoos).toHaveLength(2);
    expect(shoos[1].hopped).toBe(false);
    expect(g.toasts.filter((t) => t === MARKET_LINES.shoo())).toHaveLength(1);
    expect(g.sounds.filter(([k]) => k === 'landThump')).toHaveLength(shoos.filter((e) => e.hopped).length);
    expect(g.sounds.filter(([k]) => k === 'landThump').length).toBeLessThanOrEqual(1);
    expect(g.awards).toEqual([]);
    expect(g.s.carry.mouth.held).toBe(null);
    g.r.live.dispose();

    // her back to something solid, pressed again and again: one line, and no
    // thump at all, since no hop ever begins
    const b = game({ isFree: () => false });
    b.r.setPhase('fish', 'serve', 0.3);
    b.put(reachSpot('fish'));
    for (let i = 0; i < 4; i++) { b.E(); b.frame(8); }
    expect(ofType(b.r.events, 'shoo').map((e) => e.hopped)).toEqual([false, false, false, false]);
    expect(b.toasts.filter((t) => t === MARKET_LINES.shoo())).toHaveLength(1);
    expect(b.sounds.filter(([k]) => k === 'landThump')).toEqual([]);
    b.r.live.dispose();
  }, 60_000);

  it('a full mouth sets down what it holds and takes the treat', () => {
    // a sock: down where her mouth is, its carry-drop sent, then the treat in
    {
      const g = game();
      g.put({ x: SOCK.x, z: SOCK.z + 0.2 });
      expect(g.promptKind()).toBe('carry');
      g.E();
      expect(g.s.carry.mouth.held?.id).toBe(SOCK.id);
      g.frame();
      g.s.net.sendEvent.mockClear();
      g.r.setPhase('baker', 'away', 0.2);
      g.put(reachSpot('baker'));
      expect(g.promptKind()).toBe('market');
      g.E();
      expect(g.s.carry.mouth.held).toEqual({ id: treatItemId('baker'), kind: 'sausageroll', treat: true });
      const sock = g.s.carry.items.list.find((it) => it.id === SOCK.id);
      expect(sock.onGround).toBe(true);
      expect(Math.hypot(sock.mesh.position.x - g.r.cat.position.x, sock.mesh.position.z - g.r.cat.position.z)).toBeLessThan(1);
      const sent = g.sent();
      expect(sent.map((e) => e.type)).toEqual(['carry-drop', 'carry-pick']);
      expect(sent[0]).toMatchObject({ itemId: SOCK.id });
      expect(sent[1]).toEqual({ v: 1, id: 'me', type: 'carry-pick', itemId: treatItemId('baker') });
      g.r.live.dispose();
    }
    // the yarn ball: set down (no message: the yarn is this device's), then the treat in
    {
      const g = game();
      g.s.toy.setPosition(new THREE.Vector3(MARKET_SPAWN.x, 0, MARKET_SPAWN.z));
      expect(pick(g.s.carry.mouth, { id: 'yarn', kind: 'yarn', toy: true })).toBe(true);
      g.s.toy.hold();
      g.r.setPhase('baker', 'away', 0.2);
      g.put(reachSpot('baker'));
      expect(g.promptKind()).toBe('market');
      g.E();
      expect(g.s.carry.mouth.held).toEqual({ id: treatItemId('baker'), kind: 'sausageroll', treat: true });
      expect(g.s.toy.held).toBe(false);
      expect(g.sent()).toEqual([{ v: 1, id: 'me', type: 'carry-pick', itemId: treatItemId('baker') }]);
      g.r.live.dispose();
    }
  }, 60_000);

  it('no treat prompt perched, swimming or munching', () => {
    const g = game();
    g.r.setPhase('fish', 'away', 0.2);
    const p = reachSpot('fish');
    g.put(p);
    expect(g.promptKind()).toBe('market');
    // perched (on the awning above, say)
    g.s.perched = { x: p.x, z: p.z, y: 2.2 };
    expect(g.promptKind()).not.toBe('market');
    g.E();
    expect(g.s.carry.mouth.held).toBe(null);
    g.s.perched = null;
    // swimming
    g.r.player.swimming = true;
    g.frame();
    expect(g.promptKind()).not.toBe('market');
    g.E();
    expect(g.s.carry.mouth.held).toBe(null);
    g.r.player.swimming = false;
    g.frame();
    expect(g.promptKind()).toBe('market');
    // munching: no prompt for the next treat, here or at the café
    g.E();
    expect(g.s.carry.mouth.held?.treat).toBe(true);
    g.frame();
    expect(g.promptKind()).not.toBe('market');
    g.put(cafeSpot());
    expect(g.promptKind()).not.toBe('market');
    g.run(MARKET.HOLD_S + MARKET.MUNCH_S);
    expect(g.promptKind()).toBe('market'); // eaten: the crumbs are on offer
    expect(g.sent()).toEqual([{ v: 1, id: 'me', type: 'carry-pick', itemId: treatItemId('fish') }]);
    g.r.live.dispose();
  }, 60_000);

  it("a Market walk sends carry-pick with the treat's id, and nothing new", () => {
    const g = game();
    // a sock in her mouth to begin with
    g.put({ x: SOCK.x, z: SOCK.z + 0.2 });
    g.E();
    g.frame();
    g.s.net.sendEvent.mockClear();
    // the fishmonger sees her coming: a shoo
    g.r.setPhase('fish', 'serve', 0.3);
    g.put(reachSpot('fish'));
    g.E();
    g.run(MARKET.SHOO_S + MARKET.SHOO_REST_S);
    // she stands still in front of the counter: a coo
    const still = g.r.local('fish', 0, S('fish').d / 2 + 1.5);
    g.r.setPhase('fish', 'serve', 0.3);
    g.put(still);
    g.run(MARKET.STILL_S + 0.5);
    // the baker turned away: the sock goes down and the sausage roll in, munched, eaten
    g.r.setPhase('baker', 'away', 0.2);
    g.put(reachSpot('baker'));
    g.E();
    g.run(MARKET.HOLD_S + MARKET.MUNCH_S + 0.2);
    // the café's crumbs
    g.put(cafeSpot());
    g.E();
    g.run(MARKET.HOLD_S + MARKET.MUNCH_S + 0.2);
    const types = g.r.events.map((e) => e.type);
    for (const t of ['shoo', 'coo', 'grab', 'eat']) expect(types, t).toContain(t);
    const sent = g.sent();
    expect(sent).toEqual([
      { v: 1, id: 'me', type: 'carry-drop', itemId: SOCK.id, pos: sent[0].pos },
      { v: 1, id: 'me', type: 'carry-pick', itemId: treatItemId('baker') },
      { v: 1, id: 'me', type: 'carry-pick', itemId: treatItemId('cafe') },
    ]);
    for (const e of sent) {
      expect(Object.keys(e).sort(), e.type).toEqual(e.type === 'carry-drop' ? ['id', 'itemId', 'pos', 'type', 'v'] : ['id', 'itemId', 'type', 'v']);
    }
    g.r.live.dispose();
  }, 90_000);

  it('a non-Market walk has NO_MARKET: no prompt, no tally tile', async () => {
    // the prompt ladder and E with NO_MARKET where the life would be
    {
      const g = game();
      g.r.setPhase('fish', 'away', 0.2);
      g.put(reachSpot('fish'));
      g.s.market = NO_MARKET;
      expect(g.promptKind()).not.toBe('market');
      g.E();
      expect(g.s.carry.mouth.held).toBe(null);
      expect(g.sent()).toEqual([]);
      g.r.live.dispose();
    }
    // a whole walk somewhere else
    await inAWalk(async ({ l }) => {
      setMarket(false);
      await l.w.beginWalkFromHomebase({ duskMode: false });
      const s = l.getSession();
      expect(s.areaId).toBe('neighborhood');
      expect(s.market).toBe(NO_MARKET);
      expect(s.market.actionFor(s)).toBe(null);
      l.w.endWalk();
      expect(l.overlay.innerHTML).toContain('summary-stats');
      expect(l.overlay.innerHTML).not.toContain('😋');
      expect(l.overlay.innerHTML).not.toContain('>treats<');
    });
  }, 90_000);

  it('the summary shows the treats tile on a Market walk only, and is unchanged elsewhere', async () => {
    // today's tiles, byte for byte
    const TODAY = '<div class="summary-stats"><div class="stat"><span class="stat-emoji" aria-hidden="true"><span class="paw" aria-hidden="true">🐾</span></span><span class="stat-value" data-count="42">42</span><span class="stat-label">paw points</span></div><div class="stat"><span class="stat-emoji" aria-hidden="true">🔍</span><span class="stat-value" data-count="7">7</span><span class="stat-label">discoveries</span></div><div class="stat"><span class="stat-emoji" aria-hidden="true">😺</span><span class="stat-value" data-count="2">2</span><span class="stat-label">cats greeted</span></div><div class="stat"><span class="stat-emoji" aria-hidden="true">⭐</span><span class="stat-value" data-count="1" data-suffix="/3">1/3</span><span class="stat-label">goals done</span></div></div>';
    const TODAY_DEN = '<div class="summary-stats"><div class="stat"><span class="stat-emoji" aria-hidden="true"><span class="paw" aria-hidden="true">🐾</span></span><span class="stat-value" data-count="0">0</span><span class="stat-label">paw points</span></div><div class="stat"><span class="stat-emoji" aria-hidden="true">🔍</span><span class="stat-value" data-count="0">0</span><span class="stat-label">discoveries</span></div><div class="stat"><span class="stat-emoji" aria-hidden="true">😺</span><span class="stat-value" data-count="0">0</span><span class="stat-label">cats greeted</span></div></div>';
    const args = { earned: 42, discoveries: 7, friendsGreeted: 2, goalsDone: 1, hasGoals: true };
    expect(summaryStatsHtml(args)).toBe(TODAY);
    expect(summaryStatsHtml({ ...args, treats: undefined })).toBe(TODAY);
    expect(summaryStatsHtml({ ...args, treats: null })).toBe(TODAY); // NO_MARKET's tally
    expect(summaryStatsHtml({ earned: 0, discoveries: 0, friendsGreeted: 0, goalsDone: 0, hasGoals: false })).toBe(TODAY_DEN);
    // with a tally: one more tile, after the cats greeted and before the goals
    const withTreats = summaryStatsHtml({ ...args, treats: 3 });
    expect(withTreats).toContain('3');
    expect(withTreats).toContain('treats');
    expect(withTreats).toBe(TODAY.replace('<div class="stat"><span class="stat-emoji" aria-hidden="true">⭐', `${tileOf('😋', 3, 'treats')}<div class="stat"><span class="stat-emoji" aria-hidden="true">⭐`));
    expect(summaryStatsHtml({ ...args, treats: 0 })).toContain(tileOf('😋', 0, 'treats'));
    // a Market walk's summary has it, at 0 when nothing was eaten
    await inAWalk(async ({ l }) => {
      setMarket(true);
      await l.w.beginWalkFromHomebase({ duskMode: false });
      expect(l.getSession().areaId).toBe('market');
      l.w.endWalk();
      expect(l.overlay.innerHTML).toContain(tileOf('😋', 0, 'treats'));
    });
  }, 90_000);
});

// one stat tile, as screencards.js draws it
function tileOf(emoji, v, label) {
  return `<div class="stat"><span class="stat-emoji" aria-hidden="true">${emoji}</span><span class="stat-value" data-count="${v}">${v}</span><span class="stat-label">${label}</span></div>`;
}

// A real walk (walk.js's lifecycle, as test/marketgame.test.js boots it) with a
// real discovery log, and the page, the clock and Math.random as that file
// holds them; the world tests' canvas stub is put back after.
const walkAreas = createAreaLoader();
async function inAWalk(body) {
  await walkAreas.ensureAll(['park', 'neighborhood', 'market']);
  const before = globalThis.document;
  globalThis.document = { body: fakeEl(), createElement: fakeEl, getElementById: () => null, addEventListener() {}, removeEventListener() {} };
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-21T15:00:00Z') });
  const stream = mulberry32(20261121);
  const random = vi.spyOn(Math, 'random').mockImplementation(() => stream());
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const l = lifecycle({ areas: walkAreas, realLog: true });
  try {
    await body({ l, areas: walkAreas });
  } finally {
    if (l.getSession()) l.w.endWalk();
    setMarket(null);
    random.mockRestore();
    warn.mockRestore();
    vi.useRealTimers();
    globalThis.document = before;
  }
}
