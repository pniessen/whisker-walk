// The failures a grown-up needs to see on a child's device reach the
// diagnostics record (src/diagnostics.js), and only as a kind plus the error's
// own message: nothing from the payload.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { diagnostics } from '../src/diagnostics.js';
import { createBlockList } from '../src/blocklist.js';
import { createMetPlayers } from '../src/metplayers.js';
import { createProgression } from '../src/progression.js';
import { payloadBytes } from '../src/cloud.js';
import { pickBridge } from '../src/game/nearby.js';
import { readDeviceProfile } from '../src/render/deviceprofile.js';

const brokenStorage = (what = 'quota full') => ({
  getItem: () => null,
  setItem: () => { throw new Error(what); },
  removeItem: () => { throw new Error(what); },
});

const kinds = () => diagnostics.entries().map((e) => e.kind);

beforeEach(() => {
  diagnostics.clear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('the remaining failure sites are noted', () => {
  it('a block list that cannot be saved', () => {
    createBlockList(brokenStorage()).add('someone-else');
    const [e] = diagnostics.entries();
    expect(e.kind).toBe('save');
    expect(e.message).toBe('Error: quota full');
    expect(JSON.stringify(e)).not.toContain('someone-else');
  });

  it('a met list that cannot be saved', () => {
    createMetPlayers(brokenStorage()).add('pal-1');
    expect(kinds()).toContain('save');
    expect(JSON.stringify(diagnostics.entries())).not.toContain('pal-1');
  });

  it('a save that cannot be written, and one that cannot be read', () => {
    const p = createProgression(brokenStorage('disk says no'));
    p.setPetName?.('Whiskers');
    p.addPoints?.(5);
    const hit = diagnostics.entries().find((e) => e.message.includes('disk says no'));
    expect(hit?.kind).toBe('save');
    expect(JSON.stringify(diagnostics.entries())).not.toContain('Whiskers');

    diagnostics.clear();
    const unreadable = { getItem: () => { throw new Error('read refused'); }, setItem() {}, removeItem() {} };
    createProgression(unreadable);
    expect(diagnostics.entries().some((e) => e.kind === 'save' && e.message.includes('read refused'))).toBe(true);
  });

  it('a save that is not this game\'s is noted without its contents', () => {
    const store = new Map([['whisker-walk-save', '{"version":999,"petName":"Secretname"}']]);
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
    createProgression(storage);
    expect(kinds()).toContain('save');
    expect(JSON.stringify(diagnostics.entries())).not.toContain('Secretname');
  });

  it('a cloud payload that cannot be measured', () => {
    const loop = {}; loop.self = loop;
    expect(payloadBytes(loop)).toBe(Infinity);
    expect(kinds()).toEqual(['cloud']);
  });

  it('an iOS bridge getter that throws', () => {
    const win = { get webkit() { throw new Error('bridge gone'); } };
    expect(pickBridge(win)).toBeNull();
    expect(readDeviceProfile({ get __whiskerDevice() { throw new Error('bridge gone'); }, get whiskerDevice() { throw new Error('bridge gone'); } })).toBeNull();
    expect(kinds()).toContain('bridge');
    expect(diagnostics.entries()[0].message).toBe('Error: bridge gone');
  });
});

describe('wiring that needs a browser to exercise', () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  it('registering the service worker and creating the renderer note their failures', () => {
    const main = read('../src/main.js');
    expect(main).toContain(".catch((err) => note('sw', err))");
    expect(main).toMatch(/catch \(err\) \{\n  renderer = null;\n  note\('gl', err\);/);
  });
});
