import { describe, it, expect, afterEach } from 'vitest';
import { createSettings } from '../src/settings.js';
import { coopMode, coopWanted } from '../src/coopseam.js';
import { memoryStorage } from './helpers/storage.js';
import { rig, pad, set, joined, find, reset, PAD_BUTTONS } from './helpers/couchrig.js';

afterEach(reset);
const A = PAD_BUTTONS.A;

describe('Two-player couch mode: the Settings switch and the URL', () => {
  it('is off by default and persists On and Off per device (never in the save)', () => {
    const st = memoryStorage();
    const s = createSettings(st);
    expect(s.get('couchMode')).toBe(false);
    s.set('couchMode', true);
    expect(createSettings(st).get('couchMode')).toBe(true);
    expect(JSON.parse(st.getItem('whisker-walk-settings')).couchMode).toBe(true);
    s.set('couchMode', false);
    expect(createSettings(st).get('couchMode')).toBe(false);
    st.setItem('whisker-walk-settings', JSON.stringify({ couchMode: 'yes' }));
    expect(createSettings(st).get('couchMode')).toBe(false); // junk reads as off
  });

  it('?coop=1 turns it on and ?coop=0 turns it off for one page load, over the saved switch', () => {
    expect(coopMode('', false)).toBe(false);
    expect(coopMode('', true)).toBe(true);
    expect(coopMode('?coop=1', false)).toBe(true);
    expect(coopMode('?tv=1&coop=0', true)).toBe(false);
    expect(coopMode('?coop=10', false)).toBe(false);
    expect(coopWanted('?coop=1')).toBe(true); // the old reading is unchanged
  });

  it('the Settings row is a select with Off and On, wired to couchMode', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/ui/homebase.js', import.meta.url), 'utf8');
    expect(src).toContain('Two-player couch mode');
    expect(src).toContain("settings.set('couchMode', e.target.value === 'On')");
  });
});

describe('who may see couch play', () => {
  it('a laptop with the switch Off (enabled() false) has no couch, with a second pad there', () => {
    const r = rig({ profile: 'laptop', ctxExtra: { enabled: () => false } });
    set(r, pad(0, [PAD_BUTTONS.X]), pad(1)); r.tick(3);
    expect(r.h.state.couch).toBe(false);
    expect(find(r.doc, 'coop-join').hidden).toBe(true);
    set(r, pad(0), pad(1, [A])); r.tick(3);
    expect(r.h.state.joined).toBe(false);
  });

  it('a laptop with the switch On works with a pad and with two', () => {
    const r = rig({ profile: 'laptop', ctxExtra: { enabled: () => true } });
    set(r, pad(0)); r.tick(2);
    expect(r.h.state.couch).toBe(true);
    expect(find(r.doc, 'coop-join').hidden).toBe(false);
  });

  it('a tablet or phone stays solo with couch play off, and when the page does not say', () => {
    for (const profile of ['tablet', 'phone']) {
      const r = rig({ profile, ctxExtra: { enabled: () => false } });
      set(r, pad(0, [PAD_BUTTONS.X]), pad(1)); r.tick(3);
      expect(r.h.state.couch, profile).toBe(false);
    }
    const r = rig({ profile: 'tablet' }); // no seam answers at all: today's behaviour
    set(r, pad(0, [PAD_BUTTONS.X]), pad(1)); r.tick(3);
    expect(r.h.state.couch).toBe(false);
  });

  it('a tablet or phone with the switch On and ONE pad stays solo; with a second pad connected it is on', () => {
    for (const profile of ['tablet', 'phone']) {
      const r = rig({ profile, ctxExtra: { enabled: () => true } });
      set(r, pad(0)); r.tick(3);
      expect(r.h.state.couch, profile).toBe(false);
      set(r, pad(0), pad(1)); r.tick(3);
      expect(r.h.state.couch, profile).toBe(true);
      set(r, pad(0, [PAD_BUTTONS.X]), pad(1)); r.tick(2);
      set(r, pad(0), pad(1)); r.tick(2);
      set(r, pad(0), pad(1, [A])); r.tick(3);
      set(r, pad(0), pad(1)); r.tick(3);
      expect(r.h.state.joined, profile).toBe(true);
    }
  });

  it('the switch turned Off mid-walk takes the second cat out without breaking the walk', () => {
    let on = true;
    const r = rig({ profile: 'laptop', ctxExtra: { enabled: () => on } });
    set(r, pad(0, [PAD_BUTTONS.X]), pad(1)); r.tick(2);
    set(r, pad(0), pad(1)); r.tick(2);
    set(r, pad(0), pad(1, [A])); r.tick(2);
    set(r, pad(0), pad(1)); r.tick(2);
    expect(r.h.state.joined).toBe(true);
    on = false; r.tick(3);
    expect(r.h.state.joined).toBe(false);
    expect(r.two()).toBeUndefined();
    expect(r.player.engaged).toBe(true);
    void joined;
  });
});
