import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';
import { memoryStorage } from './helpers/storage.js';

// Couch play M5(b): the Farm. Cat two offers and finishes the jobs a calm cat does from the ground (the
// four givers, the saucer, the scarecrow's hat), scares the grain-store mice out, and finds the eggs, through the
// walk's own rules: the animals stay cat one's (one sim, one trail), nothing is sent anywhere and the save is a
// solo walk's. Real Farm world, animals, jobs, discovery log and progression; the pictures and the pads are M6's.
stubCanvasDocument({ pointerLock: true, measureText: 10 });
const { build } = await import('../src/world/farm.js');
const { createFarmAnimals } = await import('../src/farmanimals.js');
const { handleFarmEvent, addFarmHat, jobKey, findKey } = await import('../src/game/farmplay.js');
const { JOB, FARM_JOB_IDS } = await import('../src/farmjobs.js');
const { createFinds, padText } = await import('../src/coop/finds.js');
const { createMover } = await import('../src/coop/second.js');
const { COOP_READY } = await import('../src/coop/table.js');
const { createProgression } = await import('../src/progression.js');
const { createDiscoveryLog } = await import('../src/discoveries.js');
const { createCarryables } = await import('../src/carryables.js');
const { createMouth } = await import('../src/carry.js');
const { FLAT_GROUND } = await import('../src/ground.js');
const { isWalkableAt } = await import('../src/player.js');
const { setSeriesMode, addWordSet, removeWordSet, seriesModes, SERIES_ON } = await import('../src/wordset.js');
const { withOffWords } = await import('./helpers/offwords.js');

const DT = 1 / 30;
afterEach(() => { setSeriesMode(SERIES_ON); for (const id of seriesModes()) removeWordSet(id); });

function farmWalk() {
  const scene = new THREE.Scene();
  const area = build(scene);
  const progression = createProgression(memoryStorage());
  const log = createDiscoveryLog(progression);
  log.startWalk();
  const toasts = [];
  const hud = { toast: (t) => toasts.push(t) };
  const audio = new Proxy({}, { get: () => () => {} });
  const carry = { mouth: createMouth(), items: createCarryables(scene, []) };
  const catOne = new THREE.Object3D();
  catOne.position.set(area.spawn.x, 0, area.spawn.z);
  const session = { areaId: 'farm', cat: catOne, perched: null, pounceTime: 0, carry, fx: { burst() {} } };
  const seen = new Set();
  const once = (k, t) => { if (!seen.has(k)) { seen.add(k); hud.toast(t); } };
  const farm = createFarmAnimals(scene, area, {
    onEvent: (e) => handleFarmEvent(e, { hud, audio, log, progression, session, once }),
    isFree: (x, z) => isWalkableAt(area, x, z),
  });
  addFarmHat(carry, area);
  Object.assign(session, {
    farm, scene, ground: FLAT_GROUND, areaData: area, collectibleMeshes: new Map(), walk: { carried: 0, carryCap: 5 },
    goldMice: { checkFind: () => null, nearestUnfound: () => null, remove() {} }, scent: null,
  });
  area.collectibles ??= [];
  const pick = { key: 'siamese', breed: 'siamese', name: 'Siamese', look: null };
  const mover = createMover({ ground: FLAT_GROUND, state: progression.state, pick, at: { x: area.spawn.x + 1.5, z: area.spawn.z } });
  const finds = createFinds({ ctx: { progression, log, audio }, drawn: () => new THREE.Group(), pick: () => pick });
  const player = { speed: 0, zooming: false, inWater: false };
  let t = 0;
  const w = { scene, area, progression, log, toasts, session, farm, mover, finds, catOne, t: () => t };
  w.tick = (n = 1) => { for (let i = 0; i < n; i++) { t += DT; farm.update(DT, t, { cat: catOne, player, session }); finds.frame(DT, session, mover, mover.body, false); } };
  w.two = (x, z) => { mover.body.position.set(x, 0, z); };
  w.press = () => finds.interact(session, mover, mover.body);
  w.save = () => JSON.stringify(progression.state);
  return w;
}

