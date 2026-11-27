import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

// The Market's six missions (2026-11-27): the pure step machines, where each is, and the first three carried out on a walk.
const E = await import('../src/world/marketerrands.js');
const { ERRAND, ERRAND_IDS, apply, initial, isDone, AWNINGS } = E;
const { createErrands } = await import('../src/world/marketerrandlive.js');
const { createDiscoveryLog } = await import('../src/discoveries.js');
const { MARKET_COLLIDERS, MARKET_COLLECTIBLES, TREAT_STALLS, stallById, MARKET_BOUNDS } = await import('../src/world/marketplan.js');
const { inWatchZone } = await import('../src/marketrules.js');
const { isWalkableAt } = await import('../src/player.js');
const { marketArea } = await import('../src/world/marketplan.js');

const run = (id, evs) => evs.reduce((a, ev) => { const r = apply(id, a.st, ev); return { st: r.st, fx: [...a.fx, r.effect] }; }, { st: initial(id), fx: [] });

describe('where each mission is', () => {
  const spots = [...ERRAND.MOUSE_SPOTS, ERRAND.GLOVE_OWNER, ERRAND.STRAY_SPOT, ERRAND.FISH_HEAD_SPOT];
  it('every spot is free cobbles, clear of solids, zones, hides and golden finds', () => {
    const a = marketArea();
    for (const p of spots) {
      expect(isWalkableAt(a, p.x, p.z), JSON.stringify(p)).toBe(true);
      for (const c of MARKET_COLLIDERS) expect(Math.hypot(p.x - c.x, p.z - c.z) - c.r, JSON.stringify(p)).toBeGreaterThanOrEqual(0.9);
      for (const id of TREAT_STALLS) {
        const s = stallById(id);
        expect(inWatchZone(s, p.x, p.z, false), `${id} ${JSON.stringify(p)}`).toBe(false);
        expect(Math.hypot(p.x - s.hide.x, p.z - s.hide.z)).toBeGreaterThan(1.4);
      }
      for (const c of MARKET_COLLECTIBLES) expect(Math.hypot(p.x - c.x, p.z - c.z)).toBeGreaterThan(1.5);
      expect(p.x).toBeGreaterThan(MARKET_BOUNDS.minX + 1);
      expect(p.x).toBeLessThan(MARKET_BOUNDS.maxX - 1);
    }
  });
  it('the mouse darts further than a bound apart and stays near the cheese stall', () => {
    const s = stallById('cheese');
    for (const p of ERRAND.MOUSE_SPOTS) expect(Math.hypot(p.x - s.at.x, p.z - s.at.z)).toBeLessThan(6);
  });
  it('the awnings are the stalls\' roof perches, one a stall', () => {
    expect(AWNINGS.length).toBe(10); // the ten stalls with a counter (the cafe has none)
    for (const w of AWNINGS) expect(w.y).toBeGreaterThan(1.8);
  });
});

describe('mouse', () => {
  it('darts three times, then goes home; a far cat does nothing', () => {
    const r = run('mouse', [{ kind: 'near', d: 5 }, { kind: 'near', d: 1 }, { kind: 'near', d: 1 }, { kind: 'near', d: 1 }, { kind: 'near', d: 1 }, { kind: 'near', d: 1 }]);
    expect(r.fx).toEqual([null, 'dart', 'dart', 'dart', 'home', null]);
    expect(isDone('mouse', r.st)).toBe(true);
  });
});
describe('glove', () => {
  it('lifted, given to the owner only when near; dropping loses nothing', () => {
    const r = run('glove', [{ kind: 'give', d: 0 }, { kind: 'held', held: true }, { kind: 'give', d: 9 }, { kind: 'held', held: false }, { kind: 'held', held: true }, { kind: 'give', d: 1 }, { kind: 'held', held: false }]);
    expect(r.fx).toEqual([null, 'got', null, 'lost', 'got', 'done', null]);
    expect(isDone('glove', r.st)).toBe(true);
  });
});
describe('pigeons', () => {
  it('three tables, each once; done at the third; nonsense changes nothing', () => {
    const r = run('pigeons', [{ kind: 'flush', table: 1 }, { kind: 'flush', table: 1 }, { kind: 'flush', table: 7 }, { kind: 'flush', table: 0 }, { kind: 'flush', table: 2 }]);
    expect(r.fx).toEqual(['flush', null, null, 'flush', 'done']);
  });
});
describe('bell', () => {
  it('three different awnings inside the run; too slow and it stops', () => {
    const r = run('bell', [{ kind: 'land', roof: 0 }, { kind: 'ring' }, { kind: 'land', roof: 0 }, { kind: 'land', roof: 0 }, { kind: 'land', roof: 3 }, { kind: 'land', roof: 5 }]);
    expect(r.fx).toEqual([null, 'ring', 'land', null, 'land', 'done']);
    const late = run('bell', [{ kind: 'ring' }, { kind: 'tick', dt: ERRAND.BELL_RUN - 1 }, { kind: 'land', roof: 1 }, { kind: 'tick', dt: 2 }, { kind: 'land', roof: 2 }]);
    expect(late.fx).toEqual(['ring', null, 'land', 'late', null]);
  });
});
describe('stray', () => {
  it('seen near, fed only when seen and near', () => {
    const r = run('stray', [{ kind: 'feed', d: 0 }, { kind: 'see', d: 9 }, { kind: 'see', d: 3 }, { kind: 'feed', d: 5 }, { kind: 'feed', d: 1 }]);
    expect(r.fx).toEqual([null, null, 'met', null, 'done']);
  });
});
describe('fiddle', () => {
  it('still and near for SONG_S seconds; moving starts it again', () => {
    let st = initial('fiddle');
    const fx = [];
    const go = (ev) => { const r = apply('fiddle', st, ev); st = r.st; fx.push(r.effect); };
    go({ kind: 'listen', dt: 3, d: 2, speed: 0 });
    go({ kind: 'listen', dt: 1, d: 2, speed: 2 });
    for (let i = 0; i < 7; i++) go({ kind: 'listen', dt: 2, d: 2, speed: 0.1 });
    expect(fx).toEqual(['start', 'broke', 'start', null, null, null, null, null, 'done']);
    expect(isDone('fiddle', st)).toBe(true);
    expect(apply('fiddle', st, { kind: 'listen', dt: 1, d: 99, speed: 9 }).effect).toBe(null);
  });
});
it('every mission has a start record and the table of ids is the six', () => {
  expect(ERRAND_IDS).toEqual(['mouse', 'glove', 'pigeons', 'bell', 'stray', 'fiddle']);
  for (const id of ERRAND_IDS) expect(initial(id)).toBeTruthy();
});

