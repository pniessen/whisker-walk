// Pure math for game-controller menu navigation: direction pick, nearest
// lookup and key-repeat gating. No DOM access here; callers pass fake or
// real rects ({x, y, w, h}).

const OFF_AXIS_WEIGHT = 2;

function centre(rect) {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

// Candidate whose centre lies in the pushed half-plane from `from`'s centre,
// minimising distance + 2 x off-axis offset. Returns its id, or null at an
// edge (no wrap).
export function pickNext(from, candidates, dir) {
  const c = centre(from);
  let best = null;
  let bestScore = Infinity;
  for (const cand of candidates) {
    const p = centre(cand.rect);
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    let along;
    let off;
    if (dir === 'right') { along = dx; off = dy; }
    else if (dir === 'left') { along = -dx; off = dy; }
    else if (dir === 'down') { along = dy; off = dx; }
    else if (dir === 'up') { along = -dy; off = dx; }
    else return null;
    if (along <= 0) continue;
    const score = Math.hypot(dx, dy) + OFF_AXIS_WEIGHT * Math.abs(off);
    if (score < bestScore) {
      bestScore = score;
      best = cand.id;
    }
  }
  return best;
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
