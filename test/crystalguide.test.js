// The Crystal Cave's written guide: the pure goal lines for every step and for carrying (both word sets), the arrow geometry the Moon and Reef share, the line ids, and the live DOM
// (goal line, chip, arrow) through the real cave life, with the words, the arrow and the ring standing on one goal.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import * as M from '../src/crystalmission.js';
import * as S from '../src/world/crystalstory.js';
import * as G from '../src/world/crystalguide.js';
import * as RG from '../src/world/reefguide.js';
import { build } from '../src/world/crystal.js';
import { LINES } from '../src/world/crystalwords.js';
import { createProgression } from '../src/progression.js';
import { hasPhrase, phrase } from '../src/clanphrases.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { memoryStorage } from './helpers/storage.js';
import { fakePage } from './helpers/moonpage.js';

const rec = (step) => M.normalize({ step });
const goalAt = (step, carrying = null) => {
  const g = M.nextGoal(rec(step), carrying);
  const t = g.kind === 'heart' ? S.HEART : g.stone !== undefined ? (g.kind === 'deliver' ? S.CRYSTALS[g.stone] : S.STONES[g.stone]) : S.LUMI.start;
  return { g, x: t.x, z: t.z, y: 0 };
};
const words = (step, extra = {}, carrying = null) => G.goalWords({ goal: goalAt(step, carrying), metres: 30, step, errand: false, ...extra });
const BANNED = /\b(dark|lost forever|trapped|stuck|collapse|cave-in|scary)\b/i;
const EXPECT = [
  [0, /Say hello to Lumi/], [1, /rose spark stone.*behind the crystals in the Rose hall, north-west of the entrance arch/], [2, /sky spark stone: across the Blue Pool/],
  [3, /gold spark stone.*Gold Gallery/], [4, /Wake the Heart Crystal.*north-east \(30 m\)/], [5, /Wake the Heart Crystal/], [6, /light show|lights dance/],
];

describe('goalWords: every step, both word sets', () => {
  for (const [step, re] of EXPECT) {
    it(`step ${step} says what to do`, () => {
      expect(words(step)).toMatch(re);
      withOffWords(() => { const t = words(step); expect(t).toMatch(re.source.includes('north-west of the entrance') ? /Rose hall/ : re); expect(bannedIn(t)).toBeNull(); expect(t).not.toMatch(BANNED); });
    });
  }
  it('step 7 says nothing without an errand, and the errand hint with one', () => {
    expect(words(7)).toBe('');
    expect(words(7, { errand: true })).toMatch(/errand of the day/);
    withOffWords(() => expect(bannedIn(words(7, { errand: true }))).toBeNull());
  });
  it('carrying a stone says which crystal, with the metres to the nearest 5, and Give within 5 m', () => {
    const names = ['Rose', 'Blue', 'Gold'];
    for (const s of [1, 2, 3]) {
      expect(words(s, { metres: 23 }, s - 1)).toBe(`Take the spark stone to the great ${names[s - 1]} crystal (25 m).`);
      expect(words(s, { metres: 4.9 }, s - 1)).toBe(`Give the spark stone to the great ${names[s - 1]} crystal.`);
      withOffWords(() => expect(bannedIn(words(s, { metres: 23 }, s - 1))).toBeNull());
    }
  });
  it('the compass word comes from the plan (+x east, -z north, the arch at (0, 24.5))', () => {
    expect(G.compassKey(10, 0)).toBe('e');
    expect(G.compassKey(0, -10)).toBe('n');
    expect(G.compassKey(-10, 10)).toBe('sw');
    expect(G.atWords(S.STONES[0].x, S.STONES[0].z)).toBe('north-west of the entrance arch');
  });
  it('every guide line resolves in both sets with no banned or series words', () => {
    const ids = Object.keys(LINES).filter((k) => k.startsWith('crystal.guide.'));
    expect(ids.length).toBeGreaterThan(15);
    for (const id of ids) {
      expect(hasPhrase(id), id).toBe(true);
      expect(phrase(id)).not.toBe(id);
      withOffWords(() => { expect(hasPhrase(id), id).toBe(true); expect(bannedIn(phrase(id)), id).toBeNull(); expect(phrase(id)).not.toMatch(/Silverpelt|Clan|warrior/i); expect(phrase(id)).not.toMatch(BANNED); });
    }
  });
  it('the chip words say what Lumi needs', () => {
    expect(G.chipWords({ kind: 'stone' })).toBe('Lumi needs a spark stone');
    expect(G.chipWords({ kind: 'lumi' })).toBe('Say hello to Lumi');
    expect(G.chipWords({ kind: 'rest' })).toBe('');
    expect(G.chipWords({ kind: 'rest' }, true)).toBe('Lumi has an errand');
    expect(G.chipWords(null)).toBe('');
  });
});

