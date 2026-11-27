// Cat two's finds (couch play, milestone 3): the things cat one does with the
// paw, nose, mouth and voice, done by the second cat through the SAME game
// rules, so a find is the household's find:
//
//   paws       the walk's pocket, the discovery log's once-a-walk key `col-<id>`;
//   golden     progression.recordGolden (true only the first time ever) and the
//              log's `legend` key, so two cats on one mouse pay it once;
//   catch      critters.catchAt / pounceCatch while cat two's own hop is up;
//   sniff      scent.sniff, scent.digAt (keen-nose breeds smell farther);
//   talk       the meow's reactions (strays, critters, farm, the fair) and the
//              Far Call skill's wider reach;
//   carry      cat two's own mouth (src/carry.js), the held thing drawn at its
//              head; a thing it puts down is also noted on cat one's mouth, so
//              the walk-end marks are what a solo walk would write.
//
// It writes nothing the walk does not already write: no key of its own, no
// save field, no event to a net (couch play has none). The tally of who found
// what is per walk and never saved (the summary card says it).
import * as THREE from 'three';
import { createMouth, pick as pickUp, drop as putDown, carryLabel } from '../carry.js';
import { hasSkill } from '../skills.js';
import { PERSONALITIES } from '../cat/brain.js';
import { critterLabel } from '../game/labels.js';

export const COLLECT_REACH = 1.6; // metres: cat one's own (game/interactions.js)
export const CARRY_REACH = 1.2;
export const MOUND_REACH = 1.2;
const GOLD = 0xf2c14e;
const NOSE_RANGE = 22, NOSE_TRAIL_DIST = 6, NOSE_REFRESH = 3.5, NOSE_RETRY = 1;
const WHISKER_RANGE = 12, WHISKER_MIN_GAP = 0.6, WHISKER_MAX_GAP = 2.6;

const air = new THREE.Vector3(), paws = new THREE.Vector3();
export const sniffRange = (breed) => (PERSONALITIES[breed]?.special === 'keenNose' ? 30 : 18);

/**
 * ctx: { progression, log, audio } (the walk's own); `drawn()` is cat two's drawn
 * group (what a held thing hangs from); `said(slot, label, points)` lets the
 * chunk show the finder's chip and the +N over its head.
 */
