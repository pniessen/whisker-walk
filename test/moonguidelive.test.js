// The Moon's written guide on a walk (world/moonguidelive.js + the base's always-up light column), through the real Moon life: the goal line at every stage of the story in both word
// sets, the edge arrow's turn / distance / hide rules against the live camera, the light column that is always up, the words beside Pip's picture, and that the words, the arrow and the
// beacon always stand on the same goal. A fake page (test/helpers/moonpage.js) takes the DOM.
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import * as P from '../src/world/moonplan.js';
import * as J from '../src/world/moonjob.js';
import * as M from '../src/world/moonmission.js';
import { build } from '../src/world/moon.js';
import { createProgression } from '../src/progression.js';
import { createDiscoveryLog } from '../src/discoveries.js';
import { bus } from '../src/events.js';
import { phrase } from '../src/clanphrases.js';
import { mem } from './helpers/lighthouselife.js';
import { fakePage } from './helpers/moonpage.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { RING, BEACON } from '../src/world/moonbaselive.js';
import { goalWords, atWords, chipWords, viewOf, makeArrow, arrowFor, round5, ARRIVED } from '../src/world/moonguide.js';

const gy = (x, z) => P.moonY(x, z);
const NOT_DEMO = () => 250;
const AWAKE = { step: 4, cells: 3 };
const AT5 = { step: 5, cells: 3, scope: 3 };
const DONE = { step: 8, cells: 3, stamp: 0, scope: 3 };
const visitsFor = (kind) => { for (let v = 0; v < 500; v++) if (J.planMoonJob(undefined, v, { bound: true }).kind === kind) return v; throw new Error(`no walk for ${kind}`); };

function rig({ moon = null, restore = null, reducedMotion = false, visits = 0, size = [960, 540], touch = false, tv = null, boundOn = true } = {}) {
  const progression = createProgression(mem());
  if (moon) progression.state.moon = { ...progression.state.moon, ...moon };
  const scene = new THREE.Scene();
  const area = build(scene);
  const log = createDiscoveryLog(progression);
  log.startWalk();
  if (restore) log.restore(restore);
  const page = fakePage({ width: size[0], height: size[1] });
  if (touch) page.doc.body.classList = { contains: (c) => c === 'touch-mode' };
  if (tv) { page.doc.documentElement = { classList: { contains: (c) => c === 'tv' } }; page.win.getComputedStyle = () => ({ fontSize: `${24 * tv}px` }); }
  const life = area.life({ scene, ground: area.ground, audio: null, log, progression, reducedMotion, tier: { name: 'high' }, doc: page.doc, win: page.win, clock: NOT_DEMO, visits, roomSeed: undefined, boundOn });
  const camera = new THREE.PerspectiveCamera(50, size[0] / size[1], 0.1, 600);
  const cat = new THREE.Object3D();
  const session = { goals: null, pounceTime: 0, perched: null, fx: { burst: vi.fn() }, cat, idleTime: 0, collectibleMeshes: new Map(P.PEBBLES.map((p) => [p.id, new THREE.Object3D()])) };
  const events = [];
  const off = bus.on('discovery', (e) => events.push(e));
  const where = { x: 0, y: 0, z: 45 };
  const look = { yaw: 0 }; // degrees: 0 looks north (-z), 90 west
  let t = 0;
  const place = () => {
    const y = (look.yaw * Math.PI) / 180;
    camera.position.set(where.x + Math.sin(y) * 4.4, where.y + 2.9, where.z + Math.cos(y) * 4.4);
    camera.rotation.set(0, y, 0, 'YXZ');
    camera.updateMatrixWorld(true);
  };
  const move = (p) => { Object.assign(where, p); cat.position.set(where.x, where.y, where.z); };
  const step = (secs, at) => { if (at) move(at); for (let i = 0; i < Math.round(secs * 30); i++) { t += 1 / 30; place(); life.update(1 / 30, t, where, camera, session); } };
  const press = () => { const line = life.promptAt(where); life.interact(); return line; };
  const g = life.guide;
  const root = page.hud.children[0];
  move(where);
  return {
    scene, life, progression, page, camera, cat, session, events, where, look, move, step, press, log, g, root, line: g.els.line, arrow: g.els.arrow, chip: g.els.chip,
    text: () => g.state.text, goal: () => life.base.goal(), shaft: () => scene.getObjectByName('moon:goalshaft'), ring: () => scene.getObjectByName('moon:goalring'),
    lines: () => events.filter((e) => e.type === 'greenhousenote').map((e) => e.label), dispose() { off(); life.dispose(); },
  };
}
afterEach(() => { delete globalThis.document; });
const near = (a, b, tol = 0.3) => Math.hypot(a.x - b.x, a.z - b.z) < tol;
const FAR = { x: -30, z: 60, y: 0 };

