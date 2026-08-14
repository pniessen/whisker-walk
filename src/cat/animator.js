const GAIT_PHASE = [0, Math.PI, Math.PI * 0.5, Math.PI * 1.5]; // 4-beat: FL, FR, BL, BR
const CAT_BASE = { bodyY: 0.34, bodyScale: [0.85, 0.75, 1.35], headPos: [0, 0.56, -0.44], tailRotX: -0.6 };

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
  tail.rotation.x = (state === 'scared' ? -1.35 : base.tailRotX) + Math.sin(t * 2.1) * 0.08;
  for (let i = 0; i < tailPivots.length; i++) {
    tailPivots[i].rotation.y += Math.sin(t * 2.6 - i * 0.65) * sway;
  }
}
