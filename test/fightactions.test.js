import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  ACTION_KINDS, ACTION_LEN, ACTION_LEN_BIG, ANSWER_PRELUDE, ANSWER_PRELUDE_REDUCED, REDUCED_ACTION, BEAT_TIME,
  actionFor, actionTime, preludeFrame, siteFor, actionFrame, placeFrame, beatFrame, beatFor, WIRE_POSE, wirePose,
  makeFrame, CUES, cuesCrossed,
} from '../src/fightactions.js';
import { TIMING, LONGER_LOOK } from '../src/fight.js';
import { FIGHT_MOVES } from '../src/fightmoves.js';
import { clanCast } from '../src/clancast.js';
import { buildCat, catDims, catPivot, catBackY } from '../src/cat/model.js';
import { animateCat } from '../src/cat/animator.js';

const CLUE_POSES = ['stalk', 'swipe', 'backUp'];
const OLD_STATES = ['follow', 'nap', 'stretch', 'groom', 'requestPet', 'perch', 'sniff', 'stalk', 'pounce', 'scared',
  'cross', 'land', 'swipe', 'backUp', 'wade', 'swim', 'shake'];
const NEW_STATES = ['arch', 'rearUp', 'flinch', 'pinned', 'pinning', 'roll'];
const OPTS = { gap: 1.6, winBackY: 0.55, loseBackY: 0.42 };
const us = (n) => Array.from({ length: n + 1 }, (_, i) => i / n);
const variants = () => ACTION_KINDS.flatMap((kind) => (kind === 'roll' ? [true] : [false, true]).map((big) => ({ kind, big })));

describe('actionFor follows the design table', () => {
  const won = (move, answer) => actionFor({ type: 'round', round: 1, move, answer, won: true });
  const lost = (move, answer, special = false) => actionFor({ type: 'round', round: 1, move, answer, won: false, ...(special && { special: true }) });
  it('a won basic answer: swipe leaps, pounce rears up, dodge pins, all by me', () => {
    expect(won('charge', 'swipe')).toEqual({ kind: 'leap', by: 'me', big: false });
    expect(won('swipe', 'pounce')).toEqual({ kind: 'rearUp', by: 'me', big: false });
    expect(won('pounce', 'dodge')).toEqual({ kind: 'pin', by: 'me', big: false });
  });
  it('a won special plays its own action, big', () => {
    const sp = (move, answer) => actionFor({ type: 'round', round: 1, move, answer, won: true, special: true });
    expect(sp('swipe', 'rearUpSwat')).toEqual({ kind: 'rearUp', by: 'me', big: true });
    expect(sp('charge', 'leapScratch')).toEqual({ kind: 'leap', by: 'me', big: true });
    expect(sp('pounce', 'pin')).toEqual({ kind: 'pin', by: 'me', big: true });
    for (const move of ['pounce', 'swipe', 'charge']) expect(sp(move, 'rollingTumble')).toEqual({ kind: 'roll', by: 'me', big: true });
  });
  it('a lost round (wrong answer, timeout, or a special on the wrong clue) is the intruder\'s, by its clue', () => {
    const byClue = { charge: 'leap', swipe: 'rearUp', pounce: 'pin' };
    for (const [move, kind] of Object.entries(byClue)) {
      for (const answer of ['pounce', 'swipe', 'dodge', null]) {
        expect(lost(move, answer)).toEqual({ kind, by: 'it', big: false });
      }
      for (const m of FIGHT_MOVES) expect(lost(move, m.id, true)).toEqual({ kind, by: 'it', big: false });
    }
  });
});

describe('actionTime', () => {
  it('is the prelude plus the action, or 0.8 s with reduced motion (R10)', () => {
    expect(actionTime({ move: 'charge', answer: 'swipe', won: true }, false)).toBeCloseTo(ANSWER_PRELUDE + ACTION_LEN.leap, 9);
    expect(actionTime({ move: 'pounce', answer: null, won: false }, false)).toBeCloseTo(0.35 + 2.8, 9);
    expect(actionTime({ move: 'swipe', answer: 'rollingTumble', won: true, special: true }, false)).toBeCloseTo(0.35 + 3.4, 9);
    expect(actionTime({ move: 'swipe', answer: 'rearUpSwat', won: true, special: true }, false)).toBeCloseTo(0.35 + ACTION_LEN_BIG.rearUp, 9);
    expect(actionTime({ move: 'swipe', answer: 'rollingTumble', won: true, special: true }, true)).toBeCloseTo(0.8, 9);
    expect(ANSWER_PRELUDE_REDUCED + REDUCED_ACTION).toBeCloseTo(0.8, 9);
  });
});

