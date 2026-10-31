export const GOAL_POOL = [
  { id: 'spot-critters', text: 'Spot 4 critters', type: 'critter', target: 4 },
  { id: 'collect', text: 'Collect 2 treasures', type: 'collectible', target: 2 },
  { id: 'tip-things', text: 'Tip 3 things over', type: 'mischief', target: 3 },
  { id: 'greet-cats', text: 'Greet 3 cats', type: 'friend', target: 3 },
  { id: 'take-photos', text: 'Take 2 photos', type: 'photo', target: 2 },
  { id: 'get-scratches', text: 'Get head scratches', type: 'pet', target: 1 },
  { id: 'yarn-play', text: 'Have a yarn play session', type: 'play', target: 1 },
  { id: 'dig-treasure', text: 'Dig up a buried treasure', type: 'treasure', target: 1 },
  { id: 'box-sit', text: 'Sit in a box', type: 'sits', target: 1 },
  { id: 'scenic-spots', text: 'Visit 2 scenic spots', type: 'scenic', target: 2 },
  { id: 'pounce-play', text: 'Pounce-tag 2 critters', type: 'hunt', target: 2 },
];

// goalFits(goal, areaData) → false when the area itself has nothing that
// could finish the goal: no tippables to tip, no box to sit in, no villager
// to give head scratches (the Woods has none of the three). It reads only
// the area's built data, which is the same on both co-walk devices, so both
// still filter to the same pool. Missing areaData keeps every goal.
export function goalFits(goal, areaData) {
  if (!areaData) return true;
  if (goal.type === 'mischief') return (areaData.tippables?.length ?? 0) >= goal.target;
  if (goal.type === 'sits') return (areaData.boxes?.length ?? 0) >= goal.target;
  if (goal.type === 'pet') return (areaData.critterSpawns ?? []).some((c) => c.type === 'villager');
  return true;
}

// Always exactly three rng draws, whatever the area: the walkRng is shared
// by co-walkers, and a different draw count would shift every roll after it.
// Filtering keeps GOAL_POOL's order, so an area that can finish every goal
// draws exactly what it drew before the filter existed.
export function createGoals(rng, areaData) {
  const pool = GOAL_POOL.filter((g) => goalFits(g, areaData));
  const goals = [];
  while (goals.length < 3) {
    const i = Math.floor(rng() * pool.length);
    const [entry] = pool.splice(i, 1);
    goals.push({ ...entry, progress: 0, done: false });
  }
  return {
    goals,
    note(type) {
      if (type === 'goal' || type === 'jackpot') return {};
      const result = {};
      for (const g of goals) {
        if (g.done || g.type !== type) continue;
        g.progress += 1;
        if (g.progress >= g.target) {
          g.done = true;
          result.completed = g;
          if (goals.every((x) => x.done)) result.jackpot = true;
        }
      }
      return result;
    },
    // Duo-goal remote path: advances the SAME shared goal from a partner's
    // 'goal-progress' network event, so both co-walkers' progress bars stay
    // in lockstep even though only one side performed the actual action.
    // Deliberately narrow — only touches a goal matching `goalId` that is
    // flagged `duo` — and never broadcasts, so main.js can call this from
    // applyRemoteEvent without an echo loop back onto the wire.
    noteDuoRemote(goalId) {
      const g = goals.find((x) => x.id === goalId && x.duo);
      if (!g || g.done) return {};
      g.progress += 1;
      const result = {};
      if (g.progress >= g.target) {
        g.done = true;
        result.completed = g;
        if (goals.every((x) => x.done)) result.jackpot = true;
      }
      return result;
    },
  };
}