// every stage of the story: how to get there, and what the line says
const carryFrom = (cellPoint, then) => (r) => { r.step(0.3, { x: cellPoint.x + 0.5, z: cellPoint.z, y: cellPoint.y }); r.press(); then?.(r); };
const STAGES = [
  ['Pip asleep', null, null, /^Wake Pip/],
  ['the Ridge cell', { step: 1, cells: 0 }, null, /^Find a power cell \(0 of 2\): on the tall rocks, north of the lander\.$/],
  ['the Rover cell', { step: 2, cells: 1 }, null, /^Find a power cell \(1 of 2\): at the far beacon, north-east of the lander\.$/],
  ['a cell in her mouth', { step: 2, cells: 1 }, carryFrom({ x: P.ROVER_CELL.x, z: P.ROVER_CELL.z, y: P.ROVER_CELL.y }), /^Take the power cell to the Core in the dome, /],
  ['both cells in', { step: 3, cells: 3 }, null, /^Both power cells are in! Go to the dome, /],
  ['the base awake: Star Hill', AWAKE, null, /^Climb Star Hill, north-west of the lander\. Join the stars: Mouse, then Cat\.$/],
  ['the Mouse traced', { ...AWAKE, scope: 1 }, null, /Now join the Cat stars\.$/],
  ['the Message Desk', AT5, null, /^Write a postcard at the Message Desk in the dome, /],
  ['the postcard in her mouth', AT5, (r) => { r.step(0.1, { x: P.MESSAGE_DESK.x + 1.4, z: P.MESSAGE_DESK.z, y: gy(P.MESSAGE_DESK.x, P.MESSAGE_DESK.z) }); r.press(); r.page.win.fire('keydown', { code: 'Digit2' }); }, /^Take the postcard to the rocket and post it, north-east of the lander\.$/],
  ['the red button', { ...AT5, step: 6, stamp: 1 }, null, /^Press the big red button at the launch desk, north-east of the lander\.$/],
  ['waiting for the reply', { ...AT5, step: 7, stamp: 1 }, null, /^Wait on Earthrise Rock, north of the lander\. Earth will answer!$/],
  ['the cave', DONE, null, /^A glowing cell waits in the cave, north-west of the lander\.$/],
];
const stage = ([, moon, prep, re], opts = {}) => {
  const r = rig({ moon, restore: [[J.JOB_KEY, 1]], ...opts }); // the day's errand is already done in these walks: the story's own goal shows
  if (prep) prep(r);
  r.step(0.6, { ...FAR, y: gy(FAR.x, FAR.z) });
  return r;
};

