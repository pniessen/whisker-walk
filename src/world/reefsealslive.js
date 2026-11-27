// =============================================================================
// THE REEF: ITS FRIENDLY SEA LIFE ON A WALK. The seals, the octopuses and the dolphin family (world/reefseals.js is their plans and poses, reefsealsparts.js
// their drawing): four draws (the three soups and the rocks). Everything is a pure function of the clock this life adds up from the walk's own dt and of two
// slow points that lag her; nothing here is a rule, none of it touches what she owns, and none of it ever comes at her. Under reduced motion it is drawn once
// at time zero and stays (an octopus alone still steps back when she comes close, as a still picture: it redraws only when that changes).
// The animals are also photo and journal subjects: `spottable` is the list the walk reads (src/game/photo.js, src/game/interactions.js).
// =============================================================================
import * as THREE from 'three';
import { phrase } from '../clanphrases.js';
import * as S from './reefseals.js';
import * as D from './reefsealsparts.js';
import { reefY, REEF_SPAWN } from './reefplan.js';
import './reeflifewords.js';

// createReefSealsLife({ scene, reducedMotion, tier }) -> { update(dt, t, catPos), dispose(), spottable, counts }
export function createReefSealsLife({ scene, reducedMotion = false, tier = null }) {
  const rung = S.lifeRung(tier);
  const cnt = S.LIFE_COUNT[rung];
  const swimmers = S.SEALS.filter((s) => s.kind === 'swim').slice(0, cnt.swimmers);
  const sleeper = cnt.sleeper ? S.SEALS.find((s) => s.kind === 'sleep') : null;
  const octos = S.OCTOPI.slice(0, cnt.octopuses);
  const dolphins = S.DOLPHINS.slice(0, cnt.dolphins);
  const spawn = { x: REEF_SPAWN.x, z: REEF_SPAWN.z };
  const anchor = { ...spawn }; // the point the seals circle: a slow lag behind her
  const anchor2 = { ...spawn }; // the dolphins' loop's middle: a slower one
  let cat = null;
  let clock = 0;
  let started = false;
  let drawnOnce = false;
  const hides = octos.map(() => 0);
  const pose = {}; const octoPose = { tone: [0, 0, 0] };
  const spottable = [];
  const mk = (type, label, range) => { const e = { type, label, pos: new THREE.Vector3(), range }; spottable.push(e); return e; };
  const sealSpots = swimmers.map(() => mk('rfseal', phrase('reef.life.seal'), 6));
  const sleepSpot = sleeper ? mk('rfseal', phrase('reef.life.seal'), 6) : null;
  const octoSpots = octos.map(() => mk('rfoctopus', phrase('reef.life.octopus'), 6));
  const dolSpots = dolphins.map(() => mk('rfdolphin', phrase('reef.life.dolphin'), 12));

  const seals = new D.Soup(); const octo = new D.Soup(); const dol = new D.Soup(); const rocks = new D.Soup(20000);
  const drawSeals = () => {
    seals.begin();
    swimmers.forEach((s, i) => { S.sealPose(s, clock, anchor, cat, pose); D.drawSeal(seals, s, pose); sealSpots[i].pos.set(pose.x, pose.y, pose.z); });
    if (sleeper) { S.sleeperPose(sleeper, clock, pose); D.drawSeal(seals, sleeper, pose, true); sleepSpot.pos.set(pose.x, pose.y, pose.z); }
  };
  const drawOctos = () => {
    octo.begin();
    octos.forEach((o, i) => {
      S.octopusPose(o, clock, hides[i], octoPose);
      D.drawOctopus(octo, o, octoPose, clock, reefY);
      const m = S.denMouth(o); octoSpots[i].pos.set(m.x, reefY(m.x, m.z) + 0.5, m.z);
    });
  };
  const drawDolphins = () => {
    dol.begin();
    dolphins.forEach((d, i) => { S.dolphinPose(d, clock, anchor2, pose); D.drawDolphin(dol, d, pose, d.role === 'calf'); dolSpots[i].pos.set(pose.x, pose.y, pose.z); });
  };
  drawSeals(); drawOctos(); drawDolphins();
  rocks.begin(); D.drawRocks(rocks, S.OCTOPI, S.SEAL_ROCK, reefY);
  const made = [seals, octo, dol, rocks].map((soup, i) => { soup.fit(); const sm = D.soupMesh(soup, ['reef:seals', 'reef:octopuses', 'reef:dolphins', 'reef:lifeRocks'][i]); scene.add(sm.mesh); return sm; });
  const commit = (i, soup) => { const m = made[i]; m.att.position.needsUpdate = true; m.att.normal.needsUpdate = true; m.att.color.needsUpdate = true; m.geo.setDrawRange(0, soup.k); };
  [seals, octo, dol, rocks].forEach((soup, i) => commit(i, soup));

  const hideTarget = (o) => {
    if (!cat) return 0;
    const m = S.denMouth(o);
    return S.smooth((2.0 - Math.hypot(cat.x - m.x, cat.z - m.z)) / 0.7); // all the way back by 1.3 m, not at all past 2 m
  };
  const counts = { rung, seals: swimmers.length + (sleeper ? 1 : 0), octopuses: octos.length, dolphins: dolphins.length, meshes: 4 };
  return {
    counts,
    spottable,
    update(dt, t, catPos) {
      const d = dt > 0 ? Math.min(dt, 1) : 0;
      if (catPos) cat = catPos;
      if (!started && cat) { started = true; anchor.x = anchor2.x = cat.x; anchor.z = anchor2.z = cat.z; }
      if (reducedMotion) {
        // one picture: drawn once on the first frame she is known, then only the octopus's step back when she is near
        let changed = false;
        octos.forEach((o, i) => { const h = hideTarget(o) > 0.5 ? 1 : 0; if (h !== hides[i]) { hides[i] = h; changed = true; } });
        if (started && !drawnOnce) { drawnOnce = true; drawSeals(); drawDolphins(); drawOctos(); commit(0, seals); commit(2, dol); commit(1, octo); } else if (changed) { drawOctos(); commit(1, octo); }
        return;
      }
      clock += d;
      if (cat) {
        const k1 = 1 - Math.exp(-d / 5); const k2 = 1 - Math.exp(-d / 10);
        anchor.x += (cat.x - anchor.x) * k1; anchor.z += (cat.z - anchor.z) * k1;
        anchor2.x += (cat.x - anchor2.x) * k2; anchor2.z += (cat.z - anchor2.z) * k2;
      }
      const kh = 1 - Math.exp(-d / 0.35);
      octos.forEach((o, i) => { hides[i] += (hideTarget(o) - hides[i]) * kh; });
      drawSeals(); drawOctos(); drawDolphins();
      commit(0, seals); commit(1, octo); commit(2, dol);
      void t;
    },
    dispose() {
      made.forEach((m) => { scene.remove(m.mesh); m.geo.dispose(); m.mat.dispose(); });
    },
  };
}
