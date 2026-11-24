import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

// Teleport gates, milestone 0 (docs/superpowers/plans/2026-11-23-teleport-gates.md): the spike pair, Park <-> Greenhouse,
// behind ?gates=1. The gate table, where the gates stand, what each says when she walks up to it, the pure handoff, the
// swirl's timing and the reduced-motion fade, the words in both sets, the look's budget. The whole walk through and back
// is test/telegates.walk.test.js.

const { teleKit } = await import('./helpers/tele.js');
const { setTele, teleOn } = await import('../src/teleflag.js');
const { setGreenhouse } = await import('../src/greenhouseflag.js');
const { GATEWAY_ENDS, GATE_REACH, GATE_PREFETCH_REACH, ARRIVE_IN, GATE_LOOKS, gatewayEnd, endById, arrivalFor, liveEndsFor } = await import('../src/gateways.js');
const { GATEWAYS } = await import('../src/worldmap.js');
const { CATALOG, createProgression } = await import('../src/progression.js');
const { memStorage } = await import('./helpers/walkharness.js');
const { phrase } = await import('../src/clanphrases.js');
const { withOffWords, bannedIn } = await import('./helpers/offwords.js');
const { isWalkableAt } = await import('../src/player.js');
const { floodFrom } = await import('./helpers/flood.js');
const { GOLD_MICE } = await import('../src/goldmice.js');
const { setGrow } = await import('../src/grow.js');
const park = await import('../src/world/park.js');
const greenhouse = await import('../src/world/greenhouse.js');
const { GREENHOUSE_SPAWN } = await import('../src/world/greenhouseplan.js');
const { COOP_READY } = await import('../src/coop/table.js');
const T = await import('../src/teleport.js');
const UI = await import('../src/teleui.js');
const { LOOK_BUDGET, buildTeleGate, addTeleGates, STONE_COLLIDER_R } = await import('../src/world/telegate.js');

await teleKit();
const { TELE_ENDS, teleEnds, teleRow, liveTeleEnds, teleNear, teleStatus, planFor, teleHandoff, swirlMs, prompt, walkOn } = T;
const ALL = Object.values(TELE_ENDS).flat();
const PG = TELE_ENDS.park[0];
const GP = TELE_ENDS.greenhouse[0];
const newSave = () => {
  const p = createProgression(memStorage());
  p.setTutorialFirst('done');
  return p;
};

beforeEach(() => { setTele(true); setGreenhouse(true); });
afterEach(() => { setTele(null); setGreenhouse(null); });

