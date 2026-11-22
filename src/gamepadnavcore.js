// Pure math for game-controller menu navigation: direction pick, nearest
// lookup and key-repeat gating. No DOM access here; callers pass fake or
// real rects ({x, y, w, h}).

const OFF_AXIS_WEIGHT = 2;

function centre(rect) {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

// The empty space between two intervals [a, a+la] and [b, b+lb]; 0 if they overlap.
const gap = (a, la, b, lb) => Math.max(0, Math.max(a, b) - Math.min(a + la, b + lb));

// Picks the next control in a pushed direction, for lists and free-form maps alike.
// Candidates lie in the pushed half-plane (centre to centre). Tier 1: those inside a
// 45 degree cone round the push direction, scored by centre distance x
// (1 + 8 sin^2 angle), so a place almost exactly in the pushed direction beats a nearer
// one well off to the side. Also tier 1, unpenalised: a wide row (or a narrow button
// above one: cross sizes differ 2x or more) whose cross-axis interval overlaps the
// source's, so a wide row under a narrow button still counts as straight below it.
// Tier 2, only when tier 1 is empty (nothing is ever unreachable): centre distance + 2 x
// the cross-axis interval gap. Ties go to the earlier candidate. Returns an id, or null
// at an edge (no wrap).
const CONE_SIN2 = 0.5; // sin^2 of 45 degrees
const ANGLE_WEIGHT = 8;

export function pickNext(from, candidates, dir) {
  const c = centre(from);
  let best = null;
  let bestScore = Infinity;
  let fallback = null;
  let fallbackScore = Infinity;
  for (const cand of candidates) {
    const p = centre(cand.rect);
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    let along;
    let cross;
    let off;
    let sizes;
    const r = cand.rect;
    const xGap = gap(from.x, from.w, r.x, r.w);
    const yGap = gap(from.y, from.h, r.y, r.h);
    if (dir === 'right') { along = dx; cross = dy; off = yGap; sizes = [from.h, r.h]; }
    else if (dir === 'left') { along = -dx; cross = dy; off = yGap; sizes = [from.h, r.h]; }
    else if (dir === 'down') { along = dy; cross = dx; off = xGap; sizes = [from.w, r.w]; }
    else if (dir === 'up') { along = -dy; cross = dx; off = xGap; sizes = [from.w, r.w]; }
    else return null;
    if (along <= 0) continue;
    const dist = Math.hypot(dx, dy);
    const sin2 = (cross * cross) / (dist * dist);
    const wide = off === 0 && Math.max(...sizes) >= 2 * Math.min(...sizes);
    if (sin2 <= CONE_SIN2 || wide) {
      const score = wide ? dist : dist * (1 + ANGLE_WEIGHT * sin2);
      if (score < bestScore) { bestScore = score; best = cand.id; }
    } else {
      const score = dist + OFF_AXIS_WEIGHT * off;
      if (score < fallbackScore) { fallbackScore = score; fallback = cand.id; }
    }
  }
  return best ?? fallback;
}

// Candidate whose centre is closest to a point, or null if none.
export function nearestTo(point, candidates) {
  let best = null;
  let bestD = Infinity;
  for (const cand of candidates) {
    const p = centre(cand.rect);
    const d = Math.hypot(p.x - point.x, p.y - point.y);
    if (d < bestD) {
      bestD = d;
      best = cand.id;
    }
  }
  return best;
}

// Key-repeat: fire at once on press, again after `first` ms, then every
// `every` ms while held; release resets. State is opaque; pass undefined first.
export function repeatGate(state, now, held, { first = 400, every = 140 } = {}) {
  if (!held) return { fire: false, state: { held: false, next: 0 } };
  if (!state || !state.held) return { fire: true, state: { held: true, next: now + first } };
  if (now >= state.next) return { fire: true, state: { held: true, next: now + every } };
  return { fire: false, state };
}
