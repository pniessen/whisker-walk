export function animateCat(cat, state, t, moveSpeed) {
  const { body, head, tail, legs } = cat.userData.parts;
  const walking = moveSpeed > 0.1;

  // reset per-frame poses (positions/rotations we animate)
  cat.rotation.z = 0;
  body.position.y = 0.3;
  head.position.y = 0.44;
  head.rotation.x = 0;

  if (state === 'nap') {
    body.position.y = 0.18;
    head.position.y = 0.26;
    head.rotation.x = 0.5;
    for (const leg of legs) leg.scale.y = 0.3;
    tail.rotation.x = -1.4;
    return;
  }
  for (const leg of legs) leg.scale.y = 1;

  if (state === 'requestPet') {
    head.rotation.x = -0.35; // look up at player
    tail.rotation.x = -0.2;  // tail high
  } else {
    tail.rotation.x = state === 'scared' ? -1.5 : -0.7;
  }

  if (walking) {
    const cycle = t * (4 + moveSpeed * 2);
    legs[0].rotation.x = Math.sin(cycle) * 0.6;
    legs[3].rotation.x = Math.sin(cycle) * 0.6;
    legs[1].rotation.x = Math.sin(cycle + Math.PI) * 0.6;
    legs[2].rotation.x = Math.sin(cycle + Math.PI) * 0.6;
    body.position.y = 0.3 + Math.abs(Math.sin(cycle)) * 0.02;
  } else {
    for (const leg of legs) leg.rotation.x = 0;
    if (state === 'sniff') head.rotation.x = 0.55; // nose to the ground
  }

  // idle tail sway, layered on top
  tail.rotation.z = Math.sin(t * 2.2) * 0.25;
  tail.children[0]?.children[0] && (tail.children[0].rotation.z = Math.sin(t * 2.2 + 0.5) * 0.2);
}