describe('the gate table', () => {
  it('is one pair, Park <-> Greenhouse, in the stone-ring look, each end the other\'s twin', () => {
    expect(Object.keys(TELE_ENDS)).toEqual(['park', 'greenhouse']);
    expect(ALL.map((e) => e.id)).toEqual(['park-greenhouse', 'greenhouse-park']);
    expect(PG.twin).toBe(GP.id);
    expect(GP.twin).toBe(PG.id);
    expect(PG.to).toBe('greenhouse');
    expect(GP.to).toBe('park');
    expect(new Set(ALL.map((e) => e.id)).size).toBe(ALL.length);
    for (const e of ALL) {
      expect(e.kind, e.id).toBe('tele');
      expect(e.look, e.id).toBe('stonering');
      expect(e.placement, e.id).toBe('inside');
      expect(e.edition, e.id).toBe('all'); // both editions
      expect(e.suit, e.id).toBeNull();
      expect(e.wake, e.id).toBe(false);
      expect(e.needWalks, e.id).toBe(0);
      expect(e.gateway, e.id).toBe('tele-park-greenhouse');
      expect(Object.isFrozen(e), e.id).toBe(true);
    }
    expect(Object.isFrozen(TELE_ENDS) && Object.isFrozen(TELE_ENDS.park)).toBe(true);
    // the two places are not neighbours: no map road joins them
    expect(GATEWAYS.some((g) => [g.from, g.to].sort().join() === 'greenhouse,park')).toBe(false);
    expect(GATEWAYS.some((g) => g.id === PG.gateway)).toBe(false);
    expect(ALL.length / 2).toBeLessThanOrEqual(T.TELE_PAIR_CAP);
  });

  it('every end has a twin that points back, in the place it leads to; both ways', () => {
    for (const a of Object.keys(TELE_ENDS)) {
      for (const e of TELE_ENDS[a]) {
        const hit = endById(e.twin, TELE_ENDS);
        expect(hit, e.id).not.toBeNull();
        expect(hit.areaId, e.id).toBe(e.to);
        expect(hit.end.twin, e.id).toBe(e.id);
        expect(hit.end.to, e.id).toBe(a);
      }
    }
  });

  it('she arrives at the twin\'s own spot, 3.6 m from its gate, facing it (the camera stands 4.4 m behind her: facing away it would sit inside the stones)', () => {
    expect(arrivalFor(PG.id, TELE_ENDS)).toEqual({ areaId: 'greenhouse', x: -6.4, z: 29, yaw: Math.PI / 2 });
    expect(arrivalFor(GP.id, TELE_ENDS)).toEqual({ areaId: 'park', x: -6.4, z: 44, yaw: Math.PI / 2 });
    for (const e of ALL) {
      const a = e.arrive;
      expect(Math.hypot(a.x - e.x, a.z - e.z), e.id).toBeCloseTo(ARRIVE_IN, 9);
      // she stands east of a gate she walked through heading west, and faces west, toward it: rotation.y +pi/2 turns -z toward -x
      expect(e.faces).toBe('west');
      expect(a.yaw).toBe(Math.PI / 2);
      expect(a.x).toBeGreaterThan(e.x);
    }
  });

  it('a tele row is checked and defaulted by teleRow, and every map row is as it was', () => {
    const ok = { id: 'x', gateway: 'g', x: 0, z: 0, faces: 'west', to: 'park', twin: 'y', look: 'stonering', placement: 'inside', arrive: { x: 3.6, z: 0, yaw: 0 } };
    expect(teleRow(ok)).toMatchObject({ kind: 'tele', suit: null, wake: false, edition: 'canon', needWalks: 0 });
    expect(teleRow({ ...ok, suit: 'space', wake: true, edition: 'all', needWalks: 2 })).toMatchObject({ suit: 'space', wake: true, edition: 'all', needWalks: 2 });
    for (const bad of [
      { suit: 'moon' }, { edition: 'both' }, { needWalks: -1 }, { needWalks: 1.5 }, { look: 'signpost' }, { look: 'arch' },
      { placement: 'edge' }, { arrive: null },
    ]) expect(() => teleRow({ ...ok, ...bad }), JSON.stringify(bad)).toThrow(/tele gate x/);
    for (const look of ['stonering', 'archway', 'hollow']) expect(GATE_LOOKS).toContain(look);
    // none of the eighteen map rows gained a key: a teleport gate's fields are its own
    const mapRows = Object.values(GATEWAY_ENDS).flat();
    expect(mapRows).toHaveLength(18);
    for (const e of mapRows) {
      for (const k of ['kind', 'suit', 'wake', 'edition', 'needWalks']) expect(Object.hasOwn(e, k), `${e.id}.${k}`).toBe(false);
      expect(['stonering', 'archway', 'hollow']).not.toContain(e.look);
    }
    // and no map lookup can see a teleport gate
    expect(endById(PG.id)).toBeNull();
    expect(Object.keys(GATEWAY_ENDS)).not.toContain('greenhouse');
    expect(liveEndsFor('park', CATALOG).map((e) => e.id)).not.toContain(PG.id);
    expect(gatewayEnd({ ...ok, look: 'hollow', kind: 'tele' }).kind).toBe('tele'); // the constructor keeps a row's own keys
  });

  it('teleEnds is the table, safe for any place name', () => {
    expect(teleEnds('park')).toEqual([PG]);
    expect(teleEnds('greenhouse')).toEqual([GP]);
    expect(teleEnds('seaside')).toEqual([]);
    expect(teleEnds('__proto__')).toEqual([]);
    expect(teleEnds(7)).toEqual([]);
  });
});

