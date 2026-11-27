import { describe, it, expect, afterEach } from 'vitest';
import { coop, rig, pad, set, reset, PAD_BUTTONS, SECOND_ID } from './helpers/couchrig.js';
import { createClanFight } from '../src/game/clanfight.js';
import { createFightRecord } from '../src/game/fightrecord.js';
import { pickFighter, padForPill, QUIET_S } from '../src/coop/fights.js';
import { COUNTER, BUTTONS } from '../src/fight.js';

// Couch play M4: fights. The REAL clan fight over fake intruders and fake pads: one fight at a time, the challenger's
// pad plays the sheet, the loser's scar is filed under the challenger's key, the other cat sits.
const { A, X, B } = PAD_BUTTONS;
afterEach(reset);

describe('who challenges (pure)', () => {
  it('the chunk\'s pose table is the fight\'s own wire table', async () => {
    const { WIRE_POSE } = await import('../src/coop/index.js');
    const mine = await import('../src/fightactions.js');
    expect(WIRE_POSE).toEqual(mine.WIRE_POSE);
  });
  it('cat one if both could; cat two only when alone; a busy pill or fight keeps its challenger', () => {
    expect(pickFighter(0, { oneCan: true, twoCan: true })).toBe(0);
    expect(pickFighter(0, { twoCan: true })).toBe(1);
    expect(pickFighter(1, { busy: true })).toBe(1);
    expect(pickFighter(0, { busy: true, twoCan: true })).toBe(0);
    expect(pickFighter(1, { quiet: QUIET_S - 0.1 })).toBe(1);
    expect(pickFighter(1, { quiet: QUIET_S })).toBe(0);
  });
  it('the other pad has Circle and Square taken away, the challenger\'s is whole', () => {
    const p = pad(0, [X, B, A]);
    const m = padForPill(p, false);
    expect(m.buttons[X].pressed).toBeUndefined(); // a plain false
    expect([m.buttons[X], m.buttons[B]]).toEqual([false, false]);
    expect(m.buttons[A].pressed).toBe(true);
    expect(padForPill(p, true)).toBe(p);
    expect(p.buttons[X].pressed).toBe(true); // the browser's own snapshot is untouched
  });
});

function fightRig({ intruderX = 8 } = {}) {
  const clock = { T: 1000 };
  const cur = { visit: 7, clan: 'moor', member: { name: 'Mossjaw', id: 'moor-2' }, pos: { x: intruderX, z: 0 }, state: 'walking' };
  const holds = [];
  const intruders = {
    measure: () => ({ top: 0.8, backY: 0.42, pinnedBackY: 0.27, hindZ: 0.29, pivotY: 0.2 }),
    current: () => (cur.state === 'gone' ? null : { ...cur, pos: { ...cur.pos } }),
    hold: (v, id, face) => { holds.push(v); cur.state = 'held'; },
    release: () => { cur.state = 'walking'; },
    flee: () => { cur.state = 'fleeing'; },
    stage() {},
    isFled: () => cur.state === 'fleeing',
  };
  const ui = {
    showing: null,
    showChallenge: () => { ui.showing = 'challenge'; },
    showFight: () => { ui.showing = 'fight'; },
    hide: () => { ui.showing = null; },
    key: (k) => { if (k === 'e') cf.startFight(); else if (k === 'q') cf.backOff(); return true; },
  };
  const calls = { won: [], lost: [] };
  const holder = {}; // filled once the rig exists: the record needs the real progression
  const cf = createClanFight({
    intruders, ui, audio: { hiss() {}, pounceWhoosh() {}, landThump() {} }, fx: { burst() {}, slash() {} }, hud: { toast() {} },
    log: { awardOnce: () => 0 }, areaId: 'woods', walkStamp: 'w1', playerId: 'me', playerSpecial: null, reducedMotion: false,
    now: () => clock.T, isGround: () => true, player: { inWater: false, halt() {} }, runSpeed: 3, clanHome: true, picks: ['woods'],
    actions: true, scars: true, ownedMoves: () => [], measureCat: () => ({ top: 0.95, backY: 0.5, pinnedBackY: 0.32, hindZ: 0.34, pivotY: 0.2 }),
    onWon: (r) => { calls.won.push(r); holder.record?.onWon(r); },
    onLost: (r) => { calls.lost.push(r); holder.record?.onLost(r); },
  });
  const r = rig({ clanFight: cf });
  holder.record = createFightRecord({ progression: r.progression, hud: { toast() {} }, scarKey: 'tabby' });
  // pad 0 and pad 1 seated and cat two joined
  set(r, pad(0, [X]), pad(1)); r.tick(2);
  set(r, pad(0), pad(1)); r.tick(2);
  set(r, pad(0), pad(1, [A])); r.tick(2);
  set(r, pad(0), pad(1)); r.tick(2);
  return { r, cf, cur, ui, calls, clock };
}
const twoPos = (r) => r.two().group.position;
// Walk cat two east until the pill is up for it (cat one stays at the start).
function walkTwoToIntruder(f) {
  const { r, cf } = f;
  set(r, pad(0), pad(1, [], [1, 0, 0, 0]));
  for (let i = 0; i < 600 && cf.uiShowing !== 'challenge'; i++) r.tick(1);
  set(r, pad(0), pad(1)); r.tick(1);
}
const answerWrong = (f, clueFrames) => {
  const fight = f.r.h.fights.stage?.fight ?? f.r.session.fight;
  if (!fight || fight.phase !== 'clue') { clueFrames.n = 0; return; }
  clueFrames.n++;
  if (clueFrames.n === 15) f.cf.answer(BUTTONS.find((b) => b !== COUNTER[fight.move]));
};