describe('couch play M5: the Farm row', () => {
  it('the Farm is ready, with this file green (the Market and the rest still wait)', () => {
    expect(COOP_READY.farm).toBe(true);
  });
});

describe('couch play M5: no stuck spots', () => {
  it('every giver, the saucer\'s door, the scarecrow and the eggs can be reached on foot, from where cat two joins', () => {
    const w = farmWalk();
    const A = w.area.anchors;
    const b = w.area.bounds, step = 0.5;
    const key = (x, z) => `${Math.round(x / step)},${Math.round(z / step)}`;
    const seen = new Set([key(w.area.spawn.x, w.area.spawn.z)]);
    const queue = [[w.area.spawn.x, w.area.spawn.z]];
    while (queue.length) {
      const [x, z] = queue.pop();
      for (const [dx, dz] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
        const nx = x + dx, nz = z + dz;
        if (nx < b.minX || nx > b.maxX || nz < b.minZ || nz > b.maxZ || seen.has(key(nx, nz)) || !isWalkableAt(w.area, nx, nz)) continue;
        seen.add(key(nx, nz));
        queue.push([nx, nz]);
      }
    }
    const reachable = (p, r) => { for (let a = 0; a < 16; a++) for (const k of [0.4, 0.7, 1]) { const x = p.x + Math.sin(a * Math.PI / 8) * r * k, z = p.z + Math.cos(a * Math.PI / 8) * r * k; if (seen.has(key(x, z))) return true; } return false; };
    expect(reachable(A.coopDoor, JOB.OFFER_R)).toBe(true);
    expect(reachable(A.pastureGate, JOB.OFFER_R)).toBe(true);
    expect(reachable(A.farmhouseDoor, JOB.OFFER_R)).toBe(true);
    expect(reachable(A.grainStoreDoor, JOB.OFFER_R)).toBe(true);
    expect(reachable(A.milkingShedDoor, JOB.MILK_R + 1)).toBe(true);
    expect(reachable(A.scarecrow, JOB.SCARECROW_R)).toBe(true);
    expect(reachable(A.tractorNest, JOB.EGGS_R)).toBe(true);
  });
});

describe('couch play M5: cat two takes part in the Farm', () => {
  it('beside a giver X offers the job; the pad\'s own words say so; the job starts and says so', () => {
    const w = farmWalk();
    const A = w.area.anchors;
    w.two(A.coopDoor.x, A.coopDoor.z);
    const r = w.finds.reach(w.session, w.mover, w.mover.body);
    expect(r).toMatchObject({ kind: 'farm', action: { kind: 'offer', job: 'chicks' } });
    expect(r.label.startsWith('⟦interact⟧ ')).toBe(true);
    expect(r.label).not.toMatch(/^⟦interact⟧\s*E\b/);
    expect(w.press()).toMatchObject({ kind: 'farm' });
    expect(w.farm.jobs.state.chicks).toBe('active');
    w.tick(2);
    expect(w.toasts.length).toBeGreaterThan(0); // the job's own start line, shown by the walk's handler
  });

  it('each of the four givers is one X for cat two, and a job already taken on is not offered again', () => {
    const w = farmWalk();
    const A = w.area.anchors;
    for (const [id, at] of [['chicks', A.coopDoor], ['cow', A.pastureGate], ['mice', A.grainStoreDoor], ['goat', A.farmhouseDoor]]) {
      w.two(at.x, at.z);
      w.tick(1);
      expect(w.finds.reach(w.session, w.mover, w.mover.body)).toMatchObject({ kind: 'farm', action: { job: id } });
      w.press(); w.tick(2);
      expect(w.farm.jobs.state[id]).toBe('active');
      expect(w.finds.reach(w.session, w.mover, w.mover.body)?.action?.job).not.toBe(id);
    }
    expect(FARM_JOB_IDS).toHaveLength(4);
  });

  it('the grain-store mice: cat two coming near sends them home, and the job is paid once with cat one nowhere near', () => {
    const w = farmWalk();
    const A = w.area.anchors;
    w.two(A.grainStoreDoor.x, A.grainStoreDoor.z);
    w.press(); w.tick(2);
    for (const m of w.farm.jobs.mice) { w.two(m.x, m.z); w.tick(1); }
    w.tick(30 * 12);
    expect(w.farm.jobs.state.mice).toBe('done');
    expect(w.log.count(jobKey('mice'))).toBe(1);
  });

  it('the scarecrow\'s hat is tried on and given back, and the find is the household\'s once', () => {
    const w = farmWalk();
    const A = w.area.anchors;
    w.two(A.scarecrowFront.x, A.scarecrowFront.z);
    expect(w.finds.reach(w.session, w.mover, w.mover.body).action.kind).toBe('tryhat');
    w.press(); w.tick(2);
    expect(w.farm.jobs.scarecrow.worn).toBe(true);
    expect(w.finds.reach(w.session, w.mover, w.mover.body).action.kind).toBe('hatback');
    w.press(); w.tick(2);
    expect(w.farm.jobs.scarecrow.worn).toBe(false);
    expect(w.log.count(findKey('scarecrow'))).toBe(1);
  });

  it('the eggs: found at the nest by walking up, no button', () => {
    const w = farmWalk();
    const A = w.area.anchors;
    w.two(A.tractorNest.x + 0.5, A.tractorNest.z);
    w.tick(3);
    expect(w.log.count(findKey('eggs'))).toBe(1);
  });
});

