import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
// marketrig.js stubs the headless canvas every world test uses before any build runs.
import { marketRig, buildSquare } from './helpers/marketrig.js';

const { MARKET_REGISTRATION, stallById, fromStall, MARKET_SPAWN } = await import('../src/world/marketplan.js');
const { treatItemId } = await import('../src/marketnone.js');
const { createTippables } = await import('../src/tippables.js');
const { createKnockables } = await import('../src/knockables.js');
const { CATALOG, createProgression } = await import('../src/progression.js');
const { decideWalkOnHave, walkOnMove, pickOnCrossing } = await import('../src/gatecross.js');
const { planFind, roomFindRoster } = await import('../src/foundwear/rules.js');
const { FIND_KEY } = await import('../src/foundwear/spots/index.js');

// =============================================================================
// Two children in the Market Square together (Market step 4, Task 12, V22).
// A room walks on through the town's south-east gate only together; a guest
// who has not bought the square walks it this once without owning it; each
// child's treats are her own, and only the existing carry-pick reaches the
// other screen (her partner's cat munching); a tip and a knock land the same
// apples and petals on both; and a room's find is the same spot on both.
// Nothing here is a new message or a new field.
// =============================================================================

const DT = 1 / 30;
const fakeStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

describe('a room walks on through the town\'s Market gate together', () => {
  const have = (id, ok = true) => ({ v: 1, id, type: 'walk-on-have', via: 'town-market', ok });
  const ctx = { areaId: 'neighborhood', via: 'town-market', selfId: 'a', remoteIds: ['b', 'c'], catalog: CATALOG, ready: true };

  it('a room walks on into the Market only when every device has it', () => {
    expect(decideWalkOnHave([have('b')], ctx)).toEqual({ kind: 'wait', waiting: ['c'] }); // one not ready: all stay in the town
    expect(decideWalkOnHave([have('b'), have('c', false)], ctx)).toEqual({ kind: 'no', id: 'c' });
    expect(decideWalkOnHave([have('b'), have('c')], { ...ctx, ready: false })).toEqual({ kind: 'wait', waiting: [] });
    expect(decideWalkOnHave([have('b'), have('c')], ctx)).toEqual({ kind: 'go' });
    // and home again through the square's gate, the same way
    const home = { ...ctx, areaId: 'market', via: 'market-town' };
    const back = (id, ok = true) => ({ ...have(id, ok), via: 'market-town' });
    expect(decideWalkOnHave([back('b')], home)).toEqual({ kind: 'wait', waiting: ['c'] });
    expect(decideWalkOnHave([back('b'), back('c')], home)).toEqual({ kind: 'go' });
    // a build without the Market's row has no gate there: nobody goes
    const { market: _m, ...noMarket } = CATALOG.areas;
    expect(decideWalkOnHave([have('b'), have('c')], { ...ctx, catalog: { ...CATALOG, areas: noMarket } })).toEqual({ kind: 'wait', waiting: ['b', 'c'] });
  });

  it('a guest who does not own the Market walks it as an override, and a crossing never buys it', () => {
    const p = createProgression(fakeStorage());
    p.replaceFromPayload({ version: 4, points: 500, walks: { neighborhood: 4 }, unlocked: { areas: ['neighborhood'] } });
    expect(walkOnMove(p.state, CATALOG, 'market', { guest: true })).toBe('override');
    expect(walkOnMove(p.state, CATALOG, 'market')).toBe('override');
    expect(pickOnCrossing(p, CATALOG, 'market')).toBe(false);
    expect(pickOnCrossing(p, CATALOG, 'market', { guest: true })).toBe(false);
    expect(p.state.points).toBe(500);
    expect(p.state.unlocked.areas).not.toContain('market');
    expect(p.state.area).not.toBe('market');
    // an owner walks it as her own place
    p.state.unlocked.areas.push('market');
    expect(walkOnMove(p.state, CATALOG, 'market')).toBe('set');
  });
});