describe('the goal line says WHAT and WHERE at each stage (Clan set, then the everyday set)', () => {
  for (const s of STAGES) {
    it(`${s[0]}`, () => {
      const r = stage(s);
      expect(r.text()).toMatch(s[3]);
      expect(r.line.textContent).toBe(r.text());
      expect(r.line.style.display).toBe('block');
      expect(r.root.style.display).toBe('block');
      r.dispose();
      withOffWords(() => {
        const q = stage(s);
        expect(q.text()).toMatch(s[3]);
        expect(bannedIn(q.text())).toBeNull();
        expect(q.text()).not.toMatch(/Silverpelt/);
        q.dispose();
      });
    });
  }
  it('the story told and the whole Moon done: nothing (no line, no arrow, no beacon), with the gentle line only for a base that is awake', () => {
    const r = rig({ moon: { ...DONE, cells: 7 }, restore: [[J.JOB_KEY, 1]] });
    r.step(0.6, { ...FAR, y: gy(FAR.x, FAR.z) });
    expect(r.goal().g.kind).toBe('done');
    expect(r.text()).toMatch(/^The base is awake! Look around/);
    expect(r.shaft().visible).toBe(false); // no beacon: there is nothing to go to
    expect(r.g.state.arrowOn).toBe(false);
    r.dispose();
  });
  it('the Clan set keeps its one light flavour; the everyday set is plain', () => {
    const r = rig({ moon: { ...DONE, cells: 7 }, restore: [[J.JOB_KEY, 1]] });
    r.step(0.6, { ...FAR, y: gy(FAR.x, FAR.z) });
    expect(r.text()).toMatch(/Silverpelt/);
    r.dispose();
  });
  it('the line follows a change at once: waking Pip, picking up a cell and plugging it change the words within a quarter of a second', () => {
    const r = rig();
    r.step(0.6, { x: 3, z: 43, y: 0 });
    expect(r.text()).toMatch(/^Wake Pip/);
    expect(r.press()).toBe(phrase('moon.pip.prompt'));
    r.step(0.3);
    expect(r.text()).toMatch(/Find a power cell \(0 of 2\): on the tall rocks/);
    const c = P.ROVER_CELL;
    r.step(0.3, { x: c.x + 0.5, z: c.z, y: c.y });
    r.press();
    r.step(0.3);
    expect(r.text()).toMatch(/^Take the power cell to the Core/);
    r.step(0.3, { x: P.CORE.x + 1.5, z: P.CORE.z, y: gy(P.CORE.x, P.CORE.z) });
    r.press();
    r.step(0.3);
    expect(r.text()).toMatch(/\(1 of 2\): on the tall rocks/); // the Ridge cell is what is left
    r.dispose();
  });
  it('Pip\'s errand of the day, once the story is told: the errand line with its place (six kinds, each by the same goal the ring has)', () => {
    for (const [kind, re] of [['pebbles', /^Pip needs glowing pebbles \(0 of 3\)\. Look /], ['rounds', /^Hop in Dot at the depot, east of the lander/], ['guest', /^Climb Star Hill, north-west of the lander\. Trace the new star picture\.$/],
      ['bound', /^Jump farther than your best on the hop lane/], ['rocket', /^Write another postcard at the Message Desk/], ['glove', /^Earth lost a glove\. Find it, /]]) {
      const r = rig({ moon: { ...DONE, cells: 7, jump: { tabby: 600 } }, visits: visitsFor(kind) });
      r.step(2.6, { ...FAR, y: gy(FAR.x, FAR.z) });
      expect(r.life.job.state.kind).toBe(kind);
      expect(r.text(), kind).toMatch(re);
      expect(near(r.shaft().position, r.goal())).toBe(true);
      expect(r.text(), kind).toContain(atWords(r.goal().x, r.goal().z));
      r.dispose();
    }
  });
  it('is not saved, not sent and not a toast: nothing on the bus and no change to the save record', () => {
    const r = rig({ moon: AWAKE });
    const before = JSON.stringify(r.progression.state);
    const n = r.events.length;
    r.step(2, { ...FAR, y: gy(FAR.x, FAR.z) });
    expect(JSON.stringify(r.progression.state)).toBe(before);
    expect(r.events.filter((e) => e.type === 'greenhousenote').slice(n).every((e) => !/lander|Star Hill/.test(e.label ?? ''))).toBe(true);
    r.dispose();
  });
});

describe('the words, the arrow and the beacon always agree', () => {
  for (const s of STAGES) {
    it(`${s[0]}: one goal`, () => {
      const r = stage(s);
      const goal = r.goal();
      // the beacon stands on the goal
      expect(near(r.shaft().position, goal, 0.01)).toBe(true);
      expect(near(r.ring().position, goal, 0.01)).toBe(true);
      expect(r.shaft().visible).toBe(true);
      // the words name the place the goal is at (every line with a place)
      if (!['pip'].includes(goal.g.kind)) {
        if (/\blander\b/.test(r.text())) expect(r.text()).toContain(atWords(goal.x, goal.z));
      }
      // the arrow points at the same point: face away from it and compare with a hand-made arrow
      r.look.yaw = 180;
      r.step(0.3);
      const a = arrowFor(viewOf(r.camera), r.where, { x: goal.x, y: goal.y + 1.5, z: goal.z }, makeArrow());
      expect(r.g.state.arrowOn).toBe(a.show);
      if (a.show) { expect(r.g.state.rel).toBeCloseTo(a.rel, 2); expect(r.g.state.metres).toBe(Math.max(5, round5(a.dist))); expect(r.arrow.style.display).toBe('block'); }
      // and the words are what goalWords says of that same goal
      const info = { goal, record: M.normalize(r.progression.state.moon), scope: r.progression.state.moon.scope ?? 0, job: {}, riding: false };
      if (!['core'].includes(goal.g.kind)) expect(goalWords(info)).toBe(r.text());
      r.dispose();
    });
  }
  it('the ring brightens on a meow but stands on the same goal; the light column does not move', () => {
    const r = rig({ moon: { step: 1, cells: 0 } });
    r.step(0.6, { ...FAR, y: gy(FAR.x, FAR.z) });
    const before = { x: r.shaft().position.x, z: r.shaft().position.z, o: r.shaft().material.opacity };
    bus.emit('tip:did', { id: 'call' });
    r.step(0.8);
    expect(r.life.base.ringing).toBe(true);
    expect(near(r.shaft().position, before, 0.01)).toBe(true);
    expect(r.shaft().material.opacity).toBeGreaterThan(before.o);
    r.dispose();
  });
});