describe('couch play M5: shared goals count once, and the save is a solo walk\'s', () => {
  const doIt = (who) => {
    const w = farmWalk();
    const A = w.area.anchors;
    const at = (p) => {
      if (who === 'two') w.two(p.x, p.z);
      else { w.catOne.position.set(p.x, 0, p.z); }
      w.tick(2);
    };
    const press = () => {
      if (who === 'two') w.press();
      else { const a = w.farm.actionFor(); if (a) w.farm.act(a); }
      w.tick(2);
    };
    at(A.scarecrowFront); press();
    at(A.tractorNest); w.tick(3);
    at(A.grainStoreDoor); press();
    return w;
  };

  it('cat two making the finds and the offer writes the same save as cat one making them', () => {
    expect(doIt('two').save()).toBe(doIt('one').save());
  });

  it('both cats at the eggs and the hat: one find each, paid once', () => {
    const w = farmWalk();
    const A = w.area.anchors;
    w.catOne.position.set(A.tractorNest.x, 0, A.tractorNest.z);
    w.two(A.tractorNest.x + 0.4, A.tractorNest.z);
    w.tick(5);
    expect(w.log.count(findKey('eggs'))).toBe(1);
    const before = w.save();
    w.tick(60);
    expect(w.save()).toBe(before);
  });

  it('the Farm keeps no key of its own for couch play: nothing new in the save', () => {
    const w = farmWalk();
    const keys = Object.keys(w.progression.state);
    const A = w.area.anchors;
    w.two(A.scarecrowFront.x, A.scarecrowFront.z); w.press(); w.tick(2);
    expect(Object.keys(w.progression.state)).toEqual(keys);
  });
});

describe('couch play M5: the Farm\'s words are in both sets', () => {
  it('every prompt cat two can be shown reads in the pad\'s words, in the Warrior set and the everyday set', () => {
    const lines = () => {
      const w = farmWalk();
      const A = w.area.anchors;
      const out = [];
      for (const at of [A.coopDoor, A.pastureGate, A.farmhouseDoor, A.grainStoreDoor, A.scarecrowFront]) {
        w.two(at.x, at.z);
        out.push(w.finds.reach(w.session, w.mover, w.mover.body)?.label);
      }
      return out;
    };
    for (const l of lines()) expect(l).toMatch(/^⟦interact⟧ \S/);
    withOffWords(() => { for (const l of lines()) expect(l).toMatch(/^⟦interact⟧ \S/); });
    expect(padText('E — help the hen')).toBe('⟦interact⟧ help the hen');
    expect(padText('Let the cow follow')).toBe('⟦interact⟧ Let the cow follow');
    expect(padText(null)).toBeNull();
  });
});
