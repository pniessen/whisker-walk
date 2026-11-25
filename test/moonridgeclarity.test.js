// The Ridge clarity fix (2026-11-25): the Beam Hops moved far from Skip Ridge so the pillars read as THE way up to the Ridge cell. Walked the way the player walks (see moonridge.test.js for
// the rig). The Moon's climbing chains, walked the way the player walks them (the real doPounceOrClimb on the Moon's real area and life, the real perch pick, the real
// badge): Skip Ridge's pillars and the Beam Hops. The bug (owner, 2026-11-25): at the foot of a chain the paw button climbs one stone after another and, on the last
// one, only ever hops to a LOWER stone beside it (the pick prefers the highest perch in reach, drops included) which the next press climbs again: she ping-pongs
// between the top two stones and the button never takes her to the dust. Never stuck: from every perch of the Moon there is a press that puts her back on free dust.
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { createProgression } from '../src/progression.js';
import { createDiscoveryLog } from '../src/discoveries.js';
import { createInteractions } from '../src/game/interactions.js';
import { climbBadge } from '../src/game/tips.js';
import { placeBudget } from '../src/placephysics.js';
import { bestPerch, climbBudget, BASE_CLIMB_BUDGET } from '../src/climbing.js';
import { CAT_RADIUS } from '../src/player.js';
import { mem } from './helpers/lighthouselife.js';

let notes = [];
afterEach(() => { notes = []; vi.doUnmock('../src/world/moonswitch.js'); vi.resetModules(); });

// a fresh Moon (the bound switch on or off), its life, and a press of the paw button through the walk's own code
async function moonRig(boundOn, skills = []) {
  vi.resetModules();
  if (!boundOn) vi.doMock('../src/world/moonswitch.js', () => ({ MOON_BOUND_ON: false }));
  const { bus } = await import('../src/events.js');
  const offBus = bus.on('discovery', (e) => { if (e.type === 'greenhousenote') notes.push(e.key); });
  const P = await import('../src/world/moonplan.js');
  const { build } = await import('../src/world/moon.js');
  const progression = createProgression(mem());
  if (skills.length) progression.state.skills = skills;
  const log = createDiscoveryLog(progression);
  log.startWalk();
  const scene = new THREE.Scene();
  const area = build(scene);
  const life = area.life({ scene, ground: area.ground, audio: null, log, progression, reducedMotion: false, tier: { name: 'high' } });
  const camera = new THREE.PerspectiveCamera();
  const cat = new THREE.Vector3(0, 0, 45);
  const session = {
    areaId: 'moon', areaData: { perches: area.perches }, ground: area.ground, cat: { position: cat, rotation: { y: 0 } }, goals: null,
    perched: null, pounceCooldown: 0, pounceTime: 0, perchHold: null, fx: { burst() {} }, reducedMotion: false,
  };
  const player = { perchY: 0, inputActive: false, speedFactor: 1, halt() {}, pounce() {}, forward: () => ({ x: 0, y: 0, z: -1 }), swimming: false };
  const { doPounceOrClimb } = createInteractions({
    MP: 1, pid: 'me', getCloud: () => null, getPsecret: () => null, getSession: () => session, getIsTouch: () => false,
    player, progression, log, hud: { toast() {} }, audio: { trill() {}, pounceWhoosh() {} }, catVoice() {}, snapPhoto() {}, petNameFor: () => 'x', completeBoop() {},
  });
  let t = 0;
  const frame = () => { t += 1 / 30; life.update(1 / 30, t, cat, camera, session); };
  const put = (x, z, perch = null) => {
    cat.set(x, area.ground.y(x, z) + (perch ? perch.y : 0), z);
    session.perched = perch; player.perchY = perch ? perch.y : 0; session.perchHold = null;
    frame();
  };
  const press = () => { doPounceOrClimb(); frame(); };
  const badge = () => climbBadge(session, player, progression.state);
  return { P, area, life, session, player, cat, put, press, badge, progression, frame, dispose: () => { offBus?.(); life.dispose(); } };
}

