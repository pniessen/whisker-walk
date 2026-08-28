const GAIT_PHASE = [0, Math.PI, Math.PI * 0.5, Math.PI * 1.5]; // 4-beat: FL, FR, BL, BR
const CAT_BASE = { bodyY: 0.34, bodyScale: [0.85, 0.75, 1.35], headPos: [0, 0.56, -0.44], tailRotX: -0.6 };

// v20 "Ruffled Fur" — the 'cross' pose.
//
// Derived from 'scared' below (raised tail, flattened ears) because a scared
// cat and a cross cat share most of their anatomy, then inverted everywhere
// the READING differs: a scared cat shrinks and wants to leave, a cross cat
// makes itself bigger and holds its ground. Every difference below is one of
// those inversions.
//
// The rig is the constraint. Strays are built { simple: true }, which skips
// whiskers entirely, and the model has no mouth, no eyelids, no puffed-tail
// scale and no arched-back joint — so posture is the whole vocabulary here,
// and nothing below adds to the rig.
const CROSS = {
  // Torso turned side-on while the head keeps facing you. This is THE angry-
  // cat silhouette, and it is nearly free: `head` and `legs` are parented to
  // the cat group rather than to `body`, so yawing the torso alone presents
  // the flank without twisting the face away or skewing the stance. ~13deg;
  // far enough to change the outline, short of dislocating the shoulders.
  bodyYaw: 0.22,
  // Up, not down. 'scared' drops the body 0.06; this lifts it a little and
  // bunches the torso taller/shorter (never longer) so the cat reads as
  // gathered and puffed rather than flattened. The rig has no fur, so the
  // torso itself has to do the puffing.
  bodyLift: 0.02,
  bodyScale: [1.05, 1.06, 0.96],
  // Braced: front paws planted forward, hind legs set back — the stance of
  // an animal that intends to stay where it is. Overwritten by the gait when
  // the cat is actually walking, which is correct; a cross cat that walks
  // still walks.
  legSplay: 0.16,
  // Pinned harder than 'scared' (0.6). Flat ears are the one unambiguous
  // signal this rig can make, and it is the cheapest thing a player reads at
  // a distance the name tag is not yet legible from.
  earPin: 0.78,
  // Higher and STRAIGHT, where 'scared' raises the tail to -1.35 and then
  // curls the segments round the body (pivot y 0.35, "tucked"). Leaving the
  // chain at zero yaw makes it a rigid, upright bottlebrush instead.
  tailRotX: -1.5,
  // The lash. The idle tail chain already sways at 2.6 rad/s; a cross tail
  // whips more than twice as fast and nearly twice as wide, which is the one
  // piece of MOTION in the pose and the part that catches the eye first.
  lashFreq: 6.2,
  lashScale: 1.9,
};

