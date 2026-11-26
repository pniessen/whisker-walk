// The Reef, milestone R1: the float. A held kick rises at 1.2 m/s eased over 0.2 s and stops at 2.2 m; letting go sinks at 0.6 m/s; below 0.3 m she walks the
// sand, above it she paddles; it reaches the draw, the camera (60 percent, 4.0 m, a floor), the golden-mouse window and a partner's lift, and nothing
// else; it is never saved, never written to perchY, and cleared on a perch, a nap, a lift and the walk's end. Every other place has no float at all.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createPlayer } from '../src/player.js';
import { placeFloat, placePace } from '../src/placephysics.js';
import { createReefGround, reefY, REEF_BOUNDS } from '../src/world/reefplan.js';
import { avatarBaseY, FLOAT_PADDLE } from '../src/game/avatar.js';
import { liftForState } from '../src/remotecats.js';
import { stepPad, createPadState, PAD_BUTTONS } from '../src/gamepadinput.js';
import { createGoldMice, GOLD_MICE } from '../src/goldmice.js';
import { waterPose } from '../src/cat/waterlook.js';

const DT = 1 / 60;
function rig({ place = 'reef', x = 0, z = 36 } = {}) {
  const camera = new THREE.PerspectiveCamera();
  const player = createPlayer(camera, null, { headless: true });
  const cat = new THREE.Group();
  const ground = createReefGround();
  cat.position.set(x, ground.y(x, z), z);
  player.setAvatar(cat, placePace(3.5, place));
  player.setFloat(placeFloat(place));
  player.setGround(ground);
  player.enable();
  const run = (secs) => { for (let i = 0; i < Math.round(secs / DT); i++) player.update(DT, [], REEF_BOUNDS, []); };
  return { camera, player, cat, ground, run };
}

describe('the float', () => {
  it('a held kick rises, eased: slow in the first frames, 1.2 m/s once settled, and stops at 2.2 m', () => {
    const { player, run } = rig();
    expect(player.canFloat).toBe(true);
    player.setKick(true);
    run(0.1);
    expect(player.floatY).toBeGreaterThan(0);
    expect(player.floatY).toBeLessThan(0.1); // eased over 0.2 s: nowhere near 1.2 m/s * 0.1 s... a full-speed start would be 0.12
    const a = player.floatY;
    run(0.5);
    expect((player.floatY - a) / 0.5).toBeGreaterThan(0.85); // still easing up to speed
    const b = player.floatY;
    run(0.5);
    const rate = (player.floatY - b) / 0.5; // settled
    expect(rate).toBeGreaterThan(1.15);
    expect(rate).toBeLessThanOrEqual(1.2 + 1e-9);
    run(3);
    expect(player.floatY).toBe(2.2);
    run(1);
    expect(player.floatY).toBe(2.2); // never above
  });
  it('letting go sinks at 0.6 m/s (eased) and she lands on the sand, never below it', () => {
    const { player, run } = rig();
    player.setKick(true); run(4); player.setKick(false);
    run(1);
    const at1 = player.floatY;
    expect(at1).toBeGreaterThan(1.4); expect(at1).toBeLessThan(1.75); // 2.2 - 0.6 * ~0.9
    run(5);
    expect(player.floatY).toBe(0);
    run(1);
    expect(player.floatY).toBe(0);
  });
  it('the keyboard\'s Space is the held kick: read from the held keys, nothing in the pounce path', () => {
    const src = readFileSync('src/player.js', 'utf8');
    expect(src).toMatch(/keys\.has\('Space'\)/);
    expect(readFileSync('src/game/interactions.js', 'utf8')).toMatch(/if \(player\.canFloat\) return;/); // no pounce hop under the sea
  });
  it('below 0.3 m she walks the sand, above it she paddles (the swim pose); the pose map only changes the water poses', () => {
    expect(FLOAT_PADDLE).toBe(0.3);
    const swim = { mode: 'swim', shake: 0, sink: 0 };
    for (const pose of ['follow', 'stalk']) expect(waterPose(pose, swim)).toBe('swim');
    expect(waterPose('pounce', swim)).toBe('pounce');
    expect(readFileSync('src/game/avatar.js', 'utf8')).toMatch(/floating \? FLOAT_STATE : ws/);
  });
  it('another place has no float row: the kick does nothing there, and no place but the Reef has a row', () => {
    for (const place of ['seaside', 'moon', 'neighborhood']) {
      const { player, run } = rig({ place });
      expect(player.canFloat, place).toBe(false);
      player.setKick(true); run(2);
      expect(player.floatY, place).toBe(0);
    }
  });
  it('is cleared by clearFloat, by a new walk (setAvatar), and while perched; it is only a getter', () => {
    const { player, cat, run } = rig();
    player.setKick(true); run(2);
    expect(player.floatY).toBeGreaterThan(1);
    player.clearFloat();
    expect(player.floatY).toBe(0);
    player.setKick(true); run(1);
    player.setAvatar(cat, 3);
    expect(player.floatY).toBe(0);
    expect(player.canFloat).toBe(false); // the new walk sets its own row
    player.setFloat(placeFloat('reef'));
    player.setKick(true); run(1);
    player.perchY = 0.7; // perched: never lifted off a perch
    run(0.1);
    expect(player.floatY).toBe(0);
    expect(Object.getOwnPropertyDescriptor(player, 'floatY').set).toBeUndefined();
    expect(player.perchY).toBe(0.7); // and the float never wrote it
  });
  it('a rest or a perch on the walk clears it (avatar.js), and she is never idle while she floats', () => {
    const src = readFileSync('src/game/avatar.js', 'utf8');
    expect(src).toMatch(/if \(s\.rest \|\| s\.perched\) player\.clearFloat\(\)/);
    expect(src).toMatch(/else s\.idleTime = 0/);
  });
});

