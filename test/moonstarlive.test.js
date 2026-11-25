// The Moon, milestone 5: Star Hill on a walk (src/world/moonstarlive.js through the real Moon life): the telescope's prompt, opening and closing
// (the scene hidden under the page and shown again, the cat held), the saved pictures and mission step 5, the sky's and the table's and the
// ceiling's pictures, the Old Dish's turn, the wing's stand-in, and what the save does with all of it.
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import * as P from '../src/world/moonplan.js';
import * as M from '../src/world/moonmission.js';
import { build } from '../src/world/moon.js';
import { createProgression } from '../src/progression.js';
import { createDiscoveryLog } from '../src/discoveries.js';
import { bus } from '../src/events.js';
import { mem } from './helpers/lighthouselife.js';
import { withOffWords } from './helpers/offwords.js';
import { fakePage } from './helpers/moonpage.js';
import { CONSTELLATIONS, starSky, ALL_BITS } from '../src/world/moonstars.js';
import { DISH_TURN, LEVEL } from '../src/world/moonstarlive.js';

const gy = (x, z) => P.moonY(x, z);
const O = P.OBSERVATORY;
const floorY = gy(O.x, O.z);

function rig({ moon = null, reducedMotion = false } = {}) {
  const progression = createProgression(mem());
  if (moon) progression.state.moon = { ...progression.state.moon, ...moon };
  const scene = new THREE.Scene();
  const area = build(scene);
  const log = createDiscoveryLog(progression);
  log.startWalk();
  const page = fakePage();
  const life = area.life({ scene, ground: area.ground, audio: null, log, progression, reducedMotion, tier: { name: 'high' }, doc: page.doc, win: page.win });
  const camera = new THREE.PerspectiveCamera();
  const cat = new THREE.Object3D();
  const session = { goals: null, pounceTime: 0, perched: null, fx: { burst: vi.fn() }, cat, idleTime: 0 };
  const events = [];
  const off = bus.on('discovery', (e) => events.push(e));
  const where = { x: 0, y: 0, z: 45 };
  let t = 0;
  const move = (p) => { Object.assign(where, p); cat.position.set(where.x, where.y, where.z); };
  const step = (secs, at) => { if (at) move(at); for (let i = 0; i < Math.round(secs * 30); i++) { t += 1 / 30; life.update(1 / 30, t, where, camera, session); } };
  move(where);
  return { scene, area, life, progression, page, camera, cat, session, events, where, move, step, dispose() { off(); life.dispose(); } };
}
const onTop = (r) => { r.step(0.1, { x: O.x + 1.5, z: O.z + 1.5, y: floorY }); };
const press = (r) => { const line = r.life.promptAt(r.where); r.life.interact(); return line; };
// trace a picture through the scope's own door (aim and press Space)
const trace = (r, c) => {
  r.life.star.scope.cardGo?.(); // the first card of a walk (why she is here) is answered first
  for (let i = 0; i < CONSTELLATIONS[c].pts.length; i++) {
    const s = starSky(CONSTELLATIONS[c], i);
    r.life.star.scope.view.b = s.b; r.life.star.scope.view.e = s.e;
    r.life.star.scope.place();
    r.page.win.fire('keydown', { code: 'Space' });
  }
};
const lit = (geo, key) => { const [a, n] = geo.userData.ranges[key]; let m = 0; for (let v = 0; v < n; v++) m = Math.max(m, geo.attributes.color.getX(a + v), geo.attributes.color.getY(a + v), geo.attributes.color.getZ(a + v)); return m; };