describe('preludeFrame', () => {
  it('today\'s answer and move poses; the dodge goes out and back; a special takes its button\'s pose', () => {
    const f = (round, role, u) => ({ ...preludeFrame(round, role, u) });
    expect(f({ move: 'swipe', answer: 'pounce', won: true }, 'me', 0.5)).toMatchObject({ pose: 'pounce', lift: 0.25 });
    expect(f({ move: 'charge', answer: 'swipe', won: true }, 'me', 0.5).pose).toBe('swipe');
    expect(f({ move: 'pounce', answer: 'dodge', won: true }, 'me', 0.5)).toMatchObject({ pose: 'land', side: 0.8 });
    expect(f({ move: 'pounce', answer: 'dodge', won: true }, 'me', 1)).toMatchObject({ side: 0, along: 0 });
    expect(f({ move: 'pounce', answer: null, won: false }, 'me', 0.5).pose).toBe('cross');
    // specials: the button that answers the same clue (Rolling Tumble: pounce)
    expect(f({ move: 'swipe', answer: 'rearUpSwat', won: true, special: true }, 'me', 0.5).pose).toBe('pounce');
    expect(f({ move: 'charge', answer: 'leapScratch', won: true, special: true }, 'me', 0.5).pose).toBe('swipe');
    expect(f({ move: 'pounce', answer: 'pin', won: true, special: true }, 'me', 0.5).pose).toBe('land');
    expect(f({ move: 'charge', answer: 'rollingTumble', won: true, special: true }, 'me', 0.5).pose).toBe('pounce');
    // its move lands
    expect(f({ move: 'pounce', answer: 'swipe', won: false }, 'it', 0.5)).toMatchObject({ pose: 'pounce', lift: 0.25 });
    expect(f({ move: 'swipe', answer: 'swipe', won: false }, 'it', 0.5).pose).toBe('swipe');
    const charge = (u) => f({ move: 'charge', answer: 'dodge', won: false }, 'it', u);
    expect(charge(0).along).toBeCloseTo(-0.6, 9);
    expect(charge(1).along).toBe(0);
    expect(charge(0.5).pose).toBe('follow');
  });
});

describe('siteFor', () => {
  it('leap face, rearUp shoulder, pin back, roll side or hind by id and never changes', () => {
    expect(siteFor('leap', 'woods-1')).toBe('face');
    expect(siteFor('rearUp', 'woods-1')).toBe('shoulder');
    expect(siteFor('pin', 'woods-1')).toBe('back');
    const seen = new Set();
    for (const clan of ['woods', 'moor', 'river', 'pines']) {
      for (const m of clanCast(clan)) {
        const s = siteFor('roll', m.id);
        expect(['side', 'hind']).toContain(s);
        expect(siteFor('roll', m.id)).toBe(s);
        seen.add(s);
      }
    }
    expect([...seen].sort()).toEqual(['hind', 'side']);
    expect(['side', 'hind']).toContain(siteFor('roll', 'tabby'));
  });
});