describe('in a room, two screens of one square', () => {
  // a spot in reach of a stall's treat, straight out in front of it (test/marketlive.test.js)
  const reachSpot = (id) => fromStall(stallById(id), stallById(id).w / 2 - 0.3, stallById(id).d / 2 + 0.95);

  it("in a room each child's treats are her own, and only carry-pick crosses the wire", () => {
    const id = 'cheese';
    const SEED = 4242; // the room's seed: both devices run the stall rhythm from it
    const a = marketRig({ seed: SEED }); // her device
    const b = marketRig({ seed: SEED }); // her partner's
    b.session.playerId = 'ben';
    a.setPhase(id, 'away', 0.2);
    b.setClock(a.clock); // one clock: the same seed puts the stall in the same phase
    const p = reachSpot(id);
    a.place(p.x, p.z);
    b.place(MARKET_SPAWN.x, MARKET_SPAWN.z);
    const herOnB = b.addRemote('me', p.x, p.z); // her cat as the partner's screen draws it
    a.addRemote('ben', MARKET_SPAWN.x, MARKET_SPAWN.z); // his, on hers
    a.step(DT);
    b.step(DT);
    expect(b.stall(id).phase).toBe(a.stall(id).phase);
    expect(a.stall(id).watching).toBe(false);
    expect(b.stall(id).watching).toBe(false);
    // her grab takes her treat, on her screen only
    expect(a.grab()).toBe(true);
    expect(a.stall(id).treatOut).toBe(false);
    expect(a.area.treatMeshes[id].visible).toBe(false);
    expect(b.stall(id).treatOut, "the partner's treat is still out").toBe(true);
    expect(b.area.treatMeshes[id].visible).toBe(true);
    // the life itself sends nothing: the grab's one message is the walk's
    // carry-pick (interactions.js), which the partner's device hands to remotePick
    expect(a.session.net.sendEvent).not.toHaveBeenCalled();
    expect(b.live.remotePick(herOnB, treatItemId(id))).toBe(true);
    b.step(DT, 10);
    a.step(DT, 10);
    const munch = b.scene.children.find((o) => o.name.startsWith('marketMouth:me:'));
    expect(munch?.visible, 'her cat munches on the partner\'s screen').toBe(true);
    expect(munch.position.distanceTo(herOnB.group.position)).toBeLessThan(0.8);
    expect(b.session.carry.mouth.held, "nothing in the partner's own mouth").toBeNull();
    expect(b.stall(id).treatOut).toBe(true);
    // and the partner can still take his own
    b.place(p.x, p.z).step(DT);
    expect(b.live.actionFor(b.session)?.stall).toBe(id);
    expect(b.grab()).toBe(true);
    expect(b.stall(id).treatOut).toBe(false);
    for (const r of [a, b]) r.live.dispose();
  }, 60_000);

  // One device's square as the walk builds it: the build, the tippables and
  // knockables the walk makes from it, and the life (area.life).
  function screen() {
    const { scene, area } = buildSquare();
    const session = {
      cat: new THREE.Object3D(),
      rest: null,
      perched: null,
      player: { speed: 0 },
      tippables: createTippables(scene, area.tippables),
      knockables: createKnockables(scene, MARKET_REGISTRATION.propSet.knockables),
      remotes: { list: [] },
    };
    session.cat.position.set(MARKET_SPAWN.x, 0, MARKET_SPAWN.z);
    const life = area.life({ scene, critters: null, log: null, progression: null, people: null, audio: null });
    const frames = (n) => {
      for (let i = 0; i < n; i++) {
        session.tippables.update(DT);
        session.knockables.update(DT);
        life.update(DT, i * DT, session.cat.position, null, session);
      }
    };
    return { scene, area, session, life, frames };
  }
  const appleMatrices = (scr) => {
    const mesh = scr.scene.getObjectByName('marketApples');
    const m = new THREE.Matrix4();
    const out = [];
    for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, m); out.push(...m.elements); }
    return out;
  };
  const petalPoints = (scr) => {
    const mesh = scr.scene.getObjectByName('marketPetals');
    mesh.updateWorldMatrix(true, false);
    const v = new THREE.Vector3();
    const pos = mesh.geometry.attributes.position;
    const out = [];
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld); out.push(v.x, v.y, v.z); }
    return out;
  };

  it('a tip and a knock on one device tip and knock on the other, and the apples and petals land alike', () => {
    const a = screen();
    const b = screen();
    a.frames(2);
    b.frames(2);
    // she paws the apple crate over (interactions.js: tip, then the existing
    // `tip` event); the partner's device runs what netevents.js runs for it
    const crate = a.session.tippables.list.find((e) => e.kind === 'applecrate');
    expect(crate).toBeTruthy();
    expect(a.session.tippables.tip(crate)).toBe(true);
    expect(b.session.tippables.tipById(crate.id)).toBe(true);
    // the partner knocks the flower bucket off the trestle (the existing `knock` event)
    const bucket = b.session.knockables.list.find((k) => k.id === 'market-bucket-1');
    expect(b.session.knockables.knock(bucket)).toBe(true);
    expect(a.session.knockables.knockById('market-bucket-1')).toBe(true);
    a.frames(120);
    b.frames(120);
    for (const scr of [a, b]) {
      expect(scr.session.tippables.list.find((e) => e.id === crate.id).tipped).toBe(true);
      expect(scr.scene.getObjectByName('marketApples').visible).toBe(true);
      expect(scr.scene.getObjectByName('marketPetals').visible).toBe(true);
    }
    const [ma, mb] = [appleMatrices(a), appleMatrices(b)];
    expect(ma.length).toBeGreaterThan(0);
    expect(Math.max(...ma.map((x, i) => Math.abs(x - mb[i]))), 'the apples lie at the same spots').toBeLessThan(1e-9);
    const [pa, pb] = [petalPoints(a), petalPoints(b)];
    expect(pa.length).toBeGreaterThan(0);
    expect(Math.max(...pa.map((x, i) => Math.abs(x - pb[i]))), 'the petals lie at the same spots').toBeLessThan(1e-9);
    for (const scr of [a, b]) scr.life.dispose();
  }, 60_000);

  it("a room's find is the same spot on both devices", () => {
    const room = [{ playerId: 'ana', finds: FIND_KEY }, { playerId: 'ben', finds: FIND_KEY }];
    const spots = new Set();
    for (const seed of [4242, 7, 1234567, 99]) {
      const onA = planFind({ areaId: 'market', seed, roster: roomFindRoster(room, 'ana') });
      const onB = planFind({ areaId: 'market', seed, roster: roomFindRoster(room, 'ben') });
      expect(onA, `seed ${seed}`).toBeTruthy();
      expect(onB).toEqual(onA);
      expect(onA.areaId).toBe('market');
      spots.add(onA.spot.id);
    }
    expect(spots.size, 'different room seeds hide it in different spots').toBeGreaterThan(1);
    // a partner on a build with other finds: no find on either screen
    const mixed = [{ playerId: 'ana', finds: FIND_KEY }, { playerId: 'ben', finds: 'older' }];
    expect(planFind({ areaId: 'market', seed: 4242, roster: roomFindRoster(mixed, 'ana') })).toBeNull();
    expect(planFind({ areaId: 'market', seed: 4242, key: 'older', roster: roomFindRoster(mixed, 'ben', 'older') })).toBeNull();
  });
});