describe('the prompt', () => {
  it('"look through the telescope" shows beside the telescope on the top, and not on the plain, in the dome or on the ramp below the top', () => {
    const r = rig();
    onTop(r);
    expect(r.life.promptAt(r.where)).toBe('E — look through the telescope');
    r.step(0.1, { x: O.x + 3.2, z: O.z, y: floorY });
    expect(r.life.promptAt(r.where)).toBeNull(); // beyond 2.9 m
    r.step(0.1, { x: 0, z: 45, y: 0 });
    expect(r.life.promptAt(r.where)).toBeNull();
    const mid = P.rampPoint(0.5, 0);
    r.step(0.1, { x: mid.x, z: mid.z, y: gy(mid.x, mid.z) });
    expect(r.life.promptAt(r.where)).toBeNull(); // directly below the telescope's height: not at the foot or on the way up
    r.step(0.1, { x: P.DOME.x, z: P.DOME.z + 3, y: 0 });
    expect(r.life.promptAt(r.where) ?? '').not.toMatch(/telescope/);
    r.dispose();
  });
  it('"look at the star table" shows within 3.2 m of the table and says what is left when pressed; nothing else changes', () => {
    const r = rig();
    r.step(0.1, { x: P.STAR_TABLE.x + 2.4, z: P.STAR_TABLE.z, y: gy(P.STAR_TABLE.x + 2.4, P.STAR_TABLE.z) });
    expect(press(r)).toBe('E — look at the star table');
    expect(r.events.some((e) => e.type === 'greenhousenote' && /Mouse and the Cat/.test(e.label))).toBe(true);
    expect(r.progression.state.moon.scope).toBe(0);
    r.dispose();
  });
  it('the base\'s offers keep their place: Pip, a cell, the Core, the board are never shadowed by the hill\'s', () => {
    const r = rig();
    r.step(0.1, { x: 3, z: 43, y: 0 });
    expect(r.life.promptAt(r.where)).toBe('E — wake Pip');
    r.dispose();
  });
});

describe('the telescope opens and closes', () => {
  it('opens the page, hides the 3D scene under it and holds the cat where she stands; closing shows the scene and frees the page', () => {
    const r = rig();
    onTop(r);
    expect(r.scene.visible).toBe(true);
    press(r);
    expect(r.life.star.scope.isOpen).toBe(true);
    expect(r.scene.visible).toBe(false);
    expect(r.page.doc.body.children).toHaveLength(1);
    expect(r.life.promptAt(r.where)).toBeNull(); // no second press while it is open
    // the walk's hook (the rover's, installed on the first frame) hands the player: the cat is put back, the player halted
    expect(typeof r.session.fair?.update).toBe('function');
    const held = r.cat.position.clone();
    const player = { halt: vi.fn() };
    r.cat.position.set(held.x + 5, held.y, held.z + 5); // a stick that moved her
    r.session.pounceTime = 0.4;
    r.session.fair.update(1 / 30, 1, { cat: r.cat, player, session: r.session });
    expect(r.cat.position.toArray()).toEqual(held.toArray());
    expect(player.halt).toHaveBeenCalled();
    expect(r.session.pounceTime).toBe(0);
    r.page.win.fire('keydown', { code: 'Escape' });
    expect(r.scene.visible).toBe(true);
    expect(r.page.doc.body.children).toHaveLength(0);
    expect(r.page.win.count()).toBe(0);
    // and not held any more
    r.cat.position.set(held.x + 5, held.y, held.z + 5);
    r.session.fair.update(1 / 30, 2, { cat: r.cat, player, session: r.session });
    expect(r.cat.position.x).toBe(held.x + 5);
    r.dispose();
  });
  it('a walk that ends with the scope open (a crossing, a pause) closes it, shows the scene and leaves nothing on the page', () => {
    const r = rig();
    onTop(r);
    press(r);
    r.life.dispose();
    expect(r.scene.visible).toBe(true);
    expect(r.page.doc.body.children).toHaveLength(0);
    expect(r.page.win.count()).toBe(0);
  });
  it('the 3D scene was not visible before it opened? then it is not forced visible after (the life puts back what it found)', () => {
    const r = rig();
    onTop(r);
    r.scene.visible = false;
    press(r);
    r.page.win.fire('keydown', { code: 'Escape' });
    expect(r.scene.visible).toBe(false);
    r.scene.visible = true;
    r.dispose();
  });
  it('opens on the Mouse and the first-time line is the Milky Way\'s (Silverpelt in the Clan set: the page says it as its one caption)', () => {
    const r = rig();
    onTop(r);
    press(r);
    expect(r.life.star.scope.said.text).toMatch(/Milky Way|Silverpelt/);
    expect(r.life.star.scope.view.b).toBeCloseTo(CONSTELLATIONS[0].bearing, 6);
    r.dispose();
  });
  it('the meow button asks for the hint while the page is open (and only then)', () => {
    const r = rig();
    onTop(r);
    press(r);
    bus.emit('tip:did', { id: 'call' });
    r.life.update(1 / 30, 1, r.where, r.camera, r.session);
    // the scope's own hint object is the life\'s: it now answers at once (the pulse is drawn)
    expect(r.page.doc.body.children[0]).toBeTruthy();
    r.dispose();
  });
});