// the walk's own free-ground test for a cat standing at (x, z) on the dust
const onFreeDust = (r, x, z) => r.area.colliders.every((c) => Math.hypot(x - c.x, z - c.z) >= c.r + CAT_RADIUS - 0.011)
  && x >= r.P.MOON_BOUNDS.minX && x <= r.P.MOON_BOUNDS.maxX && z >= r.P.MOON_BOUNDS.minZ && z <= r.P.MOON_BOUNDS.maxZ;

// the foot of a perch: just outside its collider, toward the south (where the plain's walk arrives from)
const foot = (r, p, side = [0, 1]) => {
  const col = r.area.colliders.find((c) => c.x === p.x && c.z === p.z) ?? { r: 1 };
  const d = col.r + CAT_RADIUS + 0.02;
  return { x: p.x + side[0] * d, z: p.z + side[1] * d };
};


const SKILLS = [[], ['spring-paws'], ['sure-claws'], ['spring-paws', 'sure-claws']];
const isBeam = (r, s) => !!s && r.P.BEAMS.some((b) => b.x === s.x && b.z === s.z);
const isSkip = (r, s) => !!s && r.P.SKIP.some((b) => b.x === s.x && b.z === s.z);
const hereOnDust = (r, x, z) => { r.put(x, z); };

