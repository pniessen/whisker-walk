// The Moon, milestone 6: the Launch Complex's place in the plan (src/world/moonplan.js) and its drawing (moonlaunchparts.js, moon.js): everything inside the bounds,
// clear of every other place of the plan, walkable on foot from the spawn, the mound gentle and off Dot's track, the rocket's pieces where the life moves them, the
// words in both sets, and the milestone's start-up promise (nothing outside the Moon's files names it).
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import * as P from '../src/world/moonplan.js';
import { build } from '../src/world/moon.js';
import { floodFrom } from './helpers/flood.js';
import { WINGS, createZones, wingNear, NEAR, HYSTERESIS } from '../src/world/moonzones.js';
import { LINES } from '../src/world/moonwords.js';
import { phrase } from '../src/clanphrases.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { rocketGeometry, armGeometry, plumeGeometry } from '../src/world/moonlaunchparts.js';

const built = () => { const scene = new THREE.Scene(); const area = build(scene); return { scene, area }; };
const inB = (p) => p.x >= P.MOON_BOUNDS.minX && p.x <= P.MOON_BOUNDS.maxX && p.z >= P.MOON_BOUNDS.minZ && p.z <= P.MOON_BOUNDS.maxZ;

describe('the plan', () => {
  it('every piece is inside the bounds, with its radius', () => {
    for (const p of [P.PAD, P.ROCKET, P.ROCKET_SLOT, P.GANTRY, ...P.TANKS, P.LAUNCH_DESK, P.MOUND, ...P.BENCHES, P.MESSAGE_DESK, P.BINOCULARS, P.COUNT_BOARD]) expect(inB(p), JSON.stringify(p)).toBe(true);
    expect(P.PAD.x + P.PAD.r).toBeLessThanOrEqual(P.MOON_BOUNDS.maxX);
    expect(P.PAD.z - P.PAD.r).toBeGreaterThanOrEqual(P.MOON_BOUNDS.minZ);
    expect(P.MOUND.x - P.MOUND.r).toBeGreaterThan(P.MOON_BOUNDS.minX);
    expect(P.MOUND.z - P.MOUND.r).toBeGreaterThanOrEqual(P.MOON_BOUNDS.minZ - 0.5);
  });
  it('the spec\'s places: the pad at (42, -34) radius 8, the Launch Desk at (30, -28), a 16 m rocket, a 2 m mound about 20 m from the pad', () => {
    expect([P.PAD.x, P.PAD.z, P.PAD.r]).toEqual([42, -34, 8]);
    expect([P.LAUNCH_DESK.x, P.LAUNCH_DESK.z]).toEqual([30, -28]);
    expect(P.ROCKET.h).toBe(16);
    expect(P.MOUND.h).toBe(2);
    const d = Math.hypot(P.MOUND.x - P.PAD.x, P.MOUND.z - P.PAD.z);
    expect(d).toBeGreaterThan(17);
    expect(d).toBeLessThan(23); // the spec said 21 m
    expect(Math.hypot(P.LAUNCH_DESK.x - P.PAD.x, P.LAUNCH_DESK.z - P.PAD.z)).toBeGreaterThan(P.PAD.r); // the desk is off the pad
  });
  it('the Message Desk is inside the dome, between two planters, off the Core, the board and the door', () => {
    const m = P.MESSAGE_DESK;
    expect(Math.hypot(m.x - P.DOME.x, m.z - P.DOME.z)).toBeLessThan(P.DOME.wall - 1.5);
    for (const pl of P.PLANTERS) expect(Math.hypot(m.x - pl.x, m.z - pl.z)).toBeGreaterThan(2.5);
    expect(Math.hypot(m.x - P.CORE.x, m.z - P.CORE.z)).toBeGreaterThan(4);
    expect(Math.hypot(m.x - (P.BOARD.x + 1.5), m.z - P.BOARD.z)).toBeGreaterThan(m.reach + 1); // its prompt never takes the board's
    expect(Math.hypot(m.x - P.AIRLOCK.front.x, m.z - P.AIRLOCK.front.z)).toBeGreaterThan(8);
  });
  it('the binocular stand is on Earthrise Rock\'s top ledge, a step from golden mouse 2 (never the same pick-up window)', () => {
    const top = P.ROCK_LEDGES[2];
    expect(Math.hypot(P.BINOCULARS.x - top.x, P.BINOCULARS.z - top.z)).toBeLessThan(top.r);
    const mouse = P.MOON_MICE[1];
    expect(Math.hypot(P.BINOCULARS.x - mouse.x, P.BINOCULARS.z - mouse.z)).toBeGreaterThan(1.1);
    expect(P.BINOCULARS.y).toBe(top.y);
  });
  it('nothing of the complex stands on another place of the plan: no collider inside another, none on Dot\'s track, the cells, the finds, the pebbles or the mice', () => {
    const all = [...P.MOON_COLLIDERS];
    for (const c of P.LAUNCH_COLLIDERS) {
      for (const o of all) { if (P.LAUNCH_COLLIDERS.includes(o)) continue; expect(Math.hypot(c.x - o.x, c.z - o.z) >= c.r + o.r - 1e-6, `${JSON.stringify(c)} against ${JSON.stringify(o)}`).toBe(true); }
      expect(P.trackDistance(c.x, c.z)).toBeGreaterThan(c.r + 1.8);
    }
    for (const j of [...P.JOB_POINTS, ...P.PEBBLES, ...P.MOON_MICE]) for (const c of P.LAUNCH_COLLIDERS) expect(Math.hypot(j.x - c.x, j.z - c.z)).toBeGreaterThan(c.r + 0.3);
    // the mound and the whole pad are clear of the track too (Dot never drives over either)
    expect(P.trackDistance(P.MOUND.x, P.MOUND.z)).toBeGreaterThan(P.MOUND.r + 1.8 - 1);
    expect(P.trackDistance(P.PAD.x, P.PAD.z)).toBeGreaterThan(P.PAD.r + 1.8);
  });
});