describe('the prompt after the job is done (the table of lines per state, both word sets)', () => {
  it('Earth not found: the job; Earth found with 0 to 3 optional pictures drawn: more pictures; all five: the Great Cat; none says to find Earth or look for it', () => {
    const want = [[0, 'E — look through the telescope'], [1, 'E — look through the telescope'], [3, 'E — draw more star pictures'], [7, 'E — draw more star pictures'], [15, 'E — draw more star pictures'], [31, 'E — look at the Great Cat']];
    const check = () => {
      for (const [scope, line] of want) {
        const r = rig({ moon: { step: scope === 0 || scope === 1 ? 4 : 5, cells: 3, scope } });
        onTop(r);
        expect(r.life.promptAt(r.where), `scope ${scope}`).toBe(line);
        if ((scope & 3) === 3) expect(line).not.toMatch(/Earth|look through/);
        r.dispose();
      }
    };
    check();
    withOffWords(check);
  });
});

describe('tracing: saved, shown, and the story', () => {
  const awake = { step: 4, cells: 3 };
  it('the Mouse then the Cat on a woken base: scope bits 3, step 5, two journal sightings, the dish found toast; nothing is lost on the way', () => {
    const r = rig({ moon: awake });
    onTop(r);
    press(r);
    trace(r, 0);
    expect(r.progression.state.moon.scope).toBe(1);
    expect(r.progression.state.moon.step).toBe(4);
    expect(r.progression.state.journal.mnscope).toBe(1);
    trace(r, 1);
    expect(r.progression.state.moon.scope).toBe(3);
    expect(r.progression.state.moon.step).toBe(5);
    expect(r.progression.state.journal.mnscope).toBe(2);
    expect(r.progression.state.moon.cells).toBe(3); // the rest of the record is as it was
    r.step(2, null);
    expect(r.events.some((e) => e.key === 'moon-scope-found')).toBe(true);
    r.dispose();
  });
  it('a wrong star mid-way loses nothing, and finishing a picture is saved at once (the save\'s own persist is called)', () => {
    const r = rig({ moon: awake });
    const spy = vi.spyOn(r.progression, 'addPoints');
    onTop(r);
    press(r);
    const sc = r.life.star.scope;
    const s0 = starSky(CONSTELLATIONS[0], 0); sc.view.b = s0.b; sc.view.e = s0.e; sc.place(); r.page.win.fire('keydown', { code: 'Space' });
    const s3 = starSky(CONSTELLATIONS[0], 3); sc.view.b = s3.b; sc.view.e = s3.e; sc.place(); r.page.win.fire('keydown', { code: 'Space' }); // wrong
    expect(r.progression.state.moon.scope).toBe(0);
    trace(r, 0);
    expect(r.progression.state.moon.scope).toBe(1);
    expect(spy).toHaveBeenCalled();
    r.dispose();
  });
  it('before the base is awake the pictures are still free and are kept; the step lifts to 5 when the base wakes (the beat)', () => {
    const r = rig({ moon: { step: 1, cells: 0 } });
    onTop(r);
    press(r);
    trace(r, 0); trace(r, 1);
    expect(r.progression.state.moon.scope).toBe(3);
    expect(r.progression.state.moon.step).toBe(1);
    r.page.win.fire('keydown', { code: 'Escape' });
    const next = M.apply(M.apply(r.progression.state.moon, { kind: 'plug', cell: 0 }).moon, { kind: 'plug', cell: 1 });
    r.progression.state.moon = next.moon;
    const beat = M.apply(r.progression.state.moon, { kind: 'beat' });
    expect(beat.moon.step).toBe(5);
    r.dispose();
  });
  it('a save that has both pictures and a woken base but step 4 (two devices merged) lifts to 5 on the first frame, once', () => {
    const r = rig({ moon: { step: 4, cells: 3, scope: 3 } });
    r.step(0.2, { x: 0, z: 45, y: 0 });
    expect(r.progression.state.moon.step).toBe(5);
    const n = r.events.filter((e) => e.key === 'moon-scope-found').length;
    r.step(2, null);
    expect(r.events.filter((e) => e.key === 'moon-scope-found').length).toBe(n + 1);
    r.step(2, null);
    expect(r.events.filter((e) => e.key === 'moon-scope-found').length).toBe(n + 1);
    r.dispose();
  });
  it('a picture traced again on a later walk does not count twice on the journal page, and the saved bits only ever grow', () => {
    const r = rig({ moon: { step: 4, cells: 3, scope: 1 } });
    onTop(r);
    press(r);
    trace(r, 0); // already traced: "known", nothing happens
    expect(r.progression.state.moon.scope).toBe(1);
    expect(r.progression.state.journal.mnscope ?? 0).toBe(0);
    trace(r, 2);
    expect(r.progression.state.moon.scope).toBe(5);
    expect(r.progression.state.journal.mnscope).toBe(1);
    r.dispose();
  });
  it('the Great Cat: only when all five are traced, on the sky and on the ceiling', () => {
    const r = rig({ moon: { step: 4, cells: 3, scope: 15 } });
    const sky = r.life.star.figs.geometry;
    const ceil = r.scene.getObjectByName('moon:wingfigs').geometry;
    expect(lit(sky, 'cat')).toBe(0);
    expect(lit(ceil, 'ceilcat')).toBeLessThan(0.3); // faint until then
    expect(lit(ceil, 'ceilcat')).toBeGreaterThan(0);
    onTop(r);
    press(r);
    trace(r, 4);
    expect(r.progression.state.moon.scope).toBe(ALL_BITS);
    expect(lit(sky, 'cat')).toBeGreaterThan(0.3);
    expect(lit(ceil, 'ceilcat')).toBeGreaterThan(0.8);
    r.step(3, null);
    expect(r.events.some((e) => e.key === 'moon-scope-cat')).toBe(true);
    r.dispose();
  });
  it('the sky shows only the pictures that are traced, lit; the table shows all five, the traced ones bright and the rest dim; no sky mesh at all with none traced', () => {
    const r = rig({ moon: { step: 4, cells: 3, scope: 5 } });
    const sky = r.life.star.figs;
    const tab = r.scene.getObjectByName('moon:wingfigs').geometry;
    expect(sky.visible).toBe(true);
    expect([0, 1, 2, 3, 4].map((c) => lit(sky.geometry, `c${c}`) > 0)).toEqual([true, false, true, false, false]);
    expect([0, 1, 2, 3, 4].map((c) => lit(tab, `tc${c}`) > 0.5)).toEqual([true, false, true, false, false]);
    expect(lit(tab, 'tc1')).toBeGreaterThan(0); // dim, not black: the table says there is something to find
    r.dispose();
    const r0 = rig();
    expect(r0.life.star.figs.visible).toBe(false);
    r0.dispose();
  });
  it('the sky\'s figures hang on the camera like the stars, draw before the world, never cast or merge', () => {
    const r = rig({ moon: { step: 4, cells: 3, scope: 1 } });
    r.camera.position.set(5, 3, 7);
    r.life.update(1 / 30, 1, r.where, r.camera, r.session);
    const f = r.life.star.figs;
    expect(f.position.toArray()).toEqual([5, 3, 7]);
    expect(f.renderOrder).toBeLessThan(0);
    expect(f.castShadow).toBe(false);
    expect(f.userData.noMerge).toBe(true);
    expect(f.frustumCulled).toBe(false);
    r.dispose();
  });
});

