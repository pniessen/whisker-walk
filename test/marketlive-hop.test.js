import { describe, it, expect } from 'vitest';
import { marketRig } from './helpers/marketrig.js';

// =============================================================================
// The butcher's sausage string (2026-11-22, Market stalls, Task 5): the one
// treat that hangs. It is taken only by a hop (the pounce's catching window)
// or from the stall's own hook rail; never flat-footed. Every number here comes
// from the plan (marketplan.js) and the rules (marketrules.js).
// =============================================================================

const { stallById, stallClimb, MARKET_PERCHES, toStall, fromStall, TREAT_STALLS, marketArea } = await import('../src/world/marketplan.js');
const { MARKET, inHopWindow } = await import('../src/marketrules.js');
const { isWalkableAt } = await import('../src/player.js');
const { treatItemId } = await import('../src/marketnone.js');
const { canReach, BASE_CLIMB_BUDGET } = await import('../src/climbing.js');
const { TREAT_WORDS } = await import('../src/marketwords.js');
const { handleMarketEvent } = await import('../src/game/marketplay.js');

const DT = 1 / 30;
const ID = 'butcher';
const S = stallById(ID);
const T = S.treat;
const area = marketArea();
const ofType = (r, type) => r.events.filter((e) => e.type === type);

// the walkable point nearest the string within its reach, on the ground
function groundSpot(minD = 0) {
  let best = null;
  for (let dx = -0.8; dx <= 0.8 + 1e-9; dx += 0.02) {
    for (let dz = -0.8; dz <= 0.8 + 1e-9; dz += 0.02) {
      const d = Math.hypot(dx, dz);
      if (d > MARKET.TREAT_REACH || d < minD || !isWalkableAt(area, T.x + dx, T.z + dz)) continue;
      if (!best || d < best.d) best = { x: T.x + dx, z: T.z + dz, d };
    }
  }
  return best;
}
// a rig with the butcher turned away (no shoo), the cat on the ground in reach, the pounce `elapsed` seconds old
function hopRig(elapsed, opts = {}) {
  const r = marketRig(opts);
  r.setPhase(ID, 'away', 0.2);
  const p = opts.at ?? groundSpot();
  r.place(p.x, p.z);
  r.step(DT);
  expect(r.stall(ID).watching).toBe(false);
  r.session.pounceTime = MARKET.POUNCE_S - elapsed;
  return r;
}
const held = (r) => r.session.carry.mouth.held;

describe('the string hangs: the plan', () => {
  it('is a hanging treat, 0.7 to 1.4 m up, and the only one', () => {
    expect(T.hang).toBe(true);
    expect(T.hy).toBeGreaterThanOrEqual(0.7);
    expect(T.hy).toBeLessThanOrEqual(1.4);
    for (const id of TREAT_STALLS) if (id !== ID) expect(stallById(id).treat.hang, id).toBeUndefined();
  });

  it('the rail perch is a crate top, within 0.7 m of the string, one hop from the cobbles, and tagged for this stall', () => {
    const { rail } = stallClimb(ID);
    expect(MARKET_PERCHES).toContain(rail);
    expect(rail).toMatchObject({ kind: 'crate', rail: ID });
    expect(rail.y).toBeGreaterThanOrEqual(T.hy - 0.3);
    expect(Math.hypot(rail.x - T.x, rail.z - T.z)).toBeLessThanOrEqual(0.7);
    let found = false;
    for (let dx = -1.2; dx <= 1.2 && !found; dx += 0.1) {
      for (let dz = -1.2; dz <= 1.2 && !found; dz += 0.1) {
        const q = { x: rail.x + dx, z: rail.z + dz };
        if (isWalkableAt(area, q.x, q.z) && canReach(rail, q, 0, BASE_CLIMB_BUDGET)) found = true;
      }
    }
    expect(found).toBe(true);
    expect(marketArea().perches.find((p) => p.rail === ID)).toMatchObject({ rail: ID });
  });

  it('the hop window is the middle of the 0.3 s pounce, read from its timer', () => {
    expect(MARKET.POUNCE_S).toBe(0.3);
    expect(MARKET.HOP_FROM).toBe(0.07);
    expect(MARKET.HOP_TO).toBe(0.23);
    expect(inHopWindow(0.3 - 0.15)).toBe(true);
    expect(inHopWindow(0.3 - 0.07)).toBe(true);
    expect(inHopWindow(0.3 - 0.23)).toBe(true);
    for (const t of [0, -1, 0.29, 0.01, NaN, undefined]) expect(inHopWindow(t), String(t)).toBe(false);
  });

  it('no cat point within reach of the string is behind its counter or on the keeper side', () => {
    for (let dx = -0.8; dx <= 0.8; dx += 0.05) {
      for (let dz = -0.8; dz <= 0.8; dz += 0.05) {
        if (Math.hypot(dx, dz) > MARKET.TREAT_REACH || !isWalkableAt(area, T.x + dx, T.z + dz)) continue;
        // every walkable spot in reach is in front of the counter's front line
        expect(toStall(S, T.x + dx, T.z + dz).lz, `${dx.toFixed(2)},${dz.toFixed(2)}`).toBeGreaterThanOrEqual(S.d / 2);
      }
    }
  });
});

