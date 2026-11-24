// The Moon, milestone 7a on a walk: the course lamps, the hop board's measure and record through the real Moon life, the journal's count, the save, and
// what the walk never does (a hop that does not count says nothing and saves nothing). Frames run in the walk's own order: the life's update, then the
// avatar takes dt off the pounce window.
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import * as P from '../src/world/moonplan.js';
import { build } from '../src/world/moon.js';
import { createProgression } from '../src/progression.js';
import { createDiscoveryLog } from '../src/discoveries.js';
import { bus } from '../src/events.js';
import { mem } from './helpers/lighthouselife.js';
import { fakePage } from './helpers/moonpage.js';
import { readFileSync, globSync } from 'node:fs';

const L = P.JUMP_LANE;
const HANG = 1.08; // the Moon's hop window: 0.3 s x 3.6

function rig({ moon = null, equipped = null, reducedMotion = false, doc = true } = {}) {
  const progression = createProgression(mem());
  if (moon) progression.state.moon = { ...progression.state.moon, ...moon };
  if (equipped) progression.state.equipped = { ...progression.state.equipped, ...equipped };
  const scene = new THREE.Scene();
  const area = build(scene);
  const log = createDiscoveryLog(progression);
  log.startWalk();
  const page = fakePage();
  const life = area.life({ scene, ground: area.ground, audio: null, log, progression, reducedMotion, tier: { name: 'high' }, doc: doc ? page.doc : null, win: page.win });
  const camera = new THREE.PerspectiveCamera();
  const cat = new THREE.Object3D();
  const session = { goals: null, pounceTime: 0, perched: null, fx: { burst: vi.fn() }, cat, idleTime: 0 };
  const events = [];
  const off = bus.on('discovery', (e) => events.push(e));
  const where = { x: 0, y: 0, z: 45 };
  let t = 0;
  const frame = () => { t += 1 / 30; life.update(1 / 30, t, where, camera, session); if (session.pounceTime > 0) session.pounceTime -= 1 / 30; };
  const move = (p) => { Object.assign(where, p); cat.position.set(where.x, where.y, where.z); };
  const step = (secs, at) => { if (at) move(at); for (let i = 0; i < Math.round(secs * 30); i++) frame(); };
  // a hop from (ax, az) carrying her `d` metres east at the hop's own length; her paws move a frame before the window opens (the lunge), as the walk's do
  const hop = (a, d, { z = L.z, perched = null, y = 0 } = {}) => {
    step(0.2, { x: L.x0 + a, z, y });
    session.perched = perched;
    session.pounceTime = HANG;
    const n = Math.round(HANG * 30);
    for (let i = 0; i < n; i++) { where.x += d / n; frame(); }
    session.perched = null;
    step(0.1);
  };
  const notes = (key) => events.filter((e) => e.type === 'greenhousenote' && e.key === key).length;
  return { scene, area, life, progression, page, camera, session, events, where, move, step, hop, notes, jump: life.jump, dispose() { off(); life.dispose(); } };
}
const best = (r, id = 'tabby') => r.progression.state.moon.jump[id] ?? 0;