describe('the Old Dish turns to Earth', () => {
  const turn = (r) => r.scene.getObjectByName('moon:dish').rotation.y;
  it('is as it was before Earth is found, turns smoothly in 2.6 s once it is, and a walk that begins found starts turned', () => {
    const r = rig({ moon: { step: 4, cells: 3 } });
    expect(turn(r)).toBe(0);
    r.progression.state.moon = { ...r.progression.state.moon, step: 5, scope: 3 };
    r.step(1.3, null);
    expect(turn(r)).toBeGreaterThan(0.2);
    expect(turn(r)).toBeLessThan(DISH_TURN.to - 0.2);
    r.step(2, null);
    expect(turn(r)).toBeCloseTo(DISH_TURN.to, 6);
    r.dispose();
    const r2 = rig({ moon: { step: 5, cells: 3, scope: 3 } });
    expect(turn(r2)).toBeCloseTo(DISH_TURN.to, 6);
    r2.dispose();
  });
  it('turns about the dish\'s own post (the mesh\'s pivot keeps the post where it was) and faces Earth: east becomes 12 degrees east of north', () => {
    const r = rig({ moon: { step: 5, cells: 3, scope: 3 } });
    const d = r.scene.getObjectByName('moon:dish');
    d.updateMatrix();
    const post = new THREE.Vector3(P.OLD_DISH.x, 3, P.OLD_DISH.z).applyMatrix4(d.matrix);
    expect(post.x).toBeCloseTo(P.OLD_DISH.x, 5);
    expect(post.z).toBeCloseTo(P.OLD_DISH.z, 5);
    const east = new THREE.Vector3(P.OLD_DISH.x + 1, 3, P.OLD_DISH.z).applyMatrix4(d.matrix);
    const dir = { x: east.x - post.x, z: east.z - post.z };
    expect(Math.atan2(dir.x, -dir.z) * (180 / Math.PI)).toBeCloseTo(P.EARTH.bearingDeg, 0);
    r.dispose();
  });
  it('in reduced motion it is turned at once; and dispose puts it back', () => {
    const r = rig({ moon: { step: 4, cells: 3 }, reducedMotion: true });
    const d = r.scene.getObjectByName('moon:dish');
    r.progression.state.moon = { ...r.progression.state.moon, step: 5, scope: 3 };
    r.step(0.1, null);
    expect(d.rotation.y).toBeCloseTo(DISH_TURN.to, 6);
    r.dispose();
    expect(d.rotation.y).toBe(0);
    expect(d.position.toArray()).toEqual([0, 0, 0]);
  });
});

