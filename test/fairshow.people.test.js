// The Fairground drawn with the people kit (lifelike people, Task 14; spec
// docs/superpowers/specs/2026-11-20-lifelike-people-design.md, "Movement",
// "Behaviour details", "Pairs", "The Fairground's test pins"): createFairShow
// is handed the kit's factory (opts.people, from the fair's pack, as walk.js
// does). Each visitor is the person its look spot gives (a
// pair: the grown-up and the child, the child placed where the simulation has
// it), walking by its own metres walked, saying hello with a wave or a kneel
// (an older person bows), looking at her only when stopped; the juggler is
// dressed by hand at 1.76 m and his hands follow the balls. Their soft bumps
// (rulings R30, R32, R36) are one list, updated in place, that the walk hands
// to player.update, so a cat who runs at a child is stopped by it (R40).
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { canvasStub } from './helpers/growriver.js';

vi.stubGlobal('document', canvasStub);

const { build } = await import('../src/world/fair.js');
const { createFairSim } = await import('../src/fairsim.js');
const { createFairShow } = await import('../src/fairshow.js');
const { VISITOR } = await import('../src/fairvisitors.js');
const { GAME } = await import('../src/fairgames.js');
const { propsFor, frameColliders } = await import('../src/propsets.js');
const { createPeopleKit, bumpCircles, catVolumes } = await import('../src/people/index.js');
const { createPlayer, CAT_RADIUS, isWalkableAt } = await import('../src/player.js');
const { buildCat } = await import('../src/cat/model.js');
const { animateCat } = await import('../src/cat/animator.js');

const DT = 1 / 30;

function builtFair() {
  const scene = new THREE.Scene();
  const area = build(scene);
  for (const f of propsFor('fair').flaps) for (const c of frameColliders(f)) area.colliders.push({ ...c });
  scene.updateMatrixWorld(true);
  return { scene, area };
}

// A show with the kit, a stand-in cat (a head part to look at) and a camera
// that follows her as the walk's does.
function fair({ seed = 'people', strays = 22, reducedMotion = false, lodNear, camera = true, people = createPeopleKit } = {}) {
  const made = builtFair();
  const cam = camera ? new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 300) : null;
  const sim = createFairSim(made.area);
  const show = createFairShow(made.scene, made.area, {
    people, swept: sim.swept, strays, camera: cam, seed, reducedMotion, ...(lodNear ? { lodNear } : {}),
  });
  const cat = new THREE.Group();
  const head = new THREE.Group();
  head.position.set(0, 0.3, -0.3);
  cat.add(head);
  cat.userData.parts = { head };
  made.scene.add(cat);
  const player = { speed: 0, inWater: false };
  const session = { perched: null, pounceTime: 0 };
  const w = { ...made, show, cat, head, player, session, camera: cam, t: 0 };
  w.frame = (dt = DT) => {
    w.t += dt;
    const c = w.cat;
    if (cam) {
      cam.position.set(c.position.x, 2.5, c.position.z + 4.5);
      cam.lookAt(c.position.x, 0.8, c.position.z - 3);
      cam.updateMatrixWorld(true);
    }
    c.updateMatrixWorld(true);
    show.update(dt, w.t, { cat: c, player, session });
  };
  w.run = (s) => { for (let i = 0; i < Math.round(s / DT); i++) w.frame(); };
  return w;
}

const HAND = new THREE.Vector3();
const HEADV = new THREE.Vector3();

