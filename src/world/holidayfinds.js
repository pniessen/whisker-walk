// The holiday errand (H7; docs/superpowers/specs/2026-11-27-holiday-merch-design.md D4, D7, D20): small holiday things to find on a walk,
// inside a window only. An ornament in the Christmas window, a dreidel or a gold gelt coin in the Hanukkah window; two a walk at most,
// from the place's hand-placed ground spots (holidayspots.js). Three kept finds (one counts a walk) give the holiday's earned piece
// (the Little Gold Star, the Menorah Glow). A counter and a kind line, never paws; nothing is missed and nothing counts down.
//
// The ENTRY of the lazy chunk walk.js fetches inside a window: it re-exports the decor (holidaydecor.js, which it draws with) and adds
// the finds. Pure planning and the pick-up rules follow found outfits (src/foundwear/rules.js): the find comes from its own salted
// stream off the walk's seed (the room seed on a co-walk, so both devices put the same finds on the same spots, and never the walk's
// shared stream), it twinkles from 20 m, chimes within 6 m, is picked up at the golden mouse's distance, never sits within 15 m of the
// spawn and needs no skill. A partner's cat reaching one counts for this child too, as it does for her. The rules' numbers are copied
// here, not imported (this chunk imports no start-up module: see holidaydecor.js); test/holidayfinds.test.js holds them equal.
import './holidayfindwords.js';
import { phrase } from '../clanphrases.js';
import { HOLIDAY_FIND_SPOTS } from './holidayspots.js';
import { KIT, decorSet } from './holidaydecor.js';

export { bind, NEEDS, dress, decorSet, DECOR_PLACES } from './holidaydecor.js';

export const HOLIDAY_FIND_SALT = 0x48f1d5a7;
export const HOLIDAY_FIND_KINDS = Object.freeze({ ornament: 'christmas', dreidel: 'hanukkah', gelt: 'hanukkah' });
export const FINDS_A_WALK = 2;
export const PICKUP = Object.freeze({ r: 1.0, dy: 0.9 });
export const TWINKLE_RANGE = 20;
export const CHIME_RANGE = 6;
export const CHIME_REARM = 10;
export const SPAWN_CLEAR = 15;
const TWINKLE_FULL_AT = 12.5;
const TWINKLE_LIFT = 0.6;
export const WALK_KEY = 'holiday-find'; // the walk log: one find counted this walk
const takenKey = (id) => `hf:${id}`;

// planHolidayFinds({ areaId, set, seed, ... }) -> [{ id, kind, holiday, x, z }]: at most two, or none (the den, the guided first
// walk, a place with no spots, no usable seed, Winter Lights alone). Three draws from the find's own stream, always in this order.
export function planHolidayFinds({ areaId, set, seed, isDen = false, lessonKind = null, spots = HOLIDAY_FIND_SPOTS } = {}) {
  if (isDen || lessonKind === 'first' || !set || (!set.christmas && !set.hanukkah)) return [];
  if (typeof seed !== 'number' || !Number.isFinite(seed)) return [];
  const list = typeof areaId === 'string' && Object.hasOwn(spots, areaId) ? spots[areaId] : null;
  if (!Array.isArray(list) || list.length < 2) return [];
  const r = KIT.mulberry32((seed ^ HOLIDAY_FIND_SALT) >>> 0);
  const i = Math.floor(r() * list.length);
  const j = (i + 1 + Math.floor(r() * (list.length - 1))) % list.length;
  const roll = r();
  const wants = [];
  if (set.christmas) wants.push('ornament');
  if (set.hanukkah) wants.push(roll < 0.5 ? 'dreidel' : 'gelt');
  if (wants.length === 1) wants.push(wants[0] === 'ornament' ? 'ornament' : wants[0] === 'dreidel' ? 'gelt' : 'dreidel');
  return [i, j].slice(0, FINDS_A_WALK).map((at, n) => ({
    id: `hf-${areaId}-${at}`, kind: wants[n], holiday: HOLIDAY_FIND_KINDS[wants[n]], x: list[at][0], z: list[at][1],
  }));
}

const ORNAMENT_COLOURS = [0xc23a3a, 0x2f7a4a, 0x2f5fa8, 0xb48ad8];

