import { describe, it, expect } from 'vitest';
import { tagState, groomTimer } from '../src/verbs.js';

describe('tagState', () => {
  it('opens an awaiting chain on the first pounce-tag with a partner', () => {
    const s1 = tagState(null, { type: 'pounce-tag', fromId: 'B' }, 0);
    expect(s1).toEqual({ withId: 'B', taggedAt: 0, awaiting: true, completed: false });
  });

  it('completes the chain on a second pounce-tag with the SAME partner within 30s', () => {
    const s1 = tagState(null, { type: 'pounce-tag', fromId: 'B' }, 0);
    const s2 = tagState(s1, { type: 'pounce-tag', fromId: 'B' }, 5);
    expect(s2.completed).toBe(true);
    expect(s2.withId).toBe('B');
    expect(s2.awaiting).toBe(false);
  });

  it('does NOT complete when the second pounce-tag is with a DIFFERENT partner', () => {
    const s1 = tagState(null, { type: 'pounce-tag', fromId: 'B' }, 0);
    const s2 = tagState(s1, { type: 'pounce-tag', fromId: 'C' }, 5);
    expect(s2.completed).toBe(false);
    expect(s2.withId).toBe('C'); // fresh chain with the new partner instead
    expect(s2.awaiting).toBe(true);
  });

  it('does NOT complete when the window has expired (> 30s)', () => {
    const s1 = tagState(null, { type: 'pounce-tag', fromId: 'B' }, 0);
    const s2 = tagState(s1, { type: 'pounce-tag', fromId: 'B' }, 30.1);
    expect(s2.completed).toBe(false);
    expect(s2.awaiting).toBe(true); // reopened as a fresh chain
  });

  it('completes exactly at the 30s boundary (inclusive)', () => {
    const s1 = tagState(null, { type: 'pounce-tag', fromId: 'B' }, 0);
    const s2 = tagState(s1, { type: 'pounce-tag', fromId: 'B' }, 30);
    expect(s2.completed).toBe(true);
  });

  it('a completed chain does not auto-complete again on a third tag — it reopens fresh', () => {
    const s1 = tagState(null, { type: 'pounce-tag', fromId: 'B' }, 0);
    const s2 = tagState(s1, { type: 'pounce-tag', fromId: 'B' }, 5);
    const s3 = tagState(s2, { type: 'pounce-tag', fromId: 'B' }, 6);
    expect(s3.completed).toBe(false);
    expect(s3.awaiting).toBe(true);
  });

  it('either side can initiate — the reducer only cares about (partner, awaiting, window), not direction', () => {
    // simulates B's own outgoing tag being fed through the same reducer as an incoming one
    const bChain = tagState(null, { type: 'pounce-tag', fromId: 'A' }, 1); // B received A's tag
    const bChain2 = tagState(bChain, { type: 'pounce-tag', fromId: 'A' }, 3); // B pounces back at A
    expect(bChain2.completed).toBe(true);
  });
});

describe('groomTimer', () => {
  it('accumulates time while both conditions hold, and is not done before 2s', () => {
    let state = null;
    state = groomTimer(state, 1, { bothGrooming: true, close: true });
    expect(state.time).toBe(1);
    expect(state.done).toBe(false);
    state = groomTimer(state, 0.9, { bothGrooming: true, close: true });
    expect(state.time).toBeCloseTo(1.9);
    expect(state.done).toBe(false);
  });

  it('is done once continuous hold reaches 2s', () => {
    let state = null;
    state = groomTimer(state, 1, { bothGrooming: true, close: true });
    state = groomTimer(state, 1, { bothGrooming: true, close: true });
    expect(state.time).toBeCloseTo(2);
    expect(state.done).toBe(true);
  });

  it('resets on a 1.9s hold followed by a break (not grooming)', () => {
    let state = null;
    state = groomTimer(state, 1.9, { bothGrooming: true, close: true });
    expect(state.done).toBe(false);
    state = groomTimer(state, 0.1, { bothGrooming: false, close: true });
    expect(state.time).toBe(0);
    expect(state.done).toBe(false);
    // continuing to hold afterward needs a fresh full 2s, not just the remaining 0.1s
    state = groomTimer(state, 0.15, { bothGrooming: true, close: true });
    expect(state.time).toBeCloseTo(0.15);
    expect(state.done).toBe(false);
  });

  it('resets when apart even if both are grooming', () => {
    let state = groomTimer(null, 1.9, { bothGrooming: true, close: true });
    state = groomTimer(state, 0.1, { bothGrooming: true, close: false });
    expect(state.time).toBe(0);
    expect(state.done).toBe(false);
  });
});