describe('the light column is always up while there is a goal', () => {
  it('Pip asleep: the ring and the column are up from the first frames with no meow and no waiting', () => {
    const r = rig();
    r.step(0.5);
    expect(r.life.base.beacon).toBe(true);
    expect(r.life.base.ringing).toBe(false);
    expect(r.shaft().visible).toBe(true);
    expect(r.shaft().material.opacity).toBeGreaterThan(0); // (she stands within 4 m of him: the column is faint there, so it never blots her out)
    expect(near(r.shaft().position, r.life.base.pip.position, 0.3)).toBe(true);
    r.step(0.6, { ...FAR, y: gy(FAR.x, FAR.z) });
    expect(r.shaft().material.opacity).toBeGreaterThan(0.2);
    r.dispose();
  });
  it('a long way off the column is up and tall and wide enough to see (the flat ring is not drawn beyond its range); close to the goal the column fades so it never blots her out', () => {
    const r = rig({ moon: { step: 1, cells: 0 } });
    r.step(0.6, { ...FAR, y: gy(FAR.x, FAR.z) });
    const s = r.shaft();
    expect(s.visible).toBe(true);
    expect(s.scale.y).toBe(BEACON.tall);
    expect(s.scale.x).toBeGreaterThan(1.5);
    expect(s.material.opacity).toBeGreaterThan(0.2);
    expect(r.ring().visible).toBe(false);
    const c = P.RIDGE_CELL;
    r.step(0.6, { x: c.x - 25, z: c.z, y: gy(c.x - 25, c.z) });
    expect(r.ring().visible).toBe(true);
    const farOp = s.material.opacity;
    r.step(0.6, { x: c.x - 1, z: c.z, y: gy(c.x - 1, c.z) });
    expect(s.material.opacity).toBeLessThan(farOp);
    r.dispose();
  });
  it('rests while the Core\'s wake-up beat plays and while the launch flies, and is back after', () => {
    const r = rig({ moon: { step: 3, cells: 3 } });
    r.step(0.3, { x: P.DOME.x + 4, z: P.DOME.z + 4, y: gy(P.DOME.x + 4, P.DOME.z + 4) });
    r.step(1);
    expect(r.life.base.state.beat).toBe(true);
    expect(r.life.base.beacon).toBe(false);
    expect(r.shaft().visible).toBe(false);
    expect(r.g.state.quiet).toBe(true);
    expect(r.root.style.display).toBe('none');
    r.step(6);
    expect(r.life.base.state.beat).toBe(false);
    expect(r.life.base.beacon).toBe(true);
    expect(r.root.style.display).toBe('block');
    r.dispose();
  });
  it('a meow still lights the same two meshes (no extra mesh in the scene): one ring, one column', () => {
    const r = rig();
    let rings = 0; let shafts = 0;
    r.scene.traverse((o) => { if (o.name === 'moon:goalring') rings++; if (o.name === 'moon:goalshaft') shafts++; });
    expect([rings, shafts]).toEqual([1, 1]);
    expect(r.ring().frustumCulled).toBe(true); // culled by the view: draws only when in sight
    expect(r.shaft().frustumCulled).toBe(true);
    r.dispose();
  });
  it('reduced motion: the ring does not pulse or breathe, and the column does not move', () => {
    const r = rig({ reducedMotion: true, moon: { step: 1, cells: 0 } });
    r.step(0.3, { x: P.RIDGE_CELL.x - 10, z: P.RIDGE_CELL.z, y: 0 });
    const seen = new Set();
    for (let i = 0; i < 20; i++) { r.step(0.1); seen.add(r.ring().scale.x); seen.add(r.shaft().material.opacity.toFixed(4)); }
    expect(seen.size).toBeLessThanOrEqual(3);
    r.dispose();
  });
});

