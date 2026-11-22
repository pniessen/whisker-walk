import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { canvasStub } from './helpers/growriver.js';

// The Old House step 4, Task 6 (plan rulings W12, W13; Review Focus 2 and 3): a
// co-walk in the house. A partner is seen anywhere in it by her name over the
// walls (her tag drawn with no depth test, late), and the six discoveries watch
// every cat on the walk: a find either child makes pays this child too (the
// log's own once-a-walk rule), the bookcase opens on this screen for her,
// swinging away from the cat who opened it, and the clock strikes only when it
// is not already striking. The hall's front door opens for her too. A partner
// is a remote entry as remotecats.js makes it ({ group, tag, h }), handed in
// through the session (main.js's fifth argument to the area's life).

// The headless document stub every world test uses (test/flattrace.test.js's).
vi.stubGlobal('document', canvasStub);

const { build } = await import('../src/world/house.js');
const { HOUSE_TAG_ORDER } = await import('../src/world/houselife.js');
const { FIND_KEY, PIANO_SCALE } = await import('../src/world/housefinds.js');
const { HOUSE_FINDS } = await import('../src/world/housethings.js');
const {
  HOUSE_ROOMS, HOUSE_LEDGES, SECRET_BOOKCASE, SECRET_OPEN_ROT_Y, SECRET_STAIR_ROT_Y, secretColliders, houseFloorGround,
} = await import('../src/world/houseplan.js');
const { endsFor } = await import('../src/gateways.js');
const { createDiscoveryLog } = await import('../src/discoveries.js');

const DT = 1 / 60;
const B = SECRET_BOOKCASE;
const FIND = Object.fromEntries(HOUSE_FINDS.map((f) => [f.id, f]));
const ledge = (id) => HOUSE_LEDGES.find((l) => l.id === id);
const floor = houseFloorGround();
const centre = (r) => ({ x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 });

function recorder(names) {
  const calls = Object.fromEntries(names.map((n) => [n, []]));
  const o = { calls };
  for (const n of names) o[n] = (...a) => { calls[n].push(a); };
  return o;
}

// A built house (with its door home) and its life, a real discovery log whose awardOnce
// calls are noted, stand-in audio, my cat a point and partners remote entries.
function setup({ now = () => new Date(2026, 10, 21, 15, 0), partners = 1, session: noSession = false } = {}) {
  const scene = new THREE.Scene();
  const record = build(scene, { gateEnds: endsFor('house') });
  const paid = { points: 0 };
  const real = createDiscoveryLog({ addPoints: (n) => { paid.points += n; }, recordFeat() {} });
  real.startWalk();
  const awards = [];
  const log = {
    awardOnce: (...a) => { awards.push(a); return real.awardOnce(...a); },
    count: (k) => real.count(k),
  };
  const audio = recorder(['playTune', 'musicBoxNote', 'purr', 'tick', 'creak']);
  const life = record.life({ scene, reducedMotion: false, log, audio, toy: null, dusk: false, now });
  const list = [];
  for (let i = 0; i < partners; i++) {
    const group = new THREE.Group();
    const tag = new THREE.Sprite(new THREE.SpriteMaterial());
    tag.renderOrder = 10;
    group.add(tag);
    scene.add(group);
    list.push({ group, tag, h: 0 });
  }
  const session = noSession ? undefined : { remotes: { list } };
  const cat = new THREE.Vector3();
  const camera = new THREE.PerspectiveCamera();
  let t = 0;
  const put = (o, x, z, y) => o.set(x, y ?? floor.y(x, z), z);
  const me = (x, z, y) => {
    put(cat, x, z, y);
    camera.position.set(cat.x, cat.y + 2.2, cat.z + 3.4);
    camera.lookAt(cat);
  };
  const her = (i, x, z, y) => put(list[i].group.position, x, z, y);
  const frame = () => { t += DT; life.update(DT, t, cat, camera, session); };
  const frames = (seconds) => { for (let i = 0; i < Math.round(seconds / DT); i++) frame(); };
  me(0, 9.5);
  frame(); // the first frame settles
  return { scene, record, life, finds: life.finds, log, real, awards, paid, audio, list, session, cat, camera, me, her, frame, frames };
}
const paidFor = (s, id) => s.awards.filter((a) => a[1] === FIND_KEY(id)).length;

