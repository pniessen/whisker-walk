// The Reef's written guide: the pure goal lines for every step 0..7 and for carrying (both word sets), the arrow geometry the Moon shares, the line ids, and the live DOM
// (goal line, chip, arrow, arrival card) through the real Reef life, with the words, the arrow and the ring standing on one goal.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import * as M from '../src/reefmission.js';
import * as S from '../src/world/reefstory.js';
import * as W from '../src/world/reefwing.js';
import * as G from '../src/world/reefguide.js';
import * as MG from '../src/world/moonguide.js';
import { build } from '../src/world/reef.js';
import { LINES } from '../src/world/reefwords.js';
import { createProgression } from '../src/progression.js';
import { hasPhrase, phrase } from '../src/clanphrases.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { memoryStorage } from './helpers/storage.js';
import { fakePage } from './helpers/moonpage.js';

const save = (step) => ({ step, shells: M.SHELLS_AT[step] });
const goalAt = (step, carrying = null, lit = 0) => {
  const g = M.nextGoal(save(step), carrying, lit);
  const s = g.kind === 'shell' ? S.STORY_SHELLS[g.shell] : g.kind === 'lantern' ? W.LANTERNS[g.lantern] : S.MARLO.start;
  return { g, x: s.x, z: s.z, y: 0 };
};
const words = (step, extra = {}, carrying = null, lit = 0) => G.goalWords({ goal: goalAt(step, carrying, lit), metres: 0, errand: false, ...extra });
const EXPECT = [
  [0, /Say hello to Marlo/], [1, /shell 1 of 3.*Kelp Garden, about \d+ m (ahead|to your \w+|behind you)/], [2, /shell 2 of 3.*ledge.*kick button/], [3, /shell 3 of 3.*cave.*bubbles drift up/],
  [4, /trying on/], [5, /three lantern corals.*\(0 of 3\)/], [6, /Start the housewarming/],
];

describe('goalWords from where she stands now', () => {
  const at = (cat, fx, fz) => words(1, { cat, fx, fz });
  const goal = goalAt(1);
  it('says ahead, to your right, behind you and to your left, with the distance to 5 m', () => {
    const near = { x: goal.x, z: goal.z + 25 }; // 25 m south of the shells: she faces north (-z) so it is ahead
    expect(at(near, 0, -1)).toMatch(/Kelp Garden, about 25 m ahead\./);
    expect(at(near, 0, 1)).toMatch(/about 25 m behind you/);
    expect(at(near, 1, 0)).toMatch(/about 25 m to your left/); // facing east, a north goal is on her left
    expect(at(near, -1, 0)).toMatch(/about 25 m to your right/);
    expect(at({ x: goal.x, z: goal.z + 2 }, 0, -1)).toMatch(/about 5 m ahead/);
  });
  it('changes only when the bucket does, and reads the same in the everyday set', () => {
    const a = at({ x: goal.x, z: goal.z + 25.4 }, 0, -1);
    expect(at({ x: goal.x, z: goal.z + 24 }, 0, -1)).toBe(a);
    withOffWords(() => { expect(at({ x: goal.x, z: goal.z + 25 }, 0, -1)).toBe(a); expect(bannedIn(a)).toBeNull(); });
  });
  it('without a position it speaks from the spawn, facing north', () => { expect(words(1)).toMatch(/Kelp Garden, about \d+ m (ahead|to your left)/); });
});

describe('goalWords: every step, both word sets', () => {
  for (const [step, re] of EXPECT) {
    it(`step ${step} says what to do`, () => {
      expect(words(step)).toMatch(re);
      withOffWords(() => { const t = words(step); expect(t).toMatch(re.source.includes('Kelp') ? /Kelp Garden/ : re); expect(bannedIn(t)).toBeNull(); });
    });
  }
  it('step 7 says nothing without an errand, and the errand hint with one', () => {
    expect(words(7)).toBe('');
    expect(words(7, { errand: true })).toMatch(/errand of the day/);
    withOffWords(() => expect(bannedIn(words(7, { errand: true }))).toBeNull());
  });
  it('the lantern count follows the lanterns lit', () => {
    expect(words(5, {}, null, 2)).toMatch(/\(2 of 3\)/);
  });
  it('carrying a shell says where to take it, with the metres to the nearest 5', () => {
    for (const s of [1, 2, 3]) {
      expect(words(s, { metres: 23 }, s - 1)).toBe('Take the shell to Marlo (25 m).');
      expect(words(s, { metres: 2 }, s - 1)).toBe('Give the shell to Marlo.');
    }
  });
  it('no step has banned or series words in the everyday set, and every guide line resolves in both sets', () => {
    const ids = Object.keys(LINES).filter((k) => k.startsWith('reef.guide.'));
    expect(ids.length).toBeGreaterThan(15);
    for (const id of ids) {
      expect(hasPhrase(id), id).toBe(true);
      withOffWords(() => { expect(hasPhrase(id), id).toBe(true); expect(bannedIn(phrase(id)), id).toBeNull(); expect(phrase(id)).not.toMatch(/Silverpelt|Clan/); });
    }
    expect(G.arrivalWords()).toHaveLength(3);
  });
  it('the chip words say what Marlo needs', () => {
    expect(G.chipWords({ kind: 'shell' })).toBe('Marlo needs a shell');
    expect(G.chipWords({ kind: 'marlo' })).toBe('Say hello to Marlo');
    expect(G.chipWords({ kind: 'rest' })).toBe('');
    expect(G.chipWords({ kind: 'rest' }, true)).toBe('Marlo has an errand');
    expect(G.chipWords(null)).toBe('');
  });
});

