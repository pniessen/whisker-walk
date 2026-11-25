// The Moon's climbing chains, walked the way the player walks them (the real doPounceOrClimb on the Moon's real area and life, the real perch pick, the real
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

afterEach(() => { vi.doUnmock('../src/world/moonswitch.js'); vi.resetModules(); });

// a fresh Moon (the bound switch on or off), its life, and a press of the paw button through the walk's own code
async function moonRig(boundOn, skills = []) {
  vi.resetModules();
  if (!boundOn) vi.doMock('../src/world/moonswitch.js', () => ({ MOON_BOUND_ON: false }));
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
  return { P, area, life, session, player, cat, put, press, badge, progression, frame, dispose: () => life.dispose() };
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

describe.each([['the bound on', true], ['the bound off', false]])('the Moon\'s chains, %s', (_name, boundOn) => {
  it('Skip Ridge: dust, first pillar, top (the Ridge cell\'s perch), and from the top the very next press is a way DOWN to free dust, never back up the stones', async () => {
    const r = await moonRig(boundOn);
    const [a, b] = r.P.SKIP;
    const f = foot(r, a, [-0.9, 0.4]);
    r.put(f.x, f.z);
    expect(r.badge()).toBe('up');
    r.press();
    expect(r.session.perched).toMatchObject({ x: a.x, z: a.z, y: a.y });
    expect(r.badge()).toBe('up');
    r.press();
    expect(r.session.perched).toMatchObject({ x: b.x, z: b.z, y: b.y });
    expect(Math.hypot(b.x + 0.85 - r.P.RIDGE_CELL.x, b.z - r.P.RIDGE_CELL.z)).toBeLessThan(1e-9); // the cell lies within the pick-up window of where she lands
    expect(r.badge()).toBe('down');
    r.press();
    expect(r.session.perched).toBe(null);
    expect(r.player.perchY).toBe(0);
    expect(onFreeDust(r, r.cat.x, r.cat.z)).toBe(true);
    expect(r.cat.y).toBeCloseTo(r.area.ground.y(r.cat.x, r.cat.z), 6);
    r.dispose();
  });
  it('the Beam Hops\' west half: five presses climb the wave beam by beam (each a lamp) and the sixth, on the peak, takes her to the dust', async () => {
    const r = await moonRig(boundOn);
    const beams = r.P.BEAMS;
    // (Ridge clarity: the wave now runs north-west from its south-eastern first beam) she starts behind the first beam, on the side away from the second
    const away = [beams[0].x - beams[1].x, beams[0].z - beams[1].z];
    const al = Math.hypot(...away);
    const f = foot(r, beams[0], [away[0] / al, away[1] / al]);
    r.put(f.x, f.z);
    const stood = [];
    for (let i = 0; i < 5; i++) {
      expect(r.badge(), `press ${i + 1}`).toBe('up');
      r.press();
      stood.push(beams.indexOf(beams.find((q) => q.x === r.session.perched?.x && q.z === r.session.perched?.z)));
    }
    expect(stood).toEqual([0, 1, 2, 3, 4]); // the fifth stone of the chain: the wave's peak, 3.0 m
    expect(r.badge()).toBe('down');
    r.press();
    expect(r.session.perched).toBe(null);
    expect(onFreeDust(r, r.cat.x, r.cat.z)).toBe(true);
    r.dispose();
  });
});

const SKILLS = [[], ['spring-paws'], ['sure-claws'], ['spring-paws', 'sure-claws']];

describe.each([['the bound on', true], ['the bound off', false]])('never stuck on a Moon perch, %s', (_name, boundOn) => {
  it.each(SKILLS.map((s) => [s.join('+') || 'no skills', s]))('from every perch (%s) the paw button reaches the dust within a few presses: every press climbs strictly or hops to free dust, and the badge says which', async (_k, skills) => {
    const r = await moonRig(boundOn, skills);
    expect(r.area.perches.length).toBeGreaterThanOrEqual(13);
    for (const p of r.area.perches) {
      r.put(p.x, p.z, p);
      let guard = 0;
      while (r.session.perched) {
        const was = r.session.perched;
        const badge = r.badge();
        expect(badge === 'up' || badge === 'down', `${p.x},${p.z} badge`).toBe(true);
        r.press();
        if (r.session.perched) {
          expect(badge, `${was.x},${was.z} up`).toBe('up');
          expect(r.session.perched.y, `${was.x},${was.z} climbs`).toBeGreaterThan(was.y);
        } else {
          expect(badge, `${was.x},${was.z} down`).toBe('down');
          expect(onFreeDust(r, r.cat.x, r.cat.z), `${was.x},${was.z} free dust at ${r.cat.x.toFixed(2)},${r.cat.z.toFixed(2)}`).toBe(true);
          expect(r.player.perchY).toBe(0);
        }
        expect(guard++).toBeLessThan(r.area.perches.length + 1);
      }
    }
    r.dispose();
  });
  it('from the ground at the foot of every perch, on every side, a run of presses climbs and then comes down to the dust: no cycle, no stone she cannot leave', async () => {
    const r = await moonRig(boundOn);
    for (const p of r.area.perches) {
      for (const side of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const f = foot(r, p, side);
        if (!onFreeDust(r, f.x, f.z)) continue;
        r.put(f.x, f.z);
        const seen = new Set();
        let landed = 0;
        for (let i = 0; i < 40; i++) {
          r.press();
          const s = r.session.perched;
          const key = s ? `${s.x},${s.z}` : 'dust';
          if (!s) { landed++; break; }
          expect(seen.has(key), `a cycle through ${key} from ${p.x},${p.z}`).toBe(false);
          seen.add(key);
        }
        // she either never left the dust (nothing in reach) or climbed and came down within the loop
        expect(r.session.perched, `${p.x},${p.z} side ${side}`).toBe(null);
        void landed;
      }
    }
    r.dispose();
  });
});

describe('the Ridge cell is still hers from the top, and she can come down again with it', () => {
  it('on the top pillar the cell is offered and picked up, and the next press carries her to the dust with it in her mouth', async () => {
    const r = await moonRig(true);
    r.progression.state.moon = { ...r.progression.state.moon, step: 1 };
    r.life.base.pip.setAwake();
    const [a, b] = r.P.SKIP;
    const f = foot(r, a, [-0.9, 0.4]);
    r.put(f.x, f.z);
    r.press(); r.press();
    expect(r.session.perched).toMatchObject({ x: b.x, z: b.z });
    expect(r.life.promptAt(r.cat)).toBeTruthy();
    r.life.interact();
    expect(r.life.base.state.carrying).toBe(0);
    expect(r.badge()).toBe('down');
    r.press();
    expect(r.session.perched).toBe(null);
    expect(r.life.base.state.carrying).toBe(0);
    expect(onFreeDust(r, r.cat.x, r.cat.z)).toBe(true);
    r.dispose();
  });
});

describe('the Moon\'s budgets are untouched', () => {
  it('the plain climbing budgets are what the M2 tests pin', () => {
    expect(placeBudget({}, 'moon').climb).toBe(3.2);
    expect(climbBudget({ skills: ['spring-paws', 'sure-claws'] }).climb).toBeLessThan(placeBudget({}, 'moon').climb);
    expect(bestPerch([{ x: 0, z: 0, y: 5, kind: 'stone' }], { x: 0, z: 1 }, 0, null, BASE_CLIMB_BUDGET)).toBe(null);
  });
});
