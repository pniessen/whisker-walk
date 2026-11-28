// The overnight matrix and its resumable queue. Pure: soak-night.mjs does the files and the Chrome.
import { ALL_PLACES, PRESET_CATS } from './save.mjs';

const FIRST = ['reef', 'moon'];
const THROTTLES = [1, 4, 6];
const CATS = [...PRESET_CATS, 'custom'];

// Every combination, the two crash places first, then the rest. The order inside a
// place cycles cats fastest, so a short night still sees several cats per place.
// Seeds are made from the position, so the list is the same every time it is built.
export function buildMatrix({ places = null } = {}) {
  const order = places ?? [...FIRST, ...ALL_PLACES.filter((p) => !FIRST.includes(p))];
  const jobs = [];
  for (const place of order) {
    let n = 0;
    for (const throttle of THROTTLES) {
      for (const tv of [0, 1]) {
        for (const couch of [0, 1]) {
          for (const cat of CATS) {
            n += 1;
            jobs.push({ id: `${place}-${cat}-tv${tv}-t${throttle}-c${couch}`, place, cat, tv, throttle, couch, seed: 1000 + n, hiddenTab: n % 3 === 0 ? 1 : 0 });
          }
        }
      }
    }
  }
  return jobs;
}

// A queue file: { matrix: jobs, done: [ids], startedAt }. Resuming keeps `done`.
export function nextJob(queue) {
  const done = new Set(queue.done);
  return queue.jobs.find((j) => !done.has(j.id)) ?? null;
}

export function markDone(queue, id) {
  return { ...queue, done: queue.done.includes(id) ? queue.done : [...queue.done, id] };
}

export function newQueue(jobs) {
  return { version: 1, jobs, done: [] };
}

// A saved queue is reused only if it still has the same job ids; otherwise start over.
export function reuseQueue(saved, jobs) {
  if (!saved || saved.version !== 1 || !Array.isArray(saved.jobs) || !Array.isArray(saved.done)) return newQueue(jobs);
  const same = saved.jobs.length === jobs.length && saved.jobs.every((j, i) => j.id === jobs[i].id);
  return same ? saved : newQueue(jobs);
}

// How many minutes the next run gets: the lesser of its slot and what is left of the night.
export function runMinutes({ perRun, msLeft }) {
  return Math.max(0, Math.min(perRun, msLeft / 60000));
}
