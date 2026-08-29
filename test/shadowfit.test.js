import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { lightBasis, snapToTexelGrid, fitCentre, createShadowFit } from '../src/render/shadowfit.js';
import { resolveQuality } from '../src/render/quality.js';

// render/shadowfit.js touches no DOM and no WebGL — it only ever reads and
// writes plain THREE object transforms — so unlike the world tests this file
// needs no canvas stub at all. That is deliberate on the module's side: the
// hard part of this item (the texel snap) is pure arithmetic, and pure
// arithmetic is what a test can actually pin.

// The game's own sun vector and tiers, so a change to either trips these cases
// rather than leaving them proving something about numbers nobody ships.
const SUN = new THREE.Vector3(-36, 15, -24);
const HIGH = resolveQuality({ coarse: false, reducedMotion: false, override: 'high' });
const LOW = resolveQuality({ coarse: false, reducedMotion: false, override: 'low' });

const fakeSun = () => {
  const sun = new THREE.DirectionalLight(0xfff2d8, 3);
  sun.position.copy(SUN);
  return sun;
};

// main.js's camera, aimed the way player.js aims it: from behind the cat, down
// at its shoulders (see catcam.js's cameraOffset). `aim` re-points an existing
// camera rather than making a new one, because the rig closes over the camera
// object it was handed — moving that same object is exactly what the render
// loop does between frames.
const aim = (cam, catX, catZ, yaw) => {
  const back = 4.5 * Math.cos(0.18), height = 2.2 + 4.5 * Math.sin(0.18) * 0.9;
  cam.position.set(catX + Math.sin(yaw) * back, height, catZ + Math.cos(yaw) * back);
  cam.lookAt(catX, 0.6, catZ);
  return cam;
};
const chaseCamera = (catX = 0, catZ = 0, yaw = 0) =>
  aim(new THREE.PerspectiveCamera(70, 1000 / 580, 0.1, 300), catX, catZ, yaw);

describe('lightBasis', () => {
  it('is orthonormal', () => {
    const b = lightBasis(SUN.clone().normalize());
    for (const v of [b.x, b.y, b.z]) expect(v.length()).toBeCloseTo(1, 12);
    expect(b.x.dot(b.y)).toBeCloseTo(0, 12);
    expect(b.y.dot(b.z)).toBeCloseTo(0, 12);
    expect(b.z.dot(b.x)).toBeCloseTo(0, 12);
  });

  // THE CASE THAT MATTERS. The snap is only a snap if it rounds against the
  // same grid three rasterises the shadow map on, and three builds that grid
  // from Object3D.lookAt on the shadow camera. Agreeing "in spirit" is not
  // enough — a basis that differs by a sign or a handedness would still be
  // orthonormal, would still round to whole numbers, and would shimmer exactly
  // as badly as no snapping at all. So this compares against the real
  // Matrix4.lookAt three itself calls, not against a re-derivation.
  it('reproduces the basis THREE.Matrix4.lookAt gives the shadow camera', () => {
    const direction = SUN.clone().normalize();
    const target = new THREE.Vector3(3, 0, -7);              // any fit centre
    const eye = target.clone().addScaledVector(direction, 80); // the light, backed off
    // Matrix4.lookAt(eye, target, up) is precisely what Object3D.lookAt runs
    // for a camera, with the shadow camera's default up of world +Y.
    const m = new THREE.Matrix4().lookAt(eye, target, new THREE.Vector3(0, 1, 0));
    const cx = new THREE.Vector3(), cy = new THREE.Vector3(), cz = new THREE.Vector3();
    m.extractBasis(cx, cy, cz);

    const b = lightBasis(direction);
    for (const [ours, theirs] of [[b.x, cx], [b.y, cy], [b.z, cz]]) {
      expect(ours.x).toBeCloseTo(theirs.x, 12);
      expect(ours.y).toBeCloseTo(theirs.y, 12);
      expect(ours.z).toBeCloseTo(theirs.z, 12);
    }
  });

  it('falls back to a usable basis for a sun straight overhead instead of returning NaN', () => {
    const b = lightBasis(new THREE.Vector3(0, 1, 0));
    for (const v of [b.x, b.y, b.z]) {
      expect(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)).toBe(true);
      expect(v.length()).toBeCloseTo(1, 12);
    }
  });
});