describe('the ground', () => {
  const g = () => P.createMoonGround();
  it('the pad is level dust (the rocket stands straight) and the Launch Desk and the Message Desk stand on level ground', () => {
    for (const [x, z] of [[P.PAD.x, P.PAD.z], [P.PAD.x + 6, P.PAD.z + 3], [P.PAD.x - 7, P.PAD.z - 3], [P.LAUNCH_DESK.x, P.LAUNCH_DESK.z], [P.MESSAGE_DESK.x, P.MESSAGE_DESK.z]]) expect(Math.abs(P.moonY(x, z)), `${x},${z}`).toBeLessThan(0.05);
  });
  it('the mound is 2 m high at its middle, gentle (a slope of 0.45 at most), and walkable all over with the walk\'s own step rule', () => {
    expect(P.moonY(P.MOUND.x, P.MOUND.z)).toBeGreaterThan(1.95);
    expect(P.moonY(P.MOUND.x, P.MOUND.z)).toBeLessThan(2.1);
    expect(P.moonY(P.MOUND.x + P.MOUND.r + 0.1, P.MOUND.z)).toBeLessThan(0.1);
    let worst = 0;
    const gr = { x: 0, z: 0 };
    const ground = g();
    for (let a = 0; a < 24; a++) {
      for (let r = 0.3; r <= P.MOUND.r; r += 0.3) {
        const x = P.MOUND.x + Math.cos(a) * r;
        const z = P.MOUND.z + Math.sin(a) * r;
        ground.gradient(x, z, gr);
        worst = Math.max(worst, Math.hypot(gr.x, gr.z));
        expect(ground.canStep(x, z, x + Math.cos(a) * 0.4, z + Math.sin(a) * 0.4), `${x},${z}`).toBe(true);
        expect(ground.canStep(x + Math.cos(a) * 0.4, z + Math.sin(a) * 0.4, x, z)).toBe(true);
      }
    }
    expect(worst).toBeLessThan(0.45);
  });
  it('the benches stand on the mound\'s top, 1.5 m or more over the dust, and face the pad', () => {
    for (const b of P.BENCHES) { expect(P.moonY(b.x, b.z)).toBeGreaterThan(1.5); expect(Math.hypot(b.x - P.MOUND.x, b.z - P.MOUND.z)).toBeLessThan(3.5); }
  });
});

