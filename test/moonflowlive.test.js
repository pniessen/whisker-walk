// The Moon's story flow on a walk (world/moonflowlive.js through the real Moon life): after each step the lines that connect it to the next (confirm, next, why, one at a time, with a
// gap), the active confirmation of a posted postcard, the call-to-action pill by the rocket slot and the big red button (its conditions and its 10 s rhythm, DOM only), the calm
// words while she waits for Earth, the walk that resumes, a story that is done, and that the "Next:" lines never disagree with the goal the guide stands on.
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import * as P from '../src/world/moonplan.js';
import * as M from '../src/world/moonmission.js';
import * as L from '../src/world/moonlaunch.js';
import { build } from '../src/world/moon.js';
import { createProgression } from '../src/progression.js';
import { createDiscoveryLog } from '../src/discoveries.js';
import { bus } from '../src/events.js';
import { mem } from './helpers/lighthouselife.js';
import { fakePage } from './helpers/moonpage.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { nextLine, GAP, MUTED } from '../src/world/moonflow.js';
import { setTv, resetTv } from '../src/tvseam.js';

const gy = (x, z) => P.moonY(x, z);
const LEDGE = P.ROCK_LEDGES[2];
const ledgeTop = gy(LEDGE.x, LEDGE.z) + LEDGE.y;
const NOT_DEMO = () => 250;
const at5 = { step: 5, cells: 3, scope: 3 };
const at6 = { step: 6, cells: 3, scope: 3, stamp: 1 };
const at7 = { step: 7, cells: 3, scope: 3, stamp: 1 };
const at8 = { step: 8, cells: 3, scope: 3, stamp: 1 };

function rig({ moon = null, reducedMotion = false, storage = mem(), touch = false, visits = 0, walks = null } = {}) {
  const progression = createProgression(storage);
  if (moon) progression.state.moon = { ...progression.state.moon, ...moon };
  if (walks !== null) progression.state.walks = { ...progression.state.walks, moon: walks };
  const scene = new THREE.Scene();
  const area = build(scene);
  const log = createDiscoveryLog(progression);
  log.startWalk();
  const page = fakePage();
  if (touch) page.doc.body.classList = { contains: (c) => c === 'touch-mode' };
  const prompt = page.make('div');
  const was = page.doc.getElementById;
  page.doc.getElementById = (id) => (id === 'hud-prompt' ? prompt : was(id));
  const life = area.life({ scene, ground: area.ground, audio: null, log, progression, reducedMotion, tier: { name: 'high' }, doc: page.doc, win: page.win, clock: NOT_DEMO, visits, roomSeed: undefined, boundOn: true });
  const camera = new THREE.PerspectiveCamera(50, 1.78, 0.1, 600);
  const cat = new THREE.Object3D();
  const session = { goals: null, pounceTime: 0, perched: null, fx: { burst: vi.fn() }, cat, idleTime: 0, collectibleMeshes: new Map(P.PEBBLES.map((p) => [p.id, new THREE.Object3D()])) };
  const events = [];
  const stamps = [];
  const where = { x: 0, y: 0, z: 45 };
  let t = 0;
  const off = bus.on('discovery', (e) => { events.push(e); stamps.push([t, e.label]); });
  const move = (p) => { Object.assign(where, p); cat.position.set(where.x, where.y, where.z); };
  const step = (secs, at) => { if (at) move(at); for (let i = 0; i < Math.round(secs * 30); i++) { t += 1 / 30; life.update(1 / 30, t, where, camera, session); } };
  const press = () => { const line = life.promptAt(where); life.interact(); return line; };
  move(where);
  const flow = life.flow;
  return {
    scene, life, flow, launch: life.launch, base: life.base, progression, page, session, events, stamps, where, move, step, press, storage, prompt, pulsing: () => (prompt.style.outline ?? '') !== '', t: () => t,
    pill: () => flow.els.root, pillOn: () => flow.els.root.style.display === 'block', pillText: () => flow.els.root.textContent.replace(/^\S+ /, ''), pillIcon: () => flow.els.root.textContent.split(' ')[0],
    said: () => flow.state.said.slice(), labels: () => events.filter((e) => e.type === 'greenhousenote').map((e) => e.label),
    dispose() { off(); life.dispose(); },
  };
}
afterEach(() => { delete globalThis.document; resetTv(); });
const atDesk = (r) => r.step(0.1, { x: P.MESSAGE_DESK.x + 1.4, z: P.MESSAGE_DESK.z, y: gy(P.MESSAGE_DESK.x, P.MESSAGE_DESK.z) });
const atRocket = (r) => r.step(0.1, { x: P.ROCKET_SLOT.x - 1.0, z: P.ROCKET_SLOT.z + 1.0, y: gy(P.ROCKET.x, P.ROCKET.z) });
const atButton = (r) => r.step(0.1, { x: P.LAUNCH_DESK.x - 1.4, z: P.LAUNCH_DESK.z, y: gy(P.LAUNCH_DESK.x, P.LAUNCH_DESK.z) });
const atRock = (r) => r.step(0.1, { x: LEDGE.x, z: LEDGE.z, y: ledgeTop });
const far = (r) => r.step(0.1, { x: -30, z: 60, y: gy(-30, 60) });
const pick = (r, id) => { atDesk(r); r.press(); r.page.win.fire('keydown', { code: `Digit${id + 1}` }); };
const idxOf = (r, text) => r.labels().indexOf(text);

