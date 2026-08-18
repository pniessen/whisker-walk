import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createTippables } from '../src/tippables.js';

const scene = { add() {}, remove() {} };
const SPOTS = [
  { x: 0, z: 0, kind: 'pot' },
  { x: 5, z: 0, kind: 'can' },
  { x: 0, z: 5, kind: 'bin' },
];

describe('createTippables', () => {
  it('builds one entry per spot, untipped', () => {
    const tp = createTippables(scene, SPOTS);
    expect(tp.list).toHaveLength(3);
    expect(tp.list.every((e) => !e.tipped)).toBe(true);
  });

  it('nearest finds only untipped entries in range', () => {
    const tp = createTippables(scene, SPOTS);
    const near = new THREE.Vector3(0.5, 0, 0);
    expect(tp.nearest(near, 1.5)).toBe(tp.list[0]);
    tp.tip(tp.list[0]);
    expect(tp.nearest(near, 1.5)).toBe(null);
  });

  it('tip returns true once then false, and topples over time', () => {
    const tp = createTippables(scene, SPOTS);
    const e = tp.list[0];
    expect(tp.tip(e)).toBe(true);
    expect(tp.tip(e)).toBe(false);
    for (let i = 0; i < 40; i++) tp.update(0.05);
    expect(Math.abs(e.group.rotation.z) + Math.abs(e.group.rotation.x)).toBeGreaterThan(1.2);
  });

  it('tipById finds an entry by id and tips it, same as tip()', () => {
    const tp = createTippables(scene, SPOTS);
    const target = tp.list[1];
    expect(tp.tipById(target.id)).toBe(true);
    expect(target.tipped).toBe(true);
  });

  it('tipById returns false for an already-tipped id or an unknown id', () => {
    const tp = createTippables(scene, SPOTS);
    const target = tp.list[2];
    expect(tp.tipById(target.id)).toBe(true);
    expect(tp.tipById(target.id)).toBe(false); // already tipped
    expect(tp.tipById('no-such-id')).toBe(false); // unknown id
  });
});

