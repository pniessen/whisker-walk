// =============================================================================
// THE SEALAB'S STORY ON A WALK (milestone R14): the three fuses, the aquarium's fish and the shy shark. Made once a walk by world/reef.js beside the hatch
// (world/reeflablive.js); update(dt, t, catPos, camera, session) every frame; the walk asks promptAt(catPos) and interact() through the Reef's prompt arbiter
// (world/reefprompt.js: Marlo's and the errand's offers first, then this, then the hatch). The rules are src/reeflab.js (pure); the places are reeflabplan.js.
//   * THE FUSES: three, found where they lie (one in the bunk room, one in the aquarium hall, one on the sand west of the hatch), picked up with the action
//     button (one at a time, in her mouth) and carried to the panel in the control room, in any order. Putting the third in pays AWARDS.reeflab once and says so.
//   * CARRY ENDINGS: a carried fuse is NEVER saved. It is set down at its own spot (a soft line, nothing lost) when she climbs the ladder with a fuse of the
//     station, when Marlo's shell is picked up as well, and when the walk ends (however it ends); the saved bits are only the fuses already in the panel.
//   * THE AQUARIUM: three tanks with three small friendly fish each, gliding back and forth; drawn only while she is inside; still under reduced motion;
//     the lower rungs draw six, not nine.
//   * THE DOME SHOW (R15): the moment the third fuse goes in the dome plays a gentle 20 s light show (world/reeflabshow.js labShowAt, a pure function of one
//     start time; world/reeflabshowdraw.js draws it; the Sealab's one PointLight is only tinted). Anyone's start is everyone's in a room: credit({ kind:
//     'labshow', elapsed }) starts it for a partner (elapsed = how long ago it began on the sender's clock). Watching it past SHOW.seenAt sets bit 3 of the
//     save and the page `rfshow`; she can watch it again from the dome's bench whenever the station has power (no timer can fail her). Reduced motion: a still
//     glow of ribbons held for the same 20 s, nothing moving.
//   * THE SHY SHARK: a spotted shark on a slow loop on the sea side of the dome's glass, seen from the dome (a journal subject, `rfshark`); it keeps its
//     distance from a cat outside. Under reduced motion it hangs still by the glass.
// It takes everything of the save and the walk through `io` (this chunk never reads or writes the save itself): { reef() -> state.reef, commit(next), sight(id),
// award(kind, key, text), send(ev), mouthFree() }. Every random-looking number is a constant; the walk's own time is the only clock.
// =============================================================================

import { phrase } from '../clanphrases.js';
import * as M from '../reeflab.js';
import * as L from './reeflabplan.js';
import { makeFuse, makeFish, makeShark } from './reeflabcritters.js';
import { labShowAt, labStill, SHOW, RIBBON_HUES } from './reeflabshow.js';
import { createShowDraw } from './reeflabshowdraw.js';
import './reeflabwords.js';

