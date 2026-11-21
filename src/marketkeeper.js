// The Market's stallholder figure (step 2, U7): today the villager's Twoleg
// (src/critters.js buildTwolegFigure), wrapped so the lifelike people being
// built on another branch replace this one file and nothing in the stall logic.
//
// twolegKeeper({ x, y, z, yaw }) → { group, arm, headY, hand, dispose() }
//   y       the ground's height at (x, z), from the walk's ground (marketlive.js
//           passes ground.y); without it, FLAT_GROUND's.
//   group   a Group with its origin at the person's feet, at (x, y, z), turned
//           by `yaw`. Its FRONT is its own local +z (the twoleg itself faces
//           -z, so it stands turned by pi inside), so rotation.y = yaw faces it
//           the way the stall's keeper spot faces (market.js keepers[id].yaw =
//           atan2(face.x, face.z)). The life sets group.position.y and
//           group.rotation.y, nothing else.
//   arm     the arm that moves, an Object3D on its shoulder pivot. Its swing is
//           rotation.z, at rest where it comes (0.4 for the twoleg, the
//           villager's rest); the life swings it from there and parents the
//           broom to it.
//   headY   the top of the head (hat, cap or hair), metres above the feet: the
//           bubble rides over it.
//   hand    where the hand is in the arm's own frame: the broom's grip goes here.
//   dispose frees the figure's own geometries and materials (made for it, as
//           buildTwolegFigure makes fresh ones per call) and takes it out of
//           the scene. Anything the life parented to it is the life's to free.
//
// The look comes from the spot (buildTwolegFigure reads x, z), never a roll.
// It casts no shadow (every mesh castShadow false and userData.noCast, so the
// walk's caster sweep leaves it alone); the walk lays its contact shadow.
// Everything is made inside withLocalUuids on a stream of the spot's own, so
// making one draws nothing from Math.random.
import * as THREE from 'three';
import { buildTwolegFigure } from './critters.js';
import { withLocalUuids } from './world/localuuids.js';
import { FLAT_GROUND } from './ground.js';

// the twoleg's arm: a sleeve and a hand 0.49 m down from the shoulder, baked
// 0.2 rad inward (critters.js twolegArm and buildTwolegFigure)
const TWOLEG_HAND = Object.freeze(new THREE.Vector3(0, -0.49, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), -0.2));

export function twolegKeeper({ x, y, z, yaw = 0 }) {
  return withLocalUuids(`market-keeper:${x.toFixed(3)},${z.toFixed(3)}`, () => {
    const { figure, arm } = buildTwolegFigure({ x, z });
    figure.rotation.y = Math.PI;
    const headY = new THREE.Box3().setFromObject(figure).max.y;
    const group = new THREE.Group();
    group.name = 'marketKeeper';
    group.add(figure);
    group.position.set(x, Number.isFinite(y) ? y : FLAT_GROUND.y(x, z), z);
    group.rotation.y = yaw;
    group.traverse((m) => {
      if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; m.userData.noCast = true; }
    });
    const own = [];
    figure.traverse((m) => { if (m.isMesh) own.push(m); });
    let gone = false;
    return {
      group,
      arm,
      headY,
      hand: { x: TWOLEG_HAND.x, y: TWOLEG_HAND.y, z: TWOLEG_HAND.z },
      dispose() {
        if (gone) return;
        gone = true;
        group.removeFromParent();
        for (const m of own) { m.geometry.dispose(); m.material.dispose(); }
      },
    };
  });
}