describe('the arrow geometry is the shared one', () => {
  it('shows only off screen and past 8 m, to the nearest 5', () => {
    expect(G.arrowFor).toBe(RG.arrowFor);
    const cam = new THREE.PerspectiveCamera(50, 1.6, 0.1, 600);
    cam.position.set(0, 3, 40);
    cam.rotation.set(0, 0, 0, 'YXZ');
    cam.updateMatrixWorld(true);
    const view = G.viewOf(cam);
    const behind = G.arrowFor(view, { x: 0, z: 36 }, { x: 0, y: 0, z: 80 });
    expect(behind.show).toBe(true);
    expect(G.round5(behind.dist)).toBe(45);
    expect(G.arrowFor(view, { x: 0, z: 36 }, { x: 0, y: 0, z: 0 }).show).toBe(false);
    expect(G.arrowFor(view, { x: 0, z: 36 }, { x: 0, y: 0, z: 80 }, undefined, 100).show).toBe(false);
  });
});

function rig({ crystal = null, reducedMotion = false } = {}) {
  const progression = createProgression(memoryStorage());
  if (crystal) { progression.state.crystal = { ...progression.state.crystal, ...M.normalize(crystal) }; progression.addPoints(0); }
  const scene = new THREE.Scene();
  const area = build(scene);
  const page = fakePage();
  const life = area.life({ scene, ground: area.ground, audio: null, log: { awardOnce: () => 0, count: () => 0, mark() {} }, progression, reducedMotion, tier: { name: 'lite' }, doc: page.doc, win: page.win, visits: 0, roomSeed: undefined, sendEvent: () => {} });
  const camera = new THREE.PerspectiveCamera(50, 1.6, 0.1, 600);
  const cat = { x: 0, y: 0, z: 28 };
  const session = { cat: { rotation: { y: 0 } } };
  const run = (secs, at = cat, yaw = 0) => { for (let i = 0; i < Math.round(secs * 20); i++) { camera.position.set(at.x, 3, at.z + 4.4); camera.rotation.set(0, yaw, 0, 'YXZ'); camera.updateMatrixWorld(true); life.update(0.05, i * 0.05, at, camera, session); } };
  return { life, page, progression, run, g: life.guide, cat };
}

describe('the live guide', () => {
  it('at the first visit it shows the goal line to Lumi and the arrival card is the intro, not the guide', () => {
    const r = rig();
    r.run(1);
    expect(r.g.state.lineOn).toBe(true);
    expect(r.g.els.line.textContent).toMatch(/Say hello to Lumi/);
    expect(r.g.els.card).toBeUndefined();
    expect(r.g.els.root.style.display).toBe('block');
    r.life.dispose();
    expect(r.g.els.root.removed).toBe(true);
  });
  it('the line follows the goal: the rose stone, then the arrow turns toward it and never pulses', () => {
    const r = rig({ crystal: { step: 1 } });
    r.run(1, r.cat, 0);
    expect(r.g.els.line.textContent).toMatch(/rose spark stone/);
    const gp = r.life.lumi.goalNow();
    expect(gp.x).toBeCloseTo(S.STONES[0].x, 1);
    r.run(1, r.cat, 0);
    expect(r.g.state.arrowOn).toBe(true);
    expect(r.g.state.metres % 5).toBe(0);
    expect(r.g.els.arrow.style.animation ?? '').toBe('');
    r.life.dispose();
  });
  it('after the story it says nothing and shows no arrow unless an errand waits', () => {
    const r = rig({ crystal: { step: 7 } });
    r.run(1);
    if (!r.life.errand.state.eligible || r.life.errand.state.done) { expect(r.g.state.lineOn).toBe(false); expect(r.g.state.arrowOn).toBe(false); } else expect(r.g.els.line.textContent).toMatch(/errand/);
    r.life.dispose();
  });
  it('reduced motion is the same static guide', () => {
    const r = rig({ crystal: { step: 1 }, reducedMotion: true });
    r.run(1);
    expect(r.g.els.line.textContent).toMatch(/rose spark stone/);
    r.life.dispose();
  });
});