describe.each([['the bound on', true], ['the bound off', false]])('Ridge clarity, %s', (_name, boundOn) => {
  it('the Beam Hops lie far from Skip Ridge, its cell, its foot marker and the way to them from the lander and the track', async () => {
    const r = await moonRig(boundOn);
    const { P } = r;
    for (const b of P.BEAMS) {
      for (const s of P.SKIP) expect(Math.hypot(b.x - s.x, b.z - s.z), `beam ${b.x},${b.z}`).toBeGreaterThan(40);
      expect(Math.hypot(b.x - P.RIDGE_CELL.x, b.z - P.RIDGE_CELL.z)).toBeGreaterThan(40);
      expect(Math.hypot(b.x - P.RIDGE_MARK.x, b.z - P.RIDGE_MARK.z)).toBeGreaterThan(40);
      // not on the way from the spawn, the lander or the track's near end to the pillars: 15 m clear of that straight line
      const a = P.MOON_SPAWN; const c = P.SKIP[0];
      const t = Math.max(0, Math.min(1, ((b.x - a.x) * (c.x - a.x) + (b.z - a.z) * (c.z - a.z)) / ((c.x - a.x) ** 2 + (c.z - a.z) ** 2)));
      expect(Math.hypot(b.x - (a.x + t * (c.x - a.x)), b.z - (a.z + t * (c.z - a.z)))).toBeGreaterThan(15);
    }
    // nor next to the other courses (the hop lane and board, Earthrise Rock, the ring gates)
    for (const b of P.BEAMS) {
      for (const l of P.ROCK_LEDGES) expect(Math.hypot(b.x - l.x, b.z - l.z)).toBeGreaterThan(30);
      expect(Math.hypot(b.x - P.JUMP_BOARD.x, b.z - P.JUMP_BOARD.z)).toBeGreaterThan(25);
      for (let a = 0; a <= P.JUMP_LANE.len; a += 2) expect(Math.hypot(b.x - (P.JUMP_LANE.x0 + a), b.z - P.JUMP_LANE.z)).toBeGreaterThan(15);
      for (const g of P.RING_GATES) expect(Math.hypot(b.x - g.x, b.z - g.z)).toBeGreaterThan(15);
    }
    r.dispose();
  });

  it('the pillar chain still needs the Moon: the first pillar is above Earth\'s best climb and within the Moon\'s plainest, the top above the Moon\'s best single hop', async () => {
    const r = await moonRig(boundOn);
    const [a, b] = r.P.SKIP;
    expect(a.y).toBeGreaterThan(climbBudget({ skills: ['spring-paws', 'sure-claws'] }).climb);
    expect(a.y).toBeLessThanOrEqual(placeBudget({}, 'moon').climb);
    expect(b.y).toBeGreaterThan(placeBudget({}, 'moon').climb);
    expect(b.y - a.y).toBeLessThanOrEqual(placeBudget({}, 'moon').climb);
    r.dispose();
  });

  it('the old approach: from 6 m south of the first pillar the paw button offers NOTHING (no beam), and from the marker two presses climb to the top, a third (the cell) and one more hop down', async () => {
    const r = await moonRig(boundOn);
    const [a, b] = r.P.SKIP;
    r.put(a.x, a.z + 6);
    expect(r.badge()).not.toBe('up');
    r.press();
    expect(r.session.perched).toBe(null); // press 1 of the old approach: nothing in reach (it used to be Beam 5)
    r.put(r.P.RIDGE_MARK.x, r.P.RIDGE_MARK.z); // she walks the 3.5 m to the glowing marker
    expect(onFreeDust(r, r.cat.x, r.cat.z)).toBe(true);
    expect(r.badge()).toBe('up');
    r.press();
    expect(r.session.perched).toMatchObject({ x: a.x, z: a.z });
    r.press();
    expect(r.session.perched).toMatchObject({ x: b.x, z: b.z });
    r.progression.state.moon = { ...r.progression.state.moon, step: 1 };
    r.life.base.pip.setAwake();
    expect(r.life.promptAt(r.cat)).toBeTruthy();
    r.life.interact();
    expect(r.life.base.state.carrying).toBe(0);
    r.press();
    expect(r.session.perched).toBe(null);
    expect(onFreeDust(r, r.cat.x, r.cat.z)).toBe(true);
    r.dispose();
  });

  it('from the dust south, east and west of the first pillar, in reach of it, the real paw button climbs the first pillar, then the top, and hops down', async () => {
    const r = await moonRig(boundOn);
    const [a, b] = r.P.SKIP;
    for (const [dx, dz] of [[-0.9, 1], [0, 1], [0.9, 1], [1, 0.1], [-1, 0.1], [-1, -0.8], [1, -0.8]]) {
      const n = Math.hypot(dx, dz);
      const f = foot(r, a, [dx / n, dz / n]);
      if (!onFreeDust(r, f.x, f.z)) continue;
      r.put(f.x, f.z);
      r.press();
      expect(r.session.perched, `${dx},${dz} first`).toMatchObject({ x: a.x, z: a.z });
      r.press();
      expect(r.session.perched, `${dx},${dz} top`).toMatchObject({ x: b.x, z: b.z });
      expect(r.badge()).toBe('down');
      r.press();
      expect(r.session.perched).toBe(null);
      expect(onFreeDust(r, r.cat.x, r.cat.z)).toBe(true);
    }
    r.dispose();
  });

  it('from every free spot within 6 m of the first pillar the first thing the paw button offers is never a beam (a pillar, or nothing at all)', async () => {
    const r = await moonRig(boundOn);
    const [a] = r.P.SKIP;
    let tried = 0; let up = 0;
    for (let x = a.x - 6; x <= a.x + 6; x += 0.5) for (let z = a.z - 6; z <= a.z + 6; z += 0.5) {
      if (Math.hypot(x - a.x, z - a.z) > 6 || !onFreeDust(r, x, z) || Math.abs(r.area.ground.y(x, z)) > 0.05) continue;
      r.put(x, z);
      r.press();
      tried++;
      expect(isBeam(r, r.session.perched), `${x},${z}`).toBe(false);
      if (r.session.perched) { up++; expect(isSkip(r, r.session.perched) || r.P.ROCK_LEDGES.some((l) => l.x === r.session.perched.x), `${x},${z}`).toBe(true); }
    }
    expect(tried).toBeGreaterThan(100);
    expect(up).toBeGreaterThan(5);
    r.dispose();
  });

  it('the Beam Hops still work on their own: five presses climb the wave from behind the first beam, the sixth comes down, and the dust it lands on offers no pillar', async () => {
    const r = await moonRig(boundOn);
    const beams = r.P.BEAMS;
    const away = [beams[0].x - beams[1].x, beams[0].z - beams[1].z];
    const al = Math.hypot(...away);
    const f = foot(r, beams[0], [away[0] / al, away[1] / al]);
    r.put(f.x, f.z);
    const stood = [];
    for (let i = 0; i < 5; i++) { r.press(); stood.push(beams.findIndex((q) => q.x === r.session.perched?.x && q.z === r.session.perched?.z)); }
    expect(stood).toEqual([0, 1, 2, 3, 4]);
    r.press();
    expect(r.session.perched).toBe(null);
    r.press();
    expect(isSkip(r, r.session.perched)).toBe(false);
    r.dispose();
  });
});