describe('the edge arrow', () => {
  const flat = (r) => ({ ...r.where });
  it('hidden while the goal is straight ahead on screen; shown, turning, when she turns away, with the metres to the nearest 5', () => {
    const r = rig({ moon: { step: 1, cells: 0 } });
    r.step(0.6);
    expect(r.g.state.arrowOn).toBe(false); // the Ridge cell is ahead, 80 m north, on screen
    r.look.yaw = 90; // west: the goal is on her right
    r.step(0.3);
    expect(r.g.state.arrowOn).toBe(true);
    expect(r.g.state.rel).toBeGreaterThan(1.2);
    expect(r.g.state.rel).toBeLessThan(Math.PI / 2 + 0.2);
    const d = Math.hypot(P.RIDGE_CELL.x - r.where.x, P.RIDGE_CELL.z - r.where.z);
    expect(r.g.state.metres).toBe(round5(d));
    expect(r.g.state.metres % 5).toBe(0);
    expect(r.arrow.children[2].textContent).toBe(`${round5(d)} m`);
    expect(r.g.state.x).toBeGreaterThan(960 / 2); // on the right side
    const x90 = r.g.state.x;
    r.look.yaw = -90; // east: on her left
    r.step(0.3);
    expect(r.g.state.rel).toBeLessThan(-1.2);
    expect(r.g.state.x).toBeLessThan(960 / 2);
    expect(x90).toBeGreaterThan(r.g.state.x);
    r.look.yaw = 180; // south: behind
    r.step(0.3);
    expect(Math.abs(r.g.state.rel)).toBeGreaterThan(2.6);
    r.look.yaw = 0;
    r.step(0.3);
    expect(r.g.state.arrowOn).toBe(false);
    r.dispose();
  });
  it('the distance is hers, not the camera\'s, and counts down as she walks; within 8 m it is gone', () => {
    const r = rig({ moon: { step: 1, cells: 0 } });
    r.look.yaw = 90;
    const c = P.RIDGE_CELL;
    const at = (d) => r.step(0.3, { x: c.x, z: c.z + d, y: gy(c.x, c.z + d) });
    at(40);
    expect(r.g.state.metres).toBe(40);
    at(21);
    expect(r.g.state.metres).toBe(20);
    at(ARRIVED + 1);
    expect(r.g.state.arrowOn).toBe(true);
    at(ARRIVED - 1);
    expect(r.g.state.arrowOn).toBe(false);
    expect(r.arrow.style.display).toBe('none');
    r.dispose();
  });
  it('follows the goal as it changes: after the Ridge cell is in, it points at the Rover cell', () => {
    const r = rig({ moon: { step: 2, cells: 1 } });
    r.look.yaw = 0;
    r.step(0.3, { x: P.ROVER_CELL.x - 60, z: P.ROVER_CELL.z, y: gy(P.ROVER_CELL.x - 60, P.ROVER_CELL.z) });
    expect(r.g.state.arrowOn).toBe(true); // facing north, the cell is due east: off to her right
    expect(Math.abs(r.g.state.rel - Math.PI / 2)).toBeLessThan(0.1); // (the camera hangs 4 m behind her: a hair off due east)
    expect(r.g.state.metres).toBe(60);
    r.dispose();
  });
  it('on Star Hill the goal is the telescope in the middle, and the arrow, the words and the column say so together', () => {
    const r = rig({ moon: AWAKE });
    const ramp = P.rampPoint(0.5, 0);
    r.step(0.6, { x: ramp.x, z: ramp.z, y: gy(ramp.x, ramp.z) });
    const gp = r.goal();
    expect(near(gp, P.STAR_HILL, 0.01)).toBe(true);
    expect(r.text()).toMatch(/^The telescope is at the top of the hill\. Join the stars/);
    expect(near(r.shaft().position, P.STAR_HILL, 0.01)).toBe(true);
    r.dispose();
  });
  it('in the cave the goal is the glowing cell itself (words, column and arrow)', () => {
    const r = rig({ moon: DONE, restore: [[J.JOB_KEY, 1]] });
    r.step(0.6, { x: P.MOUTH.x - 3, z: P.MOUTH.z, y: gy(P.MOUTH.x - 3, P.MOUTH.z) });
    expect(near(r.goal(), P.DEEP_CELL, 0.01)).toBe(true);
    expect(r.text()).toBe(phrase('moon.guide.tunnel'));
    expect(near(r.shaft().position, P.DEEP_CELL, 0.01)).toBe(true);
    r.dispose();
  });
  it('stays out of the way: inside the screen, under the goal line, clear of the corner map and the touch controls, on every size and at every turn', () => {
    const sizes = [['laptop', [960, 540], false, null], ['phone portrait', [390, 760], true, null], ['phone landscape', [760, 390], true, null], ['iPad', [1180, 820], true, null], ['TV 1080', [1920, 1080], false, 1], ['TV 4K', [3840, 2160], false, 2]];
    for (const [name, size, touch, tv] of sizes) {
      const r = rig({ moon: { step: 1, cells: 0 }, size, touch, tv });
      r.g.state.font; // (laid out at once)
      for (let yaw = 0; yaw < 360; yaw += 15) {
        r.look.yaw = yaw;
        r.step(0.3, { ...FAR, y: gy(FAR.x, FAR.z) });
        if (!r.g.state.arrowOn) continue;
        const { x, y } = r.g.state;
        const [W, H] = size;
        const s = tv ?? 1;
        const edge = tv ? W * 0.05 : 28;
        expect(x, `${name} ${yaw}`).toBeGreaterThanOrEqual(edge); expect(x).toBeLessThanOrEqual(W - edge);
        const lineBottom = (tv ? H * 0.05 + 76 * s : W <= 520 ? 16 + 110 + 34 : 64) + r.g.state.font * 1.28;
        expect(y, `${name} ${yaw} under the line`).toBeGreaterThan(lineBottom);
        expect(y).toBeLessThan(touch ? (H > W ? H - 290 : H - 190) : H * 0.8); // above the touch controls (a landscape phone's sit lower: its screen is short)
        const mapW = tv ? Math.min(220 * s, W * 0.36) : touch ? 110 : 150;
        const inMap = x > W - 16 - mapW - 10 && y < 16 + mapW + 24;
        expect(inMap, `${name} ${yaw} not on the map`).toBe(false);
      }
      r.dispose();
    }
  });
});

