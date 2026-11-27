// =============================================================================
// THE JUNGLE LODGE: STRAY JUNGLE CATS (round two, from the owner's live play). Four friendly strays with jungle coats (spotted, sooty, tawny, striped) made by the walk's own stray system
// (src/straycats.js createStrayCats: the same cats that wander every other place, the same keep-out rule, the same wander stream by name) at four set places on open ground. The area
// record keeps `strays: false` (so the walk adds none of its own, no ghosts, no wanderer, no rival), and this layer asks for exactly these. They wander the whole green ground but never onto
// the river's shallows, the log bridge or the stepping stones (the keep-out capsules below), and they are friendly: never shy, never a grudge. The lower rungs keep fewer (three, then two).
// Each has one prompt and one line in both word sets (junglestraywords.js). Stage chunk code (junglestageb.js); start-up never imports it. Its own seeded stream (0x6a737472).
// =============================================================================
import * as THREE from 'three';
import { mulberry32 } from '../rng.js';
import { bus } from '../events.js';
import { phrase } from '../clanphrases.js';
import * as P from './jungleplan.js';
import { isLowTier } from './junglelight.js';
import { COATS } from './junglestraywords.js';

export const STRAY_SEED = 0x6a737472;
// coat -> the walk's breed whose fur reads that way
export const COAT_BREED = Object.freeze({ spotted: 'calico', sooty: 'black', tawny: 'mainecoon', striped: 'tabby' });
// Where each begins: open ground well off the river, the story's places and every collider (test/jungleplace.test.js).
export const STRAY_SPOTS = Object.freeze({ spotted: [-20, 20], sooty: [-30, 22], tawny: [20, 3], striped: [8, 8] });
export const strayCount = (tier) => (tier && tier.shadows === false ? 2 : isLowTier(tier) ? 3 : 4);
// the first cat name of the walk's list whose breed is that coat's (test/jungleplace.test.js checks each against the walk's own breed rule; written out so this chunk never imports the cat names)
const NAME_OF = Object.freeze({ spotted: 'Maple', sooty: 'Gadget', tawny: 'Marmalade', striped: 'Pickles' });
const nameFor = (coat) => NAME_OF[coat];
export const STRAY_CAST = Object.freeze(COATS.map((coat) => Object.freeze({ coat, name: nameFor(coat), x: STRAY_SPOTS[coat][0], z: STRAY_SPOTS[coat][1] })));

/** The keep-out the strays obey: the river's shallows, the log bridge and the stepping stones (capsules: [x1, z1, x2, z2, r]). */
export function strayKeepOut() {
  const capsules = [];
  for (let i = 0; i < P.RIVER_PATH.length - 1; i++) capsules.push({ x1: P.RIVER_PATH[i][0], z1: P.RIVER_PATH[i][1], x2: P.RIVER_PATH[i + 1][0], z2: P.RIVER_PATH[i + 1][1], r: P.RIVER_W + 0.7 });
  const B = P.LOG_BRIDGE;
  capsules.push({ x1: B.x, z1: B.z - B.len / 2 - 0.8, x2: B.x, z2: B.z + B.len / 2 + 0.8, r: 1.6 });
  const a = P.STEPPING[0]; const b = P.STEPPING[P.STEPPING.length - 1];
  capsules.push({ x1: a.x, z1: a.z, x2: b.x, z2: b.z, r: 1.6 });
  return { rects: [], capsules, margin: 0.4 };
}
export const strayArea = (colliders) => ({ bounds: P.JUNGLE_BOUNDS, colliders, waters: [], keepOut: strayKeepOut() });

const say = (key, label) => bus.emit('discovery', { type: 'greenhousenote', key, label, points: 0, repeat: false });
const NEAR = 2.2;
// literal phrase ids (the words test reads each one)
const PROMPT = Object.freeze({
  spotted: () => phrase('jungle.stray.prompt.spotted'), sooty: () => phrase('jungle.stray.prompt.sooty'), tawny: () => phrase('jungle.stray.prompt.tawny'), striped: () => phrase('jungle.stray.prompt.striped'),
});
const LINE = Object.freeze({
  spotted: () => phrase('jungle.stray.line.spotted'), sooty: () => phrase('jungle.stray.line.sooty'), tawny: () => phrase('jungle.stray.line.tawny'), striped: () => phrase('jungle.stray.line.striped'),
});

/** The life: ctx { scene, ground, tier, roomSeed, reducedMotion } -> { promptAt, interact, update, strays, dispose }. */
export function createJungleStrays(ctx) {
  if (!ctx?.scene) return null;
  const n = strayCount(ctx.tier);
  const rng = mulberry32((ctx.roomSeed === undefined ? STRAY_SEED : (ctx.roomSeed ^ STRAY_SEED) >>> 0));
  const colliders = (ctx.colliders ?? P.jungleColliders()).map((c) => ({ ...c }));
  const byName = new Map(STRAY_CAST.map((c) => [c.name, c.coat]));
  let cats = null;
  let gone = false;
  let target = null;
  // The walk's stray module is the walk's own chunk: asked for here when the life starts (never a static import, so the place's stage chunk does not pull the cat model into the start-up download).
  const ready = import('../straycats.js').then(({ createStrayCats }) => {
    if (gone) return;
    cats = createStrayCats(ctx.scene, strayArea(colliders), n, rng, {
      colonyCats: STRAY_CAST.map((c) => ({ name: c.name, x: c.x, z: c.z })), roomSeed: ctx.roomSeed ?? STRAY_SEED, reducedMotion: !!ctx.reducedMotion, ground: ctx.ground,
    });
    for (const s of cats.strays) { s.personality = 'bold'; s.jungleCoat = byName.get(s.name) ?? null; } // friendly: no shy scurry
    life.strays = cats.strays;
  }).catch(() => { cats = null; }); // the strays are decoration: a place that cannot draw their name tags (a headless check) simply has none
  const life = {
    strays: [],
    ready,
    promptAt(catPos) {
      target = null;
      if (!catPos || !cats) return null;
      let best = NEAR;
      for (const s of cats.strays) { const d = s.group.position.distanceTo(catPos); if (s.jungleCoat && d < best) { best = d; target = s; } }
      return target ? PROMPT[target.jungleCoat]() : null;
    },
    interact() {
      const s = target; target = null;
      if (!s) return null;
      s.state = 'greet'; s.timer = 3; // she looks up and holds a greeting pose (the walk's own stray state)
      say(`jungle-stray-${s.jungleCoat}`, LINE[s.jungleCoat]());
      return null;
    },
    update(dt, t, catPos) { cats?.update(dt, t, catPos instanceof THREE.Vector3 ? catPos : null, {}); },
    dispose() { gone = true; cats?.dispose?.(); },
  };
  return life;
}
