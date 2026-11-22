import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTvLoader, tvWanted, tvState, resetTv } from '../src/tvseam.js';
import { createSettings } from '../src/settings.js';
import { line, hasLine } from '../src/tutorialwords.js';

function memStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}

beforeEach(() => resetTv());

describe('tvWanted', () => {
  it('follows the saved setting with no query', () => {
    expect(tvWanted('', false)).toBe(false);
    expect(tvWanted('', true)).toBe(true);
  });
  it('?tv=1 forces on and ?tv=0 forces off, for this load only', () => {
    expect(tvWanted('?tv=1', false)).toBe(true);
    expect(tvWanted('?tv=0', true)).toBe(false);
    expect(tvWanted('?tv=banana', true)).toBe(true);
  });
});

describe('the TV chunk loader', () => {
  function rig({ fail = false } = {}) {
    const html = new Set();
    const stop = vi.fn(() => html.delete('tv'));
    let release;
    const gate = new Promise((r) => { release = r; });
    const load = vi.fn(async () => {
      await gate;
      if (fail) throw new Error('offline');
      return { start: vi.fn(async () => { html.add('tv'); return { stop }; }) };
    });
    const settings = createSettings(memStorage());
    const onFail = vi.fn();
    const loader = createTvLoader({ load, ctx: () => ({}), settings, onFail });
    return { html, stop, load, settings, onFail, loader, release };
  }

  it('switching on loads once and adds nothing to html before it resolves', async () => {
    const r = rig();
    const a = r.loader.apply(true);
    r.loader.apply(true);
    expect(r.load).toHaveBeenCalledTimes(1);
    expect(r.html.size).toBe(0);
    expect(tvState.on).toBe(false);
    r.release();
    expect(await a).toBe(true);
    expect(r.html.has('tv')).toBe(true);
    expect(tvState.on).toBe(true);
  });

  it('a failed import explains, leaves tvMode off, and says so', async () => {
    const r = rig({ fail: true });
    r.settings.set('tvMode', true);
    const p = r.loader.apply(true);
    r.release();
    expect(await p).toBe(false);
    expect(r.settings.get('tvMode')).toBe(false);
    expect(r.onFail).toHaveBeenCalledTimes(1);
    expect(tvState.on).toBe(false);
  });

  it('switching off stops the chunk and removes html.tv', async () => {
    const r = rig();
    r.release();
    await r.loader.apply(true);
    await r.loader.apply(false);
    expect(r.stop).toHaveBeenCalledTimes(1);
    expect(r.html.size).toBe(0);
    expect(tvState.on).toBe(false);
  });

  it('switching off while still loading stops it the moment it arrives', async () => {
    const r = rig();
    const p = r.loader.apply(true);
    r.loader.apply(false);
    r.release();
    expect(await p).toBe(false);
    expect(r.stop).toHaveBeenCalledTimes(1);
    expect(tvState.on).toBe(false);
  });

  it('can be switched on again after leaving', async () => {
    const r = rig();
    r.release();
    await r.loader.apply(true);
    await r.loader.apply(false);
    await r.loader.apply(true);
    expect(tvState.on).toBe(true);
  });

  it('off with nothing loaded does nothing and loads nothing', async () => {
    const r = rig();
    expect(await r.loader.apply(false)).toBe(false);
    expect(r.load).not.toHaveBeenCalled();
  });
});

describe('a forced load and the switch', () => {
  it('a failed ?tv=1 load does not wipe the saved choice', async () => {
    const settings = createSettings(memStorage());
    settings.set('tvMode', true);
    const loader = createTvLoader({ load: async () => { throw new Error('offline'); }, ctx: () => ({}), settings, onFail() {} });
    expect(await loader.apply(true, true)).toBe(false);
    expect(settings.get('tvMode')).toBe(true);
    // a failure from the switch itself does uncheck it
    expect(await loader.apply(true, false)).toBe(false);
    expect(settings.get('tvMode')).toBe(false);
  });

  it('the switch shows what is in force: pending counts as on, ?tv=0 with a saved on shows off', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/ui/homebase.js', import.meta.url), 'utf8');
    expect(src).toMatch(/settingsSwitchHtml\('set-tv-mode', !!\(tvState\.on \|\| tvState\.pending\)/);
    let release;
    const loader = createTvLoader({ load: () => new Promise((r) => { release = () => r({ start: async () => ({ stop() {} }) }); }), ctx: () => ({}), settings: createSettings(memStorage()) });
    const p = loader.apply(true);
    expect(tvState.pending).toBe(true);
    release();
    await p;
    expect([tvState.on, tvState.pending]).toEqual([true, false]);
    await loader.apply(false);
    expect([tvState.on, tvState.pending]).toEqual([false, false]);
  });
});

describe('the TV words that start-up carries', () => {
  it('the switch label, its note and the failure line exist', () => {
    for (const id of ['pad.settings.tv', 'pad.settings.tv-note', 'pad.settings.tv-failed']) {
      expect(hasLine(id), id).toBe(true);
      expect(line(id).length, id).toBeGreaterThan(0);
    }
    expect(line('pad.settings.tv')).toBe('TV mode');
  });
  it('only the keyboard form of the note names a key', () => {
    expect(line('pad.settings.tv-note', { touch: true })).not.toMatch(/⌃|⌘|Press/);
    expect(line('pad.settings.tv-note', { touch: false })).toMatch(/⌃⌘F/);
  });
});

describe('the Sound & controls switch', () => {
  it('homebase draws set-tv-mode with its words, and wires it to onTvChange (source check)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/ui/homebase.js', import.meta.url), 'utf8');
    expect(src).toMatch(/settingsSwitchHtml\('set-tv-mode', !!\(tvState\.on \|\| tvState\.pending\), tutorialLine\('pad\.settings\.tv'\)\)/);
    expect(src).toMatch(/e\.target\.id === 'set-tv-mode'[\s\S]{0,200}onTvChange\?\.\(/);
    const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    expect(main).toMatch(/onTvChange: \(on\) => tvLoader\.apply\(on\)/);
    // the chunk is reached through one dynamic import and nothing static
    expect(main).toMatch(/import\('\.\/tv\/index\.js'\)/);
    expect(main).not.toMatch(/from '\.\/tv\//);
  });
});
