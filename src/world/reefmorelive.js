// =============================================================================
// THE REEF: SEVEN MORE FRIENDLY SEA CREATURES ON A WALK. Jellyfish, clownfish, seahorses, mantas, a whale and her calf, moray eels and squid (world/reefmore.js is
// their plans and poses, reefmoreparts.js their drawing): four draws (the jellyfish, the swimmers, the creatures that hold or hide, and the eels' rocks). Everything
// is a pure function of the clock this life adds up from the walk's own dt; nothing here is a rule, none of it touches what she owns, and none of it comes at her.
// Under reduced motion it is drawn once and stays (the whale where it is over the Deep). The low rungs keep fewer of each and redraw every other frame.
// The animals are also photo and journal subjects: `spottable` is the list the walk reads (src/game/photo.js, src/game/interactions.js).
// =============================================================================
import * as THREE from 'three';
import { phrase } from '../clanphrases.js';
import * as M from './reefmore.js';
import * as D from './reefmoreparts.js';
import { reefY } from './reefplan.js';
import { tube, ellipsoid, bodyMatrix } from './reefsealsparts.js';
import { ST } from './reefstages.js';
import './reeflifewords.js';

// createReefMoreLife({ scene, reducedMotion, tier }) -> { update(dt, t, catPos), dispose(), spottable, counts }
export function createReefMoreLife({ scene, reducedMotion = false, tier = null }) {
  const rung = M.lifeRung(tier);
  const cnt = M.MORE_COUNT[rung];
  const jellies = M.JELLIES.slice(0, cnt.jellies);
  const clowns = M.CLOWNS.slice(0, cnt.clowns * 2);
  const horses = M.HORSES.slice(0, cnt.horses);
  const mantas = M.MANTAS.slice(0, cnt.mantas);
  const eels = M.EEL_DENS.slice(0, cnt.eels);
  const squids = M.SQUIDS.slice(0, cnt.squid);
  let clock = 0;
  let frame = 0;
  const pose = { tone: [0, 0, 0] }; const eelP = {};
  const spottable = [];
  const mk = (type, label, range) => { const e = { type, label, pos: new THREE.Vector3(), range }; spottable.push(e); return e; };
  const jellySpots = jellies.map(() => mk('rfjelly', phrase('reef.life.jelly'), 8));
  const clownSpots = clowns.filter((f) => f.id % 2 === 0).map(() => mk('rfclown', phrase('reef.life.clown'), 5));
  const horseSpots = horses.map(() => mk('rfhorse', phrase('reef.life.horse'), 5));
  const mantaSpots = mantas.map(() => mk('rfmanta', phrase('reef.life.manta'), 14));
  const whaleSpot = mk('rfwhale', phrase('reef.life.whale'), 24);
  const eelSpots = eels.map(() => mk('rfmoray', phrase('reef.life.moray'), 6));
  const squidSpots = squids.map(() => mk('rfsquid', phrase('reef.life.squid'), 10));

  const drawEel = ST.ride.makeEel({ tube, ellipsoid, bodyMatrix, eelSpine: M.eelSpine }); // (the moray's drawing is the ride stage's)
  const jel = new D.Soup(30000); const swim = new D.Soup(30000); const pin = new D.Soup(30000); const rocks = new D.Soup(12000);
  const drawJellies = () => {
    jel.begin();
    jellies.forEach((j, i) => { M.jellyPose(j, clock, pose); D.drawJelly(jel, j, pose); jellySpots[i].pos.set(pose.x, pose.y, pose.z); });
  };
  const drawSwimmers = () => {
    swim.begin();
    mantas.forEach((m, i) => { M.mantaPose(m, clock, pose); D.drawManta(swim, m, pose); mantaSpots[i].pos.set(pose.x, pose.y, pose.z); });
    const wt = reducedMotion ? M.WHALE_PASS : clock; // (reduced motion: the whale is over the Deep)
    M.whalePose(false, wt, pose); D.drawWhale(swim, null, pose); whaleSpot.pos.set(pose.x, pose.y, pose.z);
    if (cnt.calf) { M.whalePose(true, wt, pose); D.drawWhale(swim, null, pose); }
    squids.forEach((q, i) => { M.squidPose(q, clock, pose); D.drawSquid(swim, q, pose, clock); squidSpots[i].pos.set(pose.x, pose.y, pose.z); });
  };
  const drawPinned = () => {
    pin.begin();
    let c = 0;
    clowns.forEach((f) => { M.clownPose(f, clock, pose); D.drawClown(pin, f, pose); if (f.id % 2 === 0) clownSpots[c++].pos.set(pose.x, pose.y, pose.z); });
    horses.forEach((h, i) => { M.horsePose(h, clock, pose); D.drawHorse(pin, h, pose); horseSpots[i].pos.set(pose.x, pose.y + 0.2, pose.z); });
    eels.forEach((e, i) => {
      M.eelPose(e, clock, eelP); drawEel(pin, e, eelP, reefY, clock, rung);
      eelSpots[i].pos.set(e.x + Math.sin(e.yaw) * 0.9, reefY(e.x, e.z) + 0.7, e.z + Math.cos(e.yaw) * 0.9);
    });
  };
  drawJellies(); drawSwimmers(); drawPinned();
  rocks.begin(); D.drawRocks(rocks, eels, null, reefY);
  const soups = [jel, swim, pin, rocks];
  const names = ['reef:jellies', 'reef:swimmers', 'reef:hiders', 'reef:eelRocks'];
  const made = soups.map((soup, i) => { soup.fit(); const sm = D.moreMesh(soup, names[i], i === 0); scene.add(sm.mesh); return sm; });
  const commit = (i) => { const m = made[i]; m.att.position.needsUpdate = true; m.att.normal.needsUpdate = true; m.att.color.needsUpdate = true; m.geo.setDrawRange(0, soups[i].k); };
  soups.forEach((_, i) => commit(i));

  const counts = { rung, jellies: jellies.length, clownfish: clowns.length, horses: horses.length, mantas: mantas.length, whales: 1 + cnt.calf, eels: eels.length, squid: squids.length, meshes: 4 };
  return {
    counts,
    spottable,
    update(dt) {
      if (reducedMotion) return; // one picture, drawn once above
      clock += dt > 0 ? Math.min(dt, 1) : 0;
      if (rung !== 'high' && (frame++ & 1)) return; // (the low rungs draw every other frame)
      drawJellies(); drawSwimmers(); drawPinned();
      commit(0); commit(1); commit(2);
    },
    dispose() {
      made.forEach((m) => { scene.remove(m.mesh); m.geo.dispose(); m.mat.dispose(); });
    },
  };
}