describe('the hop grab (the riskiest piece)', () => {
  it('(a) flat-footed under the string gets no prompt and no grab, though she stands as near as the stand lets her', () => {
    const r = marketRig();
    r.setPhase(ID, 'away', 0.2);
    const p = groundSpot();
    r.place(p.x, p.z).step(DT);
    expect(r.session.pounceTime ?? 0).toBe(0);
    expect(r.live.actionFor(r.session)).toBeNull();
    expect(r.grab()).toBeNull();
    expect(r.live.act({ kind: 'grab', stall: ID, prompt: '' }, r.session, { dropHeld: r.dropHeld })).toBe(false);
    r.step(DT, 30);
    expect(held(r)).toBeNull();
    expect(r.stall(ID).treatOut).toBe(true);
    r.live.dispose();
  });

  it('(b) a pounce 0.15 s old takes it: the mouth holds market-treat-butcher and a grab is told', () => {
    const r = hopRig(0.15);
    r.step(DT);
    expect(held(r)).toEqual({ id: treatItemId(ID), kind: 'sausages', treat: true });
    expect(r.stall(ID).treatOut).toBe(false);
    expect(r.area.treatMeshes[ID].visible).toBe(false);
    expect(ofType(r, 'grab')).toEqual([{ type: 'grab', stall: ID, hop: true }]); // `hop`: the walk sends the carry-pick for it
    expect(r.stall(ID).refillT).toBeCloseTo(MARKET.REFILL_S - DT, 6); // set at the grab, one frame of refill since
    r.live.dispose();
  });

  it('(c) the same with reduced motion (the check reads the timer, never the drawn lift)', () => {
    const r = hopRig(0.15, { reducedMotion: true });
    r.session.hopLift = 0;
    r.step(DT);
    expect(held(r)?.id).toBe(treatItemId(ID));
    r.live.dispose();
  });

  it('(d) too early, too late, or a metre away: no', () => {
    for (const elapsed of [0.01, 0.05, 0.29, 0.3]) {
      const r = hopRig(elapsed);
      r.step(DT);
      expect(held(r), `${elapsed}`).toBeNull();
      r.live.dispose();
    }
    // a metre off, in the window
    const far = groundSpot(0.9);
    expect(far).toBeNull(); // nothing walkable that far inside the reach; use a point outside it
    const out = fromStall(S, S.hideSide * (S.w / 2 - 0.3), S.d / 2 + 1.6);
    expect(Math.hypot(out.x - T.x, out.z - T.z)).toBeGreaterThan(1.0);
    const r = hopRig(0.15, { at: out });
    r.step(DT);
    expect(held(r)).toBeNull();
    r.live.dispose();
  });

  it('one catch a pounce, however many frames the window lasts', () => {
    const r = hopRig(0.07);
    for (let i = 0; i < 3; i++) { r.session.pounceTime = MARKET.POUNCE_S - 0.1 - i * 0.02; r.step(DT); }
    expect(ofType(r, 'grab')).toHaveLength(1);
    r.live.dispose();
  });

  it('(e) on the hook rail the button grabs; on the lower crates it does nothing', () => {
    const { rail, crate } = stallClimb(ID);
    const r = marketRig();
    r.setPhase(ID, 'away', 0.2);
    r.place(rail.x, rail.z).step(DT);
    r.session.perched = rail;
    const action = r.live.actionFor(r.session);
    expect(action).toEqual({ kind: 'grab', stall: ID, prompt: TREAT_WORDS.sausages.prompt });
    expect(r.live.act(action, r.session, { dropHeld: r.dropHeld })).toBe(true);
    expect(held(r)?.id).toBe(treatItemId(ID));
    r.live.dispose();
    // the lower crates: the stall's own climb stack stands away from the string
    const q = marketRig();
    q.setPhase(ID, 'away', 0.2);
    q.place(rail.x, rail.z).step(DT);
    q.session.perched = crate;
    expect(q.live.actionFor(q.session)).toBeNull();
    expect(q.live.act({ kind: 'grab', stall: ID, prompt: '' }, q.session, {})).toBe(false);
    q.live.dispose();
  });

  it('(f) perched anywhere else, nothing; a perch tagged for another rail, nothing', () => {
    for (const perch of [...MARKET_PERCHES.filter((p) => p.rail !== ID), { ...stallClimb(ID).rail, rail: 'other' }, { ...stallClimb(ID).rail, rail: undefined }]) {
      const r = marketRig();
      r.setPhase(ID, 'away', 0.2);
      r.place(stallClimb(ID).rail.x, stallClimb(ID).rail.z).step(DT);
      r.session.perched = perch;
      expect(r.live.actionFor(r.session), JSON.stringify(perch)).toBeNull();
      expect(r.live.act({ kind: 'grab', stall: ID, prompt: '' }, r.session, {}), JSON.stringify(perch)).toBe(false);
      r.live.dispose();
    }
    // and a perched cat takes no ordinary treat, rail or no rail (the old rule)
    const r = marketRig();
    const fish = stallById('fish');
    r.setPhase('fish', 'away', 0.2);
    const p = fromStall(fish, fish.w / 2 - 0.3, fish.d / 2 + 0.95);
    r.place(p.x, p.z).step(DT);
    expect(r.live.actionFor(r.session)?.stall).toBe('fish');
    r.session.perched = stallClimb(ID).rail;
    expect(r.live.actionFor(r.session)).toBeNull();
    r.live.dispose();
  });

  it('(g) it is eaten, pays by the generic eat event, and is out again after REFILL_S', () => {
    const r = hopRig(0.15);
    r.step(DT);
    r.step(DT, Math.ceil((MARKET.HOLD_S + MARKET.MUNCH_S + 0.2) / DT));
    expect(ofType(r, 'eat')).toEqual([{ type: 'eat', stall: ID, kind: 'sausages', teamWith: null }]);
    expect(r.live.treats).toBe(1); // the walk's tally
    r.step(DT, Math.ceil(MARKET.REFILL_S / DT) + 2);
    expect(r.stall(ID).treatOut).toBe(true);
    expect(r.area.treatMeshes[ID].visible).toBe(true);
    // the log's key is the item id, as for every treat: restore counts it
    r.live.restore({ entries: () => [[treatItemId(ID), 1]] });
    expect(r.live.treats).toBe(1);
    r.live.dispose();
  });

  it("(h) a hop grab goes out as the carry-pick, and the partner's device then shows her munching", () => {
    // the walk's own handler turns the life's events into the send (game/marketplay.js), as interactions.js does for the button
    let aRig;
    const hud = { toast() {} };
    const log = { awardOnce: () => true };
    const a = marketRig({ seed: 9, onEvent: (e) => handleMarketEvent(e, { hud, audio: null, log, session: aRig.session, once: () => {}, every: () => {} }) });
    aRig = a;
    const b = marketRig({ seed: 9 });
    b.session.playerId = 'ben';
    a.setPhase(ID, 'away', 0.2);
    b.setClock(a.clock);
    const p = groundSpot();
    a.place(p.x, p.z);
    const herOnB = b.addRemote('me', p.x, p.z);
    a.step(DT);
    b.step(DT);
    a.session.pounceTime = MARKET.POUNCE_S - 0.15;
    a.step(DT);
    expect(held(a)?.id).toBe(treatItemId(ID));
    const sent = a.session.net.sendEvent.mock.calls.map((c) => c[0]);
    expect(sent).toEqual([{ v: 1, id: 'me', type: 'carry-pick', itemId: treatItemId(ID) }]);
    // the partner's walk hands that very event to remotePick
    expect(b.live.remotePick(herOnB, sent[0].itemId)).toBe(true);
    b.step(DT, 5);
    expect(b.scene.children.some((o) => o.name.startsWith('marketMouth:me:'))).toBe(true);
    expect(ofType(b, 'remote-eat')).toHaveLength(1);
    expect(b.stall(ID).treatOut).toBe(true); // each child keeps her own string
    // the button path (the rail) sends nothing from here: interactions.js sends its own
    for (const r of [a, b]) r.live.dispose();
  });

  it('a shoo in the window: the watching butcher shoos once for the whole pounce, the string stays, no grab', () => {
    const r = marketRig();
    r.setPhase(ID, 'serve', 0.5);
    const p = groundSpot();
    r.place(p.x, p.z).step(DT);
    expect(r.stall(ID).watching).toBe(true);
    // the pounce runs its whole window, frame by frame, as the game counts it down
    r.session.pounceTime = MARKET.POUNCE_S;
    for (let i = 0; i < 12 && r.session.pounceTime > 0; i++) {
      r.step(DT);
      r.session.pounceTime -= DT;
    }
    expect(ofType(r, 'shoo').length).toBe(1);
    expect(r.stall(ID).treatOut).toBe(true);
    expect(held(r)).toBeNull();
    expect(ofType(r, 'grab')).toEqual([]);
    r.live.dispose();
  });

  it('from behind the counter or hopping while carrying: no', () => {
    // a spot behind the counter (the keeper's side) is not walkable, and a hop from it never lands
    const behind = fromStall(S, 0, -S.d / 2 + 0.45);
    expect(isWalkableAt(area, behind.x, behind.z)).toBe(false);
    const r = hopRig(0.15, { at: behind });
    r.step(DT);
    expect(held(r)).toBeNull();
    r.live.dispose();
    // her mouth is full: the hop takes nothing and does not spend the pounce's one catch; once it is empty the same pounce lands
    const q = hopRig(0.15);
    q.session.carry.mouth.held = { id: 'market-treat-fish', kind: 'fishhead', treat: true };
    q.step(DT);
    expect(held(q).id).toBe('market-treat-fish');
    expect(q.stall(ID).treatOut).toBe(true);
    expect(q.session.net.sendEvent).not.toHaveBeenCalled();
    q.session.carry.mouth.held = null;
    q.step(DT);
    expect(held(q)?.id).toBe(treatItemId(ID));
    q.live.dispose();
  });
});
