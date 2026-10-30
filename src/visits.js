// The visit schedule: which visits are milestones, and what each one wins.
// Pure and import-free so progression.js can use it.

// Award order: milestone index 0..9 (visits 1, 5, 10, 20 ... 80).
export const VISIT_PRIZES = Object.freeze([
  'partycrown', 'confetticape', 'starshades', 'leafcrown', 'balloonbunch',
  'sparklecollar', 'warpaint', 'candlehat', 'streamerscarf', 'goldbooties',
]);

// Milestones are visit 1, visit 5, then every 10th.
export function isMilestone(n) {
  if (!Number.isInteger(n) || n < 1) return false;
  return n === 1 || n === 5 || n % 10 === 0;
}

// 1 -> 0, 5 -> 1, 10 -> 2, 20 -> 3 ... ; -1 when n is not a milestone.
export function milestoneIndex(n) {
  if (!isMilestone(n)) return -1;
  if (n === 1) return 0;
  if (n === 5) return 1;
  return n / 10 + 1;
}

// The biggest milestone at or below n, or 0 if there is none yet.
export function latestMilestoneUpTo(n) {
  if (!(n >= 1)) return 0;
  const k = Math.floor(n);
  if (k < 5) return 1;
  if (k < 10) return 5;
  return Math.floor(k / 10) * 10;
}

// Visit 1 is the cat greeting (C); after that A, B, C take turns.
export function styleFor(index) {
  if (index === 0) return 'C';
  return ['A', 'B', 'C'][(index - 1) % 3];
}

// Each prize is won once; after that the list cycles through ones already owned.
export function prizeFor(index) {
  return { id: VISIT_PRIZES[index % VISIT_PRIZES.length], isNew: index < VISIT_PRIZES.length };
}

// Prize ids whose milestone visit is at or below `seen`.
export function prizesWonBy(seen) {
  return VISIT_PRIZES.filter((id) => prizeVisit(id) <= seen);
}

// The visit that first awards this prize, or null for an unknown id.
export function prizeVisit(id) {
  const i = VISIT_PRIZES.indexOf(id);
  if (i < 0) return null;
  if (i === 0) return 1;
  if (i === 1) return 5;
  return (i - 1) * 10;
}

// Warm lines for ordinary visits; none of them blames anyone for being away.
const WELCOME_LINES = [
  (n) => `Welcome back! Visit ${n} 🐾`,
  (n) => `Visit ${n}. Your cat missed you.`,
  (n) => `Visit ${n}, and the walk is waiting!`,
  (n) => `So good to see you. Visit ${n} 🐱`,
  (n) => `Visit ${n}! Let's go for a stroll.`,
];

export function welcomeLine(n) {
  return WELCOME_LINES[n % WELCOME_LINES.length](n);
}

// Confetti pieces: a small burst on visit 1, a big one on 10, 50 and every 100.
export function confettiCount(visit) {
  if (visit === 1) return 40;
  if (visit === 10 || visit === 50 || (visit > 0 && visit % 100 === 0)) return 160;
  return 90;
}