describe('snapToTexelGrid', () => {
  const basis = lightBasis(SUN.clone().normalize());
  const texel = (2 * HIGH.shadowFitRadius) / HIGH.shadowMapSize; // 0.01953125 m

  const lateral = (p) => [p.dot(basis.x), p.dot(basis.y)];

  it('lands both lateral components on whole texel multiples', () => {
    const out = snapToTexelGrid(new THREE.Vector3(7.3137, 0, -12.9481), basis, texel);
    for (const c of lateral(out)) {
      expect(Math.abs(c / texel - Math.round(c / texel))).toBeLessThan(1e-9);
    }
  });

  it('leaves the depth component exactly alone', () => {
    // Depth is compared as a continuous value, never bucketed, so rounding it
    // would buy nothing and would add a wobble of its own.
    const p = new THREE.Vector3(7.3137, 1.75, -12.9481);
    expect(snapToTexelGrid(p, basis, texel).dot(basis.z)).toBeCloseTo(p.dot(basis.z), 12);
  });

  it('is idempotent — snapping an already-snapped point is a no-op', () => {
    const once = snapToTexelGrid(new THREE.Vector3(-4.11, 0, 31.7), basis, texel);
    const twice = snapToTexelGrid(once, basis, texel);
    expect(twice.distanceTo(once)).toBeLessThan(1e-9);
  });

  it('never moves a point by more than half a texel diagonal', () => {
    // The bound matters: the snap is only acceptable because the error it
    // introduces is smaller than the thing it is quantising to. Half a texel on
    // each of two axes is the worst case.
    const worst = Math.hypot(texel / 2, texel / 2) + 1e-9;
    for (let i = 0; i < 200; i++) {
      const p = new THREE.Vector3((i * 7.31) % 55 - 27, 0, (i * 13.77) % 55 - 27);
      expect(snapToTexelGrid(p, basis, texel).distanceTo(p)).toBeLessThanOrEqual(worst);
    }
  });

  // THE ANTI-SHIMMER PROPERTY, stated directly. Every centre inside one texel
  // cell must produce the SAME snapped point — that identity is the whole
  // reason shadow edges stop crawling, because it means a walking player leaves
  // the shadow map's grid standing still in world space between the moments it
  // steps a whole texel. Without the snap these 40 sub-texel offsets would give
  // 40 different answers.
  it('gives one identical answer for every sub-texel offset within a cell', () => {
    const base = snapToTexelGrid(new THREE.Vector3(2.5, 0, 6.25), basis, texel);
    const answers = new Set();
    for (let i = 0; i < 40; i++) {
      const drift = base.clone()
        .addScaledVector(basis.x, (i / 40 - 0.5) * texel * 0.98)
        .addScaledVector(basis.y, ((i * 7) % 40 / 40 - 0.5) * texel * 0.98);
      const s = snapToTexelGrid(drift, basis, texel);
      answers.add(`${s.x.toFixed(9)},${s.y.toFixed(9)},${s.z.toFixed(9)}`);
    }
    expect(answers.size).toBe(1);
  });
});