describe('where the float is read (and nowhere else)', () => {
  it('the drawn height adds it (avatarBaseY), the paws\' height for the golden-mouse window and the found-outfit reach adds it (main.js), a partner\'s lift carries it', () => {
    const ground = createReefGround();
    const cat = { position: { x: 0, z: 36 } };
    const base = avatarBaseY(ground, cat, { perchY: 0, hopY: 0, floatY: 0 }, {});
    expect(avatarBaseY(ground, cat, { perchY: 0, hopY: 0, floatY: 1.5 }, {})).toBeCloseTo(base + 1.5, 9);
    expect(avatarBaseY(ground, cat, { perchY: 0.7, hopY: 0.1, floatY: 0 }, {})).toBeCloseTo(base + 0.8, 9); // other places: as ever
    expect(readFileSync('src/main.js', 'utf8')).toMatch(/player\.perchY \+ player\.floatY/);
    expect(liftForState(0, null, 1.5)).toEqual({ h: 1.5 });
    expect(liftForState(0.72, null)).toEqual({ h: 0.72 });
    expect(liftForState(0, null)).toEqual({});
    expect(liftForState(0, null, NaN)).toEqual({});
    expect(liftForState(0.5, { id: 'horse1', rideId: 'merry' }, 0)).toEqual({ h: 0.5, seat: 'horse1' });
  });
  it('the two float-height golden mice are reached only by floating (the window is 0.9 m), the sand one on foot', () => {
    const ground = createReefGround();
    const scene = new THREE.Scene();
    const mice = createGoldMice(scene, 'reef', new Set(), { ground });
    const [sand, high, higher] = GOLD_MICE.reef;
    const at = (m) => new THREE.Vector3(m.x, reefY(m.x, m.z), m.z);
    const paws = (m, float) => reefY(m.x, m.z) + float; // main.js: the ground under her, plus perchY, plus the float
    expect(mice.checkFind(at(sand), paws(sand, 0))?.id).toBe(sand.id);
    expect(mice.checkFind(at(high), paws(high, 0))).toBeNull(); // on foot: 1.9 m up is out of reach
    expect(mice.checkFind(at(high), paws(high, 1.2))?.id ?? null).toBe(high.id); // floating inside the window
    expect(mice.checkFind(at(higher), paws(higher, 0))).toBeNull();
    expect(mice.checkFind(at(higher), paws(higher, 1.5))?.id ?? null).toBe(higher.id);
  });
  it('only the allow-listed files name it (the plan\'s rule): this milestone widened nothing', () => {
    const named = ['src/player.js', 'src/main.js', 'src/game/avatar.js', 'src/remotecats.js', 'src/coop/index.js'];
    for (const f of named) expect(readFileSync(f, 'utf8'), f).toMatch(/\bfloatY\b/);
    for (const f of ['src/world/reeflife.js', 'src/world/reefair.js', 'src/world/reeflight.js', 'src/gamepad.js', 'src/ui/touchui.js', 'src/game/interactions.js']) {
      expect(readFileSync(f, 'utf8').replace(/\/\/.*$/gm, ''), f).not.toMatch(/\bfloatY\b/);
    }
  });
});