describe('actionFrame', () => {
  const home = (f) => [f.along, f.side, f.lift, f.pitch, f.roll];
  it('every action starts and ends at home', () => {
    for (const { kind, big } of variants()) {
      for (const reducedMotion of [false, true]) {
        const o = { ...OPTS, reducedMotion };
        const start = actionFrame(kind, big, 0, o);
        for (const f of [start.win, start.lose]) for (const v of home(f)) expect(Math.abs(v)).toBeLessThanOrEqual(0.05);
        const end = actionFrame(kind, big, 1, o);
        for (const f of [end.win, end.lose]) for (const v of home(f)) expect(v).toBe(0);
      }
    }
  });

  it('no NaN, and lifts and pitches stay in range', () => {
    for (const { kind, big } of variants()) {
      for (const gap of [0.4, 1.0, 1.6]) {
        for (const loseBackY of [0.3, 0.6, 0.9]) {
          for (const u of us(200)) {
            const { win, lose } = actionFrame(kind, big, u, { ...OPTS, gap, loseBackY });
            for (const f of [win, lose]) {
              for (const v of home(f)) expect(Number.isFinite(v)).toBe(true);
              expect(f.lift).toBeGreaterThanOrEqual(0);
              expect(f.lift).toBeLessThanOrEqual(0.8);
              expect(Math.abs(f.pitch)).toBeLessThanOrEqual(1.0);
              expect(f.along).toBeGreaterThanOrEqual(-0.6);
              expect(f.along).toBeLessThanOrEqual(gap + 1e-9);
              expect(Math.abs(f.side)).toBeLessThanOrEqual(0.35);
              expect(typeof f.pose).toBe('string');
            }
          }
        }
      }
    }
  });

  it('follows the sketch: the leap lands short and slashes once, the pin lands on the back, the roll turns twice', () => {
    const peak = (kind, big, pick) => Math.max(...us(400).map((u) => pick(actionFrame(kind, big, u, OPTS))));
    expect(peak('leap', false, (o) => o.win.lift)).toBeCloseTo(0.5, 2);
    expect(peak('leap', true, (o) => o.win.lift)).toBeCloseTo(0.7, 2);
    expect(peak('leap', false, (o) => o.win.along)).toBeCloseTo(1.0, 6);
    expect(peak('leap', false, (o) => -o.lose.along)).toBeCloseTo(0.3, 2);
    const slashes = us(400).filter((u) => actionFrame('leap', false, u, OPTS).win.slash).length;
    expect(slashes).toBeGreaterThan(0);
    expect(peak('rearUp', false, (o) => o.win.pitch)).toBeCloseTo(0.9, 6);
    expect(peak('rearUp', false, (o) => -o.lose.along)).toBeCloseTo(0.3, 6);
    expect(peak('rearUp', true, (o) => -o.lose.along)).toBeCloseTo(0.5, 6);
    const held = actionFrame('pin', false, 0.6, OPTS);
    expect(held.win).toMatchObject({ along: 1.6, pose: 'pinning' });
    expect(held.win.lift).toBeCloseTo(0.42, 1);
    expect(held.lose.pose).toBe('pinned');
    expect(peak('roll', true, (o) => o.win.roll)).toBeCloseTo(4 * Math.PI, 2);
    expect(actionFrame('roll', true, 0.4, OPTS).win.along).toBeCloseTo(0.8, 9);
    const dusts = us(400).filter((u) => actionFrame('roll', true, u, OPTS).win.dust).map((u) => u);
    expect(dusts.some((u) => Math.abs(u - 0.2) < 0.05)).toBe(true);
    expect(dusts.some((u) => Math.abs(u - 0.5) < 0.05)).toBe(true);
    expect(actionFrame('roll', true, 0.95, OPTS).lose.pose).toBe('scared');
  });

  it('reduced motion: no lift, pitch, roll or movement', () => {
    for (const { kind, big } of variants()) {
      for (const u of us(50)) {
        const { win, lose } = actionFrame(kind, big, u, { ...OPTS, reducedMotion: true });
        for (const f of [win, lose]) for (const v of home(f)) expect(v).toBe(0);
        expect(win.pose).toBe('cross');
        expect(lose.pose).toBe('flinch');
        expect(win.slash).toBe(false);
      }
      expect(actionFrame(kind, big, 0, { ...OPTS, reducedMotion: true }).win.dust).toBe(true);
      expect(actionFrame(kind, big, 0.5, { ...OPTS, reducedMotion: true }).win.dust).toBe(false);
    }
  });

  it('writes into the frames it is handed', () => {
    const out = { win: makeFrame(), lose: makeFrame() };
    const r = actionFrame('leap', false, 0.4, OPTS, out);
    expect(r).toBe(out);
    expect(r.win).toBe(out.win);
    const b = makeFrame();
    expect(beatFrame(1, 0.5, b)).toBe(b);
    expect(preludeFrame({ move: 'swipe', answer: 'pounce', won: true }, 'me', 0.5, b)).toBe(b);
  });
});