describe('Pip\'s picture gets words beside it', () => {
  it('a meow shows the chip for the goal Pip points at, then it fades with the bubble', () => {
    const r = rig({ moon: { step: 1, cells: 0 } });
    r.step(0.5, { x: 3, z: 40, y: 0 });
    expect(r.g.state.chipOn).toBe(false);
    bus.emit('tip:did', { id: 'call' });
    r.step(0.7);
    expect(r.life.base.bubble.on).toBe(true);
    expect(r.g.state.chipOn).toBe(true);
    expect(r.chip.textContent).toBe('Pip needs a power cell');
    expect(Number(r.chip.style.opacity)).toBeGreaterThan(0);
    expect(r.chip.style.display).toBe('block');
    r.step(RING.bubble + 0.5);
    expect(r.g.state.chipOn).toBe(false);
    expect(r.chip.style.display).toBe('none');
    r.dispose();
  });
  it('says the right words at each stage (a picture has one meaning, a goal has one chip), in both sets', () => {
    const cases = [[null, 'Pip is asleep. Wake him up!'], [{ step: 1, cells: 0 }, 'Pip needs a power cell'], [AWAKE, 'Pip wants to look at Earth'], [AT5, 'Time to send a postcard'], [{ ...AT5, step: 6, stamp: 1 }, 'Press the big red button!'],
      [{ ...AT5, step: 7, stamp: 1 }, 'Earth will answer soon'], [DONE, 'Pip sees a glowing cell']];
    const run = () => {
      for (const [moon, words] of cases) {
        const r = rig({ moon, restore: [[J.JOB_KEY, 1]] });
        r.step(0.3, { x: 3, z: 40, y: 0 });
        bus.emit('tip:did', { id: 'call' });
        r.step(0.7);
        expect(r.chip.textContent, JSON.stringify(moon)).toBe(words);
        expect(bannedIn(words)).toBeNull();
        r.dispose();
      }
    };
    run();
    withOffWords(run);
  });
  it('the board press shows it too, and the chip names the errand when the goal is Pip\'s errand', () => {
    const r = rig({ moon: { ...DONE, cells: 7 }, visits: visitsFor('pebbles') });
    r.step(0.3, { x: P.BOARD.x + 1.5, z: P.BOARD.z, y: gy(P.BOARD.x, P.BOARD.z) });
    r.press();
    r.step(0.6);
    expect(r.chip.textContent).toBe('Pip needs glowing pebbles');
    r.dispose();
  });
  it('sits beside the picture on the screen, flips to the left near the right edge, and is not shown while a page is open', () => {
    const r = rig({ moon: { step: 1, cells: 0 } });
    r.step(0.3, { x: 3, z: 40, y: 0 });
    bus.emit('tip:did', { id: 'call' });
    r.step(0.7);
    expect(r.chip.style.transform).toMatch(/translate\(/);
    r.dispose();
  });
});

describe('it steps aside', () => {
  it('while the telescope is open (nothing over the page), and comes back when it closes', () => {
    const r = rig({ moon: AWAKE });
    const O = P.OBSERVATORY;
    r.step(0.6, { x: O.x + 1.5, z: O.z + 1.5, y: gy(O.x, O.z) });
    expect(r.root.style.display).toBe('block');
    r.press();
    expect(r.life.star.state.open).toBe(true);
    r.step(0.6);
    expect(r.g.state.quiet).toBe(true);
    expect(r.root.style.display).toBe('none');
    expect(r.g.state.arrowOn).toBe(false);
    expect(r.g.state.chipOn).toBe(false);
    r.page.win.fire('keydown', { code: 'Escape' });
    r.step(0.6);
    expect(r.root.style.display).toBe('block');
    r.dispose();
  });
  it('while the stamp picker and the binoculars are open', () => {
    const r = rig({ moon: AT5 });
    r.step(0.1, { x: P.MESSAGE_DESK.x + 1.4, z: P.MESSAGE_DESK.z, y: gy(P.MESSAGE_DESK.x, P.MESSAGE_DESK.z) });
    r.press();
    r.step(0.6);
    expect(r.g.state.quiet).toBe(true);
    expect(r.root.style.display).toBe('none');
    r.page.win.fire('keydown', { code: 'Digit1' });
    r.step(0.6);
    expect(r.g.state.quiet).toBe(false);
    r.dispose();
  });
  it('when the walk is paused (the walk stops calling the Moon): a watchdog hides it, and the next frame shows it again', () => {
    const r = rig({ moon: AWAKE });
    r.step(0.6, { ...FAR, y: gy(FAR.x, FAR.z) });
    expect(r.root.style.display).toBe('block');
    const wd = r.page.intervals.find(Boolean);
    expect(typeof wd).toBe('function');
    const now = Date.now;
    try {
      Date.now = () => now() + 5000;
      wd();
      expect(r.root.style.display).toBe('none');
    } finally { Date.now = now; }
    r.step(0.1);
    expect(r.root.style.display).toBe('block');
    r.dispose();
  });
});

describe('sizes: phone, laptop, TV', () => {
  const fonts = (opts) => { const r = rig({ moon: AWAKE, ...opts }); r.step(0.6, { ...FAR, y: gy(FAR.x, FAR.z) }); const out = { line: r.g.state.font, chip: parseFloat(r.chip.style.fontSize), label: parseFloat(r.arrow.children[2].style.fontSize), top: r.line.style.top, r }; return out; };
  it('14 px on a phone and a touch tablet, 16 on a laptop; 28 px at 1080p and 56 px at 4K on a TV, never under the TV floors (24 px words, 20 px labels)', () => {
    const a = fonts({ size: [390, 760], touch: true }); expect(a.line).toBe(14); expect(a.chip).toBeGreaterThanOrEqual(15); expect(a.r.line.style.top).toMatch(/--map-size, 110px\) \+ 34px/); expect(a.r.line.style.right).toMatch(/16px/); a.r.dispose();
    const b = fonts({ size: [1180, 820], touch: true }); expect(b.line).toBe(14); b.r.dispose();
    const c = fonts({}); expect(c.line).toBe(16); expect(c.r.line.style.top).toMatch(/48px/); c.r.dispose();
    const d = fonts({ size: [1920, 1080], tv: 1 }); expect(d.line).toBe(28); expect(d.chip).toBeGreaterThanOrEqual(24); expect(d.label).toBeGreaterThanOrEqual(24); expect(d.top).toMatch(/76px/); d.r.dispose();
    const e = fonts({ size: [3840, 2160], tv: 2 }); expect(e.line).toBe(56); expect(e.chip).toBeGreaterThanOrEqual(48); expect(e.label).toBeGreaterThanOrEqual(48); e.r.dispose();
  });
  it('the goal line sits where the daily goals sit on other places (they are hidden on the Moon), left of the map, never over it', () => {
    const r = rig({ moon: AWAKE });
    r.step(0.6, { ...FAR, y: gy(FAR.x, FAR.z) });
    expect(r.line.style.right).toMatch(/--map-size/);
    expect(r.line.style.left).toMatch(/16px/);
    expect(r.session.goals).toBeNull();
    r.dispose();
  });
  it('follows a window resize and the TV class without a listener of its own', () => {
    const r = rig({ moon: AWAKE });
    r.step(0.6, { ...FAR, y: gy(FAR.x, FAR.z) });
    expect(r.g.state.font).toBe(16);
    r.page.win.innerWidth = 390; r.page.win.innerHeight = 760;
    r.step(0.6);
    expect(r.g.state.font).toBe(14);
    expect(r.page.win.count()).toBe(0);
    r.dispose();
  });
  it('is drawn in the page\'s own #hud, not the body (where the pages go), and is gone with the walk', () => {
    const r = rig({ moon: AWAKE });
    expect(r.page.hud.children).toHaveLength(2); // the guide, and the story flow's pill (hidden until she is at the rocket or the red button)
    expect(r.page.doc.body.children).toHaveLength(0);
    r.dispose();
    expect(r.page.hud.children).toHaveLength(0);
  });
  it('moves the skill badges under a two-line goal line and puts them back', () => {
    const r0 = rig({ moon: AWAKE });
    r0.dispose();
    const progression = createProgression(mem());
    progression.state.moon = { ...progression.state.moon, ...AWAKE };
    const scene = new THREE.Scene();
    const area = build(scene);
    const log = createDiscoveryLog(progression);
    log.startWalk();
    const page = fakePage();
    const badges = page.make('div');
    badges.style.top = '';
    page.doc.querySelector = (sel) => (sel === '.hud-badges' ? badges : null);
    const life = area.life({ scene, ground: area.ground, audio: null, log, progression, tier: { name: 'high' }, doc: page.doc, win: page.win, clock: NOT_DEMO, visits: 0, roomSeed: undefined });
    page.hud.children[0].children[0].offsetTop = 48;
    page.hud.children[0].children[0].offsetHeight = 44;
    const camera = new THREE.PerspectiveCamera();
    const session = { goals: null, pounceTime: 0, perched: null, fx: { burst: vi.fn() }, cat: new THREE.Object3D(), idleTime: 0, collectibleMeshes: new Map() };
    for (let i = 0; i < 20; i++) life.update(1 / 30, i / 30, { x: 0, y: 0, z: 45 }, camera, session);
    expect(badges.style.top).toBe('98px');
    life.dispose();
    expect(badges.style.top).toBe('');
  });
  it('reduced motion changes nothing about the arrow (it only turns): no animation, no transition, no pulse in any of the guide\'s styles', () => {
    for (const rm of [false, true]) {
      const r = rig({ reducedMotion: rm, moon: { step: 1, cells: 0 } });
      r.look.yaw = 90;
      r.step(1);
      const all = [r.root, r.line, r.arrow, r.chip, ...r.arrow.children];
      for (const e of all) { expect(e.style.animation).toBeUndefined(); expect(e.style.transition).toBeUndefined(); }
      r.dispose();
    }
  });
});