describe('the camera', () => {
  const horizontal = (camera, cat) => Math.hypot(camera.position.x - cat.position.x, camera.position.z - cat.position.z);
  it('sits 4.0 m back at the default step under the sea (4.5 m elsewhere)', () => {
    const reef = rig(); reef.run(1);
    const sea = rig({ place: 'moon' }); sea.run(1);
    const cosP = Math.cos(0.2);
    expect(horizontal(reef.camera, reef.cat)).toBeLessThan(horizontal(sea.camera, sea.cat));
    expect(horizontal(reef.camera, reef.cat) / horizontal(sea.camera, sea.cat)).toBeCloseTo(4.0 / 4.5, 2);
    expect(cosP).toBeGreaterThan(0);
  });
  it('follows 60 percent of the float height', () => {
    const a = rig(); a.run(1);
    const b = rig(); b.player.setKick(true); b.run(4);
    expect(b.player.floatY).toBe(2.2);
    expect(b.camera.position.y - a.camera.position.y).toBeCloseTo(2.2 * 0.6, 2);
  });
  it('never goes below the seabed + 0.4 m, wherever she walks or floats', () => {
    const { camera, player, cat, ground, run } = rig({ x: -20, z: 10 });
    player.setTouchMove({ x: 0.4, z: -1, mag: 1 });
    for (let s = 0; s < 30; s++) {
      player.setKick(s % 7 < 3);
      for (let i = 0; i < 20; i++) {
        player.update(DT, [], REEF_BOUNDS, []);
        expect(camera.position.y - ground.y(camera.position.x, camera.position.z), `step ${s}`).toBeGreaterThanOrEqual(0.4 - 1e-9);
      }
    }
    expect(cat).toBeTruthy(); expect(run).toBeTruthy();
  });
});

describe('the buttons', () => {
  it('the pad\'s A held is the kick: reported once on the press and once on the release, never in the viewfinder or in a fight', () => {
    const state = createPadState();
    const pad = (down) => ({ axes: [0, 0, 0, 0], buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: down && i === PAD_BUTTONS.A, value: down && i === PAD_BUTTONS.A ? 1 : 0 })) });
    expect(stepPad(state, pad(true), DT).kick).toBe(true);
    expect(stepPad(state, pad(true), DT).kick).toBeUndefined();
    expect(stepPad(state, pad(false), DT).kick).toBe(false);
    expect(stepPad(state, pad(false), DT).kick).toBeUndefined();
    const s2 = createPadState();
    expect(stepPad(s2, pad(true), DT, { cameraMode: true }).kick).toBeUndefined();
    expect(stepPad(createPadState(), pad(true), DT, { fighting: true }).kick).toBeUndefined();
    expect(stepPad(createPadState(), pad(true), DT, { engaged: false }).kick).toBeUndefined();
  });
  it('the touch kick button takes the pounce slot only where the place floats, and is held (touchstart to touchend)', () => {
    const src = readFileSync('src/ui/touchui.js', 'utf8');
    expect(src).toMatch(/setKick\(on\)/);
    expect(src).toMatch(/paw\.addEventListener\('touchstart'/);
    expect(readFileSync('src/main.js', 'utf8')).toMatch(/touchUI\.setKick\(isTouch && player\.canFloat\)/);
    expect(readFileSync('src/main.js', 'utf8')).toMatch(/onKick: \(v\) => player\.setKick\(v\)/);
  });
});