// Poses are expressed as deltas/ratios from the model's declared base pose
// (cat.userData.base) so differently proportioned avatars — like Hagrid the
// chicken — animate without being squashed into cat proportions.
// reducedMotion (settings.reducedMotion): only the player's own cat call
// site (main.js) ever passes this — it skips the vertical body-bob + slight
// roll below, which is what actually feeds into the camera (camera.position
// follows avatar.position every frame), leaving the leg gait itself intact.
export function animateCat(cat, state, t, moveSpeed, reducedMotion = false) {
  const { body, head, tail, tailPivots, legs, earL, earR } = cat.userData.parts;
  const base = cat.userData.base ?? CAT_BASE;
  const [bsx, bsy, bsz] = base.bodyScale;
  const [hx, hy, hz] = base.headPos;
  const walking = moveSpeed > 0.1;

  // base pose reset
  body.position.y = base.bodyY;
  body.scale.set(bsx, bsy, bsz);
  body.rotation.set(0, 0, 0);
  head.position.set(hx, hy, hz);
  head.rotation.set(0, 0, 0);
  tail.rotation.set(base.tailRotX, 0, 0);
  for (const leg of legs) {
    leg.rotation.set(0, 0, 0);
    leg.scale.set(1, 1, 1);
  }
  for (const p of tailPivots) p.rotation.set(0, 0, 0);

  // ear twitches: brief, occasional, alternating
  const twitchWindow = Math.sin(t * 0.37) > 0.965 ? 1 : 0;
  const twitch = twitchWindow * Math.max(0, Math.sin(t * 9)) * 0.3;
  earL.rotation.z = 0.22 + twitch;
  earR.rotation.z = -0.22 - (twitchWindow ? 0 : Math.max(0, Math.sin(t * 9 + 2)) * (Math.sin(t * 0.53) > 0.97 ? 0.3 : 0));

  if (state === 'nap') {
    body.position.y = base.bodyY - 0.1;
    body.scale.set(bsx * 1.12, bsy * 0.73, bsz * 0.89);
    head.position.set(hx + 0.08, hy - 0.24, hz + 0.14);
    head.rotation.set(0.55, 0.5, 0);
    for (const leg of legs) leg.scale.y = 0.25;
    tail.rotation.set(-0.12, 0, 0);
    for (const p of tailPivots) p.rotation.y = 0.55; // wrap around the body
    body.scale.y += Math.sin(t * 1.4) * 0.015; // slow sleepy breathing
    return;
  }

  if (state === 'stretch') {
    // classic wake-up: front down, butt up
    body.rotation.x = 0.35;
    body.position.y = base.bodyY + 0.04;
    head.position.set(hx, hy - 0.24, hz - 0.06);
    head.rotation.x = 0.25;
    legs[0].rotation.x = 0.9;
    legs[1].rotation.x = 0.9;
    legs[2].scale.y = 1.1;
    legs[3].scale.y = 1.1;
    tail.rotation.x = -1.15;
    return;
  }

  if (state === 'groom') {
    head.rotation.set(0.5, 0.65, 0.1);
    head.position.y = hy - 0.06 + Math.sin(t * 7) * 0.02; // little licks
    legs[1].rotation.x = -1.15; // raised front paw
    tail.rotation.x = -0.35;
    for (const p of tailPivots) p.rotation.y = Math.sin(t * 1.6) * 0.12;
    return;
  }

  if (state === 'requestPet' || state === 'perch') {
    // upright sit
    body.rotation.x = -0.5;
    body.position.y = base.bodyY - 0.02;
    legs[2].scale.y = 0.45;
    legs[3].scale.y = 0.45;
    legs[2].rotation.x = -0.5;
    legs[3].rotation.x = -0.5;
    head.position.set(hx, hy + 0.06, hz + 0.1);
    head.rotation.x = state === 'perch' ? 0.05 : -0.18;
    tail.rotation.set(-0.1, 0, 0);
    for (const p of tailPivots) p.rotation.y = 0.5; // tail curled round the front
    tailPivots[0].rotation.y = 0.2 + Math.sin(t * 2.2) * 0.15; // tip flicks
    return;
  }

  if (state === 'sniff') {
    head.position.set(hx, hy - 0.18, hz - 0.06);
    head.rotation.x = 0.6 + Math.sin(t * 10) * 0.04; // snuffling
  }

  if (state === 'stalk') {
    body.position.y = base.bodyY - 0.1;
    head.position.set(hx, hy - 0.16, hz - 0.08);
    head.rotation.x = 0.15;
    for (const leg of legs) leg.scale.y = 0.7;
    tail.rotation.set(-0.12, 0, 0);
  }

  if (state === 'pounce') {
    body.scale.set(bsx * 0.94, bsy * 0.83, bsz * 1.15); // stretched mid-leap
    body.position.y = base.bodyY + 0.02;
    legs[0].rotation.x = 0.8;
    legs[1].rotation.x = 0.8;
    legs[2].rotation.x = -0.8;
    legs[3].rotation.x = -0.8;
    tail.rotation.x = -0.2;
    return;
  }

  if (state === 'scared') {
    body.position.y = base.bodyY - 0.06;
    tail.rotation.set(-1.35, 0, 0);
    for (const p of tailPivots) p.rotation.y = 0.35; // tucked
    earL.rotation.z = 0.6;
    earR.rotation.z = -0.6;
  }

  if (state === 'cross') {
    // Falls through to the walk gait and the tail chain below, exactly as
    // 'scared' does — a cross cat still has to be able to wander off.
    body.position.y = base.bodyY + CROSS.bodyLift;
    body.scale.set(bsx * CROSS.bodyScale[0], bsy * CROSS.bodyScale[1], bsz * CROSS.bodyScale[2]);
    body.rotation.y = CROSS.bodyYaw;
    // Chin drawn back over the shoulders and tipped down: staring you out,
    // not craning towards you.
    head.position.set(hx, hy + 0.02, hz + 0.05);
    head.rotation.x = 0.12;
    legs[0].rotation.x = CROSS.legSplay;
    legs[1].rotation.x = CROSS.legSplay;
    legs[2].rotation.x = -CROSS.legSplay;
    legs[3].rotation.x = -CROSS.legSplay;
    tail.rotation.set(CROSS.tailRotX, 0, 0);
    // tailPivots are deliberately left at the reset zero — no tuck.
    earL.rotation.z = CROSS.earPin;
    earR.rotation.z = -CROSS.earPin;
  }

  if (state === 'land') {
    // landing squash: wide and low for a beat
    body.scale.set(bsx * 1.14, bsy * 0.78, bsz * 1.05);
    body.position.y = base.bodyY - 0.05;
    return;
  }

  if (walking) {
    const freq = 4.5 + moveSpeed * 1.4;
    const amp = Math.min(0.6, 0.25 + moveSpeed * 0.09);
    for (let i = 0; i < 4; i++) {
      legs[i].rotation.x = Math.sin(t * freq + GAIT_PHASE[i]) * amp;
    }
    if (!reducedMotion) {
      body.position.y += Math.abs(Math.sin(t * freq)) * 0.028;
      body.rotation.z = Math.sin(t * freq * 0.5) * 0.03;
    }
  } else if (state === 'follow') {
    body.scale.y += Math.sin(t * 1.8) * 0.012; // breathing
  }

  // lively lagged tail chain
  const sway = walking ? 0.1 + moveSpeed * 0.03 : 0.16;
  const raisedTailX = state === 'scared' ? -1.35 : state === 'cross' ? CROSS.tailRotX : base.tailRotX;
  tail.rotation.x = raisedTailX + Math.sin(t * 2.1) * 0.08;
  // The cross lash. reducedMotion is honoured the same way the walk cycle
  // honours it — the exaggeration is dropped and the ordinary sway remains,
  // so the pose still reads without a fast whipping element on screen. (In
  // practice only main.js's own-cat call site ever passes reducedMotion;
  // strays never do. This is here so the flag stays true for the player's
  // cat if a future caller ever poses it 'cross'.)
  const lashing = state === 'cross' && !reducedMotion;
  const lashFreq = lashing ? CROSS.lashFreq : 2.6;
  const lashSway = lashing ? sway * CROSS.lashScale : sway;
  for (let i = 0; i < tailPivots.length; i++) {
    tailPivots[i].rotation.y += Math.sin(t * lashFreq - i * 0.65) * lashSway;
  }
}
