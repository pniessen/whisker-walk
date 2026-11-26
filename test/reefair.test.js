// The Reef, milestone R1: the air gauge. Five bubbles, 90 s; hidden (and not draining) the first 20 s of a first visit; a soft line at two bubbles; at zero a
// warm bubble lifts her to the ladder, the gauge is full again at once, nothing is lost. A property test over random frame sequences shows no failure
// state is reachable; a scan bans the scary words from every Reef string.
import { describe, it, expect } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import * as THREE from 'three';
import { AIR, createAir, stepAir, bubblesLeft, airHidden, lifting, liftProgress, refill } from '../src/world/reefair.js';
import { createReefLife, liftHeight } from '../src/world/reeflife.js';
import { build } from '../src/world/reef.js';
import { LADDER_FOOT, reefY } from '../src/world/reefplan.js';
import { LINES, HINTS } from '../src/world/reefwords.js';
import { REEF_PAGES } from '../src/reefpages.js';
import { phrase } from '../src/clanphrases.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { mulberry32 } from '../src/rng.js';

const BANNED = /\b(drown\w*|die|dies|died|dead|hurt\w*|panic\w*|gasp\w*|choke\w*|scary|scared|afraid|danger\w*)\b/i;

describe('the numbers', () => {
  it('are the plan\'s: five bubbles, 90 s, 20 s hidden, a soft line at two', () => {
    expect(AIR).toMatchObject({ bubbles: 5, seconds: 90, hideFirst: 20, softAt: 2 });
  });
});

describe('the gauge', () => {
  it('starts full; on a first visit it is hidden and does not drain for the first 20 s', () => {
    const s = createAir({ firstVisit: true });
    expect(bubblesLeft(s)).toBe(5);
    expect(airHidden(s)).toBe(true);
    for (let i = 0; i < 19; i++) stepAir(s, 1);
    expect(airHidden(s)).toBe(true);
    expect(s.used).toBe(0);
    for (let i = 0; i < 2; i++) stepAir(s, 1);
    expect(airHidden(s)).toBe(false);
    expect(s.used).toBeGreaterThan(0);
  });
  it('a return visit shows the gauge from the first moment and drains from it', () => {
    const s = createAir({ firstVisit: false });
    expect(airHidden(s)).toBe(false);
    stepAir(s, 0.5);
    expect(s.used).toBeCloseTo(0.5, 9);
  });
  it('drains five bubbles in 90 s: 5 until 18 s, 4 until 36, 3, 2 at 54 s with the soft line said once, 1 at 72 s', () => {
    const s = createAir();
    const seen = [];
    const events = [];
    for (let t = 0; t < 89; t += 0.5) {
      const ev = stepAir(s, 0.5);
      if (ev) events.push(ev);
      seen.push(bubblesLeft(s));
    }
    expect(seen[0]).toBe(5);
    expect(bubblesLeft({ ...s, used: 18.1 })).toBe(4);
    expect(bubblesLeft({ ...s, used: 36.1 })).toBe(3);
    expect(bubblesLeft({ ...s, used: 54.1 })).toBe(2);
    expect(bubblesLeft({ ...s, used: 72.1 })).toBe(1);
    expect(events).toEqual(['low']);
    expect(s.soft).toBe(true);
  });
  it('at zero a warm bubble lifts her: the event is `lift`, the gauge is FULL at once, and `landed` ends it', () => {
    const s = createAir();
    let ev = null;
    let t = 0;
    while (ev !== 'lift' && t < 200) { ev = stepAir(s, 0.25); t += 0.25; }
    expect(ev).toBe('lift');
    expect(t).toBeCloseTo(90, 0);
    expect(s.used).toBe(0);
    expect(bubblesLeft(s)).toBe(5);
    expect(lifting(s)).toBe(true);
    expect(s.lifts).toBe(1);
    const events = [];
    for (let i = 0; i < 40; i++) { const e = stepAir(s, 0.1); if (e) events.push(e); }
    expect(events).toEqual(['landed']);
    expect(lifting(s)).toBe(false);
    expect(liftProgress(s)).toBe(0);
  });
  it('an air pocket (refill) tops it up and lets the soft line be said again', () => {
    const s = createAir();
    for (let i = 0; i < 60; i++) stepAir(s, 1);
    expect(s.soft).toBe(true);
    refill(s);
    expect(bubblesLeft(s)).toBe(5);
    expect(s.soft).toBe(false);
  });
});