describe('where the gates stand', () => {
  setGrow(false);
  const areas = {
    park: park.build(new THREE.Scene(), {}),
    greenhouse: greenhouse.build(new THREE.Scene(), {}),
  };
  const spawn = { park: park.SPAWN, greenhouse: GREENHOUSE_SPAWN };
  const flood = {};
  const reach = (id) => (flood[id] ??= floodFrom(areas[id], spawn[id], (x, z) => isWalkableAt(areas[id], x, z)));

  for (const [id, e] of [['park', PG], ['greenhouse', GP]]) {
    it(`${e.id}: open lawn, clear of every collider, point of interest and golden mouse, in sight of the spawn`, () => {
      const area = areas[id];
      for (const c of area.colliders) expect(Math.hypot(c.x - e.x, c.z - e.z) - (c.r ?? 0), `collider (${c.x}, ${c.z})`).toBeGreaterThanOrEqual(5);
      const things = [...(area.pois ?? []), ...(area.collectibles ?? []), ...(area.scenics ?? []), ...(area.perches ?? []), ...(GOLD_MICE[id] ?? []), spawn[id]];
      expect(things.length).toBeGreaterThan(3);
      for (const t of things) expect(Math.hypot(t.x - e.x, t.z - e.z), `thing at (${t.x}, ${t.z})`).toBeGreaterThanOrEqual(7);
      expect(Math.hypot(spawn[id].x - e.x, spawn[id].z - e.z)).toBeLessThan(15); // the first thing she sees
    });
    it(`${e.id}: she can walk up to it (within reach, reached on foot from the spawn), and the ring round it is open`, () => {
      const area = areas[id];
      const spots = [];
      for (let dx = -GATE_REACH; dx <= GATE_REACH; dx += 0.1) {
        for (let dz = -GATE_REACH; dz <= GATE_REACH; dz += 0.1) {
          const x = e.x + dx, z = e.z + dz;
          if (Math.hypot(dx, dz) <= GATE_REACH - 0.05 && isWalkableAt(area, x, z) && reach(id).reaches(x, z)) spots.push([x, z]);
        }
      }
      expect(spots.length).toBeGreaterThan(50);
      // the two pillars stand 1.3 m either side along z; the cat is not boxed in by them
      for (let a = 0; a < 16; a++) {
        for (const r of [1, 2, 3]) expect(isWalkableAt(area, e.x + Math.cos(a * Math.PI / 8) * r, e.z + Math.sin(a * Math.PI / 8) * r), `ring ${a} at ${r} m`).toBe(true);
      }
    });
    it(`${e.id}: the spot she lands on is open, reached on foot from the spawn, and out of reach of the gate (no sooner in than asked)`, () => {
      // `e` is the end in THIS place: she lands in front of it when she comes through the other end
      const land = e.arrive;
      expect(isWalkableAt(areas[id], land.x, land.z)).toBe(true);
      expect(reach(id).reaches(land.x, land.z)).toBe(true);
      expect(Math.hypot(land.x - e.x, land.z - e.z)).toBeGreaterThan(GATE_REACH + 1);
      expect(GATE_PREFETCH_REACH).toBeGreaterThan(Math.hypot(land.x - e.x, land.z - e.z)); // the place beyond is already warm on arrival
    });
  }

  it('the two pillars sit 1.3 m either side of the gate, along its width, and are solid', () => {
    const { colliders } = addTeleGates(new THREE.Scene(), [PG]);
    expect(colliders).toHaveLength(2);
    expect(colliders.map((c) => [c.x, c.z]).sort((p, q) => p[1] - q[1])).toEqual([[-10, 42.7], [-10, 45.3]]);
    for (const c of colliders) expect(c.r).toBe(STONE_COLLIDER_R);
    // the pillars leave the middle open: the cat stands in the disc within reach
    for (const c of colliders) expect(Math.hypot(c.x - PG.x, c.z - PG.z) - c.r).toBeGreaterThan(0.9);
  });
});