describe('the Fairground drawn as lifelike people', () => {
  it('draws each visitor as the person its spot gives: one mesh a person, a pair two, and the juggler at 1.76 m', () => {
    const w = fair();
    const people = w.show.people;
    // eight visitors, three of them pairs (visitors 4, 5 and 8), and the juggler
    expect(people).toHaveLength(12);
    expect(people.filter((p) => p.child).map((p) => p.v.id)).toEqual(['fair-visitor-4', 'fair-visitor-5', 'fair-visitor-8']);
    expect(w.show.groups).toHaveLength(12); // every person gets the walk's contact shadow
    for (const g of w.show.groups) {
      const meshes = [];
      g.traverse((m) => { if (m.isMesh) meshes.push(m); });
      expect(meshes).toHaveLength(1);
      expect(meshes[0].isSkinnedMesh).toBe(true);
      expect(meshes[0].castShadow).toBe(false);
      expect(meshes[0].userData.noCast).toBe(true);
    }
    const jug = people.find((p) => p.juggler);
    expect(jug.person.look.height).toBe(1.76);
    expect(jug.person.look.kind).toBe('adult');
    expect(jug.person.look.sex).toBe('m');
    expect(jug.person.look.top.kind).toBe('tshirt');
    for (const p of people.filter((q) => q.child)) expect(p.person.look.kind).toBe('child');
  });

  it('takes no real Math.random draws of its own: the same count with the people as without', () => {
    const count = (people) => {
      const made = builtFair();
      const real = Math.random;
      let n = 0;
      Math.random = () => { n++; return real(); };
      try { createFairShow(made.scene, made.area, { people, seed: 'draws' }); } finally { Math.random = real; }
      return n;
    };
    expect(count(createPeopleKit)).toBe(count(null));
  });

  it('places each child where the simulation has it, and strides each person by its own metres walked', () => {
    const w = fair({ seed: 'stride' });
    w.cat.position.set(40, 0, -40); // out of everyone's way
    const kids = w.show.people.filter((p) => p.child);
    const own = new Map(kids.map((p) => [p, 0]));
    const last = new Map(kids.map((p) => [p, { x: p.v.childX, z: p.v.childZ }]));
    let walking = 0;
    for (let i = 0; i < 30 * 30; i++) {
      w.frame();
      for (const p of kids) {
        const v = p.v;
        const g = p.person.figure.parent;
        expect(g.position.x).toBe(v.childX);
        expect(g.position.z).toBe(v.childZ);
        expect(g.rotation.y).toBeCloseTo(v.childYaw + Math.PI, 12);
        const l = last.get(p);
        own.set(p, own.get(p) + Math.hypot(v.childX - l.x, v.childZ - l.z));
        l.x = v.childX; l.z = v.childZ;
        expect(p.walked).toBeCloseTo(own.get(p), 9);
        if (p.mode === 'walk') walking++;
      }
      for (const p of w.show.people) {
        if (p.child || p.juggler) continue;
        const g = p.person.figure.parent;
        expect(g.position.x).toBe(p.v.x);
        expect(g.position.z).toBe(p.v.z);
        expect(p.walked).toBe(p.v.walked);
      }
    }
    expect(walking).toBeGreaterThan(0);
    // a child takes more steps than its grown-up for the same way: its own
    // metres, not the grown-up's, drive its stride
    for (const p of kids) expect(Math.abs(p.walked - p.v.walked)).toBeGreaterThan(1e-3);
  }, 60_000);

  it('walks while it moves, and looks at her only when stopped (watching or saying hello), never while walking', () => {
    const w = fair({ seed: 'looks' });
    w.cat.position.set(3.4, 0, 25.5); // on the midway's east side
    let looked = 0;
    let walked = 0;
    for (let i = 0; i < 30 * 60; i++) {
      // now and then she meows: whoever is near says hello
      if (i % 150 === 75) w.show.meow(w.cat.position);
      w.frame();
      for (const p of w.show.people) {
        if (p.juggler) continue;
        // (a hello stops the stride first: no grown-up says hello mid-stride)
        if (!p.child && p.v.hello > 0) expect(p.mode).not.toBe('walk');
        // a child waves only once its grown-up does (after the grown-up's stride has stopped)
        if (p.child && p.mode === 'wave') expect(w.show.people.find((q) => q.v === p.v && !q.child).mode).toBe('wave');
        if (!p.person.inView) continue; // (out of view, no one is posed: their look waits)
        if (p.mode === 'walk') {
          walked++;
          expect(p.gaze.near, `${p.v.id} looks while walking`).toBe(false);
        }
        if (p.gaze.looking) {
          looked++;
          const stopped = p.v.hello > 0 || p.v.mode === 'watch';
          expect(stopped, `${p.v.id} looks while not stopped`).toBe(true);
        }
      }
    }
    expect(walked).toBeGreaterThan(0);
    expect(looked).toBeGreaterThan(0);
  }, 60_000);

  it('the crouch hello is a kneel on one knee (an older person bows), the hand held out low, never within 0.45 m of her middle', () => {
    const w = fair({ seed: 'kneel', camera: false }); // (everyone posed, in view or not)
    const people = w.show.people;
    // a visitor whose hello is the kneel (helloKind 'crouch'), on its own (no child), a grown-up
    const p = people.find((q) => !q.child && !q.juggler && q.v.helloKind === 'crouch' && q.person.look.kind === 'adult' && !q.v.pair);
    expect(p).toBeTruthy();
    // she sits 1.2 m in front of it, where it faces
    w.run(1);
    const v = p.v;
    w.cat.position.set(v.x + Math.sin(v.yaw) * 1.2, 0, v.z + Math.cos(v.yaw) * 1.2);
    w.frame();
    w.show.meow(w.cat.position);
    const modes = new Set();
    let worst = Infinity;
    let low = Infinity;
    for (let i = 0; i < 30 * 2.4; i++) {
      w.frame();
      modes.add(p.mode);
      p.person.bones.handR.getWorldPosition(HAND);
      worst = Math.min(worst, Math.hypot(HAND.x - w.cat.position.x, HAND.z - w.cat.position.z));
      low = Math.min(low, HAND.y);
    }
    expect(modes.has('kneel')).toBe(true);
    expect(modes.has('wave')).toBe(false);
    expect(worst).toBeGreaterThanOrEqual(0.45);
    expect(low).toBeLessThan(0.7); // held out low, at her height
    // and it stands again when the hello is over
    w.run(2);
    expect(p.mode === 'stand' || p.mode === 'walk').toBe(true);
    // an older person never kneels: the hello is a bow (today's spots have
    // no older visitor, so one grown-up is made older for this)
    const older = people.find((q) => q !== p && !q.child && !q.juggler && !q.v.pair);
    older.person.look.kind = 'older';
    older.v.hello = VISITOR.HELLO_TIME;
    older.v.helloKind = 'crouch';
    w.run(0.5);
    expect(older.mode).toBe('bow');
  }, 60_000);

  it('a hello that comes mid-stride stops the stride first: the feet come together, then the wave or the kneel', () => {
    const w = fair({ seed: 'mid-stride' });
    w.cat.position.set(40, 0, -40); // out of everyone's way: they stroll
    w.run(3);
    const walkers = w.show.people.filter((p) => !p.child && !p.juggler && p.mode === 'walk');
    expect(walkers.length).toBeGreaterThan(1);
    for (const p of walkers) {
      w.show.meow({ x: p.v.x, z: p.v.z + 2 });
      const seq = [];
      for (let i = 0; i < 30; i++) { w.frame(); seq.push(p.mode); }
      const first = seq.findIndex((m) => m !== 'walk');
      expect(seq[first], p.v.id).toBe('stand');
      const hello = p.v.helloKind === 'wave' ? 'wave' : 'kneel';
      const at = seq.indexOf(hello);
      expect(at, p.v.id).toBeGreaterThan(first);
      expect((at - first) * DT, p.v.id).toBeGreaterThanOrEqual(0.25);
      for (let k = 1; k < seq.length; k++) expect(seq[k - 1] === 'walk' && seq[k] === hello, p.v.id).toBe(false);
      w.run(3); // the hello over
    }
  }, 60_000);

  it('the juggler juggles: each hand rises and falls with the nearest ball in the cascade', () => {
    const w = fair({ seed: 'juggle' });
    const A = w.area.anchors;
    w.cat.position.set(A.jugglerWatch.x, 0, A.jugglerWatch.z);
    const jug = w.show.people.find((p) => p.juggler);
    const balls = [0, 1, 2].map((i) => w.scene.getObjectByName(`fair-juggle-ball-${i}`));
    const side = { handL: [], handR: [] };
    for (let i = 0; i < 30 * 4; i++) {
      w.frame();
      expect(jug.mode).toBe('juggle');
      if (i < 30) continue; // settled
      for (const name of ['handL', 'handR']) {
        jug.person.bones[name].getWorldPosition(HAND);
        let near = null;
        let best = Infinity;
        for (const b of balls) {
          const d = b.position.distanceTo(HAND);
          if (d < best) { best = d; near = b; }
        }
        side[name].push([HAND.y, near.position.y]);
        // a hand is never through a ball
        for (const b of balls) expect(b.position.distanceTo(HAND)).toBeGreaterThan(GAME.BALL_R * 0.5);
      }
    }
    for (const name of ['handL', 'handR']) {
      const ys = side[name].map((s) => s[0]);
      const bs = side[name].map((s) => s[1]);
      expect(Math.max(...ys) - Math.min(...ys), name).toBeGreaterThan(0.06); // they rise and fall
      // with the nearest ball: their heights go up and down together
      const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
      const my = mean(ys), mb = mean(bs);
      let sxy = 0, sxx = 0, syy = 0;
      for (let k = 0; k < ys.length; k++) { sxy += (ys[k] - my) * (bs[k] - mb); sxx += (ys[k] - my) ** 2; syy += (bs[k] - mb) ** 2; }
      expect(sxy / Math.sqrt(sxx * syy), name).toBeGreaterThan(0.5);
    }
    // reduced motion: the balls hold still, and so do his hands
    const still = fair({ seed: 'juggle', reducedMotion: true });
    still.cat.position.set(A.jugglerWatch.x, 0, A.jugglerWatch.z);
    const sj = still.show.people.find((p) => p.juggler);
    still.run(1.5);
    sj.person.bones.handR.getWorldPosition(HAND);
    const y0 = HAND.y;
    still.run(1);
    sj.person.bones.handR.getWorldPosition(HAND);
    expect(Math.abs(HAND.y - y0)).toBeLessThan(1e-6);
  }, 60_000);

  it('switches near and far at the live rung\'s distance (lodNear), as in town', () => {
    const at = (lodNear) => {
      const w = fair({ seed: 'lod', lodNear, camera: true });
      const jug = w.show.people.find((p) => p.juggler);
      const g = jug.person.figure.parent;
      // she stands 9.5 m in front of him, the camera at her
      const yaw = g.rotation.y - Math.PI;
      w.cat.position.set(g.position.x + Math.sin(yaw) * 9.5, 0, g.position.z + Math.cos(yaw) * 9.5 + 0);
      w.show.update(DT, 1, { cat: w.cat, player: w.player, session: w.session }); // (no camera move)
      w.camera.position.set(w.cat.position.x, 1.6, w.cat.position.z);
      w.camera.lookAt(g.position.x, 1, g.position.z);
      w.camera.updateMatrixWorld(true);
      w.show.update(DT, 1.1, { cat: w.cat, player: w.player, session: w.session });
      return jug.person.detail;
    };
    expect(at(undefined)).toBe('near'); // 12 m
    expect(at(() => 7)).toBe('far'); // the LOW rung and below
  }, 60_000);

  it('the bumps: every person\'s circles, one list updated in place, placed by each person\'s spot and facing', () => {
    const w = fair({ seed: 'bumps' });
    w.cat.position.set(3.4, 0, 25.5);
    const list = w.show.bumps;
    const objs = list.slice();
    const want = w.show.people.reduce((n, p) => n + bumpCircles(p.person.look).length, 0);
    expect(list).toHaveLength(want);
    for (let i = 0; i < 30 * 20; i++) {
      w.frame();
      expect(w.show.bumps).toBe(list);
      // each circle where its person's figure frame puts it
      let k = 0;
      for (const p of w.show.people) {
        const g = p.person.figure.parent;
        g.updateMatrixWorld(true);
        for (const b of bumpCircles(p.person.look)) {
          const c = list[k];
          expect(c).toBe(objs[k]);
          const at = new THREE.Vector3(b.x, 0, b.z).applyMatrix4(g.matrixWorld);
          expect(c.x).toBeCloseTo(at.x, 9);
          expect(c.z).toBeCloseTo(at.z, 9);
          expect(c.r).toBe(b.r);
          k++;
        }
      }
    }
  }, 60_000);

  it('cleans up: dispose() takes every person out of the scene and frees their geometries and skeletons', () => {
    const w = fair({ seed: 'tidy' });
    const count = () => { let n = 0; w.scene.traverse(() => n++); return n; };
    const built = count();
    w.run(1);
    expect(count()).toBe(built); // a frame of play adds nothing
    const spies = [];
    for (const p of w.show.people) {
      spies.push(vi.spyOn(p.person.geometries.near, 'dispose'), vi.spyOn(p.person.geometries.far, 'dispose'), vi.spyOn(p.person.skeleton, 'dispose'));
    }
    const mat = w.show.people[0].person.mesh.material;
    const matSpy = vi.spyOn(mat, 'dispose');
    w.show.dispose();
    for (const s of spies) expect(s).toHaveBeenCalled();
    expect(matSpy).toHaveBeenCalled();
    for (const p of w.show.people) expect(p.person.figure.parent.parent).toBe(null);
  });
});