describe('the house on a co-walk', () => {
  it('the number', () => {
    expect(HOUSE_TAG_ORDER).toBe(20);
  });

  it('a partner standing at the bookcase opens it on this screen too, swinging away from her', () => {
    for (const [z, ROT, row] of [[1.0, SECRET_OPEN_ROT_Y, secretColliders(true)], [3.0, SECRET_STAIR_ROT_Y, secretColliders(true, 'stair')]]) {
      const s = setup();
      const pivot = s.record.house.secret.group;
      s.her(0, -6, z);
      s.frames(B.holdS + 2 * DT);
      expect(s.finds.open, `z ${z}`).toBe(true);
      expect(paidFor(s, 'bookcase')).toBe(1);
      expect(s.real.count(FIND_KEY('bookcase'))).toBe(1);
      expect(s.paid.points).toBe(12);
      s.frames(B.openS + 0.2);
      expect(pivot.rotation.y, `z ${z}`).toBe(ROT);
      expect(s.record.colliders.filter((c) => c.secret)).toEqual(row);
      s.life.dispose();
    }
  }, 90_000);

  it('a find a partner makes pays this child too, once', () => {
    const s = setup();
    const c = FIND.cushion;
    // the partner still on the cushion for 1.5 s: the pay and a softer purr than hers
    s.her(0, c.x, c.z);
    s.frames(1.4);
    expect(s.audio.calls.purr).toHaveLength(0);
    s.frames(0.2);
    expect(s.audio.calls.purr).toEqual([[0.6]]);
    expect(s.real.count(FIND_KEY('cushion'))).toBe(1);
    expect(s.paid.points).toBe(12);
    // on the window seat's ledge
    const w = ledge('attic-seat');
    s.her(0, (w.minX + w.maxX) / 2, (w.minZ + w.maxZ) / 2, w.y);
    s.frame();
    expect(s.real.count(FIND_KEY('window'))).toBe(1);
    expect(s.paid.points).toBe(24);
    // walking six keys of the piano, west to east: six notes and the tune
    const k = ledge('parlour-keys');
    const kz = (k.minZ + k.maxZ) / 2;
    const kw = (k.maxX - k.minX) / 8;
    for (let i = 0; i < 6; i++) { s.her(0, k.minX + (i + 0.5) * kw, kz, k.y); s.frames(0.1); }
    expect(s.audio.calls.musicBoxNote.map((a) => a[0])).toEqual(PIANO_SCALE.slice(0, 6));
    expect(s.real.count(FIND_KEY('piano'))).toBe(1);
    expect(s.paid.points).toBe(36);
    // and each again pays nothing more
    s.her(0, c.x + 3, c.z); s.frames(0.2);
    s.her(0, c.x, c.z); s.frames(1.6);
    expect(s.audio.calls.purr).toHaveLength(2);
    s.her(0, (w.minX + w.maxX) / 2, (w.minZ + w.maxZ) / 2, w.y); s.frame();
    s.her(0, k.minX - 1, kz + 1); s.frame();
    for (let i = 0; i < 8; i++) { s.her(0, k.minX + (i + 0.5) * kw, kz, k.y); s.frames(0.1); }
    expect(s.paid.points).toBe(36);
    for (const id of ['cushion', 'window', 'piano']) expect(s.real.count(FIND_KEY(id)), id).toBe(1);
    s.life.dispose();
  }, 90_000);

  // Review Focus 2
  it('two cats at the bookcase at once open it once, and it stays open', () => {
    const s = setup();
    const pivot = s.record.house.secret.group;
    // she from the stair side, the partner from the library side, on the same frames
    s.me(-6, 1.0);
    s.her(0, -6, 3.0);
    const seen = [];
    for (let i = 0; i < Math.round((B.holdS + B.openS + 1) / DT); i++) { s.frame(); seen.push(pivot.rotation.y); }
    expect(paidFor(s, 'bookcase')).toBe(1);
    expect(s.finds.open).toBe(true);
    // one swing: away from the first cat whose hold completed (hers, into the library), never back
    expect(seen[seen.length - 1]).toBe(SECRET_OPEN_ROT_Y);
    for (let i = 1; i < seen.length; i++) expect(Math.abs(seen[i]) + 1e-12).toBeGreaterThanOrEqual(Math.abs(seen[i - 1]));
    // both walk off and back: it stays open, nothing more paid
    s.me(0, 9.5); s.her(0, 0, 8); s.frames(2);
    s.me(-6, 1.0); s.her(0, -6, 3.0); s.frames(2);
    expect(s.finds.open).toBe(true);
    expect(pivot.rotation.y).toBe(SECRET_OPEN_ROT_Y);
    expect(paidFor(s, 'bookcase')).toBe(1);
    s.life.dispose();
  }, 90_000);

  it('two cats at the clock\'s foot hear one strike, and one more once both have walked off and come back', () => {
    const s = setup(); // 15:00: three bongs, 1.1 s apart
    const c = FIND.clock;
    const LASTS = 3 * 1.1 + 1.0;
    s.me(c.x, c.z);
    s.her(0, c.x + 0.3, c.z + 0.3);
    s.frames(1.0 + 2 * DT);
    expect(s.audio.calls.playTune).toHaveLength(1);
    expect(s.finds.striking).toBe(true);
    s.frames(LASTS - 0.2);
    expect(s.finds.striking).toBe(true);
    s.frames(0.3);
    expect(s.finds.striking).toBe(false);
    expect(s.audio.calls.playTune).toHaveLength(1);
    // both walk off and come back
    s.me(c.x + 4, c.z + 4); s.her(0, c.x + 4, c.z + 5); s.frames(0.3);
    s.me(c.x, c.z); s.her(0, c.x + 0.3, c.z + 0.3); s.frames(1.2);
    expect(s.audio.calls.playTune).toHaveLength(2);
    expect(paidFor(s, 'clock')).toBe(2); // asked twice, paid once (the log's rule)
    expect(s.real.count(FIND_KEY('clock'))).toBe(1);
    s.life.dispose();
  }, 90_000);

  it('the strike is guarded: none starts while one is striking', () => {
    const s = setup();
    const c = FIND.clock;
    s.me(c.x, c.z);
    s.her(0, c.x + 4, c.z + 4);
    s.frames(1.1);
    expect(s.audio.calls.playTune).toHaveLength(1);
    // the partner comes to its foot while it strikes: no second strike over the first
    s.her(0, c.x + 0.3, c.z + 0.3);
    s.frames(1.2);
    expect(s.finds.striking).toBe(true);
    expect(s.audio.calls.playTune).toHaveLength(1);
    s.life.dispose();
  }, 90_000);

  it('her name shows over the walls wherever she is in the house', () => {
    const s = setup();
    const { tag, group } = s.list[0];
    for (const room of HOUSE_ROOMS) {
      for (const mine of HOUSE_ROOMS) {
        if (mine === room) continue;
        const a = centre(room), b = centre(mine);
        s.her(0, a.x, a.z);
        s.me(b.x, b.z);
        s.frame();
        const at = `${room.id}, me in ${mine.id}`;
        expect(tag.visible, at).toBe(true);
        expect(tag.material.depthTest, at).toBe(false);
        expect(tag.renderOrder, at).toBe(HOUSE_TAG_ORDER);
        expect(group.visible, at).toBe(true);
      }
    }
    s.life.dispose();
  }, 90_000);

  // Review Focus 3
  it('a partner who leaves is no longer watched, and the tags are as they were after the walk', () => {
    const s = setup({ partners: 2 });
    s.her(0, 0, 8);
    s.her(1, 2, 8);
    s.frame();
    expect(s.finds.watching).toBe(3);
    const [gone, stays] = s.list;
    s.session.remotes.list = [stays];
    s.frame();
    expect(s.finds.watching).toBe(2);
    s.session.remotes.list = [];
    s.frame();
    expect(s.finds.watching).toBe(1);
    // her later moves (her group, still about) pay nothing
    const c = FIND.cushion;
    gone.group.position.set(c.x, floor.y(c.x, c.z), c.z);
    s.frames(2);
    expect(s.audio.calls.purr).toHaveLength(0);
    expect(s.paid.points).toBe(0);
    s.life.dispose();
    for (const e of [gone, stays]) {
      expect(e.tag.material.depthTest).toBe(true);
      expect(e.tag.renderOrder).toBe(10);
    }
  }, 90_000);

  it('the hall\'s door opens for a partner too', () => {
    const s = setup();
    s.me(0, 5);
    s.her(0, 0, 5);
    s.frames(0.5);
    expect(s.life.frontDoorOpen).toBe(false);
    s.her(0, 0, 10.0);
    s.frames(0.5);
    expect(s.life.frontDoorOpen).toBe(true);
    s.her(0, 0, 5);
    s.frames(0.5);
    expect(s.life.frontDoorOpen).toBe(false);
    s.life.dispose();
  }, 90_000);

  it('a solo walk is as it was', () => {
    // no session at all, and a session with no remotes
    for (const session of [undefined, {}]) {
      const s = setup({ partners: 0, session: true });
      const c = FIND.cushion;
      s.me(c.x, c.z);
      for (let i = 0; i < 100; i++) s.life.update(DT, 1 + i * DT, s.cat, s.camera, session);
      expect(s.finds.watching).toBe(1);
      expect(s.audio.calls.purr).toEqual([[1.2]]);
      s.life.dispose();
    }
    // an unchanged list makes no watcher after the first frame
    const s = setup({ partners: 2 });
    s.her(0, 0, 8);
    s.her(1, 2, 8);
    s.frame();
    const made = s.finds.watchersMade;
    expect(made).toBe(3);
    for (let i = 0; i < 600; i++) s.finds.update(DT, 10 + i * DT, s.cat, s.camera.position, s.session.remotes.list);
    expect(s.finds.watchersMade).toBe(made);
    expect(s.finds.watching).toBe(3);
    s.life.dispose();
  }, 90_000);

  it('it draws on no stream', () => {
    const s = setup({ partners: 2 });
    const spy = vi.spyOn(Math, 'random');
    try {
      const c = FIND.clock;
      for (let i = 0; i < 600; i++) {
        const k = i / 600;
        s.me(c.x, c.z);
        s.her(0, -6, 1.0 + 2 * k);
        s.her(1, 8.7 + k, 9 + k);
        s.frame();
      }
      expect(spy).toHaveBeenCalledTimes(0);
    } finally {
      spy.mockRestore();
    }
    s.life.dispose();
  }, 90_000);
});