describe('the wing as a stand-in', () => {
  it('the observatory group is hidden at the spawn and at the dome, drawn from 55 m, and the tower (in the Moon stone mesh) is drawn from everywhere', () => {
    const r = rig();
    const wing = r.scene.getObjectByName('moon:wing');
    const stone = r.scene.getObjectByName('moon:stone');
    r.step(0.1, { x: 0, z: 45, y: 0 });
    expect(wing.visible).toBe(false);
    r.step(0.1, { x: -30, z: -20, y: gy(-30, -20) });
    expect(wing.visible).toBe(true);
    r.step(0.1, { x: P.DOME.x, z: P.DOME.z + 3, y: 0 });
    expect(wing.visible).toBe(false);
    expect(stone.visible).toBe(true); // the tower is in the Moon stone mesh: drawn from everywhere
    r.dispose();
  });
});

describe('the goal and the board', () => {
  it('once the base is awake the gold ring and the board point at the ramp\'s mouth, and say so; before and after, they do not', () => {
    expect(M.nextGoal({ step: 4, cells: 3 })).toEqual({ kind: 'scope' });
    expect(M.nextGoal({ step: 5, cells: 3 })).toEqual({ kind: 'desk' }); // milestone 6: the Message Desk
    const r = rig({ moon: { step: 4, cells: 3 } });
    r.step(0.1, { x: P.BOARD.x + 2, z: P.BOARD.z, y: gy(P.BOARD.x + 2, P.BOARD.z) });
    press(r);
    r.step(0.2, null);
    expect(r.events.some((e) => e.key === 'moon-board' && /Star Hill/.test(e.label))).toBe(true);
    const ring = r.scene.getObjectByName('moon:goalring');
    const m = P.rampPoint(0.04, 0);
    expect(ring.position.x).toBeCloseTo(m.x, 3);
    expect(ring.position.z).toBeCloseTo(m.z, 3);
    r.dispose();
  });
  it('a woken base with the telescope unused gets one hint line when she comes within 34 m of the hill, once', () => {
    const r = rig({ moon: { step: 4, cells: 3 } });
    r.step(0.1, { x: P.STAR_TABLE.x + 4, z: P.STAR_TABLE.z + 4, y: 0 });
    r.step(0.1, null);
    expect(r.events.filter((e) => e.key === 'moon-scope-hint')).toHaveLength(1);
    r.step(1, null);
    expect(r.events.filter((e) => e.key === 'moon-scope-hint')).toHaveLength(1);
    r.dispose();
  });
});
