import { describe, it, expect } from 'vitest';
import { SINK, makeView, segmentMeetsSection, wantsDown, createWallSink, blockers } from '../src/housewalls.js';

const wall = { id: 'w', kind: 'wall', x0: -2, z0: 0, x1: 2, z1: 0, base: 0, height: 2.8, stub: 0.25 };
const cat = { x: 0, y: 0, z: -2 };
const behind = makeView(cat, { x: 0, y: 2.9, z: 2.4 }, 0.74);
const stubF = 0.25 / 2.8;
const DT = 1 / 60;

function run(sink, seconds, view, wanted) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) sink.update(DT, wanted);
}
const wanting = behind;                                           // wall sits between camera and cat
const idle = makeView({ x: 0, y: 0, z: -2 }, { x: 0, y: 2.9, z: -6 }, 0.74); // wall far behind the camera

describe('which walls sink', () => {
  it('sinks a wall between camera and cat, not one behind the cat', () => {
    expect(wantsDown(wall, behind)).toBe(true);
    expect(wantsDown({ ...wall, z0: -4, z1: -4 }, behind)).toBe(false);
  });
  it('sinks a wall the camera stands beside, and lets a segment pass over a low one', () => {
    expect(wantsDown({ ...wall, z0: 3.3, z1: 3.3 }, behind)).toBe(true);
    expect(segmentMeetsSection({ x: 0, y: 3, z: 2 }, { x: 0, y: 3, z: -2 }, wall)).toBe(false);
    expect(segmentMeetsSection({ x: 0, y: 1, z: 2 }, { x: 0, y: 1, z: -2 }, wall)).toBe(true);
  });
  it('cuts away walls in front of the cat when zoomed out, and keeps the far wall', () => {
    const far = makeView({ x: 0, y: 0, z: 0 }, { x: 0, y: 6.5, z: 8 }, 0.74);
    expect(far.cutaway).toBe(true);
    expect(wantsDown({ ...wall, z0: 4, z1: 4 }, far)).toBe(true);
    expect(wantsDown({ ...wall, z0: -4, z1: -4 }, far)).toBe(false);
  });
  it('makeView reuses its output and places look and paws', () => {
    const out = {};
    const v = makeView(cat, { x: 1, y: 2, z: 3 }, 0.74, out);
    expect(v).toBe(out);
    expect(v.look.y).toBeCloseTo(0.74);
    expect(v.paws.y).toBeCloseTo(0.2);
    expect(v.cutaway).toBe(false);
    expect(makeView(cat, { x: 0, y: 2, z: 4 }, 0.74, out).cutaway).toBe(true);
  });
});

describe('easing', () => {
  it('goes down in 0.2 s, waits 0.5 s, rises in 0.6 s', () => {
    const sink = createWallSink([wall]);
    run(sink, 0.2 - DT, null, wanting);
    expect(sink.fraction('w')).toBeGreaterThan(stubF + 0.001);
    run(sink, 2 * DT, null, wanting);
    expect(sink.fraction('w')).toBeCloseTo(stubF, 5);
    expect(sink.isDown('w')).toBe(true);
    run(sink, 0.5 - 2 * DT, null, idle);
    expect(sink.fraction('w')).toBeCloseTo(stubF, 5);
    run(sink, 0.6 + 3 * DT, null, idle);
    expect(sink.fraction('w')).toBe(1);
    expect(sink.isDown('w')).toBe(false);
  });
  it('a wall wanted on and off every 0.1 s goes down once and stays down', () => {
    const sink = createWallSink([wall]);
    let prev = 1;
    let rose = false;
    for (let i = 0; i < 180; i++) {
      sink.update(DT, Math.floor(i / 6) % 2 === 0 ? wanting : idle);
      if (sink.fraction('w') > prev + 1e-12) rose = true;
      prev = sink.fraction('w');
    }
    expect(rose).toBe(false);
    expect(sink.fraction('w')).toBeCloseTo(stubF, 9);
  });
  it('reduced motion snaps, and still waits before rising', () => {
    const sink = createWallSink([wall], { reducedMotion: true });
    sink.update(DT, wanting);
    expect(sink.fraction('w')).toBeCloseTo(stubF, 9);
    sink.update(0.49, idle);
    expect(sink.fraction('w')).toBeCloseTo(stubF, 9);
    sink.update(0.02, idle);
    expect(sink.fraction('w')).toBe(1);
  });
  it('drops a lintel to nothing', () => {
    const lintel = { id: 'l', kind: 'lintel', x0: -1, z0: 0, x1: 1, z1: 0, base: 2.2, height: 0.6, stub: 0 };
    const sink = createWallSink([lintel]);
    const high = makeView(cat, { x: 0, y: 4.6, z: 2.4 }, 0.74); // the line crosses the lintel at about 2.5 m
    expect(wantsDown(lintel, high)).toBe(true);
    run(sink, 0.3, null, high);
    expect(sink.fraction('l')).toBe(0);
  });
  it('names only standing walls that block', () => {
    const sink = createWallSink([wall]);
    expect(blockers([wall], sink, wanting)).toEqual(['w']);
    run(sink, 0.3, null, wanting);
    expect(blockers([wall], sink, wanting)).toEqual([]);
  });
});