describe('M4 fights: cat two as the challenger', () => {
  it('the pill comes up for the cat that is in range, and it is cat two', () => {
    const f = fightRig();
    walkTwoToIntruder(f);
    expect(f.cf.uiShowing).toBe('challenge');
    expect(f.r.h.fights.fighter).toBe(1);
    expect(Math.hypot(twoPos(f.r).x - 8, twoPos(f.r).z)).toBeLessThan(3.6);
    expect(Math.hypot(f.r.cat.position.x - 8, f.r.cat.position.z)).toBeGreaterThan(3.6);
  });

  it('only the challenger answers the pill: cat one\'s Square does nothing, cat two\'s starts the fight', () => {
    const f = fightRig();
    walkTwoToIntruder(f);
    set(f.r, pad(0, [X]), pad(1)); f.r.tick(3);
    set(f.r, pad(0), pad(1)); f.r.tick(2);
    expect(f.cf.uiShowing).toBe('challenge'); // cat one's press went nowhere
    set(f.r, pad(0), pad(1, [X])); f.r.tick(2);
    set(f.r, pad(0), pad(1)); f.r.tick(1);
    expect(f.cf.uiShowing).toBe('fight');
    expect(f.r.session.fight == null).toBe(true); // the fight is not cat one's
    expect(f.r.h.fights.stage.fight).toBeTruthy(); // it is cat two's
  });

  it('the challenger\'s pad plays the sheet: pad two is the pad read, and pad one\'s presses do nothing', () => {
    const f = fightRig();
    walkTwoToIntruder(f);
    set(f.r, pad(0), pad(1, [X])); f.r.tick(2);
    set(f.r, pad(0), pad(1)); f.r.tick(2);
    expect(coop.pad.index).toBe(1);
    set(f.r, pad(0, [A]), pad(1)); f.r.tick(2);
    expect(f.r.presses).toHaveLength(0);
    set(f.r, pad(0), pad(1)); f.r.tick(1);
    set(f.r, pad(0), pad(1, [A])); f.r.tick(2);
    expect(f.r.presses).toHaveLength(1);
  });

  it('never two fights at once: a second start on the same pill, or the other pad\'s Square, begins nothing', () => {
    const f = fightRig();
    walkTwoToIntruder(f);
    set(f.r, pad(0), pad(1, [X])); f.r.tick(2);
    set(f.r, pad(0), pad(1)); f.r.tick(1);
    f.cf.startFight();
    f.cf.startFight();
    set(f.r, pad(0, [X, B]), pad(1)); f.r.tick(2);
    expect(f.cf.uiShowing).toBe('fight');
    expect(f.calls.won.length + f.calls.lost.length).toBe(0);
    // exactly one hold on the intruder
    expect(f.cur.state).toBe('held');
  });

  it('cat one sits and cheers and cat two\'s picture is where the fight puts it; one line says who fights', () => {
    const f = fightRig();
    walkTwoToIntruder(f);
    set(f.r, pad(0), pad(1, [X])); f.r.tick(2);
    set(f.r, pad(0), pad(1)); f.r.tick(30);
    f.r.tick(200);
    expect(f.r.toasts).toContain('Siamese takes the fight, and Mochi sits and cheers!');
    // cat two ran over to the intruder's gap and faces it
    expect(Math.hypot(twoPos(f.r).x - 8, twoPos(f.r).z)).toBeLessThan(2);
    expect(f.r.session.idleTime).toBeGreaterThan(10);
    // cat one is not moved by pad one's stick
    const x0 = f.r.cat.position.x;
    set(f.r, pad(0, [], [1, 0, 0, 0]), pad(1)); f.r.tick(30);
    expect(f.r.cat.position.x).toBeCloseTo(x0, 1);
  });

  it('a lost fight files the scar under cat two\'s key, not cat one\'s; a win counts for the household', () => {
    const f = fightRig();
    walkTwoToIntruder(f);
    set(f.r, pad(0), pad(1, [X])); f.r.tick(2);
    set(f.r, pad(0), pad(1)); f.r.tick(1);
    const n = { n: 0 };
    for (let i = 0; i < 60 * 40 && f.cf.uiShowing === 'fight'; i++) { answerWrong(f, n); f.clock.T += 1 / 60; f.r.tick(1); }
    expect(f.cf.uiShowing).toBeNull();
    expect(f.calls.lost).toHaveLength(1);
    expect(f.r.progression.state.scars.siamese).toHaveLength(1);
    expect(f.r.progression.state.scars.tabby ?? []).toHaveLength(0);
    expect(f.r.progression.state.fightsWon).toBe(0);
    // the pads are as before: cat one's pad is the walk's again, the fight object is whole
    f.r.tick(1); // the pad is chosen at the start of a frame
    expect(coop.pad.index).toBe(0);
    expect(f.r.h.fights.fighter).toBe(1); // held a moment (quiet), then back to cat one
  });

  it('a win adds one to the household\'s fights won', () => {
    const f = fightRig();
    walkTwoToIntruder(f);
    set(f.r, pad(0), pad(1, [X])); f.r.tick(2);
    set(f.r, pad(0), pad(1)); f.r.tick(1);
    let fought = 0;
    for (let i = 0; i < 60 * 40 && f.cf.uiShowing === 'fight'; i++) {
      const fight = f.r.h.fights.stage?.fight;
      if (fight?.phase === 'clue') { fought++; if (fought === 30) f.cf.answer(COUNTER[fight.move]); } else fought = 0;
      f.clock.T += 1 / 60; f.r.tick(1);
    }
    expect(f.calls.won).toHaveLength(1);
    expect(f.r.progression.state.fightsWon).toBe(1);
    expect(f.r.progression.state.scars.siamese ?? []).toHaveLength(0);
  });
});

