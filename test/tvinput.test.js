import { describe, it, expect, vi } from 'vitest';
import { createInputTracker } from '../src/tv/input.js';

function rig({ touchMode = false } = {}) {
  const listeners = {};
  const win = {
    addEventListener: (t, f) => { (listeners[t] ||= []).push(f); },
    removeEventListener: (t, f) => { listeners[t] = (listeners[t] || []).filter((x) => x !== f); },
  };
  const body = { dataset: {}, classList: { contains: (c) => touchMode && c === 'touch-mode' } };
  const hooks = { padUse: null, padConnect: null, padDisconnect: null };
  const fire = (t, e = {}) => (listeners[t] || []).forEach((f) => f({ isTrusted: true, ...e }));
  return { win, doc: { body }, body, hooks, fire, listeners };
}

describe('the last-input tracker', () => {
  it('starts on the keyboard, or on touch in touch mode', () => {
    expect(rig().body.dataset.input).toBeUndefined();
    const a = rig(); createInputTracker({ ...a, setInput: () => {} });
    expect(a.body.dataset.input).toBe('keys');
    const b = rig({ touchMode: true }); createInputTracker({ ...b, setInput: () => {} });
    expect(b.body.dataset.input).toBe('touch');
  });

  it('follows real events: pad use, touch, keys, mouse', () => {
    const r = rig();
    const setInput = vi.fn();
    createInputTracker({ ...r, setInput });
    r.hooks.padUse();
    expect(r.body.dataset.input).toBe('pad');
    r.fire('touchstart');
    expect(r.body.dataset.input).toBe('touch');
    r.fire('keydown');
    expect(r.body.dataset.input).toBe('keys');
    r.hooks.padUse();
    r.fire('pointerdown', { pointerType: 'mouse' });
    expect(r.body.dataset.input).toBe('keys');
    r.hooks.padUse();
    r.fire('pointerdown', { pointerType: 'touch' });
    expect(r.body.dataset.input).toBe('touch');
    // told once per change, not per event
    const n = setInput.mock.calls.length;
    r.fire('pointerdown', { pointerType: 'touch' });
    expect(setInput.mock.calls.length).toBe(n);
  });

  it('an untrusted event does not change it (the pad\'s own synthetic Enter)', () => {
    const r = rig();
    createInputTracker({ ...r, setInput: () => {} });
    r.hooks.padUse();
    r.fire('keydown', { isTrusted: false });
    r.fire('pointerdown', { isTrusted: false });
    r.fire('touchstart', { isTrusted: false });
    expect(r.body.dataset.input).toBe('pad');
  });

  it('a pad that only connects leaves it unchanged', () => {
    const r = rig();
    createInputTracker({ ...r, setInput: () => {} });
    r.hooks.padConnect?.({ id: 'x' });
    expect(r.body.dataset.input).toBe('keys');
  });

  it('destroy removes the listeners and gives the hook back', () => {
    const r = rig();
    const t = createInputTracker({ ...r, setInput: () => {} });
    t.destroy();
    expect(r.hooks.padUse).toBeNull();
    expect(Object.values(r.listeners).every((l) => l.length === 0)).toBe(true);
    expect(r.body.dataset.input).toBeUndefined();
  });
});
