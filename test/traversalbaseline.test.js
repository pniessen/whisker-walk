import { describe, it, expect, vi } from 'vitest';

vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: () => {} });
        if (key === 'measureText') return () => ({ width: 10 });
        return () => {};
      },
      set: () => true,
    }),
  }),
  addEventListener() {},
  pointerLockElement: null,
  exitPointerLock() {},
});

const { yardWalk } = await import('./helpers/traversalwalk.js');
const { roofsArea } = await import('../src/world/roofsplan.js');
const { yardArea } = await import('../src/world/traversalyard.js');
const { balanceStep, CROSSING_KINDS } = await import('../src/traversal.js');

// =============================================================================
// Every crossing the game had before the Lighthouse's `stair` kind, walked end
// to end from its first end on the real player and the real runtime, and what
// it did: the kind, the rail's length, the events, how long it took, and where
// she stood at the end. The table below was written from the code BEFORE the
// stair kind existed; it must never change when the kind is added (or later).
// =============================================================================

const r3 = (n) => Math.round(n * 1000) / 1000;

function walkEnd(area, c) {
  const e = c.ends[0];
  const w = yardWalk({ area, at: [e.x, e.z], face: [e.inX, e.inZ] });
  w.push(e.inX, e.inZ);
  let frames = 0;
  while (!w.live.busy && frames < 90) { w.frame(); frames++; }
  const mounted = w.live.crossing?.id ?? null;
  let n = 0;
  while (w.live.busy && n < 1500) { w.frame(); n++; }
  const out = `${c.id}|${c.kind}|${r3(c.length)}|${w.events.map((x) => x.type).join('+')}|${mounted}|${n > 0 ? 'ended' : 'never'}|${Math.round(n / 5) * 5}|${r3(w.cat.position.x)},${r3(w.cat.position.z)}`;
  w.live.dispose();
  return out;
}

function table(area) {
  return area.traversal.crossings.map((c) => walkEnd(area, c));
}

describe('every crossing from before the stair kind is exactly as it was', () => {
  it('the table of walks (set WRITE_BASELINE=1 to print it)', () => {
    const rows = [...table(yardArea()), ...table(roofsArea())];
    if (process.env.WRITE_BASELINE) console.log(`BASELINE\n${JSON.stringify(rows, null, 1)}`);
    expect(rows).toEqual(BASELINE);
  }, 120000);

  it('the careful and the steady speeds of every old kind', () => {
    const speeds = {};
    for (const kind of ['plank', 'ridge', 'gutter', 'line', 'pipe']) {
      const c = { kind, length: 50, reach: 0 };
      for (const steady of [false, true]) {
        const st = { u: 1, v: 0 };
        for (let i = 0; i < 200; i++) balanceStep(st, c, 1, 1 / 60, steady);
        speeds[`${kind}${steady ? '+' : ''}`] = r3(st.v);
      }
    }
    expect(speeds).toEqual({ plank: 1.2, 'plank+': 1.7, ridge: 1.2, 'ridge+': 1.7, gutter: 1.2, 'gutter+': 1.7, line: 1.2, 'line+': 1.7, pipe: 1.2, 'pipe+': 1.7 });
  });

  it('the five old kinds stay, in order, with the stair after them', () => {
    expect(CROSSING_KINDS.slice(0, 5)).toEqual(['plank', 'ridge', 'gutter', 'line', 'pipe']);
  });
});

const BASELINE = [
  'plank-1|plank|6.8|mount+cross|plank-1|ended|350|-1.594,-13',
  'plank-2|plank|5.8|mount+cross|plank-2|ended|300|-8.406,6',
  'line-1|line|6.8|mount+cross|line-1|ended|350|-8.406,-9',
  'ridge-1|ridge|5.8|mount+cross|ridge-1|ended|300|13.406,-11',
  'plank-1|plank|9.2|mount+cross|plank-1|ended|470|-24,19.394',
  'plank-2|plank|9.2|mount+cross|plank-2|ended|470|1,19.394',
  'plank-3|plank|10.2|mount+cross|plank-3|ended|520|16,19.394',
  'line-1|line|11.6|mount+cross|line-1|ended|590|-9.944,14',
  'line-2|line|11.6|mount+cross|line-2|ended|590|15.056,14',
  'gutter-1|gutter|5.1|mount+cross|gutter-1|ended|265|0.406,11.6',
  'gutter-2|gutter|10.1|mount+cross|gutter-2|ended|515|14.706,11.6',
  'ridge-1|ridge|9.7|mount+cross|ridge-1|ended|495|-20.144,7.5',
  'ridge-2|ridge|9.7|mount+cross|ridge-2|ended|495|-10.144,7.5',
  'ridge-3|ridge|9.7|mount+cross|ridge-3|ended|495|-0.144,7.5',
  'ridge-4|ridge|4.7|mount+cross|ridge-4|ended|245|9.856,7.5',
  'ridge-5|ridge|9.7|mount+cross|ridge-5|ended|495|19.856,7.5',
  'ridge-6|ridge|9.1|mount+cross|ridge-6|ended|465|29.256,7.5',
  'pipe-1|pipe|10.065|mount+cross|pipe-1|ended|510|-30.503,-43.506',
];