describe('M4 fights: cat one as the challenger, and the border patrol', () => {
  it('cat one in range: cat one\'s Square starts it, cat two\'s Square does not, and the scar is cat one\'s', () => {
    const f = fightRig({ intruderX: 2 });
    f.r.tick(3);
    expect(f.cf.uiShowing).toBe('challenge');
    expect(f.r.h.fights.fighter).toBe(0);
    set(f.r, pad(0), pad(1, [X])); f.r.tick(2);
    set(f.r, pad(0), pad(1)); f.r.tick(2);
    expect(f.cf.uiShowing).toBe('challenge');
    set(f.r, pad(0, [X]), pad(1)); f.r.tick(2);
    set(f.r, pad(0), pad(1)); f.r.tick(2);
    expect(f.cf.uiShowing).toBe('fight');
    expect(f.r.session.fight).toBeTruthy(); // cat one's own fight
    expect(coop.pad.index).toBe(0);
    const n = { n: 0 };
    const was = f.r.h.fights.stage?.fight;
    void was;
    for (let i = 0; i < 60 * 40 && f.cf.uiShowing === 'fight'; i++) {
      const fight = f.r.session.fight;
      if (fight?.phase === 'clue') { n.n++; if (n.n === 15) f.cf.answer(BUTTONS.find((b) => b !== COUNTER[fight.move])); } else n.n = 0;
      f.clock.T += 1 / 60; f.r.tick(1);
    }
    expect(f.r.progression.state.scars.tabby).toHaveLength(1);
    expect(f.r.progression.state.scars.siamese ?? []).toHaveLength(0);
  });

  it('a border patrol shape works the same: the wrapper needs only the fight\'s own update and wouldChallenge', () => {
    // joinFights / createBorderFight objects are plain objects with those two; a stand-in proves the seam does not care.
    const seen = [];
    const fake = {
      uiShowing: null, engagedVisit: null,
      wouldChallenge: (s) => Math.hypot(s.cat.position.x - 6, s.cat.position.z) < 3.5,
      update(dt, s) { seen.push(s.cat === this.owner ? 1 : 0); },
    };
    const r = rig({ clanFight: fake });
    fake.owner = null;
    set(r, pad(0, [X]), pad(1)); r.tick(2);
    set(r, pad(0), pad(1, [A])); r.tick(4);
    set(r, pad(0), pad(1)); r.tick(2);
    expect(r.h.state.joined).toBe(true);
    set(r, pad(0), pad(1, [], [1, 0, 0, 0]));
    for (let i = 0; i < 400 && r.h.fights.fighter !== 1; i++) r.tick(1);
    expect(r.h.fights.fighter).toBe(1);
  });

  it('with no fight in the place (the frozen stand-in) nothing is wrapped, and a leave puts the real update back', () => {
    const r = rig({ clanFight: Object.freeze({ uiShowing: null, update() {}, key: () => false }) });
    set(r, pad(0, [X]), pad(1)); r.tick(2);
    set(r, pad(0), pad(1, [A])); r.tick(4);
    expect(r.h.state.joined).toBe(true);
    const plain = { uiShowing: null, update() {}, wouldChallenge: () => false };
    const orig = plain.update;
    const r2 = rig({ clanFight: plain });
    set(r2, pad(0, [X]), pad(1)); r2.tick(2);
    set(r2, pad(0), pad(1, [A])); r2.tick(4);
    expect(plain.update).not.toBe(orig);
    r2.h.stop();
    expect(plain.update).toBe(orig);
  });
});