// R40: a cat who runs at a pair's child faster than it may walk can reach
// it; then its soft bump stops her, as in town. Her real cat, moved at 4 m/s
// towards the child each frame and then put through player.update with the
// show's bumps (the walk's frame order: the player, then the show). Her way
// swings a little to one side and then the other (every 4 s), so she slides
// round the grown-up's circles rather than pressing on them for good when
// the child is behind it. (Without the bumps she ends on top of the child,
// 0.04 m from its middle; head-on it is her head that stops her first.)
describe('a fast cat at a child, with the bumps on', () => {
  it('her middle never comes inside the child\'s bump reach, and her head stays out of every person', () => {
    const w = fair({ seed: 'chased child' });
    const area = w.area;
    w.scene.remove(w.cat);
    const cat = buildCat('tabby');
    w.scene.add(cat);
    const player = createPlayer(new THREE.PerspectiveCamera(), { addEventListener() {} });
    cat.position.set(0, 0, 20);
    player.setAvatar(cat, 3);
    player.enable();
    const runner = { speed: 4, inWater: false }; // what the visitors see: a cat on the move
    const pair = w.show.people.find((p) => p.child && p.v.id === 'fair-visitor-4');
    const v = pair.v;
    const childCircles = (bumps) => {
      // the child's circles in the list: its person's slots
      let k = 0;
      for (const p of w.show.people) {
        const n = bumpCircles(p.person.look).length;
        if (p === pair) return bumps.slice(k, k + n).map((c) => ({ ...c }));
        k += n;
      }
      return [];
    };
    const hr = (() => { cat.updateMatrixWorld(true); return catVolumes(cat).headFlat; })();
    let reached = Infinity;
    let worstMiddle = Infinity;
    let worstHead = Infinity;
    let sway = 0; // her head's largest move in one frame's animation, on the ground
    let t = 0;
    for (let i = 0; i < 30 * 300; i++) {
      t += DT;
      const dx = v.childX - cat.position.x;
      const dz = v.childZ - cat.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.05) {
        const sg = Math.floor(i / 120) % 2 ? 1 : -1;
        const ux = dx / d - (sg * 0.35 * dz) / d;
        const uz = dz / d + (sg * 0.35 * dx) / d;
        const ul = Math.hypot(ux, uz);
        const s = Math.min(d, 4 * DT);
        const nx = cat.position.x + (ux / ul) * s;
        const nz = cat.position.z + (uz / ul) * s;
        if (isWalkableAt(area, nx, nz)) { cat.position.x = nx; cat.position.z = nz; }
        cat.rotation.y = Math.atan2(-dx, -dz);
      }
      const used = w.show.bumps;
      const kid = childCircles(used);
      const all = used.map((c) => ({ ...c }));
      player.update(DT, area.colliders, area.bounds, area.waters, used);
      // (where the push left her head, before this frame's animation moves it)
      cat.updateMatrixWorld(true);
      HEADV.copy(catVolumes(cat).head.center);
      animateCat(cat, 'follow', t, 4, false);
      cat.updateMatrixWorld(true);
      const head = catVolumes(cat).head.center;
      sway = Math.max(sway, Math.hypot(head.x - HEADV.x, head.z - HEADV.z));
      for (const c of kid) {
        const m = Math.hypot(cat.position.x - c.x, cat.position.z - c.z) - (c.r + CAT_RADIUS);
        const hd = Math.hypot(head.x - c.x, head.z - c.z) - (c.r + hr);
        worstMiddle = Math.min(worstMiddle, m);
        reached = Math.min(reached, m, hd);
      }
      for (const c of all) worstHead = Math.min(worstHead, Math.hypot(head.x - c.x, head.z - c.z) - (c.r + hr));
      w.show.update(DT, t, { cat, player: runner, session: w.session });
    }
    expect(reached).toBeLessThan(0.03); // she did run up against the child (her middle or her head)
    expect(worstMiddle).toBeGreaterThanOrEqual(-1e-6);
    // her head: the frame's animation does not move it on the ground (sway
    // 0: so the push's own result is what is measured), and player.update
    // pushes it out of each circle once, in order: wedged between two
    // people's circles (the grown-up's back-foot circle and its child's body,
    // side by side), the later push can leave it a little inside the
    // earlier (ruling R42). How far depends on how she comes into the wedge:
    // 9.6 mm (frame 1206) before the visitors' calm steps (final review,
    // finding 1), 19.8 mm now (frame 8171, three frames past 15 mm in the
    // five minutes); 5 mm to spare. (A second pass in player.update would
    // close it, but R42 keeps the single pass: it would move town's pinned
    // touch timings.)
    expect(sway).toBe(0);
    expect(worstHead).toBeGreaterThanOrEqual(-0.025);
  }, 90_000);
});