describe('on a walk', () => {
  it('the props are merged meshes with no shadow, a few hundred triangles', () => {
    const scene = new THREE.Scene();
    const e = createErrands({ scene, ground: null, log: null, progression: null });
    const props = [];
    scene.traverse((o) => { if (o.isMesh) props.push(o); });
    expect(props.length).toBeLessThanOrEqual(4);
    let tris = 0;
    for (const m of props) { expect(m.castShadow).toBe(false); expect(m.userData.errand).toBe(true); tris += m.geometry.attributes.position.count / 3; }
    expect(tris).toBeLessThan(1000);
    e.dispose();
  });

  function rig() {
    const scene = new THREE.Scene();
    const awards = [];
    const sightings = [];
    const progression = { addPoints() {}, recordSighting: (p) => sightings.push(p) };
    const log = createDiscoveryLog(progression);
    log.startWalk();
    const errands = createErrands({ scene, ground: null, log, progression });
    return { scene, errands, log, sightings, awards };
  }
  const at = (p) => ({ x: p.x, y: 0, z: p.z });
  it('the mouse is chased home, pays once and counts on its page', () => {
    const { errands, sightings, scene } = rig();
    expect(scene.getObjectByName('marketMouse')).toBeTruthy();
    for (let i = 0; i < 4; i++) { errands.update(0.1, i, at(ERRAND.MOUSE_SPOTS[Math.min(3, i)]), null); for (let k = 0; k < 8; k++) errands.update(0.1, i, at(ERRAND.MOUSE_SPOTS[Math.min(3, i)]), null); }
    for (let k = 0; k < 20; k++) errands.update(0.1, 9, at(ERRAND.MOUSE_SPOTS[3]), null);
    expect(errands.state.mouse.n).toBe(4);
    expect(sightings).toEqual(['mkmouse']);
    expect(scene.getObjectByName('marketMouse').visible).toBe(false);
  });
  it('the glove goes back to the flower seller from her mouth', () => {
    const { errands, sightings } = rig();
    const items = { showAt: (id, x, z) => { items.shown = [id, x, z]; } };
    const session = { carry: { mouth: { held: { id: ERRAND.GLOVE_ID, kind: 'glove' }, grip: 0 }, items } };
    errands.update(0.1, 0, at(ERRAND.MOUSE_SPOTS[0]), session);
    expect(errands.state.glove.stage).toBe(1);
    errands.update(0.1, 1, at(ERRAND.GLOVE_OWNER), session);
    expect(errands.state.glove.stage).toBe(2);
    expect(session.carry.mouth.held).toBe(null);
    expect(items.shown[0]).toBe(ERRAND.GLOVE_ID);
    expect(sightings).toEqual(['mkglove']);
  });
  it('the pigeons fly off their tables one by one', () => {
    const { errands, sightings, scene } = rig();
    for (const tb of ERRAND.TABLES) errands.update(0.1, 0, at(tb), null);
    for (let k = 0; k < 20; k++) errands.update(0.1, 1, at(ERRAND.MOUSE_SPOTS[3]), null);
    expect(errands.state.pigeons.bits).toBe(7);
    expect(scene.children.filter((c) => c.name === 'marketErrandPigeon').every((p) => !p.visible)).toBe(true);
    expect(sightings).toEqual(['mkpigeons']);
  });
  it('the bell: three awnings in the run pay; a slow run stops', () => {
    const { errands, sightings } = rig();
    const cat = at(ERRAND.MOUSE_SPOTS[3]);
    errands.bellRung();
    expect(errands.state.bell.t).toBe(0);
    for (let i = 0; i < 3; i++) errands.update(0.1, 0, cat, { perched: { x: AWNINGS[i].x, z: AWNINGS[i].z, y: AWNINGS[i].y } });
    expect(sightings).toEqual(['mkbell']);
    const slow = rig();
    slow.errands.bellRung();
    for (let i = 0; i < 400; i++) slow.errands.update(0.1, i * 0.1, cat, null);
    expect(slow.errands.state.bell.t).toBe(-1);
    expect(slow.sightings).toEqual([]);
  });
  it('the hungry stray: seen, fed the fish head from her mouth, pays once', () => {
    const { errands, sightings, scene } = rig();
    const items = { added: [], addHidden(c) { this.added.push(c.id); return c; }, placeAt(id, x, z) { this.placed = [id, x, z]; }, take(id) { this.taken = id; } };
    const session = { carry: { mouth: { held: null, grip: 0 }, items } };
    errands.update(0.1, 0, at(ERRAND.STRAY_SPOT), session);
    expect(errands.state.stray.stage).toBe(1);
    expect(items.placed[0]).toBe(ERRAND.FISH_HEAD_ID);
    expect(scene.getObjectByName('marketStray')).toBeTruthy();
    errands.update(0.1, 1, at(ERRAND.STRAY_SPOT), session); // empty mouth: not fed
    expect(errands.state.stray.stage).toBe(1);
    session.carry.mouth.held = { id: ERRAND.FISH_HEAD_ID, kind: 'fishhead', job: true };
    errands.update(0.1, 2, at(ERRAND.STRAY_SPOT), session);
    expect(errands.state.stray.stage).toBe(2);
    expect(session.carry.mouth.held).toBe(null);
    expect(items.taken).toBe(ERRAND.FISH_HEAD_ID);
    expect(sightings).toEqual(['mkstray']);
  });
  it('a stray fed on an earlier walk follows her from the start and stays off the props', () => {
    const scene = new THREE.Scene();
    const area = marketArea();
    const progression = { state: { journal: { mkstray: 1 } }, recordSighting() {} };
    const e = createErrands({ scene, ground: null, area, log: null, progression });
    expect(e.state.stray.stage).toBe(2);
    const cat = { x: 0, y: 0, z: 20 };
    for (let i = 0; i < 20; i++) e.update(0.1, i * 0.1, cat, null);
    const stray = scene.getObjectByName('marketStray');
    expect(stray).toBeTruthy();
    expect(Math.hypot(stray.position.x - cat.x, stray.position.z - cat.z)).toBeLessThan(ERRAND.FOLLOW_GAP + 0.6);
    // drag her through the stalls: he is never inside one
    for (let i = 0; i < 400; i++) {
      cat.x = -12 + i * 0.06; cat.z = 3 - i * 0.02;
      e.update(0.05, i * 0.05, cat, null);
      for (const c of MARKET_COLLIDERS) expect(Math.hypot(stray.position.x - c.x, stray.position.z - c.z), `step ${i}`).toBeGreaterThanOrEqual(c.r - 1e-6);
    }
    e.dispose();
  });
  it('the song: still by the fiddler for SONG_S seconds pays; moving starts it again', () => {
    const { errands, sightings } = rig();
    const m = { x: E.musicianSpot.x + 1, y: 0, z: E.musicianSpot.z + 1 };
    for (let i = 0; i < 20; i++) errands.update(0.1, i * 0.1, m, null);
    expect(errands.state.fiddle.secs).toBeGreaterThan(1.5);
    errands.update(0.1, 3, { ...m, x: m.x + 0.1 }, null); // a step at 1 m/s
    expect(errands.state.fiddle.secs).toBe(0);
    for (let i = 0; i < ERRAND.SONG_S * 10 + 5; i++) errands.update(0.1, 5 + i * 0.1, m, null);
    expect(sightings).toEqual(['mkfiddle']);
  });
  it('a walk that already paid a mission finds it finished', () => {
    const scene = new THREE.Scene();
    const log = createDiscoveryLog({ addPoints() {} });
    log.startWalk();
    log.awardOnce('marketjob', 'market-errand-mouse', 'x');
    const e = createErrands({ scene, ground: null, log, progression: null });
    expect(e.state.mouse.n).toBe(4);
    expect(scene.getObjectByName('marketMouse').visible).toBe(false);
  });
});
