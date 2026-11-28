import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { mulberry32 } from '../scripts/soak/rng.mjs';
import { WALK_ENDED_LINE } from '../src/game/recovery.js';
import { formatDiagHtml } from '../src/ui/perfhud.js';
import { objectiveDistance } from '../src/questscent.js';

// The bot is a plain script; load only its pure helpers (cfg.noStart) into a bare context.
const source = readFileSync(new URL('../scripts/soak/pagebot.js', import.meta.url), 'utf8');
const ctx = { window: { __SOAK_CFG: { noStart: true } }, globalThis: null };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(source, ctx);
const brain = ctx.__soakBrain;

describe('soak page bot helpers', () => {
  it('its generator is the same as scripts/soak/rng.mjs', () => {
    const a = brain.mulberry32(1234); const b = mulberry32(1234);
    for (let i = 0; i < 20; i++) expect(a()).toBe(b());
  });
  it('reads the HUD distance the game writes', () => {
    expect(brain.parseDistance(objectiveDistance(25))).toBe(25);
    expect(brain.parseDistance(objectiveDistance(0.5))).toBe(0);
    expect(brain.parseDistance('')).toBeNull();
    expect(brain.parseDistance(null)).toBeNull();
  });
  it('looks for the same card text the game shows', () => {
    expect(WALK_ENDED_LINE).toContain(brain.WALK_ENDED);
  });
  it('reads back the diagnostics lines the perf readout draws', () => {
    const html = formatDiagHtml([{ time: 0, kind: 'frame', message: 'TypeError: x is not a function', source: 'main-abc.js', line: 120, count: 3 }, { time: 0, kind: 'error', message: 'boom', source: '', line: 0, count: 1 }], 4, true);
    const lines = [...html.matchAll(/<div class="diag-line">(.*?)<\/div>/g)].map((m) => m[1]);
    expect(brain.parseDiagHead(html.match(/<div class="diag-head">(.*?)<\/div>/)[1])).toBe(4);
    const parsed = lines.map(brain.parseDiagLine);
    expect(parsed[0]).toMatchObject({ kind: 'error', message: 'boom', source: '', line: 0 });
    expect(parsed[1]).toMatchObject({ kind: 'frame', count: 3, message: 'TypeError: x is not a function', source: 'main-abc.js', line: 120 });
  });
  it('keeps a heading that closes in and turns 90 to 180 degrees when it does not', () => {
    const rnd = mulberry32(3);
    const near = brain.nextHeading({ heading: 1, before: 30, after: 25, rnd });
    expect(Math.abs(near - 1)).toBeLessThan(0.16);
    for (let i = 0; i < 20; i++) {
      const away = Math.abs(brain.nextHeading({ heading: 0, before: 25, after: 30, rnd }));
      expect(away).toBeGreaterThanOrEqual(Math.PI / 2 - 1e-9);
      expect(away).toBeLessThanOrEqual(Math.PI + 1e-9);
    }
  });
});