describe('fitCentre', () => {
  it('sits `lead` metres in front of the camera, flattened to the ground', () => {
    const cam = chaseCamera(0, 0, 0); // cat at the origin, camera at +z looking -z
    const c = fitCentre(cam, 15);
    expect(c.y).toBe(0);
    expect(c.x).toBeCloseTo(cam.position.x, 6);
    expect(c.z).toBeCloseTo(cam.position.z - 15, 6);
  });

  it('follows the camera’s yaw', () => {
    const c = fitCentre(chaseCamera(0, 0, Math.PI / 2), 15); // looking down -x
    expect(c.x).toBeCloseTo(chaseCamera(0, 0, Math.PI / 2).position.x - 15, 6);
    expect(c.z).toBeCloseTo(0, 6);
  });

  it('degrades to the camera’s own ground position rather than NaN when it looks straight down', () => {
    const cam = new THREE.PerspectiveCamera(70, 1.7, 0.1, 300);
    cam.position.set(4, 20, -9);
    cam.lookAt(4, 0, -9);
    const c = fitCentre(cam, 15);
    expect(c.x).toBeCloseTo(4, 6);
    expect(c.z).toBeCloseTo(-9, 6);
    expect(Number.isNaN(c.x) || Number.isNaN(c.z)).toBe(false);
  });
});

