import { HEMI_INTENSITY } from '../render/rig.js';

// A SKY RIM ON THE CATS (polish-catlight, Pass 10, 2026-11-09).
//
// On the walk a black cat read as a cut-out: its fur is near-black, so the sun
// and the fill only lift it a little, and against a dark wood or a shaded lawn
// the outline was lost. Real fur catches the sky along its edges, where the
// coat turns away from you. This adds that: a Fresnel term,
//
//     rim = strength * sky * pow(1 - saturate(dot(N, V)), POWER)
//
// tinted by the scene's own HemisphereLight sky colour (the walk's fill,
// read straight from the shader's hemisphereLights[0] uniform). So it follows
// everything that already moves the fill: dusk's cool sky, rain's dimmer fill,
// the sunset peach. A scene with NO hemisphere light (the home stage, the
// dressing room: catstage.js lights with a sun, a rim light and an ambient)
// gets no rim at all, so the stage keeps its own look by construction.
//
// The rim is weighted toward the sky (more on the top and flanks of the cat,
// little under the belly, where the sky cannot reach) and is SCREENED onto the
// lit colour, `c + rim * (1 - c)`, so a channel under 1 stays under 1: the rim
// never pushes a white coat into the bloom threshold, and its own peak is
// clamped at RIM.max. It adds no geometry and no draw: it is a few shader
// lines on the fur's existing materials (one shared program variant).

export const RIM = Object.freeze({
  light: 0.18,   // strength on light and mid coats
  dark: 0.3,     // strength on darkFace coats (the black cat, Lord Lantern's points)
  power: 3,      // Fresnel falloff: a thin edge, not a halo
  max: 0.4,      // the rim term's peak, before the screen blend
  tail: 0.55,    // the tail's links take this share: a thin tube is all edge, and
                 // curled toward the camera it flashed grey
  grey: 0.3,     // the sky tint pulled this far toward grey: a sheen, not a blue paint
  skyUp: 0.45,   // how much more the upward-facing edges catch than the sideways ones
  skyFloor: 0.15, // ...and the least a downward-facing edge keeps
  dusk: 0.6,     // at dusk the rim is weaker (the Glow Collar stays the star)...
  duskCool: 0.35, // ...and pulled this far toward a cool moonlit blue
});
// The cool blue a dusk rim leans to (linear RGB, about the luminance of 1).
const COOL = [0.62, 0.8, 1.35];

// Shared by every rim material: one write per walk start (setCatRimLight).
const shared = {
  catRimGain: { value: 1 },
  catRimCool: { value: 0 },
};

// Called once per walk from the walk's lighting block, after dusk is resolved.
export function setCatRimLight({ dusk = false } = {}) {
  shared.catRimGain.value = dusk ? RIM.dusk : 1;
  shared.catRimCool.value = dusk ? RIM.duskCool : 0;
}

export const catRimState = () => ({ gain: shared.catRimGain.value, cool: shared.catRimCool.value });

const RIM_GLSL = /* glsl */`
#if NUM_HEMI_LIGHTS > 0
{
  // the fill's sky colour, back to a tint of about the brightness of the colour
  // itself (the uniform carries the light's intensity)
  vec3 rimSky = hemisphereLights[ 0 ].skyColor * ${(1 / HEMI_INTENSITY).toFixed(5)};
  float rimLum = dot( rimSky, vec3( 0.2126, 0.7152, 0.0722 ) );
  rimSky = mix( rimSky, vec3( rimLum ), ${RIM.grey.toFixed(3)} );
  rimSky = mix( rimSky, vec3( ${COOL.map((v) => v.toFixed(3)).join(', ')} ) * rimLum, catRimCool );
  vec3 rimV = normalize( vViewPosition );
  float rimF = pow( 1.0 - saturate( dot( normal, rimV ) ), ${RIM.power.toFixed(1)} );
  vec3 rimUp = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
  float rimSkyW = clamp( 1.0 - ${RIM.skyUp.toFixed(3)} + ${RIM.skyUp.toFixed(3)} * dot( normal, rimUp ), ${RIM.skyFloor.toFixed(3)}, 1.0 );
  vec3 rim = min( catRimStrength * catRimGain * rimF * rimSkyW * rimSky, vec3( ${RIM.max.toFixed(3)} ) );
  outgoingLight += rim * max( vec3( 0.0 ), 1.0 - outgoingLight );
}
#endif
#include <opaque_fragment>`;

// Give these fur materials the rim. `dark` picks the darkFace strength;
// `scale` softens it for a part (the tail).
// Idempotent: a material already given a rim is left alone. Only
// MeshStandardMaterial (litMaterial) is touched; lines, eyes etc. are never
// passed in.
export function addCatRim(materials, { dark = false, scale = 1 } = {}) {
  const strength = (dark ? RIM.dark : RIM.light) * scale;
  for (const m of materials) {
    if (!m?.isMeshStandardMaterial || m.userData.catRim) continue;
    const uniform = { value: strength };
    m.userData.catRim = uniform;
    const prior = m.onBeforeCompile;
    m.onBeforeCompile = (shader, renderer) => {
      prior?.call(m, shader, renderer);
      shader.uniforms.catRimStrength = uniform;
      shader.uniforms.catRimGain = shared.catRimGain;
      shader.uniforms.catRimCool = shared.catRimCool;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float catRimStrength;\nuniform float catRimGain;\nuniform float catRimCool;')
        .replace('#include <opaque_fragment>', RIM_GLSL);
    };
    // every rim material compiles the same code: one shared program
    m.customProgramCacheKey = () => 'cat-rim-v1';
  }
}