describe('the hop board', () => {
  it('measures a hop from behind the line to the lane, saves the best of this cat, says "New record!" once for a better one, and counts the journal page once a walk', () => {
    const r = rig();
    const before = r.progression.state.journal.mnjump ?? 0;
    r.hop(-0.4, 6.4);
    expect(r.jump.last).toBe(600); // from the line (0.4 m behind it), 6.0 m
    expect(best(r)).toBe(600);
    expect(r.notes('moon.jump.record')).toBe(1);
    expect(r.progression.state.journal.mnjump).toBe(before + 1);
    r.hop(-0.2, 3.2); // shorter: not a record, a note-free hop
    expect(r.jump.last).toBe(300);
    expect(best(r)).toBe(600);
    expect(r.notes('moon.jump.record')).toBe(1);
    r.hop(-0.1, 7.1); // 7.0 m
    expect(best(r)).toBe(700);
    expect(r.notes('moon.jump.record')).toBe(2);
    expect(r.progression.state.journal.mnjump).toBe(before + 1); // one count a walk
    r.dispose();
  });
  it('the save keeps the rest of the record as it was and is written through the progression\'s own persist', () => {
    const r = rig({ moon: { step: 8, cells: 7, stamp: 2, scope: 31 } });
    const spy = vi.spyOn(r.progression, 'addPoints');
    r.hop(-0.4, 5.4);
    expect(r.progression.state.moon).toEqual({ step: 8, cells: 7, stamp: 2, scope: 31, jump: { tabby: 500 } });
    expect(spy).toHaveBeenCalledWith(0);
    r.dispose();
  });
  it('a hop that does not count says nothing and saves nothing: off the lane, from behind by more than a stride, past the line, from a perch, onto a slope', () => {
    const r = rig();
    r.hop(-0.4, 5, { z: L.z + 3.2 }); // off the lane
    r.hop(-2.5, 5); // too far behind the line
    r.hop(1.0, 5); // already past it
    r.hop(-0.4, 5, { perched: { x: 0, z: 0, y: 1 } });
    r.hop(-0.4, 5, { y: 0 }); // (control: the one that counts)
    expect(best(r)).toBe(460);
    const r2 = rig();
    r2.hop(-0.4, 5, { z: L.z + 3.2 });
    r2.hop(-2.5, 5);
    r2.hop(1.0, 5);
    expect(r2.progression.state.moon.jump).toEqual({});
    expect(r2.notes('moon.jump.record')).toBe(0);
    expect(r2.progression.state.journal.mnjump ?? 0).toBe(0);
    r.dispose(); r2.dispose();
  });
  it('a hop that lands behind the line is nothing, and one that lands beyond the lane\'s end on level dust still counts; one that lands on the pit\'s slope does not', () => {
    const r = rig();
    r.hop(-0.4, 0.3); // lands 0.1 m behind the line
    expect(best(r)).toBe(0);
    r.hop(-0.4, 17.4); // 17 m, past the 16 m posts
    expect(best(r)).toBe(1700);
    r.hop(-0.4, 30); // an impossible hop that lands in the pit's bowl: not level, not measured
    expect(best(r)).toBe(1700);
    r.dispose();
  });
  it('each cat has her own line, and a cat id the save cannot keep is measured and shown but never saved', () => {
    const r = rig({ moon: { jump: { tabby: 900 } }, equipped: { custom: 'mine1' } });
    r.hop(-0.4, 4.4);
    expect(r.progression.state.moon.jump).toEqual({ tabby: 900, mine1: 400 });
    r.dispose();
    const r2 = rig({ equipped: { cat: 'Bad Id', custom: null } });
    r2.hop(-0.4, 4.4);
    expect(r2.jump.last).toBe(400);
    expect(r2.progression.state.moon.jump).toEqual({});
    r2.dispose();
  });
  it('a hostile record on the save never breaks the board: huge, negative, junk and a seventh cat are all read as the save\'s limits', () => {
    for (const jump of [{ tabby: 1e9 }, { tabby: -4 }, { tabby: 'x' }, null, [1], 5]) {
      const r = rig();
      r.progression.state.moon.jump = jump; // as a bad cloud payload that reached memory
      r.hop(-0.4, 5.4);
      expect(r.jump.last).toBe(500);
      if (jump && typeof jump === 'object' && !Array.isArray(jump) && Number.isFinite(jump.tabby) && jump.tabby > 0) {
        expect(r.progression.state.moon.jump).toBe(jump); // a record the cat already holds (clamped to 2000 on read) is never rewritten
        expect(r.notes('moon.jump.record')).toBe(0);
      } else {
        expect(r.progression.state.moon.jump).toEqual({ tabby: 500 }); // junk is not copied on
      }
      r.dispose();
    }
    const six = Object.fromEntries(['a1', 'b2', 'c3', 'd4', 'e5', 'f6'].map((k) => [k, 100]));
    const r = rig({ moon: { jump: six } });
    r.hop(-0.4, 5.4);
    expect(Object.keys(r.progression.state.moon.jump)).toHaveLength(6);
    expect(r.jump.last).toBe(500); // shown, not kept
    r.dispose();
  });
  it('reduced motion changes nothing about the measure (the logical hop is the same), and with no page at all the board is simply blank', () => {
    const r = rig({ reducedMotion: true, doc: false });
    r.hop(-0.4, 5.4);
    expect(best(r)).toBe(500);
    r.dispose();
  });
  it('the board\'s screen is drawn within reach of it and not beyond; the hint shows once, near the line', () => {
    const r = rig();
    r.step(0.2, { x: 0, z: 45 });
    expect(r.jump.screen.sprite.visible).toBe(false);
    expect(r.notes('moon.jump.hint')).toBe(0);
    r.step(0.2, { x: L.x0 - 1, z: L.z });
    expect(r.jump.screen.sprite.visible).toBe(true);
    expect(r.notes('moon.jump.hint')).toBe(1);
    r.step(0.2, { x: L.x0 + 20, z: L.z });
    r.step(0.2, { x: L.x0 - 1, z: L.z });
    expect(r.notes('moon.jump.hint')).toBe(1);
    r.dispose();
  });
});