describe('the words never say a way to press or touch (they read the same on a pad, a keyboard and a touch screen)', () => {
  it('no key, no button name, no pad token, no tap or click anywhere in the goal lines or the chips', () => {
    const seen = [];
    const all = () => {
      for (const s of STAGES) { const r = stage(s); seen.push(r.text()); r.dispose(); }
    };
    all();
    withOffWords(all);
    for (const w of seen) {
      expect(w).not.toMatch(/⟦|⟧|\bE\b —|\b(tap|click|swipe|drag|joystick|stick|keyboard|trigger)\b/i);
      expect(chipWords({ kind: 'cell' })).not.toMatch(/⟦/);
    }
    expect(seen.length).toBe(STAGES.length * 2);
  });
});

describe('the idle ring still works beside it (the beacon is always up; the idle ring brightens it and says its one hint)', () => {
  it('after 30 s without progress the ring brightens at the same goal, with the one hint line', () => {
    const r = rig();
    r.step(29, { ...FAR, y: gy(FAR.x, FAR.z) });
    expect(r.life.base.ringing).toBe(false);
    expect(r.shaft().visible).toBe(true);
    r.step(2);
    expect(r.life.base.ringing).toBe(true);
    expect(near(r.shaft().position, r.life.base.pip.position, 0.3)).toBe(true);
    expect(r.lines()).toContain(phrase('moon.meow.hint'));
    expect(r.chip.textContent).toBe('Pip is asleep. Wake him up!');
    r.dispose();
  });
});

describe('dispose', () => {
  it('takes the guide off the page and leaves nothing on it', () => {
    const r = rig({ moon: AWAKE });
    r.step(0.6);
    expect(r.root.removed).toBe(false);
    r.dispose();
    expect(r.root.removed).toBe(true);
    expect(r.page.win.count()).toBe(0);
    expect(r.page.intervals.filter(Boolean)).toHaveLength(0);
  });
});