// v18 Task 2.5 — Big Swat: tipping cascades into neighbours.
//
// "Knock-over radius doubles" is read as the CASCADE radius and NOT the reach
// to the prop you swat (v18 final review). The old x2 on nearest() also moved
// the PROMPT, because game/interactions.js drives the prompt off this same
// call, so a Big Swat player got "E — paw it over" at 2.6m and could not
// greet a stray (2.5), take a quest (2.5), scratch (2.2), boop (1.5) or dig
// (1.2) while a prop was anywhere near. nearest() is therefore skill-blind
// now, and these tests pin that both ways round.
describe('createTippables — Big Swat', () => {
  // The reach interactions.js actually prompts at.
  const REACH = 1.3;
  // Two states that BOTH satisfy hasSkill(state, 'big-swat') by its two
  // different routes — the persisted list and the live feat predicate (tip
  // over 40 things). Testing both proves the gate is hasSkill and not some
  // private flag that only one writer knows how to set.
  const persisted = () => ({ skills: ['big-swat'] });
  const earned = () => ({ feats: { mischief: 40 } });
  const withSkill = (spots, state) => createTippables(scene, spots, { getState: () => state });

  // A row along x, so distances are exactly the gaps.
  const row = (...xs) => xs.map((x) => ({ x, z: 0, kind: 'bin' }));
  const at = (x) => new THREE.Vector3(x, 0, 0);

  describe('no skill — must play exactly as it does today', () => {
    // 2.0m is out of the 1.3m reach and inside the 2.6m cascade radius, so it
    // separates reach from cascade rather than passing under both.
    it('leaves the knock-over radius at the caller\'s own maxDist', () => {
      for (const tp of [
        createTippables(scene, row(2.0)),                        // no opts at all
        createTippables(scene, row(2.0), {}),                    // opts without getState
        createTippables(scene, row(2.0), { getState: 'nope' }),  // getState not callable
        withSkill(row(2.0), null),                               // no save at all
        withSkill(row(2.0), { skills: [], feats: { mischief: 39 } }), // one tip short
      ]) {
        expect(tp.nearest(at(0), REACH)).toBe(null);
      }
    });

    it('tips exactly one prop and leaves its neighbours standing', () => {
      const tp = withSkill(row(0, 1.0, 2.0), { feats: { mischief: 39 } });
      expect(tp.tip(tp.list[0])).toBe(true);
      expect(tp.list.map((e) => e.tipped)).toEqual([true, false, false]);
    });
  });

  describe('with the skill', () => {
    // v18 final review. The reach is the ability's shadowing surface: it is
    // the number game/interactions.js prompts on, and every prompt below the
    // tip branch loses to it. Asserted at 2.0m — the exact distance the old
    // x2 reach turned into a tip prompt and this one does not — by BOTH
    // unlock routes, so neither the persisted list nor the live feat
    // predicate can widen it.
    it('does NOT change the reach to the target, by either unlock route', () => {
      for (const state of [persisted(), earned()]) {
        const tp = withSkill(row(2.0), state);
        expect(tp.nearest(at(0), REACH)).toBe(null);
      }
    });

    it('matches the no-skill reach exactly, prop for prop', () => {
      // The strongest form of "the prompt is unchanged": same spots, same
      // query, and the answer must be the same entry index in both states.
      const spots = row(0.9, 2.0, 3.0);
      const plain = createTippables(scene, spots);
      const swat = withSkill(spots, persisted());
      for (const x of [0, 1.5, 2.5, 4.0]) {
        const a = plain.nearest(at(x), REACH);
        const b = swat.nearest(at(x), REACH);
        expect(b === null ? null : swat.list.indexOf(b))
          .toBe(a === null ? null : plain.list.indexOf(a));
      }
    });

    it('still ignores already-tipped props when finding the nearest', () => {
      const tp = withSkill(row(1.0), persisted());
      tp.tip(tp.list[0]);
      expect(tp.nearest(at(0), REACH)).toBe(null);
    });

    it('cascades into neighbours in radius and spares the ones outside it', () => {
      // 2.0 apart is inside the 2.6 cascade radius; the prop at 30 is far
      // outside it and must not so much as wobble.
      const tp = withSkill(row(0, 2.0, 30), persisted());
      expect(tp.tip(tp.list[0])).toBe(true);
      expect(tp.list.map((e) => e.tipped)).toEqual([true, true, false]);
      expect(tp.list[1].anim).toBe(0.5); // cascaded props animate like swatted ones
    });

    it('bounds the chain at two hops, however long the row is', () => {
      // Six props, each 2.0 from the next: hop 1 takes #1, hop 2 takes #2,
      // and #3+ stay up even though #3 is in #2's radius.
      const tp = withSkill(row(0, 2.0, 4.0, 6.0, 8.0, 10.0), persisted());
      tp.tip(tp.list[0]);
      expect(tp.list.map((e) => e.tipped)).toEqual([true, true, true, false, false, false]);
    });

    it('terminates when two props sit inside each other\'s radius', () => {
      // The mutual-radius case: without the already-tipped guard these two
      // would knock each other over forever. Both fall, once, and tip()
      // returns.
      const tp = withSkill(row(0, 1.0), persisted());
      expect(tp.tip(tp.list[0])).toBe(true);
      expect(tp.list.every((e) => e.tipped)).toBe(true);
      expect(tp.list.every((e) => e.anim === 0.5)).toBe(true); // nothing re-tipped
    });

    it('never re-tips a prop the cascade already took down', () => {
      const tp = withSkill(row(0, 2.0), persisted());
      tp.tip(tp.list[0]);
      expect(tp.tip(tp.list[1])).toBe(false); // no second mischief award
      expect(tp.tip(tp.list[0])).toBe(false);
    });

    it('survives a dense cluster where every prop reaches every other', () => {
      const dense = Array.from({ length: 24 }, (_, i) => ({ x: i * 0.1, z: 0, kind: 'pot' }));
      const tp = withSkill(dense, persisted());
      expect(tp.tip(tp.list[0])).toBe(true);
      expect(tp.list.every((e) => e.tipped)).toBe(true);
    });

    it('does not cascade on a remote tip', () => {
      // tipById is the wire path: the event names one id, so only that prop
      // may fall locally (no protocol change — see the non-goals).
      const tp = withSkill(row(0, 2.0), persisted());
      expect(tp.tipById(tp.list[0].id)).toBe(true);
      expect(tp.list.map((e) => e.tipped)).toEqual([true, false]);
    });

    it('reads the state live, so unlocking mid-walk takes effect at once', () => {
      // Observed through the cascade, which is now the ability's only
      // effect — nearest() answers the same in both states by design.
      const state = { feats: { mischief: 39 } };
      const tp = createTippables(scene, row(0, 2.0, 4.0, 20, 22), { getState: () => state });
      expect(tp.tip(tp.list[0])).toBe(true);        // one tip short: no chain
      expect(tp.list.map((e) => e.tipped)).toEqual([true, false, false, false, false]);
      state.feats.mischief = 40;                    // the 40th tip lands
      expect(tp.tip(tp.list[3])).toBe(true);
      expect(tp.list.map((e) => e.tipped)).toEqual([true, false, false, true, true]);
    });
  });
});
