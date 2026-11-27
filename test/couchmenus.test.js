import { describe, it, expect, afterEach } from 'vitest';
import { rig, pad, set, find, reset, PAD_BUTTONS } from './helpers/couchrig.js';

afterEach(reset);
const A = PAD_BUTTONS.A, X = PAD_BUTTONS.X, Y = PAD_BUTTONS.Y, START = PAD_BUTTONS.START;

function menuRig(kindNow = 'ready') {
  const kind = { v: 'walk' };
  const host = { children: [], appendChild(c) { this.children.push(c); c.parent = this; return c; } };
  const r = rig({ profile: 'laptop', ctxExtra: { enabled: () => true, menuKind: () => kind.v, readyHost: () => host } });
  // both pads in, in the walk
  set(r, pad(0, [X]), pad(1)); r.tick(2);
  set(r, pad(0), pad(1)); r.tick(2);
  set(r, pad(0), pad(1, [A])); r.tick(3);
  set(r, pad(0), pad(1)); r.tick(3);
  expect(r.h.state.joined).toBe(true);
  r.kind = kind; r.host = host;
  r.pause = (k) => { r.player.setTouchEngaged(false); kind.v = k; r.tick(3); };
  r.tap = (i, b) => { const p = [pad(0), pad(1)]; p[i] = pad(i, [b]); set(r, ...p); r.tick(2); set(r, pad(0), pad(1)); r.tick(2); };
  if (kindNow !== 'walk') r.pause(kindNow);
  return r;
}

describe('which pad answers which menu', () => {
  it.each(['ready', 'pause', 'map'])('the %s screen answers to either pad', (k) => {
    const r = menuRig(k);
    r.presses.length = 0;
    r.tap(0, A); expect(r.presses.length).toBe(1);
    r.tap(1, A); expect(r.presses.length).toBe(2);
    expect(r.h.state.owner).toBe(1);
    r.tap(0, A); expect(r.presses.length).toBe(3);
    expect(r.h.state.owner).toBe(0);
  });

  it.each(['other', 'buy'])('the %s screen (home, dressing room, shops, a place with a price) stays pad one\'s', (k) => {
    const r = menuRig(k);
    r.presses.length = 0;
    r.tap(1, A); expect(r.presses.length).toBe(0);
    r.tap(0, A); expect(r.presses.length).toBe(1);
    expect(r.h.state.owner).toBe(0);
  });

  it('a card handed to pad two on the map goes back to pad one when a priced card opens', () => {
    const r = menuRig('map');
    r.tap(1, A);
    expect(r.h.state.owner).toBe(1);
    r.kind.v = 'buy'; r.tick(2);
    expect(r.h.state.owner).toBe(0);
    r.presses.length = 0;
    r.tap(1, A); expect(r.presses.length).toBe(0);
  });

  it('either pad\'s Start resumes the pause card', () => {
    const r = menuRig('pause');
    r.tap(1, START);
    expect(r.resumed.n).toBe(1);
    expect(r.player.engaged).toBe(true);
    r.pause('pause');
    r.tap(0, START);
    expect(r.resumed.n).toBe(2);
  });

  it('pad two\'s Start on a screen that is not safe does nothing', () => {
    const r = menuRig('other');
    r.tap(1, START);
    expect(r.resumed.n).toBe(0);
  });
});

describe('who is cat one: Y on pad two at the Ready card swaps the seats', () => {
  it('swaps the pads, keeps both cats, and does not press the card', () => {
    const r = menuRig('ready');
    expect(r.h.state.seats.map((s) => s.index)).toEqual([0, 1]);
    r.presses.length = 0;
    r.tap(1, Y);
    expect(r.h.state.seats.map((s) => s.index)).toEqual([1, 0]);
    expect(r.h.state.joined).toBe(true);
    expect(r.presses.length).toBe(0);
    expect(r.acts).not.toContain('camera');
    r.tap(0, Y); // pad 0 is the second pad now: its Y swaps back
    expect(r.h.state.seats.map((s) => s.index)).toEqual([0, 1]);
  });

  it('after a swap the other pad walks cat one', () => {
    const r = menuRig('ready');
    r.tap(1, Y);
    r.player.setTouchEngaged(true); r.kind.v = 'walk'; r.tick(2);
    const c1 = r.cat.position.clone(), c2 = r.two().group.position.clone();
    set(r, pad(0), pad(1, [], [0, -1, 0, 0])); r.tick(60);
    expect(r.cat.position.distanceTo(c1)).toBeGreaterThan(2);
    expect(r.two().group.position.distanceTo(c2)).toBeLessThan(0.01);
  });

  it('pad one\'s Y, and Y anywhere but the Ready card, swap nothing', () => {
    const r = menuRig('ready');
    r.tap(0, Y);
    expect(r.h.state.seats.map((s) => s.index)).toEqual([0, 1]);
    r.kind.v = 'pause'; r.tick(2);
    r.tap(1, Y);
    expect(r.h.state.seats.map((s) => s.index)).toEqual([0, 1]);
  });
});

describe('the per-cat prompt chip and the Pause card', () => {
  it('a prompt up in the walk is taken down when the walk pauses, and the walk\'s own come back after', () => {
    const r = menuRig('walk');
    r.h.prompt(0, '⟦interact⟧ pick up a toy');
    r.tick(3);
    const slot = find(r.doc, 'coop-slot left');
    expect(slot.hidden).toBe(false);
    r.pause('pause');
    expect(find(r.doc, 'coop-slot left').hidden).toBe(true);
    expect(find(r.doc, 'coop-slot right').hidden).toBe(true);
    r.player.setTouchEngaged(true); r.kind.v = 'walk'; r.tick(3);
    expect(find(r.doc, 'coop-slot left').hidden).toBe(false);
  });
});

describe('the standing hint strip', () => {
  const strip = (r) => find(r.doc, 'coop-hints');
  it('shows each player\'s own buttons in the walk once two cats are in, and hides on the Pause card', () => {
    const r = menuRig('walk');
    const el = strip(r);
    expect(el.hidden).toBe(false);
    const t = el.attrs['aria-label'];
    expect(t).toContain('Mochi: L walk · ✕ pounce · □ pick up · ☰ pause');
    expect(t).toContain('Siamese:');
    expect(t).toContain('hold ▭ step out');
    expect(el.children[0].innerHTML).toContain('<svg');
    r.pause('pause');
    expect(strip(r).hidden).toBe(true);
  });

  it('is not there with one cat, and not there when couch play is off', () => {
    const solo = rig({ profile: 'laptop', ctxExtra: { enabled: () => true } });
    set(solo, pad(0, [X])); solo.tick(3);
    expect(strip(solo).hidden).toBe(true);
    let on = true;
    const r = rig({ profile: 'laptop', ctxExtra: { enabled: () => on } });
    set(r, pad(0, [X]), pad(1)); r.tick(2); set(r, pad(0), pad(1)); r.tick(2); set(r, pad(0), pad(1, [A])); r.tick(3);
    expect(strip(r).hidden).toBe(false);
    on = false; r.tick(3);
    expect(strip(r).hidden).toBe(true);
  });

  it('gives an Xbox pad its own letters', () => {
    const r = menuRig('walk');
    r.pads[1].id = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)';
    r.tick(3);
    expect(strip(r).attrs['aria-label']).toContain('Siamese: L walk · A pounce · X pick up · ☰ pause · hold ▭ step out');
  });
});
