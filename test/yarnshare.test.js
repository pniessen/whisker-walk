import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createToy } from '../src/toy.js';
import { createMouth, pick } from '../src/carry.js';
import { shareYarn, toyForState, letGoOfYarn, TOY_FRESH_S, HANDOFF_GRACE_S, ALONE_HOME_S } from '../src/game/yarnshare.js';

// One yarn ball between co-walkers (controls review, 2026-11-19), on the
// rally's own protocol: nothing new on the wire.
const scene = { add() {}, remove() {} };
const SPOT = { x: 4, z: 2 };
function walker(playerId) {
  const toy = createToy(scene);
  toy.spot = { ...SPOT };
  toy.placeAt(SPOT);
  return { playerId, toy, remoteToy: null, carry: { mouth: createMouth() } };
}

describe('the state message', () => {
  it('a ball still lying where it was found is nobody\'s and is not sent; a touched one is, in the mouth too', () => {
    const s = walker('b');
    expect(toyForState(s.toy)).toBeNull();
    s.toy.bat(new THREE.Vector3(3, 0, 2));
    expect(toyForState(s.toy)).toEqual([s.toy.mesh.position.x, s.toy.mesh.position.z]);
    s.toy.hold();
    s.toy.mesh.position.set(7, 0.3, 8);
    expect(toyForState(s.toy)).toEqual([7, 8]);
    s.toy.retrieve();
    expect(toyForState(s.toy)).toBeNull();
  });
});

describe('shareYarn', () => {
  it('a walk together starts with a ball on both screens and no ghost', () => {
    const s = walker('b');
    expect(shareYarn(s, 10, 1 / 60)).toBe(false);
    expect(s.toy.active).toBe(true);
  });

  it('when she touches it first, my resting copy goes and her ball shows as the ghost', () => {
    const s = walker('b');
    s.remoteToy = { ownerId: 'a', pos: [4.5, 2], at: 10 };
    expect(shareYarn(s, 10.2, 1 / 60)).toBe(true);
    expect(s.toy.active).toBe(false);
  });

  it('both touched it in the same moment: the lower id keeps it, the other lets go silently (even from its mouth)', () => {
    const lower = walker('a');
    const higher = walker('b');
    lower.toy.bat(new THREE.Vector3(3, 0, 2));
    pick(higher.carry.mouth, { id: 'yarn', kind: 'yarn', toy: true });
    higher.toy.hold();
    lower.remoteToy = { ownerId: 'b', pos: toyForState(higher.toy), at: 10 };
    higher.remoteToy = { ownerId: 'a', pos: toyForState(lower.toy), at: 10 };
    expect(shareYarn(lower, 10.1, 1 / 60)).toBe(false); // keeps it: no ghost
    expect(lower.toy.active && lower.toy.claimed).toBe(true);
    expect(shareYarn(higher, 10.1, 1 / 60)).toBe(true); // lets go, shows the ghost
    expect(higher.toy.active).toBe(false);
    expect(higher.carry.mouth.held).toBeNull();
  });

  it('just after a rally handoff, her old report cannot take it back', () => {
    const s = walker('b');
    s.toy.setPosition(new THREE.Vector3(5, 0.13, 5)); // handed to me
    s.yarnGrace = 10 + HANDOFF_GRACE_S;
    s.remoteToy = { ownerId: 'a', pos: [5, 5], at: 10 };
    shareYarn(s, 10.1, 1 / 60);
    expect(s.toy.active).toBe(true);
    shareYarn(s, 10 + HANDOFF_GRACE_S + 0.1, 1 / 60); // her report still fresh, grace over: a tie
    expect(s.toy.active).toBe(false);
  });

  it('when the owner goes quiet, the ball comes back where she last had it, nobody\'s', () => {
    const s = walker('b');
    s.toy.retrieve();
    s.remoteToy = { ownerId: 'a', pos: [9, -3], at: 10 };
    expect(shareYarn(s, 10 + TOY_FRESH_S + 0.01, 1 / 60)).toBe(false);
    expect(s.remoteToy).toBeNull();
    expect(s.toy.active).toBe(true);
    expect(s.toy.claimed).toBe(false);
    expect([s.toy.mesh.position.x, s.toy.mesh.position.z]).toEqual([9, -3]);
  });

  it('with no ball anywhere for a few seconds, it comes back to its spot', () => {
    const s = walker('b');
    s.toy.retrieve();
    for (let t = 0; t < ALONE_HOME_S - 0.5; t += 0.5) shareYarn(s, 20 + t, 0.5);
    expect(s.toy.active).toBe(false);
    shareYarn(s, 30, 0.5);
    shareYarn(s, 30.5, 0.5);
    expect(s.toy.active).toBe(true);
    expect([s.toy.mesh.position.x, s.toy.mesh.position.z]).toEqual([SPOT.x, SPOT.z]);
  });

  it('letGoOfYarn empties the mouth only of the ball', () => {
    const s = walker('b');
    pick(s.carry.mouth, { id: 'park-stick-1', kind: 'stick' });
    letGoOfYarn(s);
    expect(s.carry.mouth.held).toEqual({ id: 'park-stick-1', kind: 'stick' });
    expect(s.toy.active).toBe(false);
  });
});