describe('on foot', () => {
  it('from the spawn a cat reaches the Message Desk, the rocket\'s slot, the Launch Desk, the mound\'s top and the foot of Earthrise Rock over legal steps, past every collider', () => {
    const { area } = built();
    const ground = area.ground;
    const clear = (x, z) => area.colliders.every((c) => Math.hypot(x - c.x, z - c.z) > c.r + 0.3);
    const ok = (x, z) => x > area.bounds.minX && x < area.bounds.maxX && z > area.bounds.minZ && z < area.bounds.maxZ && clear(x, z);
    const fill = floodFrom(area, area.spawn, (x, z) => ok(x, z));
    const near = (p, r) => fill.reachesWithin(p.x, p.z, r);
    expect(near(P.MESSAGE_DESK, P.MESSAGE_DESK.reach - 0.2)).toBe(true);
    expect(near(P.ROCKET, P.ROCKET.reach - 0.2)).toBe(true);
    expect(near(P.LAUNCH_DESK, P.LAUNCH_DESK.reach - 0.2)).toBe(true);
    expect(near(P.MOUND, 1)).toBe(true);
    expect(near(P.ROCK_LEDGES[0], 3)).toBe(true);
    expect(near(P.PAD, P.PAD.r - 1)).toBe(true);
    // and the steps between cells never fail the walk's own rule on the mound
    for (let a = 0; a < 8; a++) expect(ground.canStep(P.MOUND.x + Math.cos(a) * 8, P.MOUND.z + Math.sin(a) * 8, P.MOUND.x, P.MOUND.z)).toBe(true);
  });
  it('the prompts\' reach is beyond the collider: she can stand beside each and be inside it', () => {
    expect(P.ROCKET.reach).toBeGreaterThan(P.ROCKET.r + 0.5);
    expect(P.LAUNCH_DESK.reach).toBeGreaterThan(0.85 + 0.5);
    expect(P.MESSAGE_DESK.reach).toBeGreaterThan(0.75 + 0.5);
    expect(Math.hypot(P.ROCKET_SLOT.x - P.ROCKET.x, P.ROCKET_SLOT.z - P.ROCKET.z)).toBeLessThan(P.ROCKET.reach);
  });
});

describe('the zone', () => {
  it('wing C is the pad: drawn within 55 m, kept to 61 m; B is untouched', () => {
    expect(Object.keys(WINGS)).toEqual(['B', 'C']);
    expect([WINGS.C.x, WINGS.C.z]).toEqual([P.PAD.x, P.PAD.z]);
    const z = createZones();
    expect(z.update(P.PAD.x - 40, P.PAD.z).C).toBe(true);
    expect(z.update(P.PAD.x - 58, P.PAD.z).C).toBe(true); // hysteresis
    expect(z.update(P.PAD.x - 62, P.PAD.z).C).toBe(false);
    expect(z.update(P.PAD.x - 58, P.PAD.z).C).toBe(false);
    expect(wingNear(NEAR, false)).toBe(true);
    expect(wingNear(NEAR + 1, false)).toBe(false);
    expect(HYSTERESIS).toBe(6);
    // the spawn (89 m) and the dome (97 m) are far; the mound and the desk are near
    expect(createZones().update(0, 45).C).toBe(false);
    expect(createZones().update(P.DOME.x, P.DOME.z).C).toBe(false);
    expect(createZones().update(P.MOUND.x, P.MOUND.z).C).toBe(true);
    expect(createZones().update(P.LAUNCH_DESK.x, P.LAUNCH_DESK.z).C).toBe(true);
  });
});