// createHolidayFinds(scene, { plan, ground, reducedMotion, onNear }) -> { finds, update(dt, t, frame), arrive(arrival, ctx), restore(log), dispose() }
//   frame { x, z, pawsY, camera, remotes, busy }, the same object found outfits use; update returns the arrival { find, by, petName }
//   (one object, reused) or null.
export function createHolidayFinds(scene, { plan, ground = { y: () => 0 }, reducedMotion = false, onNear = () => {} } = {}) {
  const THREE = KIT.three();
  const finds = [];
  KIT.withLocalUuids(`holiday-finds-${plan[0]?.id ?? 'none'}`, () => {
    for (const p of plan) {
      const kit = KIT.makeKit();
      if (p.kind === 'ornament') KIT.ornament(kit, 0, 0, 0, 0, 1.6, ORNAMENT_COLOURS[Math.abs(Math.round(p.x + p.z)) % ORNAMENT_COLOURS.length]);
      else if (p.kind === 'dreidel') KIT.dreidel(kit, 0, -0.12, 0, 0, 2.4, KIT.BLUE);
      else KIT.gelt(kit, 0, -0.04, 0, 6, 3);
      const group = new THREE.Group();
      for (const m of KIT.meshesOf(kit.solid, kit.glow, 'holidayFind', { reducedMotion: true, sparse: true })) group.add(m);
      const worldY = ground.y(p.x, p.z);
      group.position.set(p.x, worldY + 0.35, p.z);
      const twinkle = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.85, depthWrite: false }));
      twinkle.position.y = TWINKLE_LIFT;
      twinkle.visible = false;
      twinkle.userData.noCast = true;
      group.add(twinkle);
      group.userData.holidayFind = p.id;
      scene.add(group);
      finds.push({ ...p, worldY, group, twinkle, taken: false, armed: true });
    }
  });
  const arrival = { find: null, by: 'me', petName: null };

  function take(f) {
    if (f.taken) return;
    f.taken = true;
    scene.remove(f.group);
    f.group.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.dispose();
      o.material.dispose();
    });
  }

  function update(dt, t, frame) {
    for (const f of finds) {
      if (f.taken) continue;
      const dist = Math.hypot(frame.x - f.x, frame.z - f.z);
      if (dist < TWINKLE_RANGE) {
        f.twinkle.visible = true;
        let floor = 1;
        const cp = frame.camera?.position;
        if (cp) floor = Math.max(1, Math.hypot(cp.x - f.x, cp.y - (f.worldY + 0.35 + TWINKLE_LIFT), cp.z - f.z) / TWINKLE_FULL_AT);
        const s = reducedMotion ? 0 : 0.5 + 0.5 * Math.sin(3.1 * t);
        f.twinkle.scale.setScalar(floor * (0.85 + 0.15 * s));
        f.twinkle.material.opacity = reducedMotion ? 0.85 : 0.6 + 0.35 * s;
      } else f.twinkle.visible = false;
      if (!reducedMotion) {
        f.group.rotation.y = t * 0.8;
        f.group.position.y = f.worldY + 0.35 + Math.sin(t * 2 + f.x) * 0.04;
      }
      if (f.armed && dist < CHIME_RANGE) { f.armed = false; onNear(); } else if (!f.armed && dist > CHIME_REARM) f.armed = true;
      if (!frame.busy && dist < PICKUP.r && Math.abs(frame.pawsY - f.worldY) < PICKUP.dy) return arrive(f, 'me', null);
      const rem = frame.remotes;
      if (rem) {
        for (let i = 0; i < rem.length; i++) {
          const r = rem[i];
          if (r?.water?.placed && r.toPos && Math.hypot(r.toPos.x - f.x, r.toPos.z - f.z) < PICKUP.r) return arrive(f, 'partner', r.petName);
        }
      }
    }
    return null;
  }
  function arrive(f, by, petName) {
    arrival.find = f;
    arrival.by = by;
    arrival.petName = petName;
    return arrival;
  }

  // The find is kept: it leaves the ground, one counts for the walk, and she is told (no paws). Returns true when it wrote to the save
  // or the walk (the caller notes the walk).
  function handle(a, { progression, log, hud, audio, fx, cat, now = new Date() }) {
    const f = a.find;
    if (!f || f.taken || log.count(takenKey(f.id)) > 0) return false;
    take(f);
    log.mark(takenKey(f.id));
    fx?.burst?.(cat?.position, 0xf2c14e, 12);
    const first = log.count(WALK_KEY) === 0;
    log.mark(WALK_KEY);
    let line;
    if (!first) line = phrase('holiday.find.again');
    else {
      const r = progression.recordHolidayFind(f.holiday, now);
      if (!r) return true;
      if (r.earned) {
        audio?.fanfare?.();
        line = f.holiday === 'christmas' ? phrase('holiday.find.done.christmas', phrase('wear.littlegoldstar.name')) : phrase('holiday.find.done.hanukkah', phrase('wear.menorahglow.name'));
      } else if (r.done) line = phrase('holiday.find.kept');
      else line = f.kind === 'ornament' ? phrase('holiday.find.ornament', r.count) : f.kind === 'dreidel' ? phrase('holiday.find.dreidel', r.count) : phrase('holiday.find.gelt', r.count);
    }
    hud.toast(a.by === 'partner' && a.petName ? `${phrase('holiday.find.partner', a.petName)} ${line}` : line);
    return true;
  }

  // A walk picked up again: what was kept is not on the ground.
  function restore(log) { for (const f of finds) if (log.count(takenKey(f.id)) > 0) take(f); }
  function dispose() { for (const f of finds) take(f); }
  return { finds, update, handle, restore, dispose };
}

// holidayFinds(scene, { areaId, pick, seed, now, ... }) -> the walk's finds, or null when it has none (outside a window, Off, no
// spots, the den, the guided first walk).
export function holidayFinds(scene, { areaId, pick = 'auto', seed, now = new Date(), isDen = false, lessonKind = null, ground, reducedMotion = false, onNear } = {}) {
  const plan = planHolidayFinds({ areaId, set: decorSet(pick, now), seed, isDen, lessonKind });
  return plan.length ? createHolidayFinds(scene, { plan, ground, reducedMotion, onNear }) : null;
}
