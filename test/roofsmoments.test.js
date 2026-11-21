import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { createProgression } from '../src/progression.js';
import { createDiscoveryLog } from '../src/discoveries.js';
import { bus } from '../src/events.js';
import { createRoofsMoments } from '../src/world/roofsmoments.js';
import { createRoofsLife } from '../src/roofslife.js';
import { ROOFS_DISCOVERIES, ROOFS_PERCHES, TELESCOPE_CRATE, ROOFS_GROUND } from '../src/world/roofsplan.js';
import { createGround } from '../src/ground.js';

// The moments the Rooftops' six finds start (src/world/roofsmoments.js): where
// she is, every frame, against R3's rules; a find not yet seen this walk is
// noted on her save (roofsfinds.js noteRoofsFind) and its moment begins.
const mem = () => {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
};
const area = { anchors: { discoveries: ROOFS_DISCOVERIES } };
const session = () => ({ perched: null, rest: null, traversal: { busy: false } });
const LOFT = ROOFS_DISCOVERIES.loft;
const onLoft = () => new THREE.Vector3(LOFT.x, LOFT.y, LOFT.z);
const offLoft = () => new THREE.Vector3(LOFT.x + 8, LOFT.y, LOFT.z);
function save() {
  const progression = createProgression(mem());
  const log = createDiscoveryLog(progression);
  log.startWalk();
  return { progression, log };
}
// `frames` frames of 1/30 s with her at `pos`
function run(m, pos, frames, s = session(), camera = null) {
  for (let i = 0; i < frames; i++) m.update(1 / 30, pos, camera, s);
}
const discoveries = (spy) => spy.mock.calls.filter((c) => c[0] === 'discovery');

afterEach(() => vi.restoreAllMocks());