describe('a gate is live only behind its switch', () => {
  it('?gates=1 (read at call time) and the place beyond: Park needs the Greenhouse\'s own switch too', () => {
    setTele(null); // the address bar: no ?gates=1 in a test
    expect(teleOn()).toBe(false);
    expect(liveTeleEnds('park', CATALOG)).toEqual([]);
    expect(liveTeleEnds('greenhouse', CATALOG)).toEqual([]);
    setTele(true);
    expect(liveTeleEnds('park', CATALOG)).toEqual([PG]);
    expect(liveTeleEnds('greenhouse', CATALOG)).toEqual([GP]); // the Park has a catalog row
    setGreenhouse(false);
    expect(liveTeleEnds('park', CATALOG)).toEqual([]); // the Greenhouse has none until its milestone 4
    expect(liveTeleEnds('greenhouse', CATALOG)).toEqual([GP]);
    expect(liveTeleEnds('seaside', CATALOG)).toEqual([]);
  });
  it('either edition (the rows say all); a row that says canon would stand in the main edition only', () => {
    expect(liveTeleEnds('park', CATALOG, { clan: false })).toEqual([PG]);
    expect(liveTeleEnds('park', CATALOG, { clan: true })).toEqual([PG]);
  });
  it('teleNear finds the gate within reach, and the nearest one; nothing for a bad place or position', () => {
    expect(teleNear('park', PG.x + 1.5, PG.z, CATALOG)).toBe(PG);
    expect(teleNear('park', PG.x + 1.7, PG.z, CATALOG)).toBeNull();
    expect(teleNear('park', NaN, 0, CATALOG)).toBeNull();
    expect(teleNear('seaside', PG.x, PG.z, CATALOG)).toBeNull();
    setTele(false);
    expect(teleNear('park', PG.x, PG.z, CATALOG)).toBeNull();
  });
  it('the Greenhouse has a name here, since it has none in the catalog', () => {
    expect(T.teleName('greenhouse', 'canon', CATALOG)).toBe('The Greenhouse');
    expect(T.teleName('park', 'canon', CATALOG)).toBe(CATALOG.areas.park.name);
  });
});

describe('what a gate says (teleStatus)', () => {
  const state = (walks = {}) => ({ edition: 'canon', walks });
  it('go: awake, solo, no couch', () => {
    expect(teleStatus(PG, state(), CATALOG)).toEqual({ kind: 'go', to: 'greenhouse', name: 'The Greenhouse', lineId: null });
    expect(teleStatus(GP, state(), CATALOG).kind).toBe('go');
  });
  it('dormant: until the host place has been walked needWalks times (0 for the spike: always awake)', () => {
    const late = { ...PG, needWalks: 2 };
    expect(teleStatus(late, state({ park: 1 }), CATALOG).kind).toBe('dormant');
    expect(teleStatus(late, state({ park: 2 }), CATALOG).kind).toBe('go');
    expect(teleStatus(late, null, CATALOG).kind).toBe('dormant');
    expect(teleStatus({ ...GP, needWalks: 1 }, state({ park: 5 }), CATALOG).kind).toBe('dormant'); // counted on the host (greenhouse) side
    expect(teleStatus({ ...GP, needWalks: 1 }, state({ greenhouse: 1 }), CATALOG).kind).toBe('go');
  });
  it('room: refused with a kind line in an online room, either end', () => {
    for (const e of ALL) expect(teleStatus(e, state(), CATALOG, { inRoom: true })).toMatchObject({ kind: 'room', lineId: 'tele.room' });
  });
  it('coop: couch play stays out of the gate while the destination\'s (or the host\'s) COOP_READY row is false', () => {
    expect(COOP_READY.park).toBe(false);
    expect(COOP_READY.greenhouse).toBe(false);
    expect(teleStatus(PG, state(), CATALOG, { couch: true })).toMatchObject({ kind: 'coop', lineId: 'tele.coop' });
    expect(teleStatus(GP, state(), CATALOG, { couch: true })).toMatchObject({ kind: 'coop', lineId: 'tele.coop' });
  });
  it('coop: it opens once both places\' rows are true (the host\'s teleKit hands the table in)', async () => {
    await teleKit({ coopReady: (id) => id === 'park' || id === 'greenhouse' });
    expect(teleStatus(PG, state(), CATALOG, { couch: true }).kind).toBe('go');
    await teleKit({ coopReady: (id) => id === 'greenhouse' }); // only the destination
    expect(teleStatus(PG, state(), CATALOG, { couch: true }).kind).toBe('coop');
    await teleKit({ coopReady: (id) => id === 'park' }); // only the host
    expect(teleStatus(PG, state(), CATALOG, { couch: true }).kind).toBe('coop');
    await teleKit();
  });
  it('a room is refused before couch play is looked at', () => {
    expect(teleStatus(PG, state(), CATALOG, { inRoom: true, couch: true }).kind).toBe('room');
  });
});

