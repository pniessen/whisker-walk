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
    r.setSession(newSession('moon')); r.tick(2);
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

// ---- grooming and pounce-tag between the two cats ----
const { createGroom, createTag, GROOM_S, GROOM_NEAR, TAG_REACH, TAG_WINDOW_S } = await import('../src/coop/verbs.js');
const { LINES } = await import('../src/coop/words.js');
const DPAD_LEFT = 14;

describe('M4 verbs (pure, fake clocks)', () => {
  it('a groom needs the cats close and calm; it finishes after GROOM_S; a step away or a stick breaks it', () => {
    const g = createGroom();
    expect(g.start(GROOM_NEAR + 0.1, true)).toBe(false);
    expect(g.start(1, false)).toBe(false);
    expect(g.start(1, true)).toBe(true);
    let done = false;
    for (let t = 0; t < GROOM_S - 0.2; t += 0.1) done = g.step(0.1, { apart: 1, moving: false }).done || done;
    expect(done).toBe(false);
    expect(g.step(0.5, { apart: 1 }).done).toBe(true);
    expect(g.active).toBe(false);
    g.start(1, true);
    g.step(1, { apart: 1 });
    expect(g.step(0.1, { apart: 1, moving: true })).toEqual({ active: false, done: false });
    g.start(1, true);
    expect(g.step(0.1, { apart: 5 }).active).toBe(false);
  });

  it('tag: a landing beside the friend starts it, the friend pouncing back within the window finishes it, the same cat twice does not', () => {
    const t = createTag();
    expect(t.land(0, TAG_REACH + 0.1)).toBeNull();
    expect(t.land(0, 1)).toBe('start');
    expect(t.land(0, 1)).toBe('start'); // the same cat again is only a new start
    expect(t.land(1, 1)).toBe('done');
    expect(t.chain).toBeNull();
    t.land(1, 1);
    t.tick(TAG_WINDOW_S + 1);
    expect(t.chain).toBeNull();
    expect(t.land(0, 1)).toBe('start'); // too late to count as pouncing back
  });
});

const standStill = (r, n = 90) => { set(r, pad(0), pad(1)); r.tick(n); };
const slotLabels = (r) => r.doc.body.children.filter((c) => c.className.startsWith('coop-slot')).map((c) => (c.hidden ? '' : c.attrs['aria-label'] ?? ''));

describe('M4: grooming in the walk', () => {
  it('close and still, each cat is told how; D-pad Left on either pad starts it; both groom; it pays once and says so', () => {
    const r = joined();
    r.session.idleTime = 3; // the walk's own idle clock (avatar.js): cat one has stood a while
    standStill(r, 100);
    expect(r.h.state.apart).toBeLessThan(GROOM_NEAR);
    const [one, two] = slotLabels(r);
    expect(one).toMatch(/left to groom Siamese$/);
    expect(two).toMatch(/left to groom Mochi$/);
    const points = r.progression.state.points;
    set(r, pad(0), pad(1, [DPAD_LEFT])); r.tick(2);
    set(r, pad(0), pad(1)); r.tick(20);
    expect(r.two().pose).toBe('groom');
    expect(r.session.idleTime).toBeGreaterThan(6);
    expect(r.session.idleTime).toBeLessThan(10);
    expect(slotLabels(r)).toEqual(['', '']); // the hint is gone while they groom
    r.tick(Math.ceil(GROOM_S * 60));
    r.tick(300); // the one-line toast queue
    expect(r.toasts).toContain('Mochi and Siamese groom each other 🫧');
    const paid = r.progression.state.points;
    expect(paid).toBeGreaterThan(points);
    // again: it says so again, and pays nothing more this walk
    standStill(r, 100);
    set(r, pad(0, [DPAD_LEFT]), pad(1)); r.tick(2);
    set(r, pad(0), pad(1)); r.tick(Math.ceil(GROOM_S * 60) + 30);
    expect(r.progression.state.points).toBe(paid);
  });

  it('a stick pushed, or a friend too far, and there is no groom; a busy cat is not asked', () => {
    const r = joined();
    r.session.idleTime = 3;
    standStill(r, 100);
    set(r, pad(0), pad(1, [DPAD_LEFT])); r.tick(2);
    set(r, pad(0, [], [-1, 0, 0, 0]), pad(1)); r.tick(30); // cat one walks off: it breaks
    set(r, pad(0), pad(1)); r.tick(Math.ceil(GROOM_S * 60) + 60);
    expect(r.toasts.some((t) => /groom each other/.test(t))).toBe(false);
    // far apart: the key does nothing
    set(r, pad(0), pad(1, [], [1, 0, 0, 0])); r.tick(90);
    standStill(r, 100);
    expect(r.h.state.apart).toBeGreaterThan(GROOM_NEAR);
    set(r, pad(0), pad(1, [DPAD_LEFT])); r.tick(2);
    set(r, pad(0), pad(1)); r.tick(20);
    expect(r.two().pose).not.toBe('groom');
  });
});

describe('M4: pounce-tag in the walk', () => {
  it('a landing beside the friend tags it; the friend pouncing back finishes the game, once, with no injury', async () => {
    const { pounceArc } = await import('../src/player.js');
    const r = joined();
    set(r, pad(0), pad(1, [], [-1, 0, 0, 0])); r.tick(14); // cat two trots in beside cat one
    set(r, pad(0), pad(1)); r.tick(30);
    expect(r.h.state.apart).toBeLessThan(1.3);
    const points = r.progression.state.points;
    set(r, pad(0), pad(1, [A])); r.tick(3);
    set(r, pad(0), pad(1)); r.tick(60);
    r.tick(200);
    expect(r.toasts).toContain('Siamese tagged Mochi! Pounce back! 🐾');
    expect(r.progression.state.points).toBe(points); // a first tag pays nothing: the game needs both
    r.player.pounce(pounceArc(r.progression.state, { reducedMotion: false })); // cat one pounces back
    r.tick(80);
    r.tick(300);
    expect(r.toasts).toContain('Mochi and Siamese play tag! 🏃');
    expect(r.progression.state.points).toBeGreaterThan(points);
  });

  it('a landing far from the friend is only a hop', () => {
    const r = joined();
    set(r, pad(0), pad(1, [], [1, 0, 0, 0])); r.tick(60);
    set(r, pad(0), pad(1, [A])); r.tick(3);
    set(r, pad(0), pad(1)); r.tick(60);
    r.tick(200);
    expect(r.toasts.some((t) => /tagged/.test(t))).toBe(false);
  });
});

describe('M4: every new word is in both word sets', () => {
  it('the verb and fight lines are in the table, name both cats, and read in the everyday set too', async () => {
    const { phrase } = await import('../src/clanphrases.js');
    const { setSeriesMode, addWordSet, removeWordSet } = await import('../src/wordset.js');
    const off = await import('../src/offclanwords.js');
    for (const id of ['coop.groomhint', 'coop.groomed', 'coop.tagstart', 'coop.tagdone', 'coop.fightstart']) {
      expect(LINES[id], id).toBeTruthy();
      for (const mode of ['on', 'off']) {
        if (mode === 'off') addWordSet('off', off);
        setSeriesMode(mode);
        try { expect(phrase(id, 'Mochi', 'Siamese'), `${id} ${mode}`).toMatch(/Mochi/); } finally { setSeriesMode('on'); if (mode === 'off') removeWordSet('off'); }
      }
    }
  });
});
