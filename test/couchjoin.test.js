import { describe, it, expect, afterEach } from 'vitest';
import { rig, pad, set, find, reset, PAD_BUTTONS, DT } from './helpers/couchrig.js';

afterEach(reset);
const A = PAD_BUTTONS.A, X = PAD_BUTTONS.X, SELECT = 8;

// A Ready card: the player is not engaged, the card is up, and a fake page element holds the card's body.
function readyRig(extra = {}) {
  const kind = { v: 'ready' };
  const host = { children: [], appendChild(c) { this.children.push(c); c.parent = this; return c; } };
  const r = rig({ profile: 'laptop', ctxExtra: { menuKind: () => kind.v, readyHost: () => host, ...extra } });
  r.player.setTouchEngaged(false);
  r.kind = kind; r.host = host;
  r.line = () => host.children.find((c) => c.className === 'coop-ready');
  return r;
}
const seatBoth = (r) => {
  set(r, pad(0, [X]), pad(1)); r.tick(2);
  set(r, pad(0), pad(1)); r.tick(2);
  set(r, pad(0), pad(1, [A])); r.tick(3);
  set(r, pad(0), pad(1)); r.tick(3);
};

describe('joining before the walk starts', () => {
  it('the Ready card says so, in the words, with a pad connected, and the pill shows too', () => {
    const r = readyRig();
    set(r, pad(0)); r.tick(2);
    expect(r.line()).toBeTruthy();
    expect(r.line().attrs['aria-label']).toBe('Two players? Press ✕ on the second controller to join.');
    expect(find(r.doc, 'coop-join').hidden).toBe(false);
  });

  it('no line without a pad, and none when couch play is off', () => {
    const r = readyRig();
    r.tick(2);
    expect(r.line()).toBeUndefined();
    const off = readyRig({ enabled: () => false });
    set(off, pad(0)); off.tick(2);
    expect(off.line()).toBeUndefined();
    expect(find(off.doc, 'coop-join').hidden).toBe(true);
  });

  it('the second pad joins at the Ready card, the line then names both cats, and the walk still starts from the card', () => {
    const r = readyRig();
    seatBoth(r);
    expect(r.h.state.joined).toBe(true);
    expect(r.line().attrs['aria-label']).toBe('Mochi and Siamese are both in.');
    expect(find(r.doc, 'coop-join').hidden).toBe(true);
    r.player.setTouchEngaged(true); r.kind.v = 'walk'; r.tick(3);
    expect(r.h.state.joined).toBe(true);
    expect(r.line()).toBeUndefined();
  });

  it('the old way still works: a second pad joins mid-walk', () => {
    const r = rig({ profile: 'laptop', ctxExtra: { enabled: () => true } });
    seatBoth(r);
    expect(r.h.state.joined).toBe(true);
  });
});

describe('leaving and rejoining', () => {
  const live = () => { const r = rig({ profile: 'laptop', ctxExtra: { enabled: () => true } }); seatBoth(r); return r; };

  it('holding Select on pad two for a moment frees cat two, with a goodbye line, and the walk goes on', () => {
    const r = live();
    expect(r.h.state.joined).toBe(true);
    set(r, pad(0), pad(1, [SELECT])); r.tick(20);
    expect(r.h.state.joined).toBe(true); // a tap or a short hold is not enough
    r.tick(40);
    expect(r.h.state.joined).toBe(false);
    expect(r.two()).toBeUndefined();
    r.tick(240);
    expect(r.toasts.at(-1)).toBe('Siamese waves goodbye.');
    expect(r.player.engaged).toBe(true);
    expect(r.h.state.seats[1]).toBeNull();
    set(r, pad(0, [], [0, -1, 0, 0]), pad(1)); r.tick(30); // cat one still walks
    expect(r.cat.position.length()).toBeGreaterThan(0.5);
  });

  it('pad one\'s Select does nothing, and a quick tap on pad two does nothing', () => {
    const r = live();
    set(r, pad(0, [SELECT]), pad(1)); r.tick(90);
    expect(r.h.state.joined).toBe(true);
    set(r, pad(0), pad(1, [SELECT])); r.tick(10);
    set(r, pad(0), pad(1)); r.tick(90);
    expect(r.h.state.joined).toBe(true);
  });

  it('A on the same pad brings cat two back, and it can leave again', () => {
    const r = live();
    set(r, pad(0), pad(1, [SELECT])); r.tick(60);
    set(r, pad(0), pad(1)); r.tick(5);
    expect(r.h.state.joined).toBe(false);
    set(r, pad(0), pad(1, [A])); r.tick(3);
    set(r, pad(0), pad(1)); r.tick(3);
    expect(r.h.state.joined).toBe(true);
    expect(r.two()).toBeTruthy();
    set(r, pad(0), pad(1, [SELECT])); r.tick(60);
    expect(r.h.state.joined).toBe(false);
  });

  it('a place change after leaving does not bring cat two back by itself', () => {
    const r = live();
    set(r, pad(0), pad(1, [SELECT])); r.tick(60);
    set(r, pad(0), pad(1)); r.tick(5);
    expect(r.h.state.seats[1]).toBeNull();
    void DT;
  });
});