describe('the handoff (pure): the same cat, the same clothes, nothing else carried', () => {
  it('plans the walk on: where she lands, and that she goes from the one place to the other', () => {
    expect(planFor('park-greenhouse')).toMatchObject({ via: 'park-greenhouse', from: 'park', to: 'greenhouse', arrive: { x: -6.4, z: 29, yaw: Math.PI / 2 }, tele: PG });
    expect(planFor('greenhouse-park')).toMatchObject({ via: 'greenhouse-park', from: 'greenhouse', to: 'park', arrive: { x: -6.4, z: 44, yaw: Math.PI / 2 }, tele: GP });
    for (const bad of ['town-park', 'park-farm', 'nope', '', null, 7, undefined]) expect(planFor(bad), String(bad)).toBeNull();
  });
  it('teleHandoff names only the place, the spot, the suit, the move and the room; her save is untouched', () => {
    const p = newSave();
    p.setArea('park');
    const before = JSON.stringify(p.state);
    const h = teleHandoff({ via: PG.id, state: p.state, catalog: CATALOG });
    expect(Object.keys(h).sort()).toEqual(['arrive', 'from', 'keepRoom', 'move', 'seedFrom', 'suit', 'to', 'twin', 'via']);
    expect(h).toMatchObject({ from: 'park', to: 'greenhouse', twin: GP.id, suit: null, keepRoom: false, seedFrom: null });
    // a free, open place for a solo cat is 'take'; the Greenhouse has no catalog row, so buy() refuses it and the
    // walk starts there as an override (test/telegates.walk.test.js): the handoff itself changes nothing
    expect(h.move).toBe('take');
    expect(JSON.stringify(p.state)).toBe(before);
    expect(teleHandoff({ via: 'nope', state: p.state, catalog: CATALOG })).toBeNull();
  });
  it('the way back lands her in the Park as she owns it: set, never bought', () => {
    const p = newSave();
    p.state.unlocked.areas.push('park');
    expect(teleHandoff({ via: GP.id, state: p.state, catalog: CATALOG })).toMatchObject({ from: 'greenhouse', to: 'park', move: 'set' });
  });
  it('a guest never takes a place and a room is kept (milestone 0 refuses a room before it gets here)', () => {
    const p = newSave();
    expect(teleHandoff({ via: GP.id, state: p.state, catalog: CATALOG, guest: true }).move).toBe('override'); // the Park is not hers yet
    p.state.unlocked.areas.push('park');
    expect(teleHandoff({ via: GP.id, state: p.state, catalog: CATALOG, inRoom: true })).toMatchObject({ keepRoom: true, seedFrom: GP.id });
  });
});

