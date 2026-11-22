// The den panel's plan view (den shop UX): the twelve spots drawn on a 5x5
// schematic of the room, back wall (with the window) at the top and the open
// front at the bottom. Pure data, no DOM. Not true positions: those put some
// spots under 44 px apart on a phone. The order of x and z is kept, and
// planOrderOk() checks it against DEN_SPOTS so a new spot cannot be forgotten.
export const PLAN_COLS = 5;
export const PLAN_ROWS = 5;

export const PLAN_CELLS = Object.freeze({
  'corner-a': { col: 0, row: 0 }, nook: { col: 1, row: 0 }, window: { col: 2, row: 0 },
  alcove: { col: 3, row: 0 }, 'corner-b': { col: 4, row: 0 },
  'east-mid': { col: 3, row: 1 },
  'west-wall': { col: 0, row: 2 }, center: { col: 2, row: 2 }, shelf: { col: 4, row: 2 },
  'rug-spot': { col: 2, row: 3 },
  'corner-c': { col: 0, row: 4 }, 'corner-d': { col: 4, row: 4 },
});

export function cellFor(spotId) {
  return Object.prototype.hasOwnProperty.call(PLAN_CELLS, spotId) ? PLAN_CELLS[spotId] : null;
}

// True when every spot has a cell, no two share one, and for every pair the
// left-right and back-front order in the room is not reversed on the plan.
export function planOrderOk(spots, cells = PLAN_CELLS) {
  const seen = new Set();
  for (const s of spots) {
    const c = cells[s.id];
    if (!c) return false;
    const k = `${c.col},${c.row}`;
    if (seen.has(k)) return false;
    seen.add(k);
  }
  for (const a of spots) {
    for (const b of spots) {
      if (a.x < b.x && !(cells[a.id].col <= cells[b.id].col)) return false;
      if (a.z < b.z && !(cells[a.id].row <= cells[b.id].row)) return false;
    }
  }
  return true;
}

export const ITEM_ICON = Object.freeze({
  rug: '🟫', cattree: '🌳', fishtank: '🐟', bed: '🍩', lamp: '💡', scratcher: '🪵',
  toybasket: '🧺', plant: '🪴', tunnel: '🛝', armchair: '🛋️', telly: '📺', dresser: '🗄️',
});

export const iconFor = (id) => (Object.prototype.hasOwnProperty.call(ITEM_ICON, id) ? ITEM_ICON[id] : '📦');