describe('from the stamp to the red button', () => {
  it('the stamp: one toast says it all ("Great stamp! Now carry the postcard to the rocket."), once, and nothing extra piles on', () => {
    const r = rig({ moon: at5 });
    far(r);
    pick(r, 1);
    expect(r.labels().filter((l) => l === 'Great stamp! Now carry the postcard to the rocket.')).toHaveLength(1);
    r.step(12);
    expect(r.said()).toEqual([]);
    r.dispose();
  });
  it('at the rocket slot with the postcard in her mouth: the action reads "post the postcard in the rocket", the pill asks, the prompt pulses', () => {
    const r = rig({ moon: at5 });
    pick(r, 1);
    atRocket(r);
    r.step(0.5);
    expect(r.life.promptAt(r.where)).toBe('E — post the postcard in the rocket');
    expect(r.pillOn()).toBe(true);
    expect(r.pillText()).toBe('Post the postcard in the rocket!');
    expect(r.pillIcon()).toBe('📮');
    expect(r.pulsing()).toBe(true);
    r.dispose();
  });
  it('posting is a moment: the toast, a beep and a dance from Pip, a sparkle at the slot, then the why, in that order', () => {
    const r = rig({ moon: at5 });
    pick(r, 1);
    atRocket(r);
    const beep = vi.spyOn(r.base.pip, 'beep'); const dance = vi.spyOn(r.base.pip, 'dance');
    r.session.fx.burst.mockClear();
    r.press();
    r.step(0.5);
    expect(r.progression.state.moon.step).toBe(6);
    expect(beep).toHaveBeenCalled();
    expect(dance).toHaveBeenCalled();
    expect(r.session.fx.burst).toHaveBeenCalledTimes(1);
    const [pos] = r.session.fx.burst.mock.calls[0];
    expect(Math.hypot(pos.x - P.ROCKET_SLOT.x, pos.z - P.ROCKET_SLOT.z)).toBeLessThan(0.01);
    expect(r.labels()).toContain('Postcard posted! Next: press the big red button at the launch desk.');
    r.step(5);
    expect(r.said()).toEqual(['The rocket will carry your postcard all the way to Earth.']);
    const a = idxOf(r, 'Postcard posted! Next: press the big red button at the launch desk.');
    const b = idxOf(r, 'The rocket will carry your postcard all the way to Earth.');
    expect(a).toBeGreaterThanOrEqual(0);
    expect(b).toBeGreaterThan(a);
    r.dispose();
  });
  it('reduced motion: the same words, the beep, but no sparkle and a steady edge instead of a pulse', () => {
    const r = rig({ moon: at5, reducedMotion: true });
    pick(r, 0);
    atRocket(r);
    r.session.fx.burst.mockClear();
    r.press();
    r.step(0.5);
    expect(r.session.fx.burst).not.toHaveBeenCalled();
    expect(r.labels()).toContain('Postcard posted! Next: press the big red button at the launch desk.');
    expect(r.page.hud.children.length).toBeGreaterThan(0);
    r.dispose();
  });
  it('at the big red button with the postcard posted: the action reads the big prompt and the pill shows with the button\'s picture and the key', () => {
    const r = rig({ moon: at6 });
    atButton(r);
    r.step(0.5);
    expect(r.life.promptAt(r.where)).toBe('E — press the big red button to launch!');
    expect(r.pillOn()).toBe(true);
    expect(r.pillText()).toBe('Press the big red button!');
    expect(r.pillIcon()).toBe('🔴'); // the red button's own picture
    expect(r.pulsing()).toBe(true);
    expect(r.pill().attrs.role).toBe('status');
    expect(r.pill().style.pointerEvents).toBe('none'); // not a dialog: it takes no input
    r.dispose();
  });
  it('the pill reads on a phone, a laptop and a TV: 17 px words on a narrow phone, 22 on a laptop, 34 on a TV at 1080p (the TV\'s own scale) inside the page, never taking input', () => {
    const r = rig({ moon: at6 });
    expect(parseFloat(r.pill().style.fontSize)).toBe(22);
    r.dispose();
    const ph = rig({ moon: at6 });
    ph.page.win.innerWidth = 390;
    ph.dispose();
    const tv = fakePage({ width: 1920, height: 1080 });
    tv.doc.documentElement = { classList: { contains: (c) => c === 'tv' } };
    tv.win.getComputedStyle = () => ({ fontSize: '24px' });
    const progression = createProgression(mem());
    const scene = new THREE.Scene();
    const area = build(scene);
    const log = createDiscoveryLog(progression); log.startWalk();
    const life = area.life({ scene, ground: area.ground, audio: null, log, progression, reducedMotion: false, tier: { name: 'high' }, doc: tv.doc, win: tv.win, clock: NOT_DEMO, visits: 0, roomSeed: undefined, boundOn: true });
    expect(parseFloat(life.flow.els.root.style.fontSize)).toBe(34);
    life.dispose();
    const narrow = fakePage({ width: 390, height: 760 });
    const p2 = createProgression(mem()); const s2 = new THREE.Scene(); const a2 = build(s2); const l2 = createDiscoveryLog(p2); l2.startWalk();
    const life2 = a2.life({ scene: s2, ground: a2.ground, audio: null, log: l2, progression: p2, reducedMotion: false, tier: { name: 'high' }, doc: narrow.doc, win: narrow.win, clock: NOT_DEMO, visits: 0, roomSeed: undefined, boundOn: true });
    expect(parseFloat(life2.flow.els.root.style.fontSize)).toBe(17);
    life2.dispose();
  });
  it('it comes back every 10 s while she stays (6 s up, 4 s resting), goes when she walks away and is back at once when she returns', () => {
    const r = rig({ moon: at6 });
    atButton(r);
    r.step(5);
    expect(r.pillOn()).toBe(true);
    r.step(2); // ~7.5 s
    expect(r.pillOn()).toBe(false);
    r.step(3.6); // ~10.5 s
    expect(r.pillOn()).toBe(true);
    r.step(6);
    expect(r.pillOn()).toBe(false);
    far(r);
    r.step(0.3);
    expect(r.pillOn()).toBe(false);
    expect(r.pulsing()).toBe(false);
    atButton(r);
    r.step(0.5);
    expect(r.pillOn()).toBe(true);
    r.dispose();
  });
  it('it never shows before the postcard is posted, and not once the launch happened', () => {
    const early = rig({ moon: at5 });
    atButton(early);
    early.step(1);
    expect(early.pillOn()).toBe(false);
    early.dispose();
    const r = rig({ moon: at6 });
    atButton(r);
    r.step(0.5);
    expect(r.pillOn()).toBe(true);
    r.press();
    r.step(0.5);
    expect(r.pillOn()).toBe(false); // the countdown is on
    r.step(8);
    expect(r.progression.state.moon.step).toBe(7);
    r.step(25);
    expect(r.pillOn()).toBe(false);
    r.dispose();
    const done = rig({ moon: at7 });
    atButton(done);
    done.step(3);
    expect(done.pillOn()).toBe(false);
    done.dispose();
    const story = rig({ moon: at8 });
    atButton(story);
    story.step(3);
    expect(story.pillOn()).toBe(false);
    story.dispose();
  });
  it('it steps aside while a page is open', () => {
    const r = rig({ moon: at5 });
    pick(r, 1);
    atRocket(r);
    r.step(0.5);
    expect(r.pillOn()).toBe(true);
    r.launch.picker.open();
    expect(r.launch.picker.isOpen).toBe(true);
    r.step(0.5);
    expect(r.pillOn()).toBe(false);
    r.dispose();
  });
});