describe('the Rooftops\' moments: noting a find', () => {
  it('walking onto the loft writes its page once a walk', () => {
    const { progression, log } = save();
    const spy = vi.spyOn(bus, 'emit');
    const m = createRoofsMoments(area, { log, progression, hud: null });
    run(m, offLoft(), 10);
    expect(progression.state.journal.roofloft ?? 0).toBe(0);
    run(m, onLoft(), 10);
    expect(progression.state.journal.roofloft).toBe(1);
    expect(progression.state.points).toBe(12);
    expect(discoveries(spy)).toHaveLength(1);
    run(m, offLoft(), 10);
    run(m, onLoft(), 10);
    expect(progression.state.journal.roofloft).toBe(1);
    expect(progression.state.points).toBe(12);
    expect(discoveries(spy)).toHaveLength(1);
    m.dispose();
    // the next walk counts the page again, and pays and says nothing
    log.startWalk();
    const m2 = createRoofsMoments(area, { log, progression });
    run(m2, onLoft(), 10);
    expect(progression.state.journal.roofloft).toBe(2);
    expect(progression.state.points).toBe(12);
    expect(discoveries(spy)).toHaveLength(1);
    m2.dispose();
  });

  it('a resumed walk pays and counts nothing twice', () => {
    const { progression, log } = save();
    const spy = vi.spyOn(bus, 'emit');
    const m = createRoofsMoments(area, { log, progression });
    run(m, onLoft(), 5);
    expect(progression.state.journal.roofloft).toBe(1);
    expect(progression.state.points).toBe(12);
    const kept = log.entries();
    m.dispose();
    // the game closed and opened again: the same walk picked up (walkresume.js)
    log.startWalk();
    log.restore(kept);
    expect(kept).toContainEqual(['roofs-find-loft', 1]);
    const again = createRoofsMoments(area, { log, progression });
    run(again, onLoft(), 30);
    expect(progression.state.journal.roofloft).toBe(1);
    expect(progression.state.points).toBe(12);
    expect(discoveries(spy)).toHaveLength(1);
    again.dispose();
    // and on a save that found it before this walk, the restored key alone holds it
    const other = save();
    other.log.restore([['roofs-find-loft', 1]]);
    const m3 = createRoofsMoments(area, other);
    run(m3, onLoft(), 30);
    expect(other.progression.state.journal.roofloft ?? 0).toBe(0);
    expect(other.progression.state.points).toBe(0);
    m3.dispose();
  });

  it('two players in a room each find it on their own save', () => {
    const a = save();
    const b = save();
    const ma = createRoofsMoments(area, a);
    const mb = createRoofsMoments(area, b);
    for (let i = 0; i < 20; i++) {
      ma.update(1 / 30, onLoft(), null, session());
      mb.update(1 / 30, onLoft(), null, session());
    }
    for (const p of [a, b]) {
      expect(p.progression.state.journal.roofloft).toBe(1);
      expect(p.progression.state.points).toBe(12);
    }
    ma.dispose();
    mb.dispose();
  });

  it('no log, no progression: nothing is noted and nothing throws', () => {
    const spy = vi.spyOn(bus, 'emit');
    const m = createRoofsMoments(area, {});
    expect(() => {
      run(m, onLoft(), 10);
      m.update(1 / 30, null, null, null);
      m.update(1 / 30, onLoft(), null, undefined);
    }).not.toThrow();
    expect(discoveries(spy)).toHaveLength(0);
    m.dispose();
  });

  it('the chimney counts her stillness, and moving starts it again', () => {
    const { progression, log } = save();
    const c = ROOFS_DISCOVERIES.chimney;
    const m = createRoofsMoments(area, { log, progression });
    const here = new THREE.Vector3(c.x, c.y, c.z);
    run(m, here, 40); // 1.33 s
    expect(progression.state.journal.roofchimney ?? 0).toBe(0);
    // a step of 0.3 m: still again from there
    here.x += 0.3;
    run(m, here, 40);
    expect(progression.state.journal.roofchimney ?? 0).toBe(0);
    run(m, here, 10); // past 1.5 s still
    expect(progression.state.journal.roofchimney).toBe(1);
    m.dispose();
  });

  it('the telescope is noted from her session\'s perch', () => {
    const { progression, log } = save();
    const crate = ROOFS_PERCHES.find((p) => p.x === TELESCOPE_CRATE.x && p.z === TELESCOPE_CRATE.z);
    const y = createGround(ROOFS_GROUND).y(crate.x, crate.z) + crate.y;
    const pos = new THREE.Vector3(crate.x, y, crate.z);
    const m = createRoofsMoments(area, { log, progression });
    run(m, pos, 5); // on the crate's spot but not perched (a stand-in)
    expect(progression.state.journal.rooftelescope ?? 0).toBe(0);
    run(m, pos, 5, { ...session(), perched: crate });
    expect(progression.state.journal.rooftelescope).toBe(1);
    m.dispose();
  });
});

describe('the life hands its moments her session', () => {
  const SKY = { skySunset: { top: 0x4a5a8c, horizon: 0xe89a6a }, skyDusk: { top: 0x1f2a52, horizon: 0x8a5a6a } };
  const lifeFor = (ctx) => createRoofsLife({ ...SKY, ...area })({
    scene: { background: null, fog: new THREE.Fog(0, 40, 140) }, sun: { intensity: 0.8 }, fill: { intensity: 0.5 }, ...ctx,
  });

  it('the fifth argument reaches the moments; four arguments still work', () => {
    const { progression, log } = save();
    const life = lifeFor({ log, progression, hud: null });
    life.update(1 / 30, 1000, onLoft(), null); // an older caller: no session
    expect(progression.state.journal.roofloft).toBe(1);
    const crate = ROOFS_PERCHES.find((p) => p.x === TELESCOPE_CRATE.x && p.z === TELESCOPE_CRATE.z);
    const y = createGround(ROOFS_GROUND).y(crate.x, crate.z) + crate.y;
    life.update(1 / 30, 1000, new THREE.Vector3(crate.x, y, crate.z), null, { ...session(), perched: crate });
    expect(progression.state.journal.rooftelescope).toBe(1);
    life.dispose();
  });

  it('a picture page\'s life (no log, no progression) notes nothing', () => {
    const spy = vi.spyOn(bus, 'emit');
    const life = lifeFor({});
    life.update(1 / 30, 1000, onLoft(), null, session());
    expect(discoveries(spy)).toHaveLength(0);
    life.dispose();
  });
});