// R41: with the people, a visitor saying hello holds still, and her soft bump
// keeps her off it, as in town. Her real cat walks straight at a visitor who
// kneels to say hello (a grown-up, visitor 2) and at one who bows (visitor 6,
// made older for this: today's spots have no older visitor), head-on and from
// 45 degrees either side, at 0.3, 1 and 3 m/s: the figure never moves while it
// holds, its arms and legs (their centre lines, every 0.02 m, as the town's
// touch tests measure the arm) stay 5 mm or more outside her head and body,
// and her head and middle stay out of the people's circles.
const LIMB = new THREE.Vector3();
const LA = new THREE.Vector3();
const LB = new THREE.Vector3();
const SEG = new THREE.Vector3();
function limbClearance(p, vol) {
  const B = p.bones;
  const d = p.look.dims;
  p.figure.updateMatrixWorld(true);
  const segDist = (pt) => {
    SEG.subVectors(vol.body.b, vol.body.a);
    const k = Math.max(0, Math.min(1, LIMB.copy(pt).sub(vol.body.a).dot(SEG) / SEG.lengthSq()));
    return SEG.multiplyScalar(k).add(vol.body.a).distanceTo(pt) - vol.body.r;
  };
  let worst = Infinity;
  const chains = [
    [B.upperArmL, B.forearmL, B.handL, [0, -d.hand * 0.96, 0]], [B.upperArmR, B.forearmR, B.handR, [0, -d.hand * 0.96, 0]],
    [B.thighL, B.shinL, B.footL, [0, 0, -0.74 * d.footLen]], [B.thighR, B.shinR, B.footR, [0, 0, -0.74 * d.footLen]],
  ];
  const tip = new THREE.Vector3();
  for (const [a, b, c, end] of chains) {
    const pts = [a, b, c];
    c.localToWorld(tip.set(end[0], end[1], end[2]));
    for (let i = 0; i < 3; i++) {
      pts[i].getWorldPosition(LA);
      if (i < 2) pts[i + 1].getWorldPosition(LB); else LB.copy(tip);
      const n = Math.max(1, Math.ceil(LA.distanceTo(LB) / 0.02));
      for (let k = 0; k <= n; k++) {
        const pt = new THREE.Vector3().lerpVectors(LA, LB, k / n);
        worst = Math.min(worst, pt.distanceTo(vol.head.center) - vol.head.radius, segDist(pt));
      }
    }
  }
  return worst;
}