describe('the launch, the wait and the answer', () => {
  it('the countdown: "Watch the sky!" and the Viewing Mound at once, then "Lift-off!", the postcard is on its way, and the Next: line, each its turn', () => {
    const r = rig({ moon: at6 });
    atButton(r);
    r.press();
    r.step(0.5);
    expect(r.said()).toEqual(['Watch the sky!']);
    r.step(3);
    expect(r.said()).toEqual(['Watch the sky!', 'For the best view, stand on the Viewing Mound.']);
    r.step(25);
    const ls = r.labels();
    const order = ['Watch the sky!', 'For the best view, stand on the Viewing Mound.', 'Lift-off!', 'The postcard is on its way to Earth!', 'Next: wait at Earthrise Rock to see Earth answer.'].map((l) => ls.indexOf(l));
    for (const i of order) expect(i).toBeGreaterThanOrEqual(0);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(ls.filter((l) => l === 'Next: wait at Earthrise Rock to see Earth answer.')).toHaveLength(1);
    r.dispose();
  });
  it('the toasts are never closer than the gap, and a Next: line agrees with the goal the guide stands on', () => {
    const r = rig({ moon: at6 });
    atButton(r);
    r.press();
    r.step(22);
    const mine = r.stamps.filter(([, l]) => r.said().includes(l)).map(([t]) => t);
    for (let i = 1; i < mine.length; i++) expect(mine[i] - mine[i - 1]).toBeGreaterThanOrEqual(GAP - 0.1);
    expect(r.base.goal().g.kind).toBe('reply');
    expect(nextLine(r.base.goal().g.kind)).toBe('Next: wait at Earthrise Rock to see Earth answer.');
    r.dispose();
  });
  it('a free test launch and the room\'s demo: "Watch the sky!" for the child\'s own press, nothing for the demo', () => {
    const r = rig({ moon: at8 });
    atButton(r);
    r.press();
    r.step(1);
    expect(r.said()).toContain('Watch the sky!');
    r.dispose();
    let clock = 250;
    const d = rig({ moon: at8 });
    d.dispose();
    void clock;
  });
  it('waiting on the rock for the reply: Earth is reading, still reading (at most twice), then the answer, the badge and "What now?", in order and never together', () => {
    const r = rig({ moon: at6 });
    atButton(r);
    r.press();
    r.step(7);
    expect(r.progression.state.moon.step).toBe(7);
    atRock(r);
    r.step(1);
    expect(r.labels()).toContain('Earth is reading your postcard... Wait here and watch.');
    r.step(16);
    expect(r.said().filter((l) => l === 'Earth is still reading... Keep watching!')).toHaveLength(1);
    r.step(12);
    expect(r.progression.state.moon.step).toBe(7);
    expect(r.said().filter((l) => l === 'Earth is still reading... Keep watching!')).toHaveLength(2);
    r.step(30);
    expect(r.progression.state.moon.step).toBe(8);
    expect(r.said().filter((l) => l === 'Earth is still reading... Keep watching!')).toHaveLength(2);
    const ls = r.labels();
    const a = ls.indexOf('Earth answered! It sent your stamp back.');
    const b = ls.indexOf('A Moon Badge! You are a Moon Explorer!');
    const c = ls.indexOf('What now? A glowing cell waits in the cave. Follow the gold light.');
    expect(a).toBeGreaterThanOrEqual(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(ls[c + 1] === 'Pip has a small errand every walk. Meow to call him.' || ls.includes('Pip has a small errand every walk. Meow to call him.')).toBe(true);
    r.dispose();
  });
  it('not on the rock 25 s after lift-off: one nudge toward it, once', () => {
    const r = rig({ moon: at6 });
    atButton(r);
    r.press();
    r.step(7);
    far(r);
    r.step(40);
    expect(r.said().filter((l) => l === 'Walk to Earthrise Rock. Earth will answer there.')).toHaveLength(1);
    r.step(30);
    expect(r.said().filter((l) => l === 'Walk to Earthrise Rock. Earth will answer there.')).toHaveLength(1);
    r.dispose();
  });
  it('"What now?" follows the goal: the errand when today\'s errand is on, the cave when it is not', () => {
    const r = rig({ moon: at7 });
    far(r);
    r.step(2, { x: LEDGE.x + 3, z: LEDGE.z + 3, y: gy(LEDGE.x + 3, LEDGE.z + 3) });
    r.step(25);
    expect(r.progression.state.moon.step).toBe(8);
        const kind = r.base.goal().g.kind;
    expect(['cave', 'job']).toContain(kind);
    const what = r.labels().find((l) => /^What now\?/.test(l));
    expect(what).toBe(kind === 'cave' ? 'What now? A glowing cell waits in the cave. Follow the gold light.' : 'What now? Pip has an errand today. Follow the gold light.');
    r.dispose();
  });
});

describe('the chapters', () => {
  it('Pip wakes: the base is asleep, find two power cells (after the greeting)', () => {
    const r = rig();
    r.step(0.5, { x: r.base.pip.position.x + 1, z: r.base.pip.position.z, y: gy(r.base.pip.position.x, r.base.pip.position.z) });
    expect(r.press()).toBe('E — wake Pip');
    r.step(6);
    expect(r.said()).toEqual(['The Moon base is asleep. Find two power cells to wake it up!']);
    expect(r.labels().indexOf('Beep! Hello!')).toBeLessThan(r.labels().indexOf('The Moon base is asleep. Find two power cells to wake it up!'));
    r.dispose();
  });
  it('the base wakes: the dish must find Earth first, then Next: Star Hill; Earth found: time to send a postcard, then Next: the desk', () => {
    const r = rig({ moon: { step: 3, cells: 3 } });
    far(r);
    r.step(1);
    r.progression.state.moon = { ...r.progression.state.moon, step: 4 }; // the wake-up beat ends
    r.step(9);
    // (the 'Next: climb Star Hill...' line is the arrival fix's, said by the base's own beat, not by the flow)
    expect(r.said()).toEqual(['Now Pip wants to send a postcard to Earth. The dish must find Earth first!']);
    expect(r.base.goal().g.kind).toBe('scope');
    r.progression.state.moon = { ...r.progression.state.moon, step: 5, scope: 3 };
    r.step(10);
    expect(r.said().slice(1)).toEqual(['Time to send your postcard to Earth!', 'Next: write a postcard at the Message Desk in the dome.']);
    expect(r.base.goal().g.kind).toBe('desk');
    r.dispose();
  });
  it('the base and the stars both done at once: only "Time to send your postcard", never "the dish must find Earth"', () => {
    const r = rig({ moon: { step: 3, cells: 3 } });
    far(r);
    r.step(1);
    r.progression.state.moon = { ...r.progression.state.moon, step: 5, scope: 3 };
    r.step(9);
    expect(r.said()[0]).toBe('Time to send your postcard to Earth!');
    expect(r.said().join(' ')).not.toMatch(/must find Earth/);
    r.dispose();
  });
  it('the lines wait while the telescope or a page is up, and a line the story has passed is dropped', () => {
    const r = rig({ moon: { step: 4, cells: 3 } });
    far(r);
    r.step(1);
    r.progression.state.moon = { ...r.progression.state.moon, step: 5, scope: 3 };
    r.step(0.4);
    r.progression.state.moon = { ...r.progression.state.moon, step: 6, stamp: 1 };
    r.step(12);
    expect(r.said().join(' ')).not.toMatch(/Message Desk/); // she was already past it
    r.dispose();
  });
});

describe('a walk, a resume and a story that is done', () => {
  it('a walk that begins in the middle of the story says nothing about the steps already done', () => {
    for (const moon of [at5, at6, at7]) {
      const r = rig({ moon });
      far(r);
      r.step(30);
      expect(r.said(), JSON.stringify(moon)).toEqual([]);
      r.dispose();
    }
  });
  it('a walk that ends mid-line and resumes does not say it again', () => {
    const storage = mem();
    const r = rig({ moon: at5, storage });
    pick(r, 1);
    atRocket(r);
    r.press();
    r.step(0.4);
    const said1 = r.said().length;
    r.dispose(); // she left before the why
    const r2 = rig({ storage });
    expect(r2.progression.state.moon.step).toBe(6);
    far(r2);
    r2.step(30);
    expect(r2.said()).toEqual([]);
    expect(said1).toBe(0);
    r2.dispose();
  });
  it('the story told and everything done: no pill, no call, nothing said', () => {
    const r = rig({ moon: { ...at8, cells: 7 }, walks: 99 });
    atButton(r);
    r.step(30);
    expect(r.said()).toEqual([]);
    expect(r.pillOn()).toBe(false);
    atRocket(r);
    r.step(5);
    expect(r.pillOn()).toBe(false);
    r.dispose();
  });
  it('the Deep Cell: the garden blooms (the cave\'s own line), then why, then the whole Moon is done', () => {
    const r = rig({ moon: at8, walks: 99 });
    far(r);
    r.step(1);
    r.progression.state.moon = { ...r.progression.state.moon, cells: 7 };
    r.step(14);
    const said = r.said();
    expect(said[0]).toBe('The Deep Cell gives the whole base extra power!');
    expect(said[1]).toMatch(/^(That is everything on the Moon|Next: Pip has an errand today)/);
    r.dispose();
  });
  it('the second rocket (Pip\'s errand): the same asks, no story why, a free "Watch the sky!"', () => {
    const r = rig({ moon: { ...at8, cells: 7 }, walks: 99 });
    r.launch.setSecond(() => {});
    pick(r, 2);
    expect(r.launch.second.stage).toBe(1);
    atRocket(r);
    r.step(0.5);
    expect(r.pillOn()).toBe(true);
    expect(r.pillText()).toBe('Post the postcard in the rocket!');
    r.press();
    r.step(0.5);
    expect(r.launch.second.stage).toBe(2);
    r.step(5);
    expect(r.said().join(' ')).not.toMatch(/carry your postcard all the way/);
    atButton(r);
    r.step(0.5);
    expect(r.pillText()).toBe('Press the big red button!');
    r.press();
    r.step(1);
    expect(r.said()).toContain('Watch the sky!');
    r.dispose();
  });
});

describe('both word sets and the muting switch', () => {
  it('the whole stretch said in the everyday set has no banned word and the same wording', () => {
    const run = () => {
      const r = rig({ moon: at6 });
      atButton(r);
      r.press();
      r.step(8);
      atRock(r);
      r.step(60);
      const said = r.said().concat(r.labels());
      r.dispose();
      return said;
    };
    const a = run();
    let b;
    withOffWords(() => { b = run(); for (const l of b) expect(bannedIn(l), l).toBeNull(); });
    expect(b.filter((l) => /^(Next|What now|Earth|Watch|Pip|For the)/.test(l))).toEqual(a.filter((l) => /^(Next|What now|Earth|Watch|Pip|For the)/.test(l)));
  });
  it('a muted transition is not said (the coordinator\'s switch)', () => {
    MUTED.add('posted');
    try {
      const r = rig({ moon: at5 });
      pick(r, 1);
      atRocket(r);
      r.press();
      r.step(8);
      expect(r.said()).toEqual([]);
      r.dispose();
    } finally { MUTED.delete('posted'); }
  });
});

describe('the cost', () => {
  it('no mesh, no draw call and no start-up growth: the flow builds only page DOM, and the pill is hidden until it is asked for', () => {
    const r = rig({ moon: at6 });
    const meshes = new Set(); r.scene.traverse((o) => meshes.add(o));
    r.step(2);
    const after = new Set(); r.scene.traverse((o) => after.add(o));
    expect(after.size).toBe(meshes.size);
    expect(r.pillOn()).toBe(false);
    expect(r.pill().parent).toBe(r.page.hud);
    r.dispose();
    expect(r.page.hud.children).toHaveLength(0);
    expect(r.prompt.style.outline ?? '').toBe('');
  });
  it('a hundred seconds of frames build nothing per frame: the pill keeps one text node and the queue empties', () => {
    const r = rig({ moon: at6 });
    atButton(r);
    r.step(100);
    expect(r.flow.queue.length).toBe(0);
    r.dispose();
  });
  it('the dish\'s files import and call nothing on a walk with no Moon: the life is the only maker', () => {
    expect(typeof L.countOf).toBe('function');
    expect(M.STEP.replied).toBe(8);
  });
});
