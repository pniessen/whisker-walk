// The Reef's swim pose: while she floats off the sand she stretches out, pitches with her climb and paddles (a pure function of the time and
// her state, no clock, no random). avatar.js owns one `st` per walk (swimStep) and hangs swimDo on the cat; animator.js calls it once the
// pose is set. Only the local cat reads the float height (avatar.js); a partner's float is drawn by its own build as before.
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const newSwim = () => ({ k: 0, vy: 0, y: 0, kick: 0, still: false });

// Once per frame, before animateCat: on = floating in the water (above FLOAT_PADDLE), height her float height, rm reduced motion.
export function swimStep(st, on, height, dt, rm) {
  const d = Math.max(dt, 1e-4);
  st.vy += (clamp((height - st.y) / d, -3, 3) - st.vy) * (1 - Math.exp(-d / 0.12));
  st.y = height;
  st.k = clamp(st.k + (on ? d : -d) * 4, 0, 1);
  st.still = !!rm;
  st.kick = rm ? 0 : st.kick + (on ? clamp(st.vy / 1.2, 0, 1) - st.kick : -st.kick) * (1 - Math.exp(-d / 0.15));
}
// The body pitch (radians, negative: nose up) for her vertical speed; 0 under reduced motion.
export const swimPitch = (st) => (st.still ? 0 : -clamp(st.vy * 0.35, -0.25, 0.45)) * st.k;

const mix = (a, b, k) => a + (b - a) * k;
// Called by animateCat after the pose: blends the swim over whatever pose was set, so it eases in and out.
export function swimDo(cat, st, t) {
  cat.userData.swimKick = st.kick;
  const k = st.k;
  if (k <= 0) return;
  const { body, head, tailPivots, legs } = cat.userData.parts;
  const a = st.still ? 0 : 1; // reduced motion holds one still pose
  const w = t * a;
  body.scale.z *= 1 + 0.12 * k; body.scale.y *= 1 - 0.06 * k;
  body.rotation.y = Math.sin(w * 2.4) * 0.07 * k;
  head.rotation.x = mix(head.rotation.x, -0.25 - swimPitch(st) * 0.4, k);
  for (let i = 0; i < 4; i++) {
    // front legs reach forward in a doggy-paddle; back legs trail in a gentle kick
    const want = i < 2 ? -0.55 + Math.sin(w * 6 + i * Math.PI) * 0.6 * a : 0.65 + Math.sin(w * 2.8 + i * 1.6) * 0.3 * a;
    legs[i].rotation.x = mix(legs[i].rotation.x, want, k);
  }
  for (let i = 0; i < tailPivots.length; i++) tailPivots[i].rotation.y += Math.sin(w * 3 - i * 0.6) * 0.22 * k * a;
}

// The group, after applyWaterLook: pitch about x under the yaw, and a slow float-bob. Set afresh every frame, so nothing accumulates.
export function swimGroup(cat, st, t) {
  if (st.k <= 0) return;
  cat.rotation.order = 'YXZ';
  cat.rotation.x += swimPitch(st);
  if (!st.still) cat.position.y += Math.sin(t * 1.3) * 0.035 * st.k;
}