const OLDER_AT = { x: 100 + 5 * 7.3, z: 200 + 5 * 3.1 }; // visitor 6's look spot
const withOlder = (opts) => {
  const k = createPeopleKit(opts);
  const build = k.buildSpot;
  k.buildSpot = (def) => build(Math.abs(def.x - OLDER_AT.x) < 1e-9 && Math.abs(def.z - OLDER_AT.z) < 1e-9 ? { ...def, kind: 'older' } : def);
  return k;
};

function approach({ speed, angle, older }) {
  const w = fair({ seed: 'kneel', camera: false, people: older ? withOlder : createPeopleKit });
  const area = w.area;
  w.scene.remove(w.cat);
  const cat = buildCat('tabby');
  w.scene.add(cat);
  const player = createPlayer(new THREE.PerspectiveCamera(), { addEventListener() {} });
  cat.position.set(40, 0, -40);
  player.setAvatar(cat, 3);
  player.enable();
  const runner = { speed, inWater: false };
  const still = { speed: 0, inWater: false };
  let t = 0;
  const step = (who) => { t += DT; cat.updateMatrixWorld(true); w.show.update(DT, t, { cat, player: who, session: w.session }); };
  for (let i = 0; i < 30; i++) step(still);
  const id = older ? 'fair-visitor-6' : 'fair-visitor-2';
  const p = w.show.people.find((q) => q.v.id === id);
  expect(p.person.look.kind).toBe(older ? 'older' : 'adult');
  const v = p.v;
  // she stops 1.3 m off, round from where it faces by `angle`, and meows
  const a = v.yaw + angle;
  cat.position.set(v.x + Math.sin(a) * 1.3, 0, v.z + Math.cos(a) * 1.3);
  cat.rotation.y = Math.atan2(-(v.x - cat.position.x), -(v.z - cat.position.z));
  step(still);
  w.show.meow(cat.position);
  const hr = (() => { cat.updateMatrixWorld(true); return catVolumes(cat).headFlat; })();
  const res = { moved: 0, holding: 0, limbs: Infinity, middle: Infinity, head: Infinity, reached: Infinity, modes: new Set() };
  let lx = p.group.position.x, lz = p.group.position.z;
  for (let i = 0; i < 30 * 3.6; i++) {
    t += DT;
    // she walks straight at its middle
    const dx = v.x - cat.position.x, dz = v.z - cat.position.z, d = Math.hypot(dx, dz);
    if (d > 0.05) {
      const s = Math.min(d, speed * DT);
      cat.position.x += (dx / d) * s; cat.position.z += (dz / d) * s;
      cat.rotation.y = Math.atan2(-dx, -dz);
    }
    const used = w.show.bumps.map((c) => ({ ...c }));
    player.update(DT, area.colliders, area.bounds, area.waters, w.show.bumps);
    animateCat(cat, 'follow', t, speed, false);
    cat.updateMatrixWorld(true);
    const head = catVolumes(cat).head.center;
    for (const c of used) {
      const m = Math.hypot(cat.position.x - c.x, cat.position.z - c.z) - (c.r + CAT_RADIUS);
      const h = Math.hypot(head.x - c.x, head.z - c.z) - (c.r + hr);
      res.middle = Math.min(res.middle, m);
      res.head = Math.min(res.head, h);
      res.reached = Math.min(res.reached, m, h);
    }
    t -= DT;
    step(runner);
    res.modes.add(p.mode);
    const gx = p.group.position.x, gz = p.group.position.z;
    if (p.mode === 'kneel' || p.mode === 'bow' || v.holdT > 0) {
      res.holding++;
      res.moved = Math.max(res.moved, Math.hypot(gx - lx, gz - lz));
    }
    lx = gx; lz = gz;
    cat.updateMatrixWorld(true);
    res.limbs = Math.min(res.limbs, limbClearance(p.person, catVolumes(cat)));
  }
  // she walks off; once she is KEEP away it goes on its way, smoothly (no jump)
  res.after = 0;
  const ox = cat.position.x - v.x, oz = cat.position.z - v.z, ol = Math.hypot(ox, oz) || 1;
  cat.rotation.y = Math.atan2(-ox, -oz) + Math.PI;
  for (let i = 0; i < 30 * 4; i++) {
    cat.position.x += (ox / ol) * 1 * DT; cat.position.z += (oz / ol) * 1 * DT;
    step({ speed: 1, inWater: false });
    res.after = Math.max(res.after, Math.hypot(p.group.position.x - lx, p.group.position.z - lz));
    lx = p.group.position.x; lz = p.group.position.z;
  }
  return res;
}