export const CARRY_LIFT = 1.2; // m: higher over the seabed than this she cannot reach a fuse (she climbs from the sand)
const FISH_LOW = 6;
const LIGHT_BASE = 0xffd9a8;
const mixHex = (a, b, t) => { const ch = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t); return (ch(16) << 16) | (ch(8) << 8) | ch(0); };
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// createLabStory(ctx) -> { promptAt, interact, update, credit, goalNow, dispose, spottable, state }
// ctx: { scene, reefY, lab (reeflablive's: .inside), player, reducedMotion, tier, say, audio, io, THREE (the Vector3 class, for the shark's journal spot) }
export function createLabStory({ scene, reefY, lab, player = null, reducedMotion = false, tier = null, say = null, audio = null, io = {}, Vec3 = null }) {
  const lowTier = !!tier && (tier.name === 'low' || tier.shadows === false || (tier.rung ?? 0) >= 3);
  const fuses = L.FUSE_SPOTS.map((s) => makeFuse(s.id));
  const fishN = lowTier ? FISH_LOW : L.TANKS.length * L.FISH_PER_TANK;
  const fish = makeFish(fishN);
  const shark = makeShark(L.SHARK.spots);
  scene.add(...fuses, fish, shark);
  fish.visible = false;
  const draw = createShowDraw({ scene, reefY, lowTier });
  const lamp = scene.getObjectByName?.('lab:light') ?? null;
  let clock = 0; // the walk's own time, kept here: the show's T0 is on it
  let showRun = null; // { t0, seen } while the dome show plays
  const spot = { type: 'rfshark', label: phrase('reef.life.shark'), pos: Vec3 ? new Vec3() : { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } }, range: 10 };
  const spottable = [spot];
  let carrying = null; // the fuse in her mouth (0, 1, 2) or null: NEVER saved
  let target = null;
  let wasInside = false;
  let cat = null;
  let yaw = 0; // the way she faces (the fuse in her mouth is held in front)
  let fishDrawn = false;
  let disposed = false;
  const pose = {}; const sk = {}; const fp = {};

  const reef = () => io.reef?.();
  const free = () => (io.mouthFree ? io.mouthFree() !== false : true);
  const lift = () => player?.floatY ?? 0;
  const inside = () => !!lab?.inside;
  const safeSay = (text) => { if (text) say?.(text); };
  const nearestOrder = (from) => [0, 1, 2].sort((a, b) => dist(from ?? L.FUSE_SPOTS[0], L.FUSE_SPOTS[a]) - dist(from ?? L.FUSE_SPOTS[0], L.FUSE_SPOTS[b]));

  function perform(ev, remote) {
    const r = remote ? M.credit(reef(), ev) : M.apply(reef(), ev);
    if (!r.changed) return null;
    io.commit?.(r.reef);
    if (r.effect === 'power') io.award?.('reeflab', 'reef-lab', phrase('reef.lab.pay'));
    return r.effect;
  }
  // the dome show (T0 = now); `elapsed` (a partner's start, some seconds ago on their clock) joins one already going
  function startShow({ own = true, elapsed = 0 } = {}) {
    if (disposed || showRun) return false;
    const e = Number.isFinite(elapsed) ? Math.min(Math.max(0, elapsed), SHOW.secs) : 0;
    showRun = { t0: clock - e, seen: false };
    if (e < 3) safeSay(phrase('reef.lab.show.start'));
    if (own) io.send?.({ kind: 'labshow', elapsed: 0 });
    return true;
  }
  function placeShow() {
    let k = -1;
    if (showRun) {
      k = clock - showRun.t0;
      if (k >= SHOW.seenAt && !showRun.seen) {
        showRun.seen = true;
        if (M.powered(reef())) { perform({ kind: 'show' }, false); try { io.sight?.('rfshow'); } catch { /* a stand-in save */ } }
      }
      if (k > SHOW.secs) { showRun = null; k = -1; }
    }
    const s = k >= 0 ? (reducedMotion ? labStill() : labShowAt(k)) : null;
    draw.place(s, reducedMotion);
    if (lamp) {
      const i = k >= 0 ? Math.floor(k / 4) % 3 : 0;
      const f = k >= 0 ? (k / 4) % 1 : 0;
      const hue = reducedMotion ? RIBBON_HUES[0] : mixHex(RIBBON_HUES[i], RIBBON_HUES[(i + 1) % 3], f * f * (3 - 2 * f));
      lamp.color.setHex(k >= 0 ? mixHex(LIGHT_BASE, hue, 0.45 * (reducedMotion ? 0.7 : s.glow)) : LIGHT_BASE);
    }
  }
  function putBack(why) {
    if (carrying === null) return;
    carrying = null;
    target = null;
    if (why) safeSay(phrase('reef.lab.fuse.back'));
  }

  function decide(catPos) {
    if (!catPos || disposed || lift() > CARRY_LIFT) return null;
    const r = reef();
    if (carrying !== null) {
      if (inside() && dist(catPos, L.PANEL) < L.PANEL.reach && M.canPick(r, carrying, null)) return { kind: 'put', fuse: carrying, line: phrase('reef.lab.put') };
      return null;
    }
    if (!free()) return null;
    for (const s of L.FUSE_SPOTS) {
      if (s.inside !== inside() || !M.canPick(r, s.id, carrying)) continue;
      if (dist(catPos, s) < L.FUSE_REACH) return { kind: 'pick', fuse: s.id, line: phrase('reef.lab.fuse.prompt') };
    }
    if (M.powered(r) && !showRun && dist(catPos, L.DOME_BENCH) < L.DOME_REACH && inside()) return { kind: 'show', line: phrase('reef.lab.show.prompt') };
    return null;
  }

  function goalNow() {
    const r = reef();
    const order = nearestOrder(cat);
    const g = M.nextGoal(r, carrying, order);
    if (g.kind === 'rest') return null;
    const hatch = L.HATCH.outside;
    const up = L.HATCH.inside.exit;
    const at = (p, kind, extra = {}) => ({ g: { kind, ...extra }, x: p.x, z: p.z, y: reefY(p.x, p.z) });
    const here = inside();
    if (g.kind === 'deliver') return here ? at(L.PANEL, 'labdeliver', { fuse: g.fuse }) : at(hatch, 'labdown', { fuse: g.fuse });
    const s = L.FUSE_SPOTS[g.fuse];
    if (s.inside === here) return at(s, here ? 'labfuse' : 'labsand', { fuse: g.fuse, n: M.fusesIn(r) });
    return here ? at(up, 'labup', { fuse: g.fuse }) : at(hatch, 'labhatch', { fuse: g.fuse });
  }

  function placeFuses(t) {
    const r = reef();
    const here = inside();
    L.FUSE_SPOTS.forEach((s, i) => {
      const f = fuses[i];
      const seated = M.fuseIn(r, i);
      f.rotation.set(0, 0, 0);
      f.scale.setScalar(1);
      if (carrying === i && cat) {
        f.visible = true;
        f.position.set(cat.x + Math.sin(yaw) * 0.5, cat.y + 0.3, cat.z + Math.cos(yaw) * 0.5);
        f.rotation.set(0, yaw, Math.PI / 2);
        f.scale.setScalar(0.8);
      } else if (seated) {
        const k = L.FUSE_SOCKETS[i];
        f.visible = here;
        f.position.set(k.x, reefY(k.x, k.z) + k.y, k.z - 0.2);
        f.rotation.x = Math.PI / 2;
        f.scale.setScalar(0.7);
      } else {
        f.visible = s.inside ? here : !here;
        f.position.set(s.x, reefY(s.x, s.z) + (reducedMotion ? 0.06 : 0.06 + 0.04 * Math.sin(t * 1.8 + i)), s.z);
        f.rotation.y = reducedMotion ? 0.5 * i : t * 0.5 + i;
      }
    });
  }

  function placeFish(t) {
    const show = inside() && !!cat && L.roomAt(cat.x, cat.z, 1.0) !== null && cat.x > L.ROOMS.aquarium.minX - 6;
    fish.visible = show;
    if (!show || (reducedMotion && fishDrawn)) return;
    let k = 0;
    for (const tank of L.TANKS) {
      for (let i = 0; i < L.FISH_PER_TANK && k < fishN; i++, k++) {
        L.fishAt(tank, i, reducedMotion ? 0 : t, fp);
        setAt(fish, k, fp.x, L.LAB_FLOOR_Y + fp.y, fp.z, fp.dir > 0 ? 0 : Math.PI);
      }
    }
    fish.instanceMatrix.needsUpdate = true;
    fishDrawn = true;
  }

  function placeShark(t) {
    L.sharkAt(reducedMotion ? L.SHARK.period / 2 : t, reducedMotion ? null : cat, sk);
    const y = reefY(sk.x, sk.z) + sk.y;
    shark.position.set(sk.x, y, sk.z);
    shark.rotation.y = sk.yaw + (reducedMotion ? 0 : 0.12 * Math.sin(t * 2.2));
    spot.pos.set(sk.x, y, sk.z);
  }

  return {
    get carrying() { return carrying; },
    get showOn() { return !!showRun; },
    get draw() { return draw; },
    startShow,
    get state() { return { show: showRun ? { ...showRun, k: clock - showRun.t0 } : null, carrying, fuses: M.fusesIn(reef()), inside: inside(), fish: fishN, shark: { x: shark.position.x, y: shark.position.y, z: shark.position.z } }; },
    get fuses() { return fuses; },
    get fish() { return fish; },
    get shark() { return shark; },
    spottable,
    goalNow,
    promptAt(catPos) {
      target = decide(catPos);
      return target ? target.line : null;
    },
    interact() {
      if (!target || disposed) return null;
      const t = target;
      target = null;
      if (t.kind === 'pick') {
        carrying = t.fuse;
        audio?.chime?.();
        safeSay(phrase('reef.lab.fuse.got'));
      } else if (t.kind === 'put') {
        const id = t.fuse;
        carrying = null;
        const effect = perform({ kind: 'fuse', fuse: id }, false);
        audio?.chime?.();
        try { io.sight?.('rffuses'); } catch { /* a stand-in save */ }
        io.send?.({ kind: 'fuse', fuse: id });
        if (effect === 'power') startShow({ own: true }); // the third fuse: the dome plays (its message follows the fuse's)
        safeSay(effect === 'power' ? phrase('reef.lab.power') : phrase('reef.lab.fuse.in'));
      } else if (t.kind === 'show') {
        audio?.chime?.();
        startShow({ own: true }); // watching it again: nothing is paid, and no clock can fail her
      }
      return t.kind;
    },
    // a fuse put in by anyone in the room: the same effects as her own; if it was the one in her mouth it is gone from it
    credit(ev) {
      if (ev && typeof ev === 'object' && ev.kind === 'labshow') return startShow({ own: false, elapsed: ev.elapsed }) ? 'show-start' : null;
      const effect = perform(ev, true);
      if (!effect) return null;
      if (carrying === ev.fuse) carrying = null;
      return effect;
    },
    update(dt, t, catPos, camera, session) {
      if (disposed) return;
      cat = catPos ?? cat;
      clock += dt > 0 ? dt : 0;
      const now = inside();
      if (now && !wasInside) { try { io.sight?.('rflab'); } catch { /* a stand-in save */ } }
      if (!now && wasInside && carrying !== null && L.FUSE_SPOTS[carrying].inside) putBack(true); // up the ladder: a fuse of the station stays in it
      wasInside = now;
      if (carrying !== null && !free()) putBack(true); // Marlo's shell was taken too
      if (carrying !== null && M.fuseIn(reef(), carrying)) carrying = null; // a partner put this one in
      yaw = session?.cat?.rotation?.y ?? yaw;
      placeFuses(t);
      placeFish(t);
      placeShark(t);
      placeShow();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      showRun = null;
      draw.dispose();
      lamp?.color?.setHex?.(LIGHT_BASE);
      carrying = null; // a fuse in her mouth when the walk ends is not kept: the next walk finds it at its spot
      for (const o of [...fuses, fish, shark]) {
        scene.remove(o);
        o.geometry?.dispose?.();
        o.material?.dispose?.();
      }
    },
  };
}

// An instance's matrix from a position and a yaw (no THREE import: it writes the 4 x 4 by hand, column-major, a rotation about y).
function setAt(mesh, i, x, y, z, yaw) {
  const c = Math.cos(yaw); const s = Math.sin(yaw);
  const a = mesh.instanceMatrix.array;
  const o = i * 16;
  a[o] = c; a[o + 1] = 0; a[o + 2] = -s; a[o + 3] = 0;
  a[o + 4] = 0; a[o + 5] = 1; a[o + 6] = 0; a[o + 7] = 0;
  a[o + 8] = s; a[o + 9] = 0; a[o + 10] = c; a[o + 11] = 0;
  a[o + 12] = x; a[o + 13] = y; a[o + 14] = z; a[o + 15] = 1;
}