describe('never a clue pose outside the clue (R21)', () => {
  it('no action or beat frame is stalk, swipe or backUp, for either cat', () => {
    const seen = new Set();
    for (const { kind, big } of variants()) {
      for (const reducedMotion of [false, true]) {
        for (const u of us(400)) {
          const { win, lose } = actionFrame(kind, big, u, { ...OPTS, reducedMotion });
          seen.add(win.pose); seen.add(lose.pose);
        }
      }
    }
    for (const beat of [0, 1, 2]) for (const u of us(100)) seen.add(beatFrame(beat, u).pose);
    for (const p of CLUE_POSES) expect(seen.has(p)).toBe(false);
    for (const p of seen) expect([...OLD_STATES, ...NEW_STATES]).toContain(p);
  });
});

describe('beats (R9)', () => {
  it('arch, sidestep, stare by round, each out and home', () => {
    expect([0, 1, 2, 3, 4].map(beatFor)).toEqual([0, 1, 2, 0, 1]);
    expect(beatFrame(0, 0.5).pose).toBe('arch');
    expect(beatFrame(1, 0.5)).toMatchObject({ pose: 'cross' });
    expect(beatFrame(1, 0.5).side).toBeCloseTo(0.3, 9);
    expect(beatFrame(2, 0.5).along).toBeCloseTo(0.15, 9);
    for (const beat of [0, 1, 2]) {
      for (const u of [0, 1]) {
        const f = beatFrame(beat, u);
        for (const v of [f.along, f.side, f.lift, f.pitch, f.roll]) expect(v).toBe(0);
      }
    }
    expect(BEAT_TIME).toBe(1.2);
  });
});

