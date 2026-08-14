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

export function createGoals(rng) {
  const pool = [...GOAL_POOL];
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
  };
}