describe('the prompt, as the walk reads it every frame', () => {
  const stateOf = (p) => p.state;
  const walkAt = (areaId = 'park') => ({ areaId });
  const calls = () => { const got = []; return { got, prefetch: (id) => got.push(id) }; };

  it('walking up: nothing until within reach; then "E — Go through", a gate prompt with its own card', () => {
    const st = stateOf(newSave());
    const s = walkAt();
    const { prefetch } = calls();
    expect(prompt(s, { x: PG.x + 5, z: PG.z }, st, false, prefetch, true)).toBeNull();
    const p = prompt(s, { x: PG.x + 1.5, z: PG.z }, st, false, prefetch, true);
    expect(p.text).toBe('E — Go through');
    expect(p.prompt.kind).toBe('gate');
    expect(p.prompt.data.end).toBe(PG);
    expect(p.prompt.data.status).toMatchObject({ kind: 'go', to: 'greenhouse', name: 'The Greenhouse' });
    const card = p.prompt.data.card();
    expect(card).toContain('Go through to the Greenhouse?');
    expect(card).toContain('id="btn-cross-yes"');
    expect(card).toContain('id="btn-cross-no"');
    expect(card).toContain('Not now');
  });
  it('the touch pill: hud.setPrompt strips "E — " so the button reads "Go through" (44 px tall via .hud-prompt-btn)', () => {
    const p = prompt(walkAt(), { x: PG.x + 1, z: PG.z }, stateOf(newSave()), false, () => {}, true);
    expect(p.text.replace(/^E\s+—\s+/, '')).toBe('Go through');
  });
  it('the place beyond is fetched once per gate per walk, within 12 m, even while something else holds the prompt', () => {
    const st = stateOf(newSave());
    const s = walkAt();
    const { got, prefetch } = calls();
    expect(prompt(s, { x: PG.x + 12.1, z: PG.z }, st, false, prefetch, true)).toBeNull();
    expect(got).toEqual([]);
    expect(prompt(s, { x: PG.x + 11.9, z: PG.z }, st, false, prefetch, false)).toBeNull(); // not free: no prompt, still warmed
    expect(got).toEqual(['greenhouse']);
    prompt(s, { x: PG.x + 1, z: PG.z }, st, false, prefetch, true);
    prompt(s, { x: PG.x + 1, z: PG.z }, st, false, prefetch, true);
    expect(got).toEqual(['greenhouse']); // once
    const { got: again, prefetch: pf2 } = calls();
    prompt(walkAt(), { x: PG.x + 3, z: PG.z }, st, false, pf2, true); // a new walk fetches again
    expect(again).toEqual(['greenhouse']);
  });
  it('the Greenhouse side warms the Park', () => {
    const { got, prefetch } = calls();
    prompt(walkAt('greenhouse'), { x: GP.x + 4, z: GP.z }, stateOf(newSave()), false, prefetch, true);
    expect(got).toEqual(['park']);
  });
  it('a room: refused with a kind line (a sign, no card), and nothing fetched', () => {
    const { got, prefetch } = calls();
    const p = prompt(walkAt(), { x: PG.x + 1, z: PG.z }, stateOf(newSave()), true, prefetch, true);
    expect(p.prompt.kind).toBe('gate-info');
    expect(p.text).toBe(phrase('tele.room'));
    expect(p.text).toMatch(/not ready for friends/);
    expect(got).toEqual([]);
  });
  it('couch play: closed with a kind line while the destination\'s COOP_READY row is false', async () => {
    await teleKit({ couch: () => true });
    const { got, prefetch } = calls();
    const p = prompt(walkAt(), { x: PG.x + 1, z: PG.z }, stateOf(newSave()), false, prefetch, true);
    expect(p.prompt.kind).toBe('gate-info');
    expect(p.text).toBe(phrase('tele.coop'));
    expect(p.text).toMatch(/Two cats go together when we’re ready!/);
    expect(got).toEqual([]);
    await teleKit();
  });
  it('without ?gates=1, or beside a place with no gate: nothing', () => {
    setTele(false);
    expect(prompt(walkAt(), { x: PG.x, z: PG.z }, stateOf(newSave()), false, () => {}, true)).toBeNull();
    setTele(true);
    expect(prompt(walkAt('seaside'), { x: 0, z: 0 }, stateOf(newSave()), false, () => {}, true)).toBeNull();
  });
});