describe.each([['the bound on', true], ['the bound off', false]])('from every beam the button never offers a pillar, %s', (_name, boundOn) => {
  it.each(SKILLS.map((s) => [s.join('+') || 'no skills', s]))('(%s)', async (_k, skills) => {
    const r = await moonRig(boundOn, skills);
    for (const b of r.P.BEAMS) {
      r.put(b.x, b.z, b);
      for (let g = 0; g < 12 && r.session.perched; g++) { r.press(); expect(isSkip(r, r.session.perched)).toBe(false); }
      expect(r.session.perched).toBe(null);
      r.press();
      expect(isSkip(r, r.session.perched)).toBe(false);
    }
    r.dispose();
  });
});

describe.each([['the bound on', true], ['the bound off', false]])('the foot hint, %s', (_name, boundOn) => {
  const hint = (r) => notes.filter((k) => k === 'moon.ridge.paw').length;
  it('shows once, the first time she is within 8 m of the first pillar on the dust with the Ridge cell still to fetch', async () => {
    const r = await moonRig(boundOn);
    const [a] = r.P.SKIP;
    r.progression.state.moon = { ...r.progression.state.moon, step: 1, cells: 0 };
    r.put(a.x, a.z + 9);
    expect(hint(r)).toBe(0);
    r.put(a.x, a.z + 7.5);
    expect(hint(r)).toBe(1);
    r.put(a.x, a.z + 4); r.put(a.x, a.z + 9); r.put(a.x, a.z + 5);
    expect(hint(r)).toBe(1);
    r.dispose();
  });
  it('stays quiet before Pip wakes, once the Ridge cell is in the Core, and while she is up on a stone', async () => {
    const r1 = await moonRig(boundOn);
    r1.progression.state.moon = { ...r1.progression.state.moon, step: 0, cells: 0 };
    r1.put(r1.P.SKIP[0].x, r1.P.SKIP[0].z + 5);
    expect(hint(r1)).toBe(0);
    r1.dispose();
    const r2 = await moonRig(boundOn);
    r2.progression.state.moon = { ...r2.progression.state.moon, step: 2, cells: 1 };
    r2.put(r2.P.SKIP[0].x, r2.P.SKIP[0].z + 5);
    expect(hint(r2)).toBe(0);
    r2.dispose();
    const r3 = await moonRig(boundOn);
    r3.progression.state.moon = { ...r3.progression.state.moon, step: 1, cells: 0 };
    r3.put(r3.P.SKIP[0].x, r3.P.SKIP[0].z, r3.P.SKIP[0]);
    expect(hint(r3)).toBe(0);
    r3.dispose();
  });
});

describe('the two courses look different', () => {
  it('the pillars\' lamp rings are teal, the beams\' amber, the rock ledges\' their own; the stones are coloured apart; the line is one in the lazy words, short and plain', async () => {
    const r = await moonRig(true);
    const { JUMP_COL } = await import('../src/world/moonjumpparts.js');
    const { BASE_COL } = await import('../src/world/moonbase.js');
    expect(JUMP_COL.litSkip).toBe(BASE_COL.teal); // the Core's Ridge socket is teal
    expect(JUMP_COL.litBeam).not.toBe(JUMP_COL.litSkip);
    expect(JUMP_COL.beam).not.toBe(BASE_COL.ridge);
    expect(JUMP_COL.beamTop).not.toBe(BASE_COL.ridgeTop);
    const mesh = r.life.jump.lamps.mesh;
    const col = new THREE.Color();
    mesh.getColorAt(0, col);
    const dimSkip = col.getHex();
    mesh.getColorAt(r.P.SKIP.length + r.P.ROCK_LEDGES.length, col);
    expect(col.getHex()).not.toBe(dimSkip);
    // she stands on the first pillar: its ring turns teal; on a beam: amber
    r.put(r.P.SKIP[0].x, r.P.SKIP[0].z, r.P.SKIP[0]);
    mesh.getColorAt(0, col);
    expect(col.getHex()).toBe(JUMP_COL.litSkip);
    const b = r.P.BEAMS[0];
    r.put(b.x, b.z, b);
    mesh.getColorAt(r.P.SKIP.length + r.P.ROCK_LEDGES.length, col);
    expect(col.getHex()).toBe(JUMP_COL.litBeam);
    r.dispose();
  });
});