describe('placeFrame', () => {
  const box = (o) => {
    const b = new THREE.Box3();
    o.updateMatrixWorld(true);
    const p = new THREE.Vector3();
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) b.expandByPoint(p.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld));
    return b;
  };
  const cats = () => {
    const intruder = buildCat('tabby', undefined, { simple: true, style: clanCast('woods')[3].style });
    intruder.scale.multiplyScalar(0.85);
    return [buildCat('tabby'), buildCat('mainecoon'), intruder];
  };
  const stand = (cat, frame, dims) => {
    const p = placeFrame(frame, dims);
    animateCat(cat, frame.pose, 0.7, 0, false);
    cat.rotation.order = 'YXZ';
    cat.rotation.set(frame.pitch, 0, frame.roll);
    cat.position.set(p.dSide, p.y, -p.dAlong);
    cat.updateMatrixWorld(true);
  };

  // Final review 5: reared up, the two cats' front paws meet (they boxed
  // about a metre apart), and stepping in never pushes one into the other.
  it('rear-up: the front paws meet while boxing, and the cats never sink into each other', () => {
    const [tabby, coon, intruder] = cats();
    // How far ahead of its anchor (toward the other cat) a cat's front reaches.
    const front = (cat, frame, paws) => {
      stand(cat, frame, catPivot(cat));
      if (!paws) return -new THREE.Box3().setFromObject(cat, true).min.z;
      return Math.max(...cat.userData.parts.legs.slice(0, 2).map((l) => -box(l.userData.paw).min.z));
    };
    for (const gap of [1.6, 2.0]) { // the fight's own gap, and a wider walk-over
      for (const big of [false, true]) {
        for (const [a, b] of [[tabby, intruder], [coon, intruder], [intruder, coon]]) {
          for (const u of us(100)) {
            const { win, lose } = actionFrame('rearUp', big, u, { ...OPTS, gap });
            const bodies = gap - front(a, win, false) - front(b, lose, false);
            expect(bodies).toBeGreaterThanOrEqual(-0.1);
            if (u > 0.3 && u < 0.7) {
              const paws = gap - front(a, win, true) - front(b, lose, true);
              expect(paws).toBeLessThanOrEqual(0);
              expect(paws).toBeGreaterThanOrEqual(-0.1);
            }
          }
        }
      }
    }
  });

  it('is pure arithmetic: pitch about the hind feet, roll about the torso centre, plus lift', () => {
    const f = { ...makeFrame(), along: 0.5, side: 0.1, lift: 0.2, pitch: 0.9, roll: 0, pose: 'rearUp' };
    const p = placeFrame(f, { hindZ: 0.3, pivotY: 0.4 });
    expect(p.dAlong).toBeCloseTo(0.5 - 0.3 * (1 - Math.cos(0.9)), 9);
    expect(p.y).toBeCloseTo(0.2 + 0.3 * Math.sin(0.9), 9);
    expect(p.dSide).toBeCloseTo(0.1, 9);
    const r = placeFrame({ ...f, pitch: 0, roll: 1 }, { hindZ: 0.3, pivotY: 0.4 });
    expect(r.y).toBeCloseTo(0.2 + 0.4 * (1 - Math.cos(1)), 9);
    expect(r.dSide).toBeCloseTo(0.1 + 0.4 * Math.sin(1), 9);
    const out = { dAlong: 0, dSide: 0, y: 0 };
    expect(placeFrame(f, { hindZ: 0.3, pivotY: 0.4 }, out)).toBe(out);
  });

  it('keeps the hind paws on the ground and a rolled torso above it', () => {
    for (const cat of cats()) {
      const dims = catPivot(cat);
      expect(dims.hindZ).toBeGreaterThan(0);
      expect(dims.pivotY).toBeGreaterThan(0);
      stand(cat, { ...makeFrame(), pose: 'rearUp', pitch: 0.9 }, dims);
      const { legs, body } = cat.userData.parts;
      for (const leg of legs.slice(2)) {
        const y = box(leg.userData.paw).min.y;
        expect(Math.abs(y)).toBeLessThanOrEqual(0.03);
      }
      // and nothing else of the reared cat (the hock) sinks further
      expect(new THREE.Box3().setFromObject(cat, true).min.y).toBeGreaterThanOrEqual(-0.03);
      for (let k = 0; k <= 32; k++) {
        stand(cat, { ...makeFrame(), pose: 'roll', roll: (k / 32) * 4 * Math.PI }, dims);
        expect(box(body).min.y).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('catDims', () => {
  it('measures a standing top, a back, a flatter pinned back, the heel and the torso centre, scaled', () => {
    const cat = buildCat('tabby');
    const d = catDims(cat);
    for (const v of Object.values(d)) expect(Number.isFinite(v)).toBe(true);
    expect(d.top).toBeGreaterThan(d.backY);
    expect(d.backY).toBeGreaterThan(d.pinnedBackY);
    expect(d.pinnedBackY).toBeGreaterThan(0.2);
    expect(d.backY).toBeCloseTo(catBackY(cat), 9);
    expect(d.pinnedBackY).toBeCloseTo(catBackY(cat, 'pinned'), 9);
    const big = buildCat('mainecoon');
    expect(catDims(big).backY).toBeGreaterThan(d.backY * 1.2);
    // where the group stands or faces does not matter
    const moved = buildCat('tabby');
    moved.position.set(5, 2, -3);
    moved.rotation.set(0.4, 1.2, 0.3);
    const dm = catDims(moved);
    for (const k of Object.keys(d)) expect(dm[k]).toBeCloseTo(d[k], 9);
    expect(moved.position.toArray()).toEqual([5, 2, -3]);
    expect(() => catDims(buildCat('hagrid'))).not.toThrow();
  });
});

describe('the full fight stays under 30.5 s (R10)', () => {
  it('worst case, plain and secondLook, with the last round the longest special', () => {
    const maxBasic = Math.max(...Object.values(ACTION_LEN)) + ANSWER_PRELUDE;
    const maxBig = Math.max(...Object.values(ACTION_LEN_BIG)) + ANSWER_PRELUDE;
    const longer = TIMING.squareOff + 2 * (TIMING.answer + LONGER_LOOK + maxBasic) + (TIMING.answer + LONGER_LOOK + maxBig) + 2 * BEAT_TIME;
    const second = TIMING.squareOff + 2 * (TIMING.answer + maxBasic) + (TIMING.answer + maxBig) + TIMING.answer + 2 * BEAT_TIME;
    expect(longer).toBeLessThan(30.5);
    expect(second).toBeLessThan(30.5);
    expect(second).toBeCloseTo(29.65, 6);
  });
});

describe('wire poses (R8)', () => {
  it('wire poses are all states the old animator knows', () => {
    expect(WIRE_POSE).toEqual({ arch: 'cross', rearUp: 'swipe', flinch: 'scared', pinned: 'scared', pinning: 'stalk', roll: 'pounce' });
    for (const s of [...NEW_STATES, ...OLD_STATES]) expect(OLD_STATES).toContain(wirePose(s));
    for (const s of OLD_STATES) expect(wirePose(s)).toBe(s);
  });
});

describe('no cat goes into the ground during any action (review fix 1)', () => {
  it('every kind, big and not, both roles, real cats placed through placeFrame', () => {
    const intruder = buildCat('tabby', undefined, { simple: true, style: clanCast('woods')[3].style });
    intruder.scale.multiplyScalar(0.85);
    const cats = [buildCat('tabby'), buildCat('mainecoon'), intruder];
    const dims = cats.map((c) => catDims(c));
    for (const { kind, big } of variants()) {
      for (let i = 0; i < cats.length; i++) {
        for (const j of [0, 1, 2]) {
          const o = { gap: 1.6, winBackY: dims[i].backY, loseBackY: dims[j].pinnedBackY };
          for (const u of us(100)) {
            const fr = actionFrame(kind, big, u, o);
            for (const [role, f, ci] of [['win', fr.win, i], ['lose', fr.lose, j]]) {
              if (kind === 'pin' && role === 'win' && f.lift > 0.05) continue;
              const cat = cats[ci];
              const p = placeFrame(f, dims[ci]);
              animateCat(cat, f.pose, u * 3, 0, false);
              cat.rotation.order = 'YXZ';
              cat.rotation.set(f.pitch, 0, f.roll);
              cat.position.set(p.dSide, p.y, -p.dAlong);
              cat.updateMatrixWorld(true);
              const min = new THREE.Box3().setFromObject(cat, true).min.y;
              if (min < -0.03) throw new Error(`${kind}${big ? ' big' : ''} ${role} cat ${ci} u ${u}: min y ${min.toFixed(3)}`);
            }
          }
        }
      }
    }
  });
});

describe('cuesCrossed (review fix 2)', () => {
  it('exports the cue points', () => {
    expect(CUES.roll.dust).toEqual([0.2, 0.5]);
    expect(CUES.reduced.dust).toEqual([0]);
    expect(CUES.leap.slash.length).toBe(1);
    expect(CUES.pin.dust.length).toBe(1);
  });
  it('counts crossings prevU < at <= u; the first frame passes -1 so a cue at 0 fires', () => {
    expect(cuesCrossed('leap', false, true, -1, 0)).toEqual({ slash: 0, dust: 1 });
    expect(cuesCrossed('leap', false, true, 0, 0.5)).toEqual({ slash: 0, dust: 0 });
    // one big 0.6 s step crosses every cue once
    expect(cuesCrossed('roll', true, false, -1, 1)).toEqual({ slash: 0, dust: 2 });
    expect(cuesCrossed('leap', false, false, -1, 1)).toEqual({ slash: 1, dust: 0 });
    expect(cuesCrossed('pin', true, false, -1, 1)).toEqual({ slash: 0, dust: 1 });
    expect(cuesCrossed('rearUp', false, false, -1, 1)).toEqual({ slash: 0, dust: 0 });
    expect(cuesCrossed('roll', true, true, -1, 1)).toEqual({ slash: 0, dust: 1 });
    // stepping through in small steps fires each exactly once
    let dust = 0;
    for (let k = 0; k < 100; k++) dust += cuesCrossed('roll', true, false, k === 0 ? -1 : (k - 1) / 99, k / 99).dust;
    expect(dust).toBe(2);
    expect(cuesCrossed('roll', true, false, 0.2, 0.3).dust).toBe(0);
    expect(cuesCrossed('roll', true, false, 0.1, 0.2).dust).toBe(1);
    const out = { slash: 0, dust: 0 };
    expect(cuesCrossed('leap', false, false, 0, 1, out)).toBe(out);
  });
  it('the frame flags sit on the same points', () => {
    expect(actionFrame('leap', false, CUES.leap.slash[0], OPTS).win.slash).toBe(true);
    expect(actionFrame('pin', false, CUES.pin.dust[0], OPTS).win.dust).toBe(true);
  });
});

describe('actionFor fallback', () => {
  it('a won special with an unknown id plays the basic mapping', () => {
    expect(actionFor({ move: 'charge', answer: 'nope', won: true, special: true })).toEqual({ kind: 'leap', by: 'me', big: false });
    expect(actionFor({ move: 'pounce', answer: 'nope', won: true, special: true })).toEqual({ kind: 'pin', by: 'me', big: false });
  });
});