describe('the swirl: 1.2 s, and a 0.4 s fade under reduced motion', () => {
  it('the timing', () => {
    expect([T.TELE_SWIRL_MS, T.TELE_FADE_MS, T.TELE_SLOW_MS]).toEqual([1200, 400, 1500]);
    expect(swirlMs(false)).toBe(1200);
    expect(swirlMs(true)).toBe(400);
  });

  it('walkOn gives the swirl, how long it shows, the arrival line, and what to do when the place is slow', () => {
    const st = { edition: 'canon' };
    const full = walkOn(PG.id, st, false);
    expect(full.plan.to).toBe('greenhouse');
    expect(full.twin).toBe(GP.id);
    expect(full.ms).toBe(1200);
    expect(full.html).toContain('class="tele-swirl"');
    expect(full.html).toContain('Off to the Greenhouse!');
    expect(full.line).toBe('Take the gate home when you’re ready.');
    expect(full.slowMs).toBe(1500);
    const calm = walkOn(GP.id, st, true);
    expect(calm.ms).toBe(400);
    expect(calm.html).toContain('class="tele-swirl calm"');
    expect(walkOn('park-farm', st, false)).toBeNull();
  });
  it('the CSS: the swirl runs 1.2 s and turns; calm is a 0.4 s fade with nothing turning, by setting and by the system\'s own', () => {
    expect(UI.CSS).toMatch(/\.tele-swirl\{[^}]*animation:tele-grow 1\.2s/);
    expect(UI.CSS).toMatch(/\.tele-turn\{[^}]*animation:tele-spin 1\.2s/);
    expect(UI.CSS).toMatch(/\.tele-swirl\.calm,\.tele-swirl\.calm\.opening\{[^}]*animation:tele-fade \.4s/);
    expect(UI.CSS).toMatch(/\.tele-swirl\.calm \.tele-turn\{animation:none\}/);
    expect(UI.CSS).toMatch(/@media \(prefers-reduced-motion:reduce\)\{[^}]*\.tele-swirl\{[^}]*animation:tele-fade \.4s[^}]*\}[^}]*\.tele-turn\{animation:none\}/);
    // slow and smooth: nothing blinks (no step animations, nothing under half a second except the fade)
    expect(UI.CSS).not.toMatch(/steps\(/);
    expect(UI.CSS).not.toMatch(/infinite/);
  });
  it('"Nearly there!" replaces the line when the place is slow', () => {
    const line = { textContent: 'Off to the Greenhouse!' };
    UI.nearly({ querySelector: (q) => (q === '.tele-line' ? line : null) });
    expect(line.textContent).toBe('Nearly there!');
    expect(() => UI.nearly(null)).not.toThrow();
    expect(() => UI.nearly({ querySelector: () => null })).not.toThrow();
  });
  it('the swirl opens on the arrival: its own screen, gone in under a second', () => {
    vi.useFakeTimers();
    const made = [];
    const swirls = () => made.filter((m) => /tele-swirl/.test(m.className));
    const doc = { createElement: () => { const el = { className: '', attrs: {}, innerHTML: '', setAttribute(k, v) { this.attrs[k] = v; }, remove() { this.gone = true; } }; made.push(el); return el; }, body: { append: (el) => { el.on = true; } }, head: { append() {} } };
    UI.opening({ calm: false, doc });
    UI.opening({ calm: true, doc });
    expect(swirls().map((m) => m.className)).toEqual(['tele-swirl opening', 'tele-swirl opening calm']);
    expect(swirls().every((m) => m.on && m.attrs['aria-hidden'] === 'true')).toBe(true);
    vi.advanceTimersByTime(699);
    expect(swirls().some((m) => m.gone)).toBe(false);
    vi.advanceTimersByTime(1);
    expect(swirls().every((m) => m.gone)).toBe(true);
    expect(() => UI.opening({ doc: {} })).not.toThrow();
    vi.useRealTimers();
  });
});

