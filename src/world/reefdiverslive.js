// =============================================================================
// THE REEF: THE DIVERS, THE RESEARCH SHIP AND THE BIG SPOTTED SHARK ON A WALK (milestone R18; the plans are world/reefdivers.js, the drawing reefdiversparts.js).
// Three draws: the divers and the shark (vertex-coloured soups rewritten as the clock runs) and the ship (written once; the whole mesh bobs a hand's breadth). Nothing here
// is a rule: none of it touches what she owns, none of it has a collider, nothing comes at her (the divers ease aside when she is close; the shark's loop stays beyond the
// north edge). The animals are photo and journal subjects through `spottable` (src/game/photo.js, src/game/interactions.js).
// Reduced motion: the divers and the shark keep one picture (the shark in the north-east); a diver still raises a hand when she is near, with no to-and-fro; the ship
// does not bob. The low rungs keep two divers, fewer spots on the shark, a smoother-less hull, and redraw every other frame. Draws no random number, reads no clock but dt.
// =============================================================================
import { phrase } from '../clanphrases.js';
import * as V from './reefdivers.js';
import { useKit, drawDiver, drawShark, drawVessel } from './reefdiversparts.js';
import './reefdiverswords.js';

// The kit is the Reef's main chunk's own pieces, in this order: [Soup, moreMesh, tube, ellipsoid, paddle, bodyMatrix, reefY] (this stage imports none of them: a stage must not split that chunk).
// createReefDiversLive(kit, { scene, Vec3, reducedMotion, tier, say }) -> { update(dt, t, catPos), dispose(), spottable, counts }
export function createReefDiversLive(kit, { scene, Vec3, reducedMotion = false, tier = null, say = null }) {
  const [Soup, moreMesh, tube, ellipsoid, paddle, bodyMatrix, reefY] = kit;
  useKit({ tube, ellipsoid, paddle, bodyMatrix }); V.useGround(reefY);
  const rung = tier && tier.shadows === false ? 'lite' : tier && (tier.name === 'low' || (tier.rung ?? 0) >= 3) ? 'low' : 'high'; // (reefseals.js lifeRung)
  const divers = V.DIVERS.slice(0, V.DIVER_COUNT[rung]);
  const dots = rung === 'high' ? 18 : 12;
  const vec = () => (Vec3 ? new Vec3() : { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } });
  const spot = (type, label, range) => ({ type, label, pos: vec(), range });
  const diverSpots = divers.map(() => spot('rfdivers', phrase('reef.life.divers'), 8));
  const vesselSpot = spot('rfvessel', phrase('reef.life.vessel'), V.VESSEL.range);
  vesselSpot.pos.set(V.VESSEL.x, 8.6, V.VESSEL.z);
  const sharkSpot = spot('rfwhaleshark', phrase('reef.life.whaleshark'), V.SHARK.range);

  const diverSoup = new Soup(24000); const sharkSoup = new Soup(24000); const shipSoup = new Soup(24000);
  const pose = { swing: reducedMotion ? 0 : 1 }; const sp = {};
  const waves = divers.map(() => 0); let lastWaves = null;
  let clock = 0; let frame = 0; let told = false;
  let cat = null;

  const drawDivers = () => {
    diverSoup.begin();
    divers.forEach((d, i) => { V.diverPose(d, reducedMotion ? 0 : clock, cat, pose); waves[i] = pose.wave; drawDiver(diverSoup, pose); diverSpots[i].pos.set(pose.x, pose.y, pose.z); });
  };
  const drawSharkNow = () => {
    sharkSoup.begin();
    V.sharkPose(reducedMotion ? V.SHARK_STILL : clock, sp);
    drawShark(sharkSoup, sp, dots);
    sharkSpot.pos.set(sp.x, sp.y, sp.z);
  };
  drawDivers(); drawSharkNow();
  shipSoup.begin(); drawVessel(shipSoup, rung === 'high' ? 14 : 10);
  const soups = [diverSoup, sharkSoup, shipSoup];
  const names = ['reef:divers', 'reef:bigshark', 'reef:ship'];
  const made = soups.map((soup, i) => { soup.fit(); const sm = moreMesh(soup, names[i]); scene.add(sm.mesh); return sm; });
  const commit = (i) => { const m = made[i]; m.att.position.needsUpdate = true; m.att.normal.needsUpdate = true; m.att.color.needsUpdate = true; m.geo.setDrawRange(0, soups[i].k); };
  soups.forEach((_, i) => commit(i));
  lastWaves = waves.slice();

  return {
    counts: { rung, divers: divers.length, dots, meshes: 3 },
    spottable: [...diverSpots, vesselSpot, sharkSpot],
    update(dt, t, catPos) {
      cat = catPos ? { x: catPos.x, z: catPos.z } : null;
      if (!reducedMotion) clock += dt > 0 ? Math.min(dt, 1) : 0;
      if (!reducedMotion) made[2].mesh.position.y = 0.1 * Math.sin(0.6 * clock);
      if (say && !told && waves.some((w) => w > 0.6)) { told = true; say(phrase('reef.divers.hello')); }
      void t;
      if (reducedMotion) { // one picture; only a diver's raised hand follows her
        drawDivers();
        if (waves.some((w, i) => Math.abs(w - lastWaves[i]) > 0.03)) { lastWaves = waves.slice(); commit(0); }
        return;
      }
      if (rung !== 'high' && (frame++ & 1)) return; // (the low rungs draw every other frame)
      drawDivers(); drawSharkNow();
      commit(0); commit(1);
    },
    dispose() { made.forEach((m) => { scene.remove(m.mesh); m.geo.dispose(); m.mat.dispose(); }); },
  };
}
