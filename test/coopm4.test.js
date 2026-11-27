import { describe, it, expect, afterEach } from 'vitest';
import { coop, rig, joined, pad, set, find, reset, newSession, PAD_BUTTONS, THREE } from './helpers/couchrig.js';

// Couch play, milestone 4 (docs/superpowers/plans/2026-11-22-couch-coop.md): menus belong to one pad, a change of
// place brings both cats, fights have one challenger, and the two cats groom and play tag. Fake pads over the real
// player and gamepad glue; the real pads and the pictures are the owner's (M6).
const { A, START } = PAD_BUTTONS;
afterEach(reset);

describe('M4 owner-pad rule: a menu answers to the pad that opened it', () => {
  it('cat one\'s pad opened the pause card: pad two\'s A does nothing, pad one\'s A presses', () => {
    const r = joined();
    set(r, pad(0, [START]), pad(1)); r.tick(1);
    set(r, pad(0), pad(1)); r.tick(2);
    expect(r.player.engaged).toBe(false);
    expect(r.h.state.owner).toBe(0);
    set(r, pad(0), pad(1, [A])); r.tick(2);
    expect(r.presses).toHaveLength(0);
    set(r, pad(0), pad(1)); r.tick(1);
    set(r, pad(0, [A]), pad(1)); r.tick(2);
    expect(r.presses).toHaveLength(1);
  });

  it('pad two opened it: pad two confirms, pad one\'s A and Start do nothing', () => {
    const r = joined();
    set(r, pad(0), pad(1, [START])); r.tick(1);
    set(r, pad(0), pad(1)); r.tick(2);
    expect(r.h.state.owner).toBe(1);
    set(r, pad(0, [A]), pad(1)); r.tick(2);
    expect(r.presses).toHaveLength(0);
    set(r, pad(0, [START]), pad(1)); r.tick(2);
    expect(r.player.engaged).toBe(false);
    expect(r.resumed.n).toBe(0);
    set(r, pad(0), pad(1)); r.tick(1);
    set(r, pad(0), pad(1, [A])); r.tick(2);
    expect(r.presses).toHaveLength(1);
    set(r, pad(0), pad(1)); r.tick(1);
    set(r, pad(0), pad(1, [START])); r.tick(2);
    expect(r.player.engaged).toBe(true);
  });

  it('the owner is back to cat one\'s pad when the walk goes on', () => {
    const r = joined();
    set(r, pad(0), pad(1, [START])); r.tick(1);
    set(r, pad(0), pad(1)); r.tick(1);
    set(r, pad(0), pad(1, [START])); r.tick(2);
    expect(r.player.engaged).toBe(true);
    expect(r.h.state.owner).toBe(0);
  });
});

describe('M4: a change of place moves both cats', () => {
  it('a new walk in a ready place brings cat two in beside cat one, with the same pads and no new press', () => {
    const r = joined();
    const fresh = newSession('woods');
    fresh.cat.position.set(10, 0, -4);
    r.setSession(fresh);
    r.tick(2);
    expect(r.h.state.joined).toBe(true);
    const two = fresh.remotes.list[0];
    expect(two).toBeTruthy();
    expect(Math.hypot(two.group.position.x - 10, two.group.position.z + 4)).toBeLessThan(3.5);
    expect(r.h.state.seats[1]).toEqual({ index: 1, lost: false });
    // pad two still drives it
    const x0 = two.group.position.x;
    set(r, pad(0), pad(1, [], [1, 0, 0, 0])); r.tick(40);
    expect(Math.abs(fresh.remotes.list[0].group.position.x - x0)).toBeGreaterThan(1);
  });

  it('the new place\'s cat two stands on clear ground, never inside a wall', () => {
    const r = joined();
    const fresh = newSession('woods');
    fresh.cat.position.set(0, 0, 0);
    fresh.areaData.colliders = [{ x: 1.6, z: 0, r: 1.4 }]; // where it would stand to the right
    r.setSession(fresh);
    r.tick(2);
    const g = fresh.remotes.list[0].group.position;
    expect(Math.hypot(g.x - 1.6, g.z)).toBeGreaterThan(1.4);
    expect(Math.hypot(g.x, g.z)).toBeLessThan(3.5);
  });

  it('a place that is not ready leaves cat two waiting, and the next ready place brings it back', () => {
    const r = joined();
    r.setSession(newSession('fair')); r.tick(2);
    expect(r.h.state.joined).toBe(false);
    expect(r.h.state.seats[1]).toEqual({ index: 1, lost: false });
    const back = newSession('river');
    r.setSession(back); r.tick(2);
    expect(r.h.state.joined).toBe(true);
    expect(back.remotes.list).toHaveLength(1);
  });

  it('after "Play without it" nothing comes along, and a phone leaves nothing waiting', () => {
    const r = joined();
    set(r, pad(0)); r.tick(1);
    find(r.doc, 'coop-lost').children[0].children[2].children[1].click();
    r.player.setTouchEngaged(true);
    set(r, pad(0), pad(1)); r.tick(1);
    r.setSession(newSession('woods')); r.tick(2);
    expect(r.h.state.joined).toBe(false);
    const r2 = joined();
    r2.setProfile('phone'); r2.tick(2);
    r2.setProfile('tv');
    r2.setSession(newSession('woods')); r2.tick(2);
    expect(r2.h.state.joined).toBe(false);
  });
});

describe('M4: gates and gateways carry the partner', () => {
  it('the crossing card names the second cat as coming too, and not a lone cat', async () => {
    const { createCrossing } = await import('../src/game/crossing.js');
    const mk = (s) => {
      const overlay = { innerHTML: '', classList: { remove() {}, add() {} }, querySelector: () => null };
      let session = s;
      const c = createCrossing({ getSession: () => session, overlay, hud: { toast() {} }, releaseControl() {}, resumeWalk() {}, endWalk() {}, getIsTouch: () => false, getEdition: () => 'clan' });
      return { c, overlay };
    };
    const r = joined();
    const status = { kind: 'go', to: 'woods', name: 'the Woods', price: 0 };
    const withTwo = mk(r.session);
    withTwo.c.askGate(r.session, { end: { id: 'nb-woods', to: 'woods' }, status });
    expect(withTwo.overlay.innerHTML).toContain('Siamese comes too.');
    const alone = newSession('neighborhood');
    const solo = mk(alone);
    solo.c.askGate(alone, { end: { id: 'nb-woods', to: 'woods' }, status });
    expect(solo.overlay.innerHTML).not.toContain('comes too');
  });
});
