import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  createFrameGuard, mayAutoReload, claimAutoReload, stuckNoticeHtml,
  TRIP_STREAK, TRIP_IN_WINDOW, WINDOW_MS, RELOAD_KEY, RELOAD_GAP_MS, WALK_ENDED_LINE, RELOAD_BUTTON_ID,
} from '../src/game/recovery.js';

describe('the frame guard', () => {
  it('tolerates a single throw', () => {
    const g = createFrameGuard();
    expect(g.fail(0)).toBe('skip');
    g.ok();
    expect(g.streak).toBe(0);
  });

  it('trips on frames that keep throwing', () => {
    const g = createFrameGuard();
    const verdicts = [];
    for (let i = 0; i < TRIP_STREAK; i++) verdicts.push(g.fail(i * 16));
    expect(verdicts.slice(0, -1).every((v) => v === 'skip')).toBe(true);
    expect(verdicts.at(-1)).toBe('trip');
  });

  it('a good frame resets the streak', () => {
    const g = createFrameGuard();
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < TRIP_STREAK - 1; i++) expect(g.fail(round * 10_000 + i)).toBe('skip');
      g.ok();
    }
  });

  it('catches a bug that throws on some frames and not others', () => {
    const g = createFrameGuard();
    let verdict = 'skip';
    let frames = 0;
    // throws on every other frame, never twice in a row
    for (let t = 0; verdict === 'skip' && t < WINDOW_MS; t += 16) {
      frames += 1;
      if (frames % 2) verdict = g.fail(t);
      else g.ok();
    }
    expect(verdict).toBe('trip');
    expect(frames).toBe(TRIP_IN_WINDOW * 2 - 1);
  });

  it('rare one-off throws, spread out, never trip', () => {
    const g = createFrameGuard();
    for (let i = 0; i < 200; i++) {
      expect(g.fail(i * Math.ceil(WINDOW_MS / (TRIP_IN_WINDOW - 2)))).toBe('skip');
      g.ok();
    }
  });

  it('reset clears the window too', () => {
    const g = createFrameGuard({ streak: 100, inWindow: 3, windowMs: 1000 });
    g.fail(0); g.fail(1);
    g.reset();
    expect(g.fail(2)).toBe('skip');
    expect(g.fail(3)).toBe('skip');
    expect(g.fail(4)).toBe('trip');
  });
});

function memStorage(init = {}) {
  const map = new Map(Object.entries(init));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
}

describe('the reload-loop guard', () => {
  it('allows the first automatic reload and not another within the gap', () => {
    expect(mayAutoReload(null, 5000)).toBe(true);
    expect(mayAutoReload('', 5000)).toBe(true);
    expect(mayAutoReload('junk', 5000)).toBe(true);
    expect(mayAutoReload('5000', 5000 + RELOAD_GAP_MS - 1)).toBe(false);
    expect(mayAutoReload('5000', 5000 + RELOAD_GAP_MS)).toBe(true);
  });

  it('treats a stamp a little in the future as recent, a far one as nothing', () => {
    expect(mayAutoReload(String(10_000 + 5000), 10_000)).toBe(false);
    expect(mayAutoReload(String(10_000 + RELOAD_GAP_MS * 61), 10_000)).toBe(true);
  });

  it('claims the reload by writing the stamp first', () => {
    const s = memStorage();
    expect(claimAutoReload(s, 1000)).toBe(true);
    expect(s.map.get(RELOAD_KEY)).toBe('1000');
    expect(claimAutoReload(s, 1000 + 30_000)).toBe(false);
    expect(s.map.get(RELOAD_KEY)).toBe('1000');
    expect(claimAutoReload(s, 1000 + RELOAD_GAP_MS)).toBe(true);
  });

  it('no storage, or storage that throws or drops writes, means no automatic reload', () => {
    expect(claimAutoReload(null, 1000)).toBe(false);
    expect(claimAutoReload({ getItem: () => { throw new Error('denied'); } }, 1000)).toBe(false);
    expect(claimAutoReload({ getItem: () => null, setItem: () => { throw new Error('quota'); } }, 1000)).toBe(false);
    expect(claimAutoReload({ getItem: () => null, setItem: () => {} }, 1000)).toBe(false);
  });
});

describe('what the child sees', () => {
  it('the walk-ended line is gentle and says nothing was lost', () => {
    expect(WALK_ENDED_LINE).toMatch(/^Oops! Something went wrong on that walk/);
    expect(WALK_ENDED_LINE).toContain('Everything you found is saved');
  });

  it('the last-resort notice offers only a reload', () => {
    const html = stuckNoticeHtml();
    expect(html).toContain('Something went wrong, sorry!');
    expect(html).toContain(`<button id="${RELOAD_BUTTON_ID}" class="primary">Start again</button>`);
    expect(stuckNoticeHtml('gl')).toContain('The game’s pictures stopped working.');
  });
});

// main.js wiring the guard in (its init closure cannot be reached from a test).
describe('main.js (source pins)', () => {
  const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

  it('wraps the whole frame in one try/catch, and a capped refresh is not a good frame', () => {
    expect(src).toContain([
      '  renderer.setAnimationLoop(() => {',
      '    try {',
      '      if (walkFrame() !== false) frameGuard.ok();',
      '    } catch (err) {',
      '      onFrameError(err);',
      '    }',
      '  });',
      '  function walkFrame() {',
    ].join('\n'));
  });

  it('ends a tripped walk through endWalk, and stops the loop when it cannot', () => {
    const body = src.slice(src.indexOf('function onFrameError(err) {'), src.indexOf('// The main canvas losing'));
    expect(body).toContain("if (!session) { stopLoop('error'); return; }");
    expect(body).toMatch(/try \{\s+endWalk\(\);\s+\} catch \(endErr\) \{[\s\S]*stopLoop\('error'\);/);
    expect(body).toContain('WALK_ENDED_LINE');
  });

  it('handles the main canvas losing its context with a guarded reload', () => {
    expect(src).toContain("canvas.addEventListener('webglcontextlost', (e) => {");
    expect(src).toContain("canvas.addEventListener('webglcontextrestored',");
    expect(src).toContain("if (!claimAutoReload(tabStorage, Date.now())) { stopLoop('gl'); return; }");
    expect(src).toContain('listenForErrors(window);');
  });
});
