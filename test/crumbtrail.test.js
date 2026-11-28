// Crash breadcrumbs: the call sites that drop a short step name into the one crumb list (diagnostics.crumb),
// never free text, at most the last 8.
import { describe, it, expect, beforeEach } from 'vitest';
import { stubCanvasDocument } from './helpers/canvas.js';
import { memoryStorage } from './helpers/storage.js';

stubCanvasDocument();
const { diagnostics, CRUMB_CAPACITY } = await import('../src/diagnostics.js');
const { handleFairEvent } = await import('../src/game/fairplay.js');
const { createProgression, JOURNAL_TYPES } = await import('../src/progression.js');

describe('crash breadcrumbs', () => {
  beforeEach(() => diagnostics.clear());

  it('a fair ride and a dismount leave crumbs', () => {
    const ctx = { hud: { toast() {} }, audio: {}, log: { count: () => 1, mark() {} }, progression: { recordSighting() {} }, session: {}, once() {} };
    handleFairEvent({ type: 'ride', ride: 'wheel' }, ctx);
    handleFairEvent({ type: 'dismount' }, ctx);
    expect(diagnostics.crumbs()).toEqual(['ride:wheel', 'dismount']);
  });

  it('a mission or ride page sighting leaves its id, a plain animal does not', () => {
    const p = createProgression(memoryStorage());
    p.recordSighting('bird');
    p.recordSighting('mnrover');
    p.recordSighting('not-a-page');
    expect(diagnostics.crumbs()).toEqual(['see:mnrover']);
    expect(JOURNAL_TYPES).toContain('mnrover');
  });

  it('keeps only the last 8 and strips anything but a short id', () => {
    for (let i = 0; i < 12; i++) diagnostics.crumb(`gate:place${i}`);
    diagnostics.crumb('Pet Name: Fluffy!!');
    const c = diagnostics.crumbs();
    expect(c).toHaveLength(CRUMB_CAPACITY);
    expect(CRUMB_CAPACITY).toBe(8);
    expect(c.at(-1)).toBe('petname:fluffy');
    expect(c[0]).toBe('gate:place5');
  });
});
