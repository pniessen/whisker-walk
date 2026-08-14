// Pure co-walk verb helpers (Task 6.2). Both live entirely off the wire —
// main.js feeds them events/deltas and applies the returned state; they
// never touch session, network, or the DOM, so they're trivially testable
// and safe to run identically on every client.

// tagState — a pounce-tag chain tracker, structurally like the noteBat
// rally counter: a single in-flight slot `{ withId, taggedAt, awaiting }`,
// not a per-partner map (mirrors pendingBoop's "one relationship at a
// time" shape).
//
// Feed it EVERY pounce-tag touch for a pair — whether it's our own
// outgoing tag (landing near a remote) or a remote's incoming tag aimed at
// us — through the same `{ type: 'pounce-tag', fromId }` shape, where
// fromId is simply "the other player in this touch". That symmetry is
// what lets either side initiate: the first touch with a partner always
// opens a fresh `awaiting` window (whether it was our pounce or theirs);
// a second touch with the SAME partner, within 30s, while still awaiting,
// completes the chain. A stale (>30s) or different-partner touch reopens
// a fresh window instead of completing.
export function tagState(prev, ev, now) {
  if (!ev || ev.type !== 'pounce-tag' || !ev.fromId) return prev ?? null;
  const partnerId = ev.fromId;
  if (prev && prev.withId === partnerId && prev.awaiting && now - prev.taggedAt <= 30) {
    return { withId: partnerId, taggedAt: now, awaiting: false, completed: true };
  }
  return { withId: partnerId, taggedAt: now, awaiting: true, completed: false };
}

// groomTimer — continuous-hold timer for mutual grooming. Accumulates dt
// only while BOTH bothGrooming and close hold; breaking either condition
// resets to zero immediately (no partial credit carried across a break).
// done flips true once the running total reaches 2s.
export function groomTimer(prev, dt, { bothGrooming, close }) {
  const time = prev?.time ?? 0;
  if (bothGrooming && close) {
    const next = time + dt;
    return { time: next, done: next >= 2 };
  }
  return { time: 0, done: false };
}
