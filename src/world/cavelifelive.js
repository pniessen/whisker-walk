// =============================================================================
// THE CRYSTAL CAVE: ITS FRIENDLY LIFE ON A WALK (layer 4). The cave fish, the bats, the fireflies, the moths, the salamander, the beetles and the crab (world/cavelife.js is
// their plans and poses, cavelifeparts.js their drawing): three draws (the lit soup, the glow soup and the fireflies' points). Everything is a pure function of the clock
// this life adds up from the walk's own dt; none of it looks at her, comes at her, blocks her or touches what she owns. Under reduced motion it is drawn once at time zero.
// The creatures are also photo and journal subjects: `spottable` is the list the walk reads (src/game/photo.js, src/game/interactions.js), one entry for each kind of
// creature (a school, a colony, a cloud) is enough to count: the walk awards once a kind a walk.
// =============================================================================
import * as THREE from 'three';
import { phrase } from '../clanphrases.js';
import * as L from './cavelife.js';
import * as D from './cavelifeparts.js';
import './cavelifewords.js';

// createCaveLife({ scene, reducedMotion, tier }) -> { update(dt, t, catPos), dispose(), spottable, counts }
export function createCaveLife({ scene, reducedMotion = false, tier = null }) {
  const rung = L.lifeRung(tier);
  const N = L.LIFE_COUNT[rung];
  let clock = 0;
  const pose = {};
  const spottable = [];
  const mk = (type, label, range = L.KIND_RANGE[type]) => { const e = { type, label, pos: new THREE.Vector3(), range }; spottable.push(e); return e; };
  const sp = {
    fish: Array.from({ length: Math.min(N.fish, 3) }, () => mk('clfish', phrase('cave.life.fish'))),
    hang: Array.from({ length: N.hang }, () => mk('clbat', phrase('cave.life.bat'))),
    fly: Array.from({ length: N.fly }, () => mk('clbat', phrase('cave.life.bat'), 14)), // (a flyer is spotted from farther: it is up high)
    cloud: Array.from({ length: L.CLOUDS }, () => mk('clfirefly', phrase('cave.life.firefly'))),
    moth: Array.from({ length: N.moth }, () => mk('clmoth', phrase('cave.life.moth'))),
    sal: mk('clsalamander', phrase('cave.life.salamander')),
    beetle: Array.from({ length: N.beetle }, () => mk('clbeetle', phrase('cave.life.beetle'))),
    crab: mk('clcrab', phrase('cave.life.crab')),
  };
  const lit = new D.Soup(); const glow = new D.Soup();
  const fire = D.makeFireflies(scene, N.fire);
  const clouds = L.cloudCentres();
  const draw = () => {
    lit.begin(); glow.begin();
    for (let i = 0; i < N.fish; i++) { L.fishPose(i, clock, pose); D.drawFish(glow, pose); if (i < sp.fish.length) sp.fish[i].pos.set(pose.x, pose.y, pose.z); }
    for (let i = 0; i < N.hang; i++) { L.hangPose(i, clock, pose); D.drawHangingBat(lit, pose); sp.hang[i].pos.set(pose.x, pose.y - 0.3, pose.z); }
    for (let i = 0; i < N.fly; i++) { L.flyPose(i, clock, pose); D.drawFlyingBat(lit, pose); sp.fly[i].pos.set(pose.x, pose.y, pose.z); }
    for (let i = 0; i < N.moth; i++) { L.mothPose(i, clock, pose); D.drawMoth(glow, pose); sp.moth[i].pos.set(pose.x, pose.y, pose.z); }
    for (let i = 0; i < N.beetle; i++) { L.beetlePose(i, clock, pose); D.drawBeetle(glow, pose); sp.beetle[i].pos.set(pose.x, pose.y, pose.z); }
    if (N.sal) { L.salamanderPose(clock, pose); D.drawSalamander(lit, pose); sp.sal.pos.set(pose.x, pose.y + 0.1, pose.z); }
    if (N.crab) { L.crabPose(clock, pose); D.drawCrab(lit, pose); sp.crab.pos.set(pose.x, pose.y + 0.1, pose.z); }
    for (let i = 0; i < N.fire; i++) { L.firePos(i, clock, pose); fire.set(i, pose.x, pose.y, pose.z, pose.glow); }
    fire.commit();
  };
  clouds.forEach((c, i) => sp.cloud[i].pos.set(c.x, 1.2, c.z));
  draw();
  lit.fit(); glow.fit();
  const made = [D.soupMesh(lit, 'crystal:lifeLit', true), D.soupMesh(glow, 'crystal:lifeGlow', false)];
  made.forEach((m) => scene.add(m.mesh));
  const soups = [lit, glow];
  const commit = () => made.forEach((m, i) => { m.att.position.needsUpdate = true; m.att.normal.needsUpdate = true; m.att.color.needsUpdate = true; m.geo.setDrawRange(0, soups[i].k); });
  commit();
  return {
    rung,
    spottable,
    counts: { rung, ...N, meshes: 3, triangles: (lit.k + glow.k) / 3 },
    update(dt) {
      if (reducedMotion) return; // drawn once at time zero
      clock += dt > 0 ? Math.min(dt, 1) : 0;
      draw(); commit();
    },
    dispose() { made.forEach((m) => { scene.remove(m.mesh); m.geo.dispose(); m.mat.dispose(); }); fire.dispose(); },
  };
}
