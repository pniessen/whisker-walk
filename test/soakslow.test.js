import { describe, it, expect } from 'vitest';
import { BOOT_EVAL_TIMEOUT_MS, consoleLine, createRing, evalTimeoutFor, formatMetrics, isSoftwareGl, logLine, parseSize } from '../scripts/soak/diagnose.mjs';
import { parseSoakArgs, replayCommand } from '../scripts/soak/args.mjs';
import { seedSettings } from '../scripts/soak/save.mjs';
import { createSettings } from '../src/settings.js';

describe('soak on slow machines', () => {
  it('waits long while the page is booting or loading, and the set time once it walks', () => {
    expect(evalTimeoutFor('boot', 20e3)).toBe(BOOT_EVAL_TIMEOUT_MS);
    expect(evalTimeoutFor(undefined, 20e3)).toBe(BOOT_EVAL_TIMEOUT_MS);
    expect(evalTimeoutFor('loading', 20e3)).toBe(BOOT_EVAL_TIMEOUT_MS);
    expect(evalTimeoutFor('walk', 20e3)).toBe(20e3);
    expect(evalTimeoutFor('boot', 300e3)).toBe(300e3);
  });
  it('parses sizes and refuses junk', () => {
    expect(parseSize('640x360')).toEqual({ w: 640, h: 360 });
    expect(() => parseSize('big')).toThrow(/WxH/);
  });
  it('new flags parse and replay', () => {
    const o = parseSoakArgs(['--eval-timeout', '90', '--size', '640x360', '--quality', 'low']);
    expect(o).toMatchObject({ evalTimeout: 90, size: '640x360', quality: 'low' });
    expect(parseSoakArgs(replayCommand(o).split(' ').slice(2))).toEqual(o);
    expect(() => parseSoakArgs(['--quality', 'ultra'])).toThrow();
    expect(parseSoakArgs([]).quality).toBe('auto');
  });
  it('seeds a quality the game accepts', () => {
    const store = { getItem: () => JSON.stringify(seedSettings({ tv: 0, couch: 0, quality: 'low' })), setItem() {} };
    expect(createSettings(store).get('quality')).toBe('low');
  });
  it('keeps the last console lines, and formats them', () => {
    const r = createRing(2); r.push('a'); r.push('b'); r.push('c');
    expect(r.list()).toEqual(['b', 'c']);
    expect(consoleLine({ type: 'error', args: [{ value: 'x' }, { description: 'y' }] })).toBe('error: x y');
    expect(logLine({ level: 'warning', text: 't', url: 'http://h/a/b.js', lineNumber: 4 })).toBe('warning: t (b.js:4)');
  });
  it('trims the metrics and spots a software renderer', () => {
    expect(formatMetrics([{ name: 'Timestamp', value: 1.23456 }, { name: 'Other', value: 5 }])).toEqual({ Timestamp: 1.235 });
    expect(isSoftwareGl('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))')).toBe(true);
    expect(isSoftwareGl('ANGLE (AMD, Radeon Pro WX 4100)')).toBe(false);
  });
});