describe('the course lamps', () => {
  const colorOf = (r, i) => { const c = new THREE.Color(); r.jump.lamps.mesh.getColorAt(i, c); return c.getHex(); };
  const stand = (r, p) => { r.session.perched = r.area.perches.find((q) => q.x === p.x && q.z === p.z); r.step(0.1, { x: p.x, z: p.z, y: p.y }); r.session.perched = null; r.step(0.1); };
  it('are one InstancedMesh of thirteen rings, dim to begin with; a ring lights when she has stood on its perch, and only that one', () => {
    const r = rig();
    expect(r.jump.lamps.mesh.isInstancedMesh).toBe(true);
    expect(r.jump.lamps.mesh.count).toBe(13);
    const dim = colorOf(r, 0);
    stand(r, P.SKIP[0]);
    expect(colorOf(r, 0)).not.toBe(dim);
    expect(colorOf(r, 1)).toBe(dim);
    expect(r.jump.lit.size).toBe(1);
    r.dispose();
  });
  it('all eight beams lit turns them gold, says "Every beam is lit!" once, and standing again changes nothing; nothing is saved', () => {
    const r = rig();
    const saved = JSON.stringify(r.progression.state.moon);
    for (const b of P.BEAMS) stand(r, b);
    expect(r.notes('moon.jump.beams')).toBe(1);
    expect(colorOf(r, 5)).toBe(0xffc83a);
    expect(colorOf(r, 12)).toBe(0xffc83a);
    stand(r, P.BEAMS[3]);
    expect(r.notes('moon.jump.beams')).toBe(1);
    expect(JSON.stringify(r.progression.state.moon)).toBe(saved);
    r.dispose();
  });
  it('a new walk starts dim again, and the ring is not drawn when she is far from the courses', () => {
    const a = rig();
    stand(a, P.BEAMS[0]);
    a.dispose();
    const b = rig();
    expect(b.jump.lit.size).toBe(0);
    b.step(0.2, { x: 0, z: 45 });
    expect(b.jump.lamps.mesh.visible).toBe(false); // 81 m from the courses
    b.step(0.2, { x: 0, z: -20 });
    expect(b.jump.lamps.mesh.visible).toBe(true);
    b.dispose();
  });
  it('dispose takes the lamps and the board out of the scene', () => {
    const r = rig();
    expect(r.scene.getObjectByName('moon:lamps')).toBeTruthy();
    expect(r.scene.getObjectByName('moon:hopboard')).toBeTruthy();
    r.dispose();
    expect(r.scene.getObjectByName('moon:lamps')).toBeFalsy();
    expect(r.scene.getObjectByName('moon:hopboard')).toBeFalsy();
  });
});

describe('start-up: nothing outside the Moon\'s files names the jumping files', () => {
  const files = globSync('src/**/*.js').map((f) => f.split('\\').join('/'));
  it('no start-up file imports or names them, and they are Moon-prefixed', () => {
    const mine = ['moonjump', 'moonjumpparts', 'moonjumplive'];
    for (const f of files) {
      if (/^src\/world\/moon[a-z]*\.js$/.test(f)) continue;
      const text = readFileSync(f, 'utf8');
      for (const m of mine) expect(text, `${f} names ${m}`).not.toMatch(new RegExp(`\\b${m}\\.js`));
    }
    for (const m of mine) expect(files, m).toContain(`src/world/${m}.js`);
  });
  it('the Moon\'s new files import nothing but the Moon\'s own files and the two shared modules every Moon file already uses; NOT progression.js (importing it from the Moon\'s chunk moved two modules into start-up chunks of their own, +718 B, in the first build)', () => {
    for (const f of ['moonjump', 'moonjumpparts', 'moonjumplive']) {
      const text = readFileSync(`src/world/${f}.js`, 'utf8');
      for (const m of text.matchAll(/from '([^']+)'/g)) expect(m[1], `${f}: ${m[1]}`).toMatch(/^(three|\.\/moon[a-z]*\.js|\.\.\/(clanphrases|events)\.js)$/);
    }
  });
});