describe('no failure state is reachable (the property)', () => {
  it('over thousands of random frame sequences (tiny, huge, zero, negative, NaN, infinite frames): the state is always in range, a lift always ends, and there is no `out` flag', () => {
    const rng = mulberry32(0x41495221);
    const dts = [0, 0.001, 1 / 60, 1 / 30, 0.1, 0.5, 1, 5, 120, -3, NaN, Infinity, -Infinity, undefined, null, '2'];
    let lifts = 0;
    const bad = [];
    for (let run = 0; run < 300; run++) {
      const s = createAir({ firstVisit: rng() < 0.5 });
      expect(Object.keys(s).sort()).toEqual(['firstVisit', 'lift', 'lifts', 'soft', 't', 'used']); // no failed, out, empty or dead field to reach
      let liftFor = 0;
      for (let k = 0; k < 1500; k++) {
        const dt = rng() < 0.6 ? 0.016 + rng() * 0.05 : dts[Math.floor(rng() * dts.length)];
        const ev = stepAir(s, dt);
        const b = bubblesLeft(s);
        if (![null, 'low', 'lift', 'landed'].includes(ev)) bad.push(['event', ev]);
        if (!(Number.isFinite(s.t) && Number.isFinite(s.used))) bad.push(['finite', run, k]);
        if (!(s.used >= 0 && s.used < AIR.seconds)) bad.push(['used', s.used]);
        if (!(b >= 1 && b <= 5)) bad.push(['bubbles', b]);
        if (!(s.lift === null || (s.lift >= 0 && s.lift < AIR.lift))) bad.push(['lift', s.lift]);
        if (ev === 'lift') { if (b !== 5) bad.push(['not full at the lift']); lifts++; }
        if (lifting(s)) { liftFor += Number.isFinite(dt) && dt > 0 ? Math.min(dt, 1) : 0; if (liftFor >= AIR.lift + 1.01) bad.push(['lift never ends']); } else liftFor = 0;
        if (rng() < 0.002) refill(s);
      }
    }
    expect(bad).toEqual([]);
    expect(lifts).toBeGreaterThan(20); // the gauge really did run out in the runs
  });
  it('a lift always ends: from the moment of the lift, AIR.lift seconds of frames bring `landed`, whatever the frame sizes', () => {
    const rng = mulberry32(7);
    for (let run = 0; run < 200; run++) {
      const s = createAir();
      s.used = AIR.seconds - 0.001;
      expect(stepAir(s, 0.01)).toBe('lift');
      let spent = 0; let landed = false;
      while (spent < AIR.lift + 1.2) {
        const dt = 0.001 + rng() * 0.9;
        const ev = stepAir(s, dt);
        spent += Math.min(dt, 1);
        if (ev === 'landed') { landed = true; break; }
      }
      expect(landed).toBe(true);
    }
  });
  it('the walk\'s part has no way to cost her anything: the life never touches the save, the score, the paws, her wear or her walk (source scan)', () => {
    const src = readFileSync('src/world/reeflife.js', 'utf8').replace(/\/\/.*$/gm, '');
    for (const word of ['progression', 'awardOnce', 'recordGolden', 'endWalk', 'points', 'spend', 'paws']) expect(src, word).not.toMatch(new RegExp(`\\b${word}\\b`));
  });
});