describe('createShadowFit', () => {
  it('tightens the frustum to the tier’s radius and sizes the map from the tier', () => {
    const sun = fakeSun();
    createShadowFit(sun, chaseCamera(), { radius: HIGH.shadowFitRadius, mapSize: HIGH.shadowMapSize });
    const c = sun.shadow.camera;
    expect([c.left, c.right, c.bottom, c.top]).toEqual([-20, 20, -20, 20]);
    expect(sun.shadow.mapSize.x).toBe(2048);
    expect(sun.shadow.mapSize.y).toBe(2048);
    expect(sun.castShadow).toBe(true);
  });

  // normalBias is derived from the texel rather than hardcoded, because what it
  // hides is the depth error across one texel. Two tiers, one line, two
  // correctly-sized offsets — and the high tier's is now SMALLER than the flat
  // 0.02 the fixed camera used, which is what lets a contact shadow actually
  // touch its object at the grazing sun angle this pass introduced.
  it('scales normalBias with the texel, so each tier gets its own', () => {
    const high = fakeSun(), low = fakeSun();
    createShadowFit(high, chaseCamera(), { radius: HIGH.shadowFitRadius, mapSize: HIGH.shadowMapSize });
    createShadowFit(low, chaseCamera(), { radius: LOW.shadowFitRadius, mapSize: LOW.shadowMapSize });
    expect(high.shadow.normalBias).toBeCloseTo((40 / 2048) * 0.7, 9);
    expect(low.shadow.normalBias).toBeCloseTo((40 / 1024) * 0.7, 9);
    expect(low.shadow.normalBias).toBeCloseTo(high.shadow.normalBias * 2, 9);
    expect(high.shadow.normalBias).toBeLessThan(0.02); // the old flat value
  });

  it('fits on construction, so the walk’s first frame is not centred on the world origin', () => {
    const sun = fakeSun();
    createShadowFit(sun, chaseCamera(0, 45), { radius: 20, mapSize: 2048 });
    // The cat spawns at (0, 45) in the neighbourhood; a rig that only fitted on
    // the first update() would aim 45m away for one frame.
    expect(sun.target.position.z).toBeGreaterThan(20);
  });

  it('keeps the light direction fixed while it moves the light', () => {
    const sun = fakeSun();
    const cam = chaseCamera();
    const rig = createShadowFit(sun, cam, { radius: 20, mapSize: 2048 });
    const want = SUN.clone().normalize();
    for (const [x, z, yaw] of [[0, 0, 0], [12, -30, 1.1], [-40, 18, -2.4]]) {
      aim(cam, x, z, yaw);
      rig.update();
      const got = sun.position.clone().sub(sun.target.position).normalize();
      expect(got.angleTo(want)).toBeLessThan(1e-9);
    }
  });

  // The plan's own requirement: the frustum has to actually contain what it is
  // there to shadow. The cat's immediate surroundings are the part that must
  // never fall out — the contact shadow under the player is the single thing
  // this whole item exists to make legible — so the assertion is on a generous
  // volume around the cat rather than on the full view frustum, which no
  // 40-unit box could ever hold.
  it('always contains an 8m sphere around the cat, at every yaw', () => {
    const basis = lightBasis(SUN.clone().normalize());
    for (let i = 0; i < 16; i++) {
      const yaw = (i / 16) * Math.PI * 2;
      const catX = 6, catZ = -11;
      const sun = fakeSun();
      const rig = createShadowFit(sun, chaseCamera(catX, catZ, yaw), { radius: 20, mapSize: 2048 });
      rig.update();
      const centre = sun.target.position;
      for (let j = 0; j < 24; j++) {
        const a = (j / 24) * Math.PI * 2;
        for (const h of [0, 1.5, 3]) {
          const p = new THREE.Vector3(catX + Math.cos(a) * 8, h, catZ + Math.sin(a) * 8).sub(centre);
          expect(Math.abs(p.dot(basis.x)), `yaw ${i} ring ${j} h ${h}`).toBeLessThanOrEqual(20);
          expect(Math.abs(p.dot(basis.y))).toBeLessThanOrEqual(20);
        }
      }
    }
  });

  // The end-to-end version of the snap property, through the real rig: a player
  // creeping forward by a fraction of a texel must leave the light EXACTLY
  // where it was. Anything else and the shadow map re-quantises every frame,
  // which is the crawl. Measured in verify-lighting.html the same way — with
  // the camera held still and only the fit centre drifting, consecutive frames
  // come back pixel-for-pixel identical with the snap and differ by ~0.75% of
  // the frame without it.
  it('holds the shadow map’s grid still through sub-texel camera movement', () => {
    const texel = 40 / 2048;
    const basis = lightBasis(SUN.clone().normalize());
    const sun = fakeSun();
    const cam = chaseCamera(0, 0);
    const rig = createShadowFit(sun, cam, { radius: 20, mapSize: 2048 });
    const lateral = new Set(), depth = new Set();
    for (let i = 0; i < 8; i++) {
      // An eighth of a texel per step, so eight steps cover exactly one texel.
      aim(cam, 0, i * texel / 8, 0);
      rig.update();
      const t = sun.target.position;
      lateral.add(`${t.dot(basis.x).toFixed(9)},${t.dot(basis.y).toFixed(9)}`);
      depth.add(t.dot(basis.z).toFixed(9));
    }
    // The assertion is in LIGHT SPACE, and only on the two lateral axes,
    // because those are the only two the texel grid is quantised on. However
    // the cell boundaries happen to fall across a one-texel run, the map can
    // land in at most two grid positions — where a rig without the snap would
    // give eight, one per frame, which is exactly the crawl.
    expect(lateral.size).toBeLessThanOrEqual(2);
    // The depth axis is deliberately NOT snapped and does move every frame. It
    // is asserted here rather than left implicit so that a future "fix" that
    // quantises it too has to argue with a test instead of with a comment:
    // sliding the ortho camera along its own view axis translates nothing in
    // the rendered map, so rounding it would be pure superstition.
    expect(depth.size).toBe(8);
  });

  it('exposes the { update, dispose } shape the session’s other rigs use', () => {
    const rig = createShadowFit(fakeSun(), chaseCamera(), { radius: 20, mapSize: 2048 });
    expect(typeof rig.update).toBe('function');
    expect(typeof rig.dispose).toBe('function');
    expect(() => rig.dispose()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// A fully-built rig that nothing calls is this wave's characteristic failure,
// and the shadow fit is exactly the shape that fails that way: the game would
// still render, still cast shadows, and simply keep them nailed to the world
// origin for the whole walk. game/walk.js and main.js cannot be imported here
// (they pull in the entire render stack), so the wiring is asserted against the
// source text — the same technique test/docks.test.js uses for the AREAS map,
// for the same reason.
// ---------------------------------------------------------------------------
describe('the shadow fit and the hemisphere fill are actually wired up', () => {
  const walkSrc = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');
  const mainSrc = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

  // THE KEY LIGHT'S TWO TUNED NUMBERS, pinned against walk.js's own source.
  //
  // Elevation and intensity were calibrated together in Wave 1.3 and are the
  // pair the whole surface table (materials.js) and the normal-map strengths
  // (textures.js's normalScale) are calibrated AGAINST — materials.test.js
  // argues its gloss band from sin(19.1) vs cos(19.1) by name. AZIMUTH is not
  // pinned here and deliberately so: it was retuned after Wave 1 (see the
  // block above SUN_POSITION in walk.js) and is the one of the three that is
  // free to move, because nothing else in the renderer is calibrated against
  // a compass bearing.
  //
  // So the assertion is: the sun may travel around its CONE, never up or down
  // it. That is exactly the constraint the azimuth retune had to respect, and
  // it is one line of arithmetic to check and impossible to eyeball from three
  // signed integers.
  it('keeps the sun on its calibrated cone — 19.1 degrees elevation, intensity 3.0', () => {
    const position = walkSrc.match(/^const SUN_POSITION = \[(-?[\d.]+), (-?[\d.]+), (-?[\d.]+)\];$/m);
    expect(position).not.toBeNull();
    const [x, y, z] = position.slice(1, 4).map(Number);
    const elevation = (Math.atan2(y, Math.hypot(x, z)) * 180) / Math.PI;
    expect(elevation).toBeCloseTo(19.12, 2);
    expect(walkSrc).toMatch(/^const SUN_INTENSITY = 3\.0;$/m);
  });

  it('builds the rig from the tier’s own knobs, not from literals', () => {
    expect(walkSrc).toMatch(/createShadowFit\(sun, camera, \{\s*radius: tier\.shadowFitRadius,\s*mapSize: tier\.shadowMapSize,\s*\}\)/);
  });

  it('hangs it on the session and drives it once a frame from the render loop', () => {
    expect(walkSrc).toMatch(/^\s*shadows,$/m);   // the session entry
    expect(mainSrc).toContain('session.shadows.update()');
    expect(walkSrc).toContain('session.shadows.dispose()');
  });

  it('re-fits AFTER player.update has moved the camera, and before the frame is drawn', () => {
    // The rig reads the camera. Called before player.update it would fit the
    // box to where the player was last frame, which is a whole frame of lag on
    // the one thing that is supposed to follow the player exactly.
    const move = mainSrc.indexOf('player.update(dt,');
    const fit = mainSrc.indexOf('session.shadows.update()');
    const draw = mainSrc.lastIndexOf('renderFrame();');
    expect(move).toBeGreaterThan(-1);
    expect(fit).toBeGreaterThan(move);
    expect(draw).toBeGreaterThan(fit);
  });

  it('replaces the AmbientLight with a HemisphereLight taking the area’s own bounce', () => {
    // Matched on the constructor CALL, not the word — the prose above the
    // hemisphere light explains at length what an AmbientLight was doing wrong,
    // and that explanation should survive.
    expect(walkSrc).not.toMatch(/new THREE\.AmbientLight\(/);
    expect(walkSrc).toMatch(/new THREE\.HemisphereLight\(\s*HEMI_SKY,\s*areaData\.groundBounce \?\? DEFAULT_GROUND_BOUNCE,\s*HEMI_INTENSITY,\s*\)/);
  });

  it('adds the fill AFTER the world is built, because only areaData knows the bounce', () => {
    const build = walkSrc.indexOf('.build(scene, { water:');
    const hemi = walkSrc.indexOf('new THREE.HemisphereLight(');
    expect(build).toBeGreaterThan(-1);
    expect(hemi).toBeGreaterThan(build);
  });

  it('leaves toneMappingExposure alone — that boundary belongs to game/composer.js', () => {
    // The grazing sun was the obvious thing to pay for out of exposure, and it
    // is the wrong purse: composer.js owns the ACES exposure and Night Eyes
    // multiplies it, so a trim here would have quietly re-tuned the dusk skill
    // too. Again matched on an ASSIGNMENT, since two comments in walk.js
    // discuss the boundary and should keep doing so.
    expect(walkSrc).not.toMatch(/toneMappingExposure\s*[*/+-]?=/);
  });
});