export function createFinds({ ctx, drawn, said = () => {}, pick, tally = [0, 0] }) {
  const mouth = createMouth(); // cat two's own
  let noseAt = 0, whiskerAt = 0, busy = false; // busy: an award cat two is paying right now (so the tally credits it, not cat one)
  const now = () => performance.now() / 1000;
  const count = (slot, label, points = 0) => { tally[slot]++; said(slot, label, points); };

  const pawsY = (s, body, mover) => (s.ground.flat ? 0 : s.ground.y(body.position.x, body.position.z)) + mover.player.perchY; // the Reef is not a couch place: no float height here

  function nearestCollectible(s, p, y, g) {
    let best = null, bestD = COLLECT_REACH;
    for (const c of s.areaData.collectibles) {
      if (!s.collectibleMeshes.has(c.id)) continue;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d >= bestD) continue;
      const cy = g.flat ? (c.y ?? 0) : g.y(c.x, c.z) + (c.y ?? 0);
      if (Math.abs(y - cy) < 0.9) { best = c; bestD = d; }
    }
    return best;
  }

  /** What cat two's X would do here: { kind, item, label } or null. Never touches anything. */
  function reach(s, mover, body) {
    if (!s?.walk) return null;
    const p = body.position;
    const g = s.ground;
    const y = pawsY(s, body, mover);
    const c = nearestCollectible(s, p, y, g);
    if (c && s.walk.carried < s.walk.carryCap) return { kind: 'collect', item: c, label: c.label };
    const perched = mover.player.perchY > 0.05;
    const mound = s.scent?.nearestMound?.(p, MOUND_REACH);
    if (mound?.revealed) return { kind: 'dig' };
    if (!mouth.held && !perched) {
      const it = s.carry?.items.nearest(p, CARRY_REACH);
      if (it && !it.job) return { kind: 'carry', item: it, label: carryLabel(it.kind) };
    }
    if (mouth.held && !mouth.held.treat && !mouth.held.toy && !mouth.held.job && !perched && !mover.player.inWater) return { kind: 'drop', label: carryLabel(mouth.held.kind) };
    return null;
  }

  /** X on cat two's pad. Returns what it did ({ kind, label }) so the caller can say it. */
  function interact(s, mover, body) {
    busy = true;
    try { return doInteract(s, mover, body); } finally { busy = false; }
  }
  function doInteract(s, mover, body) {
    const r = reach(s, mover, body);
    const p = body.position;
    if (!r) { // nothing in reach: a sniff of the air, as cat one's E does
      if (!s.scent) return null;
      const found = s.scent.sniff(p, sniffRange(pick?.().breed));
      return { kind: 'sniff', found: !!found };
    }
    if (r.kind === 'collect') {
      const c = r.item;
      s.scene.remove(s.collectibleMeshes.get(c.id));
      s.collectibleMeshes.delete(c.id);
      s.walk.carried += 1;
      const paid = ctx.log.awardOnce('collectible', `col-${c.id}`, c.label);
      s.fx?.burst(p, GOLD, 12);
      count(1, c.label, paid);
    } else if (r.kind === 'dig') {
      const treat = s.scent.digAt(p);
      if (treat) {
        const paid = ctx.log.awardOnce('treasure', treat.id, 'a buried treasure!');
        s.fx?.burst(p, GOLD, 12);
        count(1, 'a buried treasure!', paid);
      }
    } else if (r.kind === 'carry') {
      if (!pickUp(mouth, r.item)) return null;
      s.carry.items.hold(r.item.id, drawn());
      said(1, carryLabel(r.item.kind), 0);
    } else if (r.kind === 'drop') {
      const it = s.carry.items.list.find((x) => x.id === mouth.held?.id);
      const at = it?.mesh?.position;
      let x = Number.isFinite(at?.x) ? at.x : p.x, z = Number.isFinite(at?.z) ? at.z : p.z;
      const b = s.areaData?.bounds;
      if (b) { x = Math.min(b.maxX, Math.max(b.minX, x)); z = Math.max(b.minZ, Math.min(b.maxZ, z)); }
      const released = putDown(mouth, x, z, it ? { x: it.homeX, z: it.homeZ } : null);
      if (released) {
        s.carry.items.placeAt(released.id, x, z);
        const mark = mouth.dropped.get(released.id);
        const d = mark ?? { kind: released.kind, x, z, homeX: x, homeZ: z };
        s.carry.mouth.dropped.set(released.id, d); // the walk's own end-of-walk marks read cat one's mouth
        mouth.dropped.delete(released.id);
      }
    }
    return { kind: r.kind, label: r.label };
  }

  /** B on cat two's pad: the meow's reactions (the voice itself is the caller's). */
  function meow(s, body) {
    const far = hasSkill(ctx.progression.state, 'far-call');
    s.critters?.reactToMeow?.(body.position, { far });
    s.farm?.reactToMeow?.(body.position);
    s.fair?.meow?.(body.position);
    return (s.strayCats?.reactToMeow?.(body.position, { far }) ?? 0) > 0;
  }

  /** Every frame while cat two is in the walk (after the walk's own updates): golden mice, catches, senses. */
  function frame(dt, s, mover, body, hopping) {
    busy = true;
    try { doFrame(s, mover, body, hopping); } finally { busy = false; }
  }
  function doFrame(s, mover, body, hopping) {
    if (!s?.goldMice) return;
    const p = body.position;
    const y = pawsY(s, body, mover);
    const gm = s.goldMice.checkFind(p, y);
    if (gm && ctx.progression.recordGolden(gm.id)) {
      const paid = ctx.log.awardOnce('legend', gm.id, 'a GOLDEN MOUSE! 🥇');
      s.fx?.burst(p, GOLD, 18);
      ctx.audio?.fanfare?.();
      s.goldMice.remove(gm.id);
      count(1, 'a GOLDEN MOUSE! 🥇', paid);
    }
    if (hopping && s.critters) { // cat two's own hop: butterflies and fireflies in the air, critters at the paws
      const caught = s.critters.catchAt?.(air.set(p.x, (s.ground.flat ? 0 : s.ground.y(p.x, p.z)) + 0.8, p.z));
      if (caught) {
        const paid = ctx.log.award('perk', 'catch', 'a mid-air catch!');
        ctx.progression.recordSighting(caught.type);
        count(1, 'a mid-air catch!', paid);
      }
      const hunted = s.critters.pounceCatch?.(paws.set(p.x, y, p.z));
      if (hunted) {
        const paid = ctx.log.award('hunt', `hunt-${hunted.type}`, `you pounce-tagged ${critterLabel(hunted)}!`);
        ctx.progression.recordSighting(hunted.type);
        count(1, critterLabel(hunted), paid);
      }
    }
    // Twitchy Nose and Whisker Sense: the household's skills, cat two's nose.
    const state = ctx.progression.state;
    const t = now();
    if (hasSkill(state, 'twitchy-nose') && s.scent && t >= noseAt) {
      let target = null, bestD = NOSE_RANGE;
      for (const c of s.areaData.collectibles) {
        if (!s.collectibleMeshes.has(c.id)) continue;
        const d = Math.hypot(c.x - p.x, c.z - p.z);
        if (d < bestD) { bestD = d; target = c; }
      }
      const laid = target ? s.scent.trailTo(p, target, { maxDist: NOSE_TRAIL_DIST }) : null;
      noseAt = t + (laid ? NOSE_REFRESH : NOSE_RETRY);
    }
    if (hasSkill(state, 'whisker-sense') && t >= whiskerAt) {
      const near = s.goldMice.nearestUnfound(p, WHISKER_RANGE, new Set(state.golden ?? []));
      if (near) {
        const k = 1 - near.dist / WHISKER_RANGE;
        whiskerAt = t + WHISKER_MAX_GAP - (WHISKER_MAX_GAP - WHISKER_MIN_GAP) * k;
        ctx.audio?.whiskerPing?.(k);
      } else whiskerAt = t + 0.5;
    }
  }

  /** Cat two leaves (or the walk ends): what it holds is put down where it stands. */
  function letGo(s, body) {
    if (!mouth.held || !s?.carry) return;
    const id = mouth.held.id;
    const x = body.position.x, z = body.position.z;
    putDown(mouth, x, z, null);
    mouth.dropped.delete(id);
    s.carry.items.placeAt(id, x, z);
  }

  return { tally, mouth, reach, interact, meow, frame, letGo, get held() { return mouth.held; }, get busy() { return busy; } };
}