describe('the words', () => {
  const IDS = Object.keys(UI.LINES);
  const say = (id) => (id === 'tele.prompt' ? phrase(id, 'the Greenhouse') : phrase(id));
  it('every line is in the phrase table once the lazy file has come, and none is empty', () => {
    expect(IDS.sort()).toEqual(['tele.coop', 'tele.go', 'tele.home', 'tele.notnow', 'tele.prompt', 'tele.room', 'tele.slow']);
    for (const id of IDS) expect(say(id), id).toMatch(/\S/);
  });
  it('both word sets say every line, the same, and the everyday set never shows a series word', () => {
    const clan = Object.fromEntries(IDS.map((id) => [id, say(id)]));
    let everyday;
    withOffWords(() => { everyday = Object.fromEntries(IDS.map((id) => [id, say(id)])); });
    expect(everyday).toEqual(clan);
    for (const id of IDS) expect(bannedIn(everyday[id]), id).toBeNull();
    // the card and the swirl, whole
    withOffWords(() => {
      expect(bannedIn(UI.cardHtml({ name: 'The Greenhouse' }))).toBeNull();
      expect(bannedIn(UI.swirlHtml({ name: 'The Greenhouse' }))).toBeNull();
    });
  });
  it('a line is short, kind, and scolds nobody', () => {
    for (const id of IDS) {
      expect(say(id).length, id).toBeLessThanOrEqual(70);
      expect(say(id), id).not.toMatch(/\b(dark|scary|dead|die|hurt|danger|afraid|fall|lost forever|too late|hurry|can't|cannot|no\b)/i);
    }
  });
  it('none of the lines is in the start-up download\'s phrase tables', async () => {
    const { PHRASE_IDS, LATER_PHRASE_IDS } = await import('../src/clanphrases.js');
    for (const id of IDS) expect(PHRASE_IDS.includes(id) || LATER_PHRASE_IDS.includes(id), id).toBe(false);
  });
  it('the card is escaped and its two buttons are the crossing card\'s own', () => {
    const html = UI.cardHtml({ name: 'A <b>Place</b>' });
    expect(html).not.toContain('<b>');
    expect(html.match(/<button /g)).toHaveLength(2);
    expect(html).toMatch(/id="btn-cross-yes"[^>]*>Go through/);
    expect(html).toMatch(/id="btn-cross-no"[^>]*>Not now/);
  });
});

describe('the look: the cheapest placeholder, in the plan\'s budget', () => {
  it('at most 6 meshes, 480 triangles and 1 transparent draw... per look: this one is 3 meshes, 2 of them additive, under 200 triangles', () => {
    const g = buildTeleGate(PG);
    const meshes = [];
    g.traverse((o) => { if (o.isMesh) meshes.push(o); });
    const tris = meshes.reduce((n, m) => n + (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3, 0);
    expect(meshes.length).toBeLessThanOrEqual(LOOK_BUDGET.meshes);
    expect(meshes.length).toBe(3);
    expect(tris).toBeLessThanOrEqual(LOOK_BUDGET.triangles);
    expect(tris).toBeLessThan(200);
    expect(meshes.filter((m) => m.material.transparent)).toHaveLength(2); // the disc and the ground glow (milestone 1's budget draws one)
    expect(g.name).toBe('telegate');
    expect(g.userData.endId).toBe(PG.id);
    expect(g.position.x).toBe(-10);
    expect(g.position.z).toBe(44);
    expect(g.rotation.y).toBeCloseTo(Math.PI / 2, 9); // local -z points west, the way she walks through
    // the disc is light, never a dark hole; the two additive meshes do not cast or merge
    const disc = g.getObjectByName('teleDisc');
    expect(disc.material.color.getHex()).toBe(0xffeeb4);
    for (const n of ['teleDisc', 'teleGlow']) {
      const m = g.getObjectByName(n);
      expect(m.userData.noMerge && m.userData.noCast, n).toBe(true);
    }
  });
});
