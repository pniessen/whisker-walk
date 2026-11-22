// The Market's people (U7): ONE figure function, `marketFigure`. Today it is
// a person from the people kit (src/people/, which the market pack loads as
// the Fair's does); a future change to the people is a change here and
// nowhere in the stall logic (marketlive.js reads only what this returns).
//
// personKeeper({ x, y, z, yaw, people, mode, lodNear }) → { group, arm, headY, hand, person, detail(d), dispose() }
//   people  the people kit's factory (src/people/index.js createPeopleKit), as
//           the place's pack hands it to the walk and the walk to
//           createMarketLive (opts.people), as the Fair's show gets it. This
//           file never imports src/people: a second static importer beside
//           fairshow.js takes the kit out of its own chunk (lazybuild.test.js).
//   y       the ground's height at (x, z), from the walk's ground (marketlive.js
//           passes ground.y); without it, FLAT_GROUND's.
//   mode    the pose it is given, once (the people's pose modes, src/people/pose.js):
//           'stand' (the default: every stallholder). The street musician
//           (world/marketfolk.js) is 'juggle' at t 0 (both forearms held up in
//           front, still), and then sets its own arms for the fiddle.
//   lodNear () → the people's near distance, m: the walk's live rung's
//           (lodNearFor(rung), which comes with the people factory in the
//           pack: 12 m, 7 m on a low rung); without it the kit's own 12 m.
//   group   a Group with its origin at the person's feet, at (x, y, z), turned
//           by `yaw`. Its FRONT is its own local +z (the kit's figure faces
//           -z, so it stands turned by pi inside), so rotation.y = yaw faces it
//           the way the stall's keeper spot faces (market.js keepers[id].yaw =
//           atan2(face.x, face.z)). The life sets group.position.y and
//           group.rotation.y, nothing else.
//   arm     the right upper arm's bone (its shoulder). The person is posed
//           once (`mode`, standing by default), and never again, so the
//           life's swing of rotation.z (out from the side, from the stand's
//           0.1 rest) is the only thing that moves; the broom is parented to it.
//   headY   the top of the head (hat or hair), metres above the feet, as posed:
//           the bubble rides over it.
//   hand    the middle of the right hand in the arm's own frame, as posed (the
//           forearm keeps the pose's bend): the broom's (or the bow's) grip goes here.
//   person  the kit's person (look, bones), for a caller that wants more.
//   detail(d)  THE LOD SWITCH, d her cat's distance from the person (m): near
//           detail at lodNear() - LOD_HYSTERESIS or closer, far at lodNear() +
//           LOD_HYSTERESIS or further, and in between as it was (no flicker
//           at the line); a d that is not a number changes nothing. Returns
//           the detail now. It allocates nothing. The people kit's own update()
//           measures from the camera and sweeps every person it made; the
//           stall life and the musician call this each frame instead, with her
//           distance, so nothing outside this file reads inside the figure.
//   dispose takes it out of the scene and frees its person and its kit's
//           material (each stallholder has a kit of its own: nothing else
//           shares it). Anything the life parented to it is the life's to free.
//
// The look comes from the spot (the kit's personFor reads x, z), never a roll;
// a spot that would hold a child and its grown-up keeps the grown-up alone (a
// stallholder is one person: the child is freed as soon as it is made). It is
// made at the kit's far detail (from the spawn every one of them is 12 m off or
// more) and measured as the near figure (headY, hand: the same whatever the
// detail), and detail(d) turns it near as she comes close. It casts no shadow (castShadow false and
// userData.noCast, so the walk's caster sweep leaves it alone); the walk lays
// its contact shadow. Everything is made inside withLocalUuids on a stream of
// the spot's own (the kit's buildSpot takes its 36 draws there too), so making
// one draws nothing from Math.random.
import * as THREE from 'three';
import { withLocalUuids } from './world/localuuids.js';
import { FLAT_GROUND } from './ground.js';

// the grip, down the hand from the wrist (hand lengths; fairshow.js's juggler's;
// world/marketfolk.js's fiddler's too)
export const HAND_MID = 0.46;
// The people kit's LOD (src/people/index.js LOD), kept as numbers here because
// this file may not import the people (above): the near distance when no
// lodNear is handed over, and the band either side of it.
const LOD_NEAR = 12;
const LOD_HYSTERESIS = 1;
const kitNear = () => LOD_NEAR;
const _v = new THREE.Vector3();

export function personKeeper({ x, y, z, yaw = 0, people, mode = 'stand', lodNear = kitNear }) {
  if (typeof people !== 'function') throw new Error('marketFigure: needs the people factory (opts.people, from the place pack)');
  return withLocalUuids(`market-keeper:${x.toFixed(3)},${z.toFixed(3)}`, () => {
    const kit = people();
    const person = kit.buildSpot({ x, z }).people[0];
    for (const p of kit.people.splice(1)) p.dispose(); // a pair's child
    person.setDetail('near');
    kit.pose(person, { mode, t: 0 });
    kit.applyPose(person, 0);
    const figure = person.figure;
    figure.rotation.y = Math.PI;
    const group = new THREE.Group();
    group.name = 'marketKeeper';
    group.add(figure);
    group.updateMatrixWorld(true);
    const arm = person.bones.upperArmR;
    const grip = person.bones.handR.localToWorld(_v.set(0, -HAND_MID * person.look.dims.hand, 0));
    arm.worldToLocal(grip);
    const hand = { x: grip.x, y: grip.y, z: grip.z };
    const headY = new THREE.Box3().setFromObject(group).max.y;
    person.setDetail('far'); // until she comes close (detail)
    group.position.set(x, Number.isFinite(y) ? y : FLAT_GROUND.y(x, z), z);
    group.rotation.y = yaw;
    group.traverse((m) => {
      if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; m.userData.noCast = true; }
    });
    let gone = false;
    return {
      group,
      arm,
      headY,
      hand,
      person,
      detail(d) {
        if (gone || !Number.isFinite(d)) return person.detail;
        const n = lodNear();
        const near = Number.isFinite(n) ? n : LOD_NEAR;
        if (d >= near + LOD_HYSTERESIS) { if (person.detail !== 'far') person.setDetail('far'); }
        else if (d <= near - LOD_HYSTERESIS) { if (person.detail !== 'near') person.setDetail('near'); }
        return person.detail;
      },
      dispose() {
        if (gone) return;
        gone = true;
        group.removeFromParent();
        kit.dispose(); // its person's geometries and skeleton, and the material
      },
    };
  });
}

// THE one figure function: the stallholders (marketlive.js's opts.figure
// default) and the street musician (world/marketfolk.js) are built through this.
export const marketFigure = personKeeper;