describe('the lift on a walk', () => {
  const setup = (opts = {}) => {
    const scene = new THREE.Scene();
    build(scene);
    const cat = new THREE.Group();
    cat.position.set(-30, reefY(-30, 20), 20);
    const calls = [];
    const player = { halt: () => calls.push('halt'), clearFloat: () => calls.push('clear') };
    const chimes = [];
    const life = createReefLife({ scene, tier: { name: 'high', shadows: true }, visits: 3, audio: { chime: () => chimes.push(1) }, player, doc: null, ...opts });
    const session = { cat, hopLift: 0 };
    const cam = { position: new THREE.Vector3() };
    return { scene, life, cat, session, cam, calls, chimes };
  };
  const run = (r, secs, dt = 0.05) => { for (let t = 0; t < secs; t += dt) r.life.update(dt, t, r.cat.position, r.cam, r.session); };
  it('when the air runs out she is lifted up, set down at the ladder\'s foot, and let down gently; a soft chime; the gauge is full again', () => {
    const r = setup();
    run(r, 89.5);
    expect(r.session.hopLift).toBe(0);
    let maxLift = 0; let placed = false;
    for (let t = 0; t < 5; t += 0.05) {
      r.life.update(0.05, 100 + t, r.cat.position, r.cam, r.session);
      maxLift = Math.max(maxLift, r.session.hopLift);
      if (Math.hypot(r.cat.position.x - LADDER_FOOT.x, r.cat.position.z - LADDER_FOOT.z) < 0.01) placed = true;
    }
    expect(placed).toBe(true);
    expect(r.cat.position.y).toBeCloseTo(reefY(LADDER_FOOT.x, LADDER_FOOT.z), 6);
    expect(maxLift).toBeGreaterThan(1.5);
    expect(r.session.hopLift).toBe(0); // set down: she is on the sand, not hanging in the water
    expect(r.chimes).toHaveLength(1);
    expect(r.life.air.used).toBeLessThan(5);
    expect(r.calls).toContain('clear'); // any float is cleared
    r.life.dispose();
  });
  it('with reduced motion she is simply placed at the ladder (no rise)', () => {
    const r = setup({ reducedMotion: true });
    run(r, 90.3);
    let max = 0;
    for (let t = 0; t < 4; t += 0.05) { r.life.update(0.05, 100 + t, r.cat.position, r.cam, r.session); max = Math.max(max, r.session.hopLift); }
    expect(max).toBe(0);
    expect(Math.hypot(r.cat.position.x - LADDER_FOOT.x, r.cat.position.z - LADDER_FOOT.z)).toBeLessThan(0.01);
    r.life.dispose();
  });
  it('the lift\'s height rises and falls and ends at 0', () => {
    expect(liftHeight(0)).toBe(0);
    expect(liftHeight(1)).toBeCloseTo(0, 9);
    expect(liftHeight(0.5)).toBeCloseTo(2.6, 6);
    expect(liftHeight(-1)).toBe(0);
    expect(liftHeight(9)).toBeCloseTo(0, 9);
  });
});

describe('every Reef string is kind', () => {
  it('the lines, hints and page names (both word sets) never say drown, die, dead, hurt, panic, gasp, choke or scary, and no series word is in the everyday set', () => {
    const all = [...Object.keys(LINES).map((id) => phrase(id)), ...Object.values(HINTS), ...REEF_PAGES.map((p) => p[3])];
    expect(all.length).toBeGreaterThan(20);
    for (const text of all) { expect(text).toMatch(/\S/); expect(text, text).not.toMatch(BANNED); expect(text.length).toBeLessThanOrEqual(90); }
    withOffWords(() => {
      for (const id of Object.keys(LINES)) { expect(bannedIn(phrase(id)), id).toBeNull(); expect(phrase(id), id).not.toMatch(BANNED); }
    });
    for (const id of ['reef.air.low', 'reef.air.lift', 'reef.air.full']) expect(phrase(id), id).toMatch(/\S/);
  });
  it('and every quoted string in the Reef\'s source files is clear of them too (the scan the plan asks for)', () => {
    const files = [...globSync('src/world/reef*.js'), 'src/reefpages.js', 'src/reefflag.js'];
    expect(files.length).toBeGreaterThanOrEqual(8);
    const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
    for (const f of files) {
      for (const m of strip(readFileSync(f, 'utf8')).matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
        const text = m[1] ?? m[2] ?? m[3];
        expect(text, `${f}: ${text}`).not.toMatch(BANNED);
      }
    }
  });
});