describe('allocates nothing per frame', () => {
  it('a few hundred frames of the show with the people, a hello among them: no Vector3, Quaternion, Matrix4, Euler or Color cloned', () => {
    const w = fair({ seed: 'alloc' });
    w.scene.remove(w.cat);
    const cat = buildCat('tabby'); // a real cat: her volumes for the held hand
    w.scene.add(cat);
    w.cat = cat;
    cat.position.set(3.4, 0, 25.5);
    w.run(2);
    w.show.meow(cat.position); // (a fresh scratch state per hello is made here, once)
    w.run(0.5);
    const spies = [THREE.Vector3, THREE.Quaternion, THREE.Matrix4, THREE.Euler, THREE.Color].map((C) => vi.spyOn(C.prototype, 'clone'));
    try {
      for (let i = 0; i < 300; i++) {
        cat.updateMatrixWorld(true);
        w.frame();
      }
      for (const sp of spies) expect(sp).not.toHaveBeenCalled();
    } finally {
      for (const sp of spies) sp.mockRestore();
    }
  }, 60_000);
});

describe('a hello holds still (ruling R41)', () => {
  for (const older of [false, true]) {
    for (const speed of [0.3, 1, 3]) {
      for (const angle of [0, Math.PI / 4, -Math.PI / 4]) {
        it(`${older ? 'a bow' : 'a kneel'}: she walks at it at ${speed} m/s from ${Math.round((angle * 180) / Math.PI)} degrees`, () => {
          const r = approach({ speed, angle, older });
          expect(r.modes.has(older ? 'bow' : 'kneel')).toBe(true);
          expect(r.holding).toBeGreaterThan(60);
          expect(r.moved).toBe(0); // it never moves while it holds
          expect(r.limbs).toBeGreaterThanOrEqual(0.005); // its arms and legs never in her
          expect(r.middle).toBeGreaterThanOrEqual(-1e-6); // her middle out of every circle
          expect(r.head).toBeGreaterThanOrEqual(-0.01); // and her head (the frame's animation moves it ~1 cm after the push)
          expect(r.reached).toBeLessThan(0.03); // she did come up against it
          // and when she walks off it goes on its way at a walk, never a jump
          expect(r.after).toBeLessThan((VISITOR.WALK * 1.15 + VISITOR.SIDE_SPEED) * DT + 1e-9);
        }, 60_000);
      }
    }
  }
});