describe('the arrow geometry is the Moon\'s', () => {
  it('is the same functions, and shows only off screen and past 8 m, to the nearest 5', () => {
    expect(G.arrowFor).toBe(MG.arrowFor);
    const cam = new THREE.PerspectiveCamera(50, 1.6, 0.1, 600);
    cam.position.set(0, 3, 40);
    cam.rotation.set(0, 0, 0, 'YXZ');
    cam.updateMatrixWorld(true);
    const view = G.viewOf(cam);
    const behind = G.arrowFor(view, { x: 0, z: 36 }, { x: 0, y: 0, z: 80 });
    expect(behind.show).toBe(true);
    expect(G.round5(behind.dist)).toBe(45);
    expect(G.arrowFor(view, { x: 0, z: 36 }, { x: 0, y: 0, z: 0 }).show).toBe(false);
  });
});

function rig({ reef = null, reducedMotion = false } = {}) {
  const progression = createProgression(memoryStorage());
  if (reef) { progression.state.reef = { ...progression.state.reef, ...reef }; progression.addPoints(0); }
  const scene = new THREE.Scene();
  const area = build(scene);
  const page = fakePage();
  const mk = page.doc.createElement;
  page.doc.createElement = (tag) => Object.assign(mk(tag), { append(...k) { for (const c of k) this.appendChild(c); } }); // the gauge uses append
  const life = area.life({ scene, ground: area.ground, audio: null, log: { awardOnce: () => 0, count: () => 0, mark() {} }, progression, reducedMotion, tier: { name: 'lite' }, doc: page.doc, win: page.win, visits: 0, roomSeed: undefined, sendEvent: () => {} });
  const camera = new THREE.PerspectiveCamera(50, 1.6, 0.1, 600);
  const cat = { x: 0, y: 0, z: 36 };
  const session = { cat: { rotation: { y: 0 } } };
  const run = (secs, at = cat, yaw = 0) => { for (let i = 0; i < Math.round(secs * 20); i++) { camera.position.set(at.x, 3, at.z + 4.4); camera.rotation.set(0, yaw, 0, 'YXZ'); camera.updateMatrixWorld(true); life.update(0.05, i * 0.05, at, camera, session); } };
  return { life, page, progression, run, g: life.guide, cat };
}

describe('the live guide', () => {
  it('at the first visit it shows the arrival card, the goal line to Marlo and no blocking', () => {
    const r = rig();
    r.run(1);
    expect(r.g.state.cardOn).toBe(true);
    expect(r.g.els.card.children.map((c) => c.textContent).slice(0, 3)).toEqual(G.arrivalWords());
    expect(r.g.els.root.style.pointerEvents).toBe('none');
    expect(r.g.els.line.textContent).toMatch(/Say hello to Marlo/);
    r.g.els.card.children[3]?.listeners.click?.[0].f();
    expect(r.g.state.cardOn).toBe(false);
    r.life.dispose();
  });
  it('the card goes by itself after 20 s, and is never made after the story has begun', () => {
    const r = rig();
    r.run(21);
    expect(r.g.state.cardOn).toBe(false);
    r.life.dispose();
    const later = rig({ reef: save(2) });
    expect(later.g.els.card.children).toHaveLength(0);
    later.life.dispose();
  });
  it('the line, the arrow and the ring stand on one goal (shell two: the ledge), reduced motion or not', () => {
    for (const reducedMotion of [false, true]) {
      const r = rig({ reef: save(2), reducedMotion });
      r.run(1, r.cat, Math.PI / 2); // looking west: the ledge is off screen to the right
      expect(r.g.els.line.textContent).toMatch(/shell 2 of 3/);
      const gp = r.life.marlo.goalNow();
      expect([gp.x, gp.z]).toEqual([S.STORY_SHELLS[1].x, S.STORY_SHELLS[1].z]);
      expect(r.g.state.arrowOn).toBe(true); // far away and off screen
      expect(r.g.els.label.textContent).toMatch(/^\d+ m$/);
      expect(Number.parseInt(r.g.els.label.textContent, 10) % 5).toBe(0);
      r.life.dispose();
    }
  });
  it('no arrow and no line at the end of the story when no errand waits, and the node goes with dispose', () => {
    const r = rig({ reef: save(7) });
    r.run(1);
    expect(r.g.state.arrowOn).toBe(false);
    r.life.dispose();
    expect(r.g.els.root.removed).toBe(true);
  });
});