describe('the drawing', () => {
  it('the rocket is one mesh (feet at 0, 16 m or so tall, under 900 triangles), the arm one box, the plume one quad; the group is named for the life', () => {
    const r = rocketGeometry(); r.computeBoundingBox();
    expect(r.boundingBox.min.y).toBeGreaterThanOrEqual(-0.01);
    expect(r.boundingBox.max.y).toBeGreaterThan(15);
    expect(r.boundingBox.max.y).toBeLessThan(16.5);
    expect(r.attributes.position.count / 3).toBeLessThan(900);
    const a = armGeometry(); a.computeBoundingBox();
    expect(a.boundingBox.max.z).toBeGreaterThan(P.GANTRY.armLen);
    expect(plumeGeometry().index.count / 3).toBe(2);
    const { scene } = built();
    const wing = scene.getObjectByName('moon:wingC');
    expect(wing.children.map((c) => c.name).sort()).toEqual(['moon:arm', 'moon:plume', 'moon:rocket', 'moon:smoke']);
    const rocket = scene.getObjectByName('moon:rocket');
    expect(rocket.position.x).toBe(P.ROCKET.x);
    expect(rocket.position.y).toBeCloseTo(P.moonY(P.ROCKET.x, P.ROCKET.z) + P.ROCKET.stand, 6);
    expect(rocket.userData.noMerge).toBe(true);
    for (const n of ['moon:arm', 'moon:plume', 'moon:smoke']) { const o = scene.getObjectByName(n); expect(o.castShadow).toBe(false); expect(o.userData.noCast).toBe(true); }
  });
  it('the plume is additive, double-sided, never writes depth and reads as one transparent mesh (opacity 0 until the life lights it)', () => {
    const { scene } = built();
    const p = scene.getObjectByName('moon:plume');
    expect(p.material.blending).toBe(THREE.AdditiveBlending);
    expect(p.material.depthWrite).toBe(false);
    expect(p.material.transparent).toBe(true);
    expect(p.material.opacity).toBe(0);
    expect(p.visible).toBe(false);
  });
  it('the standing parts add no mesh of their own: the place grew only by the rocket, the arm and the plume (the smoke is a Points)', () => {
    const { scene } = built();
    const names = [];
    scene.traverse((o) => { if (o.isMesh) names.push(o.name); });
    expect(names.filter((n) => /launch|pad|gantry|tank|desk|bench|mound/i.test(n))).toEqual([]);
    expect(names.filter((n) => /^moon:(rocket|arm|plume)$/.test(n))).toHaveLength(3);
  });
});

describe('the draw-call guard', () => {
  it('every double-sided transparent material the Moon builds is told one pass is enough (it would be two draw calls each, and the frame has none to spare)', () => {
    const { scene } = built();
    let seen = 0;
    scene.traverse((o) => {
      const m = o.material;
      if (!m || Array.isArray(m) || !m.transparent || m.side !== THREE.DoubleSide) return;
      seen++;
      expect(m.forceSinglePass, o.name || o.type).toBe(true);
    });
    expect(seen).toBeGreaterThan(3); // the glass, the gate's disc and shaft, the plume, the sky's figures
  });
});

describe('the words, in both sets', () => {
  const NEW = ['moon.desk.prompt', 'moon.stamp.paw', 'moon.stamp.star', 'moon.stamp.heart', 'moon.stamp.close', 'moon.card.got', 'moon.rocket.prompt', 'moon.rocket.loaded', 'moon.launch.prompt',
    'moon.launch.sent', 'moon.reply.wait', 'moon.story.pay', 'moon.binoc.prompt', 'moon.binoc.close', 'moon.goal.card', 'moon.goal.rocket', 'moon.goal.button', 'moon.goal.reply',
    'moon.stamp.ask', 'moon.count.go', 'moon.reply', 'moon.badge'];
  it('every line the chapter says is in the lazy file, the same in both sets, clean of banned words, short, and says nothing of a fail', () => {
    for (const id of NEW) {
      expect(Object.hasOwn(LINES, id), id).toBe(true);
      const on = phrase(id);
      let off;
      withOffWords(() => { off = phrase(id); expect(bannedIn(off), id).toBeNull(); });
      expect(on, id).toBe(off);
      expect(on.length, id).toBeGreaterThan(2);
      expect(on.length, id).toBeLessThan(90);
      expect(on, id).not.toMatch(/\b(fail|wrong|lose|lost|die|dead|scared|hurry|too late)\b/i);
    }
  });
});

describe('start-up: nothing outside the Moon\'s files names the Launch Complex', () => {
  const files = globSync('src/**/*.js').map((f) => f.split('\\').join('/'));
  it('no start-up file imports or names the chapter\'s files, and the new files are Moon-prefixed', () => {
    const mine = ['moonlaunch', 'moonlaunchparts', 'moonlaunchlive', 'moonstamps'];
    for (const f of files) {
      if (/^src\/world\/moon[a-z]*\.js$/.test(f)) continue;
      const text = readFileSync(f, 'utf8');
      for (const m of mine) expect(text, `${f} names ${m}`).not.toMatch(new RegExp(`\\b${m}\\.js`));
    }
    for (const m of mine) expect(files, m).toContain(`src/world/${m}.js`);
  });
});
